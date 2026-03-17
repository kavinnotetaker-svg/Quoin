import { Queue, Worker, type Processor, type JobsOptions } from "bullmq";
import { env } from "./config";

function getConnectionOpts() {
  const parsed = new URL(env.REDIS_URL);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname ? Number(parsed.pathname.replace("/", "")) || 0 : 0,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
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
