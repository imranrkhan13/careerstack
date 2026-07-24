"use client";

import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";

function langFor(filename?: string) {
  if (filename?.endsWith(".css")) return css();
  const ts = filename?.endsWith(".ts") || filename?.endsWith(".tsx");
  return javascript({ jsx: true, typescript: ts });
}

// Read-only file viewer. No line wrapping (long lines scroll horizontally, like VS Code)
// so wrapped lines can never overlap the gutter. Re-measures after the mono web font loads.
export default function CodeViewer({ value, filename }: { value: string; filename?: string }) {
  return (
    <CodeMirror
      value={value}
      height="100%"
      editable={false}
      readOnly
      extensions={[langFor(filename)]}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
      className="text-[12px] h-full"
      onCreateEditor={(view) => {
        const remeasure = () => view.requestMeasure();
        if (typeof document !== "undefined" && document.fonts?.ready) document.fonts.ready.then(remeasure);
        setTimeout(remeasure, 60);
        setTimeout(remeasure, 300);
      }}
    />
  );
}
