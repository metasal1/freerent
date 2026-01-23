import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, RENT_PER_ACCOUNT } from "./constants";

export interface TokenAccountInfo {
  pubkey: PublicKey;
  mint: PublicKey;
  amount: bigint;
  decimals: number;
  rentLamports: number;
  isEmpty: boolean;
  programId: PublicKey;
  canClose: boolean; // Whether the account can be safely closed
  closeBlockedReason?: string;
}

export async function getTokenAccounts(
  connection: Connection,
  owner: PublicKey
): Promise<TokenAccountInfo[]> {
  const accounts: TokenAccountInfo[] = [];

  // Fetch from both Token Program and Token-2022
  const [tokenAccounts, token2022Accounts] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  // Process Token Program accounts (standard SPL - always closeable if empty)
  for (const { pubkey, account } of tokenAccounts.value) {
    const parsed = account.data.parsed.info;
    const amount = BigInt(parsed.tokenAmount.amount);
    const isEmpty = amount === 0n;

    accounts.push({
      pubkey,
      mint: new PublicKey(parsed.mint),
      amount,
      decimals: parsed.tokenAmount.decimals,
      rentLamports: account.lamports,
      isEmpty,
      programId: TOKEN_PROGRAM_ID,
      canClose: isEmpty,
    });
  }

  // Process Token-2022 accounts (may have extensions that block closing)
  for (const { pubkey, account } of token2022Accounts.value) {
    const parsed = account.data.parsed.info;
    const amount = BigInt(parsed.tokenAmount.amount);
    const isEmpty = amount === 0n;

    // Check for extensions that block closing
    let canClose = isEmpty;
    let closeBlockedReason: string | undefined;

    // Check for confidential transfer extension
    const extensions = parsed.extensions || [];
    const hasConfidentialTransfer = extensions.some(
      (ext: { extension: string }) =>
        ext.extension === "confidentialTransferAccount" ||
        ext.extension === "confidentialTransferFeeAmount"
    );

    if (hasConfidentialTransfer) {
      canClose = false;
      closeBlockedReason = "Has confidential transfer (use Token-2022 tools)";
    }

    accounts.push({
      pubkey,
      mint: new PublicKey(parsed.mint),
      amount,
      decimals: parsed.tokenAmount.decimals,
      rentLamports: account.lamports,
      isEmpty,
      programId: TOKEN_2022_PROGRAM_ID,
      canClose,
      closeBlockedReason,
    });
  }

  return accounts;
}

export function calculateTotalRent(accounts: TokenAccountInfo[]): number {
  return accounts.reduce((total, acc) => total + acc.rentLamports, 0) / 1e9;
}

export function calculateFee(rentAmount: number, feePercent: number): number {
  return rentAmount * (feePercent / 100);
}
