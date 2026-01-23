"use client";

import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "./ui/Button";

interface PhantomProvider {
  isPhantom: boolean;
  publicKey: PublicKey | null;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: any) => Promise<any>;
  on: (event: string, callback: () => void) => void;
  off: (event: string, callback: () => void) => void;
}

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider;
    };
  }
}

export function usePhantom() {
  const [provider, setProvider] = useState<PhantomProvider | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.phantom?.solana?.isPhantom) {
      const phantom = window.phantom.solana;
      setProvider(phantom);

      // Check if already connected
      if (phantom.publicKey) {
        setPublicKey(phantom.publicKey);
      }

      // Listen for account changes
      const handleAccountChange = () => {
        setPublicKey(phantom.publicKey);
      };

      phantom.on("accountChanged", handleAccountChange);
      return () => phantom.off("accountChanged", handleAccountChange);
    }
  }, []);

  const connect = async () => {
    if (!provider) {
      window.open("https://phantom.app/", "_blank");
      return;
    }

    setConnecting(true);
    try {
      const { publicKey } = await provider.connect();
      setPublicKey(publicKey);
    } catch (err) {
      console.error("Failed to connect:", err);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (provider) {
      await provider.disconnect();
      setPublicKey(null);
    }
  };

  return {
    provider,
    publicKey,
    connecting,
    connected: !!publicKey,
    connect,
    disconnect,
    signTransaction: provider?.signTransaction.bind(provider),
  };
}

export function WalletButton() {
  const { publicKey, connecting, connected, connect, disconnect } = usePhantom();

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-white/60 hidden sm:inline">
          {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
        </span>
        <Button variant="secondary" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={connect} loading={connecting}>
      Connect Phantom
    </Button>
  );
}
