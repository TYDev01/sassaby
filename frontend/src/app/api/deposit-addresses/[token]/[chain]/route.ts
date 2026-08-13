import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isFailure, adminHeaders } from "../../../_requireAdmin";

const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

/**
 * Deposit addresses are keyed on (token, chain) — USDT exists on five networks,
 * so the token alone can't identify a row to delete.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; chain: string }> }
) {
  const check = await requireAdmin(req);
  if (isFailure(check)) return check.response;

  const { token, chain } = await params;
  const res = await fetch(
    `${BACKEND}/api/deposit-addresses/${encodeURIComponent(token)}/${encodeURIComponent(chain)}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
