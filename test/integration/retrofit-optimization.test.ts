import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("retrofit optimization", () => {
  const scope = `${Date.now()}`;

  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let buildingA: { id: string };
  let buildingB: { id: string };
  let filingA: { id: string };
  let filingB: { id: string };
  let anomalyA: { id: string };
  let sourceArtifactA: { id: string };
  let sourceArtifactB: { id: string };

  beforeAll(async () => {
    orgA = await prisma.organization.create({
      data: {
        name: `Retrofit Org A ${scope}`,
        slug: `retrofit-org-a-${scope}`,
        clerkOrgId: `clerk_retrofit_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `Retrofit Org B ${scope}`,
        slug: `retrofit-org-b-${scope}`,
        clerkOrgId: `clerk_retrofit_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_retrofit_user_a_${scope}`,
        email: `retrofit_a_${scope}@test.com`,
        name: "Retrofit User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_retrofit_user_b_${scope}`,
        email: `retrofit_b_${scope}@test.com`,
        name: "Retrofit User B",
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
        name: `Retrofit Building A ${scope}`,
        address: "400 Retrofit Way NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 100000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 1990,
        bepsTargetScore: 71,
        maxPenaltyExposure: 1200000,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    buildingB = await prisma.building.create({
      data: {
        organizationId: orgB.id,
        name: `Retrofit Building B ${scope}`,
        address: "401 Retrofit Way NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 95000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 1988,
        bepsTargetScore: 71,
        maxPenaltyExposure: 900000,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    await prisma.complianceSnapshot.createMany({
      data: [
        {
          buildingId: buildingA.id,
          organizationId: orgA.id,
          snapshotDate: new Date("2026-03-01T00:00:00.000Z"),
          triggerType: "MANUAL",
          energyStarScore: 58,
          siteEui: 84,
          sourceEui: 160,
          weatherNormalizedSiteEui: 82,
          weatherNormalizedSourceEui: 156,
          complianceStatus: "AT_RISK",
          estimatedPenalty: 700000,
          penaltyInputsJson: {},
        },
        {
          buildingId: buildingB.id,
          organizationId: orgB.id,
          snapshotDate: new Date("2026-03-01T00:00:00.000Z"),
          triggerType: "MANUAL",
          energyStarScore: 61,
          siteEui: 79,
          sourceEui: 148,
          weatherNormalizedSiteEui: 77,
          weatherNormalizedSourceEui: 145,
          complianceStatus: "AT_RISK",
          estimatedPenalty: 450000,
          penaltyInputsJson: {},
        },
      ],
    });

    filingA = await prisma.filingRecord.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingA.id,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        status: "GENERATED",
        createdByType: "SYSTEM",
        createdById: "test",
        filingPayload: {
          bepsEvaluation: {
            overallStatus: "NON_COMPLIANT",
            alternativeCompliance: {
              recommended: {
                amountDue: 800000,
              },
            },
          },
        },
      },
      select: { id: true },
    });

    filingB = await prisma.filingRecord.create({
      data: {
        organizationId: orgB.id,
        buildingId: buildingB.id,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        status: "GENERATED",
        createdByType: "SYSTEM",
        createdById: "test",
        filingPayload: {
          bepsEvaluation: {
            overallStatus: "NON_COMPLIANT",
            alternativeCompliance: {
              recommended: {
                amountDue: 300000,
              },
            },
          },
        },
      },
      select: { id: true },
    });

    anomalyA = await prisma.operationalAnomaly.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingA.id,
        anomalyType: "UNUSUAL_CONSUMPTION_SPIKE",
        severity: "HIGH",
        detectionHash: `retrofit-anomaly-${scope}`,
        title: "Consumption spike",
        summary: "Persistent spike likely related to controls or scheduling drift.",
        detectionWindowStart: new Date("2026-01-01T00:00:00.000Z"),
        detectionWindowEnd: new Date("2026-02-28T00:00:00.000Z"),
        basisJson: {
          scope,
        },
        reasonCodesJson: ["SPIKE_ABOVE_BASELINE"],
        attributionJson: {
          likelyBepsImpact: "LIKELY_HIGHER_EUI_AND_WORSE_TRAJECTORY",
        },
      },
      select: { id: true },
    });

    sourceArtifactA = await prisma.sourceArtifact.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingA.id,
        artifactType: "GUIDE",
        name: `Retrofit support A ${scope}`,
        externalUrl: "https://example.com/retrofit-support-a",
        metadata: { scope, org: "A" },
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    sourceArtifactB = await prisma.sourceArtifact.create({
      data: {
        organizationId: orgB.id,
        buildingId: buildingB.id,
        artifactType: "GUIDE",
        name: `Retrofit support B ${scope}`,
        externalUrl: "https://example.com/retrofit-support-b",
        metadata: { scope, org: "B" },
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await prisma.retrofitCandidate.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.sourceArtifact.deleteMany({
      where: {
        id: { in: [sourceArtifactA.id, sourceArtifactB.id] },
      },
    });
    await prisma.operationalAnomaly.deleteMany({
      where: {
        id: anomalyA.id,
      },
    });
    await prisma.filingRecord.deleteMany({
      where: {
        id: { in: [filingA.id, filingB.id] },
      },
    });
    await prisma.complianceSnapshot.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
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

  it("creates retrofit candidates and ranks them deterministically for a building and portfolio", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const lowCost = await callerA.retrofit.upsertCandidate({
      buildingId: buildingA.id,
      projectType: "LED_LIGHTING_RETROFIT",
      status: "ACTIVE",
      estimatedCapex: 180000,
      estimatedIncentiveAmount: 30000,
      estimatedAnnualSavingsKbtu: 500000,
      estimatedAnnualSavingsUsd: 15000,
      estimatedSiteEuiReduction: 7,
      estimatedSourceEuiReduction: 11,
      estimatedBepsImprovementPct: 10,
      estimatedImplementationMonths: 4,
      sourceMetadata: {
        sourceAnomalyIds: [anomalyA.id],
      },
    });

    const highBenefit = await callerA.retrofit.upsertCandidate({
      buildingId: buildingA.id,
      projectType: "RETRO_COMMISSIONING",
      status: "ACTIVE",
      estimatedCapex: 90000,
      estimatedAnnualSavingsKbtu: 750000,
      estimatedAnnualSavingsUsd: 22500,
      estimatedSiteEuiReduction: 10,
      estimatedSourceEuiReduction: 14,
      estimatedBepsImprovementPct: 18,
      estimatedImplementationMonths: 3,
      sourceMetadata: {
        sourceAnomalyIds: [anomalyA.id],
      },
    });

    const callerB = createCaller(userB.clerkUserId, orgB.clerkOrgId);
    await callerB.retrofit.upsertCandidate({
      buildingId: buildingB.id,
      projectType: "WINDOW_REPLACEMENT",
      status: "ACTIVE",
      estimatedCapex: 700000,
      estimatedAnnualSavingsKbtu: 350000,
      estimatedAnnualSavingsUsd: 10500,
      estimatedSiteEuiReduction: 4,
      estimatedSourceEuiReduction: 7,
      estimatedBepsImprovementPct: 7,
      estimatedImplementationMonths: 14,
    });

    const listed = await callerA.retrofit.listCandidates({
      buildingId: buildingA.id,
    });
    expect(listed).toHaveLength(2);
    expect(listed.some((candidate) => candidate.id === lowCost.id)).toBe(true);

    const ranked = await callerA.retrofit.rankBuilding({
      buildingId: buildingA.id,
    });
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.candidateId).toBe(highBenefit.id);
    expect(ranked[0]?.estimatedAvoidedPenalty).toBeGreaterThan(ranked[1]!.estimatedAvoidedPenalty);

    const rationale = await callerA.retrofit.candidateRationale({
      candidateId: highBenefit.id,
    });
    expect(rationale.reasonCodes).toContain("ANOMALY_CONTEXT_PRESENT");
    expect(rationale.sourceRefs.some((sourceRef) => sourceRef.recordType === "OPERATIONAL_ANOMALY")).toBe(true);

    const portfolioRanked = await callerA.retrofit.rankPortfolio({
      limit: 10,
    });
    expect(portfolioRanked).toHaveLength(2);
    expect(portfolioRanked.every((entry) => entry.organizationId === orgA.id)).toBe(true);
  });

  it("enforces tenant-safe retrieval and update of retrofit candidates", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const callerB = createCaller(userB.clerkUserId, orgB.clerkOrgId);

    const candidate = await callerA.retrofit.upsertCandidate({
      buildingId: buildingA.id,
      projectType: "BMS_UPGRADE",
      status: "ACTIVE",
      estimatedCapex: 250000,
      estimatedAnnualSavingsKbtu: 450000,
      estimatedAnnualSavingsUsd: 13500,
      estimatedBepsImprovementPct: 9,
      estimatedImplementationMonths: 6,
    });

    await expect(
      callerB.retrofit.listCandidates({
        buildingId: buildingA.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      callerB.retrofit.rankBuilding({
        buildingId: buildingA.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      callerB.retrofit.upsertCandidate({
        candidateId: candidate.id,
        buildingId: buildingA.id,
        projectType: "BMS_UPGRADE",
        estimatedCapex: 200000,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      callerB.retrofit.candidateRationale({
        candidateId: candidate.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejects source artifacts that are outside the candidate building scope", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    await expect(
      callerA.retrofit.upsertCandidate({
        buildingId: buildingA.id,
        projectType: "BMS_UPGRADE",
        status: "ACTIVE",
        sourceArtifactId: sourceArtifactB.id,
        estimatedCapex: 100000,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});
