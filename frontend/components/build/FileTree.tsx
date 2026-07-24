"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, File as FileIcon, Folder, Lock } from "lucide-react";
import { BuildFileNode } from "@/lib/api";

function isProtected(path: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const base = p.replace(/\/\*\*$/, "").replace(/\/$/, "");
    return path === base || path.startsWith(base + "/") || (p.includes(".env") && /(^|\/)\.env/.test(path));
  });
}

function Node({
  node,
  depth,
  protectedPatterns,
}: {
  node: BuildFileNode;
  depth: number;
  protectedPatterns: string[];
}) {
  const [open, setOpen] = useState(depth < 2);
  const pad = { paddingLeft: `${depth * 14 + 8}px` };

  if (node.type === "dir") {
    const children = node.children ?? [];
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={pad}
          className="flex items-center gap-1.5 w-full text-left py-1 pr-2 rounded hover:bg-raised text-sm text-secondary hover:text-text"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Folder size={13} className="text-signal shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {open && children.map((c) => <Node key={c.path || c.name} node={c} depth={depth + 1} protectedPatterns={protectedPatterns} />)}
      </div>
    );
  }

  const prot = node.secret || isProtected(node.path, protectedPatterns);
  return (
    <div style={pad} className="flex items-center gap-1.5 py-1 pr-2 text-sm">
      <span className="w-[13px] shrink-0" />
      <FileIcon size={13} className="text-muted shrink-0" />
      <span className={`truncate font-mono text-xs ${prot ? "text-gap" : "text-secondary"}`}>{node.name}</span>
      {prot && <Lock size={11} className="text-gap shrink-0" aria-label="protected" />}
    </div>
  );
}

export default function FileTree({ tree, protectedPatterns }: { tree: BuildFileNode; protectedPatterns: string[] }) {
  if (!tree) return null;
  const roots = tree.children ?? [];
  return (
    <div className="overflow-y-auto max-h-[520px] -mx-1">
      {roots.map((c) => (
        <Node key={c.path || c.name} node={c} depth={0} protectedPatterns={protectedPatterns} />
      ))}
    </div>
  );
}
