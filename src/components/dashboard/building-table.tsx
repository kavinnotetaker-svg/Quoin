"use client";

import React from "react";
import Link from "next/link";
import {
 StatusBadge,
 getComplianceStatusDisplay,
} from "@/components/internal/status-helpers";
import { motion, type Variants } from "framer-motion";

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
 color: "text-zinc-400",
 note: "Governed estimate not loaded",
 };
 }

 if (summary.status === "NOT_APPLICABLE") {
 return {
 text: "$0",
 color: "text-zinc-400",
 note: "Not applicable under governed context",
 };
 }

 if (summary.status === "INSUFFICIENT_CONTEXT" || summary.currentEstimatedPenalty == null) {
 return {
 text: "Unavailable",
 color: "text-zinc-400",
 note: "Insufficient governed context",
 };
 }

 return {
 text: `$${summary.currentEstimatedPenalty.toLocaleString()}`,
 color: "text-red-600",
 note: "Current governed estimate",
 };
}

function relativeTime(date: string | Date) {
 const d = new Date(date);
 const now = new Date();
 const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);

 if (days === 0) {
 return { text: "Today", color: "text-emerald-600", note: "Fresh data" };
 }

 if (days === 1) {
 return { text: "1d ago", color: "text-emerald-600", note: "Fresh data" };
 }

 const text = `${days}d ago`;
 if (days <= 30) {
 return { text, color: "text-emerald-600", note: "Fresh data" };
 }

 if (days <= 60) {
 return { text, color: "text-amber-600", note: "Review freshness" };
 }

 return { text, color: "text-red-600", note: "Stale data" };
}

const PROPERTY_LABELS: Record<string, string> = {
 OFFICE: "Office",
 MULTIFAMILY: "Multifamily",
 MIXED_USE: "Mixed Use",
 OTHER: "Other",
};

const container: Variants = {
 hidden: { opacity: 0 },
 show: {
 opacity: 1,
 transition: {
 staggerChildren: 0.05,
 },
 },
};

const rowVariants: Variants = {
 hidden: { opacity: 0, x: -5 },
 show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" } },
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
 <div className="flex min-h-[400px] flex-col items-center justify-center border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center">
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
 <div className="overflow-hidden card-machined">
 <div className="overflow-x-auto">
 <table className="w-full text-left text-sm">
 <thead className="bg-zinc-50">
 <tr className="border-b border-zinc-200/60 text-xs font-semibold uppercase tracking-wider text-zinc-500">
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
 <motion.tbody 
 variants={container}
 initial="hidden"
 animate="show"
 className="divide-y divide-zinc-100"
 >
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
 <motion.tr
 key={building.id}
 variants={rowVariants}
 className="group transition-colors duration-200 hover:bg-zinc-50"
 >
 <td className="px-6 py-4">
 <Link
 href={`/buildings/${building.id}`}
 className="font-semibold text-zinc-900 transition-colors group-hover:text-zinc-600"
 >
 {building.name}
 </Link>
 <div className="mt-1 text-sm text-zinc-500">
 {PROPERTY_LABELS[building.propertyType] ??
 building.propertyType}
 </div>
 </td>
 <td className="px-6 py-4 text-right">
 <div className="font-mono font-medium text-zinc-800">
 {snapshot?.energyStarScore != null
 ? snapshot.energyStarScore
 : "---"}
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
 <div className={`font-mono font-medium ${penalty.color}`}>
 {penalty.text}
 </div>
 <div className="mt-1 text-[12px] text-zinc-500">
 {penalty.note}
 </div>
 </td>
 <td className="px-6 py-4 text-right">
 <div
 className={`font-mono font-medium text-sm ${freshness.color}`}
 >
 {freshness.text}
 </div>
 <div className="mt-1 text-[12px] text-zinc-500">
 {freshness.note}
 </div>
 </td>
 </motion.tr>
 );
 })}
 </motion.tbody>
 </table>
 </div>
 </div>
 );
}
