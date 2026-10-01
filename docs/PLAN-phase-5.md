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
> Where the spec and this plan differ, the owner's answers to §11 decide. The answers are then written into the decisions logs of docs/03, docs/05 and docs/06.

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
  | `heat-timer.tsx` | Takes `remainingMs`, `state` (running / paused / ended / held). Shows mm:ss in large type and the word "Paused" or "Time up" (never colour alone) |
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
| `cancel_heat(p_heat, p_reason)` | Head only. Reason required. Audited |
| `set_plan_hold(p_plan, p_hold jsonb, p_reason)`<br>`set_plan_anchors(p_plan, p_anchors jsonb, p_reason)` | Head or organiser. They change only `hold` and `anchors` of the **active** plan. Audited. The server action computes the values with the pure `startHold` / `resumeHold` / `shift` using `server_now()` |
| `private.division_model_setting(p_division, p_path text[])` | Generalises `division_heat_setting` to any path in the merged model, e.g. `{panel,minJudges}` |

New columns:
- `events.settings.maxRunningHeats` (Zod default 1, with a "?" in the Event step).
- `heats.reopened_at timestamptz null` (used in step 5).

RLS: no new table rights. All writes go through the functions above.

**About "Start writes the actual start into the active plan": I recommend not doing this.** `SchedulePlanSchema` forbids actual starts on heat items on purpose. `computeTimetable` already reads `heats.started_at` / `ended_at` through `buildHeatModel`, so the run order re-flows the moment `started_at` is stamped. Writing it into the plan as well would create two truths. docs/05 §7 "update schedule_plans.actual_starts/ends" is therefore satisfied by the heat row. See §11 Q1.

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
- In 5b it is mounted on a minimal `/head/[eventId]` page, so the spotter and judge flows can be tested end to end.
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
- `undo_attempt(p_attempt)`: the creating spotter only, within 10 s of `created_at` (server clock). Soft delete. Audited as `attempt_undone`. This is docs/06 §5 "Undo last"; see §11 Q9.
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
- **CRASH.** One confirmation (rule 00.3), then `add_attempt` with `status = 'crashed'` and the intended trick. Judges do not score crashes. The scoring model decides 0 or not counted (`trick.crash`).
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

- **`attempt_flags`** table: `id, event_id, heat_id, attempt_id, judge_seat_id, kind (crash|wrong_rider|duplicate|other), note, created_at, resolved_at, resolved_by, resolution`.
  - Insert: the panel judge of that heat (RLS through `private.judge_can_write`). Read: own seat, head, organiser.
  - Realtime: yes. Audited.
  - `trick_scores.flag` is left unused, because a flag must not need a score.
- **`judge_sheets`** table: `heat_id, judge_seat_id, submitted_at, reopened_at, reopened_reason`, unique per (heat, seat).
  - `submit_sheet(p_heat)` is refused with `IMPRESSION_MISSING` unless the seat has an impression for every riding rider. That is the server half of "Submit only when every rider has a score".
  - `reopen_sheet(p_heat, p_seat, p_reason)`: head only, audited.
- **Change `private.judge_can_write`:**
  - A judge may write while the heat is `running|paused`, or `ended` and **their sheet is not submitted** (or was reopened).
  - Never in `under_review` or `published`, unless the head judge reopened that sheet.
  - This replaces the grace-period rule; see §11 Q2. If the owner keeps the grace period, `judgeGraceSec` stays as a second condition.

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
  - Crashed attempts show "Crashed — no score needed".
  - Missed is one tap, undoable by tapping a score.
  - Flag opens a sheet with Crash / Wrong rider / Duplicate / Other.
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
| `merge_attempts(p_keep, p_drop, p_choices jsonb, p_reason)` | Moves the dropped attempt's scores to the kept one for every judge who has none there. Where both have a score, `p_choices` says which to keep (default: the kept attempt's). Then the dropped attempt is soft-deleted |
| `head_add_attempt` | Existing `add_attempt` with `p_override_reason`. The only way past the cap is a reason (docs/05 decision 20) |
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

- **Route.** `src/app/head/[eventId]/page.tsx` and `head-console.tsx`. Laptop or tablet layout; below 900 px it says "Use a tablet or laptop" (rule 00.2).
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

### Tests

- **RLS:**
  - Every head function is refused for judge, spotter and announcer seats, and for another organisation's organiser.
  - Every one writes an audit line, and the reason is required where stated.
  - Merge keeps the right scores.
  - Moving an attempt to a rider who is out of attempts needs a reason.
- **Unit:** matrix, flag-out, tie words, agreement.

**Done means (laptop + phones):**
1. Two spotters log Red 5 s apart → the matrix shows "Possible duplicate".
2. Merge keeps Judge 1's score from one attempt and Judge 2's from the other. The judges' phones drop the merged card at once.
3. Edit a score with the reason "paper sheet" → the audit log shows the old and new value.
4. DNS a rider → they are ranked last with "—".
5. With identical scores the console says "Red and Blue tied — choose". Choose with a reason.

## 7. Step 5 — publish (PR 5c)

**One server action, `src/lib/live/publish.ts` `publishHeat(heatId, {overrideReason?})`:**
1. Check that the caller is the head (user client, `private` check through an RPC).
2. Load the heat, model, panel, attempts, scores, impressions, penalties, decisions, the division's `draw` and the event settings.
3. Run `computeHeat` and `rankHeat` with `headJudgeDecisions` from `heat_decisions`.
4. Build the **blocker list**: the engine's `score_missing`, `impression_missing` and `tie_unresolved`, plus `sheet_not_submitted` from `judge_sheets`.
   - Any blocker without `overrideReason` → return the list in words. `tie_unresolved` cannot be overridden: it needs a decision (see §11 Q3).
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
7. "Actual end into the plan": already true. `ended_at` is on the heat and the timetable reads it (see step 1 and §11 Q1).

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
  1. `divisions.live_settings` may override the three event settings (null = the event's value). This is the "division's tick boxes"; see §11 Q4.
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
- **Public:** keep **polling** `get_public_live_heat` / `get_public_results` every `livePollSec`, as docs/05 decision 4 says. Realtime stays reserved for officials, because of the free plan's ~200 connections. See §11 Q5.
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
| **5c** | `phase-5c-head-publish` (after 5b merges) | Steps 4–6, plus the rest of 7: head console, publish, re-open, visibility and the leak fixes, announcer view, the full 3-phone acceptance run | 7–9 h |

docs/07 budgets about 3 h for all of Phase 5. **That is not realistic.** Phase 4 took three PRs, and Phase 5 has more server logic and three new screens.

If 5b runs long, split it at the spotter / judge boundary: 5b-1 is steps 1–2, 5b-2 is step 3. Each step's "done means" is a stopping point.

## 11. Open questions for the owner

Each has a recommendation and a beach example.

1. **Actual start in the plan.** You asked that Start writes the actual start into the run-order plan.
   - The timetable already takes it from the heat itself, and the 4b schema refuses heat times in the plan on purpose.
   - **Recommendation:** don't copy it. Writing it twice would give two clocks that can disagree.
   - *Beach:* Heat 2 starts at 15:10; the dashboard shows 15:10 and pushes Heat 3 to 15:25 either way.
2. **When are a judge's scores locked?** The docs give three rules: at review; 3 minutes after the end; or at Submit sheet.
   - **Recommendation:** at Submit sheet, or when the head judge moves the heat to review, whichever comes first. The head judge can reopen one judge's sheet. Drop the 3-minute timer.
   - *Beach:* Judge 2 realises they gave Red 5.5 instead of 6.5 one minute after time up; they fix it and then submit. Nobody is locked out mid-correction by a timer they cannot see.
3. **An unresolved tie.** It can't be published with a plain override, because somebody has to be 1st.
   - **Recommendation:** the head judge picks the order (or "share the place", only if the model's tie-breakers include it), with a reason.
   - *Beach:* Red and Blue both on 31.20 with identical tricks; you choose Red with the reason "Re-ride declined, judges' call".
4. **"The division's tick boxes".** The visibility boxes are per event today.
   - **Recommendation:** keep the event's boxes as the default and let a division override them.
   - *Beach:* the Youth division never shows live scores, Pro Men does.
5. **Public live pages: polling or realtime?** The docs chose polling every 5–10 s. The free plan allows about 200 realtime connections; officials need about 10, spectators could be hundreds.
   - **Recommendation:** keep polling for the public, and plan realtime for spectators only on a paid plan.
   - *Beach:* 300 people on the public page during the final do not knock the judges' phones off.
6. **How many heats can run at once?**
   - **Recommendation:** one per event by default, as an event setting.
   - *Beach:* a second Start while Heat 3 runs says "Heat 3 is still running — end it first", unless you set 2 for a two-zone event.
7. **Crashes and judges.**
   - **Recommendation:** judges never score a crashed attempt; it scores 0 or is not counted as the model says. A judge who saw a landing presses Flag → "that was a landing", and the head judge changes it.
   - *Beach:* the spotter hits CRASH on a sketchy landing; Judge 1 flags it; you switch it to Landed and the judges' pads appear.
8. **Who may go past the attempt cap?** You wrote "only the head judge"; docs/05 decision 20 also allows an organiser when there is no head judge.
   - **Recommendation:** keep the organiser too, always with a reason.
   - *Beach:* a club event with no head judge, where the organiser adds Red's missed 8th attempt with the reason "spotter missed it".
9. **Spotter "Undo last" within 10 seconds.** docs/06 has it; your list does not.
   - **Recommendation:** keep it. It is the spotter's own last attempt only, within 10 s, and audited.
   - *Beach:* logged Blue instead of Red; undo, log Red.
10. **Merge when both duplicates have a score from the same judge.**
    - **Recommendation:** the merge dialog shows both and defaults to the first-logged attempt.
    - *Beach:* Judge 1 scored 7.0 on one copy and 7.5 on the other; you pick 7.5.
11. **"Simulator and feedback section" of docs/06 does not exist**, and nor does "owner feedback rules". I read them as:
    - beach rule 00.6 (persistent confirmations) and decision 16 (no toasts for officials);
    - the Feedback notes row (the Note button stays off official screens).

    Did you mean a **practice-heat simulator** (a fake spotter feed so one person can test the judge screen)?
    - **Recommendation:** yes. Add it to 5c as an organiser-only "Practice heat" on the demo event, which never touches real events.
12. **Wind calls, heat re-run with suffix "R", Highest Jump metres:** not in this plan.
    - **Recommendation:** wind calls in Phase 6 with the public banner. Re-run (cancel + new heat "3R") in 5c only if you need it for Arrow.

## 12. Repo rules I had to interpret

- **"Server time is truth":** this also covers the organiser's existing Hold / Shift buttons, which use the device clock today. They move to server actions in 5b.
- **"Tests first in doc 08 terms":** the new values in this plan go into a new docs/08 §1G at the start of 5b, before code. This PR may only add one file, so docs/08 is not edited here.
- **"Service role only in server code":** publish needs it (it writes `heat_results` and slots of other heats). Every other head action is a security-definer function that checks the caller, so no service key is used for them.
- **"Mobile first" vs the head console:** rule 00.2 says the matrix is never squeezed onto a phone, so `/head` asks for a tablet or laptop below 900 px.
- **"Re-opened" state:** docs/05 §5 says there is no separate status. Re-open is `published → under_review` plus `reopened_at`, and the next publish is version 2.
- **Routes:**
  - docs/06 names `/judge/[heatId]`. Auto-follow needs the event, so the routes are `/judge/[eventId]` and `/spot/[eventId]`, and a heat can be pinned with `?heat=`.
  - CLAUDE.md's route list allows both.
- **"Correction after a later heat started":** read as "a heat that this result feeds has started" (docs/04 and docs/08 §2F). An unrelated later heat in the run order does not block a correction.
- **Pause:** spotters cannot log while paused (riders are off the water); judges can still score attempts already logged.
- **Dependencies:** none added. IndexedDB, speech and wake lock are browser APIs.

## 13. Not in Phase 5

- Public pages, big screen, rider pages (Phase 6). They only read the functions from step 6.
- Wind calls.
- Highest Jump metres.
- Exports.
- Paper sheets printing.
- Full offline-first.
