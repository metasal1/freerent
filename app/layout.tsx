import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { Analytics } from "@vercel/analytics/next";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700"],
});

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
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="antialiased">
        <ClientProviders>{children}</ClientProviders>
        <Analytics />
        <Script
          src="https://stats.sal.fun/script.js"
          data-website-id="3904cc9b-7770-4549-a3b3-db3ed9414789"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
