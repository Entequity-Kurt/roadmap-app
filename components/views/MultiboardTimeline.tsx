"use client";

import { useState, useMemo } from "react";
import type { Board, Feature, Assignee } from "@/lib/types";
import { STATUS_CLASS, formatTiming, catStyle } from "@/lib/types";

interface Props {
  boards: Board[];
  features: Feature[];
  assignees: Assignee[];
  onOpenEdit: (feature: Feature) => void;
}

export default function MultiboardTimeline({ boards, features, assignees, onOpenEdit }: Props) {
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<number>>(new Set(boards.map(b => b.id)));
  const [ownerFilter, setOwnerFilter] = useState("");

  // Boards visible after owner filter
  const visibleBoards = useMemo(() =>
    boards.filter(b => {
      if (ownerFilter && b.owner !== ownerFilter) return false;
      return selectedBoardIds.has(b.id);
    }),
    [boards, selectedBoardIds, ownerFilter]
  );

  function toggleBoard(id: number) {
    setSelectedBoardIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedBoardIds(new Set(boards.map(b => b.id))); }
  function selectNone() { setSelectedBoardIds(new Set()); }

  // Build columns: one per release across all visible boards
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const cols: { boardId: number; boardName: string; releaseId: string; releaseName: string; timing: string }[] = [];
    visibleBoards.forEach(b => {
      b.releases.forEach(r => {
        const key = `${b.id}:${r.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          cols.push({
            boardId: b.id,
            boardName: b.name,
            releaseId: r.id,
            releaseName: r.name,
            timing: formatTiming(r.timing),
          });
        }
      });
    });
    return cols;
  }, [visibleBoards]);

  // All categories across visible boards
  const allCats = useMemo(() => {
    const cats = new Set<string>();
    visibleBoards.forEach(b => (b.categories ?? []).forEach(c => cats.add(c)));
    return Array.from(cats);
  }, [visibleBoards]);

  // Features for visible boards
  const visibleRelIds = new Set(columns.map(c => c.releaseId));
  const visibleFeatures = features.filter(f => visibleRelIds.has(f.release));

  if (boards.length === 0) return <div style={{ padding: 40, color: "var(--text3)" }}>No boards yet.</div>;

  return (
    <div style={{ padding: "20px 28px" }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 20 }}>
        {/* Board selector */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", minWidth: 220 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 8 }}>
            Boards
            <button onClick={selectAll} style={{ marginLeft: 8, fontSize: 10, color: "var(--teal-dark)", background: "none", border: "none", cursor: "pointer" }}>All</button>
            <button onClick={selectNone} style={{ marginLeft: 4, fontSize: 10, color: "var(--text3)", background: "none", border: "none", cursor: "pointer" }}>None</button>
          </div>
          {boards.map(b => (
            <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={selectedBoardIds.has(b.id)} onChange={() => toggleBoard(b.id)}
                style={{ accentColor: "var(--teal)", cursor: "pointer" }} />
              <span style={{ flex: 1 }}>{b.name}</span>
              {b.owner && <span style={{ fontSize: 10, color: "var(--teal-dark)", background: "var(--teal-bg)", padding: "1px 6px", borderRadius: 999, border: "1px solid var(--teal-light)" }}>{b.owner}</span>}
            </label>
          ))}
        </div>

        {/* Owner filter */}
        {assignees.length > 0 && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginBottom: 8 }}>Filter by Owner</div>
            <select value={ownerFilter}
              onChange={e => { setOwnerFilter(e.target.value); if (e.target.value) setSelectedBoardIds(new Set(boards.filter(b => b.owner === e.target.value).map(b => b.id))); else selectAll(); }}
              style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "white", cursor: "pointer", outline: "none", minWidth: 160 }}>
              <option value="">— All owners —</option>
              {assignees.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
        )}

        {/* Summary */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--teal-dark)", fontFamily: "DM Mono, monospace" }}>{visibleBoards.length}</div>
            <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Boards</div>
          </div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--teal-dark)", fontFamily: "DM Mono, monospace" }}>{visibleFeatures.length}</div>
            <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Features</div>
          </div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--teal-dark)", fontFamily: "DM Mono, monospace" }}>
              {visibleFeatures.length ? Math.round(visibleFeatures.reduce((s, f) => s + f.progress, 0) / visibleFeatures.length) : 0}%
            </div>
            <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Overall</div>
          </div>
        </div>
      </div>

      {/* Timeline grid */}
      {visibleBoards.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 14 }}>
          Select at least one board above to see the timeline.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 800 }}>
            {/* Board group headers */}
            {visibleBoards.map(board => {
              const boardCols = columns.filter(c => c.boardId === board.id);
              const boardFeatures = visibleFeatures.filter(f => boardCols.some(c => c.releaseId === f.release));
              const boardDone = boardFeatures.filter(f => f.status === "Done").length;
              const boardPct = boardFeatures.length ? Math.round(boardFeatures.reduce((s, f) => s + f.progress, 0) / boardFeatures.length) : 0;
              const boardCats = board.categories?.length ? board.categories : allCats;

              return (
                <div key={board.id} style={{ marginBottom: 32 }}>
                  {/* Board header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "10px 14px", background: "var(--navy)", borderRadius: "var(--radius)", color: "white" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{board.name}</span>
                    {board.owner && (
                      <span style={{ fontSize: 11, background: "rgba(255,255,255,0.15)", padding: "2px 10px", borderRadius: 999 }}>
                        👤 {board.owner}
                      </span>
                    )}
                    <span style={{ fontSize: 11, opacity: 0.6 }}>{boardDone}/{boardFeatures.length} done · {boardPct}%</span>
                  </div>

                  {/* Column headers for this board */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: `160px repeat(${boardCols.length}, 1fr)`,
                    gap: 2, marginBottom: 2
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", padding: "8px 10px" }}>Category</div>
                    {boardCols.map(col => (
                      <div key={col.releaseId} style={{
                        fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                        color: "var(--teal-dark)", background: "var(--teal-bg)",
                        padding: "9px 14px", borderRadius: "var(--radius-sm)", textAlign: "center"
                      }}>
                        {col.releaseName}
                        {col.timing && <div style={{ fontWeight: 400, fontSize: 10, opacity: 0.65 }}>{col.timing}</div>}
                      </div>
                    ))}
                  </div>

                  {/* Rows per category */}
                  {boardCats.map((cat, ci) => {
                    const hasAny = boardCols.some(col => visibleFeatures.some(f => f.cat === cat && f.release === col.releaseId));
                    if (!hasAny) return null;
                    return (
                      <div key={cat} style={{
                        display: "grid",
                        gridTemplateColumns: `160px repeat(${boardCols.length}, 1fr)`,
                        gap: 2, marginBottom: 2
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)", padding: "8px 10px", display: "flex", alignItems: "center" }}>{cat}</div>
                        {boardCols.map(col => {
                          const items = visibleFeatures.filter(f => f.cat === cat && f.release === col.releaseId);
                          return items.length === 0 ? (
                            <div key={col.releaseId} style={{ background: "var(--sand2)", borderRadius: "var(--radius-sm)", minHeight: 50 }} />
                          ) : (
                            <div key={col.releaseId} style={{ background: "white", padding: "8px 10px", borderRadius: "var(--radius-sm)", cursor: "pointer", transition: "background 0.15s" }}
                              onClick={() => onOpenEdit(items[0])}
                              onMouseEnter={e => (e.currentTarget.style.background = "var(--teal-bg)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                              {items.map((f, fi) => (
                                <div key={f.id} style={{ marginTop: fi > 0 ? 8 : 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span className={`sdot ${STATUS_CLASS[f.status]}`} style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{f.title}</span>
                                  <span style={{ fontSize: 10, color: "var(--text3)", whiteSpace: "nowrap" }}>{f.status} · {f.progress}%</span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}


                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
