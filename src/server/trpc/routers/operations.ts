import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getOperationalAnomalyDetail,
  listOperationalAnomalies,
  refreshOperationalAnomaliesForBuilding,
  updateOperationalAnomalyStatus,
} from "@/server/compliance/operations-anomalies";
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

export const operationsRouter = router({
  refreshAnomalies: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        lookbackMonths: z.number().int().min(6).max(36).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return refreshOperationalAnomaliesForBuilding({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        lookbackMonths: input.lookbackMonths,
      });
    }),

  listBuildingAnomalies: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        includeDismissed: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return listOperationalAnomalies({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        includeDismissed: input.includeDismissed ?? false,
        limit: input.limit,
      });
    }),

  listPortfolioAnomalies: tenantProcedure
    .input(
      z.object({
        includeDismissed: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) =>
      listOperationalAnomalies({
        organizationId: ctx.organizationId,
        includeDismissed: input.includeDismissed ?? false,
        limit: input.limit,
      }),
    ),

  detail: tenantProcedure
    .input(
      z.object({
        anomalyId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const anomaly = await getOperationalAnomalyDetail({
        organizationId: ctx.organizationId,
        anomalyId: input.anomalyId,
      });

      if (!anomaly) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Operational anomaly not found",
        });
      }

      return anomaly;
    }),

  acknowledge: tenantProcedure
    .input(
      z.object({
        anomalyId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      updateOperationalAnomalyStatus({
        organizationId: ctx.organizationId,
        anomalyId: input.anomalyId,
        nextStatus: "ACKNOWLEDGED",
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
      }),
    ),

  dismiss: tenantProcedure
    .input(
      z.object({
        anomalyId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      updateOperationalAnomalyStatus({
        organizationId: ctx.organizationId,
        anomalyId: input.anomalyId,
        nextStatus: "DISMISSED",
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
      }),
    ),
});
