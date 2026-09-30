# PLAN — Phase 4: organiser console (`/org`)

> Agreed 29 Sep 2026. Specs: `docs/06-SCREENS-UX.md` §00, §0, §1, §2, §3 and **§12 Decisions log** (Phase 4 decisions, which win over this plan's wording if they differ); `docs/04-FORMAT-LADDER-SPEC.md` §2–5, §7, §9; `docs/03-SCORING-ENGINE-SPEC.md` §3, §10 (item 16); `docs/05-ARCHITECTURE-DATA-MODEL.md` §3, §5, §12 (decision 13).

Three pull requests, each green (`npm run typecheck && npm test && npm run lint`, RLS tests where the database changes) and with a `docs/STATUS.md` update before it is opened.

| PR | Branch | Contents |
|---|---|---|
| **4a-1** | `phase-4a-organiser-console` | Engine dials, groundwork, database additions, organisation settings, wizard steps **Event** and **Divisions** |
| **4a-2** | `phase-4a2-riders-officials` (from `main` after 4a-1 merges) | Wizard steps **Riders** and **Officials**, public registration page, officials' self-add on the join page |
| **4b** | `phase-4b-draw-timetable` (from `main` after 4a-2 merges) | Wizard steps **Draw** and **Run order & timetable**, dashboard, minimal public event page |

## Rules for this phase
- Product name only from `NEXT_PUBLIC_PRODUCT_NAME` (headers, footers, titles). Organisations are customers; nothing says "Sendbook" in data.
- No hard-coded rules: every setting is a Zod field with a default; forms validate with the same schemas as the engine.
- Engine stays pure; new pure helpers (CSV parsing, model description sentence, export layout) live outside React and are unit-tested.
- Every drag has a tap alternative (↑ / ↓, "Move to…", tap a rider then tap a slot). One confirmation for data-changing actions.
- New packages: `qrcode` (4a-2), `@dnd-kit/*` (4a-2 for seed order, 4b for bracket/run order). Nothing else.
- Client code names columns (never `select *` on `events` / `judge_seats`).

---

## PR 4a-1 — dials, groundwork, settings, Event + Divisions

### 1. Engine dials (tests first) — `src/lib/engine/scoring/`
| Item | Detail |
|---|---|
| Tests | New `dials.test.ts` with doc 03 item 16 values: `perCategoryMax {kiteloop: 2, board_off: 1}`, kiteloops 8.9 / 8.4 / 7.0, board-offs 7.2 / 6.0 → counted 8.9 + 8.4 + 7.2 = **24.50**; `countedWeights [1, 0.75, 0.5]` on 8.0 / 7.0 / 6.0 → **16.25**. Plus: auto max for both (decision 5), drop-best-then-reweight (decision 6), tie-breakers on raw scores (decision 7), absent dials = unchanged results (all existing tests still pass). |
| Schema | `scoring-model.ts`: `counting.perCategoryMax?: Record<string, int ≥ 1>` (keys must be category keys), `heat.countedWeights?: number[]` (each ≥ 0). |
| Engine | `counting.ts` (per-category limit), `heat.ts` (weights after interference, auto max), `explain.ts` (breakdown shows "7.0 × 0.75 = 5.25"). |

### 2. Groundwork
- Mount `<Toaster />` with a `useToast` hook (organiser screens only; errors stay on screen — decision 16).
- Replace the Phase 0 home page: product name, "Officials: join with a PIN", "Organiser sign in", list of published events (links to `/e/[slug]`; that page arrives in 4b, so until then the list links to `/e/[slug]/join`).
- Organiser shell `src/app/org/(console)/layout.tsx`: header with product name and organisation switcher, footer, beach contrast tokens (decision 17).
- `scripts/bootstrap-organiser.ts`: `--org-name` and `--org-slug` required (decision 1).

### 3. Database — one migration + RLS tests
| Change | Purpose |
|---|---|
| `organisations.settings jsonb` (`defaultTimezone`, default `Africa/Cairo`); grant update to org admins | Organisation settings |
| Storage bucket `branding` (public read; write only under `<organisation_id>/…` by that organisation's members; images only, 2 MB) | Organisation logo, event logo, sponsor logos |
| `presets` table: `organisation_id null = system`, `kind` (`identification \| schedule \| …`), `key`, `name`, `version`, `json`, `content_hash`, `unique nulls not distinct (organisation_id, kind, key, version)`; RLS: read system + own org, write own org | Generic presets (decision 3) |
| `divisions.draw jsonb`, `divisions.draw_locked_at timestamptz`, `divisions.rules_locked_reason` audit path | Used by 4b (decision 13) and the rules lock (decision 8) |
| `seed:presets` also loads `presets/identification/schemes.json` and `presets/schedule/*.json` into `presets` | System presets in one place |
| `src/lib/supabase/database.types.ts` regenerated | Types |
RLS tests: a member of another organisation cannot read/write these rows or upload into another organisation's folder.

### 4. Organisation settings — `/org/settings`
Name, slug (with a warning that public links change), logo upload, default time zone. **Acceptance test:** the owner renames "Arrow Big Air" → "Arrow", slug `arrow`.

### 5. Event wizard — `/org/events/new`, `/org/events/[id]/{event,divisions,riders,officials,draw,schedule}`
Left rail (collapses to a step picker on tablets); each step saves on its own; unfinished steps show a plain-language "what's missing".

**Event step** — name, slug, location, dates, time zone (pre-filled from the organisation), event logo and sponsor logos (Arrow branding lives here), public live scores (live / after publish / off), ready-call minutes, live poll seconds, judge grace seconds, judges may log attempts, registration open/closed + closing date (used by 4a-2), identification scheme: pick a preset, edit palette / secondary fields / call-out label / fallback, "allow per-division override", save as preset. Live preview of one rider chip.

**Divisions step**
- List with add / reorder (↑ ↓) / duplicate / delete (delete refused once heats exist).
- **Scoring** — preset dropdown (system + organisation). **Simple** level: counting rule and N, attempt cap, impression on/off + scale, judges min/max, aggregation; live sentence ("Best 3 of 7 attempts + Variety 0–10, 3 judges averaged") from a pure, tested `describeScoringModel()`. **Advanced** level: form generated from `ScoringModelSchema` (Zod 4 → field renderer: enums → selects, numbers with min/step, arrays of objects → tables with add / remove / ↑ ↓, discriminated unions → type picker; plain-language labels from a label map), including criteria table, panel rules, counting (with both new dials), impression, tie-breakers as ordered list, modifiers, height sensor, categories. Validation errors shown next to the field.
- Simple edits → `divisions.scoring_overrides`; "Duplicate & edit" / "Save as preset" → new organisation row in `scoring_models`; editing a saved preset → new version (decision 8).
- **Format** — template dropdown; generator parameters form (from `FormatTemplateSchema`); heat durations and breaks per round; flag-out; **custom format builder** (add rounds, heat size, duration, breaks, sources, where each place goes); live preview "With 14 riders: R1 4 heats of 3–4 → …" from `expandFormat` with placeholder riders, showing its warnings. Save as preset → `format_templates`.
- JSON export (download) and import (Zod-checked, readable errors, always imports as a new organisation preset) for scoring models and formats.
- Rules lock: once any heat of the division has started, scoring and format are read-only; "Unlock" needs a written reason (audited).
- Judges min/max shown here; panel assignment arrives with Officials (4a-2).

### 6. Tests and evidence
Unit: dials, `describeScoringModel`, schema form helpers (default filling, override deep-merge), preset import. RLS: new tables and bucket. Playwright: sign in → create event → add division with a preset → switch to Advanced → save as preset → export JSON.

---

## PR 4a-2 — Riders, Officials, registration, self-add

### 1. Database — one migration + RLS tests
| Change | Purpose |
|---|---|
| `public.register_rider(event_slug, division_id, fields, identifiers, consent)` (security definer, anon allowed): checks registration is open and before the closing date, rate limit per address (reuses `join_attempts`-style table), matches rider by email within the organisation (decision 11), creates `entries` with `source = self`, `status = registered` | Public registration |
| `public.registration_photo_upload_url(...)` server action issuing a short-lived signed upload URL to bucket `rider-photos` (images, 5 MB) | Photo upload |
| `public.request_seat(event_id, name, role)` (anon, rate-limited) → `judge_seats.status = pending` | Officials' self-add |
| `approve_seat(seat)` for organisers | Approve pending officials |

### 2. Riders step
- Table per division: add row, inline editing of every identifier column, each row renders the **RiderChip** exactly as judges will see it.
- **CSV paste**: comma or tab separated (Excel / Google Sheets), header matching for First, Last, Nationality, Email, Phone, Sponsor, Seed, Bib, Lycra colour, Kite brand, Kite model, Kite size, Kite colours, Rash guard colour, Photo URL; preview with per-row errors before import; pure tested `parseRiderCsv()`.
- **Registrations**: pending self-registrations with Approve / Decline.
- **Seed order**: drag (`@dnd-kit`) plus ↑ / ↓ and "Move to position…".
- **Withdraw / no-show**: status change (before a draw exists it simply removes the rider from the start list; after the draw the 4b rules apply).
- Print start list (print layout).

### 3. Officials step
- Add seat: name, role (judge / head judge / spotter / announcer) → **PIN and QR shown on screen immediately** (decision 9).
- **Print cards** (choose seats → one confirmation "the old PINs will stop working" → fresh PINs → printable card sheet with QR) and **Regenerate PIN** (per seat, same confirmation). Connected phones stay connected. QR expiry = event end date + 1 day.
- Panels: create, name, pick seats and seat numbers, assign to divisions (`divisions.panel_id`).
- "Head judge also scores": toggle, default all panels, checkbox per panel (decision 10).
- Live "connected" indicator per seat; lock / deactivate seat.
- **Pending officials** list with Approve (issues a PIN) / Decline.

### 4. Public pages
- `/e/[slug]/register`: event branding, division choice with level description, name, email, phone (WhatsApp), nationality, sponsor, WOO ID, identifiers required by the scheme, photo upload, consent checkbox → "Registered — awaiting confirmation". Closed registration shows a clear message.
- `/join` and `/e/[slug]/join`: "Not on the list? Add your name" form → pending seat.

### 5. Tests and evidence
Unit: CSV parser (quotes, tabs, missing columns, duplicates). RLS: anon can register only when open, cannot read entries/emails; rate limits hold; self-add creates only `pending` seats. Playwright: register as rider → approve in Riders; self-add official → approve → join with PIN.

---

## PR 4b — Draw, timetable, dashboard

### 1. Draw step (per division)
- **Generate draw** → `expandFormat` → stored in `divisions.draw` and projected to `rounds` / `heats` / `heat_slots` in one transaction (decision 13).
- Bracket view: rounds as columns, heats as cards with numbered slots, RiderChips, vest colours as text, "Winner H2" placeholders, "Bye", identifier-clash and "eliminates nobody" warnings.
- **Manual move**: drag between slots, or tap a rider then tap a target slot (swap); records `manualOverride`.
- **Confirm draw** → `lockDraw` (withdrawals after this become DNS walkovers, doc 04 decision 13).
- **Regenerate**: only while no heat of the division has started; typed confirmation; audited; unlocks (decision 14).
- Print/PDF bracket.

### 2. Run order & timetable step
- Left: unscheduled heats grouped by division; right: the day's run order. Drag, or ↑ / ↓ and "Move to…"; insert break / note.
- Tap a start time to pin an anchor; duration and break editable per item; header shows projected finish (`computeTimetable`), warnings listed.
- Plans per event day: "Duplicate plan" → name it → "Activate" (exactly one active).
- Export: PDF (print layout) and PNG (canvas) in the **Division / Session / Start / Duration / End / Break** layout; pure tested `timetableExportRows()`.
- Save a plan as a schedule preset (generic `presets` table).
- After a regenerated draw: items re-matched by division + round + heat number, others removed with a warning (decision 14).

### 3. Dashboard — `/org/events/[id]`
Today's timetable (compact), publish-status counts, QR codes for join and the public page (big-screen link only once `/screen/[slug]` exists), links to each wizard step (decision 15).

### 4. Minimal public event page — `/e/[slug]`
Name, dates, location, logo, links to Join and Register (decision 12).

### 5. Tests and evidence
Unit: export rows against doc 04 §7.3 (Kitemania Day 2 values), regenerate re-matching. RLS: organisers of another org cannot touch draws or plans. Playwright: generate draw → move a rider with taps → confirm → build run order → pin 10:30 → finish time shown → export PNG.

---

## Not in Phase 4
Wind-call quick-set, Hold / Shift / live timer on the dashboard (Phase 5, head-judge controls); big screen; public live, results and bracket pages beyond the minimal event page; rider email confirmation (Phase 7+); points tables.
