import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("governed penalty runs", () => {
  const scope = `penalty-runs-${Date.now()}`;

  let organization: { id: string; clerkOrgId: string };
  let user: { id: string; clerkUserId: string };
  let sourceArtifact: { id: string };
  let rulePackage: { id: string };
  let ruleVersion: { id: string; version: string };
  let factorSetVersion: { id: string; version: string };
  let activeBuilding: { id: string };
  let insufficientBuilding: { id: string };

  function createCaller(requestId: string) {
    return appRouter.createCaller({
      requestId,
      clerkUserId: user.clerkUserId,
      clerkOrgId: organization.clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  function toInputJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  beforeAll(async () => {
    sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `Penalty law ${scope}`,
        externalUrl: "https://example.com/penalty-law",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    rulePackage = await prisma.rulePackage.create({
      data: {
        key: `DC_BEPS_PENALTY_${scope}`,
        name: `Penalty package ${scope}`,
      },
      select: { id: true },
    });

    ruleVersion = await prisma.ruleVersion.create({
      data: {
        rulePackageId: rulePackage.id,
        version: "penalty-test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        implementationKey: "compliance-engine/beps-v1",
        sourceArtifactId: sourceArtifact.id,
        configJson: {},
      },
      select: { id: true, version: true },
    });

    factorSetVersion = await prisma.factorSetVersion.create({
      data: {
        key: `DC_PENALTY_FACTORS_${scope}`,
        version: "penalty-test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        sourceArtifactId: sourceArtifact.id,
        factorsJson: {},
      },
      select: { id: true, version: true },
    });

    organization = await prisma.organization.create({
      data: {
        clerkOrgId: `org_${scope}`,
        name: `Penalty Org ${scope}`,
        slug: `penalty-org-${scope}`,
      },
      select: { id: true, clerkOrgId: true },
    });

    user = await prisma.user.create({
      data: {
        clerkUserId: `user_${scope}`,
        email: `${scope}@example.com`,
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

    activeBuilding = await prisma.building.create({
      data: {
        organizationId: organization.id,
        name: `Penalty Building ${scope}`,
        address: "100 Penalty Ave NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 100000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 71,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    insufficientBuilding = await prisma.building.create({
      data: {
        organizationId: organization.id,
        name: `Insufficient Building ${scope}`,
        address: "101 Penalty Ave NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.04,
        grossSquareFeet: 90000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 71,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    const executedAt = new Date("2026-03-18T12:00:00.000Z");
    const generatedAt = new Date("2026-03-18T12:30:00.000Z");
    const finalizedAt = new Date("2026-03-18T13:00:00.000Z");

    const engineResult = {
      engineVersion: "v1",
      scope: "BEPS",
      status: "COMPUTED",
      applicability: "APPLICABLE",
      reportingYear: 2026,
      rulePackageKey: `DC_BEPS_PENALTY_${scope}`,
      ruleVersionId: ruleVersion.id,
      ruleVersion: ruleVersion.version,
      factorSetKey: `DC_PENALTY_FACTORS_${scope}`,
      factorSetVersionId: factorSetVersion.id,
      factorSetVersion: factorSetVersion.version,
      metricUsed: "ENERGY_STAR_SCORE",
      qa: {
        verdict: "PASS",
        gate: "PASSED",
        targetYear: 2025,
        issues: [],
      },
      reasonCodes: ["STANDARD_TARGET_NOT_MET"],
      decision: {
        meetsStandard: false,
        blocked: false,
        insufficientData: false,
      },
      domainResult: {
        evaluation: {
          overallStatus: "NON_COMPLIANT",
        },
      },
    };

    const standardTargetAlternativeCompliance = {
      pathway: "STANDARD_TARGET",
      maxAmount: 1200000,
      amountDue: 300000,
      reductionPct: 75,
      remainingPenaltyFraction: 0.25,
      reasonCodes: ["ALTERNATIVE_COMPLIANCE_CALCULATED"],
      findings: [],
      calculation: {
        formulaKey: "DC_BEPS_CYCLE_1_STANDARD_TARGET_ADJUSTMENT",
        rawInputs: {
          baselineScore: 60,
          currentScore: 68,
          targetScore: 71,
          maxGap: 12,
        },
        intermediateValues: {
          initialGap: 11,
          achievedSavings: 8,
          requiredSavings: 11,
          step1ReductionFraction: 1 - 11 / 12,
          step2ReductionFraction: 8 / 11,
        },
        remainingPenaltyFraction: 0.25,
        adjustedAmount: 300000,
        maxAmount: 1200000,
      },
    };

    const evaluation = {
      cycle: "CYCLE_1",
      filingYear: 2026,
      evaluatedAt: executedAt.toISOString(),
      overallStatus: "NON_COMPLIANT",
      applicable: true,
      selectedPathway: "STANDARD_TARGET",
      reasonCodes: ["STANDARD_TARGET_NOT_MET"],
      findings: [],
      applicability: {
        cycle: "CYCLE_1",
        filingYear: 2026,
        applicable: true,
        status: "APPLICABLE",
        reasonCodes: [],
        findings: [],
      },
      pathwayEligibility: {
        supportedPathways: ["STANDARD_TARGET"],
        eligiblePathways: ["STANDARD_TARGET"],
        preferredPathway: "STANDARD_TARGET",
        reasonCodes: [],
        findings: [],
      },
      pathwayResults: {
        performance: null,
        standardTarget: {
          pathway: "STANDARD_TARGET",
          evaluationStatus: "NON_COMPLIANT",
          eligible: true,
          compliant: false,
          metricBasis: "ENERGY_STAR_SCORE",
          progressPct: 75,
          reductionPct: 75,
          reasonCodes: ["STANDARD_TARGET_NOT_MET"],
          findings: [],
          calculation: standardTargetAlternativeCompliance.calculation,
          metrics: {
            baselineScore: 60,
            currentScore: 68,
            metricBasis: "ENERGY_STAR_SCORE",
            exactTargetScoreForPropertyType: 71,
            propertyTypeMappingConstraint: null,
            pMax: 1200000,
          },
        },
        prescriptive: null,
        trajectory: null,
      },
      alternativeCompliance: {
        performance: null,
        standardTarget: standardTargetAlternativeCompliance,
        prescriptive: null,
        trajectory: null,
        recommended: standardTargetAlternativeCompliance,
      },
      governedConfig: {
        applicability: {
          minGrossSquareFeetApplied: 50000,
          minGrossSquareFeetPrivate: 50000,
          minGrossSquareFeetDistrict: 10000,
          ownershipClassFallback: "PRIVATE",
          recentConstructionExemptionYears: 10,
          cycleStartYear: 2021,
          cycleEndYear: 2026,
        },
        pathwayRouting: {
          performanceScoreThreshold: 65,
          prescriptiveAlwaysEligible: true,
          preferredPathway: "STANDARD_TARGET",
          supportedPathways: ["STANDARD_TARGET"],
        },
        performance: {
          requiredReductionFraction: 0.2,
          scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
          nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
          defaultBaselineYears: [2018, 2019],
          defaultEvaluationYears: [2024, 2025],
          delayedCycle1Option: null,
        },
        standardTarget: {
          buildingTargetScore: 71,
          exactTargetScoreForPropertyType: 71,
          propertyTypeMappingConstraint: null,
          maxGapForPropertyType: 12,
          scoreEligibleMetric: "ENERGY_STAR_SCORE",
          nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
        },
        prescriptive: {
          pointsNeededForPropertyType: 0,
          complianceBasis: "POINTS",
        },
        trajectory: {
          metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
          targetYears: [],
          finalTargetYear: 2026,
          targetCount: 0,
        },
        alternativeCompliance: {
          penaltyPerSquareFoot: 12,
          maxPenaltyCap: 7500000,
          agreementRequired: false,
          allowedAgreementPathways: ["STANDARD_TARGET"],
        },
      },
      inputSummary: {
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        currentScore: 68,
        baselineScore: 60,
        baselineAdjustedSiteEui: null,
        currentAdjustedSiteEui: null,
        baselineWeatherNormalizedSiteEui: null,
        currentWeatherNormalizedSiteEui: null,
        baselineWeatherNormalizedSourceEui: null,
        currentWeatherNormalizedSourceEui: null,
        prescriptivePointsEarned: null,
        prescriptivePointsNeeded: null,
        prescriptiveRequirementsMet: null,
        delayedCycle1OptionApplied: null,
        alternativeComplianceAgreementMultiplier: null,
        alternativeComplianceAgreementPathway: null,
        requestAlternativeComplianceAgreement: null,
        maxPenaltyOverrideReason: null,
        sources: {},
        canonicalRefs: {
          metricInputId: null,
          prescriptiveItemIds: [],
          alternativeComplianceAgreementId: null,
        },
      },
    };

    const complianceRun = await prisma.complianceRun.create({
      data: {
        organizationId: organization.id,
        buildingId: activeBuilding.id,
        ruleVersionId: ruleVersion.id,
        factorSetVersionId: factorSetVersion.id,
        runType: "BEPS_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "beps:CYCLE_1:2026",
        inputSnapshotHash: `hash-${scope}`,
        resultPayload: toInputJson({
          engineResult,
          evaluation,
        }),
        producedByType: "SYSTEM",
        producedById: "test",
        executedAt,
      },
      select: { id: true },
    });

    await prisma.calculationManifest.create({
      data: {
        complianceRunId: complianceRun.id,
        ruleVersionId: ruleVersion.id,
        factorSetVersionId: factorSetVersion.id,
        codeVersion: "test",
        implementationKey: "compliance-engine/beps-v1",
        inputSnapshotRef: "beps:CYCLE_1:2026",
        inputSnapshotHash: `hash-${scope}`,
        manifestPayload: {},
        executedAt,
      },
    });

    const filingRecord = await prisma.filingRecord.create({
      data: {
        organizationId: organization.id,
        buildingId: activeBuilding.id,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        complianceRunId: complianceRun.id,
        status: "GENERATED",
        filingPayload: toInputJson({
          complianceEngine: engineResult,
        }),
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    await prisma.filingPacket.create({
      data: {
        organizationId: organization.id,
        buildingId: activeBuilding.id,
        filingRecordId: filingRecord.id,
        packetType: "COMPLETED_ACTIONS",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        version: 1,
        status: "FINALIZED",
        packetHash: `packet-${scope}`,
        packetPayload: {},
        generatedAt,
        finalizedAt,
        finalizedByType: "SYSTEM",
        finalizedById: "test",
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { organizationId: organization?.id },
    });
    await prisma.penaltyRun.deleteMany({
      where: { organizationId: organization?.id },
    });
    await prisma.filingPacket.deleteMany({
      where: { organizationId: organization?.id },
    });
    await prisma.filingRecord.deleteMany({
      where: { organizationId: organization?.id },
    });
    await prisma.calculationManifest.deleteMany({
      where: { ruleVersionId: ruleVersion?.id },
    });
    await prisma.complianceRun.deleteMany({
      where: { organizationId: organization?.id },
    });
    await prisma.building.deleteMany({
      where: { organizationId: organization?.id },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: organization?.id },
    });
    await prisma.user.deleteMany({
      where: { id: user?.id },
    });
    await prisma.organization.deleteMany({
      where: { id: organization?.id },
    });
    await prisma.factorSetVersion.deleteMany({
      where: { id: factorSetVersion?.id },
    });
    await prisma.ruleVersion.deleteMany({
      where: { id: ruleVersion?.id },
    });
    await prisma.rulePackage.deleteMany({
      where: { id: rulePackage?.id },
    });
    await prisma.sourceArtifact.deleteMany({
      where: { id: sourceArtifact?.id },
    });
  });

  it("persists deterministic penalty runs and returns stable scenario deltas", async () => {
    const caller = createCaller(`penalty-estimate-${scope}`);

    const [first, second, list] = await Promise.all([
      caller.building.getPenaltySummary({
        buildingId: activeBuilding.id,
      }),
      caller.building.getPenaltySummary({
        buildingId: activeBuilding.id,
      }),
      caller.building.listPenaltySummaries({
        buildingIds: [activeBuilding.id],
      }),
    ]);
    const report = await caller.report.getComplianceReport({
      buildingId: activeBuilding.id,
    });

    expect(first.id).toBe(second.id);
    expect(first.status).toBe("ESTIMATED");
    expect(first.currentEstimatedPenalty).toBe(300000);
    expect(first.governingContext.ruleVersion).toBe("penalty-test-v1");
    expect(first.governingContext.factorSetVersion).toBe("penalty-test-v1");
    expect(first.governingContext.metricUsed).toBe("ENERGY_STAR_SCORE");
    expect(first.timestamps.lastComplianceEvaluatedAt).toBe("2026-03-18T12:00:00.000Z");
    expect(first.timestamps.lastPacketGeneratedAt).toBe("2026-03-18T12:30:00.000Z");
    expect(first.artifacts.complianceRunId).toBeTruthy();
    expect(first.artifacts.filingRecordId).toBeTruthy();
    expect(first.artifacts.filingPacketId).toBeTruthy();
    expect(list).toHaveLength(1);
    expect(list[0]?.buildingId).toBe(activeBuilding.id);
    expect(list[0]?.summary.id).toBe(first.id);
    expect(report.complianceData.estimatedPenalty).toBe(300000);
    expect(report.governedPenalty).not.toBeNull();
    expect(report.governedPenalty?.status).toBe("ESTIMATED");
    expect(report.governedPenalty?.currentEstimatedPenalty).toBe(300000);
    expect(first.scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MEET_TARGET",
          estimatedPenalty: 0,
          deltaFromCurrent: -300000,
        }),
        expect.objectContaining({
          code: "RESOLVE_CURRENT_PATHWAY_GAP",
          estimatedPenalty: 0,
          deltaFromCurrent: -300000,
        }),
        expect.objectContaining({
          code: "IMPROVE_PRIMARY_METRIC_SMALL",
          estimatedPenalty: 200000,
          deltaFromCurrent: -100000,
          metricChange: expect.objectContaining({
            from: 68,
            to: 69,
          }),
        }),
      ]),
    );
    expect(
      await prisma.penaltyRun.count({
        where: {
          organizationId: organization.id,
          buildingId: activeBuilding.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId: organization.id,
          buildingId: activeBuilding.id,
          action: "PENALTY_RUN_COMPUTED",
        },
      }),
    ).toBe(1);
  });

  it("returns a stable insufficient-context summary when no governed BEPS evaluation exists", async () => {
    const caller = createCaller(`penalty-insufficient-${scope}`);

    const [first, second] = await Promise.all([
      caller.building.getPenaltySummary({
        buildingId: insufficientBuilding.id,
      }),
      caller.building.getPenaltySummary({
        buildingId: insufficientBuilding.id,
      }),
    ]);
    const report = await caller.report.getComplianceReport({
      buildingId: insufficientBuilding.id,
    });

    expect(first.id).toBe(second.id);
    expect(first.status).toBe("INSUFFICIENT_CONTEXT");
    expect(first.currentEstimatedPenalty).toBeNull();
    expect(first.scenarios).toEqual([]);
    expect(report.governedPenalty).not.toBeNull();
    expect(report.governedPenalty?.status).toBe("INSUFFICIENT_CONTEXT");
    expect(report.complianceData.estimatedPenalty).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(first, "filingPayload")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(first, "submissionPayload")).toBe(false);
  });
});
