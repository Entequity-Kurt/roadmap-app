import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { AppData } from "@/lib/types";

// POST /api/migrate — import existing ap-roadmap-data.json
// Body: the raw JSON content of ap-roadmap-data.json
export async function POST(req: Request) {
  try {
    const sql = getDb();
    const body = (await req.json()) as AppData;

    // Basic validation
    if (!body.features || !body.boards) {
      return NextResponse.json(
        { error: "Invalid data format — must include features and boards arrays" },
        { status: 400 }
      );
    }

    // Ensure every feature has a sortOrder
    body.features.forEach((f, i) => {
      if (f.sortOrder == null) f.sortOrder = i * 10;
    });

    body.lastUpdated = new Date().toISOString();

    await sql`
      INSERT INTO app_data (id, data, updated_at)
      VALUES (1, ${JSON.stringify(body)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = NOW()
    `;

    return NextResponse.json({
      ok: true,
      featureCount: body.features.length,
      boardCount: body.boards.length,
      lastUpdated: body.lastUpdated,
    });
  } catch (err) {
    console.error("POST /api/migrate error:", err);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
