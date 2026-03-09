import { describe, expect, it } from "vitest";
import {
  decodeGreenButtonStateCookie,
  encodeGreenButtonStateCookie,
} from "@/server/integrations/green-button/state";

describe("Green Button OAuth state cookie", () => {
  it("round-trips a valid state payload", () => {
    const encoded = encodeGreenButtonStateCookie({
      nonce: "nonce_123",
      buildingId: "building_123",
      organizationId: "org_123",
      createdAt: new Date().toISOString(),
    });

    expect(decodeGreenButtonStateCookie(encoded)).toMatchObject({
      nonce: "nonce_123",
      buildingId: "building_123",
      organizationId: "org_123",
    });
  });

  it("rejects expired state payloads", () => {
    const encoded = encodeGreenButtonStateCookie({
      nonce: "nonce_123",
      buildingId: "building_123",
      organizationId: "org_123",
      createdAt: "2020-01-01T00:00:00.000Z",
    });

    expect(decodeGreenButtonStateCookie(encoded)).toBeNull();
  });
});
