import crypto from "crypto";
import type { GreenButtonConfig, GreenButtonTokens } from "./types";
import { refreshAccessToken } from "./oauth";

const ALGORITHM = "aes-256-gcm";
const SALT = "quoin-gb-salt";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function encryptToken(plaintext: string, encryptionKey: string): string {
  const key = crypto.scryptSync(encryptionKey, SALT, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

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

export async function getValidToken(
  buildingId: string,
  config: GreenButtonConfig,
  encryptionKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<GreenButtonTokens | null> {
  const connection = await db.greenButtonConnection.findUnique({
    where: { buildingId },
    select: {
      buildingId: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      subscriptionId: true,
      resourceUri: true,
    },
  });

  if (!connection?.accessToken || !connection.refreshToken) {
    return null;
  }

  const accessToken = decryptToken(connection.accessToken, encryptionKey);
  const refreshToken = decryptToken(connection.refreshToken, encryptionKey);
  const expiresAt = connection.tokenExpiresAt;

  if (expiresAt && expiresAt > new Date(Date.now() + REFRESH_BUFFER_MS)) {
    return {
      accessToken,
      refreshToken,
      expiresAt,
      scope: "",
      resourceUri: connection.resourceUri ?? "",
      authorizationUri: "",
      subscriptionId: connection.subscriptionId ?? "",
    };
  }

  try {
    const newTokens = await refreshAccessToken(config, refreshToken);

    await db.greenButtonConnection.update({
      where: { buildingId },
      data: {
        accessToken: encryptToken(newTokens.accessToken, encryptionKey),
        refreshToken: encryptToken(newTokens.refreshToken, encryptionKey),
        tokenExpiresAt: newTokens.expiresAt,
        subscriptionId: newTokens.subscriptionId,
        resourceUri: newTokens.resourceUri,
      },
    });

    return newTokens;
  } catch (err) {
    console.error(
      `[Green Button] Token refresh failed for building ${buildingId}:`,
      err,
    );
    return null;
  }
}
