"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Panel,
  downloadTextFile,
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
  const packets = trpc.beps.listPackets.useQuery({ buildingId, limit: 10 });

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
      utils.beps.listPackets.invalidate({ buildingId, limit: 10 }),
      utils.building.get.invalidate({ id: buildingId }),
      utils.building.list.invalidate(),
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

  return (
    <div className="space-y-6">
      <Panel
        title="BEPS Evaluation"
        subtitle="Evaluate BEPS, refresh canonical metrics, and manage governed filing packets."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={cycle}
              onChange={(event) => setCycle(event.target.value as (typeof CYCLES)[number])}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {CYCLES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <button
              onClick={() => refreshMetrics.mutate({ buildingId, cycle })}
              disabled={refreshMetrics.isPending}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Refresh Metrics
            </button>
            <button
              onClick={() => evaluate.mutate({ buildingId, cycle })}
              disabled={evaluate.isPending}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Evaluate BEPS
            </button>
            {latestFiling ? (
              <>
                <button
                  onClick={() => generatePacket.mutate({ buildingId, filingRecordId: latestFiling.id })}
                  disabled={generatePacket.isPending}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Generate Packet
                </button>
                <button
                  onClick={() => finalizePacket.mutate({ buildingId, filingRecordId: latestFiling.id })}
                  disabled={finalizePacket.isPending}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Finalize Packet
                </button>
                <button
                  onClick={async () => {
                    const exportResult = await utils.beps.exportPacket.fetch({
                      buildingId,
                      filingRecordId: latestFiling.id,
                      format: "JSON",
                    });
                    downloadTextFile({
                      fileName: exportResult.fileName,
                      content: exportResult.content,
                      contentType: exportResult.contentType,
                    });
                  }}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export JSON
                </button>
              </>
            ) : null}
          </div>
        }
      >
        <MetricGrid
          items={[
            { label: "Cycle", value: cycle },
            { label: "Filing Year", value: inputState.data?.filingYear ?? "—" },
            { label: "Ownership", value: inputState.data?.building?.ownershipType ?? "—" },
            { label: "Score Eligible", value: inputState.data?.building?.isEnergyStarScoreEligible == null ? "—" : inputState.data?.building?.isEnergyStarScoreEligible ? "Yes" : "No" },
          ]}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Canonical Metric Input" subtitle="Current persisted BEPS metric inputs and manual admin upsert surface.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Baseline adjusted site EUI</span>
              <input value={baselineAdjustedSiteEui} onChange={(event) => setBaselineAdjustedSiteEui(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Evaluation adjusted site EUI</span>
              <input value={evaluationAdjustedSiteEui} onChange={(event) => setEvaluationAdjustedSiteEui(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Baseline WN source EUI</span>
              <input value={baselineWeatherNormalizedSourceEui} onChange={(event) => setBaselineWeatherNormalizedSourceEui(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Evaluation WN source EUI</span>
              <input value={evaluationWeatherNormalizedSourceEui} onChange={(event) => setEvaluationWeatherNormalizedSourceEui(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Baseline ENERGY STAR score</span>
              <input value={baselineEnergyStarScore} onChange={(event) => setBaselineEnergyStarScore(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Evaluation ENERGY STAR score</span>
              <input value={evaluationEnergyStarScore} onChange={(event) => setEvaluationEnergyStarScore(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
          </div>
          <div className="mt-4">
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
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {upsertMetricInput.isPending ? "Saving..." : "Save Canonical Metrics"}
            </button>
          </div>
        </Panel>

        <Panel title="Latest BEPS Filing" subtitle="Current governed BEPS run, filing status, and deterministic packet state.">
          {!latestFiling ? (
            <EmptyState message="No governed BEPS filing exists for this cycle yet." />
          ) : (
            <div className="space-y-3 text-sm text-gray-700">
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
              <details className="rounded border border-gray-200 px-3 py-3">
                <summary className="cursor-pointer font-medium text-gray-900">Filing payload</summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-gray-600">
                  {JSON.stringify(latestFiling.filingPayload, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Prescriptive Progress" subtitle="Manual admin surface for canonical prescriptive milestones.">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Name</span>
              <input value={prescriptiveName} onChange={(event) => setPrescriptiveName(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Points possible</span>
              <input value={prescriptivePointsPossible} onChange={(event) => setPrescriptivePointsPossible(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Points earned</span>
              <input value={prescriptivePointsEarned} onChange={(event) => setPrescriptivePointsEarned(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
          </div>
          <div className="mt-4">
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
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {upsertPrescriptiveItem.isPending ? "Saving..." : "Save Prescriptive Item"}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {canonical?.prescriptiveItems?.length ? canonical.prescriptiveItems.map((item) => (
              <div key={item.id} className="rounded border border-gray-200 px-3 py-2 text-sm">
                <div className="font-medium text-gray-900">{item.name}</div>
                <div className="text-xs text-gray-500">{item.status}</div>
              </div>
            )) : <EmptyState message="No canonical prescriptive items exist yet." />}
          </div>
        </Panel>

        <Panel title="Alternative Compliance Agreement" subtitle="Canonical ACP/agreement record for the selected cycle.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Agreement identifier</span>
              <input value={agreementIdentifier} onChange={(event) => setAgreementIdentifier(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Multiplier</span>
              <input value={agreementMultiplier} onChange={(event) => setAgreementMultiplier(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
            </label>
          </div>
          <div className="mt-4">
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
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {upsertAgreement.isPending ? "Saving..." : "Save ACP Agreement"}
            </button>
          </div>
          {canonical?.alternativeComplianceAgreement ? (
            <div className="mt-4 rounded border border-gray-200 px-3 py-3 text-sm text-gray-700">
              <div className="font-medium text-gray-900">
                {canonical.alternativeComplianceAgreement.agreementIdentifier}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {canonical.alternativeComplianceAgreement.status} • {canonical.alternativeComplianceAgreement.pathway}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Multiplier {formatNumber(canonical.alternativeComplianceAgreement.multiplier, 2)}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState message="No canonical alternative compliance agreement exists yet." />
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Recent Outcomes" subtitle="Recent governed BEPS filing outcomes for this building.">
        {!outcomes.data || outcomes.data.length === 0 ? (
          <EmptyState message="No BEPS filing outcomes are available yet." />
        ) : (
          <div className="space-y-3">
            {outcomes.data.map((outcome) => (
              <div key={outcome.id} className="rounded border border-gray-200 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-gray-900">{outcome.complianceCycle ?? "—"} • {outcome.status}</div>
                  <div className="text-xs text-gray-500">Year {outcome.filingYear ?? "—"}</div>
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  Evidence artifacts {outcome.evidenceArtifacts.length} • Created {formatDate(outcome.createdAt)}
                </div>
                <details className="mt-2 rounded border border-gray-100 bg-gray-50 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-gray-700">Payload</summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-gray-600">
                    {JSON.stringify(outcome.filingPayload, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
