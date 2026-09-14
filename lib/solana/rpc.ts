import { mainnetRpcEndpoints } from "./rpc-pool";

/** Browser / wallet-adapter: same-origin proxy. */
export function getClientRpcUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/rpc`;
  }
  return "/api/rpc";
}

/** Server-side primary RPC (sponsor/stats). Not aex402. */
export function getSolanaRpcUrl(): string {
  return mainnetRpcEndpoints()[0];
}
