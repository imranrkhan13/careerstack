"use client";

import { Fragment } from "react";

// Matches [text](url) — the actual markdown link syntax Boardy (and pasted
// content) uses, plus bare https:// URLs so a raw link in plain text also
// becomes clickable instead of just sitting there as text.
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /(https?:\/\/[^\s]+)/g;

function linkifyPlainSegment(text: string, keyPrefix: string) {
  const parts = text.split(BARE_URL);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={`${keyPrefix}-url-${i}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="text-signal hover:underline break-all"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

/**
 * Renders `[text](url)` as a real clickable link instead of showing the raw
 * markdown brackets — this is what makes a pasted message like Boardy's outreach
 * draft (full of [AgentLens](url) style links) look the same rendered as it did
 * when you wrote it, instead of dumping the raw syntax into a chat bubble.
 */
export default function LinkedText({ text, className = "" }: { text: string; className?: string }) {
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  MARKDOWN_LINK.lastIndex = 0;
  while ((match = MARKDOWN_LINK.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(<Fragment key={`t-${i}`}>{linkifyPlainSegment(text.slice(lastIndex, match.index), `s${i}`)}</Fragment>);
    }
    segments.push(
      <a
        key={`link-${i}`}
        href={match[2]}
        target="_blank"
        rel="noreferrer"
        className="text-signal hover:underline"
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
    i++;
  }
  if (lastIndex < text.length) {
    segments.push(<Fragment key={`t-${i}`}>{linkifyPlainSegment(text.slice(lastIndex), `s${i}`)}</Fragment>);
  }

  return <span className={className}>{segments}</span>;
}
