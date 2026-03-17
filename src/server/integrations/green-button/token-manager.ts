import crypto from "crypto";
import type { GreenButtonConfig, GreenButtonTokens } from "./types";
import { refreshAccessToken } from "./oauth";
import { createLogger } from "@/server/lib/logger";

const ALGORITHM = "aes-256-gcm";
const SALT = "quoin-gb-salt";

/**
 * Encrypt a token string for DB storage using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (all hex-encoded).
 */
export function encryptToken(plaintext: string, encryptionKey: string): string {
  const key = crypto.scryptSync(encryptionKey, SALT, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a token string from DB storage.
 */
export function decryptToken(
  encrypted: string,
  encryptionKey: string,
): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }
  const [ivHex, authTagHex, ciphertext] = parts;
  const key = crypto.scryptSync(encryptionKey, SALT, 32);
  const iv = Buffer.from(ivHex!, "hex");
  const authTag = Buffer.from(authTagHex!, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext!, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/** Token refresh buffer — refresh 5 minutes before expiry. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Get a valid access token for a building's Green Button connection.
 * Automatically refreshes if expired. Returns null if no connection exists.
 */
export async function getValidToken(
  buildingId: string,
  config: GreenButtonConfig,
  encryptionKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<GreenButtonTokens | null> {
  const logger = createLogger({
    buildingId,
    integration: "GREEN_BUTTON",
  });

  const building = await db.building.findUnique({
    where: { id: buildingId },
    select: {
      greenButtonAccessToken: true,
      greenButtonRefreshToken: true,
      greenButtonTokenExpiresAt: true,
      greenButtonSubscriptionId: true,
      greenButtonResourceUri: true,
    },
  });

  if (!building?.greenButtonAccessToken || !building?.greenButtonRefreshToken) {
    return null;
  }

  const accessToken = decryptToken(
    building.greenButtonAccessToken,
    encryptionKey,
  );
  const refreshToken = decryptToken(
    building.greenButtonRefreshToken,
    encryptionKey,
  );
  const expiresAt = building.greenButtonTokenExpiresAt;

  // Token still valid (with buffer)
  if (expiresAt && new Date(expiresAt) > new Date(Date.now() + REFRESH_BUFFER_MS)) {
    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(expiresAt),
      scope: "",
      resourceUri: building.greenButtonResourceUri ?? "",
      authorizationUri: "",
      subscriptionId: building.greenButtonSubscriptionId ?? "",
    };
  }

  // Token expired — refresh
  try {
    const newTokens = await refreshAccessToken(config, refreshToken);

    await db.building.update({
      where: { id: buildingId },
      data: {
        greenButtonAccessToken: encryptToken(
          newTokens.accessToken,
          encryptionKey,
        ),
        greenButtonRefreshToken: encryptToken(
          newTokens.refreshToken,
          encryptionKey,
        ),
        greenButtonTokenExpiresAt: newTokens.expiresAt,
        greenButtonSubscriptionId: newTokens.subscriptionId,
        greenButtonResourceUri: newTokens.resourceUri,
      },
    });

    return newTokens;
  } catch (err) {
    logger.error("Green Button token refresh failed", {
      error: err,
      operation: "token_refresh",
    });
    return null;
  }
}
