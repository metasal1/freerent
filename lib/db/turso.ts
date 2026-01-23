import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "",
  authToken: process.env.TURSO_AUTH_TOKEN || "",
});

export { client as turso };

// Initialize database schema
export async function initDatabase() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      accounts_closed INTEGER DEFAULT 0,
      rent_recovered REAL DEFAULT 0,
      fee_paid REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      wallet_address TEXT,
      tx_signature TEXT,
      accounts_count INTEGER,
      rent_amount REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_events_wallet ON events(wallet_address)
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)
  `);
}

// Log a wallet connection
export async function logConnect(walletAddress: string) {
  await client.execute({
    sql: `INSERT INTO events (event_type, wallet_address) VALUES ('connect', ?)`,
    args: [walletAddress],
  });
}

// Log account closing
export async function logClose(
  walletAddress: string,
  txSignature: string,
  accountsCount: number,
  rentAmount: number,
  feePaid: number
) {
  // Insert event
  await client.execute({
    sql: `INSERT INTO events (event_type, wallet_address, tx_signature, accounts_count, rent_amount)
          VALUES ('close', ?, ?, ?, ?)`,
    args: [walletAddress, txSignature, accountsCount, rentAmount],
  });

  // Upsert stats
  const existing = await client.execute({
    sql: `SELECT id FROM stats WHERE wallet_address = ?`,
    args: [walletAddress],
  });

  if (existing.rows.length > 0) {
    await client.execute({
      sql: `UPDATE stats
            SET accounts_closed = accounts_closed + ?,
                rent_recovered = rent_recovered + ?,
                fee_paid = fee_paid + ?
            WHERE wallet_address = ?`,
      args: [accountsCount, rentAmount, feePaid, walletAddress],
    });
  } else {
    await client.execute({
      sql: `INSERT INTO stats (wallet_address, accounts_closed, rent_recovered, fee_paid)
            VALUES (?, ?, ?, ?)`,
      args: [walletAddress, accountsCount, rentAmount, feePaid],
    });
  }
}

// Get global statistics
export async function getGlobalStats() {
  const result = await client.execute(`
    SELECT
      COUNT(DISTINCT wallet_address) as unique_wallets,
      SUM(accounts_closed) as total_accounts_closed,
      SUM(rent_recovered) as total_rent_recovered,
      SUM(fee_paid) as total_fees
    FROM stats
  `);

  const row = result.rows[0];
  return {
    uniqueWallets: Number(row.unique_wallets) || 0,
    totalAccountsClosed: Number(row.total_accounts_closed) || 0,
    totalRentRecovered: Number(row.total_rent_recovered) || 0,
    totalFees: Number(row.total_fees) || 0,
  };
}

// Get wallet-specific stats
export async function getWalletStats(walletAddress: string) {
  const result = await client.execute({
    sql: `SELECT accounts_closed, rent_recovered, fee_paid FROM stats WHERE wallet_address = ?`,
    args: [walletAddress],
  });

  if (result.rows.length === 0) {
    return { accountsClosed: 0, rentRecovered: 0, feePaid: 0 };
  }

  const row = result.rows[0];
  return {
    accountsClosed: Number(row.accounts_closed),
    rentRecovered: Number(row.rent_recovered),
    feePaid: Number(row.fee_paid),
  };
}
