"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import {
 EmptyState,
 ErrorState,
 LoadingState,
 Panel,
 downloadTextFile,
 formatDate,
 formatMoney,
} from "@/components/internal/admin-primitives";
import {
 formatCycleLabel,
 getGovernedVersionStatusDisplay,
 getPacketStatusDisplay,
 getSubmissionWorkflowStateDisplay,
 humanizeToken,
} from "@/components/internal/status-helpers";

function currentReportingYear() {
 return new Date().getUTCFullYear() - 1;
}

type ReportMode = "submission-packages" | "publication-controls";

export function ReportsPage() {
 const utils = trpc.useUtils();
 const [buildingId, setBuildingId] = useState("");
 const [reportingYear, setReportingYear] = useState(currentReportingYear());
 const [mode, setMode] = useState<ReportMode>("submission-packages");
 const buildings = trpc.building.list.useQuery({ pageSize: 100 });
 const publicationOverview = trpc.report.publicationOverview.useQuery();
 const reportArtifacts = trpc.report.getComplianceReportArtifacts.useQuery(
 { buildingId },
 { enabled: !!buildingId },
 );
 const exemptionReportArtifacts = trpc.report.getExemptionReportArtifacts.useQuery(
 { buildingId },
 { enabled: !!buildingId },
 );
 const promoteRuleCandidate = trpc.report.promoteRuleCandidate.useMutation({
 onSuccess: async () => {
 await utils.report.publicationOverview.invalidate();
 },
 });
 const promoteFactorCandidate = trpc.report.promoteFactorCandidate.useMutation({
 onSuccess: async () => {
 await utils.report.publicationOverview.invalidate();
 },
 });
 const validateRuleCandidate = trpc.report.validateRuleCandidate.useMutation({
 onSuccess: async () => {
 await utils.report.publicationOverview.invalidate();
 },
 });
 const validateFactorCandidate = trpc.report.validateFactorCandidate.useMutation({
 onSuccess: async () => {
 await utils.report.publicationOverview.invalidate();
 },
 });
 const publishGovernedCandidate = trpc.report.publishGovernedCandidate.useMutation({
 onSuccess: async () => {
 await utils.report.publicationOverview.invalidate();
 },
 });
 const generateComplianceReportArtifact =
 trpc.report.generateComplianceReportArtifact.useMutation({
 onSuccess: async () => {
 await Promise.all([
 utils.report.getComplianceReport.invalidate({ buildingId }),
 utils.report.getComplianceReportArtifacts.invalidate({ buildingId }),
 ]);
 },
 });
 const exportComplianceReportArtifact =
 trpc.report.exportComplianceReportArtifact.useMutation({
 onSuccess: async () => {
 await utils.report.getComplianceReportArtifacts.invalidate({ buildingId });
 },
 });
 const generateExemptionReportArtifact =
 trpc.report.generateExemptionReportArtifact.useMutation({
 onSuccess: async () => {
 await Promise.all([
 utils.report.getExemptionReport.invalidate({ buildingId }),
 utils.report.getExemptionReportArtifacts.invalidate({ buildingId }),
 ]);
 },
 });
 const exportExemptionReportArtifact =
 trpc.report.exportExemptionReportArtifact.useMutation({
 onSuccess: async () => {
 await utils.report.getExemptionReportArtifacts.invalidate({ buildingId });
 },
 });
 const complianceReport = trpc.report.getComplianceReport.useQuery(
 { buildingId },
 { enabled: !!buildingId },
 );
 const exemptionReport = trpc.report.getExemptionReport.useQuery(
 { buildingId },
 { enabled: !!buildingId },
 );
 const submissions = trpc.benchmarking.listSubmissions.useQuery(
 { buildingId: buildingId || undefined, limit: 10 },
 { enabled: !!buildingId },
 );

 useEffect(() => {
 if (!buildingId && buildings.data?.buildings[0]?.id) {
 setBuildingId(buildings.data.buildings[0].id);
 }
 }, [buildingId, buildings.data]);

 if (buildings.isLoading) {
 return <LoadingState />;
 }

 if (buildings.error) {
 return (
 <ErrorState
 message="Reports are unavailable right now."
 detail={buildings.error.message}
 />
 );
 }

 const selectedBuilding = buildings.data?.buildings.find((building) => building.id === buildingId);
 const canManagePublication =
 publicationOverview.data?.operatorAccess.canManage ?? false;
 const primaryButtonClass = "btn-primary inline-flex items-center justify-center";
 const quietButtonClass =
 "rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60";
 const governanceButtonClass =
 "rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 disabled:opacity-60";

 return (
 <div className="space-y-6">
 <PageHeader
 title="Submission compilation"
 subtitle="Work in two explicit modes: building-level submission packages and governed publication controls."
 />

 <div className="border-b border-zinc-200 pb-4">
 <div className="flex flex-wrap gap-2">
 <ModeButton
 active={mode === "submission-packages"}
 label="Submission Packages"
 description="Building-level evidence, readiness, and persisted package artifacts."
 onClick={() => setMode("submission-packages")}
 />
 <ModeButton
 active={mode === "publication-controls"}
 label="Publication Controls"
 description="Governed rule and factor publication, validation, and activation."
 onClick={() => setMode("publication-controls")}
 />
 </div>
 </div>

 {mode === "submission-packages" ? (
 <Panel
 title="Submission package scope"
 subtitle="Choose a building to inspect governed compliance and exemption report artifacts."
 >
 <div className="grid gap-4 md:grid-cols-2">
 <label className="text-sm text-zinc-700">
 <span className="mb-1 block text-xs text-zinc-500">Building</span>
 <select
 value={buildingId}
 onChange={(event) => setBuildingId(event.target.value)}
 className="w-full rounded border border-zinc-300 px-3 py-2"
 >
 <option value="">Select a building</option>
 {buildings.data?.buildings.map((building) => (
 <option key={building.id} value={building.id}>
 {building.name}
 </option>
 ))}
 </select>
 </label>

 <label className="text-sm text-zinc-700">
 <span className="mb-1 block text-xs text-zinc-500">Reporting year</span>
 <input
 type="number"
 value={reportingYear}
 onChange={(event) => setReportingYear(Number(event.target.value))}
 className="w-full rounded border border-zinc-300 px-3 py-2"
 />
 </label>
 </div>
 </Panel>
 ) : null}

 {mode === "publication-controls" ? (
 <Panel
 title="Publication controls"
 subtitle="Inspect live vs candidate governed versions and run deterministic publication checks before activation."
 >
 {publicationOverview.isLoading ? <LoadingState /> : null}
 {publicationOverview.error ? (
 <ErrorState
 message="Governed publication state is unavailable."
 detail={publicationOverview.error.message}
 />
 ) : null}
 {publicationOverview.data ? (
 <div className="space-y-3">
 <div className="border-b border-zinc-200 pb-3 text-sm text-zinc-600">
 Publication administration remains separate from the submission package surfaces below. It governs what rules and factors become active, not what evidence is packaged for a building.
 </div>
 {publicationOverview.data.targets.map((target) => (
 <div
 key={`${target.publicationKind}-${target.targetKey}`}
 className="py-6 border-t border-zinc-200 first:border-0 first:pt-0 text-sm text-zinc-700"
 >
 <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
 <div className="space-y-1">
 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 {humanizeToken(target.scopeKey)}
 </div>
 <div className="font-medium text-zinc-900">{target.label}</div>
 <div className="text-xs text-zinc-500">{target.targetKey}</div>
 <div className="mt-2 grid gap-2 md:grid-cols-3">
 <div>
 <div className="text-xs uppercase tracking-wider text-zinc-500">
 Active
 </div>
 <div className="mt-1 font-medium text-zinc-900">
 {target.activeVersion
 ? `${target.activeVersion.version} (${getGovernedVersionStatusDisplay(target.activeVersion.status).label})`
 : "No active version is published"}
 </div>
 </div>
 <div>
 <div className="text-xs uppercase tracking-wider text-zinc-500">
 Candidate
 </div>
 <div className="mt-1 font-medium text-zinc-900">
 {target.candidateVersion
 ? `${target.candidateVersion.version} (${getGovernedVersionStatusDisplay(target.candidateVersion.status).label})`
 : "No candidate is staged"}
 </div>
 </div>
 <div>
 <div className="text-xs uppercase tracking-wider text-zinc-500">
 Latest draft
 </div>
 <div className="mt-1 font-medium text-zinc-900">
 {target.latestDraftVersion
 ? `${target.latestDraftVersion.version} (${getGovernedVersionStatusDisplay(target.latestDraftVersion.status).label})`
 : "No draft is queued"}
 </div>
 </div>
 </div>
 {target.latestValidation ? (
 <div className="mt-3 border-l-2 border-zinc-200 pl-3 py-1 text-xs text-zinc-600">
 <div className="font-medium text-zinc-900">
 Latest validation: {humanizeToken(target.latestValidation.status)}
 </div>
 <div className="mt-1">
 {target.latestValidation.passedCases} passed /{" "}
 {target.latestValidation.failedCases} failed /{" "}
 {target.latestValidation.totalCases} total
 </div>
 <div className="mt-1">
 Validated {formatDate(target.latestValidation.validatedAt)}
 {" | "}Published {formatDate(target.latestValidation.publishedAt)}
 </div>
 </div>
 ) : null}
 </div>
 <div className="space-y-2">
 <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
 Governance actions
 </div>
 <div className="flex flex-wrap gap-2">
 {canManagePublication &&
 target.publicationKind === "RULE_VERSION" &&
 target.latestDraftVersion ? (
 <button
 onClick={() =>
 promoteRuleCandidate.mutate({
 ruleVersionId: target.latestDraftVersion!.id,
 })
 }
 disabled={promoteRuleCandidate.isPending}
 className={governanceButtonClass}
 >
 Promote draft
 </button>
 ) : null}
 {canManagePublication &&
 target.publicationKind === "FACTOR_SET_VERSION" &&
 target.latestDraftVersion ? (
 <button
 onClick={() =>
 promoteFactorCandidate.mutate({
 factorSetVersionId: target.latestDraftVersion!.id,
 })
 }
 disabled={promoteFactorCandidate.isPending}
 className={governanceButtonClass}
 >
 Promote draft
 </button>
 ) : null}
 {canManagePublication &&
 target.publicationKind === "RULE_VERSION" &&
 target.candidateVersion ? (
 <button
 onClick={() =>
 validateRuleCandidate.mutate({
 ruleVersionId: target.candidateVersion!.id,
 })
 }
 disabled={validateRuleCandidate.isPending}
 className={governanceButtonClass}
 >
 Run regressions
 </button>
 ) : null}
 {canManagePublication &&
 target.publicationKind === "FACTOR_SET_VERSION" &&
 target.candidateVersion ? (
 <button
 onClick={() =>
 validateFactorCandidate.mutate({
 factorSetVersionId: target.candidateVersion!.id,
 })
 }
 disabled={validateFactorCandidate.isPending}
 className={governanceButtonClass}
 >
 Run regressions
 </button>
 ) : null}
 {canManagePublication && target.latestValidation?.canPublish ? (
 <button
 onClick={() =>
 publishGovernedCandidate.mutate({
 runId: target.latestValidation!.id,
 })
 }
 disabled={publishGovernedCandidate.isPending}
 className={governanceButtonClass}
 >
 Publish active version
 </button>
 ) : null}
 </div>
 </div>
 </div>
 </div>
 ))}
 {!canManagePublication ? (
 <div className="border-l-2 border-zinc-200 pl-4 py-2 text-sm text-zinc-600">
 Governed publication controls require manager or admin access. Current publication and validation state remains visible here.
 </div>
 ) : null}
 </div>
 ) : null}
 </Panel>
 ) : null}

 {mode === "submission-packages" ? (buildings.data?.buildings.length === 0 ? (
 <EmptyState
 message="No buildings are available for governed report packaging yet. Add a building in Buildings to start the submission workspace."
 action={
 <Link
 href="/buildings"
 className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
 >
 Go to Buildings
 </Link>
 }
 />
 ) : !buildingId ? (
 <EmptyState message="Select a building to open its submission package workspace." />
 ) : (
 <>
 <div className="border-t border-zinc-200 pt-6">
 <div className="quoin-kicker">Submission package workbench</div>
 <div className="mt-2 font-display text-2xl font-medium tracking-tight text-zinc-950">
 Building-specific governed report artifacts
 </div>
 <div className="mt-2 max-w-3xl text-sm leading-7 text-zinc-600">
 Generate, review, and export the persisted package record for the selected building. Publication administration remains separate above.
 </div>
 </div>

 {complianceReport.isLoading || exemptionReport.isLoading ? <LoadingState /> : null}
 {complianceReport.error ? (
 <ErrorState
 message="Compliance report failed to load."
 detail={complianceReport.error.message}
 />
 ) : null}
 {exemptionReport.error ? (
 <ErrorState
 message="Exemption report failed to load."
 detail={exemptionReport.error.message}
 />
 ) : null}
 {selectedBuilding &&
 !complianceReport.isLoading &&
 !complianceReport.error &&
 !complianceReport.data ? (
 <EmptyState message="The governed compliance package is not ready for this building yet. Generate the current package once the building has an evaluated compliance record." />
 ) : null}
 {selectedBuilding &&
 !exemptionReport.isLoading &&
 !exemptionReport.error &&
 !exemptionReport.data ? (
 <EmptyState message="The governed exemption package is not available for this building yet. It will appear once the exemption screen has current governed context." />
 ) : null}

 {selectedBuilding && complianceReport.data ? (
 <Panel
 title="Compliance Report"
 subtitle="Governed compliance, penalty, evidence, and operational risk packaged for operator and customer-facing review."
 actions={
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() =>
 generateComplianceReportArtifact.mutate({
 buildingId,
 })
 }
 disabled={generateComplianceReportArtifact.isPending}
 className={primaryButtonClass}
 >
 {reportArtifacts.data?.latestArtifact
 ? "Generate new package"
 : "Generate package"}
 </button>
 {reportArtifacts.data?.latestArtifact ? (
 <button
 onClick={async () => {
 const exported =
 await exportComplianceReportArtifact.mutateAsync({
 buildingId,
 artifactId: reportArtifacts.data.latestArtifact!.id,
 format: "JSON",
 });

 downloadTextFile({
 fileName: exported.fileName,
 content: exported.content,
 contentType: exported.contentType,
 });
 }}
 disabled={exportComplianceReportArtifact.isPending}
 className={quietButtonClass}
 >
 Download JSON
 </button>
 ) : null}
 </div>
 }
 >
 {(() => {
 const report = complianceReport.data;
 const sections = report.sections;
 const evidencePackage = report.evidencePackage;
 const artifactWorkspace = reportArtifacts.data;
 const latestArtifact = artifactWorkspace?.latestArtifact ?? null;

 return (
 <>
 <div className="border-y border-zinc-200 bg-zinc-50 px-5 py-5 text-sm text-zinc-700">
 <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
 <div className="space-y-2">
 <div className="quoin-kicker">Governed report summary</div>
 <div className="font-display text-2xl font-medium tracking-tight text-zinc-950">
 {sections.compliance.reasonSummary}
 </div>
 <div className="text-sm leading-7 text-zinc-600">
 Next step: {sections.compliance.nextAction.title}.{" "}
 {sections.compliance.nextAction.reason}
 </div>
 </div>
 <div className="space-y-3 border-t border-zinc-200 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
 <SummaryLine
 label="Package readiness"
 value={humanizeToken(sections.compliance.readinessState)}
 />
 <SummaryLine
 label="Compliance state"
 value={humanizeToken(sections.compliance.primaryStatus)}
 />
 <SummaryLine
 label="Current penalty estimate"
 value={formatMoney(sections.penalty.currentEstimatedPenalty)}
 />
 </div>
 <div className="space-y-3 border-t border-zinc-200 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
 <SummaryLine
 label="Latest readiness evaluation"
 value={formatDate(
 evidencePackage.traceability.lastReadinessEvaluatedAt,
 )}
 />
 <SummaryLine
 label="Latest compliance evaluation"
 value={formatDate(
 evidencePackage.traceability.lastComplianceEvaluatedAt,
 )}
 />
 <SummaryLine
 label="Persisted artifact"
 value={
 latestArtifact
 ? `v${latestArtifact.version} generated ${formatDate(
 latestArtifact.generatedAt,
 )}`
 : "Package not generated"
 }
 />
 </div>
 </div>
 </div>

 <div className="grid gap-3 border-b border-zinc-200 pb-4 text-sm text-zinc-600 sm:grid-cols-2 xl:grid-cols-4">
 <SummaryLine
 label="Readiness"
 value={humanizeToken(sections.compliance.readinessState)}
 />
 <SummaryLine
 label="Compliance status"
 value={humanizeToken(sections.compliance.primaryStatus)}
 />
 <SummaryLine
 label="Penalty estimate"
 value={formatMoney(sections.penalty.currentEstimatedPenalty)}
 />
 <SummaryLine
 label="Top retrofit"
 value={sections.retrofits.topOpportunity?.name ?? "No prioritized retrofit"}
 />
 </div>

 <div className="mt-4 grid gap-6 xl:grid-cols-2">
 <div className="py-6 border-t border-zinc-200 first:border-0 first:pt-0 text-sm text-zinc-700">
 <div className="quoin-kicker">
 Compliance position
 </div>
 <div className="mt-3 font-medium text-zinc-900">
 {sections.compliance.reasonSummary}
 </div>
 <div className="mt-2 text-zinc-600">
 Next step: {sections.compliance.nextAction.title}
 </div>
 <div className="mt-1 text-xs text-zinc-500">
 {sections.compliance.nextAction.reason}
 </div>
 <div className="mt-3 grid gap-2 md:grid-cols-2">
 <div className="border-l-2 border-zinc-200 pl-3 py-1">
 <div className="text-xs uppercase tracking-wider text-zinc-500">
 Benchmarking
 </div>
 <div className="mt-1 font-medium text-zinc-900">
 {sections.compliance.benchmarkEvaluation?.reasonSummary ?? "No governed evaluation"}
 </div>
 <div className="mt-1 text-xs text-zinc-500">
 Rule {sections.compliance.benchmarkEvaluation?.ruleVersion ?? "-"}
 </div>
 </div>
 <div className="border-l-2 border-zinc-200 pl-3 py-1">
 <div className="text-xs uppercase tracking-wider text-zinc-500">
 BEPS
 </div>
 <div className="mt-1 font-medium text-zinc-900">
 {sections.compliance.bepsEvaluation?.reasonSummary ?? "No governed evaluation"}
 </div>
 <div className="mt-1 text-xs text-zinc-500">
 Rule {sections.compliance.bepsEvaluation?.ruleVersion ?? "-"}
 </div>
 </div>
 </div>
 </div>
 <div className="py-6 border-t border-zinc-200 first:border-0 first:pt-0 text-sm text-zinc-700">
 <div className="quoin-kicker">
 Penalty exposure
 </div>
 <div className="mt-3 font-medium text-zinc-900">
 {sections.penalty.basisLabel}
 </div>
 <div className="mt-1 text-zinc-600">
 {sections.penalty.basisExplanation}
 </div>
 <div className="mt-2 text-xs text-zinc-500">
 Status {humanizeToken(sections.penalty.status)}
 {" | "}Calculated {formatDate(sections.penalty.calculatedAt)}
 </div>
 <div className="mt-3 space-y-2">
 {sections.penalty.scenarios.length > 0 ? (
 sections.penalty.scenarios.map((scenario) => (
 <div key={scenario.code} className="border-l-2 border-zinc-200 pl-3 py-1">
 <div className="font-medium text-zinc-900">{scenario.label}</div>
 <div className="mt-1 text-xs text-zinc-500">
 Estimated penalty {formatMoney(scenario.estimatedPenalty)}
 {" | "}Delta {formatMoney(scenario.deltaFromCurrent)}
 </div>
 </div>
 ))
 ) : (
 <div className="border-l-2 border-zinc-200 pl-3 py-1 text-zinc-500">
 No governed penalty scenarios are linked to this building yet. The package currently reflects only the base governed penalty context.
 </div>
 )}
 </div>
 </div>
 <div className="py-6 border-t border-zinc-200 first:border-0 first:pt-0 text-sm text-zinc-700">
 <div className="quoin-kicker">
 Source integrity
 </div>
 <div className="mt-3 font-medium text-zinc-900">
 {humanizeToken(sections.sourceData.reconciliationStatus ?? "UNKNOWN")}
 {" | "}Canonical source {sections.sourceData.canonicalSource ?? "Unresolved"}
 </div>
 <div className="mt-1 text-zinc-600">
 Conflicts {sections.sourceData.conflictCount}
 {" | "}Incomplete {sections.sourceData.incompleteCount}
 {" | "}Last reconciled {formatDate(sections.sourceData.lastReconciledAt)}
 </div>
 <div className="mt-2 text-xs text-zinc-500">
 Portfolio Manager {humanizeToken(sections.sourceData.portfolioManagerState)}
 {" | "}Green Button {humanizeToken(sections.sourceData.greenButtonState)}
 </div>
 <div className="mt-2 border-l-2 border-zinc-200 pl-3 py-1 text-xs text-zinc-600">
 {sections.sourceData.runtimeNextActionTitle
 ? `${sections.sourceData.runtimeNextActionTitle}: ${sections.sourceData.runtimeNextActionReason}`
 : "No runtime recovery action is currently flagged."}
 </div>
 </div>
 <div className="py-6 border-t border-zinc-200 first:border-0 first:pt-0 text-sm text-zinc-700">
 <div className="quoin-kicker">
 Operational risk and retrofit priorities
 </div>
 <div className="mt-3 font-medium text-zinc-900">
 Active anomalies {sections.anomalyRisk.activeCount}
 {" | "}Retrofit opportunities {sections.retrofits.activeCount}
 </div>
 <div className="mt-1 text-zinc-600">
 Estimated anomaly energy impact {sections.anomalyRisk.totalEstimatedEnergyImpactKbtu?.toLocaleString() ?? "-"} kBtu
 {" | "}Penalty-linked risk {formatMoney(sections.anomalyRisk.totalEstimatedPenaltyImpactUsd)}
 </div>
 <div className="mt-3 border-l-2 border-zinc-200 pl-3 py-1">
 <div className="font-medium text-zinc-900">
 {sections.retrofits.topOpportunity?.name ?? "No prioritized retrofit opportunity"}
 </div>
 <div className="mt-1 text-xs text-zinc-500">
 {sections.retrofits.topOpportunity
 ? `${sections.retrofits.topOpportunity.priorityBand} priority | Avoided penalty ${formatMoney(
 sections.retrofits.topOpportunity.estimatedAvoidedPenalty,
 )}`
 : "Retrofit prioritization is available once active governed opportunities are recorded."}
 </div>
 {sections.retrofits.topOpportunity ? (
 <div className="mt-1 text-xs text-zinc-600">
 {sections.retrofits.topOpportunity.basisSummary}
 </div>
 ) : null}
 </div>
 </div>
 </div>

 <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
 <div className="space-y-3">
 <div className="quoin-kicker">Evidence package</div>
 <div className="text-sm leading-7 text-zinc-600">
 Included governed artifacts, workflow lineage, source record references, and compliance-run traceability for this report package.
 </div>
 <div className="space-y-2 text-sm text-zinc-700">
 {[
 {
 label: "Benchmark artifact",
 artifact: evidencePackage.artifacts.benchmark,
 },
 {
 label: "BEPS artifact",
 artifact: evidencePackage.artifacts.beps,
 },
 ].map(({ label, artifact }) => (
 <div
 key={label}
 className="py-2 border-t border-zinc-100 first:border-0 first:pt-0"
 >
 <div className="font-medium text-zinc-900">{label}</div>
 <div className="text-xs text-zinc-500">
 Status {getPacketStatusDisplay(artifact.artifactStatus).label}
 {" | "}Workflow {getSubmissionWorkflowStateDisplay(artifact.workflow?.state ?? "NOT_STARTED").label}
 </div>
 <div className="mt-1 text-xs text-zinc-600">
 Latest artifact v{artifact.latestArtifact?.version ?? "-"}
 {" | "}Generated {formatDate(artifact.latestArtifact?.generatedAt ?? null)}
 {" | "}Finalized {formatDate(artifact.latestArtifact?.finalizedAt ?? null)}
 </div>
 <div className="mt-1 text-xs text-zinc-600">
 Latest export {artifact.latestExport?.format ?? "No export yet"}
 {" | "}Exported {formatDate(artifact.latestExport?.exportedAt ?? null)}
 </div>
 <div className="mt-1 text-xs text-zinc-500">
 Source record {artifact.sourceRecordId ?? "No source record linked"}
 {" | "}Compliance run {artifact.sourceContext.complianceRunId ?? "No compliance run linked"}
 </div>
 </div>
 ))}
 </div>
 </div>
 <div className="space-y-3">
 <div className="quoin-kicker">Versioning and appendices</div>
 <div className="text-sm leading-7 text-zinc-600">
 Persisted governed reports remain the authority record. Supporting readings and pipeline traces appear below as appendices only.
 </div>
 <div className="space-y-2 text-sm text-zinc-700">
 <div className="py-2 border-t border-zinc-100 first:border-0 first:pt-0">
 <div className="font-medium text-zinc-900">Persisted governed reports</div>
 <div className="mt-2 space-y-2">
 {artifactWorkspace?.history.length ? (
 artifactWorkspace.history.map((artifact) => (
 <div
 key={artifact.id}
 className="border-l-2 border-zinc-200 pl-3 py-1"
 >
 <div className="font-medium text-zinc-900">
 Report v{artifact.version}
 </div>
 <div className="text-xs text-zinc-500">
 Generated {formatDate(artifact.generatedAt)}
 {" | "}Last export {formatDate(artifact.latestExportedAt)}
 </div>
 <div className="mt-1 text-xs text-zinc-600">
 Source summary hash {artifact.sourceSummaryHash}
 </div>
 </div>
 ))
 ) : (
 <EmptyState message="No persisted compliance package has been generated for this building yet. Generate the package to start report history." />
 )}
 </div>
 </div>
 <div className="py-2 border-t border-zinc-100 first:border-0 first:pt-0">
 <div className="font-medium text-zinc-900">Evidence appendices</div>
 <div className="mt-2 space-y-2">
 {report.energyHistory.slice(0, 6).map((reading) => (
 <div
 key={`${reading.periodStart}-${reading.periodEnd}-${reading.meterType}-${reading.source}`}
 className="border-l-2 border-zinc-200 pl-3 py-1"
 >
 <div className="font-medium">{reading.meterType}</div>
 <div className="text-xs text-zinc-500">
 {new Date(reading.periodStart).toLocaleDateString()} -{" "}
 {new Date(reading.periodEnd).toLocaleDateString()}
 </div>
 <div className="mt-1 text-xs text-zinc-600">
 {reading.consumptionKbtu.toLocaleString()} kBtu | {reading.source}
 </div>
 </div>
 ))}
 {report.pipelineRuns.length === 0 ? (
 <EmptyState message="No supporting pipeline traces were captured in this report snapshot. The governed report artifact remains the record." />
 ) : report.pipelineRuns.map((run) => (
 <div key={run.id} className="border-l-2 border-zinc-200 pl-3 py-1">
 <div className="font-medium">{run.pipelineType}</div>
 <div className="text-xs text-zinc-500">{run.status}</div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 </div>
 </>
 );
 })()}
 </Panel>
 ) : null}

 {selectedBuilding && exemptionReport.data ? (
 <Panel
 title="Exemption Report"
 subtitle="Persisted exemption filing packages generated from the governed screener and current compliance context."
 actions={
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() =>
 generateExemptionReportArtifact.mutate({
 buildingId,
 })
 }
 disabled={generateExemptionReportArtifact.isPending}
 className={primaryButtonClass}
 >
 {exemptionReportArtifacts.data?.latestArtifact
 ? "Generate new package"
 : "Generate package"}
 </button>
 {exemptionReportArtifacts.data?.latestArtifact ? (
 <button
 onClick={async () => {
 const exported =
 await exportExemptionReportArtifact.mutateAsync({
 buildingId,
 artifactId: exemptionReportArtifacts.data.latestArtifact!.id,
 format: "JSON",
 });

 downloadTextFile({
 fileName: exported.fileName,
 content: exported.content,
 contentType: exported.contentType,
 });
 }}
 disabled={exportExemptionReportArtifact.isPending}
 className={quietButtonClass}
 >
 Download JSON
 </button>
 ) : null}
 </div>
 }
 >
 <div className="border-y border-zinc-200 bg-zinc-50 px-5 py-5 text-sm text-zinc-700">
 <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
 <div className="space-y-2">
 <div className="quoin-kicker">Governed exemption summary</div>
 <div className="font-display text-2xl font-medium tracking-tight text-zinc-950">
 {exemptionReport.data.exemptionScreening.eligible
 ? "Exemption path available"
 : "Exemption path not established"}
 </div>
 <div className="text-sm leading-7 text-zinc-600">
 Compliance{" "}
 {humanizeToken(exemptionReport.data.complianceStatus)}
 {" | "}Qualified exemptions{" "}
 {exemptionReport.data.exemptionScreening.qualifiedExemptions.length}
 </div>
 </div>
 <div className="space-y-3 border-t border-zinc-200 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
 <SummaryLine
 label="Eligible"
 value={exemptionReport.data.exemptionScreening.eligible ? "Yes" : "No"}
 />
 <SummaryLine
 label="Penalty savings if exempt"
 value={formatMoney(
 exemptionReport.data.penaltyContext.penaltySavingsIfExempt,
 )}
 />
 <SummaryLine
 label="Current penalty estimate"
 value={formatMoney(
 exemptionReport.data.penaltyContext.currentEstimatedPenalty,
 )}
 />
 </div>
 <div className="space-y-3 border-t border-zinc-200 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
 <SummaryLine
 label="Persisted artifact"
 value={
 exemptionReportArtifacts.data?.latestArtifact
 ? `v${exemptionReportArtifacts.data.latestArtifact.version} generated ${formatDate(
 exemptionReportArtifacts.data.latestArtifact.generatedAt,
 )}`
 : "Package not generated"
 }
 />
 <SummaryLine
 label="Last exported"
 value={formatDate(
 exemptionReportArtifacts.data?.latestArtifact?.latestExportedAt ??
 null,
 )}
 />
 <SummaryLine
 label="DOEE deadline"
 value={exemptionReport.data.doeeSubmissionGuidance.deadline}
 />
 </div>
 </div>
 </div>
 <div className="grid gap-3 border-b border-zinc-200 pb-4 text-sm text-zinc-600 sm:grid-cols-2 xl:grid-cols-4">
 <SummaryLine
 label="Eligible"
 value={exemptionReport.data.exemptionScreening.eligible ? "Yes" : "No"}
 />
 <SummaryLine
 label="Qualified exemptions"
 value={String(
 exemptionReport.data.exemptionScreening.qualifiedExemptions.length || 0,
 )}
 />
 <SummaryLine
 label="Penalty savings if exempt"
 value={formatMoney(exemptionReport.data.penaltyContext.penaltySavingsIfExempt)}
 />
 <SummaryLine
 label="Current penalty estimate"
 value={formatMoney(exemptionReport.data.penaltyContext.currentEstimatedPenalty)}
 />
 </div>
 <div className="mt-4 border-l-2 border-zinc-200 pl-4 py-2 text-sm text-zinc-700">
 <div className="font-medium text-zinc-900">
 {exemptionReport.data.penaltyContext.currentEstimateBasis}
 </div>
 <div className="mt-1 text-zinc-600">
 Current estimate status:{" "}
 {humanizeToken(exemptionReport.data.penaltyContext.currentEstimateStatus)}
 .
 </div>
 <div className="mt-1 text-zinc-500">
 Legacy statutory ceiling:{" "}
 {formatMoney(exemptionReport.data.penaltyContext.legacyStatutoryMaximum)}
 </div>
 <div className="mt-1 text-zinc-500">
 DOEE deadline: {exemptionReport.data.doeeSubmissionGuidance.deadline}
 </div>
 </div>
 <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
 <div className="space-y-3">
 <div className="quoin-kicker">Required items</div>
 <div className="text-sm leading-7 text-zinc-600">
 Missing items and filing notes stay explicit here so exemption packaging remains reviewable rather than assumed.
 </div>
 <div className="space-y-2">
 {exemptionReport.data.filingChecklist.map((item) => (
 <div
 key={item.item}
 className="py-2 border-t border-zinc-100 first:border-0 first:pt-0 text-sm"
 >
 <div className="font-medium text-zinc-900">{item.item}</div>
 <div className="text-xs text-zinc-500">{humanizeToken(item.status)}</div>
 <div className="mt-1 text-xs text-zinc-600">{item.notes}</div>
 </div>
 ))}
 </div>
 </div>
 <div className="space-y-3">
 <div className="quoin-kicker">Versioning and record support</div>
 <div className="text-sm leading-7 text-zinc-600">
 Persisted exemption reports provide the governed history. Benchmark submission references remain supporting record context.
 </div>
 <div className="space-y-2">
 <div className="py-2 border-t border-zinc-100 first:border-0 first:pt-0">
 <div className="font-medium text-zinc-900">
 Persisted exemption reports
 </div>
 <div className="mt-2 space-y-2">
 {exemptionReportArtifacts.data?.history.length ? (
 exemptionReportArtifacts.data.history.map((artifact) => (
 <div
 key={artifact.id}
 className="border-l-2 border-zinc-200 pl-3 py-1"
 >
 <div className="font-medium text-zinc-900">
 Report v{artifact.version}
 </div>
 <div className="text-xs text-zinc-500">
 Generated {formatDate(artifact.generatedAt)}
 {" | "}Last export {formatDate(artifact.latestExportedAt)}
 </div>
 <div className="mt-1 text-xs text-zinc-600">
 Source summary hash {artifact.sourceSummaryHash}
 </div>
 </div>
 ))
 ) : (
 <EmptyState message="No persisted exemption package has been generated for this building yet. Generate the package to start exemption report history." />
 )}
 </div>
 </div>
 <div className="py-2 border-t border-zinc-100 first:border-0 first:pt-0">
 <div className="font-medium text-zinc-900">Benchmark submissions</div>
 <div className="mt-2 space-y-2">
 {submissions.data && submissions.data.length > 0 ? (
 submissions.data
 .filter((submission) => submission.reportingYear === reportingYear)
 .map((submission) => (
 <div
 key={submission.id}
 className="border-l-2 border-zinc-200 pl-3 py-1 text-sm"
 >
 <div className="font-medium text-zinc-900">
 Reporting year {submission.reportingYear}
 </div>
 <div className="text-xs text-zinc-500">{humanizeToken(submission.status)}</div>
 </div>
 ))
 ) : (
 <EmptyState message="No benchmark submission record is linked to this building and reporting year yet." />
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 </Panel>
 ) : null}
 </>
 )) : null}
 </div>
 );
}

function ModeButton({
 active,
 label,
 description,
 onClick,
}: {
 active: boolean;
 label: string;
 description: string;
 onClick: () => void;
}) {
 return (
 <button
 type="button"
 onClick={onClick}
 className={`min-w-[16rem] rounded-2xl border px-4 py-3 text-left transition-colors ${
 active
 ? "border-zinc-900 bg-zinc-900 text-white"
 : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950"
 }`}
 >
 <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
 Reports mode
 </div>
 <div className="mt-2 text-sm font-medium">{label}</div>
 <div className={`mt-1 text-xs leading-6 ${active ? "text-zinc-200" : "text-zinc-500"}`}>
 {description}
 </div>
 </button>
 );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
 return (
 <div>
 <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
 <div className="mt-1 text-sm text-zinc-900">{value}</div>
 </div>
 );
}
