/**
 * Deprecated legacy capital-structuring support.
 * Retained for historical/internal reference only and not part of the active Quoin product surface.
 */
import { createWorker } from "@/server/lib/queue";
import { getTenantClient } from "@/server/lib/db";
import { getLatestComplianceSnapshot } from "@/server/lib/compliance-snapshots";
import { scoreECMs, type BuildingProfile } from "@/server/pipelines/pathway-analysis/ecm-scorer";
import { screenCLEER } from "./eligibility/cleer";
import { screenCPACE } from "./eligibility/cpace";
import { screenAHRA } from "./eligibility/ahra";
import { assembleCapitalStack, type CapitalStack } from "./logic";
import type { BuildingCapitalProfile } from "./eligibility/types";
import type { EligibilityResult } from "./eligibility/types";

const CAPITAL_QUEUE = "capital-structuring";

export interface CapitalStructuringJobData {
  buildingId: string;
  organizationId: string;
  triggerType: "MANUAL" | "ON_PATHWAY_COMPLETE";
}

/**
 * Start the capital structuring BullMQ worker.
 *
 * Flow:
 * 1. Load building + latest snapshot (deterministic)
 * 2. Run ECM scoring (deterministic)
 * 3. Screen funding programs (deterministic)
 * 4. Assemble capital stack (deterministic)
 * 5. Generate executive summary narrative (LLM — Sonnet)
 * 6. Persist PipelineRun with full results
 */
export function startCapitalStructuringWorker() {
  const worker = createWorker(
    CAPITAL_QUEUE,
    async (job) => {
      const data = job.data as CapitalStructuringJobData;
      const startedAt = new Date();
      console.log(
        `[Capital Structuring] Processing job ${job.id} for building ${data.buildingId}`,
      );

      const tenantDb = getTenantClient(data.organizationId);

      const building = await tenantDb.building.findUnique({
        where: { id: data.buildingId },
      });
      if (!building) {
        throw new Error(`Building ${data.buildingId} not found`);
      }

      const latestSnapshot = await getLatestComplianceSnapshot(tenantDb, {
        buildingId: data.buildingId,
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

      // Step 4: LLM narrative (Sonnet) — degrade gracefully if unavailable
      let narrative: string | null = null;
      let llmModel: string | null = null;
      let llmTokensUsed: number | null = null;
      let llmCostCents: number | null = null;
      let llmCalls = 0;

      try {
        const result = await generateNarrative(
          building.name,
          building.address,
          ecmResult,
          eligibility,
          stack,
        );
        narrative = result.narrative;
        llmModel = result.model;
        llmTokensUsed = result.tokensUsed;
        llmCostCents = result.costCents;
        llmCalls = 1;
      } catch (err) {
        console.warn(
          `[Capital Structuring] LLM narrative failed, continuing without:`,
          err instanceof Error ? err.message : err,
        );
      }

      // Step 5: Persist pipeline run
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
          llmCalls,
          llmModel,
          llmTokensUsed,
          llmCostCents,
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
            narrative,
          },
        },
      });

      console.log(
        `[Capital Structuring] Building ${data.buildingId}: ` +
        `${ecmResult.ecms.length} ECMs, ${stack.layers.length} stack layers, ` +
        `narrative: ${narrative ? "yes" : "skipped"}`,
      );

      return {
        ecmCount: ecmResult.ecms.length,
        totalCost: ecmResult.totalEstimatedCost,
        stackLayers: stack.layers.length,
        hasNarrative: narrative !== null,
      };
    },
    2, // concurrency per CLAUDE.md queue topology
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[Capital Structuring] Job ${job?.id} permanently failed:`,
      err.message,
    );
  });

  worker.on("error", (err) => {
    console.error("[Capital Structuring] Worker error:", err);
  });

  return worker;
}

/**
 * Generate executive summary narrative using Claude Sonnet.
 * Returns null narrative if Anthropic SDK is not installed.
 */
async function generateNarrative(
  buildingName: string,
  address: string,
  ecmResult: { pathway: string; ecms: Array<{ name: string; estimatedCost: number; estimatedSavingsPct: number }>; totalEstimatedCost: number; totalEstimatedSavingsPct: number; projectedSiteEui: number },
  eligibility: EligibilityResult[],
  stack: CapitalStack,
): Promise<{
  narrative: string;
  model: string;
  tokensUsed: number;
  costCents: number;
}> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const model = "claude-sonnet-4-5-20250929";
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

  // Raw fetch to Anthropic Messages API — no SDK dependency needed
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const textBlock = data.content.find((b: { type: string }) => b.type === "text");
  const narrative = textBlock?.text ?? "";
  const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  const costCents = Math.round(tokensUsed * 0.003);

  return { narrative, model, tokensUsed, costCents };
}
