import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantClient, prisma } from "@/server/lib/db";

async function dropAppendOnlyRulesForCleanup() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_rules
        WHERE schemaname = 'public'
          AND tablename = 'compliance_snapshots'
          AND rulename = 'compliance_snapshots_no_delete'
      ) THEN
        EXECUTE 'DROP RULE compliance_snapshots_no_delete ON compliance_snapshots';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_rules
        WHERE schemaname = 'public'
          AND tablename = 'energy_readings'
          AND rulename = 'energy_readings_no_delete'
      ) THEN
        EXECUTE 'DROP RULE energy_readings_no_delete ON energy_readings';
      END IF;
    END
    $$;
  `);
}

async function restoreAppendOnlyRules() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_rules
        WHERE schemaname = 'public'
          AND tablename = 'energy_readings'
          AND rulename = 'energy_readings_no_delete'
      ) THEN
        EXECUTE 'CREATE RULE energy_readings_no_delete AS ON DELETE TO energy_readings DO INSTEAD NOTHING';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_rules
        WHERE schemaname = 'public'
          AND tablename = 'compliance_snapshots'
          AND rulename = 'compliance_snapshots_no_delete'
      ) THEN
        EXECUTE 'CREATE RULE compliance_snapshots_no_delete AS ON DELETE TO compliance_snapshots DO INSTEAD NOTHING';
      END IF;
    END
    $$;
  `);
}

describe("RLS tenant isolation", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let buildingA: { id: string };
  let buildingB: { id: string };

  beforeAll(async () => {
    const ts = Date.now();

    orgA = await prisma.organization.create({
      data: {
        name: "Test Org A",
        slug: `test-org-a-${ts}`,
        clerkOrgId: `clerk_test_a_${ts}`,
        tier: "FREE",
      },
    });

    orgB = await prisma.organization.create({
      data: {
        name: "Test Org B",
        slug: `test-org-b-${ts}`,
        clerkOrgId: `clerk_test_b_${ts}`,
        tier: "FREE",
      },
    });

    buildingA = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: "Building Alpha",
        address: "100 Test St NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.0,
        grossSquareFeet: 100000,
        propertyType: "OFFICE",
        bepsTargetScore: 71,
        maxPenaltyExposure: 1000000,
      },
      select: { id: true },
    });

    buildingB = await prisma.building.create({
      data: {
        organizationId: orgB.id,
        name: "Building Beta",
        address: "200 Test St NW, Washington, DC 20001",
        latitude: 38.91,
        longitude: -77.01,
        grossSquareFeet: 80000,
        propertyType: "MULTIFAMILY",
        bepsTargetScore: 66,
        maxPenaltyExposure: 800000,
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await dropAppendOnlyRulesForCleanup().catch(() => undefined);

    await prisma.complianceSnapshot.deleteMany({
      where: { buildingId: { in: [buildingA.id, buildingB.id] } },
    });
    await prisma.energyReading.deleteMany({
      where: { buildingId: { in: [buildingA.id, buildingB.id] } },
    });
    await prisma.user.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.building.deleteMany({
      where: { id: { in: [buildingA.id, buildingB.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });

    await restoreAppendOnlyRules().catch(() => undefined);
    await prisma.$disconnect();
  });

  it("org A sees only its own buildings", async () => {
    const clientA = getTenantClient(orgA.id);
    const buildings = await clientA.building.findMany();
    expect(buildings.map((building) => building.name)).toEqual(["Building Alpha"]);
  });

  it("org B sees only its own buildings", async () => {
    const clientB = getTenantClient(orgB.id);
    const buildings = await clientB.building.findMany();
    expect(buildings.map((building) => building.name)).toEqual(["Building Beta"]);
  });

  it("direct ID lookup across tenants returns null", async () => {
    const clientA = getTenantClient(orgA.id);
    const building = await clientA.building.findUnique({
      where: { id: buildingB.id },
    });
    expect(building).toBeNull();
  });

  it("cross-tenant update is blocked by RLS", async () => {
    const clientA = getTenantClient(orgA.id);
    const result = await clientA.building.updateMany({
      where: { id: buildingB.id },
      data: { name: "Compromised" },
    });

    expect(result.count).toBe(0);

    const unchanged = await prisma.building.findUnique({
      where: { id: buildingB.id },
      select: { name: true },
    });
    expect(unchanged?.name).toBe("Building Beta");
  });

  it("cross-tenant delete is blocked by RLS", async () => {
    const clientA = getTenantClient(orgA.id);
    const result = await clientA.building.deleteMany({
      where: { id: buildingB.id },
    });

    expect(result.count).toBe(0);

    const stillThere = await prisma.building.findUnique({
      where: { id: buildingB.id },
      select: { id: true },
    });
    expect(stillThere?.id).toBe(buildingB.id);
  });

  it("empty or invalid organization IDs are rejected", () => {
    expect(() => getTenantClient("")).toThrow("Invalid organizationId format");
    expect(() => getTenantClient("not-a-valid-cuid")).toThrow(
      "Invalid organizationId format",
    );
    expect(() => getTenantClient("'; DROP TABLE organizations; --")).toThrow(
      "Invalid organizationId format",
    );
  });

  it("RLS isolates compliance snapshots", async () => {
    await prisma.complianceSnapshot.create({
      data: {
        buildingId: buildingA.id,
        organizationId: orgA.id,
        triggerType: "MANUAL",
        complianceStatus: "NON_COMPLIANT",
        energyStarScore: 45,
        siteEui: 120,
      },
    });

    const clientB = getTenantClient(orgB.id);
    const snapshots = await clientB.complianceSnapshot.findMany();
    expect(snapshots.map((snapshot) => snapshot.buildingId)).not.toContain(buildingA.id);
  });

  it("RLS isolates users", async () => {
    const ts = Date.now();

    await prisma.user.createMany({
      data: [
        {
          organizationId: orgA.id,
          clerkUserId: `clerk_test_user_a_${ts}`,
          email: `testa_${ts}@test.com`,
          name: "Test User A",
          role: "ADMIN",
        },
        {
          organizationId: orgB.id,
          clerkUserId: `clerk_test_user_b_${ts}`,
          email: `testb_${ts}@test.com`,
          name: "Test User B",
          role: "ADMIN",
        },
      ],
    });

    const clientA = getTenantClient(orgA.id);
    const usersA = await clientA.user.findMany();
    expect(usersA.map((user) => user.name)).toContain("Test User A");
    expect(usersA.map((user) => user.name)).not.toContain("Test User B");

    const clientB = getTenantClient(orgB.id);
    const usersB = await clientB.user.findMany();
    expect(usersB.map((user) => user.name)).toContain("Test User B");
    expect(usersB.map((user) => user.name)).not.toContain("Test User A");
  });
});
