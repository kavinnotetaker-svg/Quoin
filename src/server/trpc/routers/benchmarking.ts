import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { NotFoundError } from "@/server/lib/errors";
import { router, tenantProcedure, operatorProcedure } from "../init";
import { createESPMClient } from "@/server/integrations/espm";
import {
  evaluateAndUpsertBenchmarkSubmission,
  type BenchmarkSubmissionContext,
} from "@/server/compliance/benchmarking";
import {
  getPortfolioManagerSyncState,
  listPortfolioBenchmarkReadiness,
  syncPortfolioManagerForBuilding,
} from "@/server/compliance/portfolio-manager-sync";
import { pushLocalEnergyToPortfolioManager } from "@/server/compliance/portfolio-manager-push";
import {
  exportBenchmarkPacket,
  finalizeBenchmarkPacket,
  generateBenchmarkPacket,
  getBenchmarkPacketManifest,
  getLatestBenchmarkPacket,
  listBenchmarkPackets,
  listBenchmarkRequestItems,
  upsertBenchmarkRequestItem,
} from "@/server/compliance/benchmark-packets";
import { listVerificationResults } from "@/server/compliance/verification-engine";

const benchmarkSubmissionStatusSchema = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "READY",
  "BLOCKED",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
]);

const evidenceArtifactDraftSchema = z.object({
  artifactType: z.enum([
    "CALCULATION_OUTPUT",
    "ENERGY_DATA",
    "PM_REPORT",
    "OWNER_ATTESTATION",
    "SYSTEM_NOTE",
    "OTHER",
  ]),
  name: z.string().min(1).max(200),
  artifactRef: z.string().max(500).nullable().optional(),
  sourceArtifactId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const benchmarkRequestCategorySchema = z.enum([
  "DC_REAL_PROPERTY_ID",
  "GROSS_FLOOR_AREA_SUPPORT",
  "AREA_ANALYSIS_DRAWINGS",
  "PROPERTY_USE_DETAILS_SUPPORT",
  "METER_ROSTER_SUPPORT",
  "UTILITY_BILLS",
  "PORTFOLIO_MANAGER_ACCESS",
  "DATA_QUALITY_CHECKER_SUPPORT",
  "THIRD_PARTY_VERIFICATION_SUPPORT",
  "OTHER_BENCHMARKING_SUPPORT",
]);

const benchmarkRequestStatusSchema = z.enum([
  "NOT_REQUESTED",
  "REQUESTED",
  "RECEIVED",
  "VERIFIED",
  "BLOCKED",
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
    throw new NotFoundError("Building not found");
  }
}

export const benchmarkingRouter = router({
  syncPortfolioManager: operatorProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const espmClient = ctx.espmFactory ? ctx.espmFactory() : createESPMClient();

      return syncPortfolioManagerForBuilding({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
        espmClient,
        producedByType: "USER",
        producedById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  pushLocalEnergyToPortfolioManager: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const espmClient = ctx.espmFactory ? ctx.espmFactory() : createESPMClient();

      return pushLocalEnergyToPortfolioManager({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
        espmClient,
        producedByType: "USER",
        producedById: ctx.clerkUserId ?? null,
      });
    }),

  getPortfolioManagerSyncStatus: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      const syncState = await getPortfolioManagerSyncState({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });

      if (!syncState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio Manager sync state not found for building",
        });
      }

      return syncState;
    }),

  listPortfolioReadiness: tenantProcedure
    .input(
      z.object({
        reportingYear: z.number().int().min(2000).max(2100).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) =>
      listPortfolioBenchmarkReadiness({
        organizationId: ctx.organizationId,
        reportingYear: input.reportingYear,
        limit: input.limit,
      }),
    ),

  getQaFindings: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      const syncState = await getPortfolioManagerSyncState({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
      });

      if (!syncState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Portfolio Manager QA findings not found for building",
        });
      }

      return syncState.qaPayload;
    }),

  evaluateReadiness: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
        gfaCorrectionRequired: z.boolean().optional(),
        evidenceArtifacts: z.array(evidenceArtifactDraftSchema).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return evaluateAndUpsertBenchmarkSubmission({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
        submissionContext: {
          gfaCorrectionRequired: input.gfaCorrectionRequired ?? false,
        },
        producedByType: "USER",
        producedById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
        evidenceArtifacts: input.evidenceArtifacts,
      });
    }),

  getReadiness: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      const submission = await ctx.tenantDb.benchmarkSubmission.findUnique({
        where: {
          buildingId_reportingYear: {
            buildingId: input.buildingId,
            reportingYear: input.reportingYear,
          },
        },
        include: {
          ruleVersion: {
            include: {
              rulePackage: true,
            },
          },
          factorSetVersion: true,
          complianceRun: {
            include: {
              calculationManifest: true,
            },
          },
          evidenceArtifacts: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!submission) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Benchmark submission not found for reporting year",
        });
      }

      return submission;
    }),

  listSubmissions: tenantProcedure
    .input(
      z.object({
        buildingId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.buildingId) {
        await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      }

      return ctx.tenantDb.benchmarkSubmission.findMany({
        where: input.buildingId ? { buildingId: input.buildingId } : undefined,
        orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
        take: input.limit,
        include: {
          ruleVersion: {
            include: {
              rulePackage: true,
            },
          },
          factorSetVersion: true,
          complianceRun: true,
        },
      });
    }),

  upsertSubmission: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
        status: benchmarkSubmissionStatusSchema.optional(),
        submittedAt: z.string().datetime().nullable().optional(),
        gfaCorrectionRequired: z.boolean().optional(),
        submissionPayload: z.record(z.string(), z.unknown()).optional(),
        evidenceArtifacts: z.array(evidenceArtifactDraftSchema).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      const existing = await ctx.tenantDb.benchmarkSubmission.findUnique({
        where: {
          buildingId_reportingYear: {
            buildingId: input.buildingId,
            reportingYear: input.reportingYear,
          },
        },
        select: {
          id: true,
          status: true,
          submissionPayload: true,
        },
      });

      const existingPayload =
        existing?.submissionPayload &&
        typeof existing.submissionPayload === "object" &&
        !Array.isArray(existing.submissionPayload)
          ? (existing.submissionPayload as Record<string, unknown>)
          : {};

      const existingContext = existingPayload["benchmarkingContext"];
      const submissionContext: BenchmarkSubmissionContext = {
        id: existing?.id,
        status: existing?.status,
        gfaCorrectionRequired:
          input.gfaCorrectionRequired ??
          (existingContext &&
          typeof existingContext === "object" &&
          !Array.isArray(existingContext) &&
          typeof (existingContext as Record<string, unknown>)["gfaCorrectionRequired"] === "boolean"
            ? ((existingContext as Record<string, unknown>)["gfaCorrectionRequired"] as boolean)
            : false),
      };

      return evaluateAndUpsertBenchmarkSubmission({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
        submissionContext,
        explicitStatus: input.status ?? null,
        submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
        producedByType: "USER",
        producedById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
        additionalSubmissionPayload: {
          ...existingPayload,
          ...(input.submissionPayload ?? {}),
        },
        evidenceArtifacts: input.evidenceArtifacts,
      });
    }),

  listRequestItems: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return listBenchmarkRequestItems({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
      });
    }),

  getVerificationChecklist: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return listVerificationResults({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
      });
    }),

  upsertRequestItem: tenantProcedure
    .input(
      z.object({
        requestItemId: z.string().optional(),
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100).nullable().optional(),
        category: benchmarkRequestCategorySchema,
        title: z.string().min(1).max(200),
        status: benchmarkRequestStatusSchema.optional(),
        isRequired: z.boolean().optional(),
        dueDate: z.string().datetime().nullable().optional(),
        assignedTo: z.string().max(200).nullable().optional(),
        requestedFrom: z.string().max(200).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
        sourceArtifactId: z.string().nullable().optional(),
        evidenceArtifactId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return upsertBenchmarkRequestItem({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        requestItemId: input.requestItemId,
        reportingYear: input.reportingYear ?? undefined,
        category: input.category,
        title: input.title,
        status: input.status,
        isRequired: input.isRequired,
        dueDate:
          input.dueDate === undefined
            ? undefined
            : input.dueDate === null
              ? null
              : new Date(input.dueDate),
        assignedTo: input.assignedTo,
        requestedFrom: input.requestedFrom,
        notes: input.notes,
        sourceArtifactId: input.sourceArtifactId,
        evidenceArtifactId: input.evidenceArtifactId,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
      });
    }),

  generateBenchmarkPacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return generateBenchmarkPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  getLatestBenchmarkPacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return getLatestBenchmarkPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
      });
    }),

  listBenchmarkPackets: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return listBenchmarkPackets({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        limit: input.limit,
      });
    }),

  getBenchmarkPacketManifest: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return getBenchmarkPacketManifest({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
      });
    }),

  finalizeBenchmarkPacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return finalizeBenchmarkPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),

  exportBenchmarkPacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        reportingYear: z.number().int().min(2000).max(2100),
        format: z.enum(["JSON", "MARKDOWN", "PDF"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      return exportBenchmarkPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        reportingYear: input.reportingYear,
        format: input.format,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
        requestId: ctx.requestId ?? null,
      });
    }),
});
