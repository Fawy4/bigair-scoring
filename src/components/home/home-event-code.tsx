"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { eventCodeToPath } from "@/lib/public/event-code";

/**
 * "Have an event code?": one field for an event that is not on the list. The code is the end of the event's web address; there is no sign-up.
 * The words come in as props: this small client piece does not load the whole copy file.
 */
export function HomeEventCode({ label, placeholder, go, invalid }: { label: string; placeholder: string; go: string; invalid: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState(false);
  return (
    <form
      className="home-code"
      onSubmit={(e) => {
        e.preventDefault();
        const path = eventCodeToPath(code);
        setProblem(!path);
        if (path) router.push(path);
      }}
    >
      <label htmlFor="event-code">{label}</label>
      <div className="row">
        <input id="event-code" data-testid="event-code-input" className="home-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder={placeholder} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={problem} />
        <button type="submit" className="home-go">
          {go}
        </button>
      </div>
      {problem ? (
        <p role="alert" className="home-problem">
          {invalid}
        </p>
      ) : null}
    </form>
  );
}
