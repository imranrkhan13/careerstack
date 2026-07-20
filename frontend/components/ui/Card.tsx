"use client";

import { forwardRef } from "react";
import { motion, HTMLMotionProps } from "framer-motion";

interface CardProps extends HTMLMotionProps<"div"> {
  interactive?: boolean;
  selected?: boolean;
}

/**
 * The one card shape used everywhere: same border, radius, padding, and hover
 * behavior. `interactive` adds hover elevation + a subtle press/lift motion for
 * clickable cards (feed items, kanban cards, timeline cards); `selected` adds
 * the active-state ring. Every card fades/lifts in on mount — this is the
 * "more animation" pass: consistent, subtle, never gamer-UI.
 */
const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, selected = false, className = "", ...props }, ref) => (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      whileHover={interactive ? { y: -1 } : undefined}
      whileTap={interactive ? { scale: 0.99 } : undefined}
      className={`rounded-2xl border bg-surface p-4 shadow-[0_1px_2px_rgba(24,24,24,0.04)] transition-shadow duration-150
        ${selected ? "border-signal/50 ring-1 ring-signal/30" : "border-border"}
        ${interactive ? "cursor-pointer hover:border-signal/30 hover:shadow-[0_4px_16px_rgba(24,24,24,0.08)]" : ""}
        ${className}`}
      {...props}
    />
  )
);
Card.displayName = "Card";

export default Card;
