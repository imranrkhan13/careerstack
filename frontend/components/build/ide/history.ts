// Command history persisted in localStorage so recent commands survive across sessions.
export type HistItem = { id: string; text: string; status: string; at: number };

const KEY = "cs_ide_command_history_v1";

export function loadHistory(): HistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistItem[]) : [];
  } catch {
    return [];
  }
}

function persist(items: HistItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 30)));
  } catch {
    /* localStorage may be unavailable (private mode) — history is best-effort */
  }
}

export function upsertHistory(items: HistItem[], entry: Partial<HistItem> & { id: string; text: string }): HistItem[] {
  const map = new Map(items.map((i) => [i.id, i]));
  const prev = map.get(entry.id);
  map.set(entry.id, {
    id: entry.id,
    text: entry.text,
    status: entry.status ?? prev?.status ?? "draft",
    at: prev?.at ?? entry.at ?? Date.now(),
  });
  const merged = Array.from(map.values()).sort((a, b) => b.at - a.at);
  persist(merged);
  return merged;
}

/** Merge server change-requests (authoritative status) into the local history. */
export function mergeServer(items: HistItem[], server: { id: string; request_text: string; status: string }[]): HistItem[] {
  let out = items;
  for (const s of server) {
    out = upsertHistory(out, { id: s.id, text: s.request_text, status: s.status });
  }
  return out;
}
