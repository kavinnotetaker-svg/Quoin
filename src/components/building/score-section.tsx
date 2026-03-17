import { StatusBadge, getComplianceStatusDisplay } from "@/components/internal/status-helpers";

interface ScoreSectionProps {
  energyStarScore: number | null;
  complianceStatus: string;
  estimatedPenalty: number | null;
  bepsTargetScore: number;
  grossSquareFeet: number;
  snapshotDate: string | Date | null;
}

export function ScoreSection({
  energyStarScore,
  complianceStatus,
  estimatedPenalty,
  bepsTargetScore,
  grossSquareFeet,
  snapshotDate,
}: ScoreSectionProps) {
  const maxPenaltyExposure = Math.min(grossSquareFeet * 10, 7_500_000);
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

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Latest ENERGY STAR score
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          {energyStarScore ?? "Not scored"}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-500">{gapText}</p>
        <p className="mt-1 text-xs text-slate-400">
          Used when the building qualifies for score-based BEPS review.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Current compliance outlook
        </p>
        <div className="mt-2">
          <StatusBadge label={compliance.label} tone={compliance.tone} />
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {complianceStatus === "NON_COMPLIANT"
            ? "The current snapshot indicates the building is not meeting the active target."
            : complianceStatus === "AT_RISK"
              ? "The building is close enough to the target that it needs consultant review."
              : complianceStatus === "COMPLIANT"
                ? "The latest snapshot supports compliance for the current review."
                : "A fresh snapshot is still needed before Quoin can assess compliance."}
        </p>
        <p className="mt-2 text-xs font-medium text-slate-400">{sinceText || "No recent compliance snapshot"}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Estimated Penalty Exposure
        </p>
        <p
          className={`mt-1 text-3xl font-bold tracking-tight ${
            estimatedPenalty && estimatedPenalty > 0
              ? "text-red-600"
              : "text-slate-900"
          }`}
        >
          {estimatedPenalty != null ? `$${estimatedPenalty.toLocaleString()}` : "$0"}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Current estimate from the latest compliance snapshot. This is not the statutory maximum.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Max statutory penalty: ${maxPenaltyExposure.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
