import React, { type ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "muted" | "info";

export function toneClasses(tone: StatusTone) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-red-200 bg-red-50 text-red-700";
    case "info":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
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

export function getPacketStatusDisplay(status: string | null | undefined) {
  switch (status) {
    case "FINALIZED":
      return { label: "Finalized", tone: "success" as const };
    case "GENERATED":
      return { label: "Generated", tone: "info" as const };
    case "STALE":
      return { label: "Needs refresh", tone: "warning" as const };
    case "DRAFT":
      return { label: "Draft", tone: "muted" as const };
    case "NONE":
      return { label: "Not started", tone: "muted" as const };
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono font-semibold uppercase tracking-tight ${toneClasses(
        tone,
      )}`}
    >
      {icon}
      {label}
    </span>
  );
}
