import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env["DATABASE_URL"]!,
});
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log("Seeding database...");

  // ─── Organization 1: Meridian Capital Partners (PRO) ────────────────────

  const org1 = await prisma.organization.create({
    data: {
      name: "Meridian Capital Partners",
      slug: "meridian-capital",
      clerkOrgId: "clerk_org_meridian_001",
      tier: "PRO",
      settings: {},
    },
  });

  await prisma.user.create({
    data: {
      organizationId: org1.id,
      clerkUserId: "clerk_user_meridian_admin_001",
      email: "admin@meridiancapital.com",
      name: "Sarah Chen",
      role: "ADMIN",
    },
  });

  const org1Buildings = await Promise.all([
    prisma.building.create({
      data: {
        organizationId: org1.id,
        name: "K Street Tower",
        address: "1200 K Street NW, Washington, DC 20005",
        latitude: 38.9025,
        longitude: -77.0283,
        grossSquareFeet: 185000,
        propertyType: "OFFICE",
        yearBuilt: 1988,
        bepsTargetScore: 71,
        maxPenaltyExposure: Math.min(185000 * 10, 7_500_000),
      },
    }),
    prisma.building.create({
      data: {
        organizationId: org1.id,
        name: "L Street Office Center",
        address: "1350 L Street NW, Washington, DC 20005",
        latitude: 38.9042,
        longitude: -77.0312,
        grossSquareFeet: 220000,
        propertyType: "OFFICE",
        yearBuilt: 1995,
        bepsTargetScore: 71,
        maxPenaltyExposure: Math.min(220000 * 10, 7_500_000),
      },
    }),
    prisma.building.create({
      data: {
        organizationId: org1.id,
        name: "Connecticut Avenue Plaza",
        address: "1625 Connecticut Avenue NW, Washington, DC 20009",
        latitude: 38.9132,
        longitude: -77.0451,
        grossSquareFeet: 145000,
        propertyType: "OFFICE",
        yearBuilt: 2001,
        bepsTargetScore: 71,
        maxPenaltyExposure: Math.min(145000 * 10, 7_500_000),
      },
    }),
    prisma.building.create({
      data: {
        organizationId: org1.id,
        name: "Columbia Heights Residences",
        address: "3100 14th Street NW, Washington, DC 20010",
        latitude: 38.9282,
        longitude: -77.0323,
        grossSquareFeet: 95000,
        propertyType: "MULTIFAMILY",
        yearBuilt: 1972,
        bepsTargetScore: 66,
        maxPenaltyExposure: Math.min(95000 * 10, 7_500_000),
      },
    }),
    prisma.building.create({
      data: {
        organizationId: org1.id,
        name: "U Street Mixed-Use",
        address: "1401 U Street NW, Washington, DC 20009",
        latitude: 38.9170,
        longitude: -77.0326,
        grossSquareFeet: 68000,
        propertyType: "MIXED_USE",
        yearBuilt: 2010,
        bepsTargetScore: 61,
        maxPenaltyExposure: Math.min(68000 * 10, 7_500_000),
      },
    }),
  ]);

  // Create compliance snapshots for Org 1 buildings
  // K Street Tower: COMPLIANT (score 78, target 71)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org1Buildings[0].id,
      organizationId: org1.id,
      triggerType: "MANUAL",
      energyStarScore: 78,
      siteEui: 62.3,
      sourceEui: 145.8,
      complianceStatus: "COMPLIANT",
      complianceGap: 7,
      estimatedPenalty: 0,
      dataQualityScore: 92,
    },
  });

  // L Street Office Center: AT_RISK (score 68, target 71)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org1Buildings[1].id,
      organizationId: org1.id,
      triggerType: "MANUAL",
      energyStarScore: 68,
      siteEui: 78.5,
      sourceEui: 172.4,
      complianceStatus: "AT_RISK",
      complianceGap: -3,
      estimatedPenalty: 450000,
      dataQualityScore: 88,
    },
  });

  // Connecticut Avenue Plaza: COMPLIANT (score 82, target 71)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org1Buildings[2].id,
      organizationId: org1.id,
      triggerType: "MANUAL",
      energyStarScore: 82,
      siteEui: 54.1,
      sourceEui: 128.3,
      complianceStatus: "COMPLIANT",
      complianceGap: 11,
      estimatedPenalty: 0,
      dataQualityScore: 95,
    },
  });

  // Columbia Heights Residences: NON_COMPLIANT (score 52, target 66)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org1Buildings[3].id,
      organizationId: org1.id,
      triggerType: "MANUAL",
      energyStarScore: 52,
      siteEui: 98.7,
      sourceEui: 112.4,
      complianceStatus: "NON_COMPLIANT",
      complianceGap: -14,
      estimatedPenalty: 680000,
      dataQualityScore: 75,
    },
  });

  // U Street Mixed-Use: AT_RISK (score 59, target 61)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org1Buildings[4].id,
      organizationId: org1.id,
      triggerType: "MANUAL",
      energyStarScore: 59,
      siteEui: 85.2,
      sourceEui: 165.7,
      complianceStatus: "AT_RISK",
      complianceGap: -2,
      estimatedPenalty: 220000,
      dataQualityScore: 82,
    },
  });

  // ─── Organization 2: District Housing Alliance (ENTERPRISE) ─────────────

  const org2 = await prisma.organization.create({
    data: {
      name: "District Housing Alliance",
      slug: "district-housing",
      clerkOrgId: "clerk_org_dha_002",
      tier: "ENTERPRISE",
      settings: {},
    },
  });

  await prisma.user.create({
    data: {
      organizationId: org2.id,
      clerkUserId: "clerk_user_dha_admin_001",
      email: "admin@districthousing.org",
      name: "Marcus Williams",
      role: "ADMIN",
    },
  });

  const org2Buildings = await Promise.all([
    prisma.building.create({
      data: {
        organizationId: org2.id,
        name: "Anacostia Gardens",
        address: "2100 Martin Luther King Jr Avenue SE, Washington, DC 20020",
        latitude: 38.8583,
        longitude: -76.9853,
        grossSquareFeet: 120000,
        propertyType: "MULTIFAMILY",
        yearBuilt: 1965,
        bepsTargetScore: 66,
        maxPenaltyExposure: Math.min(120000 * 10, 7_500_000),
      },
    }),
    prisma.building.create({
      data: {
        organizationId: org2.id,
        name: "Congress Heights Commons",
        address: "3500 Wheeler Road SE, Washington, DC 20032",
        latitude: 38.8358,
        longitude: -76.9989,
        grossSquareFeet: 85000,
        propertyType: "MULTIFAMILY",
        yearBuilt: 1958,
        bepsTargetScore: 66,
        maxPenaltyExposure: Math.min(85000 * 10, 7_500_000),
      },
    }),
    prisma.building.create({
      data: {
        organizationId: org2.id,
        name: "Petworth Place",
        address: "4200 Georgia Avenue NW, Washington, DC 20011",
        latitude: 38.9412,
        longitude: -77.0233,
        grossSquareFeet: 72000,
        propertyType: "MULTIFAMILY",
        yearBuilt: 1971,
        bepsTargetScore: 66,
        maxPenaltyExposure: Math.min(72000 * 10, 7_500_000),
      },
    }),
  ]);

  // All org2 buildings are NON_COMPLIANT (affordable housing, tests AHRA eligibility)
  // Anacostia Gardens: NON_COMPLIANT (score 41, target 66)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org2Buildings[0].id,
      organizationId: org2.id,
      triggerType: "MANUAL",
      energyStarScore: 41,
      siteEui: 118.5,
      sourceEui: 134.2,
      complianceStatus: "NON_COMPLIANT",
      complianceGap: -25,
      estimatedPenalty: 950000,
      dataQualityScore: 68,
    },
  });

  // Congress Heights Commons: NON_COMPLIANT (score 35, target 66)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org2Buildings[1].id,
      organizationId: org2.id,
      triggerType: "MANUAL",
      energyStarScore: 35,
      siteEui: 132.4,
      sourceEui: 150.8,
      complianceStatus: "NON_COMPLIANT",
      complianceGap: -31,
      estimatedPenalty: 850000,
      dataQualityScore: 62,
    },
  });

  // Petworth Place: NON_COMPLIANT (score 48, target 66)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org2Buildings[2].id,
      organizationId: org2.id,
      triggerType: "MANUAL",
      energyStarScore: 48,
      siteEui: 105.3,
      sourceEui: 119.8,
      complianceStatus: "NON_COMPLIANT",
      complianceGap: -18,
      estimatedPenalty: 720000,
      dataQualityScore: 71,
    },
  });

  // ─── Organization 3: Foggy Bottom Hotels LLC (FREE) ─────────────────────

  const org3 = await prisma.organization.create({
    data: {
      name: "Foggy Bottom Hotels LLC",
      slug: "foggy-bottom-hotels",
      clerkOrgId: "clerk_org_fbh_003",
      tier: "FREE",
      settings: {},
    },
  });

  await prisma.user.create({
    data: {
      organizationId: org3.id,
      clerkUserId: "clerk_user_fbh_admin_001",
      email: "admin@foggybottomhotels.com",
      name: "Patricia Nguyen",
      role: "ADMIN",
    },
  });

  const org3Buildings = await Promise.all([
    prisma.building.create({
      data: {
        organizationId: org3.id,
        name: "New Hampshire Suites",
        address: "1143 New Hampshire Avenue NW, Washington, DC 20037",
        latitude: 38.9058,
        longitude: -77.0479,
        grossSquareFeet: 110000,
        propertyType: "OTHER",
        yearBuilt: 1985,
        bepsTargetScore: 61,
        maxPenaltyExposure: Math.min(110000 * 10, 7_500_000),
      },
    }),
    prisma.building.create({
      data: {
        organizationId: org3.id,
        name: "M Street Boutique Hotel",
        address: "2430 M Street NW, Washington, DC 20037",
        latitude: 38.9050,
        longitude: -77.0530,
        grossSquareFeet: 52000,
        propertyType: "OTHER",
        yearBuilt: 2005,
        bepsTargetScore: 61,
        maxPenaltyExposure: Math.min(52000 * 10, 7_500_000),
      },
    }),
  ]);

  // New Hampshire Suites: COMPLIANT (score 67, target 61)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org3Buildings[0].id,
      organizationId: org3.id,
      triggerType: "MANUAL",
      energyStarScore: 67,
      siteEui: 95.4,
      sourceEui: 198.3,
      complianceStatus: "COMPLIANT",
      complianceGap: 6,
      estimatedPenalty: 0,
      dataQualityScore: 85,
    },
  });

  // M Street Boutique Hotel: AT_RISK (score 58, target 61)
  await prisma.complianceSnapshot.create({
    data: {
      buildingId: org3Buildings[1].id,
      organizationId: org3.id,
      triggerType: "MANUAL",
      energyStarScore: 58,
      siteEui: 108.7,
      sourceEui: 225.6,
      complianceStatus: "AT_RISK",
      complianceGap: -3,
      estimatedPenalty: 180000,
      dataQualityScore: 78,
    },
  });

  console.log("Seed complete:");
  console.log("  Organizations: 3");
  console.log("  Users: 3");
  console.log("  Buildings: 10");
  console.log("  Compliance Snapshots: 10");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
