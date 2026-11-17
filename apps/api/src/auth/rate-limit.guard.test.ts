import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitGuard } from "./rate-limit.guard";
import type { ExecutionContext } from "@nestjs/common";

const original = {
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
  RATE_LIMIT_READ_MAX: process.env.RATE_LIMIT_READ_MAX,
  RATE_LIMIT_WINDOW_SECONDS: process.env.RATE_LIMIT_WINDOW_SECONDS,
  TRUST_PROXY: process.env.TRUST_PROXY,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function context(forwarded: string, peer: string) {
  const headers: Record<string, string> = {};
  const request = {
    method: "GET",
    path: "/v1/doctors",
    headers: { "x-forwarded-for": forwarded },
    socket: { remoteAddress: peer },
    ip: forwarded,
  };
  const response = { setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }) };
  const execution = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { execution, headers };
}

describe("anonymous rate-limit identity", () => {
  it("does not allow X-Forwarded-For rotation to bypass the peer IP bucket", () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.TRUST_PROXY = "true";
    process.env.RATE_LIMIT_READ_MAX = "1";
    process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

    const guard = new RateLimitGuard();
    expect(guard.canActivate(context("198.51.100.1", "192.0.2.10").execution)).toBe(true);
    expect(() =>
      guard.canActivate(context("198.51.100.2", "192.0.2.10").execution),
    ).toThrow("Too many requests");
  });

  it("keeps independent buckets for distinct TCP peers", () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_READ_MAX = "1";
    const guard = new RateLimitGuard();
    expect(guard.canActivate(context("198.51.100.1", "192.0.2.10").execution)).toBe(true);
    expect(guard.canActivate(context("198.51.100.1", "192.0.2.11").execution)).toBe(true);
  });
});
