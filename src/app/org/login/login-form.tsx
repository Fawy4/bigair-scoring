"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/auth/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function plainMessage(message: string): string {
  if (/signups? not allowed|not allowed for otp/i.test(message)) return "That email address is not registered as an organiser. Ask the owner to add you.";
  if (/rate limit|too many|seconds/i.test(message)) return "Too many sign-in emails were requested. Wait a few minutes (up to an hour) and try again.";
  return "The sign-in email could not be sent. Check the address and your connection, then try again.";
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
        ✔ Link sent to {state.to}.
        <p className="mt-2 text-lg">Open the email on <strong>this same phone or computer, in this same browser</strong>, and tap the link. It works once.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label htmlFor="email" className="text-xl font-bold">
        Your email address
      </label>
      <Input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-16 border-2 border-[#111] text-xl font-semibold" />
      {state.kind === "error" ? (
        <p role="alert" className="rounded-lg border-2 border-[#111] p-3 text-lg font-semibold">
          ✖ {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={state.kind === "sending"} className="h-16 text-xl font-bold">
        {state.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
