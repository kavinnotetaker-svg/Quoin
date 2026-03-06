import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, getTenantClient } from "@/server/lib/db";

describe("RLS Tenant Isolation", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let buildingA: { id: string };
  let buildingB: { id: string };

  beforeAll(async () => {
    // quoin_app role is created by migration 00000000000002_app_role.
    // Create test orgs with unique slugs to avoid collisions with seed data
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
    });
  });

  afterAll(async () => {
    // Disable append-only rules for cleanup (superuser can ALTER TABLE)
    await prisma.$executeRawUnsafe(
      `ALTER TABLE compliance_snapshots DISABLE RULE IF EXISTS compliance_snapshots_no_delete`
    ).catch(() => { /* Ignore if rule doesn't exist or permission denied in CI */ });
    await prisma.$executeRawUnsafe(
      `ALTER TABLE energy_readings DISABLE RULE IF EXISTS energy_readings_no_delete`
    ).catch(() => { /* Ignore if rule doesn't exist */ });

    // Delete in FK order: snapshots → users → buildings → orgs
    await prisma.complianceSnapshot.deleteMany({
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

    // Re-enable append-only rules
    await prisma.$executeRawUnsafe(
      `ALTER TABLE compliance_snapshots ENABLE RULE IF EXISTS compliance_snapshots_no_delete`
    ).catch(() => { /* Ignore if rule doesn't exist */ });
    await prisma.$executeRawUnsafe(
      `ALTER TABLE energy_readings ENABLE RULE IF EXISTS energy_readings_no_delete`
    ).catch(() => { /* Ignore if rule doesn't exist */ });

    await prisma.$disconnect();
  });

  // ─── Building Isolation ────────────────────────────────────────────────

  it("Org A can see its own buildings", async () => {
    const clientA = getTenantClient(orgA.id);
    const buildings = await clientA.building.findMany({
      where: { organizationId: orgA.id },
    });
    expect(buildings).toHaveLength(1);
    expect(buildings[0].name).toBe("Building Alpha");
  });

  it("Org A CANNOT see Org B buildings", async () => {
    const clientA = getTenantClient(orgA.id);
    const buildings = await clientA.building.findMany();
    const names = buildings.map((b) => b.name);
    expect(names).not.toContain("Building Beta");
  });

  it("Org B can see its own buildings", async () => {
    const clientB = getTenantClient(orgB.id);
    const buildings = await clientB.building.findMany({
      where: { organizationId: orgB.id },
    });
    expect(buildings).toHaveLength(1);
    expect(buildings[0].name).toBe("Building Beta");
  });

  it("Org B CANNOT see Org A buildings", async () => {
    const clientB = getTenantClient(orgB.id);
    const buildings = await clientB.building.findMany();
    const names = buildings.map((b) => b.name);
    expect(names).not.toContain("Building Alpha");
  });

  // ─── Direct ID Lookup Isolation ────────────────────────────────────────

  it("Org A cannot access Org B building by direct ID lookup", async () => {
    const clientA = getTenantClient(orgA.id);
    const building = await clientA.building.findUnique({
      where: { id: buildingB.id },
    });
    expect(building).toBeNull();
  });

  it("Org B cannot access Org A building by direct ID lookup", async () => {
    const clientB = getTenantClient(orgB.id);
    const building = await clientB.building.findUnique({
      where: { id: buildingA.id },
    });
    expect(building).toBeNull();
  });

  // ─── Input Validation ─────────────────────────────────────────────────

  it("empty organization ID throws", () => {
    expect(() => getTenantClient("")).toThrow("Invalid organizationId format");
  });

  it("non-CUID organization ID throws", () => {
    expect(() => getTenantClient("not-a-valid-cuid")).toThrow(
      "Invalid organizationId format"
    );
  });

  it("SQL injection attempt throws", () => {
    expect(() => getTenantClient("'; DROP TABLE organizations; --")).toThrow(
      "Invalid organizationId format"
    );
  });

  // ─── ComplianceSnapshot Isolation ──────────────────────────────────────

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

    // Org B should not see Org A's snapshot
    const clientB = getTenantClient(orgB.id);
    const snapshots = await clientB.complianceSnapshot.findMany();
    const buildingIds = snapshots.map((s) => s.buildingId);
    expect(buildingIds).not.toContain(buildingA.id);
  });

  // ─── User Isolation ────────────────────────────────────────────────────

  it("RLS isolates users", async () => {
    const ts = Date.now();

    await prisma.user.create({
      data: {
        organizationId: orgA.id,
        clerkUserId: `clerk_test_user_a_${ts}`,
        email: `testa_${ts}@test.com`,
        name: "Test User A",
        role: "ADMIN",
      },
    });

    await prisma.user.create({
      data: {
        organizationId: orgB.id,
        clerkUserId: `clerk_test_user_b_${ts}`,
        email: `testb_${ts}@test.com`,
        name: "Test User B",
        role: "ADMIN",
      },
    });

    const clientA = getTenantClient(orgA.id);
    const users = await clientA.user.findMany();
    const names = users.map((u) => u.name);
    expect(names).toContain("Test User A");
    expect(names).not.toContain("Test User B");

    const clientB = getTenantClient(orgB.id);
    const usersB = await clientB.user.findMany();
    const namesB = usersB.map((u) => u.name);
    expect(namesB).toContain("Test User B");
    expect(namesB).not.toContain("Test User A");
  });

  // ─── Admin Client Bypasses RLS ─────────────────────────────────────────

  it("admin client (superuser) sees all data across tenants", async () => {
    const allBuildings = await prisma.building.findMany();
    const names = allBuildings.map((b) => b.name);
    expect(names).toContain("Building Alpha");
    expect(names).toContain("Building Beta");
  });
});
