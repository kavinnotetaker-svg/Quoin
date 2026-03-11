import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

function monthReading(input: {
  meterId: string;
  buildingId: string;
  organizationId: string;
  monthIndex: number;
  dailyKbtu: number;
  readingId: string;
}) {
  const start = new Date(Date.UTC(2025, input.monthIndex, 1));
  const end = new Date(Date.UTC(2025, input.monthIndex + 1, 0));
  const days = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  return {
    id: input.readingId,
    buildingId: input.buildingId,
    organizationId: input.organizationId,
    source: "ESPM_SYNC" as const,
    meterType: "ELECTRIC" as const,
    meterId: input.meterId,
    periodStart: start,
    periodEnd: end,
    consumption: input.dailyKbtu * days,
    unit: "KBTU" as const,
    consumptionKbtu: input.dailyKbtu * days,
    isVerified: true,
  };
}

describe("operations anomalies", () => {
  const scope = `${Date.now()}`;

  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let buildingA: { id: string };
  let buildingB: { id: string };
  let meterA1: { id: string };
  let meterA2: { id: string };

  beforeAll(async () => {
    orgA = await prisma.organization.create({
      data: {
        name: `Operations Org A ${scope}`,
        slug: `operations-org-a-${scope}`,
        clerkOrgId: `clerk_operations_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `Operations Org B ${scope}`,
        slug: `operations-org-b-${scope}`,
        clerkOrgId: `clerk_operations_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_operations_user_a_${scope}`,
        email: `operations_a_${scope}@test.com`,
        name: "Operations User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_operations_user_b_${scope}`,
        email: `operations_b_${scope}@test.com`,
        name: "Operations User B",
      },
      select: { id: true, clerkUserId: true },
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: orgA.id,
          userId: userA.id,
          role: "ADMIN",
        },
        {
          organizationId: orgB.id,
          userId: userB.id,
          role: "ADMIN",
        },
      ],
    });

    buildingA = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `Operations Building A ${scope}`,
        address: "100 Ops Way NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 100000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 71,
        maxPenaltyExposure: 100000,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    buildingB = await prisma.building.create({
      data: {
        organizationId: orgB.id,
        name: `Operations Building B ${scope}`,
        address: "200 Ops Way NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 95000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 71,
        maxPenaltyExposure: 100000,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    meterA1 = await prisma.meter.create({
      data: {
        buildingId: buildingA.id,
        organizationId: orgA.id,
        meterType: "ELECTRIC",
        name: `Main Electric ${scope}`,
        unit: "KBTU",
        isActive: true,
      },
      select: { id: true },
    });

    meterA2 = await prisma.meter.create({
      data: {
        buildingId: buildingA.id,
        organizationId: orgA.id,
        meterType: "ELECTRIC",
        name: `Secondary Electric ${scope}`,
        unit: "KBTU",
        isActive: true,
      },
      select: { id: true },
    });

    await prisma.energyReading.createMany({
      data: [
        monthReading({
          meterId: meterA1.id,
          buildingId: buildingA.id,
          organizationId: orgA.id,
          monthIndex: 8,
          dailyKbtu: 100,
          readingId: `reading-${scope}-1`,
        }),
        monthReading({
          meterId: meterA1.id,
          buildingId: buildingA.id,
          organizationId: orgA.id,
          monthIndex: 9,
          dailyKbtu: 100,
          readingId: `reading-${scope}-2`,
        }),
        monthReading({
          meterId: meterA1.id,
          buildingId: buildingA.id,
          organizationId: orgA.id,
          monthIndex: 10,
          dailyKbtu: 100,
          readingId: `reading-${scope}-3`,
        }),
        monthReading({
          meterId: meterA1.id,
          buildingId: buildingA.id,
          organizationId: orgA.id,
          monthIndex: 11,
          dailyKbtu: 140,
          readingId: `reading-${scope}-4`,
        }),
      ],
    });

    await prisma.complianceSnapshot.create({
      data: {
        buildingId: buildingA.id,
        organizationId: orgA.id,
        snapshotDate: new Date("2026-03-01T00:00:00.000Z"),
        triggerType: "ESPM_SYNC",
        siteEui: 70,
        sourceEui: 150,
        weatherNormalizedSiteEui: 68,
        weatherNormalizedSourceEui: 146,
        complianceStatus: "AT_RISK",
      },
    });
  });

  afterAll(async () => {
    await prisma.operationalAnomaly.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.complianceSnapshot.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.energyReading.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.meter.deleteMany({
      where: {
        id: { in: [meterA1.id, meterA2.id] },
      },
    });
    await prisma.organizationMembership.deleteMany({
      where: {
        organizationId: { in: [orgA.id, orgB.id] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [userA.id, userB.id] },
      },
    });
    await prisma.building.deleteMany({
      where: {
        id: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.organization.deleteMany({
      where: {
        id: { in: [orgA.id, orgB.id] },
      },
    });
  });

  function createCaller(clerkUserId: string, clerkOrgId: string) {
    return appRouter.createCaller({
      clerkUserId,
      clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  it("refreshes canonical anomaly records, exposes attribution detail, and supports status workflow", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const refreshed = await caller.operations.refreshAnomalies({
      buildingId: buildingA.id,
    });
    expect(refreshed.length).toBeGreaterThanOrEqual(2);
    expect(
      refreshed.some((anomaly) => anomaly.anomalyType === "UNUSUAL_CONSUMPTION_SPIKE"),
    ).toBe(true);
    expect(
      refreshed.some((anomaly) => anomaly.anomalyType === "MISSING_OR_SUSPECT_METER_DATA"),
    ).toBe(true);

    const buildingAnomalies = await caller.operations.listBuildingAnomalies({
      buildingId: buildingA.id,
    });
    const spike = buildingAnomalies.find(
      (anomaly) => anomaly.anomalyType === "UNUSUAL_CONSUMPTION_SPIKE",
    );
    expect(spike?.building.name).toContain("Operations Building A");

    const detail = await caller.operations.detail({
      anomalyId: spike!.id,
    });
    const attribution = detail.attributionJson as Record<string, unknown>;
    expect(attribution["likelyBepsImpact"]).toBe(
      "LIKELY_HIGHER_EUI_AND_WORSE_TRAJECTORY",
    );

    const acknowledged = await caller.operations.acknowledge({
      anomalyId: spike!.id,
    });
    expect(acknowledged.status).toBe("ACKNOWLEDGED");

    const missingMeter = buildingAnomalies.find(
      (anomaly) => anomaly.anomalyType === "MISSING_OR_SUSPECT_METER_DATA",
    );
    const dismissed = await caller.operations.dismiss({
      anomalyId: missingMeter!.id,
    });
    expect(dismissed.status).toBe("DISMISSED");

    const portfolioAnomalies = await caller.operations.listPortfolioAnomalies({
      includeDismissed: true,
    });
    expect(portfolioAnomalies.length).toBeGreaterThanOrEqual(2);
  });

  it("enforces tenant-safe retrieval of anomaly records", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const callerB = createCaller(userB.clerkUserId, orgB.clerkOrgId);

    const anomalies = await callerA.operations.refreshAnomalies({
      buildingId: buildingA.id,
    });
    const target = anomalies[0];
    expect(target).toBeTruthy();

    await expect(
      callerB.operations.listBuildingAnomalies({
        buildingId: buildingA.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      callerB.operations.detail({
        anomalyId: target!.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      callerB.operations.dismiss({
        anomalyId: target!.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});
