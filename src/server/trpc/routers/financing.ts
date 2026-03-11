import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  exportFinancingPacket,
  finalizeFinancingPacket,
  generateFinancingPacket,
  getFinancingPacketManifest,
  getLatestFinancingPacket,
  listFinancingCases,
  upsertFinancingCase,
} from "@/server/compliance/financing-packets";
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

export const financingRouter = router({
  upsertCase: tenantProcedure
    .input(
      z.object({
        financingCaseId: z.string().optional(),
        buildingId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
        complianceCycle: z.enum(["CYCLE_1", "CYCLE_2", "CYCLE_3"]).nullable().optional(),
        targetFilingYear: z.number().int().min(2024).max(2100).nullable().optional(),
        candidateIds: z.array(z.string()).min(1),
        casePayload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return upsertFinancingCase({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        financingCaseId: input.financingCaseId,
        name: input.name,
        description: input.description,
        status: input.status,
        complianceCycle: input.complianceCycle,
        targetFilingYear: input.targetFilingYear,
        candidateIds: input.candidateIds,
        casePayload: input.casePayload,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
      });
    }),

  listCases: tenantProcedure
    .input(
      z.object({
        buildingId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.buildingId) {
        await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      }

      return listFinancingCases({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        limit: input.limit,
      });
    }),

  generatePacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        financingCaseId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return generateFinancingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        financingCaseId: input.financingCaseId,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
      });
    }),

  finalizePacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        financingCaseId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return finalizeFinancingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        financingCaseId: input.financingCaseId,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
      });
    }),

  packetByCase: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        financingCaseId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      const packet = await getLatestFinancingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        financingCaseId: input.financingCaseId,
      });

      if (!packet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Financing packet not found",
        });
      }

      return packet;
    }),

  packetManifest: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        financingCaseId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      const manifest = await getFinancingPacketManifest({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        financingCaseId: input.financingCaseId,
      });

      if (!manifest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Financing packet not found",
        });
      }

      return manifest;
    }),

  exportPacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        financingCaseId: z.string(),
        format: z.enum(["JSON", "MARKDOWN"]).default("JSON"),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return exportFinancingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        financingCaseId: input.financingCaseId,
        format: input.format,
      });
    }),
});
