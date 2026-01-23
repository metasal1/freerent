import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, RENT_PER_ACCOUNT } from "./constants";

export interface TokenAccountInfo {
  pubkey: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
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
    const accountOwner = new PublicKey(parsed.owner);

    // Verify the owner matches
    const ownerMatches = accountOwner.equals(owner);

    accounts.push({
      pubkey,
      mint: new PublicKey(parsed.mint),
      owner: accountOwner,
      amount,
      decimals: parsed.tokenAmount.decimals,
      rentLamports: account.lamports,
      isEmpty,
      programId: TOKEN_PROGRAM_ID,
      canClose: isEmpty && ownerMatches,
      closeBlockedReason: !ownerMatches ? "Owner mismatch" : undefined,
    });
  }

  // Process Token-2022 accounts (may have extensions that block closing)
  for (const { pubkey, account } of token2022Accounts.value) {
    const parsed = account.data.parsed.info;
    const amount = BigInt(parsed.tokenAmount.amount);
    const isEmpty = amount === 0n;
    const accountOwner = new PublicKey(parsed.owner);

    // Verify the owner matches
    const ownerMatches = accountOwner.equals(owner);

    // Check for extensions that block closing
    let canClose = isEmpty && ownerMatches;
    let closeBlockedReason: string | undefined;

    if (!ownerMatches) {
      closeBlockedReason = "Owner mismatch";
    } else {
      const extensions = parsed.extensions || [];

      // Check for confidential transfer extension
      const hasConfidentialTransfer = extensions.some(
        (ext: { extension: string }) =>
          ext.extension === "confidentialTransferAccount" ||
          ext.extension === "confidentialTransferFeeAmount"
      );

      // Check for close authority set to different address
      const closeAuthorityExt = extensions.find(
        (ext: { extension: string }) => ext.extension === "permanentDelegate"
      );

      // Check if account is frozen
      const isFrozen = parsed.state === "frozen";

      // Check for non-transferable
      const isNonTransferable = extensions.some(
        (ext: { extension: string }) => ext.extension === "nonTransferable"
      );

      if (hasConfidentialTransfer) {
        canClose = false;
        closeBlockedReason = "Has confidential transfer";
      } else if (isFrozen) {
        canClose = false;
        closeBlockedReason = "Account is frozen";
      } else if (closeAuthorityExt) {
        canClose = false;
        closeBlockedReason = "Has permanent delegate";
      } else if (isNonTransferable && !isEmpty) {
        canClose = false;
        closeBlockedReason = "Non-transferable token";
      }
    }

    accounts.push({
      pubkey,
      mint: new PublicKey(parsed.mint),
      owner: accountOwner,
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
