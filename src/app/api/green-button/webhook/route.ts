import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { createQueue, QUEUES } from "@/server/lib/queue";

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
  try {
    const body = await req.text();

    if (!body.trim()) {
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
      console.warn("[Green Button Webhook] Could not extract notification URI from payload");
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
      console.log(
        `[Green Button Webhook] Enqueued job for notification: ${notificationUri}`,
      );
    } catch (queueErr) {
      console.error("[Green Button Webhook] Failed to enqueue job:", queueErr);
      // Still return 200 — the data can be fetched on the next scheduled pull
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[Green Button Webhook] Error processing notification:", err);
    // Return 200 even on error to prevent utility from retrying endlessly
    return NextResponse.json({ received: true });
  }
}
