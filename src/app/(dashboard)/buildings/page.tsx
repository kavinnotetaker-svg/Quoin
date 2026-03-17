"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { BuildingTable } from "@/components/dashboard/building-table";
import { Plus } from "lucide-react";

export default function BuildingsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const buildings = trpc.building.list.useQuery({
    search: search || undefined,
    page,
    pageSize: 25,
  });

  if (buildings.isLoading) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
    );
  }

  if (buildings.error) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        Something went wrong. Try refreshing.
      </p>
    );
  }

  const { pagination } = buildings.data!;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Buildings" />
        <Link
          href="/onboarding"
          className="btn-luminous flex items-center gap-1.5 text-sm"
        >
          <Plus size={14} />
          Add building
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search buildings..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="input-recessed w-full px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-cyan-500/20 sm:w-64"
      />

      <BuildingTable buildings={buildings.data!.buildings} />

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-[13px] font-medium text-slate-500">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total}{" "}
            total)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
