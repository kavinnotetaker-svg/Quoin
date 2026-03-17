import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { createQueue, QUEUES } from "@/server/lib/queue";
import { createAuditLog } from "@/server/lib/audit-log";
import { toAppError } from "@/server/lib/errors";
import {
  createJob,
  markCompleted,
  markDead,
  markFailed,
  markRunning,
} from "@/server/lib/jobs";
import { createLogger } from "@/server/lib/logger";

const webhookParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

/**
 * POST /api/green-button/webhook
 * Public endpoint — receives push notifications from the utility when new data is available.
 * Enqueues a job to fetch and process the data. Returns 200 immediately.
 */
export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const job = await createJob({
    type: "GREEN_BUTTON_WEBHOOK",
    maxAttempts: 3,
  });
  const runningJob = await markRunning(job.id);
  const logger = createLogger({
    requestId,
    jobId: job.id,
    procedure: "greenButton.webhook",
  });
  const safelyPersist = async (
    label: string,
    operation: () => Promise<unknown>,
  ) => {
    try {
      await operation();
    } catch (persistenceError) {
      logger.error("Green Button webhook persistence failed", {
        error: persistenceError,
        persistenceLabel: label,
      });
    }
  };
  const writeAudit = (input: {
    action: string;
    inputSnapshot?: Record<string, unknown>;
    outputSnapshot?: Record<string, unknown>;
    errorCode?: string | null;
  }) =>
    createAuditLog({
      actorType: "SYSTEM",
      requestId,
      action: input.action,
      inputSnapshot: input.inputSnapshot,
      outputSnapshot: input.outputSnapshot,
      errorCode: input.errorCode ?? null,
    }).catch((auditError) => {
      logger.error("Green Button webhook audit log persistence failed", {
        error: auditError,
        auditAction: input.action,
      });
      return null;
    });

  await writeAudit({
    action: "green_button.webhook.started",
  });
  try {
    const body = await req.text();

    if (!body.trim()) {
      await safelyPersist("job.dead", () =>
        markDead(runningJob.id, "Empty request body"),
      );
      await writeAudit({
        action: "green_button.webhook.failed",
        outputSnapshot: {
          retryable: false,
        },
        errorCode: "VALIDATION_ERROR",
      });
      return NextResponse.json(
        { error: "Empty request body" },
        { status: 400 },
      );
    }

    // Parse the Atom notification XML
    const parsed = webhookParser.parse(body) as Record<string, unknown>;

    // Extract notification URI from the Atom entry
    // Green Button notifications can come as Atom feed or simple XML
    let notificationUri: string | null = null;

    const batchList = parsed["BatchList"] as Record<string, unknown> | undefined;
    if (batchList) {
      // Simple batch list format
      const resources = batchList["resources"] as string | undefined;
      notificationUri = resources ?? null;
    }

    const feed = parsed["feed"] as Record<string, unknown> | undefined;
    if (feed) {
      const entries = feed["entry"];
      const entryArray = Array.isArray(entries) ? entries : entries ? [entries] : [];
      for (const entry of entryArray as Record<string, unknown>[]) {
        const content = entry["content"] as Record<string, unknown> | undefined;
        const batchUrl = content?.["BatchList"]
          ?? entry["link"]
          ?? null;
        if (typeof batchUrl === "string") {
          notificationUri = batchUrl;
          break;
        }
        // Check link href
        const link = entry["link"] as Record<string, unknown> | undefined;
        if (link?.["@_href"]) {
          notificationUri = String(link["@_href"]);
          break;
        }
      }
    }

    if (!notificationUri) {
      logger.warn("Green Button webhook payload did not include notification URI");
      await safelyPersist("job.completed", () => markCompleted(runningJob.id));
      await writeAudit({
        action: "green_button.webhook.ignored",
        outputSnapshot: {
          reason: "missing_notification_uri",
        },
      });
      // Still return 200 — don't make the utility retry
      return NextResponse.json({ received: true });
    }

    // Enqueue a job to fetch and ingest the new data
    try {
      const queue = createQueue(QUEUES.DATA_INGESTION);
      await queue.add("green-button-webhook", {
        notificationUri,
        triggerType: "WEBHOOK",
        source: "GREEN_BUTTON",
      });
      logger.info("Enqueued Green Button webhook job", {
        notificationUri,
      });
      await safelyPersist("job.completed", () => markCompleted(runningJob.id));
      await writeAudit({
        action: "green_button.webhook.succeeded",
        outputSnapshot: {
          notificationUri,
          queue: QUEUES.DATA_INGESTION,
        },
      });
    } catch (queueErr) {
      const appError = toAppError(queueErr);
      logger.error("Failed to enqueue Green Button webhook job", {
        error: appError,
        notificationUri,
      });
      if (appError.retryable && runningJob.attempts < runningJob.maxAttempts) {
        await safelyPersist("job.failed", () =>
          markFailed(runningJob.id, appError.message),
        );
      } else {
        await safelyPersist("job.dead", () =>
          markDead(runningJob.id, appError.message),
        );
      }
      await writeAudit({
        action: "green_button.webhook.failed",
        inputSnapshot: {
          notificationUri,
        },
        outputSnapshot: {
          retryable: appError.retryable,
        },
        errorCode: appError.code,
      });
      // Still return 200 — the data can be fetched on the next scheduled pull
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const appError = toAppError(err);
    logger.error("Error processing Green Button webhook notification", {
      error: appError,
    });
    if (appError.retryable && runningJob.attempts < runningJob.maxAttempts) {
      await safelyPersist("job.failed", () =>
        markFailed(runningJob.id, appError.message),
      );
    } else {
      await safelyPersist("job.dead", () =>
        markDead(runningJob.id, appError.message),
      );
    }
    await writeAudit({
      action: "green_button.webhook.failed",
      outputSnapshot: {
        retryable: appError.retryable,
      },
      errorCode: appError.code,
    });
    // Return 200 even on error to prevent utility from retrying endlessly
    return NextResponse.json({ received: true });
  }
}
