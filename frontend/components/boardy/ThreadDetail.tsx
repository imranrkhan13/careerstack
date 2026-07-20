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
import LinkedText from "@/components/ui/LinkedText";
import Skeleton from "@/components/ui/Skeleton";

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
}: {
  thread: BoardyThread;
  refreshKey?: number;
  onThreadUpdated?: () => void;
}) {
  const [messages, setMessages] = useState<BoardyMessage[] | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<any>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [optimisticText, setOptimisticText] = useState<string | null>(null);
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

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-text">{thread.subject}</h2>
          <Badge tone={thread.status === "replied" ? "signal" : "neutral"}>
            {thread.status === "replied" ? "Replied" : "Awaiting reply"}
          </Badge>
        </div>
        <p className="text-xs text-secondary">With {thread.to_address}</p>
        {needsFollowup && (
          <div className="mt-3 rounded-lg border border-gap/20 bg-gap/10 px-3 py-2">
            <p className="text-xs text-gap">No reply in {daysSinceOutbound} days — worth a follow-up.</p>
          </div>
        )}
      </div>

      {error && <div className="px-6 pt-3"><ErrorPanel error={error} /></div>}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
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
                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${isOutbound ? "bg-signal/15" : "bg-raised border border-border"}`}>
                  <p className="text-sm text-text whitespace-pre-wrap"><LinkedText text={m.body} /></p>
                  <p className="text-[11px] text-muted mt-1.5">{timeLabel(m.at)}</p>
                </div>
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
              className="flex justify-end"
            >
              <div className="max-w-[75%] rounded-xl px-3.5 py-2.5 bg-signal/15 opacity-60">
                <p className="text-sm text-text whitespace-pre-wrap">{optimisticText}</p>
                <p className="text-[11px] text-muted mt-1.5">Sending…</p>
              </div>
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
      <div className="px-6 py-4 border-t border-border">
        <Textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={`Reply to ${thread.to_address}… (Enter to send, Shift+Enter for a new line)`}
          className="mb-2"
        />
        <Button variant="primary" size="sm" onClick={sendReply} disabled={sending || !replyText.trim()}>
          {sending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}
