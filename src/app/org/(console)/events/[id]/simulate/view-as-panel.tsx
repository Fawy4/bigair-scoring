"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Chip } from "@/components/live/chip";
import { Pill } from "@/components/live/pill";
import { seatGroups, viewHref } from "@/lib/simulator/view-as";
import { copy } from "@/lib/ui-copy";
import { releaseSeat, seatJoinInfo, type SeatJoinInfo } from "./actions";
import { Card, LinkChip } from "./parts";
import type { useSim } from "./use-sim";

const T = copy.simulator.viewAs;
type Sim = ReturnType<typeof useSim>;

/** The PIN, the join address and a single-use QR code for one seat: for a phone, or a second browser. */
function PhoneBox({ info, onClose, onNewPin, pending }: { info: SeatJoinInfo; onClose: () => void; onNewPin: () => void; pending: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (info.qrUrl) QRCode.toDataURL(info.qrUrl, { margin: 1, width: 180 }).then((u) => live && setQr(u)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [info.qrUrl]);
  return (
    <div data-testid={`phone-box-${info.seatId}`} className="flex flex-col gap-1.5 rounded-xl border border-beach-border bg-beach-bg p-2">
      <p className="text-name font-semibold">{T.pinFor(info.name)}</p>
      {info.pin ? (
        <p data-testid="phone-pin" className="font-mono text-readout font-semibold tracking-[0.25em]">
          {info.pin}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-body font-medium">{T.pinUnknown}</span>
          <Chip data-testid="phone-new-pin" disabled={pending} onClick={onNewPin}>
            {T.newPin}
          </Chip>
        </div>
      )}
      <p className="text-body font-medium">
        {T.joinAt} <span className="select-all break-all font-semibold">{info.joinUrl}</span>
      </p>
      {qr ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={T.qr} width={150} height={150} />
          <span className="text-small font-medium text-beach-muted">{T.qr}</span>
        </div>
      ) : null}
      <Chip onClick={onClose}>{T.close}</Chip>
    </div>
  );
}

/** Buttons that open each person's real screen in a new tab: the public pages as a visitor sees them, and each official's own screen. */
export function ViewAs({ eventId, sim }: { eventId: string; sim: Sim }) {
  const { status, act, pending } = sim;
  const [rider, setRider] = useState(status.riders[0]?.entryId ?? "");
  const [phone, setPhone] = useState<SeatJoinInfo | null>(null);
  const holding = status.seats.find((s) => s.heldBy === "you");
  const groups = seatGroups(status.seats.map((s) => ({ id: s.id, name: s.name, role: s.role, seatNo: s.seatNo })));

  async function showPhone(seatId: string, makePin = false) {
    const r = await act(() => seatJoinInfo(eventId, seatId, makePin));
    if (r.ok) setPhone(r.info);
  }

  return (
    <Card title={T.heading} help={T.help} testId="sim-viewas">
      <div className="flex flex-col gap-1">
        <h3 className="text-small font-semibold text-beach-muted">{T.spectator}</h3>
        <div className="flex flex-wrap gap-1.5">
          <LinkChip testId="view-spectator" href={viewHref(eventId, { kind: "spectator" })}>
            {T.home}
          </LinkChip>
          <LinkChip testId="view-live" href={viewHref(eventId, { kind: "live" })}>
            {T.live}
          </LinkChip>
          <LinkChip testId="view-results" href={viewHref(eventId, { kind: "results" })}>
            {T.results}
          </LinkChip>
          <LinkChip testId="view-ladder" href={viewHref(eventId, { kind: "ladder" })}>
            {T.ladder}
          </LinkChip>
          <LinkChip testId="view-screen" href={viewHref(eventId, { kind: "screen" })}>
            {T.screen}
          </LinkChip>
        </div>
        {status.riders.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="text-body font-semibold" htmlFor="view-rider-select">
              {T.pickRider}
            </label>
            <select id="view-rider-select" data-testid="view-rider-select" value={rider} onChange={(e) => setRider(e.target.value)} className="min-h-tap rounded-lg border border-beach-border bg-beach-bg px-1.5 text-body font-semibold text-beach-ink">
              {status.riders.map((r) => (
                <option key={r.entryId} value={r.entryId}>
                  {r.name} · {r.divisionName}
                </option>
              ))}
            </select>
            {rider ? (
              <LinkChip testId="view-rider" href={viewHref(eventId, { kind: "rider", entryId: rider })}>
                {T.riderPage}
              </LinkChip>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-small font-semibold text-beach-muted">{T.officials}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <LinkChip testId="view-head-laptop" href={viewHref(eventId, { kind: "head-organiser" })}>
            {T.headLaptop}
          </LinkChip>
        </div>
        {groups.map((g) => (
          <div key={g.role} className="flex flex-col gap-1">
            {g.seats.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-24 text-name font-semibold">{s.name}</span>
                <LinkChip testId={`view-seat-${s.id}`} href={viewHref(eventId, { kind: "seat", seatId: s.id })}>
                  {T.open}
                </LinkChip>
                <Chip data-testid={`view-phone-${s.id}`} disabled={pending} onClick={() => void showPhone(s.id)}>
                  {T.phone}
                </Chip>
              </div>
            ))}
          </div>
        ))}
        {phone ? <PhoneBox info={phone} pending={pending} onClose={() => setPhone(null)} onNewPin={() => void showPhone(phone.seatId, true)} /> : null}
      </div>

      {holding ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-beach-border bg-beach-bg p-2" data-testid="holding">
          <Pill tone="pending">{T.holding(holding.name)}</Pill>
          <Chip data-testid="release-seat" disabled={pending} onClick={() => void act(() => releaseSeat(eventId))}>
            {T.letGo}
          </Chip>
        </div>
      ) : null}
      <p className="text-small font-medium text-beach-muted">{T.oneSeat}</p>
    </Card>
  );
}
