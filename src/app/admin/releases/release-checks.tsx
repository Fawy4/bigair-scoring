"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, disabledWhen } from "@/components/org/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { markReleaseTested, tickReleaseCheck } from "./actions";

const C = copy.admin.releases;

interface CheckRow {
  key: string;
  /** The check's words as HTML (rendered from the releases file on the server). */
  html: string;
  /** "Ticked by ‹who›, ‹when›", or null when not ticked. */
  ticked: string | null;
}

/** The checks of one version as tick boxes (each tap is saved at once) and "Confirm version tested". */
export function ReleaseChecks({ version, checks, tested, canTick }: { version: string; checks: CheckRow[]; tested: boolean; canTick: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // what the owner just tapped, until the page comes back from the server with the saved state
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const isTicked = (c: CheckRow) => local[c.key] ?? c.ticked !== null;
  const left = checks.filter((c) => !isTicked(c)).length;

  const tick = (c: CheckRow, ticked: boolean) => {
    setLocal((s) => ({ ...s, [c.key]: ticked }));
    start(async () => {
      const res = await tickReleaseCheck({ version, key: c.key, ticked });
      if (!res.ok) toast({ title: copy.common.problem(res.error) });
      router.refresh();
      setLocal((s) => {
        const next = { ...s };
        delete next[c.key];
        return next;
      });
    });
  };

  const mark = () =>
    start(async () => {
      const res = await markReleaseTested({ version });
      toast({ title: res.ok ? C.marked(version) : copy.common.problem(res.error) });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3" data-testid="release-checks" data-busy={pending ? "true" : "false"}>
      <ul className="flex flex-col gap-1">
        {checks.map((c) => (
          <li key={c.key}>
            <label data-testid="release-check" data-key={c.key} className="flex min-h-[56px] items-start gap-3 rounded-[8px] px-2 py-2 hover:bg-beach-surface">
              <Checkbox className="mt-0.5 size-6" checked={isTicked(c)} disabled={!canTick} onChange={(e) => tick(c, e.currentTarget.checked)} />
              <span className="flex flex-col">
                <span className="text-body font-medium [&_code]:rounded [&_code]:bg-beach-surface [&_code]:px-1" dangerouslySetInnerHTML={{ __html: c.html }} />
                {c.ticked && isTicked(c) ? <span className="text-small text-beach-muted">{c.ticked}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {tested || !canTick ? null : (
        <Button variant="primary" data-testid="release-mark-tested" onClick={mark} {...disabledWhen((left > 0 && C.checksLeft(left)) || (pending && C.saving))}>
          {C.markTested}
        </Button>
      )}
    </div>
  );
}
