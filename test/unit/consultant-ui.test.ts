import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComplianceOverviewTab } from "@/components/building/compliance-overview-tab";
import { NAV_ITEMS } from "@/components/layout/sidebar";
import {
  getPrimaryComplianceStatusDisplay,
  getPacketStatusDisplay,
  getSyncStatusDisplay,
} from "@/components/internal/status-helpers";

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
  });
});

describe("consultant-facing screens", () => {
  it("renders the compliance overview with engine result fields", () => {
    const markup = renderToStaticMarkup(
      createElement(ComplianceOverviewTab, {
        building: {
          complianceCycle: "CYCLE_1",
          workflowSummary: {
            nextAction: {
              title: "Run BEPS evaluation",
              reason: "The latest benchmarking result is ready for BEPS review.",
            },
          },
          latestBenchmarkSubmission: {
            reportingYear: 2025,
            status: "READY",
            readinessEvaluatedAt: "2026-03-16T12:00:00.000Z",
            submissionPayload: {
              complianceEngine: {
                status: "COMPUTED",
                ruleVersion: "engine-test-v1",
                metricUsed: "ANNUAL_BENCHMARKING_READINESS",
                qa: { verdict: "PASS" },
                reasonCodes: ["BENCHMARKING_READY"],
                decision: {
                  meetsStandard: true,
                  blocked: false,
                  insufficientData: false,
                },
              },
              readiness: {
                summary: {
                  scopeState: "IN_SCOPE",
                },
              },
            },
            complianceRun: {
              executedAt: "2026-03-16T12:00:00.000Z",
            },
          },
          latestBepsFiling: {
            filingYear: 2026,
            complianceCycle: "CYCLE_1",
            status: "IN_REVIEW",
            filingPayload: {
              complianceEngine: {
                status: "COMPUTED",
                ruleVersion: "engine-test-v1",
                metricUsed: "ENERGY_STAR_SCORE",
                qa: { verdict: "WARN" },
                reasonCodes: ["STANDARD_TARGET"],
                decision: {
                  meetsStandard: false,
                  blocked: false,
                  insufficientData: false,
                },
              },
              evaluation: {
                overallStatus: "NON_COMPLIANT",
              },
            },
            complianceRun: {
              executedAt: "2026-03-17T12:00:00.000Z",
            },
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
    expect(markup).toContain("Run BEPS evaluation");
    expect(markup).toContain("engine-test-v1");
    expect(markup).toContain("ENERGY STAR SCORE");
    expect(markup).toContain("Audit trace summary");
  });

  it("hides non-essential routes from the primary navigation", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Buildings", "Reports"]);
  });
});
