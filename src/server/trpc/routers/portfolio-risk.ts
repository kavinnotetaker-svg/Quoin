import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getBuildingPortfolioRiskSummary,
  getPortfolioRiskTrace,
  listHighestPriorityPortfolioActions,
  listPortfolioRisk,
} from "@/server/compliance/portfolio-risk";
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

export const portfolioRiskRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        buildingId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.buildingId) {
        await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      }

      return listPortfolioRisk({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        limit: input.limit,
      });
    }),

  buildingSummary: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const summary = await getBuildingPortfolioRiskSummary({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });

      if (!summary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building risk summary not found",
        });
      }

      return summary;
    }),

  priorityActions: tenantProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listHighestPriorityPortfolioActions({
        organizationId: ctx.organizationId,
        limit: input.limit,
      });
    }),

  trace: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const trace = await getPortfolioRiskTrace({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });

      if (!trace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building risk trace not found",
        });
      }

      return trace;
    }),
});
