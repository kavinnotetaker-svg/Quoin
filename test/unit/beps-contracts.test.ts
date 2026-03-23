import { describe, expect, it } from "vitest";
import {
  formatPathwayLabel,
  toBepsPathway,
  toBuildingSelectedPathway,
} from "@/lib/contracts/beps";

describe("BEPS contract helpers", () => {
  it("normalizes building pathway values to governed BEPS pathway values", () => {
    expect(toBepsPathway("STANDARD")).toBe("STANDARD_TARGET");
    expect(toBepsPathway("TRAJECTORY")).toBe("TRAJECTORY");
    expect(toBepsPathway("NONE")).toBeNull();
  });

  it("normalizes governed BEPS pathway values to building pathway values", () => {
    expect(toBuildingSelectedPathway("STANDARD_TARGET")).toBe("STANDARD");
    expect(toBuildingSelectedPathway("TRAJECTORY")).toBe("TRAJECTORY");
    expect(toBuildingSelectedPathway(null)).toBeNull();
  });

  it("formats supported pathway labels consistently for UI surfaces", () => {
    expect(formatPathwayLabel("STANDARD")).toBe("Standard target");
    expect(formatPathwayLabel("STANDARD_TARGET")).toBe("Standard target");
    expect(formatPathwayLabel("TRAJECTORY")).toBe("Trajectory");
    expect(formatPathwayLabel("NONE")).toBe("Not selected");
  });
});
