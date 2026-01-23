"use client";

import { useState, useEffect, useMemo } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getTokenAccounts, TokenAccountInfo } from "@/lib/solana/getTokenAccounts";
import { buildCloseAccountsTransaction } from "@/lib/solana/closeAccounts";
import { FEE_PERCENT, MAX_ACCOUNTS_PER_TX } from "@/lib/solana/constants";

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com/";

export default function Home() {
  const connection = useMemo(() => new Connection(RPC_ENDPOINT, "confirmed"), []);
  const { publicKey, signTransaction, connected, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const connect = () => setVisible(true);

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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            💸 FreeRent
          </h1>
          <p className="text-neutral-500 text-sm sm:text-base">
            Reclaim SOL from unused token accounts
          </p>
        </div>

        {/* Main Card */}
        <div className="card p-5 sm:p-6">
          {!connected ? (
            <div className="text-center py-8 sm:py-12">
              <p className="text-neutral-400 mb-6 text-sm sm:text-base">
                Connect your wallet to see reclaimable rent
              </p>
              <button
                onClick={connect}
                disabled={connecting}
                className="btn-primary px-6 sm:px-8 py-3 text-sm sm:text-base"
              >
                {connecting ? "Connecting..." : "Connect Wallet"}
              </button>
            </div>
          ) : loading ? (
            <div className="text-center py-12 sm:py-16">
              <div className="text-3xl mb-3">🔍</div>
              <p className="text-neutral-500 text-sm">Scanning accounts...</p>
            </div>
          ) : (
            <>
              {/* Wallet */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-800">
                <code className="text-xs sm:text-sm text-neutral-400">
                  {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                </code>
                <button
                  onClick={disconnect}
                  className="text-xs text-neutral-500 hover:text-white"
                >
                  Disconnect
                </button>
              </div>

              {/* Toggle */}
              <div className="toggle-group mb-4">
                <button
                  onClick={() => setFilter("empty")}
                  className={`toggle-btn ${filter === "empty" ? "active" : ""}`}
                >
                  Claimable ({accounts.filter((a) => a.canClose).length})
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
                <div className="text-center py-10 sm:py-12">
                  <p className="text-neutral-500 text-sm">No accounts found</p>
                </div>
              ) : (
                <div className="account-list flex flex-col gap-2 max-h-[240px] sm:max-h-[300px] overflow-y-auto mb-4">
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
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <code className="flex-1 text-xs text-neutral-300 truncate">
                          {key.slice(0, 6)}...{key.slice(-4)}
                        </code>
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
                  className="text-xs text-neutral-500 hover:text-white mb-4"
                >
                  Select all (max {MAX_ACCOUNTS_PER_TX})
                </button>
              )}

              {/* Summary */}
              {selectedIds.size > 0 && (
                <div className="summary-card mb-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-neutral-300">
                        {selectedIds.size} account{selectedIds.size > 1 ? "s" : ""}
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {FEE_PERCENT}% fee: {fee.toFixed(4)} SOL
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-500">
                        +{netRent.toFixed(4)}
                      </div>
                      <div className="text-xs text-neutral-500">SOL</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleClose}
                disabled={selectedIds.size === 0 || closing}
                className="btn-primary w-full py-3 text-sm sm:text-base"
              >
                {closing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : selectedIds.size > 0 ? (
                  `Claim ${netRent.toFixed(4)} SOL`
                ) : (
                  "Select accounts"
                )}
              </button>
            </>
          )}
        </div>

        {/* Success */}
        {txResult && (
          <div className="success-card mt-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <div className="text-green-500 font-medium text-sm">
                  +{txResult.amount.toFixed(4)} SOL claimed
                </div>
                <a
                  href={`https://checkreceipt.xyz/${txResult.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fun-link text-xs"
                >
                  View transaction →
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-card mt-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-neutral-600 text-xs mt-6">
          Gas-free • {FEE_PERCENT}% service fee
        </p>
      </div>
    </div>
  );
}
