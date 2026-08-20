/**
 * Login with Apple — ID token verification.
 *
 * Same shape and the same security boundary as googleAuth.ts: the browser gets
 * a signed ID token from Apple, and nothing in it is believed until the
 * signature, audience, issuer, expiry and email_verified claim all check out.
 *
 * Apple-specific things worth knowing:
 *
 *  - **The name is not in the token.** Apple sends the user's name exactly once,
 *    on the very first authorization, as a separate field beside the token —
 *    never inside it, and never again. The caller passes it through as
 *    `fullNameHint`; it is treated as a hint precisely because it is
 *    client-supplied and unverified, so it only ever fills a blank.
 *  - **`email_verified` may be the string "true".** Apple is inconsistent about
 *    whether it is a boolean or a string, so both are accepted.
 *  - **Private relay addresses are normal.** A user who chose "Hide My Email"
 *    gets an @privaterelay.appleid.com address. It is real, it forwards, and it
 *    is verified — there is no reason to reject it.
 *  - **`sub` is per-Services-ID.** Changing APPLE_CLIENT_ID gives every existing
 *    user a new `sub` and orphans their account, so treat it as permanent.
 *
 * Deliberately no client secret here. That is only needed to exchange an
 * authorization code, and this flow never does — verifying the ID token is
 * enough to know who signed in, and it saves having to generate and rotate the
 * ES256 JWT Apple would otherwise demand every six months.
 *
 * Configure with APPLE_CLIENT_ID (the Services ID, e.g. exchange.sassaby.web).
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = new URL("https://appleid.apple.com/auth/keys");

export interface AppleIdentity {
  /** The `sub` claim — stable for this Services ID. */
  appleId: string;
  email: string;
  fullName: string;
}

/** Thrown for any token we will not accept. The message is safe to show a user. */
export class AppleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleAuthError";
  }
}

/** Cached across calls — the set refetches and rotates keys on its own. */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function clientId(): string | undefined {
  return process.env.APPLE_CLIENT_ID;
}

/** True when Apple sign-in is usable — lets the route 503 instead of throwing. */
export function appleConfigured(): boolean {
  return Boolean(clientId());
}

/** Apple sends this as a boolean or as the string "true", depending on the day. */
function isVerified(claim: unknown): boolean {
  return claim === true || claim === "true";
}

/**
 * Verify an Apple ID token and return the identity it asserts.
 *
 * `fullNameHint` is the unverified name Apple hands the client on first sign-in.
 * It is only ever used to fill a name we do not already have.
 *
 * Throws `AppleAuthError` for anything untrusted.
 */
export async function verifyAppleIdToken(
  idToken: string,
  fullNameHint = ""
): Promise<AppleIdentity> {
  const id = clientId();
  if (!id) throw new AppleAuthError("Apple sign-in is not configured on this server.");

  if (!idToken || typeof idToken !== "string") {
    throw new AppleAuthError("An Apple credential is required.");
  }

  jwks ??= createRemoteJWKSet(APPLE_JWKS_URL);

  let payload;
  try {
    // `audience` and `issuer` are checked by jwtVerify itself — a token minted
    // for another Services ID must never authenticate a session here.
    ({ payload } = await jwtVerify(idToken, jwks, {
      issuer: APPLE_ISSUER,
      audience: id,
    }));
  } catch {
    // Signature, expiry, audience and issuer failures all land here. The reason
    // is not reported back — it would only help someone probing.
    throw new AppleAuthError("Could not verify that Apple sign-in. Please try again.");
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";

  if (!sub) throw new AppleAuthError("That Apple account is missing an identifier.");
  if (!email) {
    // Happens when the Services ID was not configured to request the email
    // scope. Without an address there is no account to key on.
    throw new AppleAuthError("That Apple account did not share an email address.");
  }
  if (!isVerified(payload.email_verified)) {
    throw new AppleAuthError("That Apple account's email address is not verified.");
  }

  return {
    appleId: sub,
    email: email.trim().toLowerCase(),
    fullName: fullNameHint.trim(),
  };
}
