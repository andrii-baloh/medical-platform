import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { Principal } from "./principal";

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function rolesFromContainer(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return stringArray((value as Record<string, unknown>).roles);
}

function resourceRoles(payload: JWTPayload, audience: string | undefined): string[] {
  if (!audience || !payload.resource_access || typeof payload.resource_access !== "object") return [];
  const resources = payload.resource_access as Record<string, unknown>;
  return rolesFromContainer(resources[audience]);
}

function csvSet(value: string | undefined, fallback: string): Set<string> {
  return new Set((value ?? fallback).split(",").map((item) => item.trim()).filter(Boolean));
}

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

    const audience = process.env.OIDC_AUDIENCE || undefined;
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(header.slice(7), this.jwks, {
        issuer: process.env.OIDC_ISSUER_URL,
        ...(audience ? { audience } : {}),
      }));
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }

    if (!payload.sub) throw new UnauthorizedException("Access token has no subject");
    const realmRoles = rolesFromContainer(payload.realm_access);
    const roles = Array.from(new Set([...realmRoles, ...resourceRoles(payload, audience)]));
    const amr = stringArray(payload.amr);
    const acr = typeof payload.acr === "string" ? payload.acr : undefined;

    if ((process.env.REQUIRE_PRIVILEGED_MFA ?? "false") === "true" && roles.some((role) => role === "doctor" || role === "admin")) {
      const methods = csvSet(process.env.PRIVILEGED_MFA_METHODS, "mfa,otp,totp,webauthn");
      const acceptedAcr = csvSet(process.env.PRIVILEGED_MFA_ACR_VALUES, "");
      const methodSatisfied = amr.some((method) => methods.has(method));
      const acrSatisfied = Boolean(acr && acceptedAcr.has(acr));
      if (!methodSatisfied && !acrSatisfied) {
        throw new ForbiddenException("Multi-factor authentication required for privileged access");
      }
    }

    request.principal = {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      roles,
      amr,
      acr,
    } satisfies Principal;
    return true;
  }
}
