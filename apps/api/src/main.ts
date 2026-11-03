import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { AppModule } from "./app.module";
import { normalizeRequestId, RequestContextService } from "./common/request-context.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const requestContext = app.get(RequestContextService);
  const accessLogger = new Logger("ApiAccess");

  app.setGlobalPrefix("v1", { exclude: ["health", "health/live", "health/ready"] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((value) => value.trim()),
    credentials: true,
  });

  // Baseline security headers for every API response. The API returns JSON and
  // presigned URLs only, so a deny-by-default frame/referrer policy is safe and
  // no response may be cached by shared proxies.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = normalizeRequestId(req.header("x-request-id")) ?? randomUUID();
    const startedAt = process.hrtime.bigint();

    requestContext.run(requestId, () => {
      res.setHeader("x-request-id", requestId);
      res.once("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        accessLogger.log(JSON.stringify({
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
        }));
      });
      next();
    });
  });

  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
