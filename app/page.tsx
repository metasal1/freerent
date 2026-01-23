"use client";

import { useState, useEffect, useMemo } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { usePhantom } from "@/components/WalletButton";
import { getTokenAccounts, TokenAccountInfo } from "@/lib/solana/getTokenAccounts";
import { buildCloseAccountsTransaction } from "@/lib/solana/closeAccounts";
import { FEE_PERCENT, MAX_ACCOUNTS_PER_TX } from "@/lib/solana/constants";

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";

export default function Home() {
  const connection = useMemo(() => new Connection(RPC_ENDPOINT, "confirmed"), []);
  const { publicKey, signTransaction, connected, connect, disconnect, connecting } = usePhantom();

  const [accounts, setAccounts] = useState<TokenAccountInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [filter, setFilter] = useState<"empty" | "all">("empty");
  const [txResult, setTxResult] = useState<{ signature: string; count: number; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredAccounts = useMemo(() => {
    if (filter === "empty") return accounts.filter((a) => a.canClose);
    return accounts;
  }, [accounts, filter]);

  const selectedAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => selectedIds.has(a.pubkey.toBase58()));
  }, [filteredAccounts, selectedIds]);

  const totalRent = useMemo(() => {
    return selectedAccounts.reduce((sum, a) => sum + a.rentLamports, 0) / 1e9;
  }, [selectedAccounts]);

  const fee = totalRent * (FEE_PERCENT / 100);
  const netRent = totalRent - fee;

  useEffect(() => {
    if (!publicKey || !connected) {
      setAccounts([]);
      return;
    }
    setLoading(true);
    setError(null);
    getTokenAccounts(connection, publicKey)
      .then(setAccounts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [publicKey, connected, connection]);

  const toggleSelect = (pubkey: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else if (next.size < MAX_ACCOUNTS_PER_TX) next.add(pubkey);
      return next;
    });
  };

  const selectAll = () => {
    const closeable = filteredAccounts.filter((a) => a.canClose).slice(0, MAX_ACCOUNTS_PER_TX);
    setSelectedIds(new Set(closeable.map((a) => a.pubkey.toBase58())));
  };

  const handleClose = async () => {
    if (!publicKey || !signTransaction || selectedAccounts.length === 0) return;
    setClosing(true);
    setError(null);
    setTxResult(null);

    try {
      const feePayerRes = await fetch("/api/sponsor");
      const { feePayer } = await feePayerRes.json();
      const feePayerPubkey = new PublicKey(feePayer);

      const { transaction, estimatedRent, fee: txFee, netRent: txNetRent } = buildCloseAccountsTransaction(
        selectedAccounts, publicKey, feePayerPubkey
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      const signedTx = await signTransaction(transaction);
      const serialized = Buffer.from(signedTx.serialize({ requireAllSignatures: false })).toString("base64");

      const sponsorRes = await fetch("/api/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: serialized }),
      });

      if (!sponsorRes.ok) {
        const err = await sponsorRes.json();
        throw new Error(err.error || "Transaction failed");
      }

      const { signature } = await sponsorRes.json();
      setTxResult({ signature, count: selectedAccounts.length, amount: txNetRent });
      setSelectedIds(new Set());

      const newAccounts = await getTokenAccounts(connection, publicKey);
      setAccounts(newAccounts);

      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "close", wallet: publicKey.toBase58(), txSignature: signature,
          accountsCount: selectedAccounts.length, rentAmount: estimatedRent, feePaid: txFee,
        }),
      }).catch(() => {});
    } catch (e: any) {
      setError(e.message || "Something went wrong!");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 400, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "white", margin: 0 }}>
            FreeRent 💸
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", marginTop: 8, fontSize: 14 }}>
            Get your money back!
          </p>
        </div>

        {/* Main Card */}
        <div className="card" style={{ padding: 24 }}>
          {!connected ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                Ready to claim free money?
              </h2>
              <p className="text-muted" style={{ fontSize: 14, marginBottom: 24 }}>
                Connect your wallet to find reclaimable rent
              </p>
              <button
                onClick={connect}
                disabled={connecting}
                className="btn-primary"
                style={{ padding: "14px 32px", fontSize: 16 }}
              >
                {connecting ? "Connecting..." : "Let's Go! 🚀"}
              </button>
            </div>
          ) : loading ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
              <p className="text-muted">Finding your hidden treasure...</p>
            </div>
          ) : (
            <>
              {/* Wallet Header */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingBottom: 16,
                marginBottom: 16,
                borderBottom: "1px solid #e5e7eb"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>👛</span>
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: "#6b7280" }}>
                    {publicKey?.toBase58().slice(0, 6)}...{publicKey?.toBase58().slice(-4)}
                  </span>
                </div>
                <button
                  onClick={disconnect}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#6b7280",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer"
                  }}
                >
                  Disconnect
                </button>
              </div>

              {/* Toggle */}
              <div className="toggle-group" style={{ marginBottom: 16 }}>
                <button
                  onClick={() => setFilter("empty")}
                  className={`toggle-btn ${filter === "empty" ? "active" : ""}`}
                >
                  Ready ({accounts.filter((a) => a.canClose).length})
                </button>
                <button
                  onClick={() => setFilter("all")}
                  className={`toggle-btn ${filter === "all" ? "active" : ""}`}
                >
                  All ({accounts.length})
                </button>
              </div>

              {/* Account List */}
              {filteredAccounts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🎊</div>
                  <p className="text-muted">No accounts to show!</p>
                </div>
              ) : (
                <div
                  className="account-list"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: 280,
                    overflowY: "auto",
                    marginBottom: 16
                  }}
                >
                  {filteredAccounts.map((account) => {
                    const key = account.pubkey.toBase58();
                    const selected = selectedIds.has(key);
                    const rent = (account.rentLamports / 1e9).toFixed(4);

                    return (
                      <div
                        key={key}
                        onClick={() => account.canClose && toggleSelect(key)}
                        className={`account-item ${!account.canClose ? "disabled" : ""} ${selected ? "selected" : ""}`}
                      >
                        <div
                          className={`checkbox ${selected ? "checked" : ""}`}
                          style={{ visibility: account.canClose ? "visible" : "hidden" }}
                        >
                          {selected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {key.slice(0, 8)}...{key.slice(-4)}
                          </div>
                          {account.closeBlockedReason && (
                            <div style={{ fontSize: 11, color: "#f97316", marginTop: 2 }}>
                              {account.closeBlockedReason}
                            </div>
                          )}
                        </div>
                        <div className="amount-badge">{rent}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Select All */}
              {filteredAccounts.filter((a) => a.canClose).length > 1 && (
                <button
                  onClick={selectAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#ec4899",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    marginBottom: 16,
                    padding: 0
                  }}
                >
                  ✨ Select all (max {MAX_ACCOUNTS_PER_TX})
                </button>
              )}

              {/* Summary */}
              {selectedIds.size > 0 && (
                <div className="summary-card" style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
                        {selectedIds.size} selected
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        {fee.toFixed(4)} fee ({FEE_PERCENT}%)
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="gradient-text" style={{ fontSize: 24, fontWeight: 900 }}>
                        +{netRent.toFixed(4)}
                      </div>
                      <div style={{ fontSize: 12, color: "#374151" }}>SOL</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleClose}
                disabled={selectedIds.size === 0 || closing}
                className="btn-primary"
                style={{ width: "100%", padding: "14px 0", fontSize: 16 }}
              >
                {closing ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span
                      className="animate-spin"
                      style={{
                        width: 16,
                        height: 16,
                        border: "2px solid white",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        display: "inline-block"
                      }}
                    />
                    Working...
                  </span>
                ) : selectedIds.size > 0 ? (
                  `Claim ${selectedIds.size} account${selectedIds.size > 1 ? "s" : ""} 🎁`
                ) : (
                  "Select accounts to claim"
                )}
              </button>
            </>
          )}
        </div>

        {/* Success Message */}
        {txResult && (
          <div className="success-card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 32 }}>🎉</div>
              <div>
                <div style={{ fontWeight: 700, color: "#065f46" }}>Woohoo!</div>
                <div style={{ fontSize: 13, color: "#047857" }}>
                  +{txResult.amount.toFixed(4)} SOL from {txResult.count} account{txResult.count > 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <a
              href={`https://checkreceipt.xyz/${txResult.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="fun-link"
              style={{ display: "block", marginTop: 12, textAlign: "center", fontSize: 14 }}
            >
              View receipt →
            </a>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 24 }}>😅</div>
              <div style={{ color: "#92400e", fontWeight: 500, fontSize: 14 }}>{error}</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 24 }}>
          Free gas • {FEE_PERCENT}% service fee
        </div>
      </div>
    </div>
  );
}
