import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";
import {
  finalizeBenchmarkPacket,
  generateBenchmarkPacket,
} from "@/server/compliance/benchmark-packets";
import {
  finalizeBepsFilingPacket,
  generateBepsFilingPacket,
} from "@/server/compliance/beps";

describe("submission workflows", () => {
  const scope = `submission-workflows-${Date.now()}`;

  let org: { id: string; clerkOrgId: string };
  let user: { id: string; clerkUserId: string };
  let building: { id: string };
  let benchmarkRuleVersionId: string;
  let benchmarkFactorSetVersionId: string;
  let bepsRuleVersionId: string;
  let bepsFactorSetVersionId: string;
  let filingRecordId: string;

  function toInputJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  function createCaller(requestId: string) {
    return appRouter.createCaller({
      requestId,
      clerkUserId: user.clerkUserId,
      clerkOrgId: org.clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  function createBenchmarkPayload(reportingYear: number) {
    return {
      complianceEngine: {
        engineVersion: "v1",
        scope: "BENCHMARKING",
        status: "COMPUTED",
        applicability: "APPLICABLE",
        reportingYear,
        rulePackageKey: "DC_BENCHMARKING_2025",
        ruleVersionId: benchmarkRuleVersionId,
        ruleVersion: "submission-workflows-v1",
        factorSetKey: "DC_CURRENT_STANDARDS",
        factorSetVersionId: benchmarkFactorSetVersionId,
        factorSetVersion: "submission-workflows-v1",
        metricUsed: "ANNUAL_BENCHMARKING_READINESS",
        qa: {
          verdict: "PASS",
          gate: "PASSED",
          targetYear: reportingYear,
          issues: [],
        },
        reasonCodes: ["BENCHMARK_READY"],
        decision: {
          meetsStandard: true,
          blocked: false,
          insufficientData: false,
        },
        domainResult: {
          readiness: {
            status: "READY",
          },
        },
      },
      readiness: {
        status: "READY",
        summary: {
          coverageComplete: true,
          pmShareState: "READY",
        },
      },
    };
  }

  function createBepsPayload(filingYear: number) {
    return {
      complianceEngine: {
        engineVersion: "v1",
        scope: "BEPS",
        status: "COMPUTED",
        applicability: "APPLICABLE",
        filingYear,
        rulePackageKey: "DC_BEPS_CYCLE_1",
        ruleVersionId: bepsRuleVersionId,
        ruleVersion: "submission-workflows-v1",
        factorSetKey: "DC_BEPS_CYCLE_1_FACTORS_V1",
        factorSetVersionId: bepsFactorSetVersionId,
        factorSetVersion: "submission-workflows-v1",
        metricUsed: "ENERGY_STAR_SCORE",
        qa: {
          verdict: "PASS",
          gate: "PASSED",
          targetYear: filingYear - 1,
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
      },
      bepsEvaluation: {
        overallStatus: "NON_COMPLIANT",
        selectedPathway: "STANDARD_TARGET",
        reasonCodes: ["STANDARD_TARGET_NOT_MET"],
        inputSummary: {
          currentScore: 61,
          targetScore: 75,
          propertyType: "OFFICE",
          ownershipType: "PRIVATE",
          scoreEligible: true,
        },
        pathwayResults: {
          standardTarget: {
            metricBasis: "ENERGY_STAR_SCORE",
            currentValue: 61,
            targetValue: 75,
            gap: 14,
          },
        },
        alternativeCompliance: {
          recommended: {
            pathway: "STANDARD_TARGET",
            amountDue: 150000,
          },
          standardTarget: {
            amountDue: 150000,
          },
        },
        governance: {
          rulePackageKey: "DC_BEPS_CYCLE_1",
          ruleVersion: "submission-workflows-v1",
          factorSetKey: "DC_BEPS_CYCLE_1_FACTORS_V1",
          factorSetVersion: "submission-workflows-v1",
        },
      },
    };
  }

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `Submission workflow source ${scope}`,
        externalUrl: `https://example.com/submission-workflows/${scope}`,
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

    benchmarkRuleVersionId = (
      await prisma.ruleVersion.upsert({
        where: {
          rulePackageId_version: {
            rulePackageId: benchmarkRulePackage.id,
            version: "submission-workflows-v1",
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
          version: "submission-workflows-v1",
          status: "ACTIVE",
          effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
          implementationKey: "benchmarking/readiness-v1",
          sourceArtifactId: sourceArtifact.id,
          configJson: {},
        },
        select: { id: true },
      })
    ).id;

    benchmarkFactorSetVersionId = (
      await prisma.factorSetVersion.upsert({
        where: {
          key_version: {
            key: "DC_CURRENT_STANDARDS",
            version: "submission-workflows-v1",
          },
        },
        update: {
          sourceArtifactId: sourceArtifact.id,
          status: "ACTIVE",
          factorsJson: {},
        },
        create: {
          key: "DC_CURRENT_STANDARDS",
          version: "submission-workflows-v1",
          status: "ACTIVE",
          effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
          sourceArtifactId: sourceArtifact.id,
          factorsJson: {},
        },
        select: { id: true },
      })
    ).id;

    const bepsRulePackage = await prisma.rulePackage.upsert({
      where: { key: "DC_BEPS_CYCLE_1" },
      update: {
        name: "DC BEPS Cycle 1 Workflow",
      },
      create: {
        key: "DC_BEPS_CYCLE_1",
        name: "DC BEPS Cycle 1 Workflow",
      },
    });

    bepsRuleVersionId = (
      await prisma.ruleVersion.upsert({
        where: {
          rulePackageId_version: {
            rulePackageId: bepsRulePackage.id,
            version: "submission-workflows-v1",
          },
        },
        update: {
          sourceArtifactId: sourceArtifact.id,
          status: "ACTIVE",
          implementationKey: "compliance-engine/beps-v1",
          configJson: {},
        },
        create: {
          rulePackageId: bepsRulePackage.id,
          version: "submission-workflows-v1",
          status: "ACTIVE",
          effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
          implementationKey: "compliance-engine/beps-v1",
          sourceArtifactId: sourceArtifact.id,
          configJson: {},
        },
        select: { id: true },
      })
    ).id;

    bepsFactorSetVersionId = (
      await prisma.factorSetVersion.upsert({
        where: {
          key_version: {
            key: "DC_BEPS_CYCLE_1_FACTORS_V1",
            version: "submission-workflows-v1",
          },
        },
        update: {
          sourceArtifactId: sourceArtifact.id,
          status: "ACTIVE",
          factorsJson: {},
        },
        create: {
          key: "DC_BEPS_CYCLE_1_FACTORS_V1",
          version: "submission-workflows-v1",
          status: "ACTIVE",
          effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
          sourceArtifactId: sourceArtifact.id,
          factorsJson: {},
        },
        select: { id: true },
      })
    ).id;

    org = await prisma.organization.create({
      data: {
        clerkOrgId: `org_${scope}`,
        name: `Submission Workflow Org ${scope}`,
        slug: `submission-workflow-${scope}`,
      },
      select: { id: true, clerkOrgId: true },
    });

    user = await prisma.user.create({
      data: {
        clerkUserId: `user_${scope}`,
        email: `${scope}@example.com`,
        name: "Submission Workflow User",
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
        name: `Submission Workflow Building ${scope}`,
        address: "500 Submission Way NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 85000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        doeeBuildingId: `RPUID-${scope}`,
        espmPropertyId: BigInt(333444555),
        espmShareStatus: "LINKED",
        bepsTargetScore: 75,
      },
      select: { id: true },
    });

    const meter = await prisma.meter.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        meterType: "ELECTRIC",
        name: "Main electric meter",
        unit: "KWH",
      },
      select: { id: true },
    });

    await prisma.energyReading.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        source: "MANUAL",
        meterId: meter.id,
        meterType: "ELECTRIC",
        periodStart: new Date("2025-01-01T00:00:00.000Z"),
        periodEnd: new Date("2025-12-31T00:00:00.000Z"),
        consumption: 100000,
        unit: "KWH",
        consumptionKbtu: 341214,
        isVerified: true,
      },
    });

    await prisma.complianceSnapshot.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        snapshotDate: new Date("2026-03-18T08:00:00.000Z"),
        triggerType: "MANUAL",
        energyStarScore: 81,
        siteEui: 48,
        sourceEui: 92,
        complianceStatus: "COMPLIANT",
      },
    });

    await prisma.portfolioManagerSyncState.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        status: "SUCCEEDED",
        lastAttemptedSyncAt: new Date("2026-03-18T07:00:00.000Z"),
        lastSuccessfulSyncAt: new Date("2026-03-18T07:05:00.000Z"),
      },
    });

    const benchmarkRun = await prisma.complianceRun.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        ruleVersionId: benchmarkRuleVersionId,
        factorSetVersionId: benchmarkFactorSetVersionId,
        runType: "BENCHMARKING_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "submission-workflow:benchmark",
        inputSnapshotHash: `submission-workflow-benchmark:${scope}`,
        resultPayload: {},
        producedByType: "SYSTEM",
        producedById: "test",
        executedAt: new Date("2026-03-18T10:00:00.000Z"),
      },
      select: { id: true },
    });

    await prisma.benchmarkSubmission.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        reportingYear: 2025,
        ruleVersionId: benchmarkRuleVersionId,
        factorSetVersionId: benchmarkFactorSetVersionId,
        complianceRunId: benchmarkRun.id,
        status: "READY",
        readinessEvaluatedAt: new Date("2026-03-18T09:00:00.000Z"),
        submissionPayload: toInputJson(createBenchmarkPayload(2025)),
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const bepsRun = await prisma.complianceRun.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        ruleVersionId: bepsRuleVersionId,
        factorSetVersionId: bepsFactorSetVersionId,
        runType: "BEPS_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "submission-workflow:beps",
        inputSnapshotHash: `submission-workflow-beps:${scope}`,
        resultPayload: {},
        producedByType: "SYSTEM",
        producedById: "test",
        executedAt: new Date("2026-03-18T11:00:00.000Z"),
      },
      select: { id: true },
    });

    filingRecordId = (
      await prisma.filingRecord.create({
        data: {
          organizationId: org.id,
          buildingId: building.id,
          filingType: "BEPS_COMPLIANCE",
          filingYear: 2026,
          complianceCycle: "CYCLE_1",
          complianceRunId: bepsRun.id,
          status: "GENERATED",
          filingPayload: toInputJson(createBepsPayload(2026)),
          createdByType: "SYSTEM",
          createdById: "test",
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { organizationId: org?.id } });
    await prisma.submissionWorkflowEvent.deleteMany({ where: { organizationId: org?.id } });
    await prisma.submissionWorkflow.deleteMany({ where: { organizationId: org?.id } });
    await prisma.bepsRequestItem.deleteMany({ where: { organizationId: org?.id } });
    await prisma.portfolioManagerSyncState.deleteMany({ where: { organizationId: org?.id } });
    await prisma.complianceSnapshot.deleteMany({ where: { organizationId: org?.id } });
    await prisma.energyReading.deleteMany({ where: { organizationId: org?.id } });
    await prisma.meter.deleteMany({ where: { organizationId: org?.id } });
    await prisma.filingPacket.deleteMany({ where: { organizationId: org?.id } });
    await prisma.benchmarkPacket.deleteMany({ where: { organizationId: org?.id } });
    await prisma.filingRecord.deleteMany({ where: { organizationId: org?.id } });
    await prisma.benchmarkSubmission.deleteMany({ where: { organizationId: org?.id } });
    await prisma.complianceRun.deleteMany({ where: { organizationId: org?.id } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: org?.id } });
    await prisma.user.deleteMany({ where: { id: user?.id } });
    await prisma.building.deleteMany({ where: { organizationId: org?.id } });
    await prisma.organization.deleteMany({ where: { id: org?.id } });
    await prisma.sourceArtifact.deleteMany({
      where: {
        metadata: {
          path: ["scope"],
          equals: scope,
        },
      },
    });
  });

  it("reconciles benchmark workflows into review and enforces valid manual transitions", async () => {
    await generateBenchmarkPacket({
      organizationId: org.id,
      buildingId: building.id,
      reportingYear: 2025,
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `benchmark-generate-${scope}`,
    });

    await finalizeBenchmarkPacket({
      organizationId: org.id,
      buildingId: building.id,
      reportingYear: 2025,
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `benchmark-finalize-${scope}`,
    });

    const caller = createCaller(`benchmark-workflow-${scope}`);
    const workspace = await caller.building.getArtifactWorkspace({
      buildingId: building.id,
    });
    const workflowId = workspace.benchmarkVerification.submissionWorkflow?.id;

    expect(workspace.benchmarkVerification.submissionWorkflow).toMatchObject({
      state: "READY_FOR_REVIEW",
    });
    expect(workspace.benchmarkVerification.submissionWorkflow?.allowedTransitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nextState: "APPROVED_FOR_SUBMISSION" }),
      ]),
    );
    expect(workflowId).toBeTruthy();

    const approved = await caller.building.transitionSubmissionWorkflow({
      buildingId: building.id,
      workflowId: workflowId!,
      nextState: "APPROVED_FOR_SUBMISSION",
    });

    expect(approved).toMatchObject({
      state: "APPROVED_FOR_SUBMISSION",
    });
    expect(approved?.history[0]?.toState).toBe("APPROVED_FOR_SUBMISSION");

    const [buildingDetail, worklist] = await Promise.all([
      caller.building.get({ id: building.id }),
      caller.building.portfolioWorklist({
        search: "Submission Workflow Building",
      }),
    ]);

    expect(buildingDetail.governedSummary.submissionSummary.benchmark?.state).toBe(
      "APPROVED_FOR_SUBMISSION",
    );
    expect(worklist.items[0]?.submission.benchmark.state).toBe("APPROVED_FOR_SUBMISSION");
  });

  it("rejects invalid manual transitions from draft workflows", async () => {
    await generateBepsFilingPacket({
      organizationId: org.id,
      buildingId: building.id,
      filingRecordId,
      packetType: "COMPLETED_ACTIONS",
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `beps-generate-${scope}`,
    });

    const caller = createCaller(`beps-invalid-transition-${scope}`);
    const workspace = await caller.building.getArtifactWorkspace({
      buildingId: building.id,
    });
    const workflowId = workspace.bepsFiling.submissionWorkflow?.id;

    expect(workspace.bepsFiling.submissionWorkflow?.state).toBe("DRAFT");

    await expect(
      caller.building.transitionSubmissionWorkflow({
        buildingId: building.id,
        workflowId: workflowId!,
        nextState: "APPROVED_FOR_SUBMISSION",
      }),
    ).rejects.toThrow("cannot transition");
  });

  it("supersedes prior BEPS submission candidates when a newer governed artifact version is generated", async () => {
    const caller = createCaller(`beps-supersession-${scope}`);

    await finalizeBepsFilingPacket({
      organizationId: org.id,
      buildingId: building.id,
      filingRecordId,
      packetType: "COMPLETED_ACTIONS",
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `beps-finalize-${scope}`,
    });

    const firstWorkspace = await caller.building.getArtifactWorkspace({
      buildingId: building.id,
    });
    const firstWorkflowId = firstWorkspace.bepsFiling.submissionWorkflow?.id;

    expect(firstWorkspace.bepsFiling.submissionWorkflow?.state).toBe("READY_FOR_REVIEW");

    await caller.building.transitionSubmissionWorkflow({
      buildingId: building.id,
      workflowId: firstWorkflowId!,
      nextState: "APPROVED_FOR_SUBMISSION",
    });

    await prisma.bepsRequestItem.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        filingRecordId,
        complianceCycle: "CYCLE_1",
        filingYear: 2026,
        packetType: "COMPLETED_ACTIONS",
        category: "COMPLETED_ACTIONS_EVIDENCE",
        title: "Updated evidence",
        status: "REQUESTED",
        isRequired: true,
        createdByType: "USER",
        createdById: user.clerkUserId,
      },
    });

    const regenerated = await generateBepsFilingPacket({
      organizationId: org.id,
      buildingId: building.id,
      filingRecordId,
      packetType: "COMPLETED_ACTIONS",
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `beps-regenerate-${scope}`,
    });

    expect(regenerated.version).toBe(2);
    expect(regenerated.status).toBe("GENERATED");

    const latestWorkspace = await caller.building.getArtifactWorkspace({
      buildingId: building.id,
    });
    const workflows = await prisma.submissionWorkflow.findMany({
      where: {
        organizationId: org.id,
        buildingId: building.id,
        workflowType: "BEPS_FILING",
      },
      orderBy: [{ createdAt: "asc" }],
    });
    const supersessionAudit = await prisma.auditLog.findFirst({
      where: {
        organizationId: org.id,
        buildingId: building.id,
        action: "SUBMISSION_WORKFLOW_SUPERSEDED",
      },
    });

    expect(latestWorkspace.bepsFiling.submissionWorkflow).toMatchObject({
      state: "DRAFT",
    });
    expect(workflows).toHaveLength(2);
    expect(workflows[0]).toMatchObject({
      state: "SUPERSEDED",
    });
    expect(workflows[1]).toMatchObject({
      state: "DRAFT",
    });
    expect(workflows[0]?.supersededById).toBe(workflows[1]?.id ?? null);
    expect(supersessionAudit).not.toBeNull();
  });
});
