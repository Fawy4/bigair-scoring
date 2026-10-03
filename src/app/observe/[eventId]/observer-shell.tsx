"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { SeatHeartbeat } from "@/app/seat/heartbeat";
import type { FrameKind } from "@/lib/live/observer";
import { createClient } from "@/lib/supabase/browser";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.observer;

export interface ShellView {
  key: string;
  label: string;
  group: "head" | "judges" | "spotters" | "more";
  frame: FrameKind;
}

/** The size each kind of screen is drawn at (its own media queries then lay it out exactly as on that device). */
const NATURAL: Record<FrameKind, { w: number; h: number | null }> = { laptop: { w: 1280, h: null }, tv: { w: 1280, h: 720 }, phone: { w: 390, h: null } };

function frameSrc(eventId: string, v: ShellView): string {
  if (v.key === "screen" || v.key === "public") return `/observe/${eventId}/door?to=${v.key}`;
  return `/observe/${eventId}/screen?view=${encodeURIComponent(v.key)}`;
}

/** Is this phone still holding an active observer seat? Checked every 10 seconds; a switched-off seat or a new PIN ends the view at once. */
function useStillObserver(eventId: string): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const supabase = createClient();
    let live = true;
    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return live && setOk(false);
      const { data, error } = await supabase.from("judge_seats").select("id, active, status, role").eq("event_id", eventId).eq("auth_user_id", user.id).maybeSingle();
      if (error) return; // offline: keep the view, try again
      if (live) setOk(Boolean(data && data.active && data.status === "active" && data.role === "observer"));
    };
    void check();
    const t = setInterval(() => void check(), 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [eventId]);
  return ok;
}

function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/**
 * The observer's page: a top bar (the event, the observer's name, "Whose screen" and, for a laptop or big-screen view, Fit to screen / Actual size), a quiet
 * "Observing — read only" strip, and the chosen official's real screen in a frame of that device's size. The frame's page is read only by itself.
 */
export function ObserverShell({ eventId, eventName, observerName, views, start }: { eventId: string; eventName: string; observerName: string; views: ShellView[]; start: string }) {
  const [key, setKey] = useState(start);
  const [actual, setActual] = useState(false);
  const still = useStillObserver(eventId);
  const [box, size] = useSize<HTMLDivElement>();
  const view = views.find((v) => v.key === key) ?? views[0];

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", key);
    window.history.replaceState(null, "", url.toString());
  }, [key]);

  const frame = useMemo(() => {
    const n = NATURAL[view.frame];
    if (view.frame === "phone") {
      const w = size.w > 0 ? Math.min(size.w, 430) : n.w;
      return { w, h: Math.max(size.h, 480), scale: 1 };
    }
    const scale = actual || size.w === 0 ? 1 : Math.min(1, size.w / n.w);
    return { w: n.w, h: n.h ?? Math.max(600, Math.round(size.h / scale)), scale };
  }, [view.frame, size.w, size.h, actual]);

  const groups: Array<[ShellView["group"], string]> = [
    ["head", T.groups.head],
    ["judges", T.groups.judges],
    ["spotters", T.groups.spotters],
    ["more", T.groups.more],
  ];

  return (
    <main data-testid="observer-page" className="flex h-[100dvh] flex-col bg-[#f4f6f6] text-[#111]">
      <SeatHeartbeat />
      <header data-testid="observer-bar" className="flex flex-col gap-2 border-b-2 border-[#111] bg-white px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-base font-extrabold">{eventName}</p>
          <p className="text-sm font-semibold">{T.seatLine(observerName)}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm font-semibold" htmlFor="observer-switcher">
            {T.switcherLabel}
            <select
              id="observer-switcher"
              data-testid="observer-switcher"
              value={view.key}
              onChange={(e) => setKey(e.target.value)}
              disabled={!still}
              className="h-14 w-full min-w-0 rounded-lg border-2 border-[#111] bg-white px-3 text-lg font-bold"
            >
              {groups.map(([g, label]) => {
                const list = views.filter((v) => v.group === g);
                return list.length ? (
                  <optgroup key={g} label={label}>
                    {list.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
          {view.frame !== "phone" ? (
            <button type="button" data-testid="observer-fit" onClick={() => setActual((a) => !a)} className="h-14 rounded-lg border-2 border-[#111] bg-white px-3 text-base font-bold">
              {actual ? T.fit : T.actual}
            </button>
          ) : null}
        </div>
        {views.every((v) => v.group !== "judges") ? <p className="text-sm font-semibold">{T.noJudges}</p> : null}
      </header>
      <p data-testid="observer-strip" role="status" title={T.stripNote} className="flex items-center gap-2 bg-[#e8ecec] px-3 py-1 text-sm font-semibold text-[#333]">
        <Eye aria-hidden className="size-4" />
        {T.strip}
      </p>
      <div ref={box} className={cn("relative min-h-0 flex-1", actual ? "overflow-auto" : "overflow-hidden", view.frame === "phone" && "flex justify-center overflow-y-hidden")}>
        {still ? (
          <div style={{ width: frame.w * frame.scale, height: frame.h * frame.scale }} className="overflow-hidden bg-white">
            <iframe
              key={view.key}
              data-testid="observer-frame"
              data-view={view.key}
              title={view.label}
              src={frameSrc(eventId, view)}
              style={{ width: frame.w, height: frame.h, transform: frame.scale === 1 ? undefined : `scale(${frame.scale})`, transformOrigin: "0 0" }}
              className="block border-0"
            />
          </div>
        ) : (
          <div data-testid="observer-revoked" role="alert" className="m-4 flex max-w-md flex-col gap-3 rounded-lg border-4 border-[#111] bg-white p-4">
            <p className="text-lg font-bold">{T.revoked}</p>
            <Link href="/join" className="flex h-14 items-center justify-center rounded-md bg-[#111] text-lg font-bold text-white">
              {T.joinAgain}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
