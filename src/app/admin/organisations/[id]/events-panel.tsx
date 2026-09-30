"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { FieldLabel } from "@/components/help-button";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { EventLifecycle } from "@/components/event-lifecycle";
import { moveEvent } from "../../actions";

const c = copy.admin.org;
const th = "border-2 border-[#111] bg-[#eee] p-2 text-left";
const td = "border-2 border-[#111] p-2 align-top";

interface EventRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  dates: string;
  divisions: number;
  running: boolean;
  published: number;
  archived: boolean;
}

/** The organisation's events, each with the owner-only "Move event to another organisation" action. */
export function EventsPanel({ orgName, events, others, isOwner }: { orgName: string; events: EventRow[]; others: { id: string; name: string }[]; isOwner: boolean }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="events-h">
      <h2 id="events-h" className="text-2xl font-extrabold">
        {c.eventsHeading}
      </h2>
      {events.length === 0 ? (
        <p className="panel font-semibold">{c.eventsNone}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{c.eventColumns.name}</th>
                <th className={th}>{c.eventColumns.slug}</th>
                <th className={th}>{c.eventColumns.status}</th>
                <th className={th}>{c.eventColumns.dates}</th>
                <th className={th}>{c.eventColumns.divisions}</th>
                <th className={th}>{c.eventColumns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className={`${td} font-bold`}>{e.name}</td>
                  <td className={td}>/{e.slug}</td>
                  <td className={td}>
                    {e.status}
                    {e.archived ? ` · ${copy.eventLifecycle.archivedTag}` : ""}
                  </td>
                  <td className={td}>{e.dates}</td>
                  <td className={td}>{e.divisions}</td>
                  <td className={td}>
                    {isOwner ? (
                      <div className="flex flex-col gap-4">
                        <MoveEvent event={e} orgName={orgName} others={others} />
                        <EventLifecycle compact eventId={e.id} eventName={e.name} slug={e.slug} publishedResults={e.published} archived={e.archived} afterDelete={null} />
                      </div>
                    ) : (
                      <span className="text-sm font-semibold">{c.moveOwnerOnly}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MoveEvent({ event, orgName, others }: { event: EventRow; orgName: string; others: { id: string; name: string }[] }) {
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const to = others.find((o) => o.id === target);
  const id = `move-${event.id}`;
  if (others.length === 0) return <span className="text-sm font-semibold">{c.moveNoOthers}</span>;
  return (
    <div className="flex min-w-64 flex-col gap-2">
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={id} text={`${c.moveTo} (${event.name})`} help={{ text: c.moveText, example: c.moveHeading }} />
        <select id={id} value={target} onChange={(e) => setTarget(e.target.value)} disabled={pending || event.running}>
          <option value="">{c.moveChoose}</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      {event.running ? <p className="text-sm font-bold">{c.moveRunning}</p> : null}
      <ConfirmButton
        label={c.moveButton}
        question={c.moveQuestion(event.name, orgName, to?.name ?? "")}
        confirmLabel={c.moveYes}
        cancelLabel={c.moveCancel}
        disabled={!to || event.running}
        pending={pending}
        onConfirm={() =>
          start(async () => {
            setError(null);
            const res = await moveEvent(event.id, target);
            if (res.ok) {
              const s = res.summary;
              toast({ title: c.moved(event.name, to!.name), description: c.movedDetail(s.riders_copied, s.riders_reused, s.riders_removed, s.presets_copied) });
              router.refresh();
            } else setError(res.error);
          })
        }
      />
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
    </div>
  );
}
