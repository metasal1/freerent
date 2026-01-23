"use client";

import { TokenAccountInfo } from "@/lib/solana/getTokenAccounts";

interface AccountItemProps {
  account: TokenAccountInfo;
  selected: boolean;
  onSelect: (pubkey: string) => void;
}

export function AccountItem({ account, selected, onSelect }: AccountItemProps) {
  const rentSol = (account.rentLamports / 1e9).toFixed(6);
  const mintShort = `${account.mint.toBase58().slice(0, 4)}...${account.mint.toBase58().slice(-4)}`;
  const pubkeyShort = `${account.pubkey.toBase58().slice(0, 4)}...${account.pubkey.toBase58().slice(-4)}`;

  const formattedAmount = account.isEmpty
    ? "0"
    : (Number(account.amount) / Math.pow(10, account.decimals)).toLocaleString(undefined, {
        maximumFractionDigits: 4,
      });

  const isSelectable = account.canClose;

  return (
    <div
      onClick={() => isSelectable && onSelect(account.pubkey.toBase58())}
      className={`
        glass-sm p-3 sm:p-4
        flex items-center gap-3 sm:gap-4
        transition-all duration-200
        ${isSelectable ? "cursor-pointer hover:bg-white/10" : "opacity-60 cursor-not-allowed"}
        ${selected ? "ring-2 ring-purple-500/50 bg-purple-500/10" : ""}
      `}
    >
      {/* Checkbox */}
      <div
        className={`
          w-5 h-5 rounded-md border-2
          flex items-center justify-center
          transition-all duration-200
          ${selected ? "bg-purple-500 border-purple-500" : "border-white/30"}
          ${!isSelectable ? "invisible" : ""}
        `}
      >
        {selected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Account info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white/90 truncate">{pubkeyShort}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60">
            {account.programId.toBase58() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
              ? "SPL"
              : "Token-2022"}
          </span>
        </div>
        <div className="text-xs text-white/50">
          Mint: {mintShort}
          {!account.isEmpty && (
            <span className="ml-2 text-yellow-400/70">Balance: {formattedAmount}</span>
          )}
          {account.closeBlockedReason && (
            <span className="ml-2 text-red-400/70">{account.closeBlockedReason}</span>
          )}
        </div>
      </div>

      {/* Rent amount */}
      <div className="text-right">
        <div className="text-sm font-medium gradient-text">{rentSol} SOL</div>
        <div className="text-xs text-white/50">rent</div>
      </div>
    </div>
  );
}
