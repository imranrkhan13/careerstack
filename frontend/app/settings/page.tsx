"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { api, GmailStatus } from "@/lib/api";
import ErrorPanel from "@/components/ui/ErrorPanel";

export default function SettingsPage() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [error, setError] = useState<any>(null);
  const [connecting, setConnecting] = useState(false);

  function load() {
    api.gmailStatus().then(setStatus).catch((e) => setError(e));
  }

  useEffect(() => {
    load();
  }, []);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const { auth_url } = await api.gmailLoginUrl();
      window.location.href = auth_url;
    } catch (e: any) {
      setError(e);
      setConnecting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="Settings" />
      <MobileNav active="Settings" />
      <main className="flex-1 px-8 py-6 pb-20 lg:pb-6 max-w-lg">
        <h1 className="text-lg font-bold text-text tracking-tight mb-6">Settings</h1>

        <Card>
          <p className="text-sm font-semibold text-text mb-1">Gmail</p>
          <p className="text-xs text-secondary mb-3">
            Needed to send Boardy emails and detect replies. Requires a Google OAuth client
            configured on the backend.
          </p>

          {status?.connected ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-signal" />
              <span className="text-sm text-text">Connected as {status.email}</span>
            </div>
          ) : (
            <Button variant="primary" onClick={connect} disabled={connecting}>
              {connecting ? "Redirecting…" : "Connect Gmail"}
            </Button>
          )}

          {error && (
            <div className="mt-3">
              <ErrorPanel error={error} title="Gmail Connection Failed" />
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
