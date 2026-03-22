"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Edit2, Link, X } from "lucide-react";

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
    <div className="space-y-8 border-b border-zinc-200/80 pb-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="quoin-kicker">Building workbench</div>
          <h1 className="font-display text-5xl font-medium tracking-tight text-zinc-900">{name}</h1>
          <p className="max-w-3xl text-[15px] leading-7 text-zinc-600">{address}</p>
          <p className="text-[12px] uppercase tracking-[0.16em] text-zinc-500">{details}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onUpload}
            className="btn-primary text-[13px]"
          >
            Upload Utility Data
          </button>
        </div>
      </div>

      <motion.div 
        layout
        className="flex flex-col gap-3 border-t border-zinc-200 pt-4 text-[13px] lg:flex-row lg:items-center"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <Link size={14} className="text-zinc-400" />
          Portfolio Manager property
        </span>
        
        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div 
              key="editing"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={espmId}
                onChange={(event) => setEspmId(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g., 88762425"
                className="w-36 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[13px] text-zinc-900 shadow-sm transition-all focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateBuilding.mutate({
                      id: buildingId,
                      data: { espmPropertyId: espmId || null },
                    });
                  }
                  if (e.key === "Escape") {
                    setEditing(false);
                    setEspmId(espmPropertyId ?? "");
                  }
                }}
              />
              <button
                onClick={() =>
                  updateBuilding.mutate({
                    id: buildingId,
                    data: { espmPropertyId: espmId || null },
                  })
                }
                disabled={updateBuilding.isPending}
                className="flex h-7 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-50 active:scale-95"
              >
                {updateBuilding.isPending ? "Saving..." : (
                  <>
                    <Check size={12} />
                    Save
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEspmId(espmPropertyId ?? "");
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700"
              >
                <X size={14} />
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="static"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-3"
            >
              <span
                className={
                  espmPropertyId ? "font-medium text-zinc-900" : "italic text-zinc-400"
                }
              >
                {espmPropertyId ?? "Not linked"}
              </span>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition-all hover:text-zinc-900 hover:decoration-zinc-900"
              >
                <Edit2 size={12} className="no-underline" />
                {espmPropertyId ? "Edit" : "Link"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
