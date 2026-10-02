"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/auth/password";
import { copy } from "@/lib/ui-copy";

const T = copy.setPassword;

/** Sets (or replaces) the password of the organiser who is signed in, for example after signing in with the emailed link. */
export function SetPasswordForm({ changing = false }: { changing?: boolean }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<{ kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, again);
    if (problem) return setState({ kind: "error", message: problem === "short" ? T.tooShort(MIN_PASSWORD_LENGTH) : T.mismatch });
    setState({ kind: "saving" });
    const { error } = await createClient().auth.updateUser({ password, data: { has_password: true } }); // the flag only drives the header button label
    setState(error ? { kind: "error", message: T.couldNotSave } : { kind: "saved" });
  }

  if (state.kind === "saved") {
    return (
      <div role="status" className="panel flex flex-col gap-3">
        <p className="text-lg font-bold">{changing ? T.changed : T.saved}</p>
        <Link href="/org" className="btn btn-primary">
          {T.continue}
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="panel flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="new-password" className="font-bold">
          {T.newPassword}
        </label>
        <input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="new-password-again" className="font-bold">
          {T.again}
        </label>
        <input id="new-password-again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
      </div>
      {state.kind === "error" ? (
        <p role="alert" className="field-error">
          {copy.common.problem(state.message)}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={state.kind === "saving"}>
          {state.kind === "saving" ? T.saving : T.save}
        </button>
      </div>
    </form>
  );
}
