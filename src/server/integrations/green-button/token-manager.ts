import crypto from "crypto";
import type { GreenButtonConfig, GreenButtonTokens } from "./types";
import { refreshAccessToken } from "./oauth";
import { createLogger } from "@/server/lib/logger";
import {
  ConfigError,
  createRetryableIntegrationError,
  NotFoundError,
  WorkflowStateError,
} from "@/server/lib/errors";

const ALGORITHM = "aes-256-gcm";
const SALT = "quoin-gb-salt";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

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
    throw new ConfigError("Invalid encrypted Green Button token format.");
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

/**
 * Get a valid access token for a building's Green Button connection.
 * Refreshes the token when it is close to expiry and persists the new values.
 */
export async function getValidToken(
  input: {
    buildingId: string;
    organizationId: string;
    config: GreenButtonConfig;
    encryptionKey: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<GreenButtonTokens> {
  const logger = createLogger({
    organizationId: input.organizationId,
    buildingId: input.buildingId,
    integration: "GREEN_BUTTON",
  });

  const connection = await db.greenButtonConnection.findFirst({
    where: {
      organizationId: input.organizationId,
      buildingId: input.buildingId,
    },
    select: {
      id: true,
      status: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      resourceUri: true,
      subscriptionId: true,
    },
  });

  if (!connection) {
    throw new NotFoundError("Green Button connection not found.");
  }

  if (connection.status !== "ACTIVE") {
    throw new WorkflowStateError(
      "Green Button connection is not active for ingestion.",
      {
        details: {
          status: connection.status,
          connectionId: connection.id,
        },
      },
    );
  }

  if (!connection.accessToken || !connection.refreshToken) {
    throw new WorkflowStateError(
      "Green Button connection is missing stored OAuth tokens.",
      {
        details: {
          connectionId: connection.id,
        },
      },
    );
  }

  const accessToken = decryptToken(connection.accessToken, input.encryptionKey);
  const refreshToken = decryptToken(connection.refreshToken, input.encryptionKey);
  const expiresAt = connection.tokenExpiresAt;

  if (
    expiresAt &&
    new Date(expiresAt).getTime() > Date.now() + REFRESH_BUFFER_MS
  ) {
    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(expiresAt),
      scope: "",
      resourceUri: connection.resourceUri ?? "",
      authorizationUri: "",
      subscriptionId: connection.subscriptionId ?? "",
    };
  }

  try {
    const refreshed = await refreshAccessToken(input.config, refreshToken);

    await db.greenButtonConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encryptToken(refreshed.accessToken, input.encryptionKey),
        refreshToken: encryptToken(refreshed.refreshToken, input.encryptionKey),
        tokenExpiresAt: refreshed.expiresAt,
        subscriptionId: refreshed.subscriptionId,
        resourceUri: refreshed.resourceUri,
        status: "ACTIVE",
      },
    });

    logger.info("Green Button access token refreshed", {
      connectionId: connection.id,
      subscriptionId: refreshed.subscriptionId,
    });

    return refreshed;
  } catch (error) {
    logger.error("Green Button token refresh failed", {
      error,
      connectionId: connection.id,
    });
    throw createRetryableIntegrationError(
      "GREEN_BUTTON",
      "Green Button token refresh failed.",
      {
        details: {
          connectionId: connection.id,
        },
        cause: error,
      },
    );
  }
}
