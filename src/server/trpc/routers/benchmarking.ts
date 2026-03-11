import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../init";
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

export const benchmarkingRouter = router({
  syncPortfolioManager: tenantProcedure
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
        additionalSubmissionPayload: {
          ...existingPayload,
          ...(input.submissionPayload ?? {}),
        },
        evidenceArtifacts: input.evidenceArtifacts,
      });
    }),
});
