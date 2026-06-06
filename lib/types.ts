// ── Timing ──────────────────────────────────────────────────
export interface Timing {
  type: "month" | "quarter" | "year";
  month?: number;
  quarter?: string;
  year?: string;
}

// ── Release ──────────────────────────────────────────────────
export interface Release {
  id: string;
  name: string;
  timing?: Timing;
}

// ── Board ────────────────────────────────────────────────────
export interface Board {
  id: number;
  name: string;
  releases: Release[];
  categories: string[];   // per-board list; never empty
  owner?: string | null;  // assignee name — uses global assignees list
}

// ── Task ─────────────────────────────────────────────────────
export interface Task {
  id: string;
  title: string;
  assignee?: string | null;
  status: "To Do" | "In Progress" | "Done";
}

// ── Comment ──────────────────────────────────────────────────
export interface Comment {
  type: "comment" | "activity";
  text: string;
  ts: string;
  author?: string;
}

// ── Feature ──────────────────────────────────────────────────
export interface Feature {
  id: number;
  title: string;
  desc?: string;
  cat: string;
  release: string;
  status: string;
  progress: number;
  effort?: string | null;
  complexity?: string | null;
  priority?: string | null;
  assignee?: string | null;
  deps?: number[];
  comments?: Comment[];
  tasks?: Task[];
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── Assignee ─────────────────────────────────────────────────
export interface Assignee {
  id: string;
  name: string;
}

// ── Root data model (mirrors JSON file schema) ────────────────
export interface AppData {
  features: Feature[];
  boards: Board[];
  currentBoardId: number;
  assignees: Assignee[];
  nextId: number;
  nextBoardId: number;
  nextRelId: number;
  lastUpdated?: string;
}

// ── Constants ─────────────────────────────────────────────────
export const STATUSES = ["To Do", "In Progress", "In Review", "Done", "Blocked"] as const;
// Default categories applied to new boards and used as fallback for legacy boards
export const DEFAULT_CATS = ["Exception Management", "AP Processes", "Integration", "Analytics"];
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export const STATUS_CLASS: Record<string, string> = {
  "To Do": "s-todo",
  "In Progress": "s-prog",
  "In Review": "s-review",
  "Done": "s-done",
  "Blocked": "s-blocked",
};

// Fixed CSS classes for the 4 legacy categories; extras get a generated class
export const CAT_CLASS_FIXED: Record<string, string> = {
  "Exception Management": "ct-exception",
  "AP Processes": "ct-ap",
  "Integration": "ct-integration",
  "Analytics": "ct-analytics",
};

// Rotating palette for dynamically-added categories (beyond the 4 legacy ones)
const CAT_PALETTE = [
  { bg: "#f0eeff", border: "#b8a8f0", text: "#3a2880" },  // purple
  { bg: "#e8fff0", border: "#80d8a0", text: "#0a5025" },  // green
  { bg: "#fff3e6", border: "#f0b870", text: "#7a4010" },  // orange
  { bg: "#e8f4ff", border: "#90c4f0", text: "#1a5080" },  // blue
  { bg: "#fff0f5", border: "#f090b8", text: "#800040" },  // pink
  { bg: "#f5fff0", border: "#a0d880", text: "#2a5010" },  // lime
];

// Returns either a fixed CSS className string, or an inline style object
export function catStyle(cat: string): { className?: string; style?: React.CSSProperties } {
  if (CAT_CLASS_FIXED[cat]) return { className: CAT_CLASS_FIXED[cat] };
  // Hash cat name to a palette index
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = (hash * 31 + cat.charCodeAt(i)) & 0xffff;
  const p = CAT_PALETTE[hash % CAT_PALETTE.length];
  return { style: { background: p.bg, border: `1px solid ${p.border}`, color: p.text } };
}

export const EFFORT_LABEL: Record<string, string> = {
  lt1w: "< 1 wk",
  "1to2w": "1–2 wks",
  "1mo": "1 mo",
  gt1mo: "> 1 mo",
};

export function formatTiming(t?: Timing): string {
  if (!t) return "";
  if (t.type === "month") return `${MONTHS[(t.month ?? 1) - 1] ?? ""} ${t.year ?? ""}`.trim();
  if (t.type === "quarter") return `${t.quarter ?? ""} ${t.year ?? ""}`.trim();
  if (t.type === "year") return t.year ?? "";
  return "";
}
