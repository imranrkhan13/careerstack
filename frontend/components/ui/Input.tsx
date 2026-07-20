"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

const BASE =
  "w-full rounded-[14px] border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none " +
  "placeholder:text-muted transition-colors duration-150 " +
  "focus:border-signal/60 focus-visible:ring-2 focus-visible:ring-signal/20";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => <input ref={ref} className={`${BASE} ${className}`} {...props} />
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea ref={ref} className={`${BASE} resize-none leading-relaxed ${className}`} {...props} />
  )
);
Textarea.displayName = "Textarea";
