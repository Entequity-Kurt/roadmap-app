import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// DELETE /api/feature/[id] — remove a feature by id directly in Postgres
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const featureId = parseInt(id);
    if (isNaN(featureId)) {
      return NextResponse.json({ error: "Invalid feature id" }, { status: 400 });
    }

    const sql = getDb();

    // Remove the feature from the JSONB array directly in Postgres
    await sql`
      UPDATE app_data
      SET data = jsonb_set(
        data,
        '{features}',
        (
          SELECT jsonb_agg(f)
          FROM jsonb_array_elements(data->'features') AS f
          WHERE (f->>'id')::int != ${featureId}
        )
      ),
      updated_at = NOW()
      WHERE id = 1
    `;

    return NextResponse.json({ ok: true, deletedId: featureId });
  } catch (err) {
    console.error("DELETE /api/feature error:", err);
    return NextResponse.json({ error: "Failed to delete feature" }, { status: 500 });
  }
}

// GET /api/feature/[id] — fetch a single feature by id
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const featureId = parseInt(id);
    if (isNaN(featureId)) {
      return NextResponse.json({ error: "Invalid feature id" }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT f
      FROM app_data,
      jsonb_array_elements(data->'features') AS f
      WHERE id = 1
        AND (f->>'id')::int = ${featureId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0].f);
  } catch (err) {
    console.error("GET /api/feature error:", err);
    return NextResponse.json({ error: "Failed to fetch feature" }, { status: 500 });
  }
}
