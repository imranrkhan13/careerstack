"use client";
import ErrorPanel from "@/components/ui/ErrorPanel";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, BoardyThread, BoardyMessage, Recommendation } from "@/lib/api";
import RecommendationCard from "./RecommendationCard";
import LatexResumeCard from "./LatexResumeCard";
import { Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import LinkedText, { EmailLink } from "@/components/ui/LinkedText";
import Skeleton from "@/components/ui/Skeleton";
import { Check, Copy, Mail, Send } from "lucide-react";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " · " +
        d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Conversation UI instead of stacked "email cards" — outbound messages are
 * signal-tinted bubbles on the right, inbound replies are neutral bubbles on
 * the left, like a real conversation instead of an inbox log. Auto-scrolls to
 * the latest message, sends on Enter (Shift+Enter for a new line), and shows
 * your own message immediately while it's actually sending — not just after.
 */
export default function ThreadDetail({
  thread,
  refreshKey,
  onThreadUpdated,
  onComposeEmail,
}: {
  thread: BoardyThread;
  refreshKey?: number;
  onThreadUpdated?: () => void;
  onComposeEmail?: (email: string) => void;
}) {
  const [messages, setMessages] = useState<BoardyMessage[] | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<any>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [optimisticText, setOptimisticText] = useState<string | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    Promise.all([api.boardyMessages(thread.id), api.boardyRecommendations(thread.id)])
      .then(([m, r]) => {
        setMessages(m);
        setRecs(r);
      })
      .catch((e) => setError(e));
  }

  useEffect(() => {
    setReplyText("");
    setOptimisticText(null);
  }, [thread.id]);

  useEffect(() => {
    load();
  }, [thread.id, refreshKey]);

  useEffect(() => {
    // Auto-scroll to the latest message, like any real chat — not something
    // you have to manually scroll down for after it loads or after you send.
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, optimisticText]);

  const daysSinceOutbound = Math.floor((Date.now() - new Date(thread.last_outbound_at).getTime()) / 86400000);
  const needsFollowup = thread.status === "awaiting_reply" && daysSinceOutbound >= thread.followup_days;

  async function sendReply() {
    if (!replyText.trim() || sending) return;
    const text = replyText;
    setReplyText("");
    setOptimisticText(text); // shows instantly, while the real send is still in flight
    setSending(true);
    setError(null);
    try {
      const message = await api.replyToThread(thread.id, text);
      setMessages((prev) => (prev ? [...prev, message] : [message]));
      setOptimisticText(null);
    } catch (e: any) {
      setError(e);
      setReplyText(text); // give it back so nothing typed is lost
      setOptimisticText(null);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  async function copyText(value: string, item: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedItem(item);
      window.setTimeout(() => setCopiedItem((current) => (current === item ? null : current)), 1800);
    } catch {
      setError({ message: "Couldn’t copy that text. Please select it and copy manually." });
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-b border-border bg-surface/70 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text">{thread.subject}</h2>
            <p className="mt-1 text-xs text-secondary">
              Conversation with <EmailLink email={thread.to_address} onCompose={onComposeEmail}>{thread.to_address}</EmailLink>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onComposeEmail?.(thread.to_address)}
              disabled={!onComposeEmail}
              title={`Start a new email to ${thread.to_address}`}
            >
              <Mail size={13} aria-hidden="true" />
              <span>New email</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyText(thread.to_address, "address")}
              title="Copy email address"
              aria-label="Copy email address"
            >
              {copiedItem === "address" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span className="sr-only">{copiedItem === "address" ? "Email address copied" : "Copy email address"}</span>
            </Button>
          </div>
        </div>
        {needsFollowup && (
          <div className="mt-3 rounded-lg border border-gap/20 bg-gap/10 px-3 py-2">
            <p className="text-xs text-gap">No reply in {daysSinceOutbound} days — worth a follow-up.</p>
          </div>
        )}
      </div>

      {error && <div className="px-6 pt-3"><ErrorPanel error={error} /></div>}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-3">
        {messages === null && (
          <div className="space-y-3">
            <Skeleton className="h-14 w-2/3 ml-auto rounded-xl" />
            <Skeleton className="h-14 w-2/3 rounded-xl" />
          </div>
        )}

        {messages?.map((m) => {
          const isOutbound = m.direction === "outbound";
          const msgRecs = (recs || []).filter((r) => r.source_message_id === m.id);
          const pendingMsgRecs = msgRecs.filter((r) => r.status === "pending");
          return (
            <div key={m.id} className="space-y-2">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`group flex items-start gap-2.5 ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                {!isOutbound && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-secondary">B</div>
                )}
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-3 shadow-[0_1px_2px_rgba(24,24,24,0.03)] ${isOutbound ? "bg-signalLight" : "border border-border bg-surface"}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-4">
                    <p className="text-[11px] font-semibold text-secondary">{isOutbound ? "You" : "Boardy"}</p>
                    <p className="text-[11px] text-muted">{timeLabel(m.at)}</p>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-text"><LinkedText text={m.body} onEmailClick={onComposeEmail} /></p>
                  <button
                    type="button"
                    onClick={() => copyText(m.body, `message-${m.id}`)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted opacity-0 transition-opacity hover:text-signal focus:opacity-100 focus:outline-none group-hover:opacity-100"
                    aria-label="Copy message"
                  >
                    {copiedItem === `message-${m.id}` ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                    {copiedItem === `message-${m.id}` ? "Copied" : "Copy"}
                  </button>
                </div>
                {isOutbound && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal text-[11px] font-semibold text-white">Y</div>
                )}
              </motion.div>

              {!isOutbound && msgRecs.length > 0 && (
                <div className="pl-0">
                  <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-1">
                    Recommendations ({pendingMsgRecs.length} pending)
                  </p>
                  <div className="space-y-2.5">
                    {msgRecs.map((r) =>
                      r.kind === "latex_resume" ? (
                        <LatexResumeCard
                          key={r.id}
                          rec={r}
                          onResolved={(updated) =>
                            setRecs((prev) => prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : [updated])
                          }
                        />
                      ) : (
                        <RecommendationCard
                          key={r.id}
                          rec={r}
                          onResolved={(updated) =>
                            setRecs((prev) => prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : [updated])
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <AnimatePresence>
          {optimisticText && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start justify-end gap-2.5"
            >
              <div className="max-w-[78%] rounded-2xl bg-signalLight px-3.5 py-3 opacity-65">
                <div className="mb-1.5 flex items-center justify-between gap-4">
                  <p className="text-[11px] font-semibold text-secondary">You</p>
                  <p className="text-[11px] text-muted" aria-live="polite">Sending…</p>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text"><LinkedText text={optimisticText} onEmailClick={onComposeEmail} /></p>
              </div>
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal text-[11px] font-semibold text-white">Y</div>
            </motion.div>
          )}
        </AnimatePresence>

        {recs && recs.filter((r) => !r.source_message_id).length > 0 && (
          <div className="pt-2">
            <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-2">
              Recommendations not tied to a specific reply ({recs.filter((r) => !r.source_message_id && r.status === "pending").length} pending)
            </p>
            <div className="space-y-2.5">
              {recs
                .filter((r) => !r.source_message_id)
                .map((r) =>
                  r.kind === "latex_resume" ? (
                    <LatexResumeCard
                      key={r.id}
                      rec={r}
                      onResolved={(updated) => setRecs((prev) => prev!.map((p) => (p.id === updated.id ? updated : p)))}
                    />
                  ) : (
                    <RecommendationCard
                      key={r.id}
                      rec={r}
                      onResolved={(updated) => setRecs((prev) => prev!.map((p) => (p.id === updated.id ? updated : p)))}
                    />
                  )
                )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick reply — reuses thread.to_address, never asks for the email again.
          Enter sends, Shift+Enter makes a new line — standard chat behavior. */}
      <div className="border-t border-border bg-surface/70 px-6 py-4">
        <div className="rounded-[18px] border border-border bg-surface p-1.5 shadow-[0_1px_2px_rgba(24,24,24,0.03)] transition-colors focus-within:border-signal/60 focus-within:ring-2 focus-within:ring-signal/10">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            aria-label={`Reply to ${thread.to_address}`}
            placeholder={`Reply to ${thread.to_address}…`}
            className="min-h-[74px] border-0 bg-transparent px-2.5 py-2 focus:border-transparent focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-3 px-1 pb-0.5">
            <p className="text-[11px] text-muted">Enter to send · Shift + Enter for a new line</p>
            <Button variant="primary" size="sm" onClick={sendReply} disabled={sending || !replyText.trim()}>
              <Send size={13} aria-hidden="true" />
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
