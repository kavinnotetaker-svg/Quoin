"use client";

import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Panel,
  formatDate,
} from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  getReadinessStatusDisplay,
  getSyncStatusDisplay,
} from "@/components/internal/status-helpers";

export function SettingsPage() {
  const onboarding = trpc.building.onboardingStatus.useQuery();
  const rulePackages = trpc.provenance.rulePackages.useQuery({ activeOnly: true });
  const factorSets = trpc.provenance.factorSetVersions.useQuery({ activeOnly: true });
  const readiness = trpc.benchmarking.listPortfolioReadiness.useQuery({ limit: 20 });

  if (
    onboarding.isLoading ||
    rulePackages.isLoading ||
    factorSets.isLoading ||
    readiness.isLoading
  ) {
    return <LoadingState />;
  }

  if (onboarding.error || rulePackages.error || factorSets.error || readiness.error) {
    const error =
      onboarding.error ?? rulePackages.error ?? factorSets.error ?? readiness.error;
    return (
      <ErrorState
        message="Settings and governance state are unavailable right now."
        detail={error?.message}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Reference governance state, integration health, and organization setup without leaving the main workflow."
      />

      {onboarding.data ? (
        <MetricGrid
          items={[
            { label: "Organization Selected", value: onboarding.data.hasOrg ? "Yes" : "No" },
            { label: "Organization Synced", value: onboarding.data.orgSynced ? "Yes" : "No" },
            { label: "Buildings", value: onboarding.data.buildingCount },
            { label: "Onboarding Complete", value: onboarding.data.isComplete ? "Yes" : "No" },
          ]}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Active Rule Packages"
          subtitle="Governed rule packages and active versions currently loaded into the platform."
        >
          {!rulePackages.data || rulePackages.data.length === 0 ? (
            <EmptyState message="No active rule packages are available." />
          ) : (
            <div className="space-y-3">
              {rulePackages.data.map((pkg) => (
                <div key={pkg.id} className="rounded border border-zinc-200 px-3 py-3">
                  <div className="font-medium text-zinc-900">{pkg.key}</div>
                  <div className="mt-1 text-xs text-zinc-500">{pkg.name}</div>
                  <div className="mt-2 space-y-2">
                    {pkg.versions.map((version) => (
                      <div key={version.id} className="rounded bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                        <div className="font-medium text-zinc-900">
                          {version.version} • {version.status}
                        </div>
                        <div>Effective {formatDate(version.effectiveFrom)}</div>
                        <div>Source {version.sourceArtifact?.name ?? "None"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Active Factor Sets"
          subtitle="Governed factor sets and standards tables available to the compliance engines."
        >
          {!factorSets.data || factorSets.data.length === 0 ? (
            <EmptyState message="No active factor sets are available." />
          ) : (
            <div className="space-y-3">
              {factorSets.data.map((factorSet) => (
                <div key={factorSet.id} className="rounded border border-zinc-200 px-3 py-3">
                  <div className="font-medium text-zinc-900">{factorSet.key}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {factorSet.version} • {factorSet.status}
                  </div>
                  <div className="mt-2 text-xs text-zinc-600">
                    Effective {formatDate(factorSet.effectiveFrom)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Source {factorSet.sourceArtifact?.name ?? "None"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Portfolio Manager autopilot"
        subtitle="Current sync and annual benchmarking state across the portfolio."
      >
        {!readiness.data || readiness.data.length === 0 ? (
          <EmptyState message="No Portfolio Manager readiness state exists yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                  <th className="pb-2 pr-4 font-normal">Building</th>
                  <th className="pb-2 pr-4 font-normal">Reporting Year</th>
                  <th className="pb-2 pr-4 font-normal">PM sync</th>
                  <th className="pb-2 pr-4 font-normal">Benchmarking</th>
                  <th className="pb-2 font-normal">Submission record</th>
                </tr>
              </thead>
              <tbody>
                {readiness.data.map((entry) => (
                  <tr key={entry.building.id} className="border-b border-zinc-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-zinc-900">{entry.building.name}</td>
                    <td className="py-2 pr-4 text-zinc-700">{entry.reportingYear}</td>
                    <td className="py-2 pr-4 text-zinc-700">
                      <div>
                        <StatusBadge
                          label={getSyncStatusDisplay(entry.syncState?.status ?? "NOT_STARTED").label}
                          tone={getSyncStatusDisplay(entry.syncState?.status ?? "NOT_STARTED").tone}
                        />
                      </div>
                      {entry.syncState?.diagnostics?.failedStep ? (
                        <div className="text-xs text-zinc-500">
                          Phase {String(entry.syncState.diagnostics.failedStep).toLowerCase()}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-zinc-700">
                      <StatusBadge
                        label={getReadinessStatusDisplay(
                          entry.readiness &&
                            typeof entry.readiness === "object" &&
                            !Array.isArray(entry.readiness)
                            ? String((entry.readiness as Record<string, unknown>).status ?? "PENDING")
                            : "PENDING",
                        ).label}
                        tone={getReadinessStatusDisplay(
                          entry.readiness &&
                            typeof entry.readiness === "object" &&
                            !Array.isArray(entry.readiness)
                            ? String((entry.readiness as Record<string, unknown>).status ?? "PENDING")
                            : "PENDING",
                        ).tone}
                      />
                    </td>
                    <td className="py-2 text-zinc-700">
                      {entry.benchmarkSubmission?.status ?? "Not started"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
