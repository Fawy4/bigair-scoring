"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { joinErrorMessage } from "@/lib/join/messages";
import { copy } from "@/lib/ui-copy";
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
      className="home-stack"
    >
      {token && busy ? (
        <p role="status" className="home-notice">
          {copy.join.qrJoining}
        </p>
      ) : null}
      <div className="home-field">
        <label htmlFor="slug">{copy.join.eventCode}</label>
        <input id="slug" className="home-input" value={slug} onChange={(e) => setSlug(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
      </div>
      <div className="home-field">
        <label htmlFor="pin">{copy.join.pin}</label>
        <input id="pin" className="home-input pin" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={11} required />
      </div>
      {error ? (
        <p role="alert" className="home-alert">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="home-go wide">
        {busy ? copy.join.joining : copy.join.button}
      </button>
      <p className="home-tip">{copy.join.iphoneTip}</p>
    </form>
  );
}
