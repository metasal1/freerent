"use client";

import { GlassCard } from "./ui/GlassCard";

export function BurnDustBanner() {
  return (
    <GlassCard className="relative overflow-hidden">
      {/* Coming soon badge */}
      <div className="absolute top-3 right-3">
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          Coming Soon
        </span>
      </div>

      <div className="flex items-start gap-4">
        <div className="text-3xl">🔥</div>
        <div>
          <h3 className="font-semibold text-white/90 mb-1">Burn Dust</h3>
          <p className="text-sm text-white/60">
            Have accounts with tiny token balances? Soon you&apos;ll be able to burn the dust and reclaim that rent too.
          </p>
        </div>
      </div>

      {/* Shimmer effect overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
    </GlassCard>
  );
}
