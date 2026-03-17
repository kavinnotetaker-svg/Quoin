import type {
  ActorType,
  Prisma,
} from "@/generated/prisma";
import { prisma } from "@/server/lib/db";
import {
  hashDeterministicJson,
  slugifyFileSegment,
  stringifyDeterministicJson,
} from "@/server/lib/deterministic-json";
import {
  type RetrofitCandidateRanking,
  rankRetrofitCandidatesForBuilding,
} from "./retrofit-optimization";

type FinancingPacketWarningCode =
  | "NO_LINKED_SUPPORT_SOURCE"
  | "MISSING_SAVINGS_ASSUMPTION"
  | "MISSING_AVOIDED_PENALTY_REFERENCE"
  | "LOW_CONFIDENCE_ESTIMATE"
  | "NO_GOVERNED_BEPS_CONTEXT";

const financingCaseInclude = {
  building: true,
  candidates: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      retrofitCandidate: {
        include: {
          sourceArtifact: true,
        },
      },
    },
  },
  packets: {
    orderBy: [{ version: "desc" }],
    take: 1,
  },
} satisfies Prisma.FinancingCaseInclude;

type FinancingCaseRecord = Prisma.FinancingCaseGetPayload<{
  include: typeof financingCaseInclude;
}>;

type FinancingCaseCandidateRecord = FinancingCaseRecord["candidates"][number];

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values));
}

function aggregateComplianceImprovementPct(rankings: RetrofitCandidateRanking[]) {
  return round(
    clamp(
      rankings.reduce((sum, ranking) => sum + ranking.estimatedBepsImpactPct, 0),
      0,
      100,
    ),
    2,
  );
}

async function loadFinancingCase(params: {
  organizationId: string;
  buildingId?: string;
  financingCaseId: string;
}) {
  return prisma.financingCase.findFirst({
    where: {
      id: params.financingCaseId,
      organizationId: params.organizationId,
      ...(params.buildingId ? { buildingId: params.buildingId } : {}),
    },
    include: financingCaseInclude,
  });
}

async function getLatestBepsContext(params: {
  organizationId: string;
  buildingId: string;
}) {
  return prisma.filingRecord.findFirst({
    where: {
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      filingType: "BEPS_COMPLIANCE",
    },
    orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
    include: {
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
    },
  });
}

async function getRankingsForCase(
  financingCase: FinancingCaseRecord,
  evaluationTime?: Date,
) {
  const rankings = await rankRetrofitCandidatesForBuilding({
    organizationId: financingCase.organizationId,
    buildingId: financingCase.buildingId,
    includeArchived: true,
    limit: Math.max(financingCase.candidates.length * 5, 50),
    now: evaluationTime,
  });

  const rankingsByCandidateId = new Map(
    rankings.map((ranking) => [ranking.candidateId, ranking]),
  );

  return financingCase.candidates.map((caseCandidate) => ({
    caseCandidate,
    ranking: rankingsByCandidateId.get(caseCandidate.retrofitCandidateId) ?? null,
  }));
}

function resolveFinancingPacketEvaluationTime(input: {
  financingCase: FinancingCaseRecord;
  bepsContext: Awaited<ReturnType<typeof getLatestBepsContext>>;
}) {
  const timestamps = [
    input.financingCase.updatedAt.getTime(),
    ...input.financingCase.candidates.map((candidate) =>
      candidate.retrofitCandidate.updatedAt.getTime(),
    ),
  ];

  if (input.bepsContext) {
    timestamps.push(input.bepsContext.updatedAt.getTime());

    if (input.bepsContext.complianceRun?.calculationManifest) {
      timestamps.push(input.bepsContext.complianceRun.calculationManifest.createdAt.getTime());
      timestamps.push(input.bepsContext.complianceRun.calculationManifest.executedAt.getTime());
    }

    for (const artifact of input.bepsContext.evidenceArtifacts) {
      timestamps.push(artifact.createdAt.getTime());
      if (artifact.sourceArtifact?.createdAt) {
        timestamps.push(artifact.sourceArtifact.createdAt.getTime());
      }
    }
  }

  return new Date(Math.max(...timestamps));
}

function buildFinancingPacketWarnings(input: {
  candidateRows: Array<{
    caseCandidate: FinancingCaseCandidateRecord;
    ranking: RetrofitCandidateRanking | null;
  }>;
  bepsContext: Awaited<ReturnType<typeof getLatestBepsContext>>;
}) {
  const warnings: Array<{
    code: FinancingPacketWarningCode;
    severity: "WARNING";
    message: string;
  }> = [];

  if (!input.bepsContext?.complianceRun) {
    warnings.push({
      code: "NO_GOVERNED_BEPS_CONTEXT",
      severity: "WARNING",
      message: "No governed BEPS filing context is available for avoided-penalty traceability.",
    });
  }

  if (input.candidateRows.some((row) => !row.caseCandidate.retrofitCandidate.sourceArtifactId)) {
    warnings.push({
      code: "NO_LINKED_SUPPORT_SOURCE",
      severity: "WARNING",
      message: "One or more retrofit candidates do not have a linked support source artifact.",
    });
  }

  if (
    input.candidateRows.some(
      (row) =>
        row.caseCandidate.retrofitCandidate.estimatedAnnualSavingsKbtu == null &&
        row.caseCandidate.retrofitCandidate.estimatedAnnualSavingsUsd == null,
    )
  ) {
    warnings.push({
      code: "MISSING_SAVINGS_ASSUMPTION",
      severity: "WARNING",
      message: "One or more retrofit candidates are missing annual savings assumptions.",
    });
  }

  if (
    input.candidateRows.some(
      (row) =>
        row.ranking == null || row.ranking.estimatedAvoidedPenalty <= 0,
    )
  ) {
    warnings.push({
      code: "MISSING_AVOIDED_PENALTY_REFERENCE",
      severity: "WARNING",
      message: "One or more retrofit candidates do not have a positive avoided-penalty reference.",
    });
  }

  if (input.candidateRows.some((row) => row.caseCandidate.retrofitCandidate.confidenceBand === "LOW")) {
    warnings.push({
      code: "LOW_CONFIDENCE_ESTIMATE",
      severity: "WARNING",
      message: "At least one retrofit candidate is flagged with low estimate confidence.",
    });
  }

  return warnings;
}

export function assembleFinancingPacketPayload(input: {
  financingCase: FinancingCaseRecord;
  candidateRows: Array<{
    caseCandidate: FinancingCaseCandidateRecord;
    ranking: RetrofitCandidateRanking | null;
  }>;
  bepsContext: Awaited<ReturnType<typeof getLatestBepsContext>>;
}) {
  const bundleCapex = round(
    input.candidateRows.reduce(
      (sum, row) => sum + row.caseCandidate.retrofitCandidate.estimatedCapex,
      0,
    ),
    2,
  );
  const bundleSavingsKbtu = round(
    input.candidateRows.reduce(
      (sum, row) => sum + (row.caseCandidate.retrofitCandidate.estimatedAnnualSavingsKbtu ?? 0),
      0,
    ),
    2,
  );
  const bundleSavingsUsd = round(
    input.candidateRows.reduce(
      (sum, row) =>
        sum +
        (row.caseCandidate.retrofitCandidate.estimatedAnnualSavingsUsd ?? 0),
      0,
    ),
    2,
  );
  const bundleAvoidedPenalty = round(
    input.candidateRows.reduce(
      (sum, row) => sum + (row.ranking?.estimatedAvoidedPenalty ?? 0),
      0,
    ),
    2,
  );
  const bundleComplianceImprovementPct = aggregateComplianceImprovementPct(
    input.candidateRows.flatMap((row) => (row.ranking ? [row.ranking] : [])),
  );

  const selectedCandidates = input.candidateRows.map(({ caseCandidate, ranking }) => ({
    candidateId: caseCandidate.retrofitCandidateId,
    sortOrder: caseCandidate.sortOrder,
    name: caseCandidate.retrofitCandidate.name,
    projectType: caseCandidate.retrofitCandidate.projectType,
    status: caseCandidate.retrofitCandidate.status,
    confidenceBand: caseCandidate.retrofitCandidate.confidenceBand,
    sourceArtifactId: caseCandidate.retrofitCandidate.sourceArtifactId,
    sourceArtifactName: caseCandidate.retrofitCandidate.sourceArtifact?.name ?? null,
    sourceArtifactType: caseCandidate.retrofitCandidate.sourceArtifact?.artifactType ?? null,
    sourceArtifactUrl: caseCandidate.retrofitCandidate.sourceArtifact?.externalUrl ?? null,
    estimates: {
      estimatedCapex: caseCandidate.retrofitCandidate.estimatedCapex,
      estimatedIncentiveAmount:
        caseCandidate.retrofitCandidate.estimatedIncentiveAmount,
      estimatedAnnualSavingsKbtu:
        caseCandidate.retrofitCandidate.estimatedAnnualSavingsKbtu,
      estimatedAnnualSavingsUsd:
        caseCandidate.retrofitCandidate.estimatedAnnualSavingsUsd,
      estimatedSiteEuiReduction:
        caseCandidate.retrofitCandidate.estimatedSiteEuiReduction,
      estimatedSourceEuiReduction:
        caseCandidate.retrofitCandidate.estimatedSourceEuiReduction,
      estimatedBepsImprovementPct:
        caseCandidate.retrofitCandidate.estimatedBepsImprovementPct,
      estimatedImplementationMonths:
        caseCandidate.retrofitCandidate.estimatedImplementationMonths,
    },
    ranking,
  }));

  const warnings = buildFinancingPacketWarnings(input);
  const rankingReasonCodes = dedupeStrings(
    selectedCandidates.flatMap((candidate) => candidate.ranking?.reasonCodes ?? []),
  );
  const evidenceManifest = [
    ...selectedCandidates.map((candidate) => ({
      manifestType: "RETROFIT_SOURCE",
      candidateId: candidate.candidateId,
      name: candidate.sourceArtifactName ?? candidate.name,
      sourceArtifactId: candidate.sourceArtifactId,
      sourceArtifactType: candidate.sourceArtifactType,
      sourceArtifactUrl: candidate.sourceArtifactUrl,
    })),
    ...((input.bepsContext?.evidenceArtifacts ?? []).map((artifact) => ({
      manifestType: "BEPS_EVIDENCE",
      evidenceArtifactId: artifact.id,
      artifactType: artifact.artifactType,
      name: artifact.name,
      sourceArtifactId: artifact.sourceArtifactId,
      sourceArtifactName: artifact.sourceArtifact?.name ?? null,
      sourceArtifactType: artifact.sourceArtifact?.artifactType ?? null,
      sourceArtifactUrl: artifact.sourceArtifact?.externalUrl ?? null,
      metadata: toRecord(artifact.metadata),
    })) ?? []),
  ];

  const governance = input.bepsContext?.complianceRun
    ? {
        rulePackageKey: input.bepsContext.complianceRun.ruleVersion.rulePackage.key,
        ruleVersion: input.bepsContext.complianceRun.ruleVersion.version,
        factorSetKey: input.bepsContext.complianceRun.factorSetVersion.key,
        factorSetVersion: input.bepsContext.complianceRun.factorSetVersion.version,
        complianceRunId: input.bepsContext.complianceRun.id,
        calculationManifestId:
          input.bepsContext.complianceRun.calculationManifest?.id ?? null,
      }
    : {
        rulePackageKey: null,
        ruleVersion: null,
        factorSetKey: null,
        factorSetVersion: null,
        complianceRunId: null,
        calculationManifestId: null,
      };

  const packetPayload = {
    financingSummary: {
      financingCaseId: input.financingCase.id,
      caseType: input.financingCase.caseType,
      caseStatus: input.financingCase.status,
      complianceCycle: input.financingCase.complianceCycle,
      targetFilingYear: input.financingCase.targetFilingYear,
    },
    buildingContext: {
      organizationId: input.financingCase.organizationId,
      buildingId: input.financingCase.buildingId,
      buildingName: input.financingCase.building.name,
      address: input.financingCase.building.address,
      propertyType: input.financingCase.building.propertyType,
      ownershipType: input.financingCase.building.ownershipType,
      grossSquareFeet: input.financingCase.building.grossSquareFeet,
    },
    projectScope: {
      candidateCount: selectedCandidates.length,
      candidates: selectedCandidates,
      bundleTotals: {
        estimatedCapex: bundleCapex,
        estimatedAnnualSavingsKbtu: bundleSavingsKbtu,
        estimatedAnnualSavingsUsd: bundleSavingsUsd,
        estimatedAvoidedPenalty: bundleAvoidedPenalty,
        estimatedComplianceImprovementPct: bundleComplianceImprovementPct,
      },
    },
    rankingRationale: {
      rankingReasonCodes,
      candidateRankings: selectedCandidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        name: candidate.name,
        ranking: candidate.ranking,
      })),
      bundlePriorityScore:
        selectedCandidates.length > 0
          ? round(
              selectedCandidates.reduce(
                (sum, candidate) => sum + (candidate.ranking?.priorityScore ?? 0),
                0,
              ) / selectedCandidates.length,
              2,
            )
          : 0,
    },
    governance,
    bepsContext: input.bepsContext
      ? {
          filingRecordId: input.bepsContext.id,
          filingYear: input.bepsContext.filingYear,
          complianceCycle: input.bepsContext.complianceCycle,
          filingStatus: input.bepsContext.status,
          filingPayload: input.bepsContext.filingPayload,
        }
      : null,
    evidenceManifest,
    warnings,
  };

  const upstreamFingerprint = {
    financingCase: {
      id: input.financingCase.id,
      updatedAt: input.financingCase.updatedAt.toISOString(),
      casePayload: input.financingCase.casePayload,
      candidateIds: input.financingCase.candidates.map((candidate) => candidate.retrofitCandidateId),
    },
    candidates: input.candidateRows.map(({ caseCandidate, ranking }) => ({
      candidateId: caseCandidate.retrofitCandidateId,
      updatedAt: caseCandidate.retrofitCandidate.updatedAt.toISOString(),
      estimatedCapex: caseCandidate.retrofitCandidate.estimatedCapex,
      estimatedAnnualSavingsKbtu:
        caseCandidate.retrofitCandidate.estimatedAnnualSavingsKbtu,
      estimatedAnnualSavingsUsd:
        caseCandidate.retrofitCandidate.estimatedAnnualSavingsUsd,
      estimatedBepsImprovementPct:
        caseCandidate.retrofitCandidate.estimatedBepsImprovementPct,
      ranking,
    })),
    bepsContext: input.bepsContext
      ? {
          filingRecordId: input.bepsContext.id,
          updatedAt: input.bepsContext.updatedAt.toISOString(),
          evidenceArtifacts: input.bepsContext.evidenceArtifacts.map((artifact) => ({
            id: artifact.id,
            createdAt: artifact.createdAt.toISOString(),
            metadata: artifact.metadata,
          })),
        }
      : null,
  };

  return {
    packetPayload,
    packetHash: hashDeterministicJson({ packetPayload, upstreamFingerprint }),
  };
}

async function refreshAggregatedCaseEstimatesTx(
  tx: Prisma.TransactionClient,
  financingCase: FinancingCaseRecord,
) {
  const rankings = await getRankingsForCase(financingCase);
  return tx.financingCase.update({
    where: { id: financingCase.id },
    data: {
      estimatedCapex: round(
        rankings.reduce(
          (sum, row) => sum + row.caseCandidate.retrofitCandidate.estimatedCapex,
          0,
        ),
        2,
      ),
      estimatedAnnualSavingsKbtu: round(
        rankings.reduce(
          (sum, row) => sum + (row.caseCandidate.retrofitCandidate.estimatedAnnualSavingsKbtu ?? 0),
          0,
        ),
        2,
      ),
      estimatedAnnualSavingsUsd: round(
        rankings.reduce(
          (sum, row) => sum + (row.caseCandidate.retrofitCandidate.estimatedAnnualSavingsUsd ?? 0),
          0,
        ),
        2,
      ),
      estimatedAvoidedPenalty: round(
        rankings.reduce((sum, row) => sum + (row.ranking?.estimatedAvoidedPenalty ?? 0), 0),
        2,
      ),
      estimatedComplianceImprovementPct: aggregateComplianceImprovementPct(
        rankings.flatMap((row) => (row.ranking ? [row.ranking] : [])),
      ),
    },
  });
}

export async function upsertFinancingCase(input: {
  organizationId: string;
  buildingId: string;
  financingCaseId?: string;
  name?: string | null;
  description?: string | null;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  complianceCycle?: "CYCLE_1" | "CYCLE_2" | "CYCLE_3" | null;
  targetFilingYear?: number | null;
  candidateIds: string[];
  casePayload?: Record<string, unknown>;
  createdByType: ActorType;
  createdById?: string | null;
}) {
  const candidates = await prisma.retrofitCandidate.findMany({
    where: {
      organizationId: input.organizationId,
      buildingId: input.buildingId,
      id: {
        in: input.candidateIds,
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      complianceCycle: true,
      targetFilingYear: true,
    },
  });

  if (candidates.length !== input.candidateIds.length) {
    throw new Error("One or more retrofit candidates were not found for this building");
  }

  const existing = input.financingCaseId
    ? await loadFinancingCase({
        organizationId: input.organizationId,
        buildingId: input.buildingId,
        financingCaseId: input.financingCaseId,
      })
    : null;

  if (input.financingCaseId && !existing) {
    throw new Error("Financing case not found");
  }

  const caseType = input.candidateIds.length === 1 ? "SINGLE_CANDIDATE" : "BUNDLE";
  const defaultName =
    caseType === "SINGLE_CANDIDATE"
      ? `${candidates[0]?.name ?? "Retrofit"} financing case`
      : `${candidates.length} retrofit bundle financing case`;

  const financingCase = await prisma.$transaction(async (tx) => {
    const caseRecord = existing
      ? await tx.financingCase.update({
          where: { id: existing.id },
          data: {
            name: input.name ?? existing.name,
            description: input.description ?? existing.description,
            status: input.status ?? existing.status,
            caseType,
            complianceCycle:
              input.complianceCycle ?? existing.complianceCycle ?? candidates[0]?.complianceCycle ?? null,
            targetFilingYear:
              input.targetFilingYear ?? existing.targetFilingYear ?? candidates[0]?.targetFilingYear ?? null,
            casePayload: toJson({
              ...toRecord(existing.casePayload),
              ...(input.casePayload ?? {}),
            }),
          },
          include: financingCaseInclude,
        })
      : await tx.financingCase.create({
          data: {
            organizationId: input.organizationId,
            buildingId: input.buildingId,
            name: input.name ?? defaultName,
            description: input.description ?? null,
            status: input.status ?? "DRAFT",
            caseType,
            complianceCycle: input.complianceCycle ?? candidates[0]?.complianceCycle ?? null,
            targetFilingYear: input.targetFilingYear ?? candidates[0]?.targetFilingYear ?? null,
            casePayload: toJson(input.casePayload ?? {}),
            createdByType: input.createdByType,
            createdById: input.createdById ?? null,
          },
          include: financingCaseInclude,
        });

    await tx.financingCaseCandidate.deleteMany({
      where: {
        financingCaseId: caseRecord.id,
      },
    });

    await tx.financingCaseCandidate.createMany({
      data: input.candidateIds.map((candidateId, index) => ({
        organizationId: input.organizationId,
        buildingId: input.buildingId,
        financingCaseId: caseRecord.id,
        retrofitCandidateId: candidateId,
        sortOrder: index,
      })),
    });

    const refreshed = await tx.financingCase.findUniqueOrThrow({
      where: { id: caseRecord.id },
      include: financingCaseInclude,
    });

    await refreshAggregatedCaseEstimatesTx(tx, refreshed);

    return tx.financingCase.findUniqueOrThrow({
      where: { id: caseRecord.id },
      include: financingCaseInclude,
    });
  });

  return financingCase;
}

export async function listFinancingCases(params: {
  organizationId: string;
  buildingId?: string;
  limit?: number;
}) {
  return prisma.financingCase.findMany({
    where: {
      organizationId: params.organizationId,
      ...(params.buildingId ? { buildingId: params.buildingId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: params.limit ?? 100,
    include: {
      building: {
        select: {
          id: true,
          name: true,
        },
      },
      candidates: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          retrofitCandidate: {
            select: {
              id: true,
              name: true,
              projectType: true,
            },
          },
        },
      },
      packets: {
        orderBy: [{ version: "desc" }],
        take: 1,
        select: {
          id: true,
          version: true,
          status: true,
          generatedAt: true,
          finalizedAt: true,
        },
      },
    },
  });
}

async function ensurePacketStaleness(financingCase: FinancingCaseRecord) {
  const latestPacket = financingCase.packets[0] ?? null;
  if (!latestPacket || latestPacket.status === "STALE") {
    return latestPacket;
  }

  const bepsContext = await getLatestBepsContext({
    organizationId: financingCase.organizationId,
    buildingId: financingCase.buildingId,
  });
  const candidateRows = await getRankingsForCase(
    financingCase,
    resolveFinancingPacketEvaluationTime({
      financingCase,
      bepsContext,
    }),
  );
  const { packetHash } = assembleFinancingPacketPayload({
    financingCase,
    candidateRows,
    bepsContext,
  });

  if (packetHash === latestPacket.packetHash) {
    return latestPacket;
  }

  return prisma.financingPacket.update({
    where: { id: latestPacket.id },
    data: {
      status: "STALE",
      staleMarkedAt: new Date(),
    },
  });
}

export async function generateFinancingPacket(input: {
  organizationId: string;
  buildingId: string;
  financingCaseId: string;
  createdByType: ActorType;
  createdById?: string | null;
}) {
  const financingCase = await loadFinancingCase({
    organizationId: input.organizationId,
    buildingId: input.buildingId,
    financingCaseId: input.financingCaseId,
  });

  if (!financingCase) {
    throw new Error("Financing case not found");
  }

  const bepsContext = await getLatestBepsContext({
    organizationId: input.organizationId,
    buildingId: input.buildingId,
  });
  const candidateRows = await getRankingsForCase(
    financingCase,
    resolveFinancingPacketEvaluationTime({
      financingCase,
      bepsContext,
    }),
  );

  const { packetPayload, packetHash } = assembleFinancingPacketPayload({
    financingCase,
    candidateRows,
    bepsContext,
  });
  const latestPacket = financingCase.packets[0] ?? null;

  if (latestPacket && latestPacket.packetHash === packetHash && latestPacket.status !== "STALE") {
    return prisma.financingPacket.findUniqueOrThrow({
      where: { id: latestPacket.id },
      include: {
        financingCase: {
          include: {
            candidates: {
              orderBy: [{ sortOrder: "asc" }],
              include: {
                retrofitCandidate: true,
              },
            },
          },
        },
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    if (latestPacket) {
      await tx.financingPacket.updateMany({
        where: {
          financingCaseId: input.financingCaseId,
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

    const packet = await tx.financingPacket.create({
      data: {
        organizationId: input.organizationId,
        buildingId: input.buildingId,
        financingCaseId: input.financingCaseId,
        complianceCycle: financingCase.complianceCycle,
        targetFilingYear: financingCase.targetFilingYear,
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

    return tx.financingPacket.findUniqueOrThrow({
      where: { id: packet.id },
      include: {
        financingCase: {
          include: {
            candidates: {
              orderBy: [{ sortOrder: "asc" }],
              include: {
                retrofitCandidate: true,
              },
            },
          },
        },
      },
    });
  });
}

export async function finalizeFinancingPacket(input: {
  organizationId: string;
  buildingId: string;
  financingCaseId: string;
  createdByType: ActorType;
  createdById?: string | null;
}) {
  const financingCase = await loadFinancingCase({
    organizationId: input.organizationId,
    buildingId: input.buildingId,
    financingCaseId: input.financingCaseId,
  });

  if (!financingCase) {
    throw new Error("Financing case not found");
  }

  await ensurePacketStaleness(financingCase);

  const latestPacket = await prisma.financingPacket.findFirst({
    where: {
      financingCaseId: input.financingCaseId,
      organizationId: input.organizationId,
      buildingId: input.buildingId,
    },
    orderBy: [{ version: "desc" }],
  });

  if (!latestPacket) {
    throw new Error("Financing packet not found");
  }

  if (latestPacket.status === "STALE") {
    throw new Error("Financing packet cannot be finalized while stale");
  }

  if (latestPacket.status === "FINALIZED") {
    return latestPacket;
  }

  return prisma.financingPacket.update({
    where: { id: latestPacket.id },
    data: {
      status: "FINALIZED",
      finalizedAt: new Date(),
      finalizedByType: input.createdByType,
      finalizedById: input.createdById ?? null,
    },
  });
}

export async function getLatestFinancingPacket(params: {
  organizationId: string;
  buildingId: string;
  financingCaseId: string;
}) {
  const financingCase = await loadFinancingCase(params);
  if (!financingCase) {
    return null;
  }

  await ensurePacketStaleness(financingCase);

  return prisma.financingPacket.findFirst({
    where: {
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      financingCaseId: params.financingCaseId,
    },
    orderBy: [{ version: "desc" }],
    include: {
      financingCase: {
        include: {
          candidates: {
            orderBy: [{ sortOrder: "asc" }],
            include: {
              retrofitCandidate: {
                include: {
                  sourceArtifact: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function getFinancingPacketManifest(params: {
  organizationId: string;
  buildingId: string;
  financingCaseId: string;
}) {
  const packet = await getLatestFinancingPacket(params);
  if (!packet) {
    return null;
  }

  const payload = toRecord(packet.packetPayload);
  return {
    id: packet.id,
    version: packet.version,
    status: packet.status,
    evidenceManifest: toArray(payload["evidenceManifest"]),
    rankingRationale: toRecord(payload["rankingRationale"]),
    warnings: toArray(payload["warnings"]),
  };
}

export async function exportFinancingPacket(params: {
  organizationId: string;
  buildingId: string;
  financingCaseId: string;
  format: "JSON" | "MARKDOWN";
}) {
  const packet = await getLatestFinancingPacket(params);
  if (!packet) {
    throw new Error("Financing packet not found");
  }

  const payload = toRecord(packet.packetPayload);
  const baseFileName = [
    slugifyFileSegment(packet.financingCase.name),
    slugifyFileSegment(packet.complianceCycle ?? "financing"),
    packet.targetFilingYear ?? "packet",
    `packet-v${packet.version}`,
  ].join("_");

  if (params.format === "MARKDOWN") {
    const content = [
      "# Financing Packet",
      "",
      "## Packet",
      `- Packet ID: ${packet.id}`,
      `- Version: ${packet.version}`,
      `- Status: ${packet.status}`,
      `- Hash: ${packet.packetHash}`,
      "",
      "## Payload",
      "```json",
      stringifyDeterministicJson(payload),
      "```",
      "",
    ].join("\n");

    return {
      packetId: packet.id,
      version: packet.version,
      status: packet.status,
      packetHash: packet.packetHash,
      format: "MARKDOWN" as const,
      fileName: `${baseFileName}.md`,
      contentType: "text/markdown",
      content,
    };
  }

  return {
    packetId: packet.id,
    version: packet.version,
    status: packet.status,
    packetHash: packet.packetHash,
    format: "JSON" as const,
    fileName: `${baseFileName}.json`,
    contentType: "application/json",
    content: stringifyDeterministicJson({
      packet: {
        id: packet.id,
        version: packet.version,
        status: packet.status,
        packetHash: packet.packetHash,
      },
      payload,
    }),
  };
}
