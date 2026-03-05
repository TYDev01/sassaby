"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { connect, disconnect, isConnected, getLocalStorage } from "@stacks/connect";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletAddress {
  stx: string;
  btc: string;
}

interface WalletContextValue {
  connected: boolean;
  addresses: WalletAddress | null;
  connecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue>({
  connected: false,
  addresses: null,
  connecting: false,
  connectWallet: async () => {},
  disconnectWallet: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [addresses, setAddresses] = useState<WalletAddress | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    if (isConnected()) {
      const data = getLocalStorage();
      if (data?.addresses) {
        setConnected(true);
        setAddresses({
          stx: data.addresses.stx?.[0]?.address ?? "",
          btc: data.addresses.btc?.[0]?.address ?? "",
        });
      }
    }
  }, []);

  const connectWallet = useCallback(async () => {
    setConnecting(true);
    try {
      const response = await connect();
      if (response?.addresses) {
        // `addresses` is a flat AddressEntry[] with optional `symbol` field
        const stxEntry = response.addresses.find(
          (a) => !a.symbol || a.symbol.toUpperCase() === "STX"
        );
        const btcEntry = response.addresses.find(
          (a) => a.symbol?.toUpperCase() === "BTC"
        );
        setConnected(true);
        setAddresses({
          stx: stxEntry?.address ?? "",
          btc: btcEntry?.address ?? "",
        });
      }
    } catch (err) {
      console.error("Wallet connect error:", err);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    disconnect();
    setConnected(false);
    setAddresses(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ connected, addresses, connecting, connectWallet, disconnectWallet }}
    >
      {children}
    </WalletContext.Provider>
  );
}
