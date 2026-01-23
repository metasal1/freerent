import { NextRequest, NextResponse } from "next/server";
import bs58 from "bs58";

const KORA_ENDPOINT = process.env.KORA_ENDPOINT || "https://kora.up.railway.app";

// Kora fee payer address (from getConfig)
const KORA_FEE_PAYER = "va1TBuMdfdgHUb3fYA79CfFQPFf3KQ3k86n5dp4hHRr";

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

    console.log("Forwarding to Kora:", KORA_ENDPOINT);

    // Kora uses JSON-RPC format
    const response = await fetch(KORA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "signAndSendTransaction",
        params: [transaction],
      }),
    });

    const responseText = await response.text();
    console.log("Kora response status:", response.status);
    console.log("Kora response:", responseText);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Kora error (${response.status}): ${responseText || "No response"}` },
        { status: response.status }
      );
    }

    // Parse JSON-RPC response
    const data = JSON.parse(responseText);

    if (data.error) {
      return NextResponse.json(
        { error: `Kora error: ${data.error.message || JSON.stringify(data.error)}` },
        { status: 400 }
      );
    }

    // Extract signature from the signed transaction
    const signedTx = data.result?.signed_transaction || data.result;
    let signature: string;

    if (typeof signedTx === "string") {
      // Extract signature from the signed transaction bytes
      signature = extractSignatureFromTransaction(signedTx);
    } else if (typeof data.result === "string") {
      // If result is directly a signature string
      signature = data.result;
    } else {
      throw new Error("Unexpected Kora response format");
    }

    return NextResponse.json({ signature });
  } catch (error) {
    console.error("Sponsor error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
