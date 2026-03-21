import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { appRouter } from "@/server/trpc/routers";
import { markBenchmarkPacketsStaleTx } from "@/server/compliance/benchmark-packets";
import {
  exportBepsFilingPacket,
  finalizeBepsFilingPacket,
  generateBepsFilingPacket,
  markBepsFilingPacketsStaleTx,
} from "@/server/compliance/beps";

describe("governed compliance artifact workflow", () => {
  const scope = `compliance-artifacts-${Date.now()}`;

  let org: { id: string; clerkOrgId: string };
  let user: { id: string; clerkUserId: string };
  let building: { id: string };
  let benchmarkRuleVersion: { id: string };
  let benchmarkFactorSetVersion: { id: string };
  let bepsRuleVersion: { id: string };
  let bepsFactorSetVersion: { id: string };
  let benchmarkComplianceRun: { id: string };
  let bepsComplianceRun: { id: string };
  let benchmarkSubmission: { id: string };
  let bepsFiling: { id: string };

  function createCaller(requestId: string) {
    return appRouter.createCaller({
      requestId,
      clerkUserId: user.clerkUserId,
      clerkOrgId: org.clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  function toInputJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
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
        ruleVersionId: benchmarkRuleVersion.id,
        ruleVersion: "artifact-test-benchmark-v1",
        factorSetKey: "DC_CURRENT_STANDARDS",
        factorSetVersionId: benchmarkFactorSetVersion.id,
        factorSetVersion: "artifact-test-factors-v1",
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
        reportingYear: filingYear,
        rulePackageKey: "DC_BEPS_CYCLE_1",
        ruleVersionId: bepsRuleVersion.id,
        ruleVersion: "artifact-test-beps-v1",
        factorSetKey: "DC_CURRENT_STANDARDS",
        factorSetVersionId: bepsFactorSetVersion.id,
        factorSetVersion: "artifact-test-factors-v1",
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
          currentScore: 62,
          targetScore: 75,
          propertyType: "OFFICE",
          ownershipType: "PRIVATE",
          scoreEligible: true,
        },
        pathwayResults: {
          standardTarget: {
            metricBasis: "ENERGY_STAR_SCORE",
            currentValue: 62,
            targetValue: 75,
            gap: 13,
          },
        },
        alternativeCompliance: {
          recommended: {
            pathway: "STANDARD_TARGET",
            amountDue: 240000,
          },
          standardTarget: {
            amountDue: 240000,
          },
        },
        governance: {
          rulePackageKey: "DC_BEPS_CYCLE_1",
          ruleVersion: "artifact-test-beps-v1",
          factorSetKey: "DC_CURRENT_STANDARDS",
          factorSetVersion: "artifact-test-factors-v1",
        },
      },
    };
  }

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "LAW",
        name: `Artifact source ${scope}`,
        externalUrl: "https://example.com/artifact-source",
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const benchmarkRulePackage = await prisma.rulePackage.upsert({
      where: { key: "DC_BENCHMARKING_2025" },
      update: { name: "DC Benchmarking Annual Submission Workflow" },
      create: {
        key: "DC_BENCHMARKING_2025",
        name: "DC Benchmarking Annual Submission Workflow",
      },
    });

    const bepsRulePackage = await prisma.rulePackage.upsert({
      where: { key: "DC_BEPS_CYCLE_1" },
      update: { name: "DC BEPS Cycle 1 Workflow" },
      create: {
        key: "DC_BEPS_CYCLE_1",
        name: "DC BEPS Cycle 1 Workflow",
      },
    });

    benchmarkRuleVersion = await prisma.ruleVersion.upsert({
      where: {
        rulePackageId_version: {
          rulePackageId: benchmarkRulePackage.id,
          version: "artifact-test-benchmark-v1",
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
        version: "artifact-test-benchmark-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "benchmarking/readiness-v1",
        sourceArtifactId: sourceArtifact.id,
        configJson: {},
      },
      select: { id: true },
    });

    bepsRuleVersion = await prisma.ruleVersion.upsert({
      where: {
        rulePackageId_version: {
          rulePackageId: bepsRulePackage.id,
          version: "artifact-test-beps-v1",
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
        version: "artifact-test-beps-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        implementationKey: "compliance-engine/beps-v1",
        sourceArtifactId: sourceArtifact.id,
        configJson: {},
      },
      select: { id: true },
    });

    benchmarkFactorSetVersion = await prisma.factorSetVersion.upsert({
      where: {
        key_version: {
          key: "DC_CURRENT_STANDARDS",
          version: "artifact-test-factors-v1",
        },
      },
      update: {
        sourceArtifactId: sourceArtifact.id,
        status: "ACTIVE",
        factorsJson: {},
      },
      create: {
        key: "DC_CURRENT_STANDARDS",
        version: "artifact-test-factors-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        sourceArtifactId: sourceArtifact.id,
        factorsJson: {},
      },
      select: { id: true },
    });

    bepsFactorSetVersion = benchmarkFactorSetVersion;

    org = await prisma.organization.create({
      data: {
        clerkOrgId: `org_${scope}`,
        name: `Artifact Org ${scope}`,
        slug: `artifact-${scope}`,
      },
      select: { id: true, clerkOrgId: true },
    });

    user = await prisma.user.create({
      data: {
        clerkUserId: `user_${scope}`,
        email: `${scope}@example.com`,
        name: "Artifact User",
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
        name: `Artifact Building ${scope}`,
        address: "200 Artifact Way NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.02,
        grossSquareFeet: 50000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        doeeBuildingId: "RPUID-ARTIFACT-1",
        espmPropertyId: BigInt(333333),
        espmShareStatus: "LINKED",
        bepsTargetScore: 75,
      },
      select: { id: true },
    });

    benchmarkComplianceRun = await prisma.complianceRun.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        ruleVersionId: benchmarkRuleVersion.id,
        factorSetVersionId: benchmarkFactorSetVersion.id,
        runType: "BENCHMARKING_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "artifact:benchmark",
        inputSnapshotHash: `benchmark-${scope}`,
        resultPayload: {},
        producedByType: "SYSTEM",
        producedById: "test",
        executedAt: new Date("2026-03-18T10:00:00.000Z"),
      },
      select: { id: true },
    });

    bepsComplianceRun = await prisma.complianceRun.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        ruleVersionId: bepsRuleVersion.id,
        factorSetVersionId: bepsFactorSetVersion.id,
        runType: "BEPS_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: "artifact:beps",
        inputSnapshotHash: `beps-${scope}`,
        resultPayload: {},
        producedByType: "SYSTEM",
        producedById: "test",
        executedAt: new Date("2026-03-18T11:00:00.000Z"),
      },
      select: { id: true },
    });

    benchmarkSubmission = await prisma.benchmarkSubmission.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        reportingYear: 2025,
        ruleVersionId: benchmarkRuleVersion.id,
        factorSetVersionId: benchmarkFactorSetVersion.id,
        complianceRunId: benchmarkComplianceRun.id,
        status: "READY",
        readinessEvaluatedAt: new Date("2026-03-18T09:00:00.000Z"),
        submissionPayload: toInputJson(createBenchmarkPayload(2025)),
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    await prisma.benchmarkPacket.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        benchmarkSubmissionId: benchmarkSubmission.id,
        reportingYear: 2025,
        version: 1,
        status: "FINALIZED",
        packetHash: `benchmark-packet-${scope}`,
        packetPayload: toInputJson({
          packetSummary: { disposition: "READY" },
          warnings: [],
          blockers: [],
        }),
        generatedAt: new Date("2026-03-18T12:00:00.000Z"),
        finalizedAt: new Date("2026-03-18T12:15:00.000Z"),
        createdByType: "SYSTEM",
        createdById: "test",
        finalizedByType: "SYSTEM",
        finalizedById: "test",
      },
    });

    bepsFiling = await prisma.filingRecord.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        complianceRunId: bepsComplianceRun.id,
        status: "GENERATED",
        filingPayload: toInputJson(createBepsPayload(2026)),
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await prisma.reportArtifact.deleteMany({ where: { organizationId: org?.id } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org?.id } });
    await prisma.submissionWorkflowEvent.deleteMany({ where: { organizationId: org?.id } });
    await prisma.submissionWorkflow.deleteMany({ where: { organizationId: org?.id } });
    await prisma.filingPacket.deleteMany({ where: { organizationId: org?.id } });
    await prisma.benchmarkPacket.deleteMany({ where: { organizationId: org?.id } });
    await prisma.filingRecord.deleteMany({ where: { organizationId: org?.id } });
    await prisma.benchmarkSubmission.deleteMany({ where: { organizationId: org?.id } });
    await prisma.complianceRun.deleteMany({ where: { organizationId: org?.id } });
    await prisma.portfolioManagerSyncState.deleteMany({ where: { organizationId: org?.id } });
    await prisma.building.deleteMany({ where: { organizationId: org?.id } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: org?.id } });
    await prisma.user.deleteMany({ where: { id: user?.id } });
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

  it("generates, finalizes, exports, and versions governed BEPS artifacts without mutating finalized history", async () => {
    const generated = await generateBepsFilingPacket({
      organizationId: org.id,
      buildingId: building.id,
      filingRecordId: bepsFiling.id,
      packetType: "COMPLETED_ACTIONS",
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `artifact-generate-${scope}`,
    });

    expect(generated.version).toBe(1);
    expect(generated.status).toBe("GENERATED");

    const finalized = await finalizeBepsFilingPacket({
      organizationId: org.id,
      buildingId: building.id,
      filingRecordId: bepsFiling.id,
      packetType: "COMPLETED_ACTIONS",
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `artifact-finalize-${scope}`,
    });

    expect(finalized.status).toBe("FINALIZED");
    expect(finalized.finalizedAt).not.toBeNull();

    const exported = await exportBepsFilingPacket({
      organizationId: org.id,
      buildingId: building.id,
      filingRecordId: bepsFiling.id,
      packetType: "COMPLETED_ACTIONS",
      format: "JSON",
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `artifact-export-${scope}`,
    });

    expect(exported.format).toBe("JSON");
    expect(exported.fileName).toContain("packet-v1");

    await prisma.$transaction((tx) =>
      markBepsFilingPacketsStaleTx(tx, {
        filingRecordId: bepsFiling.id,
      }),
    );

    const finalizedStillLocked = await prisma.filingPacket.findUniqueOrThrow({
      where: { id: finalized.id },
    });
    expect(finalizedStillLocked.status).toBe("FINALIZED");

    await prisma.bepsRequestItem.create({
      data: {
        organizationId: org.id,
        buildingId: building.id,
        filingRecordId: bepsFiling.id,
        complianceCycle: "CYCLE_1",
        filingYear: 2026,
        packetType: "COMPLETED_ACTIONS",
        category: "COMPLETED_ACTIONS_EVIDENCE",
        title: "Completed actions evidence",
        status: "REQUESTED",
        isRequired: true,
        createdByType: "USER",
        createdById: user.clerkUserId,
      },
    });

    const regenerated = await generateBepsFilingPacket({
      organizationId: org.id,
      buildingId: building.id,
      filingRecordId: bepsFiling.id,
      packetType: "COMPLETED_ACTIONS",
      createdByType: "USER",
      createdById: user.clerkUserId,
      requestId: `artifact-regenerate-${scope}`,
    });

    expect(regenerated.version).toBe(2);
    expect(regenerated.status).toBe("GENERATED");

    const originalFinalized = await prisma.filingPacket.findUniqueOrThrow({
      where: { id: finalized.id },
    });
    expect(originalFinalized.status).toBe("FINALIZED");

    const exportAuditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        buildingId: building.id,
        action: {
          in: [
            "COMPLIANCE_ARTIFACT_GENERATED",
            "COMPLIANCE_ARTIFACT_FINALIZED",
            "COMPLIANCE_ARTIFACT_EXPORTED",
          ],
        },
      },
      orderBy: [{ timestamp: "asc" }],
    });

    expect(exportAuditLogs.map((log) => log.action)).toContain("COMPLIANCE_ARTIFACT_GENERATED");
    expect(exportAuditLogs.map((log) => log.action)).toContain("COMPLIANCE_ARTIFACT_FINALIZED");
    expect(exportAuditLogs.map((log) => log.action)).toContain("COMPLIANCE_ARTIFACT_EXPORTED");
  });

  it("keeps finalized benchmark artifacts immutable and exposes a stable artifact workspace contract", async () => {
    await prisma.$transaction((tx) =>
      markBenchmarkPacketsStaleTx(tx, {
        organizationId: org.id,
        buildingId: building.id,
        benchmarkSubmissionId: benchmarkSubmission.id,
      }),
    );

    const benchmarkPacket = await prisma.benchmarkPacket.findFirstOrThrow({
      where: {
        organizationId: org.id,
        buildingId: building.id,
      },
    });
    expect(benchmarkPacket.status).toBe("FINALIZED");

    const workspace = await createCaller(`artifact-workspace-${scope}`).building.getArtifactWorkspace({
      buildingId: building.id,
    });

    expect(workspace.benchmarkVerification.latestArtifact).toMatchObject({
      version: 1,
      status: "FINALIZED",
    });
    expect(workspace.bepsFiling.latestArtifact).toMatchObject({
      version: 2,
      status: "GENERATED",
    });
    expect(workspace.bepsFiling.latestArtifact?.lastExportFormat).toBeNull();
    expect(workspace.bepsFiling.submissionWorkflow).toMatchObject({
      state: "DRAFT",
    });
    expect(workspace.bepsFiling.submissionWorkflow?.allowedTransitions).toHaveLength(0);
    expect(workspace.benchmarkVerification.sourceRecordId).toBe(benchmarkSubmission.id);
    expect(workspace.bepsFiling.sourceRecordId).toBe(bepsFiling.id);
    expect((workspace as unknown as Record<string, unknown>).submissionPayload).toBeUndefined();
    expect((workspace as unknown as Record<string, unknown>).filingPayload).toBeUndefined();

    const report = await createCaller(`artifact-report-${scope}`).report.getComplianceReport({
      buildingId: building.id,
    });

    expect(report.sections.artifacts.benchmark.latestArtifactStatus).toBe("FINALIZED");
    expect(report.sections.artifacts.beps.latestArtifactStatus).toBe("GENERATED");
    expect(report.evidencePackage.packageVersion).toBe("governed-report-evidence-v1");
    expect(report.evidencePackage.artifacts.benchmark.sourceRecordId).toBe(
      benchmarkSubmission.id,
    );
    expect(report.evidencePackage.artifacts.beps.sourceRecordId).toBe(bepsFiling.id);
    expect(report.evidencePackage.artifacts.beps.latestExport).toMatchObject({
      artifactId: expect.any(String),
      format: "JSON",
      version: 1,
    });
    expect((report as unknown as Record<string, unknown>).submissionPayload).toBeUndefined();
    expect((report as unknown as Record<string, unknown>).filingPayload).toBeUndefined();
  });

  it("persists governed compliance report artifacts with reusable export lineage", async () => {
    const caller = createCaller(`report-artifact-${scope}`);

    const generated = await caller.report.generateComplianceReportArtifact({
      buildingId: building.id,
    });

    expect(generated.reportType).toBe("COMPLIANCE_REPORT");
    expect(generated.version).toBe(1);
    expect(generated.latestExportedAt).toBeNull();

    const artifactWorkspace = await caller.report.getComplianceReportArtifacts({
      buildingId: building.id,
    });

    expect(artifactWorkspace.latestArtifact?.id).toBe(generated.id);
    expect(artifactWorkspace.history[0]?.version).toBe(1);
    expect(artifactWorkspace.latestArtifact?.sourceLineage.bepsSourceRecordId).toBe(
      bepsFiling.id,
    );

    const persistedReport = await caller.report.getComplianceReport({
      buildingId: building.id,
    });

    expect(persistedReport.sections.artifacts.benchmark.latestArtifactStatus).toBe(
      "FINALIZED",
    );
    expect(persistedReport.evidencePackage.traceability.penaltyRunId).toBeNull();
    expect(persistedReport.evidencePackage.artifacts.beps.sourceRecordId).toBe(
      bepsFiling.id,
    );

    const exported = await caller.report.exportComplianceReportArtifact({
      buildingId: building.id,
      artifactId: generated.id,
      format: "JSON",
    });

    expect(exported.version).toBe(1);
    expect(exported.fileName).toContain("compliance_report-v1.json");
    expect(JSON.parse(exported.content)).toMatchObject({
      buildingId: building.id,
    });

    const exportedWorkspace = await caller.report.getComplianceReportArtifacts({
      buildingId: building.id,
    });
    expect(exportedWorkspace.latestArtifact?.latestExportFormat).toBe("JSON");
    expect(exportedWorkspace.latestArtifact?.latestExportedAt).not.toBeNull();

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        buildingId: building.id,
        action: {
          in: ["REPORT_ARTIFACT_GENERATED", "REPORT_ARTIFACT_EXPORTED"],
        },
      },
      orderBy: { timestamp: "asc" },
      select: { action: true },
    });

    expect(auditActions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["REPORT_ARTIFACT_GENERATED", "REPORT_ARTIFACT_EXPORTED"]),
    );
  });

  it("persists governed exemption report artifacts with reusable export lineage", async () => {
    const caller = createCaller(`exemption-report-artifact-${scope}`);

    const generated = await caller.report.generateExemptionReportArtifact({
      buildingId: building.id,
    });

    expect(generated.reportType).toBe("EXEMPTION_REPORT");
    expect(generated.version).toBe(1);
    expect(generated.latestExportedAt).toBeNull();

    const artifactWorkspace = await caller.report.getExemptionReportArtifacts({
      buildingId: building.id,
    });

    expect(artifactWorkspace.latestArtifact?.id).toBe(generated.id);
    expect(artifactWorkspace.history[0]?.version).toBe(1);
    expect(artifactWorkspace.latestArtifact?.sourceLineage.bepsSourceRecordId).toBe(
      bepsFiling.id,
    );

    const persistedReport = await caller.report.getExemptionReport({
      buildingId: building.id,
    });

    expect(persistedReport.buildingId).toBe(building.id);
    expect(persistedReport.penaltyContext.currentEstimateStatus).toBe(
      "INSUFFICIENT_CONTEXT",
    );

    const exported = await caller.report.exportExemptionReportArtifact({
      buildingId: building.id,
      artifactId: generated.id,
      format: "JSON",
    });

    expect(exported.version).toBe(1);
    expect(exported.fileName).toContain("exemption_report-v1.json");
    expect(JSON.parse(exported.content)).toMatchObject({
      buildingId: building.id,
    });

    const exportedWorkspace = await caller.report.getExemptionReportArtifacts({
      buildingId: building.id,
    });
    expect(exportedWorkspace.latestArtifact?.latestExportFormat).toBe("JSON");
    expect(exportedWorkspace.latestArtifact?.latestExportedAt).not.toBeNull();

    const auditActions = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        buildingId: building.id,
        action: {
          in: ["REPORT_ARTIFACT_GENERATED", "REPORT_ARTIFACT_EXPORTED"],
        },
      },
      orderBy: { timestamp: "asc" },
      select: { action: true },
    });

    expect(auditActions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["REPORT_ARTIFACT_GENERATED", "REPORT_ARTIFACT_EXPORTED"]),
    );
  });
});
