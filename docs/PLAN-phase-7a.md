# PLAN — Phase 7a: organiser and admin redesign

> Written 1 Oct 2026, against `main` at `54db9c4` (Phase 5c merged). **Nothing here is built yet.** Every "today" below describes code on that commit.
>
> Read for this plan: CLAUDE.md, docs/STATUS.md, docs/06 (§00 beach standard, §1–§2 organiser, every decisions log), docs/02, `src/lib/ui-copy.ts`, the `/design` page and its tokens (`src/lib/live/theme-tokens.ts`, `size-tokens.ts`, `globals.css`), and every screen under `/org` and `/admin`.
>
> Phase 6 (public pages) is being built in parallel on its own branch. This plan touches nothing under `/e/…`, `/o/…`, `/join`, `/screen/…` or `/legal`, with one exception the owner asked for: the landing page `/` (step 8c, see question Q3).

## Read this first: six problems with the brief

These come before the plan because each one changes what gets built.

1. **The owner notes 1a, 1c, 1d and 1e are not in the repository.** They are not in docs/06, not in any branch and not in any pull request. I treated the brief in the request as note 1e and wrote this plan from it. If notes 1a, 1c or 1d hold rules that are not repeated in the brief, they are missing here. **Before 7a-0 starts, add them to docs/06 (a "Phase 7a decisions log").**
2. **"Reset event" breaks a rule we already have.** Today an event cannot be *deleted* once a result is published, because "published results and the audit log are permanent" (docs/06, 4a-1c log). Reset wipes published results. The 30-day snapshot and the audit line soften this, but riders and spectators may already have seen those results. Q1 asks how to handle that.
3. **"Back to the locked draw" cannot be read back from the database.** Every publish writes results and the next heats' riders into `divisions.draw` (`publish_heat_commit` → `update public.divisions set draw = p_draw`). The draw *as it was locked* is not kept anywhere. Reset therefore needs a new column holding a copy taken at lock time. Divisions locked before this change need that copy rebuilt: undo each published heat in reverse order with the engine's own `unpublishHeat`. Re-run heats complicate it further (the draw's id moved to the re-run). Step 8d covers all of this. It is the riskiest part of the phase and the only database change in it.
4. **Two size rules disagree.** docs/06 decision 17 says organiser controls are ≥ 48 px. The approved `/design` compact Normal uses 36 px taps and 38 px rows. "Dense rows" (item 4) are impossible at 48 px. Q2 asks for a choice. My recommendation: 40 px on a computer and 44 px on a touch screen.
5. **"On event day the dashboard is the only page" is not literally true.** Starting heats, editing scores and publishing live on the head judge console (`/head/…`), which is a different screen on purpose. That console is fixed in Phase 5 and nobody should rebuild it inside the dashboard. In this plan the dashboard is the only page the organiser *starts from*: Hold, Shift and the wind call work on it directly, and the console and big screen are one tap away. If you meant the console itself embedded in the dashboard, say so (Q6). It is a much larger job.
6. **"30 minutes alone" needs a measurement, or it is only a slogan.** The plan ends with a timed script (§11) run by someone who has never seen the product, on the preview, with a stopwatch. Without it, "done" cannot be checked.

Two smaller facts the plan has to work around:
- **There is no wind-call screen** (only the banner's on/off switch). The `wind_calls` table and organiser write rights already exist, so step 2 adds the setter without a migration.
- **There is no big screen yet** (`/screen/…` is not built). The dashboard button stays disabled and says why, until Phase 6 or later builds it.

## 0. What exists today, and why it feels hard

**Two visual languages.** The organiser and admin screens use the Phase 4 `.org-console` style: 2 px black borders everywhere, extra-bold headings, black primary buttons, 48 px boxes, grey `#eee` table headers. The official screens and `/design` use the calm beach tokens the owner approved after the outdoor test: one teal accent, a 1 px soft line, 12–16 px corners, an 8-point grid and small headings. The organiser screens were never moved over. That is most of "it's hard to work with": every box shouts equally, so nothing tells the eye where to go.

**Structure.**
- `src/app/org/(console)/layout.tsx` is the header: product name, Events / Settings / Feedback buttons, org switcher, email, password, sign out.
- `events/[id]/layout.tsx` + `wizard-rail.tsx` is the left rail. It has 6 steps (Event, Divisions, Riders, Officials, Draw, Run order). The event name is a link to the dashboard, a ● or ○ marks done or not, and a bulleted list of missing items sits under each step. A `<select>` replaces the rail on a phone.
- `events/[id]/page.tsx` is the dashboard: missing list, today's timetable, now and next, and two share cards. It has no live actions.
- `lib/wizard/status.ts` + `lib/org/setup-counts.ts` work out what is missing for each step (tested in `status.test.ts`).
- The Divisions step (`divisions-manager.tsx`, `rules-panel.tsx` 676 lines, `scoring-simple.tsx`, `format-simple.tsx`) has 4 tabs (Scoring, Format, Rider label, Trick base). "Show all settings" is a checkbox. "Load a saved format…" is a full-size button beside the dials. The example sentence (`data-testid="model-sentence"`) sits in the middle of the panel.
- Riders (`rider-table.tsx`) is inline-editing cells with 2 px borders, no sticky header, no search, no bulk actions. Officials is cards. Draw and Run order are full pages of buttons (20+ `btn` each).
- `/admin` has its own header with 7 nav buttons, organisations table, org detail, presets, tricks, feedback, audit, health and settings.
- 28 `type="number"` inputs, each sized by its container (full width), with the text left-aligned.
- About 1 000 Playwright locator calls in `e2e/organiser.spec.ts`, `draw-timetable.spec.ts`, `admin.spec.ts`, `officials.spec.ts`, `riders.spec.ts` and others depend on today's test ids and accessible names.

**Keep, not rebuild:** every server action, every database function and RLS policy, `wizard/status.ts` logic, `setup-counts.ts`, the engine, the schema form's field rendering, the draw editing logic, the ladder builder's checker, the print sheets and PNG export (owner-approved in 4b), the live official screens (except the head console's division selector, step 8e).

## 1. Rules for the whole phase

1. **Restyle and regroup, don't rewrite behaviour.** Each screen keeps its server actions, data loading and `data-testid`s. A test id moves with its element. A test id is never renamed unless the element is gone, and then the spec is updated in the same commit.
2. **URLs stay.** `/org/events/<id>/event|divisions|riders|officials|draw|schedule` keep their paths (bookmarks, printed cards, e2e). Only labels change ("Run order" stays the label of `/schedule`).
3. **One token source.** Organiser screens use the same CSS variables as `/design` (`--beach-*`, `--size-*`). No new hex value appears in a component. A test keeps it that way (step 6).
4. **Tests first** for every pure function (state of a step, readiness, example sentence, number-field width, reset plan). Playwright specs are updated in the same commit as the screen they cover.
5. **Copy:** every new string goes in `ui-copy.ts`. The banned-words test is extended in step 7, **before** any screen copy is written, so new strings are checked as they are added.
6. **Each PR ends** with `npm run typecheck && npm run lint && npm test` clean and the summary lines pasted, the e2e specs it touched passing, `docs/STATUS.md` updated, and a "how to test on the preview" list in the PR.
7. **No new dependencies.** lucide-react, Radix (via shadcn), `qrcode` and `@dnd-kit` are already approved and enough.

---

## 2. Step 0 — the organiser `/design` preview (PR **7a-0**, branch `phase-7a-0-design`)

**Why first:** the owner approves the look on a laptop *and* a phone before anything is rebuilt. Changing a token after 40 screens use it is cheap. Changing a layout is not.

**Route:** `/design/organiser`, a sub-page of the existing `/design`. It is public, needs no login, is kept out of search engines ("Design preview — nothing here is live"), reads nothing from the database and saves nothing. It sits under `/design`, not under any Phase 6 route.

**Files**
- `src/app/design/organiser/page.tsx` — metadata `robots: noindex`; renders `OrganiserPreview`.
- `src/app/design/organiser/organiser-preview.tsx` — sticky bar (Daylight / Dark, Normal / Large, Menu, "Laptop / Phone" frame switch), then the sections below.
- `src/lib/org-design/fixtures.ts` — a made-up event "Preview Cup", 3 divisions, 18 riders, 5 officials, a drawn ladder (from the real ladder engine on fixture riders), a run order, a readiness list in each state. **Pure, tested** (`fixtures.test.ts`): the ladder is a valid `DivisionDraw`, the readiness list has each of the three states, the sentence is the real `scoringSentence` output.
- The new shared components, built here for real and reused unchanged in 7a-1 (they *are* the deliverable, not mock-ups):
  - `src/components/org/app-shell.tsx` — top bar + left rail + content column (props, no data fetching).
  - `src/components/org/step-rail.tsx` — steps with a state pill and a one-line reason.
  - `src/components/org/status-pill.tsx` — icon + word, three tones (done / attention / not started) plus live / held. Reuse `components/live/pill.tsx` if its API fits. Otherwise this wraps it.
  - `src/components/org/button.tsx` — `primary | secondary | quiet | danger`, `disabledReason` prop (step 6).
  - `src/components/org/number-field.tsx` — step 8b.
  - `src/components/org/setting-row.tsx` — label, "?" with example, the control, one-line explanation (step 3).
  - `src/components/org/settings-panel.tsx` — Simple area, live sentence, one "Advanced" fold, the small "Load…" menu.
  - `src/components/org/data-table.tsx` — sticky header, search, filter chips, tick-box column, bulk bar, empty state (step 4).
  - `src/components/org/step-footer.tsx` — Previous / Next (step 8a).

**Sections on the page (each with a "Laptop" 1440 × 900 frame and a "Phone" 390 × 844 frame):**
1. **Event set-up shell**: top bar + rail with all seven steps in mixed states, the Riders step open behind it.
2. **Dashboard**: readiness checklist (two green, two amber, one grey), Now / Next card with the live timer read from a fixed fake server time, wind call, quick actions, share cards.
3. **Dense table**: 18 riders, sticky header, search, a filter, three ticked rows and the bulk bar, one row in edit mode, the empty state underneath.
4. **Settings panel, Simple**: the Scoring tab of a division. Best N of M, judges, how scores combine, Impression on/off and scale. The live sentence "Best 3 of 7 attempts + Impression 0–10, 3 judges averaged" stays on screen. "Load…" is a quiet button.
5. **The same panel, Advanced open**: the fold opened, the Simple dials still on top, the sentence still visible.
6. **Buttons and pills**: primary / secondary / quiet / danger, each also disabled with its reason visible. Every status pill.
7. **Number fields**: 1-, 2- and 3-digit fields and a decimal, side by side with today's look for comparison.

**Tests first**
- `src/lib/org-design/fixtures.test.ts` (above).
- `src/components/org/number-field.test.ts` — width-from-range function (step 8b).
- `e2e/design-organiser.spec.ts` — the page loads signed out. At 1440 × 900 the dashboard's readiness list and Now / Next are visible without scrolling. At 390 × 844 the rail turns into the step picker and nothing scrolls sideways. Each status pill has a word (not colour only). Every disabled button has a visible reason. Text contrast is ≥ 7:1 in both themes (reuse the check from `theme-tokens.test.ts`).

**Done means (check on the preview)**
- Open `<preview>/design/organiser` on a laptop and on your phone. Without signing in, you see the seven sections above.
- Switch Daylight / Dark and Normal / Large: everything stays readable.
- You can say "yes, build it like this" or list changes. **Nothing else in 7a starts before that.**

Estimate: **4–5 h.**

---

## 3. Step 1 — information architecture: one shell, one rail (PR **7a-1**)

**Event shell**
- **Top bar** (one line, 48 px): product name (to `/org`), organisation switcher (only when the person has several, as today), **event name**, dates in words ("10–12 Oct 2026"), Draft / Published / Live pill, **Public link** (a quiet button: copy + QR in a popover), Note (feedback), account menu (Set or change password, Daylight / Dark, Normal / Large, Sign out, and for platform admins "Sendbook admin ↔ Organiser view"). Outside an event (the events list, Settings, Feedback) the event part is empty.
- **Left rail** (240 px, sticky): the steps in order — **1 Event · 2 Divisions · 3 Riders · 4 Officials · 5 Draw · 6 Run order · 7 Go live**. "Go live" is the dashboard (`/org/events/<id>`), now last instead of hidden behind the event name. Each step shows:
  - a state pill: **Done** (check) / **Needs attention** (triangle) / **Not started** (empty circle);
  - **one line** of reason, the first missing item, e.g. "Pro Men has no riders", or "2 more" when there are several. The full list is at the top of that step's page, not in the rail.
- **Phone:** the rail becomes the step picker at the top (today's `<select>`, restyled) with the state word in each option. Previous / Next sit at the foot of every step.
- **Admin shell:** `/admin` uses the same `AppShell`. Its rail holds Organisations · Presets · Trick proposals · Feedback · Audit · Health · Platform settings. Its top bar shows "Sendbook admin" and the switch to the organiser view. The yellow "Viewing as Arrow" banner stays above the top bar.

**State rule (tests first, `src/lib/wizard/status.test.ts`)**

Extend `StepInfo` with `state: "done" | "attention" | "not_started"` and `reason: string | null`:
- **not_started**: nothing entered for that step (no divisions; no riders in any division; no seats; no draw in any division; no plan).
- **attention**: something entered but a missing item remains (today's `missing` list is non-empty).
- **done**: `missing` is empty and something is entered.
- **Go live**: done when the readiness checklist (step 2) is all green. Attention otherwise, with the first red item as its reason. Not started until the Draw step has started.
- `reason` = first `missing` line, plus " (+N more)" from copy.

Table-driven tests: one case per step per state, plus the reason with 1 and 3 missing items. The existing `missing` tests stay unchanged.

**Files**
- `src/app/org/(console)/layout.tsx` → uses `AppShell` (top bar only). The header buttons Events / Settings / Feedback move into the account menu and the rail's "Organisation" group (events list, Settings, Feedback) when no event is open.
- `src/app/org/(console)/events/[id]/layout.tsx` → passes the event and steps to `AppShell`. `wizard-rail.tsx` is replaced by `components/org/step-rail.tsx` (delete the old file).
- `src/lib/wizard/status.ts` → `state`, `reason`, the `golive` step.
- `src/app/admin/layout.tsx`, `admin-nav.tsx` → `AppShell` with the admin rail (delete `admin-nav.tsx` once unused).
- `src/app/globals.css` → `.org-console` keeps only print rules and the 7:1 contrast floor. Everything else comes from the beach tokens. The `.btn` / `.panel` / `.help-btn` classes are kept as thin aliases until the last screen moves, then deleted in 7a-2.

**Done means**
- Open any event: the rail shows seven steps, each with a pill word and one line. Open the Demo event: Event Done, Divisions Done, Riders Done, Officials "Needs attention" with a reason, etc.
- Click Go live: the dashboard opens with Go live highlighted in the rail.
- `/admin` has the same top bar and rail look. "Viewing as …" still shows.
- On a phone: the step picker shows the state words and nothing scrolls sideways.

---

## 4. Step 2 — the dashboard is the control page (PR **7a-1**)

**Layout (laptop: two columns; phone: one column in this order)**
1. **Readiness checklist.** One row per check, each a pill + sentence + a "Fix" link to the right step:
   - Riders confirmed per division ("Pro Men: 14 riders confirmed").
   - Judges per division vs the scoring rules' minimum ("Pro Men: 3 of 3 judges").
   - Draw locked per division.
   - Run order active for today.
   - PINs issued: every active seat has a stored PIN ("2 seats have no PIN — Regenerate PIN"; seats made before PIN encryption show here).
   - All green → "Ready to run" in the accent colour.
2. **Now / Next.** Running heat with the server-time timer (`use-server-clock`, read-only, 48 px allowed here, as on the head console), the next heat with its estimated start, and the heat after it.
3. **Wind call.** Red / Amber / Green and an optional message. Writes a `wind_calls` row (organiser insert already allowed by RLS; add an RLS test that confirms it and that an anonymous visitor cannot). The current call is shown as a pill + word.
4. **Quick actions.** Each button is a server action that already exists:
   - **Hold** / **Resume at…** (`set_plan_hold`).
   - **Shift +5 / +10** (the plan actions in `src/lib/live/plan-actions.ts`, already used by the Run order page).
   - **Open head judge console** (`/head/<eventId>`, new tab).
   - **Big screen** (disabled: "The big screen comes with the public pages").
   - **Reset event…** (step 8d) at the end, as a quiet danger button.
   - Every one of them is disabled with a reason when it cannot run (no active plan, nothing running…).
5. **Today's timetable** (compact, existing rows, now styled as a dense table).
6. **Share cards.** Officials' join link and public event page (existing `ShareCard`, restyled), plus "Print official cards" (existing route).

**Tests first**
- `src/lib/org/readiness.ts` + `readiness.test.ts`: input = setup counts + seats + plans. Output = ordered checks `{ id, state, sentence, fixHref }`. Cases: empty event, one division short of judges, draw drawn but not locked, two seats without PIN, all green.
- `setup-counts.ts` gains `seatsWithoutPin` and `confirmedByDivision` (already there as `ridersByDivision`).
- `e2e/organiser.spec.ts`: the dashboard tests keep their ids (`dashboard`, `dashboard-missing` → now the checklist, `dashboard-now`, `dashboard-next`, `share-join`, `share-public`). New: set a wind call and see it, Hold then Resume on the Demo event, a disabled button shows its reason.

**Done means**
- On the Demo event the checklist shows each check with a word and a Fix link that opens the right step.
- Set Amber "Briefing 10:00": the pill shows Amber with the message.
- Hold → the timetable says held; Resume at 15:00 → times move.
- With no run order active, Hold is disabled and says why.

---

## 5. Step 3 — the settings pattern (PR **7a-1**)

Applies to: Event step, Divisions (Scoring, Format, Rider label, Trick base), division live settings, organisation settings, platform settings.

**Pattern (`SettingsPanel` + `SettingRow`)**
- **Simple by default.** Only the dials listed in docs/06 decision 32 (and the Event step's name, dates, place, time zone, Lycra yes/no, what spectators see). Each is a `SettingRow`: plain label, the control, one line of explanation under it, a "?" (tap) that adds one example sentence.
- **Advanced** behind one fold at the bottom ("More settings (12)", with the count). Opening it keeps Simple on top (decision 36). Its open or closed state is remembered per device.
- **Presets**: a quiet **"Load…"** button in the panel header, opening a small menu ("Built-in", "My organisation's"). It never sits in the dial area. "Save as preset…" sits in the same menu.
- **The live sentence** sits in a sticky strip at the top of the panel ("Best 3 of 7 attempts + Impression 0–10, 3 judges averaged"). It stays visible while scrolling through Advanced and updates on every change (`aria-live="polite"`). The Format tab's sentence is "Knockout, heats of 4, top 2 advance, final of 4 — 14 riders: 4 rounds, about 2 h 40".
- **Locked divisions:** the whole panel is read-only with one banner and an "Unlock with a reason" button (existing action). Controls never just look disabled.

**Files**
- `divisions/rules-panel.tsx` split into `scoring-panel.tsx` and `format-panel.tsx` on top of `SettingsPanel` (676 lines today, with two copies of the "Show all settings" checkbox). The existing `scoring-simple.tsx`, `format-simple.tsx` and `per-round-lengths.tsx` become the Simple content. `schema-form.tsx` becomes the Advanced content, restyled only.
- `events/event-form.tsx` (390 lines) → Simple: name, dates, place, time zone, "Will riders wear coloured lycras?", what spectators see. Advanced: logo and sponsors, registration, ready-call minutes, per-division identification switch, wind banner, slug.
- `org/settings/settings-form.tsx`, `admin/settings/settings-form.tsx` → same rows (no Advanced needed).

**Tests first**
- `src/lib/settings/simple-fields.ts` + test: the list of Simple field paths per panel is exactly decision 32's list. Every Simple field has a label, an explanation and a `help` entry with an example (fails if a "?" would open nothing).
- The sentence functions already exist (`scoringSentence`, `panelSentence`, the format preview). Add cases only for the Format sentence's new "about 2 h 40" part.
- e2e: `model-sentence` stays visible after opening Advanced and scrolling to its bottom (bounding box inside the viewport). "Load…" opens a menu, not a panel.

**Done means**
- Open Divisions → Pro Men → Scoring. You see 5–6 dials, each with a line under it and a "?". The sentence is at the top.
- Change "best 3" to "best 2": the sentence changes at once.
- Open "More settings": everything else appears below and the sentence stays in view while you scroll.

---

## 6. Step 4 — tables (PR **7a-2**)

Riders, officials, organisations (admin), feedback (org and admin), audit, events list.

**`DataTable` behaviour**
- Rows 40 px (Q2), sticky header, zebra-free, 1 px lines, numbers right-aligned in tabular digits.
- **Search** (name, email, bib) and **filter chips** (division, status, role).
- **Tick-box column** + a **bulk bar** that appears when something is ticked:
  - Riders: Set status, Move to division, Delete.
  - Officials: Print cards, Regenerate PINs, Add to panel.
  - Feedback: Set as done.
  - Organisations: Archive.
  - Every bulk action asks once and names the count ("Regenerate PINs for 3 seats?").
- **Inline editing**: today's `Cell` (save on blur / Enter) inside the new row style, with a saved tick for 2 s.
- **Empty states** say what to do next: "No riders in Pro Men yet. Add one below, paste a list, or open registrations."
- **Import** and **Print** are quiet buttons in the table header, never primary.

**Officials** becomes a table (name, role, panels as small pills, PIN state, last seen, row menu with Show PIN / Regenerate / Delete). The PIN box (`pin-box.tsx`) opens in a dialog straight after creating a seat (decision 9 unchanged). The panel tick grid stays below the table.

**Tests first**
- `src/lib/table/filter.ts` + test: search across fields, ignoring accents and case ("Jose" finds "José"); filters combine with AND; ticked rows outside the filter stay ticked but are counted separately ("3 selected, 1 hidden by the filter").
- Bulk server actions reuse the existing single-row actions in a loop inside one server action, which reports "3 changed, 1 refused: Red is in a started heat". No new database function.
- e2e: `riders.spec.ts` and `officials.spec.ts` updated. New: search narrows rows, tick 2 and set status, the empty state's text.

**Done means**
- Riders on the Demo event: type "ma" in search and the rows narrow. Tick two riders, Set status → Withdrawn, both change.
- The header stays on top while you scroll 20 riders.
- An empty division tells you what to do.

---

## 7. Step 5 — Draw and Run order: the ladder and the timetable are the hero (PR **7a-2**)

- **Draw:** division tabs at the top. The ladder (existing `ladder.tsx`) fills the page. A **quiet toolbar** above it holds Generate / Regenerate, Lock / Unlock, Print, Export PNG, "Show checks". **Checks and warnings** go in a **side panel on the right** (below on a phone), exactly as in the custom ladder builder. Seat menus stay as they are. Each of the 20 buttons becomes either a toolbar item or a menu item.
- **Run order:** the timetable (the right column today) becomes the main area, full width. "Heats not yet in the plan" collapses into a side panel that opens with a count ("12 heats not planned"). Hold / Shift / Activate / Duplicate plan go in the quiet toolbar. Projected finish and heats left sit in the toolbar as text.
- No change to drag, tap-to-move, ↑ ↓, pins, PDF / PNG. Restyle and regroup only.

**Tests first:** no new pure logic. `e2e/draw-timetable.spec.ts` updated to the new positions. One added assertion: at 1440 × 900 the first round of a 14-rider ladder is visible without scrolling.

**Done means:** open Draw. The ladder is the first thing you see, the buttons are one quiet line, and warnings are on the right. Open Run order: the timetable fills the page and the unplanned heats open from the side.

---

## 8. Step 6 — consistency (PR **7a-1** for the parts, **7a-2** for the sweep)

- **Tokens and spacing:** `/design`'s variables everywhere. Spacing comes from the 8-point scale only (Tailwind `gap-2/4/6/8`, `p-2/4/6`), corners 12 px for cards, 8 px for controls.
- **One button hierarchy:** per screen exactly one **primary** (teal fill), **secondary** (1 px border), **quiet** (text with icon), **danger** (red text and border, only for destructive actions).
- **Status pills** with icon + word everywhere a state is shown (steps, seats, heats, notes, organisations). No bare ● / ○.
- **No decorative headers:** page title 20 px semibold, section headings 14 px, no full-width heading blocks, no `text-3xl font-extrabold`.
- **Forms:** two columns at ≥ 1024 px, one column below. Label above control.
- **Every disabled control explains itself:** `Button` has a required `disabledReason` when `disabled`, shown as a line under the button (not only a tooltip, which a tap cannot open).

**Tests (7a-2, after the sweep)**
- `src/components/org/consistency.test.ts`: scans `src/app/org`, `src/app/admin`, `src/components/org` for raw hex colours, `border-2 border-[#111]`, `font-extrabold`, `text-3xl`, and `<button … disabled` without `disabledReason` (the same file-walk style as `ui-copy.test.ts`). Allowed: print files.
- e2e: on each step, at most one primary button is visible (`[data-variant=primary]` count ≤ 1).

**Done means:** every organiser and admin page looks like the preview. A disabled button anywhere has a sentence under it.

---

## 9. Step 7 — copy (PR **7a-1**, first commit)

- All new labels, explanations, examples, reasons, empty states and pill words go in `ui-copy.ts`, in new groups `shell`, `readiness`, `quickActions`, `table`, `reset`, `landing` (rewrite), `headDivision`.
- **Extend `BANNED`** in `src/lib/ui-copy.test.ts` with `configure|configured|configuring|configuration|entity|entities|record|records|RPC`.
  - `recorded` is included too: it reads like jargon in "(recorded)" asides. Q8 lets you keep it.
  - **Existing strings that will fail and must be rewritten in the same commit** (found today): `ident.kiteFields` ×2 ("Kite details to record"), `divisions.lockBanner` ("(recorded)"), `admin … none` ("Nothing recorded yet"), `riders.declineReason` ("for your own records"), `feedback.exportHelp` ("The date is recorded"), `officials.deleteQuestion` ("stay in the record"), `headLive.pastCapNeedsReason` ("is recorded"), and two admin health strings with "configuration" ("Server configuration", "check the server configuration").
  - Proposed words: "saved", "kept", "Kite details to ask for", "Server settings".
  - The TypeScript type `Record<…>` is not a user string and the test already ignores it. Add a test case that proves it.
- Plain words: "Go live", "Needs attention", "Not started", "Ready to run", "Fix", "More settings", "Load…".

**Done means:** `npm test` passes with the new words banned. Search the preview for "configure", "record" or "RPC" and nothing shows.

---

## 10. Step 8 — the owner's feedback

### 8a. Previous / Next at the foot of every set-up step (7a-1)
- `StepFooter`: "← Previous: Divisions" (secondary) and "Next: Officials →" (primary). It sits on steps 1–6. Go live has only Previous.
- Steps save as you go (unchanged). The Event form has a Save button today: **Next saves the form first**. If saving fails, Next stays on the page and shows the error.
- On a phone the footer is sticky at the bottom.
- e2e: click Next five times from Event and land on Run order.

### 8b. Number inputs sized to their content, digits centred (7a-1, all 28 places)
- `NumberField`: width = digits of the largest allowed value (+ decimal places + 1 for a minus) in `ch` units, plus padding. Never full width. Text centred, tabular digits, 16 px semibold (Normal) / 18 px (Large). Same height as other controls. `inputMode="numeric"` or `"decimal"` so phones open the number keyboard.
- Tests first, `number-field.test.ts`: max 9 → 1 digit; max 30 → 2; 0–10 step 0.5 → "10.5" → 4; max 999 → 3; negative minimum adds 1.
- Replace all 28 `type="number"` in `schema-form.tsx`, `rider-table.tsx`, `ladder-builder.tsx`, `custom-builder.tsx`, `format-simple.tsx`, `scoring-simple.tsx`, `rules-panel.tsx`, `per-round-lengths.tsx`, `schedule-manager.tsx`, `event-form.tsx`. Leave `live/practice-panel.tsx` (official screen, has its own sizes).
- The consistency test (step 6) fails on any `type="number"` outside `number-field.tsx`.
- **Done means:** on Divisions → Format, "Riders per heat" is a small box with "4" in the middle.

### 8c. The landing page `/` — three doors (separate tiny PR 7a-3, see Q3)
- Product name (and the platform logo if set), then three equal buttons:
  - **Admin** → `/org/login?next=/admin`.
  - **Organiser** → `/org/login`.
  - **"I'm an official — enter the event"** → `/join` (event code + PIN, existing page).
- No event list, no tagline block. The legal link stays in the footer.
- The public event page stays reachable by its own link and `/o/<org>`.
- This **reverses** the 4a-1c decision "the home page lists published events". Write that into docs/06.
- e2e `smoke.spec.ts` / `admin.spec.ts`: landing shows exactly three links with those names. Tests that expect the events list on `/` are rewritten to use `/o/<slug>`.

### 8d. Reset event (7a-2; its own migration)

**What it does** (owner's words, made exact):
- **Wipes, for every heat of the event:**
  - `trick_attempts`, `trick_scores`, `impression_scores`, `penalties`, `attempt_flags`, `judge_sheets`, `heat_decisions` (tie decisions), `heat_results`;
  - on `heats`: `started_at`, `paused_at`, `paused_total_sec`, `ended_at`, `published_at`, `reopened_at`, `publish_hold`, `public_live` (back to null = follow the setting), and the status back to `scheduled`;
  - on `heat_slots`: `place`, `total`, `breakdown`, `flagged_out`, and the DNF / DSQ modifiers set by the head judge (DNS walkovers from withdrawals stay, see below);
  - on every `schedule_plans` row: `actual_starts` and `hold`.
- **The ladder:** each division's `draw` is set back to the copy taken at lock time (`divisions.draw_at_lock`, new column). Rounds after Round 1 are re-projected with empty seats ("1st H1" placeholders). Round 1 keeps its locked riders.
- **Re-run heats:**
  - The re-run heat is deleted, with its run-order item.
  - The original heat gets its draw id back and returns to `scheduled`.
  - A *cancelled* heat that was never re-run also returns to `scheduled`.
- **Stays:** sensor bindings (they are the rider's device, not a reading), riders, entries (including withdrawals made after the lock, shown as DNS walkovers as today), officials and PINs, divisions, scoring and format, run order items and anchors, event settings, wind calls, the audit log.
- **Refused while** any heat is running or paused ("Heat 3 is running. End it first.").
- **Who:** organisers of the event's organisation and platform owners. Staff only inside "Open as this organiser", as for event delete.
- **Confirmation:** type the event's web address (slug) exactly, then one confirmation that says what will be wiped, with counts ("12 heats, 214 attempts, 9 published results").
- **One audit line** `event_reset` with the counts and, for a platform owner, their role.
- **Snapshot:** every wiped row (and the pre-reset `draw` of each division) goes as JSON into `event_reset_snapshots (id, event_id, taken_at, taken_by, expires_at = taken_at + 30 days, payload jsonb, restored_at)`. RLS: readable by the event's organisers and platform owners, writable only by the functions.
- **Restore** (platform owner only, /admin → the event's row menu → "Restore results from <date>"):
  - Allowed only while no heat of the event has started since the reset, and before `expires_at`.
  - Puts every row back and writes one audit line `event_reset_restored`.
  - **Expired snapshots** are deleted by the next reset or restore call, and by `/admin/health` when it loads. No scheduled job needed. Q5 covers the alternative.

**Database (`supabase/migrations/2026100z_phase7a_reset.sql`)**
- `alter table divisions add column draw_at_lock jsonb`. Hidden from the public role and from other organisations, like `draw`.
- `lock_division_draw` writes `draw_at_lock := draw`. `unlock_division_draw` clears it. `save_division_draw` while locked is already refused.
- **Backfill** for divisions locked today: a one-off server script `scripts/backfill-draw-at-lock.ts` (service key). It takes the current `draw` and applies the engine's `unpublishHeat` to every published heat of the division, newest `published_at` first. It writes `draw_at_lock` only if the result has no `downstream_started` conflict, and it logs any division it could not rebuild. Reset refuses those divisions ("Pro Men's locked draw could not be rebuilt — ask the platform owner").
- `public.reset_event(p_event uuid, p_slug text, p_draws jsonb)` (security definer, all in one transaction):
  - the checks above;
  - the snapshot;
  - the wipes, with the `decisions_append_only` trigger bypassed by a transaction-local setting, as `draw_bypass` does today;
  - the draw reset, then the heat projection rebuilt from `p_draws`;
  - the audit line.
  - It returns the counts.
- The new heat projection is computed in TypeScript (`drawProjection`, existing). The action passes it in, and the function checks that it matches `draw_at_lock` (same heat ids, same Round 1 riders) before writing. Same pattern as `save_division_draw`.
- `public.restore_event_reset(p_snapshot uuid)` (platform owner only).
- `revoke … from anon`, `grant … to authenticated`. `npm run db:types` after.

**Tests first**
- `src/lib/reset/plan.ts` + `plan.test.ts` (pure):
  - given a locked draw, published heats and re-runs, it produces the target draw, the heat projection and the counts;
  - unpublishing three published heats of a KOTA 18-rider ladder in reverse order gives back exactly the draw at lock;
  - a re-run maps back to its original;
  - withdrawals after the lock survive.
- `tests/rls/reset.test.ts`:
  - an organiser of another organisation, staff outside impersonation, and anon are refused;
  - a wrong slug is refused;
  - a running heat refuses;
  - after reset every listed table is empty for the event, riders, seats and plans are unchanged, and one audit line exists;
  - restore by an owner brings back the exact rows; restore by an organiser is refused; restore after a new heat started is refused; restore after 30 days (`expires_at` set in the past) is refused.
- `e2e/event-reset.spec.ts` on a ledger event: run a practice heat, publish, reset, see Round 1 riders and empty later seats.

**Done means**
- On a test event, publish a heat, then Reset event: type the address, confirm. The ladder shows Round 1 riders and empty later seats. Riders and officials are still there.
- In /admin, Restore brings the result back.
- While a heat is running, Reset is refused with the heat's name.

### 8e. Head judge console: one division at a time (7a-2)
- A **division selector** in the console header: tabs on a laptop, a dropdown on a phone.
- **Default** = the division with a running or paused heat, else the division of the next heat on the run order.
- Each tab of a division with a running heat other than the shown one has a **live dot + "Live"** (never colour alone).
- The choice is **remembered per device** (`localStorage`, key per event, wrapped in try/catch), but a newly started heat in another division does not switch it by itself. The live dot tells.
- **"All divisions"** appears only for organisers (`viewer.kind === "organiser"`). It is today's behaviour: every heat in the run-order list.
- The selector **filters** the run-order list and "Next"; it does not change who can do what.
- Files:
  - `src/components/live/head-page.tsx`: the `selected` / `shownId` logic gains a division filter.
  - new `src/lib/live/division-pick.ts` + `division-pick.test.ts`, the pure default rule: running wins; paused next; else next on the plan; else the first division; a stored choice that no longer exists falls back.
  - `head-console.tsx` header.
- e2e `live-console.spec.ts`: two divisions; start a heat in B while A is shown; A stays, B's tab shows "Live".
- **Done means:** on the head console with two divisions you see one division's heats. Start a heat in the other and its tab shows a live dot and "Live". Reload and your choice is kept.

---

## 11. The 30-minute acceptance script (end of 7a-2)

Someone who has never seen the product, alone, on the preview, with a stopwatch:
1. Sign in → new event "Test Open", Cairo, 2 days.
2. Two divisions with default scoring and a knockout.
3. Paste 16 riders into one division and 8 into the other.
4. Three judges, a head judge and a spotter. Panels ticked.
5. Draw both, lock both.
6. Build today's run order, activate it.
7. The dashboard reads "Ready to run".

**Pass:** under 30 minutes, without asking anyone. Write down every place they hesitated more than 20 seconds; each one is a bug for 7a-2's last commit. Record the time in STATUS.md.

---

## 12. Open questions (my recommendation first)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Reset wipes results riders and spectators may have seen. Allow it on any event? | **Allow, but** when any result was ever public (published and not held), also ask for a written reason (≥ 5 characters, in the audit line). Simulation events skip the typed address (they are practice). Do not show a public "results were reset" notice. |
| Q2 | Size on organiser screens: decision 17's 48 px or /design's compact sizes? | **40 px controls and rows on a computer, 44 px on a touch screen** (`@media (pointer: coarse)`), and the Large switch gives 48. Dense tables are impossible at 48 px, and a laptop mouse doesn't need it. Replaces decision 17. |
| Q3 | The landing page `/` is public, and Phase 6 runs in parallel. Who changes it? | **Its own tiny PR 7a-3, opened after Phase 6 merges**, so the two never edit `src/app/page.tsx` at the same time. If Phase 6 doesn't touch `/`, it can ship with 7a-1. |
| Q4 | Removing the event list from `/` hides events from people without a link. OK? | **Yes, as asked**, but keep `/o/<org>` as the place to find an organisation's events. The share cards on the dashboard become the main way spectators get the link. |
| Q5 | Expired reset snapshots: delete on use, or a nightly job? | **Delete on use** (next reset, restore, or /admin/health load). No pg_cron on the free plan. A snapshot can outlive 30 days by a little, but it can never be *restored* after 30 days. |
| Q6 | Dashboard = launch page (Hold, Shift, wind, links) or the full console inside it? | **Launch page.** The console is a tested working tool. Embedding it doubles the realtime subscriptions on one page and makes a laptop screen too busy. |
| Q7 | Dark and Large on organiser screens? | **Yes, both in the account menu**, per device, same hooks as /design. Costs almost nothing because the tokens already exist. |
| Q8 | Ban "recorded" too, or only "record / records"? | **Ban all forms.** "Saved" or "kept" reads better in every current case. |
| Q9 | Reset on a division locked before 7a, whose locked draw cannot be rebuilt (a downstream conflict)? | **Refuse for that division with a sentence**, and the platform owner can unlock and re-lock it (which takes a fresh copy). Never guess a draw. |
| Q10 | Head console: auto-switch division when a heat starts elsewhere? | **No.** Live dot only. A head judge reviewing Pro Women should not lose the screen because Pro Men started. |
| Q11 | Missing owner notes 1a, 1c, 1d | **Paste them into docs/06** before 7a-0. If they conflict with this plan, they win and I amend it. |

---

## 13. Session split and hours

| PR | Branch | Contents | Hours |
|---|---|---|---|
| **7a-0** | `phase-7a-0-design` | Step 0: `/design/organiser`, the shared org components, fixtures, e2e | 4–5 h |
| **7a-1** (after 7a-0 is approved) | `phase-7a-1-shell-dashboard` | Step 7 copy + banned words first, then 1 shell and rail, 2 dashboard + wind call, 3 settings pattern on Event / Divisions / org and platform settings, 8a Previous / Next, 8b number fields; e2e updates | 10–13 h |
| **7a-2** (after 7a-1 merges) | `phase-7a-2-tables-reset` | 4 tables, 5 Draw and Run order, 6 consistency sweep + test, 8d reset + restore (migration, RLS tests, backfill script), 8e head-console division selector, §11 acceptance run | 11–14 h |
| **7a-3** | `phase-7a-3-landing` | 8c landing page (after Phase 6 merges) | 1 h |

If 7a-2 runs long, **reset (8d) moves to its own PR 7a-2b**: it is the only database change and the one that needs the most careful review. The biggest risk to the hours is the e2e updates (about 1 000 locator calls on these screens), not the components. Keeping test ids stable (§1.1) is what keeps it in budget.

## 14. Leave alone (it is fine)

- The engines (`src/lib/engine/**`) and their tests.
- Judge and spotter screens and their sizes (approved outdoors). The head console except the division selector.
- Print sheets and PNG exports of draw, run order, start list and official cards (owner-approved in 4b).
- Server actions, database functions and RLS, except the reset migration.
- The schema form's field logic (only its look changes), the ladder builder's checker and fixes, the CSV importer, the PIN encryption, impersonation, the audit log.
- `/design` (the official-screen preview): untouched, `/design/organiser` is added next to it.
- Every public route (`/e`, `/o`, `/join`, `/screen`, `/legal`) — Phase 6's.
