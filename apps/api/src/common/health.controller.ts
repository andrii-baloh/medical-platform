import { Controller, Get } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { Public } from "../auth/public.decorator";

@Controller()
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Public()
  @Get("health")
  async health() {
    await this.db.query("select 1 as ok");
    return { ok: true, service: "medicare-api", version: "0.3.0" };
  }
}
