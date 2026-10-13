import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { CompleteUploadDto, CreateUploadIntentDto, GrantDocumentDto } from "./document.dto";
import { DocumentsService } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) { return this.documents.list(principal); }

  @Post("upload-intents")
  createUploadIntent(@CurrentPrincipal() principal: Principal, @Body() body: CreateUploadIntentDto) {
    return this.documents.createUploadIntent(principal, body);
  }

  @Post(":id/complete")
  complete(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: CompleteUploadDto) {
    return this.documents.complete(principal, id, body);
  }

  @Get(":id/versions")
  versions(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.documents.versions(principal, id);
  }

  @Get(":id/download-url")
  download(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    return this.documents.downloadUrl(principal, id);
  }

  @Post(":id/grants")
  grant(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: GrantDocumentDto) {
    return this.documents.grant(principal, id, body);
  }

  @Delete(":id/grants/:doctorId")
  revoke(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Param("doctorId") doctorId: string) {
    return this.documents.revoke(principal, id, doctorId);
  }
}
