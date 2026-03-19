import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("compliance engine", () => {
  const scope = `${Date.now()}`;
  const bepsFactorSetKey = "DC_BEPS_CYCLE_1_FACTORS_V1";

  let org: { id: string; clerkOrgId: string };
  let user: { id: string; clerkUserId: string };
  let benchmarkPassBuilding: { id: string };
  let benchmarkFailBuilding: { id: string };
  let bepsWarnBuilding: { id: string };

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `Compliance engine law ${scope}`,
        externalUrl: "https://example.com/compliance-engine-law",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const guidanceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "GUIDE",
        name: `Compliance engine guide ${scope}`,
        externalUrl: "https://example.com/compliance-engine-guide",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const benchmarkRulePackage = await prisma.rulePackage.upsert({
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
          rulePackageId: benchmarkRulePackage.id,
          version: "engine-test-v1",
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
              evidenceKind: "VERIFICATION",
              requiredReportingYears: [2025],
              minimumGrossSquareFeet: 25000,
            },
            gfaCorrection: {
              evidenceKind: "GFA_CORRECTION",
            },
          },
        },
      },
      create: {
        rulePackageId: benchmarkRulePackage.id,
        version: "engine-test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "benchmarking/readiness-v1",
        sourceArtifactId: sourceArtifact.id,
        configJson: {
          requirements: {
            propertyIdPattern: "^RPUID-[0-9]{6}$",
            dqcFreshnessDays: 30,
            verification: {
              evidenceKind: "VERIFICATION",
              requiredReportingYears: [2025],
              minimumGrossSquareFeet: 25000,
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
          version: "engine-test-v1",
        },
      },
      update: {
        sourceArtifactId: guidanceArtifact.id,
        status: "ACTIVE",
        factorsJson: {
          benchmarking: {
            dqcFreshnessDays: 30,
            applicabilityBands: [
              {
                ownershipType: "PRIVATE",
                minimumGrossSquareFeet: 25000,
                label: "PRIVATE_25K_PLUS",
                verificationYears: [2025],
                verificationCadenceYears: 6,
                deadlineType: "MAY_1_FOLLOWING_YEAR",
              },
            ],
          },
        },
      },
      create: {
        key: "DC_CURRENT_STANDARDS",
        version: "engine-test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        sourceArtifactId: guidanceArtifact.id,
        factorsJson: {
          benchmarking: {
            dqcFreshnessDays: 30,
            applicabilityBands: [
              {
                ownershipType: "PRIVATE",
                minimumGrossSquareFeet: 25000,
                label: "PRIVATE_25K_PLUS",
                verificationYears: [2025],
                verificationCadenceYears: 6,
                deadlineType: "MAY_1_FOLLOWING_YEAR",
              },
            ],
          },
        },
      },
    });

    const bepsRulePackage = await prisma.rulePackage.upsert({
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
          rulePackageId: bepsRulePackage.id,
          version: "engine-test-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
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
            performanceScoreThreshold: 55,
            prescriptiveAlwaysEligible: true,
            supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
          },
          prescriptive: {
            complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
          },
        },
      },
      create: {
        rulePackageId: bepsRulePackage.id,
        version: "engine-test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "beps/evaluator-v1",
        sourceArtifactId: sourceArtifact.id,
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
            performanceScoreThreshold: 55,
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
          version: "engine-test-v1",
        },
      },
      update: {
        sourceArtifactId: guidanceArtifact.id,
        status: "ACTIVE",
        factorsJson: {
          beps: {
            cycle: {
              filingYear: 2026,
              cycleStartYear: 2021,
              cycleEndYear: 2026,
              baselineYears: [2018, 2019],
              evaluationYears: [2026],
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
              allowedAgreementPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
            },
          },
        },
      },
      create: {
        key: bepsFactorSetKey,
        version: "engine-test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        sourceArtifactId: guidanceArtifact.id,
        factorsJson: {
          beps: {
            cycle: {
              filingYear: 2026,
              cycleStartYear: 2021,
              cycleEndYear: 2026,
              baselineYears: [2018, 2019],
              evaluationYears: [2026],
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
              allowedAgreementPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
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
        rulePackageId: bepsRulePackage.id,
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
        rulePackageId: bepsRulePackage.id,
        factorSetVersionId: cycle1FactorSetVersion.id,
      },
    });

    org = await prisma.organization.create({
      data: {
        clerkOrgId: `org_${scope}`,
        name: `Compliance Engine Org ${scope}`,
        slug: `compliance-engine-${scope}`,
      },
      select: { id: true, clerkOrgId: true },
    });

    user = await prisma.user.create({
      data: {
        clerkUserId: `user_${scope}`,
        email: `engine-${scope}@example.com`,
        name: "Compliance Engine User",
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

    benchmarkPassBuilding = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `Benchmark Pass ${scope}`,
        address: "101 Engine Way NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 30000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        doeeBuildingId: "RPUID-123456",
        espmPropertyId: BigInt(123456),
        espmShareStatus: "LINKED",
        isEnergyStarScoreEligible: true,
        bepsTargetScore: 71,
        maxPenaltyExposure: 250000,
      },
      select: { id: true },
    });

    benchmarkFailBuilding = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `Benchmark Fail ${scope}`,
        address: "102 Engine Way NW, Washington, DC 20001",
        latitude: 38.92,
        longitude: -77.03,
        grossSquareFeet: 30000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        doeeBuildingId: "RPUID-654321",
        espmPropertyId: BigInt(654321),
        espmShareStatus: "LINKED",
        isEnergyStarScoreEligible: true,
        bepsTargetScore: 71,
        maxPenaltyExposure: 250000,
      },
      select: { id: true },
    });

    bepsWarnBuilding = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `BEPS Warn ${scope}`,
        address: "103 Engine Way NW, Washington, DC 20001",
        latitude: 38.93,
        longitude: -77.04,
        grossSquareFeet: 80000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        yearBuilt: 1990,
        bepsTargetScore: 71,
        complianceCycle: "CYCLE_1",
        maxPenaltyExposure: 900000,
      },
      select: { id: true },
    });

    for (const [periodStart, periodEnd] of [
      ["2025-01-01", "2025-01-31"],
      ["2025-02-01", "2025-02-28"],
      ["2025-03-01", "2025-03-31"],
      ["2025-04-01", "2025-04-30"],
      ["2025-05-01", "2025-05-31"],
      ["2025-06-01", "2025-06-30"],
      ["2025-07-01", "2025-07-31"],
      ["2025-08-01", "2025-08-31"],
      ["2025-09-01", "2025-09-30"],
      ["2025-10-01", "2025-10-31"],
      ["2025-11-01", "2025-11-30"],
      ["2025-12-01", "2025-12-31"],
    ] as const) {
      await prisma.energyReading.create({
        data: {
          buildingId: benchmarkPassBuilding.id,
          organizationId: org.id,
          source: "CSV_UPLOAD",
          meterType: "ELECTRIC",
          periodStart: new Date(`${periodStart}T00:00:00.000Z`),
          periodEnd: new Date(`${periodEnd}T00:00:00.000Z`),
          consumption: 100,
          unit: "KWH",
          consumptionKbtu: 341.2,
        },
      });
    }

    await prisma.evidenceArtifact.createMany({
      data: [
        {
          organizationId: org.id,
          buildingId: benchmarkPassBuilding.id,
          artifactType: "PM_REPORT",
          name: `DQC ${scope}`,
          metadata: {
            benchmarking: {
              kind: "DQC_REPORT",
              reportingYear: 2025,
              checkedAt: new Date().toISOString(),
            },
          },
          createdByType: "SYSTEM",
          createdById: "test",
        },
        {
          organizationId: org.id,
          buildingId: benchmarkPassBuilding.id,
          artifactType: "OWNER_ATTESTATION",
          name: `Verification ${scope}`,
          metadata: {
            benchmarking: {
              kind: "VERIFICATION",
              reportingYear: 2025,
            },
          },
          createdByType: "SYSTEM",
          createdById: "test",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.dataIssue.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.filingPacket.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.filingRecordEvent.deleteMany({
      where: {
        filingRecord: {
          organizationId: org?.id,
        },
      },
    });
    await prisma.filingRecord.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.benchmarkSubmission.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.verificationItemResult.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.bepsMetricInput.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.complianceSnapshot.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.complianceRun.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.evidenceArtifact.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.portfolioManagerSyncState.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.energyReading.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.building.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.organizationMembership.deleteMany({
      where: {
        organizationId: org?.id,
      },
    });
    await prisma.user.deleteMany({
      where: {
        clerkUserId: `user_${scope}`,
      },
    });
    await prisma.organization.deleteMany({
      where: {
        clerkOrgId: `org_${scope}`,
      },
    });
    await prisma.sourceArtifact.deleteMany({
      where: {
        metadata: {
          path: ["scope"],
          equals: scope,
        },
      },
    });
  });

  function createCaller(requestId: string) {
    return appRouter.createCaller({
      requestId,
      clerkUserId: user.clerkUserId,
      clerkOrgId: org.clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  it("persists deterministic benchmark compliance runs on QA PASS", async () => {
    const caller = createCaller(`benchmark-pass-${scope}`);
    const evaluated = await caller.benchmarking.evaluateReadiness({
      buildingId: benchmarkPassBuilding.id,
      reportingYear: 2025,
    });

    expect(evaluated.engineResult.rulePackageKey).toBe("DC_BENCHMARKING_2025");
    expect(evaluated.engineResult.factorSetKey).toBe("DC_CURRENT_STANDARDS");
    expect(evaluated.engineResult.qa.verdict).toBe("PASS");
    expect(evaluated.engineResult.status).toBe("COMPUTED");
    expect(evaluated.benchmarkSubmission.status).toBe("READY");

    const complianceRun = await prisma.complianceRun.findUniqueOrThrow({
      where: { id: evaluated.provenance.complianceRun.id },
    });
    const resultPayload = complianceRun.resultPayload as Record<string, unknown>;
    const engineResult = resultPayload["engineResult"] as Record<string, unknown>;
    expect(engineResult["rulePackageKey"]).toBe("DC_BENCHMARKING_2025");
    expect(engineResult["qa"]).toMatchObject({ verdict: "PASS" });

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        buildingId: benchmarkPassBuilding.id,
        requestId: `benchmark-pass-${scope}`,
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(auditActions.map((entry) => entry.action)).toContain(
      "COMPLIANCE_ENGINE_BENCHMARKING_STARTED",
    );
    expect(auditActions.map((entry) => entry.action)).toContain(
      "COMPLIANCE_ENGINE_BENCHMARKING_SUCCEEDED",
    );
  });

  it("returns a blocked deterministic result when benchmarking QA fails", async () => {
    const caller = createCaller(`benchmark-fail-${scope}`);
    const evaluated = await caller.benchmarking.evaluateReadiness({
      buildingId: benchmarkFailBuilding.id,
      reportingYear: 2025,
    });

    expect(evaluated.engineResult.qa.verdict).toBe("FAIL");
    expect(evaluated.engineResult.status).toBe("BLOCKED");
    expect(evaluated.readiness.status).toBe("BLOCKED");
    expect(evaluated.benchmarkSubmission.status).toBe("BLOCKED");
    expect(evaluated.engineResult.reasonCodes).toContain("QA_GATE_FAILED");
  });

  it("proceeds through BEPS on QA WARN and records the centralized engine result", async () => {
    const caller = createCaller(`beps-warn-${scope}`);
    const evaluated = await caller.beps.evaluate({
      buildingId: bepsWarnBuilding.id,
      cycle: "CYCLE_1",
    });

    expect(evaluated.engineResult.rulePackageKey).toBe("DC_BEPS_CYCLE_1");
    expect(evaluated.engineResult.factorSetKey).toBe(bepsFactorSetKey);
    expect(evaluated.engineResult.qa.verdict).toBe("WARN");
    expect(evaluated.engineResult.reasonCodes).toContain("QA_DIRECT_YEAR_READINGS_MISSING");
    expect(evaluated.filingRecord).not.toBeNull();
    expect(evaluated.provenance.complianceRun.runType).toBe("BEPS_EVALUATION");

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        buildingId: bepsWarnBuilding.id,
        requestId: `beps-warn-${scope}`,
      },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(auditActions.map((entry) => entry.action)).toContain(
      "COMPLIANCE_ENGINE_BEPS_STARTED",
    );
    expect(auditActions.map((entry) => entry.action)).toContain(
      "COMPLIANCE_ENGINE_BEPS_SUCCEEDED",
    );
  });
});
