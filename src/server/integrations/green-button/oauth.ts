import crypto from "crypto";
import type { GreenButtonConfig, GreenButtonTokens } from "./types";

/**
 * Build the authorization URL to redirect the user to the utility's OAuth page.
 * The user authenticates with Pepco and selects which meters to share.
 */
export function buildAuthorizationUrl(
  config: GreenButtonConfig,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
  });
  return `${config.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * Called after the utility redirects back to our callback URL.
 */
export async function exchangeCodeForTokens(
  config: GreenButtonConfig,
  code: string,
): Promise<GreenButtonTokens> {
  const basicAuth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return parseTokenResponse(data);
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  config: GreenButtonConfig,
  refreshToken: string,
): Promise<GreenButtonTokens> {
  const basicAuth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const tokens = parseTokenResponse(data);

  // Some utilities don't rotate refresh tokens on refresh
  if (!tokens.refreshToken) {
    tokens.refreshToken = refreshToken;
  }

  return tokens;
}

/** Generate a cryptographically random CSRF state token. */
export function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Extract subscriptionId from a resourceURI like `.../Subscription/12345`. */
export function extractSubscriptionId(resourceUri: string): string {
  const match = resourceUri.match(/Subscription\/(\d+)/);
  return match?.[1] ?? "";
}

function parseTokenResponse(
  data: Record<string, unknown>,
): GreenButtonTokens {
  const resourceUri = String(data["resourceURI"] ?? "");
  return {
    accessToken: String(data["access_token"] ?? ""),
    refreshToken: String(data["refresh_token"] ?? ""),
    expiresAt: new Date(
      Date.now() + (Number(data["expires_in"]) || 3600) * 1000,
    ),
    scope: String(data["scope"] ?? ""),
    resourceUri,
    authorizationUri: String(data["authorizationURI"] ?? ""),
    subscriptionId: extractSubscriptionId(resourceUri),
  };
}
