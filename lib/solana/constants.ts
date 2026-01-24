import { PublicKey } from "@solana/web3.js";

// Token Program IDs
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// Fee configuration
export const FEE_RECIPIENT = new PublicKey(
  process.env.NEXT_PUBLIC_FEE_RECIPIENT || "va1TBuMdfdgHUb3fYA79CfFQPFf3KQ3k86n5dp4hHRr"
);
export const FEE_PERCENT = Number(process.env.NEXT_PUBLIC_FEE_PERCENT) || 1;

// Solana transaction fee (5000 lamports per signature, typically 1 signature)
export const TX_FEE_LAMPORTS = 5000;

// Rent per token account (approximate)
export const RENT_PER_ACCOUNT = 0.00203928; // SOL

// Transaction limits
// Close instruction: ~38 bytes per account (32 pubkey + 6 instruction overhead)
// Max tx size: 1232 bytes, header ~250 bytes = ~980 bytes for instructions
// 980 / 38 ≈ 25 accounts max by size
// CU per close: ~3,000-5,000 CU (very lightweight instruction)
export const MAX_ACCOUNTS_PER_TX = 20; // Safe limit accounting for fee transfer
export const MAX_CU_PER_TX = 1_400_000;
export const CU_PER_CLOSE = 5_000; // Approximate CU per close account instruction

// Calculate max batch size based on CU limit
export function getMaxBatchSize(): number {
  const maxByComputeUnits = Math.floor(MAX_CU_PER_TX / CU_PER_CLOSE);
  return Math.min(maxByComputeUnits, MAX_ACCOUNTS_PER_TX);
}
