import { Queue, Worker, type Processor, type JobsOptions } from "bullmq";

function getConnectionOpts() {
  const url = process.env["REDIS_URL"] || "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 60_000, // 1m → 5m → 15m
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export function createQueue(name: string, opts?: JobsOptions): Queue {
  return new Queue(name, {
    connection: getConnectionOpts(),
    defaultJobOptions: { ...defaultJobOptions, ...opts },
  });
}

export function createWorker(
  name: string,
  processor: Processor,
  concurrency = 1,
): Worker {
  return new Worker(name, processor, {
    connection: getConnectionOpts(),
    concurrency,
  });
}

/** Queue names — single source of truth */
export const QUEUES = {
  DATA_INGESTION: "data-ingestion",
  ESPM_SYNC: "espm-sync",
  PATHWAY_ANALYSIS: "pathway-analysis",
  CAPITAL_STRUCTURING: "capital-structuring",
  DRIFT_DETECTION: "drift-detection",
  AI_ANALYSIS: "ai-analysis",
  NOTIFICATIONS: "notifications",
  REPORT_GENERATOR: "report-generator",
} as const;
