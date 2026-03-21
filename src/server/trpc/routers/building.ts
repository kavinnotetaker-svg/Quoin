import { z } from "zod";
import { router, tenantProcedure, protectedProcedure, operatorProcedure } from "../init";
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
import { getPortfolioWorklist } from "@/server/compliance/portfolio-worklist";
import {
  listBuildingDataIssues,
  listPortfolioDataIssues,
  updateDataIssueStatus,
} from "@/server/compliance/data-issues";
import {
  getBuildingGovernedOperationalSummary,
  listBuildingGovernedOperationalSummaries,
} from "@/server/compliance/governed-operational-summary";
import { getBuildingArtifactWorkspace } from "@/server/compliance/compliance-artifacts";
import { getBuildingSourceReconciliationSummary } from "@/server/compliance/source-reconciliation";
import {
  getOrCreatePenaltySummary,
  listPenaltySummaries,
} from "@/server/compliance/penalties";
import { transitionSubmissionWorkflow } from "@/server/compliance/submission-workflows";
import { listOperationalAnomalies } from "@/server/compliance/operations-anomalies";
import { createESPMClient } from "@/server/integrations/espm";
import {
  executeBulkPortfolioOperatorAction,
  refreshPenaltySummaryFromOperator,
  reenqueueGreenButtonIngestionFromOperator,
  rerunSourceReconciliationFromOperator,
  retryPortfolioManagerSyncFromOperator,
} from "@/server/compliance/operator-controls";

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

const portfolioWorklistInput = z.object({
  search: z.string().max(200).optional(),
  cursor: z.string().max(200).optional(),
  pageSize: z.number().int().min(1).max(100).default(25),
  triageBucket: z
    .enum([
      "COMPLIANCE_BLOCKER",
      "ARTIFACT_ATTENTION",
      "REVIEW_QUEUE",
      "SUBMISSION_QUEUE",
      "SYNC_ATTENTION",
      "OPERATIONAL_RISK",
      "RETROFIT_QUEUE",
      "MONITORING",
    ])
    .optional(),
  readinessState: z
    .enum(["DATA_INCOMPLETE", "READY_FOR_REVIEW", "READY_TO_SUBMIT", "SUBMITTED"])
    .optional(),
  hasBlockingIssues: z.boolean().optional(),
  hasPenaltyExposure: z.boolean().optional(),
  triageUrgency: z.enum(["NOW", "NEXT", "MONITOR"]).optional(),
  submissionState: z
    .enum([
      "NOT_STARTED",
      "DRAFT",
      "READY_FOR_REVIEW",
      "APPROVED_FOR_SUBMISSION",
      "SUBMITTED",
      "COMPLETED",
      "NEEDS_CORRECTION",
      "SUPERSEDED",
    ])
    .optional(),
  needsSyncAttention: z.boolean().optional(),
  needsAnomalyAttention: z.boolean().optional(),
  hasRetrofitOpportunity: z.boolean().optional(),
  artifactStatus: z
    .enum(["NOT_STARTED", "GENERATED", "STALE", "FINALIZED"])
    .optional(),
  nextAction: z
    .enum([
      "RESOLVE_BLOCKING_ISSUES",
      "REFRESH_INTEGRATION",
      "REGENERATE_ARTIFACT",
      "FINALIZE_ARTIFACT",
      "REVIEW_COMPLIANCE_RESULT",
      "SUBMIT_ARTIFACT",
      "MONITOR_SUBMISSION",
    ])
    .optional(),
  sortBy: z
    .enum(["PRIORITY", "NAME", "PENALTY", "LAST_COMPLIANCE_EVALUATED"])
    .default("PRIORITY"),
});

const dataIssueActionStatusSchema = z.enum([
  "IN_PROGRESS",
  "RESOLVED",
  "DISMISSED",
]);

const submissionWorkflowTransitionSchema = z.enum([
  "READY_FOR_REVIEW",
  "APPROVED_FOR_SUBMISSION",
  "SUBMITTED",
  "COMPLETED",
  "NEEDS_CORRECTION",
]);

const bulkPortfolioOperatorActionSchema = z.enum([
  "RERUN_SOURCE_RECONCILIATION",
  "REFRESH_PENALTY_SUMMARY",
  "RETRY_PORTFOLIO_MANAGER_SYNC",
]);

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

function buildOperatorAccess(appRole: string) {
  return {
    canManage: appRole === "ADMIN" || appRole === "MANAGER",
    appRole,
  };
}

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
          },
        }),
        ctx.tenantDb.building.count({ where }),
      ]);

      const buildingIds = buildings.map((building) => building.id);
      const governedSummaries = await listBuildingGovernedOperationalSummaries({
        organizationId: ctx.organizationId,
        buildingIds,
      });

      return {
        buildings: buildings.map((b) => {
          const governedSummary = governedSummaries.get(b.id);
          if (!governedSummary) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Building readiness state is unavailable",
            });
          }

          return {
            ...b,
            latestSnapshot: b.complianceSnapshots[0] ?? null,
            readinessSummary: governedSummary.readinessSummary,
            issueSummary: governedSummary.issueSummary,
            activeIssueCounts: governedSummary.activeIssueCounts,
            governedSummary,
          };
        }),
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
            orderBy: LATEST_SNAPSHOT_ORDER,
            take: 1,
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
      });

      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      const [governedSummary, sourceReconciliation, operationalAnomalies] = await Promise.all([
        getBuildingGovernedOperationalSummary({
          organizationId: ctx.organizationId,
          buildingId: input.id,
        }),
        getBuildingSourceReconciliationSummary({
          organizationId: ctx.organizationId,
          buildingId: input.id,
        }),
        listOperationalAnomalies({
          organizationId: ctx.organizationId,
          buildingId: input.id,
          limit: 20,
        }),
      ]);

      return {
        ...building,
        latestSnapshot: building.complianceSnapshots[0] ?? null,
        recentAuditLogs: building.auditLogs,
        operatorAccess: buildOperatorAccess(ctx.appRole),
        readinessSummary: governedSummary.readinessSummary,
        issueSummary: governedSummary.issueSummary,
        governedSummary,
        sourceReconciliation,
        operationalAnomalies,
      };
    }),

  getPenaltySummary: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return getOrCreatePenaltySummary({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        requestId: ctx.requestId ?? null,
      });
    }),

  getArtifactWorkspace: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return getBuildingArtifactWorkspace({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });
    }),

  portfolioWorklist: tenantProcedure
    .input(portfolioWorklistInput)
    .query(async ({ ctx, input }) => {
      const result = await getPortfolioWorklist({
        organizationId: ctx.organizationId,
        search: input.search,
        triageBucket: input.triageBucket,
        readinessState: input.readinessState,
        hasBlockingIssues: input.hasBlockingIssues,
        hasPenaltyExposure: input.hasPenaltyExposure,
        triageUrgency: input.triageUrgency,
        submissionState: input.submissionState,
        needsSyncAttention: input.needsSyncAttention,
        needsAnomalyAttention: input.needsAnomalyAttention,
        hasRetrofitOpportunity: input.hasRetrofitOpportunity,
        artifactStatus: input.artifactStatus,
        nextAction: input.nextAction,
        sortBy: input.sortBy,
        cursor: input.cursor,
        pageSize: input.pageSize,
      });

      return {
        ...result,
        operatorAccess: buildOperatorAccess(ctx.appRole),
      };
    }),

  listPenaltySummaries: tenantProcedure
    .input(
      z.object({
        buildingIds: z.array(z.string()).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const uniqueBuildingIds = Array.from(new Set(input.buildingIds)).filter(Boolean);

      if (uniqueBuildingIds.length === 0) {
        return [];
      }

      const tenantBuildings = await ctx.tenantDb.building.findMany({
        where: {
          id: {
            in: uniqueBuildingIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (tenantBuildings.length !== uniqueBuildingIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more buildings were not found",
        });
      }

      return listPenaltySummaries({
        organizationId: ctx.organizationId,
        buildingIds: uniqueBuildingIds,
        requestId: ctx.requestId ?? null,
      });
    }),

  listIssues: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        status: z.enum(["ACTIVE", "ALL"]).default("ACTIVE"),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return listBuildingDataIssues({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        status: input.status,
      });
    }),

  portfolioIssues: tenantProcedure
    .input(
      z.object({
        status: z.enum(["ACTIVE", "ALL"]).default("ACTIVE"),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) =>
      listPortfolioDataIssues({
        organizationId: ctx.organizationId,
        status: input.status,
        limit: input.limit,
      }),
    ),

  updateIssueStatus: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        issueId: z.string(),
        nextStatus: dataIssueActionStatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return updateDataIssueStatus({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        issueId: input.issueId,
        nextStatus: input.nextStatus,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  retryPortfolioManagerSync: operatorProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const espmClient = ctx.espmFactory ? ctx.espmFactory() : createESPMClient();

      return retryPortfolioManagerSyncFromOperator({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
        espmClient,
      });
    }),

  reenqueueGreenButtonIngestion: operatorProcedure
    .input(
      z.object({
        buildingId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return reenqueueGreenButtonIngestionFromOperator({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  rerunSourceReconciliation: operatorProcedure
    .input(
      z.object({
        buildingId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return rerunSourceReconciliationFromOperator({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  refreshPenaltySummary: operatorProcedure
    .input(
      z.object({
        buildingId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return refreshPenaltySummaryFromOperator({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  bulkOperatePortfolio: operatorProcedure
    .input(
      z.object({
        buildingIds: z.array(z.string()).min(1).max(100),
        action: bulkPortfolioOperatorActionSchema,
        reportingYear: z.number().int().min(2000).max(2100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const espmClient =
        input.action === "RETRY_PORTFOLIO_MANAGER_SYNC"
          ? ctx.espmFactory
            ? ctx.espmFactory()
            : createESPMClient()
          : undefined;

      return executeBulkPortfolioOperatorAction({
        organizationId: ctx.organizationId,
        buildingIds: input.buildingIds,
        action: input.action,
        reportingYear: input.reportingYear,
        actorType: "USER",
        actorId: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
        espmClient,
      });
    }),

  transitionSubmissionWorkflow: operatorProcedure
    .input(
      z.object({
        buildingId: z.string(),
        workflowId: z.string(),
        nextState: submissionWorkflowTransitionSchema,
        notes: z.string().max(5000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return transitionSubmissionWorkflow({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        workflowId: input.workflowId,
        nextState: input.nextState,
        notes: input.notes ?? null,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
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

        await tx.submissionWorkflowEvent.deleteMany({ where: childScope });
        await tx.submissionWorkflow.deleteMany({ where: childScope });
        await tx.filingPacket.deleteMany({ where: childScope });
        await tx.filingRecordEvent.deleteMany({ where: childScope });
        await tx.benchmarkPacket.deleteMany({ where: childScope });
        await tx.financingPacket.deleteMany({ where: childScope });
        await tx.penaltyRun.deleteMany({ where: childScope });
        await tx.meterSourceReconciliation.deleteMany({ where: childScope });
        await tx.buildingSourceReconciliation.deleteMany({ where: childScope });
        await tx.financingCaseCandidate.deleteMany({ where: childScope });
        await tx.dataIssue.deleteMany({ where: childScope });
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

    const penaltySummaries = await listPenaltySummaries({
      organizationId: ctx.organizationId,
      buildingIds: buildings.map((building) => building.id),
      requestId: ctx.requestId ?? null,
    });
    const penaltyByBuildingId = new Map(
      penaltySummaries.map((entry) => [entry.buildingId, entry.summary]),
    );

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
        const governedPenalty =
          penaltyByBuildingId.get(building.id)?.currentEstimatedPenalty ?? null;
        if (governedPenalty != null) {
          stats.totalPenaltyExposure += governedPenalty;
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
