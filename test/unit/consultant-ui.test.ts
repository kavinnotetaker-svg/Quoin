import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuildingTable } from "@/components/dashboard/building-table";
import { WorkflowPanel } from "@/components/building/workflow-panel";
import {
  getComplianceStatusDisplay,
  getPacketStatusDisplay,
  getSyncStatusDisplay,
} from "@/components/internal/status-helpers";

describe("consultant-facing status copy", () => {
  it("uses plain language for key compliance and sync states", () => {
    expect(getComplianceStatusDisplay("PENDING_DATA")).toMatchObject({
      label: "Needs data",
      tone: "muted",
    });
    expect(getSyncStatusDisplay("PARTIAL")).toMatchObject({
      label: "Partial import",
      tone: "warning",
    });
    expect(getPacketStatusDisplay("STALE")).toMatchObject({
      label: "Needs refresh",
      tone: "warning",
    });
  });
});

describe("consultant-facing screens", () => {
  it("renders the portfolio table safely when snapshot data is sparse", () => {
    const markup = renderToStaticMarkup(
      createElement(BuildingTable, {
        buildings: [
          {
            id: "building-1",
            name: "Sparse Tower",
            propertyType: "OFFICE",
            latestSnapshot: null,
            updatedAt: "2026-03-16T12:00:00.000Z",
          },
        ],
      }),
    );

    expect(markup).toContain("Needs usable benchmark data");
    expect(markup).toContain("Connect or refresh data");
    expect(markup).toContain("No current penalty estimate");
  });

  it("renders the workflow panel with explicit stage language", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowPanel, {
        nextAction: {
          title: "Run BEPS evaluation",
          reason: "No governed BEPS run exists for the active cycle.",
          href: "/buildings/building-1#beps",
        },
        stages: [
          {
            key: "data-connected",
            label: "Data Connected",
            status: "COMPLETE",
            reason: "Portfolio Manager data is connected and recent.",
            href: "/buildings/building-1#benchmarking",
          },
          {
            key: "beps-evaluated",
            label: "BEPS Evaluated",
            status: "NOT_STARTED",
            reason: "No governed BEPS run exists yet.",
            href: "/buildings/building-1#beps",
          },
        ],
      }),
    );

    expect(markup).toContain("Next best action");
    expect(markup).toContain("Run BEPS evaluation");
    expect(markup).toContain("Complete");
    expect(markup).toContain("Not started");
  });
});
