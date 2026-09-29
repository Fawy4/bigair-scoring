# How it works, end to end — three points of view

> Generated: Tuesday 29 September 2026, 20:55 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack · Human-readable companion to `docs/04`, `docs/05`, `docs/06`. Claude Code should treat this as the user-journey reference when building screens.

Three hats: **A. the owner/provider of the service** (you, running `[PRODUCT_NAME]` as a product), **B. the organiser running one event** (you at Gouna; later your customers), **C. the users on the day** (judges, spotters, head judge, riders, spectators, announcer). Everything below is what the finished system does; screen names match `docs/06`.

---

## A. Owner / provider of the service

### A1. The platform layer (one-time)
1. Your own **organisation** is the platform owner. The **system presets** (scoring models, format templates, identification schemes, schedule defaults) belong to it and appear to every customer as read-only "system" presets they can duplicate.
2. You set the product name, logo, default time zone, legal texts (terms, privacy, rider consent wording), and the footer. Later: plan limits (Free / Event / Season) and Stripe.
3. Every customer gets a public address of the form `https://[yourdomain]/e/<event-slug>`; later, per-organisation sub-domains or a white-label domain.

### A2. Onboarding a customer organiser
1. They sign up with an email (magic link) → create their **organisation** (name, logo, country, time zone) → pick a plan.
2. They see the **preset library**: your system presets plus their own. "Duplicate & edit" makes a private copy they can tune; they can save event-specific variants ("Pro Men — Gouna 2026").
3. Optionally *you* create the first event for them as a service, then hand over the organiser login. "Duplicate event" lets them clone last year's set-up.

### A3. Supporting a live customer event
- `/org/health` shows database reachable, live updates connected, last publish time, judges connected.
- Everything is exportable (results, marks per judge, timetable, audit log) — disputes are settled with the audit log, not memory.
- Operating checklist per event until you are on paid tiers: database awake, correct time zone, plan active, region latency OK.
- Product metrics you watch: events run, heats published, heat-end-to-publish time, marks entered on phones vs paper, public page views, presets customised.

### A4. Versioning presets safely
System presets are versioned. A division stores the preset *id + version + its overrides*, so improving a system preset never changes a running or past event.

---

## B. Running an event (organiser) — from empty screen to prize giving

### B1. Days before: build the event (≈45–90 min the first time, 20 min when duplicating)

**Step 1 — Event.** `/org → New event`: name, URL slug, location, dates, time zone (Africa/Cairo), logo + sponsor logos (Arrow, WOO), public live-scores setting (live / after publish / off), ready-call minutes (15), **rider identification scheme** (vests per heat / fixed lycra / bib numbers / kite / brand-launch), wind-call banner text. The system generates the **event join PIN** and the public URL + QR.

**Step 2 — Divisions.** For each division (Pro Men, Women, Amateur…):
- **Scoring preset**: pick (KOTA best-3 + impression is default). "Duplicate & edit" if you want, e.g., best 2 for Women, no impression for Amateur, WOO height on, different tie-breakers. The form is generated from the schema — every rule is a field.
- **Format template** + parameters: heats-of-4 top-2 single elimination, KOTA dingle (heats of 3, repechage, man-on-man, final of 3), Megaloop ladders, pools-to-final (expression heats of up to 10). Set heat durations per round type, breaks after heat/round, flag-out on/off, uneven-field rule (smaller heats for top seeds vs byes), eliminated placings shared or ranked.
- **Judges**: min/max (3–5 typical), which panel scores this division, whether the head judge also scores.
- Minimum entrants to run (else auto-merge prompt).

**Step 3 — Riders.** Three ways in: (a) open the **public registration link** and approve entries as they arrive; (b) paste a CSV; (c) type them. Then: seed order (drag, or import a ranking), identifiers required by your scheme (lycra colour, bib, kite brand/model/size/colours, rash guard, photo), status (confirmed / withdrawn / no-show). Print the start list.

**Step 4 — Officials.** Add seats: Judge 1–3(+), Head Judge (toggle "also scores"), Spotter, Announcer. Each seat gets a **6-digit PIN + QR card** (print/WhatsApp). Assign panels per division (which judges score which division). You can add/remove seats on the day; the minimum is enforced by the division's preset.

**Step 5 — Draw.** Per division: **Generate draw** → bracket appears (rounds as columns, heats as cards with slots, rider chips, TBD placeholders like "Winner H2"). Check compositions; drag to swap riders if needed (recorded as manual override); print the bracket PDF. Regenerating is one click until the first heat starts.

**Step 6 — Run order & timetable.** Drag heats from all divisions into the day's order; insert breaks (lunch, riders' briefing, prize giving). Tap a start time to **pin an anchor** (at least the first heat). Everything else is projected: End = Start + Duration, next Start = End + Break. Duplicate the plan → **Plan B – bad wind** with fewer rounds or a different order; keep one active. Export PDF/PNG (Division / Session / Start / Duration / End / Break) for WhatsApp and the noticeboard.

**Step 7 — Publish.** Toggle event **Published**: the public site goes live with timetable, draw, riders, wind call. Send the link/QR to riders' WhatsApp.

### B2. Event morning (≈30 min)
1. Set the **wind call** banner (red/amber/green + message). If waiting for wind: leave the first anchor at the earliest plausible time and update it when you call it — every row re-flows instantly on all phones.
2. Officials tap their link, enter PIN + name → they are in (no accounts). Head judge opens the **console**; big screen laptop opens `/screen/<slug>`.
3. Riders' briefing (identification, ready calls, scoring summary, rules); judges' briefing (criteria emphasis for today's wind, anchor scores). Once the first heat starts, the division's scoring model **locks**; changes need a reason and are logged.

### B3. Running a heat (repeat)
1. Head judge selects the heat → **Start**. Timer runs on every device from the server timestamp; the timetable records the **actual start** and re-flows later heats.
2. **Spotter** (phone opened the heat by itself) taps the rider → Left/Right → picks the trick from the large list with multipliers (×2, ×3) and modifiers (board-off, handle pass, late, grab…), combining freely — or types it, or speaks it → **Log**, or the big **CRASH** button → optional WOO height. The attempt appears on all judges' phones within a second.
3. **Judges** (phone opened the heat by itself) tap the criteria number pads (Height, Extremity, Technicality, Execution 0–10) — or **Missed** if they didn't see the trick → auto-saves; badge shows synced/pending. Marks queue and retry if signal drops.
4. Head judge watches the **matrix**: grey cells = missing mark (nudge), amber = outlier (> 15 % of scale apart), crash rows struck through; provisional totals and ranks update live. **Flag-out** button appears at the configured minute (KOTA-style heats).
5. Timer hits 0 (or **End heat**) → **every judge must enter the variety/impression mark for every rider** (progress "2 / 3", landed tricks shown as a hint) → **Submit sheet**. Publishing waits until all judges have submitted.
6. Head judge **Review**: delete a duplicate or wrong trick (e.g. two spotters logged the same jump — flagged automatically), edit a trick or its rider, fix a wrong tap with a reason, add DNS/DNF/DSQ/interference, resolve an unresolved tie → **Publish**. Results snapshot, public pages update, winners flow into the next round's TBD slots, the timetable shows the heat as done.
7. Announcer reads totals and counted tricks from the announcer view; big screen shows the result, then rotates back to "Up next".

### B4. When the day doesn't go to plan
- **Wind drops**: **Hold** → public sees "On hold". **Resume at 15:40** → the next heat is anchored there; everything re-flows. Or **Shift +10**. Or activate **Plan B**.
- **Rider missing**: mark **DNS**; the heat runs with the rest. Withdrawal before the draw → regenerate; after → walkover.
- **Wrong result**: **Re-open** → fix → **Publish v2** (both versions in the audit log) — allowed until the next heat has started.
- **Judge phone dies**: head judge types their marks (tabulator mode) or uses the paper sheet export.
- **Fewer riders than expected**: the generator produces the right number of heats for any N (down to a single final); the format can be changed until the division's first heat starts.
- **Arguments about live scores**: switch the event to "scores after publish" — takes effect immediately.

### B5. After the last heat
Final placings (shared places shown "13="), **Highest Jump** board if WOO was on, export results CSV/PDF and the audit log, prize giving from the big screen, then **Duplicate event** as the template for next time.

---

## C. Users on the day

### C1. Judge
Gets a PIN card → opens the link on their phone → PIN + name → sees "Your heats today" with times. When the head judge starts a heat, the scorecard opens by itself: rider chips across the top (colour/number/kite), attempt cards arriving from the spotter, number pads per criterion, a **Missed** button for tricks they didn't see. Can edit their own marks until the heat is locked. At heat end: a variety/impression mark for **every** rider is required before they can submit. Sees only their own marks (judge-level transparency is an event setting). If signal drops, marks show "pending" and sync later — nothing to do.

### C2. Spotter / trick caller
Same join flow. Their phone opens the live heat; on each jump: tap rider → Left/Right → trick from the list (multipliers, board-off, handle pass…, combinable) or type/speak it → **Log** or **CRASH** (3–4 taps). Undo within 10 s; duplicates with another spotter are flagged for the head judge. Their log doubles as the commentary feed and, with WOO on, they (or a WOO official) type the height per attempt.

### C3. Head judge
Joins with the head-judge PIN (or organiser login). Console shows run order, timer controls, the live matrix with flags, totals and provisional ranks, publish button, hold/resume/shift, re-open, agreement report per judge after the heat. Can run the whole heat alone from one device if needed.

### C4. Rider
Registers on the public link (division, contact, identifiers, consent) → "Registered, awaiting confirmation" → organiser confirms. On the day: opens the event page → **My heats**: "Pro Men · R1 · Heat 3 — est. 15:23 — ready call 15:08 — you are RED / #14 / Orbit 9 blue". Times update live; wind holds are shown. After the heat: place, total, counted tricks, impression, and if advancing, the next heat. Shareable result card.

### C5. Spectator
Scans the QR on the beach → timetable with "Now" and "Up next", live heat (running totals if enabled), draw, results with breakdown, final placings, sponsor logos, wind call. No app, no login.

### C6. Announcer / commentator
Read-only console: spotter feed ("Blue — Double loop board-off — landed"), panel scores as they land, totals, what each rider needs to overtake (from the breakdown), rider bios and sponsors.

### C7. Sponsor (Arrow, WOO)
Logos on every public page and the big screen; WOO "Highest Jump" leaderboard when heights are recorded; exportable stats after the event.

---

## D. What happens automatically vs. what a human decides

| Automatic | Human (with audit) |
|---|---|
| Heat sizes, seeding, byes, TBD placeholders, bracket | Manual rider swaps before a heat |
| Panel scores, counted tricks, impression, totals, provisional ranks, tie-breaks in order | Start / End heat, flag-out, unresolved tie, penalties (INT/DNS/DNF/DSQ) |
| Publishing → progression into next round → timetable actual times → public update | Publish, re-open/correct |
| Timetable re-flow from anchors and actual starts | Anchors, holds, resume time, plan switch |
| Missing-mark and outlier flags, publish blocking | Override with reason |
| Highest Jump board, exports, audit log | Wind call, live-scores visibility |

## E. Settings you will actually touch on the beach
Wind call · first-heat anchor · Hold/Resume/Shift · active plan · DNS/withdrawals · publish · live-scores visibility · adding a judge seat. Everything else is decided the day before.
