import type { Metadata } from "next";
import HomeClient from "./home-client";

const siteUrl = "https://freerent.money";
const title = "Free Rent — Reclaim SOL from empty token accounts";
const description =
  "Close unused Solana token accounts and reclaim rent deposits. Gas-free closes via sponsored transactions. Recover SOL stuck in empty ATAs in one click.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "Free Rent",
    type: "website",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  keywords: [
    "Solana rent",
    "close token accounts",
    "reclaim SOL",
    "empty ATA",
    "Solana rent reclaim",
    "free rent",
    "gasless Solana",
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Free Rent",
      description,
      inLanguage: "en-AU",
      publisher: { "@id": `${siteUrl}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#org`,
      name: "Free Rent",
      url: siteUrl,
      logo: `${siteUrl}/icon.png`,
      sameAs: ["https://metasal.xyz"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#app`,
      name: "Free Rent",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Gas-sponsored closes; small % fee on reclaimed rent",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Solana token account rent?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Every SPL token account holds a refundable SOL rent deposit (about 0.002 SOL). Empty accounts after selling tokens still lock that SOL until the account is closed.",
          },
        },
        {
          "@type": "Question",
          name: "How does Free Rent work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Connect a wallet, scan empty token accounts, and close them in batches. Transactions are gas-sponsored. A small percentage of reclaimed rent is charged as a service fee.",
          },
        },
        {
          "@type": "Question",
          name: "Is Free Rent gas-free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Network fees are sponsored so you can reclaim rent without holding extra SOL for gas. A service fee is taken from the reclaimed rent.",
          },
        },
      ],
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Crawlable shell for bots that skip client JS */}
      <section className="sr-only" aria-hidden={false}>
        <h1>Free Rent — reclaim SOL from empty Solana token accounts</h1>
        <p>{description}</p>
        <ul>
          <li>Scan wallet for empty ATAs</li>
          <li>Close up to 20 accounts per sponsored transaction</li>
          <li>Burn dust tokens (optional) to unlock more rent</li>
        </ul>
        <a href={siteUrl}>Open Free Rent</a>
        <a href="https://metasal.xyz">Made by Metasal / Milysec</a>
      </section>
      <HomeClient />
    </>
  );
}
