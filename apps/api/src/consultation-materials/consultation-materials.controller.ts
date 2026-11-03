import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { AttachDocumentDto, ChatMessageDto } from "./consultation-material.dto";
import { ConsultationMaterialsService } from "./consultation-materials.service";

/**
 * Consultation chat and materials.
 *
 * Rows are always bound to a medical encounter, and the caller is resolved
 * through that encounter, so neither a patient nor a doctor can read or write
 * another consultation's materials by guessing an appointment id.
 */
@Controller("consultation-materials")
export class ConsultationMaterialsController {
  constructor(private readonly materials: ConsultationMaterialsService) {}

  @Get("appointments/:appointmentId")
  list(
    @CurrentPrincipal() principal: Principal,
    @Param("appointmentId") appointmentId: string,
    @Query("before") before?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = Number(limit);
    return this.materials.list(principal, appointmentId, before, Number.isFinite(parsedLimit) ? parsedLimit : undefined);
  }

  @Post("appointments/:appointmentId/chat")
  postChat(
    @CurrentPrincipal() principal: Principal,
    @Param("appointmentId") appointmentId: string,
    @Body() body: ChatMessageDto,
  ) {
    return this.materials.postChat(principal, appointmentId, body);
  }

  @Post("appointments/:appointmentId/documents")
  attachDocument(
    @CurrentPrincipal() principal: Principal,
    @Param("appointmentId") appointmentId: string,
    @Body() body: AttachDocumentDto,
  ) {
    return this.materials.attachDocument(principal, appointmentId, body);
  }
}
