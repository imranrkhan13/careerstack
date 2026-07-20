"use client";

import { useState } from "react";
import { ApiError } from "@/lib/apiError";

export default function ErrorPanel({ error, title }: { error: ApiError | Error | string; title?: string }) {
  const [showStack, setShowStack] = useState(false);

  if (!(error instanceof ApiError)) {
    const message = typeof error === "string" ? error : error.message;
    return (
      <div className="rounded-lg border border-gap/30 bg-gap/5 px-4 py-3">
        <p className="text-sm font-semibold text-gap mb-1">{title ?? "Something went wrong"}</p>
        <p className="text-xs text-secondary">{message}</p>
      </div>
    );
  }

  if (error.kind === "network") {
    const n = error.network;
    return (
      <div className="rounded-lg border border-gap/30 bg-gap/5 px-4 py-3">
        <p className="text-sm font-semibold text-gap mb-2">
          {n?.likelyCors ? "CORS Configuration Error" : n?.offline ? "You're offline" : "Network Error"}
        </p>
        <Field label="Request URL" value={n?.requestUrl} mono />
        <Field label="Frontend origin" value={n?.frontendOrigin} mono />
        {n?.likelyCors && (
          <>
            <p className="text-xs text-secondary mt-2">
              The server responded to a no-cors probe at this URL, but rejected the real request —
              that's the signature of a CORS policy blocking your frontend's origin.
            </p>
            <SuggestionBlock
              text={`Add your frontend origin to the backend's CORS config (app/main.py):\n\nCORSMiddleware(allow_origins=["${n.frontendOrigin}"])`}
            />
          </>
        )}
        {!n?.likelyCors && !n?.offline && (
          <p className="text-xs text-secondary mt-2">
            The request never got a response at all — the backend may not be running, or an incorrect
            API URL is configured.
          </p>
        )}
        {n?.offline && <p className="text-xs text-secondary mt-2">Your browser reports no network connection.</p>}
      </div>
    );
  }

  const s = error.structured;

  return (
    <div className="rounded-lg border border-gap/30 bg-gap/5 px-4 py-3">
      <p className="text-sm font-semibold text-gap mb-2">❌ {title ?? "Request Failed"}</p>
      <Field label="Endpoint" value={`${error.method} ${error.endpoint}`} mono />
      <Field label="Status" value={error.status ? `${error.status}` : undefined} mono />

      {s ? (
        <>
          <Field label="Reason" value={s.message} />
          {s.details && <Field label="Details" value={s.details} />}
          {s.missing && s.missing.length > 0 && <Field label="Missing" value={s.missing.join(", ")} mono />}
          {s.suggestion && <SuggestionBlock text={s.suggestion} />}
          {s.stack && (
            <div className="mt-2">
              <button onClick={() => setShowStack((v) => !v)} className="text-xs text-muted hover:text-secondary underline">
                {showStack ? "▲ Hide" : "▼ Show"} Stack Trace (Developer Details)
              </button>
              {showStack && (
                <pre className="mt-2 text-[10px] font-mono text-secondary whitespace-pre-wrap bg-raised border border-border rounded-md p-2.5 max-h-64 overflow-y-auto">
                  {s.stack}
                </pre>
              )}
            </div>
          )}
        </>
      ) : (
        <Field label="Response" value={error.rawBody?.slice(0, 300) || error.message} mono />
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="mb-1.5">
      <span className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide">{label}: </span>
      <span className={`text-xs text-secondary ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function SuggestionBlock({ text }: { text: string }) {
  return (
    <div className="mt-2 rounded-md bg-signal/10 border border-signal/20 px-3 py-2">
      <p className="text-[11px] font-mono font-medium text-signal uppercase tracking-wide mb-1">Suggestion</p>
      <p className="text-xs text-text whitespace-pre-wrap">{text}</p>
    </div>
  );
}
