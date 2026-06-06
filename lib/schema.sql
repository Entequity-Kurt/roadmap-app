-- ============================================================
-- AP Matching Roadmap — Neon Postgres Schema
-- Run this in the Neon SQL Editor once after creating your DB
-- ============================================================

-- Core data store: single JSONB document (mirrors original JSON file structure)
-- This keeps migration from Box trivial and avoids complex joins for a roadmap tool.
CREATE TABLE IF NOT EXISTS app_data (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GIN index for fast JSONB queries if you later add full-text search
CREATE INDEX IF NOT EXISTS idx_app_data_gin ON app_data USING GIN (data);

-- ============================================================
-- Optional: per-board data isolation for multi-tenant setups
-- Uncomment if you need multiple organizations sharing one DB.
-- ============================================================

-- CREATE TABLE IF NOT EXISTS workspaces (
--   id         SERIAL PRIMARY KEY,
--   slug       TEXT UNIQUE NOT NULL,
--   name       TEXT NOT NULL,
--   data       JSONB NOT NULL DEFAULT '{}'::jsonb,
--   updated_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- ============================================================
-- Seed: inserts empty default state so GET /api/data always works
-- ============================================================
INSERT INTO app_data (id, data)
VALUES (1, '{
  "features": [],
  "boards": [{
    "id": 1,
    "name": "My Roadmap",
    "releases": [
      {"id": "r1", "name": "Current",     "timing": {"type": "quarter", "quarter": "Q1", "year": "2026"}},
      {"id": "r2", "name": "Version 1.1", "timing": {"type": "quarter", "quarter": "Q2", "year": "2026"}},
      {"id": "r3", "name": "Version 1.2", "timing": {"type": "quarter", "quarter": "Q3", "year": "2026"}},
      {"id": "r4", "name": "Version X",   "timing": {"type": "quarter", "quarter": "Q4", "year": "2026"}}
    ]
  }],
  "currentBoardId": 1,
  "assignees": [],
  "nextId": 1,
  "nextBoardId": 2,
  "nextRelId": 5
}'::jsonb)
ON CONFLICT (id) DO NOTHING;
