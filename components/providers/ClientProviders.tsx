"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

const WalletProvider = dynamic(
  () => import("./WalletProvider").then((mod) => mod.WalletProvider),
  { ssr: false }
);

export function ClientProviders({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
