"use client";

import { useState } from "react";
import { copy } from "@/lib/ui-copy";
import { requestSeat } from "./actions";

const T = copy.join.selfAdd;

/** "Not on the list? Add your name": a pending request, never a seat. A hidden field catches scripts. */
export function SelfAddForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"judge" | "spotter" | "announcer">("judge");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await requestSeat({ slug, name, role, phone, website });
      if (r.ok) setDone(true);
      else setError(T.errors[r.error] ?? T.failed);
    } catch {
      setError(T.failed);
    }
    setBusy(false);
  }

  return (
    <details className="home-details" data-testid="self-add">
      <summary>{T.summary}</summary>
      {done ? (
        <div role="status" className="home-stack" style={{ marginTop: 16 }}>
          <p className="home-name">{T.doneTitle}</p>
          <p className="home-meta">{T.done}</p>
          <button type="button" className="home-secondary" onClick={() => { setDone(false); setName(""); setPhone(""); }}>
            {T.again}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="home-stack" style={{ marginTop: 16 }}>
          <p className="home-meta">{T.intro}</p>
          <label htmlFor="self-name" style={{ fontWeight: 700 }}>{T.name}</label>
          <input id="self-name" className="home-input" style={{ flex: "none", width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} />
          <label htmlFor="self-role" style={{ fontWeight: 700 }}>{T.role}</label>
          <select id="self-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="home-input" style={{ flex: "none", width: "100%" }}>
            {Object.entries(T.roles).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor="self-phone" style={{ fontWeight: 700 }}>{T.phone}</label>
          <input id="self-phone" className="home-input" style={{ flex: "none", width: "100%" }} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} />
          {/* honeypot: hidden from people and from screen readers */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="self-website">Website</label>
            <input id="self-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="home-alert">
              {copy.common.problem(error)}
            </p>
          ) : null}
          <button type="submit" disabled={busy || name.trim().length < 2} className="home-secondary">
            {busy ? T.sending : T.send}
          </button>
        </form>
      )}
    </details>
  );
}
