"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/org/button";
import { eventCodeToPath } from "@/lib/public/event-code";
import { copy } from "@/lib/ui-copy";

/** "Have an event code?": one field for an event that is not on the list. The code is the event's web address ending; there is no sign-up. */
export function EventCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState(false);
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const path = eventCodeToPath(code);
        setProblem(!path);
        if (path) router.push(path);
      }}
    >
      <label htmlFor="event-code" className="text-body font-semibold">
        {copy.landing.codeLabel}
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id="event-code"
          data-testid="event-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={copy.landing.codePlaceholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={problem}
          className="min-h-[var(--org-ctl)] min-w-0 flex-1 basis-56 rounded-[8px] border border-beach-border bg-beach-bg px-3 text-body font-medium text-beach-ink placeholder:text-beach-muted"
        />
        <Button type="submit" variant="secondary">
          {copy.landing.codeGo}
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-small font-semibold text-beach-failed">
          {copy.landing.codeInvalid}
        </p>
      ) : null}
    </form>
  );
}
