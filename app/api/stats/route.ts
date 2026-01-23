import { NextRequest, NextResponse } from "next/server";
import { getGlobalStats, getWalletStats, initDatabase } from "@/lib/db/turso";

let dbInitialized = false;

export async function GET(request: NextRequest) {
  try {
    // Auto-initialize database on first request
    if (!dbInitialized) {
      try {
        await initDatabase();
        dbInitialized = true;
      } catch {
        // Database might not be configured, return defaults
        return NextResponse.json({
          uniqueWallets: 0,
          totalAccountsClosed: 0,
          totalRentRecovered: 0,
        });
      }
    }

    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get("wallet");

    if (wallet) {
      const stats = await getWalletStats(wallet);
      return NextResponse.json(stats);
    }

    const globalStats = await getGlobalStats();
    return NextResponse.json(globalStats);
  } catch (error) {
    console.error("Stats error:", error);
    // Return defaults on error instead of 500
    return NextResponse.json({
      uniqueWallets: 0,
      totalAccountsClosed: 0,
      totalRentRecovered: 0,
    });
  }
}
