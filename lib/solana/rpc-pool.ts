/** Server-only mainnet RPC pool. Never import from client. */

const HELIUS_FAST = [
  "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com",
  "https://velvet-hw7q70-fast-mainnet.helius-rpc.com",
  "https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com",
];

function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

export function mainnetRpcEndpoints(): string[] {
  const list: string[] = [];
  const override = process.env.SOLANA_RPC_URL?.trim();
  if (override && !/rpc\.aex402\.com/i.test(override)) {
    list.push(override);
  }
  list.push(...HELIUS_FAST);
  const key = process.env.HELIUS_API_KEY?.trim();
  if (key) list.push(`https://mainnet.helius-rpc.com/?api-key=${key}`);
  list.push("https://solana.publicnode.com");
  // aex402 last — x402 402 without prepaid credits
  list.push("https://rpc.aex402.com");

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of list) {
    const k = normalize(url).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(normalize(url));
  }
  return out;
}

export function isRpcRateLimited(status: number, body: string): boolean {
  if (status === 402 || status === 429) return true;
  const t = body.toLowerCase();
  return (
    t.includes("rate limit") ||
    t.includes("payment required") ||
    t.includes("-32099") ||
    t.includes("pay $") ||
    t.includes("free tier")
  );
}
