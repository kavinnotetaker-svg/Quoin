import type { GreenButtonConfig } from "./types";

export function getGreenButtonConfig(): GreenButtonConfig | null {
  const clientId = process.env["GREEN_BUTTON_CLIENT_ID"];
  const clientSecret = process.env["GREEN_BUTTON_CLIENT_SECRET"];
  const authEndpoint = process.env["GREEN_BUTTON_AUTH_ENDPOINT"];
  const tokenEndpoint = process.env["GREEN_BUTTON_TOKEN_ENDPOINT"];
  const redirectUri = process.env["GREEN_BUTTON_REDIRECT_URI"];

  if (
    !clientId ||
    !clientSecret ||
    !authEndpoint ||
    !tokenEndpoint ||
    !redirectUri
  ) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    authorizationEndpoint: authEndpoint,
    tokenEndpoint,
    redirectUri,
    scope:
      process.env["GREEN_BUTTON_SCOPE"] ??
      "FB=4_5_15;IntervalDuration=900;BlockDuration=monthly;HistoryLength=13",
  };
}
