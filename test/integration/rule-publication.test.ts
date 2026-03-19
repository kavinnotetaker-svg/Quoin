import { afterEach, describe, expect, it } from "vitest";
import { appRouter } from "@/server/trpc/routers";
import { prisma } from "@/server/lib/db";
import {
  BOOTSTRAP_FACTOR_SET_KEY,
  BOOTSTRAP_RULE_PACKAGE_KEYS,
  createFactorSetVersion,
  createRuleVersion,
  getActiveFactorSetVersion,
  getActiveRuleVersion,
} from "@/server/compliance/provenance";
import { getBepsFactorSetKeyForCycle } from "@/server/compliance/beps/config";
import { evaluateBenchmarkingComplianceForBuilding } from "@/server/compliance/compliance-engine";

const benchmarkRuleConfig = {
  requirements: {
    propertyIdPattern: "^RP-\\d+$",
    verification: {
      minimumGrossSquareFeet: 100000,
      requiredReportingYears: [2027],
      evidenceKind: "VERIFICATION",
    },
    gfaCorrection: {
      evidenceKind: "GFA_CORRECTION",
    },
  },
};

const brokenBenchmarkRuleConfig = {
  requirements: {
    propertyIdPattern: "^ZZZ$",
    verification: {
      minimumGrossSquareFeet: 0,
      requiredReportingYears: [2025],
      evidenceKind: "VERIFICATION",
    },
    gfaCorrection: {
      evidenceKind: "GFA_CORRECTION",
    },
  },
};

const benchmarkFactorConfig = {
  benchmarking: {
    dqcFreshnessDays: 30,
    applicabilityBands: [
      {
        ownershipType: "PRIVATE",
        minimumGrossSquareFeet: 50000,
        label: "Private benchmarking",
        verificationYears: [2027],
        deadlineType: "MAY_1_FOLLOWING_YEAR",
        manualSubmissionAllowedWhenNotBenchmarkable: false,
      },
    ],
  },
};

const bepsCycle1RuleConfig = {
  cycle: "CYCLE_1",
  filingYear: 2026,
  applicability: {
    minGrossSquareFeetPrivate: 50000,
    minGrossSquareFeetDistrict: 10000,
    ownershipClassFallback: "PRIVATE",
    coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
    recentConstructionExemptionYears: 5,
    cycleStartYear: 2021,
    cycleEndYear: 2026,
  },
  pathwayRouting: {
    performanceScoreThreshold: 100,
    prescriptiveAlwaysEligible: false,
    preferredPathway: "PERFORMANCE",
    supportedPathways: ["PERFORMANCE"],
  },
  performance: {
    requiredReductionFraction: 0.2,
    scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
    nonScoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
  },
  standardTarget: {
    defaultMaxGap: 15,
    scoreEligibleMetric: "ENERGY_STAR_SCORE",
    nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
  },
};

const bepsCycle1FactorConfig = {
  cycle: {
    filingYear: 2026,
    cycleStartYear: 2021,
    cycleEndYear: 2026,
    baselineYears: [2020],
    evaluationYears: [2025],
    baselineBenchmarkYear: 2020,
    complianceDeadline: "2026-12-31",
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
    performanceScoreThreshold: 100,
    prescriptiveAlwaysEligible: false,
    preferredPathway: "PERFORMANCE",
    supportedPathways: ["PERFORMANCE"],
  },
  performance: {
    requiredReductionFraction: 0.2,
    scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
    nonScoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
    defaultBaselineYears: [2020],
    defaultEvaluationYears: [2025],
  },
  standardTarget: {
    defaultMaxGap: 15,
    scoreEligibleMetric: "ENERGY_STAR_SCORE",
    nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
  },
  prescriptive: {
    defaultPointsNeeded: 25,
    pointsNeededByPropertyType: {
      OFFICE: 25,
    },
    complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
  },
  trajectory: {
    metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
    targetYears: [2026],
    finalTargetYear: 2026,
  },
  standardsTable: [
    {
      cycle: "CYCLE_1",
      pathway: "STANDARD_TARGET",
      propertyType: "OFFICE",
      metricType: "ENERGY_STAR_SCORE",
      targetValue: 71,
      maxGap: 15,
    },
    {
      cycle: "CYCLE_1",
      pathway: "TRAJECTORY",
      propertyType: "OFFICE",
      metricType: "ADJUSTED_SITE_EUI_AVERAGE",
      year: 2026,
      targetValue: 80,
    },
  ],
  alternativeCompliance: {
    penaltyPerSquareFoot: 10,
    maxPenaltyCap: 7500000,
    agreementRequired: false,
    allowedAgreementPathways: ["PERFORMANCE"],
  },
};

const bepsCycle2RuleConfig = {
  cycle: "CYCLE_2",
  filingYear: 2031,
  applicability: {
    minGrossSquareFeetPrivate: 50000,
    minGrossSquareFeetDistrict: 10000,
    ownershipClassFallback: "PRIVATE",
    coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
    recentConstructionExemptionYears: 5,
    cycleStartYear: 2027,
    cycleEndYear: 2031,
  },
  pathwayRouting: {
    performanceScoreThreshold: 100,
    prescriptiveAlwaysEligible: false,
    preferredPathway: "PERFORMANCE",
    supportedPathways: ["PERFORMANCE"],
  },
  performance: {
    requiredReductionFraction: 0.2,
    scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
    nonScoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
  },
  standardTarget: {
    defaultMaxGap: 12,
    scoreEligibleMetric: "ENERGY_STAR_SCORE",
    nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
  },
};

const bepsCycle2FactorConfig = {
  cycle: {
    filingYear: 2031,
    cycleStartYear: 2027,
    cycleEndYear: 2031,
    baselineYears: [2026],
    evaluationYears: [2030],
    baselineBenchmarkYear: 2026,
    complianceDeadline: "2031-12-31",
  },
  applicability: {
    minGrossSquareFeetPrivate: 50000,
    minGrossSquareFeetDistrict: 10000,
    ownershipClassFallback: "PRIVATE",
    coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
    recentConstructionExemptionYears: 5,
    cycleStartYear: 2027,
    cycleEndYear: 2031,
    filingYear: 2031,
  },
  pathwayRouting: {
    performanceScoreThreshold: 100,
    prescriptiveAlwaysEligible: false,
    preferredPathway: "PERFORMANCE",
    supportedPathways: ["PERFORMANCE"],
  },
  performance: {
    requiredReductionFraction: 0.2,
    scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
    nonScoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
    defaultBaselineYears: [2026],
    defaultEvaluationYears: [2030],
  },
  standardTarget: {
    defaultMaxGap: 12,
    scoreEligibleMetric: "ENERGY_STAR_SCORE",
    nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
  },
  prescriptive: {
    defaultPointsNeeded: 30,
    pointsNeededByPropertyType: {
      OFFICE: 30,
    },
    complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
  },
  trajectory: {
    metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
    targetYears: [2031],
    finalTargetYear: 2031,
  },
  standardsTable: [
    {
      cycle: "CYCLE_2",
      pathway: "STANDARD_TARGET",
      propertyType: "OFFICE",
      metricType: "ENERGY_STAR_SCORE",
      targetValue: 74,
      maxGap: 12,
    },
    {
      cycle: "CYCLE_2",
      pathway: "TRAJECTORY",
      propertyType: "OFFICE",
      metricType: "ADJUSTED_SITE_EUI_AVERAGE",
      year: 2031,
      targetValue: 85,
    },
  ],
  alternativeCompliance: {
    penaltyPerSquareFoot: 10,
    maxPenaltyCap: 7500000,
    agreementRequired: false,
    allowedAgreementPathways: ["PERFORMANCE"],
  },
};

function createCaller(
  clerkUserId: string,
  clerkOrgId: string,
  requestId: string,
  clerkOrgRole = "org:admin",
) {
  return appRouter.createCaller({
    clerkUserId,
    clerkOrgId,
    clerkOrgRole,
    requestId,
    prisma,
  });
}

async function seedPublicationState(scope: string) {
  const org = await prisma.organization.create({
    data: {
      name: `Rule Publication Org ${scope}`,
      slug: `rule-publication-org-${scope}`,
      clerkOrgId: `clerk_rule_publication_org_${scope}`,
      tier: "ENTERPRISE",
    },
  });

  const user = await prisma.user.create({
    data: {
      clerkUserId: `clerk_rule_publication_user_${scope}`,
      email: `rule-publication-${scope}@example.com`,
      name: "Rule Publication User",
    },
  });

  await prisma.organizationMembership.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "ADMIN",
    },
  });

  const building = await prisma.building.create({
    data: {
      organizationId: org.id,
      name: `Rule Publication Building ${scope}`,
      address: "100 Test Plaza NW, Washington, DC 20001",
      latitude: 38.9,
      longitude: -77.04,
      grossSquareFeet: 90000,
      propertyType: "OFFICE",
      ownershipType: "PRIVATE",
      bepsTargetScore: 71,
      doeeBuildingId: "RP-100",
      espmPropertyId: BigInt(1001),
      espmShareStatus: "LINKED",
      maxPenaltyExposure: 1200000,
      complianceCycle: "CYCLE_1",
    },
  });

  await prisma.energyReading.createMany({
    data: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
    ].map(([monthStart, monthEnd], index) => ({
      organizationId: org.id,
      buildingId: building.id,
      source: "CSV_UPLOAD",
      meterType: "ELECTRIC",
      periodStart: new Date(Date.UTC(2025, monthStart, 1)),
      periodEnd: new Date(Date.UTC(2025, monthEnd, 0)),
      consumption: 1000 + index,
      unit: "KWH",
      consumptionKbtu: 3412 + index,
      isVerified: true,
    })),
  });

  await prisma.evidenceArtifact.create({
    data: {
      organizationId: org.id,
      buildingId: building.id,
      artifactType: "OTHER",
      name: "DQC report",
      artifactRef: "dqc-report",
      metadata: {
        benchmarking: {
          kind: "DQC_REPORT",
          reportingYear: 2025,
          checkedAt: "2026-01-05T00:00:00.000Z",
        },
      },
      createdByType: "SYSTEM",
      createdById: "seed",
    },
  });

  const benchmarkRulePackage = await prisma.rulePackage.upsert({
    where: { key: BOOTSTRAP_RULE_PACKAGE_KEYS.benchmarking2025 },
    update: {},
    create: {
      key: BOOTSTRAP_RULE_PACKAGE_KEYS.benchmarking2025,
      name: "DC Benchmarking 2025",
    },
  });
  const bepsCycle1RulePackage = await prisma.rulePackage.upsert({
    where: { key: BOOTSTRAP_RULE_PACKAGE_KEYS.bepsCycle1 },
    update: {},
    create: {
      key: BOOTSTRAP_RULE_PACKAGE_KEYS.bepsCycle1,
      name: "DC BEPS Cycle 1",
    },
  });
  const bepsCycle2RulePackage = await prisma.rulePackage.upsert({
    where: { key: BOOTSTRAP_RULE_PACKAGE_KEYS.bepsCycle2 },
    update: {},
    create: {
      key: BOOTSTRAP_RULE_PACKAGE_KEYS.bepsCycle2,
      name: "DC BEPS Cycle 2",
    },
  });

  const activeBenchmarkRule = await createRuleVersion({
    rulePackageId: benchmarkRulePackage.id,
    version: `active-${scope}`,
    status: "ACTIVE",
    effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
    implementationKey: "tests/benchmarking-active",
    configJson: benchmarkRuleConfig,
  });
  const activeCycle1Rule = await createRuleVersion({
    rulePackageId: bepsCycle1RulePackage.id,
    version: `active-${scope}`,
    status: "ACTIVE",
    effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
    implementationKey: "tests/beps-cycle1-active",
    configJson: bepsCycle1RuleConfig,
  });
  const activeCycle2Rule = await createRuleVersion({
    rulePackageId: bepsCycle2RulePackage.id,
    version: `active-${scope}`,
    status: "ACTIVE",
    effectiveFrom: new Date("2030-01-01T00:00:00.000Z"),
    implementationKey: "tests/beps-cycle2-active",
    configJson: bepsCycle2RuleConfig,
  });

  const activeBenchmarkFactor = await createFactorSetVersion({
    key: BOOTSTRAP_FACTOR_SET_KEY,
    version: `active-${scope}`,
    status: "ACTIVE",
    effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
    factorsJson: benchmarkFactorConfig,
  });

  const activeCycle1Factor = await createFactorSetVersion({
    key: getBepsFactorSetKeyForCycle("CYCLE_1"),
    version: `active-${scope}`,
    status: "ACTIVE",
    effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
    factorsJson: bepsCycle1FactorConfig,
  });

  const activeCycle2Factor = await createFactorSetVersion({
    key: getBepsFactorSetKeyForCycle("CYCLE_2"),
    version: `active-${scope}`,
    status: "ACTIVE",
    effectiveFrom: new Date("2030-01-01T00:00:00.000Z"),
    factorsJson: bepsCycle2FactorConfig,
  });

  await prisma.bepsCycleRegistry.upsert({
    where: { complianceCycle: "CYCLE_1" },
    update: {
      rulePackageId: bepsCycle1RulePackage.id,
      factorSetVersionId: activeCycle1Factor.id,
      cycleStartYear: 2021,
      cycleEndYear: 2026,
      baselineYearStart: 2020,
      baselineYearEnd: 2020,
      evaluationYear: 2025,
    },
    create: {
      cycleId: "dc-beps-cycle-1",
      complianceCycle: "CYCLE_1",
      cycleStartYear: 2021,
      cycleEndYear: 2026,
      baselineYearStart: 2020,
      baselineYearEnd: 2020,
      evaluationYear: 2025,
      rulePackageId: bepsCycle1RulePackage.id,
      factorSetVersionId: activeCycle1Factor.id,
    },
  });

  await prisma.bepsCycleRegistry.upsert({
    where: { complianceCycle: "CYCLE_2" },
    update: {
      rulePackageId: bepsCycle2RulePackage.id,
      factorSetVersionId: activeCycle2Factor.id,
      cycleStartYear: 2027,
      cycleEndYear: 2031,
      baselineYearStart: 2026,
      baselineYearEnd: 2026,
      evaluationYear: 2030,
    },
    create: {
      cycleId: "dc-beps-cycle-2",
      complianceCycle: "CYCLE_2",
      cycleStartYear: 2027,
      cycleEndYear: 2031,
      baselineYearStart: 2026,
      baselineYearEnd: 2026,
      evaluationYear: 2030,
      rulePackageId: bepsCycle2RulePackage.id,
      factorSetVersionId: activeCycle2Factor.id,
    },
  });

  const passingRuleDraft = await createRuleVersion({
    rulePackageId: benchmarkRulePackage.id,
    version: `candidate-pass-${scope}`,
    status: "DRAFT",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    implementationKey: "tests/benchmarking-candidate-pass",
    configJson: benchmarkRuleConfig,
  });

  const failingRuleDraft = await createRuleVersion({
    rulePackageId: benchmarkRulePackage.id,
    version: `candidate-fail-${scope}`,
    status: "DRAFT",
    effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
    implementationKey: "tests/benchmarking-candidate-fail",
    configJson: brokenBenchmarkRuleConfig,
  });

  const factorDraft = await createFactorSetVersion({
    key: getBepsFactorSetKeyForCycle("CYCLE_1"),
    version: `candidate-${scope}`,
    status: "DRAFT",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    factorsJson: bepsCycle1FactorConfig,
  });

  return {
    org,
    user,
    building,
    activeBenchmarkRule,
    activeCycle1Rule,
    activeCycle2Rule,
    activeBenchmarkFactor,
    activeCycle1Factor,
    activeCycle2Factor,
    passingRuleDraft,
    failingRuleDraft,
    factorDraft,
  };
}

afterEach(async () => {
  const buildings = await prisma.building.findMany({
    where: {
      name: {
        startsWith: "Rule Publication Building",
      },
    },
    select: { id: true, organizationId: true },
  });
  const buildingIds = buildings.map((building) => building.id);
  const organizationIds = Array.from(new Set(buildings.map((building) => building.organizationId)));

  await prisma.governedPublicationRun.deleteMany();
  await prisma.auditLog.deleteMany({
    where: {
      action: {
        in: [
          "RULE_VERSION_PROMOTED_TO_CANDIDATE",
          "FACTOR_SET_VERSION_PROMOTED_TO_CANDIDATE",
          "GOVERNED_PUBLICATION_VALIDATION_PASSED",
          "GOVERNED_PUBLICATION_VALIDATION_FAILED",
          "GOVERNED_PUBLICATION_PUBLISHED",
        ],
      },
    },
  });
  await prisma.bepsCycleRegistry.deleteMany({
    where: {
      complianceCycle: {
        in: ["CYCLE_1", "CYCLE_2"],
      },
    },
  });
  if (buildingIds.length > 0) {
    await prisma.evidenceArtifact.deleteMany({
      where: {
        buildingId: {
          in: buildingIds,
        },
      },
    });
    await prisma.energyReading.deleteMany({
      where: {
        buildingId: {
          in: buildingIds,
        },
      },
    });
    await prisma.calculationManifest.deleteMany({
      where: {
        complianceRun: {
          buildingId: {
            in: buildingIds,
          },
        },
      },
    });
    await prisma.complianceSnapshot.deleteMany({
      where: {
        buildingId: {
          in: buildingIds,
        },
      },
    });
    await prisma.complianceRun.deleteMany({
      where: {
        buildingId: {
          in: buildingIds,
        },
      },
    });
  }
  await prisma.ruleVersion.deleteMany({
    where: {
      implementationKey: {
        startsWith: "tests/",
      },
    },
  });
  await prisma.factorSetVersion.deleteMany({
    where: {
      key: {
        in: [
          BOOTSTRAP_FACTOR_SET_KEY,
          getBepsFactorSetKeyForCycle("CYCLE_1"),
          getBepsFactorSetKeyForCycle("CYCLE_2"),
        ],
      },
      version: {
        startsWith: "active-",
      },
    },
  });
  await prisma.factorSetVersion.deleteMany({
    where: {
      key: {
        in: [
          BOOTSTRAP_FACTOR_SET_KEY,
          getBepsFactorSetKeyForCycle("CYCLE_1"),
          getBepsFactorSetKeyForCycle("CYCLE_2"),
        ],
      },
      version: {
        startsWith: "candidate-",
      },
    },
  });
  await prisma.building.deleteMany({
    where: {
      id: {
        in: buildingIds,
      },
    },
  });
  await prisma.organizationMembership.deleteMany({
    where: {
      organizationId: {
        in: organizationIds,
      },
    },
  });
  await prisma.organization.deleteMany({
    where: {
      id: {
        in: organizationIds,
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      clerkUserId: {
        startsWith: "clerk_rule_publication_user_",
      },
    },
  });
  await prisma.organization.deleteMany({
    where: {
      slug: {
        startsWith: "rule-publication-org-",
      },
    },
  });
  await prisma.organizationMembership.deleteMany({
    where: {
      organization: {
        slug: {
          startsWith: "rule-publication-org-",
        },
      },
    },
  });
});

describe("governed rule publication", () => {
  it("keeps candidate rule versions out of live calculations until published", async () => {
    const scope = `rule-pass-${Date.now()}`;
    const seeded = await seedPublicationState(scope);
    const caller = createCaller(
      seeded.user.clerkUserId,
      seeded.org.clerkOrgId,
      `rule-pass-${scope}`,
    );

    const overview = await caller.report.publicationOverview();
    const benchmarkTarget = overview.targets.find(
      (target) => target.targetKey === BOOTSTRAP_RULE_PACKAGE_KEYS.benchmarking2025,
    );
    expect(benchmarkTarget?.activeVersion?.id).toBe(seeded.activeBenchmarkRule.id);
    expect(benchmarkTarget?.latestDraftVersion?.id).toBe(seeded.failingRuleDraft.id);

    await caller.report.promoteRuleCandidate({
      ruleVersionId: seeded.passingRuleDraft.id,
    });

    const promotedOverview = await caller.report.publicationOverview();
    const promotedTarget = promotedOverview.targets.find(
      (target) => target.targetKey === BOOTSTRAP_RULE_PACKAGE_KEYS.benchmarking2025,
    );
    expect(promotedTarget?.candidateVersion?.id).toBe(seeded.passingRuleDraft.id);

    const beforePublish = await evaluateBenchmarkingComplianceForBuilding({
      organizationId: seeded.org.id,
      buildingId: seeded.building.id,
      reportingYear: 2025,
      producedByType: "USER",
      producedById: seeded.user.clerkUserId,
      requestId: `engine-before-${scope}`,
    });
    expect(beforePublish.ruleVersion.id).toBe(seeded.activeBenchmarkRule.id);

    const validation = await caller.report.validateRuleCandidate({
      ruleVersionId: seeded.passingRuleDraft.id,
    });
    expect(validation.summary.status).toBe("PASSED");
    expect(validation.summary.failedCases).toBe(0);

    await caller.report.publishGovernedCandidate({
      runId: validation.run.id,
    });

    const activeRule = await getActiveRuleVersion(
      BOOTSTRAP_RULE_PACKAGE_KEYS.benchmarking2025,
    );
    expect(activeRule.id).toBe(seeded.passingRuleDraft.id);

    const afterPublish = await evaluateBenchmarkingComplianceForBuilding({
      organizationId: seeded.org.id,
      buildingId: seeded.building.id,
      reportingYear: 2025,
      producedByType: "USER",
      producedById: seeded.user.clerkUserId,
      requestId: `engine-after-${scope}`,
    });
    expect(afterPublish.ruleVersion.id).toBe(seeded.passingRuleDraft.id);

    const auditActions = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "RULE_VERSION_PROMOTED_TO_CANDIDATE",
            "GOVERNED_PUBLICATION_VALIDATION_PASSED",
            "GOVERNED_PUBLICATION_PUBLISHED",
          ],
        },
      },
      orderBy: { timestamp: "asc" },
      select: { action: true },
    });
    expect(auditActions.map((item) => item.action)).toEqual([
      "RULE_VERSION_PROMOTED_TO_CANDIDATE",
      "GOVERNED_PUBLICATION_VALIDATION_PASSED",
      "GOVERNED_PUBLICATION_PUBLISHED",
    ]);
  });

  it("blocks publication when regression expectations fail", async () => {
    const scope = `rule-fail-${Date.now()}`;
    const seeded = await seedPublicationState(scope);
    const caller = createCaller(
      seeded.user.clerkUserId,
      seeded.org.clerkOrgId,
      `rule-fail-${scope}`,
    );

    await caller.report.promoteRuleCandidate({
      ruleVersionId: seeded.failingRuleDraft.id,
    });

    const validation = await caller.report.validateRuleCandidate({
      ruleVersionId: seeded.failingRuleDraft.id,
    });
    expect(validation.summary.status).toBe("FAILED");
    expect(validation.summary.failedCases).toBeGreaterThan(0);

    await expect(
      caller.report.publishGovernedCandidate({
        runId: validation.run.id,
      }),
    ).rejects.toThrow();

    const activeRule = await getActiveRuleVersion(
      BOOTSTRAP_RULE_PACKAGE_KEYS.benchmarking2025,
    );
    expect(activeRule.id).toBe(seeded.activeBenchmarkRule.id);
  });

  it("publishes factor candidates only after passing shared regression coverage and updates BEPS registries", async () => {
    const scope = `factor-pass-${Date.now()}`;
    const seeded = await seedPublicationState(scope);
    const caller = createCaller(
      seeded.user.clerkUserId,
      seeded.org.clerkOrgId,
      `factor-pass-${scope}`,
    );

    await caller.report.promoteFactorCandidate({
      factorSetVersionId: seeded.factorDraft.id,
    });

    const validation = await caller.report.validateFactorCandidate({
      factorSetVersionId: seeded.factorDraft.id,
    });
    expect(validation.summary.status).toBe("PASSED");
    expect(validation.summary.impactedScopes.map((scopeItem) => scopeItem.scopeKey)).toEqual([
      "BEPS_CYCLE_1",
    ]);

    await caller.report.publishGovernedCandidate({
      runId: validation.run.id,
    });

    const activeFactor = await getActiveFactorSetVersion(
      getBepsFactorSetKeyForCycle("CYCLE_1"),
    );
    expect(activeFactor.id).toBe(seeded.factorDraft.id);

    const registries = await prisma.bepsCycleRegistry.findMany({
      where: {
        complianceCycle: {
          in: ["CYCLE_1", "CYCLE_2"],
        },
      },
      orderBy: { complianceCycle: "asc" },
      select: {
        complianceCycle: true,
        factorSetVersionId: true,
      },
    });
    expect(registries).toEqual([
      {
        complianceCycle: "CYCLE_1",
        factorSetVersionId: seeded.factorDraft.id,
      },
      {
        complianceCycle: "CYCLE_2",
        factorSetVersionId: seeded.activeCycle2Factor.id,
      },
    ]);
  });

  it("blocks governed publication mutations for non-operator roles", async () => {
    const scope = `rule-viewer-${Date.now()}`;
    const seeded = await seedPublicationState(scope);
    const viewerCaller = createCaller(
      seeded.user.clerkUserId,
      seeded.org.clerkOrgId,
      `rule-viewer-${scope}`,
      "org:viewer",
    );

    await expect(
      viewerCaller.report.promoteRuleCandidate({
        ruleVersionId: seeded.passingRuleDraft.id,
      }),
    ).rejects.toThrow("Operator access is required");
  });
});
