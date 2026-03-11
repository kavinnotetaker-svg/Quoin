import { describe, expect, it } from "vitest";
import {
  buildBuildingPortfolioRisk,
  PORTFOLIO_RISK_REASON_CODES,
} from "@/server/compliance/portfolio-risk";

const now = new Date("2026-03-09T00:00:00.000Z");

function buildBaseContext() {
  return {
    building: {
      id: "building-1",
      organizationId: "org-1",
      name: "Test Building",
      complianceCycle: "CYCLE_1" as const,
      espmPropertyId: BigInt(123),
      espmShareStatus: "LINKED",
      maxPenaltyExposure: 500000,
    },
    benchmarkSubmission: null,
    filingRecord: null,
    syncState: null,
  };
}

describe("portfolio risk scoring", () => {
  it("raises risk when benchmarking is blocked", () => {
    const summary = buildBuildingPortfolioRisk(
      {
        ...buildBaseContext(),
        syncState: {
          id: "sync-1",
          status: "SUCCEEDED" as const,
          lastSuccessfulSyncAt: new Date("2026-03-01T00:00:00.000Z"),
          qaPayload: {
            findings: [],
          },
        },
        benchmarkSubmission: {
          id: "benchmark-1",
          reportingYear: 2025,
          status: "BLOCKED" as const,
          complianceRunId: "run-1",
          submissionPayload: {
            readiness: {
              status: "BLOCKED",
              reasonCodes: ["MISSING_COVERAGE"],
            },
          },
        },
      },
      now,
    );

    expect(summary.blockingReasons).toContain(
      PORTFOLIO_RISK_REASON_CODES.benchmarkingBlocked,
    );
    expect(summary.riskCategory).toBe("BENCHMARKING");
    expect(summary.riskScore).toBeGreaterThanOrEqual(40);
  });

  it("adds BEPS ACP exposure risk from governed evaluation output", () => {
    const summary = buildBuildingPortfolioRisk(
      {
        ...buildBaseContext(),
        filingRecord: {
          id: "filing-1",
          filingYear: 2026,
          complianceCycle: "CYCLE_1",
          status: "GENERATED",
          complianceRunId: "run-2",
          evidenceArtifacts: [{ id: "evidence-1" }],
          packets: [],
          filingPayload: {
            bepsEvaluation: {
              overallStatus: "NON_COMPLIANT",
              reasonCodes: ["ACP_AGREEMENT_REQUIRED"],
              alternativeCompliance: {
                recommended: {
                  amountDue: 275000,
                },
              },
            },
          },
        },
        benchmarkSubmission: {
          id: "benchmark-1",
          reportingYear: 2026,
          status: "READY",
          complianceRunId: "run-1",
          submissionPayload: {
            readiness: {
              status: "READY",
              reasonCodes: [],
            },
          },
        },
      },
      now,
    );

    expect(summary.blockingReasons).toContain(
      PORTFOLIO_RISK_REASON_CODES.likelyAcpExposure,
    );
    expect(summary.estimatedExposure).toBe(275000);
    expect(summary.riskCategory).toBe("BEPS");
  });

  it("treats stale Portfolio Manager sync data as blocking operational risk", () => {
    const summary = buildBuildingPortfolioRisk(
      {
        ...buildBaseContext(),
        syncState: {
          id: "sync-1",
          status: "SUCCEEDED",
          lastSuccessfulSyncAt: new Date("2025-12-01T00:00:00.000Z"),
          qaPayload: {
            findings: [{ code: "STALE_PM_DATA", status: "FAIL" }],
          },
        },
      },
      now,
    );

    expect(summary.blockingReasons).toContain(PORTFOLIO_RISK_REASON_CODES.pmSyncStale);
    expect(summary.riskBreakdown.SYNC).toBeGreaterThan(0);
    expect(summary.urgencyLevel).toMatch(/HIGH|CRITICAL/);
  });

  it("adds filing evidence risk when packet warnings or missing evidence exist", () => {
    const summary = buildBuildingPortfolioRisk(
      {
        ...buildBaseContext(),
        syncState: {
          id: "sync-1",
          status: "SUCCEEDED",
          lastSuccessfulSyncAt: new Date("2026-03-01T00:00:00.000Z"),
          qaPayload: { findings: [] },
        },
        filingRecord: {
          id: "filing-1",
          filingYear: 2026,
          complianceCycle: "CYCLE_1",
          status: "GENERATED",
          complianceRunId: "run-2",
          evidenceArtifacts: [],
          packets: [
            {
              id: "packet-1",
              status: "STALE",
              version: 2,
              finalizedAt: null,
              packetPayload: {
                warnings: [{ code: "MISSING_ACP_SUPPORT_EVIDENCE" }],
              },
            },
          ],
          filingPayload: {
            bepsEvaluation: {
              overallStatus: "NON_COMPLIANT",
              reasonCodes: [],
              alternativeCompliance: {
                recommended: {
                  amountDue: 125000,
                },
              },
            },
          },
        },
      },
      now,
    );

    expect(summary.blockingReasons).toContain(
      PORTFOLIO_RISK_REASON_CODES.filingEvidenceMissing,
    );
    expect(summary.blockingReasons).toContain(
      PORTFOLIO_RISK_REASON_CODES.filingPacketStale,
    );
  });
});
