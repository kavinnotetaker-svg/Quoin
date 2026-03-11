import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

function monthConsumptions() {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthStart = new Date(Date.UTC(2025, index, 1));
    const monthEnd = new Date(Date.UTC(2025, month, 0));

    return {
      startDate: monthStart.toISOString().slice(0, 10),
      endDate: monthEnd.toISOString().slice(0, 10),
      usage: 10000 + index * 250,
    };
  });
}

describe("Portfolio Manager sync and benchmarking autopilot", () => {
  const scope = `${Date.now()}`;
  const freshDqcCheckedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let buildingReady: { id: string };
  let buildingFailure: { id: string };
  let buildingQa: { id: string };

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `PM sync source ${scope}`,
        externalUrl: "https://example.com/pm-sync-test",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const guidanceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "GUIDE",
        name: `PM sync guidance ${scope}`,
        externalUrl: "https://example.com/pm-sync-guidance-test",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const rulePackage = await prisma.rulePackage.upsert({
      where: { key: "DC_BENCHMARKING_2025" },
      update: {
        name: "DC Benchmarking Annual Submission Workflow",
      },
      create: {
        key: "DC_BENCHMARKING_2025",
        name: "DC Benchmarking Annual Submission Workflow",
      },
    });

    await prisma.ruleVersion.upsert({
      where: {
        rulePackageId_version: {
          rulePackageId: rulePackage.id,
          version: "test-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        implementationKey: "benchmarking/readiness-v1",
        configJson: {
          requirements: {
            propertyIdPattern: "^RPUID-[0-9]{6}$",
            dqcFreshnessDays: 30,
            verification: {
              minimumGrossSquareFeet: 50000,
              requiredReportingYears: [2025],
              evidenceKind: "VERIFICATION",
            },
            gfaCorrection: {
              evidenceKind: "GFA_CORRECTION",
            },
          },
        },
      },
      create: {
        rulePackageId: rulePackage.id,
        sourceArtifactId: sourceArtifact.id,
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "benchmarking/readiness-v1",
        configJson: {
          requirements: {
            propertyIdPattern: "^RPUID-[0-9]{6}$",
            dqcFreshnessDays: 30,
            verification: {
              minimumGrossSquareFeet: 50000,
              requiredReportingYears: [2025],
              evidenceKind: "VERIFICATION",
            },
            gfaCorrection: {
              evidenceKind: "GFA_CORRECTION",
            },
          },
        },
      },
    });

    await prisma.factorSetVersion.upsert({
      where: {
        key_version: {
          key: "DC_CURRENT_STANDARDS",
          version: "test-v1",
        },
      },
      update: {
        sourceArtifactId: guidanceArtifact.id,
        status: "ACTIVE",
        factorsJson: {
          benchmarking: {
            dqcFreshnessDays: 30,
          },
        },
      },
      create: {
        key: "DC_CURRENT_STANDARDS",
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        sourceArtifactId: guidanceArtifact.id,
        factorsJson: {
          benchmarking: {
            dqcFreshnessDays: 30,
          },
        },
      },
    });

    orgA = await prisma.organization.create({
      data: {
        name: `PM Sync Org A ${scope}`,
        slug: `pm-sync-org-a-${scope}`,
        clerkOrgId: `clerk_pm_sync_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `PM Sync Org B ${scope}`,
        slug: `pm-sync-org-b-${scope}`,
        clerkOrgId: `clerk_pm_sync_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_pm_sync_user_a_${scope}`,
        email: `pm_sync_a_${scope}@test.com`,
        name: "PM Sync User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_pm_sync_user_b_${scope}`,
        email: `pm_sync_b_${scope}@test.com`,
        name: "PM Sync User B",
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

    buildingReady = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `PM Ready Building ${scope}`,
        address: "100 Ready Ave NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 40000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 2001,
        bepsTargetScore: 71,
        maxPenaltyExposure: 0,
        doeeBuildingId: "RPUID-123456",
        espmPropertyId: BigInt(111111),
        espmShareStatus: "LINKED",
      },
      select: { id: true },
    });

    buildingFailure = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `PM Failure Building ${scope}`,
        address: "200 Failure Ave NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 42000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 2004,
        bepsTargetScore: 71,
        maxPenaltyExposure: 0,
        doeeBuildingId: "RPUID-654321",
        espmPropertyId: BigInt(222222),
        espmShareStatus: "LINKED",
      },
      select: { id: true },
    });

    buildingQa = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `PM QA Building ${scope}`,
        address: "300 QA Ave NW, Washington, DC 20001",
        latitude: 38.92,
        longitude: -77.01,
        grossSquareFeet: 35000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 1998,
        bepsTargetScore: 71,
        maxPenaltyExposure: 0,
        doeeBuildingId: "RPUID-777777",
        espmPropertyId: BigInt(333333),
        espmShareStatus: "UNLINKED",
      },
      select: { id: true },
    });

    await prisma.evidenceArtifact.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingReady.id,
        artifactType: "PM_REPORT",
        name: `Fresh DQC ${scope}`,
        artifactRef: `dqc:${scope}`,
        metadata: {
          benchmarking: {
            kind: "DQC_REPORT",
            reportingYear: 2025,
            checkedAt: freshDqcCheckedAt,
          },
        },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });
  });

  afterAll(async () => {
    await prisma.portfolioManagerSyncState.deleteMany({
      where: {
        buildingId: {
          in: [buildingReady.id, buildingFailure.id, buildingQa.id],
        },
      },
    });
    await prisma.evidenceArtifact.deleteMany({
      where: {
        buildingId: {
          in: [buildingReady.id, buildingFailure.id, buildingQa.id],
        },
      },
    });
    await prisma.benchmarkSubmission.deleteMany({
      where: {
        buildingId: {
          in: [buildingReady.id, buildingFailure.id, buildingQa.id],
        },
      },
    });
    await prisma.complianceRun.deleteMany({
      where: {
        buildingId: {
          in: [buildingReady.id, buildingFailure.id, buildingQa.id],
        },
      },
    });
    await prisma.complianceSnapshot.deleteMany({
      where: {
        buildingId: {
          in: [buildingReady.id, buildingFailure.id, buildingQa.id],
        },
      },
    });
    await prisma.energyReading.deleteMany({
      where: {
        buildingId: {
          in: [buildingReady.id, buildingFailure.id, buildingQa.id],
        },
      },
    });
    await prisma.meter.deleteMany({
      where: {
        buildingId: {
          in: [buildingReady.id, buildingFailure.id, buildingQa.id],
        },
      },
    });
    await prisma.organizationMembership.deleteMany({
      where: {
        organizationId: {
          in: [orgA.id, orgB.id],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [userA.id, userB.id],
        },
      },
    });
    await prisma.building.deleteMany({
      where: {
        id: {
          in: [buildingReady.id, buildingFailure.id, buildingQa.id],
        },
      },
    });
    await prisma.organization.deleteMany({
      where: {
        id: {
          in: [orgA.id, orgB.id],
        },
      },
    });
    await prisma.sourceArtifact.deleteMany({
      where: {
        name: { contains: scope },
      },
    });
  });

  function createCaller(input: {
    clerkUserId: string;
    clerkOrgId: string;
    espmFactory?: () => unknown;
  }) {
    return appRouter.createCaller({
      clerkUserId: input.clerkUserId,
      clerkOrgId: input.clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
      espmFactory: input.espmFactory as (() => never) | undefined,
    });
  }

  it("syncs Portfolio Manager data into canonical records and auto-refreshes benchmarking readiness", async () => {
    const successClient = {
      property: {
        getProperty: async () => ({
          property: {
            "@_id": 111111,
            name: "Ready Property",
            primaryFunction: "Office",
            grossFloorArea: { value: 40000 },
            yearBuilt: 2001,
            address: {
              "@_address1": "100 Ready Ave NW",
              "@_city": "Washington",
              "@_state": "DC",
              "@_postalCode": "20001",
            },
          },
        }),
      },
      meter: {
        listMeters: async () => ({
          response: {
            links: {
              link: [{ "@_href": "/meter/2001" }],
            },
          },
        }),
        getMeter: async () => ({
          meter: {
            "@_id": 2001,
            type: "Electric",
            name: "Main Electric",
            unitOfMeasure: "kWh",
            inUse: true,
          },
        }),
      },
      consumption: {
        getConsumptionData: async () => ({
          meterData: {
            meterConsumption: monthConsumptions(),
          },
        }),
      },
      metrics: {
        getPropertyMetrics: async () => ({
          propertyId: 111111,
          year: 2025,
          month: 12,
          score: 82,
          siteTotal: 1200000,
          sourceTotal: 3000000,
          siteIntensity: 60,
          sourceIntensity: 140,
          weatherNormalizedSiteIntensity: 58,
          weatherNormalizedSourceIntensity: 136,
          directGHGEmissions: 0,
          medianScore: 50,
        }),
        getReasonsForNoScore: async () => [],
      },
    };

    const caller = createCaller({
      clerkUserId: userA.clerkUserId,
      clerkOrgId: orgA.clerkOrgId,
      espmFactory: () => successClient,
    });

    const result = await caller.benchmarking.syncPortfolioManager({
      buildingId: buildingReady.id,
      reportingYear: 2025,
    });

    expect(result.syncState.status).toBe("SUCCEEDED");
    expect(result.benchmarkSubmission?.status).toBe("READY");
    expect(result.benchmarkSubmission?.complianceRunId).toBeTruthy();

    const meters = await prisma.meter.findMany({
      where: { buildingId: buildingReady.id },
    });
    expect(meters).toHaveLength(1);
    expect(meters[0]?.espmMeterId?.toString()).toBe("2001");

    const readings = await prisma.energyReading.findMany({
      where: {
        buildingId: buildingReady.id,
        source: "ESPM_SYNC",
      },
    });
    expect(readings).toHaveLength(12);

    const snapshots = await prisma.complianceSnapshot.findMany({
      where: {
        buildingId: buildingReady.id,
        triggerType: "ESPM_SYNC",
      },
    });
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("persists sync failure metadata when Portfolio Manager refresh fails", async () => {
    const failingClient = {
      property: {
        getProperty: async () => {
          throw new Error("ESPM property fetch failed");
        },
      },
      meter: {
        listMeters: async () => ({ response: { links: { link: [] } } }),
        getMeter: async () => ({ meter: {} }),
      },
      consumption: {
        getConsumptionData: async () => ({ meterData: { meterConsumption: [] } }),
      },
      metrics: {
        getPropertyMetrics: async () => {
          throw new Error("metrics should not run");
        },
        getReasonsForNoScore: async () => [],
      },
    };

    const caller = createCaller({
      clerkUserId: userA.clerkUserId,
      clerkOrgId: orgA.clerkOrgId,
      espmFactory: () => failingClient,
    });

    const result = await caller.benchmarking.syncPortfolioManager({
      buildingId: buildingFailure.id,
      reportingYear: 2025,
    });

    expect(result.syncState.status).toBe("FAILED");

    const persisted = await caller.benchmarking.getPortfolioManagerSyncStatus({
      buildingId: buildingFailure.id,
    });
    const errorMetadata = persisted.lastErrorMetadata as Record<string, unknown>;
    const errors = (errorMetadata["errors"] as Array<Record<string, unknown>>) ?? [];
    expect(errors[0]?.["step"]).toBe("property");
  });

  it("produces QA findings for missing PM sharing state, missing meters, and coverage gaps", async () => {
    const qaClient = {
      property: {
        getProperty: async () => ({
          property: {
            "@_id": 333333,
            name: "QA Property",
            primaryFunction: "Office",
            grossFloorArea: { value: 35000 },
            yearBuilt: 1998,
          },
        }),
      },
      meter: {
        listMeters: async () => ({
          response: {
            links: {
              link: [],
            },
          },
        }),
        getMeter: async () => ({ meter: {} }),
      },
      consumption: {
        getConsumptionData: async () => ({ meterData: { meterConsumption: [] } }),
      },
      metrics: {
        getPropertyMetrics: async () => ({
          propertyId: 333333,
          year: 2025,
          month: 12,
          score: 70,
          siteTotal: 1000000,
          sourceTotal: 2200000,
          siteIntensity: 72,
          sourceIntensity: 160,
          weatherNormalizedSiteIntensity: 70,
          weatherNormalizedSourceIntensity: 155,
          directGHGEmissions: 0,
          medianScore: 50,
        }),
        getReasonsForNoScore: async () => [],
      },
    };

    const caller = createCaller({
      clerkUserId: userA.clerkUserId,
      clerkOrgId: orgA.clerkOrgId,
      espmFactory: () => qaClient,
    });

    const result = await caller.benchmarking.syncPortfolioManager({
      buildingId: buildingQa.id,
      reportingYear: 2025,
    });

    expect(result.syncState.status).toBe("SUCCEEDED");

    const qaPayload = await caller.benchmarking.getQaFindings({
      buildingId: buildingQa.id,
    });
    const findings = ((qaPayload as Record<string, unknown>)["findings"] as Array<Record<string, unknown>>) ?? [];
    const codes = findings
      .filter((finding) => finding["status"] === "FAIL")
      .map((finding) => finding["code"]);

    expect(codes).toContain("MISSING_PM_SHARING_STATE");
    expect(codes).toContain("MISSING_REQUIRED_METERS");
    expect(codes).toContain("MISSING_COVERAGE");
  });

  it("lists portfolio readiness and enforces tenant isolation for PM sync state", async () => {
    const successClient = {
      property: {
        getProperty: async () => ({
          property: {
            "@_id": 111111,
            name: "Ready Property",
            primaryFunction: "Office",
            grossFloorArea: { value: 40000 },
            yearBuilt: 2001,
          },
        }),
      },
      meter: {
        listMeters: async () => ({
          response: {
            links: {
              link: [{ "@_href": "/meter/2001" }],
            },
          },
        }),
        getMeter: async () => ({
          meter: {
            "@_id": 2001,
            type: "Electric",
            name: "Main Electric",
            unitOfMeasure: "kWh",
            inUse: true,
          },
        }),
      },
      consumption: {
        getConsumptionData: async () => ({
          meterData: {
            meterConsumption: monthConsumptions(),
          },
        }),
      },
      metrics: {
        getPropertyMetrics: async () => ({
          propertyId: 111111,
          year: 2025,
          month: 12,
          score: 82,
          siteTotal: 1200000,
          sourceTotal: 3000000,
          siteIntensity: 60,
          sourceIntensity: 140,
          weatherNormalizedSiteIntensity: 58,
          weatherNormalizedSourceIntensity: 136,
          directGHGEmissions: 0,
          medianScore: 50,
        }),
        getReasonsForNoScore: async () => [],
      },
    };

    const callerA = createCaller({
      clerkUserId: userA.clerkUserId,
      clerkOrgId: orgA.clerkOrgId,
      espmFactory: () => successClient,
    });
    const callerB = createCaller({
      clerkUserId: userB.clerkUserId,
      clerkOrgId: orgB.clerkOrgId,
    });

    await callerA.benchmarking.syncPortfolioManager({
      buildingId: buildingReady.id,
      reportingYear: 2025,
    });

    const portfolio = await callerA.benchmarking.listPortfolioReadiness({
      reportingYear: 2025,
      limit: 10,
    });
    expect(
      portfolio.some(
        (entry) =>
          (entry.building as { id: string }).id === buildingReady.id &&
          (entry.benchmarkSubmission as { status: string } | null)?.status === "READY",
      ),
    ).toBe(true);

    await expect(
      callerB.benchmarking.getPortfolioManagerSyncStatus({
        buildingId: buildingReady.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});
