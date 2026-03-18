import type {
  ActorType,
  BenchmarkSubmission,
  DataIssueSeverity,
  DataIssueSource,
  DataIssueStatus,
  DataIssueType,
  FilingRecord,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { createAuditLog } from "@/server/lib/audit-log";
import { NotFoundError, ValidationError, WorkflowStateError } from "@/server/lib/errors";
import { createLogger } from "@/server/lib/logger";
import type {
  ComplianceEngineQaIssue,
  ComplianceEngineResult,
} from "./compliance-engine";

export const BUILDING_READINESS_STATE = {
  DATA_INCOMPLETE: "DATA_INCOMPLETE",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
  READY_TO_SUBMIT: "READY_TO_SUBMIT",
  SUBMITTED: "SUBMITTED",
} as const;

export type BuildingReadinessState =
  (typeof BUILDING_READINESS_STATE)[keyof typeof BUILDING_READINESS_STATE];

type DataIssueStatusFilter = "ACTIVE" | "ALL";
type IssueRefreshScope = "BENCHMARKING" | "BEPS";

type IssueCandidate = {
  issueKey: string;
  reportingYear: number | null;
  issueType: DataIssueType;
  severity: DataIssueSeverity;
  title: string;
  description: string;
  requiredAction: string;
  source: DataIssueSource;
  metadata: Record<string, unknown>;
};

type VerificationIssueInput = {
  category: string;
  status: string;
  explanation: string;
  evidenceRefs: string[];
};

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

type ReadinessInput = {
  buildingId: string;
  openIssues: Array<{
    id: string;
    issueType: DataIssueType;
    severity: DataIssueSeverity;
    status: DataIssueStatus;
    title: string;
    description: string;
    requiredAction: string;
  }>;
  latestBenchmarkSubmission: Pick<
    BenchmarkSubmission,
    "id" | "status" | "reportingYear" | "complianceRunId"
  > | null;
  latestBepsFiling: Pick<
    FilingRecord,
    "id" | "status" | "filingYear" | "complianceRunId"
  > | null;
  latestBepsPacketStatus: string | null;
};

export interface BuildingReadinessSummary {
  state: BuildingReadinessState;
  blockingIssueCount: number;
  warningIssueCount: number;
  nextAction: {
    title: string;
    reason: string;
    href: string;
  };
}

export interface BuildingIssueSummary extends BuildingReadinessSummary {
  buildingId: string;
  openIssues: Array<{
    id: string;
    reportingYear: number | null;
    issueType: DataIssueType;
    severity: DataIssueSeverity;
    status: DataIssueStatus;
    title: string;
    description: string;
    requiredAction: string;
    source: DataIssueSource;
    detectedAt: string;
    resolvedAt: string | null;
    metadata: Record<string, unknown>;
  }>;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asComplianceEngineResult(payload: unknown): ComplianceEngineResult | null {
  const record = toRecord(payload);
  const engine = toRecord(record.complianceEngine ?? record.engineResult);

  if (!engine || Object.keys(engine).length === 0) {
    return null;
  }

  return engine as unknown as ComplianceEngineResult;
}

function issueHref(buildingId: string, scope: IssueRefreshScope) {
  return `/buildings/${buildingId}#${scope === "BEPS" ? "beps" : "overview"}`;
}

function qaIssueDefinition(issueType: string) {
  switch (issueType) {
    case "MISSING_MONTHS":
      return {
        issueType: "MISSING_MONTHS" as const,
        severity: "BLOCKING" as const,
        title: "Missing reporting months",
        requiredAction:
          "Load the missing utility months for the reporting year and rerun readiness.",
      };
    case "OVERLAPPING_PERIODS":
      return {
        issueType: "OVERLAPPING_PERIODS" as const,
        severity: "BLOCKING" as const,
        title: "Overlapping billing periods",
        requiredAction:
          "Correct the overlapping billing periods and rerun readiness.",
      };
    case "INCOMPLETE_TWELVE_MONTH_COVERAGE":
      return {
        issueType: "INCOMPLETE_TWELVE_MONTH_COVERAGE" as const,
        severity: "BLOCKING" as const,
        title: "Incomplete annual coverage",
        requiredAction:
          "Bring the building to a full Jan 1-Dec 31 annual coverage set before review.",
      };
    case "NO_DIRECT_YEAR_READINGS":
      return {
        issueType: "DIRECT_READINGS_MISSING" as const,
        severity: "WARNING" as const,
        title: "Direct annual readings missing",
        requiredAction:
          "Confirm the direct-year readings or document why canonical metrics are being used.",
      };
    case "UNRESOLVED_REPORTING_YEAR":
      return {
        issueType: "DIRECT_READINGS_MISSING" as const,
        severity: "WARNING" as const,
        title: "Reporting year could not be resolved",
        requiredAction:
          "Confirm the correct reporting year inputs and rerun the compliance evaluation.",
      };
    default:
      return null;
  }
}

function verificationIssueDefinition(item: Pick<VerificationIssueInput, "category" | "status">) {
  switch (item.category) {
    case "PROPERTY_METADATA":
      return {
        issueType: "BUILDING_METADATA_INCOMPLETE" as const,
        severity: item.status === "FAIL" ? ("BLOCKING" as const) : ("WARNING" as const),
        title: "Building metadata needs attention",
        requiredAction:
          "Complete or confirm the building identity and property type details.",
      };
    case "GFA":
      return {
        issueType: "GFA_SUPPORT_MISSING" as const,
        severity: item.status === "FAIL" ? ("BLOCKING" as const) : ("WARNING" as const),
        title: "Gross floor area support is missing",
        requiredAction:
          "Attach gross floor area support or area analysis evidence and rerun verification.",
      };
    case "METER_COMPLETENESS":
      return {
        issueType: "METER_MAPPING_MISSING" as const,
        severity: item.status === "FAIL" ? ("BLOCKING" as const) : ("WARNING" as const),
        title: "Meter mapping is incomplete",
        requiredAction:
          "Complete the meter roster and confirm annual readings for every active meter.",
      };
    case "METRIC_AVAILABILITY":
      return {
        issueType: "METRIC_AVAILABILITY_MISSING" as const,
        severity: "BLOCKING" as const,
        title: "Benchmarking metrics are missing",
        requiredAction:
          "Refresh or load the missing score or source EUI inputs before review.",
      };
    case "PM_LINKAGE":
      return {
        issueType: "PM_SYNC_REQUIRED" as const,
        severity: item.status === "FAIL" ? ("BLOCKING" as const) : ("WARNING" as const),
        title: "Portfolio Manager linkage needs attention",
        requiredAction:
          "Repair Portfolio Manager access or rerun sync before moving to review.",
      };
    case "DQC":
      return {
        issueType: "DQC_SUPPORT_MISSING" as const,
        severity: "WARNING" as const,
        title: "Data Quality Checker support is missing",
        requiredAction:
          "Attach Data Quality Checker support or document verifier follow-up.",
      };
    default:
      return null;
  }
}

function buildQaIssueCandidates(input: {
  scope: IssueRefreshScope;
  reportingYear: number;
  qaIssues: ComplianceEngineQaIssue[];
}) {
  return input.qaIssues
    .map((qaIssue) => {
      const definition = qaIssueDefinition(qaIssue.issueType);
      if (!definition) {
        return null;
      }

      return {
        issueKey: `${input.scope.toLowerCase()}:${input.reportingYear}:${definition.issueType}`,
        reportingYear: input.reportingYear,
        issueType: definition.issueType,
        severity: definition.severity,
        title: definition.title,
        description: qaIssue.message,
        requiredAction: definition.requiredAction,
        source: "QA" as const,
        metadata: {
          scope: input.scope,
          qaIssueType: qaIssue.issueType,
          qaDetails: qaIssue.details,
        },
      } satisfies IssueCandidate;
    })
    .filter(isPresent);
}

function buildVerificationIssueCandidates(input: {
  reportingYear: number;
  items: VerificationIssueInput[];
}) {
  return input.items
    .filter((item) => item.status !== "PASS" && item.category !== "DATA_COVERAGE")
    .map((item) => {
      const definition = verificationIssueDefinition(item);
      if (!definition) {
        return null;
      }

      return {
        issueKey: `benchmarking:${input.reportingYear}:${definition.issueType}`,
        reportingYear: input.reportingYear,
        issueType: definition.issueType,
        severity: definition.severity,
        title: definition.title,
        description: item.explanation,
        requiredAction: definition.requiredAction,
        source: "QA" as const,
        metadata: {
          scope: "BENCHMARKING",
          verificationCategory: item.category,
          verificationStatus: item.status,
          evidenceRefs: item.evidenceRefs,
        },
      } satisfies IssueCandidate;
    })
    .filter(isPresent);
}

function isActiveIssue(status: DataIssueStatus) {
  return status === "OPEN" || status === "IN_PROGRESS";
}

function deriveReadinessState(input: ReadinessInput): BuildingReadinessSummary {
  const activeIssues = input.openIssues.filter((issue) => isActiveIssue(issue.status));
  const blockingIssues = activeIssues.filter((issue) => issue.severity === "BLOCKING");
  const warningIssues = activeIssues.filter((issue) => issue.severity === "WARNING");
  const href = `/buildings/${input.buildingId}#overview`;

  if (blockingIssues.length > 0) {
    const issue = blockingIssues[0];
    return {
      state: BUILDING_READINESS_STATE.DATA_INCOMPLETE,
      blockingIssueCount: blockingIssues.length,
      warningIssueCount: warningIssues.length,
      nextAction: {
        title: issue.requiredAction,
        reason: issue.description,
        href,
      },
    };
  }

  if (
    input.latestBepsFiling?.status === "FILED" ||
    input.latestBepsFiling?.status === "ACCEPTED" ||
    input.latestBenchmarkSubmission?.status === "SUBMITTED" ||
    input.latestBenchmarkSubmission?.status === "ACCEPTED"
  ) {
    return {
      state: BUILDING_READINESS_STATE.SUBMITTED,
      blockingIssueCount: 0,
      warningIssueCount: warningIssues.length,
      nextAction: {
        title: "Monitor submission outcome",
        reason: "The latest submission has already been recorded for this building.",
        href,
      },
    };
  }

  if (
    input.latestBepsFiling?.status === "GENERATED" ||
    input.latestBepsPacketStatus === "GENERATED" ||
    input.latestBepsPacketStatus === "FINALIZED" ||
    input.latestBenchmarkSubmission?.status === "READY"
  ) {
    return {
      state: BUILDING_READINESS_STATE.READY_TO_SUBMIT,
      blockingIssueCount: 0,
      warningIssueCount: warningIssues.length,
      nextAction: {
        title:
          input.latestBepsFiling?.status === "GENERATED" ||
          input.latestBepsPacketStatus === "GENERATED" ||
          input.latestBepsPacketStatus === "FINALIZED"
            ? "Submit the BEPS filing"
            : "Submit the benchmarking package",
        reason:
          input.latestBepsFiling?.status === "GENERATED" ||
          input.latestBepsPacketStatus === "GENERATED" ||
          input.latestBepsPacketStatus === "FINALIZED"
            ? "A filing-ready BEPS record exists and no blocking data issues remain."
            : "Benchmarking is ready and no blocking data issues remain.",
        href: issueHref(
          input.buildingId,
          input.latestBepsFiling?.status === "GENERATED" ||
            input.latestBepsPacketStatus === "GENERATED" ||
            input.latestBepsPacketStatus === "FINALIZED"
            ? "BEPS"
            : "BENCHMARKING",
        ),
      },
    };
  }

  return {
    state: BUILDING_READINESS_STATE.READY_FOR_REVIEW,
    blockingIssueCount: 0,
    warningIssueCount: warningIssues.length,
    nextAction: {
      title:
        input.latestBepsFiling?.complianceRunId || input.latestBenchmarkSubmission?.complianceRunId
          ? "Review the latest compliance result"
          : "Run the latest evaluation",
      reason:
        input.latestBepsFiling?.complianceRunId || input.latestBenchmarkSubmission?.complianceRunId
          ? "No blocking issues remain. Review the latest governed result before submission."
          : "The building no longer has blocking data issues, but a current evaluation still needs to be reviewed.",
      href:
        input.latestBepsFiling?.complianceRunId != null
          ? issueHref(input.buildingId, "BEPS")
          : issueHref(input.buildingId, "BENCHMARKING"),
    },
  };
}

async function syncIssueCandidates(params: {
  organizationId: string;
  buildingId: string;
  reportingYear: number;
  scope: IssueRefreshScope;
  candidates: IssueCandidate[];
  actorType: ActorType;
  actorId?: string | null;
  requestId?: string | null;
}) {
  const now = new Date();
  const scopePrefix = `${params.scope.toLowerCase()}:${params.reportingYear}:`;
  const existing = await prisma.dataIssue.findMany({
    where: {
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      issueKey: {
        startsWith: scopePrefix,
      },
    },
    orderBy: [{ detectedAt: "asc" }],
  });

  const existingByKey = new Map(existing.map((issue) => [issue.issueKey, issue]));
  const nextKeys = new Set(params.candidates.map((candidate) => candidate.issueKey));

  const createdIssueIds: string[] = [];
  const reopenedIssueIds: string[] = [];
  const resolvedIssueIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const candidate of params.candidates) {
      const current = existingByKey.get(candidate.issueKey);

      if (!current) {
        const created = await tx.dataIssue.create({
          data: {
            organizationId: params.organizationId,
            buildingId: params.buildingId,
            reportingYear: candidate.reportingYear,
            issueKey: candidate.issueKey,
            issueType: candidate.issueType,
            severity: candidate.severity,
            status: "OPEN",
            title: candidate.title,
            description: candidate.description,
            requiredAction: candidate.requiredAction,
            source: candidate.source,
            metadata: toInputJson(candidate.metadata),
            detectedAt: now,
          },
        });
        createdIssueIds.push(created.id);
        continue;
      }

      const shouldReopen =
        current.status === "RESOLVED" || current.status === "DISMISSED";

      const updated = await tx.dataIssue.update({
        where: { id: current.id },
        data: {
          reportingYear: candidate.reportingYear,
          issueType: candidate.issueType,
          severity: candidate.severity,
          status: shouldReopen
            ? "OPEN"
            : current.status === "IN_PROGRESS"
              ? "IN_PROGRESS"
              : "OPEN",
          title: candidate.title,
          description: candidate.description,
          requiredAction: candidate.requiredAction,
          source: candidate.source,
          metadata: toInputJson(candidate.metadata),
          detectedAt: shouldReopen ? now : current.detectedAt,
          resolvedAt: shouldReopen ? null : current.resolvedAt,
        },
      });

      if (shouldReopen) {
        reopenedIssueIds.push(updated.id);
      }
    }

    for (const current of existing) {
      if (nextKeys.has(current.issueKey)) {
        continue;
      }

      if (current.status === "OPEN" || current.status === "IN_PROGRESS") {
        const updated = await tx.dataIssue.update({
          where: { id: current.id },
          data: {
            status: "RESOLVED",
            resolvedAt: now,
          },
        });
        resolvedIssueIds.push(updated.id);
      }
    }
  });

  const refreshChanged =
    createdIssueIds.length > 0 ||
    reopenedIssueIds.length > 0 ||
    resolvedIssueIds.length > 0;

  if (refreshChanged) {
    await createAuditLog({
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      action: "DATA_ISSUES_REFRESHED",
      inputSnapshot: {
        scope: params.scope,
        reportingYear: params.reportingYear,
      },
      outputSnapshot: {
        createdIssueIds,
        reopenedIssueIds,
        resolvedIssueIds,
      },
      requestId: params.requestId ?? null,
    });
  }

  return {
    createdIssueIds,
    reopenedIssueIds,
    resolvedIssueIds,
    refreshChanged,
  };
}

async function getLatestSubmissionState(params: {
  organizationId: string;
  buildingId: string;
}) {
  const [openIssues, latestBenchmarkSubmission, latestBepsFiling] = await Promise.all([
    prisma.dataIssue.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        status: {
          in: ["OPEN", "IN_PROGRESS"],
        },
      },
      orderBy: [{ severity: "desc" }, { detectedAt: "asc" }],
    }),
    prisma.benchmarkSubmission.findFirst({
      where: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
      },
      orderBy: [{ reportingYear: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        status: true,
        reportingYear: true,
        complianceRunId: true,
      },
    }),
    prisma.filingRecord.findFirst({
      where: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        filingType: "BEPS_COMPLIANCE",
      },
      orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        status: true,
        filingYear: true,
        complianceRunId: true,
        packets: {
          orderBy: [{ generatedAt: "desc" }, { version: "desc" }],
          take: 1,
          select: {
            status: true,
          },
        },
      },
    }),
  ]);

  return {
    openIssues,
    latestBenchmarkSubmission,
    latestBepsFiling,
    latestBepsPacketStatus: latestBepsFiling?.packets[0]?.status ?? null,
  };
}

export async function getBuildingIssueSummary(params: {
  organizationId: string;
  buildingId: string;
}): Promise<BuildingIssueSummary> {
  const building = await prisma.building.findFirst({
    where: {
      id: params.buildingId,
      organizationId: params.organizationId,
    },
    select: { id: true },
  });

  if (!building) {
    throw new NotFoundError("Building not found");
  }

  const [issues, submissionState] = await Promise.all([
    prisma.dataIssue.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        status: {
          in: ["OPEN", "IN_PROGRESS", "DISMISSED", "RESOLVED"],
        },
      },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { detectedAt: "asc" }],
    }),
    getLatestSubmissionState(params),
  ]);

  const readiness = deriveReadinessState({
    buildingId: params.buildingId,
    openIssues: submissionState.openIssues,
    latestBenchmarkSubmission: submissionState.latestBenchmarkSubmission,
    latestBepsFiling: submissionState.latestBepsFiling,
    latestBepsPacketStatus: submissionState.latestBepsPacketStatus,
  });

  return {
    buildingId: params.buildingId,
    ...readiness,
    openIssues: issues.map((issue) => ({
      id: issue.id,
      reportingYear: issue.reportingYear,
      issueType: issue.issueType,
      severity: issue.severity,
      status: issue.status,
      title: issue.title,
      description: issue.description,
      requiredAction: issue.requiredAction,
      source: issue.source,
      detectedAt: issue.detectedAt.toISOString(),
      resolvedAt: issue.resolvedAt?.toISOString() ?? null,
      metadata: toRecord(issue.metadata),
    })),
  };
}

export async function listBuildingDataIssues(params: {
  organizationId: string;
  buildingId: string;
  status?: DataIssueStatusFilter;
}) {
  return prisma.dataIssue.findMany({
    where: {
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      ...(params.status === "ACTIVE"
        ? {
            status: {
              in: ["OPEN", "IN_PROGRESS"],
            },
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { detectedAt: "asc" }],
  });
}

export async function listPortfolioDataIssues(params: {
  organizationId: string;
  status?: DataIssueStatusFilter;
  limit?: number;
}) {
  return prisma.dataIssue.findMany({
    where: {
      organizationId: params.organizationId,
      ...(params.status === "ACTIVE"
        ? {
            status: {
              in: ["OPEN", "IN_PROGRESS"],
            },
          }
        : {}),
    },
    orderBy: [{ severity: "desc" }, { detectedAt: "asc" }],
    take: params.limit ?? 200,
  });
}

export async function refreshBenchmarkingDataIssues(params: {
  organizationId: string;
  buildingId: string;
  reportingYear: number;
  engineResult: ComplianceEngineResult;
  verification: {
    items: VerificationIssueInput[];
  };
  actorType: ActorType;
  actorId?: string | null;
  requestId?: string | null;
}) {
  const logger = createLogger({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    requestId: params.requestId ?? null,
    procedure: "dataIssues.refreshBenchmarking",
  });

  const previous = await getLatestSubmissionState(params);
  const previousReadiness = deriveReadinessState({
    buildingId: params.buildingId,
    openIssues: previous.openIssues,
    latestBenchmarkSubmission: previous.latestBenchmarkSubmission,
    latestBepsFiling: previous.latestBepsFiling,
    latestBepsPacketStatus: previous.latestBepsPacketStatus,
  });

  const candidates = [
    ...buildQaIssueCandidates({
      scope: "BENCHMARKING",
      reportingYear: params.reportingYear,
      qaIssues: params.engineResult.qa.issues,
    }),
    ...buildVerificationIssueCandidates({
      reportingYear: params.reportingYear,
      items: params.verification.items,
    }),
  ];

  const syncResult = await syncIssueCandidates({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    reportingYear: params.reportingYear,
    scope: "BENCHMARKING",
    candidates,
    actorType: params.actorType,
    actorId: params.actorId ?? null,
    requestId: params.requestId ?? null,
  });

  const next = await getLatestSubmissionState(params);
  const nextReadiness = deriveReadinessState({
    buildingId: params.buildingId,
    openIssues: next.openIssues,
    latestBenchmarkSubmission: next.latestBenchmarkSubmission,
    latestBepsFiling: next.latestBepsFiling,
    latestBepsPacketStatus: next.latestBepsPacketStatus,
  });

  if (previousReadiness.state !== nextReadiness.state) {
    await createAuditLog({
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      action: "BUILDING_READINESS_CHANGED",
      inputSnapshot: {
        previousState: previousReadiness.state,
      },
      outputSnapshot: {
        nextState: nextReadiness.state,
        reportingYear: params.reportingYear,
      },
      requestId: params.requestId ?? null,
    });
  }

  logger.info("Benchmarking data issues refreshed", {
    reportingYear: params.reportingYear,
    createdCount: syncResult.createdIssueIds.length,
    reopenedCount: syncResult.reopenedIssueIds.length,
    resolvedCount: syncResult.resolvedIssueIds.length,
    readinessState: nextReadiness.state,
  });

  return nextReadiness;
}

export async function refreshBepsDataIssues(params: {
  organizationId: string;
  buildingId: string;
  filingYear: number;
  engineResult: ComplianceEngineResult;
  actorType: ActorType;
  actorId?: string | null;
  requestId?: string | null;
}) {
  const logger = createLogger({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    requestId: params.requestId ?? null,
    procedure: "dataIssues.refreshBeps",
  });

  const previous = await getLatestSubmissionState(params);
  const previousReadiness = deriveReadinessState({
    buildingId: params.buildingId,
    openIssues: previous.openIssues,
    latestBenchmarkSubmission: previous.latestBenchmarkSubmission,
    latestBepsFiling: previous.latestBepsFiling,
    latestBepsPacketStatus: previous.latestBepsPacketStatus,
  });

  const candidates = buildQaIssueCandidates({
    scope: "BEPS",
    reportingYear: params.filingYear,
    qaIssues: params.engineResult.qa.issues,
  });

  const syncResult = await syncIssueCandidates({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    reportingYear: params.filingYear,
    scope: "BEPS",
    candidates,
    actorType: params.actorType,
    actorId: params.actorId ?? null,
    requestId: params.requestId ?? null,
  });

  const next = await getLatestSubmissionState(params);
  const nextReadiness = deriveReadinessState({
    buildingId: params.buildingId,
    openIssues: next.openIssues,
    latestBenchmarkSubmission: next.latestBenchmarkSubmission,
    latestBepsFiling: next.latestBepsFiling,
    latestBepsPacketStatus: next.latestBepsPacketStatus,
  });

  if (previousReadiness.state !== nextReadiness.state) {
    await createAuditLog({
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      action: "BUILDING_READINESS_CHANGED",
      inputSnapshot: {
        previousState: previousReadiness.state,
      },
      outputSnapshot: {
        nextState: nextReadiness.state,
        filingYear: params.filingYear,
      },
      requestId: params.requestId ?? null,
    });
  }

  logger.info("BEPS data issues refreshed", {
    filingYear: params.filingYear,
    createdCount: syncResult.createdIssueIds.length,
    reopenedCount: syncResult.reopenedIssueIds.length,
    resolvedCount: syncResult.resolvedIssueIds.length,
    readinessState: nextReadiness.state,
  });

  return nextReadiness;
}

export async function refreshBuildingIssuesAfterDataChange(params: {
  organizationId: string;
  buildingId: string;
  actorType: ActorType;
  actorId?: string | null;
  requestId?: string | null;
}) {
  const [latestBenchmarkSubmission, latestBepsFiling] = await Promise.all([
    prisma.benchmarkSubmission.findFirst({
      where: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
      },
      orderBy: [{ reportingYear: "desc" }, { updatedAt: "desc" }],
      select: {
        reportingYear: true,
        submissionPayload: true,
      },
    }),
    prisma.filingRecord.findFirst({
      where: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        filingType: "BEPS_COMPLIANCE",
      },
      orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
      select: {
        filingYear: true,
        filingPayload: true,
      },
    }),
  ]);

  if (latestBenchmarkSubmission) {
    const verificationItems = await prisma.verificationItemResult.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        reportingYear: latestBenchmarkSubmission.reportingYear,
      },
      orderBy: [{ createdAt: "asc" }],
    });

    const engineResult = asComplianceEngineResult(latestBenchmarkSubmission.submissionPayload);
    if (engineResult) {
      await refreshBenchmarkingDataIssues({
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        reportingYear: latestBenchmarkSubmission.reportingYear,
        engineResult,
        verification: { items: verificationItems },
        actorType: params.actorType,
        actorId: params.actorId ?? null,
        requestId: params.requestId ?? null,
      });
    }
  }

  if (latestBepsFiling?.filingYear != null) {
    const engineResult = asComplianceEngineResult(latestBepsFiling.filingPayload);
    if (engineResult) {
      await refreshBepsDataIssues({
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        filingYear: latestBepsFiling.filingYear,
        engineResult,
        actorType: params.actorType,
        actorId: params.actorId ?? null,
        requestId: params.requestId ?? null,
      });
    }
  }

  return getBuildingIssueSummary({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
  });
}

export async function updateDataIssueStatus(params: {
  organizationId: string;
  buildingId: string;
  issueId: string;
  nextStatus: Extract<DataIssueStatus, "IN_PROGRESS" | "RESOLVED" | "DISMISSED">;
  actorType: ActorType;
  actorId?: string | null;
  requestId?: string | null;
}) {
  const issue = await prisma.dataIssue.findFirst({
    where: {
      id: params.issueId,
      organizationId: params.organizationId,
      buildingId: params.buildingId,
    },
  });

  if (!issue) {
    throw new NotFoundError("Data issue not found");
  }

  if (params.nextStatus === "IN_PROGRESS") {
    if (issue.status === "RESOLVED" || issue.status === "DISMISSED") {
      throw new WorkflowStateError("Cannot move a closed issue back to in progress manually.");
    }
  }

  if (
    (params.nextStatus === "RESOLVED" || params.nextStatus === "DISMISSED") &&
    issue.severity === "BLOCKING"
  ) {
    throw new ValidationError(
      "Blocking issues must resolve through re-evaluation after the data condition is fixed.",
    );
  }

  const nextResolvedAt =
    params.nextStatus === "RESOLVED" || params.nextStatus === "DISMISSED"
      ? new Date()
      : null;

  const updated = await prisma.dataIssue.update({
    where: { id: issue.id },
    data: {
      status: params.nextStatus,
      resolvedAt: nextResolvedAt,
    },
  });

  await createAuditLog({
    actorType: params.actorType,
    actorId: params.actorId ?? null,
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    action: "DATA_ISSUE_STATUS_UPDATED",
    inputSnapshot: {
      issueId: issue.id,
      fromStatus: issue.status,
    },
    outputSnapshot: {
      toStatus: updated.status,
      issueType: updated.issueType,
    },
    requestId: params.requestId ?? null,
  });

  return updated;
}

export function deriveBuildingReadinessSummary(input: ReadinessInput) {
  return deriveReadinessState(input);
}
