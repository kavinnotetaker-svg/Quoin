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
 { key: "overview", label: "COMPLIANCE TRUTH" },
 { key: "interpretation", label: "INTERPRETATION" },
 { key: "evidence", label: "EVIDENCE" },
 { key: "advisory", label: "ADVISORY" },
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

 <div className="grid grid-cols-[240px_1fr] lg:gap-24 gap-12 pt-8">
 <div className="space-y-1">
 {TABS.map((tab) => {
 const isActive = activeTab === tab.key;
 return (
 <button
 key={tab.key}
 onClick={() => handleTabChange(tab.key)}
 className={`w-full text-left px-4 py-2 text-[11px] font-mono tracking-[0.2em] uppercase transition-colors duration-200 ${
 isActive
 ? "bg-zinc-100 text-zinc-900 font-semibold border-l-2 border-zinc-900"
 : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 border-l-2 border-transparent"
 }`}
 >
 {tab.label}
 </button>
 );
 })}
 </div>
 <div className="min-w-0">
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

 {activeTab === "interpretation" && (
 <div className="space-y-12">
 <BenchmarkingTab buildingId={buildingId} />
 <VerificationRequestsTab buildingId={buildingId} />
 <BepsTab buildingId={buildingId} includeDeliveryWorkspace={false} />
 </div>
 )}

 {activeTab === "evidence" && (
 <div className="space-y-12">
 <div className="grid lg:grid-cols-[220px_1fr] gap-8 border-t border-zinc-200/80 pt-10 pb-4">
 <div>
 <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
 Submission Compilation
 </h2>
 </div>
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
 <div className="font-display text-3xl tracking-tight text-zinc-900">
 Governed Delivery Actions
 </div>
 <div className="flex gap-8">
 <SummaryItem
 label="Next action"
 value={data.readinessSummary.nextAction.title}
 />
 <SummaryItem
 label="Last packet"
 value={formatDate(data.readinessSummary.lastPacketGeneratedAt)}
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

 {activeTab === "advisory" && (
 <div className="space-y-10">
 <OperationsTab buildingId={buildingId} />
 <RetrofitTab buildingId={buildingId} />
 </div>
 )}
 </motion.div>
 </AnimatePresence>
 </div>
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
