import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { Principal } from "./principal";

@Injectable()
export class OidcGuard implements CanActivate {
  private readonly jwks = createRemoteJWKSet(new URL(process.env.OIDC_JWKS_URL!));
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = String(request.headers.authorization ?? "");
    if (!header.startsWith("Bearer ")) throw new UnauthorizedException("Missing bearer token");
    const token = header.slice(7);
    const audience = process.env.OIDC_AUDIENCE || undefined;
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: process.env.OIDC_ISSUER_URL,
        ...(audience ? { audience } : {}),
      });
      const realmRoles = (payload.realm_access as any)?.roles ?? [];
      const resourceRoles = audience ? ((payload.resource_access as any)?.[audience]?.roles ?? []) : [];
      request.principal = {
        sub: String(payload.sub),
        email: typeof payload.email === "string" ? payload.email : undefined,
        name: typeof payload.name === "string" ? payload.name : undefined,
        roles: Array.from(new Set([...realmRoles, ...resourceRoles])),
      } satisfies Principal;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
  }
}
