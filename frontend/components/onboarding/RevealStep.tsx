"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GraphSummary } from "@/lib/api";

function useCountUp(target: number, delayMs: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      const duration = 700;
      const start = performance.now();
      function tick(now: number) {
        const t = Math.min(1, (now - start) / duration);
        setValue(Math.round(target * t));
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delayMs);
    return () => clearTimeout(timeout);
  }, [target, delayMs]);
  return value;
}

const CLUSTERS = [
  { key: "skills" as const, label: "skills detected", angle: -60 },
  { key: "projects" as const, label: "projects mapped", angle: -20 },
  { key: "repositories" as const, label: "repos analyzed", angle: 20 },
  { key: "roles" as const, label: "roles found", angle: 60 },
];

export default function RevealStep({ summary }: { summary: GraphSummary }) {
  const cx = 280;
  const cy = 150;
  const r = 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-[560px] mx-auto text-center"
    >
      <p className="text-xs font-mono text-muted mb-3 tracking-wide">05 · this is you</p>
      <h1 className="text-2xl font-bold text-text tracking-tight mb-1">This is your career.</h1>
      <p className="text-secondary text-sm mb-8">Not a dashboard. A living map — it grows every time you use this.</p>

      <svg viewBox="0 0 560 300" className="w-full h-[260px]">
        {CLUSTERS.map((c, i) => {
          const rad = (c.angle * Math.PI) / 180;
          const x = cx + r * Math.cos(rad);
          const y = cy + r * Math.sin(rad);
          return (
            <motion.line
              key={c.key}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#ECE7E2"
              strokeWidth={1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.15, ease: "easeOut" }}
            />
          );
        })}

        <motion.circle
          cx={cx}
          cy={cy}
          r={22}
          fill="#C96A28"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
        />
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-white text-[11px] font-mono">
          you
        </text>

        {CLUSTERS.map((c, i) => {
          const rad = (c.angle * Math.PI) / 180;
          const x = cx + r * Math.cos(rad);
          const y = cy + r * Math.sin(rad);
          const count = summary[c.key] as number;
          return (
            <g key={c.key}>
              <motion.circle
                cx={x}
                cy={y}
                r={Math.min(28, 14 + count * 2)}
                fill="#FFFFFF"
                stroke="#C96A28"
                strokeWidth={1.5}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.15 }}
              />
              <motion.text
                x={x}
                y={y + 4}
                textAnchor="middle"
                className="fill-[#181818] text-[13px] font-mono"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 + i * 0.15 }}
              >
                {count}
              </motion.text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 space-y-1.5 text-left font-mono text-sm">
        {CLUSTERS.map((c, i) => (
          <ReadoutLine key={c.key} label={c.label} value={summary[c.key] as number} delay={800 + i * 150} />
        ))}
        {summary.gaps.length > 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 800 + CLUSTERS.length * 150 + 200 }}
            className="text-gap pt-1"
          >
            missing from your portfolio: {summary.gaps.join(", ")}
          </motion.p>
        )}
      </div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        className="mt-10 px-5 py-2.5 rounded-lg bg-signal text-white text-sm font-medium"
        onClick={() => (window.location.href = "/today")}
      >
        Enter Today →
      </motion.button>
    </motion.div>
  );
}

function ReadoutLine({ label, value, delay }: { label: string; value: number; delay: number }) {
  const count = useCountUp(value, delay);
  return (
    <p className="text-secondary">
      <span className="text-text">{count}</span> {label}
    </p>
  );
}
