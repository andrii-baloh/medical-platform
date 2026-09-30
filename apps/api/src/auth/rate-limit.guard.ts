import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Principal } from "./principal";

type Bucket = {
  startedAt: number;
  count: number;
};

type RequestWithPrincipal = Request & { principal?: Principal };

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastCleanupAt = 0;

  canActivate(context: ExecutionContext): boolean {
    if ((process.env.RATE_LIMIT_ENABLED ?? "true") !== "true") return true;

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithPrincipal>();
    const response = http.getResponse<Response>();
    if (this.isHealthPath(request.path)) return true;

    const now = Date.now();
    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60) * 1000;
    const isWrite = WRITE_METHODS.has(request.method.toUpperCase());
    const limit = Number(isWrite ? (process.env.RATE_LIMIT_WRITE_MAX ?? 60) : (process.env.RATE_LIMIT_READ_MAX ?? 240));
    const identity = request.principal?.sub ? `sub:${request.principal.sub}` : `ip:${this.clientIp(request)}`;
    const bucketKey = `${identity}:${isWrite ? "write" : "read"}`;

    this.cleanup(now, windowMs);
    let bucket = this.buckets.get(bucketKey);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      this.buckets.set(bucketKey, bucket);
    }

    const resetSeconds = Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000));
    response.setHeader("ratelimit-limit", String(limit));
    response.setHeader("ratelimit-reset", String(resetSeconds));

    if (bucket.count >= limit) {
      response.setHeader("ratelimit-remaining", "0");
      response.setHeader("retry-after", String(resetSeconds));
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count += 1;
    response.setHeader("ratelimit-remaining", String(Math.max(0, limit - bucket.count)));
    return true;
  }

  private isHealthPath(path: string): boolean {
    return path === "/health" || path.startsWith("/health/") || path === "/v1/health" || path.startsWith("/v1/health/");
  }

  private clientIp(request: Request): string {
    if ((process.env.TRUST_PROXY ?? "false") === "true") {
      const forwarded = request.headers["x-forwarded-for"];
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
      if (first?.trim()) return first.trim();
    }
    return request.ip || request.socket.remoteAddress || "unknown";
  }

  private cleanup(now: number, windowMs: number) {
    if (now - this.lastCleanupAt < windowMs) return;
    this.lastCleanupAt = now;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.startedAt >= windowMs * 2) this.buckets.delete(key);
    }
  }
}
