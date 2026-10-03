"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Binoculars, ExternalLink, Eye, EyeOff, ScanEye, Gavel, House, Megaphone, Monitor, Radio, ShieldCheck, Smartphone, Trophy, User, Network, type LucideIcon } from "lucide-react";
import { Button, disabledWhen } from "@/components/org/button";
import { Pill } from "@/components/live/pill";
import { seatGroups, viewHref, type SeatRole } from "@/lib/simulator/view-as";
import { copy } from "@/lib/ui-copy";
import { releaseSeat, seatJoinInfo, type SeatJoinInfo } from "./actions";
import { Card, LinkButton } from "./parts";
import type { useSim } from "./use-sim";

const T = copy.simulator.viewAs;
type Sim = ReturnType<typeof useSim>;

const ROLE_ICON: Record<SeatRole, LucideIcon> = { judge: Gavel, spotter: Binoculars, head: ShieldCheck, announcer: Megaphone };

/** The join address and a single-use QR code for one seat, for a phone or a second browser. The PIN stays hidden until "Show PIN" is tapped (a screen is often shared in the room). */
function PhoneBox({ info, onClose, onNewPin, pending }: { info: SeatJoinInfo; onClose: () => void; onNewPin: () => void; pending: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    if (info.qrUrl) QRCode.toDataURL(info.qrUrl, { margin: 1, width: 180 }).then((u) => live && setQr(u)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [info.qrUrl]);
  return (
    <div data-testid={`phone-box-${info.seatId}`} className="flex flex-col gap-2 rounded-[8px] border border-beach-line bg-beach-surface p-3">
      <p className="text-body font-semibold">{T.pinFor(info.name)}</p>
      {info.pin ? (
        <div className="flex flex-wrap items-center gap-3">
          {shown ? (
            <p data-testid="phone-pin" className="font-mono text-heading font-semibold tabular-nums tracking-[0.25em]">
              {info.pin}
            </p>
          ) : (
            <p className="font-mono text-heading font-semibold tracking-[0.25em] text-beach-muted" aria-label={T.pinHidden}>
              ••••••
            </p>
          )}
          <Button variant="secondary" icon={shown ? EyeOff : Eye} data-testid="phone-show-pin" aria-expanded={shown} onClick={() => setShown((v) => !v)}>
            {shown ? T.hidePin : T.showPin}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-medium">{T.pinUnknown}</span>
          <Button variant="secondary" data-testid="phone-new-pin" {...disabledWhen(pending && copy.simulator.busy)} onClick={onNewPin}>
            {T.newPin}
          </Button>
        </div>
      )}
      <p className="text-body font-medium">
        {T.joinAt} <span className="select-all break-all font-semibold">{info.joinUrl}</span>
      </p>
      {qr ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={T.qr} width={150} height={150} className="rounded-[8px] bg-white p-1" />
          <span className="text-small font-medium text-beach-muted">{T.qr}</span>
        </div>
      ) : null}
      <Button variant="quiet" className="w-fit" onClick={onClose}>
        {T.close}
      </Button>
    </div>
  );
}

/** Buttons that open each person's real screen in a new tab, as compact grids: the public pages as a visitor sees them, then one tile per official with a role icon. */
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
      <div className="flex flex-col gap-2">
        <h3 className="text-small font-semibold text-beach-muted">{T.spectator}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <LinkButton icon={House} testId="view-spectator" href={viewHref(eventId, { kind: "spectator" })}>
            {T.home}
          </LinkButton>
          <LinkButton icon={Radio} testId="view-live" href={viewHref(eventId, { kind: "live" })}>
            {T.live}
          </LinkButton>
          <LinkButton icon={Trophy} testId="view-results" href={viewHref(eventId, { kind: "results" })}>
            {T.results}
          </LinkButton>
          <LinkButton icon={Network} testId="view-ladder" href={viewHref(eventId, { kind: "ladder" })}>
            {T.ladder}
          </LinkButton>
          <LinkButton icon={Monitor} testId="view-screen" href={viewHref(eventId, { kind: "screen" })}>
            {T.screen}
          </LinkButton>
        </div>
        {status.riders.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-body font-semibold" htmlFor="view-rider-select">
              {T.pickRider}
            </label>
            <select id="view-rider-select" data-testid="view-rider-select" value={rider} onChange={(e) => setRider(e.target.value)} className="h-[var(--org-ctl)] max-w-full rounded-[8px] border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink">
              {status.riders.map((r) => (
                <option key={r.entryId} value={r.entryId}>
                  {r.name} · {r.divisionName}
                </option>
              ))}
            </select>
            {rider ? (
              <LinkButton icon={User} testId="view-rider" href={viewHref(eventId, { kind: "rider", entryId: rider })}>
                {T.riderPage}
              </LinkButton>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-small font-semibold text-beach-muted">{T.officials}</h3>
        <div className="grid grid-cols-1 gap-2">
          <LinkButton icon={ShieldCheck} testId="view-head-laptop" href={viewHref(eventId, { kind: "head-organiser" })}>
            {T.headLaptop}
          </LinkButton>
          {groups.flatMap((g) =>
            g.seats.map((s) => {
              const Icon = ROLE_ICON[g.role];
              return (
                <div key={s.id} className="flex min-h-[var(--org-row)] items-center justify-between gap-2 rounded-[8px] border border-beach-line px-3 py-1">
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-body font-semibold">
                    <Icon aria-hidden className="size-4 shrink-0 text-beach-muted" />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button variant="secondary" icon={ExternalLink} aria-label={`${T.open} ${s.name}`} data-testid={`view-seat-${s.id}`} href={viewHref(eventId, { kind: "seat", seatId: s.id })} target="_blank">
                      {T.open}
                    </Button>
                    <Button variant="secondary" icon={Smartphone} aria-label={`${T.phone}: ${s.name}`} data-testid={`view-phone-${s.id}`} onClick={() => void showPhone(s.id)}>
                      {T.phone}
                    </Button>
                  </span>
                </div>
              );
            }),
          )}
        </div>
        <h3 className="pt-1 text-small font-semibold text-beach-muted">{copy.observer.viewAsGroup}</h3>
        {status.observers.length ? (
          status.observers.map((o) => (
            <div key={o.id} className="flex min-h-[var(--org-row)] items-center justify-between gap-2 rounded-[8px] border border-beach-line px-3 py-1">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-body font-semibold">
                <ScanEye aria-hidden className="size-4 shrink-0 text-beach-muted" />
                <span className="truncate">{o.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button variant="secondary" icon={ExternalLink} aria-label={`${T.open} ${o.name}`} data-testid={`view-observer-${o.id}`} href={viewHref(eventId, { kind: "seat", seatId: o.id })} target="_blank">
                  {T.open}
                </Button>
                <Button variant="secondary" icon={Smartphone} aria-label={`${T.phone}: ${o.name}`} data-testid={`view-phone-${o.id}`} onClick={() => void showPhone(o.id)}>
                  {T.phone}
                </Button>
              </span>
            </div>
          ))
        ) : (
          <p className="text-small font-medium text-beach-muted" data-testid="view-observer-none">{copy.observer.viewAsNone}</p>
        )}
        {phone ? <PhoneBox info={phone} pending={pending} onClose={() => setPhone(null)} onNewPin={() => void showPhone(phone.seatId, true)} /> : null}
      </div>

      {holding ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-beach-line bg-beach-surface p-3" data-testid="holding">
          <Pill tone="pending">{T.holding(holding.name)}</Pill>
          <Button variant="secondary" data-testid="release-seat" {...disabledWhen(pending && copy.simulator.busy)} onClick={() => void act(() => releaseSeat(eventId))}>
            {T.letGo}
          </Button>
        </div>
      ) : null}
      <p className="text-small font-medium text-beach-muted">{T.oneSeat}</p>
    </Card>
  );
}
