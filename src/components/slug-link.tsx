"use client";

import { useState } from "react";
import { copy } from "@/lib/ui-copy";

/** An event's web address as a link to its public page (new tab), with a button that copies the full address. */
export function SlugLink({ slug, className }: { slug: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const path = `/e/${slug}`;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <a href={path} target="_blank" rel="noopener noreferrer" className="font-bold underline" data-testid="slug-link" aria-label={`${copy.slugLink.open}: /${slug}`}>
        /{slug}
      </a>
      <button type="button" className="btn !min-h-0 !px-3 !py-1 text-sm" onClick={copyAddress} data-testid="slug-copy">
        {state === "copied" ? copy.slugLink.copied : copy.slugLink.copy}
      </button>
      {state === "failed" ? <span role="alert" className="text-sm font-semibold">{copy.slugLink.copyFailed}</span> : null}
    </span>
  );
}
