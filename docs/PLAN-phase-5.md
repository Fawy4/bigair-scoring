# PLAN — Phase 5: live heat operations

> Written 1 Oct 2026, before PR #8 (`phase-4b-draw-timetable`) merged.
> - It was read against that branch (migration `20261003100000`).
> - **Nothing here is built yet.** Every "today" below describes code that exists on that branch.
>
> Specs:
> - docs/06 §00, §0, §4, §5, §6, §10 and the decisions logs
> - docs/03 §3–§5, §8 and §10
> - docs/05 §5–§9 and the decisions in §12–§13
> - docs/08 §1A, §1E, §1F, §2F, §3D–§3E and §4
> - docs/11 §2–§4
>
> Where the spec and this plan differ, the owner's answers in §11 (given 1 Oct 2026) decide. 5b starts by writing them into the decisions logs of docs/03, docs/05 and docs/06.

## 0. What already exists, and what is missing

**Database (Phase 3 and 4).** These parts are already built:
- Heat statuses `scheduled|running|paused|ended|under_review|published|cancelled`.
- The trigger `private.heats_guard`. It stamps `started_at`, `paused_at`, `paused_total_sec`, `ended_at` and `published_at` from the server clock. It refuses illegal moves with `ILLEGAL_HEAT_TRANSITION`. Only privileged roles may set `published`.
- `private.heat_effective_status` treats a running heat whose time is up as `ended`.
- `add_attempt`. It handles the cap (`ATTEMPT_CAP_REACHED`), the duplicate window, `client_key` idempotency and `p_override_reason`.
- `delete_attempt`, `attempt_counts`, `submit_trick_score` / `submit_impression` (upsert with `client_rev`), `set_publish_hold` and `get_public_live_heat`.
- `live_rev`.
- The Realtime publication for heats, slots, attempts, scores, impressions, penalties, results, plans and wind calls.

**Engine.** These parts are already built:
- `computeHeat`, `rankHeat` and `explain`.
- `publishBlockers`: `score_missing`, `impression_missing` and `tie_unresolved`.
- `repeatIndexes`, `flagPossibleDuplicates`, `checkCanAddAttempt` and `applyHeatResult` / `unpublishHeat` with the `downstream_started` conflict.
- `computeTimetable`, `startHold`, `resumeHold` and `shift`.

**Missing. Phase 5 builds these:**
- **Database functions and actions:**
  - Start, pause, resume, end, review and publish. There is no RPC or action for any of them.
  - Hold, Resume at and Shift for the head judge. The head seat can only read `schedule_plans`.
  - Head-judge edits: score edit, absent, merge, attempt edit, rider status, tie decision, re-open.
  - Judge flags. `trick_scores.flag` cannot hold a flag without a score, because of the `missed ⇔ score is null` check.
  - A record that a judge has submitted their sheet.
- **Engine and libraries:**
  - Nothing writes `heat_results`.
  - The trick composer, parser and per-trick category.
  - The scoring → ladder adapter (`tieKeys`).
  - Flag-out (no `rankAt`).
- **Client and screens:**
  - Client queue, realtime hooks, server clock offset and wake lock.
  - Daylight and dark theme tokens.
  - Every official screen. `src/components/live/` is empty.

## 1. Rules for the whole phase

- **Engine stays pure.** New pure code goes in:
  - `src/lib/engine/tricks/` (composer and parser)
  - `src/lib/engine/scoring/` (adapter, flag-out, heat summary)
  - `src/lib/live/` (timer maths, queue logic, publish checklist, matrix model)
- **Tests come first:**
  - For every pure function, add the expected values to **docs/08 §1G "Live heat"** before writing the code. The values are in each step below.
  - Once they are in docs/08, they are authoritative.
- **No new packages:**
  - IndexedDB, Web Speech, Screen Wake Lock and `fetch` are browser built-ins.
  - `@dnd-kit` is not used on official screens (rule 00.3: taps only).
- **Wording:**
  - Every string lives in `src/lib/ui-copy.ts`, in new sections `design`, `heatControl`, `spotter`, `judge`, `head` and `publish`.
  - The banned-words test still applies: no "chip", "vest" or "mark".
  - Do not show `explain()` lines on screen, because they say "marks". Use a copy-file renderer of the breakdown instead.
- **Database writes:**
  - Every write that changes data is a SQL function. It runs as the caller (RLS decides) unless it must cross seats. Then it is `security definer` and checks the role itself.
  - Every function writes `audit_log`, with a reason when the spec asks for one.
  - Error codes are UPPER_SNAKE. `src/lib/live/errors.ts` maps each code to a plain sentence in ui-copy.
- **Server time is truth.** No action uses `new Date()` for a heat or plan timestamp.
  - Today the organiser's Hold / Resume / Shift buttons in `schedule-manager.tsx` (lines ~430–439) use the device clock. Step 1 moves them to the server.
- **After every migration:**
  - Run `npm run db:apply` and `npm run db:types`.
  - Add RLS tests in `tests/rls/live-*.test.ts`.
- **Before each PR:**
  - `npm run typecheck && npm test && npm run lint`, then `npm run test:rls`.
  - Run the Playwright specs of that PR.
  - Update the STATUS.md section.

## 2. Step 0 — the `/design` preview page (PR 5a, branch `phase-5a-design`)

Goal: the owner approves the look on a phone outdoors before any live screen exists (rule 00.8). The page is built only from the **real, presentational** components that the live screens will import later. Those components take props and fetch no data.

**Files**

- **Theme tokens.** Edit `src/app/globals.css`.
  - Add `.beach-day` (default) and `.beach-dark` token sets: background, ink, muted ink (contrast ≥ 7:1, never light grey), border, focus ring, live, pending, failed, crash, outlier, missing and selected.
  - Add the official-screen base sizes: pad buttons ≥ 56 px with 8 px gaps, pad digits ≥ 28 px bold, rider names ≥ 20 px and the timer ≥ 48 px.
  - Edit `tailwind.config.ts` to map the tokens.
- **Theme switch.** Create `src/components/live/theme-switch.tsx`: Daylight / Dark, per device, stored in `localStorage` inside try/catch.
- **New components in `src/components/live/`.** All presentational, all strings from `copy.design` / `copy.judge` etc.

  | Component | What it shows |
  |---|---|
  | `rider-tile.tsx` | Wraps the existing `RiderLabel` and adds an "n / max" counter, the selected border, the "Out of attempts · 7 / 7" grey state and an optional photo |
  | `heat-timer.tsx` | Takes `remainingMs`, `state` (running / paused / ended / held). Shows mm:ss in large type and the word "Paused" or "Time up" (never colour alone). Has a "Sound on / off" toggle (wired in 5b) |
  | `connection-badge.tsx` | "Synced", "Pending 2" or "Offline", each with an icon and a word; "Failed — tap to retry" |
  | `saved-banner.tsx` | The persistent "Saved 7.5 — RED — attempt 4" confirmation |
  | `score-pad.tsx` | One scale, tap to set, snaps to the step |
  | `criteria-rows.tsx` | One `score-pad` per criterion on its own scale, a "?" help and the live computed trick score |
  | `attempt-card.tsx` | Label, number, trick, Landed / Crashed badge, Repeat badge, the Missed and Flag buttons and the pad slot |
  | `trick-builder.tsx` | One block row per single-choice family, toggles for add-ons and grabs, the composed name and category, a text field and a mic button (visual only here), CRASH and Log |
  | `result-row.tsx` | Place, label, the formula in words ("31.54 = tricks 24.04 + Impression / Variety score 7.50"), counted tricks highlighted, CRASH in red with its word |
  | `head-matrix.tsx` | Attempts × judges, the panel score column, and grey / amber / struck-through / "missed" cells, each with a word or icon |

- **Fixture data.** Create `src/lib/live/design-fixtures.ts`. It holds fictional riders and the docs/08 §1A numbers for the matrix and result row (31.54, 78.85 %), so the owner sees real values.
- **The page.** Create `src/app/design/page.tsx`.
  - Public, `noindex`, no login.
  - Sections: rider labels under three schemes (lycra per heat, bib, name call-out), timer in all four states, judge card (single pad and criteria), spotter builder, result row, head matrix.
  - A sticky Daylight / Dark switch.
  - "Approve" is outside the app. The owner replies on the PR.

**Database:** none.

**Tests first:**
- Unit tests for the step snapping and range limits of `score-pad`: 8.55 on step 0.1 is refused, as in docs/08 §1F.
- A unit test for `inkFor` / outlined white and black lycras. It already exists; extend it to dark mode.
- The banned-words test already covers the new files.
- A Playwright check at 390 × 844:
  - Every tap target on `/design` is ≥ 56 px in the pad areas and ≥ 48 px elsewhere.
  - The timer font is ≥ 48 px.
  - Nothing scrolls sideways.
- An axe-free contrast check, written as a small pure function over the token hex values: every text/background pair is ≥ 7:1 in both themes.

**Done means (phone, outdoors):**
- On `<preview>/design` in full sun, you can read the timer and the rider label from arm's length.
- Every colour also has its name.
- The pads can be hit with a thumb without zooming.
- Dark mode works.
- The owner writes "approved" (or the changes) on the PR. 5b does not start until then.

## 3. Step 1 — heat state machine and timer (PR 5b)

### Database (`supabase/migrations/2026100x_phase5b_live_heat.sql`)

All new functions are `security definer` and check the role themselves. "Head" means a head seat of the event or an organiser of the event (docs/05 decision 20).

| Function | Rule |
|---|---|
| `server_now()` | Returns `now()`. Used for the clock offset |
| `start_heat(p_heat)` | Head only. Refused with:<br>• `DRAW_NOT_LOCKED` when `divisions.draw_locked_at is null`<br>• `PANEL_TOO_SMALL` when the panel has fewer members than the resolved model's `panel.minJudges`<br>• `SEATS_NOT_FILLED` when a slot still waits for a place ("1st H1")<br>• `HEAT_ALREADY_RUNNING` when the event already has `events.settings.maxRunningHeats` (new, default 1) heats running or paused<br>Then it sets `status = 'running'`, and the trigger stamps `started_at`. Audited |
| `pause_heat`, `resume_heat` | Head only. Status change; the trigger handles the timestamps |
| `end_heat(p_heat)` | Head only, from running or paused |
| `end_heat_if_due(p_heat)` | Any seat of the event. Ends the heat **only** when `private.heat_effective_status` says `ended`, and is idempotent. Every official device calls it when its timer reaches 0, so "end at zero" needs no cron and no trusted client |
| `cancel_heat(p_heat, p_reason)` | Head only. Reason required. Audited. A started heat keeps `started_at` and gets `ended_at`. For a heat that must be ridden again, use "Re-run heat" (step 4) |
| `set_plan_hold(p_plan, p_hold jsonb, p_reason)`<br>`set_plan_anchors(p_plan, p_anchors jsonb, p_reason)` | Head or organiser. They change only `hold` and `anchors` of the **active** plan. Audited. The server action computes the values with the pure `startHold` / `resumeHold` / `shift` using `server_now()` |
| `private.division_model_setting(p_division, p_path text[])` | Generalises `division_heat_setting` to any path in the merged model, e.g. `{panel,minJudges}` |

New columns:
- `events.settings.maxRunningHeats` (Zod default 1, with a "?" in the Event step).
- `heats.reopened_at timestamptz null` (used in step 5).

RLS: no new table rights. All writes go through the functions above.

**Actual start (owner, §11.1): the heat row is the truth.** Start does not copy anything into the plan. `SchedulePlanSchema` forbids actual starts on heat items on purpose, and `computeTimetable` already reads `heats.started_at` / `ended_at` through `buildHeatModel`, so the run order re-flows the moment `started_at` is stamped. docs/05 §7 "update schedule_plans.actual_starts/ends" is satisfied by the heat row; 5b corrects that sentence in docs/05.

### Pure code (tests first, docs/08 §1G)

`src/lib/live/timer.ts`:
- `clockOffset(sentAt, serverNow, receivedAt)` returns `serverNow − (sentAt + receivedAt) / 2`.
- `remainingMs(heat, nowServer)` returns `duration − (now − started − pausedTotal − (paused ? now − pausedAt : 0))`, floored at 0.
- `formatClock(ms)` returns `m:ss`.

Test values:
- **Running:** duration 600 s, started 10:00:00, paused 10:03:00–10:04:30 (`paused_total_sec` 90), now 10:06:00 → **330 s, "5:30"**.
- **Device clock 40 s fast:** offset −40 s → same 5:30.
- **Paused:** paused at 10:03:00, now 10:03:40 → frozen at **420 s, "7:00"**.
- **Time up:** now 10:11:31 with 90 s paused → **0, "0:00"**, and the status is effectively ended.

### Server actions and screens

- `src/lib/live/heat-actions.ts`: `startHeat`, `pauseHeat`, `resumeHeat`, `endHeat`, `cancelHeat`, `holdPlan`, `resumePlanAt`, `shiftPlan`. They return `{ok} | {ok:false, code, message}`.
- `src/components/live/heat-control.tsx`: the left column of the head console (run order with states and the buttons). It is reused in step 4.
- In 5b it is mounted on a minimal `/head/[eventId]` page, so the spotter and judge flows can be tested end to end. It works on a phone from the start (owner, addition A; see step 4).
- **Timer sounds (owner, addition B).** `src/lib/live/timer-cues.ts` (pure) and `src/lib/live/beep.ts`:
  - `timerCues(prevRemainingMs, remainingMs)` returns `one_minute` when the timer crosses 60 000 ms and `time_up` when it crosses 0. Nothing fires while paused, and nothing fires again after a reload past the threshold.
  - Test: 61 000 → 59 500 gives `one_minute`; 500 → 0 gives `time_up`; 59 000 → 58 000 gives nothing; paused gives nothing.
  - The sound is a 0.2 s beep from the browser's Web Audio API, plus `navigator.vibrate(200)` where the phone supports it. No new package.
  - Switchable per device ("Sound on / off", stored in `localStorage` inside try/catch). Default **on** for the head console, **off** on judge phones.
  - iPhones: Safari only plays sound after a tap on the page, so the "Sound on" toggle is that tap, and iPhones do not vibrate from a web page. The timer stays visible and is never sound-dependent (CLAUDE.md gotcha).
- Swap the organiser's `schedule-manager.tsx` Hold / Resume / Shift onto the same actions. The 4b buttons stay where they are, and the head judge gets the same ones.

### Tests

- **RLS** (`tests/rls/live-heat.test.ts`):
  - Start is refused for: an unlocked draw, a panel of 2 when the model needs 3, a placeholder seat, a second running heat, and a judge or spotter seat.
  - Start by the head judge and by an organiser both work.
  - A client cannot write `started_at`.
  - `end_heat_if_due` before time is a no-op; after time it ends, and a second call is a no-op.
  - Hold, Resume at and Shift work through the functions only. The head seat still cannot write a plan row directly.
- **Unit:** the timer values above. Shift and Hold values from docs/08 §3E fed through the action helpers.

**Done means (phone + laptop):**
1. On the demo event, the laptop `/head` shows the run order.
2. Start Pro Men R1 H1 is refused with "Draw for Pro Men is not locked — lock it in the Draw step".
3. Lock it, then Start. The timer runs on the laptop and on a phone `/judge`, within 1 s of each other.
4. Pause freezes both, and Resume continues them.
5. At 0:00 the heat shows "Time up" without anyone pressing End.
6. The dashboard timetable shows the actual start and the later rows move.
7. Hold, then Resume at 16:00, re-times the day.

## 4. Step 2 — spotter screen (PR 5b)

### Pure code (`src/lib/engine/tricks/`, tests first)

`compose.ts`:
- `composeTrick(vocab, parts)` returns `{name, categoryKey}`, where `parts = {direction?, multiplier?, base?, addons[], grabs[]}`.
- The name follows `namingTemplate`.
- `hideMultiplierWhen` hides "×1".
- **Modifiers are written in vocabulary order, not tap order**, so the same trick always gets the same name.
- The category is the first entry of `categoryPrecedence` present among the base and the modifiers.

`parse.ts`:
- `parseTrickText(vocab, text, enabledIds)` returns `{parts, unmatched: string[], needsReview: boolean}`.
- How it matches: lower-case, tokenise, then greedy longest-alias match (multi-word aliases first, e.g. "board off"), then edit distance ≤ 1 for tokens of 5 or more letters.
- Blocks unticked in the division's trick base count as unmatched.

Test vectors:
- **From docs/08 §1F (unchanged):**
  - "left double backroll board off handle" → "Left ×2 Backroll Board-off Handle pass", `handle_pass`.
  - "right mega" → "Right Megaloop", `kiteloop`.
  - "left banana jump" → base unmatched, free text "banana jump", `needsReview`.
- **New:**
  - `{right, x1, frontroll}` → "Right Frontroll", `rotation`.
  - Tapping Handle pass before Board-off still gives "… Board-off Handle pass".
  - "left dubble backroll" → ×2 via the edit distance.
  - With `modifier:board_off` unticked, "left backroll board off" → `unmatched ["board off"]`, `needsReview`.

### Database (same migration)

- `add_attempt` already stores `trick_parts`, `input_method` and `raw_text`. Store `needsReview` in `trick_parts.needsReview` and the free text in `raw_text`. No new column is needed.
- `undo_attempt(p_attempt)`: the creating spotter only, within 10 s of `created_at` (server clock). Soft delete, no reason asked. Audited as `attempt_undone`. This is docs/06 §5 "Undo last" (owner, §11.9: keep it). The spotter screen shows "Undo" on the last logged attempt for 10 s, then the button disappears.
- `attempt_counts` is unchanged. The counter is computed client-side from the **same** attempts list (docs/11 §3), and `attempt_counts` is the reconnect check.

### Files

- **Routes.** `src/app/spot/[eventId]/page.tsx` and its client `spotter-screen.tsx`. `/seat` redirects by role: judge → `/judge/[eventId]`, spotter → `/spot/[eventId]`, head → `/head/[eventId]`.
- **Auto-follow and the heat stream.** `src/components/live/use-live-heat.ts`, a shared hook:
  - Subscribes to `heats` with `event_id=eq.<id>`.
  - Picks the running or paused heat (for a judge: one whose division's panel holds the seat).
  - Opens the per-heat channels: `trick_attempts`, `trick_scores`, `impression_scores`, `heat_slots` and `penalties` filtered by `heat_id`.
  - On every (re)subscribe it refetches the heat snapshot, then applies the stream.
  - Between heats it shows "Next: Pro Men · R1 · Heat 3 — est. 15:23", computed with `computeTimetable`.
- **Builder:** `trick-builder.tsx` from 5a, now wired.
  - It reads the master vocabulary, the event's own blocks and `divisions.trick_base` (loaders in `src/lib/org/trick-vocabulary.ts`), then `enabledBlocks`.
- **Speech.** `src/lib/live/speech.ts` wraps `SpeechRecognition` / `webkitSpeechRecognition` and is feature-detected. The mic button is hidden where the browser has no speech recognition, and the text field stays (the keyboard's dictation key works there).
  - Typed or spoken text → `parseTrickText` → shown back as blocks to confirm (`speech.confirmBeforeLog`). Unmatched words show as "Free text — head judge will check".
- **CRASH.** One confirmation (rule 00.3), then `add_attempt` with `status = 'crashed'` and the intended trick. Judges never score a crashed attempt (owner, §11.7). The scoring model decides 0 or not counted (`trick.crash`).
- **Log.** Goes through the queue (step 3), with a `client_key` per tap.
  - Out of attempts: the label is grey, "Out of attempts · 7 / 7", and Log is disabled.
  - `ATTEMPT_CAP_REACHED` from a stale phone shows "Red is out of attempts (7 / 7)" and drops that queued item, marked as refused, never retried.
  - The label re-enables live when the head judge deletes one of that rider's attempts (realtime UPDATE on `deleted_at`).
- **Feed.** A running list with numbers ("Red — 3rd attempt — ×2 Backroll Board-off — landed"), and "Possible duplicate" shown with an icon and the word.
- **Spotter assignment.** Assigned riders or colours are shown first. The others are behind "Other riders" (one tap), never hidden.

### Tests

- **Unit:** composer and parser (above). The queue's "refused" path for `ATTEMPT_CAP_REACHED`.
- **RLS:**
  - The 8th attempt is refused even with a stale client.
  - Two spotters 8 s apart → the second has `possible_duplicate_of`; 45 s apart → no flag (docs/08 §1F).
  - The same spotter twice → no flag (docs/03 decision 4).
  - Undo after 10 s is refused (`UNDO_TOO_LATE`). Undo by another seat is refused.
- **Playwright** (two browser contexts): the spotter logs, and the second context sees the attempt within 1 s.

**Done means (phone):**
1. Start a demo heat on the laptop. The spotter phone opens it by itself.
2. Tap Left · ×2 · Backroll · Board-off → the name reads "Left ×2 Backroll Board-off" → Log → "Logged — RED — attempt 1".
3. Type "right mega" → the blocks show Right · Megaloop → Log.
4. Speak "left banana jump" (Chrome Android) → "banana jump" is shown as free text → Log.
5. Log 7 for Red: the label goes grey, "Out of attempts · 7 / 7".
6. Delete one on the laptop: the label shows "6 / 7" again.
7. A second spotter logs Red 5 s later → "Possible duplicate" on both feeds.

## 5. Step 3 — judge screen (PR 5b)

### Database (same migration)

- **`attempt_flags`** table: `id, event_id, heat_id, attempt_id, judge_seat_id, kind (crash|landed|wrong_rider|duplicate|other), note, created_at, resolved_at, resolved_by, resolution`.
  - Insert: the panel judge of that heat (RLS through `private.judge_can_write`). Read: own seat, head, organiser.
  - Realtime: yes. Audited.
  - `trick_scores.flag` is left unused, because a flag must not need a score.
- **`judge_sheets`** table: `heat_id, judge_seat_id, submitted_at, reopened_at, reopened_reason`, unique per (heat, seat).
  - `submit_sheet(p_heat)` is refused with `IMPRESSION_MISSING` unless the seat has an impression for every riding rider. That is the server half of "Submit only when every rider has a score".
  - `reopen_sheet(p_heat, p_seat, p_reason)`: head only, audited.
- **Change `private.judge_can_write`:**
  - A judge may write while the heat is `running|paused`, or `ended` and **their sheet is not submitted** (or was reopened).
  - Never in `under_review` or `published`, unless the head judge reopened that sheet.
  - **Lock rule (owner, §11.2):** a judge's scores lock at Submit sheet or when the head judge moves the heat to review, whichever comes first. The head judge can reopen one judge's sheet. The 3-minute timer is dropped.
  - `events.settings.judgeGraceSec` is no longer read by the database. It stays in the Zod schema (old events still parse) but is removed from the Event step; 5b updates docs/05 decision 7.

### Pure code (tests first)

`src/lib/live/queue.ts`. The queue logic is pure; IndexedDB is behind an interface, and the tests use an in-memory store.
- **Item:** `{clientKey, clientRev, kind: attempt|trick_score|impression|flag, payload, state: pending|synced|failed|refused}`.
  - `clientRev` comes from the server-offset clock.
  - A newer edit of the same (attempt, seat) replaces the older pending one.
  - Backoff is 1, 2, 4, 8 and 16 s, then 30 s.
  - Named refusals (`ATTEMPT_CAP_REACHED`, `NOT_ALLOWED`, `SHEET_LOCKED`) become `refused` and are never retried. Network or 5xx errors stay `pending`.
  - The badge counts come from the item states.
- **Test:** 20 s offline with 3 edits of one score and 1 of another → after reconnect exactly 2 upserts, the newest values win and nothing is duplicated (docs/08 §4 Phase 5).

`src/lib/engine/scoring/summary.ts`: `heatSummary(riderAttempts, myScores, vocab)`. It returns:
- attempts · landed · crashed
- different tricks and repeats ×n
- left / right counts
- families used
- landed tricks sorted by my score, each with my score

Tests use the docs/08 §1F legacy vector (5 landed, 2 crashed, "7 / 7").

Repeat badge: from `repeatIndexes` plus this judge's earlier score.
- Test: Red lands "Left Backroll" at attempt 2 (I gave 7.0), then again at attempt 5 → "Repeat — 2nd time · you gave 7.0 before".
- Crash at attempt 3 then landing at attempt 4 → attempt 4 has no badge (docs/03 decision 11).

### Files

- **Route.** `src/app/judge/[eventId]/page.tsx` and `judge-screen.tsx`, using `use-live-heat`.
- **Header.** Heat name, `heat-timer`, `connection-badge`, seat name, `theme-switch`.
- **Rider strip.** `rider-tile` with "n / max" and the grey out-of-attempts state.
  - Tapping a tile adds an attempt only when `judgesMayLogAttempts` is on.
- **Attempt cards.** Newest on top, from `trick_attempts`.
  - Landed attempts show the pad: `score-pad` for `entry = single`, `criteria-rows` for `entry = criteria`.
  - Crashed attempts show "Crashed — no score needed" and no pad (owner, §11.7). When the head judge switches the attempt to Landed, the pad appears on every judge phone through realtime.
  - Missed is one tap, undoable by tapping a score.
  - Flag opens a sheet with "That was a crash" / "That was a landing" / Wrong rider / Duplicate / Other. "That was a landing" is offered only on crashed attempts, "That was a crash" only on landed ones.
  - Every tap auto-saves through the queue and shows `saved-banner`.
- **Review tab.** My scores per rider, editable until the sheet is locked.
- **Impression / Variety step.** It opens when the effective status is `ended`.
  - One `score-pad` per rider on `impression.scale`, with the `heatSummary` card above each pad.
  - Progress "2 / 3 riders".
  - Submit sheet asks for one confirmation and then calls `submit_sheet`.
  - After that the screen is read-only and says "Ask head judge to reopen".
  - With `entry = none` (overall-impression preset) the judge sees only this step.
- **Summary card settings.** New Zod field in `src/lib/schemas/division-live.ts`, stored in a new column `divisions.live_settings jsonb default '{}'`: `impressionSummary {counts, variety, directions, families, landedList}`, all on by default. Shown in the Divisions step under Show all settings, with a "?".
- **Queue storage.** `src/lib/live/queue-idb.ts` keeps the IndexedDB store so unsent scores survive a reload. If IndexedDB is unavailable it falls back to memory, with a one-line warning.
- **Stay awake.** `src/lib/live/wake-lock.ts` (step 7).

### Tests

- **RLS:**
  - A judge cannot read another judge's scores.
  - A judge off the panel is refused.
  - Writing after Submit sheet is refused (`SHEET_LOCKED`), and allowed again after `reopen_sheet`.
  - `submit_sheet` with a rider missing is refused.
  - Flags are readable by the head judge.
- **Playwright:** a judge scores, goes offline (context `setOffline(true)`) for 20 s, scores twice, goes back online → the badge goes from "Pending 2" to "Synced", and the database holds one row per attempt.

**Done means (two phones as judges + spotter + laptop):**
1. The spotter logs Red, and both judges see the card within 1 s.
2. Judge 1 taps 7.5 → "Saved 7.5 — RED — attempt 1". Judge 2 taps Missed.
3. Airplane mode for 20 s, change a score, airplane mode off → the badge returns to Synced and there is no duplicate.
4. Reload the page mid-heat → pending scores are still there.
5. At time up the Impression / Variety step shows the summary card. Submit is disabled until all riders have a score, then the sheet is locked.

## 6. Step 4 — head judge console (PR 5c, branch `phase-5c-head-publish`)

### Database (`2026100y_phase5c_review_publish.sql`)

All functions below are head-only (head seat or organiser), audited, and take a reason where noted.

| Function | Notes |
|---|---|
| `review_heat(p_heat)` | Moves from `ended` to `under_review`. Allowed only when every panel judge has submitted, or with `p_override_reason` |
| `head_set_trick_score(p_attempt, p_seat, p_score, p_criteria, p_missed, p_reason)` | Writes `edited_by` and `edit_reason`; `version + 1`. "Mark judge absent for an attempt" is this with `p_missed = true` and reason "Absent". Absent and Missed both leave the judge out of the average and never block publishing |
| `head_set_impression(p_heat, p_entry, p_seat, p_value, p_reason)` | Paper sheets, typed in ("tabulator mode") |
| `edit_attempt(p_attempt, p_entry, p_trick_name, p_trick_parts, p_category, p_status, p_reason)` | Moving to another rider takes that rider's next attempt number. Refused with `ATTEMPT_CAP_REACHED` unless a reason is given |
| `merge_attempts(p_keep, p_drop, p_choices jsonb, p_reason)` | Moves the dropped attempt's scores to the kept one for every judge who has none there. Where both have a score, `p_choices` says which to keep. The dialog shows both scores and **defaults to the first-logged attempt**, both as the attempt kept and as the score kept (owner, §11.10). Then the dropped attempt is soft-deleted |
| `head_add_attempt` | Existing `add_attempt` with `p_override_reason`, which is the only way past the cap (owner, §11.8). **Who:** the head judge, or an organiser only when the event has no active head-judge seat. 5c tightens `add_attempt` accordingly; today it lets any organiser override. Always with a reason, audited as `attempt_cap_override` |
| `edit_attempt` status switch | Switching Crashed → Landed (after a judge's "That was a landing" flag) resolves that flag and makes the pads appear on the judge phones (owner, §11.7) |
| `set_rider_status(p_heat, p_entry, p_modifier DNS\|DNF\|DSQ\|null, p_reason)` | Interference is a `penalties` row through `add_penalty(p_heat, p_entry, p_type, p_reason)` |
| `flag_out(p_heat, p_entries uuid[], p_reason)` | Sets `heat_slots.flagged_out`. The server checks the count against the format's `flagOut.count` |
| `heat_decisions` table + `decide_tie(p_heat, p_rider_ids uuid[], p_reason)` | `heat_id, kind (tie\|publish_override), payload, reason, by_user, by_seat, at`. Read by head and organiser; append-only |
| `resolve_flag(p_flag, p_resolution)` | Closes an `attempt_flags` row |

### Pure code (tests first)

- **`src/lib/live/matrix.ts`:** `buildMatrix(model, attempts, scores, flags, panelSeats)`. It returns rows and cells, each with a state: `scored|missing|missed|absent|outlier|crash|deleted|duplicate`. It uses `computeHeat` for the panel scores.
  - Test: the 1A vector gives panel column 7.71 / 8.25 / 7.29 / crash / 8.08. Attempt 3 with J3 removed → grey "missing". With J3 Missed → "missed", 7.31. An outlier test from docs/08 §1B.
- **`src/lib/engine/scoring/flag-out.ts`:** `flagOutCandidates(model, heatInput, count)`. It returns the lowest `count` riders by provisional ranking, with ties going to `rankHeat`'s tie-breakers.
  - Test: 3 riders at 18.2 / 15.0 / 12.4 → the last one.
- **`src/lib/live/tie-words.ts`:** turns `tieResolvedBy` into words using ui-copy, e.g. "Red ahead of Blue: higher best trick (8.6 vs 8.2)" (docs/08 §1E).

### Files

- **Route.** `src/app/head/[eventId]/page.tsx` and `head-console.tsx`. Three columns on a laptop or tablet.
- **On a phone (below 900 px; owner, addition A)** the page is never refused. It stacks, top to bottom:
  - the heat controls: Start, Pause, Resume, End, Hold, Resume at, Shift, Publish, Re-open;
  - the rider totals with provisional rank and the tie words;
  - the publish blocker list, with "Choose order" for a tie and the override with a reason;
  - one line where the matrix would be: "Score table: open this page on a tablet or laptop".
  - **Consequence:** the jobs that live in the matrix are tablet or laptop only: delete, merge, edit attempt, edit score, absent, and adding an attempt past the cap. A head judge with only a phone can still run the clock, see the blockers, decide a tie and publish.
- **Left:** `heat-control` (step 1), plus Flag-out at `flagOut.atMin`, shown only when the round is listed in the format's `flagOut.rounds`.
- **Centre:**
  - `head-matrix` (live). Tapping a cell opens the criteria and "Edit score" with a reason.
  - Rider totals: counted tricks highlighted, Impression / Variety score, total, provisional rank and the tie words.
  - Attempt menu: Delete (reason), Merge (when a possible duplicate exists), Edit, "+ Add attempt".
  - Rider menu: DNS / DNF / DSQ / Interference.
  - "Owes Impression / Variety score: Judge 2 (Blue, Green)".
- **Right:**
  - Judge connection. Live means seen within 45 s; it uses the heartbeat plus realtime presence on the heat channel.
  - Open flags with Resolve.
  - Attempts per minute.
  - **Agreement report** after the heat: per judge, the mean distance from the panel and the number of outliers (pure `agreement.ts`, tested on 1A).
- **Second tab.** A "head judge also scores" seat opens `/judge/[eventId]` in a second tab. It is the same login and already on the panel.
- **Announcer.** `?mode=announcer` shows the read-only matrix and feed (docs/06 §9). It is cheap here, so include it; the rider bios wait for Phase 6.

### Re-run heat: one button (owner, change of 1 Oct 2026)

**Who and when.**
- The head judge, or an organiser. One confirmation, and a reason is required.
- Allowed while the heat is `running`, `paused`, `ended` or `under_review`.
- Refused once `published`: "Re-open the heat instead".
- Also refused while `scheduled` ("Start it instead") and while `cancelled`.

**Database** (`rerun_heat(p_heat, p_reason, p_leave_out uuid[], p_plan_items jsonb, p_plan_updated_at timestamptz)`)

`security definer`, so it checks the role itself. One transaction:

1. **Cancel the original.** `status = 'cancelled'`.
   - A heat that had started keeps `started_at` and gets `ended_at = now()` (paused: `paused_at`), so the timetable knows how long it really ran.
   - Its attempts, scores, impressions and flags stay stored. Officials and organisers can read them for the audit; the public never can (`get_public_live_heat` already refuses cancelled heats).
   - Nothing is ever published for it.
2. **Create the re-run row** in the same round, with `rerun_of = <original id>` (new column `heats.rerun_of uuid null`):
   - the same seats, riders and `vest_colour`;
   - the same `duration_sec` and `warm_up_sec`;
   - `number` the same, `number_suffix = 'R'` (a second re-run gets `R2`). The existing unique key `(division, number, suffix)` allows this, so the next-free-number fallback is not needed;
   - `name` = "Heat 3 re-run" (the original's name plus "re-run").
3. **Later seats follow the re-run without editing the draw.** Every placeholder in the stored draw points at the draw's heat ("1st H3"), and the draw finds its database row through `draw_uid`. The function moves `draw_uid` from the cancelled row to the re-run row, and clears it on the cancelled one.
   - So every later seat that waited for "1st H3" now waits for the re-run, and the draw stays locked and unchanged. This is the owner's "re-point every later seat"; the mechanism is one column, not a draw edit.
   - The cancelled row leaves the ladder entirely.
   - The function sets `app.draw_bypass` for this one change, because the 4b guard otherwise refuses a `draw_uid` change on a started heat.
4. **Run order.** The server action computes the new items with the pure `insertRerunItem` (below) and passes them in.
   - The function checks that `p_plan_updated_at` still matches (`PLAN_CHANGED` otherwise, so the head judge simply presses again).
   - It also checks that exactly one item was added and nothing else changed (`BAD_PLAN_ITEMS`).
   - The original's item stays where it was.
5. **One audit line,** `heat_rerun`: the reason, the old and new heat, and the riders left out.

**Riders left out** (tick boxes in the confirmation, all ticked "rides again" by default):
- A left-out rider keeps a seat in the re-run marked as not riding, so the re-run's result still places them and the ladder needs no special case.
- How they are placed is **open question 13 below**. The owner's rule ("keeps their place from the original heat's ranking") contradicts the owner's own example. Until it is answered, 5c builds everything else and leaves this one rule behind a single function, `leftOutPlacement`.

**Pure code (tests first, docs/08 §1G):**
- `src/lib/live/rerun.ts` `rerunName(heat)`:
  - "Heat 3" → `{suffix: "R", name: "Heat 3 re-run"}`;
  - a heat renamed "Semi-final 1" → "Semi-final 1 re-run";
  - re-running "Heat 3 re-run" → `{suffix: "R2", name: "Heat 3 re-run 2"}`.
- `insertRerunItem(plan, originalHeatId, rerunHeatId, liveHeatId)` puts the new item **right after the heat that is live now**:
  - the original itself when it is being re-run while running;
  - otherwise the running or paused heat;
  - if nothing is running, right after the original's item.
  - It keeps every pin, break and note. A pin on the item that used to follow moves to "not before" as usual.
  - Tests: order H1, H2, H3, H4 with H3 running → H1, H2, H3, H3R, H4. H3 under review while H4 runs → …, H4, H3R, H5. Nothing running → right after H3.
- `computeTimetable` gets a `cancelled` row state:
  - a cancelled heat that ran keeps its real start and end;
  - one that never started takes no time and shows no times.
  - Test with docs/08 §3G values (heat 10, break 2, warm-up 5): H3 starts 10:34 and is cancelled at 10:40 → H3R warm-up 10:42, start 10:47, end 10:57; H4 then starts 11:04.

**Screens.**
- Console: "Re-run heat" sits beside End and Cancel, on the phone layout too.
- The cancelled heat stays visible, read-only, with "Cancelled — re-run as Heat 3 re-run".
- Officials' phones follow the re-run when the head judge presses Start, like any heat. The cancelled heat never re-opens on their screens.
- Public timetable (Phase 6 renders it; 5c provides the data through `heats.rerun_of`): the old row reads "Cancelled — re-run as Heat 3 re-run", with no scores.

**Tests.**
- **RLS** (`tests/rls/rerun.test.ts`):
  - refused for judge and spotter seats, for another organisation's organiser, and when the heat is published;
  - the re-run has the same riders, seats and lycra colours;
  - the later seats ("1st H3" in the Semi-final) now resolve to the re-run;
  - the draw is still locked and its JSON unchanged;
  - the cancelled heat's attempts and scores are still stored and readable by the head judge;
  - exactly one audit line;
  - a stale `p_plan_updated_at` changes nothing.
- **Unit:** `rerunName` and `insertRerunItem` (above), plus the timetable values.
- **Playwright:** re-run Heat 3 from the console with a reason → "Heat 3 re-run" appears next in the run order → Start → the spotter phone opens the re-run by itself.

**Fallback (manual path, kept for anything the button refuses):**
1. Cancel heat (with reason).
2. Draw step: Unlock draw (with reason).
3. Add an extra heat in the same round with the cancelled heat's riders, and rename it "Heat 3 re-run". It gets the next free number.
4. Re-point every later seat that waited for "1st H3" with the seat menu.
5. Lock draw, add the heat to the run order, Start.

### Practice heat (owner, §11.11: the seed of the later simulator; keep it small)

- **Database:** `events.is_simulation bool not null default false`.
  - It can be set only while no heat of the event has started, and never switched off after one has.
  - A simulation event is never public: `private.event_is_public` returns false, so it is off the home page, the organisation page, the event page, live views, results and registration.
  - Officials can still join it with their PINs, which is the point.
  - Every future export filters it out; 5c adds a helper `excludeSimulations()` and a test so Phase 7 exports cannot forget.
- **Function:** `practice_add_attempt(p_heat, p_entry, p_trick jsonb, p_status)`. Organiser only. Refused with `NOT_A_SIMULATION` unless `events.is_simulation`. Otherwise the same path as `add_attempt`, including the cap.
- **Pure:** `src/lib/live/practice.ts` `practiceAttempt(seed, vocab, enabledIds, riders, counts)`. It picks a rider still below the cap and a trick composed from the division's ticked trick base; about 1 in 5 attempts is a crash. Tests:
  - the same seed gives the same feed;
  - never a rider who is out of attempts;
  - never an unticked block.
- **Screen:** on `/head` of a simulation event only, the organiser gets "Practice heat: play a spotter feed every [20] s" with Start and Stop.
  - It runs in that browser tab and stops when the heat ends or the tab closes.
  - One person can then score the heat alone on a judge phone.
- **Event step:** a "Simulation event (never public)" switch with a "?".
- Auto-play judges, scenario buttons, "View as…" and the checklist are **not** in Phase 5. They are the separate simulator PR after Phase 6, specced by the owner then.

### Tests

- **RLS:**
  - Every head function is refused for judge, spotter and announcer seats, and for another organisation's organiser.
  - Every one writes an audit line, and the reason is required where stated.
  - Merge keeps the right scores.
  - Moving an attempt to a rider who is out of attempts needs a reason.
  - Past the cap: the head judge with a reason works; an organiser with a reason works only when the event has no active head-judge seat (`NOT_ALLOWED` otherwise); nobody gets past the cap without a reason.
  - Simulation events: `practice_add_attempt` is refused on a normal event; a simulation event is invisible to anon and to `get_public_live_heat`; `is_simulation` cannot be switched off after a heat has started.
- **Unit:** matrix, flag-out, tie words, agreement.

**Done means (laptop + phones):**
1. Two spotters log Red 5 s apart → the matrix shows "Possible duplicate".
2. Merge keeps Judge 1's score from one attempt and Judge 2's from the other. The judges' phones drop the merged card at once.
3. Edit a score with the reason "paper sheet" → the audit log shows the old and new value.
4. DNS a rider → they are ranked last with "—".
5. With identical scores the console says "Red and Blue tied — choose". Choose with a reason.
6. On a phone, `/head` shows the controls, totals and blockers, and the line about the score table.
7. Judge 1 flags a crashed attempt "That was a landing". Switch it to Landed, and the pads appear on both judge phones.
8. On a simulation event, start a heat and a practice feed. The judge phone fills with attempts every 20 s. The event does not appear on the home page.
9. Re-run a running Heat 3 with the reason "kite tangle": Heat 3 shows "Cancelled — re-run as Heat 3 re-run", "Heat 3 re-run" is next in the run order with the same riders and lycras, the Semi-final still says "1st H3", and Start opens it on the phones.

## 7. Step 5 — publish (PR 5c)

**One server action, `src/lib/live/publish.ts` `publishHeat(heatId, {overrideReason?})`:**
1. Check that the caller is the head (user client, `private` check through an RPC).
2. Load the heat, model, panel, attempts, scores, impressions, penalties, decisions, the division's `draw` and the event settings.
3. Run `computeHeat` and `rankHeat` with `headJudgeDecisions` from `heat_decisions`.
4. Build the **blocker list**: the engine's `score_missing`, `impression_missing` and `tie_unresolved`, plus `sheet_not_submitted` from `judge_sheets`.
   - Any blocker without `overrideReason` → return the list in words. `tie_unresolved` cannot be overridden (owner, §11.3): the head judge chooses the order with a reason (`decide_tie`), and "Share the place" is offered only when the model's `tieBreakers` include `share_place`.
5. Run `toLadderResult(heatResult)` (new, in `src/lib/engine/scoring/ladder-adapter.ts`). It returns `{ranked: [{entrantId, place, total, modifier, tieKeys}]}`, where `tieKeys` = the raw values the model's tie-breakers compared, in order.
   - Then run `applyHeatResult(draw, …)`.
   - A `conflict` is returned to the screen as "Semi-final 1 has already started — this correction would change who rides in it. Nothing was changed." Nothing is written.
6. Call **`publish_heat_commit(p_heat, p_expected_version, p_results jsonb, p_slots jsonb, p_draw jsonb, p_projection jsonb, p_hold bool, p_override_reason)`**. It runs as the service role in **one transaction**:
   - `select … for update` on the heat. The heat must be `under_review`, and the latest `heat_results.version` must equal `p_expected_version − 1`. **If they are equal, it returns the existing version (idempotent)**; any other version is refused with `VERSION_CONFLICT`.
   - Insert the `heat_results` rows for the version.
   - Write place, total and breakdown on `heat_slots`.
   - Save `divisions.draw` and project the newly filled seats of later heats into `heat_slots.entry_id`. "1st H1" becomes the rider. The slot guard already lets the service role through.
   - Set `publish_hold` (step 6) and `status = 'published'`. The trigger stamps `published_at`.
   - Clear `reopened_at`.
   - Write an audit line with the override reason and the blocker list it overrode.
7. "Actual end into the plan": nothing to write. `ended_at` is on the heat and the timetable reads it (owner, §11.1).

**Re-open.** `reopen_heat(p_heat, p_reason)`: head only, from `published` to `under_review` (the trigger already allows it). It sets `reopened_at` and is audited. Every screen shows "Result under correction" (docs/06 §10). Judges stay locked unless the head judge reopens their sheet. Publishing again writes version 2.

**Tests first** (docs/08 §1G and the existing §2F):
- The 1A heat published → `heat_results` v1, Red place 1, total **31.54**, percent **78.85**. The slots carry the same values.
- Calling publish again with the same expected version → no new rows.
- Publish with J3's impression missing → blocked with "Judge 3 has no Impression / Variety score for Red". With an override reason → published, and the audit line holds the reason and the blocker.
- Knockout docs/08 §2B: publish R1 H1 → the SF seat "1st H1" holds the winner's entry. Re-open, change the winner, republish → v2, and the SF seat changes, because SF has not started.
- docs/08 §2F: republish R1 H1 with a different winner while R3 H1 is running → `conflict`, and the database is unchanged (checked row by row).
- The adapter: `tieKeys` for docs/08 §1E Red / Blue = [8.6, 8.0, …] / [8.2, 8.2, …].

**Done means (laptop + phones):**
1. The 3-phone run-through: spotter logs, two judges score and submit, the head judge reviews and publishes.
2. The console's totals equal `computeHeat` (shown side by side in the breakdown panel).
3. The next-round seat on the Draw step shows the winner's name.
4. Press Publish twice → one result.
5. Re-open, then Publish → "Version 2".

## 8. Step 6 — visibility (PR 5c)

- **Today:**
  - The settings are **event-level** (`publicLiveScores`, `publicResultsOnPublish`, `holdFinalResult` in `events.settings`), not per division.
  - `heat_results.public_read` already hides held heats.
  - `get_public_live_heat` checks `publicLiveScores = 'live'` but ignores `publish_hold`.
  - Anon can read `heat_slots.place/total/breakdown`, and any signed-in user can read `divisions.draw` of a published event, which holds `results`. **Both would leak a held final.** Phase 5 must close them now, not in Phase 6.
- **Changes:**
  1. `divisions.live_settings` may override the three event settings (null = the event's value). This is the "division's tick boxes" (owner, §11.4): the event's boxes are the default and a division may override them, in the Divisions step under Show all settings.
  2. New `heats.public_live bool null`. The head judge's per-heat switch; null = the setting.
  3. At publish, `p_hold = holdFinalResult && round is the division's last round` **or** `!publicResultsOnPublish`. Release uses `set_publish_hold(false)`, which already exists and is audited.
  4. `get_public_live_heat` respects `public_live` and returns no scores for held heats.
  5. Revoke anon (and non-member) select on `heat_slots.place`, `total` and `breakdown`.
  6. Restrict `divisions.draw` to event organisers and seat holders. This brings the Phase 6 owed item forward.
  7. Phase 6 reads published results only through a new `get_public_results(p_event)`, which skips held heats. Phase 5 adds the function and its RLS tests; Phase 6 only renders it.
- **Tests (RLS):** for a held final, anon and a foreign signed-in user get nothing from `heat_results`, `heat_slots` totals, `divisions.draw` or `get_public_live_heat`. After release they get the result.
- **Done means:** a private window on `/e/<slug>` shows nothing for the held final. Release it on the console, and the result appears on the next poll.

## 9. Step 7 — realtime and the beach standard (PR 5b, hardened in 5c)

- **Channels:**
  - Officials subscribe per heat (`heat_id=eq.`) to attempts, scores, impressions, slots, penalties and `attempt_flags`.
  - They subscribe per event to `heats`.
  - Add `attempt_flags`, `judge_sheets` and `heat_decisions` to `supabase_realtime`.
  - Set `replica identity full` on `heat_results`.
- **Public:** keep **polling** `get_public_live_heat` / `get_public_results` every `livePollSec`, as docs/05 decision 4 says. Realtime stays reserved for officials, because of the free plan's ~200 connections (owner, §11.5). Phase 6 builds on polling.
- **Reconnect:**
  - Detect it through the channel status in `use-live-heat`.
  - Refetch the snapshot (one query per table, by `heat_id`), then apply any buffered events newer than the snapshot.
  - The badge says "Offline" while it is down.
- **Stay awake:**
  - `navigator.wakeLock.request('screen')` while a heat is running, re-requested on `visibilitychange`.
  - Where unsupported: "Turn off auto-lock in Settings while you judge".
- **Beach rules on every official screen:**
  - The tokens and sizes from 5a.
  - Taps only.
  - Colour always with its name.
  - `saved-banner` stays until the next action.
  - One confirmation for CRASH, Submit sheet, Delete attempt, Merge, Publish and Re-open, and nothing else.
- **Playwright (Pixel 5 and iPhone 13 profiles):**
  - Every button on `/judge` and `/spot` is ≥ 56 px.
  - No hover-only or long-press handlers: a grep test fails on `onContextMenu`, `onPointerDown` timers and drag handlers in `src/app/{judge,spot,head}`.

## 10. PR split and order

| PR | Branch | Contents | Rough hours |
|---|---|---|---|
| **5a** | `phase-5a-design` | Step 0: tokens, the presentational live components, `/design` | 3–4 h |
| **5b** | `phase-5b-spotter-judge` (after the owner approves 5a) | Steps 1–3 and the 5b part of 7: migration, timer, minimal `/head` controls, trick composer and parser, queue, spotter, judge | 8–10 h |
| **5c** | `phase-5c-head-publish` (after 5b merges) | Steps 4–6, plus the rest of 7: head console, publish, re-open, Re-run heat, visibility and the leak fixes, announcer view, practice heat, the full 3-phone acceptance run | 9–11 h |

docs/07 budgets about 3 h for all of Phase 5. **That is not realistic.** Phase 4 took three PRs, and Phase 5 has more server logic and three new screens.

If 5b runs long, split it at the spotter / judge boundary: 5b-1 is steps 1–2, 5b-2 is step 3. Each step's "done means" is a stopping point.

Owner's answers added work to 5c: the phone layout of `/head`, the practice heat and the Re-run heat button (about 2 h on its own, hence 9–11 h). If 5c runs long, Re-run heat and the practice heat move to a small 5d. The timer sounds are about 1 h in 5b.

**When 5a starts,** its session writes this table (PRs, branches and rough hours) into a new "Phase 5" section of `docs/STATUS.md`. Each later PR adds the hours it actually took (owner, addition C).

## 11. Owner's answers (1 Oct 2026)

These are decisions now. The steps above already follow them. 5b copies them into the decisions logs of docs/03, docs/05 and docs/06.

| # | Topic | Decision | Where |
|---|---|---|---|
| 1 | Actual start | Not copied into the plan; the heat row is the truth | Steps 1, 5 |
| 2 | Judge lock | At Submit sheet or when the head judge moves the heat to review, whichever comes first. The head judge can reopen one judge's sheet. The 3-minute timer is dropped | Step 3 |
| 3 | Unresolved tie | The head judge chooses the order with a reason. "Share the place" only when the model allows it. No plain override | Step 5 |
| 4 | Visibility | The event's boxes are the default; a division may override them | Step 6 |
| 5 | Public pages | Polling for the public, realtime only for officials | Step 7 |
| 6 | Running heats | One per event by default, as an event setting (`maxRunningHeats`) | Step 1 |
| 7 | Crashes | Judges never score a crashed attempt. A judge presses Flag "That was a landing"; the head judge switches it to Landed and the pads appear | Steps 2–4 |
| 8 | Past the cap | The head judge, or an organiser when the event has no head judge, always with a reason | Step 4 |
| 9 | Spotter Undo | Keep "Undo last" within 10 seconds | Step 2 |
| 10 | Merge | The dialog shows both scores and defaults to the first-logged attempt | Step 4 |
| 11 | Simulator | The full simulator is its own PR after Phase 6 (the owner gives its spec then). 5c ships only its seed: an organiser-only "Practice heat" on events flagged `is_simulation` (never public, excluded from exports) | Step 4 |
| 12 | Out of scope | Wind calls go to Phase 6 with the public banner. Highest Jump metres come after the event | §13 |
| 12a | Re-run heat (changed the same day) | A one-button "Re-run heat" in 5c: head judge or organiser, one confirmation, reason required; cancels the heat and creates "Heat 3 re-run" (3R) with the same riders, seats, lycras and timing; later seats follow it; the draw stays locked; it goes right after the live heat in the run order; one audit line; riders can be left out. The manual five-step path stays as the fallback | Step 4 |
| A | Head console on a phone | Below 900 px nothing is refused. Controls, rider totals and the blocker list are shown; only the matrix asks for a tablet or laptop | Step 4 |
| B | Timer sounds | A short beep and vibration at 1:00 and 0:00. On by default on the head console, optional on judge phones, switchable per device | Step 1 |
| C | PR split | 5a, 5b, 5c, with the 5b-1 / 5b-2 fallback. The hours go into STATUS.md when 5a starts | §10 |

### Still open

13. **Riders left out of a re-run: where are they placed?** Your rule was "a left-out rider keeps their place from the original heat's ranking". That contradicts your own example. The original heat is cancelled, so its ranking is only provisional, often incomplete, and it is the result you just decided not to trust. A disqualified rider who was leading at the cancel would keep 1st and advance.
    - *Beach:* Heat 3, 2 advance. Cancelled at minute 6 with Red provisionally 1st. Red is disqualified and left out of the re-run. Under the rule as written, Red goes to the Semi-final, and the three riders who re-ride fight for the one remaining place.
    - **Recommendation:** the confirmation asks per left-out rider, **Disqualified** or **Did not start**. Both are ranked last in the re-run, DSQ below DNS (docs/03 §4.5), and both are audited with the re-run's reason.
    - If you do want "keep the provisional place" for some case (e.g. an injured rider who was clearly ahead), say which case. It then becomes a third choice, allowed only when the cancelled heat had every score in.
    - **This blocks only `leftOutPlacement` in 5c**, nothing else.

## 12. Repo rules I had to interpret

- **"Server time is truth":** this also covers the organiser's existing Hold / Shift buttons, which use the device clock today. They move to server actions in 5b.
- **"Tests first in doc 08 terms":** the new values in this plan go into a new docs/08 §1G at the start of 5b, before code. This PR may only add one file, so docs/08 is not edited here.
- **"Service role only in server code":** publish needs it (it writes `heat_results` and slots of other heats). Every other head action is a security-definer function that checks the caller, so no service key is used for them.
- **"Mobile first" vs the head console:** rule 00.2 says the matrix is never squeezed onto a phone. Per the owner's addition A, only the matrix asks for a tablet or laptop; everything else on `/head` works on a phone.
- **"Re-opened" state:** docs/05 §5 says there is no separate status. Re-open is `published → under_review` plus `reopened_at`, and the next publish is version 2.
- **Routes:**
  - docs/06 names `/judge/[heatId]`. Auto-follow needs the event, so the routes are `/judge/[eventId]` and `/spot/[eventId]`, and a heat can be pinned with `?heat=`.
  - CLAUDE.md's route list allows both.
- **"Correction after a later heat started":** read as "a heat that this result feeds has started" (docs/04 and docs/08 §2F). An unrelated later heat in the run order does not block a correction.
- **Re-run numbering:** the database already allows a suffix, so the re-run is "3R" and keeps its place in the ladder through `draw_uid`. Only the manual fallback gives a next-free number.
- **Pause:** spotters cannot log while paused (riders are off the water); judges can still score attempts already logged.
- **Dependencies:** none added. IndexedDB, speech, wake lock, Web Audio and vibration are browser APIs.
- **"Never public" for simulation events:** officials can still join a simulation event with their PINs; everything a visitor could see is closed.
- **The demo event:** 5c sets `is_simulation` on the seeded Demo Cup, because its riders are fictional and its PINs are public. That takes Demo Cup off the home page.

## 13. Not in Phase 5

- Public pages, big screen, rider pages (Phase 6). They only read the functions from step 6.
- Wind calls (Phase 6, with the public banner).
- Highest Jump metres (after the event).
- The full simulator: auto-play spotters and judges, scenario buttons, "View as…", checklist. It is its own PR after Phase 6.
- Exports.
- Paper sheets printing.
- Full offline-first.
