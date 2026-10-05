"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { pickCurrentHeat, type HeatPhase } from "@/lib/live/current-heat";
import { overlayHeats } from "./use-flag";
import { maskFor } from "@/lib/live/observer";
import type { ActivePlan } from "@/lib/live/run-order";
import { rowToPlan, type PlanRow } from "@/lib/schedule/plans";
import type { Json } from "@/lib/supabase/database.types";
import {
  ATTEMPT_COLUMNS,
  DECISION_COLUMNS,
  FLAG_COLUMNS,
  HEAT_COLUMNS,
  IMPRESSION_COLUMNS,
  PENALTY_COLUMNS,
  PENDING_COLUMNS,
  SCORE_COLUMNS,
  SHEET_COLUMNS,
  SLOT_COLUMNS,
  type AttemptRow,
  type DecisionRow,
  type FlagRow,
  type HeatRow,
  type ImpressionRow,
  type LiveContext,
  type PenaltyRowLive,
  type PendingRow,
  type ScoreRow,
  type SheetRow,
  type SlotRow,
} from "@/lib/live/types";

type Row = { id: string; updated_at?: string };

/** A newer copy of a row replaces an older one; an older copy never replaces a newer one. */
export function upsertRow<T extends Row>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i < 0) return [...list, row];
  if (list[i].updated_at && row.updated_at && list[i].updated_at! > row.updated_at) return list;
  const next = [...list];
  next[i] = row;
  return next;
}

interface Snapshot {
  slots: SlotRow[];
  attempts: AttemptRow[];
  scores: ScoreRow[];
  impressions: ImpressionRow[];
  flags: FlagRow[];
  sheets: SheetRow[];
  /** Interference penalties of the heat (every seat of the event can read them). */
  penalties: PenaltyRowLive[];
  /** The head judge's tie orders and publish overrides; judges get none (row security). */
  decisions: DecisionRow[];
  /** Scores typed on a Rider sheet line before the attempt was logged: a judge reads only their own, the head judge and an observer all. Never counted. */
  pending: PendingRow[];
}
const EMPTY: Snapshot = { slots: [], attempts: [], scores: [], impressions: [], flags: [], sheets: [], penalties: [], decisions: [], pending: [] };

export interface LiveHeatState extends Snapshot {
  heats: HeatRow[];
  heat: HeatRow | null;
  phase: HeatPhase;
  /** The realtime channels are up. */
  connected: boolean;
  /** Heats whose sheet this seat has submitted (it only knows its own sheets). */
  submittedHeatIds: Set<string>;
  refresh: () => Promise<void>;
  /** The active run orders, kept current (a hold or a shift made on another device arrives here). */
  plans: ActivePlan[];
  /** Puts a change of one heat on the screen at once: a guess before the server answers, then the row the server answered with. The stream confirms it. A row older than the one held is ignored. */
  patchHeat: (heatId: string, patch: Partial<HeatRow>) => void;
  /** Shows a hold or pins the server has just answered with, before the stream delivers them. */
  applyPlan: (planId: string, hold: Json | null, anchors: Json, items?: Json) => void;
  /** Puts a row the server has just returned (our own attempt, score, impression, flag or sheet) into the list at once, without waiting for the stream. */
  apply: (key: "attempts" | "scores" | "impressions" | "flags" | "sheets" | "penalties" | "decisions" | "pending", row: { id: string; heat_id?: string; updated_at?: string }) => void;
  /** Takes a row out at once (a pending note the judge has just cleared); the stream's delete confirms it. */
  drop: (key: "pending", id: string) => void;
}

/**
 * The live heat for an official's phone (docs/PLAN-phase-5 steps 2 and 7). It follows the running heat by itself (or the pinned one), subscribes to the
 * event's heats and to the chosen heat's attempts, scores, impressions, seats, flags and sheets, and on every (re)connection refetches the snapshot first
 * and then applies the stream, so nothing is lost across a dropped connection. `nowServer` is the server-clock "now" for the screen's timer.
 */
export function useLiveHeat(supabase: SupabaseClient, ctx: LiveContext, nowServer: number, pinnedHeatId?: string | null): LiveHeatState {
  // The browser client is one object for the whole page and `channel(name)` hands back the channel that already has that name, so a second screen asking for the same
  // heat (the head judge's Score tab sits inside the page that already follows the heat) would add listeners to a channel that has been subscribed ("cannot add
  // postgres_changes callbacks after subscribe"). Each use gets its own channel name; every listener is attached before its own subscribe.
  const instance = useRef<string>("");
  if (!instance.current) instance.current = Math.random().toString(36).slice(2, 8);
  const [rawHeats, setHeats] = useState<HeatRow[]>(ctx.heats);
  // a heat whose pre-start is over is running from the armed moment (the database says the same), whoever has written that down yet
  const heats = useMemo(() => overlayHeats(rawHeats, nowServer), [rawHeats, nowServer]);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [plans, setPlans] = useState<ActivePlan[]>(() => ctx.plans.map((p) => ({ id: p.id, day: p.day, plan: p.plan, defaults: p.defaults, updatedAt: p.updatedAt })));
  const [heatsUp, setHeatsUp] = useState(false);
  const [heatUp, setHeatUp] = useState(false);
  const viewer = ctx.viewer;
  const role = viewer.kind === "seat" ? viewer.role : "organiser";
  const seatId = viewer.kind === "seat" ? viewer.seatId : undefined;
  // an observer reads every row; an observed screen shows only the rows that official's own phone gets
  const observed = viewer.kind === "seat" && viewer.observer ? { role: viewer.role, seatId: viewer.seatId } : null;
  const shownSnap = useMemo(() => (observed ? maskFor(snap, observed.role, observed.seatId) : snap), [snap, observed?.role, observed?.seatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const panels = useMemo(() => ctx.divisions.map((d) => ({ divisionId: d.id, seatIds: d.panelSeatIds })), [ctx.divisions]);
  const submittedHeatIds = useMemo(() => new Set(snap.sheets.filter((s) => s.judge_seat_id === seatId && s.submitted_at && (!s.reopened_at || s.submitted_at > s.reopened_at)).map((s) => s.heat_id)), [snap.sheets, seatId]);
  // the heats whose sheets we know about are only the current one's; remember submitted heats across heats
  const submittedMemory = useRef(new Set<string>());
  for (const id of submittedHeatIds) submittedMemory.current.add(id);

  const { heat, phase } = useMemo(
    () => pickCurrentHeat({ heats, panels, viewer: { role: role as "judge" | "head" | "spotter" | "announcer" | "organiser", seatId }, nowServer, pinnedId: pinnedHeatId, submittedHeatIds: submittedMemory.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heats, panels, role, seatId, nowServer, pinnedHeatId, submittedHeatIds],
  );
  const heatId = heat?.id ?? null;

  // When a pre-start ends every official phone asks the database to write the start down (`start_armed_if_due`: the start time is the armed moment, whoever asks, and a
  // second call changes nothing), so nothing depends on one phone staying awake. An observer only watches.
  const dueId = rawHeats.find((h) => h.status === "scheduled" && h.armed_at && !h.armed_paused_at && nowServer >= Date.parse(h.armed_at) + (h.prestart_sec ?? 0) * 1000)?.id ?? null;
  const mayWrite = !observed && !(viewer.kind === "seat" && viewer.role === "observer");
  useEffect(() => {
    if (!dueId || !mayWrite) return;
    const call = () => void Promise.resolve(supabase.rpc("start_armed_if_due", { p_heat: dueId })).catch(() => {});
    call();
    const t = setInterval(call, 3000);
    return () => clearInterval(t);
  }, [supabase, dueId, mayWrite]);

  // ---- the event's heats
  const refreshHeats = useCallback(async () => {
    const { data } = await supabase.from("heats").select(HEAT_COLUMNS).eq("event_id", ctx.event.id);
    if (data) setHeats(data as unknown as HeatRow[]);
  }, [supabase, ctx.event.id]);
  const refreshPlans = useCallback(async () => {
    const { data } = await supabase.from("schedule_plans").select("id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active, updated_at").eq("event_id", ctx.event.id).eq("active", true);
    if (!data) return;
    const next: ActivePlan[] = [];
    for (const r of data) {
      try {
        const dp = rowToPlan(r as unknown as PlanRow, ctx.event.readyCallMin);
        next.push({ id: r.id, day: r.day, plan: dp.plan, defaults: dp.defaults, updatedAt: r.updated_at });
      } catch {
        /* a damaged plan is shown by the organiser's own screen, not here */
      }
    }
    setPlans(next);
  }, [supabase, ctx.event.id, ctx.event.readyCallMin]);
  const applyPlan = useCallback<LiveHeatState["applyPlan"]>((planId, hold, anchors, items) => {
    setPlans((l) =>
      l.map((p) => {
        if (p.id !== planId) return p;
        const { hold: _old, ...rest } = p.plan;
        void _old;
        return { ...p, plan: { ...rest, ...(items ? { items: items as unknown as typeof p.plan.items } : {}), anchors: anchors as Record<string, string>, ...(hold ? { hold: hold as unknown as NonNullable<typeof p.plan.hold> } : {}) } };
      }),
    );
  }, []);
  const patchHeat = useCallback<LiveHeatState["patchHeat"]>((id, patch) => {
    setHeats((l) => l.map((h) => (h.id !== id || (patch.updated_at && h.updated_at && h.updated_at > patch.updated_at) ? h : { ...h, ...patch })));
  }, []);
  useEffect(() => {
    const ch = supabase
      .channel(`heats-${ctx.event.id}-${instance.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_plans", filter: `event_id=eq.${ctx.event.id}` }, () => void refreshPlans())
      .on("postgres_changes", { event: "*", schema: "public", table: "heats", filter: `event_id=eq.${ctx.event.id}` }, (p) => {
        if (p.eventType === "DELETE") setHeats((l) => l.filter((h) => h.id !== (p.old as Row).id));
        else setHeats((l) => upsertRow(l, p.new as unknown as HeatRow));
      })
      .subscribe((status) => {
        setHeatsUp(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          void refreshHeats();
          void refreshPlans();
        }
      });
    return () => void supabase.removeChannel(ch);
  }, [supabase, ctx.event.id, refreshHeats, refreshPlans]);

  // ---- the chosen heat
  const fetchSnapshot = useCallback(
    async (id: string) => {
      const q = (table: string, cols: string) => supabase.from(table).select(cols).eq("heat_id", id);
      const [slots, attempts, scores, impressions, flags, sheets, penalties, decisions, pending] = await Promise.all([
        q("heat_slots", SLOT_COLUMNS),
        q("trick_attempts", ATTEMPT_COLUMNS),
        q("trick_scores", SCORE_COLUMNS),
        q("impression_scores", IMPRESSION_COLUMNS),
        q("attempt_flags", FLAG_COLUMNS),
        q("judge_sheets", SHEET_COLUMNS),
        q("penalties", PENALTY_COLUMNS),
        q("heat_decisions", DECISION_COLUMNS),
        q("pending_scores", PENDING_COLUMNS),
      ]);
      setSnap({
        slots: (slots.data ?? []) as unknown as SlotRow[],
        attempts: (attempts.data ?? []) as unknown as AttemptRow[],
        scores: (scores.data ?? []) as unknown as ScoreRow[],
        impressions: (impressions.data ?? []) as unknown as ImpressionRow[],
        flags: (flags.data ?? []) as unknown as FlagRow[],
        sheets: (sheets.data ?? []) as unknown as SheetRow[],
        penalties: (penalties.data ?? []) as unknown as PenaltyRowLive[],
        decisions: (decisions.data ?? []) as unknown as DecisionRow[],
        pending: (pending.data ?? []) as unknown as PendingRow[],
      });
    },
    [supabase],
  );
  const refresh = useCallback(async () => {
    // asked for at the same time: three rounds one after another made every "refresh after a change" wait for all of them
    await Promise.all([refreshHeats(), refreshPlans(), heatId ? fetchSnapshot(heatId) : Promise.resolve()]);
  }, [refreshHeats, refreshPlans, fetchSnapshot, heatId]);

  useEffect(() => {
    if (!heatId) {
      setSnap(EMPTY);
      setHeatUp(true);
      return;
    }
    setSnap(EMPTY);
    setHeatUp(false);
    let live = true;
    const tables: Array<[string, keyof Snapshot]> = [
      ["heat_slots", "slots"],
      ["trick_attempts", "attempts"],
      ["trick_scores", "scores"],
      ["impression_scores", "impressions"],
      ["attempt_flags", "flags"],
      ["judge_sheets", "sheets"],
      ["penalties", "penalties"],
      ["heat_decisions", "decisions"],
      ["pending_scores", "pending"],
    ];
    let ch: RealtimeChannel = supabase.channel(`heat-${heatId}-${instance.current}`);
    for (const [table, key] of tables) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `heat_id=eq.${heatId}` }, (p) => {
        if (!live) return;
        setSnap((s) => ({
          ...s,
          [key]: p.eventType === "DELETE" ? (s[key] as Row[]).filter((r) => r.id !== (p.old as Row).id) : upsertRow(s[key] as Row[], p.new as unknown as Row),
        }));
      });
    }
    ch.subscribe((status) => {
      if (!live) return;
      setHeatUp(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") void fetchSnapshot(heatId);
    });
    void fetchSnapshot(heatId);
    return () => {
      live = false;
      void supabase.removeChannel(ch);
    };
  }, [supabase, heatId, fetchSnapshot]);

  // a safety net: while a channel is down, ask again every 5 seconds, and when the phone comes back online
  const up = heatsUp && heatUp;
  useEffect(() => {
    const again = () => void refresh();
    window.addEventListener("online", again);
    const t = up ? null : setInterval(again, 5_000);
    return () => {
      window.removeEventListener("online", again);
      if (t) clearInterval(t);
    };
  }, [up, refresh]);

  const apply = useCallback<LiveHeatState["apply"]>(
    (key, row) => {
      if (row.heat_id && heatId && row.heat_id !== heatId) return;
      setSnap((s) => ({ ...s, [key]: upsertRow(s[key] as Row[], row as unknown as Row) }));
    },
    [heatId],
  );

  const drop = useCallback<LiveHeatState["drop"]>((_key, id) => {
    setSnap((s) => ({ ...s, pending: s.pending.filter((r) => r.id !== id) }));
  }, []);

  return { heats, heat, phase, ...shownSnap, apply, drop, plans, applyPlan, patchHeat, connected: up && (typeof navigator === "undefined" || navigator.onLine), submittedHeatIds: submittedMemory.current, refresh };
}
