import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getRetrofitCandidateRankingDetail,
  listRetrofitCandidates,
  rankRetrofitCandidatesAcrossPortfolio,
  rankRetrofitCandidatesForBuilding,
  upsertRetrofitCandidateRecord,
} from "@/server/compliance/retrofit-optimization";
import { router, tenantProcedure } from "../init";

async function ensureTenantBuilding(
  tenantDb: {
    building: {
      findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
    };
  },
  buildingId: string,
) {
  const building = await tenantDb.building.findUnique({
    where: { id: buildingId },
  });

  if (!building) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Building not found",
    });
  }
}

export const retrofitRouter = router({
  upsertCandidate: tenantProcedure
    .input(
      z.object({
        candidateId: z.string().optional(),
        buildingId: z.string(),
        projectType: z.enum([
          "LED_LIGHTING_RETROFIT",
          "RETRO_COMMISSIONING",
          "BMS_UPGRADE",
          "VARIABLE_FREQUENCY_DRIVES",
          "LOW_FLOW_FIXTURES",
          "HEAT_PUMP_CONVERSION",
          "ENVELOPE_AIR_SEALING",
          "WINDOW_REPLACEMENT",
          "ROOF_INSULATION_UPGRADE",
          "ROOFTOP_SOLAR_PV",
          "CUSTOM",
        ]),
        candidateSource: z.enum(["MANUAL", "ECM_LIBRARY", "ANOMALY_DERIVED"]).optional(),
        status: z.enum(["DRAFT", "ACTIVE", "DEFERRED", "COMPLETED", "ARCHIVED"]).optional(),
        name: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        complianceCycle: z.enum(["CYCLE_1", "CYCLE_2", "CYCLE_3"]).optional().nullable(),
        targetFilingYear: z.number().int().min(2024).max(2100).optional().nullable(),
        estimatedCapex: z.number().min(0).optional().nullable(),
        estimatedIncentiveAmount: z.number().min(0).optional().nullable(),
        estimatedAnnualSavingsKbtu: z.number().min(0).optional().nullable(),
        estimatedAnnualSavingsUsd: z.number().min(0).optional().nullable(),
        estimatedSiteEuiReduction: z.number().min(0).optional().nullable(),
        estimatedSourceEuiReduction: z.number().min(0).optional().nullable(),
        estimatedBepsImprovementPct: z.number().min(0).max(100).optional().nullable(),
        estimatedImplementationMonths: z.number().int().min(0).optional().nullable(),
        confidenceBand: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
        sourceArtifactId: z.string().optional().nullable(),
        sourceMetadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return upsertRetrofitCandidateRecord({
        organizationId: ctx.organizationId,
        candidateId: input.candidateId,
        buildingId: input.buildingId,
        projectType: input.projectType,
        candidateSource: input.candidateSource,
        status: input.status,
        name: input.name,
        description: input.description,
        complianceCycle: input.complianceCycle,
        targetFilingYear: input.targetFilingYear,
        estimatedCapex: input.estimatedCapex,
        estimatedIncentiveAmount: input.estimatedIncentiveAmount,
        estimatedAnnualSavingsKbtu: input.estimatedAnnualSavingsKbtu,
        estimatedAnnualSavingsUsd: input.estimatedAnnualSavingsUsd,
        estimatedSiteEuiReduction: input.estimatedSiteEuiReduction,
        estimatedSourceEuiReduction: input.estimatedSourceEuiReduction,
        estimatedBepsImprovementPct: input.estimatedBepsImprovementPct,
        estimatedImplementationMonths: input.estimatedImplementationMonths,
        confidenceBand: input.confidenceBand,
        sourceArtifactId: input.sourceArtifactId,
        sourceMetadata: input.sourceMetadata,
      });
    }),

  listCandidates: tenantProcedure
    .input(
      z.object({
        buildingId: z.string().optional(),
        includeArchived: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.buildingId) {
        await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      }

      return listRetrofitCandidates({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        includeArchived: input.includeArchived ?? false,
        limit: input.limit,
      });
    }),

  rankBuilding: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        includeArchived: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return rankRetrofitCandidatesForBuilding({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        includeArchived: input.includeArchived ?? false,
        limit: input.limit,
      });
    }),

  rankPortfolio: tenantProcedure
    .input(
      z.object({
        buildingId: z.string().optional(),
        includeArchived: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.buildingId) {
        await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      }

      return rankRetrofitCandidatesAcrossPortfolio({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        includeArchived: input.includeArchived ?? false,
        limit: input.limit,
      });
    }),

  candidateRationale: tenantProcedure
    .input(
      z.object({
        candidateId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const detail = await getRetrofitCandidateRankingDetail({
        organizationId: ctx.organizationId,
        candidateId: input.candidateId,
      });

      if (!detail) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Retrofit candidate not found",
        });
      }

      return detail;
    }),
});
