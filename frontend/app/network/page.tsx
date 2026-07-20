"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";

export default function NetworkPage() {
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof api.boardyNetwork>> | null>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    api.boardyNetwork().then(setContacts).catch((e) => setError(e));
  }, []);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="Network" />
      <MobileNav active="Network" />
      <main className="flex-1 px-8 py-6 pb-24 lg:pb-6 max-w-3xl">
        <h1 className="text-lg font-bold text-text tracking-tight">Network</h1>
        <p className="text-sm text-secondary mt-1 mb-6">
          Every person Boardy has actually named across your conversations — pulled from real replies,
          never invented. A LinkedIn link only shows if Boardy's email literally included one.
        </p>

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
              When Boardy suggests someone worth connecting with in a reply, they'll show up here
              automatically.
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
              </div>
              {c.linkedin_url ? (
                <a
                  href={c.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-signal hover:underline shrink-0"
                >
                  LinkedIn ↗
                </a>
              ) : (
                <span className="text-xs text-muted shrink-0">No LinkedIn given</span>
              )}
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
