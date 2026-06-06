"use client";

import { useState } from "react";
import type { Board, Feature, Release, Timing } from "@/lib/types";
import { MONTHS, QUARTERS, DEFAULT_CATS, formatTiming } from "@/lib/types";

interface Props {
  boards: Board[];
  features: Feature[];
  assignees: { id: string; name: string }[];
  currentBoardId: number;
  nextRelId: number;
  onSave: (updated: Board[], newNextRelId?: number) => void;
  onSwitchBoard: (id: number) => void;
  onDeleteBoard: (id: number) => void;
  onAddBoard: (name: string) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

// ── helpers ────────────────────────────────────────────────────────────
function getBoardCats(b: Board): string[] {
  return b.categories?.length ? b.categories : [...DEFAULT_CATS];
}

export default function BoardSettingsModal({
  boards, features, assignees, currentBoardId, nextRelId,
  onSave, onSwitchBoard, onDeleteBoard, onAddBoard,
  onClose, onToast,
}: Props) {
  const [localBoards, setLocalBoards] = useState<Board[]>(() =>
    JSON.parse(JSON.stringify(boards))
  );
  const [relCounter, setRelCounter] = useState(nextRelId);
  const [newBoardName, setNewBoardName] = useState("");

  // ── release edit state ──
  const [editRelId, setEditRelId] = useState<string | null>(null);
  const [relName, setRelName] = useState("");
  const [relTimingType, setRelTimingType] = useState<"month" | "quarter" | "year">("quarter");
  const [relMonth, setRelMonth] = useState(1);
  const [relQuarter, setRelQuarter] = useState("Q1");
  const [relYear, setRelYear] = useState(String(new Date().getFullYear()));

  // ── category edit state ──
  const [editCatIdx, setEditCatIdx] = useState<number | null>(null); // null = not editing, -1 = adding new
  const [catDraft, setCatDraft] = useState("");

  const currentBoard = localBoards.find((b) => b.id === currentBoardId) ?? localBoards[0];
  const boardCats = currentBoard ? getBoardCats(currentBoard) : [];

  // ── mutate helpers ──────────────────────────────────────────────────
  function updateCurrentBoard(updater: (b: Board) => Board) {
    const updated = localBoards.map((b) =>
      b.id === currentBoard?.id ? updater(b) : b
    );
    setLocalBoards(updated);
    return updated;
  }

  function persist(updated: Board[], newRelId?: number) {
    onSave(updated, newRelId);
  }

  // ── RELEASE CRUD ────────────────────────────────────────────────────
  function startEditRel(r: Release) {
    setEditRelId(r.id);
    setRelName(r.name);
    const t = r.timing ?? { type: "quarter", quarter: "Q1", year: String(new Date().getFullYear()) };
    setRelTimingType(t.type as "month" | "quarter" | "year");
    setRelMonth(t.month ?? 1);
    setRelQuarter(t.quarter ?? "Q1");
    setRelYear(t.year ?? String(new Date().getFullYear()));
  }

  function cancelEditRel() { setEditRelId(null); }

  function saveRelEdit(rid: string) {
    if (!relName.trim()) { onToast("Release name required"); return; }
    const timing: Timing = { type: relTimingType };
    if (relTimingType === "month") timing.month = relMonth;
    if (relTimingType === "quarter") timing.quarter = relQuarter;
    timing.year = relYear;
    const updated = updateCurrentBoard((b) => ({
      ...b,
      releases: b.releases.map((r) =>
        r.id === rid ? { ...r, name: relName.trim(), timing } : r
      ),
    }));
    setEditRelId(null);
    persist(updated);
    onToast("Release updated");
  }

  function deleteRelease(rid: string) {
    if (!currentBoard) return;
    if (currentBoard.releases.length <= 1) {
      onToast("A board needs at least one release");
      return;
    }
    // ── in-use check ──
    const inUse = features.filter((f) => f.release === rid).length;
    if (inUse > 0) {
      onToast(`Cannot delete — ${inUse} feature${inUse > 1 ? "s are" : " is"} using this release`);
      return;
    }
    const rel = currentBoard.releases.find((r) => r.id === rid);
    if (!confirm(`Delete release "${rel?.name ?? rid}"? This cannot be undone.`)) return;
    const updated = updateCurrentBoard((b) => ({
      ...b, releases: b.releases.filter((r) => r.id !== rid),
    }));
    setEditRelId(null);
    persist(updated);
    onToast("Release deleted");
  }

  function addRelease() {
    if (!currentBoard) return;
    const id = `rb${relCounter}`;
    const newRel: Release = {
      id, name: "New Release",
      timing: { type: "quarter", quarter: "Q1", year: String(new Date().getFullYear()) },
    };
    const updated = updateCurrentBoard((b) => ({ ...b, releases: [...b.releases, newRel] }));
    const newCounter = relCounter + 1;
    setRelCounter(newCounter);
    persist(updated, newCounter);
    startEditRel(newRel);
  }

  // ── CATEGORY CRUD ───────────────────────────────────────────────────
  function startEditCat(idx: number) {
    setEditCatIdx(idx);
    setCatDraft(boardCats[idx]);
  }

  function startAddCat() {
    setEditCatIdx(-1);
    setCatDraft("");
  }

  function cancelEditCat() { setEditCatIdx(null); }

  function saveCat() {
    const name = catDraft.trim();
    if (!name) { onToast("Category name required"); return; }

    // duplicate check (case-insensitive, excluding self when editing)
    const existing = boardCats.filter((_, i) => i !== (editCatIdx ?? -2));
    if (existing.some((c) => c.toLowerCase() === name.toLowerCase())) {
      onToast("A category with that name already exists");
      return;
    }

    let newCats: string[];
    if (editCatIdx === -1) {
      // adding new
      newCats = [...boardCats, name];
    } else {
      // editing existing
      newCats = boardCats.map((c, i) => (i === editCatIdx ? name : c));
      // also rename cat on any features in this board
      const relIds = currentBoard?.releases.map((r) => r.id) ?? [];
      const oldName = boardCats[editCatIdx!];
      if (oldName !== name) {
        // We can't mutate features here directly — pass a rename hint back via a special key
        // Instead we handle it in onSave callback path by encoding it in the boards update
        // For now we just rename in the board data; RoadmapApp will watch for __catRenames
      }
    }

    const updated = updateCurrentBoard((b) => ({
      ...b,
      categories: newCats,
      // embed rename info so parent can update feature cats atomically
      ...(editCatIdx !== null && editCatIdx >= 0 && boardCats[editCatIdx] !== name
        ? { __catRename: { from: boardCats[editCatIdx!], to: name } }
        : {}),
    }));
    setEditCatIdx(null);
    persist(updated);
    onToast(editCatIdx === -1 ? `Category "${name}" added` : "Category updated");
  }

  function deleteCat(idx: number) {
    const name = boardCats[idx];
    // ── in-use check ──
    const relIds = currentBoard?.releases.map((r) => r.id) ?? [];
    const inUse = features.filter(
      (f) => f.cat === name && relIds.includes(f.release)
    ).length;
    if (inUse > 0) {
      onToast(`Cannot delete — ${inUse} feature${inUse > 1 ? "s are" : " is"} using "${name}"`);
      return;
    }
    if (boardCats.length <= 1) {
      onToast("A board needs at least one category");
      return;
    }
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    const updated = updateCurrentBoard((b) => ({
      ...b, categories: getBoardCats(b).filter((_, i) => i !== idx),
    }));
    persist(updated);
    onToast(`Category "${name}" deleted`);
  }

  // ── BOARD CRUD ──────────────────────────────────────────────────────
  function handleAddBoard() {
    const name = newBoardName.trim();
    if (!name) return;
    onAddBoard(name);
    setNewBoardName("");
    onClose();
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="manage-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="manage-modal">
        <div className="manage-title">⚙ Board &amp; Release Settings</div>

        {/* ── BOARDS ── */}
        <div className="manage-section-title">Boards</div>
        {localBoards.map((b) => {
          const relIds = b.releases.map((r) => r.id);
          const count = features.filter((f) => relIds.includes(f.release)).length;
          return (
            <div key={b.id} className="board-row" style={{ flexWrap: "wrap", gap: 6 }}>
              <span className="board-row-name" style={{ flex: "1 1 auto" }}>
                {b.name}
                {b.id === currentBoardId && (
                  <span style={{ fontSize: 10, color: "var(--teal-dark)", fontWeight: 400, marginLeft: 6 }}>(active)</span>
                )}
              </span>
              <select
                className="timing-sel"
                value={b.owner ?? ""}
                style={{ fontSize: 12, minWidth: 120 }}
                onChange={(e) => {
                  const updated = localBoards.map((x) =>
                    x.id === b.id ? { ...x, owner: e.target.value || null } : x
                  );
                  setLocalBoards(updated);
                  persist(updated);
                }}>
                <option value="">— No owner —</option>
                {assignees.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
              <span className="board-row-count">{count} feature{count !== 1 ? "s" : ""}</span>
              {localBoards.length > 1 && (
                <button className="board-del-btn" onClick={() => onDeleteBoard(b.id)}>Delete</button>
              )}
            </div>
          );
        })}
        <div className="add-board-form">
          <input className="add-board-input" value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            placeholder="New board name…"
            onKeyDown={(e) => { if (e.key === "Enter") handleAddBoard(); }} />
          <button className="add-board-btn" onClick={handleAddBoard}>+ Add Board</button>
        </div>

        {/* ── RELEASES ── */}
        <div className="manage-section-title">
          Releases — <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{currentBoard?.name}</span>
        </div>
        {currentBoard?.releases.map((r) =>
          editRelId === r.id ? (
            <div key={r.id} className="rel-edit-form">
              <div className="rel-edit-row">
                <span className="rel-edit-label">Name</span>
                <input className="rel-edit-input" value={relName}
                  onChange={(e) => setRelName(e.target.value)} placeholder="Release name" />
              </div>
              <div className="rel-edit-row">
                <span className="rel-edit-label">Timing</span>
                <div className="timing-group">
                  <select className="timing-sel" value={relTimingType}
                    onChange={(e) => setRelTimingType(e.target.value as "month" | "quarter" | "year")}>
                    <option value="month">Month</option>
                    <option value="quarter">Quarter</option>
                    <option value="year">Year</option>
                  </select>
                  {relTimingType === "month" && (
                    <select className="timing-sel" value={relMonth}
                      onChange={(e) => setRelMonth(Number(e.target.value))}>
                      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  )}
                  {relTimingType === "quarter" && (
                    <select className="timing-sel" value={relQuarter}
                      onChange={(e) => setRelQuarter(e.target.value)}>
                      {QUARTERS.map((q) => <option key={q}>{q}</option>)}
                    </select>
                  )}
                  <input className="timing-sel rel-edit-input" type="number"
                    min={2020} max={2040} value={relYear} style={{ width: 72 }}
                    onChange={(e) => setRelYear(e.target.value)} />
                </div>
              </div>
              <div className="rel-edit-row" style={{ justifyContent: "flex-end", gap: 6 }}>
                <button className="rel-cancel-btn" onClick={cancelEditRel}>Cancel</button>
                <button className="rel-save-btn" onClick={() => saveRelEdit(r.id)}>Save</button>
              </div>
            </div>
          ) : (
            <div key={r.id} className="rel-row">
              <span className="rel-row-name">{r.name}</span>
              <span className="rel-row-timing">{formatTiming(r.timing)}</span>
              <div className="rel-row-btns">
                <button className="rel-edit-btn" onClick={() => startEditRel(r)}>Edit</button>
                <button className="rel-del-btn" onClick={() => deleteRelease(r.id)}>Delete</button>
              </div>
            </div>
          )
        )}
        <div style={{ marginTop: 8 }}>
          <button className="rel-save-btn" style={{ background: "var(--navy)" }} onClick={addRelease}>
            + Add Release
          </button>
        </div>

        {/* ── CATEGORIES ── */}
        <div className="manage-section-title">
          Categories — <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{currentBoard?.name}</span>
        </div>
        {boardCats.map((cat, idx) => {
          const relIds = currentBoard?.releases.map((r) => r.id) ?? [];
          const inUse = features.filter((f) => f.cat === cat && relIds.includes(f.release)).length;
          if (editCatIdx === idx) {
            return (
              <div key={idx} className="rel-edit-form" style={{ marginBottom: 6 }}>
                <div className="rel-edit-row">
                  <span className="rel-edit-label">Name</span>
                  <input className="rel-edit-input" value={catDraft}
                    onChange={(e) => setCatDraft(e.target.value)}
                    placeholder="Category name"
                    onKeyDown={(e) => { if (e.key === "Enter") saveCat(); if (e.key === "Escape") cancelEditCat(); }}
                    autoFocus />
                </div>
                <div className="rel-edit-row" style={{ justifyContent: "flex-end", gap: 6 }}>
                  <button className="rel-cancel-btn" onClick={cancelEditCat}>Cancel</button>
                  <button className="rel-save-btn" onClick={saveCat}>Save</button>
                </div>
              </div>
            );
          }
          return (
            <div key={idx} className="rel-row">
              <span className="rel-row-name">{cat}</span>
              <span className="rel-row-timing" style={{ color: inUse > 0 ? "var(--teal-dark)" : "var(--text3)" }}>
                {inUse > 0 ? `${inUse} feature${inUse !== 1 ? "s" : ""}` : "unused"}
              </span>
              <div className="rel-row-btns">
                <button className="rel-edit-btn" onClick={() => startEditCat(idx)}>Edit</button>
                <button className="rel-del-btn" onClick={() => deleteCat(idx)}
                  title={inUse > 0 ? `In use by ${inUse} feature${inUse !== 1 ? "s" : ""}` : ""}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {/* add new category form */}
        {editCatIdx === -1 ? (
          <div className="rel-edit-form" style={{ marginTop: 8 }}>
            <div className="rel-edit-row">
              <span className="rel-edit-label">Name</span>
              <input className="rel-edit-input" value={catDraft}
                onChange={(e) => setCatDraft(e.target.value)}
                placeholder="New category name"
                onKeyDown={(e) => { if (e.key === "Enter") saveCat(); if (e.key === "Escape") cancelEditCat(); }}
                autoFocus />
            </div>
            <div className="rel-edit-row" style={{ justifyContent: "flex-end", gap: 6 }}>
              <button className="rel-cancel-btn" onClick={cancelEditCat}>Cancel</button>
              <button className="rel-save-btn" onClick={saveCat}>Add</button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <button className="rel-save-btn" style={{ background: "var(--navy)" }} onClick={startAddCat}>
              + Add Category
            </button>
          </div>
        )}

        <div className="manage-footer">
          <button className="btn btn-teal" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
