import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DEPLOYMENT_COUNTRY: z.string().regex(/^[A-Z]{2}$/).default("XX"),
  DEFAULT_LOCALE: z.string().min(2).default("ru"),
  DEFAULT_TIMEZONE: z.string().min(1).default("UTC"),
  OIDC_ISSUER_URL: z.string().url(),
  OIDC_JWKS_URL: z.string().url(),
  OIDC_AUDIENCE: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1),
  S3_BUCKET_MEDICAL: z.string().min(3),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  VIDEO_PROVIDER: z.enum(["livekit"]).default("livekit"),
  VIDEO_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  VIDEO_JOIN_EARLY_MINUTES: z.coerce.number().int().min(0).max(120).default(15),
  VIDEO_JOIN_AFTER_START_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),
  OUTBOX_WORKER_ENABLED: z.enum(["true", "false"]).default("true"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60000).default(5000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(10),
  OUTBOX_CLAIM_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  PAYMENT_PROVIDER: z.enum(["development"]).default("development"),
  PAYMENT_DEV_WEBHOOK_SECRET: z.string().min(12).optional(),
  DOCUMENT_SCAN_PROVIDER: z.enum(["development-pass"]).default("development-pass"),
  DOCUMENT_SCAN_WORKER_ENABLED: z.enum(["true", "false"]).default("true"),
  DOCUMENT_SCAN_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60000).default(5000),
  DOCUMENT_SCAN_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  DOCUMENT_SCAN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  DOCUMENT_SCAN_CLAIM_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  LIVEKIT_URL: z.string().min(1).optional(),
  LIVEKIT_PUBLIC_URL: z.string().min(1).optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().min(1).default("http://localhost:3000"),
});

export function validateEnv(input: Record<string, unknown>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid API environment: ${parsed.error.message}`);
  }
  return { ...input, ...parsed.data };
}
