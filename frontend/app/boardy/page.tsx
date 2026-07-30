"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import ComposeThread from "@/components/boardy/ComposeThread";
import ErrorPanel from "@/components/ui/ErrorPanel";
import ThreadDetail from "@/components/boardy/ThreadDetail";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { api, BoardyThread } from "@/lib/api";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function BoardyPage() {
  const [threads, setThreads] = useState<BoardyThread[] | null>(null);
  const [selected, setSelected] = useState<BoardyThread | null>(null);
  const [composeDraft, setComposeDraft] = useState<{ to?: string } | null>(null);
  const [polling, setPolling] = useState(false);
  const [syncingApplications, setSyncingApplications] = useState(false);
  const [pollMessage, setPollMessage] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function load() {
    api
      .boardyThreads()
      .then((t) => {
        setThreads(t);
        if (selected) setSelected(t.find((x) => x.id === selected.id) ?? null);
      })
      .catch((e) => setError(e));
  }

  useEffect(() => {
    load();
    syncApplications(true);
  }, []);

  async function syncApplications(silent = false) {
    if (!silent) setSyncingApplications(true);
    try {
      const { linked } = await api.syncBoardyApplications();
      if (linked.length > 0) {
        setPollMessage(`Added ${linked.length} sent application${linked.length !== 1 ? "s" : ""} to Applied.`);
        load();
      }
    } catch (e: any) {
      if (!silent) setError(e);
    } finally {
      if (!silent) setSyncingApplications(false);
    }
  }

  async function poll(silent = false) {
    if (!silent) {
      setPolling(true);
      setPollMessage(null);
      setError(null);
    }
    try {
      const { new_recommendations } = await api.pollBoardy();
      if (!silent) {
        setPollMessage(
          new_recommendations.length > 0
            ? `Found ${new_recommendations.length} new recommendation${new_recommendations.length !== 1 ? "s" : ""}.`
            : "No new replies."
        );
      }
      load();
      // Bumps ThreadDetail's refresh key so an already-open conversation picks up
      // new messages/recommendations immediately — previously this required
      // manually reloading the whole page, since ThreadDetail only reloaded when
      // you switched threads.
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      if (!silent) setError(e);
    } finally {
      if (!silent) setPolling(false);
    }
  }

  useEffect(() => {
    // Real periodic polling while this page is open — not push notifications
    // (see gmail_service.py for why), but this is what makes replies show up
    // without you having to remember to click "Check for replies" yourself.
    const interval = setInterval(() => poll(true), 45_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg pb-14 lg:pb-0">
      <Sidebar active="Boardy" />
      <MobileNav active="Boardy" />

      <div className="flex min-h-0 w-72 shrink-0 flex-col border-r border-border">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <h1 className="text-sm font-semibold text-text">Boardy</h1>
          <Button variant="ghost" size="sm" onClick={() => setComposeDraft({})}>
            + New
          </Button>
        </div>
        <div className="px-4 py-2 border-b border-border">
          <Button variant="secondary" size="sm" className="w-full" onClick={() => poll()} disabled={polling}>
            {polling ? "Checking Gmail…" : "Check for replies"}
          </Button>
          <button
            type="button"
            onClick={() => syncApplications()}
            disabled={syncingApplications}
            className="mt-1.5 w-full text-center text-[11px] font-medium text-muted transition-colors hover:text-signal disabled:opacity-50"
          >
            {syncingApplications ? "Syncing sent applications…" : "Sync sent applications"}
          </button>
          {pollMessage && <p className="text-[11px] text-muted mt-1.5">{pollMessage}</p>}
        </div>
        {error && <div className="px-4 py-2"><ErrorPanel error={error} /></div>}
        <ul className="flex-1 overflow-y-auto">
          {threads?.length === 0 && (
            <li className="px-4 py-8 text-center">
              <p className="text-2xl mb-2">💬</p>
              <p className="text-xs font-medium text-text mb-1">No conversations yet.</p>
              <p className="text-xs text-secondary mb-3">Start one to get outreach drafts and resume feedback.</p>
              <Button variant="primary" size="sm" onClick={() => setComposeDraft({})}>
                Start a conversation
              </Button>
            </li>
          )}
          {threads?.map((t, i) => (
            <motion.li
              key={t.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: i * 0.02 }}
              onClick={() => setSelected(t)}
              className={`px-4 py-3 border-b border-border/60 cursor-pointer transition-colors duration-150 ${
                selected?.id === t.id ? "bg-raised" : "hover:bg-raised/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-text truncate flex-1">{t.subject}</p>
                <span className="text-[11px] text-muted shrink-0">
                  {relativeTime(t.last_inbound_at ?? t.last_outbound_at)}
                </span>
              </div>
              {t.last_message_preview && (
                <p className="text-xs text-secondary truncate mt-0.5">{t.last_message_preview}</p>
              )}
              <div className="mt-1">
                <Badge tone={t.status === "replied" ? "signal" : "neutral"}>
                  {t.status === "replied" ? "Replied" : "Awaiting reply"}
                </Badge>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>

      {selected ? (
        <ThreadDetail
          thread={selected}
          refreshKey={refreshKey}
          onThreadUpdated={load}
          onComposeEmail={(to) => setComposeDraft({ to })}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted mb-3">Select a conversation, or start a new one.</p>
            <Button variant="secondary" size="sm" onClick={() => setComposeDraft({})}>
              Start a conversation
            </Button>
          </div>
        </div>
      )}

      {composeDraft && (
        <ComposeThread
          initialTo={composeDraft.to}
          onClose={() => setComposeDraft(null)}
          onCreated={(t) => {
            setThreads((prev) => [...(prev ?? []), t]);
            setSelected(t);
            setComposeDraft(null);
          }}
        />
      )}
    </div>
  );
}
