"use client";

import React from "react";
import type { ReactNode } from "react";

export function LoadingState() {
  return (
    <div className="overflow-hidden rounded-md">
      <div className="loading-bar h-1 w-1/3 bg-zinc-300" />
    </div>
  );
}

export function ErrorState({
  message,
  detail,
  action,
}: {
  message: string;
  detail?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 shadow-sm">
      <p className="font-semibold">{message}</p>
      {detail ? <p className="mt-1 text-[13px] text-red-700">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center text-sm text-zinc-500">
      <p className="font-medium">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h3>
          {subtitle ? <p className="mt-1 text-[13px] text-zinc-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function MetricGrid({
  items,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    tone?: "default" | "danger" | "warning" | "success";
  }>;
}) {
  const tones = {
    default: "text-zinc-900",
    danger: "text-red-700",
    warning: "text-amber-700",
    success: "text-emerald-700",
  } as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300"
        >
          <p className="text-[13px] font-medium text-zinc-500">{item.label}</p>
          <p className={`mt-2 text-2xl font-semibold tracking-tight ${tones[item.tone ?? "default"]}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return `$${value.toLocaleString()}`;
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function downloadFile(params: {
  fileName: string;
  content: string;
  contentType: string;
  encoding?: "utf-8" | "base64";
}) {
  const blob =
    params.encoding === "base64"
      ? new Blob(
          [
            Uint8Array.from(atob(params.content), (character) =>
              character.charCodeAt(0),
            ),
          ],
          { type: params.contentType },
        )
      : new Blob([params.content], { type: params.contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = params.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function downloadTextFile(params: {
  fileName: string;
  content: string;
  contentType: string;
}) {
  downloadFile({ ...params, encoding: "utf-8" });
}
