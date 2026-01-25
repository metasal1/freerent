"use client";

import { useState, useEffect, useMemo } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { track } from "@vercel/analytics";
import { Tweet } from "react-tweet";
import { getTokenAccounts, TokenAccountInfo } from "@/lib/solana/getTokenAccounts";
import { buildCloseAccountsTransaction } from "@/lib/solana/closeAccounts";
import { buildBurnAccountsTransaction } from "@/lib/solana/burnTokens";
import { FEE_PERCENT, MAX_ACCOUNTS_PER_TX, MAX_ACCOUNTS_PER_BURN_TX, DUST_THRESHOLD_USD } from "@/lib/solana/constants";
import { getTokenMetadata, TokenMetadata, calculateTokenValue } from "@/lib/jupiter/getTokenMetadata";

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
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [minRent, setMinRent] = useState<number | null>(null);

  // Burn mode state
  const [mode, setMode] = useState<"close" | "burn">("close");
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, TokenMetadata>>(new Map());
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [burning, setBurning] = useState(false);

  // Fetch SOL price
  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
      .then((res) => res.json())
      .then((data) => setSolPrice(data.solana?.usd || null))
      .catch(() => {});
  }, []);

  // Fetch minimum rent for token account
  useEffect(() => {
    connection.getMinimumBalanceForRentExemption(165) // Token account size
      .then((lamports) => setMinRent(lamports / 1e9))
      .catch(() => {});
  }, [connection]);

  // Fetch token metadata when accounts change
  useEffect(() => {
    if (accounts.length === 0) {
      setTokenMetadata(new Map());
      return;
    }

    // Get unique mints for non-empty accounts
    const mints = [...new Set(accounts.filter(a => !a.isEmpty).map(a => a.mint.toBase58()))];
    if (mints.length === 0) return;

    setLoadingMetadata(true);
    getTokenMetadata(mints)
      .then(setTokenMetadata)
      .catch(() => setTokenMetadata(new Map()))
      .finally(() => setLoadingMetadata(false));
  }, [accounts]);

  // Filter burnable accounts (has balance, can burn, value < threshold, exclude NFTs and LP tokens)
  const burnableAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (!a.canBurn) return false;

      // Exclude NFTs (typically 0 decimals)
      if (a.decimals === 0) return false;

      const meta = tokenMetadata.get(a.mint.toBase58());

      // Exclude Meteora LP tokens and other LP tokens
      if (meta) {
        const nameLower = (meta.name || "").toLowerCase();
        const symbolLower = (meta.symbol || "").toLowerCase();
        if (
          nameLower.includes("meteora") ||
          nameLower.includes(" lp") ||
          nameLower.endsWith(" lp") ||
          symbolLower.includes("lp") ||
          symbolLower.includes("meteora")
        ) {
          return false;
        }
      }

      const usdValue = meta ? calculateTokenValue(a.amount, a.decimals, meta.usdPrice) : null;
      // Include if no price data (unknown value) or value is below threshold
      return usdValue === null || usdValue < DUST_THRESHOLD_USD;
    });
  }, [accounts, tokenMetadata]);

  const filteredAccounts = useMemo(() => {
    if (mode === "burn") return burnableAccounts;
    if (filter === "empty") return accounts.filter((a) => a.canClose);
    return accounts;
  }, [accounts, filter, mode, burnableAccounts]);

  const selectedAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => selectedIds.has(a.pubkey.toBase58()));
  }, [filteredAccounts, selectedIds]);

  const totalRent = useMemo(() => {
    return selectedAccounts.reduce((sum, a) => sum + a.rentLamports, 0) / 1e9;
  }, [selectedAccounts]);

  const fee = totalRent * (FEE_PERCENT / 100);
  const netRent = totalRent - fee;
  const closeableCount = accounts.filter((a) => a.canClose).length;

  const refreshStats = () => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  };

  useEffect(() => {
    refreshStats();
  }, []);

  useEffect(() => {
    if (!publicKey || !connected) {
      setAccounts([]);
      return;
    }
    setLoading(true);
    setError(null);
    getTokenAccounts(connection, publicKey)
      .then((accts) => {
        setAccounts(accts);
        const closeable = accts.filter((a) => a.canClose).length;
        track("wallet_connected", {
          total_accounts: accts.length,
          closeable_accounts: closeable,
        });
      })
      .catch((e) => {
        setError(e.message);
        track("scan_error", { error: e.message });
      })
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

      track("quick_close_success", {
        accounts_closed: closeable.length,
        sol_claimed: txNetRent,
        fee_paid: txFee,
      });

      const newAccounts = await getTokenAccounts(connection, publicKey);
      setAccounts(newAccounts);

      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "close", wallet: publicKey.toBase58(), txSignature: signature,
          accountsCount: closeable.length, rentAmount: estimatedRent, feePaid: txFee,
        }),
      }).catch(() => {});
      refreshStats();
    } catch (e: any) {
      setError(e.message || "Something went wrong!");
      track("quick_close_error", { error: e.message || "Unknown error" });
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

      track("accounts_closed", {
        accounts_closed: selectedAccounts.length,
        sol_claimed: txNetRent,
        fee_paid: txFee,
      });

      const newAccounts = await getTokenAccounts(connection, publicKey);
      setAccounts(newAccounts);

      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "close", wallet: publicKey.toBase58(), txSignature: signature,
          accountsCount: selectedAccounts.length, rentAmount: estimatedRent, feePaid: txFee,
        }),
      }).catch(() => {});
      refreshStats();
    } catch (e: any) {
      setError(e.message || "Something went wrong!");
      track("close_error", { error: e.message || "Unknown error" });
    } finally {
      setClosing(false);
    }
  };

  const handleBurn = async () => {
    if (!publicKey || !signTransaction || selectedAccounts.length === 0) return;
    setBurning(true);
    setError(null);
    setTxResult(null);

    try {
      const feePayerRes = await fetch("/api/sponsor");
      const { feePayer } = await feePayerRes.json();
      const feePayerPubkey = new PublicKey(feePayer);

      const { transaction, estimatedRent, fee: txFee, netRent: txNetRent, tokensDestroyed } = buildBurnAccountsTransaction(
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

      track("tokens_burned", {
        accounts_burned: selectedAccounts.length,
        tokens_destroyed: tokensDestroyed.length,
        sol_claimed: txNetRent,
        fee_paid: txFee,
      });

      const newAccounts = await getTokenAccounts(connection, publicKey);
      setAccounts(newAccounts);

      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "burn", wallet: publicKey.toBase58(), txSignature: signature,
          accountsCount: selectedAccounts.length, rentAmount: estimatedRent, feePaid: txFee,
        }),
      }).catch(() => {});
      refreshStats();
    } catch (e: any) {
      setError(e.message || "Something went wrong!");
      track("burn_error", { error: e.message || "Unknown error" });
    } finally {
      setBurning(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Toast Notifications */}
      {txResult && (
        <div className="fixed top-4 left-4 right-4 z-50 flex justify-center">
          <div className="bg-cyan-500/20 border border-cyan-500 text-cyan-400 px-4 py-3 rounded-xl shadow-lg max-w-md w-full backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-lg">+{txResult.amount.toFixed(4)} SOL claimed!</span>
              <button onClick={() => setTxResult(null)} className="text-cyan-300 hover:text-white">
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`https://checkreceipt.xyz/${txResult.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-300 text-xs hover:text-white"
              >
                Check Receipt
              </a>
              <span className="text-gray-600">•</span>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just freed my rent and got back ${txResult.amount.toFixed(4)} SOL! 💸\n\nFree your rent: freerent.money`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs bg-black text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Share
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent('https://freerent.money')}&text=${encodeURIComponent(`Just freed my rent and got back ${txResult.amount.toFixed(4)} SOL! 💸`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs bg-[#0088cc] text-white px-2 py-1 rounded hover:bg-[#0077b5] transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Share
              </a>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 flex justify-center">
          <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg shadow-lg max-w-md w-full backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm">{error}</span>
              <button onClick={() => setError(null)} className="text-red-300 hover:text-white">
                ✕
              </button>
            </div>
            <button
              onClick={async (e) => {
                const btn = e.currentTarget;
                const original = btn.textContent;
                try {
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(error);
                  } else {
                    // Fallback for iOS webviews
                    const textArea = document.createElement('textarea');
                    textArea.value = error;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                  }
                  btn.textContent = "Copied!";
                } catch {
                  btn.textContent = "Failed";
                }
                setTimeout(() => { btn.textContent = original; }, 1500);
              }}
              className="text-xs text-red-300/70 hover:text-red-300 mt-2"
            >
              Click to copy error
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-5xl sm:text-6xl font-bold glow-text mb-2 font-display">Free Rent</h1>
            <p className="text-gray-400 text-sm sm:text-base mb-1">Get your money back</p>
            <p className="text-cyan-500 text-xs sm:text-sm font-medium">freerent.money</p>
          </div>

          {/* Info Section - only show when not connected */}
          {!connected && (
            <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-4 mb-6 text-sm">
              <p className="text-cyan-400 font-medium mb-3">What is Free Rent?</p>
              <ul className="text-gray-400 space-y-2 mb-4">
                <li>• Every Solana token account (USDC, memecoins, etc.) requires a <span className="text-white">rent deposit</span> of ~{minRent?.toFixed(6) || "0.002039"} SOL{solPrice && minRent && <span className="text-cyan-400"> (~${(minRent * solPrice).toFixed(2)})</span>}</li>
                <li>• Over time, you accumulate <span className="text-white">empty accounts</span> from tokens you've sold or transferred</li>
                <li>• These empty accounts still <span className="text-white">hold your SOL hostage</span></li>
              </ul>
              <p className="text-cyan-400 font-medium mb-2">Free Rent solves this:</p>
              <ul className="text-gray-400 space-y-1">
                <li>• Closes empty accounts and <span className="text-white">returns your SOL</span></li>
                <li>• <span className="text-white">Gas-free</span> — no transaction fees</li>
                <li>• <span className="text-white">One click</span> — close up to 20 accounts at once</li>
              </ul>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="flex justify-center gap-6 sm:gap-10 mb-8">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">{stats.uniqueWallets}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Users</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">{stats.totalAccountsClosed}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Closed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-cyan-400">{stats.feeBalance.toFixed(2)}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">SOL</div>
              </div>
            </div>
          )}

          {/* Main Card */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
            {!connected ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-4 animate-pulse">💸</div>
                <p className="text-gray-400 mb-6 text-sm">Connect your wallet to see reclaimable rent</p>
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  {connecting ? "Connecting..." : "Select Wallet"}
                </button>
              </div>
            ) : loading ? (
              <div className="text-center py-16">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-500 text-sm">Scanning accounts...</p>
              </div>
            ) : (
              <>
                {/* Wallet Info */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-800">
                  <code className="text-cyan-400 text-sm sm:text-base">
                    {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                  </code>
                  <button
                    onClick={disconnect}
                    className="text-gray-500 hover:text-white text-sm transition-colors"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => { setMode("close"); setSelectedIds(new Set()); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      mode === "close"
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                        : "bg-gray-800/50 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Close Empty
                  </button>
                  <button
                    onClick={() => { setMode("burn"); setSelectedIds(new Set()); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      mode === "burn"
                        ? "bg-orange-500/20 text-orange-400 border border-orange-500/50"
                        : "bg-gray-800/50 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Burn Dust
                  </button>
                </div>

                {/* Quick Close (only in close mode) */}
                {mode === "close" && closeableCount > 0 && (
                  <button
                    onClick={quickClose20}
                    disabled={closing || closeableCount === 0}
                    className="w-full bg-cyan-500 text-black py-4 rounded-xl font-bold mb-4 hover:bg-cyan-400 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {closing ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                        Processing...
                      </span>
                    ) : (
                      `Quick Close ${Math.min(20, closeableCount)} Accounts`
                    )}
                  </button>
                )}

                {/* Filter Tabs (only in close mode) */}
                {mode === "close" && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setFilter("empty")}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        filter === "empty"
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                          : "bg-gray-800/50 text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      Claimable ({closeableCount})
                    </button>
                    <button
                      onClick={() => setFilter("all")}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        filter === "all"
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                          : "bg-gray-800/50 text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      All ({accounts.length})
                    </button>
                  </div>
                )}

                {/* Burn Mode Header */}
                {mode === "burn" && (
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-4">
                    <p className="text-orange-400 text-xs">
                      Showing tokens worth less than ${DUST_THRESHOLD_USD.toFixed(2)} USD. Burning destroys tokens permanently and reclaims the rent.
                    </p>
                  </div>
                )}

                {/* Account List */}
                {loadingMetadata && mode === "burn" ? (
                  <div className="text-center py-8">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-gray-500 text-xs">Loading token info...</p>
                  </div>
                ) : filteredAccounts.length === 0 ? (
                  <p className="text-center text-gray-600 py-8 text-sm">
                    {mode === "burn" ? "No dust tokens found" : "No accounts found"}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto mb-4 pr-1">
                    {filteredAccounts.map((account) => {
                      const key = account.pubkey.toBase58();
                      const mintKey = account.mint.toBase58();
                      const selected = selectedIds.has(key);
                      const rent = (account.rentLamports / 1e9).toFixed(4);
                      const meta = tokenMetadata.get(mintKey);
                      const tokenAmount = Number(account.amount) / Math.pow(10, account.decimals);
                      const usdValue = meta ? calculateTokenValue(account.amount, account.decimals, meta.usdPrice) : null;
                      const canSelect = mode === "burn" ? account.canBurn : account.canClose;
                      const maxAccounts = mode === "burn" ? MAX_ACCOUNTS_PER_BURN_TX : MAX_ACCOUNTS_PER_TX;
                      const blockReason = mode === "burn" ? account.burnBlockedReason : account.closeBlockedReason;

                      return (
                        <div
                          key={key}
                          onClick={() => canSelect && selectedIds.size < maxAccounts && toggleSelect(key)}
                          className={`p-3 rounded-xl cursor-pointer transition-all relative ${
                            !canSelect
                              ? "opacity-50 cursor-not-allowed bg-gray-800/30"
                              : selected
                              ? mode === "burn"
                                ? "bg-orange-500/10 border border-orange-500/50"
                                : "bg-cyan-500/10 border border-cyan-500/50"
                              : "bg-gray-800/30 hover:bg-gray-800/50"
                          }`}
                        >
                          {/* Show reason why account is blocked */}
                          {!canSelect && blockReason && (
                            <div className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">
                              {blockReason}
                            </div>
                          )}
                          {mode === "burn" ? (
                            // Burn mode: show token info
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-4 h-4 mt-0.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                  selected ? "bg-orange-500 border-orange-500" : "border-gray-600"
                                }`}
                              >
                                {selected && (
                                  <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              {meta?.icon && (
                                <img src={meta.icon} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-white text-sm font-medium truncate">
                                    {meta?.symbol || mintKey.slice(0, 4) + "..."}
                                  </span>
                                  {meta?.isVerified && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">verified</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-500 truncate">{meta?.name || "Unknown token"}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(key);
                                    }}
                                    className="p-0.5 text-gray-500 hover:text-cyan-400 transition-colors"
                                    title="Copy account address"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs">
                                  <span className="text-orange-400">{tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                  {usdValue !== null && <span className="text-gray-500">(${usdValue.toFixed(4)})</span>}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-cyan-400 text-sm font-semibold">{rent}</div>
                                <div className="text-[10px] text-gray-500">SOL rent</div>
                              </div>
                            </div>
                          ) : (
                            // Close mode: simple display
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {account.canClose && (
                                  <div
                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                      selected ? "bg-cyan-500 border-cyan-500" : "border-gray-600"
                                    }`}
                                  >
                                    {selected && (
                                      <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                )}
                                <code className="text-xs text-gray-400">
                                  {key.slice(0, 6)}...{key.slice(-4)}
                                </code>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(key);
                                  }}
                                  className="ml-1 p-1 text-gray-500 hover:text-cyan-400 transition-colors"
                                  title="Copy address"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              </div>
                              <span className="text-cyan-400 text-sm font-semibold">{rent}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Select All */}
                {mode === "close" && closeableCount > 0 && (
                  <button onClick={selectAll} className="text-gray-500 hover:text-cyan-400 text-xs mb-4 transition-colors">
                    Select all (max {MAX_ACCOUNTS_PER_TX})
                  </button>
                )}
                {mode === "burn" && burnableAccounts.length > 0 && (
                  <button
                    onClick={() => {
                      const toSelect = burnableAccounts.slice(0, MAX_ACCOUNTS_PER_BURN_TX);
                      setSelectedIds(new Set(toSelect.map((a) => a.pubkey.toBase58())));
                    }}
                    className="text-gray-500 hover:text-orange-400 text-xs mb-4 transition-colors"
                  >
                    Select all (max {MAX_ACCOUNTS_PER_BURN_TX})
                  </button>
                )}

                {/* Summary */}
                {selectedIds.size > 0 && (
                  <div className={`rounded-xl p-4 mb-4 ${mode === "burn" ? "bg-orange-500/10" : "bg-gray-800/50"}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm text-gray-300">
                          {selectedIds.size} account{selectedIds.size > 1 ? "s" : ""}
                          {mode === "burn" && " to burn"}
                        </div>
                        <div className="text-xs text-gray-500">Fee (tx cost + {FEE_PERCENT}%): {fee.toFixed(4)} SOL</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${mode === "burn" ? "text-orange-400" : "text-cyan-400"}`}>
                          +{netRent.toFixed(4)}
                        </div>
                        <div className="text-xs text-gray-500">
                          SOL {solPrice && <span className={mode === "burn" ? "text-orange-400/70" : "text-cyan-400/70"}>
                            (~${(netRent * solPrice).toFixed(2)})
                          </span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Button */}
                {mode === "burn" ? (
                  <button
                    onClick={handleBurn}
                    disabled={selectedIds.size === 0 || burning}
                    className="w-full bg-orange-500 text-black py-4 rounded-xl font-bold hover:bg-orange-400 disabled:bg-gray-800/50 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                  >
                    {burning ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                        Burning...
                      </span>
                    ) : selectedIds.size > 0 ? (
                      `Burn & Claim ${netRent.toFixed(4)} SOL`
                    ) : (
                      "Select tokens to burn"
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleClose}
                    disabled={selectedIds.size === 0 || closing}
                    className="w-full bg-gray-800 text-white py-4 rounded-xl font-bold hover:bg-gray-700 disabled:bg-gray-800/50 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                  >
                    {closing ? "Processing..." : selectedIds.size > 0 ? `Claim ${netRent.toFixed(4)} SOL` : "Select accounts"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-6 text-center">
        {!connected && (
          <div className="max-w-lg mx-auto mb-6 px-4" data-theme="dark">
            <Tweet id="2015243704777490639" />
          </div>
        )}
        <p className="text-gray-600 text-xs mb-1">Gas-free • tx cost + {FEE_PERCENT}% fee</p>
        <p className="text-gray-600 text-xs mb-2">
          Beta: Some accounts cannot be closed. <a href="https://t.me/metasal" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:text-cyan-400">Report issues</a>
        </p>
        <a href="https://metasal.xyz" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-cyan-400 text-xs transition-colors">
          metasal.xyz
        </a>
        <p className="text-gray-700 text-[10px] mt-2">
          build: {process.env.NEXT_PUBLIC_BUILD_ID} ({process.env.NEXT_PUBLIC_BUILD_TIME})
        </p>
      </footer>
    </div>
  );
}
