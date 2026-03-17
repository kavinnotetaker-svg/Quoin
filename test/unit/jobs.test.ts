import { describe, expect, it, vi } from "vitest";
import {
  createJob,
  JOB_STATUS,
  markCompleted,
  markDead,
  markFailed,
  markRunning,
} from "@/server/lib/jobs";

describe("job lifecycle helpers", () => {
  it("creates a queued job with default attempts", async () => {
    const db = {
      job: {
        create: vi.fn(async (args) => args),
      },
    };

    await createJob(
      {
        type: "PORTFOLIO_MANAGER_SYNC",
        organizationId: "org_1",
        buildingId: "building_1",
      },
      db as unknown as Parameters<typeof createJob>[1],
    );

    expect(db.job.create).toHaveBeenCalledWith({
      data: {
        type: "PORTFOLIO_MANAGER_SYNC",
        status: JOB_STATUS.QUEUED,
        organizationId: "org_1",
        buildingId: "building_1",
        maxAttempts: 3,
      },
    });
  });

  it("marks jobs through running, failed, completed, and dead states", async () => {
    const db = {
      job: {
        update: vi.fn(async (args) => args),
      },
    };

    await markRunning("job_1", db as unknown as Parameters<typeof markRunning>[1]);
    await markFailed(
      "job_1",
      "temporary failure",
      db as unknown as Parameters<typeof markFailed>[2],
    );
    await markCompleted(
      "job_1",
      db as unknown as Parameters<typeof markCompleted>[1],
    );
    await markDead(
      "job_1",
      "permanent failure",
      db as unknown as Parameters<typeof markDead>[2],
    );

    expect(db.job.update).toHaveBeenNthCalledWith(1, {
      where: { id: "job_1" },
      data: {
        status: JOB_STATUS.RUNNING,
        attempts: { increment: 1 },
        startedAt: expect.any(Date),
        completedAt: null,
        lastError: null,
      },
    });
    expect(db.job.update).toHaveBeenNthCalledWith(2, {
      where: { id: "job_1" },
      data: {
        status: JOB_STATUS.FAILED,
        lastError: "temporary failure",
        completedAt: null,
      },
    });
    expect(db.job.update).toHaveBeenNthCalledWith(3, {
      where: { id: "job_1" },
      data: {
        status: JOB_STATUS.COMPLETED,
        lastError: null,
        completedAt: expect.any(Date),
      },
    });
    expect(db.job.update).toHaveBeenNthCalledWith(4, {
      where: { id: "job_1" },
      data: {
        status: JOB_STATUS.DEAD,
        lastError: "permanent failure",
        completedAt: expect.any(Date),
      },
    });
  });
});
