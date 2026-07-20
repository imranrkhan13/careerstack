"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Next.js remounts template.tsx on every route change (unlike layout.tsx,
 * which persists) — so this is the one place to add a page transition that
 * applies everywhere automatically, without editing every page file.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
