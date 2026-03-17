"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  downloadTextFile,
  formatMoney,
  formatNumber,
} from "@/components/internal/admin-primitives";

export function FinancingTab({ buildingId }: { buildingId: string }) {
  const [caseName, setCaseName] = useState("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const utils = trpc.useUtils();

  const candidates = trpc.retrofit.listCandidates.useQuery({ buildingId, limit: 100 });
  const cases = trpc.financing.listCases.useQuery({ buildingId, limit: 50 });
  const selectedCase = useMemo(
    () => cases.data?.find((item) => item.id === selectedCaseId) ?? null,
    [cases.data, selectedCaseId],
  );
  const hasSelectedPacket = (selectedCase?.packets?.length ?? 0) > 0;
  const packet = trpc.financing.packetByCase.useQuery(
    { buildingId, financingCaseId: selectedCaseId },
    { enabled: !!selectedCaseId && hasSelectedPacket, retry: false },
  );
  const manifest = trpc.financing.packetManifest.useQuery(
    { buildingId, financingCaseId: selectedCaseId },
    { enabled: !!selectedCaseId && hasSelectedPacket, retry: false },
  );

  useEffect(() => {
    if (!selectedCaseId && cases.data?.[0]?.id) {
      setSelectedCaseId(cases.data[0].id);
    }
  }, [selectedCaseId, cases.data]);

  const invalidateCase = async (financingCaseId: string) => {
    await utils.financing.listCases.invalidate({ buildingId, limit: 50 });
    await utils.building.get.invalidate({ id: buildingId });
    await utils.building.portfolioWorkflow.invalidate({ limit: 25 });
    const refreshedCases = await utils.financing.listCases.fetch({ buildingId, limit: 50 });
    const refreshedCase = refreshedCases.find((item) => item.id === financingCaseId);
    const hasPacket = (refreshedCase?.packets?.length ?? 0) > 0;

    if (hasPacket) {
      await Promise.all([
        utils.financing.packetByCase.invalidate({ buildingId, financingCaseId }),
        utils.financing.packetManifest.invalidate({ buildingId, financingCaseId }),
      ]);
      return;
    }

    utils.financing.packetByCase.setData({ buildingId, financingCaseId }, undefined);
    utils.financing.packetManifest.setData({ buildingId, financingCaseId }, undefined);
  };

  const upsertCase = trpc.financing.upsertCase.useMutation({
    onSuccess: async (result) => {
      setSelectedCaseId(result.id);
      setCaseName("");
      setSelectedCandidateIds([]);
      await invalidateCase(result.id);
    },
  });
  const generatePacket = trpc.financing.generatePacket.useMutation({
    onSuccess: async (result) => {
      await invalidateCase(result.financingCaseId);
    },
  });
  const finalizePacket = trpc.financing.finalizePacket.useMutation({
    onSuccess: async (result) => {
      await invalidateCase(result.financingCaseId);
    },
  });

  if (candidates.isLoading || cases.isLoading) {
    return <LoadingState />;
  }

  if (candidates.error || cases.error) {
    const error = candidates.error ?? cases.error;
    return <ErrorState message="Financing packets are unavailable." detail={error?.message} />;
  }

  const btnClass = "rounded-md border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-50";

  return (
    <div className="space-y-6">
      <Panel title="Financing workflow" subtitle="Bundle retrofit candidates into a financeable case and generate the supporting packet when the scope is ready.">
        {!candidates.data || candidates.data.length === 0 ? (
          <EmptyState message="Create retrofit candidates first so Quoin has something to bundle into a financing case." />
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Case name</span>
              <input
                value={caseName}
                onChange={(event) => setCaseName(event.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-[13px] text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
                placeholder="e.g., HVAC upgrade and lighting replacement"
              />
            </label>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {candidates.data.map((candidate) => {
                const checked = selectedCandidateIds.includes(candidate.id);
                return (
                  <label key={candidate.id} className={`flex items-start gap-3 rounded-lg border p-4 text-sm cursor-pointer transition-all ${
                    checked ? "border-zinc-900 bg-zinc-50/50 shadow-sm" : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                  }`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedCandidateIds((current) =>
                          checked
                            ? current.filter((id) => id !== candidate.id)
                            : [...current, candidate.id],
                        )
                      }
                      className="mt-1 flex-shrink-0 appearance-none h-4 w-4 bg-white border border-zinc-300 rounded-sm checked:bg-zinc-900 checked:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-zinc-900 relative
                      before:content-[''] before:hidden checked:before:block before:absolute before:left-[5px] before:top-[1px] before:w-[5px] before:h-[10px] before:border-r-2 before:border-b-2 before:border-white before:rotate-45"
                    />
                    <div>
                      <div className="font-semibold text-zinc-900 tracking-tight">{candidate.name}</div>
                      <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{candidate.projectType}</div>
                      <div className="mt-2 text-[13px] text-zinc-600 font-medium">
                        Capex <span className="text-zinc-900">{formatMoney(candidate.estimatedCapex)}</span> • 
                        Savings <span className="text-zinc-900">{formatMoney(candidate.estimatedAnnualSavingsUsd)}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="mt-5 pt-5 border-t border-zinc-100 flex justify-end">
              <button
                onClick={() =>
                  upsertCase.mutate({
                    buildingId,
                    name: caseName || undefined,
                    candidateIds: selectedCandidateIds,
                  })
                }
                disabled={upsertCase.isPending || selectedCandidateIds.length === 0}
                className="rounded-md bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {upsertCase.isPending ? "Saving..." : "Create financing case"}
              </button>
            </div>
          </>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Financing cases" subtitle="Current financing cases and linked retrofit bundles for this building.">
          {!cases.data || cases.data.length === 0 ? (
            <EmptyState message="No financing cases exist for this building yet." />
          ) : (
            <div className="space-y-3">
              {cases.data.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedCaseId(item.id)}
                  className={`w-full rounded-xl border p-5 text-left transition-all ${selectedCaseId === item.id ? "border-zinc-900 bg-zinc-50/80 shadow-sm" : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[15px] tracking-tight text-zinc-900">{item.name}</div>
                    <div className="text-[11px] font-bold uppercase tracking-wider bg-white border border-zinc-200 shadow-sm px-2 py-0.5 rounded-md text-zinc-600">{item.caseType}</div>
                  </div>
                  <div className="mt-4 grid gap-3 text-[13px] text-zinc-500 font-medium sm:grid-cols-2">
                    <div>Capex: <span className="text-zinc-900">{formatMoney(item.estimatedCapex)}</span></div>
                    <div>Savings: <span className="text-zinc-900">{formatMoney(item.estimatedAnnualSavingsUsd)}</span></div>
                    <div>Avoided penalty: <span className="text-zinc-900">{formatMoney(item.estimatedAvoidedPenalty)}</span></div>
                    <div>Compliance uplift: <span className="text-zinc-900">{formatNumber(item.estimatedComplianceImprovementPct)}%</span></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Financing packet"
          subtitle="Generate, finalize, inspect, and export the packet for the selected case."
          actions={
            selectedCase ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => generatePacket.mutate({ buildingId, financingCaseId: selectedCase.id })}
                  disabled={generatePacket.isPending}
                  className={btnClass}
                >
                  {generatePacket.isPending ? "Generating..." : "Generate Draft"}
                </button>
                <button
                  onClick={() => finalizePacket.mutate({ buildingId, financingCaseId: selectedCase.id })}
                  disabled={finalizePacket.isPending}
                  className={btnClass}
                >
                  {finalizePacket.isPending ? "Finalizing..." : "Finalize"}
                </button>
                <button
                  onClick={async () => {
                    const exportResult = await utils.financing.exportPacket.fetch({
                      buildingId,
                      financingCaseId: selectedCase.id,
                      format: "JSON",
                    });
                    downloadTextFile({
                      fileName: exportResult.fileName,
                      content: exportResult.content,
                      contentType: exportResult.contentType,
                    });
                  }}
                  className={btnClass}
                >
                  Export JSON
                </button>
              </div>
            ) : null
          }
        >
          {!selectedCase ? (
            <EmptyState message="Select a financing case to inspect its packet." />
          ) : packet.error?.data?.code === "NOT_FOUND" || !packet.data ? (
            <EmptyState message="No financing packet exists for the selected case yet." />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="font-semibold text-lg tracking-tight text-zinc-900">
                    Packet v{packet.data.version}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md">
                    {packet.data.status}
                  </div>
                </div>
                <div className="mt-3 text-[13px] font-medium text-zinc-500 break-all bg-zinc-50 border border-zinc-100 p-2 rounded-md font-mono">
                  {packet.data.packetHash}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900 tracking-tight">Diagnostics & Warnings</div>
                {manifest.data && manifest.data.warnings.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed font-medium text-amber-700">
                    {manifest.data.warnings.map((warning, index) => {
                      const record =
                        warning && typeof warning === "object" && !Array.isArray(warning)
                          ? (warning as Record<string, unknown>)
                          : {};
                      return <li key={`${String(record.code ?? "warning")}-${index}`}>{String(record.message ?? record.code ?? "Warning")}</li>;
                    })}
                  </ul>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-[13px] text-zinc-500 font-medium bg-zinc-50 border border-zinc-100 p-3 rounded-lg">
                    <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    No current packet warnings. Everything looks good.
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
