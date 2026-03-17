"use client";

import React from "react";
import Link from "next/link";
import {
  StatusBadge,
  getComplianceStatusDisplay,
} from "@/components/internal/status-helpers";

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

function formatPenalty(amount: number | null | undefined) {
  if (!amount || amount === 0) {
    return {
      text: "$0",
      color: "var(--muted-foreground)",
      note: "No current penalty estimate",
    };
  }

  return {
    text: `$${amount.toLocaleString()}`,
    color: "rgb(220, 38, 38)",
    note: "Latest estimate",
  };
}

function relativeTime(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);

  if (days === 0) {
    return { text: "Today", color: "rgb(22, 163, 74)", note: "Fresh data" };
  }

  if (days === 1) {
    return { text: "1d ago", color: "rgb(22, 163, 74)", note: "Fresh data" };
  }

  const text = `${days}d ago`;
  if (days <= 30) {
    return { text, color: "rgb(22, 163, 74)", note: "Fresh data" };
  }

  if (days <= 60) {
    return { text, color: "rgb(202, 138, 4)", note: "Review freshness" };
  }

  return { text, color: "rgb(220, 38, 38)", note: "Stale data" };
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
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
        <p className="text-sm font-medium text-zinc-900">
          No buildings in this portfolio yet
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Add a building to start benchmarking, BEPS review, and filing work.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50/50">
            <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <th className="px-6 py-3 font-medium">Building</th>
              <th className="px-6 py-3 font-medium text-right">Latest Score</th>
              <th className="px-6 py-3 font-medium">Compliance Outlook</th>
              <th className="px-6 py-3 font-medium text-right">
                Penalty Estimate
              </th>
              <th className="px-6 py-3 font-medium text-right">
                Data Freshness
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {buildings.map((building) => {
              const snapshot = building.latestSnapshot;
              const penalty = formatPenalty(snapshot?.estimatedPenalty);
              const freshness = relativeTime(
                snapshot?.snapshotDate ?? building.updatedAt,
              );
              const compliance = getComplianceStatusDisplay(
                snapshot?.complianceStatus ?? "PENDING_DATA",
              );

              return (
                <tr
                  key={building.id}
                  className="group transition-colors duration-200 hover:bg-zinc-50"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/buildings/${building.id}`}
                      className="font-semibold text-zinc-900 transition-colors group-hover:text-amber-600"
                    >
                      {building.name}
                    </Link>
                    <div className="mt-1 text-[13px] text-zinc-500">
                      {PROPERTY_LABELS[building.propertyType] ??
                        building.propertyType}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-semibold text-zinc-900">
                      {snapshot?.energyStarScore != null
                        ? snapshot.energyStarScore
                        : "Not scored"}
                    </div>
                    <div className="mt-1 text-[12px] text-zinc-500">
                      {snapshot?.energyStarScore != null
                        ? "Most recent score"
                        : "Needs usable benchmark data"}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge
                      label={compliance.label}
                      tone={compliance.tone}
                    />
                    <div className="mt-1 text-[12px] text-zinc-500">
                      {snapshot?.complianceStatus === "NON_COMPLIANT"
                        ? "Immediate follow-up needed"
                        : snapshot?.complianceStatus === "AT_RISK"
                          ? "Review before filing"
                          : snapshot?.complianceStatus === "COMPLIANT"
                            ? "No immediate filing risk"
                            : "Connect or refresh data"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-semibold" style={{ color: penalty.color }}>
                      {penalty.text}
                    </div>
                    <div className="mt-1 text-[12px] text-zinc-500">
                      {penalty.note}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div
                      className="font-semibold text-[13px]"
                      style={{ color: freshness.color }}
                    >
                      {freshness.text}
                    </div>
                    <div className="mt-1 text-[12px] text-zinc-500">
                      {freshness.note}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
