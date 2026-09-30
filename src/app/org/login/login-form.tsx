"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { hasExplicitNext, landingPath } from "@/lib/auth/landing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copy } from "@/lib/ui-copy";

function plainMessage(message: string): string {
  if (/signups? not allowed|not allowed for otp/i.test(message)) return copy.login.notRegistered;
  if (/rate limit|too many|seconds/i.test(message)) return copy.login.tooMany;
  return copy.login.couldNotSend;
}

type State = { kind: "idle" } | { kind: "working" } | { kind: "sent"; message: string } | { kind: "error"; message: string };

/**
 * Organiser sign-in, invite-only: email + password (the default), or an emailed link. "Forgot password?" sends the same link and lands
 * on the set-password page. There is no sign-up here: an account exists only when the owner created it.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const target = landingPath({ next, isPlatformAdmin: false }); // organisers' page; platform admins are sent to /admin below unless a page was asked for
  const asked = hasExplicitNext(next);

  async function sendLink(landing: string | null, sentText: (to: string) => string) {
    setState({ kind: "working" });
    const to = email.trim();
    const { error } = await createClient().auth.signInWithOtp({
      email: to,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm${landing ? `?next=${encodeURIComponent(landing)}` : ""}` }, // no page asked for: the confirm route decides (/admin for platform admins)
    });
    setState(error ? { kind: "error", message: plainMessage(error.message) } : { kind: "sent", message: sentText(to) });
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "working" });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      // one message for a wrong password and an unknown address: it must not reveal who has an account
      setState({ kind: "error", message: /rate limit|too many/i.test(error.message) ? copy.login.tooMany : copy.login.wrongPassword });
      return;
    }
    const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true });
    const { data: platform } = await supabase.rpc("platform_session");
    const isPlatformAdmin = Boolean((platform as { role?: string | null } | null)?.role);
    if (!count && !isPlatformAdmin) {
      await supabase.auth.signOut(); // invite-only: an account that is not an organiser gets no further
      setState({ kind: "error", message: copy.login.notAnOrganiser });
      return;
    }
    router.push(landingPath({ next, isPlatformAdmin }));
    router.refresh();
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="rounded-lg border-4 border-[#111] p-4 text-xl font-semibold">
        {state.message}
        <p className="mt-2 text-lg">
          {copy.login.sameBrowserBefore}
          <strong>{copy.login.sameBrowserBold}</strong>
          {copy.login.sameBrowserAfter}
        </p>
      </div>
    );
  }

  const working = state.kind === "working";
  const error =
    state.kind === "error" ? (
      <p role="alert" className="rounded-lg border-2 border-[#111] p-3 text-lg font-semibold">
        {copy.common.problem(state.message)}
      </p>
    ) : null;
  const emailField = (
    <>
      <label htmlFor="email" className="text-xl font-bold">
        {copy.login.email}
      </label>
      <Input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-16 border-2 border-[#111] text-xl font-semibold" />
    </>
  );

  if (mode === "link") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendLink(asked ? target : null, copy.login.sentTo);
        }}
        className="flex flex-col gap-4"
      >
        {emailField}
        {error}
        <Button type="submit" size="lg" disabled={working} className="h-16 text-xl font-bold">
          {working ? copy.login.sending : copy.login.send}
        </Button>
        <button type="button" className="btn" onClick={() => { setMode("password"); setState({ kind: "idle" }); }}>
          {copy.login.passwordInstead}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={signInWithPassword} className="flex flex-col gap-4">
      {emailField}
      <label htmlFor="password" className="text-xl font-bold">
        {copy.login.password}
      </label>
      <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-16 border-2 border-[#111] text-xl font-semibold" />
      {error}
      <Button type="submit" size="lg" disabled={working} className="h-16 text-xl font-bold">
        {working ? copy.login.signingIn : copy.login.signIn}
      </Button>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={() => { setMode("link"); setState({ kind: "idle" }); }}>
          {copy.login.linkInstead}
        </button>
        <button
          type="button"
          className="btn"
          disabled={working}
          onClick={() => {
            if (email.trim() === "") setState({ kind: "error", message: copy.login.forgotNeedsEmail });
            else void sendLink("/org/set-password", copy.login.forgotSentTo);
          }}
        >
          {copy.login.forgot}
        </button>
      </div>
      <p className="text-sm font-semibold">{copy.login.setPasswordLink}</p>
    </form>
  );
}
