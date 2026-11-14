import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DEPLOYMENT_COUNTRY: z.string().regex(/^[A-Z]{2}$/).default("XX"),
  DEFAULT_LOCALE: z.string().min(2).default("ru"),
  DEFAULT_TIMEZONE: z.string().min(1).default("UTC"),
  APP_VERSION: z.string().min(1).default("0.13.0"),
  OIDC_ISSUER_URL: z.string().url(),
  OIDC_JWKS_URL: z.string().url(),
  OIDC_AUDIENCE: z.string().min(1),
  REQUIRE_PRIVILEGED_MFA: z.enum(["true", "false"]).default("false"),
  PRIVILEGED_MFA_METHODS: z.string().default("mfa,otp,totp,webauthn"),
  PRIVILEGED_MFA_ACR_VALUES: z.string().default(""),
  RATE_LIMIT_ENABLED: z.enum(["true", "false"]).default("true"),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  RATE_LIMIT_READ_MAX: z.coerce.number().int().min(1).max(100000).default(240),
  RATE_LIMIT_WRITE_MAX: z.coerce.number().int().min(1).max(100000).default(60),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
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
  PAYMENT_PROVIDER: z.enum(["development", "robokassa"]).default("development"),
  PAYMENT_DEV_WEBHOOK_SECRET: z.string().min(12).optional(),
  ROBOKASSA_MERCHANT_LOGIN: z.string().min(1).optional(),
  ROBOKASSA_PASSWORD1: z.string().min(1).optional(),
  ROBOKASSA_PASSWORD2: z.string().min(1).optional(),
  ROBOKASSA_PASSWORD3: z.string().min(1).optional(),
  ROBOKASSA_TEST_PASSWORD1: z.string().min(1).optional(),
  ROBOKASSA_TEST_PASSWORD2: z.string().min(1).optional(),
  ROBOKASSA_TEST_MODE: z.enum(["true", "false"]).default("false"),
  ROBOKASSA_HASH_ALGORITHM: z.enum(["md5", "sha256", "sha512"]).default("sha256"),
  ROBOKASSA_REFUND_HASH_ALGORITHM: z.enum(["sha256", "sha384", "sha512"]).default("sha256"),
  ROBOKASSA_TAX: z.string().min(1).default("none"),
  ROBOKASSA_PAYMENT_METHOD: z.string().min(1).default("full_prepayment"),
  ROBOKASSA_PAYMENT_OBJECT: z.string().min(1).default("service"),
  ROBOKASSA_SNO: z.string().min(1).default("osn"),
  PUBLIC_WEB_URL: z.string().url().optional(),
  FISCAL_RECEIPT_WORKER_ENABLED: z.enum(["true", "false"]).default("true"),
  FISCAL_RECEIPT_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  FISCAL_RECEIPT_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(5),
  FISCAL_RECEIPT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(8),
  FISCAL_RECEIPT_CLAIM_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  RETENTION_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  RETENTION_POLL_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(21_600_000),
  RETENTION_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(200),
  RETENTION_MAX_BATCHES: z.coerce.number().int().min(1).max(1000).default(50),
  NOTIFICATION_EMAIL_PROVIDER: z.enum(["development", "smtp"]).default("development"),
  NOTIFICATION_DELIVERY_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  SMTP_URL: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).optional(),
  NOTIFICATION_DELIVERY_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60000).default(5000),
  NOTIFICATION_DELIVERY_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  NOTIFICATION_DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(8),
  NOTIFICATION_DELIVERY_CLAIM_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  DOCUMENT_SCAN_PROVIDER: z.enum(["development-pass", "clamav"]).default("development-pass"),
  DOCUMENT_SCAN_WORKER_ENABLED: z.enum(["true", "false"]).default("true"),
  DOCUMENT_SCAN_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60000).default(5000),
  DOCUMENT_SCAN_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  DOCUMENT_SCAN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  DOCUMENT_SCAN_CLAIM_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(180),
  CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_SCAN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(90000),
  CLAMAV_MAX_STREAM_BYTES: z.coerce.number().int().min(1048576).max(104857600).default(26214400),
  LIVEKIT_URL: z.string().min(1).optional(),
  LIVEKIT_PUBLIC_URL: z.string().min(1).optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().min(1).default("http://localhost:3000"),
});

/**
 * Production refuses development placeholders instead of silently serving real
 * patients with local secrets. This is a configuration guard, not a substitute
 * for a secret manager.
 */
const DEVELOPMENT_PLACEHOLDER = /local-dev|change-me|changeme|example\.com/i;
const PLACEHOLDER_SENSITIVE_KEYS = [
  "DATABASE_URL",
  "OIDC_ISSUER_URL",
  "OIDC_JWKS_URL",
  "PAYMENT_DEV_WEBHOOK_SECRET",
  "S3_SECRET_KEY",
  "SMTP_URL",
] as const;

export function validateEnv(input: Record<string, unknown>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid API environment: ${parsed.error.message}`);
  }
  const merged = { ...input, ...parsed.data } as Record<string, unknown>;

  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    const offenders = PLACEHOLDER_SENSITIVE_KEYS.filter((key) => {
      const value = merged[key];
      return typeof value === "string" && DEVELOPMENT_PLACEHOLDER.test(value);
    });
    if (offenders.length) {
      throw new Error(`Unsafe production configuration: ${offenders.join(", ")} still contain development placeholders`);
    }
    // Identity metadata and signing keys must be fetched over authenticated TLS.
    // Never allow credentials or URL fragments in configured OIDC endpoints.
    for (const key of ["OIDC_ISSUER_URL", "OIDC_JWKS_URL"] as const) {
      try {
        const url = new URL(String(merged[key]));
        if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
            url.search || url.hash) {
          throw new Error("insecure");
        }
      } catch {
        throw new Error(`${key} must be an HTTPS URL without credentials, query or fragment in production`);
      }
    }
    // Explicit HTTPS origins only: the development localhost default and
    // wildcard CORS are not suitable for a patient-facing production API.
    const origins = String(merged.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim());
    if (origins.some((origin) => {
      try {
        const url = new URL(origin);
        return url.protocol !== "https:" || url.origin !== origin || Boolean(url.username || url.password);
      } catch {
        return true;
      }
    })) {
      throw new Error("CORS_ORIGINS must contain only explicit HTTPS origins in production");
    }
    // A production deployment must not issue simulated payment confirmations.
    if (merged.PAYMENT_PROVIDER !== "robokassa") {
      throw new Error("PAYMENT_PROVIDER must be robokassa in production");
    }
    if (merged.ROBOKASSA_TEST_MODE !== "false") {
      throw new Error("ROBOKASSA_TEST_MODE must be disabled in production");
    }
    if (!merged.ROBOKASSA_MERCHANT_LOGIN || !merged.ROBOKASSA_PASSWORD1 || !merged.ROBOKASSA_PASSWORD2) {
      throw new Error("Production Robokassa credentials are required");
    }
    // Video consultations must never silently run without a configured SFU.
    // Both API and browser-facing endpoints must use encrypted transport.
    if (!merged.LIVEKIT_API_KEY || !merged.LIVEKIT_API_SECRET || !merged.LIVEKIT_URL || !merged.LIVEKIT_PUBLIC_URL) {
      throw new Error("Production LiveKit credentials and both endpoints are required");
    }
    for (const key of ["LIVEKIT_URL", "LIVEKIT_PUBLIC_URL"] as const) {
      try {
        const url = new URL(String(merged[key]));
        if (!["https:", "wss:"].includes(url.protocol) || !url.hostname ||
            url.username || url.password || url.search || url.hash) {
          throw new Error("insecure");
        }
      } catch {
        throw new Error(`${key} must be an HTTPS or WSS URL without credentials, query or fragment in production`);
      }
    }
    // Explicit encrypted object storage is mandatory for clinical files.
    if (!merged.S3_ENDPOINT) {
      throw new Error("S3_ENDPOINT must be explicitly configured in production");
    }
    try {
      const endpoint = new URL(String(merged.S3_ENDPOINT));
      if (endpoint.protocol !== "https:" || !endpoint.hostname ||
          endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error("insecure");
      }
    } catch {
      throw new Error("S3_ENDPOINT must be an HTTPS URL without credentials or query parameters in production");
    }
    if (!merged.S3_ACCESS_KEY || !merged.S3_SECRET_KEY) {
      throw new Error("Production S3 credentials are required");
    }
    if (merged.REQUIRE_PRIVILEGED_MFA !== "true") {
      throw new Error("REQUIRE_PRIVILEGED_MFA must be enabled in production");
    }
    // Never mark uploaded clinical files as clean without an actual scanner.
    if (merged.DOCUMENT_SCAN_PROVIDER !== "clamav") {
      throw new Error("DOCUMENT_SCAN_PROVIDER must be clamav in production");
    }
    if (merged.DOCUMENT_SCAN_WORKER_ENABLED !== "true") {
      throw new Error("DOCUMENT_SCAN_WORKER_ENABLED must be enabled in production");
    }
    if (merged.RATE_LIMIT_ENABLED === "false") {
      throw new Error("RATE_LIMIT_ENABLED must not be disabled in production");
    }
    if (merged.DEPLOYMENT_COUNTRY === "XX") {
      throw new Error("DEPLOYMENT_COUNTRY must be set to the real deployment country in production");
    }
  }

  return merged;
}
