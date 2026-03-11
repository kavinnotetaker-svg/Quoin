import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("financing packets", () => {
  const scope = `${Date.now()}`;

  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let buildingA: { id: string };
  let buildingB: { id: string };
  let sourceArtifactA: { id: string };

  beforeAll(async () => {
    orgA = await prisma.organization.create({
      data: {
        name: `Financing Org A ${scope}`,
        slug: `financing-org-a-${scope}`,
        clerkOrgId: `clerk_financing_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `Financing Org B ${scope}`,
        slug: `financing-org-b-${scope}`,
        clerkOrgId: `clerk_financing_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_financing_user_a_${scope}`,
        email: `financing_a_${scope}@test.com`,
        name: "Financing User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_financing_user_b_${scope}`,
        email: `financing_b_${scope}@test.com`,
        name: "Financing User B",
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
        name: `Financing Building A ${scope}`,
        address: "600 Capital Ave NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 110000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 1990,
        bepsTargetScore: 71,
        maxPenaltyExposure: 1250000,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    buildingB = await prisma.building.create({
      data: {
        organizationId: orgB.id,
        name: `Financing Building B ${scope}`,
        address: "601 Capital Ave NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 90000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        yearBuilt: 1988,
        bepsTargetScore: 71,
        maxPenaltyExposure: 800000,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    sourceArtifactA = await prisma.sourceArtifact.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingA.id,
        artifactType: "GUIDE",
        name: `Retrofit support source ${scope}`,
        externalUrl: "https://example.com/retrofit-support",
        metadata: {
          scope,
        },
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    await prisma.complianceSnapshot.create({
      data: {
        buildingId: buildingA.id,
        organizationId: orgA.id,
        snapshotDate: new Date("2026-03-01T00:00:00.000Z"),
        triggerType: "MANUAL",
        energyStarScore: 59,
        siteEui: 86,
        sourceEui: 162,
        weatherNormalizedSiteEui: 83,
        weatherNormalizedSourceEui: 158,
        complianceStatus: "AT_RISK",
        estimatedPenalty: 780000,
        penaltyInputsJson: {},
      },
    });

    await prisma.filingRecord.create({
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
                amountDue: 900000,
              },
            },
          },
        },
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.financingPacket.deleteMany({
        where: {
          buildingId: { in: [buildingA.id, buildingB.id] },
        },
      });
      await prisma.financingCaseCandidate.deleteMany({
        where: {
          buildingId: { in: [buildingA.id, buildingB.id] },
        },
      });
      await prisma.financingCase.deleteMany({
        where: {
          buildingId: { in: [buildingA.id, buildingB.id] },
        },
      });
      await prisma.retrofitCandidate.deleteMany({
        where: {
          buildingId: { in: [buildingA.id, buildingB.id] },
        },
      });
      await prisma.bepsAlternativeComplianceAgreement.deleteMany({
        where: {
          buildingId: { in: [buildingA.id, buildingB.id] },
        },
      });
      await prisma.bepsPrescriptiveItem.deleteMany({
        where: {
          buildingId: { in: [buildingA.id, buildingB.id] },
        },
      });
      await prisma.bepsMetricInput.deleteMany({
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
      await prisma.sourceArtifact.deleteMany({
        where: {
          id: sourceArtifactA.id,
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
    } catch (error) {
      void error;
    }
  });

  function createCaller(clerkUserId: string, clerkOrgId: string) {
    return appRouter.createCaller({
      clerkUserId,
      clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  it("generates financing packets for single candidates and multi-candidate bundles with governed references", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const led = await caller.retrofit.upsertCandidate({
      buildingId: buildingA.id,
      projectType: "LED_LIGHTING_RETROFIT",
      status: "ACTIVE",
      sourceArtifactId: sourceArtifactA.id,
      estimatedCapex: 210000,
      estimatedIncentiveAmount: 20000,
      estimatedAnnualSavingsKbtu: 520000,
      estimatedAnnualSavingsUsd: 15600,
      estimatedSiteEuiReduction: 7,
      estimatedSourceEuiReduction: 11,
      estimatedBepsImprovementPct: 11,
      estimatedImplementationMonths: 4,
      confidenceBand: "HIGH",
    });

    const rcx = await caller.retrofit.upsertCandidate({
      buildingId: buildingA.id,
      projectType: "RETRO_COMMISSIONING",
      status: "ACTIVE",
      sourceArtifactId: sourceArtifactA.id,
      estimatedCapex: 85000,
      estimatedAnnualSavingsKbtu: 640000,
      estimatedAnnualSavingsUsd: 19200,
      estimatedSiteEuiReduction: 9,
      estimatedSourceEuiReduction: 13,
      estimatedBepsImprovementPct: 15,
      estimatedImplementationMonths: 3,
    });

    const singleCase = await caller.financing.upsertCase({
      buildingId: buildingA.id,
      name: "LED single-case financing",
      candidateIds: [led.id],
    });
    expect(singleCase.caseType).toBe("SINGLE_CANDIDATE");

    const singlePacket = await caller.financing.generatePacket({
      buildingId: buildingA.id,
      financingCaseId: singleCase.id,
    });
    expect(singlePacket.version).toBe(1);

    const singleManifest = await caller.financing.packetManifest({
      buildingId: buildingA.id,
      financingCaseId: singleCase.id,
    });
    const singleRationale = singleManifest.rankingRationale as Record<string, unknown>;
    const singleCandidateRankings = singleRationale["candidateRankings"] as Array<Record<string, unknown>>;
    expect(singleCandidateRankings).toHaveLength(1);
    expect(singleManifest.evidenceManifest.length).toBeGreaterThan(0);

    const exported = await caller.financing.exportPacket({
      buildingId: buildingA.id,
      financingCaseId: singleCase.id,
      format: "JSON",
    });
    expect(exported.content).toContain("estimatedAvoidedPenalty");
    expect(exported.content).toContain("factorSet");

    const bundleCase = await caller.financing.upsertCase({
      buildingId: buildingA.id,
      name: "Bundle financing case",
      candidateIds: [led.id, rcx.id],
    });
    expect(bundleCase.caseType).toBe("BUNDLE");

    const bundlePacket = await caller.financing.generatePacket({
      buildingId: buildingA.id,
      financingCaseId: bundleCase.id,
    });
    expect(bundlePacket.version).toBe(1);

    const bundleDetail = await caller.financing.packetByCase({
      buildingId: buildingA.id,
      financingCaseId: bundleCase.id,
    });
    const payload = bundleDetail.packetPayload as Record<string, unknown>;
    const projectScope = payload["projectScope"] as Record<string, unknown>;
    const bundleTotals = projectScope["bundleTotals"] as Record<string, unknown>;
    expect((projectScope["candidates"] as unknown[]).length).toBe(2);
    expect(Number(bundleTotals["estimatedCapex"])).toBeGreaterThan(led.estimatedCapex);
    expect(Number(bundleTotals["estimatedAvoidedPenalty"])).toBeGreaterThan(0);
  });

  it("marks financing packets stale when candidate assumptions change and surfaces warnings for missing support data", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const weakCandidate = await caller.retrofit.upsertCandidate({
      buildingId: buildingA.id,
      projectType: "CUSTOM",
      status: "ACTIVE",
      name: "Custom controls package",
      estimatedCapex: 150000,
      estimatedImplementationMonths: 8,
      confidenceBand: "LOW",
    });

    const financingCase = await caller.financing.upsertCase({
      buildingId: buildingA.id,
      name: "Weak-support financing case",
      candidateIds: [weakCandidate.id],
    });

    const packet = await caller.financing.generatePacket({
      buildingId: buildingA.id,
      financingCaseId: financingCase.id,
    });
    expect(packet.status).toBe("GENERATED");

    const manifest = await caller.financing.packetManifest({
      buildingId: buildingA.id,
      financingCaseId: financingCase.id,
    });
    const warningCodes = manifest.warnings.map(
      (warning) => (warning as Record<string, unknown>)["code"],
    );
    expect(warningCodes).toContain("NO_LINKED_SUPPORT_SOURCE");
    expect(warningCodes).toContain("MISSING_SAVINGS_ASSUMPTION");
    expect(warningCodes).toContain("LOW_CONFIDENCE_ESTIMATE");

    await caller.financing.finalizePacket({
      buildingId: buildingA.id,
      financingCaseId: financingCase.id,
    });

    await caller.retrofit.upsertCandidate({
      candidateId: weakCandidate.id,
      buildingId: buildingA.id,
      projectType: "CUSTOM",
      estimatedCapex: 190000,
      estimatedAnnualSavingsUsd: 10000,
    });

    const stalePacket = await caller.financing.packetByCase({
      buildingId: buildingA.id,
      financingCaseId: financingCase.id,
    });
    expect(stalePacket.status).toBe("STALE");

    const regenerated = await caller.financing.generatePacket({
      buildingId: buildingA.id,
      financingCaseId: financingCase.id,
    });
    expect(regenerated.version).toBe(2);
    expect(regenerated.status).toBe("GENERATED");
  });

  it("enforces tenant-safe retrieval and update of financing cases and packets", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const callerB = createCaller(userB.clerkUserId, orgB.clerkOrgId);

    const candidate = await callerA.retrofit.upsertCandidate({
      buildingId: buildingA.id,
      projectType: "BMS_UPGRADE",
      status: "ACTIVE",
      estimatedCapex: 260000,
      estimatedAnnualSavingsUsd: 16000,
      estimatedAnnualSavingsKbtu: 550000,
      estimatedBepsImprovementPct: 10,
    });

    await callerB.retrofit.upsertCandidate({
      buildingId: buildingB.id,
      projectType: "CUSTOM",
      status: "ACTIVE",
      name: "Org B controls project",
      estimatedCapex: 125000,
      estimatedAnnualSavingsUsd: 7500,
    });

    const financingCase = await callerA.financing.upsertCase({
      buildingId: buildingA.id,
      name: "Tenant-safe financing case",
      candidateIds: [candidate.id],
    });

    await callerA.financing.generatePacket({
      buildingId: buildingA.id,
      financingCaseId: financingCase.id,
    });

    await expect(
      callerB.financing.listCases({
        buildingId: buildingA.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      callerB.financing.packetByCase({
        buildingId: buildingA.id,
        financingCaseId: financingCase.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      callerB.financing.upsertCase({
        buildingId: buildingA.id,
        candidateIds: [candidate.id],
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});
