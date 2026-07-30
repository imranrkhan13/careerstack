"use client";

import { Fragment, type ReactNode } from "react";

// Boardy messages are plain text emails, so use a deliberately small and safe
// Markdown subset rather than injecting email HTML into the app. It covers the
// things people actually see in a reply: links, emphasis and inline code.
const MARKDOWN_LINK = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g;
const INLINE_TOKEN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

export function gmailComposeUrl(email: string) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email.trim())}`;
}

function splitUrlPunctuation(url: string) {
  const match = url.match(/[.,!?;:]+$/);
  if (!match) return { url, punctuation: "" };
  return { url: url.slice(0, -match[0].length), punctuation: match[0] };
}

function TextLink({ href, children, title }: { href: string; children: ReactNode; title?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className="font-medium text-signal underline decoration-signal/35 underline-offset-2 transition-colors hover:text-signalHover hover:decoration-signal"
    >
      {children}
    </a>
  );
}

/**
 * An email address is an action, not dead text. In Boardy, callers pass
 * `onCompose` to keep that action inside the app; other compact UI surfaces
 * retain the Gmail compose fallback.
 */
export function EmailLink({
  email,
  children,
  className = "",
  onCompose,
}: {
  email: string;
  children?: ReactNode;
  className?: string;
  onCompose?: (email: string) => void;
}) {
  const linkClassName = `break-all font-medium text-signal underline decoration-signal/35 underline-offset-2 transition-colors hover:text-signalHover hover:decoration-signal ${className}`;

  if (onCompose) {
    return (
      <button
        type="button"
        onClick={() => onCompose(email)}
        title={`Start a new email to ${email}`}
        className={linkClassName}
      >
        {children ?? email}
      </button>
    );
  }

  return (
    <a
      href={gmailComposeUrl(email)}
      target="_blank"
      rel="noreferrer"
      title={`Compose an email to ${email} in Gmail`}
      className={linkClassName}
    >
      {children ?? email}
    </a>
  );
}

function renderPlainSegment(text: string, keyPrefix: string, onEmailClick?: (email: string) => void): ReactNode[] {
  const content: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  INLINE_TOKEN.lastIndex = 0;
  while ((match = INLINE_TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) content.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("`")) {
      content.push(
        <code key={key} className="rounded bg-text/5 px-1 py-0.5 font-mono text-[0.86em] text-text">
          {token.slice(1, -1)}
        </code>
      );
    } else if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      content.push(<strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      content.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (/^https?:\/\//i.test(token)) {
      const { url, punctuation } = splitUrlPunctuation(token);
      content.push(<TextLink key={key} href={url}>{url}</TextLink>);
      if (punctuation) content.push(punctuation);
    } else {
      content.push(<EmailLink key={key} email={token} onCompose={onEmailClick} />);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) content.push(text.slice(lastIndex));
  return content;
}

/**
 * Renders the common Markdown and email conventions in Boardy messages. Raw
 * `**bold**` markers no longer leak into bubbles; URLs open normally; and a
 * bare email address can open an in-app composer when a handler is supplied.
 */
export default function LinkedText({
  text,
  className = "",
  onEmailClick,
}: {
  text: string;
  className?: string;
  onEmailClick?: (email: string) => void;
}) {
  const segments: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  MARKDOWN_LINK.lastIndex = 0;
  while ((match = MARKDOWN_LINK.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(
        <Fragment key={`plain-${index}`}>
          {renderPlainSegment(text.slice(lastIndex, match.index), `plain-${index}`, onEmailClick)}
        </Fragment>
      );
    }

    const href = match[2];
    const isEmail = href.startsWith("mailto:");
    segments.push(
      isEmail ? (
        <EmailLink key={`link-${index}`} email={href.slice("mailto:".length)} onCompose={onEmailClick}>{match[1]}</EmailLink>
      ) : (
        <TextLink key={`link-${index}`} href={href}>{match[1]}</TextLink>
      )
    );
    lastIndex = match.index + match[0].length;
    index++;
  }

  if (lastIndex < text.length) {
    segments.push(
      <Fragment key={`plain-${index}`}>
        {renderPlainSegment(text.slice(lastIndex), `plain-${index}`, onEmailClick)}
      </Fragment>
    );
  }

  return <span className={className}>{segments}</span>;
}
