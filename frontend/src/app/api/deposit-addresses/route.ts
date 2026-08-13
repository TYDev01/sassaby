import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isFailure, adminHeaders } from "../_requireAdmin";

const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

/** Public: clients must be shown where to deposit. */
export async function GET() {
  const res = await fetch(`${BACKEND}/api/deposit-addresses`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const check = await requireAdmin(req);
  if (isFailure(check)) return check.response;

  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/deposit-addresses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
