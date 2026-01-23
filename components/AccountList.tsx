"use client";

import { useState, useMemo } from "react";
import { TokenAccountInfo } from "@/lib/solana/getTokenAccounts";
import { AccountItem } from "./AccountItem";
import { Toggle } from "./ui/Toggle";
import { Button } from "./ui/Button";
import { GlassCard } from "./ui/GlassCard";
import { MAX_ACCOUNTS_PER_TX, FEE_PERCENT } from "@/lib/solana/constants";

interface AccountListProps {
  accounts: TokenAccountInfo[];
  loading: boolean;
  onClose: (accounts: TokenAccountInfo[]) => void;
  closing: boolean;
}

export function AccountList({ accounts, loading, onClose, closing }: AccountListProps) {
  const [filter, setFilter] = useState<"empty" | "non-empty">("empty");
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  const filteredAccounts = useMemo(() => {
    // "empty" filter shows all empty accounts (closeable and non-closeable)
    // "non-empty" filter shows accounts with balance
    return accounts.filter((acc) => (filter === "empty" ? acc.isEmpty : !acc.isEmpty));
  }, [accounts, filter]);

  const selectedAccountInfos = useMemo(() => {
    return filteredAccounts.filter((acc) => selectedAccounts.has(acc.pubkey.toBase58()));
  }, [filteredAccounts, selectedAccounts]);

  const totalRent = useMemo(() => {
    return selectedAccountInfos.reduce((sum, acc) => sum + acc.rentLamports, 0) / 1e9;
  }, [selectedAccountInfos]);

  const fee = totalRent * (FEE_PERCENT / 100);
  const netRent = totalRent - fee;

  const handleSelect = (pubkey: string) => {
    const account = filteredAccounts.find((a) => a.pubkey.toBase58() === pubkey);
    if (!account?.canClose) return;

    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) {
        next.delete(pubkey);
      } else if (next.size < MAX_ACCOUNTS_PER_TX) {
        next.add(pubkey);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const closeableAccounts = filteredAccounts.filter((a) => a.canClose);
    if (selectedAccounts.size === closeableAccounts.length) {
      setSelectedAccounts(new Set());
    } else {
      const accountPubkeys = closeableAccounts
        .slice(0, MAX_ACCOUNTS_PER_TX)
        .map((a) => a.pubkey.toBase58());
      setSelectedAccounts(new Set(accountPubkeys));
    }
  };

  const handleClose = () => {
    onClose(selectedAccountInfos);
  };

  if (loading) {
    return (
      <GlassCard className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white/60">Loading token accounts...</p>
      </GlassCard>
    );
  }

  if (accounts.length === 0) {
    return (
      <GlassCard className="text-center py-12">
        <div className="text-4xl mb-4">🎉</div>
        <p className="text-white/80 font-medium">No token accounts found</p>
        <p className="text-white/50 text-sm mt-1">Connect a wallet with token accounts to get started</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with toggle and select all */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Toggle
          options={[
            { value: "empty", label: `Closeable (${accounts.filter((a) => a.canClose).length})` },
            { value: "non-empty", label: `Has Balance (${accounts.filter((a) => !a.isEmpty).length})` },
          ]}
          value={filter}
          onChange={(v) => {
            setFilter(v as "empty" | "non-empty");
            setSelectedAccounts(new Set());
          }}
        />

        {filter === "empty" && filteredAccounts.filter((a) => a.canClose).length > 0 && (
          <Button variant="secondary" size="sm" onClick={handleSelectAll}>
            {selectedAccounts.size === filteredAccounts.filter((a) => a.canClose).length
              ? "Deselect All"
              : `Select All (max ${MAX_ACCOUNTS_PER_TX})`}
          </Button>
        )}
      </div>

      {/* Account list */}
      <GlassCard className="p-2 sm:p-3">
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {filteredAccounts.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              No {filter === "empty" ? "empty" : "non-empty"} accounts found
            </div>
          ) : (
            filteredAccounts.map((account) => (
              <AccountItem
                key={account.pubkey.toBase58()}
                account={account}
                selected={selectedAccounts.has(account.pubkey.toBase58())}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>
      </GlassCard>

      {/* Summary and action */}
      {selectedAccounts.size > 0 && (
        <GlassCard className="animate-slide-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm text-white/60 mb-1">
                {selectedAccounts.size} account{selectedAccounts.size > 1 ? "s" : ""} selected
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold gradient-text">{netRent.toFixed(6)} SOL</span>
                <span className="text-sm text-white/50">to recover</span>
              </div>
              <div className="text-xs text-white/40 mt-1">
                ({totalRent.toFixed(6)} SOL - {fee.toFixed(6)} SOL fee)
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={handleClose}
              loading={closing}
              className="w-full sm:w-auto"
            >
              Close & Reclaim
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
