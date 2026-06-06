"use client";

import { useState, useEffect, useRef } from "react";
import type { Feature, Release, Assignee, Task } from "@/lib/types";
import { STATUSES, STATUS_CLASS } from "@/lib/types";

interface Props {
  feature: Feature | null;       // null = new feature
  features: Feature[];           // full list for dep picker
  releases: Release[];
  categories: string[];
  assignees: Assignee[];
  onSave: (data: Partial<Feature> & { id?: number }) => void;
  onUpdate: (data: Partial<Feature> & { id?: number }) => void; // save without closing
  onDelete: (feature: Feature) => void;
  onClose: () => void;
  onAddComment: (fid: number, text: string) => void;
  onDeleteComment: (fid: number, idx: number) => void;
  onToggleDep: (fid: number, depId: number, add: boolean) => void;
  onRemoveDep: (fromId: number, depId: number) => void;
  onOpenAssignees: () => void;
  onToast: (msg: string) => void;
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

export default function FeatureModal({
  feature, features, releases, categories, assignees,
  onSave, onUpdate, onDelete, onClose,
  onAddComment, onDeleteComment, onToggleDep, onRemoveDep,
  onOpenAssignees, onToast,
}: Props) {
  const isNew = feature == null;
  const editId = feature?.id ?? null;

  // ── Delete — passes full feature object to parent, no id lookup needed
  function handleDelete() {
    if (!feature) return;
    if (!confirm(`Delete "${feature.title}"?`)) return;
    onDelete(feature);
  }

  // ── Form state ──────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState(categories[0] ?? "");
  const [release, setRelease] = useState(releases[0]?.id ?? "");
  const [status, setStatus] = useState("To Do");
  const [progress, setProgress] = useState(0);
  const [priority, setPriority] = useState("");
  const [effort, setEffort] = useState("");
  const [complexity, setComplexity] = useState("");
  const [assignee, setAssignee] = useState("");
  const [commentText, setCommentText] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  // Populate fields from feature prop whenever feature changes
  useEffect(() => {
    if (feature) {
      setTitle(feature.title ?? "");
      setDesc(feature.desc ?? "");
      setCat(feature.cat ?? categories[0] ?? "");
      setRelease(feature.release ?? releases[0]?.id ?? "");
      setStatus(feature.status ?? "To Do");
      setProgress(feature.progress ?? 0);
      setPriority(feature.priority ?? "");
      setEffort(feature.effort ?? "");
      setComplexity(feature.complexity ?? "");
      setAssignee(feature.assignee ?? "");
    } else {
      setTitle("");
      setDesc("");
      setCat(categories[0] ?? "");
      setRelease(releases[0]?.id ?? "");
      setStatus("To Do");
      setProgress(0);
      setPriority("");
      setEffort("");
      setComplexity("");
      setAssignee("");
    }
    setCommentText("");
    setNewTaskTitle("");
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [feature]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync status ↔ progress ──────────────────────────────────────────
  function handleProgressChange(v: number) {
    const pct = Math.min(100, Math.max(0, v || 0));
    setProgress(pct);
    if (pct === 100) setStatus("Done");
    else if (status === "Done") setStatus("In Progress");
  }

  function handleStatusChange(v: string) {
    if (v === "Done" && progress < 100) { onToast("Set progress to 100% to mark Done"); return; }
    setStatus(v);
  }

  // ── Save ────────────────────────────────────────────────────────────
  function handleSave() {
    if (!title.trim()) return;
    let pct = Math.min(100, Math.max(0, progress));
    let st = status;
    if (pct === 100) st = "Done";
    else if (st === "Done") { onToast("Set progress to 100% to mark Done"); return; }
    onSave({
      id: editId ?? undefined,
      title: title.trim(), desc: desc.trim(),
      cat, release, status: st, progress: pct,
      effort: effort || null, complexity: complexity || null,
      priority: priority || null, assignee: assignee || null,
      tasks: feature?.tasks ?? [],
    });
  }

  // ── Comment ─────────────────────────────────────────────────────────
  function handleAddComment() {
    if (!commentText.trim() || editId == null) return;
    onAddComment(editId, commentText.trim());
    setCommentText("");
  }

  // ── Deps ─────────────────────────────────────────────────────────────
  const currentDeps = feature?.deps ?? [];
  const needsFeatures = currentDeps.map((did) => features.find((x) => x.id === did)).filter(Boolean) as Feature[];
  const neededByFeatures = editId != null
    ? features.filter((x) => x.id !== editId && (x.deps ?? []).includes(editId))
    : [];
  const otherFeatures = features.filter((x) => x.id !== editId);

  return (
    <div className="modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-wide">
        {/* Header */}
        <div className="mw-header">
          <span className="mw-title">{isNew ? "Add Feature" : "Edit Feature"}</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {!isNew && (
              <button className="btn btn-del btn-sm" style={{ marginRight: 4 }}
                onClick={handleDelete}>
                Delete
              </button>
            )}
            <button className="btn btn-cancel btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-teal btn-sm" onClick={handleSave}>Save</button>
          </div>
        </div>

        {/* Body */}
        <div className="mw-body">
          {/* Left panel */}
          <div className="mw-left">
            <div className="fg">
              <label className="fl">Feature Name</label>
              <input ref={titleRef} className="fi" value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                placeholder="Feature name…" />
            </div>

            <div className="fg">
              <label className="fl">Description</label>
              <textarea className="fta" value={desc} onChange={(e) => setDesc(e.target.value)}
                placeholder="Brief description…" style={{ minHeight: 64 }} />
            </div>

            <div className="mw-row3">
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Category</label>
                <select className="fsel" value={cat} onChange={(e) => setCat(e.target.value)}>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Release</label>
                <select className="fsel" value={release} onChange={(e) => setRelease(e.target.value)}>
                  {releases.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">
                  Assignee
                  <span style={{ fontSize: 9, fontWeight: 400, color: "var(--teal-dark)", cursor: "pointer", textTransform: "none", letterSpacing: 0, marginLeft: 4 }}
                    onClick={onOpenAssignees}>⚙ manage</span>
                </label>
                <select className="fsel" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {assignees.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  {assignee && !assignees.find((a) => a.name === assignee) && (
                    <option value={assignee}>{assignee}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="mw-row3" style={{ marginTop: 12 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Status</label>
                <select className="fsel" value={status} onChange={(e) => handleStatusChange(e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Progress %</label>
                <input className="fi" type="number" min={0} max={100} value={progress}
                  onChange={(e) => handleProgressChange(parseInt(e.target.value) || 0)} />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Priority</label>
                <select className="fsel" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="">— None —</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="mw-row3" style={{ marginTop: 10 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Effort</label>
                <select className="fsel" value={effort} onChange={(e) => setEffort(e.target.value)}>
                  <option value="">— None —</option>
                  <option value="lt1w">&lt; 1 week</option>
                  <option value="1to2w">1–2 weeks</option>
                  <option value="1mo">1 month</option>
                  <option value="gt1mo">&gt; 1 month</option>
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Complexity</label>
                <select className="fsel" value={complexity} onChange={(e) => setComplexity(e.target.value)}>
                  <option value="">— None —</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }} />
            </div>

            {/* ── TASKS — below effort/complexity, above dependencies ── */}
            {!isNew && (
              <div style={{ marginTop: 16 }}>
                  <div className="modal-section-title">✅ Tasks</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    {(feature?.tasks ?? []).length === 0 ? (
                      <div className="dep-row-empty">No tasks yet.</div>
                    ) : (
                      (feature?.tasks ?? []).map((t, ti) => (
                        <div key={t.id} className="dep-row">
                          <span style={{
                            flex: 1, fontSize: 12,
                            color: t.status === "Done" ? "var(--text3)" : "var(--text)",
                            textDecoration: t.status === "Done" ? "line-through" : "none"
                          }}>{t.title}</span>
                          <div className="dep-row-meta" style={{ gap: 6 }}>
                            <select value={t.assignee ?? ""}
                              style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "white", cursor: "pointer", outline: "none" }}
                              onChange={(e) => {
                                const updated = (feature!.tasks ?? []).map((x, i) => i === ti ? { ...x, assignee: e.target.value || null } : x);
                                onUpdate({ id: editId ?? undefined, tasks: updated });
                              }}>
                              <option value="">— assign —</option>
                              {assignees.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                            </select>
                            <select value={t.status}
                              style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "white", cursor: "pointer", outline: "none" }}
                              onChange={(e) => {
                                const updated = (feature!.tasks ?? []).map((x, i) => i === ti ? { ...x, status: e.target.value as Task["status"] } : x);
                                onUpdate({ id: editId ?? undefined, tasks: updated });
                              }}>
                              <option value="To Do">To Do</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Done">Done</option>
                            </select>
                          </div>
                          <button className="dep-row-remove"
                            onClick={() => {
                              const updated = (feature!.tasks ?? []).filter((_, i) => i !== ti);
                              onUpdate({ id: editId ?? undefined, tasks: updated });
                            }}>✕</button>
                        </div>
                      ))
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                      placeholder="Add a task…"
                      className="fi"
                      style={{ height: 34, fontSize: 12 }}
                      onKeyDown={e => {
                        if (e.key === "Enter" && newTaskTitle.trim()) {
                          const newTask: Task = { id: Date.now().toString(), title: newTaskTitle.trim(), assignee: null, status: "To Do" };
                          onUpdate({ id: editId ?? undefined, tasks: [...(feature?.tasks ?? []), newTask] });
                          setNewTaskTitle("");
                        }
                      }} />
                    <button className="btn btn-teal btn-sm"
                      onClick={() => {
                        if (!newTaskTitle.trim()) return;
                        const newTask: Task = { id: Date.now().toString(), title: newTaskTitle.trim(), assignee: null, status: "To Do" };
                        onUpdate({ id: editId ?? undefined, tasks: [...(feature?.tasks ?? []), newTask] });
                        setNewTaskTitle("");
                      }}>+ Add Task</button>
                  </div>
                </div>
              )}

            {/* Dependencies — only for existing features */}
            {!isNew && (
              <div style={{ marginTop: 16 }}>
                <div className="modal-section">
                  <div className="modal-section-title" style={{ color: "#1a5080" }}>
                    ▶ Requires
                    {needsFeatures.length > 0 && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({needsFeatures.length})</span>}
                  </div>
                  <div className="dep-section-wrap">
                    {needsFeatures.length === 0
                      ? <div className="dep-row-empty">None — this feature has no prerequisites</div>
                      : needsFeatures.map((d) => (
                        <div key={d.id} className="dep-row">
                          <span className={`sdot ${STATUS_CLASS[d.status]}`} style={{ width: 6, height: 6, flexShrink: 0 }} />
                          <span className="dep-row-title">{d.title}</span>
                          <span className="dep-row-meta">
                            <span className={`sdot ${STATUS_CLASS[d.status]}`} style={{ width: 6, height: 6 }} />
                            {d.status} · {releases.find((r) => r.id === d.release)?.name ?? d.release}
                          </span>
                          <button className="dep-row-remove" onClick={() => onRemoveDep(editId!, d.id)}>Remove</button>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="modal-section">
                  <div className="modal-section-title" style={{ color: "#1a3080" }}>
                    ◀ Required by
                    {neededByFeatures.length > 0 && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({neededByFeatures.length})</span>}
                  </div>
                  <div className="dep-section-wrap">
                    {neededByFeatures.length === 0
                      ? <div className="dep-row-empty">None — no features depend on this one</div>
                      : neededByFeatures.map((d) => (
                        <div key={d.id} className="dep-row">
                          <span className="dep-row-title">{d.title}</span>
                          <span className="dep-row-meta">
                            <span className={`sdot ${STATUS_CLASS[d.status]}`} style={{ width: 6, height: 6 }} />
                            {d.status} · {releases.find((r) => r.id === d.release)?.name ?? d.release}
                          </span>
                          <button className="dep-row-remove" onClick={() => onRemoveDep(d.id, editId!)}>Remove</button>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">
                    Link dependency
                    <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10, color: "var(--text3)" }}>&nbsp;(check to add)</span>
                  </label>
                  <div className="dep-list">
                    {otherFeatures.length === 0
                      ? <div className="dep-empty">No other features yet.</div>
                      : otherFeatures.map((x) => (
                        <label key={x.id} className="dep-item">
                          <input type="checkbox"
                            checked={currentDeps.includes(x.id)}
                            onChange={(e) => onToggleDep(editId!, x.id, e.target.checked)} />
                          <span style={{ flex: 1 }}>{x.title}</span>
                          <span className={`sdot ${STATUS_CLASS[x.status]}`} style={{ width: 6, height: 6, flexShrink: 0 }} />
                          <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: 2 }}>
                            {releases.find((r) => r.id === x.release)?.name ?? x.release}
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right panel — Comments only */}
          <div className="mw-right" style={{ display: "flex", flexDirection: "column", gap: 0, padding: "16px 18px" }}>
            {isNew ? (
              <div className="no-comments-msg">Save the feature first to add comments.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div className="fl" style={{ marginBottom: 8 }}>💬 Comments</div>
                <div className="comment-list" style={{ flex: 1 }}>
                  {(feature?.comments ?? []).length === 0 ? (
                    <div className="dep-row-empty">No comments yet.</div>
                  ) : (
                    [...(feature?.comments ?? [])].reverse().map((c, ri) => {
                      const origIdx = (feature?.comments?.length ?? 0) - 1 - ri;
                      const isComment = c.type === "comment" || !c.type;
                      return (
                        <div key={ri} className="comment-item">
                          <div className={`comment-dot${isComment ? "" : " activity"}`} />
                          <div className="comment-body">
                            <div className="comment-text">{c.text}</div>
                            <div className="comment-meta">{formatCommentDate(c.ts)}</div>
                          </div>
                          {isComment && (
                            <button className="comment-del" style={{ opacity: 1 }}
                              title="Delete comment"
                              onClick={() => onDeleteComment(editId!, origIdx)}>✕</button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="comment-input-row" style={{ marginTop: 8 }}>
                  <textarea className="comment-input" rows={2} value={commentText}
                    placeholder="Add a comment… (Enter to post)"
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }} />
                  <button className="comment-add-btn" onClick={handleAddComment}>Post</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
