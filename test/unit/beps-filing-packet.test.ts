import { describe, expect, it } from "vitest";
import { buildBepsFilingPacketWarnings } from "@/server/compliance/beps";

describe("BEPS filing packets", () => {
  it("emits warnings when recommended evidence is missing", () => {
    const warnings = buildBepsFilingPacketWarnings({
      selectedPathway: "PERFORMANCE",
      overallStatus: "NON_COMPLIANT",
      alternativeComplianceAgreementId: "agreement-1",
      evidenceManifest: [],
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "NO_LINKED_EVIDENCE",
      "MISSING_PATHWAY_SUPPORT_EVIDENCE",
      "MISSING_ACP_SUPPORT_EVIDENCE",
    ]);
  });

  it("suppresses missing-evidence warnings when the expected evidence kinds are present", () => {
    const warnings = buildBepsFilingPacketWarnings({
      selectedPathway: "PRESCRIPTIVE",
      overallStatus: "NOT_APPLICABLE",
      alternativeComplianceAgreementId: null,
      evidenceManifest: [
        { bepsEvidenceKind: "PRESCRIPTIVE_SUPPORT" },
        { bepsEvidenceKind: "NOT_APPLICABLE_SUPPORT" },
      ],
    });

    expect(warnings).toEqual([]);
  });
});
