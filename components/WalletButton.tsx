"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function useWalletAdapter() {
  const { publicKey, signTransaction, connected, connecting, disconnect } = useWallet();

  return {
    publicKey,
    signTransaction,
    connected,
    connecting,
    disconnect,
  };
}

export function WalletButton() {
  return <WalletMultiButton />;
}
