import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import {
  AcceptPatientContractDto,
  CreateContractTemplateDto,
  CreateServiceCatalogDto,
  CreateServiceOfferDto,
  PublishContractVersionDto,
} from "./commercial-services.dto";
import { CommercialServicesService } from "./commercial-services.service";

@Controller("commercial-services")
export class CommercialServicesController {
  constructor(private readonly services: CommercialServicesService) {}

  @Get("doctor/offers")
  doctorOffers(@CurrentPrincipal() principal: Principal) {
    return this.services.doctorOffers(principal);
  }

  @Get("appointments/:appointmentId/checkout")
  checkout(
    @CurrentPrincipal() principal: Principal,
    @Param("appointmentId", new ParseUUIDPipe()) appointmentId: string,
  ) {
    return this.services.checkout(principal, appointmentId);
  }

  @Post("appointments/:appointmentId/contracts/accept")
  accept(
    @CurrentPrincipal() principal: Principal,
    @Param("appointmentId", new ParseUUIDPipe()) appointmentId: string,
    @Body() body: AcceptPatientContractDto,
  ) {
    return this.services.acceptContract(principal, appointmentId, body);
  }

  @Get("contracts")
  contracts(@CurrentPrincipal() principal: Principal) {
    return this.services.patientContracts(principal);
  }

  @Get("admin/overview")
  adminOverview(@CurrentPrincipal() principal: Principal) {
    return this.services.adminOverview(principal);
  }

  @Post("admin/catalogs")
  createCatalog(@CurrentPrincipal() principal: Principal, @Body() body: CreateServiceCatalogDto) {
    return this.services.createCatalog(principal, body);
  }

  @Post("admin/contract-templates")
  createTemplate(@CurrentPrincipal() principal: Principal, @Body() body: CreateContractTemplateDto) {
    return this.services.createContractTemplate(principal, body);
  }

  @Post("admin/contract-templates/:templateId/versions")
  publishVersion(
    @CurrentPrincipal() principal: Principal,
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Body() body: PublishContractVersionDto,
  ) {
    return this.services.publishContractVersion(principal, templateId, body);
  }

  @Post("admin/offers")
  createOffer(@CurrentPrincipal() principal: Principal, @Body() body: CreateServiceOfferDto) {
    return this.services.createOffer(principal, body);
  }
}
