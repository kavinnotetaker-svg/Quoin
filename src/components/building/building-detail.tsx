"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BuildingHeader } from "./building-header";
import { ScoreSection } from "./score-section";
import { WorkflowPanel } from "./workflow-panel";
import { EnergyTab } from "./energy-tab";
import { BenchmarkingTab } from "./benchmarking-tab";
import { VerificationRequestsTab } from "./verification-requests-tab";
import { BepsTab } from "./beps-tab";
import { ComplianceTab } from "./compliance-tab";
import { CapitalTab } from "./capital-tab";
import { AlertsTab } from "./alerts-tab";
import { OperationsTab } from "./operations-tab";
import { ProvenanceTab } from "./provenance-tab";
import { RetrofitTab } from "./retrofit-tab";
import { FinancingTab } from "./financing-tab";
import { UploadModal } from "./upload-modal";

interface Tab {
  key: string;
  label: string;
  disabled?: boolean;
}

const TABS: Tab[] = [
  { key: "energy", label: "Energy Data" },
  { key: "benchmarking", label: "Benchmarking" },
  { key: "verification", label: "Verification & Requests" },
  { key: "beps", label: "BEPS & Filing" },
  { key: "retrofit", label: "Retrofit Plan" },
  { key: "financing", label: "Financing" },
  { key: "operations", label: "Operations" },
  { key: "provenance", label: "Provenance" },
  { key: "compliance", label: "Compliance" },
  { key: "capital", label: "Capital" },
  { key: "alerts", label: "Alerts" },
];

export function BuildingDetail({ buildingId }: { buildingId: string }) {
  const [activeTab, setActiveTab] = useState("energy");
  const [showUpload, setShowUpload] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.building.get.useQuery({
    id: buildingId,
  });

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (TABS.some((tab) => tab.key === hash)) {
        setActiveTab(hash);
      }
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey);
    window.history.replaceState(null, "", `#${tabKey}`);
  };

  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-slate-300" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        {error.data?.code === "NOT_FOUND"
          ? "Building not found."
          : "Something went wrong. Try refreshing."}
      </p>
    );
  }

  if (!data) return null;

  const snap = data.latestSnapshot;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <BuildingHeader
        buildingId={buildingId}
        name={data.name}
        address={data.address}
        propertyType={data.propertyType}
        grossSquareFeet={data.grossSquareFeet}
        yearBuilt={data.yearBuilt}
        espmPropertyId={data.espmPropertyId?.toString() ?? null}
        onUpload={() => setShowUpload(true)}
      />

      <ScoreSection
        energyStarScore={snap?.energyStarScore ?? null}
        complianceStatus={snap?.complianceStatus ?? "PENDING_DATA"}
        estimatedPenalty={snap?.estimatedPenalty ?? null}
        bepsTargetScore={data.bepsTargetScore}
        grossSquareFeet={data.grossSquareFeet}
        snapshotDate={snap?.snapshotDate ?? null}
      />

      {data.workflowSummary ? (
        <WorkflowPanel
          nextAction={data.workflowSummary.nextAction}
          stages={data.workflowSummary.stages}
        />
      ) : null}

      <div className="flex flex-wrap gap-6 border-b border-slate-200 text-[13px] font-medium">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => !tab.disabled && handleTabChange(tab.key)}
            className={`border-b-2 pb-2.5 transition-colors duration-200 ${tab.disabled
              ? "pointer-events-none border-transparent text-slate-300"
              : activeTab === tab.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
              }`}
          >
            {tab.label}
            {tab.disabled && (
              <span className="ml-1.5 inline-flex items-center rounded-sm bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-500">
                SOON
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {activeTab === "energy" && <EnergyTab buildingId={buildingId} />}
        {activeTab === "benchmarking" && <BenchmarkingTab buildingId={buildingId} />}
        {activeTab === "verification" && (
          <VerificationRequestsTab buildingId={buildingId} />
        )}
        {activeTab === "beps" && <BepsTab buildingId={buildingId} />}
        {activeTab === "retrofit" && <RetrofitTab buildingId={buildingId} />}
        {activeTab === "financing" && <FinancingTab buildingId={buildingId} />}
        {activeTab === "operations" && <OperationsTab buildingId={buildingId} />}
        {activeTab === "provenance" && <ProvenanceTab buildingId={buildingId} />}
        {activeTab === "compliance" && (
          <ComplianceTab buildingId={buildingId} />
        )}
        {activeTab === "capital" && <CapitalTab buildingId={buildingId} />}
        {activeTab === "alerts" && <AlertsTab buildingId={buildingId} />}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          buildingId={buildingId}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            utils.building.get.invalidate({ id: buildingId });
            utils.building.energyReadings.invalidate({ buildingId });
            utils.building.complianceHistory.invalidate({ buildingId });
          }}
        />
      )}
    </div>
  );
}
