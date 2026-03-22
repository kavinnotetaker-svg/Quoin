"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BuildingHeader } from "./building-header";
import { ComplianceOverviewTab } from "./compliance-overview-tab";
import { BenchmarkingTab } from "./benchmarking-tab";
import { VerificationRequestsTab } from "./verification-requests-tab";
import { BepsTab } from "./beps-tab";
import { ArtifactWorkspacePanel } from "./artifact-workspace-panel";
import { BepsDeliveryPanel } from "./beps-delivery-panel";
import { OperationsTab } from "./operations-tab";
import { RetrofitTab } from "./retrofit-tab";
import { UploadModal } from "./upload-modal";
import { motion, AnimatePresence } from "framer-motion";
import { formatDate } from "@/components/internal/admin-primitives";
import { humanizeToken } from "@/components/internal/status-helpers";

interface Tab {
  key: string;
  label: string;
}

const TABS: Tab[] = [
  { key: "overview", label: "Overview" },
  { key: "benchmarking", label: "Benchmarking" },
  { key: "beps", label: "BEPS" },
  { key: "submission", label: "Submission" },
  { key: "planning", label: "Planning" },
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
  const bepsCycle =
    data?.readinessSummary.evaluations.beps?.complianceCycle === "CYCLE_2" ||
    data?.readinessSummary.evaluations.beps?.complianceCycle === "CYCLE_3"
      ? data.readinessSummary.evaluations.beps.complianceCycle
      : "CYCLE_1";
  const verificationChecklist = trpc.benchmarking.getVerificationChecklist.useQuery(
    { buildingId, reportingYear },
    {
      retry: false,
      enabled: !!data,
    },
  );
  const latestBepsRun = trpc.beps.latestRun.useQuery(
    { buildingId, cycle: bepsCycle },
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
    <div className="space-y-10">
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

      <div className="space-y-4">
        <div className="quoin-kicker">Workbench views</div>
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
                  className="absolute bottom-0 left-0 right-0 h-px bg-zinc-900"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
        </div>
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

            {activeTab === "beps" && (
              <BepsTab buildingId={buildingId} includeDeliveryWorkspace={false} />
            )}

            {activeTab === "submission" && (
              <div className="space-y-8">
                <div className="border-y border-zinc-200 bg-white">
                  <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="quoin-kicker">Submission workbench</div>
                      <div className="font-display text-3xl font-medium tracking-tight text-zinc-950">
                        Package readiness and governed delivery actions
                      </div>
                      <div className="max-w-2xl text-sm leading-7 text-zinc-600">
                        This is the culmination surface for governed artifacts,
                        delivery packets, exports, finalization, and submission
                        workflow transitions.
                      </div>
                    </div>
                    <div className="space-y-4 border-t border-zinc-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                      <SummaryItem
                        label="Next submission action"
                        value={data.readinessSummary.nextAction.title}
                      />
                      <div className="text-sm leading-7 text-zinc-600">
                        {data.readinessSummary.nextAction.reason}
                      </div>
                    </div>
                    <div className="space-y-4 border-t border-zinc-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                      <SummaryItem
                        label="Last packet generated"
                        value={formatDate(data.readinessSummary.lastPacketGeneratedAt)}
                      />
                      <SummaryItem
                        label="Last packet finalized"
                        value={formatDate(data.readinessSummary.lastPacketFinalizedAt)}
                      />
                      <SummaryItem
                        label="Latest submission transition"
                        value={formatDate(
                          data.governedSummary.timestamps.lastSubmissionTransitionAt,
                        )}
                      />
                    </div>
                  </div>
                </div>

                <ArtifactWorkspacePanel
                  buildingId={buildingId}
                  canManageSubmissionWorkflows={data.operatorAccess.canManage}
                />

                {latestBepsRun.error?.data?.code !== "NOT_FOUND" && latestBepsRun.data ? (
                  <BepsDeliveryPanel
                    buildingId={buildingId}
                    filingRecordId={latestBepsRun.data.id}
                    filingYear={latestBepsRun.data.filingYear}
                    cycle={bepsCycle}
                  />
                ) : null}
              </div>
            )}

            {activeTab === "planning" && (
              <div className="space-y-8">
                <div className="border-y border-zinc-200 bg-zinc-50/40">
                  <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="quoin-kicker">Planning support</div>
                      <div className="font-display text-3xl font-medium tracking-tight text-zinc-950">
                        Advisory operational and retrofit planning
                      </div>
                      <div className="max-w-2xl text-sm leading-7 text-zinc-600">
                        These sections are quieter decision-support. They help
                        prioritize action, but they do not override the governed
                        compliance record.
                      </div>
                    </div>
                    <div className="space-y-4 border-t border-zinc-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                      <SummaryItem
                        label="Active anomalies"
                        value={String(data.governedSummary.anomalySummary.activeCount)}
                      />
                      <SummaryItem
                        label="Estimated penalty-linked risk"
                        value={
                          data.governedSummary.anomalySummary.totalEstimatedPenaltyImpactUsd ==
                          null
                            ? "Not available"
                            : `$${Math.round(
                                data.governedSummary.anomalySummary.totalEstimatedPenaltyImpactUsd,
                              ).toLocaleString()}`
                        }
                      />
                    </div>
                    <div className="space-y-4 border-t border-zinc-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                      <SummaryItem
                        label="Prioritized retrofits"
                        value={String(data.governedSummary.retrofitSummary.activeCount)}
                      />
                      <SummaryItem
                        label="Top priority band"
                        value={
                          data.governedSummary.retrofitSummary.highestPriorityBand
                            ? humanizeToken(
                                data.governedSummary.retrofitSummary.highestPriorityBand,
                              )
                            : "Not ranked"
                        }
                      />
                    </div>
                  </div>
                </div>

                <OperationsTab buildingId={buildingId} />
                <RetrofitTab buildingId={buildingId} />
              </div>
            )}
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

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-zinc-900">{value}</div>
    </div>
  );
}
