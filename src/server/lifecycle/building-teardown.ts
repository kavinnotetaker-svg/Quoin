import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";

type BuildingTeardownDelegateName =
  | "submissionWorkflowEvent"
  | "submissionWorkflow"
  | "filingPacket"
  | "filingRecordEvent"
  | "benchmarkPacket"
  | "reportArtifact"
  | "penaltyRun"
  | "meterSourceReconciliation"
  | "buildingSourceReconciliation"
  | "verificationItemResult"
  | "dataIssue"
  | "benchmarkRequestItem"
  | "bepsRequestItem"
  | "evidenceArtifact"
  | "filingRecord"
  | "benchmarkSubmission"
  | "bepsAlternativeComplianceAgreement"
  | "bepsPrescriptiveItem"
  | "bepsMetricInput"
  | "portfolioManagerSyncState"
  | "operationalAnomaly"
  | "retrofitCandidate"
  | "driftAlert"
  | "auditLog"
  | "job"
  | "energyReading"
  | "complianceSnapshot"
  | "complianceRun"
  | "pipelineRun"
  | "meter"
  | "greenButtonConnection"
  | "sourceArtifact"
  | "financingPacket"
  | "financingCaseCandidate"
  | "financingCase";

export const ACTIVE_BUILDING_TEARDOWN_DELEGATES = [
  "submissionWorkflowEvent",
  "submissionWorkflow",
  "filingPacket",
  "filingRecordEvent",
  "benchmarkPacket",
  "reportArtifact",
  "penaltyRun",
  "meterSourceReconciliation",
  "buildingSourceReconciliation",
  "verificationItemResult",
  "dataIssue",
  "benchmarkRequestItem",
  "bepsRequestItem",
  "evidenceArtifact",
  "filingRecord",
  "benchmarkSubmission",
  "bepsAlternativeComplianceAgreement",
  "bepsPrescriptiveItem",
  "bepsMetricInput",
  "portfolioManagerSyncState",
  "operationalAnomaly",
  "retrofitCandidate",
  "driftAlert",
  "auditLog",
  "job",
  "energyReading",
  "complianceSnapshot",
  "complianceRun",
  "pipelineRun",
  "meter",
  "greenButtonConnection",
  "sourceArtifact",
] as const satisfies readonly BuildingTeardownDelegateName[];

export const LEGACY_BUILDING_TEARDOWN_DELEGATES = [
  "financingPacket",
  "financingCaseCandidate",
  "financingCase",
] as const satisfies readonly BuildingTeardownDelegateName[];

export const BUILDING_TEARDOWN_DELEGATES = [
  ...ACTIVE_BUILDING_TEARDOWN_DELEGATES,
  ...LEGACY_BUILDING_TEARDOWN_DELEGATES,
] as const satisfies readonly BuildingTeardownDelegateName[];

type BuildingScope = {
  organizationId: string;
  buildingId: string;
};

type DeleteManyDelegate = {
  deleteMany: (args: { where: BuildingScope }) => Promise<unknown>;
};

function getDeleteManyDelegate(
  tx: Prisma.TransactionClient,
  delegateName: BuildingTeardownDelegateName,
) {
  return tx[delegateName] as unknown as DeleteManyDelegate;
}

async function deleteBuildingChildrenTx(
  tx: Prisma.TransactionClient,
  scope: BuildingScope,
) {
  for (const delegateName of BUILDING_TEARDOWN_DELEGATES) {
    await getDeleteManyDelegate(tx, delegateName).deleteMany({
      where: scope,
    });
  }
}

export async function deleteBuildingLifecycle(input: BuildingScope) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.organization_id', $1, true)`,
      input.organizationId,
    );
    await tx.$executeRawUnsafe(`SET LOCAL ROLE quoin_app`);

    await deleteBuildingChildrenTx(tx, input);

    const deleted = await tx.building.deleteMany({
      where: {
        id: input.buildingId,
        organizationId: input.organizationId,
      },
    });

    if (deleted.count !== 1) {
      throw new Error("Building delete did not affect the expected record.");
    }
  });
}
