"use client";

import Link from "next/link";
import { StatusDot } from "./status-dot";

interface Snapshot {
  energyStarScore: number | null;
  complianceStatus: string;
  estimatedPenalty: number | null;
  snapshotDate: string | Date;
}

interface BuildingRow {
  id: string;
  name: string;
  propertyType: string;
  latestSnapshot: Snapshot | null;
  updatedAt: string | Date;
}

function formatPenalty(amount: number | null | undefined): {
  text: string;
  color: string;
} {
  if (!amount || amount === 0) return { text: "$0", color: "#9ca3af" };
  return { text: `$${amount.toLocaleString()}`, color: "#dc2626" };
}

function relativeTime(date: string | Date): { text: string; color: string } {
  const d = new Date(date);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return { text: "Today", color: "#16a34a" };
  if (days === 1) return { text: "1d ago", color: "#16a34a" };
  const text = `${days}d ago`;
  if (days <= 30) return { text, color: "#16a34a" };
  if (days <= 60) return { text, color: "#ca8a04" };
  return { text, color: "#dc2626" };
}

const PROPERTY_LABELS: Record<string, string> = {
  OFFICE: "Office",
  MULTIFAMILY: "Multifamily",
  MIXED_USE: "Mixed Use",
  OTHER: "Other",
};

export function BuildingTable({ buildings }: { buildings: BuildingRow[] }) {
  if (buildings.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        No buildings yet. Add your first building to get started.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th className="pb-2 pr-4 font-normal">Name</th>
            <th className="pb-2 pr-4 font-normal">Type</th>
            <th className="pb-2 pr-4 font-normal text-right">Score</th>
            <th className="pb-2 pr-4 font-normal">Status</th>
            <th className="pb-2 pr-4 font-normal text-right">Penalty</th>
            <th className="pb-2 font-normal text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {buildings.map((b) => {
            const snap = b.latestSnapshot;
            const penalty = formatPenalty(snap?.estimatedPenalty);
            const updated = relativeTime(
              snap?.snapshotDate ?? b.updatedAt,
            );
            return (
              <tr
                key={b.id}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/buildings/${b.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {b.name}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-xs text-gray-500">
                  {PROPERTY_LABELS[b.propertyType] ?? b.propertyType}
                </td>
                <td className="py-2.5 pr-4 text-right text-gray-900">
                  {snap?.energyStarScore != null
                    ? snap.energyStarScore
                    : "—"}
                </td>
                <td className="py-2.5 pr-4">
                  <StatusDot
                    status={snap?.complianceStatus ?? "PENDING_DATA"}
                  />
                </td>
                <td
                  className="py-2.5 pr-4 text-right"
                  style={{ color: penalty.color }}
                >
                  {penalty.text}
                </td>
                <td
                  className="py-2.5 text-right text-xs"
                  style={{ color: updated.color }}
                >
                  {updated.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
