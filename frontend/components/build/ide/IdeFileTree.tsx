"use client";

import { useState } from "react";
import {
  ChevronRight,
  File as FileIcon,
  FileCode,
  FileText,
  Palette,
  Settings,
  Folder,
  FolderOpen,
  Lock,
  TriangleAlert,
  EyeOff,
} from "lucide-react";
import { BuildFileNode, ProtectedPathT } from "@/lib/api";

export type PathSeverity = "normal" | "restricted" | "blocked" | "secret";

export function classifyPath(path: string, secretFlag: boolean, protectedPaths: ProtectedPathT[]): PathSeverity {
  if (secretFlag) return "secret";
  let sev: PathSeverity = "normal";
  for (const p of protectedPaths) {
    const pat = p.pattern;
    let match = false;
    if (pat.endsWith("/**")) {
      const base = pat.slice(0, -3);
      match = path === base || path.startsWith(base + "/");
    } else if (pat === "**/.env") {
      match = path === ".env" || path.endsWith("/.env");
    } else if (pat === "**/.env.*") {
      match = /(^|\/)\.env\.[^/]+$/.test(path);
    } else {
      match = path === pat || path.startsWith(pat.replace(/\/$/, "") + "/");
    }
    if (match) {
      if ((p.severity || "blocked") === "blocked") return "blocked";
      if (p.severity === "restricted") sev = "restricted";
    }
  }
  return sev;
}

function FileTypeIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const isConfig =
    /\.(config|rc)\.[a-z]+$/.test(lower) ||
    lower.startsWith(".") ||
    /\.(json|ya?ml|toml|lock)$/.test(lower);
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(lower)) return <FileCode size={12} className="text-signal shrink-0" aria-hidden />;
  if (/\.css$/.test(lower)) return <Palette size={12} className="text-warning shrink-0" aria-hidden />;
  if (isConfig) return <Settings size={12} className="text-muted shrink-0" aria-hidden />;
  if (/\.(md|txt)$/.test(lower)) return <FileText size={12} className="text-secondary shrink-0" aria-hidden />;
  return <FileIcon size={12} className="text-muted shrink-0" aria-hidden />;
}

function SeverityIcon({ sev }: { sev: PathSeverity }) {
  if (sev === "blocked") return <Lock size={11} className="text-gap shrink-0" aria-label="protected" />;
  if (sev === "secret") return <EyeOff size={11} className="text-gap shrink-0" aria-label="secret (hidden from AI)" />;
  if (sev === "restricted") return <TriangleAlert size={11} className="text-warning shrink-0" aria-label="restricted" />;
  return null;
}

const ROW = "flex items-center gap-1.5 w-full text-left py-1 pr-2 border-l-2 text-[13px] transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/40";

function Node({
  node,
  depth,
  protectedPaths,
  selected,
  onSelect,
}: {
  node: BuildFileNode;
  depth: number;
  protectedPaths: ProtectedPathT[];
  selected: string | null;
  onSelect: (path: string, sev: PathSeverity) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const pad = { paddingLeft: `${depth * 12 + 6}px` };

  if (node.type === "dir") {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={pad}
          className={`${ROW} border-transparent text-secondary hover:text-text hover:bg-raised/60`}
          aria-expanded={open}
        >
          <ChevronRight size={12} className={`shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-90" : ""}`} />
          {open ? <FolderOpen size={12} className="text-signal shrink-0" aria-hidden /> : <Folder size={12} className="text-signal shrink-0" aria-hidden />}
          <span className="truncate">{node.name}</span>
        </button>
        {open && (node.children ?? []).map((c) => (
          <Node key={c.path || c.name} node={c} depth={depth + 1} protectedPaths={protectedPaths} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  const sev = classifyPath(node.path, !!node.secret, protectedPaths);
  const isSel = selected === node.path;
  const color = sev === "blocked" || sev === "secret" ? "text-gap" : sev === "restricted" ? "text-warning" : "text-secondary";
  return (
    <button
      onClick={() => onSelect(node.path, sev)}
      style={pad}
      aria-current={isSel ? "true" : undefined}
      className={`${ROW} ${isSel ? "border-signal bg-signalLight/50" : "border-transparent hover:bg-raised/60"}`}
    >
      <span className="w-[12px] shrink-0" />
      <FileTypeIcon name={node.name} />
      <span className={`truncate font-mono text-[11px] ${color}`}>{node.name}</span>
      <SeverityIcon sev={sev} />
    </button>
  );
}

export default function IdeFileTree({
  tree,
  protectedPaths,
  selected,
  onSelect,
}: {
  tree: BuildFileNode | null;
  protectedPaths: ProtectedPathT[];
  selected: string | null;
  onSelect: (path: string, sev: PathSeverity) => void;
}) {
  if (!tree) return null;
  return (
    <div className="py-1">
      {(tree.children ?? []).map((c) => (
        <Node key={c.path || c.name} node={c} depth={0} protectedPaths={protectedPaths} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}
