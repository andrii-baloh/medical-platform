import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { Public } from "../auth/public.decorator";

@Controller("health")
export class HealthController {
  constructor(private readonly db: DbService) {}

  private info() {
    return {
      service: "medicare-api",
      version: process.env.APP_VERSION ?? "0.13.0",
    };
  }

  @Public()
  @Get("live")
  live() {
    return { ok: true, ...this.info() };
  }

  @Public()
  @Get("ready")
  async ready() {
    try {
      await this.db.query("select 1 as ok");
      return { ok: true, ...this.info(), dependencies: { database: "ready" } };
    } catch {
      throw new ServiceUnavailableException({
        ok: false,
        ...this.info(),
        dependencies: { database: "unavailable" },
      });
    }
  }

  /** Backward-compatible readiness endpoint. */
  @Public()
  @Get()
  health() {
    return this.ready();
  }
}
