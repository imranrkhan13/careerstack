"use client";
import ErrorPanel from "@/components/ui/ErrorPanel";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, BoardyThread } from "@/lib/api";
import { Input, Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const REMEMBERED_ADDRESS_KEY = "Careerstack:boardy_address";

export default function ComposeThread({
  onClose,
  onCreated,
  initialTo = "",
}: {
  onClose: () => void;
  onCreated: (t: BoardyThread) => void;
  initialTo?: string;
}) {
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<any>(null);
  const [remembered, setRemembered] = useState(false);

  useEffect(() => {
    if (initialTo) {
      setTo(initialTo);
      setRemembered(false);
      return;
    }

    const saved = window.localStorage.getItem(REMEMBERED_ADDRESS_KEY);
    if (saved) {
      setTo(saved);
      setRemembered(true);
    }
  }, [initialTo]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const thread = await api.createBoardyThread(to.trim(), subject.trim(), body);
      window.localStorage.setItem(REMEMBERED_ADDRESS_KEY, to.trim());
      onCreated(thread);
    } catch (e: any) {
      setError(e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-text mb-3">New email</h2>
        <p className="text-xs text-muted mb-3">
          Write and send through your connected Gmail account without leaving Careerstack.
        </p>
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To — email address"
          className="mb-2"
        />
        {remembered && <p className="text-[11px] text-signal -mt-1 mb-2">Remembered from last time — edit if needed.</p>}
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="mb-2" />
        <p className="-mt-0.5 mb-2 text-[11px] text-muted">
          Tip: use “Role at Company” in the subject and Careerstack will add it to Applied as soon as the email sends.
        </p>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Message…" className="mb-3" />
        {error && <div className="mb-2"><ErrorPanel error={error} /></div>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={send} disabled={sending || !to.trim() || !subject.trim() || !body.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
