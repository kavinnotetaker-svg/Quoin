import { z } from "zod";
import { router, tenantProcedure, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";

const createBuildingInput = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  grossSquareFeet: z.number().int().positive(),
  propertyType: z.enum(["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"]),
  yearBuilt: z.number().int().min(1800).max(2030).optional(),
  bepsTargetScore: z.number().min(0).max(100),
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

export const buildingRouter = router({
  onboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const hasOrg = !!ctx.clerkOrgId;

    let orgExists = false;
    let buildingCount = 0;

    if (ctx.clerkOrgId) {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM organizations WHERE clerk_org_id = $1 LIMIT 1`,
        ctx.clerkOrgId,
      );
      if (rows[0]) {
        orgExists = true;
        buildingCount = await prisma.building.count({
          where: { organizationId: rows[0].id },
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

  list: tenantProcedure
    .input(listBuildingsInput)
    .query(async ({ ctx, input }) => {
      const { page, pageSize, sortBy, sortOrder, propertyType, search } = input;
      const skip = (page - 1) * pageSize;

      const where: Record<string, unknown> = {};
      if (propertyType) where.propertyType = propertyType;
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        buildings: (buildings as any[]).map((b) => ({
          ...b,
          latestSnapshot: b.complianceSnapshots?.[0] ?? null,
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
      const building = await ctx.tenantDb.building.findUnique({
        where: { id: input.id },
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

  create: tenantProcedure
    .input(createBuildingInput)
    .mutation(async ({ ctx, input }) => {
      const maxPenaltyExposure = Math.min(input.grossSquareFeet * 10, 7_500_000);

      const building = await ctx.tenantDb.building.create({
        data: {
          ...input,
          organizationId: ctx.organizationId,
          maxPenaltyExposure,
        },
      });

      return building;
    }),

  update: tenantProcedure
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
          selectedPathway: z
            .enum(["STANDARD", "PERFORMANCE", "PRESCRIPTIVE", "NONE"])
            .optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = { ...input.data };
      if (input.data.grossSquareFeet) {
        updateData.maxPenaltyExposure = Math.min(
          input.data.grossSquareFeet * 10,
          7_500_000
        );
      }

      const building = await ctx.tenantDb.building.update({
        where: { id: input.id },
        data: updateData,
      });

      return building;
    }),

  pipelineRuns: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.pipelineRun.findMany({
        where: { buildingId: input.buildingId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  latestSnapshot: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .query(async ({ ctx, input }) => {
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
      return ctx.tenantDb.complianceSnapshot.findMany({
        where: { buildingId: input.buildingId },
        orderBy: { snapshotDate: "desc" },
        take: input.limit,
      });
    }),

  portfolioStats: tenantProcedure.query(async ({ ctx }) => {
    const buildings = await ctx.tenantDb.building.findMany({
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
      if (snapshot) {
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
    }

    stats.averageScore =
      scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;

    return stats;
  }),
});
