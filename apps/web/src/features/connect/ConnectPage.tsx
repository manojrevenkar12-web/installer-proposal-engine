import { useState } from "react";
import { apiKey } from "../../shared/api/client.ts";

export function ConnectPage({ onConnected }: { onConnected: () => void }) {
  const [value, setValue] = useState("");
  const valid = value.trim().startsWith("ipe_") && value.trim().length > 20;
  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-semibold">Connect your company</h1>
      <p className="mt-2 text-ink-2">Paste the API key you received when your company was set up. It stays in this browser.</p>
      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!valid) return; apiKey.set(value.trim()); onConnected(); }}>
        <label className="sr-only" htmlFor="key">API key</label>
        <input id="key" value={value} onChange={(e) => setValue(e.target.value)} placeholder="ipe_…" autoComplete="off"
          className="min-w-0 flex-1 rounded-[var(--radius-mark)] border border-line bg-surface px-3 py-2" />
        <button type="submit" disabled={!valid} className="rounded-[var(--radius-mark)] bg-ink px-4 py-2 font-medium text-paper disabled:opacity-40">Connect</button>
      </form>
      <p className="mt-4 text-sm text-ink-3">No key yet? <code>node lab/src/seed-api.ts</code> creates a demo company and prints one.</p>
    </section>
  );
}
