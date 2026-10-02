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
    await supabase.auth.updateUser({ data: { has_password: true } }); // a password that just worked: the header says "Change password" from now on
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
      <div role="status" className="rounded-card border border-beach-line bg-beach-surface p-4 text-body font-semibold">
        {state.message}
        <p className="mt-2 font-medium">
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
      <p role="alert" className="rounded-card border border-beach-failed p-3 text-body font-semibold text-beach-failed">
        {copy.common.problem(state.message)}
      </p>
    ) : null;
  const emailField = (
    <>
      <label htmlFor="email" className="text-body font-semibold">
        {copy.login.email}
      </label>
      <Input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
    </>
  );

  if (mode === "link") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendLink(asked ? target : null, copy.login.sentTo);
        }}
        className="flex flex-col gap-3"
      >
        {emailField}
        {error}
        <Button type="submit" disabled={working} className="self-start">
          {working ? copy.login.sending : copy.login.send}
        </Button>
        <Button type="button" variant="ghost" className="self-start" onClick={() => { setMode("password"); setState({ kind: "idle" }); }}>
          {copy.login.passwordInstead}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={signInWithPassword} className="flex flex-col gap-3">
      {emailField}
      <label htmlFor="password" className="text-body font-semibold">
        {copy.login.password}
      </label>
      <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      {error}
      <Button type="submit" disabled={working} className="self-start">
        {working ? copy.login.signingIn : copy.login.signIn}
      </Button>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="ghost" onClick={() => { setMode("link"); setState({ kind: "idle" }); }}>
          {copy.login.linkInstead}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={working}
          onClick={() => {
            if (email.trim() === "") setState({ kind: "error", message: copy.login.forgotNeedsEmail });
            else void sendLink("/org/set-password", copy.login.forgotSentTo);
          }}
        >
          {copy.login.forgot}
        </Button>
      </div>
      <p className="text-small font-medium text-beach-muted">{copy.login.setPasswordLink}</p>
    </form>
  );
}
