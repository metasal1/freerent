import { NextRequest, NextResponse } from "next/server";
import { logConnect, logClose, logBurn, initDatabase } from "@/lib/db/turso";

// Initialize database on first request
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initDatabase();
    initialized = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();

    const body = await request.json();
    const { type, wallet, txSignature, accountsCount, rentAmount, feePaid } = body;

    switch (type) {
      case "connect":
        if (!wallet) {
          return NextResponse.json({ error: "Wallet is required" }, { status: 400 });
        }
        await logConnect(wallet);
        break;

      case "close":
        if (!wallet || !txSignature || accountsCount === undefined || rentAmount === undefined) {
          return NextResponse.json(
            { error: "Missing required fields for close event" },
            { status: 400 }
          );
        }
        await logClose(wallet, txSignature, accountsCount, rentAmount, feePaid || 0);
        break;

      case "burn":
        if (!wallet || !txSignature || accountsCount === undefined || rentAmount === undefined) {
          return NextResponse.json(
            { error: "Missing required fields for burn event" },
            { status: 400 }
          );
        }
        await logBurn(wallet, txSignature, accountsCount, rentAmount, feePaid || 0);
        break;

      default:
        return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Event logging error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
