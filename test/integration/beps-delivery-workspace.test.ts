import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/server/lib/db";
import * as packetDocuments from "@/server/rendering/packet-documents";
import { appRouter } from "@/server/trpc/routers";

describe("BEPS delivery workspace", () => {
  const scope = `${Date.now()}`;

  let orgA: { id: string; clerkOrgId: string };
  let orgB: { id: string; clerkOrgId: string };
  let userA: { id: string; clerkUserId: string };
  let userB: { id: string; clerkUserId: string };
  let buildingA: { id: string };
  let filingCompliance: { id: string };
  let filingExemption: { id: string };
  let rulePackageId: string;
  let ruleVersionId: string;
  let factorSetVersionId: string;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    const sourceArtifact = await prisma.sourceArtifact.create({
      data: {
        artifactType: "GUIDE",
        name: `BEPS delivery source ${scope}`,
        externalUrl: `https://example.com/beps-delivery-${scope}`,
        metadata: { scope },
        createdByType: "SYSTEM",
        createdById: "test",
      },
    });

    const rulePackage = await prisma.rulePackage.create({
      data: {
        key: `BEPS_DELIVERY_RULES_${scope}`,
        name: `BEPS Delivery Rules ${scope}`,
      },
      select: { id: true },
    });
    rulePackageId = rulePackage.id;

    const ruleVersion = await prisma.ruleVersion.create({
      data: {
        rulePackageId: rulePackage.id,
        sourceArtifactId: sourceArtifact.id,
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        implementationKey: "beps/evaluator-v1",
        configJson: {
          cycle: "CYCLE_1",
          filingYear: 2026,
        },
      },
      select: { id: true },
    });
    ruleVersionId = ruleVersion.id;

    const factorSetVersion = await prisma.factorSetVersion.create({
      data: {
        key: `BEPS_DELIVERY_FACTORS_${scope}`,
        sourceArtifactId: sourceArtifact.id,
        version: "test-v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        factorsJson: {
          beps: {
            cycle: {
              filingYear: 2026,
              cycleStartYear: 2021,
              cycleEndYear: 2026,
            },
          },
        },
      },
      select: { id: true },
    });
    factorSetVersionId = factorSetVersion.id;

    orgA = await prisma.organization.create({
      data: {
        name: `BEPS Delivery Org A ${scope}`,
        slug: `beps-delivery-org-a-${scope}`,
        clerkOrgId: `clerk_beps_delivery_org_a_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    orgB = await prisma.organization.create({
      data: {
        name: `BEPS Delivery Org B ${scope}`,
        slug: `beps-delivery-org-b-${scope}`,
        clerkOrgId: `clerk_beps_delivery_org_b_${scope}`,
        tier: "FREE",
      },
      select: { id: true, clerkOrgId: true },
    });

    userA = await prisma.user.create({
      data: {
        clerkUserId: `clerk_beps_delivery_user_a_${scope}`,
        email: `beps_delivery_a_${scope}@test.com`,
        name: "BEPS Delivery User A",
      },
      select: { id: true, clerkUserId: true },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: `clerk_beps_delivery_user_b_${scope}`,
        email: `beps_delivery_b_${scope}@test.com`,
        name: "BEPS Delivery User B",
      },
      select: { id: true, clerkUserId: true },
    });

    await prisma.organizationMembership.createMany({
      data: [
        { organizationId: orgA.id, userId: userA.id, role: "ADMIN" },
        { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
      ],
    });

    buildingA = await prisma.building.create({
      data: {
        organizationId: orgA.id,
        name: `BEPS Delivery Building ${scope}`,
        address: "500 Delivery Way NW, Washington, DC 20001",
        latitude: 38.9,
        longitude: -77.03,
        grossSquareFeet: 125000,
        propertyType: "OFFICE",
        ownershipType: "PRIVATE",
        bepsTargetScore: 71,
      },
      select: { id: true },
    });

    const complianceRun = await prisma.complianceRun.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingA.id,
        ruleVersionId,
        factorSetVersionId,
        runType: "BEPS_EVALUATION",
        status: "SUCCEEDED",
        inputSnapshotRef: `snapshot:${scope}`,
        inputSnapshotHash: `hash:${scope}`,
        resultPayload: { scope, status: "SUCCEEDED" },
        producedByType: "SYSTEM",
        producedById: "test",
      },
      select: { id: true, executedAt: true },
    });

    await prisma.calculationManifest.create({
      data: {
        complianceRunId: complianceRun.id,
        ruleVersionId,
        factorSetVersionId,
        codeVersion: "test-sha",
        implementationKey: "beps/evaluator-v1",
        inputSnapshotRef: `snapshot:${scope}`,
        inputSnapshotHash: `hash:${scope}`,
        manifestPayload: { scope },
        executedAt: complianceRun.executedAt,
      },
    });

    filingCompliance = await prisma.filingRecord.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingA.id,
        filingType: "BEPS_COMPLIANCE",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        complianceRunId: complianceRun.id,
        status: "GENERATED",
        filingPayload: {
          bepsEvaluation: {
            selectedPathway: "PRESCRIPTIVE",
            overallStatus: "COMPLIANT",
            inputSummary: {
              scoreEligible: false,
              propertyType: "OFFICE",
              ownershipType: "PRIVATE",
              canonicalRefs: {
                alternativeComplianceAgreementId: null,
              },
            },
            pathwayEligibility: {
              performance: false,
              standardTarget: true,
              prescriptive: true,
            },
            pathwayResults: {
              prescriptive: {
                status: "IN_PROGRESS",
                phase: "PHASE_1_AUDIT",
              },
            },
            alternativeCompliance: {
              agreementRequired: false,
            },
            governance: {
              rulePackageKey: `BEPS_DELIVERY_RULES_${scope}`,
              ruleVersion: "test-v1",
              factorSetKey: `BEPS_DELIVERY_FACTORS_${scope}`,
              factorSetVersion: "test-v1",
            },
            reasonCodes: ["TEST_DELIVERY_CONTEXT"],
            findings: [],
          },
        },
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });

    filingExemption = await prisma.filingRecord.create({
      data: {
        organizationId: orgA.id,
        buildingId: buildingA.id,
        filingType: "BEPS_EXEMPTION",
        filingYear: 2026,
        complianceCycle: "CYCLE_1",
        complianceRunId: complianceRun.id,
        status: "GENERATED",
        filingPayload: {
          bepsEvaluation: {
            selectedPathway: "STANDARD_TARGET",
            overallStatus: "NOT_APPLICABLE",
            inputSummary: {
              scoreEligible: false,
              propertyType: "OFFICE",
              ownershipType: "PRIVATE",
              canonicalRefs: {
                alternativeComplianceAgreementId: null,
              },
            },
            pathwayEligibility: {
              standardTarget: false,
            },
            pathwayResults: {},
            alternativeCompliance: {
              agreementRequired: false,
            },
            governance: {
              rulePackageKey: `BEPS_DELIVERY_RULES_${scope}`,
              ruleVersion: "test-v1",
              factorSetKey: `BEPS_DELIVERY_FACTORS_${scope}`,
              factorSetVersion: "test-v1",
            },
            reasonCodes: ["TEST_EXEMPTION_CONTEXT"],
            findings: [],
          },
        },
        createdByType: "SYSTEM",
        createdById: "test",
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await prisma.bepsRequestItem.deleteMany({
      where: { organizationId: orgA.id },
    });
    await prisma.filingPacket.deleteMany({
      where: { organizationId: orgA.id },
    });
    await prisma.filingRecordEvent.deleteMany({
      where: { organizationId: orgA.id },
    });
    await prisma.evidenceArtifact.deleteMany({
      where: { organizationId: orgA.id },
    });
    await prisma.filingRecord.deleteMany({
      where: { organizationId: orgA.id },
    });
    await prisma.calculationManifest.deleteMany({
      where: { ruleVersionId },
    });
    await prisma.complianceRun.deleteMany({
      where: { organizationId: orgA.id },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: {
        clerkUserId: {
          in: [userA.clerkUserId, userB.clerkUserId],
        },
      },
    });
    await prisma.building.deleteMany({
      where: { id: buildingA.id },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.ruleVersion.deleteMany({
      where: { id: ruleVersionId },
    });
    await prisma.factorSetVersion.deleteMany({
      where: { id: factorSetVersionId },
    });
    await prisma.rulePackage.deleteMany({
      where: { id: rulePackageId },
    });
    await prisma.sourceArtifact.deleteMany({
      where: {
        OR: [
          { name: { contains: scope } },
          { externalUrl: { contains: scope } },
        ],
      },
    });
  });

  function createCaller(clerkUserId: string, clerkOrgId: string) {
    return appRouter.createCaller({
      clerkUserId,
      clerkOrgId,
      clerkOrgRole: "org:admin",
      prisma,
    });
  }

  it("supports the BEPS request item lifecycle", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const created = await caller.beps.upsertRequestItem({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      cycle: "CYCLE_1",
      filingYear: 2026,
      packetType: "PATHWAY_SELECTION",
      category: "PATHWAY_SELECTION_SUPPORT",
      title: "Confirm pathway selection memo",
      status: "REQUESTED",
      isRequired: true,
      requestedFrom: "Owner rep",
      notes: "Need written approval of the selected pathway.",
    });

    expect(created.status).toBe("REQUESTED");

    const updated = await caller.beps.upsertRequestItem({
      requestItemId: created.id,
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      cycle: "CYCLE_1",
      filingYear: 2026,
      packetType: "PATHWAY_SELECTION",
      category: "PATHWAY_SELECTION_SUPPORT",
      title: "Confirm pathway selection memo",
      status: "VERIFIED",
      isRequired: true,
      requestedFrom: "Owner rep",
      notes: "Memo received and reviewed.",
    });

    expect(updated.status).toBe("VERIFIED");

    const items = await caller.beps.listRequestItems({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      cycle: "CYCLE_1",
      filingYear: 2026,
      packetType: "PATHWAY_SELECTION",
    });

    expect(items.some((item) => item.id === created.id && item.status === "VERIFIED")).toBe(true);
  });

  it("generates typed packets for pathway selection, completed actions, and a prescriptive phase", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const pathwaySelection = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "PATHWAY_SELECTION",
    });
    expect(pathwaySelection.packetType).toBe("PATHWAY_SELECTION");

    const pathwayManifest = await caller.beps.packetManifest({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "PATHWAY_SELECTION",
    });
    expect(pathwayManifest.packetTypeLabel).toBe("Pathway Selection");
    expect(JSON.stringify(pathwayManifest.warnings)).toContain(
      "missing pathway support evidence",
    );

    await caller.beps.attachFilingEvidence({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      artifactType: "OWNER_ATTESTATION",
      name: "Completed actions support",
      bepsEvidenceKind: "PATHWAY_SUPPORT",
      pathway: "PRESCRIPTIVE",
      metadata: { scope, deliverable: "completed-actions" },
    });

    await caller.beps.attachFilingEvidence({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      artifactType: "OWNER_ATTESTATION",
      name: "Prescriptive audit support",
      bepsEvidenceKind: "PRESCRIPTIVE_SUPPORT",
      pathway: "PRESCRIPTIVE",
      metadata: { scope, deliverable: "prescriptive-phase-1" },
    });

    const completedActions = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "COMPLETED_ACTIONS",
    });
    expect(completedActions.packetType).toBe("COMPLETED_ACTIONS");

    const completedManifest = await caller.beps.packetManifest({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "COMPLETED_ACTIONS",
    });
    expect(completedManifest.disposition).toBe("READY");

    const prescriptiveAudit = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "PRESCRIPTIVE_PHASE_1_AUDIT",
    });
    expect(prescriptiveAudit.packetType).toBe("PRESCRIPTIVE_PHASE_1_AUDIT");

    const prescriptiveManifest = await caller.beps.packetManifest({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "PRESCRIPTIVE_PHASE_1_AUDIT",
    });
    expect(prescriptiveManifest.disposition).toBe("READY");
    expect(JSON.stringify(prescriptiveManifest.blockers)).not.toContain(
      "Selected pathway is not prescriptive",
    );

    const pathwayPdf = await caller.beps.exportPacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "PATHWAY_SELECTION",
      format: "PDF",
    });
    const pathwayPdfText = Buffer.from(pathwayPdf.content, "base64").toString("latin1");
    expect(pathwayPdf.contentType).toBe("application/pdf");
    expect(pathwayPdfText).toContain("Pathway Selection Packet");

    const prescriptivePdf = await caller.beps.exportPacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "PRESCRIPTIVE_PHASE_1_AUDIT",
      format: "PDF",
    });
    const prescriptivePdfText = Buffer.from(prescriptivePdf.content, "base64").toString("latin1");
    expect(prescriptivePdfText).toContain("Prescriptive Phase 1 Audit Packet");
  });

  it("builds an exemption request packet and warns when required evidence is missing", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const packet = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filingExemption.id,
      packetType: "EXEMPTION_REQUEST",
    });

    expect(packet.packetType).toBe("EXEMPTION_REQUEST");

    const manifest = await caller.beps.packetManifest({
      buildingId: buildingA.id,
      filingRecordId: filingExemption.id,
      packetType: "EXEMPTION_REQUEST",
    });

    expect(manifest.disposition).toBe("READY_WITH_WARNINGS");
    expect(JSON.stringify(manifest.warnings)).toContain(
      "missing exemption or not-applicable support evidence",
    );

    const pdfExport = await caller.beps.exportPacket({
      buildingId: buildingA.id,
      filingRecordId: filingExemption.id,
      packetType: "EXEMPTION_REQUEST",
      format: "PDF",
    });
    const pdfText = Buffer.from(pdfExport.content, "base64").toString("latin1");
    expect(pdfText).toContain("Exemption Request Packet");
  });

  it("marks typed packets stale after upstream request changes and supports re-finalization after regeneration", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    const generated = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "COMPLETED_ACTIONS",
    });

    const finalized = await caller.beps.finalizePacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "COMPLETED_ACTIONS",
    });

    expect(finalized.status).toBe("FINALIZED");
    expect(finalized.packetType).toBe("COMPLETED_ACTIONS");

    const requestItem = await caller.beps.upsertRequestItem({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      cycle: "CYCLE_1",
      filingYear: 2026,
      packetType: "COMPLETED_ACTIONS",
      category: "COMPLETED_ACTIONS_EVIDENCE",
      title: "Collect final completed actions memorandum",
      status: "REQUESTED",
      isRequired: true,
    });

    expect(requestItem.status).toBe("REQUESTED");

    const stalePacket = await caller.beps.packetByFiling({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "COMPLETED_ACTIONS",
    });
    expect(stalePacket?.status).toBe("FINALIZED");

    await caller.beps.upsertRequestItem({
      requestItemId: requestItem.id,
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      cycle: "CYCLE_1",
      filingYear: 2026,
      packetType: "COMPLETED_ACTIONS",
      category: "COMPLETED_ACTIONS_EVIDENCE",
      title: "Collect final completed actions memorandum",
      status: "VERIFIED",
      isRequired: true,
    });

    const regenerated = await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "COMPLETED_ACTIONS",
    });

    expect(regenerated.version).toBeGreaterThan(generated.version);
    expect(regenerated.status).toBe("GENERATED");

    const exported = await caller.beps.exportPacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "COMPLETED_ACTIONS",
      format: "MARKDOWN",
    });
    expect(exported.content).toContain("Completed Actions Packet");
  });

  it("enforces tenant-safe access for BEPS request items and typed packets", async () => {
    const caller = createCaller(userB.clerkUserId, orgB.clerkOrgId);

    await expect(
      caller.beps.listRequestItems({
        buildingId: buildingA.id,
        filingRecordId: filingCompliance.id,
        cycle: "CYCLE_1",
        filingYear: 2026,
        packetType: "PATHWAY_SELECTION",
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      caller.beps.packetByFiling({
        buildingId: buildingA.id,
        filingRecordId: filingCompliance.id,
        packetType: "COMPLETED_ACTIONS",
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      caller.beps.exportPacket({
        buildingId: buildingA.id,
        filingRecordId: filingCompliance.id,
        packetType: "COMPLETED_ACTIONS",
        format: "PDF",
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("surfaces BEPS PDF export failures as normalized packet export errors", async () => {
    const caller = createCaller(userA.clerkUserId, orgA.clerkOrgId);

    await caller.beps.generatePacket({
      buildingId: buildingA.id,
      filingRecordId: filingCompliance.id,
      packetType: "COMPLETED_ACTIONS",
    });

    vi.spyOn(packetDocuments, "renderPacketDocumentPdfBase64").mockRejectedValueOnce(
      new Error("pdf renderer unavailable"),
    );

    await expect(
      caller.beps.exportPacket({
        buildingId: buildingA.id,
        filingRecordId: filingCompliance.id,
        packetType: "COMPLETED_ACTIONS",
        format: "PDF",
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "BEPS packet PDF export failed.",
    });
  });
});
