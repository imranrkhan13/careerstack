"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TodayItem } from "@/lib/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const KIND_LABEL: Record<string, string> = {
  resume_update: "Resume",
  boardy_reply: "Boardy",
  job_match: "Jobs",
  interview: "Interview",
  github: "GitHub",
  practice: "Practice",
  gap: "Gap",
  portfolio: "Portfolio",
  history: "History",
  network: "Network",
  application: "Applications",
  update: "Update",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function FeedTimeline({
  items,
  selectedIndex,
  onSelect,
  onAction,
}: {
  items: TodayItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAction: (item: TodayItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openedIndexes, setOpenedIndexes] = useState<Set<number>>(new Set());
  const router = useRouter();

  function select(i: number) {
    onSelect(i);
    setOpenedIndexes((prev) => new Set(prev).add(i));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        select(Math.min(selectedIndex + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        select(Math.max(selectedIndex - 1, 0));
      } else if (e.key === "Enter" && items[selectedIndex]) {
        onAction(items[selectedIndex]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIndex, items]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-8">
        <div className="max-w-sm">
          <p className="text-3xl mb-3">📬</p>
          <p className="text-sm font-medium text-text mb-1.5">You're ready.</p>
          <p className="text-sm text-secondary mb-5">
            As Boardy replies, your resume changes, or gaps get detected, this feed fills in
            — with real activity only.
          </p>
          <Button variant="primary" onClick={() => router.push("/onboarding")}>
            Import your resume
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {items.map((item, i) => {
        const unread = !openedIndexes.has(i);
        const initial = (KIND_LABEL[item.kind] ?? item.kind).charAt(0).toUpperCase();
        return (
          <Card
            key={i}
            interactive
            selected={selectedIndex === i}
            onClick={() => select(i)}
            className="group flex items-start gap-3 py-3"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 ${
                item.kind === "gap" ? "bg-gap/15 text-gap" : "bg-signal/15 text-signal"
              }`}
            >
              {initial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {unread && <span className="w-1.5 h-1.5 rounded-full bg-signal shrink-0" />}
                  <p className={`text-sm truncate ${unread ? "text-text font-semibold" : "text-secondary font-normal"}`}>
                    {item.title}
                  </p>
                </div>
                {item.created_at && (
                  <span className="text-[11px] font-mono text-muted shrink-0">{timeAgo(item.created_at)}</span>
                )}
              </div>

              {item.detail && <p className="text-xs text-secondary mt-0.5 truncate">{item.detail}</p>}

              <div className="flex items-center gap-2 mt-2">
                <Badge tone={item.kind === "gap" ? "gap" : "signal"}>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                {item.confidence != null && (
                  <span className="text-[11px] font-mono text-muted">{Math.round(item.confidence * 100)}% confidence</span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction(item);
                  }}
                  className="opacity-0 group-hover:opacity-100 ml-auto"
                >
                  {item.action}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
