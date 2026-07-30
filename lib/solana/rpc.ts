/** Shared RPC endpoint resolution (client + server). */

export function getSolanaRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
}
