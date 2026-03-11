import { describe, expect, it } from "vitest";
import {
  BENCHMARK_FINDING_CODES,
  evaluateBenchmarkReadinessData,
} from "@/server/compliance/benchmarking";

const baseBuilding = {
  id: "building_1",
  organizationId: "org_1",
  grossSquareFeet: 100000,
  doeeBuildingId: "RPUID-123456",
  espmPropertyId: 123456,
  espmShareStatus: "LINKED" as const,
};

const baseRuleConfig = {
  propertyIdPattern: "^RPUID-[0-9]{6}$",
  dqcFreshnessDays: 30,
  verification: {
    minimumGrossSquareFeet: 50000,
    requiredReportingYears: [2025],
    evidenceKind: "VERIFICATION",
  },
  gfaCorrection: {
    evidenceKind: "GFA_CORRECTION",
  },
};

const baseFactorConfig = {
  dqcFreshnessDays: 30,
};

function monthReadings() {
  return [
    { periodStart: new Date("2025-01-01T00:00:00.000Z"), periodEnd: new Date("2025-01-31T00:00:00.000Z") },
    { periodStart: new Date("2025-02-01T00:00:00.000Z"), periodEnd: new Date("2025-02-28T00:00:00.000Z") },
    { periodStart: new Date("2025-03-01T00:00:00.000Z"), periodEnd: new Date("2025-03-31T00:00:00.000Z") },
    { periodStart: new Date("2025-04-01T00:00:00.000Z"), periodEnd: new Date("2025-04-30T00:00:00.000Z") },
    { periodStart: new Date("2025-05-01T00:00:00.000Z"), periodEnd: new Date("2025-05-31T00:00:00.000Z") },
    { periodStart: new Date("2025-06-01T00:00:00.000Z"), periodEnd: new Date("2025-06-30T00:00:00.000Z") },
    { periodStart: new Date("2025-07-01T00:00:00.000Z"), periodEnd: new Date("2025-07-31T00:00:00.000Z") },
    { periodStart: new Date("2025-08-01T00:00:00.000Z"), periodEnd: new Date("2025-08-31T00:00:00.000Z") },
    { periodStart: new Date("2025-09-01T00:00:00.000Z"), periodEnd: new Date("2025-09-30T00:00:00.000Z") },
    { periodStart: new Date("2025-10-01T00:00:00.000Z"), periodEnd: new Date("2025-10-31T00:00:00.000Z") },
    { periodStart: new Date("2025-11-01T00:00:00.000Z"), periodEnd: new Date("2025-11-30T00:00:00.000Z") },
    { periodStart: new Date("2025-12-01T00:00:00.000Z"), periodEnd: new Date("2025-12-31T00:00:00.000Z") },
  ].map((reading) => ({
    ...reading,
    meterId: "meter_1",
    meterType: "ELECTRIC",
    source: "CSV_UPLOAD",
  }));
}

function freshEvidence(kind: string, reportingYear = 2025) {
  return {
    id: `${kind}_${reportingYear}`,
    artifactType: "PM_REPORT" as const,
    name: kind,
    artifactRef: kind,
    createdAt: new Date("2026-01-10T00:00:00.000Z"),
    metadata: {
      benchmarking: {
        kind,
        reportingYear,
        checkedAt: "2026-01-10T00:00:00.000Z",
      },
    },
    benchmarkSubmission: null,
  };
}

describe("benchmarking workflow", () => {
  it("passes readiness for a complete reporting year", () => {
    const result = evaluateBenchmarkReadinessData({
      building: baseBuilding,
      readings: monthReadings(),
      evidenceArtifacts: [freshEvidence("DQC_REPORT"), freshEvidence("VERIFICATION")],
      reportingYear: 2025,
      ruleConfig: baseRuleConfig,
      factorConfig: baseFactorConfig,
      evaluatedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    expect(result.status).toBe("READY");
    expect(result.reasonCodes).toEqual([]);
    expect(result.summary.coverageComplete).toBe(true);
    expect(result.summary.dqcFreshnessState).toBe("FRESH");
    expect(result.summary.verificationRequired).toBe(true);
    expect(result.summary.verificationEvidencePresent).toBe(true);
  });

  it("blocks readiness when reporting-year coverage is missing", () => {
    const readings = monthReadings().filter((reading) => reading.periodStart.getUTCMonth() !== 5);

    const result = evaluateBenchmarkReadinessData({
      building: baseBuilding,
      readings,
      evidenceArtifacts: [freshEvidence("DQC_REPORT"), freshEvidence("VERIFICATION")],
      reportingYear: 2025,
      ruleConfig: baseRuleConfig,
      factorConfig: baseFactorConfig,
      evaluatedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toContain(BENCHMARK_FINDING_CODES.missingCoverage);
  });

  it("blocks readiness on overlapping billing periods", () => {
    const readings = monthReadings();
    readings[1] = {
      ...readings[1],
      periodStart: new Date("2025-01-15T00:00:00.000Z"),
      periodEnd: new Date("2025-02-15T00:00:00.000Z"),
    };

    const result = evaluateBenchmarkReadinessData({
      building: baseBuilding,
      readings,
      evidenceArtifacts: [freshEvidence("DQC_REPORT"), freshEvidence("VERIFICATION")],
      reportingYear: 2025,
      ruleConfig: baseRuleConfig,
      factorConfig: baseFactorConfig,
      evaluatedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toContain(BENCHMARK_FINDING_CODES.overlappingBills);
  });

  it("blocks readiness when the DC property identifier is missing", () => {
    const result = evaluateBenchmarkReadinessData({
      building: {
        ...baseBuilding,
        doeeBuildingId: null,
      },
      readings: monthReadings(),
      evidenceArtifacts: [freshEvidence("DQC_REPORT"), freshEvidence("VERIFICATION")],
      reportingYear: 2025,
      ruleConfig: baseRuleConfig,
      factorConfig: baseFactorConfig,
      evaluatedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toContain(BENCHMARK_FINDING_CODES.missingPropertyId);
  });

  it("blocks readiness when PM sharing is stale or DQC evidence is missing", () => {
    const result = evaluateBenchmarkReadinessData({
      building: {
        ...baseBuilding,
        espmShareStatus: "UNLINKED",
      },
      readings: monthReadings(),
      evidenceArtifacts: [],
      reportingYear: 2025,
      ruleConfig: baseRuleConfig,
      factorConfig: baseFactorConfig,
      evaluatedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toContain(BENCHMARK_FINDING_CODES.pmNotShared);
    expect(result.reasonCodes).toContain(BENCHMARK_FINDING_CODES.dqcStale);
  });

  it("blocks readiness when verification is required but evidence is missing", () => {
    const result = evaluateBenchmarkReadinessData({
      building: baseBuilding,
      readings: monthReadings(),
      evidenceArtifacts: [freshEvidence("DQC_REPORT")],
      reportingYear: 2025,
      ruleConfig: baseRuleConfig,
      factorConfig: baseFactorConfig,
      evaluatedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.summary.verificationRequired).toBe(true);
    expect(result.reasonCodes).toContain(
      BENCHMARK_FINDING_CODES.verificationEvidenceMissing,
    );
  });
});
