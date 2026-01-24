import { NextRequest, NextResponse } from "next/server";
import bs58 from "bs58";
import { Transaction, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAccount, TokenAccountNotFoundError } from "@solana/spl-token";

const KORA_ENDPOINT = process.env.KORA_ENDPOINT || "https://kora.up.railway.app";
const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";

// Jito block engine endpoints (multiple for redundancy)
const JITO_ENDPOINTS = [
  "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
];

// Kora fee payer address (from getConfig)
const KORA_FEE_PAYER = "va1TBuMdfdgHUb3fYA79CfFQPFf3KQ3k86n5dp4hHRr";

// Fee recipient - must match constants.ts
const FEE_RECIPIENT = new PublicKey(
  process.env.NEXT_PUBLIC_FEE_RECIPIENT || "va1TBuMdfdgHUb3fYA79CfFQPFf3KQ3k86n5dp4hHRr"
);

// SPL Token instruction discriminators
const TOKEN_BURN_DISCRIMINATOR = 8;
const TOKEN_CLOSE_ACCOUNT_DISCRIMINATOR = 9;

// System Program transfer discriminator (little-endian u32)
const SYSTEM_TRANSFER_DISCRIMINATOR = 2;

// Maximum allowed fee (10 SOL - way more than any legitimate tx would need)
const MAX_FEE_LAMPORTS = 10 * 1e9;

// Maximum accounts per transaction (should match client-side limits)
const MAX_CLOSE_ACCOUNTS = 20;
const MAX_BURN_ACCOUNTS = 10;

interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a transaction only contains allowed instructions:
 * - SPL Token CloseAccount (only for accounts with 0 balance)
 * - SPL Token Burn
 * - System Program Transfer (to FEE_RECIPIENT only)
 */
async function validateTransaction(base64Tx: string): Promise<ValidationResult> {
  try {
    const txBytes = Buffer.from(base64Tx, "base64");
    const transaction = Transaction.from(txBytes);

    let closeAccountCount = 0;
    let burnCount = 0;
    let transferCount = 0;

    // Track accounts being burned (these will have 0 balance after burn)
    const burnedAccounts = new Set<string>();
    // Track accounts being closed that need balance verification
    const accountsToVerify: { pubkey: PublicKey; programId: PublicKey }[] = [];

    for (const instruction of transaction.instructions) {
      const programId = instruction.programId.toBase58();

      // Check if it's a Token Program instruction
      if (
        programId === TOKEN_PROGRAM_ID.toBase58() ||
        programId === TOKEN_2022_PROGRAM_ID.toBase58()
      ) {
        const discriminator = instruction.data[0];

        if (discriminator === TOKEN_BURN_DISCRIMINATOR) {
          burnCount++;
          // Track that this account is being burned
          // In burn instruction, keys[0] is the token account
          if (instruction.keys.length > 0) {
            burnedAccounts.add(instruction.keys[0].pubkey.toBase58());
          }
          continue;
        }

        if (discriminator === TOKEN_CLOSE_ACCOUNT_DISCRIMINATOR) {
          closeAccountCount++;
          // In close instruction, keys[0] is the token account
          if (instruction.keys.length > 0) {
            const tokenAccount = instruction.keys[0].pubkey;
            // Only verify balance if this account wasn't burned in the same tx
            if (!burnedAccounts.has(tokenAccount.toBase58())) {
              accountsToVerify.push({
                pubkey: tokenAccount,
                programId: instruction.programId,
              });
            }
          }
          continue;
        }

        // Any other Token instruction is not allowed
        return {
          valid: false,
          error: `Unauthorized Token instruction (discriminator: ${discriminator})`,
        };
      }

      // Check if it's a System Program instruction
      if (programId === SystemProgram.programId.toBase58()) {
        // System Program uses u32 little-endian for instruction type
        const instructionType = instruction.data.readUInt32LE(0);

        if (instructionType === SYSTEM_TRANSFER_DISCRIMINATOR) {
          transferCount++;

          // Verify transfer goes to FEE_RECIPIENT
          // In SystemProgram.transfer, account[1] is the destination
          if (instruction.keys.length < 2) {
            return {
              valid: false,
              error: "Invalid transfer instruction - missing accounts",
            };
          }

          const destination = instruction.keys[1].pubkey;
          if (!destination.equals(FEE_RECIPIENT)) {
            return {
              valid: false,
              error: `Transfer destination ${destination.toBase58()} does not match FEE_RECIPIENT ${FEE_RECIPIENT.toBase58()}`,
            };
          }

          // Verify transfer amount is reasonable
          // Amount is at bytes 4-12 (u64 little-endian after the u32 instruction type)
          const amountBuffer = instruction.data.slice(4, 12);
          const amount = amountBuffer.readBigUInt64LE();

          if (amount > BigInt(MAX_FEE_LAMPORTS)) {
            return {
              valid: false,
              error: `Fee amount ${amount} exceeds maximum allowed ${MAX_FEE_LAMPORTS}`,
            };
          }

          continue;
        }

        // Any other System instruction is not allowed
        return {
          valid: false,
          error: `Unauthorized System instruction (type: ${instructionType})`,
        };
      }

      // Check for Compute Budget program (allowed for setting compute units)
      if (programId === "ComputeBudget111111111111111111111111111111") {
        // Compute budget instructions are allowed
        continue;
      }

      // Any other program is not allowed
      return {
        valid: false,
        error: `Unauthorized program: ${programId}`,
      };
    }

    // Validate reasonable instruction counts
    if (closeAccountCount > MAX_CLOSE_ACCOUNTS) {
      return {
        valid: false,
        error: `Too many close account instructions: ${closeAccountCount} (max: ${MAX_CLOSE_ACCOUNTS})`,
      };
    }

    if (burnCount > MAX_BURN_ACCOUNTS) {
      return {
        valid: false,
        error: `Too many burn instructions: ${burnCount} (max: ${MAX_BURN_ACCOUNTS})`,
      };
    }

    // Must have at least one close or burn instruction
    if (closeAccountCount === 0 && burnCount === 0) {
      return {
        valid: false,
        error: "Transaction must contain at least one close or burn instruction",
      };
    }

    // Should have exactly one transfer (for fees)
    if (transferCount !== 1) {
      return {
        valid: false,
        error: `Expected exactly 1 fee transfer, found ${transferCount}`,
      };
    }

    // Verify all close-only accounts have 0 balance
    if (accountsToVerify.length > 0) {
      const connection = new Connection(SOLANA_RPC, "confirmed");

      for (const { pubkey, programId } of accountsToVerify) {
        try {
          const account = await getAccount(connection, pubkey, "confirmed", programId);

          if (account.amount !== BigInt(0)) {
            return {
              valid: false,
              error: `Token account ${pubkey.toBase58()} has non-zero balance (${account.amount}). Only empty accounts can be closed.`,
            };
          }
        } catch (error) {
          // If account doesn't exist, that's fine (might be already closed)
          if (error instanceof TokenAccountNotFoundError) {
            console.log(`Account ${pubkey.toBase58()} not found, may already be closed`);
            continue;
          }
          return {
            valid: false,
            error: `Failed to verify account ${pubkey.toBase58()}: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      }
    }

    console.log(
      `Transaction validated: ${closeAccountCount} close, ${burnCount} burn, ${transferCount} transfer, ${accountsToVerify.length} balances verified`
    );

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to parse transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Extract the first signature from a signed transaction (which is the tx signature)
function extractSignatureFromTransaction(base64Tx: string): string {
  const txBytes = Buffer.from(base64Tx, "base64");
  // Solana transaction format: first byte is num signatures, then 64 bytes per signature
  const numSignatures = txBytes[0];
  if (numSignatures < 1) {
    throw new Error("No signatures in transaction");
  }
  // First signature starts at byte 1, is 64 bytes
  const signatureBytes = txBytes.slice(1, 65);
  return bs58.encode(signatureBytes);
}

// Convert base64 transaction to base58 for Jito
function base64ToBase58(base64Tx: string): string {
  const txBytes = Buffer.from(base64Tx, "base64");
  return bs58.encode(txBytes);
}

interface JitoBundleResult {
  success: boolean;
  bundleId?: string;
  error?: string;
}

/**
 * Send a transaction as a Jito bundle
 * Tries multiple Jito endpoints for redundancy
 */
async function sendJitoBundle(base58Tx: string): Promise<JitoBundleResult> {
  const errors: string[] = [];

  for (const endpoint of JITO_ENDPOINTS) {
    try {
      console.log(`Trying Jito endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [[base58Tx]], // Bundle is an array of transactions
        }),
      });

      const responseText = await response.text();
      console.log(`Jito response from ${endpoint}:`, responseText);

      if (!response.ok) {
        errors.push(`${endpoint}: HTTP ${response.status}`);
        continue;
      }

      const data = JSON.parse(responseText);

      if (data.error) {
        errors.push(`${endpoint}: ${data.error.message || JSON.stringify(data.error)}`);
        continue;
      }

      // Success - return bundle ID
      return {
        success: true,
        bundleId: data.result,
      };
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : "Unknown error"}`);
      continue;
    }
  }

  return {
    success: false,
    error: `All Jito endpoints failed: ${errors.join("; ")}`,
  };
}

/**
 * Poll for bundle status to confirm landing
 */
async function waitForBundleConfirmation(
  bundleId: string,
  signature: string,
  maxAttempts: number = 30
): Promise<{ confirmed: boolean; error?: string }> {
  const connection = new Connection(SOLANA_RPC, "confirmed");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Check if transaction landed on-chain
      const status = await connection.getSignatureStatus(signature);

      if (status.value !== null) {
        if (status.value.err) {
          return {
            confirmed: false,
            error: `Transaction failed: ${JSON.stringify(status.value.err)}`,
          };
        }
        if (status.value.confirmationStatus === "confirmed" || status.value.confirmationStatus === "finalized") {
          console.log(`Bundle ${bundleId} confirmed after ${attempt + 1} attempts`);
          return { confirmed: true };
        }
      }

      // Wait 500ms before next check
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      // Ignore errors and keep polling
      console.log(`Poll attempt ${attempt + 1} error:`, error);
    }
  }

  return {
    confirmed: false,
    error: "Bundle confirmation timeout - transaction may still land",
  };
}

export async function GET() {
  return NextResponse.json({ feePayer: KORA_FEE_PAYER });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transaction } = body;

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction is required" },
        { status: 400 }
      );
    }

    // Validate transaction before forwarding
    const validation = await validateTransaction(transaction);
    if (!validation.valid) {
      console.error("Transaction validation failed:", validation.error);
      return NextResponse.json(
        { error: `Transaction rejected: ${validation.error}` },
        { status: 400 }
      );
    }

    console.log("Transaction validated, requesting Kora signature:", KORA_ENDPOINT);

    // Request Kora to sign the transaction (sign only, we'll send via Jito)
    const koraResponse = await fetch(KORA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "signTransaction", // Sign only, don't send
        params: [transaction],
      }),
    });

    const koraResponseText = await koraResponse.text();
    console.log("Kora response status:", koraResponse.status);
    console.log("Kora response:", koraResponseText);

    if (!koraResponse.ok) {
      return NextResponse.json(
        { error: `Kora error (${koraResponse.status}): ${koraResponseText || "No response"}` },
        { status: koraResponse.status }
      );
    }

    // Parse JSON-RPC response
    const koraData = JSON.parse(koraResponseText);

    if (koraData.error) {
      return NextResponse.json(
        { error: `Kora error: ${koraData.error.message || JSON.stringify(koraData.error)}` },
        { status: 400 }
      );
    }

    // Get the signed transaction from Kora
    const signedTxBase64 = koraData.result?.signed_transaction || koraData.result;

    if (typeof signedTxBase64 !== "string") {
      throw new Error("Unexpected Kora response format - expected signed transaction");
    }

    // Extract signature for return value
    const signature = extractSignatureFromTransaction(signedTxBase64);

    // Convert to base58 for Jito
    const signedTxBase58 = base64ToBase58(signedTxBase64);

    // Send via Jito bundle
    console.log("Sending transaction via Jito bundle...");
    const jitoResult = await sendJitoBundle(signedTxBase58);

    if (!jitoResult.success) {
      console.error("Jito bundle failed:", jitoResult.error);
      return NextResponse.json(
        { error: `Jito bundle failed: ${jitoResult.error}` },
        { status: 500 }
      );
    }

    console.log("Jito bundle submitted:", jitoResult.bundleId);

    // Wait for bundle confirmation
    const confirmation = await waitForBundleConfirmation(jitoResult.bundleId!, signature);

    if (!confirmation.confirmed) {
      // Return signature anyway - bundle may still land
      console.warn("Bundle confirmation timeout:", confirmation.error);
      return NextResponse.json({
        signature,
        bundleId: jitoResult.bundleId,
        warning: confirmation.error,
      });
    }

    return NextResponse.json({
      signature,
      bundleId: jitoResult.bundleId,
    });
  } catch (error) {
    console.error("Sponsor error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
