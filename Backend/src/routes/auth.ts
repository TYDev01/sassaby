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
} from "../lib/auth";
import { userAuth } from "../middleware/userAuth";

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

  // Same response whether the account is missing or the password is wrong, so
  // the endpoint can't be used to enumerate registered addresses.
  const ok = user ? await verifyPassword(password, user.password) : false;
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
