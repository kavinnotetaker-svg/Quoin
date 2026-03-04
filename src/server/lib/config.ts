import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  ESPM_BASE_URL: z
    .string()
    .url()
    .default("https://portfoliomanager.energystar.gov/ws"),
  ESPM_USERNAME: z.string().min(1).optional(),
  ESPM_PASSWORD: z.string().min(1).optional(),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().optional(),
  GREEN_BUTTON_CLIENT_ID: z.string().optional(),
  GREEN_BUTTON_CLIENT_SECRET: z.string().optional(),
  GREEN_BUTTON_AUTH_ENDPOINT: z.string().url().optional(),
  GREEN_BUTTON_TOKEN_ENDPOINT: z.string().url().optional(),
  GREEN_BUTTON_REDIRECT_URI: z.string().url().optional(),
  GREEN_BUTTON_ENCRYPTION_KEY: z.string().min(16).optional(),
  GREEN_BUTTON_SCOPE: z.string().optional(),
});

export const env = envSchema.parse(process.env);
