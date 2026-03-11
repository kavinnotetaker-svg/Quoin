export const LATEST_SNAPSHOT_ORDER = [
  { snapshotDate: "desc" as const },
  { id: "desc" as const },
];

type ComplianceSnapshotLookupClient = {
  complianceSnapshot: {
    findFirst: (args: {
      where: Record<string, unknown>;
      orderBy: typeof LATEST_SNAPSHOT_ORDER;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    }) => Promise<unknown>;
  };
};

export async function getLatestComplianceSnapshot(
  db: ComplianceSnapshotLookupClient,
  input: {
    buildingId: string;
    organizationId?: string;
    where?: Record<string, unknown>;
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
  },
) {
  return db.complianceSnapshot.findFirst({
    where: {
      buildingId: input.buildingId,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.where ?? {}),
    },
    orderBy: LATEST_SNAPSHOT_ORDER,
    ...(input.select ? { select: input.select } : {}),
    ...(input.include ? { include: input.include } : {}),
  });
}
