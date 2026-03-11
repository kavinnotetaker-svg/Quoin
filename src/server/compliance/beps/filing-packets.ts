import crypto from "node:crypto";
import type { ActorType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { ComplianceProvenanceError } from "../provenance";

type BepsEvidenceKind =
  | "PATHWAY_SUPPORT"
  | "PRESCRIPTIVE_SUPPORT"
  | "ACP_SUPPORT"
  | "EXEMPTION_SUPPORT"
  | "NOT_APPLICABLE_SUPPORT";

type PacketWarningCode =
  | "NO_LINKED_EVIDENCE"
  | "MISSING_PATHWAY_SUPPORT_EVIDENCE"
  | "MISSING_PRESCRIPTIVE_SUPPORT_EVIDENCE"
  | "MISSING_ACP_SUPPORT_EVIDENCE"
  | "MISSING_NOT_APPLICABLE_SUPPORT_EVIDENCE";

export type BepsFilingPacketExportFormat = "JSON" | "MARKDOWN";

const filingAssemblyInclude = {
  building: true,
  complianceRun: {
    include: {
      calculationManifest: true,
      ruleVersion: {
        include: {
          rulePackage: true,
        },
      },
      factorSetVersion: true,
    },
  },
  evidenceArtifacts: {
    include: {
      sourceArtifact: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  events: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  packets: {
    orderBy: [{ version: "desc" }],
    take: 1,
  },
} satisfies Prisma.FilingRecordInclude;

type FilingAssemblyRecordBase = Prisma.FilingRecordGetPayload<{
  include: typeof filingAssemblyInclude;
}>;

type FilingAssemblyRecord = Omit<FilingAssemblyRecordBase, "complianceRun"> & {
  complianceRun: NonNullable<FilingAssemblyRecordBase["complianceRun"]>;
};

function stableStringify(value: unknown): string {
  if (typeof value === "bigint") {
    return `{"$bigint":${JSON.stringify(value.toString())}}`;
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (typeof (value as { toJSON?: () => unknown }).toJSON === "function") {
    return stableStringify((value as { toJSON: () => unknown }).toJSON());
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function hashPayload(value: unknown) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringifyDeterministicJson(value: unknown) {
  return JSON.stringify(JSON.parse(stableStringify(value)) as unknown, null, 2);
}

function slugifySegment(value: string | null | undefined) {
  return (value ?? "packet")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "packet";
}

async function createPacketEvent(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    buildingId: string;
    filingRecordId: string;
    action: "PACKET_GENERATED" | "PACKET_FINALIZED";
    notes: string;
    eventPayload: Record<string, unknown>;
    createdByType: ActorType;
    createdById?: string | null;
  },
) {
  return tx.filingRecordEvent.create({
    data: {
      organizationId: input.organizationId,
      buildingId: input.buildingId,
      filingRecordId: input.filingRecordId,
      action: input.action,
      notes: input.notes,
      eventPayload: toJson(input.eventPayload),
      createdByType: input.createdByType,
      createdById: input.createdById ?? null,
    },
  });
}

function getBepsEvaluationPayload(filingPayload: unknown) {
  const payload = toRecord(filingPayload);
  return toRecord(payload["bepsEvaluation"]);
}

function getEvidenceKind(metadata: unknown): BepsEvidenceKind | null {
  const record = toRecord(metadata);
  const value = record["bepsEvidenceKind"];
  return value === "PATHWAY_SUPPORT" ||
    value === "PRESCRIPTIVE_SUPPORT" ||
    value === "ACP_SUPPORT" ||
    value === "EXEMPTION_SUPPORT" ||
    value === "NOT_APPLICABLE_SUPPORT"
    ? value
    : null;
}

function hasEvidenceKind(
  evidenceManifest: Array<{ bepsEvidenceKind: BepsEvidenceKind | null }>,
  kind: BepsEvidenceKind,
) {
  return evidenceManifest.some((entry) => entry.bepsEvidenceKind === kind);
}

export function buildBepsFilingPacketWarnings(input: {
  selectedPathway: string | null;
  overallStatus: string | null;
  alternativeComplianceAgreementId: string | null;
  evidenceManifest: Array<{ bepsEvidenceKind: BepsEvidenceKind | null }>;
}) {
  const warnings: Array<{
    code: PacketWarningCode;
    severity: "WARNING";
    message: string;
  }> = [];

  if (input.evidenceManifest.length === 0) {
    warnings.push({
      code: "NO_LINKED_EVIDENCE",
      severity: "WARNING",
      message: "No evidence artifacts are currently linked to this BEPS filing.",
    });
  }

  if (
    input.selectedPathway === "PERFORMANCE" ||
    input.selectedPathway === "STANDARD_TARGET" ||
    input.selectedPathway === "TRAJECTORY"
  ) {
    if (!hasEvidenceKind(input.evidenceManifest, "PATHWAY_SUPPORT")) {
      warnings.push({
        code: "MISSING_PATHWAY_SUPPORT_EVIDENCE",
        severity: "WARNING",
        message: "No pathway support evidence is linked for the selected BEPS pathway.",
      });
    }
  }

  if (
    input.selectedPathway === "PRESCRIPTIVE" &&
    !hasEvidenceKind(input.evidenceManifest, "PRESCRIPTIVE_SUPPORT")
  ) {
    warnings.push({
      code: "MISSING_PRESCRIPTIVE_SUPPORT_EVIDENCE",
      severity: "WARNING",
      message: "No prescriptive support evidence is linked for the selected BEPS pathway.",
    });
  }

  if (
    input.alternativeComplianceAgreementId &&
    !hasEvidenceKind(input.evidenceManifest, "ACP_SUPPORT")
  ) {
    warnings.push({
      code: "MISSING_ACP_SUPPORT_EVIDENCE",
      severity: "WARNING",
      message: "An alternative compliance agreement is referenced, but no ACP support evidence is linked.",
    });
  }

  if (
    input.overallStatus === "NOT_APPLICABLE" &&
    !hasEvidenceKind(input.evidenceManifest, "NOT_APPLICABLE_SUPPORT") &&
    !hasEvidenceKind(input.evidenceManifest, "EXEMPTION_SUPPORT")
  ) {
    warnings.push({
      code: "MISSING_NOT_APPLICABLE_SUPPORT_EVIDENCE",
      severity: "WARNING",
      message: "This BEPS filing is marked not applicable, but no exemption/not-applicable support evidence is linked.",
    });
  }

  return warnings;
}

async function loadBepsFilingAssemblyContext(params: {
  organizationId: string;
  buildingId: string;
  filingRecordId: string;
}): Promise<FilingAssemblyRecord> {
  const filingRecord = await prisma.filingRecord.findFirst({
    where: {
      id: params.filingRecordId,
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      filingType: "BEPS_COMPLIANCE",
    },
    include: filingAssemblyInclude,
  });

  if (!filingRecord) {
    throw new ComplianceProvenanceError("BEPS filing record not found for packet assembly");
  }

  if (!filingRecord.complianceRun) {
    throw new ComplianceProvenanceError(
      "BEPS filing record is missing its governed compliance run",
    );
  }

  return filingRecord as FilingAssemblyRecord;
}

export function assembleBepsFilingPacketPayload(input: FilingAssemblyRecord) {
  const evaluation = getBepsEvaluationPayload(input.filingPayload);
  const inputSummary = toRecord(evaluation["inputSummary"]);
  const governance =
    Object.keys(toRecord(evaluation["governance"])).length > 0
      ? toRecord(evaluation["governance"])
      : {
          rulePackageKey: input.complianceRun.ruleVersion.rulePackage.key,
          ruleVersion: input.complianceRun.ruleVersion.version,
          factorSetKey: input.complianceRun.factorSetVersion.key,
          factorSetVersion: input.complianceRun.factorSetVersion.version,
        };

  const evidenceManifest = input.evidenceArtifacts.map((artifact) => ({
    id: artifact.id,
    artifactType: artifact.artifactType,
    bepsEvidenceKind: getEvidenceKind(artifact.metadata),
    name: artifact.name,
    artifactRef: artifact.artifactRef,
    sourceArtifactId: artifact.sourceArtifactId,
    sourceArtifactName: artifact.sourceArtifact?.name ?? null,
    sourceArtifactType: artifact.sourceArtifact?.artifactType ?? null,
    sourceArtifactUrl: artifact.sourceArtifact?.externalUrl ?? null,
    createdAt: artifact.createdAt.toISOString(),
    metadata: toRecord(artifact.metadata),
  }));

  const warnings = buildBepsFilingPacketWarnings({
    selectedPathway:
      typeof evaluation["selectedPathway"] === "string"
        ? (evaluation["selectedPathway"] as string)
        : null,
    overallStatus:
      typeof evaluation["overallStatus"] === "string"
        ? (evaluation["overallStatus"] as string)
        : null,
    alternativeComplianceAgreementId:
      typeof toRecord(inputSummary["canonicalRefs"])["alternativeComplianceAgreementId"] ===
      "string"
        ? (toRecord(inputSummary["canonicalRefs"])[
            "alternativeComplianceAgreementId"
          ] as string)
        : null,
    evidenceManifest,
  });

  const eventHistory = input.events.map((event) => ({
    id: event.id,
    action: event.action,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    notes: event.notes,
    createdByType: event.createdByType,
    createdById: event.createdById,
    createdAt: event.createdAt.toISOString(),
    eventPayload: toRecord(event.eventPayload),
  }));

  const packetPayload = {
    filingSummary: {
      filingRecordId: input.id,
      filingType: input.filingType,
      filingYear: input.filingYear,
      complianceCycle: input.complianceCycle,
      filingStatus: input.status,
      filedAt: input.filedAt?.toISOString() ?? null,
    },
    buildingContext: {
      organizationId: input.organizationId,
      buildingId: input.buildingId,
      buildingName: input.building.name,
      address: input.building.address,
      propertyType: input.building.propertyType,
      ownershipType: input.building.ownershipType,
      grossSquareFeet: input.building.grossSquareFeet,
    },
    pathwaySummary: {
      selectedPathway:
        typeof evaluation["selectedPathway"] === "string"
          ? evaluation["selectedPathway"]
          : null,
      overallStatus:
        typeof evaluation["overallStatus"] === "string"
          ? evaluation["overallStatus"]
          : null,
      pathwayEligibility: toRecord(evaluation["pathwayEligibility"]),
      pathwayResults: toRecord(evaluation["pathwayResults"]),
    },
    complianceResult: {
      evaluation,
      alternativeCompliance: toRecord(evaluation["alternativeCompliance"]),
      reasonCodes: toArray(evaluation["reasonCodes"]),
      findings: toArray(evaluation["findings"]),
    },
    governance: {
      rulePackageKey: governance["rulePackageKey"] ?? input.complianceRun.ruleVersion.rulePackage.key,
      ruleVersion: governance["ruleVersion"] ?? input.complianceRun.ruleVersion.version,
      factorSetKey: governance["factorSetKey"] ?? input.complianceRun.factorSetVersion.key,
      factorSetVersion:
        governance["factorSetVersion"] ?? input.complianceRun.factorSetVersion.version,
      ruleVersionId: input.complianceRun.ruleVersionId,
      factorSetVersionId: input.complianceRun.factorSetVersionId,
      complianceRunId: input.complianceRun.id,
      calculationManifestId: input.complianceRun.calculationManifest?.id ?? null,
      implementationKey:
        input.complianceRun.calculationManifest?.implementationKey ?? null,
      codeVersion: input.complianceRun.calculationManifest?.codeVersion ?? null,
      executedAt: input.complianceRun.executedAt.toISOString(),
    },
    metricsUsed: {
      inputSummary,
      currentSnapshotRef: input.complianceRun.inputSnapshotRef,
      currentSnapshotHash: input.complianceRun.inputSnapshotHash,
    },
    evidenceManifest,
    workflowHistory: {
      filingStatus: input.status,
      eventCount: eventHistory.length,
      events: eventHistory,
    },
    warnings,
  };

  const upstreamFingerprint = {
    filingRecord: {
      id: input.id,
      status: input.status,
      updatedAt: input.updatedAt.toISOString(),
      complianceRunId: input.complianceRunId,
      filingPayload: toRecord(input.filingPayload),
    },
    evidenceArtifacts: input.evidenceArtifacts.map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      sourceArtifactId: artifact.sourceArtifactId,
      metadata: toRecord(artifact.metadata),
      createdAt: artifact.createdAt.toISOString(),
    })),
    filingEvents: eventHistory,
  };

  return {
    packetPayload,
    packetHash: hashPayload({
      packetPayload,
      upstreamFingerprint,
    }),
  };
}

export async function markBepsFilingPacketsStaleTx(
  tx: Prisma.TransactionClient,
  params: {
    filingRecordId: string;
  },
) {
  return tx.filingPacket.updateMany({
    where: {
      filingRecordId: params.filingRecordId,
      status: {
        in: ["GENERATED", "FINALIZED"],
      },
    },
    data: {
      status: "STALE",
      staleMarkedAt: new Date(),
    },
  });
}

export async function markBepsFilingPacketsStale(params: {
  organizationId: string;
  buildingId: string;
  filingRecordId: string;
}) {
  return prisma.$transaction((tx) =>
    markBepsFilingPacketsStaleTx(tx, {
      filingRecordId: params.filingRecordId,
    }),
  );
}

export async function generateBepsFilingPacket(input: {
  organizationId: string;
  buildingId: string;
  filingRecordId: string;
  createdByType: ActorType;
  createdById?: string | null;
}) {
  const filingRecord = await loadBepsFilingAssemblyContext(input);
  const { packetPayload, packetHash } = assembleBepsFilingPacketPayload(filingRecord);
  const latestPacket = filingRecord.packets[0] ?? null;

  if (
    latestPacket &&
    latestPacket.packetHash === packetHash &&
    latestPacket.status !== "STALE"
  ) {
    return prisma.filingPacket.findUniqueOrThrow({
      where: { id: latestPacket.id },
      include: {
        filingRecord: {
          include: {
            evidenceArtifacts: {
              orderBy: { createdAt: "desc" },
            },
            events: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    await markBepsFilingPacketsStaleTx(tx, {
      filingRecordId: input.filingRecordId,
    });

    const packet = await tx.filingPacket.create({
      data: {
        organizationId: input.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
        filingYear: filingRecord.filingYear,
        complianceCycle: filingRecord.complianceCycle,
        version: (latestPacket?.version ?? 0) + 1,
        status: "GENERATED",
        packetHash,
        packetPayload: toJson(packetPayload),
        generatedAt: new Date(),
        staleMarkedAt: null,
        finalizedAt: null,
        finalizedByType: null,
        finalizedById: null,
        createdByType: input.createdByType,
        createdById: input.createdById ?? null,
      },
    });

    await createPacketEvent(tx, {
      organizationId: input.organizationId,
      buildingId: input.buildingId,
      filingRecordId: input.filingRecordId,
      action: "PACKET_GENERATED",
      notes: `Generated BEPS filing packet version ${packet.version}.`,
      eventPayload: {
        packetId: packet.id,
        packetVersion: packet.version,
        packetHash,
        packetStatus: "GENERATED",
      },
      createdByType: input.createdByType,
      createdById: input.createdById ?? null,
    });

    return tx.filingPacket.findUniqueOrThrow({
      where: { id: packet.id },
      include: {
        filingRecord: {
          include: {
            evidenceArtifacts: {
              orderBy: { createdAt: "desc" },
            },
            events: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });
  });
}

export async function finalizeBepsFilingPacket(input: {
  organizationId: string;
  buildingId: string;
  filingRecordId: string;
  createdByType: ActorType;
  createdById?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const packet = await tx.filingPacket.findFirst({
      where: {
        organizationId: input.organizationId,
        buildingId: input.buildingId,
        filingRecordId: input.filingRecordId,
      },
      orderBy: [{ version: "desc" }],
      include: {
        filingRecord: {
          include: {
            evidenceArtifacts: {
              orderBy: { createdAt: "desc" },
            },
            events: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!packet) {
      throw new ComplianceProvenanceError("BEPS filing packet not found for finalization");
    }

    if (packet.status === "STALE") {
      throw new ComplianceProvenanceError("BEPS filing packet cannot be finalized while stale");
    }

    if (packet.status === "FINALIZED") {
      return packet;
    }

    if (packet.status !== "GENERATED") {
      throw new ComplianceProvenanceError(
        `BEPS filing packet cannot be finalized from status ${packet.status}`,
      );
    }

    const finalizedAt = new Date();
    const finalized = await tx.filingPacket.update({
      where: { id: packet.id },
      data: {
        status: "FINALIZED",
        finalizedAt,
        finalizedByType: input.createdByType,
        finalizedById: input.createdById ?? null,
      },
    });

    await createPacketEvent(tx, {
      organizationId: input.organizationId,
      buildingId: input.buildingId,
      filingRecordId: input.filingRecordId,
      action: "PACKET_FINALIZED",
      notes: `Finalized BEPS filing packet version ${packet.version}.`,
      eventPayload: {
        packetId: packet.id,
        packetVersion: packet.version,
        packetHash: packet.packetHash,
        finalizedAt: finalizedAt.toISOString(),
      },
      createdByType: input.createdByType,
      createdById: input.createdById ?? null,
    });

    return tx.filingPacket.findUniqueOrThrow({
      where: { id: finalized.id },
      include: {
        filingRecord: {
          include: {
            evidenceArtifacts: {
              orderBy: { createdAt: "desc" },
            },
            events: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });
  });
}

export async function getLatestBepsFilingPacket(params: {
  organizationId: string;
  buildingId: string;
  filingRecordId: string;
}) {
  return prisma.filingPacket.findFirst({
    where: {
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      filingRecordId: params.filingRecordId,
    },
    orderBy: [{ version: "desc" }],
    include: {
      filingRecord: {
        include: {
          evidenceArtifacts: {
            orderBy: { createdAt: "desc" },
          },
          events: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
}

function buildPacketExportDocument(packet: NonNullable<
  Awaited<ReturnType<typeof getLatestBepsFilingPacket>>
>) {
  const packetPayload = toRecord(packet.packetPayload);
  const filingSummary = toRecord(packetPayload["filingSummary"]);
  const buildingContext = toRecord(packetPayload["buildingContext"]);
  const pathwaySummary = toRecord(packetPayload["pathwaySummary"]);
  const complianceResult = toRecord(packetPayload["complianceResult"]);
  const governance = toRecord(packetPayload["governance"]);
  const evidenceManifest = toArray(packetPayload["evidenceManifest"]);
  const workflowHistory = toRecord(packetPayload["workflowHistory"]);
  const warnings = toArray(packetPayload["warnings"]);

  return {
    exportVersion: "beps-filing-packet-export-v1",
    packet: {
      id: packet.id,
      version: packet.version,
      status: packet.status,
      packetHash: packet.packetHash,
      generatedAt: packet.generatedAt.toISOString(),
      staleMarkedAt: packet.staleMarkedAt?.toISOString() ?? null,
      finalizedAt: packet.finalizedAt?.toISOString() ?? null,
      finalizedByType: packet.finalizedByType ?? null,
      finalizedById: packet.finalizedById ?? null,
    },
    filingSummary,
    buildingContext,
    pathwaySummary,
    complianceResult,
    governance,
    evidenceManifest,
    workflowHistory,
    warnings,
  };
}

function renderPacketMarkdown(packetExport: ReturnType<typeof buildPacketExportDocument>) {
  const filingSummary = toRecord(packetExport.filingSummary);
  const buildingContext = toRecord(packetExport.buildingContext);
  const pathwaySummary = toRecord(packetExport.pathwaySummary);
  const complianceResult = toRecord(packetExport.complianceResult);
  const governance = toRecord(packetExport.governance);
  const packet = toRecord(packetExport.packet);

  return [
    "# BEPS Filing Packet",
    "",
    "## Packet",
    `- Packet ID: ${packet["id"] ?? ""}`,
    `- Version: ${packet["version"] ?? ""}`,
    `- Status: ${packet["status"] ?? ""}`,
    `- Hash: ${packet["packetHash"] ?? ""}`,
    `- Generated At: ${packet["generatedAt"] ?? ""}`,
    `- Finalized At: ${packet["finalizedAt"] ?? "null"}`,
    "",
    "## Filing Summary",
    `- Filing Record ID: ${filingSummary["filingRecordId"] ?? ""}`,
    `- Filing Type: ${filingSummary["filingType"] ?? ""}`,
    `- Filing Year: ${filingSummary["filingYear"] ?? ""}`,
    `- Compliance Cycle: ${filingSummary["complianceCycle"] ?? ""}`,
    `- Filing Status: ${filingSummary["filingStatus"] ?? ""}`,
    "",
    "## Building Context",
    `- Organization ID: ${buildingContext["organizationId"] ?? ""}`,
    `- Building ID: ${buildingContext["buildingId"] ?? ""}`,
    `- Building Name: ${buildingContext["buildingName"] ?? ""}`,
    `- Address: ${buildingContext["address"] ?? ""}`,
    `- Property Type: ${buildingContext["propertyType"] ?? ""}`,
    `- Ownership Type: ${buildingContext["ownershipType"] ?? ""}`,
    `- Gross Square Feet: ${buildingContext["grossSquareFeet"] ?? ""}`,
    "",
    "## Compliance Result",
    `- Selected Pathway: ${pathwaySummary["selectedPathway"] ?? ""}`,
    `- Overall Status: ${pathwaySummary["overallStatus"] ?? ""}`,
    "",
    "### Governance",
    `- Rule Package: ${governance["rulePackageKey"] ?? ""}`,
    `- Rule Version: ${governance["ruleVersion"] ?? ""}`,
    `- Factor Set: ${governance["factorSetKey"] ?? ""}`,
    `- Factor Set Version: ${governance["factorSetVersion"] ?? ""}`,
    "",
    "### Calculation Detail",
    "```json",
    stringifyDeterministicJson(complianceResult),
    "```",
    "",
    "### Evidence Manifest",
    "```json",
    stringifyDeterministicJson(packetExport.evidenceManifest),
    "```",
    "",
    "### Workflow History",
    "```json",
    stringifyDeterministicJson(packetExport.workflowHistory),
    "```",
    "",
    "### Warnings",
    "```json",
    stringifyDeterministicJson(packetExport.warnings),
    "```",
    "",
  ].join("\n");
}

export async function exportBepsFilingPacket(input: {
  organizationId: string;
  buildingId: string;
  filingRecordId: string;
  format: BepsFilingPacketExportFormat;
}) {
  const packet = await getLatestBepsFilingPacket({
    organizationId: input.organizationId,
    buildingId: input.buildingId,
    filingRecordId: input.filingRecordId,
  });

  if (!packet) {
    throw new ComplianceProvenanceError("BEPS filing packet not found for export");
  }

  const packetExport = buildPacketExportDocument(packet);
  const buildingContext = toRecord(packetExport.buildingContext);
  const filingSummary = toRecord(packetExport.filingSummary);
  const baseFileName = [
    slugifySegment(buildingContext["buildingName"] as string | undefined),
    slugifySegment(filingSummary["complianceCycle"] as string | undefined),
    filingSummary["filingYear"] ?? "filing",
    `packet-v${packet.version}`,
  ].join("_");

  if (input.format === "MARKDOWN") {
    const content = renderPacketMarkdown(packetExport);
    return {
      packetId: packet.id,
      version: packet.version,
      status: packet.status,
      packetHash: packet.packetHash,
      format: input.format,
      fileName: `${baseFileName}.md`,
      contentType: "text/markdown",
      content,
    };
  }

  const content = stringifyDeterministicJson(packetExport);
  return {
    packetId: packet.id,
    version: packet.version,
    status: packet.status,
    packetHash: packet.packetHash,
    format: input.format,
    fileName: `${baseFileName}.json`,
    contentType: "application/json",
    content,
  };
}

export async function listBepsFilingPackets(params: {
  organizationId: string;
  buildingId?: string;
  limit: number;
}) {
  return prisma.filingPacket.findMany({
    where: {
      organizationId: params.organizationId,
      ...(params.buildingId ? { buildingId: params.buildingId } : {}),
    },
    orderBy: [{ generatedAt: "desc" }, { version: "desc" }],
    take: params.limit,
    include: {
      filingRecord: {
        select: {
          id: true,
          status: true,
          filingYear: true,
          complianceCycle: true,
        },
      },
    },
  });
}
