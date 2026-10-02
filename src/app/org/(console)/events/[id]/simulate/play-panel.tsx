"use client";

import { Pause, Play, Square } from "lucide-react";
import { Chip } from "@/components/live/chip";
import { Pill } from "@/components/live/pill";
import { SPEEDS, SPREADS, JUDGE_MODES } from "@/lib/simulator/config";
import type { SeatView, SimStatus } from "@/lib/simulator/types";
import { copy } from "@/lib/ui-copy";
import { saveSettings, setPlayState, setSeatMode, setSpeed } from "./actions";
import { Card, Field } from "./parts";
import type { useSim } from "./use-sim";

const T = copy.simulator;
type Sim = ReturnType<typeof useSim>;

const ATTEMPTS = [3, 4, 5, 6, 7, 8];
const CRASH = [0, 0.1, 0.2, 0.3, 0.5];
const REPEAT = [0, 0.1, 0.2, 0.3];

/** Speed ×1 / ×5 / ×10 / ×20, and Start / Pause / Stop of the auto-play, with the sentence that says what it is doing. */
export function SpeedAndPlay({ eventId, sim }: { eventId: string; sim: Sim }) {
  const { status, line, act, pending } = sim;
  const state = status.control.state;
  const stateWord = state === "playing" ? T.play.statePlaying : state === "paused" ? T.play.statePaused : T.play.stateStopped;
  return (
    <>
      <Card title={T.speed.heading} help={T.speed.help} testId="sim-speed">
        <div className="flex flex-wrap gap-1.5">
          {SPEEDS.map((n) => (
            <Chip key={n} data-testid={`sim-speed-${n}`} pressed={status.control.speed === n} disabled={pending} onClick={() => void act(() => setSpeed(eventId, n))}>
              {T.speed.option(n)}
            </Chip>
          ))}
        </div>
        <p className="text-small font-medium text-beach-muted">{T.speed.note}</p>
      </Card>

      <Card title={T.play.heading} help={T.play.help} testId="sim-play">
        <div className="flex flex-wrap items-center gap-1.5">
          {state !== "playing" ? (
            <Chip variant="accent" icon={Play} data-testid="sim-start" disabled={pending} onClick={() => void act(() => setPlayState(eventId, "playing"))}>
              {state === "paused" ? T.play.resume : T.play.start}
            </Chip>
          ) : (
            <Chip icon={Pause} data-testid="sim-pause" disabled={pending} onClick={() => void act(() => setPlayState(eventId, "paused"))}>
              {T.play.pause}
            </Chip>
          )}
          <Chip icon={Square} data-testid="sim-stop" disabled={pending || state === "stopped"} onClick={() => void act(() => setPlayState(eventId, "stopped"))}>
            {T.play.stop}
          </Chip>
          <Pill tone={state === "playing" ? "live" : state === "paused" ? "pending" : "missing"} icon={state === "playing" ? Play : state === "paused" ? Pause : Square}>
            <span data-testid="sim-state" data-state={state}>
              {stateWord}
            </span>
          </Pill>
        </div>
        <p data-testid="sim-line" role="status" className="text-name font-semibold">
          {line}
        </p>
        {status.control.blocker ? (
          <p data-testid="sim-blocker" role="alert" className="rounded-xl border border-beach-failed p-2 text-body font-semibold text-beach-failed">
            {T.play.lines.stoppedAtBlocker(status.control.blocker)}
          </p>
        ) : null}
        <p className="text-small font-medium text-beach-muted">{T.play.tabNote}</p>
      </Card>
    </>
  );
}

const heldPill = (s: SeatView) => {
  if (s.heldBy === "simulator") return <Pill tone="live">{T.roles.virtual}</Pill>;
  if (s.heldBy === "you") return <Pill tone="pending">{T.roles.you}</Pill>;
  if (s.heldBy === "phone") return <Pill tone="pending">{T.roles.person}</Pill>;
  return <Pill tone="missing" dashed>{T.roles.waiting}</Pill>;
};

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
            <h3 className="text-small font-semibold text-beach-muted">{g.title}</h3>
            {seats.length === 0 ? <p className="text-small font-medium">{g.role === "head" ? T.roles.noHeadSeat : g.role === "spotter" ? T.roles.noSpotterSeat : ""}</p> : null}
            {seats.map((s) => (
              <div key={s.id} data-testid={`role-${s.id}`} data-mode={s.mode} className="flex min-h-row flex-wrap items-center justify-between gap-1.5 rounded-xl border border-beach-line bg-beach-bg px-2 py-1">
                <span className="text-name font-semibold">{s.name}</span>
                <span className="flex items-center gap-1.5">
                  {heldPill(s)}
                  <Chip data-testid={`role-${s.id}-virtual`} pressed={s.mode === "virtual"} disabled={pending} onClick={() => void act(() => setSeatMode(eventId, s.id, "virtual"))}>
                    {T.roles.virtual}
                  </Chip>
                  <Chip data-testid={`role-${s.id}-real`} pressed={s.mode === "real"} disabled={pending} onClick={() => void act(() => setSeatMode(eventId, s.id, "real"))}>
                    {T.roles.real}
                  </Chip>
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
  const save = (patch: Parameters<typeof saveSettings>[1]) => void act(() => saveSettings(eventId, patch));
  return (
    <Card title={B.heading} testId="sim-behaviour">
      <Field label={B.attemptsPerRider} help={B.attemptsHelp}>
        {ATTEMPTS.map((n) => (
          <Chip key={n} data-testid={`attempts-${n}`} pressed={c.attemptsPerRider === n} disabled={pending} onClick={() => save({ attemptsPerRider: n })}>
            {n}
          </Chip>
        ))}
      </Field>
      <Field label={B.crashShare} help={B.crashHelp}>
        {CRASH.map((n) => (
          <Chip key={n} data-testid={`crash-${Math.round(n * 100)}`} pressed={Math.abs(c.crashShare - n) < 0.001} disabled={pending} onClick={() => save({ crashShare: n })}>
            {B.percent(Math.round(n * 100))}
          </Chip>
        ))}
      </Field>
      <Field label={B.repeatShare} help={B.repeatHelp}>
        {REPEAT.map((n) => (
          <Chip key={n} data-testid={`repeat-${Math.round(n * 100)}`} pressed={Math.abs(c.repeatShare - n) < 0.001} disabled={pending} onClick={() => save({ repeatShare: n })}>
            {B.percent(Math.round(n * 100))}
          </Chip>
        ))}
      </Field>
      <Field label={B.spread} help={B.spreadHelp}>
        {SPREADS.map((s) => (
          <Chip key={s} data-testid={`spread-${s}`} pressed={c.spread === s} disabled={pending} onClick={() => save({ spread: s })}>
            {B.spreads[s]}
          </Chip>
        ))}
      </Field>
      <Field label={B.judgeMode} help={B.judgeModeHelp}>
        {JUDGE_MODES.map((m) => (
          <Chip key={m} data-testid={`mode-${m}`} pressed={c.judgeMode === m} disabled={pending} onClick={() => save({ judgeMode: m })}>
            {B.modes[m]}
          </Chip>
        ))}
      </Field>
      {c.judgeMode !== "none" ? (
        <Field label={B.whichJudge}>
          {(judges.length ? judges.map((j, i) => j.seatNo ?? i + 1) : [1, 2, 3]).map((n) => (
            <Chip key={n} data-testid={`which-judge-${n}`} pressed={c.specialJudge === n} disabled={pending} onClick={() => save({ specialJudge: n })}>
              {B.judgeNo(n)}
            </Chip>
          ))}
        </Field>
      ) : null}
    </Card>
  );
}

export type { SimStatus };
