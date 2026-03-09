import { z } from "zod";
import { tenantProcedure, router } from "../init";
import { TRPCError } from "@trpc/server";
import {
  screenForExemptions,
  type FinancialDistressIndicators,
} from "@/server/pipelines/pathway-analysis/exemption-screener";

/**
 * Report tRPC Router
 *
 * Generates compliance reports and exemption filing documentation.
 * Actual PDF rendering uses Playwright .pdf() from HTML templates (Phase B).
 * This router assembles the data needed for those templates.
 */

const reportOutputSchema = z.object({
  buildingId: z.string(),
  buildingName: z.string(),
  address: z.string(),
  generatedAt: z.string(),
  complianceData: z.object({
    energyStarScore: z.number().nullable(),
    siteEui: z.number().nullable(),
    sourceEui: z.number().nullable(),
    weatherNormalizedSiteEui: z.number().nullable(),
    complianceStatus: z.string(),
    complianceGap: z.number().nullable(),
    estimatedPenalty: z.number().nullable(),
    dataQualityScore: z.number().nullable(),
    snapshotDate: z.string().nullable(),
  }),
  energyHistory: z.array(
    z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
      consumptionKbtu: z.number(),
      meterType: z.string(),
      source: z.string(),
    }),
  ),
  pipelineRuns: z.array(
    z.object({
      id: z.string(),
      pipelineType: z.string(),
      status: z.string(),
      startedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
    }),
  ),
});

const exemptionReportSchema = z.object({
  buildingId: z.string(),
  buildingName: z.string(),
  address: z.string(),
  grossSquareFeet: z.number(),
  propertyType: z.string(),
  yearBuilt: z.number().nullable(),
  generatedAt: z.string(),
  complianceStatus: z.string(),
  exemptionScreening: z.object({
    eligible: z.boolean(),
    qualifiedExemptions: z.array(z.string()),
    details: z.array(z.string()),
    missingData: z.array(z.string()),
  }),
  occupancyExemption: z.object({
    applicable: z.boolean(),
    baselineOccupancyPct: z.number().nullable(),
    occupancyThreshold: z.number(),
    baselineYears: z.string(),
    supportingEvidence: z.array(z.string()),
  }),
  financialExemption: z.object({
    applicable: z.boolean(),
    indicators: z.object({
      inForeclosure: z.boolean(),
      inBankruptcy: z.boolean(),
      negativeNetOperatingIncome: z.boolean(),
      taxDelinquent: z.boolean(),
    }),
    supportingEvidence: z.array(z.string()),
  }),
  penaltyContext: z.object({
    maxPenaltyExposure: z.number(),
    currentEstimatedPenalty: z.number().nullable(),
    penaltySavingsIfExempt: z.number().nullable(),
  }),
  supportingSnapshots: z.array(
    z.object({
      snapshotDate: z.string(),
      energyStarScore: z.number().nullable(),
      siteEui: z.number().nullable(),
      complianceStatus: z.string(),
    }),
  ),
  energyHistory: z.array(
    z.object({
      periodStart: z.string(),
      consumptionKbtu: z.number(),
      meterType: z.string(),
    }),
  ),
  filingChecklist: z.array(
    z.object({
      item: z.string(),
      status: z.enum(["READY", "NEEDS_ATTENTION", "NOT_APPLICABLE"]),
      notes: z.string(),
    }),
  ),
  doeeSubmissionGuidance: z.object({
    deadline: z.string(),
    submissionUrl: z.string(),
    requiredDocuments: z.array(z.string()),
    estimatedProcessingDays: z.number(),
  }),
});

export const reportRouter = router({
  /**
   * Generate compliance report data for a building.
   * Assembles all data needed for the HTML/PDF template.
   */
  getComplianceReport: tenantProcedure
    .input(z.object({ buildingId: z.string() }))
    .output(reportOutputSchema)
    .query(async ({ ctx, input }) => {
      const building = await ctx.tenantDb.building.findFirst({
        where: {
          id: input.buildingId,
          archivedAt: null,
        },
      });
      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      const latestSnapshot = await ctx.tenantDb.complianceSnapshot.findFirst({
        where: { buildingId: input.buildingId },
        orderBy: { snapshotDate: "desc" },
      });

      const twoYearsAgo = new Date();
      twoYearsAgo.setMonth(twoYearsAgo.getMonth() - 24);

      const readings = await ctx.tenantDb.energyReading.findMany({
        where: {
          buildingId: input.buildingId,
          periodStart: { gte: twoYearsAgo },
        },
        orderBy: { periodStart: "asc" },
        select: {
          periodStart: true,
          periodEnd: true,
          consumptionKbtu: true,
          meterType: true,
          source: true,
        },
      });

      const runs = await ctx.tenantDb.pipelineRun.findMany({
        where: { buildingId: input.buildingId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          pipelineType: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      });

      return {
        buildingId: building.id,
        buildingName: building.name,
        address: building.address,
        generatedAt: new Date().toISOString(),
        complianceData: {
          energyStarScore: latestSnapshot?.energyStarScore ?? null,
          siteEui: latestSnapshot?.siteEui ?? null,
          sourceEui: latestSnapshot?.sourceEui ?? null,
          weatherNormalizedSiteEui:
            latestSnapshot?.weatherNormalizedSiteEui ?? null,
          complianceStatus:
            latestSnapshot?.complianceStatus ?? "PENDING_DATA",
          complianceGap: latestSnapshot?.complianceGap ?? null,
          estimatedPenalty: latestSnapshot?.estimatedPenalty ?? null,
          dataQualityScore: latestSnapshot?.dataQualityScore ?? null,
          snapshotDate: latestSnapshot?.snapshotDate?.toISOString() ?? null,
        },
        energyHistory: readings.map(
          (r: {
            periodStart: Date;
            periodEnd: Date;
            consumptionKbtu: number;
            meterType: string;
            source: string;
          }) => ({
            periodStart: r.periodStart.toISOString(),
            periodEnd: r.periodEnd.toISOString(),
            consumptionKbtu: r.consumptionKbtu,
            meterType: r.meterType,
            source: r.source,
          }),
        ),
        pipelineRuns: runs.map(
          (r: {
            id: string;
            pipelineType: string;
            status: string;
            startedAt: Date | null;
            completedAt: Date | null;
          }) => ({
            id: r.id,
            pipelineType: r.pipelineType,
            status: r.status,
            startedAt: r.startedAt?.toISOString() ?? null,
            completedAt: r.completedAt?.toISOString() ?? null,
          }),
        ),
      };
    }),

  /**
   * Generate exemption filing report data.
   * Compiles data needed for Financial/Occupancy Exemption filings with DOEE.
   * Integrates the exemption screener to provide a ready-to-file package.
   */
  getExemptionReport: tenantProcedure
    .input(
      z.object({
        buildingId: z.string(),
        occupancyPct: z.number().nullable().optional(),
        financialDistress: z
          .object({
            inForeclosure: z.boolean().default(false),
            inBankruptcy: z.boolean().default(false),
            negativeNetOperatingIncome: z.boolean().default(false),
            taxDelinquent: z.boolean().default(false),
          })
          .optional(),
      }),
    )
    .output(exemptionReportSchema)
    .query(async ({ ctx, input }) => {
      const building = await ctx.tenantDb.building.findFirst({
        where: {
          id: input.buildingId,
          archivedAt: null,
        },
      });
      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }

      const latestSnapshot = await ctx.tenantDb.complianceSnapshot.findFirst({
        where: { buildingId: input.buildingId },
        orderBy: { snapshotDate: "desc" },
      });

      const snapshots = await ctx.tenantDb.complianceSnapshot.findMany({
        where: { buildingId: input.buildingId },
        orderBy: { snapshotDate: "desc" },
        take: 12,
        select: {
          snapshotDate: true,
          energyStarScore: true,
          siteEui: true,
          complianceStatus: true,
        },
      });

      // Energy history for baseline period documentation (3 years)
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      const readings = await ctx.tenantDb.energyReading.findMany({
        where: {
          buildingId: input.buildingId,
          periodStart: { gte: threeYearsAgo },
        },
        orderBy: { periodStart: "asc" },
        select: {
          periodStart: true,
          consumptionKbtu: true,
          meterType: true,
        },
      });

      // Run exemption screener
      const occupancyPct = input.occupancyPct ??
        (building.occupancyRate ? building.occupancyRate * 100 : null);

      const financialIndicators: FinancialDistressIndicators = input.financialDistress ?? {
        inForeclosure: building.hasFinancialDistress,
        inBankruptcy: false,
        negativeNetOperatingIncome: false,
        taxDelinquent: false,
      };

      const exemptionResult = screenForExemptions({
        baselineOccupancyPct: occupancyPct,
        financialDistressIndicators: financialIndicators,
        grossSquareFeet: building.grossSquareFeet,
        propertyType: building.propertyType,
        yearBuilt: building.yearBuilt,
      });

      // Build occupancy exemption section
      const occupancyApplicable = exemptionResult.qualifiedExemptions.includes("LOW_OCCUPANCY");
      const occupancyEvidence: string[] = [];
      if (occupancyPct !== null) {
        occupancyEvidence.push(
          `Reported baseline occupancy: ${occupancyPct}% (threshold: <50%)`,
        );
      }
      if (occupancyApplicable) {
        occupancyEvidence.push(
          "Building qualifies for the Whole-Cycle Low Occupancy Exemption under the 2024 BEPS amendments.",
        );
        occupancyEvidence.push(
          "Owner must submit occupancy records demonstrating <50% occupancy during the baseline period (2019-2021).",
        );
      }

      // Build financial exemption section
      const financialApplicable = exemptionResult.qualifiedExemptions.includes("FINANCIAL_DISTRESS");
      const financialEvidence: string[] = [];
      if (financialIndicators.inForeclosure) {
        financialEvidence.push("Property is in active foreclosure proceedings.");
      }
      if (financialIndicators.inBankruptcy) {
        financialEvidence.push("Owner has filed for bankruptcy protection.");
      }
      if (financialIndicators.negativeNetOperatingIncome) {
        financialEvidence.push("Property reports negative Net Operating Income (NOI).");
      }
      if (financialIndicators.taxDelinquent) {
        financialEvidence.push("Property has delinquent property tax payments.");
      }
      if (financialApplicable) {
        financialEvidence.push(
          "Owner must submit financial documentation (tax returns, court filings, NOI statements) to DOEE.",
        );
      }

      // Penalty context
      const maxPenalty = building.maxPenaltyExposure;
      const currentPenalty = latestSnapshot?.estimatedPenalty ?? null;

      // Filing checklist
      const checklist = buildFilingChecklist({
        hasOccupancyData: occupancyPct !== null,
        hasFinancialData: financialApplicable,
        hasEnergyHistory: readings.length >= 12,
        hasComplianceSnapshot: latestSnapshot !== null,
        occupancyApplicable,
        financialApplicable,
        recentConstructionApplicable: exemptionResult.qualifiedExemptions.includes("RECENT_CONSTRUCTION"),
      });

      return {
        buildingId: building.id,
        buildingName: building.name,
        address: building.address,
        grossSquareFeet: building.grossSquareFeet,
        propertyType: building.propertyType,
        yearBuilt: building.yearBuilt,
        generatedAt: new Date().toISOString(),
        complianceStatus: latestSnapshot?.complianceStatus ?? "PENDING_DATA",
        exemptionScreening: {
          eligible: exemptionResult.eligible,
          qualifiedExemptions: exemptionResult.qualifiedExemptions,
          details: exemptionResult.details,
          missingData: exemptionResult.missingData,
        },
        occupancyExemption: {
          applicable: occupancyApplicable,
          baselineOccupancyPct: occupancyPct,
          occupancyThreshold: 50,
          baselineYears: "2019-2021",
          supportingEvidence: occupancyEvidence,
        },
        financialExemption: {
          applicable: financialApplicable,
          indicators: financialIndicators,
          supportingEvidence: financialEvidence,
        },
        penaltyContext: {
          maxPenaltyExposure: maxPenalty,
          currentEstimatedPenalty: currentPenalty,
          penaltySavingsIfExempt: currentPenalty,
        },
        supportingSnapshots: snapshots.map(
          (s: {
            snapshotDate: Date;
            energyStarScore: number | null;
            siteEui: number | null;
            complianceStatus: string;
          }) => ({
            snapshotDate: s.snapshotDate.toISOString(),
            energyStarScore: s.energyStarScore,
            siteEui: s.siteEui,
            complianceStatus: s.complianceStatus,
          }),
        ),
        energyHistory: readings.map(
          (r: {
            periodStart: Date;
            consumptionKbtu: number;
            meterType: string;
          }) => ({
            periodStart: r.periodStart.toISOString(),
            consumptionKbtu: r.consumptionKbtu,
            meterType: r.meterType,
          }),
        ),
        filingChecklist: checklist,
        doeeSubmissionGuidance: {
          deadline: "2026-12-31",
          submissionUrl: "https://doee.dc.gov/service/beps-exemption-application",
          requiredDocuments: buildRequiredDocuments(occupancyApplicable, financialApplicable),
          estimatedProcessingDays: 45,
        },
      };
    }),
});

interface ChecklistInput {
  hasOccupancyData: boolean;
  hasFinancialData: boolean;
  hasEnergyHistory: boolean;
  hasComplianceSnapshot: boolean;
  occupancyApplicable: boolean;
  financialApplicable: boolean;
  recentConstructionApplicable: boolean;
}

/**
 * Build the filing checklist based on available data and applicable exemptions.
 */
function buildFilingChecklist(input: ChecklistInput): Array<{
  item: string;
  status: "READY" | "NEEDS_ATTENTION" | "NOT_APPLICABLE";
  notes: string;
}> {
  const checklist: Array<{
    item: string;
    status: "READY" | "NEEDS_ATTENTION" | "NOT_APPLICABLE";
    notes: string;
  }> = [];

  checklist.push({
    item: "ENERGY STAR Portfolio Manager property linked",
    status: input.hasComplianceSnapshot ? "READY" : "NEEDS_ATTENTION",
    notes: input.hasComplianceSnapshot
      ? "Property has compliance data on file."
      : "Link your ESPM property to generate compliance snapshots.",
  });

  checklist.push({
    item: "12+ months of energy consumption data",
    status: input.hasEnergyHistory ? "READY" : "NEEDS_ATTENTION",
    notes: input.hasEnergyHistory
      ? "Sufficient energy history available for DOEE submission."
      : "Upload at least 12 months of utility data (CSV or Green Button).",
  });

  if (input.occupancyApplicable) {
    checklist.push({
      item: "Occupancy records for baseline period (2019-2021)",
      status: input.hasOccupancyData ? "READY" : "NEEDS_ATTENTION",
      notes: input.hasOccupancyData
        ? "Occupancy data provided. Prepare supporting lease records or tenant logs."
        : "Provide occupancy percentage during the baseline period.",
    });
    checklist.push({
      item: "Notarized owner attestation of low occupancy",
      status: "NEEDS_ATTENTION",
      notes: "Required for all occupancy exemption filings. Must be notarized and signed by property owner.",
    });
  } else {
    checklist.push({
      item: "Occupancy exemption documentation",
      status: "NOT_APPLICABLE",
      notes: "Building does not qualify for occupancy exemption (occupancy >= 50%).",
    });
  }

  if (input.financialApplicable) {
    checklist.push({
      item: "Financial distress documentation",
      status: "NEEDS_ATTENTION",
      notes: "Submit court filings, tax records, or audited financial statements demonstrating distress.",
    });
    checklist.push({
      item: "Three years of property tax payment records",
      status: "NEEDS_ATTENTION",
      notes: "Required to substantiate financial hardship claim.",
    });
  } else {
    checklist.push({
      item: "Financial distress documentation",
      status: "NOT_APPLICABLE",
      notes: "No financial distress indicators flagged.",
    });
  }

  if (input.recentConstructionApplicable) {
    checklist.push({
      item: "Certificate of Occupancy showing construction date",
      status: "NEEDS_ATTENTION",
      notes: "Provide Certificate of Occupancy issued 2016 or later to verify recent construction.",
    });
  }

  return checklist;
}

/**
 * Build the list of required documents based on applicable exemptions.
 */
function buildRequiredDocuments(
  occupancyApplicable: boolean,
  financialApplicable: boolean,
): string[] {
  const docs = [
    "DOEE BEPS Exemption Application Form",
    "ENERGY STAR Portfolio Manager Property Summary Report",
    "12-month energy consumption records (utility bills or Green Button data)",
  ];

  if (occupancyApplicable) {
    docs.push("Baseline period (2019-2021) occupancy records or tenant lease summaries");
    docs.push("Notarized owner attestation of low occupancy (<50%)");
    docs.push("Property management records showing vacancy periods");
  }

  if (financialApplicable) {
    docs.push("Audited financial statements or tax returns (3 years)");
    docs.push("Court filings (foreclosure, bankruptcy) if applicable");
    docs.push("Property tax payment history from DC Office of Tax and Revenue");
    docs.push("Net Operating Income (NOI) calculation worksheet");
  }

  return docs;
}
