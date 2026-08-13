import { NextRequest, NextResponse } from "next/server";

/**
 * Gate for the admin proxy routes.
 *
 * These routes hold `ADMIN_API_KEY` server-side and attach it to whatever they
 * forward. Without a check here, that makes them an open door: anyone who knows
 * the URL gets operator data, because the key is applied on their behalf.
 *
 * The old wallet-address check in the dashboard never protected any of this — it
 * only decided which UI to draw. Authorisation has to happen where the privilege
 * is actually granted, which is here.
 *
 * The caller's own bearer token is verified against the backend on every request
 * (rather than trusted from a cookie or a claim) so revoking `isAdmin` or banning
 * an account takes effect immediately.
 */

const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

export interface AdminCheckFailure {
  response: NextResponse;
}

export interface AdminCheckSuccess {
  email: string;
}

export type AdminCheck = AdminCheckFailure | AdminCheckSuccess;

export function isFailure(r: AdminCheck): r is AdminCheckFailure {
  return (r as AdminCheckFailure).response !== undefined;
}

export async function requireAdmin(req: NextRequest): Promise<AdminCheck> {
  if (!process.env.ADMIN_API_KEY) {
    return {
      response: NextResponse.json({ error: "Admin key not configured." }, { status: 503 }),
    };
  }

  const auth = req.headers.get("authorization") ?? "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  let user: { email?: string; isAdmin?: boolean } | undefined;
  try {
    const res = await fetch(`${BACKEND}/api/auth/me`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return {
        response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
      };
    }
    user = ((await res.json()) as { user?: { email?: string; isAdmin?: boolean } }).user;
  } catch {
    return {
      response: NextResponse.json({ error: "Could not verify session." }, { status: 503 }),
    };
  }

  if (!user?.isAdmin) {
    // Same 404-shaped denial either way would be nicer, but the dashboard needs
    // to distinguish "signed out" from "not an operator" to render the right gate.
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { email: user.email ?? "" };
}

/** Authorization header for the backend, once the caller is known to be admin. */
export function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.ADMIN_API_KEY}` };
}
