"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  downloadFile,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Panel,
  formatDate,
} from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  getPacketStatusDisplay,
  getReadinessStatusDisplay,
  getRequestItemStatusDisplay,
} from "@/components/internal/status-helpers";

const REQUEST_CATEGORIES = [
  { value: "DC_REAL_PROPERTY_ID", label: "DC Real Property Unique ID" },
  { value: "GROSS_FLOOR_AREA_SUPPORT", label: "Gross floor area support" },
  { value: "AREA_ANALYSIS_DRAWINGS", label: "Area analysis / drawings" },
  { value: "PROPERTY_USE_DETAILS_SUPPORT", label: "Property use details support" },
  { value: "METER_ROSTER_SUPPORT", label: "Meter roster / aggregate meter support" },
  { value: "UTILITY_BILLS", label: "Utility bills" },
  { value: "PORTFOLIO_MANAGER_ACCESS", label: "Portfolio Manager access/share confirmation" },
  { value: "DATA_QUALITY_CHECKER_SUPPORT", label: "Data Quality Checker support" },
  {
    value: "THIRD_PARTY_VERIFICATION_SUPPORT",
    label: "Third-party verification support documents",
  },
  { value: "OTHER_BENCHMARKING_SUPPORT", label: "Other benchmarking support evidence" },
] as const;

const REQUEST_STATUSES = [
  "NOT_REQUESTED",
  "REQUESTED",
  "RECEIVED",
  "VERIFIED",
  "BLOCKED",
] as const;

function defaultReportingYear() {
  return new Date().getUTCFullYear() - 1;
}

function toDateInputValue(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function getReadinessStatus(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "NOT_STARTED";
  }

  const status = (data as { status?: unknown }).status;
  return typeof status === "string" ? status : "NOT_STARTED";
}

export function VerificationRequestsTab({ buildingId }: { buildingId: string }) {
  const [reportingYear, setReportingYear] = useState(defaultReportingYear());
  const [editingRequestId, setEditingRequestId] = useState<string | undefined>();
  const [category, setCategory] = useState<(typeof REQUEST_CATEGORIES)[number]["value"]>(
    "DC_REAL_PROPERTY_ID",
  );
  const [title, setTitle] = useState("DC Real Property Unique ID");
  const [status, setStatus] = useState<(typeof REQUEST_STATUSES)[number]>("REQUESTED");
  const [isRequired, setIsRequired] = useState(true);
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [requestedFrom, setRequestedFrom] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const readiness = trpc.benchmarking.getReadiness.useQuery(
    { buildingId, reportingYear },
    { retry: false },
  );
  const requestItems = trpc.benchmarking.listRequestItems.useQuery({
    buildingId,
    reportingYear,
  });
  const latestPacket = trpc.benchmarking.getLatestBenchmarkPacket.useQuery(
    { buildingId, reportingYear },
    { retry: false },
  );
  const packetManifest = trpc.benchmarking.getBenchmarkPacketManifest.useQuery(
    { buildingId, reportingYear },
    { retry: false },
  );
  const packets = trpc.benchmarking.listBenchmarkPackets.useQuery({
    buildingId,
    limit: 12,
  });

  const invalidateAll = () => {
    utils.benchmarking.listRequestItems.invalidate({ buildingId, reportingYear });
    utils.benchmarking.getLatestBenchmarkPacket.invalidate({ buildingId, reportingYear });
    utils.benchmarking.getBenchmarkPacketManifest.invalidate({ buildingId, reportingYear });
    utils.benchmarking.listBenchmarkPackets.invalidate({ buildingId, limit: 12 });
    utils.benchmarking.getReadiness.invalidate({ buildingId, reportingYear });
  };

  const upsertMutation = trpc.benchmarking.upsertRequestItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      setEditingRequestId(undefined);
      setCategory("DC_REAL_PROPERTY_ID");
      setTitle("DC Real Property Unique ID");
      setStatus("REQUESTED");
      setIsRequired(true);
      setDueDate("");
      setAssignedTo("");
      setRequestedFrom("");
      setNotes("");
    },
  });

  const generateMutation = trpc.benchmarking.generateBenchmarkPacket.useMutation({
    onSuccess: invalidateAll,
  });

  const finalizeMutation = trpc.benchmarking.finalizeBenchmarkPacket.useMutation({
    onSuccess: invalidateAll,
  });

  const readinessDisplay = getReadinessStatusDisplay(getReadinessStatus(readiness.data));
  const packetStatusDisplay = getPacketStatusDisplay(latestPacket.data?.status ?? "NONE");
  const manifestWarnings = Array.isArray(packetManifest.data?.warnings)
    ? packetManifest.data.warnings
    : [];
  const manifestBlockers = Array.isArray(packetManifest.data?.blockers)
    ? packetManifest.data.blockers
    : [];

  const packetDisposition = useMemo(() => {
    const disposition = packetManifest.data?.disposition;
    if (typeof disposition !== "string") {
      return null;
    }
    return disposition.replaceAll("_", " ").toLowerCase();
  }, [packetManifest.data?.disposition]);

  async function handleExport(format: "JSON" | "MARKDOWN" | "PDF") {
    const result = await utils.benchmarking.exportBenchmarkPacket.fetch({
      buildingId,
      reportingYear,
      format,
    });

    downloadFile({
      fileName: result.fileName,
      content: result.content,
      contentType: result.contentType,
      encoding: result.encoding,
    });
  }

  function hydrateEditor(item: NonNullable<typeof requestItems.data>[number]) {
    setEditingRequestId(item.id);
    setCategory(item.category);
    setTitle(item.title);
    setStatus(item.status);
    setIsRequired(item.isRequired);
    setDueDate(toDateInputValue(item.dueDate ?? null));
    setAssignedTo(item.assignedTo ?? "");
    setRequestedFrom(item.requestedFrom ?? "");
    setNotes(item.notes ?? "");
  }

  if (readiness.isLoading || requestItems.isLoading || packets.isLoading) {
    return <LoadingState />;
  }

  if (requestItems.error) {
    return (
      <ErrorState
        message="Verification workspace is unavailable."
        detail={requestItems.error.message}
      />
    );
  }

  const btnClass =
    "rounded-md border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50";

  return (
    <div className="space-y-6">
      <Panel
        title="Benchmark verification packet"
        subtitle="Assemble a verifier-ready workpaper packet from the current readiness result, linked evidence, and open checklist items. PDF export generates the formatted reviewer handoff document; JSON and Markdown remain raw packet exports."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              value={reportingYear}
              onChange={(event) => setReportingYear(Number(event.target.value))}
              className="w-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-[13px] font-medium text-zinc-900 shadow-sm"
            />
            <button
              className={btnClass}
              onClick={() => generateMutation.mutate({ buildingId, reportingYear })}
              disabled={generateMutation.isPending || readiness.isError}
            >
              {generateMutation.isPending
                ? "Generating..."
                : latestPacket.data
                  ? "Regenerate packet"
                  : "Generate packet"}
            </button>
            <button
              className={btnClass}
              onClick={() => finalizeMutation.mutate({ buildingId, reportingYear })}
              disabled={
                finalizeMutation.isPending ||
                !latestPacket.data ||
                latestPacket.data.status === "FINALIZED"
              }
            >
              {finalizeMutation.isPending ? "Finalizing..." : "Finalize packet"}
            </button>
            <button
              className={btnClass}
              onClick={() => handleExport("JSON")}
              disabled={!latestPacket.data}
            >
              Export JSON
            </button>
            <button
              className={btnClass}
              onClick={() => handleExport("MARKDOWN")}
              disabled={!latestPacket.data}
            >
              Export Markdown
            </button>
            <button
              className={btnClass}
              onClick={() => handleExport("PDF")}
              disabled={!latestPacket.data}
            >
              Export PDF
            </button>
          </div>
        }
      >
        {readiness.error?.data?.code === "NOT_FOUND" ? (
          <EmptyState message="Run benchmarking readiness first. Quoin needs a benchmark submission before it can assemble a verification packet." />
        ) : null}

        {generateMutation.error ? (
          <ErrorState
            message="Benchmark packet generation failed."
            detail={generateMutation.error.message}
          />
        ) : null}

        {finalizeMutation.error ? (
          <ErrorState
            message="Benchmark packet finalization failed."
            detail={finalizeMutation.error.message}
          />
        ) : null}

        <MetricGrid
          items={[
            { label: "Benchmarking readiness", value: readinessDisplay.label },
            { label: "Packet status", value: packetStatusDisplay.label },
            { label: "Packet disposition", value: packetDisposition ?? "Not generated" },
            {
              label: "Latest packet version",
              value: latestPacket.data ? `v${latestPacket.data.version}` : "Not generated",
            },
          ]}
        />

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900">Current packet state</span>
              <StatusBadge
                label={packetStatusDisplay.label}
                tone={packetStatusDisplay.tone}
              />
            </div>
            <p className="mt-2 text-[13px] text-zinc-600">
              {latestPacket.data
                ? `Latest packet generated ${formatDate(latestPacket.data.generatedAt)}. Finalize only after blockers are resolved and required support is verified.`
                : "No benchmark verification packet exists yet for this reporting year."}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-5 text-sm">
            <div className="font-semibold text-zinc-900">Warnings and blockers</div>
            {manifestWarnings.length === 0 && manifestBlockers.length === 0 ? (
              <p className="mt-2 text-[13px] text-zinc-600">
                No packet warnings are currently recorded.
              </p>
            ) : (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-zinc-700">
                {manifestBlockers.map((item, index) => (
                  <li key={`blocker-${index}`} className="text-red-700">
                    {String(item)}
                  </li>
                ))}
                {manifestWarnings.map((item, index) => {
                  const message =
                    item && typeof item === "object" && !Array.isArray(item)
                      ? String((item as Record<string, unknown>).message ?? "Warning")
                      : String(item);
                  return <li key={`warning-${index}`}>{message}</li>;
                })}
              </ul>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel
          title="Client requests and evidence checklist"
          subtitle="Track the missing items consultants need before benchmarking verification is truly ready."
        >
          {requestItems.data && requestItems.data.length > 0 ? (
            <div className="space-y-4">
              {requestItems.data.map((item) => {
                const statusDisplay = getRequestItemStatusDisplay(item.status);
                return (
                  <div key={item.id} className="rounded-xl border border-zinc-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-zinc-900">{item.title}</div>
                        <div className="mt-1 text-[13px] text-zinc-500">
                          {REQUEST_CATEGORIES.find((entry) => entry.value === item.category)?.label ??
                            item.category}
                          {item.isRequired ? " • Required" : " • Optional"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          label={statusDisplay.label}
                          tone={statusDisplay.tone}
                        />
                        <button
                          className="text-[12px] font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4"
                          onClick={() => hydrateEditor(item)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-[13px] text-zinc-600 md:grid-cols-2">
                      <div>Due: {formatDate(item.dueDate)}</div>
                      <div>Requested from: {item.requestedFrom ?? "—"}</div>
                      <div>Assigned to: {item.assignedTo ?? "—"}</div>
                      <div>
                        Linked evidence:{" "}
                        {item.evidenceArtifact?.name ?? item.sourceArtifact?.name ?? "None linked"}
                      </div>
                    </div>
                    {item.notes ? (
                      <p className="mt-3 text-[13px] leading-relaxed text-zinc-700">{item.notes}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No request items exist yet for this building and reporting year." />
          )}
        </Panel>

        <Panel
          title={editingRequestId ? "Update request item" : "Add request item"}
          subtitle="Use this checklist to track what the client or verifier still needs to provide."
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              upsertMutation.mutate({
                requestItemId: editingRequestId,
                buildingId,
                reportingYear,
                category,
                title,
                status,
                isRequired,
                dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : null,
                assignedTo: assignedTo || null,
                requestedFrom: requestedFrom || null,
                notes: notes || null,
              });
            }}
          >
            <label className="block text-[13px] font-medium text-zinc-700">
              Category
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as (typeof REQUEST_CATEGORIES)[number]["value"]);
                  if (!editingRequestId) {
                    const selected = REQUEST_CATEGORIES.find(
                      (item) => item.value === event.target.value,
                    );
                    setTitle(selected?.label ?? event.target.value);
                  }
                }}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-[13px]"
              >
                {REQUEST_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[13px] font-medium text-zinc-700">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-[13px]"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-[13px] font-medium text-zinc-700">
                Status
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as (typeof REQUEST_STATUSES)[number])
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-[13px]"
                >
                  {REQUEST_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {item.replaceAll("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[13px] font-medium text-zinc-700">
                Due date
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-[13px]"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-[13px] font-medium text-zinc-700">
                Requested from
                <input
                  value={requestedFrom}
                  onChange={(event) => setRequestedFrom(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-[13px]"
                />
              </label>

              <label className="block text-[13px] font-medium text-zinc-700">
                Assigned to
                <input
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-[13px]"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-[13px] font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(event) => setIsRequired(event.target.checked)}
              />
              Required for verification readiness
            </label>

            <label className="block text-[13px] font-medium text-zinc-700">
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-[13px]"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={upsertMutation.isPending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {upsertMutation.isPending
                  ? "Saving..."
                  : editingRequestId
                    ? "Update item"
                    : "Create item"}
              </button>
              {editingRequestId ? (
                <button
                  type="button"
                  className={btnClass}
                  onClick={() => {
                    setEditingRequestId(undefined);
                    setCategory("DC_REAL_PROPERTY_ID");
                    setTitle("DC Real Property Unique ID");
                    setStatus("REQUESTED");
                    setIsRequired(true);
                    setDueDate("");
                    setAssignedTo("");
                    setRequestedFrom("");
                    setNotes("");
                  }}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </Panel>
      </div>

      <Panel
        title="Packet history"
        subtitle="Track packet versions and whether the latest packet is still current."
      >
        {packets.data && packets.data.length > 0 ? (
          <div className="space-y-3">
            {packets.data.map((packet) => {
              const display = getPacketStatusDisplay(packet.status);
              return (
                <div
                  key={packet.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
                >
                  <div>
                    <div className="font-semibold text-zinc-900">
                      Reporting year {packet.reportingYear} • v{packet.version}
                    </div>
                    <div className="mt-1 text-[13px] text-zinc-500">
                      Generated {formatDate(packet.generatedAt)}
                    </div>
                  </div>
                  <StatusBadge label={display.label} tone={display.tone} />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No benchmark verification packets have been generated yet." />
        )}
      </Panel>
    </div>
  );
}
