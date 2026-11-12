import { afterEach, describe, expect, it } from "vitest";
import { validateEnv } from "./env";

const initialNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (initialNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = initialNodeEnv;
  }
});

const fixture = {
  DATABASE_URL: "postgres://test:test@postgres.internal:5432/medicare_test",
  DEPLOYMENT_COUNTRY: "DE",
  OIDC_ISSUER_URL: "https://identity.internal/realms/medicare",
  OIDC_JWKS_URL: "https://identity.internal/realms/medicare/protocol/openid-connect/certs",
  OIDC_AUDIENCE: "medicare-api",
  S3_REGION: "eu-central-1",
  S3_BUCKET_MEDICAL: "medicare-test-files",
  REQUIRE_PRIVILEGED_MFA: "true",
  DOCUMENT_SCAN_PROVIDER: "clamav",
  DOCUMENT_SCAN_WORKER_ENABLED: "true",
};

describe("production configuration safety", () => {
  it("rejects startup when privileged MFA is disabled", () => {
    process.env.NODE_ENV = "production";
    expect(() =>
      validateEnv({ ...fixture, REQUIRE_PRIVILEGED_MFA: "false" }),
    ).toThrow("REQUIRE_PRIVILEGED_MFA must be enabled in production");
  });

  it("accepts enabled privileged MFA with otherwise valid settings", () => {
    process.env.NODE_ENV = "production";
    expect(validateEnv(fixture).REQUIRE_PRIVILEGED_MFA).toBe("true");
  });

  it("rejects the development-pass scanner in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, DOCUMENT_SCAN_PROVIDER: "development-pass" }))
      .toThrow("DOCUMENT_SCAN_PROVIDER must be clamav in production");
  });

  it("rejects disabled document scanning worker in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, DOCUMENT_SCAN_WORKER_ENABLED: "false" }))
      .toThrow("DOCUMENT_SCAN_WORKER_ENABLED must be enabled in production");
  });

  it("accepts a configured ClamAV scanner and enabled worker", () => {
    process.env.NODE_ENV = "production";
    expect(validateEnv(fixture).DOCUMENT_SCAN_PROVIDER).toBe("clamav");
  });

  it("does not impose production-only MFA policy on isolated development", () => {
    process.env.NODE_ENV = "test";
    expect(
      validateEnv({ ...fixture, REQUIRE_PRIVILEGED_MFA: "false" }).REQUIRE_PRIVILEGED_MFA,
    ).toBe("false");
  });
});
