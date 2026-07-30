import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { Analytics } from "@vercel/analytics/next";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-2KKTKDHD39";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://freerent.money"),
  title: {
    default: "Free Rent — Reclaim SOL from empty token accounts",
    template: "%s | Free Rent",
  },
  description:
    "Close unused Solana token accounts and reclaim rent deposits. Gas-free closes via sponsored transactions.",
  applicationName: "Free Rent",
  authors: [{ name: "Metasal", url: "https://metasal.xyz" }],
  creator: "Metasal",
  publisher: "Milysec",
  category: "finance",
  keywords: [
    "Solana",
    "rent",
    "token accounts",
    "reclaim SOL",
    "close ATA",
    "crypto",
    "gasless",
  ],
  openGraph: {
    title: "Free Rent — Reclaim SOL from empty token accounts",
    description:
      "Close unused Solana token accounts and reclaim rent deposits. Gas-free closes.",
    siteName: "Free Rent",
    type: "website",
    url: "https://freerent.money",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Rent — Reclaim SOL from empty token accounts",
    description:
      "Close unused Solana token accounts and reclaim rent deposits. Gas-free closes.",
    creator: "@metasal",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // app/icon.png + app/apple-icon.png auto-discovered
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
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', { anonymize_ip: true });
              `}
            </Script>
          </>
        )}
        <Script
          src="https://stats.sal.fun/script.js"
          data-website-id="3904cc9b-7770-4549-a3b3-db3ed9414789"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
