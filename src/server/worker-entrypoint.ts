import "./lib/config"; // Validate env vars before starting workers
import { startDataIngestionWorker } from "./pipelines/data-ingestion/worker";
import { createLogger } from "./lib/logger";

const logger = createLogger({
  component: "worker-entrypoint",
});

logger.info("Starting Quoin worker process");

const workers = [
  startDataIngestionWorker(),
  // Future: startPathwayAnalysisWorker(),
  // Future: startCapitalStructuringWorker(),
  // Future: startDriftDetectionWorker(),
];

logger.info("Quoin workers started", {
  workerCount: workers.length,
});

async function shutdown(signal: string) {
  logger.info("Worker shutdown requested", { signal });
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
