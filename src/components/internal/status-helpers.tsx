import React, { type ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "muted" | "info";
export type PrimaryComplianceSurfaceStatus =
  | "DATA_INCOMPLETE"
  | "READY"
  | "COMPLIANT"
  | "NON_COMPLIANT";
export type SubmissionReadinessSurfaceStatus =
  | "DATA_INCOMPLETE"
  | "READY_FOR_REVIEW"
  | "READY_TO_SUBMIT"
  | "SUBMITTED";
export type WorklistTriageBucket =
  | "COMPLIANCE_BLOCKER"
  | "ARTIFACT_ATTENTION"
  | "REVIEW_QUEUE"
  | "SUBMISSION_QUEUE"
  | "SYNC_ATTENTION"
  | "OPERATIONAL_RISK"
  | "RETROFIT_QUEUE"
  | "MONITORING";

export function toneClasses(tone: StatusTone) {
  switch (tone) {
    case "success":
      return "badge-status-success";
    case "warning":
      return "badge-status-warning";
    case "danger":
      return "badge-status-danger";
    case "info":
      return "badge-status-info";
    default:
      return "badge-status border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

export function humanizeToken(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getComplianceStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "COMPLIANT":
      return { label: "Compliant", tone: "success" as const };
    case "AT_RISK":
      return { label: "At risk", tone: "warning" as const };
    case "NON_COMPLIANT":
      return { label: "Non-compliant", tone: "danger" as const };
    case "EXEMPT":
      return { label: "Exempt", tone: "muted" as const };
    case "PENDING_DATA":
      return { label: "Needs data", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getWorkflowStageStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "COMPLETE":
      return { label: "Complete", tone: "success" as const };
    case "NEEDS_ATTENTION":
      return { label: "Needs attention", tone: "warning" as const };
    case "BLOCKED":
      return { label: "Blocked", tone: "danger" as const };
    case "NOT_STARTED":
      return { label: "Not started", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getSyncStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "SUCCEEDED":
      return { label: "Up to date", tone: "success" as const };
    case "PARTIAL":
      return { label: "Partial import", tone: "warning" as const };
    case "FAILED":
      return { label: "Sync failed", tone: "danger" as const };
    case "RUNNING":
      return { label: "Syncing", tone: "info" as const };
    case "NOT_STARTED":
      return { label: "Not started", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getRuntimeStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "SUCCEEDED":
      return { label: "Healthy", tone: "success" as const };
    case "STALE":
      return { label: "Stale", tone: "warning" as const };
    case "FAILED":
      return { label: "Failed", tone: "danger" as const };
    case "RETRYING":
      return { label: "Retrying", tone: "warning" as const };
    case "RUNNING":
      return { label: "Running", tone: "info" as const };
    case "IDLE":
      return { label: "Idle", tone: "muted" as const };
    case "NOT_CONNECTED":
      return { label: "Not connected", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getPacketStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "FINALIZED":
      return { label: "Finalized", tone: "success" as const };
    case "GENERATED":
      return { label: "Generated", tone: "info" as const };
    case "STALE":
      return { label: "Needs refresh", tone: "warning" as const };
    case "NOT_STARTED":
      return { label: "Not started", tone: "muted" as const };
    case "DRAFT":
      return { label: "Draft", tone: "muted" as const };
    case "NONE":
      return { label: "Not started", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getPenaltySummaryStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "ESTIMATED":
      return { label: "Estimated", tone: "warning" as const };
    case "NOT_APPLICABLE":
      return { label: "Not applicable", tone: "muted" as const };
    case "INSUFFICIENT_CONTEXT":
      return { label: "Insufficient context", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getOperationalAnomalyConfidenceDisplay(
  confidenceBand: string | null | undefined,
) {
  switch (confidenceBand) {
    case "HIGH":
      return { label: "High confidence", tone: "success" as const };
    case "MEDIUM":
      return { label: "Medium confidence", tone: "warning" as const };
    case "LOW":
      return { label: "Low confidence", tone: "muted" as const };
    default:
      return { label: humanizeToken(confidenceBand), tone: "muted" as const };
  }
}

export function getOperationalAnomalyPenaltyImpactDisplay(
  status: string | null | undefined,
) {
  switch (status) {
    case "ESTIMATED":
      return { label: "Penalty impact estimated", tone: "warning" as const };
    case "NOT_APPLICABLE":
      return { label: "No penalty context", tone: "muted" as const };
    case "INSUFFICIENT_CONTEXT":
      return { label: "Penalty impact unavailable", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getRequestItemStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "VERIFIED":
      return { label: "Verified", tone: "success" as const };
    case "RECEIVED":
      return { label: "Received", tone: "info" as const };
    case "REQUESTED":
      return { label: "Requested", tone: "warning" as const };
    case "BLOCKED":
      return { label: "Blocked", tone: "danger" as const };
    case "NOT_REQUESTED":
      return { label: "Not requested", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getReadinessStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "READY":
      return { label: "Ready", tone: "success" as const };
    case "BLOCKED":
      return { label: "Blocked", tone: "danger" as const };
    case "IN_PROGRESS":
      return { label: "In progress", tone: "warning" as const };
    case "OUT_OF_SCOPE":
      return { label: "Out of scope", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getVerificationStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "PASS":
      return { label: "Pass", tone: "success" as const };
    case "FAIL":
      return { label: "Fail", tone: "danger" as const };
    case "NEEDS_REVIEW":
      return { label: "Needs review", tone: "warning" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getDataIssueSeverityDisplay(severity: string | null | undefined) {
  switch (severity) {
    case "BLOCKING":
      return { label: "Blocking", tone: "danger" as const };
    case "WARNING":
      return { label: "Warning", tone: "warning" as const };
    default:
      return { label: humanizeToken(severity), tone: "muted" as const };
  }
}

export function getDataIssueStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "OPEN":
      return { label: "Open", tone: "danger" as const };
    case "IN_PROGRESS":
      return { label: "In progress", tone: "warning" as const };
    case "RESOLVED":
      return { label: "Resolved", tone: "success" as const };
    case "DISMISSED":
      return { label: "Dismissed", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getSourceReconciliationStatusDisplay(
  status: string | null | undefined,
) {
  switch (status) {
    case "CLEAN":
      return { label: "Clean", tone: "success" as const };
    case "CONFLICTED":
      return { label: "Conflicted", tone: "danger" as const };
    case "INCOMPLETE":
      return { label: "Incomplete", tone: "warning" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getSubmissionReadinessDisplay(
  status: SubmissionReadinessSurfaceStatus | string | null | undefined,
) {
  switch (status) {
    case "DATA_INCOMPLETE":
      return { label: "Data incomplete", tone: "warning" as const };
    case "READY_FOR_REVIEW":
      return { label: "Ready for review", tone: "info" as const };
    case "READY_TO_SUBMIT":
      return { label: "Ready to submit", tone: "success" as const };
    case "SUBMITTED":
      return { label: "Submitted", tone: "muted" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function getWorklistTriageDisplay(
  bucket: WorklistTriageBucket | string | null | undefined,
) {
  switch (bucket) {
    case "COMPLIANCE_BLOCKER":
      return { label: "Compliance blocker", tone: "danger" as const };
    case "ARTIFACT_ATTENTION":
      return { label: "Artifact attention", tone: "warning" as const };
    case "REVIEW_QUEUE":
      return { label: "Review queue", tone: "info" as const };
    case "SUBMISSION_QUEUE":
      return { label: "Submission queue", tone: "success" as const };
    case "SYNC_ATTENTION":
      return { label: "Sync attention", tone: "warning" as const };
    case "OPERATIONAL_RISK":
      return { label: "Operational risk", tone: "warning" as const };
    case "RETROFIT_QUEUE":
      return { label: "Retrofit queue", tone: "info" as const };
    case "MONITORING":
      return { label: "Monitoring", tone: "muted" as const };
    default:
      return { label: humanizeToken(bucket), tone: "muted" as const };
  }
}

export function getPrimaryComplianceStatusDisplay(
  status: PrimaryComplianceSurfaceStatus | string | null | undefined,
) {
  switch (status) {
    case "DATA_INCOMPLETE":
      return { label: "Data incomplete", tone: "warning" as const };
    case "READY":
      return { label: "Ready", tone: "info" as const };
    case "COMPLIANT":
      return { label: "Compliant", tone: "success" as const };
    case "NON_COMPLIANT":
      return { label: "Non-compliant", tone: "danger" as const };
    default:
      return { label: humanizeToken(status), tone: "muted" as const };
  }
}

export function StatusBadge({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: StatusTone;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`items-center gap-1.5 ${toneClasses(tone)}`}
    >
      {icon}
      {label}
    </span>
  );
}
