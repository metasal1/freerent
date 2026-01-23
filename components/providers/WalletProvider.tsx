"use client";

import { useMemo } from "react";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const network = process.env.NEXT_PUBLIC_NETWORK === "mainnet-beta"
    ? "mainnet-beta"
    : "devnet";

  const endpoint = useMemo(() => {
    return process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(network);
  }, [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {children}
    </ConnectionProvider>
  );
}
