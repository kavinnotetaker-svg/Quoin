import { createWorker, QUEUES } from "@/server/lib/queue";
import { getTenantClient } from "@/server/lib/db";
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
      console.log(
        `[Data Ingestion] Processing job ${job.id} for building ${data.buildingId}`,
      );

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
        console.error(
          `[Data Ingestion] Job ${job.id} failed: ${result.summary}`,
        );
        throw new Error(result.summary);
      }

      console.log(
        `[Data Ingestion] Job ${job.id} complete: ${result.summary}`,
      );
      return result;
    },
    3, // concurrency per CLAUDE.md queue topology
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[Data Ingestion] Job ${job?.id} permanently failed:`,
      err.message,
    );
  });

  worker.on("error", (err) => {
    console.error("[Data Ingestion] Worker error:", err);
  });

  return worker;
}
