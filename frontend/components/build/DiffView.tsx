"use client";

function lineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-muted";
  if (line.startsWith("@@")) return "text-signal bg-signalLight/40";
  if (line.startsWith("+")) return "text-success bg-success/5";
  if (line.startsWith("-")) return "text-gap bg-gap/5";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "text-muted";
  return "text-secondary";
}

export default function DiffView({ diff }: { diff: string }) {
  if (!diff) return <p className="text-xs text-muted italic px-3 py-2">No textual diff.</p>;
  const lines = diff.split("\n");
  return (
    <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto rounded-lg border border-border bg-raised/40">
      {lines.map((ln, i) => (
        <div key={i} className={`px-3 whitespace-pre ${lineClass(ln)}`}>
          {ln || " "}
        </div>
      ))}
    </pre>
  );
}
