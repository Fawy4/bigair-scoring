"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { PrintButton } from "@/components/print-button";
import { copy } from "@/lib/ui-copy";
import { prepareCards, type CardData } from "../actions";

const T = copy.officials;
type Loaded = { eventName: string; joinUrl: string; cards: Array<CardData & { qr: string | null }> };

/** The printable official cards: event, seat name, role, the PIN in big digits and a QR code of the join link. */
export function CardsSheet({ eventId, seatId }: { eventId: string; seatId: string | null }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: Loaded }>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await prepareCards(eventId, seatId);
      if (!live) return;
      if (!r.ok) return setState({ kind: "error", message: r.error });
      const cards = await Promise.all(r.cards.map(async (c) => ({ ...c, qr: c.qrUrl ? await QRCode.toDataURL(c.qrUrl, { margin: 1, width: 300 }) : null })));
      if (live) setState({ kind: "ready", data: { eventName: r.eventName, joinUrl: r.joinUrl, cards } });
    })().catch(() => live && setState({ kind: "error", message: copy.officials.errors.failed }));
    return () => {
      live = false;
    };
  }, [eventId, seatId]);

  if (state.kind === "loading") return <p role="status" className="panel font-semibold">{T.printPreparing}</p>;
  if (state.kind === "error")
    return (
      <p role="alert" className="panel field-error">
        {copy.common.problem(state.message)}
      </p>
    );
  const { eventName, joinUrl, cards } = state.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <PrintButton label={T.printButton} />
          <a href={`/org/events/${eventId}/officials`} className="btn">
            {T.printBack}
          </a>
        </div>
        <p className="font-semibold">{T.printNote}</p>
      </div>
      {cards.length === 0 ? <p className="panel font-semibold">{T.printNone}</p> : null}
      <div className="grid gap-4 print:grid-cols-2 md:grid-cols-2" data-testid="cards">
        {cards.map((c) => (
          <article key={c.seatId} className="print-card flex flex-col gap-3 rounded-lg border border-beach-line bg-beach-bg p-5" data-testid="card">
            <p className="text-xl font-semibold">{T.printCardEvent(eventName)}</p>
            <p className="text-3xl font-semibold">{c.seatName}</p>
            <p className="text-xl font-semibold">{T.printCardRole(T.roles[c.role] ?? c.role)}</p>
            <p className="text-sm font-semibold uppercase tracking-wide">{T.printCardPin}</p>
            {c.pin ? (
              <p className="font-mono text-6xl font-semibold tracking-[0.25em]" data-testid="card-pin">
                {c.pin}
              </p>
            ) : (
              <p className="font-semibold" data-testid="card-no-pin">
                {T.printNoPin}
              </p>
            )}
            {c.qr ? (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.qr} alt={T.qrCaption} width={150} height={150} data-testid="card-qr" />
                <p className="font-semibold">{T.printCardJoin(joinUrl)}</p>
              </div>
            ) : (
              <p className="font-semibold">{T.printCardJoin(joinUrl)}</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
