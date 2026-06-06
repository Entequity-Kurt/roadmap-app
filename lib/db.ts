import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// Lazily initialized so Next.js static analysis / build doesn't fail
// when DATABASE_URL isn't present at build time (e.g. CI, local without .env).
let _sql: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set. Add it to .env.local or Vercel env settings.");
  _sql = neon(url);
  return _sql;
}

// Convenience alias — use this in API routes
export const sql = new Proxy({} as NeonQueryFunction<false, false>, {
  get(_, prop) {
    return (getDb() as unknown as Record<string, unknown>)[prop as string];
  },
  apply(_, _this, args) {
    return (getDb() as unknown as (...a: unknown[]) => unknown)(...args);
  },
}) as NeonQueryFunction<false, false>;
