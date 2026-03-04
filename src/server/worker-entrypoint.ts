import { startDataIngestionWorker } from "./pipelines/data-ingestion/worker";

console.log("[Worker] Starting Quoin worker process...");

const workers = [
  startDataIngestionWorker(),
  // Future: startPathwayAnalysisWorker(),
  // Future: startCapitalStructuringWorker(),
  // Future: startDriftDetectionWorker(),
];

console.log(`[Worker] ${workers.length} worker(s) started. Listening for jobs...`);

async function shutdown(signal: string) {
  console.log(`[Worker] ${signal} received. Shutting down...`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
