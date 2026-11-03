import { createClient } from "@robokassa/sdk";

export type RobokassaClient = ReturnType<typeof createClient>;

let cachedClient: RobokassaClient | null = null;

/** Reads a required Robokassa setting and fails fast when it is missing. */
export function robokassaRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for PAYMENT_PROVIDER=robokassa`);
  return value;
}

export function robokassaLogin(): string {
  return robokassaRequired("ROBOKASSA_MERCHANT_LOGIN");
}

/**
 * Shared Robokassa client.
 *
 * The MIT-licensed `@robokassa/sdk` package owns signing, transport and error
 * mapping; MedicalPlatform only supplies configuration. One process-wide
 * instance is enough because the client is stateless and holds no request data.
 */
export function robokassaClient(): RobokassaClient {
  if (!cachedClient) {
    cachedClient = createClient({
      login: robokassaLogin(),
      password1: robokassaRequired("ROBOKASSA_PASSWORD1"),
      password2: robokassaRequired("ROBOKASSA_PASSWORD2"),
      password3: process.env.ROBOKASSA_PASSWORD3,
      testPassword1: process.env.ROBOKASSA_TEST_PASSWORD1,
      testPassword2: process.env.ROBOKASSA_TEST_PASSWORD2,
      isTest: process.env.ROBOKASSA_TEST_MODE === "true",
      hashAlgorithm: (process.env.ROBOKASSA_HASH_ALGORITHM as "md5" | "sha256" | "sha512" | undefined) ?? "sha256",
      refundHashAlgorithm:
        (process.env.ROBOKASSA_REFUND_HASH_ALGORITHM as "sha256" | "sha384" | "sha512" | undefined) ?? "sha256",
    });
  }
  return cachedClient;
}
