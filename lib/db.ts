import os from "os";
import postgres from "postgres";

type Sql = postgres.Sql;

// One pool for the life of the Node process. Next.js dev reloads this module,
// so the pool is stored on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __roadmapSql?: Sql };

// Build must succeed without a database (CI, `next build` before .env exists).
// The pool is opened on the first query, not at import time.
export function getDb(): Sql {
  if (globalForDb.__roadmapSql) return globalForDb.__roadmapSql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and set it to your local Postgres URL."
    );
  }

  globalForDb.__roadmapSql = postgres(withDefaultUser(url), {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return globalForDb.__roadmapSql;
}

// libpq uses the OS user when the URL has no username. Homebrew Postgres on a
// Mac Mini is set up that way: postgresql://localhost:5432/ds_kanban
function withDefaultUser(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) return url;
    parsed.username = process.env.PGUSER || os.userInfo().username;
    return parsed.toString();
  } catch {
    return url;
  }
}
