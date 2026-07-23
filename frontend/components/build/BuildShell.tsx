"use client";

import { ReactNode } from "react";
import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";

export default function BuildShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="Build Workspace" />
      <MobileNav active="Build Workspace" />
      <main className="flex-1 min-w-0 pb-16 lg:pb-0">
        <div className="max-w-[1100px] mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  passed: "text-success bg-success/10 border-success/20",
  failed: "text-gap bg-gap/10 border-gap/20",
  skipped: "text-muted bg-raised border-border",
  done: "text-success bg-success/10 border-success/20",
  running: "text-signal bg-signalLight border-signal/30",
  pending: "text-muted bg-raised border-border",
  completed: "text-success bg-success/10 border-success/20",
  paused: "text-warning bg-warning/10 border-warning/30",
};

export function StatusPill({ status, children }: { status: string; children?: ReactNode }) {
  const tone = STATUS_TONE[status] ?? "text-secondary bg-raised border-border";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-medium uppercase tracking-wide px-2 py-0.5 rounded border ${tone}`}>
      {children ?? status}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-2">{children}</p>;
}
