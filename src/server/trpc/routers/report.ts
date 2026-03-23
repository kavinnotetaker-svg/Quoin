import { z } from "zod";
import { tenantProcedure, router, operatorProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import {
  getLatestComplianceSnapshot,
  LATEST_SNAPSHOT_ORDER,
} from "@/server/lib/compliance-snapshots";
import { dedupeEnergyReadings } from "@/server/lib/energy-readings";
import { getBuildingGovernedOperationalSummary } from "@/server/compliance/governed-operational-summary";
import {
  screenForExemptions,
  type FinancialDistressIndicators,
} from "@/server/pipelines/pathway-analysis/exemption-screener";
import {
  getGovernedPublicationOverview,
  markFactorSetVersionCandidate,
  markRuleVersionCandidate,
  publishGovernedPublicationRun,
  validateFactorSetVersionCandidate,
  validateRuleVersionCandidate,
} from "@/server/compliance/rule-publication";
import {
  getBuildingArtifactWorkspace,
  type ArtifactExportFormat,
  type OperationalArtifactWorkflow,
} from "@/server/compliance/compliance-artifacts";
import {
  createReportArtifact,
  getLatestReportArtifact,
  getReportArtifactWorkspace,
  markReportArtifactExported,
  renderReportArtifactExport,
  type GovernedReportArtifactLineage,
} from "@/server/compliance/report-artifacts";
import { prisma } from "@/server/lib/db";

/**
 * Report tRPC Router
 *
 * Generates compliance reports and exemption filing documentation.
 * Actual PDF rendering uses Playwright .pdf() from HTML templates (Phase B).
 * This router assembles the data needed for those templates.
 */

const governedPenaltySummarySchema = z.object({
  status: z.enum(["ESTIMATED", "NOT_APPLICABLE", "INSUFFICIENT_CONTEXT"]),
  currentEstimatedPenalty: z.number().nullable(),
  calculatedAt: z.string(),
  basis: z.object({
    label: z.string(),
    explanation: z.string(),
  }),
  governingContext: z.object({
    filingYear: z.number().nullable(),
    complianceCycle: z.string().nullable(),
    ruleVersion: z.string().nullable(),
    basisPathway: z.string().nullable(),
  }),
  timestamps: z.object({
    lastReadinessEvaluatedAt: z.string().nullable(),
    lastComplianceEvaluatedAt: z.string().nullable(),
    lastPacketGeneratedAt: z.string().nullable(),
    lastPacketFinalizedAt: z.string().nullable(),
  }),
  scenarios: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      estimatedPenalty: z.number(),
      deltaFromCurrent: z.number(),
    }),
  ),
}).nullable();

const governedEvaluationSummarySchema = z.object({
  scope: z.enum(["BENCHMARKING", "BEPS"]),
  recordId: z.string(),
  status: z.string().nullable(),
  applicability: z.string().nullable(),
  qaVerdict: z.string().nullable(),
  ruleVersion: z.string().nullable(),
  metricUsed: z.string().nullable(),
  reasonCodes: z.array(z.string()),
  reasonSummary: z.string(),
  decision: z.object({
    meetsStandard: z.boolean().nullable(),
    blocked: z.boolean(),
    insufficientData: z.boolean(),
  }),
  reportingYear: z.number().nullable(),
  filingYear: z.number().nullable(),
  complianceCycle: z.string().nullable(),
  complianceRunId: z.string().nullable(),
  lastComplianceEvaluatedAt: z.string().nullable(),
}).nullable();

const governedArtifactSummarySchema = z.object({
  scope: z.enum(["BENCHMARKING", "BEPS"]),
  sourceRecordId: z.string().nullable(),
  sourceRecordStatus: z.string().nullable(),
  latestArtifactId: z.string().nullable(),
  latestArtifactStatus: z.enum([
    "NOT_STARTED",
    "DRAFT",
    "GENERATED",
    "STALE",
    "FINALIZED",
  ]),
  reportingYear: z.number().nullable(),
  filingYear: z.number().nullable(),
  complianceCycle: z.string().nullable(),
  lastGeneratedAt: z.string().nullable(),
  lastFinalizedAt: z.string().nullable(),
});

const governedSubmissionWorkflowSummarySchema = z.object({
  id: z.string(),
  workflowType: z.enum(["BENCHMARK_VERIFICATION", "BEPS_FILING"]),
  state: z.enum([
    "NOT_STARTED",
    "DRAFT",
    "READY_FOR_REVIEW",
    "APPROVED_FOR_SUBMISSION",
    "SUBMITTED",
    "COMPLETED",
    "NEEDS_CORRECTION",
    "SUPERSEDED",
  ]),
  linkedArtifactId: z.string().nullable(),
  linkedArtifactVersion: z.number().nullable(),
  linkedArtifactStatus: z.string().nullable(),
  latestTransitionAt: z.string().nullable(),
  readyForReviewAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  needsCorrectionAt: z.string().nullable(),
  supersededAt: z.string().nullable(),
  supersededById: z.string().nullable(),
  latestNotes: z.string().nullable(),
  allowedTransitions: z.array(
    z.object({
      nextState: z.enum([
        "READY_FOR_REVIEW",
        "APPROVED_FOR_SUBMISSION",
        "SUBMITTED",
        "COMPLETED",
        "NEEDS_CORRECTION",
      ]),
      label: z.string(),
    }),
  ),
  nextAction: z.object({
    title: z.string(),
    reason: z.string(),
  }),
}).nullable();

const governedOperationalSummarySchema = z.object({
  buildingId: z.string(),
  readinessSummary: z.object({
    state: z.enum([
      "DATA_INCOMPLETE",
      "READY_FOR_REVIEW",
      "READY_TO_SUBMIT",
      "SUBMITTED",
    ]),
    blockingIssueCount: z.number(),
    warningIssueCount: z.number(),
    primaryStatus: z.string(),
    qaVerdict: z.string().nullable(),
    reasonCodes: z.array(z.string()),
    reasonSummary: z.string(),
    nextAction: z.object({
      title: z.string(),
      reason: z.string(),
      href: z.string(),
    }),
    lastReadinessEvaluatedAt: z.string().nullable(),
    lastComplianceEvaluatedAt: z.string().nullable(),
    lastPacketGeneratedAt: z.string().nullable(),
    lastPacketFinalizedAt: z.string().nullable(),
    evaluations: z.object({
      benchmark: governedEvaluationSummarySchema,
      beps: governedEvaluationSummarySchema,
    }),
    artifacts: z.object({
      benchmarkSubmission: z.object({
        id: z.string(),
        status: z.string(),
        reportingYear: z.number(),
        complianceRunId: z.string().nullable(),
        lastReadinessEvaluatedAt: z.string().nullable(),
        lastComplianceEvaluatedAt: z.string().nullable(),
      }).nullable(),
      benchmarkPacket: z.object({
        id: z.string(),
        status: z.string(),
        reportingYear: z.number().nullable(),
        filingYear: z.number().nullable(),
        complianceCycle: z.string().nullable(),
        generatedAt: z.string(),
        finalizedAt: z.string().nullable(),
      }).nullable(),
      bepsFiling: z.object({
        id: z.string(),
        status: z.string(),
        filingYear: z.number().nullable(),
        complianceCycle: z.string().nullable(),
        complianceRunId: z.string().nullable(),
        lastComplianceEvaluatedAt: z.string().nullable(),
      }).nullable(),
      bepsPacket: z.object({
        id: z.string(),
        status: z.string(),
        reportingYear: z.number().nullable(),
        filingYear: z.number().nullable(),
        complianceCycle: z.string().nullable(),
        generatedAt: z.string(),
        finalizedAt: z.string().nullable(),
      }).nullable(),
    }),
  }),
  activeIssueCounts: z.object({
    blocking: z.number(),
    warning: z.number(),
  }),
  complianceSummary: z.object({
    primaryStatus: z.string(),
    qaVerdict: z.string().nullable(),
    reasonCodes: z.array(z.string()),
    reasonSummary: z.string(),
    benchmark: governedEvaluationSummarySchema,
    beps: governedEvaluationSummarySchema,
  }),
  penaltySummary: governedPenaltySummarySchema,
  artifactSummary: z.object({
    benchmark: governedArtifactSummarySchema,
    beps: governedArtifactSummarySchema,
  }),
  submissionSummary: z.object({
    benchmark: governedSubmissionWorkflowSummarySchema,
    beps: governedSubmissionWorkflowSummarySchema,
  }),
  timestamps: z.object({
    lastReadinessEvaluatedAt: z.string().nullable(),
    lastComplianceEvaluatedAt: z.string().nullable(),
    lastPenaltyCalculatedAt: z.string().nullable(),
    lastArtifactGeneratedAt: z.string().nullable(),
    lastArtifactFinalizedAt: z.string().nullable(),
    lastSubmissionTransitionAt: z.string().nullable(),
  }),
});

const reportArtifactEvidenceSchema = z.object({
  kind: z.string(),
  label: z.string(),
  sourceRecordId: z.string().nullable(),
  artifactStatus: z.string(),
  disposition: z.string().nullable(),
  blockersCount: z.number(),
  warningCount: z.number(),
  latestArtifact: z.object({
    id: z.string(),
    version: z.number(),
    status: z.string(),
    packetHash: z.string(),
    generatedAt: z.string(),
    finalizedAt: z.string().nullable(),
    exportAvailable: z.boolean(),
    lastExportedAt: z.string().nullable(),
    lastExportFormat: z.enum(["JSON", "MARKDOWN", "PDF"]).nullable(),
  }).nullable(),
  latestExport: z.object({
    artifactId: z.string(),
    version: z.number(),
    exportedAt: z.string(),
    format: z.enum(["JSON", "MARKDOWN", "PDF"]).nullable(),
  }).nullable(),
  workflow: z.object({
    id: z.string(),
    state: z.string(),
    latestTransitionAt: z.string().nullable(),
    nextActionTitle: z.string(),
    nextActionReason: z.string(),
  }).nullable(),
  sourceContext: z.object({
    readinessState: z.string(),
    primaryStatus: z.string(),
    qaVerdict: z.string().nullable(),
    reasonSummary: z.string(),
    reportingYear: z.number().nullable(),
    filingYear: z.number().nullable(),
    complianceCycle: z.string().nullable(),
    complianceRunId: z.string().nullable(),
    readinessEvaluatedAt: z.string().nullable(),
    complianceEvaluatedAt: z.string().nullable(),
    penaltyRunId: z.string().nullable(),
    penaltyEstimatedAt: z.string().nullable(),
    currentEstimatedPenalty: z.number().nullable(),
  }),
});

const reportSectionsSchema = z.object({
  compliance: z.object({
    readinessState: z.string(),
    primaryStatus: z.string(),
    qaVerdict: z.string().nullable(),
    reasonSummary: z.string(),
    nextAction: z.object({
      title: z.string(),
      reason: z.string(),
      href: z.string(),
    }),
    latestSnapshot: z.object({
      snapshotDate: z.string().nullable(),
      energyStarScore: z.number().nullable(),
      siteEui: z.number().nullable(),
      sourceEui: z.number().nullable(),
      weatherNormalizedSiteEui: z.number().nullable(),
      complianceGap: z.number().nullable(),
      dataQualityScore: z.number().nullable(),
    }),
    benchmarkEvaluation: governedEvaluationSummarySchema,
    bepsEvaluation: governedEvaluationSummarySchema,
  }),
  penalty: z.object({
    status: z.enum(["ESTIMATED", "NOT_APPLICABLE", "INSUFFICIENT_CONTEXT"]),
    currentEstimatedPenalty: z.number().nullable(),
    calculatedAt: z.string().nullable(),
    basisLabel: z.string(),
    basisExplanation: z.string(),
    filingYear: z.number().nullable(),
    complianceCycle: z.string().nullable(),
    basisPathway: z.string().nullable(),
    scenarios: z.array(
      z.object({
        code: z.string(),
        label: z.string(),
        estimatedPenalty: z.number(),
        deltaFromCurrent: z.number(),
      }),
    ),
  }),
  artifacts: z.object({
    benchmark: z.object({
      latestArtifactStatus: z.string(),
      workflowState: z.string(),
      disposition: z.string().nullable(),
      lastGeneratedAt: z.string().nullable(),
      lastFinalizedAt: z.string().nullable(),
      lastExportedAt: z.string().nullable(),
      lastExportFormat: z.enum(["JSON", "MARKDOWN", "PDF"]).nullable(),
      blockersCount: z.number(),
      warningCount: z.number(),
    }),
    beps: z.object({
      latestArtifactStatus: z.string(),
      workflowState: z.string(),
      disposition: z.string().nullable(),
      lastGeneratedAt: z.string().nullable(),
      lastFinalizedAt: z.string().nullable(),
      lastExportedAt: z.string().nullable(),
      lastExportFormat: z.enum(["JSON", "MARKDOWN", "PDF"]).nullable(),
      blockersCount: z.number(),
      warningCount: z.number(),
    }),
  }),
  sourceData: z.object({
    reconciliationStatus: z.string().nullable(),
    canonicalSource: z.string().nullable(),
    conflictCount: z.number(),
    incompleteCount: z.number(),
    lastReconciledAt: z.string().nullable(),
    runtimeNeedsAttention: z.boolean(),
    runtimeAttentionCount: z.number(),
    runtimeNextActionTitle: z.string().nullable(),
    runtimeNextActionReason: z.string().nullable(),
    portfolioManagerState: z.string(),
    greenButtonState: z.string(),
  }),
  anomalyRisk: z.object({
    activeCount: z.number(),
    highSeverityCount: z.number(),
    totalEstimatedEnergyImpactKbtu: z.number().nullable(),
    totalEstimatedPenaltyImpactUsd: z.number().nullable(),
    penaltyImpactStatus: z.string(),
    highestPriority: z.string().nullable(),
    latestDetectedAt: z.string().nullable(),
    topFindings: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        severity: z.string(),
        confidenceBand: z.string(),
        explanation: z.string(),
        estimatedEnergyImpactKbtu: z.number().nullable(),
        estimatedPenaltyImpactUsd: z.number().nullable(),
        penaltyImpactStatus: z.string(),
      }),
    ),
  }),
  retrofits: z.object({
    activeCount: z.number(),
    highestPriorityBand: z.string().nullable(),
    topOpportunity: z.object({
      candidateId: z.string(),
      name: z.string(),
      priorityBand: z.string(),
      priorityScore: z.number(),
      estimatedAvoidedPenalty: z.number().nullable(),
      estimatedAvoidedPenaltyStatus: z.string(),
      estimatedOperationalRiskReductionPenalty: z.number().nullable(),
      basisSummary: z.string(),
    }).nullable(),
    opportunities: z.array(
      z.object({
        candidateId: z.string(),
        name: z.string(),
        priorityBand: z.string(),
        priorityScore: z.number(),
        estimatedAvoidedPenalty: z.number().nullable(),
        estimatedAvoidedPenaltyStatus: z.string(),
        netProjectCost: z.number(),
        estimatedOperationalRiskReductionPenalty: z.number().nullable(),
        basisSummary: z.string(),
      }),
    ),
  }),
});

const reportEvidencePackageSchema = z.object({
  packageVersion: z.literal("governed-report-evidence-v1"),
  generatedAt: z.string(),
  traceability: z.object({
    readinessState: z.string(),
    primaryStatus: z.string(),
    penaltyRunId: z.string().nullable(),
    penaltyCalculatedAt: z.string().nullable(),
    reconciliationStatus: z.string().nullable(),
    canonicalSource: z.string().nullable(),
    lastReadinessEvaluatedAt: z.string().nullable(),
    lastComplianceEvaluatedAt: z.string().nullable(),
    lastArtifactGeneratedAt: z.string().nullable(),
    lastArtifactFinalizedAt: z.string().nullable(),
    lastSubmissionTransitionAt: z.string().nullable(),
  }),
  artifacts: z.object({
    benchmark: reportArtifactEvidenceSchema,
    beps: reportArtifactEvidenceSchema,
  }),
});

const reportOutputSchema = z.object({
  buildingId: z.string(),
  buildingName: z.string(),
  address: z.string(),
  generatedAt: z.string(),
  governedPenalty: governedPenaltySummarySchema,
  governedOperationalSummary: governedOperationalSummarySchema,
  sections: reportSectionsSchema,
  evidencePackage: reportEvidencePackageSchema,
  energyHistory: z.array(
    z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
      consumptionKbtu: z.number(),
      meterType: z.string(),
      source: z.string(),
    }),
  ),
  pipelineRuns: z.array(
    z.object({
      id: z.string(),
      pipelineType: z.string(),
      status: z.string(),
      startedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
    }),
  ),
});

const reportArtifactLineageSchema = z.object({
  penaltyRunId: z.string().nullable(),
  benchmarkArtifactId: z.string().nullable(),
  bepsArtifactId: z.string().nullable(),
  benchmarkWorkflowId: z.string().nullable(),
  bepsWorkflowId: z.string().nullable(),
  benchmarkSourceRecordId: z.string().nullable(),
  bepsSourceRecordId: z.string().nullable(),
  lastReadinessEvaluatedAt: z.string().nullable(),
  lastComplianceEvaluatedAt: z.string().nullable(),
  lastArtifactGeneratedAt: z.string().nullable(),
  lastArtifactFinalizedAt: z.string().nullable(),
  lastSubmissionTransitionAt: z.string().nullable(),
});

const governedReportTypeSchema = z.enum([
  "COMPLIANCE_REPORT",
  "EXEMPTION_REPORT",
]);

const reportArtifactSummarySchema = z.object({
  id: z.string(),
  reportType: governedReportTypeSchema,
  version: z.number(),
  status: z.enum(["GENERATED"]),
  reportHash: z.string(),
  sourceSummaryHash: z.string(),
  generatedAt: z.string(),
  latestExportedAt: z.string().nullable(),
  latestExportFormat: z.enum(["JSON"]).nullable(),
  createdByType: z.enum(["SYSTEM", "USER"]),
  createdById: z.string().nullable(),
  sourceLineage: reportArtifactLineageSchema,
});

const reportArtifactWorkspaceSchema = z.object({
  buildingId: z.string(),
  reportType: governedReportTypeSchema,
  latestArtifact: reportArtifactSummarySchema.nullable(),
  history: z.array(reportArtifactSummarySchema),
});

const reportArtifactExportSchema = z.object({
  artifactId: z.string(),
  version: z.number(),
  format: z.enum(["JSON"]),
  exportedAt: z.string().nullable(),
  fileName: z.string(),
  contentType: z.string(),
  content: z.string(),
});

type ComplianceReportOutput = z.infer<typeof reportOutputSchema>;

function buildReportArtifactLineageFromGovernedSummary(
  governedSummary: z.infer<typeof governedOperationalSummarySchema>,
): GovernedReportArtifactLineage {
  const penaltyRunId =
    ((governedSummary.penaltySummary as { id?: string | null } | null)?.id ??
      null);

  return {
    penaltyRunId,
    benchmarkArtifactId:
      governedSummary.artifactSummary.benchmark?.latestArtifactId ?? null,
    bepsArtifactId:
      governedSummary.artifactSummary.beps?.latestArtifactId ?? null,
    benchmarkWorkflowId:
      governedSummary.submissionSummary.benchmark?.id ?? null,
    bepsWorkflowId: governedSummary.submissionSummary.beps?.id ?? null,
    benchmarkSourceRecordId:
      governedSummary.artifactSummary.benchmark?.sourceRecordId ?? null,
    bepsSourceRecordId:
      governedSummary.artifactSummary.beps?.sourceRecordId ?? null,
    lastReadinessEvaluatedAt:
      governedSummary.timestamps.lastReadinessEvaluatedAt,
    lastComplianceEvaluatedAt:
      governedSummary.timestamps.lastComplianceEvaluatedAt,
    lastArtifactGeneratedAt:
      governedSummary.timestamps.lastArtifactGeneratedAt,
    lastArtifactFinalizedAt:
      governedSummary.timestamps.lastArtifactFinalizedAt,
    lastSubmissionTransitionAt:
      governedSummary.timestamps.lastSubmissionTransitionAt,
  };
}

function toExportFormat(value: ArtifactExportFormat | null) {
  return value;
}

function buildArtifactEvidenceSection(workflow: OperationalArtifactWorkflow) {
  return {
    kind: workflow.kind,
    label: workflow.label,
    sourceRecordId: workflow.sourceRecordId,
    artifactStatus: workflow.status,
    disposition: workflow.disposition,
    blockersCount: workflow.blockersCount,
    warningCount: workflow.warningCount,
    latestArtifact: workflow.latestArtifact,
    latestExport: workflow.latestExport
      ? {
          artifactId: workflow.latestExport.artifactId,
          version: workflow.latestExport.version,
          exportedAt: workflow.latestExport.exportedAt,
          format: toExportFormat(workflow.latestExport.format),
        }
      : null,
    workflow: workflow.submissionWorkflow
      ? {
          id: workflow.submissionWorkflow.id,
          state: workflow.submissionWorkflow.state,
          latestTransitionAt: workflow.submissionWorkflow.latestTransitionAt,
          nextActionTitle: workflow.submissionWorkflow.nextAction.title,
          nextActionReason: workflow.submissionWorkflow.nextAction.reason,
        }
      : null,
    sourceContext: workflow.sourceContext,
  };
}

function buildComplianceReportArtifactLineage(
  report: ComplianceReportOutput,
): GovernedReportArtifactLineage {
  return {
    penaltyRunId: report.evidencePackage.traceability.penaltyRunId,
    benchmarkArtifactId:
      report.evidencePackage.artifacts.benchmark.latestArtifact?.id ?? null,
    bepsArtifactId:
      report.evidencePackage.artifacts.beps.latestArtifact?.id ?? null,
    benchmarkWorkflowId:
      report.governedOperationalSummary.submissionSummary.benchmark?.id ?? null,
    bepsWorkflowId:
      report.governedOperationalSummary.submissionSummary.beps?.id ?? null,
    benchmarkSourceRecordId:
      report.evidencePackage.artifacts.benchmark.sourceRecordId,
    bepsSourceRecordId: report.evidencePackage.artifacts.beps.sourceRecordId,
    lastReadinessEvaluatedAt:
      report.evidencePackage.traceability.lastReadinessEvaluatedAt,
    lastComplianceEvaluatedAt:
      report.evidencePackage.traceability.lastComplianceEvaluatedAt,
    lastArtifactGeneratedAt:
      report.evidencePackage.traceability.lastArtifactGeneratedAt,
    lastArtifactFinalizedAt:
      report.evidencePackage.traceability.lastArtifactFinalizedAt,
    lastSubmissionTransitionAt:
      report.evidencePackage.traceability.lastSubmissionTransitionAt,
  };
}

async function buildComplianceReportOutput(params: {
  tenantDb: {
    building: any;
    energyReading: any;
    pipelineRun: any;
    complianceSnapshot: any;
  };
  organizationId: string;
  buildingId: string;
}): Promise<ComplianceReportOutput> {
  const building = await params.tenantDb.building.findUnique({
    where: { id: params.buildingId },
  });
  if (!building) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Building not found",
    });
  }

  const latestSnapshot = await getLatestComplianceSnapshot(params.tenantDb, {
    buildingId: params.buildingId,
  });
  const [governedSummary, artifactWorkspace] = await Promise.all([
    getBuildingGovernedOperationalSummary({
      organizationId: params.organizationId,
      buildingId: params.buildingId,
    }),
    getBuildingArtifactWorkspace({
      organizationId: params.organizationId,
      buildingId: params.buildingId,
    }),
  ]);
  const penaltySummary = governedSummary.penaltySummary;

  const twoYearsAgo = new Date();
  twoYearsAgo.setMonth(twoYearsAgo.getMonth() - 24);

  const readings: Array<{
    id: string;
    periodStart: Date;
    periodEnd: Date;
    consumptionKbtu: number;
    meterType: string;
    source: string;
    meterId: string | null;
    ingestedAt: Date;
  }> = await params.tenantDb.energyReading.findMany({
    where: {
      buildingId: params.buildingId,
      periodStart: { gte: twoYearsAgo },
    },
    orderBy: [{ periodStart: "asc" }, { ingestedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      consumptionKbtu: true,
      meterType: true,
      source: true,
      meterId: true,
      ingestedAt: true,
    },
  });
  const dedupedReadings = dedupeEnergyReadings(readings);

  const runs: Array<{
    id: string;
    pipelineType: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
  }> = await params.tenantDb.pipelineRun.findMany({
    where: { buildingId: params.buildingId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      pipelineType: true,
      status: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const benchmarkEvidenceSection = buildArtifactEvidenceSection(
    artifactWorkspace.benchmarkVerification,
  );
  const bepsEvidenceSection = buildArtifactEvidenceSection(
    artifactWorkspace.bepsFiling,
  );

  return {
    buildingId: building.id,
    buildingName: building.name,
    address: building.address,
    generatedAt: new Date().toISOString(),
    governedPenalty: penaltySummary
      ? {
          status: penaltySummary.status,
          currentEstimatedPenalty: penaltySummary.currentEstimatedPenalty,
          calculatedAt: penaltySummary.calculatedAt,
          basis: {
            label: penaltySummary.basis.label,
            explanation: penaltySummary.basis.explanation,
          },
          governingContext: {
            filingYear: penaltySummary.governingContext.filingYear,
            complianceCycle: penaltySummary.governingContext.complianceCycle,
            ruleVersion: penaltySummary.governingContext.ruleVersion,
            basisPathway: penaltySummary.governingContext.basisPathway,
          },
          timestamps: penaltySummary.timestamps,
          scenarios: penaltySummary.scenarios.map((scenario) => ({
            code: scenario.code,
            label: scenario.label,
            estimatedPenalty: scenario.estimatedPenalty,
            deltaFromCurrent: scenario.deltaFromCurrent,
          })),
        }
      : null,
    governedOperationalSummary: governedSummary,
    sections: {
      compliance: {
        readinessState: governedSummary.readinessSummary.state,
        primaryStatus: governedSummary.complianceSummary.primaryStatus,
        qaVerdict: governedSummary.complianceSummary.qaVerdict,
        reasonSummary: governedSummary.complianceSummary.reasonSummary,
        nextAction: governedSummary.readinessSummary.nextAction,
        latestSnapshot: {
          snapshotDate: latestSnapshot?.snapshotDate?.toISOString() ?? null,
          energyStarScore: latestSnapshot?.energyStarScore ?? null,
          siteEui: latestSnapshot?.siteEui ?? null,
          sourceEui: latestSnapshot?.sourceEui ?? null,
          weatherNormalizedSiteEui:
            latestSnapshot?.weatherNormalizedSiteEui ?? null,
          complianceGap: latestSnapshot?.complianceGap ?? null,
          dataQualityScore: latestSnapshot?.dataQualityScore ?? null,
        },
        benchmarkEvaluation:
          governedSummary.complianceSummary.benchmark ?? null,
        bepsEvaluation: governedSummary.complianceSummary.beps ?? null,
      },
      penalty: {
        status: penaltySummary?.status ?? "INSUFFICIENT_CONTEXT",
        currentEstimatedPenalty:
          penaltySummary?.currentEstimatedPenalty ?? null,
        calculatedAt: penaltySummary?.calculatedAt ?? null,
        basisLabel:
          penaltySummary?.basis.label ?? "No governed penalty run recorded",
        basisExplanation:
          penaltySummary?.basis.explanation ??
          "Penalty exposure has not been derived from a governed penalty run for this building.",
        filingYear: penaltySummary?.governingContext.filingYear ?? null,
        complianceCycle:
          penaltySummary?.governingContext.complianceCycle ?? null,
        basisPathway: penaltySummary?.governingContext.basisPathway ?? null,
        scenarios: (penaltySummary?.scenarios ?? []).map((scenario) => ({
          code: scenario.code,
          label: scenario.label,
          estimatedPenalty: scenario.estimatedPenalty,
          deltaFromCurrent: scenario.deltaFromCurrent,
        })),
      },
      artifacts: {
        benchmark: {
          latestArtifactStatus: benchmarkEvidenceSection.artifactStatus,
          workflowState:
            benchmarkEvidenceSection.workflow?.state ?? "NOT_STARTED",
          disposition: benchmarkEvidenceSection.disposition,
          lastGeneratedAt:
            benchmarkEvidenceSection.latestArtifact?.generatedAt ?? null,
          lastFinalizedAt:
            benchmarkEvidenceSection.latestArtifact?.finalizedAt ?? null,
          lastExportedAt:
            benchmarkEvidenceSection.latestExport?.exportedAt ?? null,
          lastExportFormat:
            benchmarkEvidenceSection.latestExport?.format ?? null,
          blockersCount: benchmarkEvidenceSection.blockersCount,
          warningCount: benchmarkEvidenceSection.warningCount,
        },
        beps: {
          latestArtifactStatus: bepsEvidenceSection.artifactStatus,
          workflowState: bepsEvidenceSection.workflow?.state ?? "NOT_STARTED",
          disposition: bepsEvidenceSection.disposition,
          lastGeneratedAt:
            bepsEvidenceSection.latestArtifact?.generatedAt ?? null,
          lastFinalizedAt:
            bepsEvidenceSection.latestArtifact?.finalizedAt ?? null,
          lastExportedAt: bepsEvidenceSection.latestExport?.exportedAt ?? null,
          lastExportFormat: bepsEvidenceSection.latestExport?.format ?? null,
          blockersCount: bepsEvidenceSection.blockersCount,
          warningCount: bepsEvidenceSection.warningCount,
        },
      },
      sourceData: {
        reconciliationStatus:
          governedSummary.reconciliationSummary.status ?? null,
        canonicalSource:
          governedSummary.reconciliationSummary.canonicalSource ?? null,
        conflictCount: governedSummary.reconciliationSummary.conflictCount,
        incompleteCount:
          governedSummary.reconciliationSummary.incompleteCount,
        lastReconciledAt:
          governedSummary.reconciliationSummary.lastReconciledAt,
        runtimeNeedsAttention: governedSummary.runtimeSummary.needsAttention,
        runtimeAttentionCount: governedSummary.runtimeSummary.attentionCount,
        runtimeNextActionTitle:
          governedSummary.runtimeSummary.nextAction?.title ?? null,
        runtimeNextActionReason:
          governedSummary.runtimeSummary.nextAction?.reason ?? null,
        portfolioManagerState:
          governedSummary.runtimeSummary.portfolioManager.currentState,
        greenButtonState:
          governedSummary.runtimeSummary.greenButton.currentState,
      },
      anomalyRisk: {
        activeCount: governedSummary.anomalySummary.activeCount,
        highSeverityCount: governedSummary.anomalySummary.highSeverityCount,
        totalEstimatedEnergyImpactKbtu:
          governedSummary.anomalySummary.totalEstimatedEnergyImpactKbtu,
        totalEstimatedPenaltyImpactUsd:
          governedSummary.anomalySummary.totalEstimatedPenaltyImpactUsd,
        penaltyImpactStatus:
          governedSummary.anomalySummary.penaltyImpactStatus,
        highestPriority:
          governedSummary.anomalySummary.highestPriority ?? null,
        latestDetectedAt:
          governedSummary.anomalySummary.latestDetectedAt,
        topFindings: governedSummary.anomalySummary.topAnomalies.map(
          (anomaly) => ({
            id: anomaly.id,
            title: anomaly.title,
            severity: anomaly.severity,
            confidenceBand: anomaly.confidenceBand,
            explanation: anomaly.explanation,
            estimatedEnergyImpactKbtu:
              anomaly.estimatedEnergyImpactKbtu,
            estimatedPenaltyImpactUsd:
              anomaly.estimatedPenaltyImpactUsd,
            penaltyImpactStatus: anomaly.penaltyImpactStatus,
          }),
        ),
      },
      retrofits: {
        activeCount: governedSummary.retrofitSummary.activeCount,
        highestPriorityBand:
          governedSummary.retrofitSummary.highestPriorityBand,
        topOpportunity: governedSummary.retrofitSummary.topOpportunity
          ? {
              candidateId:
                governedSummary.retrofitSummary.topOpportunity.candidateId,
              name: governedSummary.retrofitSummary.topOpportunity.name,
              priorityBand:
                governedSummary.retrofitSummary.topOpportunity.priorityBand,
              priorityScore:
                governedSummary.retrofitSummary.topOpportunity.priorityScore,
              estimatedAvoidedPenalty:
                governedSummary.retrofitSummary.topOpportunity
                  .estimatedAvoidedPenalty,
              estimatedAvoidedPenaltyStatus:
                governedSummary.retrofitSummary.topOpportunity
                  .estimatedAvoidedPenaltyStatus,
              estimatedOperationalRiskReductionPenalty:
                governedSummary.retrofitSummary.topOpportunity
                  .estimatedOperationalRiskReduction.penaltyImpactUsd,
              basisSummary:
                governedSummary.retrofitSummary.topOpportunity.basis.summary,
            }
          : null,
        opportunities: governedSummary.retrofitSummary.opportunities.map(
          (opportunity) => ({
            candidateId: opportunity.candidateId,
            name: opportunity.name,
            priorityBand: opportunity.priorityBand,
            priorityScore: opportunity.priorityScore,
            estimatedAvoidedPenalty: opportunity.estimatedAvoidedPenalty,
            estimatedAvoidedPenaltyStatus:
              opportunity.estimatedAvoidedPenaltyStatus,
            netProjectCost: opportunity.netProjectCost,
            estimatedOperationalRiskReductionPenalty:
              opportunity.estimatedOperationalRiskReduction.penaltyImpactUsd,
            basisSummary: opportunity.basis.summary,
          }),
        ),
      },
    },
    evidencePackage: {
      packageVersion: "governed-report-evidence-v1",
      generatedAt: new Date().toISOString(),
      traceability: {
        readinessState: governedSummary.readinessSummary.state,
        primaryStatus: governedSummary.complianceSummary.primaryStatus,
        penaltyRunId: penaltySummary?.id ?? null,
        penaltyCalculatedAt: penaltySummary?.calculatedAt ?? null,
        reconciliationStatus:
          governedSummary.reconciliationSummary.status ?? null,
        canonicalSource:
          governedSummary.reconciliationSummary.canonicalSource ?? null,
        lastReadinessEvaluatedAt:
          governedSummary.timestamps.lastReadinessEvaluatedAt,
        lastComplianceEvaluatedAt:
          governedSummary.timestamps.lastComplianceEvaluatedAt,
        lastArtifactGeneratedAt:
          governedSummary.timestamps.lastArtifactGeneratedAt,
        lastArtifactFinalizedAt:
          governedSummary.timestamps.lastArtifactFinalizedAt,
        lastSubmissionTransitionAt:
          governedSummary.timestamps.lastSubmissionTransitionAt,
      },
      artifacts: {
        benchmark: benchmarkEvidenceSection,
        beps: bepsEvidenceSection,
      },
    },
    energyHistory: dedupedReadings.map((r: (typeof dedupedReadings)[number]) => ({
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      consumptionKbtu: r.consumptionKbtu,
      meterType: r.meterType,
      source: r.source,
    })),
    pipelineRuns: runs.map((r: (typeof runs)[number]) => ({
      id: r.id,
      pipelineType: r.pipelineType,
      status: r.status,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  };
}

const exemptionReportSchema = z.object({
  buildingId: z.string(),
  buildingName: z.string(),
  address: z.string(),
  grossSquareFeet: z.number(),
  propertyType: z.string(),
  yearBuilt: z.number().nullable(),
  generatedAt: z.string(),
  complianceStatus: z.string(),
  exemptionScreening: z.object({
    eligible: z.boolean(),
    qualifiedExemptions: z.array(z.string()),
    details: z.array(z.string()),
    missingData: z.array(z.string()),
  }),
  occupancyExemption: z.object({
    applicable: z.boolean(),
    baselineOccupancyPct: z.number().nullable(),
    occupancyThreshold: z.number(),
    baselineYears: z.string(),
    supportingEvidence: z.array(z.string()),
  }),
  financialExemption: z.object({
    applicable: z.boolean(),
    indicators: z.object({
      inForeclosure: z.boolean(),
      inBankruptcy: z.boolean(),
      negativeNetOperatingIncome: z.boolean(),
      taxDelinquent: z.boolean(),
    }),
    supportingEvidence: z.array(z.string()),
  }),
  penaltyContext: z.object({
    legacyStatutoryMaximum: z.number(),
    currentEstimateStatus: z.enum([
      "ESTIMATED",
      "NOT_APPLICABLE",
      "INSUFFICIENT_CONTEXT",
    ]),
    currentEstimatedPenalty: z.number().nullable(),
    currentEstimateBasis: z.string(),
    penaltySavingsIfExempt: z.number().nullable(),
  }),
  supportingSnapshots: z.array(
    z.object({
      snapshotDate: z.string(),
      energyStarScore: z.number().nullable(),
      siteEui: z.number().nullable(),
      complianceStatus: z.string(),
    }),
  ),
  energyHistory: z.array(
    z.object({
      periodStart: z.string(),
      consumptionKbtu: z.number(),
      meterType: z.string(),
    }),
  ),
  filingChecklist: z.array(
    z.object({
      item: z.string(),
      status: z.enum(["READY", "NEEDS_ATTENTION", "NOT_APPLICABLE"]),
      notes: z.string(),
    }),
  ),
  doeeSubmissionGuidance: z.object({
    deadline: z.string(),
    submissionUrl: z.string(),
    requiredDocuments: z.array(z.string()),
    estimatedProcessingDays: z.number(),
  }),
});

type ExemptionReportOutput = z.infer<typeof exemptionReportSchema>;

async function buildExemptionReportOutput(params: {
  tenantDb: {
    building: any;
    energyReading: any;
    complianceSnapshot: any;
  };
  organizationId: string;
  buildingId: string;
  occupancyPct?: number | null;
  financialDistress?: FinancialDistressIndicators;
}): Promise<{
  report: ExemptionReportOutput;
  sourceLineage: GovernedReportArtifactLineage;
}> {
  const building = await params.tenantDb.building.findUnique({
    where: { id: params.buildingId },
  });
  if (!building) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Building not found",
    });
  }

  const latestSnapshot = await getLatestComplianceSnapshot(params.tenantDb, {
    buildingId: params.buildingId,
  });
  const governedSummary = await getBuildingGovernedOperationalSummary({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
  });
  const penaltySummary = governedSummary.penaltySummary;

  const snapshots = await params.tenantDb.complianceSnapshot.findMany({
    where: { buildingId: params.buildingId },
    orderBy: LATEST_SNAPSHOT_ORDER,
    take: 12,
    select: {
      snapshotDate: true,
      energyStarScore: true,
      siteEui: true,
      complianceStatus: true,
    },
  });

  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  const readings: Array<{
    id: string;
    periodStart: Date;
    consumptionKbtu: number;
    meterType: string;
    meterId: string | null;
    periodEnd: Date;
    source: string;
    ingestedAt: Date;
  }> = await params.tenantDb.energyReading.findMany({
    where: {
      buildingId: params.buildingId,
      periodStart: { gte: threeYearsAgo },
    },
    orderBy: [{ periodStart: "asc" }, { ingestedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      periodStart: true,
      consumptionKbtu: true,
      meterType: true,
      meterId: true,
      periodEnd: true,
      source: true,
      ingestedAt: true,
    },
  });
  const dedupedReadings = dedupeEnergyReadings(readings);

  const occupancyPct =
    params.occupancyPct ??
    (building.occupancyRate ? building.occupancyRate * 100 : null);

  const financialIndicators: FinancialDistressIndicators =
    params.financialDistress ?? {
      inForeclosure: building.hasFinancialDistress,
      inBankruptcy: false,
      negativeNetOperatingIncome: false,
      taxDelinquent: false,
    };

  const exemptionResult = screenForExemptions({
    baselineOccupancyPct: occupancyPct,
    financialDistressIndicators: financialIndicators,
    grossSquareFeet: building.grossSquareFeet,
    propertyType: building.propertyType,
    yearBuilt: building.yearBuilt,
  });

  const occupancyApplicable =
    exemptionResult.qualifiedExemptions.includes("LOW_OCCUPANCY");
  const occupancyEvidence: string[] = [];
  if (occupancyPct !== null) {
    occupancyEvidence.push(
      `Reported baseline occupancy: ${occupancyPct}% (threshold: <50%)`,
    );
  }
  if (occupancyApplicable) {
    occupancyEvidence.push(
      "Building qualifies for the Whole-Cycle Low Occupancy Exemption under the 2024 BEPS amendments.",
    );
    occupancyEvidence.push(
      "Owner must submit occupancy records demonstrating <50% occupancy during the baseline period (2019-2021).",
    );
  }

  const financialApplicable =
    exemptionResult.qualifiedExemptions.includes("FINANCIAL_DISTRESS");
  const financialEvidence: string[] = [];
  if (financialIndicators.inForeclosure) {
    financialEvidence.push("Property is in active foreclosure proceedings.");
  }
  if (financialIndicators.inBankruptcy) {
    financialEvidence.push("Owner has filed for bankruptcy protection.");
  }
  if (financialIndicators.negativeNetOperatingIncome) {
    financialEvidence.push(
      "Property reports negative Net Operating Income (NOI).",
    );
  }
  if (financialIndicators.taxDelinquent) {
    financialEvidence.push("Property has delinquent property tax payments.");
  }
  if (financialApplicable) {
    financialEvidence.push(
      "Owner must submit financial documentation (tax returns, court filings, NOI statements) to DOEE.",
    );
  }

  const legacyStatutoryMaximum = building.maxPenaltyExposure;
  const currentPenalty = penaltySummary?.currentEstimatedPenalty ?? null;

  const checklist = buildFilingChecklist({
    hasOccupancyData: occupancyPct !== null,
    hasFinancialData: financialApplicable,
    hasEnergyHistory: dedupedReadings.length >= 12,
    hasComplianceSnapshot: latestSnapshot !== null,
    occupancyApplicable,
    financialApplicable,
    recentConstructionApplicable:
      exemptionResult.qualifiedExemptions.includes("RECENT_CONSTRUCTION"),
  });

  return {
    report: {
      buildingId: building.id,
      buildingName: building.name,
      address: building.address,
      grossSquareFeet: building.grossSquareFeet,
      propertyType: building.propertyType,
      yearBuilt: building.yearBuilt,
      generatedAt: new Date().toISOString(),
      // Transitional compatibility field for the active exemption UI surface.
      complianceStatus: governedSummary.complianceSummary.primaryStatus,
      exemptionScreening: {
        eligible: exemptionResult.eligible,
        qualifiedExemptions: exemptionResult.qualifiedExemptions,
        details: exemptionResult.details,
        missingData: exemptionResult.missingData,
      },
      occupancyExemption: {
        applicable: occupancyApplicable,
        baselineOccupancyPct: occupancyPct,
        occupancyThreshold: 50,
        baselineYears: "2019-2021",
        supportingEvidence: occupancyEvidence,
      },
      financialExemption: {
        applicable: financialApplicable,
        indicators: financialIndicators,
        supportingEvidence: financialEvidence,
      },
      penaltyContext: {
        legacyStatutoryMaximum,
        currentEstimateStatus:
          penaltySummary?.status ?? "INSUFFICIENT_CONTEXT",
        currentEstimatedPenalty: currentPenalty,
        currentEstimateBasis:
          penaltySummary?.basis.label ?? "No governed penalty run recorded",
        penaltySavingsIfExempt: currentPenalty,
      },
      supportingSnapshots: snapshots.map(
        (snapshot: {
          snapshotDate: Date;
          energyStarScore: number | null;
          siteEui: number | null;
          complianceStatus: string;
        }) => ({
          snapshotDate: snapshot.snapshotDate.toISOString(),
          energyStarScore: snapshot.energyStarScore,
          siteEui: snapshot.siteEui,
          complianceStatus: snapshot.complianceStatus,
        }),
      ),
      energyHistory: dedupedReadings.map(
        (reading: (typeof dedupedReadings)[number]) => ({
          periodStart: reading.periodStart.toISOString(),
          consumptionKbtu: reading.consumptionKbtu,
          meterType: reading.meterType,
        }),
      ),
      filingChecklist: checklist,
      doeeSubmissionGuidance: {
        deadline: "2026-12-31",
        submissionUrl:
          "https://doee.dc.gov/service/beps-exemption-application",
        requiredDocuments: buildRequiredDocuments(
          occupancyApplicable,
          financialApplicable,
        ),
        estimatedProcessingDays: 45,
      },
    },
    sourceLineage: buildReportArtifactLineageFromGovernedSummary(
      governedSummary,
    ),
  };
}

export const reportRouter = router({
  publicationOverview: tenantProcedure.query(async ({ ctx }) => ({
    operatorAccess: {
      canManage: ctx.appRole === "ADMIN" || ctx.appRole === "MANAGER",
      appRole: ctx.appRole,
    },
    ...(await getGovernedPublicationOverview()),
  })),

  promoteRuleCandidate: operatorProcedure
    .input(
      z.object({
        ruleVersionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      markRuleVersionCandidate({
        ruleVersionId: input.ruleVersionId,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      }),
    ),

  promoteFactorCandidate: operatorProcedure
    .input(
      z.object({
        factorSetVersionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      markFactorSetVersionCandidate({
        factorSetVersionId: input.factorSetVersionId,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      }),
    ),

  validateRuleCandidate: operatorProcedure
    .input(
      z.object({
        ruleVersionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      validateRuleVersionCandidate({
        ruleVersionId: input.ruleVersionId,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      }),
    ),

  validateFactorCandidate: operatorProcedure
    .input(
      z.object({
        factorSetVersionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      validateFactorSetVersionCandidate({
        factorSetVersionId: input.factorSetVersionId,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      }),
    ),

  publishGovernedCandidate: operatorProcedure
    .input(
      z.object({
        runId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      publishGovernedPublicationRun({
        runId: input.runId,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      }),
    ),

  getComplianceReportArtifacts: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .output(reportArtifactWorkspaceSchema)
    .query(async ({ ctx, input }) =>
      getReportArtifactWorkspace({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportType: "COMPLIANCE_REPORT",
      }),
    ),

  generateComplianceReportArtifact: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .output(reportArtifactSummarySchema)
    .mutation(async ({ ctx, input }) => {
      const report = await buildComplianceReportOutput({
        tenantDb: ctx.tenantDb,
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });

      return createReportArtifact({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportType: "COMPLIANCE_REPORT",
        payload: report,
        sourceLineage: buildComplianceReportArtifactLineage(report),
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  exportComplianceReportArtifact: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        artifactId: z.string(),
        format: z.enum(["JSON"]).default("JSON"),
      }),
    )
    .output(reportArtifactExportSchema)
    .mutation(async ({ ctx, input }) => {
      const building = await ctx.tenantDb.building.findUnique({
        where: { id: input.buildingId },
        select: { id: true, name: true },
      });
      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      const artifact = await getLatestReportArtifact({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportType: "COMPLIANCE_REPORT",
      });
      if (!artifact || artifact.id !== input.artifactId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report artifact not found",
        });
      }

      const exportedArtifact = await markReportArtifactExported({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        artifactId: input.artifactId,
        format: input.format,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });

      return renderReportArtifactExport({
        buildingName: building.name,
        artifact: exportedArtifact,
        format: input.format,
      });
    }),

  getExemptionReportArtifacts: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .output(reportArtifactWorkspaceSchema)
    .query(async ({ ctx, input }) =>
      getReportArtifactWorkspace({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportType: "EXEMPTION_REPORT",
      }),
    ),

  generateExemptionReportArtifact: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .output(reportArtifactSummarySchema)
    .mutation(async ({ ctx, input }) => {
      const { report, sourceLineage } = await buildExemptionReportOutput({
        tenantDb: ctx.tenantDb,
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });

      return createReportArtifact({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportType: "EXEMPTION_REPORT",
        payload: report,
        sourceLineage,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  exportExemptionReportArtifact: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        artifactId: z.string(),
        format: z.enum(["JSON"]).default("JSON"),
      }),
    )
    .output(reportArtifactExportSchema)
    .mutation(async ({ ctx, input }) => {
      const building = await ctx.tenantDb.building.findUnique({
        where: { id: input.buildingId },
        select: { id: true, name: true },
      });
      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      const artifact = await getLatestReportArtifact({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportType: "EXEMPTION_REPORT",
      });
      if (!artifact || artifact.id !== input.artifactId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report artifact not found",
        });
      }

      const exportedArtifact = await markReportArtifactExported({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        artifactId: input.artifactId,
        format: input.format,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });

      return renderReportArtifactExport({
        buildingName: building.name,
        artifact: exportedArtifact,
        format: input.format,
      });
    }),

  /**
   * Generate compliance report data for a building.
   * Assembles all data needed for the HTML/PDF template.
   */
  getComplianceReport: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .output(reportOutputSchema)
    .query(async ({ ctx, input }) => {
      const latestArtifact = await getLatestReportArtifact({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportType: "COMPLIANCE_REPORT",
      });

      if (latestArtifact) {
        return reportOutputSchema.parse(latestArtifact.payload);
      }

      return buildComplianceReportOutput({
        tenantDb: ctx.tenantDb,
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });
    }),

  /**
   * Generate exemption filing report data.
   * Compiles data needed for Financial/Occupancy Exemption filings with DOEE.
   * Integrates the exemption screener to provide a ready-to-file package.
   */
  getExemptionReport: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        occupancyPct: z.number().nullable().optional(),
        financialDistress: z
          .object({
            inForeclosure: z.boolean().default(false),
            inBankruptcy: z.boolean().default(false),
            negativeNetOperatingIncome: z.boolean().default(false),
            taxDelinquent: z.boolean().default(false),
          })
          .optional(),
      }),
    )
    .output(exemptionReportSchema)
    .query(async ({ ctx, input }) => {
      const hasOverrides =
        input.occupancyPct !== undefined || input.financialDistress !== undefined;

      if (!hasOverrides) {
        const latestArtifact = await getLatestReportArtifact({
          organizationId: ctx.organizationId,
          buildingId: input.buildingId,
          reportType: "EXEMPTION_REPORT",
        });

        if (latestArtifact) {
          return exemptionReportSchema.parse(latestArtifact.payload);
        }
      }

      const { report } = await buildExemptionReportOutput({
        tenantDb: ctx.tenantDb,
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        occupancyPct: input.occupancyPct,
        financialDistress: input.financialDistress,
      });

      return report;
    }),
});

interface ChecklistInput {
  hasOccupancyData: boolean;
  hasFinancialData: boolean;
  hasEnergyHistory: boolean;
  hasComplianceSnapshot: boolean;
  occupancyApplicable: boolean;
  financialApplicable: boolean;
  recentConstructionApplicable: boolean;
}

/**
 * Build the filing checklist based on available data and applicable exemptions.
 */
function buildFilingChecklist(input: ChecklistInput): Array<{
  item: string;
  status: "READY" | "NEEDS_ATTENTION" | "NOT_APPLICABLE";
  notes: string;
}> {
  const checklist: Array<{
    item: string;
    status: "READY" | "NEEDS_ATTENTION" | "NOT_APPLICABLE";
    notes: string;
  }> = [];

  checklist.push({
    item: "ENERGY STAR Portfolio Manager property linked",
    status: input.hasComplianceSnapshot ? "READY" : "NEEDS_ATTENTION",
    notes: input.hasComplianceSnapshot
      ? "Property has compliance data on file."
      : "Link your ESPM property to generate compliance snapshots.",
  });

  checklist.push({
    item: "12+ months of energy consumption data",
    status: input.hasEnergyHistory ? "READY" : "NEEDS_ATTENTION",
    notes: input.hasEnergyHistory
      ? "Sufficient energy history available for DOEE submission."
      : "Upload at least 12 months of utility data (CSV or Green Button).",
  });

  if (input.occupancyApplicable) {
    checklist.push({
      item: "Occupancy records for baseline period (2019-2021)",
      status: input.hasOccupancyData ? "READY" : "NEEDS_ATTENTION",
      notes: input.hasOccupancyData
        ? "Occupancy data provided. Prepare supporting lease records or tenant logs."
        : "Provide occupancy percentage during the baseline period.",
    });
    checklist.push({
      item: "Notarized owner attestation of low occupancy",
      status: "NEEDS_ATTENTION",
      notes: "Required for all occupancy exemption filings. Must be notarized and signed by property owner.",
    });
  } else {
    checklist.push({
      item: "Occupancy exemption documentation",
      status: "NOT_APPLICABLE",
      notes: "Building does not qualify for occupancy exemption (occupancy >= 50%).",
    });
  }

  if (input.financialApplicable) {
    checklist.push({
      item: "Financial distress documentation",
      status: "NEEDS_ATTENTION",
      notes: "Submit court filings, tax records, or audited financial statements demonstrating distress.",
    });
    checklist.push({
      item: "Three years of property tax payment records",
      status: "NEEDS_ATTENTION",
      notes: "Required to substantiate financial hardship claim.",
    });
  } else {
    checklist.push({
      item: "Financial distress documentation",
      status: "NOT_APPLICABLE",
      notes: "No financial distress indicators flagged.",
    });
  }

  if (input.recentConstructionApplicable) {
    checklist.push({
      item: "Certificate of Occupancy showing construction date",
      status: "NEEDS_ATTENTION",
      notes: "Provide Certificate of Occupancy issued 2016 or later to verify recent construction.",
    });
  }

  return checklist;
}

/**
 * Build the list of required documents based on applicable exemptions.
 */
function buildRequiredDocuments(
  occupancyApplicable: boolean,
  financialApplicable: boolean,
): string[] {
  const docs = [
    "DOEE BEPS Exemption Application Form",
    "ENERGY STAR Portfolio Manager Property Summary Report",
    "12-month energy consumption records (utility bills or Green Button data)",
  ];

  if (occupancyApplicable) {
    docs.push("Baseline period (2019-2021) occupancy records or tenant lease summaries");
    docs.push("Notarized owner attestation of low occupancy (<50%)");
    docs.push("Property management records showing vacancy periods");
  }

  if (financialApplicable) {
    docs.push("Audited financial statements or tax returns (3 years)");
    docs.push("Court filings (foreclosure, bankruptcy) if applicable");
    docs.push("Property tax payment history from DC Office of Tax and Revenue");
    docs.push("Net Operating Income (NOI) calculation worksheet");
  }

  return docs;
}
