/**
 * userAuth middleware
 *
 * Authenticates an end user from `Authorization: Bearer <jwt>` and attaches the
 * resolved record to `req.user`.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token body.  A ban has to take effect immediately — a token issued
 * before the ban is still cryptographically valid for up to seven days, so a
 * claims-only check would leave a banned account trading for a week.
 */

import { Request, Response, NextFunction } from "express";
import { authConfigured, verifyToken } from "../lib/auth";
import { prisma } from "../lib/prisma";

export interface AuthedUser {
  id: string;
  email: string;
  fullName: string;
  bankAccountName: string;
  kycTier: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function userAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!authConfigured()) {
    res.status(503).json({ error: "Authentication is not configured on this server." });
    return;
  }

  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "Unauthorized. Bearer token required." });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
    return;
  }
  if (user.banned) {
    res.status(403).json({ error: "This account has been suspended." });
    return;
  }

  req.user = {
    id:              user.id,
    email:           user.email,
    fullName:        user.fullName,
    bankAccountName: user.bankAccountName,
    kycTier:         user.kycTier,
    isAdmin:         user.isAdmin,
  };
  next();
}
