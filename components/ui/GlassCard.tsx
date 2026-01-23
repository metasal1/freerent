"use client";

import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "sm";
}

export function GlassCard({ children, className = "", variant = "default" }: GlassCardProps) {
  const baseClass = variant === "sm" ? "glass-sm" : "glass";

  return (
    <div className={`${baseClass} p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}
