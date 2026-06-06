import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const sql = getDb();
  const rows = await sql`SELECT data->'features'->0 as first FROM app_data WHERE id = 1`;
  return NextResponse.json({ raw: rows[0]?.first ?? null, idType: typeof (rows[0]?.first as {id?: unknown})?.id });
}
