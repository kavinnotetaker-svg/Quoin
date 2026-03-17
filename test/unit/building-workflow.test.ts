import { describe, expect, it } from "vitest";
import { deriveBuildingWorkflowSummary } from "@/server/compliance/building-workflow";

describe("building workflow derivation", () => {
  it("derives a connect-data next action for sparse buildings", () => {
    const summary = deriveBuildingWorkflowSummary({
      buildingId: "building_sparse",
      readingsCount: 0,
      hasEspmPropertyId: false,
      latestComplianceStatus: null,
      latestPenaltyExposure: null,
      syncStatus: null,
      syncErrorMessage: null,
      latestBenchmarkStatus: null,
      latestBenchmarkSummary: null,
      latestBenchmarkReasonCodes: [],
      latestBenchmarkFindingMessage: null,
      latestBepsFilingStatus: null,
      latestBepsCycle: null,
      latestBepsHasRun: false,
      latestBepsPacketStatus: null,
      latestBepsPacketWarnings: [],
      activeAnomalyCount: 0,
      totalAnomalyCount: 0,
      highestActiveAnomalySeverity: null,
      retrofitCandidateCount: 0,
      activeRetrofitCandidateCount: 0,
      financingCaseCount: 0,
      latestFinancingPacketStatus: null,
    });

    expect(summary.stages[0]).toMatchObject({
      key: "DATA_CONNECTED",
      status: "NOT_STARTED",
    });
    expect(summary.nextAction).toMatchObject({
      code: "CONNECT_DATA",
      title: "Connect building data",
    });
  });

  it("prioritizes benchmarking blockers before later workflow steps", () => {
    const summary = deriveBuildingWorkflowSummary({
      buildingId: "building_blocked",
      readingsCount: 12,
      hasEspmPropertyId: true,
      latestComplianceStatus: "AT_RISK",
      latestPenaltyExposure: 100000,
      syncStatus: "SUCCEEDED",
      syncErrorMessage: null,
      latestBenchmarkStatus: "BLOCKED",
      latestBenchmarkSummary: {
        findings: [
          {
            status: "FAIL",
            message: "Data Quality Checker evidence is missing.",
          },
        ],
      },
      latestBenchmarkReasonCodes: ["DQC_STALE"],
      latestBenchmarkFindingMessage: null,
      latestBepsFilingStatus: null,
      latestBepsCycle: null,
      latestBepsHasRun: false,
      latestBepsPacketStatus: null,
      latestBepsPacketWarnings: [],
      activeAnomalyCount: 0,
      totalAnomalyCount: 0,
      highestActiveAnomalySeverity: null,
      retrofitCandidateCount: 0,
      activeRetrofitCandidateCount: 0,
      financingCaseCount: 0,
      latestFinancingPacketStatus: null,
    });

    expect(summary.stages.find((stage) => stage.key === "BENCHMARKING_READY")).toMatchObject({
      status: "BLOCKED",
      reason: "Data Quality Checker evidence is missing.",
    });
    expect(summary.nextAction).toMatchObject({
      code: "FIX_BENCHMARKING_BLOCKERS",
      title: "Fix benchmarking blockers",
    });
  });

  it("flags stale filing packets before retrofit or financing follow-up", () => {
    const summary = deriveBuildingWorkflowSummary({
      buildingId: "building_filing",
      readingsCount: 12,
      hasEspmPropertyId: true,
      latestComplianceStatus: "NON_COMPLIANT",
      latestPenaltyExposure: 250000,
      syncStatus: "SUCCEEDED",
      syncErrorMessage: null,
      latestBenchmarkStatus: "READY",
      latestBenchmarkSummary: null,
      latestBenchmarkReasonCodes: [],
      latestBenchmarkFindingMessage: null,
      latestBepsFilingStatus: "GENERATED",
      latestBepsCycle: "CYCLE_1",
      latestBepsHasRun: true,
      latestBepsPacketStatus: "STALE",
      latestBepsPacketWarnings: ["Packet is stale."],
      activeAnomalyCount: 0,
      totalAnomalyCount: 1,
      highestActiveAnomalySeverity: null,
      retrofitCandidateCount: 1,
      activeRetrofitCandidateCount: 1,
      financingCaseCount: 1,
      latestFinancingPacketStatus: "GENERATED",
    });

    expect(summary.stages.find((stage) => stage.key === "FILING_PREPARED")).toMatchObject({
      status: "NEEDS_ATTENTION",
    });
    expect(summary.nextAction).toMatchObject({
      code: "REGENERATE_FILING_PACKET",
      title: "Regenerate filing packet",
    });
  });
});
