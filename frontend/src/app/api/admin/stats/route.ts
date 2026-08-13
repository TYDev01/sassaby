import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isFailure, adminHeaders } from "../../_requireAdmin";

const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

export async function GET(req: NextRequest) {
  const check = await requireAdmin(req);
  if (isFailure(check)) return check.response;

  const res = await fetch(`${BACKEND}/api/admin/stats`, {
    cache: "no-store",
    headers: adminHeaders(),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
