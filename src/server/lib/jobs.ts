import type { Job } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";

interface JobClient {
  job: {
    create(args: {
      data: {
        type: string;
        status: string;
        organizationId: string | null;
        buildingId: string | null;
        maxAttempts: number;
      };
    }): Promise<Job>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Job>;
  };
}

export const JOB_STATUS = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  FAILED: "FAILED",
  COMPLETED: "COMPLETED",
  DEAD: "DEAD",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export interface CreateJobInput {
  type: string;
  status?: JobStatus;
  organizationId?: string | null;
  buildingId?: string | null;
  maxAttempts?: number;
}

export async function createJob(
  input: CreateJobInput,
  db: JobClient = prisma,
): Promise<Job> {
  return db.job.create({
    data: {
      type: input.type,
      status: input.status ?? JOB_STATUS.QUEUED,
      organizationId: input.organizationId ?? null,
      buildingId: input.buildingId ?? null,
      maxAttempts: input.maxAttempts ?? 3,
    },
  });
}

export async function markRunning(
  jobId: string,
  db: JobClient = prisma,
): Promise<Job> {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: JOB_STATUS.RUNNING,
      attempts: { increment: 1 },
      startedAt: new Date(),
      completedAt: null,
      lastError: null,
    },
  });
}

export async function markFailed(
  jobId: string,
  lastError: string,
  db: JobClient = prisma,
): Promise<Job> {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: JOB_STATUS.FAILED,
      lastError,
      completedAt: null,
    },
  });
}

export async function markCompleted(
  jobId: string,
  db: JobClient = prisma,
): Promise<Job> {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: JOB_STATUS.COMPLETED,
      lastError: null,
      completedAt: new Date(),
    },
  });
}

export async function markDead(
  jobId: string,
  lastError: string,
  db: JobClient = prisma,
): Promise<Job> {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: JOB_STATUS.DEAD,
      lastError,
      completedAt: new Date(),
    },
  });
}
