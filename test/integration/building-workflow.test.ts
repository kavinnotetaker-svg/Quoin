import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("building workflow summary", () => {
  const scope = `${Date.now()}`;

  let sourceArtifactId: string;
  let factorSetVersionId: string;
  let ruleVersionId: string;
  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let sparseBuilding: { id: string; name: string };
  let blockedBenchmarkBuilding: { id: string; name: string };
  let filingBuilding: { id: string; name: string };

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `Workflow source ${scope}`,
        externalUrl: `https://example.com/workflow-${scope}`,
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });
    sourceArtifactId = sourceArtifact.id;

    const rulePackage = await prisma.rulePackage.create({
      data: {
        key: `WORKFLOW_RULES_${scope}`,
        name: `Workflow Rules ${scope}`,
      },
    });

    const ruleVersion = await prisma.ruleVersion.create({
      data: {
        rulePackageId: rulePackage.id,
        sourceArtifactId,
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        implementationKey: "workflow/test",
        configJson: { scope },
      },
    });
    ruleVersionId = ruleVersion.id;

    const factorSetVersion = await prisma.factorSetVersion.create({
      data: {
        key: `WORKFLOW_FACTORS_${scope}`,
        sourceArtifactId,
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        factorsJson: { scope },
      },
    });
    factorSetVersionId = factorSetVersion.id;

    orgA = await prisma.organization.create({
      data: {
        name: `Workflow Org A ${scope}`,
        slug: `workflow-org-a-${scope}`,
        clerkOrgId: `clerk_workflow_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `Workflow Org B ${scope}`,
        slug: `workflow-org-b-${scope}`,
        clerkOrgId: `clerk_workflow_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_workflow_user_a_${scope}`,
        email: `workflow_a_${scope}@test.com`,
        name: "Workflow User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_workflow_user_b_${scope}`,
        email: `workflow_b_${scope}@test.com`,
        name: "Workflow User B",
      },
      select: { id: true, clerkUserId: true },
    });

    await prisma.organizationMembership.createMany({
      data: [
        { organizationId: orgA.id, userId: userA.id, role: "ADMIN" },
        { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
      ],
    });

    sparseBuilding = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `Workflow Sparse ${scope}`,
        address: "100 Workflow Ave NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 30000,
        propertyType: "OFFICE",
        bepsTargetScore: 71,
        maxPenaltyExposure: 300000,
      },
      select: { id: true, name: true },
    });

    blockedBenchmarkBuilding = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `Workflow Benchmark ${scope}`,
        address: "101 Workflow Ave NW, Washington, DC 20001",
        latitude: 38.901,
        longitude: -77.031,
        grossSquareFeet: 80000,
        propertyType: "OFFICE",
        bepsTargetScore: 71,
        maxPenaltyExposure: 800000,
        espmPropertyId: BigInt(19879255),
        espmShareStatus: "LINKED",
      },
      select: { id: true, name: true },
    });

    filingBuilding = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `Workflow Filing ${scope}`,
        address: "102 Workflow Ave NW, Washington, DC 20001",
        latitude: 38.902,
        longitude: -77.032,
        grossSquareFeet: 120000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        isEnergyStarScoreEligible: true,
        bepsTargetScore: 71,
        maxPenaltyExposure: 1200000,
        espmPropertyId: BigInt(19879256),
        espmShareStatus: "LINKED",
      },
      select: { id: true, name: true },
    });

    for (const buildingId of [blockedBenchmarkBuilding.id, filingBuilding.id]) {
      await prisma.energyReading.createMany({
        data: [
          {
            buildingId,
            organizationId: orgA.id,
            source: "CSV_UPLOAD",
            meterType: "ELECTRIC",
            periodStart: new Date("2025-01-01T00:00:00.000Z"),
            periodEnd: new Date("2025-01-31T00:00:00.000Z"),
            consumption: 100,
            unit: "KWH",
            consumptionKbtu: 341.2,
          },
          {
            buildingId,
            organizationId: orgA.id,
            source: "CSV_UPLOAD",
            meterType: "ELECTRIC",
            periodStart: new Date("2025-02-01T00:00:00.000Z"),
            periodEnd: new Date("2025-02-28T00:00:00.000Z"),
            consumption: 110,
            unit: "KWH",
            consumptionKbtu: 375.32,
          },
        ],
      });
    }

    await prisma.benchmarkSubmission.create({
      data: {
        organizationId: orgA.id,
        buildingId: blockedBenchmarkBuilding.id,
        reportingYear: 2025,
        ruleVersionId,
        factorSetVersionId,
        status: "BLOCKED",
        submissionPayload: {
          readiness: {
            status: "BLOCKED",
            reasonCodes: ["MISSING_PROPERTY_ID"],
            findings: [
              {
                code: "MISSING_PROPERTY_ID",
                status: "FAIL",
                message: "DC Real Property Unique ID is missing.",
              },
            ],
          },
        },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    await prisma.benchmarkSubmission.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        reportingYear: 2025,
        ruleVersionId,
        factorSetVersionId,
        status: "READY",
        submissionPayload: {
          readiness: {
            status: "READY",
            reasonCodes: [],
            findings: [],
          },
        },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const complianceRun = await prisma.complianceRun.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        ruleVersionId,
        factorSetVersionId,
        runType: "BEPS_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "workflow:test",
        inputSnapshotHash: "workflow-hash",
        resultPayload: { overallStatus: "NON_COMPLIANT" },
        producedByType: "SYSTEM",
        producedById: "test",
      },
    });

    await prisma.complianceSnapshot.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        complianceRunId: complianceRun.id,
        triggerType: "MANUAL",
        energyStarScore: 60,
        siteEui: 90,
        sourceEui: 180,
        weatherNormalizedSiteEui: 89,
        weatherNormalizedSourceEui: 170,
        complianceStatus: "NON_COMPLIANT",
        complianceGap: -11,
        estimatedPenalty: 525000,
        dataQualityScore: 90,
        penaltyInputsJson: {},
      },
    });

    const filingRecord = await prisma.filingRecord.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        complianceRunId: complianceRun.id,
        status: "GENERATED",
        filingPayload: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    await prisma.filingPacket.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        filingRecordId: filingRecord.id,
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        version: 1,
        status: "STALE",
        packetHash: `hash-${scope}`,
        packetPayload: {
          warnings: [{ code: "MISSING_PATHWAY_SUPPORT", message: "Pathway support documentation is still missing." }],
        },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const candidate = await prisma.retrofitCandidate.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        projectType: "LED_LIGHTING_RETROFIT",
        candidateSource: "MANUAL",
        status: "ACTIVE",
        name: "LED Upgrade",
        estimatedCapex: 50000,
        estimatedAnnualSavingsUsd: 12000,
        estimatedBepsImprovementPct: 5,
        confidenceBand: "MEDIUM",
      },
    });

    const financingCase = await prisma.financingCase.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        name: "Lighting package",
        caseType: "SINGLE_CANDIDATE",
        status: "ACTIVE",
        estimatedCapex: 50000,
        estimatedAnnualSavingsUsd: 12000,
        estimatedAvoidedPenalty: 200000,
        estimatedComplianceImprovementPct: 5,
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    await prisma.financingCaseCandidate.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        financingCaseId: financingCase.id,
        retrofitCandidateId: candidate.id,
      },
    });

    await prisma.financingPacket.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        financingCaseId: financingCase.id,
        version: 1,
        status: "GENERATED",
        packetHash: `financing-hash-${scope}`,
        packetPayload: { warnings: [] },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    await prisma.operationalAnomaly.create({
      data: {
        organizationId: orgA.id,
        buildingId: filingBuilding.id,
        anomalyType: "ABNORMAL_BASELOAD",
        severity: "HIGH",
        detectionHash: `workflow-anomaly-${scope}`,
        title: "High baseload",
        summary: "Baseload is above expected range.",
        detectionWindowStart: new Date("2025-10-01T00:00:00.000Z"),
        detectionWindowEnd: new Date("2025-12-01T00:00:00.000Z"),
        basisJson: {},
        reasonCodesJson: ["BASELOAD_ELEVATED"],
        attributionJson: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.operationalAnomaly.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.financingPacket.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.financingCaseCandidate.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.financingCase.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.retrofitCandidate.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.filingPacket.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.filingRecord.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.benchmarkSubmission.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.complianceSnapshot.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.complianceRun.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.energyReading.deleteMany({
      where: { buildingId: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [userA.id, userB.id] },
      },
    });
    await prisma.building.deleteMany({
      where: { id: { in: [sparseBuilding.id, blockedBenchmarkBuilding.id, filingBuilding.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.ruleVersion.deleteMany({
      where: { id: ruleVersionId },
    });
    await prisma.factorSetVersion.deleteMany({
      where: { id: factorSetVersionId },
    });
    await prisma.rulePackage.deleteMany({
      where: { key: `WORKFLOW_RULES_${scope}` },
    });
    await prisma.sourceArtifact.deleteMany({
      where: { id: sourceArtifactId },
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

  it("returns a deterministic workflow summary for sparse and blocked buildings", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const sparse = await caller.building.get({ id: sparseBuilding.id });
    expect(sparse.workflowSummary?.nextAction).toMatchObject({
      code: "CONNECT_DATA",
      title: "Connect building data",
    });
    expect(
      sparse.workflowSummary?.stages.find((stage) => stage.key === "DATA_CONNECTED"),
    ).toMatchObject({
      status: "NOT_STARTED",
    });

    const blocked = await caller.building.get({ id: blockedBenchmarkBuilding.id });
    expect(blocked.workflowSummary?.nextAction).toMatchObject({
      code: "FIX_BENCHMARKING_BLOCKERS",
      title: "Fix benchmarking blockers",
    });
    expect(
      blocked.workflowSummary?.stages.find((stage) => stage.key === "BENCHMARKING_READY"),
    ).toMatchObject({
      status: "BLOCKED",
    });
  });

  it("surfaces filing and portfolio workflow categories from existing records", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const filing = await caller.building.get({ id: filingBuilding.id });
    expect(filing.workflowSummary?.nextAction).toMatchObject({
      code: "REGENERATE_FILING_PACKET",
      title: "Regenerate filing packet",
    });
    expect(
      filing.workflowSummary?.stages.find((stage) => stage.key === "FILING_PREPARED"),
    ).toMatchObject({
      status: "NEEDS_ATTENTION",
    });

    const portfolio = await caller.building.portfolioWorkflow({ limit: 10 });
    expect(portfolio.aggregate.benchmarkingBlocked).toBeGreaterThanOrEqual(1);
    expect(portfolio.aggregate.filingAttention).toBeGreaterThanOrEqual(1);
    expect(portfolio.aggregate.operationalAttention).toBeGreaterThanOrEqual(1);
    expect(portfolio.aggregate.retrofitReady).toBeGreaterThanOrEqual(1);
    expect(portfolio.aggregate.financingReady).toBeGreaterThanOrEqual(1);
    expect(portfolio.items.some((item) => item.buildingId === filingBuilding.id)).toBe(true);
  });

  it("does not leak workflow summaries across tenants", async () => {
    const caller = createCaller(userB.clerkUserId, orgB.clerkOrgId);

    await expect(
      caller.building.workflowSummary({ buildingId: sparseBuilding.id }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.building.get({ id: filingBuilding.id })).rejects.toBeInstanceOf(
      TRPCError,
    );
  });
});
