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
  const penaltyTone =
    penaltySummary?.status === "ESTIMATED" &&
    penaltySummary.currentEstimatedPenalty != null &&
    penaltySummary.currentEstimatedPenalty > 0
      ? "text-red-600"
      : "text-zinc-900";
  const penaltyNote =
    penaltySummary?.status === "ESTIMATED"
      ? penaltySummary.basisLabel
      : penaltySummary?.status === "NOT_APPLICABLE"
        ? "No governed penalty applies in the current context."
        : "Insufficient governed context for a current estimate.";

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          Latest ENERGY STAR score
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
          {energyStarScore ?? "Not scored"}
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-500">{gapText}</p>
        <p className="mt-1 text-xs text-zinc-400">
          Used when the building qualifies for score-based BEPS review.
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          Current compliance outlook
        </p>
        <div className="mt-2">
          <StatusBadge label={compliance.label} tone={compliance.tone} />
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          {complianceStatus === "NON_COMPLIANT"
            ? "The current snapshot indicates the building is not meeting the active target."
            : complianceStatus === "AT_RISK"
              ? "The building is close enough to the target that it needs consultant review."
              : complianceStatus === "COMPLIANT"
                ? "The latest snapshot supports compliance for the current review."
                : "A fresh snapshot is still needed before Quoin can assess compliance."}
        </p>
        <p className="mt-2 text-xs font-medium text-zinc-400">{sinceText || "No recent compliance snapshot"}</p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          Current Penalty Estimate
        </p>
        <p className={`mt-1 text-3xl font-bold tracking-tight ${penaltyTone}`}>{penaltyText}</p>
        <p className="mt-1 text-sm font-medium text-zinc-500">{penaltyNote}</p>
        {legacyStatutoryMaximum != null ? (
          <p className="mt-1 text-xs text-zinc-400">
            Legacy statutory ceiling: ${legacyStatutoryMaximum.toLocaleString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
