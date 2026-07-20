"use client";

import { forwardRef } from "react";
import { motion, HTMLMotionProps } from "framer-motion";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-signal text-white shadow-[0_1px_3px_rgba(201,106,40,0.35)] hover:bg-[#B55A1F]",
  secondary: "border border-border text-signal bg-surface hover:border-signal/50 hover:bg-signalLight/40",
  ghost: "text-secondary hover:text-signal hover:bg-signalLight/40 bg-transparent",
  danger: "border border-gap/30 text-gap hover:bg-gap/10 bg-transparent",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
};

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: Variant;
  size?: Size;
}

/**
 * Standardized button — one radius (14px), one height per size, one focus
 * ring, used everywhere instead of ad-hoc button classNames. Real press
 * feedback (scale down on tap, subtle lift on hover) instead of just a color
 * change — this is what makes clicking something feel responsive rather
 * than instant-and-flat.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", className = "", disabled, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        disabled={disabled}
        whileHover={disabled ? undefined : { y: -1 }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.12 }}
        className={`inline-flex items-center justify-center gap-1.5 rounded-[14px] font-medium
          transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg
          ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export default Button;
