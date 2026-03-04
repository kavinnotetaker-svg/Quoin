import type { GreenButtonTokens, GreenButtonReading } from "./types";
import { parseESPIXml } from "./espi-parser";

const TIMEOUT_MS = 30_000;

/**
 * Fetch batch subscription data from the utility.
 * Primary data retrieval method for scheduled pulls.
 */
export async function fetchSubscriptionData(
  tokens: GreenButtonTokens,
): Promise<GreenButtonReading[]> {
  if (!tokens.resourceUri || !tokens.subscriptionId) {
    throw new Error("No subscription URI available");
  }

  const batchUrl = `${tokens.resourceUri}/Batch/Subscription/${tokens.subscriptionId}`;
  const xml = await fetchESPIData(batchUrl, tokens.accessToken);
  return parseESPIXml(xml);
}

/**
 * Fetch data from a notification URI (used when utility pushes new data).
 */
export async function fetchNotificationData(
  notificationUri: string,
  accessToken: string,
): Promise<GreenButtonReading[]> {
  const xml = await fetchESPIData(notificationUri, accessToken);
  return parseESPIXml(xml);
}

async function fetchESPIData(
  url: string,
  accessToken: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/atom+xml",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Green Button fetch failed (${response.status}): ${text}`,
      );
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
