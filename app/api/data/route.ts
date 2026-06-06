import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { AppData } from "@/lib/types";

// GET /api/data — load all roadmap data
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT data FROM app_data WHERE id = 1`;

    if (rows.length === 0) {
      const empty: AppData = {
        features: [],
        boards: [
          {
            id: 1,
            name: "My Roadmap",
            releases: [
              { id: "r1", name: "Current", timing: { type: "quarter", quarter: "Q1", year: "2026" } },
              { id: "r2", name: "Version 1.1", timing: { type: "quarter", quarter: "Q2", year: "2026" } },
              { id: "r3", name: "Version 1.2", timing: { type: "quarter", quarter: "Q3", year: "2026" } },
              { id: "r4", name: "Version X", timing: { type: "quarter", quarter: "Q4", year: "2026" } },
            ],
            categories: ["Exception Management", "AP Processes", "Integration", "Analytics"],
          },
        ],
        currentBoardId: 1,
        assignees: [],
        nextId: 1,
        nextBoardId: 2,
        nextRelId: 5,
      };
      return NextResponse.json(empty);
    }

    return NextResponse.json(rows[0].data as AppData);
  } catch (err) {
    console.error("GET /api/data error:", err);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}

// POST /api/data — save all roadmap data
export async function POST(req: Request) {
  try {
    const sql = getDb();
    const body = (await req.json()) as AppData;
    body.lastUpdated = new Date().toISOString();

    await sql`
      INSERT INTO app_data (id, data, updated_at)
      VALUES (1, ${JSON.stringify(body)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = NOW()
    `;

    return NextResponse.json({ ok: true, lastUpdated: body.lastUpdated });
  } catch (err) {
    console.error("POST /api/data error:", err);
    return NextResponse.json({ error: "Failed to save data" }, { status: 500 });
  }
}
