import { Transaction, VersionedTransaction } from "@solana/web3.js";

const KORA_ENDPOINT = process.env.KORA_ENDPOINT || "https://kora.up.railway.app";

export interface SponsorResponse {
  success: boolean;
  signature?: string;
  error?: string;
}

export async function sponsorTransaction(
  transaction: Transaction | VersionedTransaction,
  serializedTx?: string
): Promise<SponsorResponse> {
  try {
    const txBase64 = serializedTx || Buffer.from(
      transaction.serialize({ requireAllSignatures: false })
    ).toString("base64");

    const response = await fetch(`${KORA_ENDPOINT}/api/sponsor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: txBase64,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Sponsor failed: ${error}` };
    }

    const data = await response.json();
    return { success: true, signature: data.signature };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function checkSponsorHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${KORA_ENDPOINT}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
