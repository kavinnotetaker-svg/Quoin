import { createWorker, QUEUES } from "@/server/lib/queue";
import { createAuditLog } from "@/server/lib/audit-log";
import { getTenantClient } from "@/server/lib/db";
import { toAppError, WorkflowStateError } from "@/server/lib/errors";
import {
  createJob,
  markCompleted,
  markDead,
  markFailed,
  markRunning,
} from "@/server/lib/jobs";
import { createLogger } from "@/server/lib/logger";
import { runIngestionPipeline } from "./logic";
import { createESPMClient } from "@/server/integrations/espm";

export interface DataIngestionJobData {
  buildingId: string;
  organizationId: string;
  uploadBatchId: string;
  triggerType: "CSV_UPLOAD" | "MANUAL" | "WEBHOOK" | "SCHEDULED";
}

export function startDataIngestionWorker() {
  const worker = createWorker(
    QUEUES.DATA_INGESTION,
    async (job) => {
      const data = job.data as DataIngestionJobData;
      const operationalJob = await createJob({
        type: "DATA_INGESTION",
        organizationId: data.organizationId,
        buildingId: data.buildingId,
        maxAttempts:
          typeof job.opts.attempts === "number" ? job.opts.attempts : 3,
      });
      const runningJob = await markRunning(operationalJob.id);
      const logger = createLogger({
        jobId: operationalJob.id,
        organizationId: data.organizationId,
        buildingId: data.buildingId,
        procedure: "dataIngestion.worker",
      });
      const writeAudit = (input: {
        action: string;
        inputSnapshot?: Record<string, unknown>;
        outputSnapshot?: Record<string, unknown>;
        errorCode?: string | null;
      }) =>
        createAuditLog({
          actorType: "SYSTEM",
          organizationId: data.organizationId,
          buildingId: data.buildingId,
          action: input.action,
          inputSnapshot: input.inputSnapshot,
          outputSnapshot: input.outputSnapshot,
          errorCode: input.errorCode ?? null,
        }).catch((auditError) => {
          logger.error("Data ingestion audit log persistence failed", {
            error: auditError,
            auditAction: input.action,
          });
          return null;
        });

      await writeAudit({
        action: "data_ingestion.worker.started",
        inputSnapshot: {
          queueJobId: String(job.id ?? ""),
          uploadBatchId: data.uploadBatchId,
          triggerType: data.triggerType,
        },
      });
      logger.info("Processing data ingestion job", {
        triggerType: data.triggerType,
        uploadBatchId: data.uploadBatchId,
      });
      let jobFinalized = false;
      try {
        const tenantDb = getTenantClient(data.organizationId);

        const result = await runIngestionPipeline({
          buildingId: data.buildingId,
          organizationId: data.organizationId,
          uploadBatchId: data.uploadBatchId,
          triggerType: data.triggerType,
          tenantDb,
          espmClient: createESPMClient(),
        });

        if (!result.success) {
          logger.error("Data ingestion job failed", {
            summary: result.summary,
            errors: result.errors,
            espmSync: result.espmSync,
          });
          const error = new WorkflowStateError(result.summary, {
            details: {
              errors: result.errors,
              uploadBatchId: data.uploadBatchId,
            },
          });
          const appError = toAppError(error);
          if (appError.retryable && runningJob.attempts < runningJob.maxAttempts) {
            await markFailed(runningJob.id, appError.message);
          } else {
            await markDead(runningJob.id, appError.message);
          }
          jobFinalized = true;
          await writeAudit({
            action: "data_ingestion.worker.failed",
            inputSnapshot: {
              queueJobId: String(job.id ?? ""),
              uploadBatchId: data.uploadBatchId,
              triggerType: data.triggerType,
            },
            outputSnapshot: {
              summary: result.summary,
              pipelineRunId: result.pipelineRunId,
              snapshotId: result.snapshotId,
              retryable: appError.retryable,
            },
            errorCode: appError.code,
          });
          throw error;
        }

        await markCompleted(runningJob.id);
        jobFinalized = true;
        await writeAudit({
          action: "data_ingestion.worker.succeeded",
          inputSnapshot: {
            queueJobId: String(job.id ?? ""),
            uploadBatchId: data.uploadBatchId,
            triggerType: data.triggerType,
          },
          outputSnapshot: {
            summary: result.summary,
            snapshotId: result.snapshotId,
            pipelineRunId: result.pipelineRunId,
          },
        });
        logger.info("Data ingestion job completed", {
          summary: result.summary,
          snapshotId: result.snapshotId,
          pipelineRunId: result.pipelineRunId,
        });
        return result;
      } catch (error) {
        const appError = toAppError(error);
        logger.error("Data ingestion worker execution threw", {
          error: appError,
        });
        if (!jobFinalized) {
          if (appError.retryable && runningJob.attempts < runningJob.maxAttempts) {
            await markFailed(runningJob.id, appError.message);
          } else {
            await markDead(runningJob.id, appError.message);
          }
          await writeAudit({
            action: "data_ingestion.worker.failed",
            inputSnapshot: {
              queueJobId: String(job.id ?? ""),
              uploadBatchId: data.uploadBatchId,
              triggerType: data.triggerType,
            },
            outputSnapshot: {
              retryable: appError.retryable,
            },
            errorCode: appError.code,
          });
        }
        throw error;
      }
    },
    3, // concurrency per CLAUDE.md queue topology
  );

  worker.on("failed", (job, err) => {
    createLogger({
      jobId: String(job?.id ?? ""),
      organizationId: (job?.data as DataIngestionJobData | undefined)?.organizationId,
      buildingId: (job?.data as DataIngestionJobData | undefined)?.buildingId,
      procedure: "dataIngestion.worker",
    }).error("Data ingestion job permanently failed", {
      error: err,
    });
  });

  worker.on("error", (err) => {
    createLogger({
      procedure: "dataIngestion.worker",
    }).error("Data ingestion worker error", {
      error: err,
    });
  });

  return worker;
}
