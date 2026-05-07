import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .default("4000")
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive()),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  CORS_ORIGINS: z.string().optional(),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) => (value !== undefined ? value === "true" : isProd)),
  COOKIE_SAMESITE: z
    .enum(["lax", "strict", "none"])
    .optional()
    .transform((value) => value ?? (isProd ? "none" : "lax")),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SEED_ON_BOOT: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

const skip = process.env.SKIP_ENV_VALIDATION === "true";

function loadEnv() {
  if (skip) {
    return envSchema.parse({
      NODE_ENV: process.env.NODE_ENV ?? "development",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder",
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "0123456789abcdef0123456789abcdef",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "0123456789abcdef0123456789abcdef",
      ...process.env,
    });
  }
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues.map((issue) => `  - ${issue.path.join(".")} ${issue.message}`).join("\n");
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables:\n" + formatted);
    throw new Error("Invalid environment variables");
  }
  return result.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === "production";
