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
