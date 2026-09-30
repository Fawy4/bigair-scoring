"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <details className="rounded-lg border-2 border-[#111] p-4" data-testid="self-add">
      <summary className="cursor-pointer text-xl font-bold">{T.summary}</summary>
      {done ? (
        <div role="status" className="mt-4 flex flex-col gap-3">
          <p className="text-xl font-extrabold">{T.doneTitle}</p>
          <p className="text-lg font-semibold">{T.done}</p>
          <Button type="button" variant="outline" className="h-14 text-lg font-bold" onClick={() => { setDone(false); setName(""); setPhone(""); }}>
            {T.again}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <p className="text-lg font-semibold">{T.intro}</p>
          <label htmlFor="self-name" className="text-lg font-bold">
            {T.name}
          </label>
          <Input id="self-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} className="h-14 border-2 border-[#111] text-xl font-bold" />
          <label htmlFor="self-role" className="text-lg font-bold">
            {T.role}
          </label>
          <select id="self-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="h-14 rounded-md border-2 border-[#111] bg-white px-3 text-xl font-bold">
            {Object.entries(T.roles).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor="self-phone" className="text-lg font-bold">
            {T.phone}
          </label>
          <Input id="self-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} className="h-14 border-2 border-[#111] text-xl font-bold" />
          {/* honeypot: hidden from people and from screen readers */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="self-website">Website</label>
            <input id="self-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="rounded-lg border-4 border-[#111] p-3 text-lg font-bold">
              {copy.common.problem(error)}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={busy || name.trim().length < 2} className="h-14 text-lg font-bold">
            {busy ? T.sending : T.send}
          </Button>
        </form>
      )}
    </details>
  );
}
