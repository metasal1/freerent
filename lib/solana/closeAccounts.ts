import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { createCloseAccountInstruction } from "@solana/spl-token";
import { TokenAccountInfo } from "./getTokenAccounts";
import { FEE_RECIPIENT, FEE_PERCENT, MAX_ACCOUNTS_PER_TX } from "./constants";

export interface CloseAccountsResult {
  transaction: Transaction;
  accountsToClose: TokenAccountInfo[];
  estimatedRent: number;
  fee: number;
  netRent: number;
}

export function buildCloseAccountsTransaction(
  accounts: TokenAccountInfo[],
  owner: PublicKey,
  feePayer?: PublicKey
): CloseAccountsResult {
  // Limit to max accounts per transaction
  const accountsToClose = accounts.slice(0, MAX_ACCOUNTS_PER_TX);

  const transaction = new Transaction();
  let totalRentLamports = 0;

  // Add close instructions for each account
  for (const account of accountsToClose) {
    if (!account.canClose) {
      // Skip accounts that can't be closed
      continue;
    }

    const closeIx = createCloseAccountInstruction(
      account.pubkey,
      account.owner, // destination for rent (account's verified owner)
      account.owner, // authority (account's verified owner)
      [],
      account.programId
    );

    transaction.add(closeIx);
    totalRentLamports += account.rentLamports;
  }

  // Calculate fee (1% of recovered rent)
  const totalRentSol = totalRentLamports / 1e9;
  const fee = totalRentSol * (FEE_PERCENT / 100);
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
    accountsToClose,
    estimatedRent: totalRentSol,
    fee,
    netRent: totalRentSol - fee,
  };
}

export function buildBatchCloseTransactions(
  accounts: TokenAccountInfo[],
  owner: PublicKey,
  batchSize: number = MAX_ACCOUNTS_PER_TX
): CloseAccountsResult[] {
  const results: CloseAccountsResult[] = [];

  // Filter to only empty accounts
  const emptyAccounts = accounts.filter((acc) => acc.isEmpty);

  // Split into batches
  for (let i = 0; i < emptyAccounts.length; i += batchSize) {
    const batch = emptyAccounts.slice(i, i + batchSize);
    const result = buildCloseAccountsTransaction(batch, owner);
    results.push(result);
  }

  return results;
}
