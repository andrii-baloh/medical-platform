import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { OidcGuard } from "./oidc.guard";
import { RateLimitGuard } from "./rate-limit.guard";

@Global()
@Module({
  providers: [
    OidcGuard,
    RateLimitGuard,
    { provide: APP_GUARD, useExisting: OidcGuard },
    { provide: APP_GUARD, useExisting: RateLimitGuard },
  ],
})
export class AuthModule {}
