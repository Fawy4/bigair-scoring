# 06 — Screens & UX (per role, mobile-first)

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack

Design rules: sunlight-readable (high contrast, dark text on light or pure dark mode), one-thumb operation for officials, ≥48 px tap targets, rider identity always shown as a **rider chip** built from the event's identification scheme (§0), every number tappable to reveal its breakdown, all times in the event time zone with "est." markers where projected. Product name placeholder `[PRODUCT_NAME]`; event branding (Arrow logo, WOO sponsor strip) configurable.

## 00. Beach readability standard (applies to every screen; IMPORTANT)
1. **Contrast first** — daylight theme by default: near-black text (#111) on white or very light backgrounds, contrast ratio at least 7:1 for essential text and numbers; a dark theme is available and switchable per device; no light-grey text; font weight at least 600 for numbers and names.
2. **Size** — score-pad buttons at least 56 px tall with 8 px gaps; pad digits at least 28 px bold; rider names at least 20 px; heat timer at least 48 px; the head-judge matrix is designed for tablet or laptop and is never squeezed onto a phone.
3. **Taps only** — nothing important on official screens relies on swipe, long-press or drag; one confirmation only for data-changing actions (Crash, Submit sheet, Delete attempt, Publish); generous spacing.
4. **Stay awake** — official screens request a screen wake lock while a heat is running, with a one-line reminder to disable auto-lock if the device does not support it.
5. **Never colour alone** — vest colours always carry the colour name; states use icon plus word (synced, pending, missed, live); colour-blind-safe palette; white and black vests are shown as outlined chips with text.
6. **Glare-proof feedback** — a large persistent confirmation such as "Saved 7.5 — RED — attempt 4" instead of small transient toasts; thick border on the selected rider or attempt; disabled states clearly greyed with a label such as "Out of attempts".
7. **Big screen** — white on dark, digits at least 120 px, one message per slide, readable from 10 m, no animation.
8. **Design preview gate** — before the official screens are built in Phase 5, a `/design` page shows the judge card, spotter builder, rider chips, timer and a result row in beach mode; the owner approves it on a phone outdoors first.

## 0. Rider identification — configurable per event, overridable per division
Judges and spotters must recognise a rider from the beach in two seconds, and organisers do not always have vests. The event therefore chooses an **identification scheme** (`events.settings.identification`, presets in `presets/identification/schemes.json`): one **primary** identifier shown big on every "rider chip", plus **secondary** identifiers shown small. Every screen (judge, spotter, head judge, public, big screen, exports) renders the same chip component.

| Identifier | How it works | Use when |
|---|---|---|
| **Vest / lycra colour per heat** (`vest_colour`, `vestAssignment = per_heat_slot`) — default | Each slot in a heat has a colour from the palette; the rider wears that vest for that heat only (KOTA/GKA style) | The organiser has a set of coloured vests |
| **Fixed lycra per rider** (`vest_colour`, `vestAssignment = fixed_per_rider`) | Colour handed out at registration and kept all event; the draw avoids two identical colours in one heat and warns if unavoidable | Lycras but not enough for per-heat swaps |
| **Bib / sail number** (`bib_number`) | Number per event or per division, printed on vest, board sticker or kite | Many riders, few colours |
| **Kite** (`kite`: brand, model, size, colours) | "North Orbit 9 · blue/white"; draw warns when two riders in a heat have similar kites | No vests; riders on their own gear |
| **Rash guard / wetsuit colour** (`rashguard_colour`), **helmet colour** (`helmet_colour`) | Colour from the palette, entered at registration/check-in | Fallbacks or extra confirmation |
| **Rider photo** (`photo`) | From registration or check-in | Spotter/judges who don't know the riders |
| Name · nationality · sponsor | Always available as secondary | |

Rules: colour is **always rendered as text as well as colour** ("RED") — for colour-blind officials and for white/black vests in sunlight. The spotter's call-out follows `calloutLabel` ("Red", "14", "Blue Orbit"). A scheme can define a `fallbackPrimary` (e.g. rash-guard colour when no vests are available on the day). The **brand-launch** preset covers the Arrow case where most riders fly the same kite brand: primary vest colour (or rash guard), secondary kite size + colourway + name + photo. Identifiers live on the entry (`entries.identifiers`), per-heat vest colours on the slot (`heat_slots.vest_colour`), photos on the rider.

Default palette (name + hex, in slot order): red, yellow, blue, green, white, black, orange, pink, purple, grey.

## 1. Organiser — Event wizard (desktop-first, works on tablet)
**Configurability promise (IMPORTANT).** Every rule the engines understand is editable in the organiser UI without code. Settings screens have a **Simple** level (the common dials, plain-language labels, and a live example sentence such as "Best 3 of 7 attempts + Variety 0–10, 3 judges averaged") and an **Advanced** level (every schema field). Any configuration can be saved as a preset, duplicated, and exported or imported as JSON. A custom format builder lets the organiser add rounds, set heat size, duration and breaks, and choose where each place goes. Nothing in the product should require a developer to run an event differently.

Steps shown as a left rail; each step saves independently so you can jump around.
1. **Event** — name, slug (URL), location, dates, time zone (default Africa/Cairo), logo, sponsor logos, public live-scores setting (live / after publish / off), ready-call minutes, join PIN (auto), wind-call banner, **rider identification scheme** (pick a preset from §0, edit palette/secondary fields, allow per-division override).
2. **Divisions** — list; add: name, order, **scoring preset** (dropdown of system + org presets; "Duplicate & edit" opens a form generated from the Zod schema: criteria table with add/remove/reorder/weights/scale, panel rules, counting rule, impression on/off, tie-breakers as sortable list, modifiers, height-sensor toggle), **format** (template dropdown; generator params such as heat size / advance / final size; heat durations and breaks per round; flag-out toggle), judges min/max, panel assignment.
3. **Riders** — table per division: add row, paste CSV (First, Last, Nationality, Email, Phone, Sponsor, Seed, Bib, Lycra colour, Kite brand, Kite model, Kite size, Kite colours, Rash guard colour, Photo URL), import registrations (approve/decline), drag to reorder seeds, mark withdrawn/no-show, print start list. Identifier columns are editable inline; the table shows each rider's chip exactly as judges will see it, and warns about duplicates within a heat.
4. **Officials** — add seat: name, role (judge / head judge / spotter / announcer), "head judge also scores" toggle, generate PIN + QR card (printable); panels: which seats score which division; live "connected" indicator per seat. Officials can also self-add from the public join page ("Not on the list? Add your name") — they show here as *pending* until the organiser approves and issues a PIN.
5. **Draw** — per division: "Generate draw" → bracket view (rounds as columns, heats as cards with numbered slots, colours, TBD placeholders "Winner H2"); drag rider between slots before start (records manual override); regenerate with confirmation; print/PDF bracket.
6. **Run order & timetable** — left: heats grouped by division (unscheduled); right: the day's run order list (drag to reorder; insert break/note); tap a start time to pin an anchor (pin icon); duration/break editable per item; header shows projected finish; "Duplicate plan" → name it (Plan A/Plan B) → "Activate". Export PDF/PNG in the Division/Session/Start/Duration/End/Break layout.
7. **Live** — shortcuts to head judge console, big screen, public URL + QR, wind call quick-set, health indicators.

## 2. Organiser — Dashboard
Today's timetable (compact), current heat with timer, publish status counts, quick actions (Hold, Shift +5, Wind call), links.

## 3. Rider self-registration (public)
`/e/[slug]/register`: event branding, division choice (with level description), name, email, phone (WhatsApp), nationality, sponsor, WOO ID (optional), identifiers required by the scheme (kite brand/model/size/colours, rash-guard colour, photo upload), consent checkbox (rules + photo/video + data), submit → "Registered — awaiting confirmation". Email confirmation optional (Phase 7+). Organiser approves in the Riders step.

## 4. Judge scorecard (phone) — `/judge/[heatId]`
- **Auto-follow**: the moment the head judge starts a heat that this judge's panel scores, the phone switches to that heat's scorecard by itself (realtime) — no navigation. Between heats it shows "Next: Pro Men · R1 · Heat 3 — est. 15:23".
- **Header**: heat name (Pro Men · R1 · Heat 3), big countdown, connection badge (synced / pending n / offline), my seat name. When the division caps attempts, each rider chip shows "5 / 7".
- **Rider strip**: one large rider chip per rider (primary identifier big — colour name, number or kite — with the secondary identifiers small, per §0); tapping a chip = "new attempt for this rider" when no spotter is logging (allowed by setting).
- **Attempt cards** (newest on top, from the spotter): colour, seq #, trick name/category if called, the spotter's status (Landed / Crashed) shown as a badge, a **Missed** button ("I didn't see it" — that judge's mark is left out of the panel average, the head judge sees *missed*, publishing is not blocked by it), a **Flag** button to alert the head judge ("that was a crash", "wrong rider", "duplicate"); for `entry = criteria`: one row per criterion with a horizontal number pad (0–10 by step, or the criterion's own scale, e.g. 0–3) — tap = set, a tappable "?" button next to the label shows the help text; computed trick score shown live; **Save** (auto-saves too). For `entry = single`: one number pad.
- **Repeat badge**: when the rider already landed the same trick in this heat, the attempt card shows "Repeat — 2nd time · you gave 7.0 before" (from `repeatIndex` and `priorCrashesSameTrick`, doc 03 decision 11). Informational only; no automatic penalty.
- **Review tab**: my marks per rider, editable until lock; landed/attempted counts.
- **Heat end** (timer 0 or head judge ends it): the scorecard switches to the **variety / impression step** — one mark per rider on the preset's scale (e.g. Impression 0–10, or Variety 0–5), each rider's landed tricks listed as a hint, progress "2 / 3 riders". **Submit sheet** is enabled only when every rider has a mark; the head judge sees who has submitted and **publishing waits for every judge** (override with reason, audited). After lock: read-only, "Ask head judge to reopen".
- Errors are impossible by design: no free typing, values snap to step, ranges enforced.

## 5. Spotter / trick caller (phone) — `/spot/[heatId]`
- **Auto-follow** like judges: when the head judge starts a heat, the spotter's phone opens it. Layout, top to bottom: rider chips (name + identifier, with "n / max" attempt counters when capped) → **direction toggle** (Left / Right) → a large, scrollable **trick list** with multipliers (×1 ×2 ×3 ×4 for rotations/loops) and **modifier chips** (Board-off · One-foot · Board spin · Handle pass · + Kiteloop · Late · Grab · Blind landing · Toeside · Downloop) that can be **combined freely** ("Left ×2 Backroll Board-off Handle pass") → a big red **CRASH** button (logs the attempt with the intended trick, score 0) → **Log**. Three ways to enter the trick: (1) tap from the list/chips, (2) **type** it, (3) **speak** it (microphone button; browser speech recognition where available, else the keyboard's dictation key) — typed/spoken text is matched against the vocabulary's aliases (`presets/tricks/big-air-vocabulary.json`) and shown back as chips to confirm before logging; unmatched words stay as free text and are flagged for the head judge. The builder composes a consistent name and derives the category from `categoryPrecedence`. Vocabulary is editable per event.
- **Multiple spotters**: each spotter seat can be assigned specific riders/colours (recommended) or work freely; when two spotters log the same rider within 20 s the later attempt is flagged *possible duplicate* for the head judge (never silently dropped).
- On **Log**, the attempt appears on every judge's phone and on the head judge's matrix within a second. One tap creates the attempt; judges see it instantly.
- Undo last (within 10 s), edit rider/category, running list with seq numbers. Also serves as the commentary feed ("Red — 3rd attempt — Double loop board-off — landed").
- **Out of attempts (hard stop):** when a rider has used the division's attempt cap, their chip turns grey with 'Out of attempts · 7 / 7' on the spotter AND judge screens and Log is disabled for that rider; if the head judge deletes one of that rider's attempts the chip re-enables live ('6 / 7'); the server refuses any attempt beyond the cap (ATTEMPT_CAP_REACHED) even from a stale phone; only the head judge may add an attempt beyond the cap, with a written reason, which is audited.

## 6. Head judge console (tablet/laptop) — `/head/[eventId]`
- **Left**: today's run order with states; buttons **Start heat** (records actual start), **Pause/Resume**, **End heat**, **Flag-out** (when configured, appears at the minute), **Hold (wind)** / **Resume at…**, **Shift +5/+10**.
- **Centre**: live matrix for the running heat — rows = attempts (rider chip, seq, trick), columns = judges, cells = trick score (tap for criteria), last column = panel score; flags: missing (grey), outlier (amber, > outlierWarnPct), crash (strike). Rider totals panel: counted tricks highlighted, impression, total, provisional rank with tie-break explanation.
- **Attempts management** (the "admin overlooks everything" role): **delete** an attempt (soft-delete — e.g. two spotters logged the same jump; the console highlights *possible duplicates* and offers **Merge**, which keeps whichever judges' marks exist), **edit** an attempt's rider, trick name/category or Landed/Crashed status, **add** an attempt the spotter missed; every change is audited and instantly reflected on judges' phones and public pages (counters recompute).
- **Actions**: edit any mark (requires reason; audited), mark judge absent for an attempt, add interference/DNS/DNF/DSQ, resolve tie (choose winner + reason), see which judges still owe variety/impression marks, **Publish** (blocked with a list if requirements unmet — missing trick marks, missing variety marks, unresolved tie; override with reason), **Re-open**.
- **Right**: judge connection status, attempts per minute, agreement report (post-heat).
- Works as a single-device "tabulator mode": head judge can enter all marks if judges' phones fail (paper sheets → typed in).

## 7. Public event site (mobile) — `/e/[slug]`
- **Join** (`/e/[slug]/join`): role picker cards — Judge · Spotter · Head judge · Announcer (each asks for the seat PIN) and Leaderboard · Bracket · Timetable (public, no PIN). Every card is a deep link that can be shared on its own.
- **Rules** (`/e/[slug]/rules`): auto-generated per division from the scoring model and format — criteria with help text and scale, how many tricks count, impression, tie-breakers, penalties, heat sizes/durations, how riders advance, identification legend. Riders and spectators should never have to ask "how is this scored?".
- **Home**: branding, wind call banner (red/amber/green + message), "Now: Pro Men R1 Heat 3 · 6:12 left", **Up next** (2 heats with est. times), full timetable (rows: Division · Round · Heat · Start · Duration · End; states done/live/next/est./held/pinned), sponsors, share button.
- **Live heat**: riders as chips (colour/number/kite per the scheme) with running total (if allowed), counted tricks (score + trick name), impression, attempts feed; when live scores are off → "Scores published after the heat". The leaderboard defaults to the **live** heat (then the last published), with tabs for the others. Each rider row prints the formula in words ("31.54 = tricks 24.04 + impression 7.50"), highlights counted chips, greys non-counted ones and shows CRASH chips in red; tapping a chip shows trick name and panel score.
- **Draw**: bracket per division with results filled in and "Winner H2" placeholders.
- **Results**: per heat — place, rider, total with the formula line, counted tricks highlighted, impression, penalties; tap → full breakdown per judge (if the event allows judge-level transparency; default: panel scores only). Identification legend (colours/numbers) shown under the heat.
- **Placings**: final division placings (shared places shown "13="), Highest Jump (if WOO on).
- **Rider page**: personal timetable ("Your next heat … ready call at …"), results, share card.

## 8. Big screen — `/screen/[slug]`
Full-screen, dark, huge type, auto-rotating pages every 20 s (configurable): live heat (colours, totals, timer) → timetable (next 6 rows) → last published result → sponsor slide. QR to the public site in a corner. Keyboard: space = pause rotation, 1–4 = jump. No login.

## 9. Announcer view — `/head/[eventId]?mode=announcer`
Read-only head-judge matrix plus the spotter feed and rider bios — for the commentator.

## 10. Empty/edge states to design explicitly
No riders yet · division with fewer riders than heat size (single final) · TBD slots · heat with a DNS · wind hold ("Competition on hold — times will update when we resume") · judge disconnected · publish blocked · re-opened heat (banner "Result under correction").

## 11. Copy style
Short, calm, rider-facing English; times as `15:23`; "est." suffix for projections; never show raw IDs.
