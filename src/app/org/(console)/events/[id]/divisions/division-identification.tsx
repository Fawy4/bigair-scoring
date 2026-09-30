"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { IdentificationSchemeSchema } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";
import { IdentificationEditor } from "../../identification-editor";
import { saveDivisionIdentification } from "./actions";

const T = copy.divisions.identification;

/** "Use the event's identification" (default) or this division's own scheme, with the same editor as the Event step. */
export function DivisionIdentification({
  eventId,
  divisionId,
  organisationId,
  eventScheme,
  allowOverride,
  presets,
  initial,
  onSaved,
}: {
  eventId: string;
  divisionId: string;
  organisationId: string;
  eventScheme: IdentificationScheme;
  allowOverride: boolean;
  presets: IdentificationScheme[];
  initial: { scheme: IdentificationScheme; basedOn?: string } | null;
  onSaved: (stored: { scheme: IdentificationScheme; basedOn?: string } | null) => void;
}) {
  const [own, setOwn] = useState(Boolean(initial));
  const [value, setValue] = useState<{ scheme: IdentificationScheme; basedOn?: string; allowDivisionOverride: boolean }>({ scheme: initial?.scheme ?? structuredClone(eventScheme), basedOn: initial?.basedOn, allowDivisionOverride: false });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const problems = (() => {
    const r = IdentificationSchemeSchema.safeParse(value.scheme);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  })();

  function save(toOwn: boolean) {
    setError(null);
    start(async () => {
      const res = await saveDivisionIdentification({ divisionId, scheme: toOwn ? value.scheme : null, basedOn: value.basedOn });
      if (!res.ok) return setError(res.error);
      onSaved(toOwn ? { scheme: value.scheme, basedOn: value.basedOn } : null);
      toast({ title: toOwn ? T.saved : T.savedEvent });
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="division-identification">
      <p className="font-semibold">{T.eventScheme(eventScheme.name)}</p>
      {!allowOverride ? (
        <div className="panel flex flex-col gap-2" role="note">
          <p className="font-bold">{T.switchOff}</p>
          {initial ? <p className="font-semibold">{T.ownKeptButOff}</p> : null}
          <Link href={`/org/events/${eventId}/event`} className="btn w-fit">
            {T.toEventStep}
          </Link>
        </div>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <label className="flex items-center gap-3 font-bold">
              <input type="radio" name={`ident-mode-${divisionId}`} checked={!own} onChange={() => setOwn(false)} />
              {T.useEvent}
            </label>
            <label className="flex items-center gap-3 font-bold">
              <input type="radio" name={`ident-mode-${divisionId}`} checked={own} onChange={() => setOwn(true)} />
              {T.own}
            </label>
          </fieldset>
          {own ? <IdentificationEditor division value={value} onChange={setValue} presets={presets} organisationId={organisationId} errors={problems} /> : null}
          {error ? (
            <p role="alert" className="field-error">
              {copy.common.problem(error)}
            </p>
          ) : null}
          <div>
            <button type="button" className="btn btn-primary" disabled={pending || (own && problems.length > 0)} onClick={() => save(own)} data-testid="division-identification-save">
              {own ? T.save : copy.common.save}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
