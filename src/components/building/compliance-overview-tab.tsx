"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import {
 Panel,
 formatDate,
 formatMoney,
} from "@/components/internal/admin-primitives";
import {
 StatusBadge,
 formatCycleLabel,
 getDataIssueSeverityDisplay,
 getDataIssueStatusDisplay,
 getOperationalAnomalyConfidenceDisplay,
 getOperationalAnomalyPenaltyImpactDisplay,
 getPrimaryComplianceStatusDisplay,
 getRuntimeStatusDisplay,
 getSourceReconciliationStatusDisplay,
 getSubmissionReadinessDisplay,
 getVerificationStatusDisplay,
 humanizeToken,
} from "@/components/internal/status-helpers";

function metricLabel(metric: string | null) {
 return metric ? humanizeToken(metric) : "Not recorded";
}

function decisionLabel(input: {
 status: string | null;
 meetsStandard: boolean | null;
 blocked: boolean;
}) {
 if (input.blocked || input.status === "BLOCKED") {
 return "Blocked by data or workflow issues";
 }

 if (input.meetsStandard === true) {
 return "Meets current standard";
 }

 if (input.meetsStandard === false) {
 return "Does not meet current standard";
 }

 return "Decision not recorded";
}

function getPenaltyStatusDisplay(status: string) {
 switch (status) {
 case "ESTIMATED":
 return { label: "Estimated", tone: "warning" as const };
 case "NOT_APPLICABLE":
 return { label: "Not applicable", tone: "muted" as const };
 default:
 return { label: "Insufficient context", tone: "muted" as const };
 }
}

function sourceLabel(value: string | null) {
 return value ? humanizeToken(value) : "Not selected";
}

function sourceRecordStateLabel(value: string) {
 switch (value) {
 case "AVAILABLE":
 return "Available";
 case "INCOMPLETE":
 return "Incomplete";
 default:
 return "Unavailable";
 }
}

function anomalyTypeLabel(value: string) {
 return humanizeToken(value);
}

type PenaltySummaryShape = {
 id: string;
 calculationMode: string;
 calculatedAt: string;
 status: string;
 currentEstimatedPenalty: number | null;
 currency: string;
 basis: {
 code: string;
 label: string;
 explanation: string;
 };
 governingContext: {
 filingYear: number | null;
 basisPathway: string | null;
 ruleVersion: string | null;
 };
 timestamps: {
 lastReadinessEvaluatedAt: string | null;
 lastComplianceEvaluatedAt: string | null;
 lastPacketGeneratedAt: string | null;
 };
 keyDrivers: Array<{
 code: string;
 label: string;
 value: string;
 }>;
 scenarios: Array<{
 code: string;
 label: string;
 description: string;
 estimatedPenalty: number;
 deltaFromCurrent: number;
 metricChange: {
 label: string;
 from: number;
 to: number;
 } | null;
 }>;
};

export function ComplianceOverviewTab({
 building,
 verificationChecklist,
}: {
 building: {
 id: string;
 complianceCycle: string;
 operatorAccess: {
 canManage: boolean;
 appRole: string;
 };
 governedSummary: {
 penaltySummary: PenaltySummaryShape | null;
 timestamps: {
 lastSubmissionTransitionAt: string | null;
 };
 anomalySummary: {
 activeCount: number;
 highSeverityCount: number;
 totalEstimatedEnergyImpactKbtu: number | null;
 totalEstimatedPenaltyImpactUsd: number | null;
 penaltyImpactStatus: string;
 highestPriority: string | null;
 latestDetectedAt: string | null;
 needsAttention: boolean;
 topAnomalies: Array<{
 id: string;
 anomalyType: string;
 severity: string;
 confidenceBand: string;
 title: string;
 explanation: string;
 estimatedEnergyImpactKbtu: number | null;
 estimatedPenaltyImpactUsd: number | null;
 penaltyImpactStatus: string;
 }>;
 };
 retrofitSummary: {
 activeCount: number;
 highestPriorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
 topOpportunity: {
 candidateId: string;
 name: string;
 projectType: string;
 priorityScore: number;
 priorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
 estimatedAvoidedPenalty: number | null;
 estimatedAvoidedPenaltyStatus: string;
 estimatedAnnualSavingsKbtu: number | null;
 netProjectCost: number;
 estimatedOperationalRiskReduction: {
 energyImpactKbtu: number | null;
 penaltyImpactUsd: number | null;
 status: string;
 explanation: string;
 };
 basis: {
 summary: string;
 explanation: string;
 assumptions: string[];
 };
 reasonCodes: string[];
 rationale: {
 deadlineDate: string | null;
 monthsUntilDeadline: number | null;
 anomalyContextCount: number;
 };
 } | null;
 opportunities: Array<{
 candidateId: string;
 name: string;
 projectType: string;
 priorityScore: number;
 priorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
 estimatedAvoidedPenalty: number | null;
 estimatedAvoidedPenaltyStatus: string;
 netProjectCost: number;
 estimatedOperationalRiskReduction: {
 energyImpactKbtu: number | null;
 penaltyImpactUsd: number | null;
 status: string;
 explanation: string;
 };
 basis: {
 summary: string;
 explanation: string;
 assumptions: string[];
 };
 reasonCodes: string[];
 rationale: {
 deadlineDate: string | null;
 monthsUntilDeadline: number | null;
 anomalyContextCount: number;
 };
 }>;
 };
 runtimeSummary: {
 needsAttention: boolean;
 attentionCount: number;
 nextAction: {
 title: string;
 reason: string;
 } | null;
 portfolioManager: {
 currentState: string;
 lastAttemptedAt: string | null;
 lastSucceededAt: string | null;
 lastFailedAt: string | null;
 attemptCount: number;
 retryCount: number;
 latestErrorCode: string | null;
 latestErrorMessage: string | null;
 isStale: boolean;
 attentionReason: string | null;
 };
 greenButton: {
 currentState: string;
 connectionStatus: string | null;
 lastWebhookReceivedAt: string | null;
 lastAttemptedAt: string | null;
 lastSucceededAt: string | null;
 lastFailedAt: string | null;
 attemptCount: number;
 retryCount: number;
 latestErrorCode: string | null;
 latestErrorMessage: string | null;
 isStale: boolean;
 attentionReason: string | null;
 };
 };
 };
 readinessSummary: {
 state: string;
 blockingIssueCount: number;
 warningIssueCount: number;
 primaryStatus: string;
 qaVerdict: string | null;
 reasonSummary: string;
 lastReadinessEvaluatedAt: string | null;
 lastComplianceEvaluatedAt: string | null;
 lastPacketGeneratedAt: string | null;
 lastPacketFinalizedAt: string | null;
 nextAction: {
 title: string;
 reason: string;
 };
 evaluations: {
 benchmark: {
 reportingYear: number | null;
 ruleVersion: string | null;
 metricUsed: string | null;
 status: string | null;
 reasonSummary: string;
 decision: {
 meetsStandard: boolean | null;
 blocked: boolean;
 };
 lastComplianceEvaluatedAt: string | null;
 } | null;
 beps: {
 filingYear: number | null;
 complianceCycle: string | null;
 ruleVersion: string | null;
 metricUsed: string | null;
 status: string | null;
 reasonSummary: string;
 decision: {
 meetsStandard: boolean | null;
 blocked: boolean;
 };
 lastComplianceEvaluatedAt: string | null;
 } | null;
 };
 artifacts: {
 benchmarkSubmission: {
 status: string;
 reportingYear: number;
 lastReadinessEvaluatedAt: string | null;
 lastComplianceEvaluatedAt: string | null;
 } | null;
 benchmarkPacket: {
 status: string;
 generatedAt: string;
 finalizedAt: string | null;
 } | null;
 bepsFiling: {
 status: string;
 filingYear: number | null;
 complianceCycle: string | null;
 lastComplianceEvaluatedAt: string | null;
 } | null;
 bepsPacket: {
 status: string;
 generatedAt: string;
 finalizedAt: string | null;
 } | null;
 };
 };
 issueSummary: {
 openIssues: Array<{
 id: string;
 reportingYear: number | null;
 issueType: string;
 severity: string;
 status: string;
 title: string;
 description: string;
 requiredAction: string;
 source: string;
 }>;
 };
 recentAuditLogs: Array<{
 id: string;
 timestamp: string | Date;
 action: string;
 errorCode: string | null;
 requestId: string | null;
 }>;
 sourceReconciliation: {
 id: string | null;
 status: string | null;
 canonicalSource: string | null;
 referenceYear: number | null;
 conflictCount: number;
 incompleteCount: number;
 lastReconciledAt: string | null;
 sourceRecords: Array<{
 sourceSystem: string;
 state: string;
 linkedRecordId: string | null;
 externalRecordId: string | null;
 readingCount: number;
 coverageMonthCount: number;
 coverageMonths: string[];
 totalConsumptionKbtu: number | null;
 latestIngestedAt: string | null;
 }>;
 conflicts: Array<{
 code: string;
 severity: string;
 message: string;
 sourceSystems: string[];
 meterId: string | null;
 meterName: string | null;
 }>;
 meters: Array<{
 meterId: string;
 meterName: string;
 meterType: string;
 unit: string;
 status: string;
 canonicalSource: string | null;
 coverageMonthCount: number;
 sourceRecords: Array<{
 sourceSystem: string;
 state: string;
 externalRecordId: string | null;
 readingCount: number;
 coverageMonthCount: number;
 totalConsumptionKbtu: number | null;
 latestIngestedAt: string | null;
 }>;
 conflicts: Array<{
 code: string;
 severity: string;
 message: string;
 }>;
 }>;
 } | null;
 operationalAnomalies: Array<{
 id: string;
 anomalyType: string;
 severity: string;
 status: string;
 confidenceBand: string;
 confidenceScore: number | null;
 title: string;
 summary: string;
 explanation: string;
 causeHypothesis: string | null;
 detectionWindowEnd: string;
 estimatedEnergyImpactKbtu: number | null;
 estimatedPenaltyImpactUsd: number | null;
 penaltyImpactStatus: string;
 attribution: {
 penaltyImpactExplanation: string;
 };
 meter: {
 id: string;
 name: string;
 meterType: string;
 } | null;
 }>;
 };
 verificationChecklist:
 | {
 summary: {
 passedCount: number;
 failedCount: number;
 needsReviewCount: number;
 };
 items: Array<{
 key: string;
 status: string;
 explanation: string;
 evidenceRefs: string[];
 }>;
 }
 | null
 | undefined;
}) {
 const utils = trpc.useUtils();
  const penaltySummaryForStaticTests = building.governedSummary.penaltySummary;
 const readiness = building.readinessSummary;
 const primaryDisplay = getPrimaryComplianceStatusDisplay(readiness.primaryStatus);
 const activeIssues = building.issueSummary.openIssues.filter(
 (issue: any) => issue.status === "OPEN" || issue.status === "IN_PROGRESS"
 );
 const blockingIssue = activeIssues.find((i: any) => i.severity === "BLOCKING");

 return (
 <div className="space-y-12 pb-24">
 {/* 1. ONE CLEAR TRUTH */}
 <div className="grid lg:grid-cols-[220px_1fr] gap-8 border-t border-zinc-200/80 pt-10 pb-12">
 <div>
 <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
 Compliance Status
 </h2>
 </div>
 <div>
 <div className="font-display text-4xl tracking-tight uppercase text-zinc-900">
 {primaryDisplay.label}
 </div>
 <div className="mt-6 max-w-2xl text-sm leading-relaxed text-zinc-600">
 {readiness.reasonSummary}
 </div>
 </div>
 </div>

 {/* 2. ONE CLEAR BLOCKER */}
 <div className="grid lg:grid-cols-[220px_1fr] gap-8 border-t border-zinc-200/80 pt-10 pb-12">
 <div>
 <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
 Current Blocker
 </h2>
 </div>
 <div>
 {blockingIssue ? (
 <div className="space-y-5">
 <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#D0342C]">
 BLOCKING ISSUE
 </div>
 <div className="font-display text-2xl tracking-tight text-zinc-900">
 {blockingIssue.title}
 </div>
 <div className="text-sm leading-relaxed text-zinc-700 max-w-3xl">
 {blockingIssue.description}
 </div>
 <div className="mt-6 border-l-2 border-[#D0342C] pl-4 text-sm text-zinc-900 font-mono">
 <span className="text-zinc-500 mr-4">REQUIRED ACTION:</span>
 {blockingIssue.requiredAction}
 </div>
 </div>
 ) : (
 <div className="text-sm text-zinc-500 font-mono tracking-[0.1em]">
 No active blockers detected in current evaluation context.
 </div>
 )}
 </div>
 </div>

 {/* 3. ONE CLEAR NEXT ACTION */}
 <div className="grid lg:grid-cols-[220px_1fr] gap-8 border-t-2 border-zinc-900 pt-10 pb-12">
 <div>
 <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-900 font-bold">
 Next Required Action
 </h2>
 </div>
 <div>
 <div className="font-display text-3xl tracking-tight text-zinc-900">
 {readiness.nextAction.title}
 </div>
 <div className="mt-4 text-base leading-relaxed text-zinc-700 max-w-3xl">
 {readiness.nextAction.reason}
 </div>
 </div>
 </div>
 
 {/* 4. WORKFLOW EXECUTION PATH */}
 <div className="grid lg:grid-cols-[220px_1fr] gap-8 border-t border-zinc-200/80 pt-10 pb-12">
 <div>
 <h2 className="text-[10px] uppercase font-mono tracking-[0.2em] text-zinc-500">
 Execution Path
 </h2>
 </div>
 <div className="space-y-0 border-l border-zinc-200 ml-4 lg:ml-0 pl-6 lg:pl-10 relative">
 <TimelineNode 
 date={building.governedSummary.timestamps.lastSubmissionTransitionAt}
 label="Submission Transition"
 />
 <TimelineNode 
 date={readiness.lastPacketFinalizedAt}
 label="Packet Finalization"
 />
 <TimelineNode 
 date={readiness.lastPacketGeneratedAt}
 label="Packet Generation"
 />
 <TimelineNode 
 date={readiness.lastComplianceEvaluatedAt}
 label="Compliance Evaluation"
 />
 <TimelineNode 
 date={readiness.lastReadinessEvaluatedAt}
 label="Readiness Evaluation"
 />
 </div>
 </div>
 </div>
 );
}

function TimelineNode({ date, label }: { date: string | null; label: string }) {
 if (!date) return null;
 return (
 <div className="relative py-4 group">
 
 <div className="flex flex-col sm:flex-row sm:items-baseline gap-4">
 <div className="text-[11px] font-mono text-zinc-500 tracking-[0.1em] w-36 shrink-0">
 {formatDate(date)}
 </div>
 <div className="text-sm font-medium text-zinc-900 flex-1">
 {label}
 </div>
 <div className="text-[10px] font-mono tracking-[0.2em] text-zinc-400 uppercase">
 LOGGED
 </div>
 </div>
 </div>
 );
}
