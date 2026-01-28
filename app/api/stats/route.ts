import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getGlobalStats, getWalletStats, initDatabase } from "@/lib/db/turso";

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const FEE_RECIPIENT = "va1TBuMdfdgHUb3fYA79CfFQPFf3KQ3k86n5dp4hHRr";

let dbInitialized = false;

async function getFeeRecipientBalance(): Promise<number> {
  try {
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const balance = await connection.getBalance(new PublicKey(FEE_RECIPIENT));
    return balance / 1e9; // Convert lamports to SOL
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Auto-initialize database on first request
    if (!dbInitialized) {
      try {
        await initDatabase();
        dbInitialized = true;
      } catch {
        // Database might not be configured, return defaults with balance
        const feeBalance = await getFeeRecipientBalance();
        return NextResponse.json({
          uniqueWallets: 0,
          totalAccountsClosed: 0,
          totalRentRecovered: 0,
          feeBalance,
        });
      }
    }

    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get("wallet");

    if (wallet) {
      const stats = await getWalletStats(wallet);
      return NextResponse.json(stats);
    }

    const [globalStats, feeBalance] = await Promise.all([
      getGlobalStats(),
      getFeeRecipientBalance(),
    ]);

    return NextResponse.json({
      ...globalStats,
      feeBalance,
    });
  } catch (error) {
    console.error("Stats error:", error);
    // Return defaults on error instead of 500
    const feeBalance = await getFeeRecipientBalance();
    return NextResponse.json({
      uniqueWallets: 0,
      totalAccountsClosed: 0,
      totalRentRecovered: 0,
      feeBalance,
    });
  }
}
