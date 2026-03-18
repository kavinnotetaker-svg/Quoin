"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

const PROPERTY_LABELS: Record<string, string> = {
  OFFICE: "Office",
  MULTIFAMILY: "Multifamily",
  MIXED_USE: "Mixed Use",
  OTHER: "Other",
};

interface BuildingHeaderProps {
  buildingId: string;
  name: string;
  address: string;
  propertyType: string;
  grossSquareFeet: number;
  yearBuilt: number | null;
  espmPropertyId: string | null;
  onUpload: () => void;
}

export function BuildingHeader({
  buildingId,
  name,
  address,
  propertyType,
  grossSquareFeet,
  yearBuilt,
  espmPropertyId,
  onUpload,
}: BuildingHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [espmId, setEspmId] = useState(espmPropertyId ?? "");
  const utils = trpc.useUtils();

  const updateBuilding = trpc.building.update.useMutation({
    onSuccess: () => {
      utils.building.get.invalidate({ id: buildingId });
      setEditing(false);
    },
  });

  const details = [
    PROPERTY_LABELS[propertyType] ?? propertyType,
    `${grossSquareFeet.toLocaleString()} SF`,
    yearBuilt ? `Built ${yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{name}</h1>
          <p className="mt-1 text-[15px] font-medium text-slate-600">{address}</p>
          <p className="mt-1 text-[13px] text-slate-500">{details}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onUpload}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Upload Utility Data
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-[13px]">
        <span className="font-semibold text-slate-700">Portfolio Manager Property:</span>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={espmId}
              onChange={(event) => setEspmId(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g., 88762425"
              className="w-36 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[13px] text-slate-900 shadow-sm transition-all focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              autoFocus
            />
            <button
              onClick={() =>
                updateBuilding.mutate({
                  id: buildingId,
                  data: { espmPropertyId: espmId || null },
                })
              }
              disabled={updateBuilding.isPending}
              className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              {updateBuilding.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEspmId(espmPropertyId ?? "");
              }}
              className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span
              className={
                espmPropertyId ? "font-medium text-slate-900" : "italic text-slate-400"
              }
            >
              {espmPropertyId ?? "Not linked"}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-900"
            >
              {espmPropertyId ? "Edit" : "Link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
