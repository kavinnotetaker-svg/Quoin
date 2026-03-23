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
    .join(" · ");

  return (
    // Stitch: building header is a full-bleed editorial canvas
    <div
      className="space-y-6 pb-8"
      style={{ borderBottom: "0.5px solid rgba(169,180,185,0.3)" }}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          {/* Coordinate kicker */}
          <div
            className="font-sans text-[10px] font-medium uppercase tracking-[0.2em]"
            style={{ color: "#717c82" }}
          >
            COMP_ID: {buildingId.substring(0, 8)} · Document Active
          </div>

          {/* Building name: Space Grotesk display */}
          <h1
            className="font-display font-bold tracking-tight leading-tight"
            style={{ fontSize: "2.8rem", color: "#2a3439" }}
          >
            {name}
          </h1>

          {/* Address */}
          <div
            className="font-sans text-sm font-medium tracking-[0.08em] uppercase"
            style={{ color: "#566166" }}
          >
            {address}
          </div>

          {/* Details */}
          <div
            className="font-sans text-[11px] tracking-wider uppercase"
            style={{ color: "#a9b4b9" }}
          >
            {details}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-3">
          <button
            onClick={onUpload}
            className="font-sans text-[11px] font-semibold uppercase tracking-widest px-5 py-2.5 transition-colors duration-150"
            style={{
              backgroundColor: "#545f73",
              color: "#f6f7ff",
              borderRadius: 0,
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor = "#485367")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor = "#545f73")
            }
          >
            Append Evidence
          </button>
        </div>
      </div>

      {/* Portfolio Manager Row */}
      <motion.div
        layout
        className="flex flex-col gap-3 pt-4 text-sm lg:flex-row lg:items-center"
        style={{ borderTop: "0.5px solid rgba(169,180,185,0.3)" }}
      >
        <span
          className="flex items-center gap-2 font-sans text-[11px] font-medium uppercase tracking-[0.15em]"
          style={{ color: "#566166" }}
        >
          <Link size={12} style={{ color: "#a9b4b9" }} />
          Portfolio Manager Property
        </span>

        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div
              key="editing"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={espmId}
                onChange={(event) =>
                  setEspmId(event.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="e.g., 88762425"
                className="font-sans text-sm text-[#2a3439] placeholder:text-[#a9b4b9]"
                style={{
                  width: "140px",
                  border: "none",
                  borderBottom: "2px solid #545f73",
                  borderRadius: 0,
                  background: "transparent",
                  outline: "none",
                  padding: "2px 0",
                }}
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
                className="flex items-center gap-1.5 px-3 py-1 font-sans text-xs font-semibold uppercase tracking-widest transition-colors disabled:opacity-40"
                style={{
                  backgroundColor: "#545f73",
                  color: "#f6f7ff",
                  borderRadius: 0,
                }}
              >
                {updateBuilding.isPending ? "Saving…" : (
                  <>
                    <Check size={11} />
                    Save
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEspmId(espmPropertyId ?? "");
                }}
                className="flex h-7 w-7 items-center justify-center transition-colors"
                style={{ color: "#a9b4b9", borderRadius: 0 }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "#2a3439")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "#a9b4b9")
                }
              >
                <X size={14} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="static"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="flex items-center gap-3"
            >
              <span
                className="font-sans text-sm"
                style={{
                  color: espmPropertyId ? "#2a3439" : "#a9b4b9",
                  fontStyle: espmPropertyId ? "normal" : "italic",
                }}
              >
                {espmPropertyId ?? "Not linked"}
              </span>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 font-sans text-xs font-medium transition-all"
                style={{
                  color: "#566166",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(169,180,185,0.5)",
                  textUnderlineOffset: "3px",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#2a3439";
                  (e.currentTarget as HTMLElement).style.textDecorationColor = "#545f73";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#566166";
                  (e.currentTarget as HTMLElement).style.textDecorationColor = "rgba(169,180,185,0.5)";
                }}
              >
                <Edit2 size={11} />
                {espmPropertyId ? "Edit" : "Link"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
