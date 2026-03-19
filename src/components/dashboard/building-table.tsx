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
  snapshotDate: string | Date;
}

interface PenaltySummary {
  status: "ESTIMATED" | "NOT_APPLICABLE" | "INSUFFICIENT_CONTEXT";
  currentEstimatedPenalty: number | null;
}

interface BuildingRow {
  id: string;
  name: string;
  propertyType: string;
  latestSnapshot: Snapshot | null;
  updatedAt: string | Date;
}

function formatPenalty(summary: PenaltySummary | null | undefined) {
  if (!summary) {
    return {
      text: "Unavailable",
      color: "var(--muted-foreground)",
      note: "Governed estimate not loaded",
    };
  }

  if (summary.status === "NOT_APPLICABLE") {
    return {
      text: "$0",
      color: "var(--muted-foreground)",
      note: "Not applicable under governed context",
    };
  }

  if (summary.status === "INSUFFICIENT_CONTEXT" || summary.currentEstimatedPenalty == null) {
    return {
      text: "Unavailable",
      color: "var(--muted-foreground)",
      note: "Insufficient governed context",
    };
  }

  return {
    text: `$${summary.currentEstimatedPenalty.toLocaleString()}`,
    color: "rgb(220, 38, 38)",
    note: "Current governed estimate",
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

export function BuildingTable({
  buildings,
  penaltySummariesByBuildingId,
}: {
  buildings: BuildingRow[];
  penaltySummariesByBuildingId: Map<string, PenaltySummary>;
}) {
  if (buildings.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
        <p className="text-sm font-medium text-slate-900">
          No buildings in this portfolio yet
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Add a building to start benchmarking, BEPS review, and filing work.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden card-machined">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/50">
            <tr className="border-b border-slate-200/60 text-xs font-semibold uppercase tracking-wider text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {buildings.map((building) => {
              const snapshot = building.latestSnapshot;
              const penalty = formatPenalty(
                penaltySummariesByBuildingId.get(building.id),
              );
              const freshness = relativeTime(
                snapshot?.snapshotDate ?? building.updatedAt,
              );
              const compliance = getComplianceStatusDisplay(
                snapshot?.complianceStatus ?? "PENDING_DATA",
              );

              return (
                <tr
                  key={building.id}
                  className="group transition-colors duration-200 hover:bg-slate-50"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/buildings/${building.id}`}
                      className="font-semibold text-slate-900 transition-colors group-hover:text-amber-600"
                    >
                      {building.name}
                    </Link>
                    <div className="mt-1 text-[13px] text-slate-500">
                      {PROPERTY_LABELS[building.propertyType] ??
                        building.propertyType}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-mono font-medium text-slate-800">
                      {snapshot?.energyStarScore != null
                        ? snapshot.energyStarScore
                        : "---"}
                    </div>
                    <div className="mt-1 text-[12px] text-slate-500">
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
                    <div className="mt-1 text-[12px] text-slate-500">
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
                    <div className="font-mono font-medium" style={{ color: penalty.color }}>
                      {penalty.text}
                    </div>
                    <div className="mt-1 text-[12px] text-slate-500">
                      {penalty.note}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div
                      className="font-mono font-medium text-[13px]"
                      style={{ color: freshness.color }}
                    >
                      {freshness.text}
                    </div>
                    <div className="mt-1 text-[12px] text-slate-500">
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
