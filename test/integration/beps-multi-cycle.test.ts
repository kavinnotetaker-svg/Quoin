import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("BEPS multi-cycle engine", () => {
  const scope = `${Date.now()}`;

  let org: { id: string; clerkOrgId: string };
  let user: { id: string; clerkUserId: string };
  let building: { id: string };

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "GUIDE",
        name: `BEPS multi-cycle source ${scope}`,
        externalUrl: "https://example.com/beps-multi-cycle",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const cycle2RulePackage = await prisma.rulePackage.upsert({
      where: { key: "DC_BEPS_CYCLE_2" },
      update: {
        name: "DC BEPS Cycle 2",
      },
      create: {
        key: "DC_BEPS_CYCLE_2",
        name: "DC BEPS Cycle 2",
      },
    });

    await prisma.ruleVersion.upsert({
      where: {
        rulePackageId_version: {
          rulePackageId: cycle2RulePackage.id,
          version: "test-cycle-2-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        implementationKey: "beps/evaluator-v2",
        configJson: {
          cycle: "CYCLE_2",
          filingYear: 2028,
          pathwayRouting: {
            preferredPathway: "TRAJECTORY",
            supportedPathways: ["TRAJECTORY"],
            prescriptiveAlwaysEligible: false,
          },
          trajectory: {
            metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
            targetYears: [2028],
            finalTargetYear: 2028,
          },
        },
      },
      create: {
        rulePackageId: cycle2RulePackage.id,
        sourceArtifactId: sourceArtifact.id,
        version: "test-cycle-2-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2028-01-01T00:00:00.000Z"),
        implementationKey: "beps/evaluator-v2",
        configJson: {
          cycle: "CYCLE_2",
          filingYear: 2028,
          pathwayRouting: {
            preferredPathway: "TRAJECTORY",
            supportedPathways: ["TRAJECTORY"],
            prescriptiveAlwaysEligible: false,
          },
          trajectory: {
            metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
            targetYears: [2028],
            finalTargetYear: 2028,
          },
        },
      },
    });

    const cycle2FactorSetVersion = await prisma.factorSetVersion.upsert({
      where: {
        key_version: {
          key: "DC_BEPS_CYCLE_2_FACTORS_V1",
          version: "test-cycle-2-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        factorsJson: {
          beps: {
            cycle: {
              filingYear: 2028,
              cycleStartYear: 2028,
              cycleEndYear: 2032,
              baselineYears: [2024, 2025],
              evaluationYears: [2028],
            },
            applicability: {
              minGrossSquareFeetPrivate: 25000,
              minGrossSquareFeetDistrict: 10000,
              ownershipClassFallback: "PRIVATE",
              coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
              recentConstructionExemptionYears: 5,
              cycleStartYear: 2028,
              cycleEndYear: 2032,
              filingYear: 2028,
            },
            pathwayRouting: {
              performanceScoreThreshold: 60,
              preferredPathway: "TRAJECTORY",
              prescriptiveAlwaysEligible: false,
              supportedPathways: ["TRAJECTORY"],
            },
            performance: {
              requiredReductionFraction: 0.25,
              scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
              defaultBaselineYears: [2024, 2025],
              defaultEvaluationYears: [2028],
            },
            standardTarget: {
              defaultMaxGap: 12,
              scoreEligibleMetric: "ENERGY_STAR_SCORE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
            },
            prescriptive: {
              defaultPointsNeeded: 30,
              complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
            },
            trajectory: {
              metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
              targetYears: [2028],
              finalTargetYear: 2028,
            },
            standardsTable: [
              {
                cycle: "CYCLE_2",
                pathway: "TRAJECTORY",
                propertyType: "OFFICE",
                metricType: "ADJUSTED_SITE_EUI_AVERAGE",
                year: 2028,
                targetValue: 85,
              },
              {
                cycle: "CYCLE_2",
                pathway: "STANDARD_TARGET",
                propertyType: "OFFICE",
                metricType: "ENERGY_STAR_SCORE",
                targetValue: 74,
                maxGap: 12,
              },
            ],
            alternativeCompliance: {
              penaltyPerSquareFoot: 12,
              maxPenaltyCap: 9000000,
              agreementRequired: false,
              allowedAgreementPathways: ["TRAJECTORY"],
            },
          },
        },
      },
      create: {
        key: "DC_BEPS_CYCLE_2_FACTORS_V1",
        sourceArtifactId: sourceArtifact.id,
        version: "test-cycle-2-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2028-01-01T00:00:00.000Z"),
        factorsJson: {
          beps: {
            cycle: {
              filingYear: 2028,
              cycleStartYear: 2028,
              cycleEndYear: 2032,
              baselineYears: [2024, 2025],
              evaluationYears: [2028],
            },
            applicability: {
              minGrossSquareFeetPrivate: 25000,
              minGrossSquareFeetDistrict: 10000,
              ownershipClassFallback: "PRIVATE",
              coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
              recentConstructionExemptionYears: 5,
              cycleStartYear: 2028,
              cycleEndYear: 2032,
              filingYear: 2028,
            },
            pathwayRouting: {
              performanceScoreThreshold: 60,
              preferredPathway: "TRAJECTORY",
              prescriptiveAlwaysEligible: false,
              supportedPathways: ["TRAJECTORY"],
            },
            performance: {
              requiredReductionFraction: 0.25,
              scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
              defaultBaselineYears: [2024, 2025],
              defaultEvaluationYears: [2028],
            },
            standardTarget: {
              defaultMaxGap: 12,
              scoreEligibleMetric: "ENERGY_STAR_SCORE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
            },
            prescriptive: {
              defaultPointsNeeded: 30,
              complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
            },
            trajectory: {
              metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
              targetYears: [2028],
              finalTargetYear: 2028,
            },
            standardsTable: [
              {
                cycle: "CYCLE_2",
                pathway: "TRAJECTORY",
                propertyType: "OFFICE",
                metricType: "ADJUSTED_SITE_EUI_AVERAGE",
                year: 2028,
                targetValue: 85,
              },
              {
                cycle: "CYCLE_2",
                pathway: "STANDARD_TARGET",
                propertyType: "OFFICE",
                metricType: "ENERGY_STAR_SCORE",
                targetValue: 74,
                maxGap: 12,
              },
            ],
            alternativeCompliance: {
              penaltyPerSquareFoot: 12,
              maxPenaltyCap: 9000000,
              agreementRequired: false,
              allowedAgreementPathways: ["TRAJECTORY"],
            },
          },
        },
      },
    });

    await prisma.bepsCycleRegistry.upsert({
      where: {
        complianceCycle: "CYCLE_2",
      },
    update: {
      cycleId: "BEPS_CYCLE_2",
      cycleStartYear: 2028,
      cycleEndYear: 2032,
      baselineYearStart: 2024,
      baselineYearEnd: 2025,
        evaluationYear: 2028,
        rulePackageId: cycle2RulePackage.id,
        factorSetVersionId: cycle2FactorSetVersion.id,
      },
      create: {
      cycleId: "BEPS_CYCLE_2",
      complianceCycle: "CYCLE_2",
      cycleStartYear: 2028,
      cycleEndYear: 2032,
      baselineYearStart: 2024,
      baselineYearEnd: 2025,
        evaluationYear: 2028,
        rulePackageId: cycle2RulePackage.id,
        factorSetVersionId: cycle2FactorSetVersion.id,
      },
    });

    org = await prisma.organization.create({
      data: {
        name: `BEPS Multi-Cycle Org ${scope}`,
        slug: `beps-multi-cycle-org-${scope}`,
        clerkOrgId: `clerk_beps_multi_cycle_org_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    user = await prisma.user.create({
      data: {
        clerkUserId: `clerk_beps_multi_cycle_user_${scope}`,
        email: `beps_multi_cycle_${scope}@test.com`,
        name: "BEPS Multi-Cycle User",
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
        name: `BEPS Cycle 2 Building ${scope}`,
        address: "905 Test St NW, Washington, DC 20001",
        latitude: 38.95,
        longitude: -77.08,
        grossSquareFeet: 150000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        yearBuilt: 1990,
        bepsTargetScore: 74,
        complianceCycle: "CYCLE_2",
        maxPenaltyExposure: 1800000,
      },
      select: { id: true },
    });

    await prisma.complianceSnapshot.createMany({
      data: [
        {
          buildingId: building.id,
          organizationId: org.id,
          triggerType: "MANUAL",
          snapshotDate: new Date("2024-06-30T00:00:00.000Z"),
          energyStarScore: 60,
          siteEui: 105,
          sourceEui: 190,
          weatherNormalizedSiteEui: 102,
          weatherNormalizedSourceEui: 185,
          complianceStatus: "AT_RISK",
        },
        {
          buildingId: building.id,
          organizationId: org.id,
          triggerType: "MANUAL",
          snapshotDate: new Date("2025-06-30T00:00:00.000Z"),
          energyStarScore: 62,
          siteEui: 95,
          sourceEui: 180,
          weatherNormalizedSiteEui: 93,
          weatherNormalizedSourceEui: 175,
          complianceStatus: "AT_RISK",
        },
        {
          buildingId: building.id,
          organizationId: org.id,
          triggerType: "MANUAL",
          snapshotDate: new Date("2027-06-30T00:00:00.000Z"),
          energyStarScore: 70,
          siteEui: 94,
          sourceEui: 165,
          weatherNormalizedSiteEui: 92,
          weatherNormalizedSourceEui: 160,
          complianceStatus: "AT_RISK",
        },
        {
          buildingId: building.id,
          organizationId: org.id,
          triggerType: "MANUAL",
          snapshotDate: new Date("2028-06-30T00:00:00.000Z"),
          energyStarScore: 76,
          siteEui: 84,
          sourceEui: 150,
          weatherNormalizedSiteEui: 82,
          weatherNormalizedSourceEui: 145,
          complianceStatus: "COMPLIANT",
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const complianceRuns = await tx.complianceRun.findMany({
          where: { buildingId: building.id, organizationId: org.id },
          select: { id: true },
        });
        const complianceRunIds = complianceRuns.map((run) => run.id);

        await tx.filingPacket.deleteMany({
          where: { buildingId: building.id, organizationId: org.id },
        });
        await tx.filingRecordEvent.deleteMany({
          where: { buildingId: building.id, organizationId: org.id },
        });
        await tx.evidenceArtifact.deleteMany({
          where: {
            organizationId: org.id,
            OR: [
              { buildingId: building.id },
              ...(complianceRunIds.length > 0
                ? [{ complianceRunId: { in: complianceRunIds } }]
                : []),
            ],
          },
        });
        await tx.filingRecord.deleteMany({
          where: { buildingId: building.id, organizationId: org.id },
        });
        await tx.calculationManifest.deleteMany({
          where: {
            ...(complianceRunIds.length > 0
              ? { complianceRunId: { in: complianceRunIds } }
              : {}),
          },
        });
        await tx.complianceRun.deleteMany({
          where: { buildingId: building.id, organizationId: org.id },
        });
        await tx.bepsMetricInput.deleteMany({
          where: { buildingId: building.id, organizationId: org.id },
        });
        await tx.complianceSnapshot.deleteMany({
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
        await tx.sourceArtifact.deleteMany({
          where: { name: { contains: scope } },
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

  function requirePresent<T>(value: T | null) {
    expect(value).not.toBeNull();
    return value as T;
  }

  it("evaluates cycle 2 using the registry-backed trajectory pathway", async () => {
    const caller = createCaller();

    const result = await caller.beps.evaluate({
      buildingId: building.id,
      cycle: "CYCLE_2",
    });
    const evaluation = requirePresent(result.evaluation);
    const filingRecord = requirePresent(result.filingRecord);

    expect(evaluation.selectedPathway).toBe("TRAJECTORY");
    expect(evaluation.pathwayResults.trajectory?.evaluationStatus).toBe("COMPLIANT");
    expect(evaluation.governance?.cycleId).toBe("BEPS_CYCLE_2");
    expect(result.factorSetVersion.key).toBe("DC_BEPS_CYCLE_2_FACTORS_V1");
    expect(filingRecord.complianceCycle).toBe("CYCLE_2");
  });

  it("still evaluates cycle 2 when the building default cycle remains cycle 1", async () => {
    const caller = createCaller();

    await prisma.building.update({
      where: { id: building.id },
      data: {
        complianceCycle: "CYCLE_1",
      },
    });

    const result = await caller.beps.evaluate({
      buildingId: building.id,
      cycle: "CYCLE_2",
    });
    const evaluation = requirePresent(result.evaluation);
    const filingRecord = requirePresent(result.filingRecord);

    expect(evaluation.selectedPathway).toBe("TRAJECTORY");
    expect(evaluation.pathwayResults.trajectory?.evaluationStatus).toBe("COMPLIANT");
    expect(filingRecord.complianceCycle).toBe("CYCLE_2");
  });

  it("applies cycle 2 to private buildings starting at 25k square feet through the router", async () => {
    const caller = createCaller();

    const smallerBuilding = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `BEPS Cycle 2 30k Building ${scope}`,
        address: "906 Test St NW, Washington, DC 20001",
        latitude: 38.951,
        longitude: -77.081,
        grossSquareFeet: 30000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        yearBuilt: 1992,
        bepsTargetScore: 74,
        complianceCycle: "CYCLE_2",
        maxPenaltyExposure: 360000,
      },
      select: { id: true },
    });

    try {
      await prisma.complianceSnapshot.createMany({
        data: [
          {
            buildingId: smallerBuilding.id,
            organizationId: org.id,
            triggerType: "MANUAL",
            snapshotDate: new Date("2024-06-30T00:00:00.000Z"),
            energyStarScore: 60,
            siteEui: 105,
            sourceEui: 190,
            weatherNormalizedSiteEui: 102,
            weatherNormalizedSourceEui: 185,
            complianceStatus: "AT_RISK",
          },
          {
            buildingId: smallerBuilding.id,
            organizationId: org.id,
            triggerType: "MANUAL",
            snapshotDate: new Date("2025-06-30T00:00:00.000Z"),
            energyStarScore: 62,
            siteEui: 95,
            sourceEui: 180,
            weatherNormalizedSiteEui: 93,
            weatherNormalizedSourceEui: 175,
            complianceStatus: "AT_RISK",
          },
          {
            buildingId: smallerBuilding.id,
            organizationId: org.id,
            triggerType: "MANUAL",
            snapshotDate: new Date("2028-06-30T00:00:00.000Z"),
            energyStarScore: 76,
            siteEui: 84,
            sourceEui: 150,
            weatherNormalizedSiteEui: 82,
            weatherNormalizedSourceEui: 145,
            complianceStatus: "COMPLIANT",
          },
        ],
      });

      const result = await caller.beps.evaluate({
        buildingId: smallerBuilding.id,
        cycle: "CYCLE_2",
      });
      const evaluation = requirePresent(result.evaluation);

      expect(evaluation.applicability.applicable).toBe(true);
      expect(evaluation.governedConfig.applicability.minGrossSquareFeetPrivate).toBe(25000);
      expect(evaluation.governedConfig.applicability.cycleStartYear).toBe(2028);
      expect(evaluation.governedConfig.trajectory.targetYears).toEqual([2028]);
    } finally {
      const smallerRunIds = (
        await prisma.complianceRun.findMany({
          where: { buildingId: smallerBuilding.id, organizationId: org.id },
          select: { id: true },
        })
      ).map((run) => run.id);

      await prisma.filingPacket.deleteMany({
        where: { buildingId: smallerBuilding.id, organizationId: org.id },
      });
      await prisma.filingRecordEvent.deleteMany({
        where: { buildingId: smallerBuilding.id, organizationId: org.id },
      });
      await prisma.evidenceArtifact.deleteMany({
        where: { buildingId: smallerBuilding.id, organizationId: org.id },
      });
      await prisma.filingRecord.deleteMany({
        where: { buildingId: smallerBuilding.id, organizationId: org.id },
      });
      await prisma.calculationManifest.deleteMany({
        where: smallerRunIds.length > 0 ? { complianceRunId: { in: smallerRunIds } } : {},
      });
      await prisma.complianceRun.deleteMany({
        where: { buildingId: smallerBuilding.id, organizationId: org.id },
      });
      await prisma.bepsMetricInput.deleteMany({
        where: { buildingId: smallerBuilding.id, organizationId: org.id },
      });
      await prisma.complianceSnapshot.deleteMany({
        where: { buildingId: smallerBuilding.id, organizationId: org.id },
      });
      await prisma.building.deleteMany({
        where: { id: smallerBuilding.id, organizationId: org.id },
      });
    }
  });

  it("keeps cycle 3 explicitly unsupported through the router", async () => {
    const caller = createCaller();

    await expect(
      caller.beps.evaluate({
        buildingId: building.id,
        cycle: "CYCLE_3",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("not yet supported by governed BEPS records"),
    });
  });
});
