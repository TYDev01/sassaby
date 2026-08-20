import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

import { prisma } from "../lib/prisma";
import {
  authConfigured,
  hashPassword,
  verifyPassword,
  signToken,
  normaliseEmail,
  validateEmail,
  validatePassword,
  SESSION_TTL_MINUTES,
} from "../lib/auth";
import { userAuth } from "../middleware/userAuth";
import { sendWelcomeEmail } from "../lib/emails/welcome";
import {
  googleConfigured,
  verifyGoogleIdToken,
  GoogleAuthError,
} from "../lib/googleAuth";
import {
  appleConfigured,
  verifyAppleIdToken,
  AppleAuthError,
} from "../lib/appleAuth";

const router = Router();

/** Minimal KYC only — see task.md §7.  No BVN, no ID images. */
const MAX_NAME_LEN = 120;
const MAX_PHONE_LEN = 20;

/**
 * `isAdmin` is read-only here on purpose: it is never taken from a request body,
 * on register or on profile update. Operator access is granted in SQL only.
 */
function publicUser(u: {
  id: string;
  email: string;
  password: string | null;
  googleId?: string | null;
  appleId?: string | null;
  fullName: string;
  phone: string;
  bankAccountName: string;
  kycTier: string;
  isAdmin: boolean;
}) {
  return {
    id:              u.id,
    email:           u.email,
    fullName:        u.fullName,
    phone:           u.phone,
    bankAccountName: u.bankAccountName,
    kycTier:         u.kycTier,
    isAdmin:         u.isAdmin,
    // Never the hash itself — only whether one exists. A social-only account
    // needs to be offered "set a password", not "change password", and the
    // client cannot work that out otherwise.
    hasPassword:     Boolean(u.password),
    /** Which social identities are attached. Drives the profile screen. */
    providers: {
      google: Boolean(u.googleId),
      apple:  Boolean(u.appleId),
    },
  };
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post("/register", async (req: Request, res: Response) => {
  if (!authConfigured()) {
    return res.status(503).json({ error: "Authentication is not configured on this server." });
  }

  const { email, password, fullName = "", phone = "", bankAccountName = "" } = req.body as {
    email: string;
    password: string;
    fullName?: string;
    phone?: string;
    /** Name on the account the user will pay from.  Fiat credits are matched
     *  against this before any release. */
    bankAccountName?: string;
  };

  const emailError = validateEmail(email);
  if (emailError) return res.status(400).json({ error: emailError });

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  if (fullName.length > MAX_NAME_LEN || bankAccountName.length > MAX_NAME_LEN) {
    return res.status(400).json({ error: "Name fields exceed the maximum allowed length." });
  }
  if (phone.length > MAX_PHONE_LEN) {
    return res.status(400).json({ error: "Phone number exceeds the maximum allowed length." });
  }

  const normalised = normaliseEmail(email);

  const existing = await prisma.user.findUnique({ where: { email: normalised } });
  if (existing) {
    // Registration necessarily reveals whether an address is taken; there is no
    // way around it without an email round-trip.  Login does not leak the same.
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const user = await prisma.user.create({
    data: {
      id:              uuidv4(),
      email:           normalised,
      password:        await hashPassword(password),
      fullName:        fullName.trim(),
      phone:           phone.trim(),
      bankAccountName: bankAccountName.trim(),
    },
  });

  console.log(`[AUTH] Registered ${user.email}`);

  // Dispatched, not awaited: the account already exists, and the welcome mail is
  // not load-bearing. Awaiting would put a third-party API's latency (up to the
  // 10s timeout) in front of the signup response for no gain. `sendWelcomeEmail`
  // never rejects, so nothing can escape this call.
  void sendWelcomeEmail({ email: user.email, fullName: user.fullName });

  return res.status(201).json({
    success: true,
    token: signToken({ userId: user.id }),
    user: publicUser(user),
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post("/login", async (req: Request, res: Response) => {
  if (!authConfigured()) {
    return res.status(503).json({ error: "Authentication is not configured on this server." });
  }

  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = await prisma.user.findUnique({ where: { email: normaliseEmail(email) } });

  // Same response whether the account is missing, has no password at all
  // (Google-only), or the password is wrong — so the endpoint can't be used to
  // enumerate registered addresses, or to discover which of them use Google.
  const ok = user?.password ? await verifyPassword(password, user.password) : false;
  if (!user || !ok) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  if (user.banned) {
    return res.status(403).json({ error: "This account has been suspended." });
  }

  return res.json({
    success: true,
    token: signToken({ userId: user.id }),
    user: publicUser(user),
  });
});

// ─── Social sign-in (Google, Apple) ───────────────────────────────────────────
//
// Both providers land here once their token has been verified. One endpoint per
// provider covers signing up AND signing in — the client cannot know which it is
// doing, because whether an address already has an account is not something an
// unauthenticated caller should be able to probe. The server decides and reports
// which happened via `created`.
//
// Three cases, in order:
//
//   1. The provider id is already on an account → Login. The normal repeat
//      visit, and it keeps working after the user changes their provider email.
//   2. The verified email matches an account    → link, see the rules below.
//   3. Neither                                  → create and send the welcome mail.

type Provider = "google" | "apple";

interface SocialIdentity {
  provider: Provider;
  /** The provider's `sub` claim. */
  providerId: string;
  email: string;
  fullName: string;
}

/** Column holding this provider's `sub`. */
const ID_FIELD: Record<Provider, "googleId" | "appleId"> = {
  google: "googleId",
  apple:  "appleId",
};

const LABEL: Record<Provider, string> = { google: "Google", apple: "Apple" };

async function completeSocialAuth(
  res: Response,
  identity: SocialIdentity,
  confirmPassword: string | undefined
) {
  const field = ID_FIELD[identity.provider];
  const label = LABEL[identity.provider];

  // ── 1. Known provider identity ──────────────────────────────────────────────
  const byProviderId = await prisma.user.findUnique({
    where: { [field]: identity.providerId } as never,
  });
  if (byProviderId) {
    if (byProviderId.banned) {
      return res.status(403).json({ error: "This account has been suspended." });
    }
    console.log(`[AUTH] ${label} sign-in ${byProviderId.email}`);
    return res.json({
      success: true,
      created: false,
      token: signToken({ userId: byProviderId.id }),
      user: publicUser(byProviderId),
    });
  }

  // ── 2. Existing account with the same address ───────────────────────────────
  const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });
  if (byEmail) {
    if (byEmail.banned) {
      return res.status(403).json({ error: "This account has been suspended." });
    }

    // Linking to an account that HAS a password requires that password.
    //
    // Without this, anyone who registered a password account under someone
    // else's address before they ever signed up would end up sharing the
    // account that person later signs into with the provider — they know the
    // password, the victim does not, and the victim would never see it. The
    // provider proving the email is not enough on its own, because the password
    // account was never verified against that inbox.
    //
    // Proving BOTH — the provider's verified email and the password — is what
    // establishes these are the same person. An account with no password (one
    // created by the other provider) has nothing to prove and links directly:
    // two providers independently asserting the same verified address is
    // already the same evidence.
    if (byEmail.password) {
      if (!confirmPassword) {
        return res.status(409).json({
          error: `An account already exists for ${identity.email}. Enter its password once to link ${label} sign-in.`,
          requiresPassword: true,
          email: identity.email,
        });
      }
      const ok = await verifyPassword(confirmPassword, byEmail.password);
      if (!ok) {
        return res.status(401).json({ error: "Incorrect password.", requiresPassword: true });
      }
    }

    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        [field]:       identity.providerId,
        emailVerified: true,
        // Only fill a blank — never overwrite a name the user typed themselves.
        ...(byEmail.fullName || !identity.fullName
          ? {}
          : { fullName: identity.fullName.slice(0, MAX_NAME_LEN) }),
      } as never,
    });

    console.log(`[AUTH] Linked ${label} identity to existing account ${linked.email}`);
    return res.json({
      success: true,
      created: false,
      linked: true,
      token: signToken({ userId: linked.id }),
      user: publicUser(linked),
    });
  }

  // ── 3. New account ──────────────────────────────────────────────────────────
  //
  // `password` is left null rather than filled with a random hash: null is the
  // honest record that this account has no password, and it is what lets the
  // login route refuse one.
  //
  // bankAccountName stays empty — no provider can tell us it. The client sends
  // the user to /profile to fill it in, and the buy path refuses until it is
  // set, so an unfilled profile can never reach a settlement.
  const user = await prisma.user.create({
    data: {
      id:            uuidv4(),
      email:         identity.email,
      password:      null,
      [field]:       identity.providerId,
      emailVerified: true,
      fullName:      identity.fullName.slice(0, MAX_NAME_LEN),
    } as never,
  });

  console.log(`[AUTH] Registered ${user.email} via ${label}`);

  // Same fire-and-forget contract as the password signup above.
  void sendWelcomeEmail({ email: user.email, fullName: user.fullName });

  return res.status(201).json({
    success: true,
    created: true,
    token: signToken({ userId: user.id }),
    user: publicUser(user),
  });
}

// ─── POST /api/auth/google ────────────────────────────────────────────────────

router.post("/google", async (req: Request, res: Response) => {
  if (!authConfigured()) {
    return res.status(503).json({ error: "Authentication is not configured on this server." });
  }
  if (!googleConfigured()) {
    return res.status(503).json({ error: "Google sign-in is not configured on this server." });
  }

  const { credential, password } = req.body as { credential?: string; password?: string };

  let identity;
  try {
    identity = await verifyGoogleIdToken(credential ?? "");
  } catch (err) {
    if (err instanceof GoogleAuthError) return res.status(401).json({ error: err.message });
    throw err;
  }

  return completeSocialAuth(
    res,
    { provider: "google", providerId: identity.googleId, email: identity.email, fullName: identity.fullName },
    password
  );
});

// ─── POST /api/auth/apple ─────────────────────────────────────────────────────
//
// `fullName` in the body is Apple's first-sign-in-only name. It is unverified
// client input, which is why it can only ever fill a blank, never overwrite.

router.post("/apple", async (req: Request, res: Response) => {
  if (!authConfigured()) {
    return res.status(503).json({ error: "Authentication is not configured on this server." });
  }
  if (!appleConfigured()) {
    return res.status(503).json({ error: "Apple sign-in is not configured on this server." });
  }

  const { credential, password, fullName } = req.body as {
    credential?: string;
    password?: string;
    fullName?: string;
  };

  if (fullName !== undefined && (typeof fullName !== "string" || fullName.length > MAX_NAME_LEN)) {
    return res.status(400).json({ error: "Name fields exceed the maximum allowed length." });
  }

  let identity;
  try {
    identity = await verifyAppleIdToken(credential ?? "", fullName ?? "");
  } catch (err) {
    if (err instanceof AppleAuthError) return res.status(401).json({ error: err.message });
    throw err;
  }

  return completeSocialAuth(
    res,
    { provider: "apple", providerId: identity.appleId, email: identity.email, fullName: identity.fullName },
    password
  );
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
//
// Slides the idle window. The client calls this on real user activity, not on
// its background polling — otherwise an abandoned dashboard would hold a session
// open indefinitely, which is the thing the short TTL exists to prevent.
//
// Renewing requires a token that is still valid, so this extends a live session
// and cannot resurrect an expired one.

router.post("/refresh", userAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "Account not found." });

  return res.json({
    success: true,
    token: signToken({ userId: user.id }),
    user: publicUser(user),
    expiresInMinutes: SESSION_TTL_MINUTES,
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get("/me", userAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "Account not found." });
  return res.json({ user: publicUser(user) });
});

// ─── PATCH /api/auth/me — update the minimal KYC fields ───────────────────────

router.patch("/me", userAuth, async (req: Request, res: Response) => {
  const { fullName, phone, bankAccountName } = req.body as {
    fullName?: string;
    phone?: string;
    bankAccountName?: string;
  };

  if (
    (fullName !== undefined && fullName.length > MAX_NAME_LEN) ||
    (bankAccountName !== undefined && bankAccountName.length > MAX_NAME_LEN)
  ) {
    return res.status(400).json({ error: "Name fields exceed the maximum allowed length." });
  }
  if (phone !== undefined && phone.length > MAX_PHONE_LEN) {
    return res.status(400).json({ error: "Phone number exceeds the maximum allowed length." });
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(fullName        !== undefined ? { fullName: fullName.trim() } : {}),
      ...(phone           !== undefined ? { phone: phone.trim() } : {}),
      ...(bankAccountName !== undefined ? { bankAccountName: bankAccountName.trim() } : {}),
    },
  });

  return res.json({ success: true, user: publicUser(user) });
});

export default router;
