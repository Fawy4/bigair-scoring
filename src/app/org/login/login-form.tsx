"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/auth/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copy } from "@/lib/ui-copy";

function plainMessage(message: string): string {
  if (/signups? not allowed|not allowed for otp/i.test(message)) return copy.login.notRegistered;
  if (/rate limit|too many|seconds/i.test(message)) return copy.login.tooMany;
  return copy.login.couldNotSend;
}

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" } | { kind: "sending" } | { kind: "sent"; to: string } | { kind: "error"; message: string }>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const target = safeNext(next ?? null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(target)}` },
    });
    setState(error ? { kind: "error", message: plainMessage(error.message) } : { kind: "sent", to: email.trim() });
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="rounded-lg border-4 border-[#111] p-4 text-xl font-semibold">
        {copy.login.sentTo(state.to)}
        <p className="mt-2 text-lg">
          {copy.login.sameBrowserBefore}
          <strong>{copy.login.sameBrowserBold}</strong>
          {copy.login.sameBrowserAfter}
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label htmlFor="email" className="text-xl font-bold">
        {copy.login.email}
      </label>
      <Input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-16 border-2 border-[#111] text-xl font-semibold" />
      {state.kind === "error" ? (
        <p role="alert" className="rounded-lg border-2 border-[#111] p-3 text-lg font-semibold">
          {copy.common.problem(state.message)}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={state.kind === "sending"} className="h-16 text-xl font-bold">
        {state.kind === "sending" ? copy.login.sending : copy.login.send}
      </Button>
    </form>
  );
}
