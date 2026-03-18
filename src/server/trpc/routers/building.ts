import { z } from "zod";
import { router, tenantProcedure, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import {
  getLatestComplianceSnapshot,
  LATEST_SNAPSHOT_ORDER,
} from "@/server/lib/compliance-snapshots";
import {
  collapseDisplayEnergyReadings,
  dedupeEnergyReadings,
} from "@/server/lib/energy-readings";
import {
  getBuildingWorkflowSummary,
  listPortfolioWorkflowSummaries,
} from "@/server/compliance/building-workflow";

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

export const buildingRouter = router({
  onboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const hasOrg = !!ctx.clerkOrgId;

    let orgExists = false;
    let buildingCount = 0;

    if (ctx.clerkOrgId) {
      const org = await prisma.organization.findUnique({
        where: { clerkOrgId: ctx.clerkOrgId },
        select: { id: true }
      });
      if (org) {
        orgExists = true;
        buildingCount = await prisma.building.count({
          where: { organizationId: org.id },
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
              orderBy: LATEST_SNAPSHOT_ORDER,
              take: 1,
            },
            benchmarkSubmissions: {
              orderBy: [{ reportingYear: "desc" }, { updatedAt: "desc" }],
              take: 1,
              include: {
                complianceRun: {
                  select: {
                    id: true,
                    executedAt: true,
                    status: true,
                  },
                },
              },
            },
            filingRecords: {
              where: {
                filingType: "BEPS_COMPLIANCE",
              },
              orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
              take: 1,
              include: {
                complianceRun: {
                  select: {
                    id: true,
                    executedAt: true,
                    status: true,
                  },
                },
              },
            },
          },
        }),
        ctx.tenantDb.building.count({ where }),
      ]);

      return {
        buildings: buildings.map((b) => ({
          ...b,
          latestSnapshot: b.complianceSnapshots[0] ?? null,
          latestBenchmarkSubmission: b.benchmarkSubmissions[0] ?? null,
          latestBepsFiling: b.filingRecords[0] ?? null,
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
      const [building, workflowSummary] = await Promise.all([
        ctx.tenantDb.building.findUnique({
          where: { id: input.id },
          include: {
            complianceSnapshots: {
              orderBy: LATEST_SNAPSHOT_ORDER,
              take: 1,
            },
            benchmarkSubmissions: {
              orderBy: [{ reportingYear: "desc" }, { updatedAt: "desc" }],
              take: 1,
              include: {
                complianceRun: {
                  include: {
                    calculationManifest: true,
                  },
                },
              },
            },
            filingRecords: {
              where: {
                filingType: "BEPS_COMPLIANCE",
              },
              orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
              take: 1,
              include: {
                complianceRun: {
                  include: {
                    calculationManifest: true,
                  },
                },
              },
            },
            auditLogs: {
              orderBy: { timestamp: "desc" },
              take: 8,
              select: {
                id: true,
                timestamp: true,
                action: true,
                errorCode: true,
                requestId: true,
              },
            },
          },
        }),
        getBuildingWorkflowSummary({
          organizationId: ctx.organizationId,
          buildingId: input.id,
        }),
      ]);

      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      return {
        ...building,
        latestSnapshot: building.complianceSnapshots[0] ?? null,
        latestBenchmarkSubmission: building.benchmarkSubmissions[0] ?? null,
        latestBepsFiling: building.filingRecords[0] ?? null,
        recentAuditLogs: building.auditLogs,
        workflowSummary,
      };
    }),

  workflowSummary: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const building = await ctx.tenantDb.building.findUnique({
        where: { id: input.buildingId },
      });

      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      const summary = await getBuildingWorkflowSummary({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });

      if (!summary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow summary not found",
        });
      }

      return summary;
    }),

  create: tenantProcedure
    .input(createBuildingInput)
    .mutation(async ({ ctx, input }) => {
      const { espmPropertyId, ...rest } = input;
      const building = await ctx.tenantDb.building.create({
        data: {
          ...rest,
          organizationId: ctx.organizationId,
          espmPropertyId: espmPropertyId ? BigInt(espmPropertyId) : null,
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
          maxPenaltyExposure: z.number().min(0).optional(),
          espmPropertyId: z.string().max(50).nullable().optional(),
          selectedPathway: z
            .enum(["STANDARD", "PERFORMANCE", "PRESCRIPTIVE", "NONE"])
            .optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { espmPropertyId, ...rest } = input.data;
      const building = await ctx.tenantDb.building.update({
        where: { id: input.id },
        data: {
          ...rest,
          ...(espmPropertyId !== undefined
            ? { espmPropertyId: espmPropertyId ? BigInt(espmPropertyId) : null }
            : {}),
        },
      });

      return building;
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const building = await ctx.tenantDb.building.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      const childScope = { buildingId: input.id };

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.organization_id', $1, true)`,
          ctx.organizationId,
        );
        await tx.$executeRawUnsafe(`SET LOCAL ROLE quoin_app`);

        await tx.filingPacket.deleteMany({ where: childScope });
        await tx.filingRecordEvent.deleteMany({ where: childScope });
        await tx.benchmarkPacket.deleteMany({ where: childScope });
        await tx.financingPacket.deleteMany({ where: childScope });
        await tx.financingCaseCandidate.deleteMany({ where: childScope });
        await tx.benchmarkRequestItem.deleteMany({ where: childScope });
        await tx.bepsRequestItem.deleteMany({ where: childScope });
        await tx.evidenceArtifact.deleteMany({ where: childScope });
        await tx.filingRecord.deleteMany({ where: childScope });
        await tx.benchmarkSubmission.deleteMany({ where: childScope });
        await tx.bepsAlternativeComplianceAgreement.deleteMany({
          where: childScope,
        });
        await tx.bepsPrescriptiveItem.deleteMany({ where: childScope });
        await tx.bepsMetricInput.deleteMany({ where: childScope });
        await tx.portfolioManagerSyncState.deleteMany({ where: childScope });
        await tx.operationalAnomaly.deleteMany({ where: childScope });
        await tx.financingCase.deleteMany({ where: childScope });
        await tx.retrofitCandidate.deleteMany({ where: childScope });
        await tx.driftAlert.deleteMany({ where: childScope });
        await tx.energyReading.deleteMany({ where: childScope });
        await tx.complianceSnapshot.deleteMany({ where: childScope });
        await tx.complianceRun.deleteMany({ where: childScope });
        await tx.pipelineRun.deleteMany({ where: childScope });
        await tx.meter.deleteMany({ where: childScope });
        await tx.greenButtonConnection.deleteMany({ where: childScope });
        await tx.sourceArtifact.deleteMany({ where: childScope });
        await tx.$executeRaw`
          DELETE FROM "buildings"
          WHERE "id" = ${input.id}
            AND "organization_id" = ${ctx.organizationId}
        `;
      });

      return { success: true };
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
      return getLatestComplianceSnapshot(ctx.tenantDb, {
        buildingId: input.buildingId,
      });
    }),

  createEnergyReadingOverride: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        readingId: z.string(),
        consumption: z.number().positive(),
        cost: z.number().min(0).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sourceReading = await ctx.tenantDb.energyReading.findFirst({
        where: {
          id: input.readingId,
          buildingId: input.buildingId,
        },
      });

      if (!sourceReading) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Energy reading not found for building",
        });
      }

      return ctx.tenantDb.energyReading.create({
        data: {
          buildingId: sourceReading.buildingId,
          organizationId: ctx.organizationId,
          source: "MANUAL",
          meterType: sourceReading.meterType,
          meterId: sourceReading.meterId,
          periodStart: sourceReading.periodStart,
          periodEnd: sourceReading.periodEnd,
          consumption: input.consumption,
          unit: sourceReading.unit,
          consumptionKbtu:
            sourceReading.consumption > 0
              ? sourceReading.consumptionKbtu * (input.consumption / sourceReading.consumption)
              : sourceReading.consumptionKbtu,
          cost: input.cost ?? null,
          isVerified: true,
          rawPayload: {
            overrideOfReadingId: sourceReading.id,
            overrideSource: sourceReading.source,
          },
        },
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

      const readings = await ctx.tenantDb.energyReading.findMany({
        where: {
          buildingId: input.buildingId,
          periodStart: { gte: since },
        },
        orderBy: [{ periodStart: "asc" }, { ingestedAt: "desc" }, { id: "desc" }],
      });

      return collapseDisplayEnergyReadings(dedupeEnergyReadings(readings));
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
          orderBy: LATEST_SNAPSHOT_ORDER,
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
      const snapshot = building.complianceSnapshots[0] ?? null;
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

  portfolioWorkflow: tenantProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(25),
      }),
    )
    .query(async ({ ctx, input }) =>
      listPortfolioWorkflowSummaries({
        organizationId: ctx.organizationId,
        limit: input.limit,
      }),
    ),
});
