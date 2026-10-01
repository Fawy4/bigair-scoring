# 09 — Event-Day Runbook (Arrow launch, El Gouna) with paper fallback

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack

## A. The day before (≈60 min)
1. **Wake the database**: open the Supabase dashboard; if the project shows "Paused", click Resume (free tier pauses after ~7 days idle). Load the public event page once.
2. **Create the real event** in `/org`: name "Arrow Big Air – El Gouna", slug `arrow-gouna`, time zone Africa/Cairo, logos (Arrow, WOO), live scores setting = "live" (or "after publish" if the head judge prefers), ready-call = 15 min.
3. **Divisions**: create what you have registrations for (e.g. Pro Men – KOTA preset – dingle or heats-of-4 depending on numbers; Women; Amateur – club-quick-best2 – pools-to-final). Confirm judge panel per division. Lock criteria help texts.
4. **Riders**: approve self-registrations, add walk-ins, set seeds (ranking or random), print the start list.
5. **Officials**: create seats (Judge 1–3, Head Judge, Spotter, Announcer); print the PIN/QR cards; test one phone join.
6. **Draw**: generate per division; sanity-check heat sizes; print bracket PDF.
   - **If Phase 7a-1 is live (it has Reset event):** lock each division's draw only *after* 7a-1 is on main and *before* that division's first heat. If a draw was locked earlier, unlock it (with a reason) and lock it again while no heat of that division has started. Only a lock taken before any heat ran keeps the starting draw that Reset returns to. A division that has run a heat without such a lock can never be reset (docs/PLAN-phase-7a.md, step 8d).
   - **Demo, once, after 7a-1 merges:** in /admin delete the Demo organisation and press "Create demo organisation", then lock each Demo division in the Draw step before running any practice heat. Demo Cup, as it is today, cannot be reset.
   - If 7a-1 did not ship before the event, skip both: the event runs on the current screens and there is no Reset.
7. **Run order & timetable**: build Plan A (expected start) and Plan B (late wind); set the first anchor; export PDF/PNG → WhatsApp group + noticeboard.
8. **Backups**: export a CSV of entries; print **paper judge sheets** (Phase 7 export) — one per heat per judge — and blank spares.
9. **Devices**: judges' phones charged, brightness max, "add to home screen" done, auto-lock off; one power bank per judge; head judge on a laptop/tablet with a hotspot as backup; big screen laptop tested with `/screen/arrow-gouna`.

## B. Riders' briefing (10 min) — say this
- Vest colours = your identity on every screen; check your colour on the timetable/rider page.
- Ready call 15 min before your heat at the launch; times are **estimates** that update live — refresh the event page.
- Scoring: (KOTA-style) each trick 0–10 on height, extremity, technicality, execution; best 3 count + one impression mark; crashes don't count but hurt impression; variety matters.
- Interference / safety rules and penalties; how ties are broken; protest window (e.g. 10 min after publish, to the head judge).

## C. Judges' briefing (15 min) — say this
- Criteria definitions (use the help texts) and today's emphasis given the wind (write it down; **do not change during the event**).
- Anchor scores: agree what a 5, 7, 9 looks like in today's conditions after the first heat's warm-up jumps.
- Phone flow: attempt appears → tap Landed/Crashed → tap numbers → Save; you can edit until the head judge locks; impression at the end.
- If your phone dies: shout your marks to the head judge (tabulator mode) or use the paper sheet; nothing is lost.

## D. Running a heat (head judge + spotter)
1. Head judge: select heat → **Start** (timer starts for everyone; timetable actual start recorded).
2. Spotter: log each attempt (colour → category → landed/crashed). Judges score as they land.
3. Watch the matrix: grey = missing mark (nudge the judge), amber = outlier (ask "sure?"). Flag-out if configured at the minute.
4. Timer 0 → **End heat** → judges enter impression → **Submit sheet**.
5. Review → resolve ties/penalties → **Publish**. Results and progression appear on all screens; next heat's TBDs fill.
6. Announcer reads totals + counted tricks from the announcer view.

## E. Wind hold / delay
- Head judge: **Hold** (reason "Wind"). Public pages show "On hold". When conditions return: **Resume at HH:MM** → timetable re-flows from that anchor. Or **Shift +10**.
- Wind drops for the day: switch active plan to Plan B (fewer rounds) — riders see the new order instantly.
- Extreme wind and shorter heats: edit the round duration; the timetable recomputes.

## F. Failure modes and what to do
| Problem | Do this |
|---|---|
| A judge's phone shows "pending" for > 1 min | Keep scoring; it syncs when signal returns (no duplicates). If still pending at heat end, head judge types their marks from the phone screen (tabulator mode) |
| Judge phone dead | Paper sheet → head judge enters marks after the heat, notes "entered by HJ" |
| App unreachable for everyone | Run the heat on paper sheets + the printed timetable; keep the heat clock on a phone stopwatch; enter marks later (heat can be started/ended retroactively with times) |
| Wrong result published | Head judge **Re-open** → fix → **Publish v2** (audit records both) — only if the next heat has not started |
| Rider no-show | Mark DNS; heat runs with the rest |
| Realtime stops updating | Refresh the page (pull down); check Supabase status; the head judge screen is authoritative |
| Public live scores cause arguments | Organiser sets live scores to "after publish" — takes effect immediately |

## G. After the event
Export results CSV/PDF per division; export the audit log; post final placings and Highest Jump; keep the event as a template ("Duplicate event") for the next one; note what to change in the presets.

## H. One-page checklist (print)
☐ DB awake ☐ Event created & branded ☐ Divisions + presets ☐ Riders approved & seeded ☐ Officials PIN cards ☐ Draw generated & printed ☐ (7a-1 live) Draws locked after 7a-1, before the first heat ☐ (7a-1 live) Demo recreated and its draws locked ☐ Plan A/B timetable exported ☐ Paper sheets printed ☐ Devices charged/installed ☐ Big screen tested ☐ Briefings done ☐ First anchor set ☐ Hotspot ready ☐ Exports after event
