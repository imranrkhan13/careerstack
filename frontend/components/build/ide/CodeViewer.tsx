"use client";

import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { EditorView } from "@codemirror/view";

function langFor(filename?: string) {
  if (!filename) return [javascript({ jsx: true })];
  if (filename.endsWith(".css")) return [css()];
  const ts = filename.endsWith(".ts") || filename.endsWith(".tsx");
  return [javascript({ jsx: true, typescript: ts })];
}

export default function CodeViewer({ value, filename }: { value: string; filename?: string }) {
  return (
    <CodeMirror
      value={value}
      height="100%"
      editable={false}
      readOnly
      extensions={[...langFor(filename), EditorView.lineWrapping]}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
      className="text-[12px] h-full"
    />
  );
}
