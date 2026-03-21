import type {
  ActorType,
  GovernedReportType,
  Prisma,
  ReportArtifactExportFormat,
  ReportArtifactStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { hashDeterministicJson, stringifyDeterministicJson } from "@/server/lib/deterministic-json";

export interface GovernedReportArtifactLineage {
  penaltyRunId: string | null;
  benchmarkArtifactId: string | null;
  bepsArtifactId: string | null;
  benchmarkWorkflowId: string | null;
  bepsWorkflowId: string | null;
  benchmarkSourceRecordId: string | null;
  bepsSourceRecordId: string | null;
  lastReadinessEvaluatedAt: string | null;
  lastComplianceEvaluatedAt: string | null;
  lastArtifactGeneratedAt: string | null;
  lastArtifactFinalizedAt: string | null;
  lastSubmissionTransitionAt: string | null;
}

export interface ReportArtifactSummary {
  id: string;
  reportType: GovernedReportType;
  version: number;
  status: ReportArtifactStatus;
  reportHash: string;
  sourceSummaryHash: string;
  generatedAt: string;
  latestExportedAt: string | null;
  latestExportFormat: ReportArtifactExportFormat | null;
  createdByType: ActorType;
  createdById: string | null;
  sourceLineage: GovernedReportArtifactLineage;
}

export interface ReportArtifactRecord extends ReportArtifactSummary {
  payload: unknown;
}

export interface ReportArtifactWorkspace {
  buildingId: string;
  reportType: GovernedReportType;
  latestArtifact: ReportArtifactSummary | null;
  history: ReportArtifactSummary[];
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toLineage(value: unknown): GovernedReportArtifactLineage {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const readString = (key: keyof GovernedReportArtifactLineage) =>
    typeof record[key] === "string" ? (record[key] as string) : null;

  return {
    penaltyRunId: readString("penaltyRunId"),
    benchmarkArtifactId: readString("benchmarkArtifactId"),
    bepsArtifactId: readString("bepsArtifactId"),
    benchmarkWorkflowId: readString("benchmarkWorkflowId"),
    bepsWorkflowId: readString("bepsWorkflowId"),
    benchmarkSourceRecordId: readString("benchmarkSourceRecordId"),
    bepsSourceRecordId: readString("bepsSourceRecordId"),
    lastReadinessEvaluatedAt: readString("lastReadinessEvaluatedAt"),
    lastComplianceEvaluatedAt: readString("lastComplianceEvaluatedAt"),
    lastArtifactGeneratedAt: readString("lastArtifactGeneratedAt"),
    lastArtifactFinalizedAt: readString("lastArtifactFinalizedAt"),
    lastSubmissionTransitionAt: readString("lastSubmissionTransitionAt"),
  };
}

function mapArtifactSummary(record: {
  id: string;
  reportType: GovernedReportType;
  version: number;
  status: ReportArtifactStatus;
  reportHash: string;
  sourceSummaryHash: string;
  generatedAt: Date;
  latestExportedAt: Date | null;
  latestExportFormat: ReportArtifactExportFormat | null;
  createdByType: ActorType;
  createdById: string | null;
  sourceLineage: unknown;
}): ReportArtifactSummary {
  return {
    id: record.id,
    reportType: record.reportType,
    version: record.version,
    status: record.status,
    reportHash: record.reportHash,
    sourceSummaryHash: record.sourceSummaryHash,
    generatedAt: record.generatedAt.toISOString(),
    latestExportedAt: record.latestExportedAt?.toISOString() ?? null,
    latestExportFormat: record.latestExportFormat,
    createdByType: record.createdByType,
    createdById: record.createdById,
    sourceLineage: toLineage(record.sourceLineage),
  };
}

function mapArtifactRecord(record: {
  id: string;
  reportType: GovernedReportType;
  version: number;
  status: ReportArtifactStatus;
  reportHash: string;
  sourceSummaryHash: string;
  generatedAt: Date;
  latestExportedAt: Date | null;
  latestExportFormat: ReportArtifactExportFormat | null;
  createdByType: ActorType;
  createdById: string | null;
  sourceLineage: unknown;
  payload: unknown;
}): ReportArtifactRecord {
  return {
    ...mapArtifactSummary(record),
    payload: record.payload,
  };
}

const reportArtifactSelection = {
  id: true,
  reportType: true,
  version: true,
  status: true,
  reportHash: true,
  sourceSummaryHash: true,
  generatedAt: true,
  latestExportedAt: true,
  latestExportFormat: true,
  createdByType: true,
  createdById: true,
  sourceLineage: true,
} as const;

export async function getLatestReportArtifact(params: {
  organizationId: string;
  buildingId: string;
  reportType: GovernedReportType;
}): Promise<ReportArtifactRecord | null> {
  const artifact = await prisma.reportArtifact.findFirst({
    where: {
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      reportType: params.reportType,
    },
    orderBy: [{ version: "desc" }, { generatedAt: "desc" }],
    select: {
      ...reportArtifactSelection,
      payload: true,
    },
  });

  return artifact ? mapArtifactRecord(artifact) : null;
}

export async function getReportArtifactWorkspace(params: {
  organizationId: string;
  buildingId: string;
  reportType: GovernedReportType;
}): Promise<ReportArtifactWorkspace> {
  const history = await prisma.reportArtifact.findMany({
    where: {
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      reportType: params.reportType,
    },
    orderBy: [{ version: "desc" }, { generatedAt: "desc" }],
    take: 12,
    select: reportArtifactSelection,
  });

  return {
    buildingId: params.buildingId,
    reportType: params.reportType,
    latestArtifact: history[0] ? mapArtifactSummary(history[0]) : null,
    history: history.map(mapArtifactSummary),
  };
}

export async function createReportArtifact(params: {
  organizationId: string;
  buildingId: string;
  reportType: GovernedReportType;
  payload: unknown;
  sourceLineage: GovernedReportArtifactLineage;
  createdByType: ActorType;
  createdById: string | null;
  requestId: string | null;
  action?: string;
}): Promise<ReportArtifactRecord> {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.reportArtifact.findFirst({
      where: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        reportType: params.reportType,
      },
      orderBy: [{ version: "desc" }, { generatedAt: "desc" }],
      select: { version: true },
    });

    const created = await tx.reportArtifact.create({
      data: {
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        reportType: params.reportType,
        version: (latest?.version ?? 0) + 1,
        status: "GENERATED",
        reportHash: hashDeterministicJson(params.payload),
        sourceSummaryHash: hashDeterministicJson(params.sourceLineage),
        sourceLineage: toInputJson(params.sourceLineage),
        payload: toInputJson(params.payload),
        createdByType: params.createdByType,
        createdById: params.createdById,
      },
      select: {
        ...reportArtifactSelection,
        payload: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: params.createdByType,
        actorId: params.createdById,
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        action: params.action ?? "REPORT_ARTIFACT_GENERATED",
        inputSnapshot: {
          reportType: params.reportType,
          reportHash: created.reportHash,
          sourceSummaryHash: created.sourceSummaryHash,
        },
        outputSnapshot: {
          artifactId: created.id,
          version: created.version,
          status: created.status,
        },
        requestId: params.requestId,
      },
    });

    return mapArtifactRecord(created);
  });
}

export async function markReportArtifactExported(params: {
  organizationId: string;
  buildingId: string;
  artifactId: string;
  format: ReportArtifactExportFormat;
  actorType: ActorType;
  actorId: string | null;
  requestId: string | null;
}): Promise<ReportArtifactRecord> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.reportArtifact.update({
      where: { id: params.artifactId },
      data: {
        latestExportedAt: new Date(),
        latestExportFormat: params.format,
      },
      select: {
        ...reportArtifactSelection,
        payload: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        organizationId: params.organizationId,
        buildingId: params.buildingId,
        action: "REPORT_ARTIFACT_EXPORTED",
        inputSnapshot: {
          artifactId: updated.id,
          reportType: updated.reportType,
          format: params.format,
        },
        outputSnapshot: {
          version: updated.version,
          exportedAt: updated.latestExportedAt?.toISOString() ?? null,
        },
        requestId: params.requestId,
      },
    });

    return mapArtifactRecord(updated);
  });
}

export function renderReportArtifactExport(params: {
  buildingName: string;
  artifact: ReportArtifactRecord;
  format: ReportArtifactExportFormat;
}) {
  const slug = params.buildingName.trim().replace(/\s+/g, "-").toLowerCase();

  return {
    artifactId: params.artifact.id,
    version: params.artifact.version,
    format: params.format,
    exportedAt: params.artifact.latestExportedAt,
    fileName: `${slug}-${params.artifact.reportType.toLowerCase()}-v${params.artifact.version}.json`,
    contentType: "application/json",
    content: stringifyDeterministicJson(params.artifact.payload),
  };
}
