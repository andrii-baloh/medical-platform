import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { MedicalConclusionsService } from "./medical-conclusions.service";

@Controller("medical-conclusions")
export class MedicalConclusionsController {
  constructor(private readonly conclusions: MedicalConclusionsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query("patientId") patientId?: string) {
    return this.conclusions.list(principal, patientId);
  }

  @Get(":id")
  get(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.conclusions.get(principal, id);
  }

  @Get(":id/download")
  async download(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    const document = await this.conclusions.download(principal, id);
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("content-disposition", `attachment; filename="medical-conclusion-${id}.json"`);
    response.send(JSON.stringify(document, null, 2));
  }
}
