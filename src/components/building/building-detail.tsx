"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BuildingHeader } from "./building-header";
import { ComplianceOverviewTab } from "./compliance-overview-tab";
import { BenchmarkingTab } from "./benchmarking-tab";
import { VerificationRequestsTab } from "./verification-requests-tab";
import { BepsTab } from "./beps-tab";
import { UploadModal } from "./upload-modal";

interface Tab {
  key: string;
  label: string;
}

const TABS: Tab[] = [
  { key: "overview", label: "Overview" },
  { key: "benchmarking", label: "Benchmarking" },
  { key: "beps", label: "BEPS" },
];

function defaultReportingYear() {
  return new Date().getUTCFullYear() - 1;
}

export function BuildingDetail({ buildingId }: { buildingId: string }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showUpload, setShowUpload] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.building.get.useQuery({
    id: buildingId,
  });

  const reportingYear =
    data?.readinessSummary.evaluations.benchmark?.reportingYear ??
    data?.readinessSummary.artifacts.benchmarkSubmission?.reportingYear ??
    defaultReportingYear();
  const verificationChecklist = trpc.benchmarking.getVerificationChecklist.useQuery(
    { buildingId, reportingYear },
    {
      retry: false,
      enabled: !!data,
    },
  );

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

  return (
    <div className="space-y-8">
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

      <div className="flex flex-wrap gap-6 border-b border-slate-200 text-[13px] font-medium">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`border-b-2 pb-2.5 transition-colors duration-200 ${
              activeTab === tab.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {activeTab === "overview" ? (
          <ComplianceOverviewTab
            building={data}
            verificationChecklist={verificationChecklist.data}
          />
        ) : null}

        {activeTab === "benchmarking" ? (
          <div className="space-y-6">
            <BenchmarkingTab buildingId={buildingId} />
            <VerificationRequestsTab buildingId={buildingId} />
          </div>
        ) : null}

        {activeTab === "beps" ? <BepsTab buildingId={buildingId} /> : null}
      </div>

      {showUpload ? (
        <UploadModal
          buildingId={buildingId}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            utils.building.get.invalidate({ id: buildingId });
            utils.building.list.invalidate();
            utils.building.portfolioWorklist.invalidate();
            utils.building.getArtifactWorkspace.invalidate({ buildingId });
            utils.building.complianceHistory.invalidate({ buildingId });
            utils.benchmarking.getVerificationChecklist.invalidate({
              buildingId,
              reportingYear,
            });
          }}
        />
      ) : null}
    </div>
  );
}
