/** Shared RPC endpoint resolution (client + server). */

/**
 * Browser / wallet-adapter endpoint: same-origin proxy.
 * Relative URL is fine for web3.js in the browser and avoids SSR host issues.
 */
export function getClientRpcUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/rpc`;
  }
  return "/api/rpc";
}

/**
 * Server-side upstream RPC (sponsor, stats, /api/rpc proxy target).
 */
export function getSolanaRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    "https://rpc.aex402.com/"
  );
}
