"use client";

import { trpc } from "@/lib/trpc";
import { ComplianceOverviewTab } from "./compliance-overview-tab";

function defaultReportingYear() {
  return new Date().getUTCFullYear() - 1;
}

export function ComplianceTab({ buildingId }: { buildingId: string }) {
  const { data: building, isLoading } = trpc.building.get.useQuery({ id: buildingId });
  const reportingYear =
    building?.readinessSummary.evaluations.benchmark?.reportingYear ??
    defaultReportingYear();
  const verificationChecklist = trpc.benchmarking.getVerificationChecklist.useQuery(
    {
      buildingId,
      reportingYear,
    },
    {
      enabled: !!building && reportingYear != null,
      retry: false,
    },
  );

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-md">
        <div className="loading-bar h-1 w-1/3 bg-slate-300" />
      </div>
    );
  }

  if (!building) {
    return null;
  }

  return (
    <ComplianceOverviewTab
      building={building}
      verificationChecklist={verificationChecklist.data}
    />
  );
}
