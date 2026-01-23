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

  // Process Token Program accounts (standard SPL)
  for (const { pubkey, account } of tokenAccounts.value) {
    // Skip accounts that couldn't be parsed
    if (!account.data.parsed?.info) continue;
    const parsed = account.data.parsed.info;
    const amount = BigInt(parsed.tokenAmount.amount);
    const isEmpty = amount === 0n;
    const accountOwner = new PublicKey(parsed.owner);

    // Verify the owner matches
    const ownerMatches = accountOwner.equals(owner);

    // Check for close authority (if set, only that authority can close)
    const closeAuthority = parsed.closeAuthority;
    const hasCloseAuthority = closeAuthority && closeAuthority !== parsed.owner;

    // Check if account is frozen
    const isFrozen = parsed.state === "frozen";

    // Check for delegate (delegated accounts may have issues)
    const hasDelegate = parsed.delegate && parsed.delegatedAmount?.uiAmount > 0;

    let canClose = isEmpty && ownerMatches && !hasCloseAuthority && !isFrozen;
    let closeBlockedReason: string | undefined;

    if (!ownerMatches) {
      closeBlockedReason = "Owner mismatch";
    } else if (hasCloseAuthority) {
      closeBlockedReason = "Has close authority";
    } else if (isFrozen) {
      closeBlockedReason = "Account is frozen";
    }

    accounts.push({
      pubkey,
      mint: new PublicKey(parsed.mint),
      owner: accountOwner,
      amount,
      decimals: parsed.tokenAmount.decimals,
      rentLamports: account.lamports,
      isEmpty,
      programId: TOKEN_PROGRAM_ID,
      canClose,
      closeBlockedReason,
    });
  }

  // Process Token-2022 accounts (may have extensions that block closing)
  for (const { pubkey, account } of token2022Accounts.value) {
    // Skip accounts that couldn't be parsed
    if (!account.data.parsed?.info) continue;
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

      // Check for permanent delegate
      const hasPermanentDelegate = extensions.some(
        (ext: { extension: string }) => ext.extension === "permanentDelegate"
      );

      // Check for close authority extension
      const closeAuthorityExt = extensions.find(
        (ext: { extension: string; state?: { closeAuthority?: string } }) =>
          ext.extension === "mintCloseAuthority"
      );
      const hasCloseAuthority = closeAuthorityExt || (parsed.closeAuthority && parsed.closeAuthority !== parsed.owner);

      // Check if account is frozen
      const isFrozen = parsed.state === "frozen";

      // Check for non-transferable
      const isNonTransferable = extensions.some(
        (ext: { extension: string }) => ext.extension === "nonTransferable"
      );

      // Check for transfer hook (may cause issues)
      const hasTransferHook = extensions.some(
        (ext: { extension: string }) => ext.extension === "transferHook" || ext.extension === "transferHookAccount"
      );

      if (hasConfidentialTransfer) {
        canClose = false;
        closeBlockedReason = "Has confidential transfer";
      } else if (isFrozen) {
        canClose = false;
        closeBlockedReason = "Account is frozen";
      } else if (hasPermanentDelegate) {
        canClose = false;
        closeBlockedReason = "Has permanent delegate";
      } else if (hasCloseAuthority) {
        canClose = false;
        closeBlockedReason = "Has close authority";
      } else if (isNonTransferable) {
        canClose = false;
        closeBlockedReason = "Non-transferable token";
      } else if (hasTransferHook) {
        canClose = false;
        closeBlockedReason = "Has transfer hook";
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
