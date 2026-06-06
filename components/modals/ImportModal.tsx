"use client";

import { useMemo, useRef, useState } from "react";
import type { Board, Assignee, Feature } from "@/lib/types";
import { STATUSES } from "@/lib/types";

interface Props {
  boards: Board[];
  currentBoardId: number;
  assignees: Assignee[];
  onConfirm: (boardId: number, rows: Array<Partial<Feature>>) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

// ── Normalization helpers ─────────────────────────────────────────────
function normHeader(h: string): string {
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
}
// keep < > as lt/gt tokens so effort labels stay distinguishable
function normValue(v: string): string {
  return String(v).trim().toLowerCase()
    .replace(/</g, "lt").replace(/>/g, "gt")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const HEADER_MAP: Record<string, keyof RawRecord> = {
  title: "title",
  description: "desc", desc: "desc",
  category: "cat", cat: "cat",
  release: "release",
  status: "status",
  progress: "progress", progresspercent: "progress",
  priority: "priority",
  effort: "effort",
  complexity: "complexity",
  assignee: "assignee", owner: "assignee",
};

interface RawRecord {
  title: string; desc: string; cat: string; release: string; status: string;
  progress: string; priority: string; effort: string; complexity: string; assignee: string;
}

const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const COMPLEXITIES = ["Easy", "Medium", "Hard"];
// effort code -> human label
const EFFORT_CODES: Array<{ code: string; aliases: string[] }> = [
  { code: "lt1w", aliases: ["lt1w", "lt1week", "lt1wk"] },
  { code: "1to2w", aliases: ["1to2w", "1-2weeks", "1-2wks", "12weeks", "1to2weeks", "1-2week"] },
  { code: "1mo", aliases: ["1mo", "1month", "1m"] },
  { code: "gt1mo", aliases: ["gt1mo", "gt1month", "gt1m"] },
];

function matchOne(raw: string, options: string[]): string | null {
  const n = normValue(raw);
  if (!n) return null;
  for (const o of options) if (normValue(o) === n) return o;
  return null;
}

function matchEffort(raw: string): string | null {
  const n = normValue(raw);
  if (!n) return null;
  for (const e of EFFORT_CODES) if (e.aliases.includes(n)) return e.code;
  return null;
}

interface PreviewRow {
  valid: boolean;
  reason?: string;
  title: string;
  desc: string;
  cat: string;
  release: string;       // release id
  releaseName: string;
  status: string;
  progress: number;
  priority: string | null;
  effort: string | null;
  complexity: string | null;
  assignee: string | null;
  flags: string[];
}

function resolveRows(records: RawRecord[], board: Board | null, assignees: Assignee[]): PreviewRow[] {
  const cats = board?.categories?.length ? board.categories : [];
  const rels = board?.releases ?? [];
  const defaultCat = cats[0] ?? "";
  const defaultRel = rels[0];
  return records.map((r) => {
    const flags: string[] = [];
    const title = (r.title ?? "").trim();

    // Category
    let cat = matchOne(r.cat, cats);
    if (!cat) {
      if ((r.cat ?? "").trim()) flags.push(`Category "${r.cat.trim()}" → ${defaultCat || "default"}`);
      cat = defaultCat;
    }

    // Release (match by name, store id)
    let relName = (r.release ?? "").trim();
    let relMatch = rels.find((x) => normValue(x.name) === normValue(relName));
    if (!relMatch) {
      if (relName) flags.push(`Release "${relName}" → ${defaultRel?.name ?? "default"}`);
      relMatch = defaultRel;
    }
    const release = relMatch?.id ?? "";
    const releaseName = relMatch?.name ?? "";

    // Status
    let status = matchOne(r.status, [...STATUSES]) ?? "To Do";
    if ((r.status ?? "").trim() && !matchOne(r.status, [...STATUSES])) {
      flags.push(`Status "${r.status.trim()}" → To Do`);
    }

    // Progress
    let progress = parseInt(String(r.progress).replace(/[^0-9.-]/g, ""), 10);
    if (isNaN(progress)) progress = 0;
    progress = Math.min(100, Math.max(0, Math.round(progress)));

    // Keep app invariant: 100% ⇒ Done, Done ⇒ 100%
    if (progress === 100) status = "Done";
    else if (status === "Done") progress = 100;

    const priority = matchOne(r.priority, PRIORITIES);
    if ((r.priority ?? "").trim() && !priority) flags.push(`Priority "${r.priority.trim()}" ignored`);

    const effort = matchEffort(r.effort);
    if ((r.effort ?? "").trim() && !effort) flags.push(`Effort "${r.effort.trim()}" ignored`);

    const complexity = matchOne(r.complexity, COMPLEXITIES);
    if ((r.complexity ?? "").trim() && !complexity) flags.push(`Complexity "${r.complexity.trim()}" ignored`);

    // Assignee — keep raw if non-empty; canonicalize to known assignee if matched
    let assignee: string | null = null;
    const aRaw = (r.assignee ?? "").trim();
    if (aRaw) {
      const known = assignees.find((a) => normValue(a.name) === normValue(aRaw));
      assignee = known ? known.name : aRaw;
      if (!known) flags.push(`New assignee "${aRaw}"`);
    }

    const valid = title.length > 0 && !!defaultRel;
    const reason = !title ? "Missing Title" : !defaultRel ? "Board has no release" : undefined;

    return {
      valid, reason, title, desc: (r.desc ?? "").trim(),
      cat, release, releaseName, status, progress, priority, effort, complexity, assignee, flags,
    };
  });
}

const EFFORT_LABEL_LOCAL: Record<string, string> = {
  lt1w: "< 1 wk", "1to2w": "1–2 wks", "1mo": "1 mo", gt1mo: "> 1 mo",
};

export default function ImportModal({ boards, currentBoardId, assignees, onConfirm, onClose, onToast }: Props) {
  const [boardId, setBoardId] = useState<number>(currentBoardId);
  const [records, setRecords] = useState<RawRecord[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [parseErr, setParseErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const board = useMemo(() => boards.find((b) => b.id === boardId) ?? null, [boards, boardId]);
  const preview = useMemo(() => (records ? resolveRows(records, board, assignees) : []), [records, board, assignees]);
  const validCount = preview.filter((p) => p.valid).length;
  const flaggedCount = preview.filter((p) => p.valid && p.flags.length > 0).length;

  async function handleFile(file: File) {
    setBusy(true); setParseErr(""); setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("No sheet found in file.");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
      const recs: RawRecord[] = raw.map((row) => {
        const out: RawRecord = { title: "", desc: "", cat: "", release: "", status: "", progress: "", priority: "", effort: "", complexity: "", assignee: "" };
        for (const key of Object.keys(row)) {
          const field = HEADER_MAP[normHeader(key)];
          if (field) out[field] = String(row[key] ?? "");
        }
        return out;
      }).filter((r) => Object.values(r).some((v) => String(v).trim() !== ""));
      if (recs.length === 0) throw new Error("No data rows found. Make sure the first row has column headers (Title, Category, …).");
      setRecords(recs);
    } catch (e) {
      setParseErr((e as Error).message || "Could not read file.");
      setRecords(null);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const headers = ["Title", "Description", "Category", "Release", "Status", "Progress (%)", "Priority", "Effort", "Complexity", "Assignee"];
    const sample = [
      "Auto-match invoices to POs", "Match incoming invoices to open purchase orders automatically.",
      board?.categories?.[0] ?? "", board?.releases?.[0]?.name ?? "",
      "In Progress", 40, "High", "1–2 weeks", "Hard", "",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    (ws as { ["!cols"]?: Array<{ wch: number }> })["!cols"] = [28, 40, 22, 16, 14, 12, 12, 14, 12, 18].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Features");
    const vv = [
      ["Field", `Valid values${board ? ` — board: ${board.name}` : ""}`],
      ["Title", "Required. Free text."],
      ["Description", "Optional. Free text."],
      ["Category", (board?.categories ?? []).join(", ") || "(any board category)"],
      ["Release", (board?.releases ?? []).map((r) => r.name).join(", ") || "(any release name)"],
      ["Status", "To Do, In Progress, In Review, Done, Blocked"],
      ["Progress (%)", "Whole number 0–100 (100 marks Done)"],
      ["Priority", "Low, Medium, High, Critical"],
      ["Effort", "< 1 week, 1–2 weeks, 1 month, > 1 month"],
      ["Complexity", "Easy, Medium, Hard"],
      ["Assignee", (assignees ?? []).map((a) => a.name).join(", ") || "(any name)"],
    ];
    const wv = XLSX.utils.aoa_to_sheet(vv);
    (wv as { ["!cols"]?: Array<{ wch: number }> })["!cols"] = [{ wch: 16 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wv, "Valid Values");
    XLSX.writeFile(wb, "Roadmap_Import_Template.xlsx");
    onToast("Template downloaded");
  }

  function handleConfirm() {
    const rows: Array<Partial<Feature>> = preview.filter((p) => p.valid).map((p) => ({
      title: p.title, desc: p.desc, cat: p.cat, release: p.release,
      status: p.status, progress: p.progress,
      priority: p.priority, effort: p.effort, complexity: p.complexity, assignee: p.assignee,
    }));
    if (rows.length === 0) return;
    onConfirm(boardId, rows);
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: "DM Sans, sans-serif", fontSize: 13, padding: "8px 12px",
    border: "1px solid var(--border2)", borderRadius: 6, background: "var(--sand)", outline: "none",
  };

  return (
    <div className="modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-wide" style={{ width: 920 }}>
        {/* Header */}
        <div className="mw-header">
          <span className="mw-title">Import Features from Excel</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--text2)", background: "var(--sand2)", border: "1px solid var(--border2)" }}
              onClick={downloadTemplate}>⬇ Template</button>
            <button className="btn btn-cancel btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-teal btn-sm" disabled={validCount === 0} onClick={handleConfirm}>
              Import {validCount > 0 ? `${validCount}` : ""}
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Controls */}
          <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label className="fl">Target board</label>
              <select value={boardId} onChange={(e) => setBoardId(Number(e.target.value))} style={{ ...inputStyle, minWidth: 220, cursor: "pointer" }}>
                {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label className="fl">Excel file</label>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                style={{
                  border: `1.5px dashed ${dragOver ? "var(--teal)" : "var(--border2)"}`,
                  borderRadius: 8, padding: "12px 14px", cursor: "pointer",
                  background: dragOver ? "rgba(52,168,134,0.06)" : "var(--sand)",
                  fontSize: 13, color: "var(--text2)", textAlign: "center",
                }}>
                {busy ? "Reading…" : fileName ? `📄 ${fileName} — click to replace` : "Click to choose a .xlsx file, or drag it here"}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            </div>
          </div>

          {parseErr && (
            <div style={{ background: "#fee", color: "#c00", border: "1px solid #f3b7b7", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
              ⚠ {parseErr}
            </div>
          )}

          {records && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>
                <b>{validCount}</b> of {preview.length} row{preview.length === 1 ? "" : "s"} ready to import
                {flaggedCount > 0 && <> · <span style={{ color: "#b07000" }}>{flaggedCount} with adjustments ⚠</span></>}
                {validCount < preview.length && <> · <span style={{ color: "#c0392b" }}>{preview.length - validCount} skipped</span></>}
                {board && <> · into <b>{board.name}</b></>}
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto", borderRadius: 8, border: "1px solid var(--border)" }}>
                <table className="st-table" style={{ borderRadius: 0, boxShadow: "none" }}>
                  <thead>
                    <tr>
                      <th style={{ width: 26 }}></th>
                      <th>Title</th><th>Category</th><th>Release</th><th>Status</th>
                      <th style={{ width: 52 }}>%</th><th>Priority</th><th>Effort</th><th>Complexity</th><th>Assignee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={i} style={{ opacity: p.valid ? 1 : 0.5 }}>
                        <td title={p.valid ? (p.flags.join("; ") || "OK") : p.reason}>
                          {p.valid ? (p.flags.length ? "⚠" : "✓") : "✕"}
                        </td>
                        <td style={{ fontWeight: 600 }}>{p.title || <i style={{ color: "#c0392b" }}>{p.reason}</i>}</td>
                        <td>{p.cat}</td>
                        <td>{p.releaseName}</td>
                        <td>{p.status}</td>
                        <td>{p.progress}</td>
                        <td>{p.priority ?? "—"}</td>
                        <td>{p.effort ? (EFFORT_LABEL_LOCAL[p.effort] ?? p.effort) : "—"}</td>
                        <td>{p.complexity ?? "—"}</td>
                        <td>{p.assignee ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {flaggedCount > 0 && (
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
                  Hover the ⚠ in the first column to see what was adjusted for each row (unknown Category/Release fall back to the board default).
                </div>
              )}
            </div>
          )}

          {!records && !busy && (
            <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.6 }}>
              Each row becomes a new feature on the selected board. <b>Title</b> is required; everything else is optional.
              Unknown <b>Category</b> or <b>Release</b> values fall back to the board default (shown in the preview before you confirm).
              Use <b>⬇ Template</b> for a correctly-formatted starter file.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
