/**
 * Password hashing and session tokens.
 *
 * Fails closed the same way adminAuth does: with no JWT_SECRET configured the
 * server issues and accepts nothing, rather than falling back to a default that
 * would be identical across every deployment.
 *
 * Generate a secret:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const BCRYPT_ROUNDS = 12;
const TOKEN_TTL = "7d";

export interface TokenPayload {
  userId: string;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "JWT_SECRET is not configured (or is shorter than 32 chars). Refusing to issue or verify tokens."
    );
  }
  return s;
}

/** True when auth is usable at all — lets routes return 503 instead of throwing. */
export function authConfigured(): boolean {
  const s = process.env.JWT_SECRET;
  return Boolean(s && s.length >= 32);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // The legacy placeholder user carries '!' as its hash, which is not a valid
  // bcrypt digest.  bcrypt.compare returns false rather than throwing, but be
  // explicit so the intent survives refactoring.
  if (!hash || !hash.startsWith("$2")) return false;
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === "string" || !decoded || typeof decoded.userId !== "string") {
      return null;
    }
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

// ─── Input validation ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  if (!email || typeof email !== "string") return "Email is required.";
  if (email.length > 254) return "Email is too long.";
  if (!EMAIL_RE.test(email.trim())) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || typeof password !== "string") return "Password is required.";
  if (password.length < 10) return "Password must be at least 10 characters.";
  // bcrypt silently truncates beyond 72 bytes; reject rather than let a user
  // believe a long passphrase is fully protecting the account.
  if (Buffer.byteLength(password, "utf8") > 72) {
    return "Password must be 72 bytes or fewer.";
  }
  return null;
}
