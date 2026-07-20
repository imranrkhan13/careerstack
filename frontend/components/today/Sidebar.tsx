"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Inbox,
  Clock,
  Briefcase,
  FileText,
  Mail,
  Users,
  Settings as SettingsIcon,
} from "lucide-react";
import { api, AgentStatus } from "@/lib/api";

const SECTIONS: { label: string; items: { label: string; href: string; icon: typeof Inbox }[] }[] = [
  {
    label: "Workspace",
    items: [
      { label: "Today", href: "/today", icon: Inbox },
      { label: "Timeline", href: "/timeline", icon: Clock },
    ],
  },
  {
    label: "Career",
    items: [
      { label: "Applications", href: "/applications", icon: Briefcase },
      { label: "Resume", href: "/resume", icon: FileText },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Boardy", href: "/boardy", icon: Mail },
      { label: "Network", href: "/network", icon: Users },
    ],
  },
  {
    label: "More",
    items: [{ label: "Settings", href: "/settings", icon: SettingsIcon }],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

export default function Sidebar({ active }: { active: string }) {
  const [agents, setAgents] = useState<AgentStatus[] | null>(null);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  useEffect(() => {
    api.agentStatus().then(setAgents).catch(() => setAgents(null));
  }, []);

  const activeHref = ALL_ITEMS.find((i) => i.label === active)?.href ?? null;
  const highlightedHref = hoveredHref ?? activeHref;

  return (
    <aside className="hidden lg:flex w-[250px] shrink-0 border-r border-border bg-surface flex-col h-screen sticky top-0">
      <div className="px-5 py-5 flex items-center justify-between">
        <span className="text-sm font-bold text-text tracking-tight">CareerOS</span>
        <kbd className="text-[10px] font-mono text-muted border border-border rounded px-1.5 py-0.5">⌘K</kbd>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto">
        {SECTIONS.map((section, si) => (
          <div key={section.label} className={si > 0 ? "mt-4" : ""}>
            <p className="px-3 mb-1 text-[11px] font-mono font-medium text-muted uppercase tracking-wide">
              {section.label}
            </p>
            <div className="space-y-0.5" onMouseLeave={() => setHoveredHref(null)}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.label;
                const isHighlighted = highlightedHref === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onMouseEnter={() => setHoveredHref(item.href)}
                    className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                      isActive ? "text-text" : "text-secondary hover:text-text"
                    }`}
                  >
                    {isHighlighted && (
                      <motion.span
                        layoutId="sidebar-hover"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        className={`absolute inset-0 rounded-md ${isActive ? "bg-raised" : "bg-raised/60"}`}
                      />
                    )}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 -ml-3 bg-signal rounded-full" />
                    )}
                    <Icon size={16} strokeWidth={2} className="relative shrink-0" />
                    <span className="relative">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-border">
        <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-3 px-1">
          Agent status
        </p>
        <div className="space-y-3">
          {agents === null && <p className="text-xs text-muted px-1">Couldn't reach agents.</p>}
          {agents?.map((a) => (
            <div key={a.name} className="px-1">
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    a.status === "active" ? "bg-signal" : "bg-border"
                  }`}
                />
                <span className="text-xs font-medium text-text">{a.name}</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 pl-3.5 leading-snug">{a.last_action}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
