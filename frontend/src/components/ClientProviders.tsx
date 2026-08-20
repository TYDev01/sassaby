"use client";

import { ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/lib/auth";

// Identity is the account. There is no wallet connect any more: every asset is
// deposited to a desk address, so nothing in the client signs a transaction.

/**
 * Public by design — a Google client id identifies the app, it does not
 * authorise anything. What stops it being used from another site is the
 * "Authorised JavaScript origins" list on the client itself, plus the backend
 * re-checking the `aud` claim on every token it is handed.
 */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export default function ClientProviders({ children }: { children: ReactNode }) {
  const tree = <AuthProvider>{children}</AuthProvider>;

  // Wrapping with an empty id makes the provider load Google's script and fail
  // in the console on every page. Unconfigured, we simply don't mount it — the
  // sign-in form checks the same variable and hides the button to match.
  if (!GOOGLE_CLIENT_ID) return tree;

  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider>;
}
