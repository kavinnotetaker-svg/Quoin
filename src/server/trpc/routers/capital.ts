import { z } from "zod";
import { tenantProcedure, router } from "../init";
import { TRPCError } from "@trpc/server";
import { scoreECMs, type BuildingProfile } from "@/server/pipelines/pathway-analysis/ecm-scorer";
import { screenCLEER } from "@/server/pipelines/capital-structuring/eligibility/cleer";
import { screenCPACE } from "@/server/pipelines/capital-structuring/eligibility/cpace";
import { screenAHRA } from "@/server/pipelines/capital-structuring/eligibility/ahra";
import { assembleCapitalStack } from "@/server/pipelines/capital-structuring/logic";
import type { BuildingCapitalProfile } from "@/server/pipelines/capital-structuring/eligibility/types";

const capitalAnalysisOutput = z.object({
  buildingId: z.string(),
  pathway: z.string(),
  ecms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      priority: z.string(),
      relevanceScore: z.number(),
      estimatedCost: z.number(),
      estimatedSavingsPct: z.number(),
      simplePaybackYears: z.number(),
      reasons: z.array(z.string()),
    }),
  ),
  totalEstimatedCost: z.number(),
  totalEstimatedSavingsPct: z.number(),
  projectedSiteEui: z.number(),
  eligibility: z.array(
    z.object({
      programCode: z.string(),
      programName: z.string(),
      eligible: z.boolean(),
      fundingType: z.string(),
      maxFundingAmount: z.number().nullable(),
      interestRate: z.number().nullable(),
      termYears: z.number().nullable(),
      reasons: z.array(z.string()),
      disqualifiers: z.array(z.string()),
    }),
  ),
  capitalStack: z.object({
    layers: z.array(
      z.object({
        programCode: z.string(),
        programName: z.string(),
        fundingType: z.string(),
        amount: z.number(),
        interestRate: z.number().nullable(),
        termYears: z.number().nullable(),
        annualPayment: z.number(),
      }),
    ),
    totalProjectCost: z.number(),
    totalFunded: z.number(),
    equityRequired: z.number(),
    totalAnnualPayment: z.number(),
    simplePaybackYears: z.number().nullable(),
    blendedRate: z.number().nullable(),
  }),
  narrativeSummary: z.string().nullable(),
});

export const capitalRouter = router({
  /**
   * Run deterministic capital analysis for a building.
   * Returns ECMs, eligibility results, and assembled capital stack.
   * No LLM calls — narrative comes from worker pipeline.
   */
  getAnalysis: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .output(capitalAnalysisOutput)
    .query(async ({ ctx, input }) => {
      const building = await ctx.tenantDb.building.findUnique({
        where: { id: input.buildingId },
      });
      if (!building) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Building not found" });
      }

      const latestSnapshot = await ctx.tenantDb.complianceSnapshot.findFirst({
        where: { buildingId: input.buildingId },
        orderBy: { snapshotDate: "desc" },
      });

      // Check for existing capital pipeline run with narrative
      const capitalRun = await ctx.tenantDb.pipelineRun.findFirst({
        where: {
          buildingId: input.buildingId,
          pipelineType: "CAPITAL_STRUCTURING",
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
      });

      const narrativeSummary =
        (capitalRun?.outputSummary as Record<string, unknown> | null)?.narrative as string | null ?? null;

      // Build ECM profile
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

      // Build capital profile
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

      const eligibility = [
        screenAHRA(capitalProfile),
        screenCLEER(capitalProfile),
        screenCPACE(capitalProfile),
      ];

      const annualSavings = ecmResult.totalEstimatedSavingsPct > 0
        ? (ecmProfile.currentSiteEui * building.grossSquareFeet * ecmResult.totalEstimatedSavingsPct / 100) * 0.03
        : 0;

      const stack = assembleCapitalStack(
        ecmResult.totalEstimatedCost,
        eligibility,
        annualSavings,
      );

      return {
        buildingId: building.id,
        pathway: ecmResult.pathway,
        ecms: ecmResult.ecms.map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          priority: e.priority,
          relevanceScore: e.relevanceScore,
          estimatedCost: e.estimatedCost,
          estimatedSavingsPct: e.estimatedSavingsPct,
          simplePaybackYears: e.simplePaybackYears,
          reasons: e.reasons,
        })),
        totalEstimatedCost: ecmResult.totalEstimatedCost,
        totalEstimatedSavingsPct: ecmResult.totalEstimatedSavingsPct,
        projectedSiteEui: ecmResult.projectedSiteEui,
        eligibility: eligibility.map((e) => ({
          programCode: e.programCode,
          programName: e.programName,
          eligible: e.eligible,
          fundingType: e.fundingType,
          maxFundingAmount: e.maxFundingAmount,
          interestRate: e.interestRate,
          termYears: e.termYears,
          reasons: e.reasons,
          disqualifiers: e.disqualifiers,
        })),
        capitalStack: stack,
        narrativeSummary,
      };
    }),
});
