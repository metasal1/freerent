import { NextRequest, NextResponse } from "next/server";
import { isRpcRateLimited, mainnetRpcEndpoints } from "@/lib/solana/rpc-pool";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, solana-client",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Same-origin JSON-RPC proxy with Helius-first failover (skip aex402 402). */
export async function POST(request: NextRequest) {
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

  const endpoints = mainnetRpcEndpoints();
  let lastText = "";
  let lastStatus = 502;

  for (const upstream of endpoints) {
    try {
      const res = await fetch(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
      });
      const text = await res.text();
      lastText = text;
      lastStatus = res.status;
      if (isRpcRateLimited(res.status, text)) continue;
      if (res.ok || res.status < 500) {
        return new NextResponse(text, {
          status: res.status,
          headers: {
            ...corsHeaders,
            "Content-Type": res.headers.get("Content-Type") || "application/json",
            "Cache-Control": "no-store",
          },
        });
      }
    } catch {
      continue;
    }
  }

  return new NextResponse(
    lastText ||
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "All RPC upstreams failed" },
        id: null,
      }),
    {
      status: lastStatus || 502,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    }
  );
}
