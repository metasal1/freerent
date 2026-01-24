import {
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { createBurnInstruction, createCloseAccountInstruction } from "@solana/spl-token";
import { TokenAccountInfo } from "./getTokenAccounts";
import { FEE_RECIPIENT, FEE_PERCENT, MAX_ACCOUNTS_PER_BURN_TX, TX_FEE_LAMPORTS } from "./constants";

export interface TokenBurnInfo {
  mint: string;
  amount: bigint;
  decimals: number;
}

export interface BurnAccountsResult {
  transaction: Transaction;
  accountsToBurn: TokenAccountInfo[];
  tokensDestroyed: TokenBurnInfo[];
  estimatedRent: number;
  fee: number;
  netRent: number;
}

export function buildBurnAccountsTransaction(
  accounts: TokenAccountInfo[],
  owner: PublicKey,
  feePayer?: PublicKey
): BurnAccountsResult {
  // Limit to max accounts per transaction
  const accountsToBurn = accounts.slice(0, MAX_ACCOUNTS_PER_BURN_TX);

  const transaction = new Transaction();
  let totalRentLamports = 0;
  const tokensDestroyed: TokenBurnInfo[] = [];

  // Add burn and close instructions for each account
  for (const account of accountsToBurn) {
    if (!account.canBurn) {
      // Skip accounts that can't be burned
      continue;
    }

    // Verify account owner matches the transaction owner (connected wallet)
    if (!account.owner.equals(owner)) {
      console.warn(`Skipping account ${account.pubkey.toBase58()} - owner mismatch`);
      continue;
    }

    // Create burn instruction to burn all tokens
    const burnIx = createBurnInstruction(
      account.pubkey,    // Token account to burn from
      account.mint,      // Mint address
      owner,             // Owner (must sign)
      account.amount,    // Amount to burn (all of it)
      [],                // Multisig signers
      account.programId  // Token program (standard or Token-2022)
    );
    transaction.add(burnIx);

    // Create close instruction to reclaim rent (account will be empty after burn)
    const closeIx = createCloseAccountInstruction(
      account.pubkey,
      owner, // destination for rent (connected wallet)
      owner, // authority (connected wallet - will sign)
      [],
      account.programId
    );
    transaction.add(closeIx);

    totalRentLamports += account.rentLamports;
    tokensDestroyed.push({
      mint: account.mint.toBase58(),
      amount: account.amount,
      decimals: account.decimals,
    });
  }

  // Calculate fee (transaction cost + 1% of recovered rent)
  const totalRentSol = totalRentLamports / 1e9;
  const serviceFee = totalRentSol * (FEE_PERCENT / 100);
  const txFeeSol = TX_FEE_LAMPORTS / 1e9;
  const fee = serviceFee + txFeeSol;
  const feeLamports = Math.floor(fee * 1e9);

  // Add fee transfer instruction
  if (feeLamports > 0) {
    const feeIx = SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: FEE_RECIPIENT,
      lamports: feeLamports,
    });
    transaction.add(feeIx);
  }

  // Set fee payer
  transaction.feePayer = feePayer || owner;

  return {
    transaction,
    accountsToBurn,
    tokensDestroyed,
    estimatedRent: totalRentSol,
    fee,
    netRent: totalRentSol - fee,
  };
}
