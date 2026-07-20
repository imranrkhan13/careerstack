import { motion } from "framer-motion";
import type { ReactNode } from "react";

export default function StepShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-[560px] mx-auto"
    >
      {eyebrow && <p className="text-xs font-mono text-muted mb-3 tracking-wide">{eyebrow}</p>}
      {title && <h1 className="text-2xl font-bold text-text tracking-tight mb-2">{title}</h1>}
      {subtitle && <p className="text-secondary text-[15px] mb-8">{subtitle}</p>}
      {title && !subtitle && <div className="mb-8" />}
      <div>{children}</div>
      {footer && <div className="mt-8">{footer}</div>}
    </motion.div>
  );
}
