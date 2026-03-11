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

  return (
    <div className="space-y-6">
      <Panel title="Create Financing Case" subtitle="Select one or more retrofit candidates to create a governed financing case.">
        {!candidates.data || candidates.data.length === 0 ? (
          <EmptyState message="Create retrofit candidates first to assemble financing cases." />
        ) : (
          <>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs text-gray-500">Case name</span>
              <input
                value={caseName}
                onChange={(event) => setCaseName(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {candidates.data.map((candidate) => {
                const checked = selectedCandidateIds.includes(candidate.id);
                return (
                  <label key={candidate.id} className="flex items-start gap-3 rounded border border-gray-200 px-3 py-3 text-sm">
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
                    />
                    <div>
                      <div className="font-medium text-gray-900">{candidate.name}</div>
                      <div className="text-xs text-gray-500">{candidate.projectType}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        Capex {formatMoney(candidate.estimatedCapex)} • Savings {formatMoney(candidate.estimatedAnnualSavingsUsd)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="mt-4">
              <button
                onClick={() =>
                  upsertCase.mutate({
                    buildingId,
                    name: caseName || undefined,
                    candidateIds: selectedCandidateIds,
                  })
                }
                disabled={upsertCase.isPending || selectedCandidateIds.length === 0}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {upsertCase.isPending ? "Saving..." : "Create Financing Case"}
              </button>
            </div>
          </>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Financing Cases" subtitle="Canonical financing cases and linked retrofit bundles for this building.">
          {!cases.data || cases.data.length === 0 ? (
            <EmptyState message="No financing cases exist for this building yet." />
          ) : (
            <div className="space-y-3">
              {cases.data.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedCaseId(item.id)}
                  className={`w-full rounded border px-3 py-3 text-left ${selectedCaseId === item.id ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.caseType}</div>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                    <div>Capex {formatMoney(item.estimatedCapex)}</div>
                    <div>Savings {formatMoney(item.estimatedAnnualSavingsUsd)}</div>
                    <div>Avoided penalty {formatMoney(item.estimatedAvoidedPenalty)}</div>
                    <div>Compliance uplift {formatNumber(item.estimatedComplianceImprovementPct)}%</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Financing Packet"
          subtitle="Generate, finalize, inspect, and export the deterministic financing packet for the selected case."
          actions={
            selectedCase ? (
              <>
                <button
                  onClick={() => generatePacket.mutate({ buildingId, financingCaseId: selectedCase.id })}
                  disabled={generatePacket.isPending}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {generatePacket.isPending ? "Generating..." : "Generate"}
                </button>
                <button
                  onClick={() => finalizePacket.mutate({ buildingId, financingCaseId: selectedCase.id })}
                  disabled={finalizePacket.isPending}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Export JSON
                </button>
              </>
            ) : null
          }
        >
          {!selectedCase ? (
            <EmptyState message="Select a financing case to inspect its packet." />
          ) : packet.error?.data?.code === "NOT_FOUND" || !packet.data ? (
            <EmptyState message="No financing packet exists for the selected case yet." />
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-gray-200 px-3 py-3">
                <div className="font-medium text-gray-900">
                  Packet v{packet.data.version} • {packet.data.status}
                </div>
                <div className="mt-1 text-xs text-gray-500">{packet.data.packetHash}</div>
              </div>
              <div className="rounded border border-gray-200 px-3 py-3 text-sm text-gray-700">
                <div className="font-medium text-gray-900">Warnings</div>
                {manifest.data && manifest.data.warnings.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
                    {manifest.data.warnings.map((warning, index) => {
                      const record =
                        warning && typeof warning === "object" && !Array.isArray(warning)
                          ? (warning as Record<string, unknown>)
                          : {};
                      return <li key={`${String(record.code ?? "warning")}-${index}`}>{String(record.message ?? record.code ?? "Warning")}</li>;
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">No current packet warnings.</p>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
