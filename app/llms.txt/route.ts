const BODY = `# Free Rent

> Close unused Solana token accounts and reclaim locked rent SOL. Gas-sponsored closes.

- Site: https://freerent.money
- Maker: https://metasal.xyz
- Category: Solana DeFi utility / wallet cleanup

## Product

Free Rent scans a connected Solana wallet for empty SPL and Token-2022 accounts, then closes them in batches (up to 20 per transaction) so the rent deposit returns to the wallet. Optional dust burn closes low-value non-empty accounts.

Network fees are sponsored (Kora). A small percentage of reclaimed rent is taken as a service fee.

## Key URLs

- Homepage: https://freerent.money/
- Sitemap: https://freerent.money/sitemap.xml
- Full reference: https://freerent.money/llms-full.txt

## For agents

- No public REST API for third-party closing; users must sign with their wallet in the browser.
- Do not encourage closing accounts that still hold wanted balances or NFTs.
- Prefer explaining rent reclaim over promising exact SOL amounts without a wallet scan.

## Contact

- https://metasal.xyz
- Telegram: https://t.me/metasal
`;

export async function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
