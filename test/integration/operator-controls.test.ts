import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueGreenButtonNotificationJobMock } = vi.hoisted(() => ({
  enqueueGreenButtonNotificationJobMock: vi.fn(),
}));

vi.mock("@/server/pipelines/data-ingestion/green-button", () => ({
  enqueueGreenButtonNotificationJob: enqueueGreenButtonNotificationJobMock,
}));

import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("operator controls", () => {
  const scope = `operator-controls-${Date.now()}`;

  let org: { id: string; clerkOrgId: string };
  let adminUser: { id: string; clerkUserId: string };
  let viewerUser: { id: string; clerkUserId: string };
  let building: { id: string };
  let pmBuilding: { id: string };

  function createCaller(input: {
    clerkUserId: string;
    clerkOrgRole: "org:admin" | "org:viewer";
    requestId: string;
    espmFactory?: () => unknown;
  }) {
    return appRouter.createCaller({
      clerkUserId: input.clerkUserId,
      clerkOrgId: org.clerkOrgId,
      clerkOrgRole: input.clerkOrgRole,
      requestId: input.requestId,
      prisma,
      espmFactory: input.espmFactory as (() => never) | undefined,
    });
  }

  beforeAll(async () => {
    org = await prisma.organization.create({
      data: {
        clerkOrgId: `org_${scope}`,
        name: `Operator Control Org ${scope}`,
        slug: `operator-control-org-${scope}`,
      },
      select: { id: true, clerkOrgId: true },
    });

    adminUser = await prisma.user.create({
      data: {
        clerkUserId: `admin_${scope}`,
        email: `${scope}-admin@example.com`,
        name: "Operator Admin",
      },
      select: { id: true, clerkUserId: true },
    });

    viewerUser = await prisma.user.create({
      data: {
        clerkUserId: `viewer_${scope}`,
        email: `${scope}-viewer@example.com`,
        name: "Operator Viewer",
      },
      select: { id: true, clerkUserId: true },
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: org.id,
          userId: adminUser.id,
          role: "ADMIN",
        },
        {
          organizationId: org.id,
          userId: viewerUser.id,
          role: "VIEWER",
        },
      ],
    });

    building = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `Operator Control Building ${scope}`,
        address: "700 Control St NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.01,
        grossSquareFeet: 65000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 71,
        doeeBuildingId: `OP-${scope}`,
        greenButtonStatus: "ACTIVE",
      },
      select: { id: true },
    });

    pmBuilding = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `Operator PM Building ${scope}`,
        address: "701 Control St NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 70000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 72,
        doeeBuildingId: `OP-PM-${scope}`,
        espmPropertyId: BigInt(444444),
      },
      select: { id: true },
    });

    await prisma.greenButtonConnection.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        status: "ACTIVE",
        accessToken: "operator-access-token",
        refreshToken: "operator-refresh-token",
        subscriptionId: `subscription-${scope}`,
        resourceUri: "https://utility.test/espi/1_1/resource/RetailCustomer/1/UsagePoint",
        tokenExpiresAt: new Date("2026-03-19T00:00:00.000Z"),
      },
    });
  });

  beforeEach(async () => {
    enqueueGreenButtonNotificationJobMock.mockReset();
    await prisma.auditLog.deleteMany({
      where: {
        organizationId: org.id,
        action: {
          in: [
            "OPERATOR_SOURCE_RECONCILIATION_REFRESH_REQUESTED",
            "OPERATOR_SOURCE_RECONCILIATION_REFRESH_COMPLETED",
            "OPERATOR_SOURCE_RECONCILIATION_REFRESH_FAILED",
            "OPERATOR_PM_SYNC_RETRY_REQUESTED",
            "OPERATOR_PM_SYNC_RETRY_COMPLETED",
            "OPERATOR_PM_SYNC_RETRY_FAILED",
            "OPERATOR_PM_SYNC_RETRY_SKIPPED",
            "OPERATOR_GREEN_BUTTON_REENQUEUE_REQUESTED",
            "OPERATOR_GREEN_BUTTON_REENQUEUE_COMPLETED",
            "OPERATOR_GREEN_BUTTON_REENQUEUE_FAILED",
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { organizationId: org?.id },
    });
    await prisma.dataIssue.deleteMany({
      where: { organizationId: org?.id },
    });
    await prisma.meterSourceReconciliation.deleteMany({
      where: { organizationId: org?.id },
    });
    await prisma.buildingSourceReconciliation.deleteMany({
      where: { organizationId: org?.id },
    });
    await prisma.greenButtonConnection.deleteMany({
      where: { organizationId: org?.id },
    });
    await prisma.building.deleteMany({
      where: { organizationId: org?.id },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: org?.id },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [adminUser?.id, viewerUser?.id].filter(Boolean) as string[],
        },
      },
    });
    await prisma.organization.deleteMany({
      where: { id: org?.id },
    });
  });

  it("rejects operator-only building actions for viewer roles", async () => {
    const viewerCaller = createCaller({
      clerkUserId: viewerUser.clerkUserId,
      clerkOrgRole: "org:viewer",
      requestId: `operator-viewer-${scope}`,
    });

    await expect(
      viewerCaller.building.rerunSourceReconciliation({
        buildingId: building.id,
      }),
    ).rejects.toThrow("Operator access is required");
  });

  it("rejects bulk operator actions for viewer roles", async () => {
    const viewerCaller = createCaller({
      clerkUserId: viewerUser.clerkUserId,
      clerkOrgRole: "org:viewer",
      requestId: `operator-viewer-bulk-${scope}`,
    });

    await expect(
      viewerCaller.building.bulkOperatePortfolio({
        buildingIds: [building.id],
        action: "RERUN_SOURCE_RECONCILIATION",
      }),
    ).rejects.toThrow("Operator access is required");
  });

  it("reruns source reconciliation through an audited operator action", async () => {
    const adminCaller = createCaller({
      clerkUserId: adminUser.clerkUserId,
      clerkOrgRole: "org:admin",
      requestId: `operator-reconciliation-${scope}`,
    });

    const result = await adminCaller.building.rerunSourceReconciliation({
      buildingId: building.id,
    });

    expect(result).toMatchObject({
      action: "SOURCE_RECONCILIATION_REFRESH",
    });

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        buildingId: building.id,
        action: {
          in: [
            "OPERATOR_SOURCE_RECONCILIATION_REFRESH_REQUESTED",
            "OPERATOR_SOURCE_RECONCILIATION_REFRESH_COMPLETED",
          ],
        },
      },
      orderBy: { timestamp: "asc" },
      select: { action: true, actorId: true },
    });

    expect(auditActions).toEqual([
      {
        action: "OPERATOR_SOURCE_RECONCILIATION_REFRESH_REQUESTED",
        actorId: adminUser.clerkUserId,
      },
      {
        action: "OPERATOR_SOURCE_RECONCILIATION_REFRESH_COMPLETED",
        actorId: adminUser.clerkUserId,
      },
    ]);
  });

  it("re-enqueues Green Button ingestion safely and records deduped retries explicitly", async () => {
    enqueueGreenButtonNotificationJobMock
      .mockResolvedValueOnce({
        queueJobId: "green-button:job-1",
        notificationUri: "https://utility.test/espi/Batch/Subscription/one",
        deduplicated: false,
        payloadVersion: 1,
        jobType: "GREEN_BUTTON_NOTIFICATION",
        queueName: "data-ingestion",
      })
      .mockResolvedValueOnce({
        queueJobId: "green-button:job-1",
        notificationUri: "https://utility.test/espi/Batch/Subscription/one",
        deduplicated: true,
        payloadVersion: 1,
        jobType: "GREEN_BUTTON_NOTIFICATION",
        queueName: "data-ingestion",
      });

    const adminCaller = createCaller({
      clerkUserId: adminUser.clerkUserId,
      clerkOrgRole: "org:admin",
      requestId: `operator-green-button-${scope}`,
    });

    const first = await adminCaller.building.reenqueueGreenButtonIngestion({
      buildingId: building.id,
    });
    const second = await adminCaller.building.reenqueueGreenButtonIngestion({
      buildingId: building.id,
    });

    expect(first.status).toBe("QUEUED");
    expect(second.status).toBe("DEDUPED");
    expect(enqueueGreenButtonNotificationJobMock).toHaveBeenCalledTimes(2);

    const completionAudits = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        buildingId: building.id,
        action: "OPERATOR_GREEN_BUTTON_REENQUEUE_COMPLETED",
      },
      orderBy: { timestamp: "asc" },
      select: {
        outputSnapshot: true,
      },
    });

    expect(completionAudits).toHaveLength(2);
    const outputs = completionAudits.map((entry) => entry.outputSnapshot as Record<string, unknown>);
    expect(outputs[0]?.deduplicated).toBe(false);
    expect(outputs[1]?.deduplicated).toBe(true);
  });

  it("runs bulk source reconciliation with explicit per-building success and skip results", async () => {
    const adminCaller = createCaller({
      clerkUserId: adminUser.clerkUserId,
      clerkOrgRole: "org:admin",
      requestId: `operator-bulk-reconciliation-${scope}`,
    });

    const result = await adminCaller.building.bulkOperatePortfolio({
      buildingIds: [building.id, "missing-building"],
      action: "RERUN_SOURCE_RECONCILIATION",
    });

    expect(result).toMatchObject({
      action: "RERUN_SOURCE_RECONCILIATION",
      targetCount: 2,
      succeededCount: 1,
      failedCount: 0,
      skippedCount: 1,
    });
    expect(result.results).toEqual([
      {
        buildingId: building.id,
        buildingName: expect.stringContaining("Operator Control Building"),
        status: "SUCCEEDED",
        message: "Source reconciliation and downstream issue state were refreshed.",
      },
      {
        buildingId: "missing-building",
        buildingName: "Unknown building",
        status: "SKIPPED",
        message: "Building was not found or is not accessible in this organization.",
      },
    ]);
  });

  it("runs bulk penalty refresh with explicit success and skip results", async () => {
    const adminCaller = createCaller({
      clerkUserId: adminUser.clerkUserId,
      clerkOrgRole: "org:admin",
      requestId: `operator-bulk-penalty-${scope}`,
    });

    const result = await adminCaller.building.bulkOperatePortfolio({
      buildingIds: [building.id, "missing-building"],
      action: "REFRESH_PENALTY_SUMMARY",
    });

    expect(result).toMatchObject({
      action: "REFRESH_PENALTY_SUMMARY",
      targetCount: 2,
      succeededCount: 1,
      failedCount: 0,
      skippedCount: 1,
    });
    expect(result.results).toEqual([
      {
        buildingId: building.id,
        buildingName: expect.stringContaining("Operator Control Building"),
        status: "SUCCEEDED",
        message: expect.stringMatching(/governed penalty run|already current/i),
      },
      {
        buildingId: "missing-building",
        buildingName: "Unknown building",
        status: "SKIPPED",
        message: "Building was not found or is not accessible in this organization.",
      },
    ]);
  });

  it("reports bulk PM sync failures and skips without bypassing governed validation", async () => {
    const adminCaller = createCaller({
      clerkUserId: adminUser.clerkUserId,
      clerkOrgRole: "org:admin",
      requestId: `operator-bulk-pm-${scope}`,
      espmFactory: () =>
        ({
          getProperty: vi.fn().mockRejectedValue(new Error("ESPM unavailable")),
        }) as unknown,
    });

    const result = await adminCaller.building.bulkOperatePortfolio({
      buildingIds: [building.id, pmBuilding.id, "missing-building"],
      action: "RETRY_PORTFOLIO_MANAGER_SYNC",
    });

    expect(result).toMatchObject({
      action: "RETRY_PORTFOLIO_MANAGER_SYNC",
      targetCount: 3,
      succeededCount: 0,
      failedCount: 1,
      skippedCount: 2,
    });
    expect(result.results).toEqual([
      {
        buildingId: building.id,
        buildingName: expect.stringContaining("Operator Control Building"),
        status: "SKIPPED",
        message: "Portfolio Manager sync is not configured for this building.",
      },
      {
        buildingId: pmBuilding.id,
        buildingName: expect.stringContaining("Operator PM Building"),
        status: "FAILED",
        message: "Portfolio Manager sync completed with a failed governed runtime state.",
      },
      {
        buildingId: "missing-building",
        buildingName: "Unknown building",
        status: "SKIPPED",
        message: "Building was not found or is not accessible in this organization.",
      },
    ]);

    const skipAudit = await prisma.auditLog.findFirst({
      where: {
        organizationId: org.id,
        buildingId: building.id,
        action: "OPERATOR_PM_SYNC_RETRY_SKIPPED",
      },
      select: {
        outputSnapshot: true,
      },
    });
    expect(skipAudit?.outputSnapshot).toMatchObject({
      reason: "Portfolio Manager sync is not configured for this building.",
    });

    const completionAudit = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        buildingId: pmBuilding.id,
        action: {
          in: [
            "OPERATOR_PM_SYNC_RETRY_REQUESTED",
            "OPERATOR_PM_SYNC_RETRY_COMPLETED",
          ],
        },
      },
      orderBy: { timestamp: "asc" },
      select: { action: true, actorId: true, outputSnapshot: true },
    });

    expect(completionAudit).toEqual([
      {
        action: "OPERATOR_PM_SYNC_RETRY_REQUESTED",
        actorId: adminUser.clerkUserId,
        outputSnapshot: null,
      },
      {
        action: "OPERATOR_PM_SYNC_RETRY_COMPLETED",
        actorId: adminUser.clerkUserId,
        outputSnapshot: {
          latestJobId: expect.any(String),
          syncStatus: "FAILED",
        },
      },
    ]);
  });
});
