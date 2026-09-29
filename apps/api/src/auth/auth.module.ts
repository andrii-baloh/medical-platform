import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { OidcGuard } from "./oidc.guard";

@Global()
@Module({ providers: [{ provide: APP_GUARD, useClass: OidcGuard }], exports: [] })
export class AuthModule {}
