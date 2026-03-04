"use client";

import { trpc } from "@/lib/trpc";
import { StatusDot } from "@/components/dashboard/status-dot";

const TRIGGER_LABELS: Record<string, string> = {
  PIPELINE_RUN: "Pipeline",
  ESPM_SYNC: "ESPM Sync",
  MANUAL: "Manual",
  SCORE_CHANGE: "Score Change",
};

export function ComplianceTab({ buildingId }: { buildingId: string }) {
  const { data, isLoading } = trpc.building.complianceHistory.useQuery({
    buildingId,
    limit: 20,
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-gray-300" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        No compliance snapshots yet. Upload data to generate one.
      </p>
    );
  }

  return (
    <div className="relative pl-5">
      {/* Timeline line */}
      <div className="absolute bottom-0 left-[5px] top-0 w-px bg-gray-200" />

      <div className="space-y-4">
        {data.map((snap) => {
          const date = new Date(snap.snapshotDate);
          return (
            <div key={snap.id} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300" />

              <div className="text-[13px]">
                <span className="text-gray-500">
                  {date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span className="mx-2 text-gray-300">—</span>
                <span className="text-gray-700">
                  Score: {snap.energyStarScore ?? "—"}
                </span>
                {snap.siteEui != null && (
                  <>
                    <span className="mx-1.5 text-gray-300">|</span>
                    <span className="text-gray-700">
                      Site EUI: {snap.siteEui.toFixed(1)}
                    </span>
                  </>
                )}
                <span className="mx-1.5 text-gray-300">|</span>
                <StatusDot status={snap.complianceStatus} />
                <span className="mx-1.5 text-gray-300">|</span>
                <span className="text-gray-400">
                  {TRIGGER_LABELS[snap.triggerType] ?? snap.triggerType}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
