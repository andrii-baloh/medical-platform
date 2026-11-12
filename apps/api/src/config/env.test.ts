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
  S3_ENDPOINT: "https://storage.internal",
  S3_ACCESS_KEY: "medical-storage-access",
  S3_SECRET_KEY: "medical-storage-secret",
  S3_BUCKET_MEDICAL: "medicare-test-files",
  REQUIRE_PRIVILEGED_MFA: "true",
  PAYMENT_PROVIDER: "robokassa",
  ROBOKASSA_TEST_MODE: "false",
  ROBOKASSA_MERCHANT_LOGIN: "medicare-merchant",
  ROBOKASSA_PASSWORD1: "secure-payment-secret-one",
  ROBOKASSA_PASSWORD2: "secure-payment-secret-two",
  DOCUMENT_SCAN_PROVIDER: "clamav",
  DOCUMENT_SCAN_WORKER_ENABLED: "true",
  CORS_ORIGINS: "https://patient.example.org",
  LIVEKIT_URL: "https://livekit-api.internal",
  LIVEKIT_PUBLIC_URL: "wss://video.example.org",
  LIVEKIT_API_KEY: "medicare-livekit",
  LIVEKIT_API_SECRET: "secure-livekit-secret",
};

describe("production configuration safety", () => {
  it("rejects implicit S3 endpoint in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, S3_ENDPOINT: undefined }))
      .toThrow("S3_ENDPOINT must be explicitly configured in production");
  });

  it.each(["http://storage.internal", "https://user:pass@storage.internal", "https://storage.internal?token=secret"])(
    "rejects unsafe S3 endpoint %s", (endpoint) => {
      process.env.NODE_ENV = "production";
      expect(() => validateEnv({ ...fixture, S3_ENDPOINT: endpoint }))
        .toThrow("S3_ENDPOINT must be an HTTPS URL without credentials or query parameters in production");
    },
  );

  it("rejects missing storage credentials", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, S3_SECRET_KEY: undefined }))
      .toThrow("Production S3 credentials are required");
  });

  it("accepts explicit HTTPS S3 endpoint and credentials", () => {
    process.env.NODE_ENV = "production";
    expect(validateEnv(fixture).S3_ENDPOINT).toBe("https://storage.internal");
  });

  it("rejects missing LiveKit credentials", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, LIVEKIT_API_SECRET: undefined }))
      .toThrow("Production LiveKit credentials and both endpoints are required");
  });

  it.each([
    ["LIVEKIT_URL", "http://livekit.internal"],
    ["LIVEKIT_PUBLIC_URL", "ws://video.example.org"],
    ["LIVEKIT_PUBLIC_URL", "https://user:password@video.example.org"],
  ] as const)("rejects insecure video endpoint %s", (key, value) => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, [key]: value }))
      .toThrow(`${key} must be an HTTPS or WSS URL in production`);
  });

  it("accepts encrypted LiveKit API and browser endpoints", () => {
    process.env.NODE_ENV = "production";
    expect(validateEnv(fixture).LIVEKIT_PUBLIC_URL).toBe("wss://video.example.org");
  });

  it("rejects simulated payment provider in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, PAYMENT_PROVIDER: "development" }))
      .toThrow("PAYMENT_PROVIDER must be robokassa in production");
  });

  it("rejects Robokassa test mode in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, ROBOKASSA_TEST_MODE: "true" }))
      .toThrow("ROBOKASSA_TEST_MODE must be disabled in production");
  });

  it("rejects missing Robokassa credentials in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, ROBOKASSA_PASSWORD2: undefined }))
      .toThrow("Production Robokassa credentials are required");
  });

  it("accepts configured production payment provider", () => {
    process.env.NODE_ENV = "production";
    expect(validateEnv(fixture).PAYMENT_PROVIDER).toBe("robokassa");
  });

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

  it.each([
    "http://localhost:3000",
    "*",
    "https://patient.example.org, http://localhost:3000",
    "https://patient.example.org/",
    "https://user:pass@patient.example.org",
  ])("rejects insecure CORS origin configuration: %s", (origins) => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnv({ ...fixture, CORS_ORIGINS: origins }))
      .toThrow("CORS_ORIGINS must contain only explicit HTTPS origins in production");
  });

  it("accepts an explicit HTTPS origin allowlist", () => {
    process.env.NODE_ENV = "production";
    expect(validateEnv({
      ...fixture,
      CORS_ORIGINS: "https://patient.example.org,https://doctor.example.org",
    }).CORS_ORIGINS).toContain("https://doctor.example.org");
  });

  it("does not impose production-only MFA policy on isolated development", () => {
    process.env.NODE_ENV = "test";
    expect(
      validateEnv({ ...fixture, REQUIRE_PRIVILEGED_MFA: "false" }).REQUIRE_PRIVILEGED_MFA,
    ).toBe("false");
  });
});
