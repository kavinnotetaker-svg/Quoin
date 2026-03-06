"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { BuildingHeader } from "./building-header";
import { ScoreSection } from "./score-section";
import { EnergyTab } from "./energy-tab";
import { ComplianceTab } from "./compliance-tab";
import { CapitalTab } from "./capital-tab";
import { AlertsTab } from "./alerts-tab";
import { UploadModal } from "./upload-modal";

interface Tab {
  key: string;
  label: string;
  disabled?: boolean;
}

const TABS: Tab[] = [
  { key: "energy", label: "Energy" },
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

  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-gray-300" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        {error.data?.code === "NOT_FOUND"
          ? "Building not found."
          : "Something went wrong. Try refreshing."}
      </p>
    );
  }

  if (!data) return null;

  const snap = data.latestSnapshot;

  return (
    <div className="space-y-6">
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

      <hr className="border-gray-200" />

      <ScoreSection
        energyStarScore={snap?.energyStarScore ?? null}
        complianceStatus={snap?.complianceStatus ?? "PENDING_DATA"}
        estimatedPenalty={snap?.estimatedPenalty ?? null}
        bepsTargetScore={data.bepsTargetScore}
        grossSquareFeet={data.grossSquareFeet}
        snapshotDate={snap?.snapshotDate ?? null}
      />

      <hr className="border-gray-200" />

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 text-[13px]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => !tab.disabled && setActiveTab(tab.key)}
            className={`border-b-2 pb-2 ${tab.disabled
              ? "pointer-events-none border-transparent text-gray-300"
              : activeTab === tab.key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
          >
            {tab.label}
            {tab.disabled && (
              <span className="ml-1 text-[10px] text-gray-300">
                Coming soon
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "energy" && <EnergyTab buildingId={buildingId} />}
      {activeTab === "compliance" && (
        <ComplianceTab buildingId={buildingId} />
      )}
      {activeTab === "capital" && <CapitalTab buildingId={buildingId} />}
      {activeTab === "alerts" && <AlertsTab buildingId={buildingId} />}

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
