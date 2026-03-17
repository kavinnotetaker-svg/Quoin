import type {
  ActorType,
  BenchmarkSubmissionStatus,
  EspmShareStatus,
  MeterType,
  Prisma,
} from "@/generated/prisma/client";
import type { ESPM, PropertyMetrics } from "@/server/integrations/espm";
import { prisma } from "@/server/lib/db";
import { getConversionFactor } from "@/server/pipelines/data-ingestion/normalizer";
import { buildSnapshotData } from "@/server/pipelines/data-ingestion/snapshot";
import {
  evaluateAndUpsertBenchmarkSubmission,
  type BenchmarkReadinessResult,
} from "./benchmarking";
import { syncPortfolioManagerForBuildingReliable } from "./portfolio-manager-sync-reliable";
import {
  classifyPortfolioManagerError,
  parsePortfolioManagerConsumptionReadings,
  parsePortfolioManagerMeterDetail,
  parsePortfolioManagerMeterIds,
  parsePortfolioManagerProperty,
  summarizePortfolioManagerSyncState,
  type PortfolioManagerConsumptionReading,
  type PortfolioManagerMeterSnapshot,
  type PortfolioManagerPropertySnapshot,
  type PortfolioManagerSyncDiagnostics,
  type PortfolioManagerSyncErrorDetail,
  type PortfolioManagerSyncStep,
  type PortfolioManagerSyncStepStatus,
} from "./portfolio-manager-support";

const PM_SYNC_SYSTEM = "ENERGY_STAR_PORTFOLIO_MANAGER";
const PM_STALE_DAYS = 30;

export const PORTFOLIO_MANAGER_QA_CODES = {
  missingRequiredMeters: "MISSING_REQUIRED_METERS",
  stalePmData: "STALE_PM_DATA",
  propertyLinkageMissing: "PROPERTY_LINKAGE_MISSING",
  propertyLinkageMismatch: "PROPERTY_LINKAGE_MISMATCH",
  missingPmSharingState: "MISSING_PM_SHARING_STATE",
  missingCoverage: "MISSING_COVERAGE",
  overlappingPeriods: "OVERLAPPING_PERIODS",
} as const;

export type PortfolioManagerQaCode =
  (typeof PORTFOLIO_MANAGER_QA_CODES)[keyof typeof PORTFOLIO_MANAGER_QA_CODES];

export interface PortfolioManagerQaFinding {
  code: PortfolioManagerQaCode;
  status: "PASS" | "FAIL";
  severity: "INFO" | "ERROR";
  message: string;
  metadata?: Record<string, unknown>;
}

export interface PortfolioManagerQaPayload {
  evaluatedAt: string;
  reportingYear: number;
  status: "READY" | "ATTENTION";
  findings: PortfolioManagerQaFinding[];
}

type PortfolioManagerSyncClient = Pick<ESPM, "property" | "meter" | "consumption" | "metrics">;
type PortfolioManagerSyncStatus = "IDLE" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const parseMeterIds = parsePortfolioManagerMeterIds;
const parseMeterDetail = parsePortfolioManagerMeterDetail;
const parseConsumptionReadings = (raw: unknown): PortfolioManagerConsumptionReading[] =>
  parsePortfolioManagerConsumptionReadings(raw).readings;

function getDefaultReportingYear(now = new Date()) {
  return now.getUTCFullYear() - 1;
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizePeriodKey(
  meterId: string | null,
  meterType: MeterType,
  start: Date,
  end: Date,
) {
  return `${meterId ?? meterType}:${start.toISOString()}:${end.toISOString()}`;
}

function createInitialStepStatuses(
  propertyStatus: PortfolioManagerSyncStepStatus = "PENDING",
): Record<Exclude<PortfolioManagerSyncStep, "sync">, PortfolioManagerSyncStepStatus> {
  return {
    property: propertyStatus,
    meters: "PENDING",
    consumption: "PENDING",
    metrics: "PENDING",
    benchmarking: "PENDING",
  };
}

function toSyncErrorRecord(error: PortfolioManagerSyncErrorDetail) {
  return {
    step: error.step,
    message: error.message,
    retryable: error.retryable,
    errorCode: error.errorCode,
    statusCode: error.statusCode,
  };
}

function buildSyncErrorMetadata(input: {
  warnings: string[];
  errors: PortfolioManagerSyncErrorDetail[];
}) {
  const primary = input.errors[0] ?? null;
  return {
    message: primary?.message ?? (input.warnings[0] ?? null),
    failedStep: primary?.step ?? null,
    retryable: primary?.retryable ?? false,
    errorCode: primary?.errorCode ?? null,
    warnings: input.warnings,
    errors: input.errors.map(toSyncErrorRecord),
  };
}

function resolveFinalSyncStatus(
  stepStatuses: Record<Exclude<PortfolioManagerSyncStep, "sync">, PortfolioManagerSyncStepStatus>,
): PortfolioManagerSyncStatus {
  const statuses = Object.values(stepStatuses);
  const hasFailures = statuses.some((status) => status === "FAILED");
  const hasPartials = statuses.some((status) => status === "PARTIAL");
  const hasSuccessLike = statuses.some(
    (status) => status === "SUCCEEDED" || status === "PARTIAL",
  );

  if (hasFailures) {
    return hasSuccessLike ? "PARTIAL" : "FAILED";
  }

  if (hasPartials) {
    return "PARTIAL";
  }

  return "SUCCEEDED";
}

export function describePortfolioManagerSyncState(syncState: {
  status: PortfolioManagerSyncStatus;
  lastErrorMetadata: unknown;
  syncMetadata: unknown;
} | null): PortfolioManagerSyncDiagnostics | null {
  return summarizePortfolioManagerSyncState(syncState);
}

function determineScoreEligibility(
  metrics: PropertyMetrics | null,
  reasonsForNoScore: string[],
  currentValue: boolean | null,
) {
  if (metrics?.score != null) {
    return true;
  }

  const explicitlyIneligible = reasonsForNoScore.some((reason) =>
    /not eligible|cannot receive|ineligible/i.test(reason),
  );

  if (explicitlyIneligible) {
    return false;
  }

  return currentValue;
}

function hasUsableMetrics(metrics: PropertyMetrics | null) {
  if (!metrics) {
    return false;
  }

  return [
    metrics.score,
    metrics.siteTotal,
    metrics.sourceTotal,
    metrics.siteIntensity,
    metrics.sourceIntensity,
    metrics.weatherNormalizedSiteIntensity,
    metrics.weatherNormalizedSourceIntensity,
  ].some((value) => value != null);
}

function buildQaPayload(input: {
  reportingYear: number;
  building: {
    espmPropertyId: bigint | number | null;
    espmShareStatus: EspmShareStatus;
  };
  property: PortfolioManagerPropertySnapshot | null;
  activeLinkedMeters: number;
  lastSuccessfulSyncAt: Date | null;
  readiness: BenchmarkReadinessResult | null;
  evaluatedAt: Date;
}): PortfolioManagerQaPayload {
  const findings: PortfolioManagerQaFinding[] = [];

  if (!input.building.espmPropertyId) {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.propertyLinkageMissing,
      status: "FAIL",
      severity: "ERROR",
      message: "Portfolio Manager property linkage is missing.",
    });
  } else {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.propertyLinkageMissing,
      status: "PASS",
      severity: "INFO",
      message: "Portfolio Manager property linkage is present.",
      metadata: {
        espmPropertyId: String(input.building.espmPropertyId),
      },
    });
  }

  if (
    input.property?.propertyId != null &&
    input.building.espmPropertyId != null &&
    String(input.property.propertyId) !== String(input.building.espmPropertyId)
  ) {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.propertyLinkageMismatch,
      status: "FAIL",
      severity: "ERROR",
      message: "Portfolio Manager returned a property ID that does not match the linked building.",
      metadata: {
        linkedPropertyId: String(input.building.espmPropertyId),
        returnedPropertyId: String(input.property.propertyId),
      },
    });
  } else {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.propertyLinkageMismatch,
      status: "PASS",
      severity: "INFO",
      message: "Portfolio Manager property linkage matches the linked building.",
    });
  }

  if (input.building.espmShareStatus !== "LINKED") {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.missingPmSharingState,
      status: "FAIL",
      severity: "ERROR",
      message: "Portfolio Manager sharing state is not linked.",
      metadata: {
        espmShareStatus: input.building.espmShareStatus,
      },
    });
  } else {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.missingPmSharingState,
      status: "PASS",
      severity: "INFO",
      message: "Portfolio Manager sharing state is linked.",
    });
  }

  if (input.activeLinkedMeters < 1) {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.missingRequiredMeters,
      status: "FAIL",
      severity: "ERROR",
      message: "No active linked Portfolio Manager meters were found for the building.",
    });
  } else {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.missingRequiredMeters,
      status: "PASS",
      severity: "INFO",
      message: "At least one active linked Portfolio Manager meter is present.",
      metadata: {
        activeLinkedMeters: input.activeLinkedMeters,
      },
    });
  }

  const staleCutoff = addUtcDays(input.evaluatedAt, -PM_STALE_DAYS);
  if (!input.lastSuccessfulSyncAt || input.lastSuccessfulSyncAt < staleCutoff) {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.stalePmData,
      status: "FAIL",
      severity: "ERROR",
      message: "Portfolio Manager sync data is stale.",
      metadata: {
        lastSuccessfulSyncAt: input.lastSuccessfulSyncAt?.toISOString() ?? null,
        freshnessDays: PM_STALE_DAYS,
      },
    });
  } else {
    findings.push({
      code: PORTFOLIO_MANAGER_QA_CODES.stalePmData,
      status: "PASS",
      severity: "INFO",
      message: "Portfolio Manager sync data is fresh enough for benchmarking automation.",
      metadata: {
        lastSuccessfulSyncAt: input.lastSuccessfulSyncAt.toISOString(),
        freshnessDays: PM_STALE_DAYS,
      },
    });
  }

  const readinessFinding = (code: string) =>
    input.readiness?.findings.find((finding) => finding.code === code) ?? null;

  const missingCoverage = readinessFinding("MISSING_COVERAGE");
  findings.push({
    code: PORTFOLIO_MANAGER_QA_CODES.missingCoverage,
    status: missingCoverage?.status === "FAIL" ? "FAIL" : "PASS",
    severity: missingCoverage?.status === "FAIL" ? "ERROR" : "INFO",
    message:
      missingCoverage?.message ??
      "Reporting-year utility coverage has not yet been evaluated.",
    metadata: missingCoverage?.metadata,
  });

  const overlappingBills = readinessFinding("OVERLAPPING_BILLS");
  findings.push({
    code: PORTFOLIO_MANAGER_QA_CODES.overlappingPeriods,
    status: overlappingBills?.status === "FAIL" ? "FAIL" : "PASS",
    severity: overlappingBills?.status === "FAIL" ? "ERROR" : "INFO",
    message:
      overlappingBills?.message ??
      "Billing-period overlap has not yet been evaluated.",
    metadata: overlappingBills?.metadata,
  });

  const hasBlockingFailures = findings.some((finding) => finding.status === "FAIL");

  return {
    evaluatedAt: input.evaluatedAt.toISOString(),
    reportingYear: input.reportingYear,
    status: hasBlockingFailures ? "ATTENTION" : "READY",
    findings,
  };
}

async function persistSyncState(input: {
  organizationId: string;
  buildingId: string;
  status: PortfolioManagerSyncStatus;
  lastAttemptedSyncAt: Date;
  lastSuccessfulSyncAt?: Date | null;
  lastErrorMetadata?: Record<string, unknown>;
  sourceMetadata?: Record<string, unknown>;
  syncMetadata?: Record<string, unknown>;
  qaPayload?: PortfolioManagerQaPayload | Record<string, unknown>;
}) {
  return prisma.portfolioManagerSyncState.upsert({
    where: {
      buildingId: input.buildingId,
    },
    create: {
      organizationId: input.organizationId,
      buildingId: input.buildingId,
      status: input.status,
      lastAttemptedSyncAt: input.lastAttemptedSyncAt,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? null,
      lastErrorMetadata: toJson(input.lastErrorMetadata ?? {}),
      sourceMetadata: toJson(input.sourceMetadata ?? {}),
      syncMetadata: toJson(input.syncMetadata ?? {}),
      qaPayload: toJson(input.qaPayload ?? {}),
    },
    update: {
      status: input.status,
      lastAttemptedSyncAt: input.lastAttemptedSyncAt,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? undefined,
      lastErrorMetadata: toJson(input.lastErrorMetadata ?? {}),
      sourceMetadata: toJson(input.sourceMetadata ?? {}),
      syncMetadata: toJson(input.syncMetadata ?? {}),
      qaPayload: toJson(input.qaPayload ?? {}),
    },
  });
}

export async function getPortfolioManagerSyncState(params: {
  organizationId: string;
  buildingId: string;
}) {
  const syncState = await prisma.portfolioManagerSyncState.findFirst({
    where: {
      organizationId: params.organizationId,
      buildingId: params.buildingId,
    },
  });

  if (!syncState) {
    return null;
  }

  return {
    ...syncState,
    diagnostics: describePortfolioManagerSyncState(syncState),
  };
}

export async function listPortfolioBenchmarkReadiness(params: {
  organizationId: string;
  reportingYear?: number;
  limit?: number;
}) {
  const reportingYear = params.reportingYear ?? getDefaultReportingYear();
  const limit = params.limit ?? 50;

  const buildings = await prisma.building.findMany({
    where: {
      organizationId: params.organizationId,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      address: true,
      espmPropertyId: true,
      espmShareStatus: true,
    },
  });

  const buildingIds = buildings.map((building) => building.id);
  const [syncStates, submissions] = await Promise.all([
    prisma.portfolioManagerSyncState.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: { in: buildingIds },
      },
    }),
    prisma.benchmarkSubmission.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: { in: buildingIds },
        reportingYear,
      },
      include: {
        complianceRun: true,
      },
    }),
  ]);

  const syncStateByBuilding = new Map<string, (typeof syncStates)[number]>(
    syncStates.map((state) => [state.buildingId, state]),
  );
  const submissionByBuilding = new Map<string, (typeof submissions)[number]>(
    submissions.map((submission) => [submission.buildingId, submission]),
  );

  return buildings.map((building) => {
    const syncState = syncStateByBuilding.get(building.id) ?? null;
    const submission = submissionByBuilding.get(building.id) ?? null;
    const submissionPayload = toRecord(submission?.submissionPayload);
    const readiness = toRecord(submissionPayload["readiness"]);

    return {
      building,
      reportingYear,
      syncState: syncState
        ? {
            ...syncState,
            diagnostics: describePortfolioManagerSyncState(syncState),
          }
        : null,
      benchmarkSubmission: submission,
      readiness: Object.keys(readiness).length > 0 ? readiness : null,
    };
  });
}

async function syncPortfolioManagerForBuildingLegacy(params: {
  organizationId: string;
  buildingId: string;
  reportingYear?: number;
  espmClient: PortfolioManagerSyncClient;
  producedByType: ActorType;
  producedById?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const reportingYear = params.reportingYear ?? getDefaultReportingYear(now);

  const building = await prisma.building.findFirst({
    where: {
      id: params.buildingId,
      organizationId: params.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      address: true,
      grossSquareFeet: true,
      yearBuilt: true,
      doeeBuildingId: true,
      bepsTargetScore: true,
      targetEui: true,
      espmPropertyId: true,
      espmShareStatus: true,
      isEnergyStarScoreEligible: true,
    },
  });

  if (!building) {
    throw new Error("Building not found for Portfolio Manager sync");
  }

  const existingSubmission = await prisma.benchmarkSubmission.findUnique({
    where: {
      buildingId_reportingYear: {
        buildingId: building.id,
        reportingYear,
      },
    },
    select: {
      status: true,
      submissionPayload: true,
    },
  });

  await persistSyncState({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    status: "RUNNING",
    lastAttemptedSyncAt: now,
    sourceMetadata: {
      system: PM_SYNC_SYSTEM,
      reportingYear,
    },
    syncMetadata: {
      stepStatuses: {
        property: "RUNNING",
        meters: "PENDING",
        consumption: "PENDING",
        metrics: "PENDING",
        benchmarking: "PENDING",
      },
    },
  });

  const stepStatuses: Record<string, string> = {
    property: "PENDING",
    meters: "PENDING",
    consumption: "PENDING",
    metrics: "PENDING",
    benchmarking: "PENDING",
  };
  const stepErrors: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  let propertySnapshot: PortfolioManagerPropertySnapshot | null = null;
  let meterSnapshots: PortfolioManagerMeterSnapshot[] = [];
  let metricsSummary: PropertyMetrics | null = null;
  let readiness: BenchmarkReadinessResult | null = null;
  let benchmarkSubmission: {
    id: string;
    status: BenchmarkSubmissionStatus;
    complianceRunId: string | null;
  } | null = null;
  let snapshotId: string | null = null;
  let activeLinkedMeters = 0;
  let readingsCreated = 0;
  let readingsUpdated = 0;
  let readingsSkipped = 0;

  const propertyId = building.espmPropertyId ? Number(building.espmPropertyId) : null;

  if (!propertyId) {
    const qaPayload = buildQaPayload({
      reportingYear,
      building,
      property: null,
      activeLinkedMeters: 0,
      lastSuccessfulSyncAt: null,
      readiness: null,
      evaluatedAt: now,
    });

    const syncState = await persistSyncState({
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      status: "FAILED",
      lastAttemptedSyncAt: now,
      lastErrorMetadata: {
        step: "property",
        message: "Portfolio Manager property linkage is missing.",
      },
      sourceMetadata: {
        system: PM_SYNC_SYSTEM,
        reportingYear,
      },
      syncMetadata: {
        reportingYear,
        stepStatuses: {
          property: "FAILED",
          meters: "SKIPPED",
          consumption: "SKIPPED",
          metrics: "SKIPPED",
          benchmarking: "SKIPPED",
        },
      },
      qaPayload,
    });

    return {
      syncState,
      property: null,
      meters: [],
      metrics: null,
      readiness: null,
      benchmarkSubmission: null,
    };
  }

  try {
    try {
      const propertyResponse = await params.espmClient.property.getProperty(propertyId);
      propertySnapshot = parsePortfolioManagerProperty(propertyResponse);

      const buildingUpdate: Record<string, unknown> = {};
      if (
        propertySnapshot.grossFloorArea != null &&
        propertySnapshot.grossFloorArea > 0 &&
        Math.round(propertySnapshot.grossFloorArea) !== building.grossSquareFeet
      ) {
        buildingUpdate["grossSquareFeet"] = Math.round(propertySnapshot.grossFloorArea);
      }
      if (
        propertySnapshot.yearBuilt != null &&
        propertySnapshot.yearBuilt > 0 &&
        propertySnapshot.yearBuilt !== building.yearBuilt
      ) {
        buildingUpdate["yearBuilt"] = propertySnapshot.yearBuilt;
      }

      if (Object.keys(buildingUpdate).length > 0) {
        await prisma.building.update({
          where: { id: building.id },
          data: buildingUpdate,
        });
      }

      stepStatuses.property = "SUCCEEDED";
    } catch (error) {
      stepStatuses.property = "FAILED";
      stepStatuses.meters = "SKIPPED";
      stepStatuses.consumption = "SKIPPED";
      stepStatuses.metrics = "SKIPPED";
      stepStatuses.benchmarking = "SKIPPED";
      const message = error instanceof Error ? error.message : String(error);
      stepErrors.push({
        step: "property",
        message,
      });
      throw error;
    }

    try {
      const meterIds = parseMeterIds(await params.espmClient.meter.listMeters(propertyId));
      meterSnapshots = await Promise.all(
        meterIds.map(async (meterId) =>
          parseMeterDetail(await params.espmClient.meter.getMeter(meterId), meterId),
        ),
      );

      activeLinkedMeters = meterSnapshots.filter((meter) => meter.inUse).length;

      for (const meter of meterSnapshots) {
        const existingMeter = await prisma.meter.findFirst({
          where: {
            buildingId: building.id,
            organizationId: params.organizationId,
            espmMeterId: BigInt(meter.meterId),
          },
          select: { id: true },
        });

        if (existingMeter) {
          await prisma.meter.update({
            where: { id: existingMeter.id },
            data: {
              meterType: meter.meterType,
              name: meter.name,
              unit: meter.unit,
              isActive: meter.inUse,
            },
          });
        } else {
          await prisma.meter.create({
            data: {
              buildingId: building.id,
              organizationId: params.organizationId,
              espmMeterId: BigInt(meter.meterId),
              meterType: meter.meterType,
              name: meter.name,
              unit: meter.unit,
              isActive: meter.inUse,
            },
          });
        }
      }

      stepStatuses.meters = "SUCCEEDED";
    } catch (error) {
      stepStatuses.meters = "FAILED";
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Meter refresh failed: ${message}`);
      stepErrors.push({
        step: "meters",
        message,
      });
    }

    try {
      const periodStart = new Date(Date.UTC(reportingYear, 0, 1));
      const periodEnd = new Date(Date.UTC(reportingYear, 11, 31));
      const localMeters = await prisma.meter.findMany({
        where: {
          buildingId: building.id,
          organizationId: params.organizationId,
          espmMeterId: { not: null },
        },
        select: {
          id: true,
          espmMeterId: true,
          meterType: true,
          unit: true,
          name: true,
        },
      });

      const existingReadings = await prisma.energyReading.findMany({
        where: {
          buildingId: building.id,
          organizationId: params.organizationId,
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
        },
        select: {
          id: true,
          meterId: true,
          meterType: true,
          periodStart: true,
          periodEnd: true,
          source: true,
        },
      });

      const existingByKey = new Map(
        existingReadings.map((reading) => [
          normalizePeriodKey(
            reading.meterId,
            reading.meterType,
            reading.periodStart,
            reading.periodEnd,
          ),
          reading,
        ]),
      );

      for (const meter of localMeters) {
        const espmMeterId = meter.espmMeterId ? Number(meter.espmMeterId) : null;
        if (!espmMeterId) {
          continue;
        }

        const consumptionRows = parseConsumptionReadings(
          await params.espmClient.consumption.getConsumptionData(espmMeterId, {
            startDate: periodStart.toISOString().slice(0, 10),
            endDate: periodEnd.toISOString().slice(0, 10),
          }),
        );

        for (const row of consumptionRows) {
          const factor = getConversionFactor(meter.unit);
          const key = normalizePeriodKey(meter.id, meter.meterType, row.periodStart, row.periodEnd);
          const existing = existingByKey.get(key);

          if (factor == null) {
            warnings.push(`Skipped ESPM reading for meter ${meter.id}: unsupported unit ${meter.unit}`);
            continue;
          }

          const payload = {
            sourceSystem: PM_SYNC_SYSTEM,
            espmMeterId,
            meterName: meter.name,
            estimatedValue: row.estimatedValue,
            syncedAt: now.toISOString(),
          };

          if (existing?.source === "ESPM_SYNC") {
            await prisma.energyReading.update({
              where: { id: existing.id },
              data: {
                consumption: row.usage,
                consumptionKbtu: row.usage * factor,
                cost: row.cost,
                rawPayload: toJson(payload),
              },
            });
            readingsUpdated += 1;
            continue;
          }

          if (existing) {
            readingsSkipped += 1;
            continue;
          }

          await prisma.energyReading.create({
            data: {
              buildingId: building.id,
              organizationId: params.organizationId,
              source: "ESPM_SYNC",
              meterType: meter.meterType,
              meterId: meter.id,
              periodStart: row.periodStart,
              periodEnd: row.periodEnd,
              consumption: row.usage,
              unit: meter.unit,
              consumptionKbtu: row.usage * factor,
              cost: row.cost,
              isVerified: true,
              rawPayload: toJson(payload),
            },
          });
          readingsCreated += 1;
        }
      }

      stepStatuses.consumption = "SUCCEEDED";
    } catch (error) {
      stepStatuses.consumption = "FAILED";
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Consumption refresh failed: ${message}`);
      stepErrors.push({
        step: "consumption",
        message,
      });
    }

    try {
      metricsSummary = await params.espmClient.metrics.getLatestAvailablePropertyMetrics(
        propertyId,
        reportingYear,
        12,
      );
      let reasonsForNoScore: string[] = [];
      try {
        reasonsForNoScore = await params.espmClient.metrics.getReasonsForNoScore(propertyId);
      } catch (error) {
        warnings.push(
          `Unable to refresh Portfolio Manager no-score reasons: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const nextScoreEligibility = determineScoreEligibility(
        metricsSummary,
        reasonsForNoScore,
        building.isEnergyStarScoreEligible,
      );

      if (nextScoreEligibility !== building.isEnergyStarScoreEligible) {
        await prisma.building.update({
          where: { id: building.id },
          data: {
            isEnergyStarScoreEligible: nextScoreEligibility,
          },
        });
      }

      if (metricsSummary.siteIntensity != null && metricsSummary.sourceIntensity != null) {
        const snapshotData = buildSnapshotData({
          buildingId: building.id,
          organizationId: params.organizationId,
          grossSquareFeet:
            propertySnapshot?.grossFloorArea != null
              ? Math.round(propertySnapshot.grossFloorArea)
              : building.grossSquareFeet,
          bepsTargetScore: building.bepsTargetScore,
          energyStarScore: metricsSummary.score,
          siteEui: metricsSummary.siteIntensity,
          sourceEui: metricsSummary.sourceIntensity,
          weatherNormalizedSiteEui: metricsSummary.weatherNormalizedSiteIntensity,
          weatherNormalizedSourceEui: metricsSummary.weatherNormalizedSourceIntensity,
          dataQualityScore: undefined,
        });

        const snapshot = await prisma.complianceSnapshot.create({
          data: {
            buildingId: building.id,
            organizationId: params.organizationId,
            snapshotDate: now,
            triggerType: "ESPM_SYNC",
            energyStarScore: snapshotData.energyStarScore,
            siteEui: snapshotData.siteEui,
            sourceEui: snapshotData.sourceEui,
            weatherNormalizedSiteEui: snapshotData.weatherNormalizedSiteEui,
            weatherNormalizedSourceEui: snapshotData.weatherNormalizedSourceEui,
            complianceStatus: snapshotData.complianceStatus,
            complianceGap: snapshotData.complianceGap,
            estimatedPenalty: snapshotData.estimatedPenalty,
            dataQualityScore: null,
            targetScore: building.bepsTargetScore,
            targetEui: building.targetEui,
            penaltyInputsJson: toJson({
              sourceSystem: PM_SYNC_SYSTEM,
              reportingYear,
              scoreEligibility: nextScoreEligibility,
            }),
          },
          select: { id: true },
        });

        snapshotId = snapshot.id;
      }

      stepStatuses.metrics = "SUCCEEDED";
    } catch (error) {
      stepStatuses.metrics = "FAILED";
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Metrics refresh failed: ${message}`);
      stepErrors.push({
        step: "metrics",
        message,
      });
    }

    try {
      const submissionContext = toRecord(existingSubmission?.submissionPayload)["benchmarkingContext"];
      const autopilot = await evaluateAndUpsertBenchmarkSubmission({
        organizationId: params.organizationId,
        buildingId: building.id,
        reportingYear,
        submissionContext: {
          gfaCorrectionRequired:
            toRecord(submissionContext)["gfaCorrectionRequired"] === true,
        },
        explicitStatus:
          (existingSubmission?.status as BenchmarkSubmissionStatus | null | undefined) ?? null,
        producedByType: params.producedByType,
        producedById: params.producedById ?? null,
        additionalSubmissionPayload: {
          autopilot: {
            sourceSystem: PM_SYNC_SYSTEM,
            syncedAt: now.toISOString(),
          },
        },
      });

      readiness = autopilot.readiness;
      benchmarkSubmission = {
        id: autopilot.benchmarkSubmission.id,
        status: autopilot.benchmarkSubmission.status,
        complianceRunId: autopilot.benchmarkSubmission.complianceRunId,
      };
      stepStatuses.benchmarking = "SUCCEEDED";
    } catch (error) {
      stepStatuses.benchmarking = "FAILED";
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Benchmarking autopilot failed: ${message}`);
      stepErrors.push({
        step: "benchmarking",
        message,
      });
    }

    const successLike = Object.values(stepStatuses).some((status) => status === "SUCCEEDED");
    const hasFailures = Object.values(stepStatuses).some((status) => status === "FAILED");
    const finalStatus: PortfolioManagerSyncStatus =
      hasFailures && successLike ? "PARTIAL" : hasFailures ? "FAILED" : "SUCCEEDED";
    const qaPayload = buildQaPayload({
      reportingYear,
      building,
      property: propertySnapshot,
      activeLinkedMeters,
      lastSuccessfulSyncAt: finalStatus === "FAILED" ? null : now,
      readiness,
      evaluatedAt: now,
    });

    const syncState = await persistSyncState({
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      status: finalStatus,
      lastAttemptedSyncAt: now,
      lastSuccessfulSyncAt: finalStatus === "FAILED" ? null : now,
      lastErrorMetadata: {
        warnings,
        errors: stepErrors,
      },
      sourceMetadata: {
        system: PM_SYNC_SYSTEM,
        property: propertySnapshot,
        metrics: metricsSummary,
      },
      syncMetadata: {
        reportingYear,
        stepStatuses,
        readingsCreated,
        readingsUpdated,
        readingsSkipped,
        activeLinkedMeters,
        snapshotId,
        benchmarkSubmissionId: benchmarkSubmission?.id ?? null,
      },
      qaPayload,
    });

    return {
      syncState,
      property: propertySnapshot,
      meters: meterSnapshots,
      metrics: metricsSummary,
      readiness,
      benchmarkSubmission,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const qaPayload = buildQaPayload({
      reportingYear,
      building,
      property: propertySnapshot,
      activeLinkedMeters,
      lastSuccessfulSyncAt: null,
      readiness,
      evaluatedAt: now,
    });

    const syncState = await persistSyncState({
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      status: "FAILED",
      lastAttemptedSyncAt: now,
      lastErrorMetadata: {
        warnings,
        errors: [
          ...stepErrors,
          {
            step: "sync",
            message,
          },
        ],
      },
      sourceMetadata: {
        system: PM_SYNC_SYSTEM,
        property: propertySnapshot,
      },
      syncMetadata: {
        reportingYear,
        stepStatuses,
      },
      qaPayload,
    });

    return {
      syncState,
      property: propertySnapshot,
      meters: meterSnapshots,
      metrics: metricsSummary,
      readiness,
      benchmarkSubmission,
    };
  }
}

export async function syncPortfolioManagerForBuilding(params: {
  organizationId: string;
  buildingId: string;
  reportingYear?: number;
  espmClient: PortfolioManagerSyncClient;
  producedByType: ActorType;
  producedById?: string | null;
  requestId?: string | null;
  now?: Date;
}) {
  return syncPortfolioManagerForBuildingReliable(params);
}
