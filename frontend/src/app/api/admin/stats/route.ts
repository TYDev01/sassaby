import { NextResponse } from "next/server";

const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";

export async function GET() {
  if (!ADMIN_KEY) {
    return NextResponse.json({ error: "Admin key not configured." }, { status: 503 });
  }
  const res = await fetch(`${BACKEND}/api/admin/stats`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${ADMIN_KEY}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
