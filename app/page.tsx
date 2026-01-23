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
  const [stats, setStats] = useState<{ uniqueWallets: number; totalAccountsClosed: number; feeBalance: number } | null>(null);

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
  const closeableCount = accounts.filter((a) => a.canClose).length;

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, [txResult]);

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

  const quickClose20 = async () => {
    if (!publicKey || !signTransaction) return;
    const closeable = accounts.filter((a) => a.canClose).slice(0, 20);
    if (closeable.length === 0) return;

    setClosing(true);
    setError(null);
    setTxResult(null);

    try {
      const feePayerRes = await fetch("/api/sponsor");
      const { feePayer } = await feePayerRes.json();
      const feePayerPubkey = new PublicKey(feePayer);

      const { transaction, estimatedRent, fee: txFee, netRent: txNetRent } = buildCloseAccountsTransaction(
        closeable, publicKey, feePayerPubkey
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
      setTxResult({ signature, count: closeable.length, amount: txNetRent });
      setSelectedIds(new Set());

      const newAccounts = await getTokenAccounts(connection, publicKey);
      setAccounts(newAccounts);

      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "close", wallet: publicKey.toBase58(), txSignature: signature,
          accountsCount: closeable.length, rentAmount: estimatedRent, feePaid: txFee,
        }),
      }).catch(() => {});
    } catch (e: any) {
      setError(e.message || "Something went wrong!");
    } finally {
      setClosing(false);
    }
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
    <div className="min-h-screen p-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <h1 className="text-4xl font-bold text-center mb-2">FreeRent</h1>
        <p className="text-gray-500 text-center mb-8">Reclaim SOL from unused token accounts</p>

        {/* Stats */}
        {stats && (
          <div className="flex justify-center gap-8 mb-8 text-center">
            <div>
              <div className="text-2xl font-bold">{stats.uniqueWallets}</div>
              <div className="text-sm text-gray-500">Users</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.totalAccountsClosed}</div>
              <div className="text-sm text-gray-500">Accounts Closed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-500">{stats.feeBalance.toFixed(2)}</div>
              <div className="text-sm text-gray-500">SOL Collected</div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="border border-gray-800 rounded-xl p-6">
          {!connected ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-6">Connect your wallet to see reclaimable rent</p>
              <button
                onClick={connect}
                disabled={connecting}
                className="bg-white text-black px-8 py-3 rounded-lg font-semibold hover:bg-gray-200 disabled:opacity-50"
              >
                {connecting ? "Connecting..." : "Connect Wallet"}
              </button>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Scanning accounts...</p>
            </div>
          ) : (
            <>
              {/* Wallet Info */}
              <div className="flex items-center justify-between mb-6">
                <code className="text-lg">
                  {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                </code>
                <button
                  onClick={disconnect}
                  className="text-gray-400 hover:text-white px-4 py-2 border border-gray-700 rounded-lg"
                >
                  Disconnect
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setFilter("empty")}
                  className={`flex-1 py-2 rounded-lg font-medium ${
                    filter === "empty" ? "bg-white text-black" : "bg-gray-900 text-gray-400"
                  }`}
                >
                  Claimable ({closeableCount})
                </button>
                <button
                  onClick={() => setFilter("all")}
                  className={`flex-1 py-2 rounded-lg font-medium ${
                    filter === "all" ? "bg-white text-black" : "bg-gray-900 text-gray-400"
                  }`}
                >
                  All ({accounts.length})
                </button>
              </div>

              {/* Account List */}
              {filteredAccounts.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No accounts found</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto mb-6">
                  {filteredAccounts.map((account) => {
                    const key = account.pubkey.toBase58();
                    const selected = selectedIds.has(key);
                    const rent = (account.rentLamports / 1e9).toFixed(4);

                    return (
                      <div
                        key={key}
                        onClick={() => account.canClose && toggleSelect(key)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
                          !account.canClose
                            ? "opacity-40 cursor-not-allowed bg-gray-900"
                            : selected
                            ? "bg-green-900/30 border border-green-500"
                            : "bg-gray-900 hover:bg-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {account.canClose && (
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                selected ? "bg-green-500 border-green-500" : "border-gray-600"
                              }`}
                            >
                              {selected && (
                                <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          )}
                          <code className="text-sm text-gray-300">
                            {key.slice(0, 6)}...{key.slice(-4)}
                          </code>
                        </div>
                        <span className="text-green-500 font-mono font-semibold">{rent}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Quick Actions */}
              {closeableCount > 0 && (
                <div className="flex items-center justify-between mb-6">
                  <button onClick={selectAll} className="text-gray-400 hover:text-white text-sm">
                    Select all (max {MAX_ACCOUNTS_PER_TX})
                  </button>
                  <button
                    onClick={quickClose20}
                    disabled={closing || closeableCount === 0}
                    className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg font-semibold"
                  >
                    Quick Close {Math.min(20, closeableCount)}
                  </button>
                </div>
              )}

              {/* Summary */}
              {selectedIds.size > 0 && (
                <div className="bg-gray-900 rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{selectedIds.size} account{selectedIds.size > 1 ? "s" : ""}</div>
                      <div className="text-sm text-gray-500">{FEE_PERCENT}% fee: {fee.toFixed(4)} SOL</div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-green-500">+{netRent.toFixed(4)}</div>
                      <div className="text-sm text-gray-500">SOL</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Claim Button */}
              <button
                onClick={handleClose}
                disabled={selectedIds.size === 0 || closing}
                className="w-full bg-white text-black py-4 rounded-lg font-bold text-lg hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-500"
              >
                {closing ? "Processing..." : selectedIds.size > 0 ? `Claim ${netRent.toFixed(4)} SOL` : "Select accounts"}
              </button>
            </>
          )}
        </div>

        {/* Success */}
        {txResult && (
          <div className="mt-4 p-4 bg-green-900/30 border border-green-500 rounded-lg">
            <div className="text-green-500 font-semibold">+{txResult.amount.toFixed(4)} SOL claimed</div>
            <a
              href={`https://solscan.io/tx/${txResult.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 text-sm hover:underline"
            >
              View transaction
            </a>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 bg-red-900/30 border border-red-500 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-gray-600 text-sm">
          <p>Gas-free transactions • {FEE_PERCENT}% service fee</p>
          <a href="https://metasal.xyz" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            metasal.xyz
          </a>
        </div>
      </div>
    </div>
  );
}
