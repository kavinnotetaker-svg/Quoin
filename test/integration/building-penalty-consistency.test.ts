import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("building penalty consistency", () => {
  const scope = `${Date.now()}`;

  let organization: { id: string; clerkOrgId: string };
  let user: { id: string; clerkUserId: string };
  let building: { id: string };

  beforeAll(async () => {
    organization = await prisma.organization.create({
      data: {
        name: `Penalty Org ${scope}`,
        slug: `penalty-org-${scope}`,
        clerkOrgId: `clerk_penalty_org_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    user = await prisma.user.create({
      data: {
        clerkUserId: `clerk_penalty_user_${scope}`,
        email: `penalty_${scope}@test.com`,
        name: "Penalty User",
      },
      select: { id: true, clerkUserId: true },
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    building = await prisma.building.create({
      data: {
        organizationId: organization.id,
        name: `Penalty Building ${scope}`,
        address: "700 Consistency Ave NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 226000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 1982,
        bepsTargetScore: 71,
        maxPenaltyExposure: 2260000,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    try {
      await prisma.penaltyRun.deleteMany({
        where: { buildingId: building.id, organizationId: organization.id },
      });
      await prisma.complianceSnapshot.deleteMany({
        where: { buildingId: building.id, organizationId: organization.id },
      });
      await prisma.organizationMembership.deleteMany({
        where: { organizationId: organization.id },
      });
      await prisma.user.deleteMany({
        where: { id: user.id },
      });
      await prisma.building.deleteMany({
        where: { id: building.id, organizationId: organization.id },
      });
      await prisma.organization.deleteMany({
        where: { id: organization.id },
      });
    } catch (error) {
      void error;
    }
  });

  function createCaller() {
    return appRouter.createCaller({
      clerkUserId: user.clerkUserId,
      clerkOrgId: organization.clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  it("keeps legacy snapshots historical while reports require governed penalty context", async () => {
    await prisma.complianceSnapshot.createMany({
      data: [
        {
          buildingId: building.id,
          organizationId: organization.id,
          snapshotDate: new Date("2026-03-11T17:03:13.229Z"),
          triggerType: "MANUAL",
          energyStarScore: 45,
          siteEui: 146.1573982300885,
          sourceEui: 180,
          weatherNormalizedSiteEui: 134.24559292035397,
          weatherNormalizedSourceEui: null,
          complianceStatus: "PENDING_DATA",
          estimatedPenalty: 2_260_000,
          penaltyInputsJson: {
            cycle: "CYCLE_1",
            filingYear: 2026,
          },
        },
        {
          buildingId: building.id,
          organizationId: organization.id,
          snapshotDate: new Date("2026-03-11T17:47:20.981Z"),
          triggerType: "MANUAL",
          energyStarScore: 45,
          siteEui: 165.54238938053098,
          sourceEui: 180,
          weatherNormalizedSiteEui: 134.24559292035397,
          weatherNormalizedSourceEui: null,
          complianceStatus: "PENDING_DATA",
          estimatedPenalty: 2_712_000,
          penaltyInputsJson: {
            cycle: "CYCLE_2",
            filingYear: 2028,
          },
        },
      ],
    });

    const caller = createCaller();
    const [detail, list, report] = await Promise.all([
      caller.building.get({ id: building.id }),
      caller.building.list({ page: 1, pageSize: 25 }),
      caller.report.getComplianceReport({ buildingId: building.id }),
    ]);

    const listRow = list.buildings.find((entry) => entry.id === building.id);

    expect(detail.latestSnapshot?.estimatedPenalty).toBe(2_712_000);
    expect(listRow?.latestSnapshot?.estimatedPenalty).toBe(2_712_000);
    expect(report.complianceData.estimatedPenalty).toBeNull();
    expect(report.governedPenalty).toBeNull();
    expect(report.governedOperationalSummary.penaltySummary).toBeNull();
  });

  it("uses a deterministic latest snapshot tie-break for historical snapshot fields while governed penalty remains separate", async () => {
    await prisma.complianceSnapshot.deleteMany({
      where: { buildingId: building.id, organizationId: organization.id },
    });

    await prisma.complianceSnapshot.create({
      data: {
        buildingId: building.id,
        organizationId: organization.id,
        snapshotDate: new Date("2026-03-12T12:00:00.000Z"),
        triggerType: "MANUAL",
        energyStarScore: 45,
        siteEui: 150,
        sourceEui: 180,
        weatherNormalizedSiteEui: 140,
        weatherNormalizedSourceEui: null,
        complianceStatus: "PENDING_DATA",
        estimatedPenalty: 2_260_000,
        penaltyInputsJson: { cycle: "CYCLE_1", filingYear: 2026 },
      },
    });

    await prisma.complianceSnapshot.create({
      data: {
        buildingId: building.id,
        organizationId: organization.id,
        snapshotDate: new Date("2026-03-12T12:00:00.000Z"),
        triggerType: "MANUAL",
        energyStarScore: 45,
        siteEui: 165,
        sourceEui: 180,
        weatherNormalizedSiteEui: 141,
        weatherNormalizedSourceEui: null,
        complianceStatus: "PENDING_DATA",
        estimatedPenalty: 2_712_000,
        penaltyInputsJson: { cycle: "CYCLE_2", filingYear: 2028 },
      },
    });

    const caller = createCaller();
    const [detail, list, report] = await Promise.all([
      caller.building.get({ id: building.id }),
      caller.building.list({ page: 1, pageSize: 25 }),
      caller.report.getComplianceReport({ buildingId: building.id }),
    ]);

    const listRow = list.buildings.find((entry) => entry.id === building.id);

    expect(detail.latestSnapshot?.estimatedPenalty).toBe(2_712_000);
    expect(listRow?.latestSnapshot?.estimatedPenalty).toBe(2_712_000);
    expect(report.complianceData.estimatedPenalty).toBeNull();
    expect(report.governedPenalty).toBeNull();
    expect(report.governedOperationalSummary.penaltySummary).toBeNull();
  });

  it("keeps the latest governed penalty summary aligned across building, list, and report reads", async () => {
    await prisma.penaltyRun.deleteMany({
      where: { buildingId: building.id, organizationId: organization.id },
    });

    await prisma.penaltyRun.createMany({
      data: [
        {
          organizationId: organization.id,
          buildingId: building.id,
          calculationMode: "CURRENT_BEPS_EXPOSURE",
          implementationKey: "penalty-engine/beps-v1",
          inputSnapshotHash: `older-penalty-${scope}`,
          baselineResultPayload: {
            status: "ESTIMATED",
            currentEstimatedPenalty: 125000,
            currency: "USD",
            basis: {
              code: "TEST",
              label: "Older basis",
              explanation: "Older basis",
            },
            governingContext: {},
            artifacts: {},
            timestamps: {},
            keyDrivers: [],
          },
          scenarioResultsPayload: [],
          createdAt: new Date("2026-03-12T10:00:00.000Z"),
        },
        {
          organizationId: organization.id,
          buildingId: building.id,
          calculationMode: "CURRENT_BEPS_EXPOSURE",
          implementationKey: "penalty-engine/beps-v1",
          inputSnapshotHash: `latest-penalty-${scope}`,
          baselineResultPayload: {
            status: "ESTIMATED",
            currentEstimatedPenalty: 275000,
            currency: "USD",
            basis: {
              code: "TEST",
              label: "Latest basis",
              explanation: "Latest basis",
            },
            governingContext: {},
            artifacts: {},
            timestamps: {},
            keyDrivers: [],
          },
          scenarioResultsPayload: [],
          createdAt: new Date("2026-03-12T12:00:00.000Z"),
        },
      ],
    });

    const caller = createCaller();
    const [detail, list, report] = await Promise.all([
      caller.building.get({ id: building.id }),
      caller.building.list({ page: 1, pageSize: 25 }),
      caller.report.getComplianceReport({ buildingId: building.id }),
    ]);

    const listRow = list.buildings.find((entry) => entry.id === building.id);

    expect(detail.governedSummary.penaltySummary?.currentEstimatedPenalty).toBe(275000);
    expect(listRow?.governedSummary.penaltySummary?.currentEstimatedPenalty).toBe(275000);
    expect(report.governedPenalty?.currentEstimatedPenalty).toBe(275000);
    expect(report.governedOperationalSummary.penaltySummary?.currentEstimatedPenalty).toBe(
      275000,
    );
    expect(report.sections.penalty.currentEstimatedPenalty).toBe(275000);
    expect(report.evidencePackage.traceability.penaltyRunId).toBe(
      detail.governedSummary.penaltySummary?.id ?? null,
    );
  });
});
