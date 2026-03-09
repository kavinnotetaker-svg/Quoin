import { z } from "zod";
import {
  router,
  tenantAdminProcedure,
  tenantManagerProcedure,
  tenantProcedure,
  protectedProcedure,
} from "../init";
import { TRPCError } from "@trpc/server";
import { prisma, getTenantClient } from "@/server/lib/db";
import { inngest } from "@/server/inngest/client";
import { dataIngestEvent } from "@/server/inngest/events";

const createBuildingInput = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  grossSquareFeet: z.number().int().positive(),
  propertyType: z.enum(["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"]),
  yearBuilt: z.number().int().min(1800).max(2030).optional(),
  bepsTargetScore: z.number().min(0).max(100),
  maxPenaltyExposure: z.number().min(0).default(0),
  espmPropertyId: z.string().max(50).optional(),
});

const listBuildingsInput = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sortBy: z
    .enum(["name", "address", "grossSquareFeet", "propertyType", "createdAt"])
    .default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  propertyType: z
    .enum(["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"])
    .optional(),
  search: z.string().max(200).optional(),
});

async function requireActiveBuilding(
  tenantDb: ReturnType<typeof getTenantClient>,
  buildingId: string,
) {
  const building = await tenantDb.building.findFirst({
    where: {
      id: buildingId,
      archivedAt: null,
    },
  });

  if (!building) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Building not found",
    });
  }

  return building;
}

export const buildingRouter = router({
  onboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const hasOrg = !!ctx.clerkOrgId;

    let orgExists = false;
    let buildingCount = 0;

    if (ctx.clerkOrgId) {
      const org = await prisma.organization.findUnique({
        where: { clerkOrgId: ctx.clerkOrgId },
        select: { id: true },
      });

      if (org) {
        orgExists = true;
        const tenantDb = getTenantClient(org.id);
        buildingCount = await tenantDb.building.count({
          where: { archivedAt: null },
        });
      }
    }

    return {
      hasOrg,
      orgSynced: orgExists,
      hasBuilding: buildingCount > 0,
      buildingCount,
      isComplete: hasOrg && orgExists && buildingCount > 0,
    };
  }),

  list: tenantProcedure.input(listBuildingsInput).query(async ({ ctx, input }) => {
    const { page, pageSize, sortBy, sortOrder, propertyType, search } = input;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      archivedAt: null,
    };

    if (propertyType) {
      where.propertyType = propertyType;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ];
    }

    const [buildings, total] = await Promise.all([
      ctx.tenantDb.building.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          complianceSnapshots: {
            orderBy: { snapshotDate: "desc" },
            take: 1,
          },
        },
      }),
      ctx.tenantDb.building.count({ where }),
    ]);

    return {
      buildings: buildings.map((building) => ({
        ...building,
        latestSnapshot: building.complianceSnapshots[0] ?? null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const building = await ctx.tenantDb.building.findFirst({
        where: {
          id: input.id,
          archivedAt: null,
        },
        include: {
          complianceSnapshots: {
            orderBy: { snapshotDate: "desc" },
            take: 1,
          },
        },
      });

      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      return {
        ...building,
        latestSnapshot: building.complianceSnapshots[0] ?? null,
      };
    }),

  create: tenantManagerProcedure
    .input(createBuildingInput)
    .mutation(async ({ ctx, input }) => {
      const { espmPropertyId, ...rest } = input;

      return ctx.tenantDb.building.create({
        data: {
          ...rest,
          organizationId: ctx.organizationId,
          espmPropertyId: espmPropertyId ? BigInt(espmPropertyId) : null,
        },
      });
    }),

  update: tenantManagerProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          name: z.string().min(1).max(200).optional(),
          address: z.string().min(1).max(500).optional(),
          latitude: z.number().min(-90).max(90).optional(),
          longitude: z.number().min(-180).max(180).optional(),
          grossSquareFeet: z.number().int().positive().optional(),
          propertyType: z
            .enum(["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"])
            .optional(),
          yearBuilt: z.number().int().min(1800).max(2030).nullable().optional(),
          bepsTargetScore: z.number().min(0).max(100).optional(),
          maxPenaltyExposure: z.number().min(0).optional(),
          espmPropertyId: z.string().max(50).nullable().optional(),
          selectedPathway: z
            .enum(["STANDARD", "PERFORMANCE", "PRESCRIPTIVE", "NONE"])
            .optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const previousBuilding = await requireActiveBuilding(ctx.tenantDb, input.id);
      const { espmPropertyId, ...rest } = input.data;

      const updated = await ctx.tenantDb.building.updateMany({
        where: {
          id: input.id,
          archivedAt: null,
        },
        data: {
          ...rest,
          ...(espmPropertyId !== undefined
            ? { espmPropertyId: espmPropertyId ? BigInt(espmPropertyId) : null }
            : {}),
        },
      });

      if (updated.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Building update could not be applied",
        });
      }

      const building = await requireActiveBuilding(ctx.tenantDb, input.id);

      if (
        espmPropertyId &&
        previousBuilding.espmPropertyId?.toString() !== espmPropertyId
      ) {
        try {
          await inngest.send(
            dataIngestEvent({
              buildingId: building.id,
              organizationId: building.organizationId,
              triggerType: "MANUAL",
            }),
          );
        } catch (queueError) {
          console.error("[building.update] Failed to queue ingestion job:", queueError);
        }
      }

      return building;
    }),

  delete: tenantAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireActiveBuilding(ctx.tenantDb, input.id);

      const archivedAt = new Date();
      const archived = await ctx.tenantDb.building.updateMany({
        where: {
          id: input.id,
          archivedAt: null,
        },
        data: {
          archivedAt,
          archivedByClerkUserId: ctx.clerkUserId,
        },
      });

      if (archived.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Building archive could not be applied",
        });
      }

      return {
        success: true,
        archivedAt: archivedAt.toISOString(),
      };
    }),

  pipelineRuns: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireActiveBuilding(ctx.tenantDb, input.buildingId);

      return ctx.tenantDb.pipelineRun.findMany({
        where: { buildingId: input.buildingId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  latestSnapshot: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireActiveBuilding(ctx.tenantDb, input.buildingId);

      return ctx.tenantDb.complianceSnapshot.findFirst({
        where: { buildingId: input.buildingId },
        orderBy: { snapshotDate: "desc" },
      });
    }),

  energyReadings: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        months: z.number().int().min(1).max(60).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireActiveBuilding(ctx.tenantDb, input.buildingId);

      const since = new Date();
      since.setMonth(since.getMonth() - input.months);

      return ctx.tenantDb.energyReading.findMany({
        where: {
          buildingId: input.buildingId,
          periodStart: { gte: since },
        },
        orderBy: { periodStart: "asc" },
      });
    }),

  complianceHistory: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireActiveBuilding(ctx.tenantDb, input.buildingId);

      return ctx.tenantDb.complianceSnapshot.findMany({
        where: { buildingId: input.buildingId },
        orderBy: { snapshotDate: "desc" },
        take: input.limit,
      });
    }),

  portfolioStats: tenantProcedure.query(async ({ ctx }) => {
    const buildings = await ctx.tenantDb.building.findMany({
      where: { archivedAt: null },
      include: {
        complianceSnapshots: {
          orderBy: { snapshotDate: "desc" },
          take: 1,
        },
      },
    });

    const stats = {
      totalBuildings: buildings.length,
      nonCompliant: 0,
      atRisk: 0,
      compliant: 0,
      exempt: 0,
      pendingData: 0,
      totalPenaltyExposure: 0,
      averageScore: 0,
    };

    let scoreSum = 0;
    let scoreCount = 0;

    for (const building of buildings) {
      const snapshot = building.complianceSnapshots[0];
      if (!snapshot) {
        continue;
      }

      switch (snapshot.complianceStatus) {
        case "NON_COMPLIANT":
          stats.nonCompliant++;
          break;
        case "AT_RISK":
          stats.atRisk++;
          break;
        case "COMPLIANT":
          stats.compliant++;
          break;
        case "EXEMPT":
          stats.exempt++;
          break;
        case "PENDING_DATA":
          stats.pendingData++;
          break;
      }

      if (snapshot.estimatedPenalty) {
        stats.totalPenaltyExposure += snapshot.estimatedPenalty;
      }

      if (snapshot.energyStarScore != null) {
        scoreSum += snapshot.energyStarScore;
        scoreCount++;
      }
    }

    stats.averageScore =
      scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;

    return stats;
  }),
});
