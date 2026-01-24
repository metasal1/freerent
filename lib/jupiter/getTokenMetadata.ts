import { JUPITER_API_KEY, JUPITER_API_URL } from "../solana/constants";

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
  usdPrice: number | null;
  isVerified: boolean;
}

interface JupiterTokenResponse {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  usdPrice?: number;
  isVerified?: boolean;
}

/**
 * Fetch token metadata from Jupiter API for multiple mints
 * @param mints Array of mint addresses (max 100 per batch)
 * @returns Map of mint address to TokenMetadata
 */
export async function getTokenMetadata(
  mints: string[]
): Promise<Map<string, TokenMetadata>> {
  const result = new Map<string, TokenMetadata>();

  if (mints.length === 0) {
    return result;
  }

  // Jupiter API limits to 100 mints per request
  const BATCH_SIZE = 100;
  const batches: string[][] = [];

  for (let i = 0; i < mints.length; i += BATCH_SIZE) {
    batches.push(mints.slice(i, i + BATCH_SIZE));
  }

  // Fetch all batches in parallel
  const batchPromises = batches.map(async (batch) => {
    try {
      const query = batch.join(",");
      const response = await fetch(
        `${JUPITER_API_URL}/search?query=${encodeURIComponent(query)}`,
        {
          headers: {
            "x-api-key": JUPITER_API_KEY,
          },
        }
      );

      if (!response.ok) {
        console.warn(`Jupiter API error: ${response.status}`);
        return [];
      }

      const data: JupiterTokenResponse[] = await response.json();
      return data;
    } catch (error) {
      console.warn("Failed to fetch token metadata from Jupiter:", error);
      return [];
    }
  });

  const batchResults = await Promise.all(batchPromises);

  // Process all results
  for (const tokens of batchResults) {
    for (const token of tokens) {
      result.set(token.id, {
        mint: token.id,
        name: token.name || "Unknown",
        symbol: token.symbol || "???",
        icon: token.icon || null,
        decimals: token.decimals,
        usdPrice: token.usdPrice ?? null,
        isVerified: token.isVerified ?? false,
      });
    }
  }

  return result;
}

/**
 * Calculate USD value of a token amount
 */
export function calculateTokenValue(
  amount: bigint,
  decimals: number,
  usdPrice: number | null
): number | null {
  if (usdPrice === null) {
    return null;
  }
  const tokenAmount = Number(amount) / Math.pow(10, decimals);
  return tokenAmount * usdPrice;
}
