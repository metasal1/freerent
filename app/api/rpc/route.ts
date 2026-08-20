import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function upstreamRpc(): string {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://rpc.aex402.com/"
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, solana-client",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Same-origin JSON-RPC proxy — avoids browser 403/CORS on public RPCs. */
export async function POST(request: NextRequest) {
  const upstream = upstreamRpc();
  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!body || body.length > 2_000_000) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Invalid request" }, id: null },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        ...corsHeaders,
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: e instanceof Error ? e.message : "Upstream RPC failed",
        },
        id: null,
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
