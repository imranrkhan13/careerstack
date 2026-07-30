"use client";

import Link from "next/link";
import { Inbox, Briefcase, Mail, Users, Settings as SettingsIcon } from "lucide-react";

const ITEMS = [
  { label: "Today", href: "/today", icon: Inbox },
  { label: "Applications", href: "/applications", icon: Briefcase },
  { label: "Boardy", href: "/boardy", icon: Mail },
  { label: "People", href: "/network", icon: Users },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

/**
 * Bottom navigation for small screens — Sidebar is hidden below `lg` (see
 * Sidebar.tsx), this replaces it there. Deliberately just the 5 highest-use
 * destinations, not the full nav list.
 */
export default function MobileNav({ active }: { active: string }) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-surface border-t border-border flex items-center justify-around">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.label;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium px-3 py-1.5 rounded-md ${
              isActive ? "text-signal" : "text-muted"
            }`}
          >
            <Icon size={18} strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
