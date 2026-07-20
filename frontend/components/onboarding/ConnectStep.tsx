"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import StepShell from "./StepShell";

export default function ConnectStep({ onContinue }: { onContinue: () => void }) {
  const [notice, setNotice] = useState<string | null>(null);

  function tryOAuth(provider: string) {
    setNotice(
      `${provider} sign-in needs an OAuth app registered and its client ID/secret set on the server. Once that's done, this button goes straight to a real ${provider} login — for now, continue below and connect GitHub by username on the next steps.`
    );
  }

  return (
    <StepShell eyebrow="" title="">
      <div className="text-center mb-10">
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-xs font-mono text-muted tracking-wide mb-4"
        >
          welcome to careeros
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-3xl font-bold text-text tracking-tight"
        >
          We're going to understand your career.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-secondary text-[15px] mt-3"
        >
          Not a form. A read of your resume, your code, and your history — so the rest
          of this product already knows who you are.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="space-y-2"
      >
        <button
          onClick={() => tryOAuth("Google")}
          className="w-full flex items-center gap-3 rounded-lg border border-border bg-raised px-4 py-3 text-sm hover:border-secondary/40 transition-colors"
        >
          <span className="w-4 h-4 rounded-full bg-border" />
          Continue with Google
        </button>
        <button
          onClick={() => tryOAuth("GitHub")}
          className="w-full flex items-center gap-3 rounded-lg border border-border bg-raised px-4 py-3 text-sm hover:border-secondary/40 transition-colors"
        >
          <span className="w-4 h-4 rounded-full bg-border" />
          Continue with GitHub
        </button>
      </motion.div>

      {notice && (
        <p className="mt-4 text-xs text-gap bg-gap/10 border border-gap/20 rounded-lg px-3 py-2">{notice}</p>
      )}

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        onClick={onContinue}
        className="mt-6 w-full text-center text-sm text-signal hover:underline"
      >
        Start with your resume →
      </motion.button>
    </StepShell>
  );
}
