import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("BEPS engine", () => {
  const scope = `${Date.now()}`;
  const bepsFactorSetKey = "DC_BEPS_CYCLE_1_FACTORS_V1";

  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let buildingA: { id: string };
  let buildingB: { id: string };
  let buildingC: { id: string };

  beforeAll(async () => {
    const bepsSource = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `BEPS workflow source ${scope}`,
        externalUrl: "https://example.com/beps-test",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const factorSource = await prisma.sourceArtifact.create({
      data: {
        artifactType: "GUIDE",
        name: `BEPS workflow factors ${scope}`,
        externalUrl: "https://example.com/beps-factors-test",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const rulePackage = await prisma.rulePackage.upsert({
      where: { key: "DC_BEPS_CYCLE_1" },
      update: {
        name: "DC BEPS Cycle 1",
      },
      create: {
        key: "DC_BEPS_CYCLE_1",
        name: "DC BEPS Cycle 1",
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
        sourceArtifactId: bepsSource.id,
        status: "ACTIVE",
        implementationKey: "beps/evaluator-v1",
        configJson: {
          cycle: "CYCLE_1",
          filingYear: 2026,
          performance: {
            scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
            nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
            requiredReductionFraction: 0.2,
          },
          standardTarget: {
            scoreEligibleMetric: "ENERGY_STAR_SCORE",
            nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
          },
          pathwayRouting: {
            prescriptiveAlwaysEligible: true,
            supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
          },
          prescriptive: {
            complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
          },
        },
      },
      create: {
        rulePackageId: rulePackage.id,
        sourceArtifactId: bepsSource.id,
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "beps/evaluator-v1",
        configJson: {
          cycle: "CYCLE_1",
          filingYear: 2026,
          performance: {
            scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
            nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
            requiredReductionFraction: 0.2,
          },
          standardTarget: {
            scoreEligibleMetric: "ENERGY_STAR_SCORE",
            nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
          },
          pathwayRouting: {
            prescriptiveAlwaysEligible: true,
            supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
          },
          prescriptive: {
            complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
          },
        },
      },
    });

    const cycle1FactorSetVersion = await prisma.factorSetVersion.upsert({
      where: {
        key_version: {
          key: bepsFactorSetKey,
          version: "test-v1",
        },
      },
      update: {
        sourceArtifactId: factorSource.id,
        status: "ACTIVE",
        factorsJson: {
          beps: {
            cycle: {
              filingYear: 2026,
              cycleStartYear: 2021,
              cycleEndYear: 2026,
              baselineYears: [2018, 2019],
              evaluationYears: [2026],
              baselineBenchmarkYear: 2019,
              complianceDeadline: "2026-12-31",
              delayedCycle1Option: {
                baselineYears: [2018, 2019],
                evaluationYears: [2026],
                comparisonYear: 2026,
                optionYear: 2021,
              },
            },
            applicability: {
              minGrossSquareFeetPrivate: 50000,
              minGrossSquareFeetDistrict: 10000,
              ownershipClassFallback: "PRIVATE",
              coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
              recentConstructionExemptionYears: 5,
              cycleStartYear: 2021,
              cycleEndYear: 2026,
              filingYear: 2026,
            },
            pathwayRouting: {
              performanceScoreThreshold: 55,
              prescriptiveAlwaysEligible: true,
              supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
            },
            performance: {
              requiredReductionFraction: 0.2,
              scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
              defaultBaselineYears: [2018, 2019],
              defaultEvaluationYears: [2026],
            },
            standardTarget: {
              defaultMaxGap: 15,
              maxGapByPropertyType: {
                OFFICE: 15,
                MULTIFAMILY: 15,
                MIXED_USE: 15,
                OTHER: 15,
              },
              exactTargetScoresByPropertyType: {
                OFFICE: 71,
                MULTIFAMILY: 66,
                MIXED_USE: 66,
                OTHER: 54,
              },
              scoreEligibleMetric: "ENERGY_STAR_SCORE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
            },
            prescriptive: {
              defaultPointsNeeded: 25,
              pointsNeededByPropertyType: {
                OFFICE: 25,
                MULTIFAMILY: 25,
                MIXED_USE: 25,
                OTHER: 25,
              },
              complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
            },
            alternativeCompliance: {
              penaltyPerSquareFoot: 10,
              maxPenaltyCap: 7500000,
              agreementRequired: true,
              allowedAgreementPathways: [
                "PERFORMANCE",
                "STANDARD_TARGET",
                "PRESCRIPTIVE",
              ],
            },
          },
        },
      },
      create: {
        key: bepsFactorSetKey,
        sourceArtifactId: factorSource.id,
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        factorsJson: {
          beps: {
            cycle: {
              filingYear: 2026,
              cycleStartYear: 2021,
              cycleEndYear: 2026,
              baselineYears: [2018, 2019],
              evaluationYears: [2026],
              baselineBenchmarkYear: 2019,
              complianceDeadline: "2026-12-31",
              delayedCycle1Option: {
                baselineYears: [2018, 2019],
                evaluationYears: [2026],
                comparisonYear: 2026,
                optionYear: 2021,
              },
            },
            applicability: {
              minGrossSquareFeetPrivate: 50000,
              minGrossSquareFeetDistrict: 10000,
              ownershipClassFallback: "PRIVATE",
              coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
              recentConstructionExemptionYears: 5,
              cycleStartYear: 2021,
              cycleEndYear: 2026,
              filingYear: 2026,
            },
            pathwayRouting: {
              performanceScoreThreshold: 55,
              prescriptiveAlwaysEligible: true,
              supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
            },
            performance: {
              requiredReductionFraction: 0.2,
              scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
              defaultBaselineYears: [2018, 2019],
              defaultEvaluationYears: [2026],
            },
            standardTarget: {
              defaultMaxGap: 15,
              maxGapByPropertyType: {
                OFFICE: 15,
                MULTIFAMILY: 15,
                MIXED_USE: 15,
                OTHER: 15,
              },
              exactTargetScoresByPropertyType: {
                OFFICE: 71,
                MULTIFAMILY: 66,
                MIXED_USE: 66,
                OTHER: 54,
              },
              scoreEligibleMetric: "ENERGY_STAR_SCORE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
            },
            prescriptive: {
              defaultPointsNeeded: 25,
              pointsNeededByPropertyType: {
                OFFICE: 25,
                MULTIFAMILY: 25,
                MIXED_USE: 25,
                OTHER: 25,
              },
              complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
            },
            alternativeCompliance: {
              penaltyPerSquareFoot: 10,
              maxPenaltyCap: 7500000,
              agreementRequired: true,
              allowedAgreementPathways: [
                "PERFORMANCE",
                "STANDARD_TARGET",
                "PRESCRIPTIVE",
              ],
            },
          },
        },
      },
    });

    await prisma.bepsCycleRegistry.upsert({
      where: {
        complianceCycle: "CYCLE_1",
      },
      update: {
        cycleId: "BEPS_CYCLE_1",
        cycleStartYear: 2021,
        cycleEndYear: 2026,
        baselineYearStart: 2018,
        baselineYearEnd: 2019,
        evaluationYear: 2026,
        rulePackageId: rulePackage.id,
        factorSetVersionId: cycle1FactorSetVersion.id,
      },
      create: {
        cycleId: "BEPS_CYCLE_1",
        complianceCycle: "CYCLE_1",
        cycleStartYear: 2021,
        cycleEndYear: 2026,
        baselineYearStart: 2018,
        baselineYearEnd: 2019,
        evaluationYear: 2026,
        rulePackageId: rulePackage.id,
        factorSetVersionId: cycle1FactorSetVersion.id,
      },
    });

    orgA = await prisma.organization.create({
      data: {
        name: `BEPS Org A ${scope}`,
        slug: `beps-org-a-${scope}`,
        clerkOrgId: `clerk_beps_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `BEPS Org B ${scope}`,
        slug: `beps-org-b-${scope}`,
        clerkOrgId: `clerk_beps_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_beps_user_a_${scope}`,
        email: `beps_a_${scope}@test.com`,
        name: "BEPS User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_beps_user_b_${scope}`,
        email: `beps_b_${scope}@test.com`,
        name: "BEPS User B",
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
        name: `BEPS Building A ${scope}`,
        address: "900 Test St NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 120000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        yearBuilt: 1990,
        bepsTargetScore: 71,
        maxPenaltyExposure: 1200000,
      },
      select: { id: true },
    });

    buildingB = await prisma.building.create({
      data: {
        organizationId: orgB.id,
        name: `BEPS Building B ${scope}`,
        address: "901 Test St NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.04,
        grossSquareFeet: 125000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: false,
        yearBuilt: 1991,
        bepsTargetScore: 71,
        targetEui: 68,
        maxPenaltyExposure: 1250000,
      },
      select: { id: true },
    });

    buildingC = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `BEPS Building C ${scope}`,
        address: "902 Test St NW, Washington, DC 20001",
        latitude: 38.92,
        longitude: -77.05,
        grossSquareFeet: 130000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        yearBuilt: 1989,
        bepsTargetScore: 71,
        maxPenaltyExposure: 1300000,
      },
      select: { id: true },
    });

    const snapshotA = await prisma.complianceSnapshot.create({
      data: {
        buildingId: buildingA.id,
        organizationId: orgA.id,
        triggerType: "MANUAL",
        energyStarScore: 60,
        siteEui: 90,
        sourceEui: 180,
        weatherNormalizedSiteEui: 90,
        weatherNormalizedSourceEui: 170,
        complianceStatus: "AT_RISK",
        complianceGap: -11,
        estimatedPenalty: 800000,
        dataQualityScore: 92,
        penaltyInputsJson: {},
      },
    });

    const snapshotB = await prisma.complianceSnapshot.create({
      data: {
        buildingId: buildingB.id,
        organizationId: orgB.id,
        triggerType: "MANUAL",
        energyStarScore: null,
        siteEui: 95,
        sourceEui: 190,
        weatherNormalizedSiteEui: 88,
        weatherNormalizedSourceEui: 72,
        complianceStatus: "NON_COMPLIANT",
        complianceGap: null,
        estimatedPenalty: 1000000,
        dataQualityScore: 88,
        penaltyInputsJson: {},
      },
    });

    await prisma.complianceSnapshot.createMany({
      data: [
        {
          buildingId: buildingC.id,
          organizationId: orgA.id,
          triggerType: "MANUAL",
          snapshotDate: new Date("2019-06-30T00:00:00.000Z"),
          energyStarScore: 52,
          siteEui: 110,
          sourceEui: 200,
          weatherNormalizedSiteEui: 108,
          weatherNormalizedSourceEui: 180,
          complianceStatus: "AT_RISK",
          complianceGap: -19,
          estimatedPenalty: 950000,
          dataQualityScore: 80,
          penaltyInputsJson: {},
        },
        {
          buildingId: buildingC.id,
          organizationId: orgA.id,
          triggerType: "MANUAL",
          snapshotDate: new Date("2020-06-30T00:00:00.000Z"),
          energyStarScore: 54,
          siteEui: 100,
          sourceEui: 190,
          weatherNormalizedSiteEui: 98,
          weatherNormalizedSourceEui: 175,
          complianceStatus: "AT_RISK",
          complianceGap: -17,
          estimatedPenalty: 900000,
          dataQualityScore: 82,
          penaltyInputsJson: {},
        },
        {
          buildingId: buildingC.id,
          organizationId: orgA.id,
          triggerType: "MANUAL",
          snapshotDate: new Date("2025-06-30T00:00:00.000Z"),
          energyStarScore: 72,
          siteEui: 80,
          sourceEui: 160,
          weatherNormalizedSiteEui: 79,
          weatherNormalizedSourceEui: 150,
          complianceStatus: "AT_RISK",
          complianceGap: 1,
          estimatedPenalty: 350000,
          dataQualityScore: 90,
          penaltyInputsJson: {},
        },
        {
          buildingId: buildingC.id,
          organizationId: orgA.id,
          triggerType: "MANUAL",
          snapshotDate: new Date("2026-06-30T00:00:00.000Z"),
          energyStarScore: 75,
          siteEui: 70,
          sourceEui: 145,
          weatherNormalizedSiteEui: 68,
          weatherNormalizedSourceEui: 140,
          complianceStatus: "COMPLIANT",
          complianceGap: 4,
          estimatedPenalty: 0,
          dataQualityScore: 94,
          penaltyInputsJson: {},
        },
      ],
    });

    await prisma.bepsMetricInput.createMany({
      data: [
        {
          organizationId: orgA.id,
          buildingId: buildingA.id,
          complianceCycle: "CYCLE_1",
          filingYear: 2026,
          baselineYearStart: 2018,
          baselineYearEnd: 2019,
          evaluationYearStart: 2026,
          evaluationYearEnd: 2026,
          comparisonYear: 2026,
          baselineAdjustedSiteEui: 100,
          evaluationAdjustedSiteEui: 90,
          baselineWeatherNormalizedSiteEui: 98,
          evaluationWeatherNormalizedSiteEui: 90,
          baselineWeatherNormalizedSourceEui: 175,
          evaluationWeatherNormalizedSourceEui: 170,
          baselineEnergyStarScore: 55,
          evaluationEnergyStarScore: 60,
          evaluationSnapshotId: snapshotA.id,
          notesJson: { scope },
        },
        {
          organizationId: orgB.id,
          buildingId: buildingB.id,
          complianceCycle: "CYCLE_1",
          filingYear: 2026,
          baselineYearStart: 2018,
          baselineYearEnd: 2019,
          evaluationYearStart: 2026,
          evaluationYearEnd: 2026,
          comparisonYear: 2026,
          baselineAdjustedSiteEui: 100,
          evaluationAdjustedSiteEui: 89,
          baselineWeatherNormalizedSiteEui: 96,
          evaluationWeatherNormalizedSiteEui: 88,
          baselineWeatherNormalizedSourceEui: 84,
          evaluationWeatherNormalizedSourceEui: 72,
          evaluationSnapshotId: snapshotB.id,
          notesJson: { scope },
        },
      ],
    });

    await prisma.bepsPrescriptiveItem.createMany({
      data: [
        {
          organizationId: orgA.id,
          buildingId: buildingA.id,
          complianceCycle: "CYCLE_1",
          filingYear: 2026,
          itemKey: "lighting",
          name: "Lighting retrofit",
          isRequired: true,
          pointsPossible: 10,
          pointsEarned: 10,
          status: "APPROVED",
          approvedAt: new Date("2026-01-01T00:00:00.000Z"),
          sourceArtifactId: factorSource.id,
          metadata: { scope },
        },
        {
          organizationId: orgA.id,
          buildingId: buildingA.id,
          complianceCycle: "CYCLE_1",
          filingYear: 2026,
          itemKey: "controls",
          name: "Controls tune-up",
          isRequired: true,
          pointsPossible: 15,
          pointsEarned: 8,
          status: "IN_PROGRESS",
          sourceArtifactId: factorSource.id,
          metadata: { scope },
        },
      ],
    });

    await prisma.bepsAlternativeComplianceAgreement.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingA.id,
        complianceCycle: "CYCLE_1",
        filingYear: 2026,
        agreementIdentifier: `ACP-${scope}`,
        pathway: "PERFORMANCE",
        multiplier: 0.7,
        status: "ACTIVE",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        sourceArtifactId: factorSource.id,
        agreementPayload: { scope },
      },
    });
  });

  afterAll(async () => {
    await prisma.bepsAlternativeComplianceAgreement.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id, buildingC.id] },
      },
    });
    await prisma.bepsPrescriptiveItem.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id, buildingC.id] },
      },
    });
    await prisma.bepsMetricInput.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id, buildingC.id] },
      },
    });
    await prisma.evidenceArtifact.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id, buildingC.id] },
      },
    });
    await prisma.filingRecord.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id, buildingC.id] },
      },
    });
    await prisma.complianceSnapshot.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id, buildingC.id] },
      },
    });
    await prisma.complianceRun.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id, buildingC.id] },
      },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: {
        clerkUserId: {
          startsWith: "clerk_beps_user_",
        },
      },
    });
    await prisma.building.deleteMany({
      where: { id: { in: [buildingA.id, buildingB.id, buildingC.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.sourceArtifact.deleteMany({
      where: {
        OR: [
          { name: { contains: scope } },
          { externalUrl: { startsWith: "https://example.com/beps" } },
        ],
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

  it("creates and updates the canonical BEPS filing record through the governed workflow", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const first = await caller.beps.evaluate({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });

    expect(first.evaluation.overallStatus).toBe("NON_COMPLIANT");
    expect(first.evaluation.governance?.factorSetKey).toBe(bepsFactorSetKey);
    expect(first.evaluation.governedConfig.performance.requiredReductionFraction).toBe(0.2);
    expect(first.evaluation.inputSummary.sources.currentScore).toBe("CANONICAL_METRIC_INPUT");
    expect(first.filingRecord.filingType).toBe("BEPS_COMPLIANCE");
    expect(first.filingRecord.complianceRunId).toBe(first.provenance.complianceRun.id);
    expect(first.provenance.complianceRun.factorSetVersionId).toBe(first.factorSetVersion.id);
    expect(first.factorSetVersion.key).toBe(bepsFactorSetKey);
    expect(first.evaluation.inputSummary.canonicalRefs.metricInputId).toBeTruthy();
    expect(first.evaluation.inputSummary.canonicalRefs.alternativeComplianceAgreementId).toBeTruthy();

    await caller.beps.upsertPrescriptiveItem({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
      itemKey: "controls",
      name: "Controls tune-up",
      isRequired: true,
      pointsPossible: 15,
      pointsEarned: 15,
      status: "APPROVED",
      approvedAt: "2026-03-01T00:00:00.000Z",
    });
    await caller.beps.upsertAlternativeComplianceAgreement({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
      agreementIdentifier: `ACP-${scope}`,
      pathway: "PERFORMANCE",
      multiplier: 0.6,
      status: "ACTIVE",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    const second = await caller.beps.evaluate({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });

    expect(second.evaluation.overallStatus).toBe("COMPLIANT");
    expect(second.filingRecord.id).toBe(first.filingRecord.id);
    expect(second.filingRecord.complianceRunId).toBe(second.provenance.complianceRun.id);
    expect(second.evaluation.governance?.rulePackageKey).toBe("DC_BEPS_CYCLE_1");
    expect(second.evaluation.inputSummary.alternativeComplianceAgreementMultiplier).toBe(
      0.6,
    );
    expect(second.evaluation.pathwayResults.standardTarget?.calculation.formulaKey).toBe(
      "DC_BEPS_CYCLE_1_STANDARD_TARGET_ADJUSTMENT",
    );

    const latest = await caller.beps.latestRun({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });
    const payload = latest.filingPayload as Record<string, unknown>;
    const evaluation = payload["bepsEvaluation"] as Record<string, unknown>;
    const governance = evaluation["governance"] as Record<string, unknown>;

    expect(evaluation["overallStatus"]).toBe("COMPLIANT");
    expect(governance["factorSetKey"]).toBe(bepsFactorSetKey);
  });

  it("automatically derives canonical metrics from snapshots and prefers them over overrides", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const before = await caller.beps.canonicalMetrics({
      buildingId: buildingC.id,
      cycle: "CYCLE_1",
    });
    expect(before.metricInput).toBeNull();

    const evaluation = await caller.beps.evaluate({
      buildingId: buildingC.id,
      cycle: "CYCLE_1",
      overrides: {
        baselineAdjustedSiteEui: 999,
        currentAdjustedSiteEui: 999,
        baselineScore: 10,
        currentScore: 10,
      },
    });

    expect(evaluation.evaluation.inputSummary.baselineAdjustedSiteEui).toBe(110);
    expect(evaluation.evaluation.inputSummary.currentAdjustedSiteEui).toBe(70);
    expect(evaluation.evaluation.inputSummary.baselineScore).toBe(52);
    expect(evaluation.evaluation.inputSummary.currentScore).toBe(75);
    expect(evaluation.evaluation.inputSummary.sources.baselineAdjustedSiteEui).toBe(
      "CANONICAL_METRIC_INPUT",
    );

    const after = await caller.beps.canonicalMetrics({
      buildingId: buildingC.id,
      cycle: "CYCLE_1",
    });
    expect(after.metricInput?.baselineYearStart).toBe(2018);
    expect(after.metricInput?.evaluationYearEnd).toBe(2026);
    expect(after.metricInput?.notesJson["inputMode"]).toBe("DERIVED");
  });

  it("supports admin metric upserts and preserves manual canonical metrics over derived refresh", async () => {
    const caller = createCaller(userB.clerkUserId, orgB.clerkOrgId);

    const updated = await caller.beps.upsertMetricInput({
      buildingId: buildingB.id,
      cycle: "CYCLE_1",
      baselineWeatherNormalizedSourceEui: 83,
      evaluationWeatherNormalizedSourceEui: 69,
      evaluationAdjustedSiteEui: 87,
      notes: {
        scope,
        operatorNote: "Manual BEPS metric correction",
      },
    });

    expect((updated.notesJson as Record<string, unknown>)["inputMode"]).toBe("MANUAL");

    const refreshed = await caller.beps.refreshCanonicalMetrics({
      buildingId: buildingB.id,
      cycle: "CYCLE_1",
    });
    expect(refreshed.updated).toBe(false);
    expect(refreshed.skippedReason).toBe("MANUAL_INPUT_LOCKED");

    const canonicalMetrics = await caller.beps.canonicalMetrics({
      buildingId: buildingB.id,
      cycle: "CYCLE_1",
    });
    expect(canonicalMetrics.metricInput?.evaluationWeatherNormalizedSourceEui).toBe(69);
    expect(canonicalMetrics.metricInput?.notesJson["inputMode"]).toBe("MANUAL");
  });

  it("guards filing transitions and records append-only filing events", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const evaluation = await caller.beps.evaluate({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });

    const filed = await caller.beps.transitionFiling({
      buildingId: buildingA.id,
      filingRecordId: evaluation.filingRecord.id,
      nextStatus: "FILED",
      notes: "Submitted to DOEE",
    });
    expect(filed.status).toBe("FILED");
    expect(filed.events.some((event) => event.action === "STATUS_TRANSITION")).toBe(true);

    const accepted = await caller.beps.transitionFiling({
      buildingId: buildingA.id,
      filingRecordId: evaluation.filingRecord.id,
      nextStatus: "ACCEPTED",
      notes: "Accepted by regulator",
    });
    expect(accepted.status).toBe("ACCEPTED");

    await expect(
      caller.beps.transitionFiling({
        buildingId: buildingA.id,
        filingRecordId: evaluation.filingRecord.id,
        nextStatus: "GENERATED",
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("links evidence to beps filing records and keeps workflow updates tenant-scoped", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const callerB = createCaller(userB.clerkUserId, orgB.clerkOrgId);
    const evaluation = await callerA.beps.evaluate({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });

    const evidence = await callerA.beps.attachFilingEvidence({
      buildingId: buildingA.id,
      filingRecordId: evaluation.filingRecord.id,
      artifactType: "OWNER_ATTESTATION",
      name: "Performance pathway support packet",
      bepsEvidenceKind: "PATHWAY_SUPPORT",
      pathway: "PERFORMANCE",
      metadata: {
        scope,
      },
    });
    expect(evidence.filingRecordId).toBe(evaluation.filingRecord.id);

    const latest = await callerA.beps.latestRun({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });
    expect(latest.evidenceArtifacts.some((artifact) => artifact.id === evidence.id)).toBe(
      true,
    );
    expect(latest.events.some((event) => event.action === "EVIDENCE_LINKED")).toBe(true);

    await expect(
      callerB.beps.upsertMetricInput({
        buildingId: buildingA.id,
        cycle: "CYCLE_1",
        baselineAdjustedSiteEui: 120,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      callerB.beps.attachFilingEvidence({
        buildingId: buildingA.id,
        filingRecordId: evaluation.filingRecord.id,
        artifactType: "OTHER",
        name: "Cross-tenant evidence attempt",
        bepsEvidenceKind: "ACP_SUPPORT",
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("retrieves canonical BEPS inputs and records only within the authenticated tenant", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const callerB = createCaller(userB.clerkUserId, orgB.clerkOrgId);

    await callerB.beps.evaluate({
      buildingId: buildingB.id,
      cycle: "CYCLE_1",
    });

    const inputStateA = await callerA.beps.inputState({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });
    expect(inputStateA.canonicalInputState.metricInput?.evaluationEnergyStarScore).toBe(60);
    expect(inputStateA.canonicalInputState.prescriptiveItems).toHaveLength(2);
    expect(
      inputStateA.canonicalInputState.alternativeComplianceAgreement?.multiplier,
    ).toBeGreaterThan(0);

    const canonicalMetricsB = await callerB.beps.canonicalMetrics({
      buildingId: buildingB.id,
      cycle: "CYCLE_1",
    });
    expect(canonicalMetricsB.metricInput?.evaluationWeatherNormalizedSourceEui).toBe(
      69,
    );

    const outcomesA = await callerA.beps.listOutcomes({
      buildingId: buildingA.id,
      limit: 10,
    });
    expect(outcomesA).toHaveLength(1);
    expect(outcomesA[0]?.buildingId).toBe(buildingA.id);

    await expect(
      callerA.beps.latestRun({
        buildingId: buildingB.id,
        cycle: "CYCLE_1",
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      callerA.beps.inputState({
        buildingId: buildingB.id,
        cycle: "CYCLE_1",
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      callerA.beps.refreshCanonicalMetrics({
        buildingId: buildingB.id,
        cycle: "CYCLE_1",
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    const outcomesB = await callerB.beps.listOutcomes({
      buildingId: buildingB.id,
      limit: 10,
    });
    expect(outcomesB).toHaveLength(1);
    expect(outcomesB[0]?.buildingId).toBe(buildingB.id);
  });
});
