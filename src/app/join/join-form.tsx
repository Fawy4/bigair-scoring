"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { joinErrorMessage } from "@/lib/join/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinWithPin, joinWithToken, type JoinResult } from "./actions";

export function JoinForm({ slug: initialSlug = "", token }: { slug?: string; token?: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auto = useRef(false);

  // A phone that already holds a seat goes straight in; a fresh phone gets an anonymous session first.
  async function ensureSession(): Promise<boolean> {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return true;
    return !(await supabase.auth.signInAnonymously()).error;
  }

  async function run(action: () => Promise<JoinResult>) {
    setBusy(true);
    setError(null);
    if (!(await ensureSession())) {
      setError(joinErrorMessage("NO_SESSION"));
      setBusy(false);
      return;
    }
    const result = await action();
    if (result.ok) router.push("/seat");
    else {
      setError(joinErrorMessage(result.error));
      setBusy(false);
    }
  }

  useEffect(() => {
    if (token && initialSlug && !auto.current) {
      auto.current = true;
      void run(() => joinWithToken({ slug: initialSlug, token }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => joinWithPin({ slug, pin }));
      }}
      className="flex flex-col gap-4"
    >
      {token && busy ? <p role="status" className="rounded-lg border-4 border-[#111] p-4 text-xl font-semibold">Joining with your QR code…</p> : null}
      <label htmlFor="slug" className="text-xl font-bold">
        Event code
      </label>
      <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="h-16 border-2 border-[#111] text-2xl font-bold" />
      <label htmlFor="pin" className="text-xl font-bold">
        Your 6-digit PIN
      </label>
      <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={11} required className="h-16 border-2 border-[#111] text-center text-3xl font-extrabold tracking-widest" />
      {error ? (
        <p role="alert" className="rounded-lg border-4 border-[#111] p-4 text-lg font-bold">
          ✖ {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={busy} className="h-16 text-xl font-bold">
        {busy ? "Joining…" : "Join"}
      </Button>
      <p className="text-base font-semibold">
        iPhone tip: tap Share → “Add to Home Screen” first, then open the app from your home screen and join there. The home-screen app keeps its own login.
      </p>
    </form>
  );
}
