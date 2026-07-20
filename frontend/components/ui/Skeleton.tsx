"use client";

import { motion } from "framer-motion";

/**
 * A single pulsing placeholder block. Used while real data is loading instead
 * of an empty blank area — this is the "Skeleton loading" state, not a
 * spinner and not fabricated content.
 */
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.5, 0.9, 0.5] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      className={`bg-raised rounded-md ${className}`}
    />
  );
}
