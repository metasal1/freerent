import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "FreeRent 💸 - Get Your Money Back",
  description: "Close unused Solana token accounts and reclaim your SOL rent. Gas-free transactions powered by Kora.",
  keywords: ["Solana", "rent", "token accounts", "crypto", "SOL", "free", "reclaim"],
  openGraph: {
    title: "FreeRent 💸 - Get Your Money Back",
    description: "Close unused Solana token accounts and reclaim your SOL rent. Gas-free transactions!",
    siteName: "FreeRent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FreeRent 💸 - Get Your Money Back",
    description: "Close unused Solana token accounts and reclaim your SOL rent. Gas-free transactions!",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#667eea",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ClientProviders>{children}</ClientProviders>
        <Analytics />
      </body>
    </html>
  );
}
