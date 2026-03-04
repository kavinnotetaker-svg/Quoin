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
      <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
    );
  }

  if (buildings.error) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
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
          className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
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
        className="w-full rounded border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 sm:w-64"
      />

      <BuildingTable buildings={buildings.data!.buildings} />

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total}{" "}
            total)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
