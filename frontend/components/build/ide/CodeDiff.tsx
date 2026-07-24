"use client";

import { useEffect, useRef } from "react";
import { MergeView } from "@codemirror/merge";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";

function langFor(filename?: string) {
  if (filename?.endsWith(".css")) return css();
  const ts = filename?.endsWith(".ts") || filename?.endsWith(".tsx");
  return javascript({ jsx: true, typescript: ts });
}

// Side-by-side diff (old on the left, new on the right) with syntax highlighting,
// change markers, and collapsed unchanged regions. Read-only on both sides.
export default function CodeDiff({
  oldValue,
  newValue,
  filename,
}: {
  oldValue: string;
  newValue: string;
  filename?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // No line wrapping in the diff: wrapped continuation lines can overlap the gutter in
    // MergeView. Instead each pane scrolls horizontally, keeping line numbers aligned.
    const readOnly = [EditorView.editable.of(false), EditorState.readOnly.of(true), lineNumbers(), langFor(filename)];
    const view = new MergeView({
      a: { doc: oldValue ?? "", extensions: readOnly },
      b: { doc: newValue ?? "", extensions: readOnly },
      parent: ref.current,
      gutter: true,
      highlightChanges: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
    });
    // Re-measure both panes once the mono web font is ready to avoid overlapping lines.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        view.a.requestMeasure();
        view.b.requestMeasure();
      });
    }
    return () => view.destroy();
  }, [oldValue, newValue, filename]);

  return <div ref={ref} className="cm-merge text-[12px]" />;
}
