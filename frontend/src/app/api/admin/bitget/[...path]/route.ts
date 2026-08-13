import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isFailure, adminHeaders } from "../../../_requireAdmin";

const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

/**
 * Catch-all proxy for the Bitget ad-book routes.
 *
 * One handler rather than a file per endpoint: every route under
 * /api/admin/bitget shares the same contract — authorise the caller, then
 * forward with ADMIN_API_KEY. Splitting it into five near-identical files just
 * creates five places for the auth check to be forgotten.
 *
 * The path is rebuilt from the matched segments rather than taken from the raw
 * URL, so a caller cannot traverse out of /api/admin/bitget into another
 * backend route with the admin key attached.
 */
async function proxy(
  req: NextRequest,
  segments: string[],
  method: "GET" | "POST" | "PATCH"
) {
  const check = await requireAdmin(req);
  if (isFailure(check)) return check.response;

  const safePath = segments.map(encodeURIComponent).join("/");
  const search = req.nextUrl.search ?? "";
  const url = `${BACKEND}/api/admin/bitget/${safePath}${search}`;

  let body: string | undefined;
  if (method !== "GET") {
    body = await req.text();
  }

  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        ...adminHeaders(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the backend." },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path, "POST");
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path, "PATCH");
}
