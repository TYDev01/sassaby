"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

// Load WalletProvider only on the client — @stacks/connect uses browser APIs
// that crash the Next.js SSR prerender if imported server-side.
const WalletProvider = dynamic(
  () => import("@/lib/wallet").then((m) => ({ default: m.WalletProvider })),
  { ssr: false }
);

export default function ClientProviders({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
