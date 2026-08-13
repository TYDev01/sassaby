"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";

// Identity is the account. There is no wallet connect any more: every asset is
// deposited to a desk address, so nothing in the client signs a transaction.
export default function ClientProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
