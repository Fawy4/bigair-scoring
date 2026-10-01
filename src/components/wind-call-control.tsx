"use client";

import { useEffect, useMemo, useState } from "react";
import { Wind } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { setWindCall } from "@/lib/live/wind-actions";
import { copy } from "@/lib/ui-copy";

const T = copy.windCall;
const SWATCH: Record<string, string> = { red: "#b91c1c", amber: "#b45309", green: "#15803d" };

type Call = { status: string; message: string | null } | null;

/**
 * The wind call: three buttons (always with the word), a short message and a "Clear banner". Used on the organiser's dashboard and the head judge's console.
 * What it sets is what the public pages and the big screen show.
 */
export function WindCallControl({ eventId, bannerOn = true }: { eventId: string; bannerOn?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [current, setCurrent] = useState<Call>(null);
  const [pick, setPick] = useState<"red" | "amber" | "green">("amber");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.resolve(supabase.from("wind_calls").select("status, message").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1)).then((r) => {
      if (!live) return;
      const row = r.data?.[0];
      setCurrent(row && row.status !== "clear" ? { status: row.status, message: row.message } : null);
    });
    return () => {
      live = false;
    };
  }, [supabase, eventId]);

  const send = async (status: "red" | "amber" | "green" | "clear") => {
    setBusy(true);
    setNote(null);
    const res = await setWindCall({ eventId, status, message: status === "clear" ? null : message.trim() || null });
    setBusy(false);
    if (!res.ok) return setNote(res.message);
    setCurrent(status === "clear" ? null : { status, message: message.trim() || null });
    setNote(status === "clear" ? T.cleared : T.done);
    if (status === "clear") setMessage("");
  };

  return (
    <section data-testid="wind-call" aria-label={T.heading} className="flex flex-col gap-2 rounded-xl border border-current/30 p-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Wind aria-hidden className="size-4" />
        {T.heading}
      </h2>
      <p data-testid="wind-now" className="text-sm font-medium">
        {current ? T.nowShowing(T.states[current.status] ?? current.status, current.message) : T.nothingShowing}
      </p>
      {!bannerOn ? <p className="text-sm font-medium">{T.bannerOffNote}</p> : null}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={T.heading}>
        {(["red", "amber", "green"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={pick === s}
            data-testid={`wind-${s}`}
            onClick={() => setPick(s)}
            className={`min-h-[44px] rounded-xl border-2 px-3 text-sm font-semibold ${pick === s ? "border-current" : "border-current/30"}`}
          >
            <span aria-hidden className="mr-2 inline-block size-3 rounded-full align-middle" style={{ background: SWATCH[s] }} />
            {T.states[s]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {T.message}
        <input value={message} maxLength={140} onChange={(e) => setMessage(e.target.value)} placeholder={T.messagePlaceholder} className="min-h-[44px] rounded-lg border-2 border-current/40 bg-transparent px-2 font-medium" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="wind-set" disabled={busy} onClick={() => send(pick)} className="min-h-[44px] rounded-xl border-2 border-current px-4 text-sm font-semibold">
          {busy ? T.setting : T.set}
        </button>
        <button type="button" data-testid="wind-clear" disabled={busy || !current} onClick={() => send("clear")} className="min-h-[44px] rounded-xl border-2 border-current/40 px-4 text-sm font-semibold">
          {T.clear}
        </button>
      </div>
      {note ? (
        <p role="status" data-testid="wind-note" className="text-sm font-semibold">
          {note}
        </p>
      ) : null}
    </section>
  );
}
