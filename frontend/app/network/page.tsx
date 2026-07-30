"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Skeleton from "@/components/ui/Skeleton";
import ComposeThread from "@/components/boardy/ComposeThread";
import { api } from "@/lib/api";

export default function NetworkPage() {
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof api.boardyNetwork>> | null>(null);
  const [error, setError] = useState<any>(null);
  const [composeTo, setComposeTo] = useState<string | null>(null);

  function load() {
    api.boardyNetwork().then(setContacts).catch((e) => setError(e));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="People" />
      <MobileNav active="People" />
      <main className="flex-1 px-8 py-6 pb-24 lg:pb-6 max-w-3xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text tracking-tight">People</h1>
            <p className="mt-1 text-sm text-secondary">Contacts Boardy named in your messages. Links and email addresses appear only when Boardy included them.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={load}>Refresh</Button>
        </div>

        {error && <ErrorPanel error={error} />}

        {!contacts && !error && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {contacts && contacts.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-3xl mb-3">🤝</p>
            <p className="text-sm font-medium text-text mb-1.5">Nothing here yet.</p>
            <p className="text-sm text-secondary">
              Ask Boardy for people to meet at a company or in a field. When a reply includes a LinkedIn link or email, it appears here automatically.
            </p>
          </Card>
        )}

        <div className="space-y-2">
          {contacts?.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text">{c.name}</p>
                  <Badge tone="signal">via Boardy</Badge>
                </div>
                <p className="text-xs text-secondary mt-0.5">
                  {[c.role, c.company].filter(Boolean).join(" · ") || "No role/company given"}
                </p>
                {c.note && <p className="text-xs text-muted mt-1">{c.note}</p>}
                {c.email && <p className="mt-1 text-xs font-medium text-signal">{c.email}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {c.email && <button onClick={() => setComposeTo(c.email!)} className="text-xs font-medium text-signal hover:underline">Email</button>}
                {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-signal hover:underline">LinkedIn ↗</a>}
              </div>
            </Card>
          ))}
        </div>
      </main>
      {composeTo && (
        <ComposeThread
          initialTo={composeTo}
          onClose={() => setComposeTo(null)}
          onCreated={() => setComposeTo(null)}
        />
      )}
    </div>
  );
}
