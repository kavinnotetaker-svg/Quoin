"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  downloadFile,
  EmptyState,
  ErrorState,
  MetricGrid,
  Panel,
  formatDate,
} from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  getPacketStatusDisplay,
  getRequestItemStatusDisplay,
  getWorkflowStageStatusDisplay,
} from "@/components/internal/status-helpers";

const PACKET_TYPES = [
  { value: "PATHWAY_SELECTION", label: "Pathway selection" },
  { value: "COMPLETED_ACTIONS", label: "Completed actions" },
  { value: "PRESCRIPTIVE_PHASE_1_AUDIT", label: "Prescriptive phase 1 audit" },
  { value: "PRESCRIPTIVE_PHASE_2_ACTION_PLAN", label: "Prescriptive phase 2 action plan" },
  { value: "PRESCRIPTIVE_PHASE_3_IMPLEMENTATION", label: "Prescriptive phase 3 implementation" },
  { value: "PRESCRIPTIVE_PHASE_4_EVALUATION", label: "Prescriptive phase 4 evaluation" },
  { value: "DELAY_REQUEST", label: "Delay request" },
  { value: "EXEMPTION_REQUEST", label: "Exemption request" },
  { value: "ACP_SUPPORT", label: "ACP support" },
] as const;

const REQUEST_CATEGORIES = [
  { value: "PATHWAY_SELECTION_SUPPORT", label: "Pathway selection support" },
  { value: "COMPLETED_ACTIONS_EVIDENCE", label: "Completed actions evidence" },
  { value: "ENERGY_AUDIT", label: "Energy audit" },
  { value: "ACTION_PLAN_SUPPORT", label: "Action plan support docs" },
  { value: "IMPLEMENTATION_DOCUMENTATION", label: "Implementation documentation" },
  {
    value: "EVALUATION_MONITORING_DOCUMENTATION",
    label: "Evaluation / monitoring / verification documentation",
  },
  { value: "DELAY_SUBSTANTIATION", label: "Delay substantiation" },
  { value: "EXEMPTION_SUBSTANTIATION", label: "Exemption substantiation" },
  { value: "ACP_SUPPORT_DOCS", label: "ACP support docs" },
  { value: "OTHER_PATHWAY_EVIDENCE", label: "Other pathway evidence" },
] as const;

const REQUEST_STATUSES = [
  "NOT_REQUESTED",
  "REQUESTED",
  "RECEIVED",
  "VERIFIED",
  "BLOCKED",
] as const;

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

function getPacketTypeLabel(value: (typeof PACKET_TYPES)[number]["value"]) {
  return PACKET_TYPES.find((entry) => entry.value === value)?.label ?? value;
}

function mapDisposition(disposition: string | null | undefined) {
  switch (disposition) {
    case "READY":
      return { label: "Ready", tone: "success" as const };
    case "READY_WITH_WARNINGS":
      return { label: "Ready with warnings", tone: "warning" as const };
    case "BLOCKED":
      return { label: "Blocked", tone: "danger" as const };
    default:
      return { label: "Not generated", tone: "muted" as const };
  }
}

export function BepsDeliveryPanel({
  buildingId,
  filingRecordId,
  filingYear,
  cycle,
}: {
  buildingId: string;
  filingRecordId: string;
  filingYear: number | null | undefined;
  cycle: "CYCLE_1" | "CYCLE_2" | "CYCLE_3";
}) {
  const [packetType, setPacketType] =
    useState<(typeof PACKET_TYPES)[number]["value"]>("COMPLETED_ACTIONS");
  const [editingRequestId, setEditingRequestId] = useState<string | undefined>();
  const [category, setCategory] =
    useState<(typeof REQUEST_CATEGORIES)[number]["value"]>("PATHWAY_SELECTION_SUPPORT");
  const [title, setTitle] = useState("Pathway selection support");
  const [status, setStatus] = useState<(typeof REQUEST_STATUSES)[number]>("REQUESTED");
  const [isRequired, setIsRequired] = useState(true);
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [requestedFrom, setRequestedFrom] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const requestItems = trpc.beps.listRequestItems.useQuery({
    buildingId,
    filingRecordId,
    cycle,
    filingYear: filingYear ?? undefined,
    packetType,
  });
  const packetManifest = trpc.beps.packetManifest.useQuery(
    { buildingId, filingRecordId, packetType },
    { retry: false },
  );
  const packets = trpc.beps.listPackets.useQuery({
    buildingId,
    filingRecordId,
    packetType,
    limit: 12,
  });

  const invalidateAll = () => {
    utils.beps.listRequestItems.invalidate({
      buildingId,
      filingRecordId,
      cycle,
      filingYear: filingYear ?? undefined,
      packetType,
    });
    utils.beps.packetManifest.invalidate({ buildingId, filingRecordId, packetType });
    utils.beps.packetByFiling.invalidate({ buildingId, filingRecordId, packetType });
    utils.beps.listPackets.invalidate({ buildingId, filingRecordId, packetType, limit: 12 });
    utils.beps.latestRun.invalidate({ buildingId, cycle });
  };

  const upsertMutation = trpc.beps.upsertRequestItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      setEditingRequestId(undefined);
      setCategory("PATHWAY_SELECTION_SUPPORT");
      setTitle("Pathway selection support");
      setStatus("REQUESTED");
      setIsRequired(true);
      setDueDate("");
      setAssignedTo("");
      setRequestedFrom("");
      setNotes("");
    },
  });

  const generateMutation = trpc.beps.generatePacket.useMutation({
    onSuccess: invalidateAll,
  });

  const finalizeMutation = trpc.beps.finalizePacket.useMutation({
    onSuccess: invalidateAll,
  });

  const latestPacket = packets.data?.[0] ?? null;
  const packetStatusDisplay = getPacketStatusDisplay(latestPacket?.status ?? "NONE");
  const dispositionDisplay = mapDisposition(
    typeof packetManifest.data?.disposition === "string"
      ? packetManifest.data.disposition
      : null,
  );
  const blockers = Array.isArray(packetManifest.data?.blockers)
    ? packetManifest.data.blockers
    : [];
  const warnings = Array.isArray(packetManifest.data?.warnings)
    ? packetManifest.data.warnings
    : [];

  const requestSummary = useMemo(() => {
    const summary = packetManifest.data?.requestSummary;
    return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : null;
  }, [packetManifest.data?.requestSummary]);

  async function handleExport(format: "JSON" | "MARKDOWN" | "PDF") {
    const result = await utils.beps.exportPacket.fetch({
      buildingId,
      filingRecordId,
      packetType,
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

  if (requestItems.isLoading || packets.isLoading) {
    return <div className="text-sm text-slate-500">Loading BEPS delivery workspace...</div>;
  }

  if (requestItems.error || packets.error) {
    const error = requestItems.error ?? packets.error;
    return (
      <ErrorState
        message="BEPS delivery workspace is unavailable."
        detail={error?.message}
      />
    );
  }

  const btnClass =
    "rounded-md border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50";
  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm";

  return (
    <div className="space-y-6">
      <Panel
        title="BEPS delivery packets"
        subtitle="Prepare pathway-specific submission workpapers for the current filing. PDF export generates the formatted reviewer packet; JSON and Markdown remain raw packet exports."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={packetType}
              onChange={(event) =>
                setPacketType(event.target.value as (typeof PACKET_TYPES)[number]["value"])
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-900 shadow-sm"
            >
              {PACKET_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            <button
              className={btnClass}
              onClick={() => generateMutation.mutate({ buildingId, filingRecordId, packetType })}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending
                ? "Generating..."
                : latestPacket
                  ? "Regenerate packet"
                  : "Generate packet"}
            </button>
            <button
              className={btnClass}
              onClick={() => finalizeMutation.mutate({ buildingId, filingRecordId, packetType })}
              disabled={
                finalizeMutation.isPending ||
                !latestPacket ||
                latestPacket.status === "FINALIZED"
              }
            >
              {finalizeMutation.isPending ? "Finalizing..." : "Finalize packet"}
            </button>
            <button className={btnClass} onClick={() => handleExport("JSON")} disabled={!latestPacket}>
              Export JSON
            </button>
            <button
              className={btnClass}
              onClick={() => handleExport("MARKDOWN")}
              disabled={!latestPacket}
            >
              Export Markdown
            </button>
            <button className={btnClass} onClick={() => handleExport("PDF")} disabled={!latestPacket}>
              Export PDF
            </button>
          </div>
        }
      >
        {generateMutation.error ? (
          <ErrorState
            message="Packet generation failed."
            detail={generateMutation.error.message}
          />
        ) : null}

        {finalizeMutation.error ? (
          <ErrorState
            message="Packet finalization failed."
            detail={finalizeMutation.error.message}
          />
        ) : null}

        <MetricGrid
          items={[
            { label: "Deliverable", value: getPacketTypeLabel(packetType) },
            { label: "Packet status", value: packetStatusDisplay.label },
            { label: "Readiness", value: dispositionDisplay.label },
            {
              label: "Latest version",
              value: latestPacket ? `v${latestPacket.version}` : "Not generated",
            },
          ]}
        />

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">Current deliverable state</span>
              <StatusBadge
                label={packetStatusDisplay.label}
                tone={packetStatusDisplay.tone}
              />
              <StatusBadge
                label={dispositionDisplay.label}
                tone={dispositionDisplay.tone}
              />
            </div>
            <p className="mt-2 text-[13px] text-slate-600">
              {latestPacket
                ? `${getPacketTypeLabel(packetType)} was last generated ${formatDate(latestPacket.generatedAt)}. Finalize only when required support is verified and blockers are cleared.`
                : `No ${getPacketTypeLabel(packetType).toLowerCase()} packet exists yet for this filing.`}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 text-sm">
            <div className="font-semibold text-slate-900">What still needs attention</div>
            {blockers.length === 0 && warnings.length === 0 ? (
              <p className="mt-2 text-[13px] text-slate-600">
                No current blockers or warnings are recorded for this deliverable.
              </p>
            ) : (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-slate-700">
                {blockers.map((item, index) => (
                  <li key={`blocker-${index}`} className="text-red-700">
                    {String(item)}
                  </li>
                ))}
                {warnings.map((item, index) => {
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

        {requestSummary ? (
          <div className="mt-4 text-[13px] text-slate-600">
            {`Required items verified: ${String(requestSummary["verified"] ?? 0)} of ${String(
              requestSummary["required"] ?? 0,
            )}.`}
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel
          title="BEPS requests and support checklist"
          subtitle="Track the missing pathway support, audit documentation, and supporting evidence consultants need before the deliverable is truly ready."
        >
          {requestItems.data && requestItems.data.length > 0 ? (
            <div className="space-y-4">
              {requestItems.data.map((item) => {
                const statusDisplay = getRequestItemStatusDisplay(item.status);
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{item.title}</div>
                        <div className="mt-1 text-[13px] text-slate-500">
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
                          className="text-[12px] font-medium text-slate-600 underline decoration-slate-300 underline-offset-4"
                          onClick={() => hydrateEditor(item)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-[13px] text-slate-600 sm:grid-cols-2">
                      <div>{`Requested from: ${item.requestedFrom ?? "Not set"}`}</div>
                      <div>{`Assigned to: ${item.assignedTo ?? "Not set"}`}</div>
                      <div>{`Due date: ${item.dueDate ? formatDate(item.dueDate) : "Not set"}`}</div>
                      <div>{`Linked packet type: ${item.packetType ? getPacketTypeLabel(item.packetType) : "All deliverables"}`}</div>
                    </div>

                    {item.notes ? (
                      <p className="mt-3 text-[13px] text-slate-600">{item.notes}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No BEPS request items exist yet. Add the support documents and checklist items the consultant still needs for this deliverable." />
          )}
        </Panel>

        <Panel
          title={editingRequestId ? "Update request item" : "Add request item"}
          subtitle="Keep the checklist specific to the actual deliverable being prepared."
        >
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Category
              </span>
              <select
                value={category}
                onChange={(event) => {
                  const next = event.target.value as (typeof REQUEST_CATEGORIES)[number]["value"];
                  setCategory(next);
                  setTitle(
                    REQUEST_CATEGORIES.find((entry) => entry.value === next)?.label ??
                      "BEPS support item",
                  );
                }}
                className={inputClass}
              >
                {REQUEST_CATEGORIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Title
              </span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </span>
                <select value={status} onChange={(event) => setStatus(event.target.value as (typeof REQUEST_STATUSES)[number])} className={inputClass}>
                  {REQUEST_STATUSES.map((entry) => (
                    <option key={entry} value={entry}>
                      {getRequestItemStatusDisplay(entry).label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Due date
                </span>
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Requested from
                </span>
                <input value={requestedFrom} onChange={(event) => setRequestedFrom(event.target.value)} className={inputClass} />
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Assigned to
                </span>
                <input value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className={inputClass} />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className={`${inputClass} resize-y`}
              />
            </label>

            <label className="flex items-center gap-3 text-[13px] text-slate-700">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(event) => setIsRequired(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900"
              />
              This item is required before the deliverable is truly ready.
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className={btnClass}
                onClick={() =>
                  upsertMutation.mutate({
                    requestItemId: editingRequestId,
                    buildingId,
                    filingRecordId,
                    cycle,
                    filingYear: filingYear ?? undefined,
                    packetType,
                    category,
                    title,
                    status,
                    isRequired,
                    dueDate: dueDate ? new Date(dueDate).toISOString() : null,
                    assignedTo: assignedTo || null,
                    requestedFrom: requestedFrom || null,
                    notes: notes || null,
                  })
                }
                disabled={upsertMutation.isPending || title.trim().length === 0}
              >
                {upsertMutation.isPending
                  ? "Saving..."
                  : editingRequestId
                    ? "Update request item"
                    : "Add request item"}
              </button>
              {editingRequestId ? (
                <button
                  className={btnClass}
                  onClick={() => {
                    setEditingRequestId(undefined);
                    setCategory("PATHWAY_SELECTION_SUPPORT");
                    setTitle("Pathway selection support");
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
          </div>
        </Panel>
      </div>

      <Panel
        title="Recent deliverables"
        subtitle="Version history for the selected deliverable type."
      >
        {packets.data && packets.data.length > 0 ? (
          <div className="space-y-3">
            {packets.data.map((packet) => {
              const display = getPacketStatusDisplay(packet.status);
              const stageDisplay = getWorkflowStageStatusDisplay(
                packet.status === "FINALIZED"
                  ? "COMPLETE"
                  : packet.status === "STALE"
                    ? "NEEDS_ATTENTION"
                    : packet.status === "GENERATED"
                      ? "NEEDS_ATTENTION"
                      : "NOT_STARTED",
              );

              return (
                <div key={packet.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {getPacketTypeLabel(packet.packetType)}
                      </div>
                      <div className="mt-1 text-[13px] text-slate-500">
                        {`Version ${packet.version} • Generated ${formatDate(packet.generatedAt)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={display.label} tone={display.tone} />
                      <StatusBadge label={stageDisplay.label} tone={stageDisplay.tone} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No packets have been generated yet for this deliverable type." />
        )}
      </Panel>
    </div>
  );
}
