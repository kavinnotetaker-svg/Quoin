"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
 EmptyState,
 ErrorState,
 LoadingState,
 Panel,
 formatMoney,
 formatNumber,
} from "@/components/internal/admin-primitives";
import { humanizeToken } from "@/components/internal/status-helpers";

const PROJECT_TYPES = [
 "LED_LIGHTING_RETROFIT",
 "RETRO_COMMISSIONING",
 "BMS_UPGRADE",
 "VARIABLE_FREQUENCY_DRIVES",
 "LOW_FLOW_FIXTURES",
 "HEAT_PUMP_CONVERSION",
 "ENVELOPE_AIR_SEALING",
 "WINDOW_REPLACEMENT",
 "ROOF_INSULATION_UPGRADE",
 "ROOFTOP_SOLAR_PV",
 "CUSTOM",
] as const;

export function RetrofitTab({ buildingId }: { buildingId: string }) {
 const [projectType, setProjectType] =
 useState<(typeof PROJECT_TYPES)[number]>("LED_LIGHTING_RETROFIT");
 const [name, setName] = useState("");
 const [estimatedCapex, setEstimatedCapex] = useState("");
 const [estimatedAnnualSavingsUsd, setEstimatedAnnualSavingsUsd] = useState("");
 const [estimatedAnnualSavingsKbtu, setEstimatedAnnualSavingsKbtu] = useState("");
 const [estimatedBepsImprovementPct, setEstimatedBepsImprovementPct] =
 useState("");
 const [estimatedImplementationMonths, setEstimatedImplementationMonths] =
 useState("");

 const utils = trpc.useUtils();
 const candidates = trpc.retrofit.listCandidates.useQuery({ buildingId, limit: 50 });
 const rankings = trpc.retrofit.rankBuilding.useQuery({ buildingId, limit: 50 });
 const createCandidate = trpc.retrofit.upsertCandidate.useMutation({
 onSuccess: () => {
 setName("");
 setEstimatedCapex("");
 setEstimatedAnnualSavingsUsd("");
 setEstimatedAnnualSavingsKbtu("");
 setEstimatedBepsImprovementPct("");
 setEstimatedImplementationMonths("");
 utils.retrofit.listCandidates.invalidate({ buildingId, limit: 50 });
 utils.retrofit.rankBuilding.invalidate({ buildingId, limit: 50 });
 utils.building.get.invalidate({ id: buildingId });
 utils.building.portfolioWorklist.invalidate();
 },
 });

 if (candidates.isLoading || rankings.isLoading) {
 return <LoadingState />;
 }

 if (candidates.error || rankings.error) {
 const error = candidates.error ?? rankings.error;
 return (
 <ErrorState
 message="Retrofit ranking is unavailable."
 detail={error?.message}
 />
 );
 }

 const inputClass =
 "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
 const labelClass = "mb-1.5 block text-sm font-medium text-zinc-700";

 return (
 <div className="space-y-6">
 <Panel
 title="Retrofit planning"
 subtitle="Create and compare retrofit options so Quoin can rank the next practical project for this building."
 >
 <div className="grid gap-5 xl:grid-cols-3">
 <label className="block text-sm">
 <span className={labelClass}>Project type</span>
 <select
 value={projectType}
 onChange={(event) =>
 setProjectType(event.target.value as (typeof PROJECT_TYPES)[number])
 }
 className={inputClass}
 >
 {PROJECT_TYPES.map((type) => (
 <option key={type} value={type}>
 {humanizeToken(type)}
 </option>
 ))}
 </select>
 </label>
 <label className="block text-sm">
 <span className={labelClass}>Name</span>
 <input
 value={name}
 onChange={(event) => setName(event.target.value)}
 className={inputClass}
 placeholder="e.g., LED upgrade"
 />
 </label>
 <label className="block text-sm">
 <span className={labelClass}>Capex</span>
 <input
 value={estimatedCapex}
 onChange={(event) => setEstimatedCapex(event.target.value)}
 className={inputClass}
 placeholder="0.00"
 />
 </label>
 <label className="block text-sm">
 <span className={labelClass}>Annual savings (USD)</span>
 <input
 value={estimatedAnnualSavingsUsd}
 onChange={(event) => setEstimatedAnnualSavingsUsd(event.target.value)}
 className={inputClass}
 placeholder="0.00"
 />
 </label>
 <label className="block text-sm">
 <span className={labelClass}>Annual savings (kBtu)</span>
 <input
 value={estimatedAnnualSavingsKbtu}
 onChange={(event) => setEstimatedAnnualSavingsKbtu(event.target.value)}
 className={inputClass}
 placeholder="0"
 />
 </label>
 <label className="block text-sm">
 <span className={labelClass}>BEPS improvement (%)</span>
 <input
 value={estimatedBepsImprovementPct}
 onChange={(event) => setEstimatedBepsImprovementPct(event.target.value)}
 className={inputClass}
 placeholder="0"
 />
 </label>
 <label className="block text-sm">
 <span className={labelClass}>Implementation months</span>
 <input
 value={estimatedImplementationMonths}
 onChange={(event) => setEstimatedImplementationMonths(event.target.value)}
 className={inputClass}
 placeholder="0"
 />
 </label>
 </div>
 <div className="mt-6 flex justify-end border-t border-zinc-100 pt-5">
 <button
 onClick={() =>
 createCandidate.mutate({
 buildingId,
 projectType,
 name: name || undefined,
 estimatedCapex: estimatedCapex ? Number(estimatedCapex) : undefined,
 estimatedAnnualSavingsUsd: estimatedAnnualSavingsUsd
 ? Number(estimatedAnnualSavingsUsd)
 : undefined,
 estimatedAnnualSavingsKbtu: estimatedAnnualSavingsKbtu
 ? Number(estimatedAnnualSavingsKbtu)
 : undefined,
 estimatedBepsImprovementPct: estimatedBepsImprovementPct
 ? Number(estimatedBepsImprovementPct)
 : undefined,
 estimatedImplementationMonths: estimatedImplementationMonths
 ? Number(estimatedImplementationMonths)
 : undefined,
 status: "ACTIVE",
 })
 }
 disabled={createCandidate.isPending}
 className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
 >
 {createCandidate.isPending ? "Saving..." : "Save planning candidate"}
 </button>
 </div>
 </Panel>

 <div className="grid gap-6 xl:grid-cols-2">
 <Panel
 title="Candidate list"
 subtitle="Current retrofit ideas available for governed ranking on this building."
 >
 {!candidates.data || candidates.data.length === 0 ? (
 <EmptyState message="No retrofit candidates exist for this building yet." />
 ) : (
 <div className="space-y-3">
 {candidates.data.map((candidate) => (
 <div
 key={candidate.id}
 className="border border-zinc-200 p-5 transition-shadow hover:"
 >
 <div className="font-semibold text-base tracking-tight text-zinc-900">
 {candidate.name}
 </div>
 <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
 <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5">
 {humanizeToken(candidate.projectType)}
 </span>
 <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5">
 {humanizeToken(candidate.status)}
 </span>
 <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5">
 {humanizeToken(candidate.confidenceBand)}
 </span>
 </div>
 <div className="mt-4 grid gap-3 text-sm font-medium text-zinc-600 sm:grid-cols-3">
 <div>
 Capex:{" "}
 <span className="text-zinc-900">
 {formatMoney(candidate.estimatedCapex)}
 </span>
 </div>
 <div>
 Savings:{" "}
 <span className="text-zinc-900">
 {formatMoney(candidate.estimatedAnnualSavingsUsd)}
 </span>
 </div>
 <div>
 BEPS:{" "}
 <span className="text-zinc-900">
 {formatNumber(candidate.estimatedBepsImprovementPct)}%
 </span>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </Panel>

 <Panel
 title="Recommended order"
 subtitle="Deterministic ranking based on governed penalty context, explicit retrofit assumptions, timing, and aligned anomaly risk."
 >
 {!rankings.data || rankings.data.length === 0 ? (
 <EmptyState message="No retrofit rankings are available yet." />
 ) : (
 <div className="space-y-3">
 {rankings.data.map((ranking) => (
 <div
 key={ranking.candidateId}
 className="border border-zinc-200 p-5 transition-shadow hover:"
 >
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="font-semibold text-base tracking-tight text-zinc-900">
 {ranking.name}
 </div>
 <div className="rounded-md bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
 {humanizeToken(ranking.priorityBand)}
 </div>
 </div>
 <div className="mt-4 grid gap-3 text-sm font-medium text-zinc-600 sm:grid-cols-2">
 <div>
 Priority score:{" "}
 <span className="text-zinc-900">{ranking.priorityScore}</span>
 </div>
 <div>
 Avoided penalty:{" "}
 <span className="text-zinc-900">
 {formatMoney(ranking.estimatedAvoidedPenalty)}
 </span>
 </div>
 <div>
 Net cost:{" "}
 <span className="text-zinc-900">
 {formatMoney(ranking.netProjectCost)}
 </span>
 </div>
 <div>
 Payback:{" "}
 <span className="text-zinc-900">
 {ranking.paybackProxyYears == null
 ? "Not available"
 : `${ranking.paybackProxyYears} years`}
 </span>
 </div>
 <div>
 Operational risk reduction:{" "}
 <span className="text-zinc-900">
 {formatMoney(
 ranking.estimatedOperationalRiskReduction.penaltyImpactUsd,
 )}
 </span>
 </div>
 <div>
 Avoided penalty basis:{" "}
 <span className="text-zinc-900">
 {ranking.estimatedAvoidedPenaltyStatus
 ? humanizeToken(ranking.estimatedAvoidedPenaltyStatus)
 : "Not available"}
 </span>
 </div>
 </div>
 <div className="mt-3 text-sm text-zinc-600">
 {ranking.basis.summary}
 </div>
 {ranking.reasonCodes.length > 0 ? (
 <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
 {ranking.reasonCodes.map((reasonCode) => (
 <span
 key={reasonCode}
 className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-600"
 >
 {humanizeToken(reasonCode)}
 </span>
 ))}
 </div>
 ) : null}
 </div>
 ))}
 </div>
 )}
 </Panel>
 </div>
 </div>
 );
}
