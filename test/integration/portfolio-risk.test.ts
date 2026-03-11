import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";
import { PORTFOLIO_RISK_REASON_CODES } from "@/server/compliance/portfolio-risk";

describe("portfolio risk views", () => {
  const scope = `${Date.now()}`;

  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let buildingReady: { id: string };
  let buildingRisky: { id: string };
  let buildingOtherTenant: { id: string };
  let ruleVersion: { id: string };
  let factorSetVersion: { id: string };

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `Portfolio risk source ${scope}`,
        externalUrl: "https://example.com/portfolio-risk-test",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const rulePackage = await prisma.rulePackage.upsert({
      where: { key: "DC_PORTFOLIO_RISK_TEST" },
      update: {
        name: "DC Portfolio Risk Test",
      },
      create: {
        key: "DC_PORTFOLIO_RISK_TEST",
        name: "DC Portfolio Risk Test",
      },
    });

    ruleVersion = await prisma.ruleVersion.upsert({
      where: {
        rulePackageId_version: {
          rulePackageId: rulePackage.id,
          version: "test-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        implementationKey: "portfolio/risk-test-v1",
        configJson: { scope },
      },
      create: {
        rulePackageId: rulePackage.id,
        sourceArtifactId: sourceArtifact.id,
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "portfolio/risk-test-v1",
        configJson: { scope },
      },
      select: { id: true },
    });

    factorSetVersion = await prisma.factorSetVersion.upsert({
      where: {
        key_version: {
          key: "DC_PORTFOLIO_RISK_FACTORS_TEST",
          version: "test-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        factorsJson: { scope },
      },
      create: {
        key: "DC_PORTFOLIO_RISK_FACTORS_TEST",
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        sourceArtifactId: sourceArtifact.id,
        factorsJson: { scope },
      },
      select: { id: true },
    });

    orgA = await prisma.organization.create({
      data: {
        name: `Portfolio Risk Org A ${scope}`,
        slug: `portfolio-risk-org-a-${scope}`,
        clerkOrgId: `clerk_portfolio_risk_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `Portfolio Risk Org B ${scope}`,
        slug: `portfolio-risk-org-b-${scope}`,
        clerkOrgId: `clerk_portfolio_risk_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_portfolio_risk_user_a_${scope}`,
        email: `portfolio_risk_a_${scope}@test.com`,
        name: "Portfolio Risk User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_portfolio_risk_user_b_${scope}`,
        email: `portfolio_risk_b_${scope}@test.com`,
        name: "Portfolio Risk User B",
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
        name: `Portfolio Ready Building ${scope}`,
        address: "100 Ready Way NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 80000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        espmPropertyId: BigInt(555001),
        espmShareStatus: "LINKED",
        bepsTargetScore: 71,
        maxPenaltyExposure: 0,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    buildingRisky = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `Portfolio Risky Building ${scope}`,
        address: "200 Risk Way NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 90000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        espmPropertyId: BigInt(555002),
        espmShareStatus: "FAILED",
        bepsTargetScore: 71,
        maxPenaltyExposure: 400000,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    buildingOtherTenant = await prisma.building.create({
      data: {
        organizationId: orgB.id,
        name: `Portfolio Other Tenant Building ${scope}`,
        address: "300 Other Way NW, Washington, DC 20001",
        latitude: 38.92,
        longitude: -77.01,
        grossSquareFeet: 85000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        espmPropertyId: BigInt(555003),
        espmShareStatus: "LINKED",
        bepsTargetScore: 71,
        maxPenaltyExposure: 0,
        complianceCycle: "CYCLE_1",
      },
      select: { id: true },
    });

    const benchmarkRunReady = await prisma.complianceRun.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingReady.id,
        ruleVersionId: ruleVersion.id,
        factorSetVersionId: factorSetVersion.id,
        runType: "BENCHMARKING_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "benchmark:2025",
        inputSnapshotHash: "benchmark-ready",
        resultPayload: { readiness: { status: "READY" } },
        producedByType: "SYSTEM",
        producedById: "test",
      },
      select: { id: true },
    });

    const benchmarkRunRisky = await prisma.complianceRun.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingRisky.id,
        ruleVersionId: ruleVersion.id,
        factorSetVersionId: factorSetVersion.id,
        runType: "BENCHMARKING_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "benchmark:2025",
        inputSnapshotHash: "benchmark-risky",
        resultPayload: { readiness: { status: "BLOCKED" } },
        producedByType: "SYSTEM",
        producedById: "test",
      },
      select: { id: true },
    });

    const bepsRunReady = await prisma.complianceRun.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingReady.id,
        ruleVersionId: ruleVersion.id,
        factorSetVersionId: factorSetVersion.id,
        runType: "BEPS_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "beps:CYCLE_1:2026",
        inputSnapshotHash: "beps-ready",
        resultPayload: {
          evaluation: {
            overallStatus: "COMPLIANT",
            reasonCodes: [],
            alternativeCompliance: {
              recommended: {
                amountDue: 0,
              },
            },
          },
        },
        producedByType: "SYSTEM",
        producedById: "test",
      },
      select: { id: true },
    });

    const bepsRunRisky = await prisma.complianceRun.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingRisky.id,
        ruleVersionId: ruleVersion.id,
        factorSetVersionId: factorSetVersion.id,
        runType: "BEPS_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "beps:CYCLE_1:2026",
        inputSnapshotHash: "beps-risky",
        resultPayload: {
          evaluation: {
            overallStatus: "NON_COMPLIANT",
            reasonCodes: ["ACP_AGREEMENT_REQUIRED"],
            alternativeCompliance: {
              recommended: {
                amountDue: 250000,
              },
            },
          },
        },
        producedByType: "SYSTEM",
        producedById: "test",
      },
      select: { id: true },
    });

    await prisma.benchmarkSubmission.createMany({
      data: [
        {
          organizationId: orgA.id,
          buildingId: buildingReady.id,
          reportingYear: 2025,
          ruleVersionId: ruleVersion.id,
          factorSetVersionId: factorSetVersion.id,
          complianceRunId: benchmarkRunReady.id,
          status: "SUBMITTED",
          readinessEvaluatedAt: new Date("2026-01-10T00:00:00.000Z"),
          submissionPayload: {
            readiness: {
              status: "READY",
              reasonCodes: [],
            },
          },
          submittedAt: new Date("2026-01-20T00:00:00.000Z"),
          createdByType: "SYSTEM",
          createdById: "test",
        },
        {
          organizationId: orgA.id,
          buildingId: buildingRisky.id,
          reportingYear: 2025,
          ruleVersionId: ruleVersion.id,
          factorSetVersionId: factorSetVersion.id,
          complianceRunId: benchmarkRunRisky.id,
          status: "BLOCKED",
          readinessEvaluatedAt: new Date("2026-03-01T00:00:00.000Z"),
          submissionPayload: {
            readiness: {
              status: "BLOCKED",
              reasonCodes: ["VERIFICATION_EVIDENCE_MISSING"],
            },
          },
          createdByType: "SYSTEM",
          createdById: "test",
        },
      ],
    });

    const filingReady = await prisma.filingRecord.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingReady.id,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        complianceRunId: bepsRunReady.id,
        status: "ACCEPTED",
        filingPayload: {
          bepsEvaluation: {
            overallStatus: "COMPLIANT",
            reasonCodes: [],
            alternativeCompliance: {
              recommended: {
                amountDue: 0,
              },
            },
          },
        },
        filedAt: new Date("2026-02-01T00:00:00.000Z"),
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    const filingRisky = await prisma.filingRecord.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingRisky.id,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        complianceRunId: bepsRunRisky.id,
        status: "GENERATED",
        filingPayload: {
          bepsEvaluation: {
            overallStatus: "NON_COMPLIANT",
            reasonCodes: ["ACP_AGREEMENT_REQUIRED"],
            alternativeCompliance: {
              recommended: {
                amountDue: 250000,
              },
            },
          },
        },
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    await prisma.evidenceArtifact.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingReady.id,
        filingRecordId: filingReady.id,
        artifactType: "OWNER_ATTESTATION",
        name: `Ready filing support ${scope}`,
        artifactRef: `ready-support:${scope}`,
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    await prisma.filingPacket.createMany({
      data: [
        {
          organizationId: orgA.id,
          buildingId: buildingReady.id,
          filingRecordId: filingReady.id,
          filingYear: 2026,
          complianceCycle: "CYCLE_1",
          version: 1,
          status: "FINALIZED",
          packetHash: "ready-hash",
          packetPayload: {
            warnings: [],
          },
          generatedAt: new Date("2026-02-01T00:00:00.000Z"),
          finalizedAt: new Date("2026-02-02T00:00:00.000Z"),
          finalizedByType: "SYSTEM",
          finalizedById: "test",
          createdByType: "SYSTEM",
          createdById: "test",
        },
        {
          organizationId: orgA.id,
          buildingId: buildingRisky.id,
          filingRecordId: filingRisky.id,
          filingYear: 2026,
          complianceCycle: "CYCLE_1",
          version: 1,
          status: "STALE",
          packetHash: "risky-hash",
          packetPayload: {
            warnings: [{ code: "MISSING_ACP_SUPPORT_EVIDENCE" }],
          },
          generatedAt: new Date("2026-03-01T00:00:00.000Z"),
          staleMarkedAt: new Date("2026-03-05T00:00:00.000Z"),
          createdByType: "SYSTEM",
          createdById: "test",
        },
      ],
    });

    await prisma.portfolioManagerSyncState.createMany({
      data: [
        {
          organizationId: orgA.id,
          buildingId: buildingReady.id,
          status: "SUCCEEDED",
          lastAttemptedSyncAt: new Date("2026-03-01T00:00:00.000Z"),
          lastSuccessfulSyncAt: new Date("2026-03-01T00:00:00.000Z"),
          lastErrorMetadata: {},
          sourceMetadata: { system: "ENERGY_STAR_PORTFOLIO_MANAGER" },
          syncMetadata: {},
          qaPayload: { findings: [] },
        },
        {
          organizationId: orgA.id,
          buildingId: buildingRisky.id,
          status: "FAILED",
          lastAttemptedSyncAt: new Date("2026-01-01T00:00:00.000Z"),
          lastSuccessfulSyncAt: new Date("2025-12-01T00:00:00.000Z"),
          lastErrorMetadata: {
            errors: [{ step: "property", message: "Linkage failed" }],
          },
          sourceMetadata: { system: "ENERGY_STAR_PORTFOLIO_MANAGER" },
          syncMetadata: {},
          qaPayload: {
            findings: [
              { code: "STALE_PM_DATA", status: "FAIL" },
              { code: "MISSING_PM_SHARING_STATE", status: "FAIL" },
            ],
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.portfolioManagerSyncState.deleteMany({
      where: {
        buildingId: { in: [buildingReady.id, buildingRisky.id, buildingOtherTenant.id] },
      },
    });
    await prisma.filingPacket.deleteMany({
      where: {
        buildingId: { in: [buildingReady.id, buildingRisky.id, buildingOtherTenant.id] },
      },
    });
    await prisma.evidenceArtifact.deleteMany({
      where: {
        buildingId: { in: [buildingReady.id, buildingRisky.id, buildingOtherTenant.id] },
      },
    });
    await prisma.filingRecord.deleteMany({
      where: {
        buildingId: { in: [buildingReady.id, buildingRisky.id, buildingOtherTenant.id] },
      },
    });
    await prisma.benchmarkSubmission.deleteMany({
      where: {
        buildingId: { in: [buildingReady.id, buildingRisky.id, buildingOtherTenant.id] },
      },
    });
    await prisma.complianceRun.deleteMany({
      where: {
        buildingId: { in: [buildingReady.id, buildingRisky.id, buildingOtherTenant.id] },
      },
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
      where: {
        id: { in: [buildingReady.id, buildingRisky.id, buildingOtherTenant.id] },
      },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.factorSetVersion.deleteMany({
      where: { id: factorSetVersion.id },
    });
    await prisma.ruleVersion.deleteMany({
      where: { id: ruleVersion.id },
    });
    await prisma.rulePackage.deleteMany({
      where: { key: "DC_PORTFOLIO_RISK_TEST" },
    });
    await prisma.sourceArtifact.deleteMany({
      where: { name: { contains: scope } },
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

  it("aggregates portfolio risk correctly and lists highest-priority actions", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const result = await caller.portfolioRisk.list({
      limit: 10,
    });

    expect(result.aggregate.totals.buildingsReady).toBe(1);
    expect(result.aggregate.totals.buildingsBlocked).toBe(1);
    expect(result.aggregate.totals.buildingsAtHighRisk).toBe(1);
    expect(result.aggregate.totals.buildingsWithStaleSyncData).toBe(1);
    expect(result.aggregate.totals.buildingsWithLikelyAcpExposure).toBe(1);
    expect(result.aggregate.totals.buildingsNeedingVerificationEvidenceFinalization).toBe(1);

    expect(result.buildingRisks[0]?.buildingId).toBe(buildingRisky.id);
    expect(result.buildingRisks[0]?.blockingReasons).toContain(
      PORTFOLIO_RISK_REASON_CODES.benchmarkingBlocked,
    );
    expect(result.buildingRisks[0]?.blockingReasons).toContain(
      PORTFOLIO_RISK_REASON_CODES.likelyAcpExposure,
    );

    const actions = await caller.portfolioRisk.priorityActions({
      limit: 5,
    });
    expect(actions[0]?.buildingId).toBe(buildingRisky.id);
    expect(actions.some((action) => action.reasonCode === PORTFOLIO_RISK_REASON_CODES.pmSyncFailed)).toBe(
      true,
    );
  });

  it("provides risk traces and enforces tenant-safe retrieval", async () => {
    const callerA = createCaller(userA.clerkUserId, orgA.clerkOrgId);
    const callerB = createCaller(userB.clerkUserId, orgB.clerkOrgId);

    const summary = await callerA.portfolioRisk.buildingSummary({
      buildingId: buildingRisky.id,
    });
    expect(summary.riskScore).toBeGreaterThanOrEqual(70);
    expect(summary.blockingReasons).toContain(
      PORTFOLIO_RISK_REASON_CODES.likelyAcpExposure,
    );
    expect(summary.estimatedExposure).toBe(250000);

    const trace = await callerA.portfolioRisk.trace({
      buildingId: buildingRisky.id,
    });
    expect(
      trace.contributions.some(
        (contribution) =>
          contribution.code === PORTFOLIO_RISK_REASON_CODES.filingEvidenceMissing,
      ),
    ).toBe(true);

    await expect(
      callerB.portfolioRisk.buildingSummary({
        buildingId: buildingRisky.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      callerB.portfolioRisk.trace({
        buildingId: buildingRisky.id,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});
