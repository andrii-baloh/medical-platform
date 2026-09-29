import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const base = process.env.MEDICARE_API_URL!;
  const target = new URL(`/v1/${path.join("/")}`, base);
  req.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const idem = req.headers.get("idempotency-key");
  if (idem) headers.set("idempotency-key", idem);
  if (typeof token?.accessToken === "string") headers.set("authorization", `Bearer ${token.accessToken}`);
  headers.set("x-request-id", req.headers.get("x-request-id") ?? crypto.randomUUID());

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    cache: "no-store",
  });
  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("content-type", upstreamType);
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) responseHeaders.set("x-request-id", requestId);
  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
