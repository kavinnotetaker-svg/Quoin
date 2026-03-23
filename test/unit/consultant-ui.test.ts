import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ComplianceOverviewTab } from "@/components/building/compliance-overview-tab";
import { ComplianceQueue } from "@/components/dashboard/compliance-queue";
import { NAV_ITEMS } from "@/components/layout/sidebar";
import {
  getPrimaryComplianceStatusDisplay,
  getPacketStatusDisplay,
  getPenaltySummaryStatusDisplay,
  getSyncStatusDisplay,
} from "@/components/internal/status-helpers";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      building: {
        get: {
          invalidate: vi.fn().mockResolvedValue(undefined),
        },
        getArtifactWorkspace: {
          invalidate: vi.fn().mockResolvedValue(undefined),
        },
        list: {
          invalidate: vi.fn().mockResolvedValue(undefined),
        },
        portfolioWorklist: {
          invalidate: vi.fn().mockResolvedValue(undefined),
        },
      },
      benchmarking: {
        getVerificationChecklist: {
          invalidate: vi.fn().mockResolvedValue(undefined),
        },
      },
    }),
    building: {
      updateIssueStatus: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({ message: "Issue updated." }),
          isPending: false,
          variables: undefined,
        }),
      },
      retryPortfolioManagerSync: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({
            message: "Portfolio Manager sync was executed through the governed sync service.",
          }),
          isPending: false,
        }),
      },
      reenqueueGreenButtonIngestion: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({
            message: "Green Button ingestion was re-enqueued.",
          }),
          isPending: false,
        }),
      },
      rerunSourceReconciliation: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({
            message: "Source reconciliation and downstream issue state were refreshed.",
          }),
          isPending: false,
        }),
      },
      refreshPenaltySummary: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({
            message: "The latest governed penalty run is already current for this building.",
          }),
          isPending: false,
        }),
      },
      bulkOperatePortfolio: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({
            action: "RERUN_SOURCE_RECONCILIATION",
            targetCount: 2,
            succeededCount: 1,
            failedCount: 0,
            skippedCount: 1,
            results: [
              {
                buildingId: "building-1",
                buildingName: "1111 Example Plaza",
                status: "SUCCEEDED",
                message: "Source reconciliation and downstream issue state were refreshed.",
              },
              {
                buildingId: "building-missing",
                buildingName: "Unknown building",
                status: "SKIPPED",
                message: "Building was not found or is not accessible in this organization.",
              },
            ],
          }),
          isPending: false,
        }),
      },
      create: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
          isPending: false,
          error: null,
        }),
      },
      transitionSubmissionWorkflow: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue(undefined),
          isPending: false,
        }),
      },
      getArtifactWorkspace: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: {
            buildingId: "building-1",
            benchmarkVerification: {
              kind: "BENCHMARK_VERIFICATION_PACKET",
              label: "Benchmark verification artifact",
              packetType: null,
              sourceRecordId: "benchmark-submission-1",
              status: "FINALIZED",
              disposition: "READY",
              canGenerate: true,
              canFinalize: false,
              exportFormats: ["JSON", "MARKDOWN", "PDF"],
              latestArtifact: {
                id: "benchmark-packet-1",
                version: 2,
                status: "FINALIZED",
                packetHash: "hash-benchmark",
                generatedAt: "2026-03-17T14:00:00.000Z",
                finalizedAt: "2026-03-17T15:00:00.000Z",
                exportAvailable: true,
                lastExportedAt: "2026-03-17T15:30:00.000Z",
                lastExportFormat: "PDF",
              },
              history: [
                {
                  id: "benchmark-packet-1",
                  version: 2,
                  status: "FINALIZED",
                  packetHash: "hash-benchmark",
                  generatedAt: "2026-03-17T14:00:00.000Z",
                  finalizedAt: "2026-03-17T15:00:00.000Z",
                  exportAvailable: true,
                  lastExportedAt: "2026-03-17T15:30:00.000Z",
                  lastExportFormat: "PDF",
                },
              ],
              submissionWorkflow: {
                id: "benchmark-workflow-1",
                state: "READY_FOR_REVIEW",
                latestTransitionAt: "2026-03-17T15:00:00.000Z",
                readyForReviewAt: "2026-03-17T15:00:00.000Z",
                approvedAt: null,
                submittedAt: null,
                completedAt: null,
                needsCorrectionAt: null,
                latestNotes: "Artifact finalized and promoted to submission review.",
                allowedTransitions: [
                  {
                    nextState: "APPROVED_FOR_SUBMISSION",
                    label: "Approve for submission",
                  },
                  {
                    nextState: "NEEDS_CORRECTION",
                    label: "Request correction",
                  },
                ],
                nextAction: {
                  title: "Approve for submission",
                  reason: "The finalized artifact is ready for consultant review and approval.",
                },
                history: [
                  {
                    id: "benchmark-workflow-event-1",
                    fromState: "DRAFT",
                    toState: "READY_FOR_REVIEW",
                    notes: "Artifact finalized and promoted to submission review.",
                    createdAt: "2026-03-17T15:00:00.000Z",
                    createdByType: "USER",
                    createdById: "user-1",
                  },
                ],
              },
              blockersCount: 0,
              warningCount: 0,
              sourceContext: {
                readinessState: "READY_FOR_REVIEW",
                primaryStatus: "NON_COMPLIANT",
                qaVerdict: "PASS",
                reasonSummary: "Benchmarking Ready",
                reportingYear: 2025,
                filingYear: null,
                complianceCycle: null,
                complianceRunId: "benchmark-run-1",
                readinessEvaluatedAt: "2026-03-16T08:00:00.000Z",
                complianceEvaluatedAt: "2026-03-16T12:00:00.000Z",
                penaltyRunId: "penalty-run-1",
                penaltyEstimatedAt: "2026-03-17T16:00:00.000Z",
                currentEstimatedPenalty: 300000,
              },
            },
            bepsFiling: {
              kind: "BEPS_FILING_PACKET",
              label: "BEPS filing artifact",
              packetType: "COMPLETED_ACTIONS",
              sourceRecordId: "filing-record-1",
              status: "GENERATED",
              disposition: "READY_WITH_WARNINGS",
              canGenerate: true,
              canFinalize: true,
              exportFormats: ["JSON", "MARKDOWN", "PDF"],
              latestArtifact: {
                id: "beps-packet-1",
                version: 1,
                status: "GENERATED",
                packetHash: "hash-beps",
                generatedAt: "2026-03-17T14:00:00.000Z",
                finalizedAt: null,
                exportAvailable: true,
                lastExportedAt: null,
                lastExportFormat: null,
              },
              history: [
                {
                  id: "beps-packet-1",
                  version: 1,
                  status: "GENERATED",
                  packetHash: "hash-beps",
                  generatedAt: "2026-03-17T14:00:00.000Z",
                  finalizedAt: null,
                  exportAvailable: true,
                  lastExportedAt: null,
                  lastExportFormat: null,
                },
              ],
              submissionWorkflow: {
                id: "beps-workflow-1",
                state: "DRAFT",
                latestTransitionAt: "2026-03-17T14:00:00.000Z",
                readyForReviewAt: null,
                approvedAt: null,
                submittedAt: null,
                completedAt: null,
                needsCorrectionAt: null,
                latestNotes: "Workflow started from a generated governed artifact draft.",
                allowedTransitions: [],
                nextAction: {
                  title: "Finalize the artifact",
                  reason: "The governed artifact exists, but it has not been finalized for review yet.",
                },
                history: [
                  {
                    id: "beps-workflow-event-1",
                    fromState: null,
                    toState: "DRAFT",
                    notes: "Workflow started from a generated governed artifact draft.",
                    createdAt: "2026-03-17T14:00:00.000Z",
                    createdByType: "USER",
                    createdById: "user-1",
                  },
                ],
              },
              blockersCount: 0,
              warningCount: 1,
              sourceContext: {
                readinessState: "READY_FOR_REVIEW",
                primaryStatus: "NON_COMPLIANT",
                qaVerdict: "PASS",
                reasonSummary: "Standard Target",
                reportingYear: 2025,
                filingYear: 2026,
                complianceCycle: "CYCLE_1",
                complianceRunId: "beps-run-1",
                readinessEvaluatedAt: "2026-03-16T08:00:00.000Z",
                complianceEvaluatedAt: "2026-03-17T12:00:00.000Z",
                penaltyRunId: "penalty-run-1",
                penaltyEstimatedAt: "2026-03-17T16:00:00.000Z",
                currentEstimatedPenalty: 300000,
              },
            },
          },
        }),
      },
      portfolioWorklist: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: {
            operatorAccess: {
              canManage: true,
              appRole: "ADMIN",
            },
            pageInfo: {
              returnedCount: 2,
              totalMatchingCount: 2,
              nextCursor: null,
            },
            aggregate: {
              totalBuildings: 2,
              blocked: 1,
              readyForReview: 0,
              readyToSubmit: 1,
              submitted: 0,
              needsCorrection: 0,
              withPenaltyExposure: 1,
              withSyncAttention: 1,
              withOperationalRisk: 1,
              withActionableRetrofits: 1,
              withDraftArtifacts: 1,
              finalizedAwaitingNextAction: 0,
              needsAttentionNow: 2,
              reviewQueue: 0,
              submissionQueue: 1,
              syncQueue: 0,
              anomalyQueue: 0,
              retrofitQueue: 0,
            },
            items: [
              {
                buildingId: "building-1",
                buildingName: "1111 Example Plaza",
                address: "1111 Example Plaza NW, Washington, DC 20001",
                propertyType: "OFFICE",
                grossSquareFeet: 100000,
                readinessState: "DATA_INCOMPLETE",
                blockingIssueCount: 2,
                warningIssueCount: 1,
                nextAction: {
                  code: "RESOLVE_BLOCKING_ISSUES",
                  title: "Resolve missing utility months",
                  reason: "Annual coverage is incomplete.",
                },
                complianceSummary: {
                  primaryStatus: "DATA_INCOMPLETE",
                  qaVerdict: "FAIL",
                  reasonSummary: "Missing Months",
                },
                penaltySummary: null,
                anomalySummary: {
                  activeCount: 1,
                  highSeverityCount: 1,
                  totalEstimatedEnergyImpactKbtu: 12000,
                  totalEstimatedPenaltyImpactUsd: null,
                  penaltyImpactStatus: "INSUFFICIENT_CONTEXT",
                  needsAttention: true,
                },
                retrofitSummary: {
                  activeCount: 0,
                  highestPriorityBand: null,
                  topOpportunity: null,
                },
                artifacts: {
                  benchmark: {
                    status: "NOT_STARTED",
                    sourceRecordId: null,
                    generatedAt: null,
                    finalizedAt: null,
                  },
                  beps: {
                    status: "NOT_STARTED",
                    sourceRecordId: null,
                    generatedAt: null,
                    finalizedAt: null,
                  },
                },
                runtime: {
                  portfolioManager: {
                    currentState: "STALE",
                  },
                  greenButton: {
                    currentState: "NOT_CONNECTED",
                  },
                },
                submission: {
                  overall: {
                    state: "NOT_STARTED",
                    workflowId: null,
                    workflowType: null,
                    latestTransitionAt: null,
                  },
                  benchmark: {
                    state: "NOT_STARTED",
                    workflowId: null,
                    latestTransitionAt: null,
                  },
                  beps: {
                    state: "NOT_STARTED",
                    workflowId: null,
                    latestTransitionAt: null,
                  },
                },
                timestamps: {
                  lastReadinessEvaluatedAt: "2026-03-16T08:00:00.000Z",
                  lastComplianceEvaluatedAt: null,
                  lastPenaltyCalculatedAt: null,
                  lastArtifactGeneratedAt: null,
                  lastArtifactFinalizedAt: null,
                  lastSubmissionTransitionAt: null,
                },
                triage: {
                  bucket: "COMPLIANCE_BLOCKER",
                  urgency: "NOW",
                  cue: "2 governed compliance blockers are preventing review.",
                },
                flags: {
                  blocked: true,
                  readyForReview: false,
                  readyToSubmit: false,
                  submitted: false,
                  hasPenaltyExposure: false,
                  needsCorrection: false,
                  needsSyncAttention: true,
                  needsAnomalyAttention: true,
                },
              },
              {
                buildingId: "building-2",
                buildingName: "2222 Filing Tower",
                address: "2222 Filing Tower NW, Washington, DC 20001",
                propertyType: "OFFICE",
                grossSquareFeet: 120000,
                readinessState: "READY_TO_SUBMIT",
                blockingIssueCount: 0,
                warningIssueCount: 0,
                nextAction: {
                  code: "SUBMIT_ARTIFACT",
                  title: "Record the governed submission",
                  reason: "A finalized artifact has been approved and is ready for submission operations.",
                },
                complianceSummary: {
                  primaryStatus: "NON_COMPLIANT",
                  qaVerdict: "PASS",
                  reasonSummary: "Standard Target Not Met",
                },
                penaltySummary: {
                  id: "penalty-run-1",
                  status: "ESTIMATED",
                  currentEstimatedPenalty: 300000,
                  calculatedAt: "2026-03-17T16:00:00.000Z",
                },
                anomalySummary: {
                  activeCount: 2,
                  highSeverityCount: 1,
                  totalEstimatedEnergyImpactKbtu: 22000,
                  totalEstimatedPenaltyImpactUsd: 18000,
                  penaltyImpactStatus: "ESTIMATED",
                  needsAttention: true,
                },
                retrofitSummary: {
                  activeCount: 2,
                  highestPriorityBand: "CRITICAL",
                  topOpportunity: {
                    name: "Retro-commissioning",
                    priorityScore: 88,
                    estimatedAvoidedPenalty: 120000,
                    estimatedAvoidedPenaltyStatus: "ESTIMATED",
                    estimatedOperationalRiskReductionPenalty: 18000,
                  },
                },
                artifacts: {
                  benchmark: {
                    status: "NOT_STARTED",
                    sourceRecordId: null,
                    generatedAt: null,
                    finalizedAt: null,
                  },
                  beps: {
                    status: "FINALIZED",
                    sourceRecordId: "filing-record-1",
                    generatedAt: "2026-03-17T14:00:00.000Z",
                    finalizedAt: "2026-03-17T15:00:00.000Z",
                  },
                },
                runtime: {
                  portfolioManager: {
                    currentState: "SUCCEEDED",
                  },
                  greenButton: {
                    currentState: "IDLE",
                  },
                },
                submission: {
                  overall: {
                    state: "APPROVED_FOR_SUBMISSION",
                    workflowId: "beps-workflow-1",
                    workflowType: "BEPS",
                    latestTransitionAt: "2026-03-17T15:15:00.000Z",
                  },
                  benchmark: {
                    state: "NOT_STARTED",
                    workflowId: null,
                    latestTransitionAt: null,
                  },
                  beps: {
                    state: "APPROVED_FOR_SUBMISSION",
                    workflowId: "beps-workflow-1",
                    latestTransitionAt: "2026-03-17T15:15:00.000Z",
                  },
                },
                timestamps: {
                  lastReadinessEvaluatedAt: "2026-03-16T08:00:00.000Z",
                  lastComplianceEvaluatedAt: "2026-03-17T12:00:00.000Z",
                  lastPenaltyCalculatedAt: "2026-03-17T16:00:00.000Z",
                  lastArtifactGeneratedAt: "2026-03-17T14:00:00.000Z",
                  lastArtifactFinalizedAt: "2026-03-17T15:00:00.000Z",
                  lastSubmissionTransitionAt: "2026-03-17T15:15:00.000Z",
                },
                triage: {
                  bucket: "SUBMISSION_QUEUE",
                  urgency: "NOW",
                  cue: "A governed artifact is approved and ready for submission operations.",
                },
                flags: {
                  blocked: false,
                  readyForReview: false,
                  readyToSubmit: true,
                  submitted: false,
                  hasPenaltyExposure: true,
                  needsCorrection: false,
                  needsSyncAttention: false,
                  needsAnomalyAttention: true,
                },
              },
            ],
          },
        }),
      },
    },
    benchmarking: {
      generateBenchmarkPacket: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      finalizeBenchmarkPacket: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
    beps: {
      generatePacket: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      finalizePacket: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

describe("consultant-facing status copy", () => {
  it("uses plain language for key compliance and sync states", () => {
    expect(getPrimaryComplianceStatusDisplay("DATA_INCOMPLETE")).toMatchObject({
      label: "Data incomplete",
      tone: "warning",
    });
    expect(getSyncStatusDisplay("PARTIAL")).toMatchObject({
      label: "Partial import",
      tone: "warning",
    });
    expect(getPacketStatusDisplay("STALE")).toMatchObject({
      label: "Needs refresh",
      tone: "warning",
    });
    expect(getPenaltySummaryStatusDisplay("ESTIMATED")).toMatchObject({
      label: "Estimated",
      tone: "warning",
    });
  });
});

describe("consultant-facing screens", () => {
  it("renders the governed portfolio worklist with readiness, penalty, and artifact state", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceQueue));

    expect(markup).toContain("Portfolio worklist");
    expect(markup).toContain("Add building");
    expect(markup).toContain("Needs attention now");
    expect(markup).toContain("Submission queue");
    expect(markup).toContain("Resolve missing utility months");
    expect(markup).toContain("2222 Filing Tower");
    expect(markup).toContain("$300,000");
    expect(markup).toContain("Operational risk");
    expect(markup).toContain("Retrofit opportunities");
    expect(markup).toContain("Sync attention");
    expect(markup).toContain("All Portfolio");
    expect(markup).toContain("Draft artifacts");
    expect(markup).toContain("Showing 1-2 of 2 matching buildings");
    expect(markup).toContain("Page 1 of 1");
    expect(markup).toContain("Previous");
    expect(markup).toContain("Next");
    expect(markup).toContain("Needs attention now");
  });

  it("renders the compliance overview with engine result fields", () => {
    const markup = renderToStaticMarkup(
      createElement(ComplianceOverviewTab, {
        building: {
          id: "building-1",
          complianceCycle: "CYCLE_1",
          operatorAccess: {
            canManage: true,
            appRole: "ADMIN",
          },
          governedSummary: {
            timestamps: {
              lastSubmissionTransitionAt: "2026-03-17T15:15:00.000Z",
            },
            anomalySummary: {
              activeCount: 2,
              highSeverityCount: 1,
              totalEstimatedEnergyImpactKbtu: 22000,
              totalEstimatedPenaltyImpactUsd: 18000,
              penaltyImpactStatus: "ESTIMATED",
              highestPriority: "HIGH",
              latestDetectedAt: "2026-03-17T12:00:00.000Z",
              needsAttention: true,
              topAnomalies: [
                {
                  id: "anomaly-1",
                  anomalyType: "ABNORMAL_BASELOAD",
                  severity: "HIGH",
                  confidenceBand: "MEDIUM",
                  title: "Persistent baseload increased above prior operating pattern",
                  explanation:
                    "Recent low-load months sit materially above the prior six-month low-load baseline.",
                  estimatedEnergyImpactKbtu: 12000,
                  estimatedPenaltyImpactUsd: 18000,
                  penaltyImpactStatus: "ESTIMATED",
                },
              ],
            },
            penaltySummary: {
              id: "penalty-run-1",
              calculationMode: "CURRENT_BEPS_EXPOSURE",
              calculatedAt: "2026-03-17T16:00:00.000Z",
              status: "ESTIMATED",
              currentEstimatedPenalty: 300000,
              currency: "USD",
              basis: {
                code: "RECOMMENDED_ALTERNATIVE_COMPLIANCE",
                label: "Governed alternative compliance estimate",
                explanation:
                  "Estimate is based on the latest persisted BEPS evaluation and the governed alternative compliance amount for the pathway currently driving exposure.",
              },
              governingContext: {
                filingYear: 2026,
                basisPathway: "STANDARD_TARGET",
                ruleVersion: "engine-test-v1",
              },
              timestamps: {
                lastReadinessEvaluatedAt: "2026-03-16T08:00:00.000Z",
                lastComplianceEvaluatedAt: "2026-03-17T12:00:00.000Z",
                lastPacketGeneratedAt: "2026-03-17T14:00:00.000Z",
              },
              keyDrivers: [
                {
                  code: "CURRENT_ESTIMATE",
                  label: "Current estimate",
                  value: "$300,000",
                },
              ],
              scenarios: [
                {
                  code: "MEET_TARGET",
                  label: "Meet target",
                  description:
                    "Assumes the building reaches the governed compliance target and eliminates current penalty exposure.",
                  estimatedPenalty: 0,
                  deltaFromCurrent: -300000,
                  metricChange: null,
                },
              ],
            },
            retrofitSummary: {
              activeCount: 2,
              highestPriorityBand: "CRITICAL",
              topOpportunity: {
                candidateId: "retrofit-1",
                name: "Retro-commissioning",
                projectType: "RETRO_COMMISSIONING",
                priorityScore: 88,
                priorityBand: "CRITICAL",
                estimatedAvoidedPenalty: 120000,
                estimatedAvoidedPenaltyStatus: "ESTIMATED",
                estimatedAnnualSavingsKbtu: 450000,
                netProjectCost: 90000,
                estimatedOperationalRiskReduction: {
                  energyImpactKbtu: 12000,
                  penaltyImpactUsd: 18000,
                  status: "ESTIMATED",
                  explanation:
                    "Operational risk reduction is estimated from the active anomaly impacts aligned to this retrofit opportunity.",
                },
                basis: {
                  summary:
                    "Prioritized from governed penalty exposure, explicit retrofit impact assumptions, and aligned anomaly risk.",
                  explanation:
                    "Retrofit ranking is decision-support only. It uses the latest governed penalty summary when available, current compliance timing, explicit retrofit inputs, and aligned operational anomaly signals. It does not alter the compliance engine result.",
                  assumptions: [
                    "Avoided penalty is estimated by scaling the latest governed penalty exposure by the retrofit's expected BEPS improvement share.",
                    "Cost efficiency uses the stated annual savings together with avoided penalty when available.",
                    "Operational risk reduction is estimated from the active anomaly impacts aligned to this retrofit opportunity.",
                  ],
                },
                reasonCodes: [
                  "HIGH_AVOIDED_PENALTY",
                  "LOW_NET_COST_FOR_BENEFIT",
                  "ANOMALY_CONTEXT_PRESENT",
                ],
                rationale: {
                  deadlineDate: "2026-12-31T00:00:00.000Z",
                  monthsUntilDeadline: 9,
                  anomalyContextCount: 1,
                },
              },
              opportunities: [
                {
                  candidateId: "retrofit-1",
                  name: "Retro-commissioning",
                  projectType: "RETRO_COMMISSIONING",
                  priorityScore: 88,
                  priorityBand: "CRITICAL",
                  estimatedAvoidedPenalty: 120000,
                  estimatedAvoidedPenaltyStatus: "ESTIMATED",
                  netProjectCost: 90000,
                  estimatedOperationalRiskReduction: {
                    energyImpactKbtu: 12000,
                    penaltyImpactUsd: 18000,
                    status: "ESTIMATED",
                    explanation:
                      "Operational risk reduction is estimated from the active anomaly impacts aligned to this retrofit opportunity.",
                  },
                  basis: {
                    summary:
                      "Prioritized from governed penalty exposure, explicit retrofit impact assumptions, and aligned anomaly risk.",
                    explanation:
                      "Retrofit ranking is decision-support only. It uses the latest governed penalty summary when available, current compliance timing, explicit retrofit inputs, and aligned operational anomaly signals. It does not alter the compliance engine result.",
                    assumptions: [
                      "Avoided penalty is estimated by scaling the latest governed penalty exposure by the retrofit's expected BEPS improvement share.",
                    ],
                  },
                  reasonCodes: [
                    "HIGH_AVOIDED_PENALTY",
                    "LOW_NET_COST_FOR_BENEFIT",
                  ],
                  rationale: {
                    deadlineDate: "2026-12-31T00:00:00.000Z",
                    monthsUntilDeadline: 9,
                    anomalyContextCount: 1,
                  },
                },
              ],
            },
            runtimeSummary: {
              needsAttention: true,
              attentionCount: 1,
              nextAction: {
                title: "Refresh Portfolio Manager sync",
                reason: "Portfolio Manager data is stale and should be refreshed.",
              },
              portfolioManager: {
                currentState: "STALE",
                lastAttemptedAt: "2026-03-17T10:00:00.000Z",
                lastSucceededAt: "2026-02-01T10:00:00.000Z",
                lastFailedAt: null,
                attemptCount: 3,
                retryCount: 1,
                latestErrorCode: null,
                latestErrorMessage: null,
                isStale: true,
                attentionReason:
                  "Portfolio Manager data is stale and should be refreshed.",
              },
              greenButton: {
                currentState: "SUCCEEDED",
                connectionStatus: "ACTIVE",
                lastWebhookReceivedAt: "2026-03-17T17:00:00.000Z",
                lastAttemptedAt: "2026-03-17T17:05:00.000Z",
                lastSucceededAt: "2026-03-17T17:06:00.000Z",
                lastFailedAt: null,
                attemptCount: 4,
                retryCount: 0,
                latestErrorCode: null,
                latestErrorMessage: null,
                isStale: false,
                attentionReason: null,
              },
            },
          },
          readinessSummary: {
            state: "READY_FOR_REVIEW",
            blockingIssueCount: 0,
            warningIssueCount: 1,
            primaryStatus: "NON_COMPLIANT",
            qaVerdict: "PASS",
            reasonSummary: "Standard Target",
            lastReadinessEvaluatedAt: "2026-03-16T08:00:00.000Z",
            lastComplianceEvaluatedAt: "2026-03-17T12:00:00.000Z",
            lastPacketGeneratedAt: "2026-03-17T14:00:00.000Z",
            lastPacketFinalizedAt: "2026-03-17T15:00:00.000Z",
            nextAction: {
              title: "Review the latest compliance result",
              reason:
                "No blocking issues remain. Review the latest governed result before submission.",
            },
            evaluations: {
              benchmark: {
                reportingYear: 2025,
                ruleVersion: "engine-test-v1",
                metricUsed: "ANNUAL_BENCHMARKING_READINESS",
                status: "COMPUTED",
                reasonSummary: "Benchmarking Ready",
                decision: {
                  meetsStandard: true,
                  blocked: false,
                },
                lastComplianceEvaluatedAt: "2026-03-16T12:00:00.000Z",
              },
              beps: {
                filingYear: 2026,
                complianceCycle: "CYCLE_1",
                ruleVersion: "engine-test-v1",
                metricUsed: "ENERGY_STAR_SCORE",
                status: "COMPUTED",
                reasonSummary: "Standard Target",
                decision: {
                  meetsStandard: false,
                  blocked: false,
                },
                lastComplianceEvaluatedAt: "2026-03-17T12:00:00.000Z",
              },
            },
            artifacts: {
              benchmarkSubmission: {
                status: "READY",
                reportingYear: 2025,
                lastReadinessEvaluatedAt: "2026-03-16T08:00:00.000Z",
                lastComplianceEvaluatedAt: "2026-03-16T12:00:00.000Z",
              },
              benchmarkPacket: {
                status: "FINALIZED",
                generatedAt: "2026-03-17T14:00:00.000Z",
                finalizedAt: "2026-03-17T15:00:00.000Z",
              },
              bepsFiling: {
                status: "IN_REVIEW",
                filingYear: 2026,
                complianceCycle: "CYCLE_1",
                lastComplianceEvaluatedAt: "2026-03-17T12:00:00.000Z",
              },
              bepsPacket: {
                status: "GENERATED",
                generatedAt: "2026-03-17T14:00:00.000Z",
                finalizedAt: null,
              },
            },
          },
          issueSummary: {
            openIssues: [
              {
                id: "issue-1",
                reportingYear: 2025,
                issueType: "DQC_SUPPORT_MISSING",
                severity: "WARNING",
                status: "OPEN",
                title: "Data Quality Checker support is missing",
                description: "Attach Data Quality Checker support or document verifier follow-up.",
                requiredAction: "Attach Data Quality Checker support or document verifier follow-up.",
                source: "QA",
              },
            ],
          },
          recentAuditLogs: [
            {
              id: "audit-1",
              timestamp: "2026-03-17T12:00:00.000Z",
              action: "COMPLIANCE_ENGINE_BEPS_SUCCEEDED",
              errorCode: null,
              requestId: "req-1",
            },
          ],
          sourceReconciliation: {
            id: "reconciliation-1",
            status: "CONFLICTED",
            canonicalSource: "GREEN_BUTTON",
            referenceYear: 2025,
            conflictCount: 1,
            incompleteCount: 1,
            lastReconciledAt: "2026-03-17T18:00:00.000Z",
            sourceRecords: [
              {
                sourceSystem: "GREEN_BUTTON",
                state: "AVAILABLE",
                linkedRecordId: "gb-connection-1",
                externalRecordId: "sub-1",
                readingCount: 12,
                coverageMonthCount: 12,
                coverageMonths: ["2025-01", "2025-02"],
                totalConsumptionKbtu: 500000,
                latestIngestedAt: "2026-03-17T17:00:00.000Z",
              },
              {
                sourceSystem: "PORTFOLIO_MANAGER",
                state: "AVAILABLE",
                linkedRecordId: "pm-sync-1",
                externalRecordId: "2001",
                readingCount: 12,
                coverageMonthCount: 12,
                coverageMonths: ["2025-01", "2025-02"],
                totalConsumptionKbtu: 430000,
                latestIngestedAt: "2026-03-16T17:00:00.000Z",
              },
            ],
            conflicts: [
              {
                code: "CONSUMPTION_TOTAL_MISMATCH",
                severity: "BLOCKING",
                message: "Meter totals differ materially between Green Button and Portfolio Manager.",
                sourceSystems: ["GREEN_BUTTON", "PORTFOLIO_MANAGER"],
                meterId: "meter-1",
                meterName: "Main Electric",
              },
            ],
            meters: [
              {
                meterId: "meter-1",
                meterName: "Main Electric",
                meterType: "ELECTRIC",
                unit: "KWH",
                status: "CONFLICTED",
                canonicalSource: "GREEN_BUTTON",
                coverageMonthCount: 12,
                sourceRecords: [
                  {
                    sourceSystem: "GREEN_BUTTON",
                    state: "AVAILABLE",
                    externalRecordId: "sub-1",
                    readingCount: 12,
                    coverageMonthCount: 12,
                    totalConsumptionKbtu: 500000,
                    latestIngestedAt: "2026-03-17T17:00:00.000Z",
                  },
                  {
                    sourceSystem: "PORTFOLIO_MANAGER",
                    state: "AVAILABLE",
                    externalRecordId: "2001",
                    readingCount: 12,
                    coverageMonthCount: 12,
                    totalConsumptionKbtu: 430000,
                    latestIngestedAt: "2026-03-16T17:00:00.000Z",
                  },
                ],
                conflicts: [
                  {
                    code: "CONSUMPTION_TOTAL_MISMATCH",
                    severity: "BLOCKING",
                    message: "Meter totals differ materially between Green Button and Portfolio Manager.",
                  },
                ],
              },
            ],
          },
          operationalAnomalies: [
            {
              id: "anomaly-1",
              anomalyType: "ABNORMAL_BASELOAD",
              severity: "HIGH",
              status: "ACTIVE",
              confidenceBand: "MEDIUM",
              confidenceScore: 0.72,
              title: "Persistent baseload increased above prior operating pattern",
              summary:
                "Recent low-load months sit materially above the prior six-month low-load baseline, suggesting elevated persistent usage.",
              explanation:
                "This is a persistent-baseload proxy derived from monthly billing periods because interval telemetry is not available in the current data model.",
              causeHypothesis:
                "Persistent base load has risen relative to the prior operating pattern.",
              detectionWindowEnd: "2026-03-17T12:00:00.000Z",
              estimatedEnergyImpactKbtu: 12000,
              estimatedPenaltyImpactUsd: 18000,
              penaltyImpactStatus: "ESTIMATED",
              attribution: {
                penaltyImpactExplanation:
                  "Estimated by scaling the latest governed BEPS penalty exposure by the anomaly's implied site-EUI share of the latest compliance snapshot.",
              },
              meter: null,
            },
          ],
        },
        verificationChecklist: {
          summary: {
            passedCount: 5,
            failedCount: 0,
            needsReviewCount: 1,
          },
          items: [
            {
              key: "DATA_COVERAGE",
              status: "PASS",
              explanation: "Annual coverage is complete.",
              evidenceRefs: [],
            },
          ],
        },
      }),
    );

    expect(markup).toContain("Compliance Status");
    expect(markup).toContain(
      "No blocking issues remain. Review the latest governed result before submission.",
    );
  });

  it("hides non-essential routes from the primary navigation", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Work Queue", "Reports"]);
  });

  it("keeps the building workbench organized around overview, compliance, submission, and planning tabs", () => {
    const detailSource = readFileSync(
      "C:\\Quoin\\src\\components\\building\\building-detail.tsx",
      "utf8",
    );

    expect(detailSource).toContain('{ key: "overview", label: "COMPLIANCE TRUTH" }');
    expect(detailSource).toContain('{ key: "interpretation", label: "INTERPRETATION" }');
    expect(detailSource).toContain('{ key: "evidence", label: "EVIDENCE" }');
    expect(detailSource).toContain('{ key: "advisory", label: "ADVISORY" }');
  });

  it("keeps compliance authority out of the client compliance tab", () => {
    const source = readFileSync(
      "C:\\Quoin\\src\\components\\building\\compliance-tab.tsx",
      "utf8",
    );

    expect(source).not.toContain("@/server/");
    expect(source).not.toContain("pathway-analysis");
    expect(source).not.toContain("@/lib/compliance-surface");
  });

  it("keeps penalty authority on the server", () => {
    const source = readFileSync(
      "C:\\Quoin\\src\\components\\building\\compliance-overview-tab.tsx",
      "utf8",
    );
    const artifactSource = readFileSync(
      "C:\\Quoin\\src\\components\\building\\artifact-workspace-panel.tsx",
      "utf8",
    );

    expect(source).not.toContain("@/server/");
    expect(source).not.toContain("maxPenaltyExposure");
    expect(source).not.toContain("building.getPenaltySummary.useQuery");
    expect(source).toContain("building.governedSummary.penaltySummary");
    expect(artifactSource).not.toContain("@/server/");
    expect(artifactSource).not.toContain("submissionPayload");
    expect(artifactSource).not.toContain("filingPayload");
    expect(artifactSource).toContain("building.getArtifactWorkspace.useQuery");
  });

  it("keeps dashboard penalty displays on governed server data", () => {
    const dashboardSource = readFileSync(
      "C:\\Quoin\\src\\components\\dashboard\\dashboard-content.tsx",
      "utf8",
    );
    const tableSource = readFileSync(
      "C:\\Quoin\\src\\components\\dashboard\\building-table.tsx",
      "utf8",
    );

    expect(dashboardSource).toContain("building.listPenaltySummaries.useQuery");
    expect(tableSource).not.toContain("estimatedPenalty: number | null");
    expect(tableSource).not.toContain("snapshot?.estimatedPenalty");
    expect(tableSource).toContain("Current governed estimate");
  });

  it("keeps dashboard triage surfaces on the governed worklist path", () => {
    const insightsSource = readFileSync(
      "C:\\Quoin\\src\\components\\dashboard\\portfolio-insights.tsx",
      "utf8",
    );
    const routerSource = readFileSync(
      "C:\\Quoin\\src\\server\\trpc\\routers\\index.ts",
      "utf8",
    );
    const buildingRouterSource = readFileSync(
      "C:\\Quoin\\src\\server\\trpc\\routers\\building.ts",
      "utf8",
    );

    expect(insightsSource).toContain("building.portfolioWorklist.useQuery");
    expect(insightsSource).not.toContain("building.portfolioWorkflow.useQuery");
    expect(insightsSource).not.toContain("portfolioRisk");
    expect(routerSource).not.toContain("portfolioRisk:");
    expect(buildingRouterSource).not.toContain("workflowSummary:");
    expect(buildingRouterSource).not.toContain("portfolioWorkflow:");
  });

  it("keeps report penalty displays on governed server data", () => {
    const reportSource = readFileSync(
      "C:\\Quoin\\src\\components\\reports\\reports-page.tsx",
      "utf8",
    );
    const scoreSectionSource = readFileSync(
      "C:\\Quoin\\src\\components\\building\\score-section.tsx",
      "utf8",
    );

    expect(reportSource).not.toContain("@/server/");
    expect(reportSource).toContain("const sections = report.sections");
    expect(reportSource).toContain("const evidencePackage = report.evidencePackage");
    expect(reportSource).toContain("report.getComplianceReportArtifacts.useQuery");
    expect(reportSource).toContain("report.getExemptionReportArtifacts.useQuery");
    expect(reportSource).toContain("report.generateComplianceReportArtifact.useMutation");
    expect(reportSource).toContain("report.generateExemptionReportArtifact.useMutation");
    expect(reportSource).toContain("report.exportComplianceReportArtifact.useMutation");
    expect(reportSource).toContain("report.exportExemptionReportArtifact.useMutation");
    expect(reportSource).toContain("Submission Packages");
    expect(reportSource).toContain("Publication Controls");
    expect(reportSource).toContain("Governed report summary");
    expect(reportSource).toContain("Evidence package");
    expect(reportSource).toContain("Persisted governed reports");
    expect(reportSource).toContain("Governed exemption summary");
    expect(reportSource).toContain("Persisted exemption reports");
    expect(reportSource).toContain("legacyStatutoryMaximum");
    expect(reportSource).toContain("operatorAccess.canManage");
    expect(reportSource).not.toContain("submissionPayload");
    expect(reportSource).not.toContain("filingPayload");
    expect(scoreSectionSource).not.toContain("Math.min(grossSquareFeet * 10, 7_500_000)");
    expect(scoreSectionSource).toContain("legacyStatutoryMaximum");
  });

  it("keeps the portfolio worklist free of client-side authority leakage", () => {
    const queueSource = readFileSync(
      "C:\\Quoin\\src\\components\\dashboard\\compliance-queue.tsx",
      "utf8",
    );

    expect(queueSource).not.toContain("@/server/");
    expect(queueSource).not.toContain("maxPenaltyExposure");
    expect(queueSource).not.toContain("submissionPayload");
    expect(queueSource).not.toContain("filingPayload");
    expect(queueSource).toContain("building.portfolioWorklist.useQuery");
    expect(queueSource).toContain("building.bulkOperatePortfolio.useMutation");
  });

  it("keeps retrofit prioritization authority on the server", () => {
    const retrofitSource = readFileSync(
      "C:\\Quoin\\src\\components\\building\\retrofit-tab.tsx",
      "utf8",
    );
    const detailSource = readFileSync(
      "C:\\Quoin\\src\\components\\building\\building-detail.tsx",
      "utf8",
    );

    expect(retrofitSource).not.toContain("@/server/");
    expect(retrofitSource).toContain("trpc.retrofit.rankBuilding.useQuery");
    expect(detailSource).not.toContain("@/server/");
    expect(detailSource).toContain("<RetrofitTab buildingId={buildingId} />");
  });

  it("keeps active building workflow surfaces off raw payload debug output", () => {
    const benchmarkingSource = readFileSync(
      "C:\\Quoin\\src\\components\\building\\benchmarking-tab.tsx",
      "utf8",
    );
    const bepsSource = readFileSync(
      "C:\\Quoin\\src\\components\\building\\beps-tab.tsx",
      "utf8",
    );
    const verificationSource = readFileSync(
      "C:\\Quoin\\src\\components\\building\\verification-requests-tab.tsx",
      "utf8",
    );

    expect(benchmarkingSource).not.toContain("submissionPayload");
    expect(bepsSource).not.toContain("filingPayload");
    expect(verificationSource).not.toContain("submissionPayload");
  });
});
