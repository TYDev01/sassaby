/**
 * Google Sign-In — ID token verification.
 *
 * The browser talks to Google directly and hands us a signed ID token; this
 * verifies it server-side before any of its claims are believed. That check is
 * the whole security boundary. A token is only accepted when:
 *
 *   - Google's own signature validates against their published keys (handled by
 *     `google-auth-library`, which fetches and caches the JWKS),
 *   - `aud` equals OUR client id — otherwise a token minted for some other
 *     site could be replayed here to Login as its owner,
 *   - it has not expired, and
 *   - `email_verified` is true.
 *
 * That last one is not a formality. The email is what account linking keys on,
 * and Google will issue tokens for Workspace domains where an admin set the
 * address without ever proving it. An unverified address must not be able to
 * claim an existing account.
 *
 * Configure with GOOGLE_CLIENT_ID (the Web application OAuth client from
 * console.cloud.google.com). Unconfigured, the route reports 503 rather than
 * silently accepting anything.
 */

import { OAuth2Client } from "google-auth-library";

export interface GoogleIdentity {
  /** The `sub` claim — stable for the life of the Google account. */
  googleId: string;
  email: string;
  fullName: string;
}

/** Thrown for any token we will not accept. The message is safe to show a user. */
export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

let client: OAuth2Client | null = null;

function clientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID;
}

/** True when Google sign-in is usable — lets the route 503 instead of throwing. */
export function googleConfigured(): boolean {
  return Boolean(clientId());
}

/**
 * Verify a Google ID token and return the identity it asserts.
 *
 * Throws `GoogleAuthError` for anything untrusted. Never returns a partially
 * validated result.
 */
export async function verifyGoogleIdToken(credential: string): Promise<GoogleIdentity> {
  const id = clientId();
  if (!id) throw new GoogleAuthError("Google sign-in is not configured on this server.");

  if (!credential || typeof credential !== "string") {
    throw new GoogleAuthError("A Google credential is required.");
  }

  client ??= new OAuth2Client(id);

  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken: credential, audience: id });
  } catch {
    // Signature, expiry and audience failures all land here. The specific reason
    // is not told to the caller — it would only help someone probing.
    throw new GoogleAuthError("Could not verify that Google sign-in. Please try again.");
  }

  const payload = ticket.getPayload();
  if (!payload) throw new GoogleAuthError("Could not verify that Google sign-in. Please try again.");

  if (!payload.sub) throw new GoogleAuthError("That Google account is missing an identifier.");
  if (!payload.email) throw new GoogleAuthError("That Google account has no email address.");

  // See the header note — this is what makes linking by email safe.
  if (!payload.email_verified) {
    throw new GoogleAuthError("That Google account's email address is not verified.");
  }

  return {
    googleId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    fullName: (payload.name ?? "").trim(),
  };
}
