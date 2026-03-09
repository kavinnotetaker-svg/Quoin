import { inngest } from "../client";
import { getTenantClient, prisma } from "@/server/lib/db";
import { calculateMaxPenalty } from "@/server/pipelines/pathway-analysis/penalty-calculator";
import { pathwayAnalyzeEvent, pathwayAnalyzeEventSchema } from "../events";

/**
 * Pathway Analysis: Stale Sweep
 * Runs weekly to find buildings with no ingestion for >30 days that are AT_RISK or NON_COMPLIANT,
 * and recalculates their penalty exposure based on the latest available data.
 */
export const pathwayAnalysisSweepJob = inngest.createFunction(
    {
        id: "pathway-analysis-stale-sweep",
        retries: 3,
        onFailure: async ({ error }) => {
            console.error(`[DLQ] Pathway Analysis Sweep failed completely`, error);
        }
    },
    { cron: "0 0 * * 0" }, // Every Sunday at midnight
    async ({ step }) => {
        // 1. Identify stale buildings
        const staleBuildings = await step.run("find-stale-buildings", async () => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Using the global prisma to cross-tenant query for the sweep since it runs system-wide
            const snapshots = await prisma.complianceSnapshot.findMany({
                where: {
                    snapshotDate: { lte: thirtyDaysAgo },
                    complianceStatus: {
                        in: ["AT_RISK", "NON_COMPLIANT"]
                    }
                },
                distinct: ['buildingId'],
                orderBy: { snapshotDate: 'desc' }
            });
            return snapshots.map(s => ({
                buildingId: s.buildingId,
                organizationId: s.organizationId
            }));
        });

        if (staleBuildings.length === 0) {
            return { msg: "No stale buildings found" };
        }

        const events = staleBuildings.map((building) =>
            pathwayAnalyzeEvent({
                buildingId: building.buildingId,
                organizationId: building.organizationId,
            }),
        );

        // 2. Fan-out pathway analysis to individual jobs
        await step.sendEvent("trigger-stale-analysis", events);

        return { triggered: events.length };
    }
);

/**
 * Pathway Analysis: Evaluates penalty exposure and pathways.
 */
export const pathwayAnalysisJob = inngest.createFunction(
    {
        id: "pathway-analysis-process",
        retries: 3,
        onFailure: async ({ error }) => {
            console.error(`[DLQ] Pathway Analysis failed`, error);
        }
    },
    { event: "pathway/analyze" },
    async ({ event, step }) => {
        const { buildingId, organizationId } = pathwayAnalyzeEventSchema.parse(event.data);
        const tenantDb = getTenantClient(organizationId);

        const result = await step.run("recalculate-penalties", async () => {
            const building = await tenantDb.building.findFirst({
                where: {
                    id: buildingId,
                    archivedAt: null,
                },
            });
            if (!building) throw new Error("Building not found");

            const snapshot = await tenantDb.complianceSnapshot.findFirst({
                where: { buildingId },
                orderBy: { snapshotDate: "desc" }
            });

            if (!snapshot || !snapshot.siteEui) return { calculated: false };

            // Very simple calculation for demonstration
            const exposure = calculateMaxPenalty(building.grossSquareFeet);

            await tenantDb.building.update({
                where: { id: buildingId },
                data: { maxPenaltyExposure: exposure }
            });

            return { calculated: true, exposure };
        });

        return result;
    }
);
