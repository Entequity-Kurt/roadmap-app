"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { AppData, Feature, Board, Release, Assignee, Comment } from "@/lib/types";
import {
  STATUSES, DEFAULT_CATS, STATUS_CLASS, EFFORT_LABEL, MONTHS, QUARTERS, formatTiming, catStyle,
} from "@/lib/types";
import FeatureModal from "./modals/FeatureModal";
import BoardSettingsModal from "./modals/BoardSettingsModal";
import AssigneeModal from "./modals/AssigneeModal";
import ImportModal from "./modals/ImportModal";
import MultiboardTimeline from "./views/MultiboardTimeline";

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatCommentDate(ts: string) {
  if (!ts) return "";
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function cardAgeCls(f: Feature): { cls: string; label: string } {
  if (f.status === "Done") return { cls: "", label: "" };
  const ref = f.updatedAt || f.createdAt;
  if (!ref) return { cls: "", label: "" };
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  if (days < 7) return { cls: "", label: "" };
  if (days >= 21) return { cls: "age-stale", label: `🔴 No update in ${days}d` };
  if (days >= 14) return { cls: "age-warn", label: `🟡 Aging ${days}d` };
  return { cls: "", label: "" };
}


// ── Card Component (defined outside RoadmapApp to avoid stale closure issues) ──
interface CardProps {
  f: Feature;
  features: Feature[];
  releases: Release[];
  linkSource: number | null;
  linkMode: boolean;
  onOpenEdit: (feature: Feature) => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: (id: number) => void;
  onCardDragOver: (e: React.DragEvent, id: number) => void;
  onLinkClick: (e: React.MouseEvent, id: number) => boolean;
}

function Card({ f, features, releases, linkSource, onOpenEdit, onDragStart, onDragEnd, onCardDragOver, onLinkClick }: CardProps) {
  const needs = (f.deps ?? []).map((did) => features.find((x) => x.id === did)).filter(Boolean) as Feature[];
  const neededBy = features.filter((x) => x.id !== f.id && (x.deps ?? []).includes(f.id));
  const hasBlocker = needs.some((d) => d.status !== "Done");
  const age = cardAgeCls(f);
  const commentCount = (f.comments ?? []).filter((c) => c.type === "comment").length;
  const isLinkSrc = linkSource === f.id;

  return (
    <div
      className={`card${hasBlocker ? " has-blocked" : ""}${age.cls ? " " + age.cls : ""}${isLinkSrc ? " link-source" : ""}`}
      data-id={f.id} data-cat={f.cat}
      draggable
      onDragStart={(e) => onDragStart(e, f.id)}
      onDragEnd={() => onDragEnd(f.id)}
      onDragOver={(e) => onCardDragOver(e, f.id)}
      onClick={(e) => {
        if (onLinkClick(e, f.id)) return;
        onOpenEdit(f);
      }}
    >
      <div className="card-top">
        <span className={`cat-tag${catStyle(f.cat).className ? " " + catStyle(f.cat).className : ""}`} style={catStyle(f.cat).style}>{f.cat}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {f.priority && <span className={`meta-badge priority-${f.priority.toLowerCase()}`}>{f.priority}</span>}
          {f.effort && <span className={`meta-badge effort-${f.effort}`}>{EFFORT_LABEL[f.effort] ?? f.effort}</span>}
          {f.complexity && <span className={`meta-badge complexity-${f.complexity.toLowerCase()}`}>{f.complexity}</span>}
          {commentCount > 0 && <span className="comment-count-badge">💬{commentCount}</span>}
          {f.assignee && <span className="assignee-badge">{f.assignee}</span>}
          <span style={{ fontSize: 10, color: "var(--text3)" }}>edit</span>
        </div>
      </div>
      <div className="card-title">{f.title}</div>
      {f.desc && <div className="card-desc">{f.desc}</div>}
      {(needs.length > 0 || neededBy.length > 0) && (
        <div className="card-deps">
          {needs.map((d) => (
            <button key={d.id} className={`dep-badge ${d.status === "Done" ? "done-dep" : "needs"}`}
              onClick={(e) => { e.stopPropagation(); onOpenEdit(d); }}
              title={`${d.status === "Done" ? "Done" : "Waiting"}: ${d.title}`}>
              ▶ {d.title.substring(0, 18)}{d.title.length > 18 ? "…" : ""}
            </button>
          ))}
          {neededBy.map((d) => (
            <button key={d.id} className="dep-badge needed-by"
              onClick={(e) => { e.stopPropagation(); onOpenEdit(d); }}
              title={`Required by: ${d.title}`}>
              ◀ {d.title.substring(0, 18)}{d.title.length > 18 ? "…" : ""}
            </button>
          ))}
        </div>
      )}
      {age.label && <div className={`card-age ${age.cls}`}>{age.label}</div>}
      <div className="card-foot">
        <div className="slabel"><span className={`sdot ${STATUS_CLASS[f.status]}`} />{f.status}</div>
        <span className="pct-text">{f.progress}%</span>
      </div>
      <div className="pbar"><div className="pfill" style={{ width: `${f.progress}%` }} /></div>
    </div>
  );
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

// ── Main App ───────────────────────────────────────────────────────────────
export default function RoadmapApp() {
  // ── Data state ─────────────────────────────────────────────────────────
  const [features, setFeatures] = useState<Feature[]>([]);
  const featuresRef = useRef<Feature[]>([]); // always-current ref for callbacks
  const [boards, setBoards] = useState<Board[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<number>(1);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [nextId, setNextId] = useState(1);
  const nextIdRef = useRef(1); // always-current copy — avoids stale closure in saveFeature
  const [nextBoardId, setNextBoardId] = useState(2);
  const [nextRelId, setNextRelId] = useState(5);

  // ── UI state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"kanban" | "timeline" | "status" | "roadmap">("kanban");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDeps, setFilterDeps] = useState("all");
  const [swimlaneMode, setSwimlaneMode] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState(""); // filter board bar by owner
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());

  // ── Modal state ────────────────────────────────────────────────────────
  // Store the actual feature object in modal state — eliminates all lookup timing issues
  const [featureModal, setFeatureModal] = useState<{ open: boolean; feature: Feature | null }>({ open: false, feature: null });
  const editId = featureModal.feature?.id ?? null;
  const showFeatureModal = featureModal.open;
  const deleteIdRef = useRef<number | null>(null); // set at open time, used by delete
  const [showManageModal, setShowManageModal] = useState(false);
  const [showAssigneeModal, setShowAssigneeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // ── Link mode ──────────────────────────────────────────────────────────
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<number | null>(null);
  const linkToastRef = useRef<HTMLDivElement>(null);
  const previewLineRef = useRef<SVGPathElement | null>(null);

  // ── Sync state ────────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncText, setSyncText] = useState("—");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // ── Toast ─────────────────────────────────────────────────────────────
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  // ── Derived helpers ───────────────────────────────────────────────────
  const currentBoard = useMemo(
    () => boards.find((b) => b.id === currentBoardId) ?? boards[0] ?? null,
    [boards, currentBoardId]
  );
  const releases = useMemo(() => currentBoard?.releases ?? [], [currentBoard]);
  const boardCats = useMemo(() => currentBoard?.categories?.length ? currentBoard.categories : DEFAULT_CATS, [currentBoard]);

  const filteredFeatures = useMemo(() => {
    const relIds = releases.map((r) => r.id);
    return features
      .filter((f) => {
        if (!relIds.includes(f.release)) return false;
        if (filterCat !== "all" && f.cat !== filterCat) return false;
        if (filterStatus === "not-done") { if (f.status === "Done") return false; }
        else if (filterStatus !== "all" && f.status !== filterStatus) return false;
        if (filterDeps === "waiting") {
          const pending = (f.deps ?? []).some((did) => {
            const d = features.find((x) => x.id === did);
            return d && d.status !== "Done";
          });
          if (!pending) return false;
        }
        return true;
      })
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [features, releases, filterCat, filterStatus, filterDeps]);

  // Keep featuresRef in sync with features state
  useEffect(() => { featuresRef.current = features; }, [features]);

  // ── Load data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AppData = await res.json();
      setFeatures(data.features ?? []);
      // Normalize: ensure every board has a categories array (migration for legacy data)
      const normalizedBoards = (data.boards ?? []).map((b) => ({
        ...b,
        categories: b.categories?.length ? b.categories : [...DEFAULT_CATS],
      }));
      setBoards(normalizedBoards);
      setCurrentBoardId(data.currentBoardId ?? data.boards?.[0]?.id ?? 1);
      setAssignees(data.assignees ?? []);
      const loadedNextId = data.nextId ?? 1;
      setNextId(loadedNextId);
      nextIdRef.current = loadedNextId;
      setNextBoardId(data.nextBoardId ?? 2);
      setNextRelId(data.nextRelId ?? 5);
      setSyncStatus("synced");
      setSyncText("Synced ✓");
      toast("Roadmap loaded ✓");
    } catch (e) {
      setErrorMsg("Failed to load data: " + (e as Error).message);
      setSyncStatus("error");
      setSyncText("Load failed");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Save data (debounced) ─────────────────────────────────────────────
  const saveDataRef = useRef<() => void>(() => {});
  // Keep save fn up-to-date without triggering re-mounts
  useEffect(() => {
    saveDataRef.current = async () => {
      setSyncStatus("syncing");
      setSyncText("Saving…");
      try {
        const payload: AppData = {
          features, boards, currentBoardId, assignees,
          nextId, nextBoardId, nextRelId,
        };
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        isDirtyRef.current = false;
        setSyncStatus("synced");
        setSyncText("Saved ✓");
      } catch (e) {
        setSyncStatus("error");
        setSyncText("Save failed");
        setErrorMsg("Save failed — " + (e as Error).message);
      }
    };
  }, [features, boards, currentBoardId, assignees, nextId, nextBoardId, nextRelId]);

  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
    setSyncStatus("syncing");
    setSyncText("Saving…");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDataRef.current(), 1200);
  }, []);

  // openEdit — receives the feature object directly, zero lookup needed
  const openEdit = useCallback((feature: Feature) => {
    deleteIdRef.current = feature.id;  // capture id immediately at open time
    setFeatureModal({ open: true, feature });
  }, []);

  // Warn on unload if unsaved
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── Feature actions ───────────────────────────────────────────────────
  const saveFeature = useCallback((data: Partial<Feature> & { id?: number }) => {
    const now = new Date().toISOString();
    if (data.id) {
      // Update existing feature — also refresh featureModal if it's open for this feature
      setFeatures((prev) => {
        const next = prev.map((f) => f.id === data.id ? { ...f, ...data, updatedAt: now } : f);
        const updated = next.find(f => f.id === data.id);
        if (updated) setFeatureModal(m => m.open && m.feature?.id === data.id ? { ...m, feature: updated } : m);
        return next;
      });
    } else {
      // Create new feature — compute id inside setFeatures to always use latest state
      setFeatures((prev) => {
        // Compute id from actual features array — most reliable source
        const maxExistingId = prev.length > 0 ? Math.max(...prev.map(f => Number(f.id) || 0)) : 0;
        const newId = Math.max(maxExistingId + 1, nextIdRef.current);
        nextIdRef.current = newId + 1;
        setNextId(newId + 1);
        const maxOrder = Math.max(0, ...prev.filter((x) => x.release === data.release).map((x) => x.sortOrder ?? 0));
        const newF: Feature = {
          id: newId,
          title: "", desc: "", cat: "Exception Management", release: "", status: "To Do",
          progress: 0, sortOrder: maxOrder + 10, createdAt: now, updatedAt: now, comments: [],
          ...data,
        };
        return [...prev, newF];
      });
    }
    markDirty();
  }, [markDirty]);

  // ── Bulk import — adds ALL rows in a SINGLE setFeatures pass with
  //    sequential ids (max+1, +2, …). Never loop saveFeature: that risks
  //    stale-closure id collisions. Mirrors saveFeature's id logic exactly.
  const importFeatures = useCallback((rows: Array<Partial<Feature>>) => {
    if (!rows.length) return;
    const now = new Date().toISOString();
    setFeatures((prev) => {
      const maxExistingId = prev.length > 0 ? Math.max(...prev.map((f) => Number(f.id) || 0)) : 0;
      let nextNewId = Math.max(maxExistingId + 1, nextIdRef.current);
      // running max sortOrder per release, seeded from existing features
      const orderByRel: Record<string, number> = {};
      for (const f of prev) {
        orderByRel[f.release] = Math.max(orderByRel[f.release] ?? 0, f.sortOrder ?? 0);
      }
      const created: Feature[] = rows.map((data) => {
        const id = nextNewId++;
        const rel = data.release ?? "";
        const sortOrder = (orderByRel[rel] ?? 0) + 10;
        orderByRel[rel] = sortOrder;
        return {
          id,
          title: "", desc: "", cat: "Exception Management", release: "", status: "To Do",
          progress: 0, sortOrder, createdAt: now, updatedAt: now, comments: [],
          ...data,
        } as Feature;
      });
      nextIdRef.current = nextNewId;
      setNextId(nextNewId);
      return [...prev, ...created];
    });
    markDirty();
  }, [markDirty]);

  const deleteFeature = useCallback((toDelete: Feature) => {
    setFeatures((prev) => prev.filter((f) => {
      // Match by id if valid, otherwise match by title+release+createdAt
      if (!isNaN(Number(toDelete.id)) && toDelete.id != null) {
        return f.id !== toDelete.id;
      }
      // Fallback: match by title + release + createdAt for features with bad ids
      return !(f.title === toDelete.title && f.release === toDelete.release && f.createdAt === toDelete.createdAt);
    }));
    markDirty();
  }, [markDirty]);

  const addComment = useCallback((fid: number, text: string) => {
    const now = new Date().toISOString();
    setFeatures((prev) => {
      const next = prev.map((f) =>
        f.id === fid
          ? { ...f, comments: [...(f.comments ?? []), { type: "comment" as const, text, ts: now }], updatedAt: now }
          : f
      );
      // Also refresh featureModal so new comment appears immediately
      const updated = next.find(f => f.id === fid);
      if (updated) setFeatureModal(m => m.open && m.feature?.id === fid ? { ...m, feature: updated } : m);
      return next;
    });
    markDirty();
  }, [markDirty]);

  const deleteComment = useCallback((fid: number, idx: number) => {
    setFeatures((prev) => {
      const next = prev.map((f) => {
        if (f.id !== fid) return f;
        const comments = [...(f.comments ?? [])];
        comments.splice(idx, 1);
        return { ...f, comments };
      });
      const updated = next.find(f => f.id === fid);
      if (updated) setFeatureModal(m => m.open && m.feature?.id === fid ? { ...m, feature: updated } : m);
      return next;
    });
    markDirty();
  }, [markDirty]);

  const toggleDep = useCallback((fid: number, depId: number, add: boolean) => {
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.id !== fid) return f;
        const deps = f.deps ?? [];
        return { ...f, deps: add ? [...deps.filter((d) => d !== depId), depId] : deps.filter((d) => d !== depId) };
      })
    );
    markDirty();
  }, [markDirty]);

  const removeDep = useCallback((fromId: number, depId: number) => {
    toggleDep(fromId, depId, false);
  }, [toggleDep]);

  // ── Board / Release actions ───────────────────────────────────────────
  const saveBoard = useCallback((updated: Board[]) => {
    // Check for a __catRename hint placed by BoardSettingsModal
    const boardWithRename = updated.find((b) => (b as Board & { __catRename?: { from: string; to: string } }).__catRename);
    if (boardWithRename) {
      const rename = (boardWithRename as Board & { __catRename?: { from: string; to: string } }).__catRename!;
      const relIds = boardWithRename.releases.map((r) => r.id);
      setFeatures((prev) =>
        prev.map((f) =>
          relIds.includes(f.release) && f.cat === rename.from ? { ...f, cat: rename.to } : f
        )
      );
      // Strip the hint before storing
      updated = updated.map((b) => {
        const cleaned = { ...b } as Board & { __catRename?: unknown };
        delete cleaned.__catRename;
        return cleaned as Board;
      });
    }
    setBoards(updated);
    markDirty();
  }, [markDirty]);

  const switchBoard = useCallback((id: number) => {
    setCurrentBoardId(id);
    markDirty();
  }, [markDirty]);

  const quickAddBoard = useCallback(() => {
    const name = prompt("New board name:");
    if (!name?.trim()) return;
    const rid = `rb${nextRelId}`;
    const newBoard: Board = {
      id: nextBoardId, name: name.trim(),
      releases: [{ id: rid, name: "Release 1", timing: { type: "quarter", quarter: "Q1", year: String(new Date().getFullYear()) } }],
      categories: [...DEFAULT_CATS],
      owner: null,
    };
    setBoards((prev) => [...prev, newBoard]);
    setCurrentBoardId(newBoard.id);
    setNextBoardId((n) => n + 1);
    setNextRelId((n) => n + 1);
    markDirty();
    toast(`Board "${newBoard.name}" created`);
  }, [nextBoardId, nextRelId, markDirty, toast]);

  // ── Assignee actions ─────────────────────────────────────────────────
  const saveAssignees = useCallback((updated: Assignee[]) => {
    setAssignees(updated);
    markDirty();
  }, [markDirty]);

  // ── Drag & Drop ───────────────────────────────────────────────────────
  const dragCardRef = useRef<number | null>(null);
  const dropTargetRef = useRef<{ id: number; pos: "before" | "after" } | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, fid: number) => {
    if (linkMode) { e.preventDefault(); return; }
    dragCardRef.current = fid;
    e.dataTransfer.setData("text/plain", String(fid));
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      const el = document.querySelector(`.card[data-id="${fid}"]`);
      el?.classList.add("dragging");
    }, 0);
  }, [linkMode]);

  const onDragEnd = useCallback((fid: number) => {
    document.querySelector(`.card[data-id="${fid}"]`)?.classList.remove("dragging");
    document.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach((el) =>
      el.classList.remove("drag-over-top", "drag-over-bottom")
    );
    document.querySelectorAll(".col.over, .swimlane-col.over").forEach((el) => el.classList.remove("over"));
    dragCardRef.current = null;
    dropTargetRef.current = null;
  }, []);

  const onCardDragOver = useCallback((e: React.DragEvent, tid: number) => {
    if (!dragCardRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach((el) =>
      el.classList.remove("drag-over-top", "drag-over-bottom")
    );
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    dropTargetRef.current = { id: tid, pos };
    el.classList.add(pos === "before" ? "drag-over-top" : "drag-over-bottom");
    el.closest(".col, .swimlane-col")?.classList.add("over");
  }, []);

  const onCardDrop = useCallback((e: React.DragEvent, newRelId: string, newCat?: string) => {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll(".drag-over-top, .drag-over-bottom, .over").forEach((el) =>
      el.classList.remove("drag-over-top", "drag-over-bottom", "over")
    );
    const dragId = dragCardRef.current;
    if (!dragId || !dropTargetRef.current) { dragCardRef.current = null; return; }
    const { id: targetId, pos } = dropTargetRef.current;
    if (dragId === targetId) { dragCardRef.current = null; return; }

    setFeatures((prev) => {
      const moved = prev.find((x) => x.id === dragId);
      if (!moved) return prev;
      const updated = prev.map((f) => {
        if (f.id !== dragId) return f;
        return { ...f, release: newRelId, cat: newCat ?? f.cat };
      });
      const peers = updated.filter((x) => x.release === newRelId && x.id !== dragId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const tIdx = peers.findIndex((x) => x.id === targetId);
      let newOrder: number;
      if (tIdx === -1) {
        newOrder = ((peers[peers.length - 1]?.sortOrder) ?? 0) + 10;
      } else if (pos === "before") {
        const prev2 = peers[tIdx - 1], cur = peers[tIdx];
        const s1 = prev2?.sortOrder ?? ((cur.sortOrder ?? 0) - 20), s2 = cur.sortOrder ?? 0;
        newOrder = (s1 + s2) / 2;
      } else {
        const cur = peers[tIdx], next = peers[tIdx + 1];
        const s1 = cur.sortOrder ?? 0, s2 = next?.sortOrder ?? ((cur.sortOrder ?? 0) + 20);
        newOrder = (s1 + s2) / 2;
      }
      return updated.map((f) => f.id === dragId ? { ...f, sortOrder: newOrder } : f);
    });

    dragCardRef.current = null;
    dropTargetRef.current = null;
    markDirty();
  }, [markDirty]);

  const onColDrop = useCallback((e: React.DragEvent, newRelId: string, newCat?: string) => {
    e.preventDefault();
    document.querySelectorAll(".over").forEach((el) => el.classList.remove("over"));
    if (!dragCardRef.current || dropTargetRef.current) { dragCardRef.current = null; return; }
    const dragId = dragCardRef.current;
    setFeatures((prev) => {
      const f = prev.find((x) => x.id === dragId);
      if (!f || (f.release === newRelId && (!newCat || f.cat === newCat))) return prev;
      const peers = prev.filter((x) => x.release === newRelId && x.id !== dragId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const newOrder = ((peers[peers.length - 1]?.sortOrder) ?? 0) + 10;
      return prev.map((x) => x.id === dragId ? { ...x, release: newRelId, cat: newCat ?? x.cat, sortOrder: newOrder } : x);
    });
    dragCardRef.current = null;
    markDirty();
  }, [markDirty]);

  // ── Link mode ─────────────────────────────────────────────────────────
  const showLinkToast = useCallback((msg: string) => {
    if (linkToastRef.current) {
      linkToastRef.current.textContent = msg;
      linkToastRef.current.classList.toggle("show", !!msg);
    }
  }, []);

  const toggleLinkMode = useCallback(() => {
    setLinkMode((prev) => {
      const next = !prev;
      if (!next) {
        setLinkSource(null);
        if (previewLineRef.current) { previewLineRef.current.remove(); previewLineRef.current = null; }
        showLinkToast("");
      } else {
        showLinkToast("Click a card to start linking — then click another to create the dependency");
      }
      return next;
    });
  }, [showLinkToast]);

  const handleCardLinkClick = useCallback((e: React.MouseEvent, fid: number) => {
    if (!linkMode) return false;
    e.stopPropagation();
    e.preventDefault();
    if (!linkSource) {
      setLinkSource(fid);
      showLinkToast("Now click the card that DEPENDS ON this one");
      return true;
    }
    if (fid === linkSource) {
      setLinkSource(null);
      showLinkToast("Click a different card");
      return true;
    }
    const tgt = features.find((f) => f.id === fid);
    const src = features.find((f) => f.id === linkSource);
    if (!tgt || !src) { setLinkSource(null); return true; }
    const alreadyLinked = (tgt.deps ?? []).includes(linkSource);
    toggleDep(fid, linkSource, !alreadyLinked);
    toast(alreadyLinked
      ? `Removed link between "${src.title}" and "${tgt.title}"`
      : `"${tgt.title}" now depends on "${src.title}"`
    );
    setLinkSource(null);
    if (previewLineRef.current) { previewLineRef.current.remove(); previewLineRef.current = null; }
    showLinkToast("Link updated! Click another card to continue, or click ⟶ Link to exit.");
    return true;
  }, [linkMode, linkSource, features, toggleDep, toast, showLinkToast]);

  // Mouse move for preview line
  useEffect(() => {
    if (!linkMode || !linkSource) return;
    const handler = (e: MouseEvent) => {
      const svg = document.getElementById("depSvg") as SVGElement | null;
      const wrap = document.querySelector(".kanban-wrap");
      if (!svg || !wrap) return;
      if (!previewLineRef.current) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.setAttribute("class", "link-preview-line");
        svg.appendChild(line);
        previewLineRef.current = line;
      }
      const wRect = wrap.getBoundingClientRect();
      const srcEl = wrap.querySelector(`.card[data-id="${linkSource}"]`);
      if (!srcEl) return;
      const sR = srcEl.getBoundingClientRect();
      const x1 = sR.right - wRect.left, y1 = sR.top + sR.height / 2 - wRect.top;
      const x2 = e.clientX - wRect.left, y2 = e.clientY - wRect.top;
      const cx1 = x1 + Math.abs(x2 - x1) * 0.4, cx2 = x2 - Math.abs(x2 - x1) * 0.4;
      previewLineRef.current.setAttribute("d", `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [linkMode, linkSource]);

  // ── Draw dep lines ─────────────────────────────────────────────────────
  const drawDepLines = useCallback(() => {
    const svg = document.getElementById("depSvg");
    if (!svg) return;
    svg.querySelectorAll(".dep-line").forEach((l) => l.remove());
    const wrap = svg.parentElement;
    if (!wrap) return;
    const wRect = wrap.getBoundingClientRect();
    features.forEach((f) => {
      (f.deps ?? []).forEach((did) => {
        const dep = features.find((x) => x.id === did);
        if (!dep) return;
        const fromEl = wrap.querySelector(`.card[data-id="${dep.id}"]`);
        const toEl = wrap.querySelector(`.card[data-id="${f.id}"]`);
        if (!fromEl || !toEl) return;
        const fR = fromEl.getBoundingClientRect(), tR = toEl.getBoundingClientRect();
        const x1 = fR.right - wRect.left, y1 = fR.top + fR.height / 2 - wRect.top;
        const x2 = tR.left - wRect.left, y2 = tR.top + tR.height / 2 - wRect.top;
        const cx1 = x1 + Math.abs(x2 - x1) * 0.45, cx2 = x2 - Math.abs(x2 - x1) * 0.45;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`);
        path.setAttribute("class", `dep-line${dep.status === "Done" ? " done" : ""}`);
        path.setAttribute("marker-end", dep.status === "Done" ? "url(#arrowDone)" : "url(#arrow)");
        svg.appendChild(path);
      });
    });
  }, [features]);

  useEffect(() => {
    if (activeTab === "kanban") {
      requestAnimationFrame(() => requestAnimationFrame(drawDepLines));
    }
  }, [filteredFeatures, activeTab, collapsedCols, swimlaneMode, drawDepLines]);

  // ── Export CSV ────────────────────────────────────────────────────────
  const doExport = useCallback(() => {
    const rows = [["Title", "Category", "Release", "Quarter", "Status", "Progress %"]];
    filteredFeatures.forEach((f) => {
      const r = releases.find((x) => x.id === f.release);
      rows.push([f.title, f.cat, r?.name ?? f.release, formatTiming(r?.timing), f.status, String(f.progress)]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "roadmap.csv";
    a.click();
    toast("CSV exported");
  }, [filteredFeatures, releases, toast]);

  // ── Stats ─────────────────────────────────────────────────────────────
  const relIds = releases.map((r) => r.id);
  const boardFeatures = features.filter((f) => relIds.includes(f.release));
  const statDone = boardFeatures.filter((f) => f.status === "Done").length;
  const statProg = boardFeatures.filter((f) => f.status === "In Progress").length;
  const statBlocked = boardFeatures.filter((f) => f.status === "Blocked").length;
  const statPct = boardFeatures.length ? Math.round(boardFeatures.reduce((s, f) => s + f.progress, 0) / boardFeatures.length) : 0;

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showImportModal) setShowImportModal(false);
        else if (showAssigneeModal) setShowAssigneeModal(false);
        else if (linkMode) toggleLinkMode();
        else if (showFeatureModal) setFeatureModal({ open: false, feature: null });
        else if (showManageModal) setShowManageModal(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAssigneeModal, linkMode, showFeatureModal, showManageModal, showImportModal, toggleLinkMode]);

  // CardEl — thin wrapper that passes stable props to the Card component above
  const cardProps = useCallback((f: Feature) => ({
    f, features, releases, linkSource, linkMode,
    onOpenEdit: openEdit,
    onDragStart, onDragEnd, onCardDragOver,
    onLinkClick: handleCardLinkClick,
  }), [features, releases, linkSource, linkMode, openEdit, onDragStart, onDragEnd, onCardDragOver, handleCardLinkClick]);

  // ── Kanban View ───────────────────────────────────────────────────────
  const KanbanView = () => {
    const ColHeader = ({ rel, cards }: { rel: Release; cards: Feature[] }) => {
      const collapsed = collapsedCols.has(rel.id);
      const timing = formatTiming(rel.timing);
      return (
        <div className={`col${collapsed ? " collapsed" : ""}`} data-relid={rel.id}
          onDragOver={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add("over"); }}
          onDragLeave={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
              (e.currentTarget as HTMLElement).classList.remove("over");
          }}
          onDrop={(e) => onColDrop(e, rel.id)}>
          <div className="col-hd">
            <div className="col-title">{rel.name}</div>
            <div className="col-meta">
              {!collapsed && timing && <span className="q-badge">{timing}</span>}
              {!collapsed && <span className="n-badge">{cards.length}</span>}
              <button className="col-collapse-btn"
                onClick={(e) => { e.stopPropagation(); setCollapsedCols((prev) => { const n = new Set(prev); n.has(rel.id) ? n.delete(rel.id) : n.add(rel.id); return n; }); }}>
                {collapsed ? "▶" : "◀"}
              </button>
            </div>
          </div>
          {!collapsed && (
            <div className="cards-list">
              {cards.length === 0
                ? <div className="empty-col">Drop features here</div>
                : cards.map((f) => (
                  <div key={f.id} onDrop={(e) => onCardDrop(e, rel.id)}>
                    <Card {...cardProps(f)} />
                  </div>
                ))}
            </div>
          )}
        </div>
      );
    };

    if (swimlaneMode) {
      return (
        <div className="kanban-wrap">
          <svg id="depSvg">
            <defs>
              <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L7,3.5 Z" fill="#f0a030" opacity="0.7" />
              </marker>
              <marker id="arrowDone" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L7,3.5 Z" fill="#3aaa90" opacity="0.5" />
              </marker>
            </defs>
          </svg>
          <div className="kanban swimlane-wrap">
            <div className="swimlane-header-row">
              {releases.map((rel) => (
                <div key={rel.id} className="swimlane-col-hd">
                  <span className="swimlane-col-hd-title">{rel.name}</span>
                  <div className="swimlane-col-hd-meta">
                    {rel.timing && <span className="q-badge">{formatTiming(rel.timing)}</span>}
                    <span className="n-badge">{filteredFeatures.filter((f) => f.release === rel.id).length}</span>
                  </div>
                </div>
              ))}
            </div>
            {boardCats.map((cat, ci) => {
              const laneCards = filteredFeatures.filter((f) => f.cat === cat);
              if (!laneCards.length) return null;
              return (
                <div key={cat}>
                  <div className="swimlane" data-cat={cat}>
                    <div className="swimlane-hd">{cat.replace(" ", "\n")}</div>
                    {releases.map((rel) => {
                      const cards = laneCards.filter((f) => f.release === rel.id);
                      return (
                        <div key={rel.id} className="swimlane-col" data-relid={rel.id} data-cat={cat}
                          onDragOver={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add("over"); }}
                          onDragLeave={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
                              (e.currentTarget as HTMLElement).classList.remove("over");
                          }}
                          onDrop={(e) => onColDrop(e, rel.id, cat)}>
                          {cards.map((f) => (
                            <div key={f.id} onDrop={(e) => onCardDrop(e, rel.id, cat)}>
                              <Card {...cardProps(f)} />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {ci < boardCats.length - 1 && <div className="swimlane-divider" />}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="kanban-wrap">
        <svg id="depSvg">
          <defs>
            <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L7,3.5 Z" fill="#f0a030" opacity="0.7" />
            </marker>
            <marker id="arrowDone" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L7,3.5 Z" fill="#3aaa90" opacity="0.5" />
            </marker>
          </defs>
        </svg>
        <div className={`kanban${linkMode ? " link-mode-active" : ""}`}>
          {releases.map((rel) => (
            <ColHeader key={rel.id} rel={rel} cards={filteredFeatures.filter((f) => f.release === rel.id)} />
          ))}
        </div>
      </div>
    );
  };

  // ── Timeline View ─────────────────────────────────────────────────────
  const TimelineView = () => (
    <div className="tl" style={{ "--col-count": releases.length } as React.CSSProperties}>
      <div className="tl-head">
        <div className="tl-hc lbl">Category</div>
        {releases.map((r) => (
          <div key={r.id} className="tl-hc">
            {r.name}<br />
            <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.65 }}>{formatTiming(r.timing)}</span>
          </div>
        ))}
      </div>
      {boardCats.map((cat, i) => (
        <div key={cat}>
          <div className="tl-row">
            <div className="tl-cat">{cat}</div>
            {releases.map((rel) => {
              const items = filteredFeatures.filter((f) => f.cat === cat && f.release === rel.id);
              return items.length === 0 ? (
                <div key={rel.id} className="tl-cell tl-empty" />
              ) : (
                <div key={rel.id} className="tl-cell"
                  onClick={() => openEdit(items[0])}>
                  {items.map((f, fi) => (
                    <div key={f.id} style={{ marginTop: fi > 0 ? 8 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span className={`sdot ${STATUS_CLASS[f.status]}`} style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                        <span className="tl-item-title" style={{ margin: 0 }}>{f.title}</span>
                        <span style={{ fontSize: 10, color: "var(--text3)", whiteSpace: "nowrap" }}>{f.status} · {f.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {i < boardCats.length - 1 && <div className="tl-divider" />}
        </div>
      ))}
    </div>
  );

  // ── Status Table View ─────────────────────────────────────────────────
  const StatusTableView = () => (
    <div>
      {releases.map((rel) => {
        const relFeatures = filteredFeatures.filter((f) => f.release === rel.id);
        if (relFeatures.length === 0) return null;
        const relDone = relFeatures.filter((f) => f.status === "Done").length;
        const relPct = Math.round(relFeatures.reduce((s, f) => s + f.progress, 0) / relFeatures.length);
        return (
          <div key={rel.id} style={{ marginBottom: 28 }}>
            {/* Release header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0 8px", borderBottom: "2px solid var(--teal-light)", marginBottom: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>{rel.name}</span>
              {rel.timing && <span className="q-badge">{formatTiming(rel.timing)}</span>}
              <span style={{ fontSize: 11, color: "var(--text3)" }}>{relDone}/{relFeatures.length} done · {relPct}%</span>
              <div style={{ flex: 1, height: 4, background: "var(--sand3)", borderRadius: 999, overflow: "hidden", maxWidth: 120 }}>
                <div style={{ height: "100%", width: `${relPct}%`, background: "var(--teal)", borderRadius: 999 }} />
              </div>
            </div>
            <table className="st-table" style={{ borderRadius: 0, boxShadow: "none", borderTop: "none" }}>
              <thead>
                <tr>
                  <th>Feature</th><th>Category</th><th>Release</th>
                  <th>Status</th><th>Progress %</th><th></th>
                </tr>
              </thead>
              <tbody>
                {relFeatures.map((f) => {
                  const depCount = (f.deps ?? []).length;
                  const blockedCount = (f.deps ?? []).filter((did) => {
                    const d = features.find((x) => x.id === did);
                    return d && d.status !== "Done";
                  }).length;
                  return (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 500, cursor: "pointer", color: "var(--teal-dark)" }}
                        onClick={() => openEdit(f)}>
                        {f.title}
                        {depCount > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 400, color: blockedCount ? "#c00" : "var(--text3)", marginLeft: 6 }}>
                            {blockedCount ? `⚠ ${blockedCount} blocker${blockedCount > 1 ? "s" : ""}` : `${depCount} dep${depCount > 1 ? "s" : ""}`}
                          </span>
                        )}
                      </td>
                      <td><span className={`cat-tag${catStyle(f.cat).className ? " " + catStyle(f.cat).className : ""}`} style={catStyle(f.cat).style}>{f.cat}</span></td>
                      <td>
                        <select className="sel" value={f.release}
                          onChange={(e) => {
                            const newRel = e.target.value;
                            saveFeature({ id: f.id, release: newRel });
                            const r = releases.find((x) => x.id === newRel);
                            toast(`Moved to ${r?.name ?? newRel}`);
                          }}>
                          {releases.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="sel" value={f.status}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "Done" && f.progress < 100) { toast("Set progress to 100% to mark Done"); return; }
                            saveFeature({ id: f.id, status: v });
                          }}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ minWidth: 160 }}>
                        <div className="prog-wrap">
                          <div className="pbar" style={{ flex: 1 }}>
                            <div className="pfill" style={{ width: `${f.progress}%` }} />
                          </div>
                          <input className="prog-input" type="number" min={0} max={100} value={f.progress}
                            onChange={(e) => {
                              const pct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              saveFeature({ id: f.id, progress: pct, status: pct === 100 ? "Done" : (f.status === "Done" ? "In Progress" : f.status) });
                            }} />
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-sm" style={{ background: "var(--sand2)", color: "var(--text2)" }}
                          onClick={() => openEdit(f)}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Loading overlay */}
      {loading && (
        <div className="load-overlay">
          <div className="spinner" />
          <div className="load-msg">Loading roadmap…</div>
        </div>
      )}

      {/* Header */}
      <header>
        <div className="logo">
          <div className="logo-mark"><span className="d1" /><span className="d2" /></div>
          <span className="logo-text">AP Matching Roadmap</span>
          <div className="logo-sep" />
          <span className="logo-sub">2026</span>
        </div>
        <div className="header-right">
          <div className="sync-pill">
            <div className={`sync-dot ${syncStatus}`} />
            <span>{syncText}</span>
          </div>
          <button className={`btn btn-ghost btn-sm${linkMode ? " active" : ""}`}
            onClick={toggleLinkMode} title="Click two cards to link them">⟶ Link</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setFeatureModal({ open: true, feature: null })}>+ Add Feature</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowImportModal(true)}>⬆ Import</button>
          <button className="btn btn-ghost btn-sm" onClick={doExport}>Export CSV</button>
        </div>
      </header>

      {/* Board bar */}
      <div className="board-bar">
        {boards
          .filter(b => !ownerFilter || b.owner === ownerFilter)
          .map((b) => (
            <button key={b.id} className={`board-tab${b.id === currentBoardId ? " active" : ""}`}
              onClick={() => switchBoard(b.id)}>
              {b.name}
              {b.owner && !ownerFilter && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>({b.owner})</span>}
            </button>
          ))}
        <button className="board-tab-add" onClick={quickAddBoard} title="Add board">＋</button>
        {/* Owner filter */}
        {assignees.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Owner</span>
            <select value={ownerFilter} onChange={e => {
                const owner = e.target.value;
                setOwnerFilter(owner);
                if (owner) {
                  // Auto-switch to first board owned by this person
                  const firstBoard = boards.find(b => b.owner === owner);
                  if (firstBoard) switchBoard(firstBoard.id);
                }
              }}
              style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, padding: "3px 8px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "rgba(255,255,255,0.8)", cursor: "pointer", outline: "none" }}>
              <option value="">All</option>
              {assignees.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
        )}
        <button className="board-settings-btn" onClick={() => setShowManageModal(true)}>⚙ Manage</button>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="err-banner show">
          <span>⚠</span><span>{errorMsg}</span>
          <button className="btn btn-sm" style={{ background: "#fee", color: "#c00", marginLeft: "auto" }}
            onClick={() => setErrorMsg("")}>Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {(["kanban", "timeline", "status", "roadmap"] as const).map((tab) => (
          <button key={tab} className={`tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}>
            {tab === "kanban" ? "Kanban Board" : tab === "timeline" ? "Timeline" : tab === "status" ? "Status Table" : "Multi-Board Roadmap"}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="filterbar">
        <div className="filterbar-row">
          <span className="filter-label">Category</span>
          {["all", ...boardCats].map((cat) => (
            <button key={cat} className={`chip${filterCat === cat ? " on" : ""}`}
              onClick={() => setFilterCat(cat)}>
              {cat === "all" ? "All" : cat === "Exception Management" ? "Exception Mgmt" : cat}
            </button>
          ))}
        </div>
        <div className="filterbar-row">
          <span className="filter-label">Status</span>
          {["all", "not-done", ...STATUSES].map((s) => (
            <button key={s} className={`chip${filterStatus === s ? " on" : ""}`}
              onClick={() => setFilterStatus(s)}>
              {s === "all" ? "All" : s === "not-done" ? "Not Done" : s}
            </button>
          ))}
          <div className="fsep" />
          <span className="filter-label">Deps</span>
          <button className={`chip${filterDeps === "waiting" ? " on" : ""}`}
            onClick={() => setFilterDeps((p) => p === "waiting" ? "all" : "waiting")}>
            Waiting on deps
          </button>
          <div className="fsep" />
          <span className="filter-label">View</span>
          <button className={`chip${swimlaneMode ? " on" : ""}`}
            onClick={() => setSwimlaneMode((p) => !p)}>Swimlanes</button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="statsbar">
        {[
          { n: boardFeatures.length, l: "Features" },
          { n: statDone, l: "Done" },
          { n: statProg, l: "In Progress" },
          { n: statBlocked, l: "Blocked" },
          { n: `${statPct}%`, l: "Overall" },
        ].map((s) => (
          <div key={s.l} className="stat">
            <div className="stat-n">{s.n}</div>
            <div className="stat-l">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Views */}
      <div className={`view${activeTab === "kanban" ? " active" : ""}`} id="view-kanban">
        <div className="kanban-scroll">
          <KanbanView />
        </div>
      </div>
      <div className={`view${activeTab === "timeline" ? " active" : ""}`} id="view-timeline">
        <div className="tl-scroll">
          <TimelineView />
        </div>
      </div>
      <div className={`view${activeTab === "status" ? " active" : ""}`} id="view-status">
        <div className="st-wrap">
          <StatusTableView />
        </div>
      </div>

      {/* Link toast */}
      <div id="linkToast" ref={linkToastRef} />

      {/* Multi-Board Roadmap View */}
      <div className={`view${activeTab === "roadmap" ? " active" : ""}`} id="view-roadmap">
        <MultiboardTimeline
          boards={boards}
          features={features}
          assignees={assignees}
          onOpenEdit={openEdit}
        />
      </div>

      {/* Toast */}
      <div className={`toast${toastMsg ? " show" : ""}`}>{toastMsg}</div>

      {/* Modals */}
      {showFeatureModal && (
        <FeatureModal
          feature={featureModal.feature}
          features={features}
          releases={releases}
          categories={boardCats}
          assignees={assignees}
          onSave={(data) => { saveFeature(data); toast(editId ? "Feature updated" : "Feature added"); setFeatureModal({ open: false, feature: null }); }}
          onUpdate={(data) => { saveFeature(data); }}
          onDelete={(feature) => { deleteFeature(feature); setFeatureModal({ open: false, feature: null }); toast("Deleted"); }}
          onClose={() => setFeatureModal({ open: false, feature: null })}
          onAddComment={addComment}
          onDeleteComment={deleteComment}
          onToggleDep={toggleDep}
          onRemoveDep={removeDep}
          onOpenAssignees={() => setShowAssigneeModal(true)}
          onToast={toast}
        />
      )}
      {showManageModal && (
        <BoardSettingsModal
          boards={boards}
          features={features}
          assignees={assignees}
          currentBoardId={currentBoardId}
          nextRelId={nextRelId}
          onSave={(updated, newRelId) => {
            saveBoard(updated);
            if (newRelId != null) setNextRelId(newRelId);
          }}
          onSwitchBoard={switchBoard}
          onDeleteBoard={(id) => {
            const b = boards.find((x) => x.id === id);
            const relIds2 = b?.releases.map((r) => r.id) ?? [];
            const affected = features.filter((f) => relIds2.includes(f.release)).length;
            if (!confirm(`Delete board "${b?.name}"?${affected > 0 ? ` ${affected} feature(s) will be deleted.` : ""} This cannot be undone.`)) return;
            const newBoards = boards.filter((x) => x.id !== id);
            setBoards(newBoards);
            if (affected > 0) setFeatures((prev) => prev.filter((f) => !relIds2.includes(f.release)));
            if (currentBoardId === id) setCurrentBoardId(newBoards[0]?.id ?? 1);
            markDirty();
            toast("Board deleted");
          }}
          onAddBoard={(name) => {
            const rid = `rb${nextRelId}`;
            const newBoard: Board = {
              id: nextBoardId, name,
              releases: [{ id: rid, name: "Release 1", timing: { type: "quarter", quarter: "Q1", year: String(new Date().getFullYear()) } }],
              categories: [...DEFAULT_CATS],
            };
            setBoards((prev) => [...prev, newBoard]);
            setCurrentBoardId(newBoard.id);
            setNextBoardId((n) => n + 1);
            setNextRelId((n) => n + 1);
            markDirty();
            toast(`Board "${name}" created`);
          }}
          onClose={() => setShowManageModal(false)}
          onToast={toast}
        />
      )}
      {showAssigneeModal && (
        <AssigneeModal
          assignees={assignees}
          onSave={saveAssignees}
          onClose={() => setShowAssigneeModal(false)}
          onToast={toast}
        />
      )}
      {showImportModal && (
        <ImportModal
          boards={boards}
          currentBoardId={currentBoardId}
          assignees={assignees}
          onConfirm={(boardId, rows) => {
            if (boardId !== currentBoardId) switchBoard(boardId);
            importFeatures(rows);
            setShowImportModal(false);
            toast(`Imported ${rows.length} feature${rows.length === 1 ? "" : "s"} ✓`);
          }}
          onClose={() => setShowImportModal(false)}
          onToast={toast}
        />
      )}
    </>
  );
}
