"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";

// Load WalletProvider only on the client — @stacks/connect uses browser APIs
// that crash the Next.js SSR prerender if imported server-side.
const WalletProvider = dynamic(
  () => import("@/lib/wallet").then((m) => ({ default: m.WalletProvider })),
  { ssr: false }
);

// AuthProvider wraps the wallet, not the other way round: identity is the
// account now, and the wallet is an optional convenience for Stacks sends.
export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WalletProvider>{children}</WalletProvider>
    </AuthProvider>
  );
}
