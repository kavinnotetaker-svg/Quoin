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
          isPending: false,
          variables: undefined,
        }),
      },
      transitionSubmissionWorkflow: {
        useMutation: () => ({
          mutate: vi.fn(),
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
            aggregate: {
              totalBuildings: 2,
              blocked: 1,
              readyForReview: 0,
              readyToSubmit: 1,
              submitted: 0,
              needsCorrection: 0,
              withPenaltyExposure: 1,
              withDraftArtifacts: 1,
              finalizedAwaitingNextAction: 0,
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
                submission: {
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
                flags: {
                  blocked: true,
                  readyForReview: false,
                  readyToSubmit: false,
                  submitted: false,
                  hasPenaltyExposure: false,
                  needsCorrection: false,
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
                submission: {
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
                flags: {
                  blocked: false,
                  readyForReview: false,
                  readyToSubmit: true,
                  submitted: false,
                  hasPenaltyExposure: true,
                  needsCorrection: false,
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
    expect(markup).toContain("Resolve missing utility months");
    expect(markup).toContain("2222 Filing Tower");
    expect(markup).toContain("$300,000");
    expect(markup).toContain("Draft artifacts");
    expect(markup).toContain("Approved");
  });

  it("renders the compliance overview with engine result fields", () => {
    const markup = renderToStaticMarkup(
      createElement(ComplianceOverviewTab, {
        building: {
          id: "building-1",
          complianceCycle: "CYCLE_1",
          governedSummary: {
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

    expect(markup).toContain("Compliance decision");
    expect(markup).toContain(
      "No blocking issues remain. Review the latest governed result before submission.",
    );
    expect(markup).toContain("Open data issues");
    expect(markup).toContain("engine-test-v1");
    expect(markup).toContain("ENERGY STAR SCORE");
    expect(markup).toContain("Governed artifacts");
    expect(markup).toContain("Benchmark verification artifact");
    expect(markup).toContain("BEPS filing artifact");
    expect(markup).toContain("Approve for submission");
    expect(markup).toContain("Workflow history");
    expect(markup).toContain("Penalty estimate");
    expect(markup).toContain("$300,000");
    expect(markup).toContain("Meet target");
    expect(markup).toContain("Last readiness evaluation");
    expect(markup).toContain("Last compliance evaluation");
    expect(markup).toContain("Audit trace summary");
  });

  it("hides non-essential routes from the primary navigation", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Buildings", "Reports"]);
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
    expect(reportSource).toContain("governedOperationalSummary.penaltySummary");
    expect(reportSource).toContain("legacyStatutoryMaximum");
    expect(reportSource).not.toContain("complianceData.estimatedPenalty),");
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
  });
});
