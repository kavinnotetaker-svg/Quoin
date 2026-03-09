const GREEN_BUTTON_STATE_COOKIE = "quoin_gb_state";
const GREEN_BUTTON_STATE_TTL_MS = 10 * 60 * 1000;

export interface GreenButtonOAuthState {
  nonce: string;
  buildingId: string;
  organizationId: string;
  createdAt: string;
}

export function getGreenButtonStateCookieName() {
  return GREEN_BUTTON_STATE_COOKIE;
}

export function encodeGreenButtonStateCookie(
  state: GreenButtonOAuthState,
): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeGreenButtonStateCookie(
  value: string | undefined,
): GreenButtonOAuthState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as GreenButtonOAuthState;

    if (
      !parsed.nonce ||
      !parsed.buildingId ||
      !parsed.organizationId ||
      !parsed.createdAt
    ) {
      return null;
    }

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    if (Date.now() - createdAt.getTime() > GREEN_BUTTON_STATE_TTL_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
