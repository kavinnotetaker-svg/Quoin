import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("energy history deduplication", () => {
  const scope = `${Date.now()}`;

  let org: { id: string; clerkOrgId: string };
  let user: { id: string; clerkUserId: string };
  let building: { id: string };

  beforeAll(async () => {
    org = await prisma.organization.create({
      data: {
        name: `Energy Dedupe Org ${scope}`,
        slug: `energy-dedupe-org-${scope}`,
        clerkOrgId: `clerk_energy_dedupe_org_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    user = await prisma.user.create({
      data: {
        clerkUserId: `clerk_energy_dedupe_user_${scope}`,
        email: `energy_dedupe_${scope}@test.com`,
        name: "Energy Dedupe User",
      },
      select: { id: true, clerkUserId: true },
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    building = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `Energy Dedupe Building ${scope}`,
        address: "700 Dedupe Way NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 100000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 1995,
        bepsTargetScore: 71,
        complianceCycle: "CYCLE_1",
        maxPenaltyExposure: 1000000,
      },
      select: { id: true },
    });

    await prisma.energyReading.createMany({
      data: [
        {
          buildingId: building.id,
          organizationId: org.id,
          source: "CSV_UPLOAD",
          meterType: "ELECTRIC",
          periodStart: new Date("2025-01-01T00:00:00.000Z"),
          periodEnd: new Date("2025-01-31T00:00:00.000Z"),
          consumption: 100,
          unit: "KWH",
          consumptionKbtu: 341.2,
          ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          buildingId: building.id,
          organizationId: org.id,
          source: "CSV_UPLOAD",
          meterType: "ELECTRIC",
          periodStart: new Date("2025-01-01T00:00:00.000Z"),
          periodEnd: new Date("2025-01-31T00:00:00.000Z"),
          consumption: 130,
          unit: "KWH",
          consumptionKbtu: 443.56,
          ingestedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
        {
          buildingId: building.id,
          organizationId: org.id,
          source: "CSV_UPLOAD",
          meterType: "ELECTRIC",
          periodStart: new Date("2025-02-01T00:00:00.000Z"),
          periodEnd: new Date("2025-02-28T00:00:00.000Z"),
          consumption: 150,
          unit: "KWH",
          consumptionKbtu: 511.8,
          ingestedAt: new Date("2026-02-02T00:00:00.000Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.energyReading.deleteMany({
          where: { buildingId: building.id, organizationId: org.id },
        });
        await tx.organizationMembership.deleteMany({
          where: { organizationId: org.id },
        });
        await tx.user.deleteMany({
          where: { id: user.id },
        });
        await tx.building.deleteMany({
          where: { id: building.id, organizationId: org.id },
        });
        await tx.organization.deleteMany({
          where: { id: org.id },
        });
      });
    } catch (error) {
      void error;
    }
  });

  function createCaller() {
    return appRouter.createCaller({
      clerkUserId: user.clerkUserId,
      clerkOrgId: org.clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  it("deduplicates building energy history and report energy history to the latest logical reading", async () => {
    const caller = createCaller();

    const energyReadings = await caller.building.energyReadings({
      buildingId: building.id,
      months: 24,
    });
    expect(energyReadings).toHaveLength(2);
    expect(energyReadings[0]?.consumption).toBe(130);
    expect(energyReadings[0]?.consumptionKbtu).toBe(443.56);

    const report = await caller.report.getComplianceReport({
      buildingId: building.id,
    });
    expect(report.energyHistory).toHaveLength(2);
    expect(report.energyHistory[0]?.consumptionKbtu).toBe(443.56);
  });
});
