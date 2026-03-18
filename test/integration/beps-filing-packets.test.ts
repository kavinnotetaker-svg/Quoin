import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("BEPS filing packets", () => {
  const scope = `${Date.now()}`;
  const bepsFactorSetKey = "DC_BEPS_CYCLE_1_FACTORS_V1";

  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let buildingA: { id: string };
  let buildingB: { id: string };

  beforeAll(async () => {
    const bepsSource = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `BEPS packet source ${scope}`,
        externalUrl: "https://example.com/beps-packet-test",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const factorSource = await prisma.sourceArtifact.create({
      data: {
        artifactType: "GUIDE",
        name: `BEPS packet factors ${scope}`,
        externalUrl: "https://example.com/beps-packet-factors-test",
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
            prescriptiveAlwaysEligible: true,
            supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
          },
          performance: {
            scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
            nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
            requiredReductionFraction: 0.2,
          },
          standardTarget: {
            defaultMaxGap: 15,
            maxGapByPropertyType: {
              OFFICE: 15,
              MULTIFAMILY: 15,
              MIXED_USE: 15,
              OTHER: 15,
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
            prescriptiveAlwaysEligible: true,
            supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
          },
          performance: {
            scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
            nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
            requiredReductionFraction: 0.2,
          },
          standardTarget: {
            defaultMaxGap: 15,
            maxGapByPropertyType: {
              OFFICE: 15,
              MULTIFAMILY: 15,
              MIXED_USE: 15,
              OTHER: 15,
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
              },
              exactTargetScoresByPropertyType: {
                OFFICE: 71,
              },
              scoreEligibleMetric: "ENERGY_STAR_SCORE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
            },
            prescriptive: {
              defaultPointsNeeded: 25,
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
              },
              exactTargetScoresByPropertyType: {
                OFFICE: 71,
              },
              scoreEligibleMetric: "ENERGY_STAR_SCORE",
              nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
            },
            prescriptive: {
              defaultPointsNeeded: 25,
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
        name: `BEPS Packet Org A ${scope}`,
        slug: `beps-packet-org-a-${scope}`,
        clerkOrgId: `clerk_beps_packet_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `BEPS Packet Org B ${scope}`,
        slug: `beps-packet-org-b-${scope}`,
        clerkOrgId: `clerk_beps_packet_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_beps_packet_user_a_${scope}`,
        email: `beps_packet_a_${scope}@test.com`,
        name: "BEPS Packet User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_beps_packet_user_b_${scope}`,
        email: `beps_packet_b_${scope}@test.com`,
        name: "BEPS Packet User B",
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
        name: `BEPS Packet Building A ${scope}`,
        address: "903 Test St NW, Washington, DC 20001",
        latitude: 38.93,
        longitude: -77.06,
        grossSquareFeet: 140000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        yearBuilt: 1992,
        bepsTargetScore: 71,
        maxPenaltyExposure: 1400000,
      },
      select: { id: true },
    });

    buildingB = await prisma.building.create({
      data: {
        organizationId: orgB.id,
        name: `BEPS Packet Building B ${scope}`,
        address: "904 Test St NW, Washington, DC 20001",
        latitude: 38.94,
        longitude: -77.07,
        grossSquareFeet: 145000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        yearBuilt: 1994,
        bepsTargetScore: 71,
        maxPenaltyExposure: 1450000,
      },
      select: { id: true },
    });

    await prisma.complianceSnapshot.create({
      data: {
        buildingId: buildingA.id,
        organizationId: orgA.id,
        triggerType: "MANUAL",
        snapshotDate: new Date("2026-06-30T00:00:00.000Z"),
        energyStarScore: 60,
        siteEui: 90,
        sourceEui: 180,
        weatherNormalizedSiteEui: 88,
        weatherNormalizedSourceEui: 170,
        complianceStatus: "AT_RISK",
        complianceGap: -11,
        estimatedPenalty: 900000,
        dataQualityScore: 91,
        penaltyInputsJson: {},
      },
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
          evaluationWeatherNormalizedSiteEui: 88,
          baselineWeatherNormalizedSourceEui: 178,
          evaluationWeatherNormalizedSourceEui: 170,
          baselineEnergyStarScore: 55,
          evaluationEnergyStarScore: 60,
          notesJson: { inputMode: "MANUAL", scope },
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
          baselineWeatherNormalizedSiteEui: 98,
          evaluationWeatherNormalizedSiteEui: 87,
          baselineWeatherNormalizedSourceEui: 178,
          evaluationWeatherNormalizedSourceEui: 168,
          baselineEnergyStarScore: 54,
          evaluationEnergyStarScore: 59,
          notesJson: { inputMode: "MANUAL", scope },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.filingPacket.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.evidenceArtifact.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.filingRecord.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.complianceSnapshot.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.complianceRun.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.bepsMetricInput.deleteMany({
      where: {
        buildingId: { in: [buildingA.id, buildingB.id] },
      },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: {
        clerkUserId: {
          startsWith: "clerk_beps_packet_user_",
        },
      },
    });
    await prisma.building.deleteMany({
      where: { id: { in: [buildingA.id, buildingB.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.sourceArtifact.deleteMany({
      where: {
        OR: [
          { name: { contains: scope } },
          { externalUrl: { startsWith: "https://example.com/beps-packet" } },
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

  function requirePresent<T>(value: T | null) {
    expect(value).not.toBeNull();
    return value as T;
  }

  it("generates a canonical packet from a governed BEPS filing and includes governance data", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const evaluation = await caller.beps.evaluate({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });
    const filingRecord = requirePresent(evaluation.filingRecord);

    const packet = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filingRecord.id,
    });
    const payload = packet.packetPayload as Record<string, unknown>;
    const filingSummary = payload["filingSummary"] as Record<string, unknown>;
    const governance = payload["governance"] as Record<string, unknown>;
    const warnings = payload["warnings"] as Array<Record<string, unknown>>;

    expect(packet.version).toBe(1);
    expect(packet.status).toBe("GENERATED");
    expect(filingSummary["filingRecordId"]).toBe(filingRecord.id);
    expect(governance["rulePackageKey"]).toBe("DC_BEPS_CYCLE_1");
    expect(governance["factorSetKey"]).toBe(bepsFactorSetKey);
    expect(warnings.some((warning) => warning["code"] === "MISSING_PATHWAY_SUPPORT_EVIDENCE")).toBe(true);

    const manifest = await caller.beps.packetManifest({
      buildingId: buildingA.id,
      filingRecordId: filingRecord.id,
    });
    expect(manifest.evidenceManifest).toEqual([]);
  });

  it("exports and finalizes the latest packet deterministically", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const filing = await caller.beps.latestRun({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });

    const finalized = await caller.beps.finalizePacket({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
    });
    expect(finalized.status).toBe("FINALIZED");
    expect(finalized.finalizedByType).toBe("USER");
    expect(finalized.finalizedById).toBe(userA.clerkUserId);
    expect(finalized.filingRecord.events.some((event) => event.action === "PACKET_FINALIZED")).toBe(
      true,
    );

    const jsonExport = await caller.beps.exportPacket({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
      format: "JSON",
    });
    const jsonExportRepeat = await caller.beps.exportPacket({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
      format: "JSON",
    });
    const markdownExport = await caller.beps.exportPacket({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
      format: "MARKDOWN",
    });
    const parsedJson = JSON.parse(jsonExport.content) as Record<string, unknown>;
    const packetMeta = parsedJson["packet"] as Record<string, unknown>;
    const governance = parsedJson["governance"] as Record<string, unknown>;

    expect(jsonExport.content).toBe(jsonExportRepeat.content);
    expect(jsonExport.contentType).toBe("application/json");
    expect(jsonExport.fileName).toContain("cycle-1");
    expect(packetMeta["status"]).toBe("FINALIZED");
    expect(packetMeta["version"]).toBe(1);
    expect(governance["rulePackageKey"]).toBe("DC_BEPS_CYCLE_1");
    expect(governance["factorSetKey"]).toBe(bepsFactorSetKey);
    expect(markdownExport.contentType).toBe("text/markdown");
    expect(markdownExport.content).toContain("# Completed Actions Packet");
    expect(markdownExport.content).toContain("## Compliance Result");
  });

  it("marks packets stale on upstream evidence and filing changes, then regenerates a new version", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const filing = await caller.beps.latestRun({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });

    const firstPacket = await caller.beps.packetByFiling({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
    });
    expect(firstPacket.status).toBe("FINALIZED");

    await caller.beps.attachFilingEvidence({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
      artifactType: "OWNER_ATTESTATION",
      name: "Performance pathway memorandum",
      bepsEvidenceKind: "PATHWAY_SUPPORT",
      pathway: "PERFORMANCE",
      metadata: { scope },
    });

    const staleAfterEvidence = await caller.beps.packetByFiling({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
    });
    expect(staleAfterEvidence.status).toBe("STALE");
    await expect(
      caller.beps.finalizePacket({
        buildingId: buildingA.id,
        filingRecordId: filing.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    const regenerated = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
    });
    expect(regenerated.version).toBe(2);
    expect(regenerated.status).toBe("GENERATED");

    const regeneratedManifest = await caller.beps.packetManifest({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
    });
    expect(regeneratedManifest.evidenceManifest).toHaveLength(1);
    expect(
      regeneratedManifest.warnings.some(
        (warning) =>
          (warning as Record<string, unknown>)["code"] ===
          "MISSING_PATHWAY_SUPPORT_EVIDENCE",
      ),
    ).toBe(false);

    await caller.beps.transitionFiling({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
      nextStatus: "FILED",
      notes: "Packet submitted",
    });

    const staleAfterTransition = await caller.beps.packetByFiling({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
    });
    expect(staleAfterTransition.status).toBe("STALE");

    const packetAfterTransition = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filing.id,
    });
    const packetPayload = packetAfterTransition.packetPayload as Record<string, unknown>;
    const workflowHistory = packetPayload["workflowHistory"] as Record<string, unknown>;
    const events = workflowHistory["events"] as Array<Record<string, unknown>>;

    expect(packetAfterTransition.version).toBe(3);
    expect(events.some((event) => event["toStatus"] === "FILED")).toBe(true);
  });

  it("lists and retrieves packets only within the authenticated tenant", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const callerB = createCaller(userB.clerkUserId, orgB.clerkOrgId);
    const filing = await callerA.beps.latestRun({
      buildingId: buildingA.id,
      cycle: "CYCLE_1",
    });

    const packets = await callerA.beps.listPackets({
      buildingId: buildingA.id,
      limit: 10,
    });
    expect(packets).toHaveLength(3);
    expect(packets[0]?.filingRecordId).toBe(filing.id);

    await expect(
      callerB.beps.packetByFiling({
        buildingId: buildingA.id,
        filingRecordId: filing.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      callerB.beps.listPackets({
        buildingId: buildingA.id,
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});
