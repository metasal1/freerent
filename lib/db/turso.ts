// Raw fetch Turso /v2/pipeline — works on CF Workers (no @libsql/client)

type TursoCell = {
  type?: string;
  value?: string | number | null;
  base64?: string;
};

type TursoRow = Record<string, string | number | null>;

type TursoArg =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "text"; value: string };

function hasTurso(): boolean {
  return !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

export function isDatabaseAvailable(): boolean {
  return hasTurso();
}

function getTursoConfig() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
  return { url: url.replace("libsql://", "https://"), token };
}

function unwrapCell(cell: TursoCell | string | number | null): string | number | null {
  if (cell == null) return null;
  if (typeof cell !== "object") return cell;
  const t = cell.type;
  const v = cell.value;
  if (v == null && cell.base64 == null) return null;
  if (t === "null") return null;
  if (t === "integer" || t === "float") {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return v == null ? null : String(v);
}

function toArg(a: string | number | null): TursoArg {
  if (a === null) return { type: "null" };
  if (typeof a === "number") {
    if (!Number.isFinite(a)) return { type: "null" };
    if (Number.isInteger(a) && Math.abs(a) <= Number.MAX_SAFE_INTEGER) {
      return { type: "integer", value: String(Math.trunc(a)) };
    }
    return { type: "float", value: a };
  }
  return { type: "text", value: String(a) };
}

async function execute(
  sql: string,
  args: (string | number | null)[] = []
): Promise<TursoRow[]> {
  const { url, token } = getTursoConfig();
  const res = await fetch(`${url}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: { sql, args: args.map(toArg) },
        },
        { type: "close" },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Turso pipeline error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    results: {
      type: string;
      response?: {
        type: string;
        result?: {
          cols: { name: string }[];
          rows: (TursoCell | string | number | null)[][];
        };
      };
      error?: { message?: string };
    }[];
  };

  for (const r of data.results || []) {
    if (r.type === "error") {
      throw new Error(r.error?.message || "Turso execute error");
    }
  }

  const exec = (data.results || []).find(
    (r) => r.type === "ok" && r.response?.type === "execute"
  );
  if (!exec?.response?.result) return [];

  const cols = exec.response.result.cols.map((c) => c.name);
  return (exec.response.result.rows || []).map((row) => {
    const obj: TursoRow = {};
    cols.forEach((col, i) => {
      obj[col] = unwrapCell(row[i] as TursoCell);
    });
    return obj;
  });
}

export async function initDatabase() {
  if (!hasTurso()) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      accounts_closed INTEGER DEFAULT 0,
      rent_recovered REAL DEFAULT 0,
      fee_paid REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await execute(`
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
  await execute(`CREATE INDEX IF NOT EXISTS idx_events_wallet ON events(wallet_address)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`);
}

export async function logConnect(walletAddress: string) {
  if (!hasTurso()) return;
  await execute(`INSERT INTO events (event_type, wallet_address) VALUES ('connect', ?)`, [
    walletAddress,
  ]);
}

export async function logClose(
  walletAddress: string,
  txSignature: string,
  accountsCount: number,
  rentAmount: number,
  feePaid: number
) {
  if (!hasTurso()) return;
  await execute(
    `INSERT INTO events (event_type, wallet_address, tx_signature, accounts_count, rent_amount)
     VALUES ('close', ?, ?, ?, ?)`,
    [walletAddress, txSignature, accountsCount, rentAmount]
  );
  const existing = await execute(`SELECT id FROM stats WHERE wallet_address = ?`, [
    walletAddress,
  ]);
  if (existing.length > 0) {
    await execute(
      `UPDATE stats
       SET accounts_closed = accounts_closed + ?,
           rent_recovered = rent_recovered + ?,
           fee_paid = fee_paid + ?
       WHERE wallet_address = ?`,
      [accountsCount, rentAmount, feePaid, walletAddress]
    );
  } else {
    await execute(
      `INSERT INTO stats (wallet_address, accounts_closed, rent_recovered, fee_paid)
       VALUES (?, ?, ?, ?)`,
      [walletAddress, accountsCount, rentAmount, feePaid]
    );
  }
}

export async function logBurn(
  walletAddress: string,
  txSignature: string,
  accountsCount: number,
  rentAmount: number,
  feePaid: number
) {
  if (!hasTurso()) return;
  await execute(
    `INSERT INTO events (event_type, wallet_address, tx_signature, accounts_count, rent_amount)
     VALUES ('burn', ?, ?, ?, ?)`,
    [walletAddress, txSignature, accountsCount, rentAmount]
  );
  const existing = await execute(`SELECT id FROM stats WHERE wallet_address = ?`, [
    walletAddress,
  ]);
  if (existing.length > 0) {
    await execute(
      `UPDATE stats
       SET accounts_closed = accounts_closed + ?,
           rent_recovered = rent_recovered + ?,
           fee_paid = fee_paid + ?
       WHERE wallet_address = ?`,
      [accountsCount, rentAmount, feePaid, walletAddress]
    );
  } else {
    await execute(
      `INSERT INTO stats (wallet_address, accounts_closed, rent_recovered, fee_paid)
       VALUES (?, ?, ?, ?)`,
      [walletAddress, accountsCount, rentAmount, feePaid]
    );
  }
}

export async function getGlobalStats() {
  if (!hasTurso()) {
    return {
      uniqueWallets: 0,
      totalAccountsClosed: 0,
      totalRentRecovered: 0,
      totalFees: 0,
    };
  }
  const rows = await execute(`
    SELECT
      COUNT(DISTINCT wallet_address) as unique_wallets,
      SUM(accounts_closed) as total_accounts_closed,
      SUM(rent_recovered) as total_rent_recovered,
      SUM(fee_paid) as total_fees
    FROM stats
  `);
  const row = rows[0] || {};
  return {
    uniqueWallets: Number(row.unique_wallets) || 0,
    totalAccountsClosed: Number(row.total_accounts_closed) || 0,
    totalRentRecovered: Number(row.total_rent_recovered) || 0,
    totalFees: Number(row.total_fees) || 0,
  };
}

export async function getWalletStats(walletAddress: string) {
  if (!hasTurso()) {
    return { accountsClosed: 0, rentRecovered: 0, feePaid: 0 };
  }
  const rows = await execute(
    `SELECT accounts_closed, rent_recovered, fee_paid FROM stats WHERE wallet_address = ?`,
    [walletAddress]
  );
  if (rows.length === 0) {
    return { accountsClosed: 0, rentRecovered: 0, feePaid: 0 };
  }
  const row = rows[0];
  return {
    accountsClosed: Number(row.accounts_closed) || 0,
    rentRecovered: Number(row.rent_recovered) || 0,
    feePaid: Number(row.fee_paid) || 0,
  };
}
