import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, RENT_PER_ACCOUNT } from "./constants";

// Token account state enum
const AccountState = {
  Uninitialized: 0,
  Initialized: 1,
  Frozen: 2,
} as const;

// Parse raw token account data from base64
function parseTokenAccountData(data: Buffer, expectedOwner: PublicKey): {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  state: number;
  closeAuthority: PublicKey | null;
} | null {
  // Minimum size for token account is 165 bytes
  if (data.length < 165) return null;

  try {
    const mint = new PublicKey(data.slice(0, 32));
    const owner = new PublicKey(data.slice(32, 64));
    const amount = data.readBigUInt64LE(64);
    // Skip delegate (4 + 32 bytes) at offset 72
    const state = data[108];
    // Skip isNative (4 + 8 bytes) at offset 109
    // Skip delegatedAmount (8 bytes) at offset 121
    const closeAuthorityOption = data.readUInt32LE(129);
    const closeAuthority = closeAuthorityOption === 1
      ? new PublicKey(data.slice(133, 165))
      : null;

    return { mint, owner, amount, state, closeAuthority };
  } catch {
    return null;
  }
}

// Check if account data is base64 encoded (array format) vs parsed object
function isBase64Data(data: any): data is [string, string] {
  return Array.isArray(data) && data.length === 2 && typeof data[0] === 'string' && data[1] === 'base64';
}

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
  canBurn: boolean; // Whether the account can be burned (has balance, not frozen)
  burnBlockedReason?: string;
}

export async function getTokenAccounts(
  connection: Connection,
  owner: PublicKey
): Promise<TokenAccountInfo[]> {
  const accounts: TokenAccountInfo[] = [];

  // Fetch from both Token Program and Token-2022
  // Wrap in try-catch to handle wallet extensions (like Jupiter) that may
  // intercept RPC calls and return base64-encoded data instead of parsed objects
  let tokenAccounts: Awaited<ReturnType<typeof connection.getParsedTokenAccountsByOwner>> = { context: { slot: 0 }, value: [] };
  let token2022Accounts: Awaited<ReturnType<typeof connection.getParsedTokenAccountsByOwner>> = { context: { slot: 0 }, value: [] };

  try {
    [tokenAccounts, token2022Accounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
  } catch (e: any) {
    // If parsing fails (e.g., due to wallet extension like Jupiter returning base64 data),
    // create a fresh connection that bypasses the wallet extension proxy
    const errorMessage = e?.message || String(e);
    if (errorMessage.includes('Expected an object') && errorMessage.includes('base64')) {
      console.warn('Wallet extension returned unparseable data, creating direct RPC connection...');
      // Create a fresh connection directly to the RPC endpoint to bypass wallet extension proxy
      const directConnection = new Connection(connection.rpcEndpoint, 'confirmed');
      try {
        [tokenAccounts, token2022Accounts] = await Promise.all([
          directConnection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
          directConnection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
        ]);
      } catch (fallbackError: any) {
        console.error('Fallback RPC also failed:', fallbackError?.message);
        throw new Error('Unable to fetch token accounts. Your wallet extension may be interfering with RPC calls. Try using a different wallet or browser.');
      }
    } else {
      throw e;
    }
  }

  // Process Token Program accounts (standard SPL)
  for (const { pubkey, account } of tokenAccounts.value) {
    let mint: PublicKey;
    let accountOwner: PublicKey;
    let amount: bigint;
    let decimals: number;
    let isFrozen: boolean;
    let hasCloseAuthority: boolean;

    // Handle both parsed and base64 data formats
    if (isBase64Data(account.data)) {
      // Parse base64 encoded data manually
      const buffer = Buffer.from(account.data[0], 'base64');
      const parsed = parseTokenAccountData(buffer, owner);
      if (!parsed) continue;

      mint = parsed.mint;
      accountOwner = parsed.owner;
      amount = parsed.amount;
      decimals = 0; // Unknown for base64, default to 0 (works for NFTs)
      isFrozen = parsed.state === AccountState.Frozen;
      hasCloseAuthority = parsed.closeAuthority !== null && !parsed.closeAuthority.equals(parsed.owner);
    } else if (account.data.parsed?.info) {
      // Use parsed data
      const parsed = account.data.parsed.info;
      mint = new PublicKey(parsed.mint);
      accountOwner = new PublicKey(parsed.owner);
      amount = BigInt(parsed.tokenAmount.amount);
      decimals = parsed.tokenAmount.decimals;
      isFrozen = parsed.state === "frozen";
      hasCloseAuthority = parsed.closeAuthority && parsed.closeAuthority !== parsed.owner;
    } else {
      // Skip accounts that couldn't be parsed
      continue;
    }

    const isEmpty = amount === 0n;
    const ownerMatches = accountOwner.equals(owner);

    let canClose = isEmpty && ownerMatches && !hasCloseAuthority && !isFrozen;
    let closeBlockedReason: string | undefined;

    if (!ownerMatches) {
      closeBlockedReason = "Owner mismatch";
    } else if (hasCloseAuthority) {
      closeBlockedReason = "Has close authority";
    } else if (isFrozen) {
      closeBlockedReason = "Account is frozen";
    }

    // Burn validation: can burn if has balance, owner matches, and not frozen
    let canBurn = !isEmpty && ownerMatches && !isFrozen;
    let burnBlockedReason: string | undefined;

    if (isEmpty) {
      burnBlockedReason = "No balance to burn";
    } else if (!ownerMatches) {
      burnBlockedReason = "Owner mismatch";
    } else if (isFrozen) {
      burnBlockedReason = "Account is frozen";
    }

    accounts.push({
      pubkey,
      mint,
      owner: accountOwner,
      amount,
      decimals,
      rentLamports: account.lamports,
      isEmpty,
      programId: TOKEN_PROGRAM_ID,
      canClose,
      closeBlockedReason,
      canBurn,
      burnBlockedReason,
    });
  }

  // Process Token-2022 accounts (may have extensions that block closing)
  for (const { pubkey, account } of token2022Accounts.value) {
    let mint: PublicKey;
    let accountOwner: PublicKey;
    let amount: bigint;
    let decimals: number;
    let isFrozen: boolean;
    let hasCloseAuthority: boolean;
    let hasConfidentialTransfer = false;
    let hasPermanentDelegate = false;
    let isNonTransferable = false;
    let hasTransferHook = false;
    let hasWithheldFees = false;
    let hasUnknownExtensions = false;

    // Handle both parsed and base64 data formats
    if (isBase64Data(account.data)) {
      // Parse base64 encoded data manually
      const buffer = Buffer.from(account.data[0], 'base64');
      const parsed = parseTokenAccountData(buffer, owner);
      if (!parsed) continue;

      mint = parsed.mint;
      accountOwner = parsed.owner;
      amount = parsed.amount;
      decimals = 0; // Unknown for base64, default to 0 (works for NFTs/position tokens)
      isFrozen = parsed.state === AccountState.Frozen;
      hasCloseAuthority = parsed.closeAuthority !== null && !parsed.closeAuthority.equals(parsed.owner);

      // For Token-2022 base64 accounts, we can't easily parse extensions
      // Mark as having unknown extensions if account is larger than base size
      if (buffer.length > 165) {
        hasUnknownExtensions = true;
      }
    } else if (account.data.parsed?.info) {
      // Use parsed data
      const parsed = account.data.parsed.info;
      mint = new PublicKey(parsed.mint);
      accountOwner = new PublicKey(parsed.owner);
      amount = BigInt(parsed.tokenAmount.amount);
      decimals = parsed.tokenAmount.decimals;
      isFrozen = parsed.state === "frozen";

      // Parse extensions and check for blockers
      const extensions = parsed.extensions || [];

      hasConfidentialTransfer = extensions.some(
        (ext: { extension: string }) =>
          ext.extension === "confidentialTransferAccount" ||
          ext.extension === "confidentialTransferFeeAmount"
      );

      hasPermanentDelegate = extensions.some(
        (ext: { extension: string }) => ext.extension === "permanentDelegate"
      );

      const closeAuthorityExt = extensions.find(
        (ext: { extension: string; state?: { closeAuthority?: string } }) =>
          ext.extension === "mintCloseAuthority"
      );
      hasCloseAuthority = closeAuthorityExt || (parsed.closeAuthority && parsed.closeAuthority !== parsed.owner);

      isNonTransferable = extensions.some(
        (ext: { extension: string }) => ext.extension === "nonTransferable"
      );

      hasTransferHook = extensions.some(
        (ext: { extension: string }) => ext.extension === "transferHook" || ext.extension === "transferHookAccount"
      );

      const transferFeeExt = extensions.find(
        (ext: { extension: string; state?: { withheldAmount?: string } }) => ext.extension === "transferFeeAmount"
      ) as { extension: string; state?: { withheldAmount?: string } } | undefined;
      hasWithheldFees = !!(transferFeeExt?.state?.withheldAmount && BigInt(transferFeeExt.state.withheldAmount) > 0n);
    } else {
      // Skip accounts that couldn't be parsed
      continue;
    }

    const isEmpty = amount === 0n;
    const ownerMatches = accountOwner.equals(owner);

    // Determine if account can be closed
    let canClose = isEmpty && ownerMatches;
    let closeBlockedReason: string | undefined;

    if (!ownerMatches) {
      canClose = false;
      closeBlockedReason = "Owner mismatch";
    } else if (hasUnknownExtensions) {
      canClose = false;
      closeBlockedReason = "Has extensions (unparsed)";
    } else if (hasConfidentialTransfer) {
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
    } else if (hasWithheldFees) {
      canClose = false;
      closeBlockedReason = "Has withheld fees";
    }

    // Burn validation for Token-2022
    let canBurn = !isEmpty && ownerMatches && !isFrozen && !hasPermanentDelegate && !hasUnknownExtensions;
    let burnBlockedReason: string | undefined;

    if (isEmpty) {
      burnBlockedReason = "No balance to burn";
    } else if (!ownerMatches) {
      burnBlockedReason = "Owner mismatch";
    } else if (isFrozen) {
      burnBlockedReason = "Account is frozen";
    } else if (hasPermanentDelegate) {
      burnBlockedReason = "Has permanent delegate";
    } else if (hasUnknownExtensions) {
      burnBlockedReason = "Has extensions (unparsed)";
    }

    accounts.push({
      pubkey,
      mint,
      owner: accountOwner,
      amount,
      decimals,
      rentLamports: account.lamports,
      isEmpty,
      programId: TOKEN_2022_PROGRAM_ID,
      canClose,
      closeBlockedReason,
      canBurn,
      burnBlockedReason,
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
