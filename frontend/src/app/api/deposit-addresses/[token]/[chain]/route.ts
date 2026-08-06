import { NextRequest, NextResponse } from "next/server";

const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";

/**
 * Deposit addresses are keyed on (token, chain) — USDT exists on five networks,
 * so the token alone can't identify a row to delete.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; chain: string }> }
) {
  if (!ADMIN_KEY) {
    return NextResponse.json({ error: "Admin key not configured." }, { status: 503 });
  }
  const { token, chain } = await params;
  const res = await fetch(
    `${BACKEND}/api/deposit-addresses/${encodeURIComponent(token)}/${encodeURIComponent(chain)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_KEY}` },
    }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
