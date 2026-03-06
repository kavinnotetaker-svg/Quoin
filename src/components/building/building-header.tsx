"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [espmId, setEspmId] = useState(espmPropertyId ?? "");
  const utils = trpc.useUtils();
  const router = useRouter();

  const updateBuilding = trpc.building.update.useMutation({
    onSuccess: () => {
      utils.building.get.invalidate({ id: buildingId });
      setEditing(false);
    },
  });

  const deleteBuilding = trpc.building.delete.useMutation({
    onSuccess: () => {
      router.push("/dashboard");
    },
    onError: (err) => {
      console.error("[Delete] Failed:", err);
      alert("Delete failed: " + err.message);
      setConfirmDelete(false);
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
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-medium text-gray-900">{name}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{address}</p>
          <p className="mt-0.5 text-xs text-gray-400">{details}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onUpload}
            className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700 hover:bg-gray-50"
          >
            Upload Data
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => deleteBuilding.mutate({ id: buildingId })}
                disabled={deleteBuilding.isPending}
                className="rounded bg-red-600 px-3 py-1.5 text-[13px] text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBuilding.isPending ? "Deleting…" : "Confirm"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1.5 text-[13px] text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded border border-red-200 px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ESPM Link */}
      <div className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[13px]">
        <span className="font-medium text-gray-600">ESPM Property ID:</span>
        {editing ? (
          <>
            <input
              type="text"
              inputMode="numeric"
              value={espmId}
              onChange={(e) => setEspmId(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g., 88762425"
              className="w-32 rounded border border-gray-300 px-2 py-0.5 text-[13px] focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
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
              className="rounded bg-gray-900 px-2 py-0.5 text-xs text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {updateBuilding.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEspmId(espmPropertyId ?? "");
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className={espmPropertyId ? "text-gray-900" : "text-gray-400 italic"}>
              {espmPropertyId ?? "Not linked"}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {espmPropertyId ? "Edit" : "Link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
