"use client";

import { useState } from "react";
import type { Assignee } from "@/lib/types";

interface Props {
  assignees: Assignee[];
  onSave: (updated: Assignee[]) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export default function AssigneeModal({ assignees, onSave, onClose, onToast }: Props) {
  const [list, setList] = useState<Assignee[]>([...assignees]);
  const [newName, setNewName] = useState("");

  function addAssignee() {
    const name = newName.trim();
    if (!name) return;
    if (list.find((a) => a.name.toLowerCase() === name.toLowerCase())) {
      onToast("Already in list");
      return;
    }
    const updated = [...list, { id: `a${Date.now()}`, name }];
    setList(updated);
    setNewName("");
    onSave(updated);
    onToast(`${name} added`);
  }

  function deleteAssignee(idx: number) {
    const updated = list.filter((_, i) => i !== idx);
    setList(updated);
    onSave(updated);
  }

  return (
    <div className="assignee-modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="assignee-modal">
        <div className="manage-title">👤 Manage Assignees</div>

        {list.length === 0 ? (
          <div className="dep-row-empty" style={{ marginBottom: 8 }}>
            No assignees yet. Add names below.
          </div>
        ) : (
          list.map((a, i) => (
            <div key={a.id} className="assignee-row">
              <span className="assignee-name">{a.name}</span>
              <button className="assignee-del" onClick={() => deleteAssignee(i)}>Remove</button>
            </div>
          ))
        )}

        <div className="assignee-add-row">
          <input className="assignee-input" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name or initials…"
            onKeyDown={(e) => { if (e.key === "Enter") addAssignee(); }} />
          <button className="assignee-add-btn" onClick={addAssignee}>Add</button>
        </div>

        <div className="manage-footer" style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <button className="btn btn-teal btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
