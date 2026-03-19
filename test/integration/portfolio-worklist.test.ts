import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";

describe("portfolio worklist", () => {
  const scope = `portfolio-worklist-${Date.now()}`;

  let org: { id: string; clerkOrgId: string };
  let user: { id: string; clerkUserId: string };
  let benchmarkRuleVersionId: string;
  let benchmarkFactorSetVersionId: string;
  let bepsRuleVersionId: string;
  let bepsFactorSetVersionId: string;
  let blockedBuildingId: string;
  let reviewBuildingId: string;
  let submitBuildingId: string;

  function createCaller() {
    return appRouter.createCaller({
      requestId: `req-${scope}`,
      clerkUserId: user.clerkUserId,
      clerkOrgId: org.clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  function toInputJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  function createBenchmarkPayload(input: {
    reportingYear: number;
    qaVerdict: "PASS" | "WARN" | "FAIL";
    status: "COMPUTED" | "BLOCKED";
    reasonCodes: string[];
    meetsStandard: boolean | null;
    blocked: boolean;
  }) {
    return {
      complianceEngine: {
        engineVersion: "v1",
        scope: "BENCHMARKING",
        status: input.status,
        applicability: "APPLICABLE",
        reportingYear: input.reportingYear,
        rulePackageKey: "DC_BENCHMARKING_2025",
        ruleVersionId: benchmarkRuleVersionId,
        ruleVersion: "portfolio-worklist-v1",
        factorSetKey: "DC_CURRENT_STANDARDS",
        factorSetVersionId: benchmarkFactorSetVersionId,
        factorSetVersion: "portfolio-worklist-v1",
        metricUsed: "ANNUAL_BENCHMARKING_READINESS",
        qa: {
          verdict: input.qaVerdict,
          gate:
            input.qaVerdict === "PASS"
              ? "PASSED"
              : input.qaVerdict === "WARN"
                ? "PROCEEDED_WITH_WARNINGS"
                : "BLOCKED",
          targetYear: input.reportingYear,
          issues: input.reasonCodes.map((code) => ({
            issueType: code,
            message: code,
            details: {},
          })),
        },
        reasonCodes: input.reasonCodes,
        decision: {
          meetsStandard: input.meetsStandard,
          blocked: input.blocked,
          insufficientData: input.blocked,
        },
        domainResult: {
          readiness: {
            status: input.status === "BLOCKED" ? "BLOCKED" : "READY",
          },
        },
      },
    };
  }

  function createBepsPayload(input: {
    filingYear: number;
    cycle: "CYCLE_1";
    reasonCodes: string[];
    meetsStandard: boolean;
  }) {
    return {
      complianceEngine: {
        engineVersion: "v1",
        scope: "BEPS",
        status: "COMPUTED",
        applicability: "APPLICABLE",
        filingYear: input.filingYear,
        rulePackageKey: "DC_BEPS_CYCLE_1",
        ruleVersionId: bepsRuleVersionId,
        ruleVersion: "portfolio-worklist-v1",
        factorSetKey: "DC_BEPS_CYCLE_1_FACTORS_V1",
        factorSetVersionId: bepsFactorSetVersionId,
        factorSetVersion: "portfolio-worklist-v1",
        metricUsed: "ENERGY_STAR_SCORE",
        qa: {
          verdict: "PASS",
          gate: "PASSED",
          targetYear: input.filingYear,
          issues: [],
        },
        reasonCodes: input.reasonCodes,
        decision: {
          meetsStandard: input.meetsStandard,
          blocked: false,
          insufficientData: false,
        },
      },
    };
  }

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `Portfolio worklist source ${scope}`,
        externalUrl: "https://example.com/portfolio-worklist",
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

    const benchmarkRuleVersion = await prisma.ruleVersion.upsert({
      where: {
        rulePackageId_version: {
          rulePackageId: benchmarkRulePackage.id,
          version: "portfolio-worklist-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        implementationKey: "benchmarking/readiness-v1",
        configJson: {},
      },
      create: {
        rulePackageId: benchmarkRulePackage.id,
        version: "portfolio-worklist-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "benchmarking/readiness-v1",
        sourceArtifactId: sourceArtifact.id,
        configJson: {},
      },
      select: { id: true },
    });
    benchmarkRuleVersionId = benchmarkRuleVersion.id;

    const benchmarkFactorSetVersion = await prisma.factorSetVersion.upsert({
      where: {
        key_version: {
          key: "DC_CURRENT_STANDARDS",
          version: "portfolio-worklist-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        factorsJson: {},
      },
      create: {
        key: "DC_CURRENT_STANDARDS",
        version: "portfolio-worklist-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        sourceArtifactId: sourceArtifact.id,
        factorsJson: {},
      },
      select: { id: true },
    });
    benchmarkFactorSetVersionId = benchmarkFactorSetVersion.id;

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

    const bepsRuleVersion = await prisma.ruleVersion.upsert({
      where: {
        rulePackageId_version: {
          rulePackageId: bepsRulePackage.id,
          version: "portfolio-worklist-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        implementationKey: "beps/evaluator-v1",
        configJson: {},
      },
      create: {
        rulePackageId: bepsRulePackage.id,
        version: "portfolio-worklist-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "beps/evaluator-v1",
        sourceArtifactId: sourceArtifact.id,
        configJson: {},
      },
      select: { id: true },
    });
    bepsRuleVersionId = bepsRuleVersion.id;

    const bepsFactorSetVersion = await prisma.factorSetVersion.upsert({
      where: {
        key_version: {
          key: "DC_BEPS_CYCLE_1_FACTORS_V1",
          version: "portfolio-worklist-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        factorsJson: {},
      },
      create: {
        key: "DC_BEPS_CYCLE_1_FACTORS_V1",
        version: "portfolio-worklist-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        sourceArtifactId: sourceArtifact.id,
        factorsJson: {},
      },
      select: { id: true },
    });
    bepsFactorSetVersionId = bepsFactorSetVersion.id;

    org = await prisma.organization.create({
      data: {
        clerkOrgId: `org_${scope}`,
        name: `Portfolio Worklist Org ${scope}`,
        slug: `portfolio-worklist-${scope}`,
      },
      select: { id: true, clerkOrgId: true },
    });

    user = await prisma.user.create({
      data: {
        clerkUserId: `user_${scope}`,
        email: `${scope}@example.com`,
        name: "Portfolio Worklist User",
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

    const blockedBuilding = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `Alpha Blocked ${scope}`,
        address: "101 Blocked Ave NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 60000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 75,
      },
      select: { id: true },
    });
    blockedBuildingId = blockedBuilding.id;

    const reviewBuilding = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `Bravo Review ${scope}`,
        address: "202 Review St NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 80000,
        propertyType: "MULTIFAMILY",
        ownershipType: "PRIVATE",
        bepsTargetScore: 70,
      },
      select: { id: true },
    });
    reviewBuildingId = reviewBuilding.id;

    const submitBuilding = await prisma.building.create({
      data: {
        organizationId: org.id,
        name: `Charlie Submit ${scope}`,
        address: "303 Submit Rd NW, Washington, DC 20001",
        latitude: 38.92,
        longitude: -77.01,
        grossSquareFeet: 120000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 68,
      },
      select: { id: true },
    });
    submitBuildingId = submitBuilding.id;

    const blockedBenchmarkRun = await prisma.complianceRun.create({
      data: {
        organizationId: org.id,
        buildingId: blockedBuildingId,
        ruleVersionId: benchmarkRuleVersionId,
        factorSetVersionId: benchmarkFactorSetVersionId,
        runType: "BENCHMARKING_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: `benchmark-blocked:${scope}`,
        inputSnapshotHash: `hash-benchmark-blocked:${scope}`,
        resultPayload: toInputJson({
          engineResult: createBenchmarkPayload({
            reportingYear: 2025,
            qaVerdict: "FAIL",
            status: "BLOCKED",
            reasonCodes: ["MISSING_MONTHS"],
            meetsStandard: null,
            blocked: true,
          }).complianceEngine,
        }),
        producedByType: "SYSTEM",
        producedById: "test",
      },
      select: { id: true, executedAt: true },
    });

    await prisma.benchmarkSubmission.create({
      data: {
        organizationId: org.id,
        buildingId: blockedBuildingId,
        reportingYear: 2025,
        ruleVersionId: benchmarkRuleVersionId,
        factorSetVersionId: benchmarkFactorSetVersionId,
        status: "BLOCKED",
        complianceRunId: blockedBenchmarkRun.id,
        readinessEvaluatedAt: new Date("2026-03-01T10:00:00.000Z"),
        submissionPayload: toInputJson(
          createBenchmarkPayload({
            reportingYear: 2025,
            qaVerdict: "FAIL",
            status: "BLOCKED",
            reasonCodes: ["MISSING_MONTHS"],
            meetsStandard: null,
            blocked: true,
          }),
        ),
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    await prisma.dataIssue.create({
      data: {
        organizationId: org.id,
        buildingId: blockedBuildingId,
        reportingYear: 2025,
        issueKey: `benchmarking:2025:MISSING_MONTHS:${scope}`,
        issueType: "MISSING_MONTHS",
        severity: "BLOCKING",
        status: "OPEN",
        title: "Missing reporting months",
        description: "Utility coverage is incomplete.",
        requiredAction: "Load the missing utility months and rerun readiness.",
        source: "QA",
        metadata: {},
      },
    });

    const reviewBenchmarkRun = await prisma.complianceRun.create({
      data: {
        organizationId: org.id,
        buildingId: reviewBuildingId,
        ruleVersionId: benchmarkRuleVersionId,
        factorSetVersionId: benchmarkFactorSetVersionId,
        runType: "BENCHMARKING_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: `benchmark-review:${scope}`,
        inputSnapshotHash: `hash-benchmark-review:${scope}`,
        resultPayload: toInputJson({
          engineResult: createBenchmarkPayload({
            reportingYear: 2025,
            qaVerdict: "PASS",
            status: "COMPUTED",
            reasonCodes: ["BENCHMARK_READY"],
            meetsStandard: true,
            blocked: false,
          }).complianceEngine,
        }),
        producedByType: "SYSTEM",
        producedById: "test",
      },
      select: { id: true },
    });

    await prisma.benchmarkSubmission.create({
      data: {
        organizationId: org.id,
        buildingId: reviewBuildingId,
        reportingYear: 2025,
        ruleVersionId: benchmarkRuleVersionId,
        factorSetVersionId: benchmarkFactorSetVersionId,
        status: "DRAFT",
        complianceRunId: reviewBenchmarkRun.id,
        readinessEvaluatedAt: new Date("2026-03-05T09:00:00.000Z"),
        submissionPayload: toInputJson(
          createBenchmarkPayload({
            reportingYear: 2025,
            qaVerdict: "PASS",
            status: "COMPUTED",
            reasonCodes: ["BENCHMARK_READY"],
            meetsStandard: true,
            blocked: false,
          }),
        ),
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    await prisma.penaltyRun.create({
      data: {
        organizationId: org.id,
        buildingId: reviewBuildingId,
        calculationMode: "CURRENT_BEPS_EXPOSURE",
        ruleVersionId: bepsRuleVersionId,
        factorSetVersionId: bepsFactorSetVersionId,
        implementationKey: "penalty-engine/beps-v1",
        inputSnapshotHash: `penalty-review:${scope}`,
        baselineResultPayload: toInputJson({
          status: "ESTIMATED",
          currentEstimatedPenalty: 125000,
          currency: "USD",
          basis: {
            code: "TEST",
            label: "Test basis",
            explanation: "Test basis",
          },
          governingContext: {},
          artifacts: {},
          timestamps: {},
          keyDrivers: [],
        }),
        scenarioResultsPayload: toInputJson([]),
      },
    });

    const submitBepsRun = await prisma.complianceRun.create({
      data: {
        organizationId: org.id,
        buildingId: submitBuildingId,
        ruleVersionId: bepsRuleVersionId,
        factorSetVersionId: bepsFactorSetVersionId,
        runType: "BEPS_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: `beps-submit:${scope}`,
        inputSnapshotHash: `hash-beps-submit:${scope}`,
        resultPayload: toInputJson({
          engineResult: createBepsPayload({
            filingYear: 2026,
            cycle: "CYCLE_1",
            reasonCodes: ["STANDARD_TARGET_NOT_MET"],
            meetsStandard: false,
          }).complianceEngine,
        }),
        producedByType: "SYSTEM",
        producedById: "test",
      },
      select: { id: true },
    });

    const submitFiling = await prisma.filingRecord.create({
      data: {
        organizationId: org.id,
        buildingId: submitBuildingId,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        complianceRunId: submitBepsRun.id,
        status: "GENERATED",
        filingPayload: toInputJson(
          createBepsPayload({
            filingYear: 2026,
            cycle: "CYCLE_1",
            reasonCodes: ["STANDARD_TARGET_NOT_MET"],
            meetsStandard: false,
          }),
        ),
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    await prisma.filingPacket.create({
      data: {
        organizationId: org.id,
        buildingId: submitBuildingId,
        filingRecordId: submitFiling.id,
        packetType: "COMPLETED_ACTIONS",
        status: "FINALIZED",
        version: 1,
        packetHash: `packet-hash:${scope}`,
        packetPayload: toInputJson({ summary: "Finalized filing packet" }),
        generatedAt: new Date("2026-03-07T13:00:00.000Z"),
        finalizedAt: new Date("2026-03-07T15:00:00.000Z"),
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const submitWorkflow = await prisma.submissionWorkflow.create({
      data: {
        organizationId: org.id,
        buildingId: submitBuildingId,
        workflowType: "BEPS_FILING",
        state: "APPROVED_FOR_SUBMISSION",
        filingPacketId: (
          await prisma.filingPacket.findFirstOrThrow({
            where: {
              organizationId: org.id,
              buildingId: submitBuildingId,
              filingRecordId: submitFiling.id,
            },
            select: { id: true },
          })
        ).id,
        createdByType: "SYSTEM",
        createdById: "test",
        latestTransitionAt: new Date("2026-03-07T15:15:00.000Z"),
        readyForReviewAt: new Date("2026-03-07T15:00:00.000Z"),
        approvedAt: new Date("2026-03-07T15:15:00.000Z"),
      },
    });

    await prisma.submissionWorkflowEvent.createMany({
      data: [
        {
          organizationId: org.id,
          buildingId: submitBuildingId,
          workflowId: submitWorkflow.id,
          fromState: null,
          toState: "READY_FOR_REVIEW",
          notes: "Workflow started from a finalized governed artifact.",
          createdByType: "SYSTEM",
          createdById: "test",
          createdAt: new Date("2026-03-07T15:00:00.000Z"),
        },
        {
          organizationId: org.id,
          buildingId: submitBuildingId,
          workflowId: submitWorkflow.id,
          fromState: "READY_FOR_REVIEW",
          toState: "APPROVED_FOR_SUBMISSION",
          notes: "Consultant approved the finalized artifact for submission.",
          createdByType: "SYSTEM",
          createdById: "test",
          createdAt: new Date("2026-03-07T15:15:00.000Z"),
        },
      ],
    });

    await prisma.penaltyRun.create({
      data: {
        organizationId: org.id,
        buildingId: submitBuildingId,
        calculationMode: "CURRENT_BEPS_EXPOSURE",
        ruleVersionId: bepsRuleVersionId,
        factorSetVersionId: bepsFactorSetVersionId,
        implementationKey: "penalty-engine/beps-v1",
        inputSnapshotHash: `penalty-submit:${scope}`,
        baselineResultPayload: toInputJson({
          status: "ESTIMATED",
          currentEstimatedPenalty: 250000,
          currency: "USD",
          basis: {
            code: "TEST",
            label: "Test basis",
            explanation: "Test basis",
          },
          governingContext: {},
          artifacts: {},
          timestamps: {},
          keyDrivers: [],
        }),
        scenarioResultsPayload: toInputJson([]),
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.submissionWorkflowEvent.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.submissionWorkflow.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.penaltyRun.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.dataIssue.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.filingPacket.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.filingRecord.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.benchmarkPacket.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.benchmarkSubmission.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.calculationManifest.deleteMany({
      where: {
        complianceRun: {
          organizationId: org.id,
        },
      },
    });
    await prisma.complianceRun.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.building.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.user.deleteMany({
      where: { id: user.id },
    });
    await prisma.organization.deleteMany({
      where: { id: org.id },
    });
  });

  it("returns governed worklist rows, aggregates, and stable filters", async () => {
    const caller = createCaller();

    const result = await caller.building.portfolioWorklist({});

    expect(result.aggregate.totalBuildings).toBe(3);
    expect(result.aggregate.blocked).toBe(1);
    expect(result.aggregate.readyForReview).toBe(1);
    expect(result.aggregate.readyToSubmit).toBe(1);
    expect(result.aggregate.withPenaltyExposure).toBe(2);
    expect(result.aggregate.withDraftArtifacts).toBe(0);
    expect(result.aggregate.finalizedAwaitingNextAction).toBe(1);

    expect(result.items[0]?.buildingId).toBe(blockedBuildingId);
    expect(result.items[0]?.nextAction.code).toBe("RESOLVE_BLOCKING_ISSUES");

    const readyToSubmitOnly = await caller.building.portfolioWorklist({
      readinessState: "READY_TO_SUBMIT",
    });
    expect(readyToSubmitOnly.items).toHaveLength(1);
    expect(readyToSubmitOnly.items[0]?.buildingId).toBe(submitBuildingId);
    expect(readyToSubmitOnly.items[0]?.submission.beps.state).toBe("APPROVED_FOR_SUBMISSION");
    expect(readyToSubmitOnly.items[0]).not.toHaveProperty("submissionPayload");
    expect(readyToSubmitOnly.items[0]).not.toHaveProperty("filingPayload");

    const exposureOnly = await caller.building.portfolioWorklist({
      hasPenaltyExposure: true,
      sortBy: "PENALTY",
    });
    expect(exposureOnly.items).toHaveLength(2);
    expect(exposureOnly.items[0]?.buildingId).toBe(submitBuildingId);

    const finalizedOnly = await caller.building.portfolioWorklist({
      artifactStatus: "FINALIZED",
    });
    expect(finalizedOnly.items).toHaveLength(1);
    expect(finalizedOnly.items[0]?.buildingId).toBe(submitBuildingId);
  });

  it("keeps portfolio summaries consistent with building-level governed state", async () => {
    const caller = createCaller();

    const [worklist, buildingDetail] = await Promise.all([
      caller.building.portfolioWorklist({
        search: "Charlie Submit",
      }),
      caller.building.get({
        id: submitBuildingId,
      }),
    ]);

    const row = worklist.items[0];
    expect(row?.buildingId).toBe(submitBuildingId);
    expect(row?.readinessState).toBe(buildingDetail.readinessSummary.state);
    expect(row?.complianceSummary.primaryStatus).toBe(
      buildingDetail.readinessSummary.primaryStatus,
    );
    expect(row?.artifacts.beps.status).toBe(
      buildingDetail.readinessSummary.artifacts.bepsPacket?.status ?? "NOT_STARTED",
    );
    expect(row?.submission.beps.state).toBe(
      buildingDetail.governedSummary.submissionSummary.beps?.state ?? "NOT_STARTED",
    );
    expect(row?.penaltySummary?.currentEstimatedPenalty).toBe(250000);
    expect(buildingDetail.governedSummary.penaltySummary?.currentEstimatedPenalty).toBe(
      row?.penaltySummary?.currentEstimatedPenalty ?? null,
    );
  });

  it("keeps report summaries aligned with the shared governed operational projection", async () => {
    const caller = createCaller();

    const [buildingDetail, worklist, report] = await Promise.all([
      caller.building.get({
        id: submitBuildingId,
      }),
      caller.building.portfolioWorklist({
        search: "Charlie Submit",
      }),
      caller.report.getComplianceReport({
        buildingId: submitBuildingId,
      }),
    ]);

    const row = worklist.items[0];
    expect(row?.buildingId).toBe(submitBuildingId);

    expect(report.governedOperationalSummary.readinessSummary.state).toBe(
      buildingDetail.governedSummary.readinessSummary.state,
    );
    expect(report.governedOperationalSummary.complianceSummary.primaryStatus).toBe(
      row?.complianceSummary.primaryStatus,
    );
    expect(report.governedOperationalSummary.penaltySummary?.currentEstimatedPenalty).toBe(
      row?.penaltySummary?.currentEstimatedPenalty ?? null,
    );
    expect(report.governedOperationalSummary.artifactSummary.beps.latestArtifactStatus).toBe(
      row?.artifacts.beps.status,
    );
    expect(report.governedOperationalSummary.timestamps.lastComplianceEvaluatedAt).toBe(
      buildingDetail.governedSummary.timestamps.lastComplianceEvaluatedAt,
    );
  });
});
