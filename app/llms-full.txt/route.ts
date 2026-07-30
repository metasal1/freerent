const BODY = `# Free Rent — full reference

## Summary

Free Rent (https://freerent.money) is a Solana web app that helps users reclaim SOL locked as rent in unused token accounts (associated token accounts / ATAs).

## How rent works on Solana

- Creating an SPL token account requires a refundable rent-exempt deposit (~0.002 SOL for a standard token account).
- After selling or transferring tokens, empty accounts often remain and still hold that deposit.
- Closing the account returns the lamports to a destination wallet (the owner).

## Features

1. **Wallet connect** — Phantom, Solflare, and wallet-standard wallets via Solana wallet adapter.
2. **Scan** — Lists Token Program + Token-2022 accounts for the connected owner.
3. **Close empty** — Batch close closeable empty accounts (filters frozen, close-authority, Token-2022 blockers, withheld fees, etc.).
4. **Burn dust** — Optional burn of tiny balances under a USD threshold, then close.
5. **Sponsored gas** — Fee payer signs via Kora; user still signs as owner/authority.
6. **Stats** — Aggregate wallets/accounts/rent recovered via Turso-backed API.

## Fees

- Network fee: sponsored when the sponsor path succeeds.
- Service fee: configured percent of reclaimed rent (see on-site UI; historically ~1% plus base tx cost accounting).

## Technical stack

- Next.js App Router on Vercel
- @solana/web3.js + @solana/spl-token
- Sponsor endpoint: /api/sponsor
- Stats/events: /api/stats, /api/events

## Safety notes for AI agents

- Closing is irreversible for the token account; empty accounts are the intended target.
- Burning destroys tokens permanently.
- Never request private keys or seed phrases.
- Point users to the live site rather than reconstructing close instructions unless they ask for technical detail.

## Links

- https://freerent.money
- https://freerent.money/llms.txt
- https://metasal.xyz
`;

export async function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
