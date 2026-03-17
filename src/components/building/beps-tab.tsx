"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BepsDeliveryPanel } from "./beps-delivery-panel";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Panel,
  downloadFile,
  formatDate,
  formatMoney,
  formatNumber,
} from "@/components/internal/admin-primitives";

const CYCLES = ["CYCLE_1", "CYCLE_2", "CYCLE_3"] as const;

function toNumberOrUndefined(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

function todayIso() {
  return new Date().toISOString();
}

export function BepsTab({ buildingId }: { buildingId: string }) {
  const [cycle, setCycle] = useState<(typeof CYCLES)[number]>("CYCLE_1");
  const [baselineAdjustedSiteEui, setBaselineAdjustedSiteEui] = useState("");
  const [evaluationAdjustedSiteEui, setEvaluationAdjustedSiteEui] = useState("");
  const [baselineWeatherNormalizedSourceEui, setBaselineWeatherNormalizedSourceEui] = useState("");
  const [evaluationWeatherNormalizedSourceEui, setEvaluationWeatherNormalizedSourceEui] = useState("");
  const [baselineEnergyStarScore, setBaselineEnergyStarScore] = useState("");
  const [evaluationEnergyStarScore, setEvaluationEnergyStarScore] = useState("");
  const [prescriptiveName, setPrescriptiveName] = useState("");
  const [prescriptivePointsPossible, setPrescriptivePointsPossible] = useState("");
  const [prescriptivePointsEarned, setPrescriptivePointsEarned] = useState("");
  const [agreementIdentifier, setAgreementIdentifier] = useState("");
  const [agreementMultiplier, setAgreementMultiplier] = useState("");

  const utils = trpc.useUtils();
  const inputState = trpc.beps.inputState.useQuery({ buildingId, cycle }, { retry: false });
  const latestRun = trpc.beps.latestRun.useQuery({ buildingId, cycle }, { retry: false });
  const outcomes = trpc.beps.listOutcomes.useQuery({ buildingId, limit: 10 });
  const packets = trpc.beps.listPackets.useQuery({
    buildingId,
    packetType: "COMPLETED_ACTIONS",
    limit: 10,
  });

  useEffect(() => {
    const metricInput = inputState.data?.canonicalInputState.metricInput;
    if (!metricInput) {
      return;
    }

    setBaselineAdjustedSiteEui(metricInput.baselineAdjustedSiteEui?.toString() ?? "");
    setEvaluationAdjustedSiteEui(metricInput.evaluationAdjustedSiteEui?.toString() ?? "");
    setBaselineWeatherNormalizedSourceEui(
      metricInput.baselineWeatherNormalizedSourceEui?.toString() ?? "",
    );
    setEvaluationWeatherNormalizedSourceEui(
      metricInput.evaluationWeatherNormalizedSourceEui?.toString() ?? "",
    );
    setBaselineEnergyStarScore(metricInput.baselineEnergyStarScore?.toString() ?? "");
    setEvaluationEnergyStarScore(metricInput.evaluationEnergyStarScore?.toString() ?? "");
  }, [inputState.data?.canonicalInputState.metricInput]);

  const invalidateCycle = async () => {
    await Promise.all([
      utils.beps.inputState.invalidate({ buildingId, cycle }),
      utils.beps.latestRun.invalidate({ buildingId, cycle }),
      utils.beps.listOutcomes.invalidate({ buildingId, limit: 10 }),
      utils.beps.listPackets.invalidate({
        buildingId,
        packetType: "COMPLETED_ACTIONS",
        limit: 10,
      }),
      utils.building.get.invalidate({ id: buildingId }),
      utils.building.list.invalidate(),
      utils.building.portfolioWorkflow.invalidate({ limit: 25 }),
      utils.building.complianceHistory.invalidate({ buildingId, limit: 20 }),
      utils.report.getComplianceReport.invalidate({ buildingId }),
    ]);
  };

  const refreshMetrics = trpc.beps.refreshCanonicalMetrics.useMutation({
    onSuccess: async () => {
      await invalidateCycle();
    },
  });
  const evaluate = trpc.beps.evaluate.useMutation({
    onSuccess: async () => {
      await invalidateCycle();
    },
  });
  const upsertMetricInput = trpc.beps.upsertMetricInput.useMutation({
    onSuccess: async () => {
      await invalidateCycle();
    },
  });
  const upsertPrescriptiveItem = trpc.beps.upsertPrescriptiveItem.useMutation({
    onSuccess: () => {
      setPrescriptiveName("");
      setPrescriptivePointsPossible("");
      setPrescriptivePointsEarned("");
      invalidateCycle();
    },
  });
  const upsertAgreement = trpc.beps.upsertAlternativeComplianceAgreement.useMutation({
    onSuccess: () => {
      setAgreementIdentifier("");
      setAgreementMultiplier("");
      invalidateCycle();
    },
  });
  const generatePacket = trpc.beps.generatePacket.useMutation({
    onSuccess: async () => {
      await invalidateCycle();
    },
  });
  const finalizePacket = trpc.beps.finalizePacket.useMutation({
    onSuccess: async () => {
      await invalidateCycle();
    },
  });

  if (inputState.isLoading || outcomes.isLoading || packets.isLoading) {
    return <LoadingState />;
  }

  if (inputState.error || outcomes.error || packets.error) {
    const error = inputState.error ?? outcomes.error ?? packets.error;
    return <ErrorState message="BEPS workflow is unavailable." detail={error?.message} />;
  }

  const canonical = inputState.data?.canonicalInputState;
  const latestPacket = packets.data?.[0] ?? null;
  const latestFiling = latestRun.error?.data?.code === "NOT_FOUND" ? null : latestRun.data;

  const btnClass = "rounded-md border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50";
  const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 transition-colors";
  const labelSpanClass = "mb-1.5 block text-[11px] font-semibold tracking-wider text-slate-500 uppercase";

  return (
    <div className="space-y-6">
      <Panel
        title="BEPS review and filing"
        subtitle="Refresh governed inputs, run the active cycle evaluation, and prepare the filing packet when the result is ready."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={cycle}
              onChange={(event) => setCycle(event.target.value as (typeof CYCLES)[number])}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 transition-colors"
            >
              {CYCLES.map((value) => (
                <option key={value} value={value}>{value.replace("_", " ")}</option>
              ))}
            </select>
            <button
              onClick={() => refreshMetrics.mutate({ buildingId, cycle })}
              disabled={refreshMetrics.isPending}
              className={btnClass}
            >
              Refresh BEPS Inputs
            </button>
            <button
              onClick={() => evaluate.mutate({ buildingId, cycle })}
              disabled={evaluate.isPending}
              className={btnClass}
            >
              Run BEPS Evaluation
            </button>
            {latestFiling ? (
              <>
                <button
                  onClick={() => generatePacket.mutate({ buildingId, filingRecordId: latestFiling.id })}
                  disabled={generatePacket.isPending}
                  className={btnClass}
                >
                  Generate Filing Packet
                </button>
                <button
                  onClick={() => finalizePacket.mutate({ buildingId, filingRecordId: latestFiling.id })}
                  disabled={finalizePacket.isPending}
                  className={btnClass}
                >
                  Finalize Filing Packet
                </button>
                <button
                  onClick={async () => {
                    const exportResult = await utils.beps.exportPacket.fetch({
                      buildingId,
                      filingRecordId: latestFiling.id,
                      format: "PDF",
                    });
                    downloadFile({
                      fileName: exportResult.fileName,
                      content: exportResult.content,
                      contentType: exportResult.contentType,
                      encoding: exportResult.encoding,
                    });
                  }}
                  className={btnClass}
                >
                  Export Filing PDF
                </button>
              </>
            ) : null}
          </div>
        }
      >
        <MetricGrid
          items={[
            { label: "Cycle", value: cycle.replace("_", " ") },
            { label: "Filing Year", value: inputState.data?.filingYear ?? "—" },
            { label: "Ownership", value: inputState.data?.building?.ownershipType ?? "—" },
            { label: "Score Eligible", value: inputState.data?.building?.isEnergyStarScoreEligible == null ? "—" : inputState.data?.building?.isEnergyStarScoreEligible ? "Yes" : "No" },
          ]}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Canonical Metric Input" subtitle="Current persisted BEPS metric inputs and manual admin upsert surface.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className={labelSpanClass}>Baseline adjusted site EUI</span>
              <input value={baselineAdjustedSiteEui} onChange={(event) => setBaselineAdjustedSiteEui(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className={labelSpanClass}>Evaluation adjusted site EUI</span>
              <input value={evaluationAdjustedSiteEui} onChange={(event) => setEvaluationAdjustedSiteEui(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className={labelSpanClass}>Baseline WN source EUI</span>
              <input value={baselineWeatherNormalizedSourceEui} onChange={(event) => setBaselineWeatherNormalizedSourceEui(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className={labelSpanClass}>Evaluation WN source EUI</span>
              <input value={evaluationWeatherNormalizedSourceEui} onChange={(event) => setEvaluationWeatherNormalizedSourceEui(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className={labelSpanClass}>Baseline score</span>
              <input value={baselineEnergyStarScore} onChange={(event) => setBaselineEnergyStarScore(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className={labelSpanClass}>Evaluation score</span>
              <input value={evaluationEnergyStarScore} onChange={(event) => setEvaluationEnergyStarScore(event.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="mt-5">
            <button
              onClick={() =>
                upsertMetricInput.mutate({
                  buildingId,
                  cycle,
                  baselineAdjustedSiteEui: toNumberOrUndefined(baselineAdjustedSiteEui),
                  evaluationAdjustedSiteEui: toNumberOrUndefined(evaluationAdjustedSiteEui),
                  baselineWeatherNormalizedSourceEui: toNumberOrUndefined(baselineWeatherNormalizedSourceEui),
                  evaluationWeatherNormalizedSourceEui: toNumberOrUndefined(evaluationWeatherNormalizedSourceEui),
                  baselineEnergyStarScore: toNumberOrUndefined(baselineEnergyStarScore),
                  evaluationEnergyStarScore: toNumberOrUndefined(evaluationEnergyStarScore),
                })
              }
              disabled={upsertMetricInput.isPending}
              className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-medium text-slate-900 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {upsertMetricInput.isPending ? "Saving..." : "Save Canonical Metrics"}
            </button>
          </div>
        </Panel>

        <Panel title="Latest BEPS Filing" subtitle="Current governed BEPS run, filing status, and deterministic packet state.">
          {!latestFiling ? (
            <EmptyState message="No governed BEPS filing exists for this cycle yet." />
          ) : (
            <div className="space-y-4 text-sm text-slate-700">
              <MetricGrid
                items={[
                  { label: "Filing Status", value: latestFiling.status },
                  { label: "Filing Year", value: latestFiling.filingYear ?? "—" },
                  {
                    label: "Packet Status",
                    value: latestPacket?.status ?? "NONE",
                  },
                  {
                    label: "Packet Version",
                    value: latestPacket?.version ?? "—",
                  },
                ]}
              />
              <details className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 shadow-sm transition-all group">
                <summary className="cursor-pointer font-semibold tracking-tight text-slate-900 outline-none">Filing payload</summary>
                <div className="mt-3 bg-white border border-slate-100 rounded-md p-3 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-slate-600 font-mono">
                    {JSON.stringify(latestFiling.filingPayload, null, 2)}
                    </pre>
                </div>
              </details>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Prescriptive Progress" subtitle="Manual admin surface for canonical prescriptive milestones.">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className={labelSpanClass}>Name</span>
              <input value={prescriptiveName} onChange={(event) => setPrescriptiveName(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className={labelSpanClass}>Points possible</span>
              <input value={prescriptivePointsPossible} onChange={(event) => setPrescriptivePointsPossible(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className={labelSpanClass}>Points earned</span>
              <input value={prescriptivePointsEarned} onChange={(event) => setPrescriptivePointsEarned(event.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="mt-5">
            <button
              onClick={() =>
                upsertPrescriptiveItem.mutate({
                  buildingId,
                  cycle,
                  itemKey: prescriptiveName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || `item-${Date.now()}`,
                  name: prescriptiveName || "Prescriptive item",
                  status: "IN_PROGRESS",
                  pointsPossible: toNumberOrUndefined(prescriptivePointsPossible),
                  pointsEarned: toNumberOrUndefined(prescriptivePointsEarned),
                })
              }
              disabled={upsertPrescriptiveItem.isPending}
              className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-medium text-slate-900 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {upsertPrescriptiveItem.isPending ? "Saving..." : "Save Prescriptive Item"}
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {canonical?.prescriptiveItems?.length ? canonical.prescriptiveItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm shadow-sm flex flex-col items-start gap-1">
                <div className="font-semibold text-slate-900 tracking-tight">{item.name}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">{item.status}</div>
              </div>
            )) : <EmptyState message="No canonical prescriptive items exist yet." />}
          </div>
        </Panel>

        <Panel title="Alternative Compliance Agreement" subtitle="Canonical ACP/agreement record for the selected cycle.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className={labelSpanClass}>Agreement identifier</span>
              <input value={agreementIdentifier} onChange={(event) => setAgreementIdentifier(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className={labelSpanClass}>Multiplier</span>
              <input value={agreementMultiplier} onChange={(event) => setAgreementMultiplier(event.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="mt-5">
            <button
              onClick={() =>
                upsertAgreement.mutate({
                  buildingId,
                  cycle,
                  agreementIdentifier: agreementIdentifier || `agreement-${Date.now()}`,
                  pathway: "PERFORMANCE",
                  multiplier: toNumberOrUndefined(agreementMultiplier) ?? 1,
                  status: "ACTIVE",
                  effectiveFrom: todayIso(),
                })
              }
              disabled={upsertAgreement.isPending}
              className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-medium text-slate-900 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {upsertAgreement.isPending ? "Saving..." : "Save ACP Agreement"}
            </button>
          </div>
          {canonical?.alternativeComplianceAgreement ? (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-4 text-sm text-slate-700 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-10">
                <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
              </div>
              <div className="relative z-10">
                <div className="font-semibold text-lg tracking-tight text-slate-900">
                    {canonical.alternativeComplianceAgreement.agreementIdentifier}
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">{canonical.alternativeComplianceAgreement.status}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">{canonical.alternativeComplianceAgreement.pathway}</span>
                </div>
                <div className="mt-3 text-[13px] font-medium text-slate-500">
                    Multiplier: <span className="text-slate-900">{formatNumber(canonical.alternativeComplianceAgreement.multiplier, 2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState message="No canonical alternative compliance agreement exists yet." />
            </div>
          )}
        </Panel>
      </div>

      {latestFiling ? (
        <BepsDeliveryPanel
          buildingId={buildingId}
          filingRecordId={latestFiling.id}
          filingYear={latestFiling.filingYear}
          cycle={cycle}
        />
      ) : null}

      <Panel title="Recent Outcomes" subtitle="Recent governed BEPS filing outcomes for this building.">
        {!outcomes.data || outcomes.data.length === 0 ? (
          <EmptyState message="No BEPS filing outcomes are available yet." />
        ) : (
          <div className="space-y-4">
            {outcomes.data.map((outcome) => (
              <div key={outcome.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                    {outcome.complianceCycle?.replace("_", " ") ?? "—"}
                    <span className="text-slate-300 font-normal">|</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">{outcome.status}</span>
                  </div>
                  <div className="text-[13px] font-medium text-slate-500">Year {outcome.filingYear ?? "—"}</div>
                </div>
                <div className="mt-3 text-[13px] font-medium text-slate-500">
                  <span className="text-slate-900">{outcome.evidenceArtifacts.length}</span> artifacts • Created {formatDate(outcome.createdAt)}
                </div>
                <details className="mt-4 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 group outline-none">
                  <summary className="cursor-pointer text-[13px] font-semibold tracking-tight text-slate-700 outline-none">Payload Data</summary>
                  <div className="mt-3 bg-white border border-slate-100 rounded-md p-3 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-slate-600 font-mono">
                        {JSON.stringify(outcome.filingPayload, null, 2)}
                    </pre>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
