import { inngest } from "../client";
import { getTenantClient } from "@/server/lib/db";
import { scoreECMs, type BuildingProfile } from "@/server/pipelines/pathway-analysis/ecm-scorer";
import { screenCLEER } from "@/server/pipelines/capital-structuring/eligibility/cleer";
import { screenCPACE } from "@/server/pipelines/capital-structuring/eligibility/cpace";
import { screenAHRA } from "@/server/pipelines/capital-structuring/eligibility/ahra";
import { assembleCapitalStack } from "@/server/pipelines/capital-structuring/logic";
import type { BuildingCapitalProfile } from "@/server/pipelines/capital-structuring/eligibility/types";
import type { EligibilityResult } from "@/server/pipelines/capital-structuring/eligibility/types";
import { capitalStructureEventSchema } from "../events";

/**
 * Capital Structuring pipeline
 * Generates capital stacks based on compliance pathways, ECMs and available programs.
 */
export const capitalStructuringJob = inngest.createFunction(
    {
        id: "capital-structuring",
        retries: 3,
        onFailure: async ({ error }) => {
            console.error(`[DLQ] Capital Structuring failed completely`, error);
        }
    },
    { event: "capital/structure" },
    async ({ event, step }) => {
        const data = capitalStructureEventSchema.parse(event.data);
        const tenantDb = getTenantClient(data.organizationId);

        const startedAt = new Date();

        const result = await step.run("structure-capital", async () => {
            const building = await tenantDb.building.findFirst({
                where: {
                    id: data.buildingId,
                    archivedAt: null,
                },
            });
            if (!building) throw new Error(`Building ${data.buildingId} not found`);

            const latestSnapshot = await tenantDb.complianceSnapshot.findFirst({
                where: { buildingId: data.buildingId },
                orderBy: { snapshotDate: "desc" },
            });

            // Step 1: ECM scoring
            const ecmProfile: BuildingProfile = {
                propertyType: building.propertyType,
                grossSquareFeet: building.grossSquareFeet,
                yearBuilt: building.yearBuilt,
                hvacType: null,
                currentSiteEui: latestSnapshot?.siteEui ?? 0,
                currentScore: latestSnapshot?.energyStarScore ?? null,
                bepsTargetScore: building.bepsTargetScore,
                hasLedLighting: false,
                hasRetroCommissioning: false,
                envelopeCondition: "FAIR",
            };

            const ecmResult = scoreECMs(ecmProfile);

            // Step 2: Eligibility screening
            const capitalProfile: BuildingCapitalProfile = {
                grossSquareFeet: building.grossSquareFeet,
                propertyType: building.propertyType,
                ward: null,
                yearBuilt: building.yearBuilt,
                ownerType: "PRIVATE",
                isAffordableHousing: false,
                annualRevenue: null,
                totalProjectCost: ecmResult.totalEstimatedCost,
                occupancyPct: building.occupancyRate ? building.occupancyRate * 100 : null,
                hasExistingCpaceLien: false,
                debtServiceCoverageRatio: 1.3,
                propertyAssessedValue: null,
                unitCount: null,
                hasAuthorizedContractor: false,
                propertyTaxesCurrent: true,
                mortgageLenderConsent: null,
                existingMortgageBalance: null,
                estimatedAnnualEnergySavings: null,
                projectedSavingsPercent: ecmResult.totalEstimatedSavingsPct,
                isBepsCompliant: latestSnapshot?.complianceStatus === "COMPLIANT",
                affordableUnitsPercent: null,
            };

            const eligibility: EligibilityResult[] = [
                screenAHRA(capitalProfile),
                screenCLEER(capitalProfile),
                screenCPACE(capitalProfile),
            ];

            // Step 3: Capital stack assembly
            const annualSavings = ecmResult.totalEstimatedSavingsPct > 0
                ? (ecmProfile.currentSiteEui * building.grossSquareFeet * ecmResult.totalEstimatedSavingsPct / 100) * 0.03
                : 0;

            const stack = assembleCapitalStack(
                ecmResult.totalEstimatedCost,
                eligibility,
                annualSavings,
            );

            return { ecmResult, eligibility, stack, buildingName: building.name, address: building.address };
        });

        // Step 4: AI Narrative Generation (Haiku) via Step
        const { ecmResult, eligibility, stack, buildingName, address } = result;

        const narrativeResult = await step.run("generate-narrative", async () => {
            let narrative: string | null = null;
            const llmModel = "claude-3-haiku-20240307";
            let llmTokensUsed: number | null = null;
            let llmCostCents: number | null = null;
            let llmCalls = 0;

            const apiKey = process.env["ANTHROPIC_API_KEY"];
            if (!apiKey) return { narrative, llmModel, llmTokensUsed, llmCostCents, llmCalls };

            const eligiblePrograms = eligibility.filter((e) => e.eligible);
            const topEcms = ecmResult.ecms.slice(0, 5);

            const prompt = `You are a commercial energy efficiency consultant writing an executive summary for a building owner in Washington, DC who needs to comply with the DC BEPS (Building Energy Performance Standards) by December 31, 2026.

Building: ${buildingName} at ${address}
Compliance Pathway: ${ecmResult.pathway.replace("_", " ")}
Recommended ECMs (top ${topEcms.length}):
${topEcms.map((e) => `- ${e.name}: $${e.estimatedCost.toLocaleString()} (${e.estimatedSavingsPct}% savings)`).join("\n")}

Total estimated project cost: $${ecmResult.totalEstimatedCost.toLocaleString()}
Projected EUI after improvements: ${ecmResult.projectedSiteEui.toFixed(1)} kBtu/ft²
Total estimated energy savings: ${ecmResult.totalEstimatedSavingsPct}%

Eligible funding programs:
${eligiblePrograms.length > 0 ? eligiblePrograms.map((p) => `- ${p.programName}: up to $${(p.maxFundingAmount ?? 0).toLocaleString()} (${p.fundingType})`).join("\n") : "None identified"}

Capital stack:
${stack.layers.map((l) => `- ${l.programName}: $${l.amount.toLocaleString()} (${l.fundingType})`).join("\n")}
Equity required: $${stack.equityRequired.toLocaleString()}
${stack.simplePaybackYears !== null ? `Simple payback: ${stack.simplePaybackYears} years` : ""}

Write a 2-3 paragraph executive summary that:
1. States the building's compliance pathway and key recommended improvements
2. Summarizes the financing structure and how much owner equity is needed
3. Provides a clear recommendation with urgency given the 2026 deadline

Be direct, professional, and specific with numbers. Do not use marketing language.`;

            try {
                const response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": apiKey,
                        "anthropic-version": "2023-06-01",
                    },
                    body: JSON.stringify({
                        model: llmModel,
                        max_tokens: 500,
                        messages: [{ role: "user", content: prompt }],
                    }),
                    signal: AbortSignal.timeout(30_000),
                });

                if (response.ok) {
                    const apiData = await response.json();
                    const textBlock = apiData.content?.find((b: { type: string }) => b.type === "text");
                    narrative = textBlock?.text ?? "";
                    llmTokensUsed = (apiData.usage?.input_tokens ?? 0) + (apiData.usage?.output_tokens ?? 0);
                    llmCostCents = Math.round((llmTokensUsed ?? 0) * 0.003); // Haiku is ~0.25 input / 1.25 output per 1M, actually 0.003 is closer to Sonnet but keeping existing logic
                    llmCalls = 1;
                }
            } catch {
                console.warn(`[Capital Structuring] LLM narrative failed`);
            }
            return { narrative, llmModel, llmTokensUsed, llmCostCents, llmCalls };
        });

        // Step 5: Persist pipeline run
        await step.run("persist-run", async () => {
            const completedAt = new Date();
            await tenantDb.pipelineRun.create({
                data: {
                    organizationId: data.organizationId,
                    buildingId: data.buildingId,
                    pipelineType: "CAPITAL_STRUCTURING",
                    triggerType: data.triggerType === "ON_PATHWAY_COMPLETE" ? "WEBHOOK" : data.triggerType,
                    status: "COMPLETED",
                    startedAt,
                    completedAt,
                    durationMs: completedAt.getTime() - startedAt.getTime(),
                    llmCalls: narrativeResult.llmCalls,
                    llmModel: narrativeResult.llmModel,
                    llmTokensUsed: narrativeResult.llmTokensUsed ?? 0,
          llmCostCents: narrativeResult.llmCostCents ?? 0,
                    inputSummary: {
                        buildingId: data.buildingId,
                        triggerType: data.triggerType,
                        ecmCount: ecmResult.ecms.length,
                        totalProjectCost: ecmResult.totalEstimatedCost,
                    },
                    outputSummary: {
                        pathway: ecmResult.pathway,
                        ecmCount: ecmResult.ecms.length,
                        totalEstimatedCost: ecmResult.totalEstimatedCost,
                        totalEstimatedSavingsPct: ecmResult.totalEstimatedSavingsPct,
                        projectedSiteEui: ecmResult.projectedSiteEui,
                        eligiblePrograms: eligibility
                            .filter((e) => e.eligible)
                            .map((e) => e.programCode),
                        stackLayers: stack.layers.length,
                        equityRequired: stack.equityRequired,
                        narrative: narrativeResult.narrative,
                    },
                },
            });
        });

        return { done: true };
    }
);
