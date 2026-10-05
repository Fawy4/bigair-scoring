"use client";

import React from "react";
import { Binoculars, FastForward, Flag, Gavel, Pause, Play, ShieldCheck, SkipForward, Square } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { Pill } from "@/components/live/pill";
import { SPEEDS, SPREADS, JUDGE_MODES } from "@/lib/simulator/config";
import type { SeatView, SimStatus } from "@/lib/simulator/types";
import { heldWords } from "@/lib/simulator/view-hold";
import { copy } from "@/lib/ui-copy";
import { endHeatAndPublish, runWholeEvent, saveSettings, setPlayState, setSeatMode, setSpeed, skipToEndOfHeat } from "./actions";
import { Card, Choice, Field } from "./parts";
import type { useSim } from "./use-sim";

const T = copy.simulator;
type Sim = ReturnType<typeof useSim>;

const ROLE_ICON = { judge: Gavel, spotter: Binoculars, head: ShieldCheck } as const;
const ATTEMPTS = [3, 4, 5, 6, 7, 8];
const CRASH = [0, 0.1, 0.2, 0.3, 0.5];
const REPEAT = [0, 0.1, 0.2, 0.3];

/**
 * The controls as one quiet toolbar: speed ×1 / ×5 / ×10 / ×20, Start / Pause / Stop of the auto-play and the state, with the sentence that says what it is doing
 * under it. A thin frame, no card: the cards below hold the settings.
 */
export function Toolbar({ eventId, sim }: { eventId: string; sim: Sim }) {
  const { status, line, act, pending } = sim;
  const state = status.control.state;
  const stateWord = state === "playing" ? T.play.statePlaying : state === "paused" ? T.play.statePaused : T.play.stateStopped;
  const now = status.now.status;
  const canSkip = now === "running";
  const canEnd = now === "running" || now === "paused" || now === "ended" || now === "under_review";
  const whole = status.control.config.wholeEvent;
  const [skipping, setSkipping] = React.useState(false);
  const [askEnd, setAskEnd] = React.useState(false); // End heat and publish asks once
  return (
    <section role="toolbar" aria-label={T.toolbarLabel} data-testid="sim-toolbar" className="flex flex-col gap-3 rounded-card border border-beach-line bg-beach-bg p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div data-testid="sim-speed">
          <Field label={T.speed.heading} help={T.speed.help}>
            {SPEEDS.map((n) => (
              <Choice key={n} data-testid={`sim-speed-${n}`} pressed={status.control.speed === n} disabled={pending} onClick={() => void act(() => setSpeed(eventId, n), undefined, (s) => ({ ...s, control: { ...s.control, speed: n } }))}>
                {T.speed.option(n)}
              </Choice>
            ))}
          </Field>
        </div>
        <div data-testid="sim-play">
          <Field label={T.play.heading} help={T.play.help}>
            {state !== "playing" ? (
              <Choice primary icon={Play} data-testid="sim-start" disabled={pending} onClick={() => void (state === "paused" ? sim.playDirect("playing") : act(() => setPlayState(eventId, "playing"), undefined, (s) => ({ ...s, control: { ...s.control, state: "playing" } })))}>
                {state === "paused" ? T.play.resume : T.play.start}
              </Choice>
            ) : (
              <Choice icon={Pause} data-testid="sim-pause" disabled={pending} onClick={() => void sim.playDirect("paused")}>
                {T.play.pause}
              </Choice>
            )}
            <Choice icon={Square} data-testid="sim-stop" disabled={pending || state === "stopped"} onClick={() => void act(() => setPlayState(eventId, "stopped"), undefined, (s) => ({ ...s, control: { ...s.control, state: "stopped" } }))}>
              {T.play.stop}
            </Choice>
            <Choice icon={SkipForward} data-testid="sim-skip-end" title={canSkip ? T.skip.help.text : T.skip.why} disabled={pending || skipping || !canSkip} onClick={() => { setSkipping(true); void act(() => skipToEndOfHeat(eventId), (r) => r.text).finally(() => setSkipping(false)); }}>
              {skipping ? T.skip.working : T.skip.button}
            </Choice>
            {askEnd && canEnd ? (
              <span data-testid="sim-end-panel" role="group" aria-label={T.endPublish.question} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-beach-border bg-beach-surface p-2">
                <span className="text-body font-semibold">{T.endPublish.question}</span>
                <Choice icon={Flag} data-testid="sim-end-confirm" disabled={pending} onClick={() => { setAskEnd(false); void act(() => endHeatAndPublish(eventId), (r) => r.text); }}>
                  {T.endPublish.confirm}
                </Choice>
                <Choice data-testid="sim-end-cancel" onClick={() => setAskEnd(false)}>
                  {T.endPublish.cancel}
                </Choice>
              </span>
            ) : (
              <Choice icon={Flag} data-testid="sim-end-publish" title={canEnd ? T.endPublish.help.text : T.endPublish.why} disabled={pending || !canEnd} onClick={() => setAskEnd(true)}>
                {T.endPublish.button}
              </Choice>
            )}
            <Choice icon={FastForward} data-testid="sim-whole-event" pressed={whole} title={T.whole.help.text} disabled={pending || (whole && state === "playing")} onClick={() => void act(() => runWholeEvent(eventId))}>
              {T.whole.button}
            </Choice>
            <Pill tone={state === "playing" ? "live" : state === "paused" ? "pending" : "missing"} icon={state === "playing" ? Play : state === "paused" ? Pause : Square}>
              <span data-testid="sim-state" data-state={state}>
                {stateWord}
              </span>
            </Pill>
            {pending ? (
              <span role="status" className="text-small font-medium text-beach-muted">
                {T.busy}
              </span>
            ) : null}
          </Field>
        </div>
      </div>
      <p data-testid="sim-line" role="status" className="text-name font-semibold">
        {line}
      </p>
      {whole && state !== "stopped" ? (
        <p data-testid="sim-whole-on" className="text-small font-medium text-beach-muted">
          {T.play.lines.whole}
        </p>
      ) : null}
      {!canSkip ? (
        <p data-testid="sim-skip-why" className="text-small font-medium text-beach-muted">
          {T.skip.why}
        </p>
      ) : null}
      {!canEnd ? (
        <p data-testid="sim-end-why" className="text-small font-medium text-beach-muted">
          {T.endPublish.why}
        </p>
      ) : null}
      {status.control.blocker ? (
        <Banner tone="danger" data-testid="sim-blocker">
          {T.play.lines.stoppedAtBlocker(status.control.blocker)}
        </Banner>
      ) : null}
      <p className="text-small font-medium text-beach-muted">
        {T.speed.note} {T.play.tabNote}
      </p>
    </section>
  );
}

const heldPill = (s: SeatView) => (
  <span data-testid={`held-${s.id}`} data-held={s.heldBy}>
    <Pill tone={s.heldBy === "simulator" ? "live" : s.heldBy === "nobody" ? "missing" : "pending"} dashed={s.heldBy === "nobody"}>
      {heldWords(s)}
    </Pill>
  </span>
);

/** Each judge seat, each spotter seat and the head judge: played by the simulator (virtual) or left to a phone (real). */
export function Roles({ eventId, sim }: { eventId: string; sim: Sim }) {
  const { status, act, pending } = sim;
  const groups: Array<{ role: "judge" | "spotter" | "head"; title: string }> = [
    { role: "judge", title: T.roles.judge },
    { role: "spotter", title: T.roles.spotter },
    { role: "head", title: T.roles.head },
  ];
  return (
    <Card title={T.roles.heading} help={T.roles.help} testId="sim-roles">
      {groups.map((g) => {
        const seats = status.seats.filter((s) => s.role === g.role).sort((a, b) => (a.seatNo ?? 99) - (b.seatNo ?? 99) || a.name.localeCompare(b.name));
        return (
          <div key={g.role} className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-small font-semibold text-beach-muted">
              {React.createElement(ROLE_ICON[g.role], { "aria-hidden": true, className: "size-4" })}
              {g.title}
            </h3>
            {seats.length === 0 ? <p className="text-small font-medium">{g.role === "head" ? T.roles.noHeadSeat : g.role === "spotter" ? T.roles.noSpotterSeat : ""}</p> : null}
            {seats.map((s) => (
              <div key={s.id} data-testid={`role-${s.id}`} data-mode={s.mode} className="flex min-h-[var(--org-row)] flex-wrap items-center justify-between gap-2 rounded-[8px] border border-beach-line px-3 py-1">
                <span className="text-name font-semibold">{s.name}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="sr-only">{T.roles.heldBy}</span>
                  {heldPill(s)}
                  {s.mode === "virtual" && (s.heldBy === "you" || s.heldBy === "phone") ? (
                    <Choice data-testid={`role-${s.id}-release`} title={T.roles.giveBackHint} disabled={pending} onClick={() => void act(() => setSeatMode(eventId, s.id, "virtual"))}>
                      {T.roles.giveBack}
                    </Choice>
                  ) : null}
                  <Choice data-testid={`role-${s.id}-virtual`} pressed={s.mode === "virtual"} disabled={pending} onClick={() => void act(() => setSeatMode(eventId, s.id, "virtual"))}>
                    {T.roles.virtual}
                  </Choice>
                  <Choice data-testid={`role-${s.id}-real`} pressed={s.mode === "real"} disabled={pending} onClick={() => void act(() => setSeatMode(eventId, s.id, "real"))}>
                    {T.roles.real}
                  </Choice>
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </Card>
  );
}

/** How the virtual spotters and judges behave: attempts per rider, crashes, repeats, how far judges stray, and one judge behaving badly. */
export function Behaviour({ eventId, sim }: { eventId: string; sim: Sim }) {
  const { status, act, pending } = sim;
  const c = status.control.config;
  const B = T.behaviour;
  const judges = status.seats.filter((s) => s.role === "judge").sort((a, b) => (a.seatNo ?? 99) - (b.seatNo ?? 99));
  const save = (patch: Parameters<typeof saveSettings>[1]) => void act(() => saveSettings(eventId, patch), undefined, (s) => ({ ...s, control: { ...s.control, config: { ...s.control.config, ...patch } } }));
  return (
    <Card title={B.heading} testId="sim-behaviour">
      <Field label={B.attemptsPerRider} help={B.attemptsHelp}>
        {ATTEMPTS.map((n) => (
          <Choice key={n} data-testid={`attempts-${n}`} pressed={c.attemptsPerRider === n} disabled={pending} onClick={() => save({ attemptsPerRider: n })}>
            {n}
          </Choice>
        ))}
      </Field>
      <Field label={B.crashShare} help={B.crashHelp}>
        {CRASH.map((n) => (
          <Choice key={n} data-testid={`crash-${Math.round(n * 100)}`} pressed={Math.abs(c.crashShare - n) < 0.001} disabled={pending} onClick={() => save({ crashShare: n })}>
            {B.percent(Math.round(n * 100))}
          </Choice>
        ))}
      </Field>
      <Field label={B.repeatShare} help={B.repeatHelp}>
        {REPEAT.map((n) => (
          <Choice key={n} data-testid={`repeat-${Math.round(n * 100)}`} pressed={Math.abs(c.repeatShare - n) < 0.001} disabled={pending} onClick={() => save({ repeatShare: n })}>
            {B.percent(Math.round(n * 100))}
          </Choice>
        ))}
      </Field>
      <Field label={B.spread} help={B.spreadHelp}>
        {SPREADS.map((s) => (
          <Choice key={s} data-testid={`spread-${s}`} pressed={c.spread === s} disabled={pending} onClick={() => save({ spread: s })}>
            {B.spreads[s]}
          </Choice>
        ))}
      </Field>
      <Field label={B.judgeMode} help={B.judgeModeHelp}>
        {JUDGE_MODES.map((m) => (
          <Choice key={m} data-testid={`mode-${m}`} pressed={c.judgeMode === m} disabled={pending} onClick={() => save({ judgeMode: m })}>
            {B.modes[m]}
          </Choice>
        ))}
      </Field>
      {c.judgeMode !== "none" ? (
        <Field label={B.whichJudge}>
          {(judges.length ? judges.map((j, i) => j.seatNo ?? i + 1) : [1, 2, 3]).map((n) => (
            <Choice key={n} data-testid={`which-judge-${n}`} pressed={c.specialJudge === n} disabled={pending} onClick={() => save({ specialJudge: n })}>
              {B.judgeNo(n)}
            </Choice>
          ))}
        </Field>
      ) : null}
    </Card>
  );
}

export type { SimStatus };
