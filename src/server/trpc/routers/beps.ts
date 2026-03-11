import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  attachEvidenceToBepsFilingRecord,
  getCanonicalBepsInputState,
  evaluateBepsForBuilding,
  type BepsFactorConfig,
  exportBepsFilingPacket,
  finalizeBepsFilingPacket,
  generateBepsFilingPacket,
  getBepsFactorSetKeyForCycle,
  getLatestBepsFilingPacket,
  listBepsFilingPackets,
  type BepsRuleConfig,
  refreshDerivedBepsMetricInput,
  transitionBepsFilingRecord,
  upsertBepsAlternativeComplianceAgreementRecord,
  upsertBepsMetricInputRecord,
  upsertBepsPrescriptiveItemRecord,
  type BepsEvaluationOverrides,
} from "@/server/compliance/beps";
import {
} from "@/server/compliance/provenance";
import { resolveGovernedFilingYear } from "@/server/compliance/beps/config";
import { getActiveBepsCycleContext } from "@/server/compliance/beps/cycle-registry";
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

const bepsOverridesSchema = z.object({
  filingYear: z.number().int().min(2024).max(2100).optional(),
  selectedPathway: z
    .enum(["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE", "TRAJECTORY"])
    .optional(),
  isEnergyStarScoreEligible: z.boolean().optional(),
  baselineAdjustedSiteEui: z.number().positive().optional(),
  currentAdjustedSiteEui: z.number().positive().optional(),
  baselineWeatherNormalizedSiteEui: z.number().positive().optional(),
  currentWeatherNormalizedSiteEui: z.number().positive().optional(),
  baselineWeatherNormalizedSourceEui: z.number().positive().optional(),
  currentWeatherNormalizedSourceEui: z.number().positive().optional(),
  baselineScore: z.number().min(0).max(100).optional(),
  currentScore: z.number().min(0).max(100).optional(),
  prescriptivePointsEarned: z.number().min(0).optional(),
  prescriptivePointsNeeded: z.number().min(0).optional(),
  prescriptiveRequirementsMet: z.boolean().optional(),
  maxGapForPropertyType: z.number().positive().optional(),
  delayedCycle1OptionApplied: z.boolean().optional(),
  alternativeComplianceAgreementMultiplier: z.number().min(0).max(1).optional(),
  alternativeComplianceAgreementPathway: z
    .enum(["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"])
    .optional(),
  requestAlternativeComplianceAgreement: z.boolean().optional(),
  maxPenaltyOverrideReason: z
    .enum([
      "KNOWINGLY_WITHHELD_INFORMATION",
      "INCOMPLETE_OR_INACCURATE_REPORTING",
      "HEALTH_OR_SAFETY_RISK",
    ])
    .optional(),
});

function toOverrides(input: z.infer<typeof bepsOverridesSchema> | undefined): BepsEvaluationOverrides {
  return {
    filingYear: input?.filingYear ?? null,
    selectedPathway: input?.selectedPathway ?? null,
    isEnergyStarScoreEligible: input?.isEnergyStarScoreEligible ?? null,
    baselineAdjustedSiteEui: input?.baselineAdjustedSiteEui ?? null,
    currentAdjustedSiteEui: input?.currentAdjustedSiteEui ?? null,
    baselineWeatherNormalizedSiteEui:
      input?.baselineWeatherNormalizedSiteEui ?? null,
    currentWeatherNormalizedSiteEui:
      input?.currentWeatherNormalizedSiteEui ?? null,
    baselineWeatherNormalizedSourceEui:
      input?.baselineWeatherNormalizedSourceEui ?? null,
    currentWeatherNormalizedSourceEui:
      input?.currentWeatherNormalizedSourceEui ?? null,
    baselineScore: input?.baselineScore ?? null,
    currentScore: input?.currentScore ?? null,
    prescriptivePointsEarned: input?.prescriptivePointsEarned ?? null,
    prescriptivePointsNeeded: input?.prescriptivePointsNeeded ?? null,
    prescriptiveRequirementsMet: input?.prescriptiveRequirementsMet ?? null,
    maxGapForPropertyType: input?.maxGapForPropertyType ?? null,
    delayedCycle1OptionApplied: input?.delayedCycle1OptionApplied ?? null,
    alternativeComplianceAgreementMultiplier:
      input?.alternativeComplianceAgreementMultiplier ?? null,
    alternativeComplianceAgreementPathway:
      input?.alternativeComplianceAgreementPathway ?? null,
    requestAlternativeComplianceAgreement:
      input?.requestAlternativeComplianceAgreement ?? null,
    maxPenaltyOverrideReason: input?.maxPenaltyOverrideReason ?? null,
  };
}

async function resolveBepsFilingYear(
  cycle: "CYCLE_1" | "CYCLE_2" | "CYCLE_3",
  filingYear?: number,
) {
  if (filingYear != null) {
    return filingYear;
  }
  const cycleContext = await getActiveBepsCycleContext(cycle);

  return resolveGovernedFilingYear(
    cycle,
    cycleContext.ruleConfig as BepsRuleConfig,
    cycleContext.factorConfig as BepsFactorConfig,
    null,
  );
}

const bepsCanonicalScopeSchema = z.object({
  buildingId: z.string(),
  cycle: z.enum(["CYCLE_1", "CYCLE_2", "CYCLE_3"]).default("CYCLE_1"),
  filingYear: z.number().int().min(2024).max(2100).optional(),
});

export const bepsRouter = router({
  evaluate: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        cycle: z.enum(["CYCLE_1", "CYCLE_2", "CYCLE_3"]).default("CYCLE_1"),
        overrides: bepsOverridesSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return evaluateBepsForBuilding({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        cycle: input.cycle,
        overrides: toOverrides(input.overrides),
        producedByType: "USER",
        producedById: ctx.clerkUserId ?? null,
      });
    }),

  inputState: tenantProcedure
    .input(bepsCanonicalScopeSchema)
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const filingYear = await resolveBepsFilingYear(input.cycle, input.filingYear);
      const [building, canonicalInputState] = await Promise.all([
        ctx.tenantDb.building.findUnique({
          where: { id: input.buildingId },
          select: {
            id: true,
            ownershipType: true,
            isEnergyStarScoreEligible: true,
            bepsTargetScore: true,
            targetEui: true,
          },
        }),
        getCanonicalBepsInputState({
          organizationId: ctx.organizationId,
          buildingId: input.buildingId,
          cycle: input.cycle,
          filingYear,
        }),
      ]);

      return {
        building,
        filingYear,
        cycle: input.cycle,
        canonicalInputState,
      };
    }),

  canonicalMetrics: tenantProcedure
    .input(bepsCanonicalScopeSchema)
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const filingYear = await resolveBepsFilingYear(input.cycle, input.filingYear);
      const state = await getCanonicalBepsInputState({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        cycle: input.cycle,
        filingYear,
      });

      return {
        cycle: input.cycle,
        filingYear,
        metricInput: state.metricInput,
      };
    }),

  refreshCanonicalMetrics: tenantProcedure
    .input(bepsCanonicalScopeSchema)
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const filingYear = await resolveBepsFilingYear(input.cycle, input.filingYear);

      return refreshDerivedBepsMetricInput({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        cycle: input.cycle,
        filingYear,
      });
    }),

  upsertMetricInput: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        cycle: z.enum(["CYCLE_1", "CYCLE_2", "CYCLE_3"]).default("CYCLE_1"),
        filingYear: z.number().int().min(2024).max(2100).optional(),
        baselineYearStart: z.number().int().nullable().optional(),
        baselineYearEnd: z.number().int().nullable().optional(),
        evaluationYearStart: z.number().int().nullable().optional(),
        evaluationYearEnd: z.number().int().nullable().optional(),
        comparisonYear: z.number().int().nullable().optional(),
        delayedCycle1OptionApplied: z.boolean().optional(),
        baselineAdjustedSiteEui: z.number().positive().nullable().optional(),
        evaluationAdjustedSiteEui: z.number().positive().nullable().optional(),
        baselineWeatherNormalizedSiteEui: z.number().positive().nullable().optional(),
        evaluationWeatherNormalizedSiteEui: z.number().positive().nullable().optional(),
        baselineWeatherNormalizedSourceEui:
          z.number().positive().nullable().optional(),
        evaluationWeatherNormalizedSourceEui:
          z.number().positive().nullable().optional(),
        baselineEnergyStarScore: z.number().min(0).max(100).nullable().optional(),
        evaluationEnergyStarScore: z.number().min(0).max(100).nullable().optional(),
        baselineSnapshotId: z.string().nullable().optional(),
        evaluationSnapshotId: z.string().nullable().optional(),
        sourceArtifactId: z.string().nullable().optional(),
        notes: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const filingYear = await resolveBepsFilingYear(input.cycle, input.filingYear);
      const existing = await getCanonicalBepsInputState({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        cycle: input.cycle,
        filingYear,
      });
      const current = existing.metricInput;

      return upsertBepsMetricInputRecord({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        complianceCycle: input.cycle,
        filingYear,
        baselineYearStart: input.baselineYearStart ?? current?.baselineYearStart ?? null,
        baselineYearEnd: input.baselineYearEnd ?? current?.baselineYearEnd ?? null,
        evaluationYearStart:
          input.evaluationYearStart ?? current?.evaluationYearStart ?? null,
        evaluationYearEnd: input.evaluationYearEnd ?? current?.evaluationYearEnd ?? null,
        comparisonYear: input.comparisonYear ?? current?.comparisonYear ?? null,
        delayedCycle1OptionApplied:
          input.delayedCycle1OptionApplied ??
          current?.delayedCycle1OptionApplied ??
          false,
        baselineAdjustedSiteEui:
          input.baselineAdjustedSiteEui ?? current?.baselineAdjustedSiteEui ?? null,
        evaluationAdjustedSiteEui:
          input.evaluationAdjustedSiteEui ?? current?.evaluationAdjustedSiteEui ?? null,
        baselineWeatherNormalizedSiteEui:
          input.baselineWeatherNormalizedSiteEui ??
          current?.baselineWeatherNormalizedSiteEui ??
          null,
        evaluationWeatherNormalizedSiteEui:
          input.evaluationWeatherNormalizedSiteEui ??
          current?.evaluationWeatherNormalizedSiteEui ??
          null,
        baselineWeatherNormalizedSourceEui:
          input.baselineWeatherNormalizedSourceEui ??
          current?.baselineWeatherNormalizedSourceEui ??
          null,
        evaluationWeatherNormalizedSourceEui:
          input.evaluationWeatherNormalizedSourceEui ??
          current?.evaluationWeatherNormalizedSourceEui ??
          null,
        baselineEnergyStarScore:
          input.baselineEnergyStarScore ?? current?.baselineEnergyStarScore ?? null,
        evaluationEnergyStarScore:
          input.evaluationEnergyStarScore ?? current?.evaluationEnergyStarScore ?? null,
        baselineSnapshotId: input.baselineSnapshotId ?? current?.baselineSnapshotId ?? null,
        evaluationSnapshotId:
          input.evaluationSnapshotId ?? current?.evaluationSnapshotId ?? null,
        sourceArtifactId: input.sourceArtifactId ?? current?.sourceArtifactId ?? null,
        notesJson: {
          ...(current?.notesJson ?? {}),
          ...(input.notes ?? {}),
          inputMode: "MANUAL",
          updatedByType: "USER",
          updatedById: ctx.clerkUserId ?? null,
        },
      });
    }),

  upsertPrescriptiveItem: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        cycle: z.enum(["CYCLE_1", "CYCLE_2", "CYCLE_3"]).default("CYCLE_1"),
        filingYear: z.number().int().min(2024).max(2100).optional(),
        itemKey: z.string().min(1),
        name: z.string().min(1),
        milestoneName: z.string().min(1).optional(),
        isRequired: z.boolean().optional(),
        pointsPossible: z.number().min(0).optional(),
        pointsEarned: z.number().min(0).nullable().optional(),
        status: z.enum([
          "PLANNED",
          "IN_PROGRESS",
          "COMPLETED",
          "APPROVED",
          "WAIVED",
          "REJECTED",
        ]),
        completedAt: z.string().datetime().nullable().optional(),
        approvedAt: z.string().datetime().nullable().optional(),
        dueAt: z.string().datetime().nullable().optional(),
        sourceArtifactId: z.string().nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const filingYear = await resolveBepsFilingYear(input.cycle, input.filingYear);

      return upsertBepsPrescriptiveItemRecord({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        complianceCycle: input.cycle,
        filingYear,
        itemKey: input.itemKey,
        name: input.name,
        milestoneName: input.milestoneName ?? null,
        isRequired: input.isRequired ?? true,
        pointsPossible: input.pointsPossible ?? 0,
        pointsEarned: input.pointsEarned ?? null,
        status: input.status,
        completedAt: input.completedAt ? new Date(input.completedAt) : null,
        approvedAt: input.approvedAt ? new Date(input.approvedAt) : null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        sourceArtifactId: input.sourceArtifactId ?? null,
        metadata: input.metadata ?? {},
      });
    }),

  upsertAlternativeComplianceAgreement: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        cycle: z.enum(["CYCLE_1", "CYCLE_2", "CYCLE_3"]).default("CYCLE_1"),
        filingYear: z.number().int().min(2024).max(2100).optional(),
        agreementIdentifier: z.string().min(1),
        pathway: z.enum(["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"]),
        multiplier: z.number().min(0).max(1),
        status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "EXPIRED"]),
        effectiveFrom: z.string().datetime(),
        effectiveTo: z.string().datetime().nullable().optional(),
        sourceArtifactId: z.string().nullable().optional(),
        agreementPayload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const filingYear = await resolveBepsFilingYear(input.cycle, input.filingYear);

      return upsertBepsAlternativeComplianceAgreementRecord({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        complianceCycle: input.cycle,
        filingYear,
        agreementIdentifier: input.agreementIdentifier,
        pathway: input.pathway,
        multiplier: input.multiplier,
        status: input.status,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        sourceArtifactId: input.sourceArtifactId ?? null,
        agreementPayload: input.agreementPayload ?? {},
        producedByType: "USER",
        producedById: ctx.clerkUserId ?? null,
      });
    }),

  latestRun: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        cycle: z.enum(["CYCLE_1", "CYCLE_2", "CYCLE_3"]).default("CYCLE_1"),
        filingYear: z.number().int().min(2024).max(2100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      const filing = await ctx.tenantDb.filingRecord.findFirst({
        where: {
          buildingId: input.buildingId,
          filingType: "BEPS_COMPLIANCE",
          complianceCycle: input.cycle,
          ...(input.filingYear != null ? { filingYear: input.filingYear } : {}),
        },
        orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
        include: {
          complianceRun: {
            include: {
              calculationManifest: true,
              evidenceArtifacts: {
                orderBy: { createdAt: "desc" },
              },
            },
          },
          evidenceArtifacts: {
            orderBy: { createdAt: "desc" },
          },
          events: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!filing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "BEPS filing record not found",
        });
      }

      return filing;
    }),

  listOutcomes: tenantProcedure
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

      return ctx.tenantDb.filingRecord.findMany({
        where: {
          filingType: "BEPS_COMPLIANCE",
          ...(input.buildingId ? { buildingId: input.buildingId } : {}),
        },
        orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
        take: input.limit,
        include: {
          complianceRun: {
            include: {
              calculationManifest: true,
            },
          },
          evidenceArtifacts: {
            orderBy: { createdAt: "desc" },
          },
          events: {
            orderBy: { createdAt: "desc" },
          },
        },
      });
    }),

  transitionFiling: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        filingRecordId: z.string(),
        nextStatus: z.enum(["DRAFT", "GENERATED", "FILED", "ACCEPTED", "REJECTED"]),
        notes: z.string().optional(),
        filedAt: z.string().datetime().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return transitionBepsFilingRecord({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
        nextStatus: input.nextStatus,
        notes: input.notes ?? null,
        filedAt: input.filedAt ? new Date(input.filedAt) : null,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
      });
    }),

  attachFilingEvidence: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        filingRecordId: z.string(),
        artifactType: z.enum([
          "CALCULATION_OUTPUT",
          "ENERGY_DATA",
          "PM_REPORT",
          "OWNER_ATTESTATION",
          "SYSTEM_NOTE",
          "OTHER",
        ]),
        name: z.string().min(1),
        artifactRef: z.string().nullable().optional(),
        sourceArtifactId: z.string().nullable().optional(),
        bepsEvidenceKind: z.enum([
          "PATHWAY_SUPPORT",
          "PRESCRIPTIVE_SUPPORT",
          "ACP_SUPPORT",
          "EXEMPTION_SUPPORT",
          "NOT_APPLICABLE_SUPPORT",
        ]),
        pathway: z
          .enum(["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE", "TRAJECTORY"])
          .nullable()
          .optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return attachEvidenceToBepsFilingRecord({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
        artifactType: input.artifactType,
        name: input.name,
        artifactRef: input.artifactRef ?? null,
        sourceArtifactId: input.sourceArtifactId ?? null,
        bepsEvidenceKind: input.bepsEvidenceKind,
        pathway: input.pathway ?? null,
        metadata: input.metadata ?? {},
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
      });
    }),

  generatePacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        filingRecordId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return generateBepsFilingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
      });
    }),

  finalizePacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        filingRecordId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return finalizeBepsFilingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
        createdByType: "USER",
        createdById: ctx.clerkUserId ?? null,
      });
    }),

  packetByFiling: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        filingRecordId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const packet = await getLatestBepsFilingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
      });

      if (!packet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "BEPS filing packet not found",
        });
      }

      return packet;
    }),

  listPackets: tenantProcedure
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

      return listBepsFilingPackets({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        limit: input.limit,
      });
    }),

  packetManifest: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        filingRecordId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);
      const packet = await getLatestBepsFilingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
      });

      if (!packet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "BEPS filing packet not found",
        });
      }

      const payload =
        packet.packetPayload && typeof packet.packetPayload === "object" && !Array.isArray(packet.packetPayload)
          ? (packet.packetPayload as Record<string, unknown>)
          : {};

      return {
        id: packet.id,
        version: packet.version,
        status: packet.status,
        evidenceManifest:
          Array.isArray(payload["evidenceManifest"]) ? payload["evidenceManifest"] : [],
        warnings: Array.isArray(payload["warnings"]) ? payload["warnings"] : [],
      };
    }),

  exportPacket: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        filingRecordId: z.string(),
        format: z.enum(["JSON", "MARKDOWN"]).default("JSON"),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureTenantBuilding(ctx.tenantDb, input.buildingId);

      return exportBepsFilingPacket({
        organizationId: ctx.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
        format: input.format,
      });
    }),
});
