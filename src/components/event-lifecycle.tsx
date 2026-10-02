"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { FieldLabel } from "@/components/help-button";
import { toast } from "@/hooks/use-toast";
import { slugMatches, eventDeleteBlockedReason } from "@/lib/platform/organisation";
import { copy } from "@/lib/ui-copy";
import { deleteEvent, setEventArchived } from "@/app/org/(console)/events/lifecycle-actions";

const c = copy.eventLifecycle;

/**
 * Archive (always possible) and Delete (only while no result is published, with the web address typed) for one event.
 * Used in the organiser's Event step and, for owners, in the admin events table. The database decides who is allowed.
 */
export function EventLifecycle({
  eventId,
  eventName,
  slug,
  publishedResults,
  archived,
  afterDelete,
  compact,
}: {
  eventId: string;
  eventName: string;
  slug: string;
  publishedResults: number;
  archived: boolean;
  afterDelete: string | null;
  compact?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const blocked = eventDeleteBlockedReason(publishedResults);
  const inputId = `del-${eventId}`;

  return (
    <div className={`flex flex-col gap-4 ${compact ? "min-w-64" : ""}`}>
      <div className="flex flex-col items-start gap-2">
        {compact ? null : <h3>{c.archiveHeading}</h3>}
        <p className="max-w-[70ch] text-body font-medium text-beach-muted">{archived ? c.restoreText : c.archiveText}</p>
        <ConfirmButton
          label={archived ? c.restoreButton : c.archiveButton}
          question={archived ? c.restoreQuestion(eventName) : c.archiveQuestion(eventName)}
          confirmLabel={archived ? c.restoreYes : c.archiveYes}
          cancelLabel={c.cancel}
          pending={pending}
          onConfirm={() =>
            start(async () => {
              setError(null);
              const res = await setEventArchived(eventId, !archived);
              if (res.ok) {
                toast({ title: archived ? c.restored : c.archived });
                router.refresh();
              } else setError(res.error);
            })
          }
        />
      </div>

      <div className="flex flex-col items-start gap-2">
        {compact ? null : <h3>{c.deleteHeading}</h3>}
        <p className="max-w-[70ch] text-body font-medium text-beach-muted">{c.deleteText}</p>
        {blocked ? <p className="panel text-body font-semibold">{blocked}</p> : null}
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor={inputId} text={c.deleteTyped} />
          <input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={Boolean(blocked) || pending} autoComplete="off" spellCheck={false} autoCapitalize="none" className="max-w-sm" />
          <p className="text-small font-medium text-beach-muted">{c.deleteTypedHint(slug)}</p>
        </div>
        <ConfirmButton
          danger
          label={c.deleteButton}
          question={c.deleteQuestion(eventName)}
          confirmLabel={c.deleteYes}
          cancelLabel={c.cancel}
          disabled={Boolean(blocked) || !slugMatches(slug, typed)}
          pending={pending}
          onConfirm={() =>
            start(async () => {
              setError(null);
              const res = await deleteEvent(eventId, typed);
              if (res.ok) {
                toast({ title: c.deleted(eventName) });
                if (afterDelete) router.push(afterDelete);
                router.refresh();
              } else setError(res.error);
            })
          }
        />
      </div>
      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
    </div>
  );
}
