# FreeRent PRD

## Overview
A Solana account closing app that helps users reclaim rent from unused token accounts. Built with Next.js, gas fees sponsored via Kora.

## Design Philosophy
- **Mobile-first** responsive design
- **Apple Liquid Glass** inspired UI - frosted glass effects, subtle transparency, smooth animations, depth through blur and layering

## Core Features

### Account Closing
- Display user's closeable token accounts with rent amounts
- **Toggle filter**: Switch between empty accounts (0 balance) and non-empty accounts
- **Batch closing**: Close 1-8 accounts per transaction
- Dynamically calculate batch size based on transaction CU (compute unit) limits
- Show estimated rent recovery before confirming

### Burn Dust (Coming Soon)
- Burn small token balances ("dust") to close non-empty accounts
- UI placeholder with "Coming Soon" badge

### Gas Sponsorship
- Kora integration for feeless transactions
- Endpoint: `kora.up.railway.app`
- Docs: https://launch.solana.com/products/kora

### Revenue Model
- **1% fee** on recovered rent
- Fee recipient: `MTSLZDJppGh6xUcnrSSbSQE5fgbvCtQ496MqgQTv8c1`

## User Flow
1. Connect wallet
2. View list of closeable accounts with rent amounts
3. Select accounts to close (1-8 max per tx)
4. Review total rent to recover minus 1% fee
5. Confirm transaction (gas sponsored by Kora)
6. Success feedback with rent credited

## Technical Requirements
- Next.js 14+ with App Router
- Solana web3.js / @solana/spl-token
- Wallet adapter (Phantom, Solflare, etc.)
- Respect transaction CU limits (~1.4M max)
- Mobile-responsive breakpoints

## UI Components
- Glassmorphic cards with backdrop blur
- Smooth micro-interactions
- Progress indicators for batch operations
- Toast notifications for tx status

## Analytics & Statistics
Track usage metrics in Turso (libSQL):

### Database: Turso
- **URL**: `libsql://rentclaim-metasal1.aws-ap-northeast-1.turso.io`
- **Auth**: Store token in `TURSO_AUTH_TOKEN` env var

### Metrics to Track
| Metric | Description |
|--------|-------------|
| `wallets_connected` | Unique wallet addresses that connected |
| `accounts_closed` | Total token accounts closed |
| `rent_recovered` | Total SOL rent recovered |
| `fees_collected` | Total 1% fees collected |

### Schema (suggested)
```sql
CREATE TABLE stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  accounts_closed INTEGER DEFAULT 0,
  rent_recovered REAL DEFAULT 0,
  fee_paid REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL, -- 'connect', 'close', 'batch_close'
  wallet_address TEXT,
  tx_signature TEXT,
  accounts_count INTEGER,
  rent_amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Development
- **Network**: Devnet for testing
- **Airdrop**: `api.metasal.xyz` for devnet SOL

## Environment Variables
```
TURSO_DATABASE_URL=libsql://rentclaim-metasal1.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=<your-token>
KORA_ENDPOINT=https://kora.up.railway.app
FEE_RECIPIENT=MTSLZDJppGh6xUcnrSSbSQE5fgbvCtQ496MqgQTv8c1
```
