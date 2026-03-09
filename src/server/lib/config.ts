import { z } from "zod";

/** Treat empty strings as undefined so `VAR=` in .env acts like unset. */
const optStr = z
  .string()
  .transform((s) => (s === "" ? undefined : s))
  .pipe(z.string().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  ESPM_BASE_URL: z
    .string()
    .url()
    .default("https://portfoliomanager.energystar.gov/ws"),
  ESPM_USERNAME: optStr,
  ESPM_PASSWORD: optStr,
  NEXT_PUBLIC_MAPBOX_TOKEN: optStr,
  GREEN_BUTTON_CLIENT_ID: optStr,
  GREEN_BUTTON_CLIENT_SECRET: optStr,
  GREEN_BUTTON_AUTH_ENDPOINT: optStr.pipe(z.string().url().optional()),
  GREEN_BUTTON_TOKEN_ENDPOINT: optStr.pipe(z.string().url().optional()),
  GREEN_BUTTON_REDIRECT_URI: optStr.pipe(z.string().url().optional()),
  GREEN_BUTTON_ENCRYPTION_KEY: optStr.pipe(z.string().min(16).optional()),
  GREEN_BUTTON_SCOPE: optStr,
});

export const env = envSchema.parse(process.env);
