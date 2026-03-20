"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BuildingHeader } from "./building-header";
import { ComplianceOverviewTab } from "./compliance-overview-tab";
import { BenchmarkingTab } from "./benchmarking-tab";
import { VerificationRequestsTab } from "./verification-requests-tab";
import { BepsTab } from "./beps-tab";
import { RetrofitTab } from "./retrofit-tab";
import { UploadModal } from "./upload-modal";
import { motion, AnimatePresence } from "framer-motion";

interface Tab {
  key: string;
  label: string;
}

const TABS: Tab[] = [
  { key: "overview", label: "Overview" },
  { key: "benchmarking", label: "Benchmarking" },
  { key: "beps", label: "BEPS" },
  { key: "retrofit", label: "Retrofit" },
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
        <div className="loading-bar h-0.5 w-1/3 bg-zinc-300" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">
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

      <div className="flex flex-wrap gap-6 border-b border-zinc-200 text-[13px] font-medium relative">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`relative pb-2.5 transition-colors duration-200 ${
                isActive
                  ? "text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {tab.label}
              {isActive && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="pt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {activeTab === "overview" && (
              <ComplianceOverviewTab
                building={data}
                verificationChecklist={verificationChecklist.data}
              />
            )}

            {activeTab === "benchmarking" && (
              <div className="space-y-6">
                <BenchmarkingTab buildingId={buildingId} />
                <VerificationRequestsTab buildingId={buildingId} />
              </div>
            )}

            {activeTab === "beps" && <BepsTab buildingId={buildingId} />}

            {activeTab === "retrofit" && <RetrofitTab buildingId={buildingId} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {showUpload && (
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
      )}
    </div>
  );
}
