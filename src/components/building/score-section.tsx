import { StatusDot } from "@/components/dashboard/status-dot";

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
  const gap =
    energyStarScore != null ? energyStarScore - bepsTargetScore : null;
  const gapText =
    gap != null
      ? gap >= 0
        ? `Target: ${bepsTargetScore} (+${gap} above)`
        : `Target: ${bepsTargetScore} (${gap} below)`
      : `Target: ${bepsTargetScore}`;

  const sinceText = snapshotDate
    ? `Since ${new Date(snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "";

  return (
    <div className="grid grid-cols-3 gap-8">
      <div>
        <p className="text-xs text-gray-500">ENERGY STAR Score</p>
        <p className="mt-0.5 text-2xl font-medium text-gray-900">
          {energyStarScore ?? "—"}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{gapText}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Status</p>
        <p className="mt-1.5">
          <StatusDot status={complianceStatus} />
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{sinceText}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Penalty Exposure</p>
        <p
          className="mt-0.5 text-2xl font-medium"
          style={{
            color:
              estimatedPenalty && estimatedPenalty > 0
                ? "#dc2626"
                : "#111827",
          }}
        >
          {estimatedPenalty != null
            ? `$${estimatedPenalty.toLocaleString()}`
            : "$0"}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Max: ${maxPenaltyExposure.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
