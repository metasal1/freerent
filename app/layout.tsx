import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Free Rent - Get Your Money Back",
  description: "Free your rent! Close unused Solana token accounts and get your SOL back. Gas-free transactions.",
  keywords: ["Solana", "rent", "token accounts", "crypto", "SOL", "free", "reclaim"],
  openGraph: {
    title: "Free Rent - Get Your Money Back",
    description: "Free your rent! Close unused Solana token accounts and get your SOL back.",
    siteName: "Free Rent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Rent - Get Your Money Back",
    description: "Free your rent! Close unused Solana token accounts and get your SOL back.",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#22d3ee",
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
