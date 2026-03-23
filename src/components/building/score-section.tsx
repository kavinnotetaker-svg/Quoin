import { StatusBadge, getComplianceStatusDisplay } from "@/components/internal/status-helpers";

interface GovernedPenaltySummary {
  status: "ESTIMATED" | "NOT_APPLICABLE" | "INSUFFICIENT_CONTEXT";
  currentEstimatedPenalty: number | null;
  basisLabel: string;
}

interface ScoreSectionProps {
  energyStarScore: number | null;
  complianceStatus: string;
  penaltySummary: GovernedPenaltySummary | null;
  bepsTargetScore: number;
  legacyStatutoryMaximum?: number | null;
  snapshotDate: string | Date | null;
}

export function ScoreSection({
  energyStarScore,
  complianceStatus,
  penaltySummary,
  bepsTargetScore,
  legacyStatutoryMaximum = null,
  snapshotDate,
}: ScoreSectionProps) {
  const compliance = getComplianceStatusDisplay(complianceStatus);
  const gap =
    energyStarScore != null ? energyStarScore - bepsTargetScore : null;
  const gapText =
    gap != null
      ? gap >= 0
        ? `Target: ${bepsTargetScore} (+${gap} above)`
        : `Target: ${bepsTargetScore} (${gap} below)`
      : `Target: ${bepsTargetScore}`;

  const sinceText = snapshotDate
    ? `Since ${new Date(snapshotDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : "";
  const penaltyText =
    penaltySummary?.status === "ESTIMATED" &&
    penaltySummary.currentEstimatedPenalty != null
      ? `$${penaltySummary.currentEstimatedPenalty.toLocaleString()}`
      : penaltySummary?.status === "NOT_APPLICABLE"
        ? "$0"
        : "Unavailable";
  const penaltyDanger =
    penaltySummary?.status === "ESTIMATED" &&
    penaltySummary.currentEstimatedPenalty != null &&
    penaltySummary.currentEstimatedPenalty > 0;
  const penaltyNote =
    penaltySummary?.status === "ESTIMATED"
      ? penaltySummary.basisLabel
      : penaltySummary?.status === "NOT_APPLICABLE"
        ? "No governed penalty applies in the current context."
        : "Insufficient governed context for a current estimate.";

  // Stitch: flat grid with no borders — tonal background shifts between cells
  const cellStyle: React.CSSProperties = {
    padding: "1.5rem",
    backgroundColor: "#ffffff",
  };

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-3"
      style={{ borderTop: "0.5px solid rgba(169,180,185,0.3)" }}
    >
      {/* Cell 1: ENERGY STAR Score */}
      <div
        style={{ ...cellStyle, borderRight: "0.5px solid rgba(169,180,185,0.3)" }}
      >
        <p
          className="font-sans text-[10px] font-medium uppercase tracking-[0.2em]"
          style={{ color: "#717c82" }}
        >
          Latest ENERGY STAR Score
        </p>
        <p
          className="font-display font-light tracking-tight mt-2"
          style={{ fontSize: "2.4rem", color: "#2a3439", lineHeight: 1 }}
        >
          {energyStarScore ?? "—"}
        </p>
        <p className="font-sans text-xs mt-2" style={{ color: "#566166" }}>
          {gapText}
        </p>
        <p className="font-sans text-xs mt-1" style={{ color: "#a9b4b9" }}>
          Used when the building qualifies for score-based BEPS review.
        </p>
      </div>

      {/* Cell 2: Compliance Outlook */}
      <div
        style={{ ...cellStyle, borderRight: "0.5px solid rgba(169,180,185,0.3)" }}
      >
        <p
          className="font-sans text-[10px] font-medium uppercase tracking-[0.2em]"
          style={{ color: "#717c82" }}
        >
          Current Compliance Outlook
        </p>
        <div className="mt-3">
          <StatusBadge label={compliance.label} tone={compliance.tone} />
        </div>
        <p className="font-sans text-xs mt-3" style={{ color: "#566166", lineHeight: 1.6 }}>
          {complianceStatus === "NON_COMPLIANT"
            ? "The current snapshot indicates the building is not meeting the active target."
            : complianceStatus === "AT_RISK"
              ? "The building is close enough to the target that it needs consultant review."
              : complianceStatus === "COMPLIANT"
                ? "The latest snapshot supports compliance for the current review."
                : "A fresh snapshot is still needed before Quoin can assess compliance."}
        </p>
        <p className="font-sans text-xs mt-2" style={{ color: "#a9b4b9" }}>
          {sinceText || "No recent compliance snapshot"}
        </p>
      </div>

      {/* Cell 3: Penalty Estimate */}
      <div style={cellStyle}>
        <p
          className="font-sans text-[10px] font-medium uppercase tracking-[0.2em]"
          style={{ color: "#717c82" }}
        >
          Current Penalty Estimate
        </p>
        <p
          className="font-display font-light tracking-tight mt-2"
          style={{
            fontSize: "2.4rem",
            color: penaltyDanger ? "#9f403d" : "#2a3439",
            lineHeight: 1,
          }}
        >
          {penaltyText}
        </p>
        <p className="font-sans text-xs mt-2" style={{ color: "#566166" }}>
          {penaltyNote}
        </p>
        {legacyStatutoryMaximum != null ? (
          <p className="font-sans text-xs mt-1" style={{ color: "#a9b4b9" }}>
            Legacy statutory ceiling: ${legacyStatutoryMaximum.toLocaleString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
