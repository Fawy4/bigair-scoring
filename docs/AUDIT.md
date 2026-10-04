# AUDIT

Two self-audits so far, newest first: **1b** (the system: database, screens, security, capacity — this branch) and **1a** (the engines) below it.

# Self-audit 1b — the system, for Gouna

Branch `audit-1b`, 3–4 Oct 2026, product version 0.13.0 → 0.13.1 (this PR only adds tests and this document). No application code and no database object was changed; every problem is a numbered finding (A1b-n) with a severity, a reproduction and a proposed fix, so a separate fix session can take the list. Throwaway organisations only (`rls-…`, `e2e-…`); Arrow, EKL and Demo were read, never written.

## Summary (one page)

**Safe to run Gouna: yes, with these fixes — and not on today's hosting.** The outage during this audit changes the answer from "yes with small fixes" to "only after the hosting is changed": on the free database machine the whole system went down for 1 h 43 min under an ordinary test load, and a load ramp shows it slowing to unusable at 300 spectators.

**Before Thursday (in this order):**
1. **A1b-0 (blocks the event) — hosting of the database.** Move the event's Supabase project to Pro with at least the Small compute, keep test runs off it from Tuesday, and repeat the load ramp on it. No code.
2. **A1b-11 (blocks the event) — hosting of the site.** Vercel Hobby forbids commercial use and its free CPU allowance runs out with about 15–20 spectators over the two days; move to Vercel Pro (cost of the event's usage: a few dollars). The cheapest code change that removes the problem at its root is a shared 5-second cache of the public answers (proposed, not done here).
3. **A1b-3 (annoying, with a procedure) — a withdrawal after the draw is locked does not become a walkover.** The Audit 1a procedure for Thursday ("lock with 24, then withdraw") relies on it. Until it is fixed: the head judge sets **Did not start** for that rider in each heat (tested: it ranks them last with no total and blocks nothing).
4. **A1b-2 and A1b-1 (annoying) — flags and resets.** A reset during a yellow leaves the heat armed (it then starts by itself); switching Flags off a moment after 0:00 un-starts a running heat. Procedure until fixed: Abort before any reset; never switch Flags off while a heat is armed or running.
5. **A1b-16 (annoying) — "Remove" of a rider who already has a seat goes through** and leaves a hole that blocks Start heat. Procedure: always use **Withdrawn**, never Remove, once the draw exists.

**Can wait until after the event:** A1b-18 (Flags cannot be switched off while a yellow is paused: Resume or Abort first), A1b-4 (the console's own +1 min / Pause shows late when realtime is down), A1b-5 (ties for places that do not matter block Publish — a rule question), A1b-7 (strangers' wrong PINs can lock every official out for 10 minutes), A1b-15, A1b-19, and the cosmetic ones (A1b-6, A1b-8, A1b-12, A1b-13, A1b-14, A1b-17, A1b-20, A1b-21). **No finding gives a wrong result** (a wrong placing or total); the scoring and ladder held everywhere they were driven.

**The browser suite on main** (241 tests, one worker, after the outage): 207 passed, 13 failed, 12 skipped, 9 did not run. Re-run alone: 5 of the 13 pass (not real). The 8 real reds are all **tests that are wrong or out of date**, not product faults: the master trick base v7 renamed families (5 specs), the manual has 43 pages not 40 (help), the publish-blockers test builds an accidental three-way tie that the A1a-1 fix now correctly blocks, and the e-mail-link test cannot open the live address from this sandbox. Details in "Part 0".

**#32's open questions:** publish-blockers — the test is wrong, the rule is right (A1b-5); live-scores switch — in **More** on the laptop console and in the heat controls on the phone, and the component is byte-for-byte the one before #31; impression name — empty keeps each division's own name, set overrides it everywhere (unit test added); trick base v7 — the editor spec and the trick-base screenshot set **fail**, because they hard-code the v6 family names (A1b-12); one-pause — **passes** on main (it was a timing red).

**What held up** (each is now a test): the Gouna ladder on the real database (15 heats, seats fill on publish, re-seeding waits for the round, re-run and cancel keep one heat per draw position, Reset event restores the locked copy byte for byte); the start sequence on the server's clock (Start now / Abort at 0:00.3 give exactly one outcome; a dead console phone does not stop the start; every screen agrees on the start to the millisecond; horns once per change and never after a reload; a 40 s clock skew is corrected); concurrency (two heads publishing at once give one version; two Starts give one; 50 queued scores sent twice out of order give 50 rows with the newest revision); security (only the 11 public functions are callable by a visitor and none of them carries a seat id, PIN hash, e-mail or phone; an old PIN is dead after a new one; a deleted event's seat joins nothing; no secret is in the client bundles; every definer function has a fixed search path; RLS is on for every table).

## The outage during this audit (3 Oct 2026, 21:42 – 23:25 UTC)

**What happened.** The hosted project (the one Arrow, EKL and Demo live on) stopped answering. From 21:42 every database query of any size hit the statement timeout (500 / 504), logins and sign-ups timed out ("Gateway Timeout"), and from 22:10 to 23:22 the REST API answered every call with **503 PGRST002 "Could not query the database for the schema cache"** — the app was down for everybody, including the live address (the logs show the production site's own calls failing). Supabase's health check said `rest = UNHEALTHY`, `db = ACTIVE_HEALTHY`. It recovered by itself at about 23:25; no restart was needed (none was done). Time lost for the audit: about 4 h 45 min (the first browser run was contaminated from test ~100 and had to be thrown away; nothing could run until 02:28).

**Cause (from Supabase's own logs and the project's metrics endpoint): the database machine ran out of disk-I/O capacity because it does not have enough memory.**
- The project runs on the free shared compute ("Nano"): **453 MB of memory, 110 MB free** when measured afterwards. Postgres, PostgREST, the login server, Realtime and the pooler share it. The database (30 MB of data, but a 2.5 MB function catalogue plus indexes) does not stay in memory, so it reads from disk all the time: **68 million disk reads in about four days, 50 hours of read time, 5.9 hours of "every process stalled on I/O"**.
- Checkpoints show the moment the disk stopped keeping up. All day a checkpoint wrote about one 8 kB page every 0.1 s (normal pacing, e.g. 538 pages in 54 s at 21:38). At 21:45 it took 176 s for 642 pages; from then until 23:22 it took up to **11 s per page** (3 pages in 33 s at 23:07). At 23:27 it was back to 0.1 s. That is the disk being throttled (the free compute's disk has a small burst allowance that a sustained load drains), not a crash: no restart, no out-of-memory kill, the database answered the management API throughout.
- Once queries waited on the disk, they hit the timeout (first at 21:42:54: a two-column read of `judge_seats`), and PostgREST could not re-read its schema catalogue, so it refused everything with PGRST002.

**Was it my own load?** Partly — it was the last straw, not the size of the load.
- The REST traffic in the five minutes before (21:35–21:42) was my first browser run (2 workers) and the start of the new ladder test: about 4,500 requests in 5 minutes (≈15 per second). The same project carried **more** than that all day without one error (8,186 requests in the 5 minutes at 19:40 ≈ 27 per second; 4,000–6,000 per 5 minutes for most of the afternoon) from the test runs of the day's earlier sessions. What changed at 21:40 was not the request rate but the disk allowance, drained by about 15 hours of test runs (thousands of throwaway organisations, logins, draws and scores written and deleted).
- The 300-pollers and concurrency tests had **not** run yet; they were written but never started before the outage.
- The four #32 migrations had been applied hours earlier (before 21:00) and changed nothing about it: the load at the time was ordinary reads (`get_public_results`, `judge_seats`) and writes, and the same statements had been fast all day.
- Connections were not the limit: 24 connections out of 60, PostgREST's 11 pool connections idle (waiting on the disk, not on a free connection).
- A browser on Windows (the simulator page of the live address, `sim_view_beat` every few seconds) kept polling the whole night; it did not cause it and was not affected by anything but the outage.

**Why it matters for Gouna (A1b-0, blocks the event).** On the beach the same thing happens if the disk allowance is low when the event starts (for example after a day of rehearsals or test runs on that project) or if the event's own load drains it. When it happens, every screen stops: judges' scores queue on the phones, the console cannot publish, the public pages fail. The ramp test below measures how much public-page load the project takes today before the first error.

## Part 0 — The whole browser suite on main, once

PR #32 fixed five browser tests one by one and the full batch was not re-run after those fixes. This is that run: `main` at 0.13.0 (`d6cccc5`), the production build (`npm run build`, `next start`), every spec in `e2e/` except this audit's own, **one worker** (the hosted project had just recovered from the outage; two workers had contributed to draining it). Result: **207 passed, 13 failed, 12 skipped** (production-only, screenshot-only and budget-only specs, as designed), **9 did not run** (serial files stop after their first red; each was then run on its own). Every red was re-run once, alone.

A first run with two workers (3 Oct, 21:34) was thrown away: from about test 100 its setups failed with "Gateway Timeout" from the hosted project (the outage), so none of its reds after that point said anything about the product.

| # | Test | Re-run alone | Verdict | Why (one line) |
|---|---|---|---|---|
| 1 | `flags-controls.spec.ts:83` +1 min within a second on console and Flag view | passed | not real here | The Flag view updated; the console waited for its 5 s fallback poll because websockets are blocked in this sandbox. Underlying behaviour is A1b-4. |
| 2 | `help.spec.ts:9` the manual renders… | failed | **real — test out of date** | It expects exactly 40 manual pages; there are 43 (release tracker 0.10.0, observer 0.12.x, Flags 0.13.0 each added one). Red since 0.10.0, not caused by #32. (A1b-12) |
| 3 | `join.spec.ts:31` a wrong PIN gets a plain message | passed | not real | The sandbox's Supabase forwarding shim (`installSupabaseProxy`) threw "route.fetch: Test ended" for a heartbeat still in flight. |
| 4 | `live-spotter-layout.spec.ts:13` favourite on top… | failed | **real — test out of date** | Expects `base:megaloop` first in the base list; master trick base v7 moved Megaloop into the new **Kiteloop** family. (A1b-12) |
| 5 | `officials.spec.ts:105` print cards | passed (whole file: 5/5) | not real | Same forwarding-shim error at test end. |
| 6 | `organiser-access.spec.ts:29` invite, link, password… | failed | **real here, not a product fault** | The sign-in link redirects to the live address (`bigair-scoring.vercel.app`, the project's Site URL), which this sandbox's browser cannot open (`ERR_CERT_AUTHORITY_INVALID`). On a normal machine it opens the live site, not the local build, so the test cannot pass locally either: it should follow the link's token on `baseURL`. (A1b-12) |
| 7 | `publish-blockers.spec.ts:17` Publish blocked… then no reason needed | failed | **real — test wrong, rule right** | The last blocker is "Blue, Yellow and Green are tied — choose the order": the test gives three riders no landed trick and the same Impression (6.0). Since the A1a-1 fix that is a genuine tie and Publish is correctly blocked. (A1b-5) |
| 8 | `review-console.spec.ts:178` card beside 2 and 3 riders at 15 inches | passed | not real | First run measured a rider row 200 px wider for 3 riders while totals were still arriving; the re-run fitted. |
| 9 | `simulator-polish2.spec.ts:87` simulator Pause / Resume | passed (whole file: 4/4) | not real | Forwarding-shim error at test end. |
| 10 | `trick-base-editor.spec.ts:141` retire a block | failed (timed out twice) | **real — test out of date** | Hard-codes v6 family names; v7 renamed them. The two tests after it: `:172` accept a proposal **fails** (it selects family "Add-ons", now "Board Variations"), `:211` dismiss a proposal **passes**. (A1b-12) |
| 11 | `trick-base.spec.ts:12` five families… | failed | **real — test out of date** | Looks for the group "Add-ons"; v7 calls it "Board Variations". (A1b-12) |
| 12 | `trick-base.spec.ts:50` + Add block… | failed | **real — test out of date** | Waits for `block-addon:late` under the old family layout. (A1b-12) |
| 13 | `trick-layout.spec.ts:17` arrows, Move to…, favourites… | failed | **real — test out of date** | Same Megaloop expectation as #4. (A1b-12) |

Also asked for by #32:
- **`one-pause.spec.ts` passes on main** (149/241, first try). The migration is right; the earlier red was timing (it polls the console every 5 s where websockets are blocked).
- **Trick-base screenshot set** (`npm run manual:shots -- -g "trick base"`): **fails** (timed out after 10 min) at "Move to… Grabs & landings": v7 renamed that family **Landings**. The three screenshots it had already retaken were thrown away (not part of this PR). (A1b-12)
- The master trick base is still at **v7, published, no draft left** after these runs.

## Findings by severity

Fix list for the next session, in order. "Test" names the test in this PR that describes the right behaviour (marked `.fails` where the system is wrong today, so it reports "unexpectedly passed" when the fix lands: then remove `.fails` and delete the matching "… today" test).

### Blocks the event

#### A1b-0 — The hosted project falls over when its small database machine runs out of disk capacity
- **Where:** hosting. The Supabase project (the same one Arrow, EKL and Demo live on) runs on the free shared compute: 453 MB of memory, a burstable disk.
- **What happens:** see "The outage during this audit". Everything stops at once: officials' writes queue on the phones, the console cannot publish, logins fail, the public pages and the live address fail. 1 h 43 min on 3 Oct, recovered by itself.
- **Reproduction:** sustained test traffic for a day, then an ordinary load. The load ramp shows the same limit on demand: `AUDIT_LOAD=1 npx vitest run --config vitest.rls.config.ts tests/rls/audit-1b-load.test.ts` (results below and in `test-results/audit-1b-load.json`).
- **Proposed fix (no code):**
  1. Before Thursday, **Supabase Pro with the Small compute** (2 GB memory, 174 MB/s baseline disk; about $25 + $15 a month, compute billed by the hour, so it can go back down after the event).
  2. **No test suites on the event's project in event week:** a second Supabase project for the RLS and browser tests (their keys come from the environment), from Tuesday at the latest.
  3. Re-run the load ramp on the upgraded project on Tuesday; target: 300 spectators with p95 under 1 s.
  4. On the beach: someone who can open the Supabase dashboard (status, restart), and the head judge told that phones keep scores queued while the server is away.

#### A1b-11 — The hosting plans do not fit the event (Vercel Hobby, Supabase Free)
- **Where:** hosting and the public pages' refresh model (`src/components/public/poll.tsx`, `force-dynamic` pages, `src/lib/public/page-data.ts`).
- **What happens:** every visible public tab redraws its page on Vercel every 7 s and each redraw makes 4 database calls; nothing is shared between visitors. Measured cost and the two-day projection are in "Part 9". On the free plans: Vercel Active CPU (4 h/month) runs out with the officials' screens plus about **15–20 spectators** over two days, function invocations (1 M) at about **100**, Supabase egress (5 GB) at about **⟨egress⟩**, the free database machine degrades from about **100–150** (load ramp). Vercel Hobby is also not allowed for commercial use. Over a free quota the platforms pause or restrict the project (402 / paused deployment), which stops every screen, not only the public ones.
- **Reproduction:** `AUDIT_CAPACITY=1 … npx playwright test e2e/audit-1b-capacity.spec.ts` (per-browser costs) and the load ramp.
- **Proposed fix:** (1) Vercel Pro and Supabase Pro for event week (A1b-0); at 300 spectators the usage is a few dollars. (2) Code, after the plans: one shared 5-second server cache of the public answers per event, so database calls and CPU no longer grow with the number of spectators; slower polling between heats; the Flag view at 2 s. Details in Part 9.

### Wrong result

None found. Every heat these tests published on the database (well over a hundred, rehearsals included) put its winner in the right seat, and the placings agreed with the results and the ladder.

### Annoying

#### A1b-3 — A withdrawal after the draw is locked does not make the seat a walkover
- **Where:** Riders step (`src/app/org/(console)/events/[id]/riders/actions.ts` `saveEntry` / `setEntriesStatus`). `set_draw_walkover` exists in the database and the engine's `withdrawEntrant` computes the walkover, but no screen calls either. docs/04 decisions 13 and 36 and Audit 1a's Thursday procedure ("lock with 24, then withdraw") rely on it.
- **What happens:** setting a rider to **Withdrawn** after the lock only changes `entries.status`. The seat keeps the rider with no modifier, the Draw step shows a "withdrawn" badge, the heat starts with them in it, and Publish is held by "Impression / Variety score missing" for that rider from every judge.
- **Reproduction:** test "A1b-3: setting a rider to Withdrawn after the lock makes the seat a DNS walkover" (`.fails`), "A1b-3 today" (green).
- **Workaround (tested):** the head judge sets **Did not start** for that rider in that heat: ranked last, no total, nothing blocked ("the head judge's workaround works").
- **Proposed fix:** when an entry of a division with a locked draw changes to Withdrawn (or No-show), compute `withdrawEntrant(draw, entry)` and call `set_draw_walkover` in the same server action; refuse if the rider's heat has started (then it is the head judge's DNS). Say so in the Riders step ("Withdrawn after the draw: their seat becomes a walkover").

#### A1b-2 — Every reset goes through during a yellow, and the heat stays armed
- **Where:** `private.running_heat_name` (used by Reset event, Reset this division, Reset this heat, Clear actual times) looks only at `running` / `paused`. An armed heat is `scheduled`; `heats_guard` clears the start-sequence columns only when the status *changes* to scheduled, and it already is.
- **What happens:** Reset this division (or Reset event) while the yellow is up succeeds, and the armed heat goes green by itself at the end of its pre-start, on a freshly reset division. The same for a heat that is green but whose start no phone has written down yet.
- **Reproduction:** test "A1b-2: Reset this division during the yellow is refused (or at least leaves nothing armed)" (`.fails`), "A1b-2 today".
- **Proposed fix:** `running_heat_name` also returns a heat that is `scheduled` with `armed_at` set ("Heat 5 is in its start sequence: Abort first"); and the reset functions set `armed_at`, `prestart_sec`, `armed_paused_at` to null explicitly.

#### A1b-1 — Switching Flags off a moment after 0:00 un-starts a heat that is running
- **Where:** `private.events_flags_off` (migration `20261021100000`) cancels every `scheduled` heat with `armed_at`, without looking at the clock.
- **What happens:** a heat whose pre-start is over is running for every screen and every write gate, but its stored status stays `scheduled` until an official phone writes the start down (`start_armed_if_due`, every 3 s from 0:00). If Flags are switched off in that window (or while every official phone is asleep), the heat goes back to "not started" with the attempts already logged in it.
- **Reproduction:** test "A1b-1: flags off after 0:00 but before the start is written down keeps the heat running from the armed moment" (`.fails`), "A1b-1 today".
- **Proposed fix:** in the trigger, call `private.materialise_armed(h.id)` first and cancel only heats that are still in their yellow.

#### A1b-18 — With a paused yellow, Flags cannot be switched off at all
- **Where:** the same trigger clears `armed_at` and `prestart_sec` but not `armed_paused_at`; the `heats_armed_pair` check then refuses the update, and with it the organiser's whole settings save.
- **What happens:** Event step → Flags off → Save fails with a database error while any heat's pre-start is paused; the heat stays armed.
- **Reproduction:** test "A1b-18: flags switched off while the yellow is frozen…" (`.fails`), "A1b-18 today".
- **Proposed fix:** also set `armed_paused_at = null` in `events_flags_off` (and in `abort_start`, which already does).

#### A1b-16 — "Remove" of a rider who already has a seat goes through and leaves a hole
- **Where:** `heat_slots.entry_id … on delete set null`; the Riders step's "already in the draw" message relies on a 23503 error, which only comes when the rider has attempts or results.
- **What happens:** before the first attempt, Remove deletes the entry, the seat goes empty (`entry_id` null, no source), the stored draw still names the rider, and Start heat is refused "a seat is still waiting for a place" on a locked draw.
- **Reproduction:** test "A1b-16: removing a rider who has a seat in a locked draw is refused" (`.fails`), "A1b-16 today".
- **Proposed fix:** a `before delete` guard on `entries` that refuses (`ENTRY_IN_DRAW`) when any `heat_slots` row names the entry or the division's draw names it; the Riders step already has the sentence. Procedure until then: use Withdrawn, never Remove, once a draw exists.

#### A1b-4 — The console's own +1 min, Pause, Resume and Abort show late when the realtime channel is down
- **Where:** `src/components/live/use-head-controller.ts` `act()` and `src/lib/live/heat-actions.ts`: after a successful heat action the console does not re-read the heat; it waits for the realtime update (or, while the channel is down, its 5 s fallback poll).
- **What happens:** on a beach connection that drops websockets, the head judge presses +1 min and the console still shows the old countdown for up to 5 s while the Flag view (polling every second) already shows the new one. Same for Pause, Resume, Abort. This is what made `flags-controls.spec.ts:83` red in the full run (it passed alone).
- **Reproduction:** `flags-controls.spec.ts:83` in a sandbox without websockets (timing-dependent).
- **Proposed fix:** after each successful heat action, refetch the heat row (or return it from the RPC and merge it into the live state).

#### A1b-5 — A tie for a place that changes nothing still blocks Publish (and the publish-blockers test builds one by accident)
- **Where:** rule: `computeHeat` blocks Publish on every unresolved tie (docs/03 rule 13). Test: `e2e/publish-blockers.spec.ts:17`.
- **What happens:** three riders who land nothing and get the same Impression tie for 2nd–4th in a heat where only the winner goes on; Publish waits for the head judge to order them. That is what the spec says, and since the A1a-1 fix it is what happens. The browser test gives every rider but one Impression 6.0 and no tricks, so it builds exactly that tie and then expects no blocker.
- **Proposed fix:** (test, now) give the three other riders different Impressions. (rule, owner decision, after the event) treat a tie below the last advancing place as shared ("2=") unless the division wants full placings, e.g. a `tieBelowAdvance: "share" | "decide"` scoring setting.

#### A1b-7 — Strangers' wrong PINs can lock every official out of the event for 10 minutes
- **Where:** `private.join_rate_limited`: besides 10 wrong tries per address, **100 wrong tries per event from any addresses** refuse even the right PIN.
- **What happens:** anyone with the event's public address (it is on the join page) can send 100 wrong guesses from rotating addresses and every official, including a replacement judge, gets "Too many tries" for 10 minutes. A crowd on the venue Wi-Fi (one address) trips the per-address limit even faster.
- **Reproduction:** test "A1b-7: wrong guesses by strangers never stop an official with the right PIN from joining" (`.fails`), "A1b-7 today".
- **Proposed fix:** check the PIN before the event-wide limit and let a correct PIN through (the per-address limit still slows guessing); keep the event-wide counter as an alert to the organiser, not a lock; or give the organiser an "Unlock joining" button.

#### A1b-15 — Cancelling a heat that went green by itself records no start and no end
- **Where:** `public.cancel_heat` does not call `private.materialise_armed` first (pause, end and abort do).
- **What happens:** the cancelled heat keeps `started_at` and `ended_at` empty (and its start-sequence columns), so the run order treats it as never run and the re-run's estimates are early by the time it really ran.
- **Reproduction:** test "A1b-15: cancelling a heat that went green by itself keeps its real start and an end" (`.fails`).
- **Proposed fix:** `perform private.materialise_armed(p_heat)` at the top of `cancel_heat` and `rerun_heat`.

#### A1b-19 — A retried score that overtakes the first send is refused ("Failed — tap to retry") although it is stored
- **Where:** `submit_trick_score` upserts `on conflict (attempt_id, judge_seat_id)`, but `trick_scores.client_key` is unique too; two copies of the same queued score arriving together race on `client_key`.
- **What happens:** one copy gets a unique-violation (HTTP 409); `src/lib/live/queue.ts` files it as `failed`, the judge sees the red "Failed" pill for a score that is safe. A phone sends one item at a time, so this needs a retry overtaking a slow first send — exactly what happens when the database is slow (A1b-0).
- **Reproduction:** test "A1b-19: twenty copies of the same queued score at the same moment are all accepted" (`.fails`); the 50-scores-twice test saw it once in 100 sends.
- **Proposed fix:** in `submit_trick_score` (and `submit_impression`), catch `unique_violation` on `client_key` and return the stored row (it is the same score); or treat a 409 on a known client key as synced in the queue.

### Cosmetic

#### A1b-6 — Start now pressed a split second after Abort starts the heat with no yellow; the audit log lists the two the wrong way round
- **What happens:** before 0:00, if Abort reaches the database first, the Start now that follows is a plain Start heat: the heat starts at once with no pre-start. Both are written to the audit log, but each line carries its transaction's start time, so the Start (which waited for the Abort's lock) is listed first. After 0:00 there is exactly one outcome (tested three times at 0:00.3: started at the armed moment, Abort refused "nothing armed", one start line, no abort line).
- **Proposed fix:** Start now sends the armed moment it saw; `start_heat` refuses ("the start sequence was aborted") when the heat is no longer armed. Audit lines: `clock_timestamp()` instead of `now()` for `at`.

#### A1b-8 — An archived event still takes writes from officials who were already joined
- **What happens:** archiving hides the event from the public and from joining, but a spotter already joined can still log attempts and the head judge can still pause heats (test prints `spotterAddAttempt: allowed, headPause: allowed`).
- **Proposed fix:** `private.has_seat` (or the write gates) return false for an archived event.

#### A1b-12 — Eight browser tests are wrong or out of date; they follow live data instead of fixtures
- **What happens:** see Part 0: five trick-base specs and the trick-base screenshot set hard-code master v6 family names and positions (v7 renamed "Add-ons" → "Board Variations", "Grab / landing" → "Landings", moved ten base tricks into a new "Kiteloop" family); `help.spec.ts` counts 40 manual pages (43 since 0.13.0); `publish-blockers.spec.ts` (A1b-5); `organiser-access.spec.ts` follows the e-mail link to the live address.
- **Proposed fix:** the trick-base specs create an event pinned to a test vocabulary (`events.trick_vocabulary_version` → a version saved by the test from `presets/tricks/big-air-vocabulary.json`) and address families by key, not label; help counts the files in `docs/manual`; organiser-access takes the token from the generated link and opens `/auth/confirm?token_hash=…` on `baseURL`.

#### A1b-13 — The RLS suite leaves throwaway organisations behind when its setup fails half-way
- **What happens:** `buildFixture` only returns its `cleanup` once everything is built; a timeout in the middle leaves `rls-a-…` / `rls-b-…` organisations and logins. Six were found from earlier sessions (5:29–6:31 UTC on 3 Oct); the browser suite's sweep only removes `e2e-…`.
- **Proposed fix:** record each created organisation and login as it is made (like the browser ledger) and sweep stale `rls-…` organisations in the RLS global setup.

#### A1b-14 — The Flag view can show a second-old answer after a newer one
- **What happens:** it asks every second without waiting for the previous answer; on a slow connection an older answer arriving last replaces a newer one for up to a second (for example a yellow after an Abort). The 10-second grey rule is right (tested by `flags.spec.ts:168`).
- **Proposed fix:** ignore an answer whose `serverNow` is older than the one shown; one request in flight at a time.

#### A1b-17 — One migration would silently change data if run again by hand
- **What happens:** `20261006100300_ready_call_one_setting.sql` has only idempotent statements, so a hand re-run (SQL Editor, `combined.sql`) would go through and remove every event's "ready call 10 min" setting (back to the default 15). Every other migration either fails early on a second run (create table, add column, create policy…) or guards its data change.
- **Reproduction:** `src/lib/audit-1b-migrations.test.ts` lists it (and fails if another one appears).
- **Proposed fix:** fold the two `readyCallMin` statements into one that only runs while `schedule_plans.defaults` still holds a `readyCallMin` (the state the first run leaves has none, so a second run changes nothing); the test then lists nothing.

#### A1b-20 — Three grey buttons do not say why
- **Where:** organiser dashboard → wind call **All clear** (`src/components/wind-call-control.tsx`, grey while no call is up); Run order → **New plan** and **Duplicate plan** (`schedule-manager.tsx`, grey until a name of two letters is typed).
- **Reproduction:** `e2e/audit-1b-ui.spec.ts` "every grey button … says why — A1b-20" (expected to fail).
- **Proposed fix:** a reason under each, in the house style ("Nothing to clear: no wind call is up." / "Type a name of at least 2 letters."), with its manual line.

#### A1b-21 — The organiser dashboard sometimes logs a hydration warning
- **What happens:** React warning #418 (the server's text and the browser's first draw differ) appeared once in two loads of `/org/events/‹id›`; most likely a time on the page crossing a minute between the two. React redraws; nothing breaks.
- **Proposed fix:** render the clock and "x min ago" texts only in the browser (or with `suppressHydrationWarning` on those spans).

### For the organiser (data, not code)
- **Arrow (`arrow-big-air`) has one run order, Thursday 8 Oct, with 12 of the 15 heats; heats 13, 14 and 15 (the semi-finals and the final) are in no run order yet**, so the public timetable has no times for them. Make Friday's plan (A1a-7 is fixed: copying Thursday now brings only heats that have not ended).
- **Arrow's division "Advanced" was locked before the draw copy existed** (no saved copy): Reset this division / Reset event would *rebuild* it from the current draw rather than restore the locked copy. Before any heat starts, unlock (with a reason) and lock again to take a copy.

## Part 1 — Audit 1a's deferred scenarios, on the database

All on the hosted development project with the real Gouna draw (24 riders, Knockout, heats of exactly 3, one advances, final of 2, by original seeding → 15 heats; KOTA with up to 7 attempts; J1–J3 + a head judge who scores), `tests/rls/audit-1b-ladder.test.ts`:

| Scenario | Result | Test |
|---|---|---|
| Seats fill on publish, fixed ladder | **Holds.** All 15 heats published in a random order within each round: each publish fills exactly the one seat its winner goes to, at once, with the seat saying where it came from (`{round, heat, place: 1}`); no other seat changes; at the end every seat is filled, every heat published, round k+1's riders are exactly round k's winners, and the stored draw has 15 results. | "publishing each heat … fills exactly the one seat", "the final placings agree …" |
| The re-seeded case waits | **Holds.** With "by heat score", publishing 7 of the 8 Round 1 heats fills no Round 2 seat; the 8th fills all 8. | "publishing 7 of the 8 …" |
| Re-run and cancel keep every later seat pointing at exactly one heat | **Holds.** A re-run of a running Round 2 heat: the original is cancelled and owns no draw position, the re-run owns it, and publishing the re-run fills the semi-final seat. A re-run of the re-run: still one owner, the first re-run cancelled. **Cancel heat alone** leaves the cancelled heat owning its position (so the next seat waits) until Re-run hands it over — as documented ("A cancelled heat cannot be started. Re-run it instead."). The database refuses two heats on one position (unique index). | "a re-run of a running Round 2 heat …", "a re-run of the re-run …", "Cancel heat alone …", "the database itself refuses …" |
| Reset restores the locked copy byte for byte | **Holds.** After Round 1 and three Round 2 heats published, a re-run and its cancellation, Reset event gives back the heats (ids, numbers, names, draw positions, lengths, status, every time stamp and start-sequence column empty), every seat (rider, Lycra colour, source, modifier) and the stored draw, identical to the moment of locking (compared as JSON text). | "after Round 1 and Round 2 published …" |
| Hand-set pins survive Clear actual times | **Holds** (the existing tests, re-run): the console's pins and actual starts are cleared, the organiser's pins (lunch, a pinned heat) stay, a pin the console moved stays hand-set when the organiser had set it. | `tests/rls/reset-sections.test.ts` → "Clear actual times" (7 passed) |
| Withdrawals after lock | **Partly.** The locked draw keeps 15 heats and the withdrawn rider's seat stays in place — but it never becomes a walkover (**A1b-3**). The head judge's Did not start works as the workaround. | "A1b-3 …", "the head judge's workaround works" |

Audit 1a's numbered list (1b-1 … 1b-13), where each stands now:
- 1b-1 attempt cap 7, 1b-4 Publish blocked exactly when scores are missing, 1b-9 server time and pauses, 1b-11 score edits audited: covered by the existing RLS tests (`live-spotter`, `publish-blockers`, `live-publish`, `live-heat`, `rls`); the full RLS suite was **not** re-run in 1b (to spare the project after the outage); the pause rule is re-checked here ("pause inside the last minute and resume with 20 s left").
- 1b-2 off-step scores: fixed in 0.11.1 (A1a-3), `score-step.test.ts`.
- 1b-5 ties: still blocked until the head judge decides (`live-publish.test.ts`); see A1b-5 for ties that do not matter.
- 1b-6 publish → next seat: holds (above); a correction after the next heat started is a conflict (`live-publish.test.ts`).
- 1b-7 lock before withdrawals: A1b-3.
- 1b-10 re-run: holds (above).
- 1b-12 offline judge: `live-judge.spec.ts` ("20 s offline and a reload lose and duplicate nothing") passed in the full browser run; the 50-queued-scores test here holds, with A1b-19.
- 1b-13 copy plan: fixed in 0.12.0 (A1a-7).
- **Not re-tested in 1b:** 1b-3 (the head judge's marks are in the mean — the Gouna world scores with all four seats but gives them the same marks, so it cannot tell) and 1b-8 (the public timetable's `round_last` / break inputs against the stored draw).

## Part 3b — Flags and the start sequence

Pure logic (`src/lib/live/audit-1b-flags.test.ts`, 11 green) and on the database (`tests/rls/audit-1b-flags.test.ts`, 10 green + 3 `.fails`):
- **The server-derived state at every moment holds.** Sampled every quarter second through a whole sequence (1:00 pre-start, 10:00 heat, 1:00 last minute): Stopped → Before start → Running → Last minute → Finished, each exactly once; 2,000 random reloads give exactly the state of a screen that never reloaded (nothing is remembered on the device).
- **Start now and Abort at 0:00.3: exactly one outcome**, three times: the heat starts at the armed moment (to the millisecond), Abort is refused "nothing armed", one `heat_started` audit line, no abort line. **At 0:00 − 0.3 s** both can succeed (A1b-6).
- **A console phone that dies during the yellow:** at 0:00 the write gate opens with nobody pressing (a spotter logs at 0:01.5), the public timetable (the Flag view's source) already says running from the armed moment, and the first judge phone writes the start down at exactly that moment; a second phone changes nothing. Flag view and judges agree to the millisecond.
- **Horns:** one at green, one at the last minute, two at the finish, none at the yellow, an Abort or a pause, one at Resume; 500 screens reloading at random never sound twice for one change and never right after a reload.
- **Flag view cut off at green turns grey within 10 s and never shows a stale green:** `flags.spec.ts:168` passed in the full run; A1b-14 for the one-second window.
- **40 s clock skew:** with the offset of one round trip, a phone 40 s slow or fast shows the same flag and the same countdown (±0.2 s) at every moment; without the offset (server clock not reached yet) it would show yellow 40 s too long — the screens do use the offset (`use-server-clock.ts`, the Flag view's own offset).
- **Pause inside the last minute and resume with 20 s left:** red Paused with 0:20 standing still, Last minute again with 0:20 after Resume, finish moved by the pause (pure); on the database the clock carries on from 20 s (the pause is rounded up to whole seconds, never down).
- **Flags switched off while a sequence runs:** a running yellow is cancelled and nothing is left armed; nothing can arm while off — but see A1b-1 (just after 0:00) and A1b-18 (a paused yellow: the save is refused).
- **The pre-start never changes the run order's estimates:** the run order's input (`livesFor`) is identical for an armed, a frozen and a plain heat.
- **The strip on 390 × 844 judge and spotter screens:** `flags.spec.ts:122` (Normal) passed; the UI-invariants spec here measured that nothing scrolls (Part 7). Large text was not measured separately in 1b.
- **Review bar and Impression card:** a judge who never gave an Impression shows "—" in every cell, counts as missing, and the panel mean is the other judges'; an Absent judge shows "Absent", is not in the mean and is not missing; riders who did not start or were disqualified need none; a 5-rider heat with 4 judges never asks for more room than the reserved row and becomes the button at 1280 px (`src/lib/live/audit-1b-review.test.ts`).
- **Release result** appears only for a held heat (`ReleaseButton` returns nothing otherwise) and releasing is one database call (`set_publish_hold`), tested by `rls.test.ts` → "publish hold".
- **The live-scores switch:** laptop console → **More · details** → **Live scores** (Follow division / On / Off); phone → in the heat controls under Publish. `VisibilityBox` is byte-for-byte the component of 0.11.x (before #31); only Release moved beside Publish. Behaviour and rights: `live-visibility.test.ts` → "live scores follow the heat's switch…".
- **one-pause:** passes on main (Part 0). Not a finding.

## Part 4 — Concurrency and the beach

`tests/rls/audit-1b-concurrency.test.ts` (5 green, 1 skipped scenario) and the flags file:
- **Two spotters log the same rider in the same instant:** two attempts, numbered 1 and 2, no gap or clash, and the second is flagged as a possible duplicate (1 flagged).
- **A judge scores an attempt in the same second the head judge deletes it:** the attempt ends deleted; the score that got in is stored on a deleted attempt, which the console and Publish never read (they skip deleted attempts) — inert.
- **Two heads press Publish together:** one version, one set of results.
- **Start on two heats at once:** exactly one starts; the other is refused "a heat is already running". **Arm two at once:** exactly one yellow.
- **20 s offline then 50 queued scores sent twice, out of order:** exactly one row per attempt, the newest revision wins; once in 100 sends a copy was refused on `client_key` (A1b-19).
- **300 public pollers while a heat publishes:** every poll answered, none saw a half-written result (all three riders or none); p50 222 ms, p95 431 ms, max 599 ms (300 requests spread over 3 s).
- **A phone 40 s off the server clock:** Part 3b; also `live-head.spec.ts:139` passed in the full run ("even when the phone's own clock is 40 s fast").
- **The realtime channel dropping and resuming mid-heat** (scenario, not automated here — websockets are blocked in this sandbox, so every browser test already runs in the "channel down" mode): expected and implemented — while a channel is down each screen asks again every 5 s (`use-live-heat.ts`), and on every (re)connection it refetches the snapshot before applying pushes, so nothing is lost; `live-realtime.test.ts` checks the push path on the hosted project. The one visible effect is A1b-4.

## Part 5 — Security

`tests/rls/audit-1b-security.test.ts` (6 green + 1 `.fails`), a read-only catalogue sweep of the hosted database, and a scan of the production build:
- **Every table has RLS on** (catalogue: no table without it); **every security-definer function has a fixed search path** (none without).
- **What a visitor can call:** exactly 11 functions (`get_public_draw`, `_event`, `_events`, `_live_heat`, `_organisation`, `_results`, `_rules`, `_site`, `_timetable`, `public_platform_settings`, `server_now`); called on an event full of scores, none returns a seat id, `pin_hash`, `qr_token`, `judge_seat_id`, an e-mail or a phone number. The one view a visitor can read (`v_entries`) filters on public events and has no contact columns. Per-judge scores and held results: covered by the existing `live-visibility` and `public-site` tests (not re-run in 1b).
- **PIN flow:** an old PIN is dead the moment a new one is set; a deleted event's seat is gone and its PIN joins nothing (the join page answers "wrong PIN"); 10 wrong PINs from one address lock that address (re-checked); **A1b-7** for the event-wide lock. Brute force: 6-digit PINs, at most 100 wrong tries per event per 10 minutes, so about 14,000 guesses a day against ~7 live seats ≈ 10 % chance a day for a determined attacker who also accepts locking everybody out — fix A1b-7 with a correct-PIN bypass, not a higher limit.
- **Roles** (anon, rider/spectator = visitor, judge, spotter, head, observer, organiser of another organisation, archived event, simulation event): the existing suites cover each (`rls`, `observer`, `organiser-access`, `live-visibility`, `simulator`, `platform`; not re-run in 1b); re-checked here: the archived event (**A1b-8**).
- **Impersonation leaves traces:** `platform.test.ts` → "Open as this organiser" (audited start and stop, expiry); not re-run in 1b.
- **The e-mail link reuse:** sign-in links are Supabase's one-time links; `organiser-access.spec.ts` checks the reuse is refused, but it cannot run in this sandbox (Part 0, #6). Scenario: a link opened twice → the second opening lands on the sign-in page with "link expired".
- **Secrets in client bundles or logs:** the service key, the access token and the database password appear in no file of `.next/static` (searched by value, nothing printed); the only matches for the variable names are the error sentence that tells the owner which setting to check and supabase-js's key-prefix test. No `console.*` in application code prints a key, token, PIN or password.

## Part 6 — Data integrity

`tests/rls/audit-1b-integrity.test.ts` (4 green + 2 `.fails`), `src/lib/audit-1b-migrations.test.ts`, and a read-only sweep of the whole hosted database:
- **Orphans (whole database, 4 Oct):** no plan row names a missing heat or another event's heat; no score on a deleted attempt; no result on an unpublished heat; no published heat without results; no re-run whose original is not cancelled; no stale start sequence; no seat bound to a deleted login; no seat naming another division's rider; no running heat older than a day. Leftovers found: one live attempt on Demo's cancelled heat 1 (Demo's seeded data), three attempts on scheduled heats of old `rls-…` fixtures (A1b-13), and Arrow's three heats in no run order (organiser note).
- **A deleted division, rider or seat mid-event:** a division with heats cannot be deleted; a seat with scores cannot be deleted; a rider with attempts cannot be removed — **but a rider with a seat and no attempt can (A1b-16)**.
- **Migrations re-applied twice:** A1b-17.

## Part 7 — UI invariants (quick)

`e2e/audit-1b-ui.spec.ts`, one throwaway event with the live world plus a division with 0 riders, one with 1 rider, one with 41 riders whose names mix Arabic script and emoji, and a running heat with a 60-character trick name ("Double Handle Pass Kiteloop Board-Off Late Backroll To Blind"):
- **No page throws**: every public tab (home, live, results, ladder, riders, a rider page, rules, placings, the Flag view, the big screen) and every organiser step (dashboard, Event, Divisions, Riders, Rider links, Draw, Officials, Run order, Simulate) loads with no uncaught error and no error screen. Once, the organiser dashboard logged React's hydration warning #418 (A1b-21).
- **The 60-character trick name** shows on the head judge's console without pushing the page sideways.
- **Judge and spotter phones at 390 × 844, Normal text, flags on, a heat running: nothing needs scrolling**, up or sideways.
- **Every grey button explains itself:** not quite — three do not (A1b-20); the head console's all do.
- **Every refusal sentence has a Learn more link:** enforced by the existing unit tests (`src/lib/manual/*.test.ts`: a refusal sentence or database code missing from the manual fails the suite), green.

## Part 8 — Event-day rehearsal at ×20

⟪rehearsal⟫

## Part 9 — Event-day capacity against the hosting plans (A1b-11)

**How each screen reaches the database** (from the code, confirmed by the measurement):
- **Public pages** (home with the run order, live heat, results, ladder, rider page, placings, rules) and the **big screen**: browser → Vercel only. Every 7 seconds (the event's "live update", default 7, minimum 3) a visible tab asks Vercel to redraw the page (`router.refresh`, `src/components/public/poll.tsx`); a hidden tab asks nothing. Each redraw is one Vercel function invocation that calls the database 4 times as a visitor (`get_public_site`, then `get_public_timetable`, `get_public_results`, `get_public_rules`; the live tab adds the server-only live view: 5). Nothing is cached between visitors (`force-dynamic`). No realtime connection, no login.
- **Flag view** (/e/‹event›/flag): browser → Vercel every **1 second** (`/flag/data`), each one invocation with the same 4 database calls.
- **Officials** (judge, spotter, head judge, announcer, observer): browser → database directly (Supabase client in the phone), one realtime connection each, plus the server clock once a minute, the "write the start down / end at 0:00" calls every 3 s while a heat is due, and the send queue. Vercel serves only the page load and the head judge's server actions (publish, corrections). While the realtime channel is down a phone asks again every 5 s.

**Measured, one browser for one minute** (production build in this sandbox, `e2e/audit-1b-capacity.spec.ts`, poll 7 s; server CPU from the app server's own process; bytes are the uncompressed bodies, the wire carries them gzipped):

| Screen | Requests to the app / min | KB / min (uncompressed) | App server CPU / min | Straight to the database |
|---|---|---|---|---|
| Public home (run order) | 8 | 52 | 0.67 s | none |
| Public live heat | 8 | (streamed, not measurable here) | 0.45 s | none |
| Public results | 8 | 21 | 0.44 s | none |
| Public ladder | 8 | 44 | 0.61 s | none |
| Public rider page | 8 | 62 | 0.45 s | none |
| Big screen | 8 | 19 | 0.97 s | none |
| Flag view | 60 | 118 | 2.0 s | none |
| Judge phone (heat running) | 0 | — | — | 125 requests, 283 KB* |
| Spotter phone | 0 | — | — | 125 requests, 271 KB* |
| Head judge laptop | 0 | — | — | 131 requests, 251 KB* |

\* websockets to Supabase are blocked in this sandbox, so these are the "realtime channel down" numbers (asking every 5 s). With realtime working on the beach they are a few requests a minute plus the realtime messages.

So one spectator costs about **8.6 Vercel invocations, 0.5–1 s of server CPU and 35–43 database calls a minute**; a Flag view costs 60 invocations, 2 s of CPU and 240 database calls a minute.

**Projection: two days of 8 hours (960 minutes), 12 officials, 2 Flag views, 1 big screen, and 50 / 150 / 300 spectators with the page open the whole time** (an upper bound: a phone in a pocket asks nothing):

| Quota | Free / Hobby limit | 12 officials + screens | + 50 spectators | + 150 | + 300 | Pro |
|---|---|---|---|---|---|---|
| Vercel function invocations | 1 M / month | 0.13 M | 0.55 M | 1.37 M (**137 %**) | 2.6 M (**260 %**) | $0.60 per M → under $2 |
| Vercel Active CPU (≈ 0.6 s per spectator-minute, 2 s per Flag-view-minute) | 4 h / month | 1.2 h | 9.2 h (**230 %**) | 25 h (**625 %**) | 49 h (**1,225 %**) | $0.128 per h → about $6 at 300 |
| Vercel Fast Data Transfer (≈ 1–2 KB gzipped per refresh) | 100 GB | < 1 GB | 1 GB | 2–3 GB | 4–5 GB | fine |
| Vercel Fast Origin Transfer (same bytes, function → CDN) | 10 GB | < 1 GB | 1–2 GB | 3–5 GB | 6–10 GB (**up to 100 %**) | fine |
| Supabase database calls/s (peak, not a quota) | measured breaking point ≈ 60 public calls/s on the current free compute | 2/s | 7/s | 22/s | 43/s for pages + 4 per Flag view | Small compute: re-measure |
| Supabase egress (database → Vercel: the four public answers, 28 KB raw / 5.8 KB gzipped per refresh for the whole Gouna event; officials' phones with realtime) | 5 GB / month | ≈ 1 GB | 3.4 GB (68 %) | 8.2 GB (**164 %**) | 15.5 GB (**310 %**) | 250 GB |
| Supabase realtime peak connections | 200 | 12–15 | 12–15 | 12–15 | 12–15 (spectators use none) | 500 |
| Supabase realtime messages (every change × every official subscribed: ≈ 130 changes a heat × 12 phones × 15 heats) | 2 M / month | ≈ 25 k | same | same | same | 5 M |
| Supabase monthly active users (each official phone is an anonymous login) | 50,000 | 12–30 | same | same | same | 100,000 |

**The breaking point of today's database machine** (load ramp, `tests/rls/audit-1b-load.test.ts`, 4 Oct 02:40 UTC, after the outage; every spectator = one page refresh every 7 s = 4 public calls; 60 s per level; latency measured at the client and, in brackets, Supabase's own server-side time from its edge logs):

| Spectators at once | Public calls / s served | p50 | p95 | max | Errors |
|---|---|---|---|---|---|
| 50 | 29 | 312 ms (122 ms) | 406 ms (169 ms) | 2.3 s | 0 |
| 100 | 57 | 321 ms (121 ms) | 387 ms (168 ms) | 0.8 s | 0 |
| 150 | 86 | 386 ms (135 ms) | 2.7 s (471 ms) | 6.5 s | 0 |
| 300 | 124 (needs 171) | **7.4 s** (0.6–2.2 s) | **18 s** (7.7–9.8 s) | 35 s | 0 |

No request failed, but from 150 the slowest answers take seconds and at 300 a single refresh takes longer than the 7 s between refreshes: the pages fall behind and the machine runs short of memory again (free memory 71 MB, disk reads up by 100,000 a minute). It did not fall over this time (the disk allowance had refilled overnight); it would on a day that has already drained it.

**What happens when a free quota runs out:**
- *Supabase Free:* an e-mail, a grace period, then the Fair Use policy: requests answered **402** and the project restricted until the next billing cycle or an upgrade (supabase.com/docs/guides/platform/manage-your-usage/egress). Every screen would stop. A free project is also **paused after a week of inactivity**.
- *Vercel Hobby:* Hobby cannot buy extra usage; "sustained usage past these limits can lead to a paused deployment" (vercel.com/kb/guide/why-is-my-account-deployment-blocked). A paused deployment is the whole site, officials' screens included (their pages are served by Vercel). And **Hobby is for non-commercial personal use only** (vercel.com/docs/limits/fair-use-guidelines): a brand's launch event with a commercial roadmap needs Pro.

**Headroom per quota on the free plans** (spectators on average over the two days): Vercel Active CPU about **15–20** (the CPU per refresh was measured on this sandbox's processor; Vercel's may differ by a factor of two either way), Supabase egress about **80**, function invocations about **100**, Supabase's free compute degrades from about **100–150 at the same moment** (load ramp below); realtime connections, realtime messages and MAU have more than 10× headroom.

**Cheapest changes, in order (proposed, not implemented here):**
1. **Hosting plans for event week:** Vercel **Pro** ($20, also fixes the commercial-use rule) and Supabase **Pro + Small compute** (A1b-0). This alone covers 300 spectators for a few dollars of usage.
2. **Cache the public answers for everybody** instead of drawing each visitor's page separately: one shared server cache of the four public calls per event, refreshed every 5 s (e.g. Next's `unstable_cache` with a 5 s revalidate keyed on the event, or a short `s-maxage` on a public JSON route the pages read). Database calls then no longer grow with the number of spectators (≈ 1 per 5 s per event instead of 43 per second at 300), and Vercel CPU drops by most of the render cost.
3. **Poll slower when nothing is running:** 7 s while a heat runs, 30 s between heats, 60 s on the results/ladder/rider tabs (the event setting already exists; make it depend on the state). Halves the invocations of a typical day.
4. **Flag view at 2 s instead of 1 s**, and only the flag fields (no riders list after the first answer): halves the most expensive single screen. The 10 s grey rule still holds.
5. Smaller payloads: `get_public_results` returns every heat's full breakdown on every refresh; the live tab needs one heat.

#### Platform quotas (published 3 Oct 2026)

| Platform | Quota | Free / Hobby | Pro | What happens over the free quota |
|---|---|---|---|---|
| Supabase | Egress (database → Vercel and → officials' phones; Realtime included) | 5 GB / month (+ 5 GB cached) | 250 GB, then $0.09/GB | e-mail, a grace period, then the Fair Use policy: requests answered **402**, projects restricted or paused until the next billing cycle or an upgrade |
| Supabase | Realtime peak concurrent connections | 200 | 500, then $10 per 1,000 | same |
| Supabase | Realtime messages | 2 M / month | 5 M, then $2.50 per M | same |
| Supabase | Monthly active users (anonymous official logins count) | 50,000 | 100,000 | same |
| Supabase | Database size | 500 MB | 8 GB | read-only |
| Supabase | Compute | shared "Nano" (no add-on on this project) | Micro included ($10 credit) | no quota, but see A1b-10 |
| Supabase | Inactivity | paused after 1 week idle | never paused | — |
| Vercel | Function invocations | 1 M / month | $0.60 per M | "sustained usage past these limits can lead to a paused deployment"; Hobby cannot buy more |
| Vercel | Active CPU | 4 h / month | $0.128 per h | same |
| Vercel | Fast Data Transfer (browser ← Vercel) | 100 GB / month | 1 TB, then from $0.15/GB | same |
| Vercel | Fast Origin Transfer (Vercel CDN ← function) | 10 GB / month | from $0.06/GB | same |
| Vercel | Commercial use | **not allowed on Hobby** ("restricted to non-commercial personal use") | allowed | account action |

Sources: supabase.com/pricing, supabase.com/docs/guides/platform/manage-your-usage/egress, supabase.com/docs/guides/platform/cost-control, vercel.com/pricing, vercel.com/docs/limits/fair-use-guidelines, vercel.com/kb/guide/why-is-my-account-deployment-blocked.

## Test files of this audit (new; nothing else changed)

Unit (run by `npm test`):
- `src/lib/live/audit-1b-flags.test.ts` — 11 green (state at every moment, reloads, horns, 40 s skew, pause in the last minute, run-order input).
- `src/lib/live/audit-1b-review.test.ts` — 4 green (Impression card: judge with no Impression, Absent judge, DNS/DSQ riders, 5 riders at 1280 px).
- `src/lib/public/audit-1b-impression-name.test.ts` — 3 green.
- `src/lib/audit-1b-migrations.test.ts` — 2 green (fails if a new migration would silently re-apply data changes; A1b-17).

Database, hosted development project (run by `npm run test:rls`; throwaway organisations, removed afterwards):
- `tests/rls/audit-1b-world.ts` — the Gouna world (24 riders, 15 heats, 4 panel seats) shared by the files below.
- `tests/rls/audit-1b-ladder.test.ts` — 13 green, 1 `.fails` (A1b-3); writes `test-results/audit-1b-sizes.json`.
- `tests/rls/audit-1b-flags.test.ts` — 10 green, 3 `.fails` (A1b-1, A1b-2, A1b-18).
- `tests/rls/audit-1b-security.test.ts` — 6 green, 1 `.fails` (A1b-7).
- `tests/rls/audit-1b-concurrency.test.ts` — 5 green, 1 skipped scenario (A1b-19, timing-dependent).
- `tests/rls/audit-1b-integrity.test.ts` — 4 green, 2 `.fails` (A1b-15, A1b-16).
- `tests/rls/audit-1b-rehearsal.test.ts` — ⟪rehearsal-count⟫.
- `tests/rls/audit-1b-load.test.ts` — the load ramp; runs only with `AUDIT_LOAD=1` (it loads the shared project); writes `test-results/audit-1b-load.json`.

Browser (run by `npm run test:e2e`):
- `e2e/audit-1b-ui.spec.ts` — 4 green, 1 expected to fail (A1b-20).
- `e2e/audit-1b-capacity.spec.ts` — the per-browser measurement; runs only with `AUDIT_CAPACITY=1` (and `NEXT_SERVER_PID` for the CPU column).

A test marked `.fails` (Vitest) or `test.fail` (Playwright) describes the correct behaviour and fails today; when the fix lands it reports "unexpectedly passed", and the fix session removes the mark and deletes the matching "… today" test, which pins down today's behaviour.

---

# Self-audit 1a — the engines, for the Gouna configuration

Branch `audit-1a`, 3 Oct 2026, product version 0.10.1. Scope: the scoring, ladder and timetable engines, unit level only, for the configuration we run on Thursday. No application code or database was changed; every problem is a numbered finding below for a separate fix session.

## Fix session 1 (0.11.1): A1a-1 and A1a-3 fixed, A1a-4 / A1a-5 left

- **A1a-1 fixed.** `higherFirst` in `rank.ts` now returns 0 when both values are equal, so "no value" against "no value" (−∞ against −∞) is a genuine tie for every tie-breaker. Two riders with no counted trick on the same total are flagged tied, the explanation says the tie is open, and Publish is blocked for a head judge decision. The audit's `.fails` test is a normal test, the "today" test is gone, and the random-heat comparison no longer skips these heats. New: `tie-no-value.test.ts` (a final of 2 where both crash everything, two riders on 0.00, each tie-breaker alone, the head judge's decision).
- **A1a-3 fixed, and it was reachable** (answer to scenario 1b-2, found by reading every write path):
  - *Judge pad, tapped:* cannot produce an off-step value. *Typed:* `parsePadInput` refuses it before Save (Save greys out, the box outlines red, no sentence). So not through the normal screen.
  - *But the judge pad sends straight to the database* (`submit_trick_score`, `submit_impression`, no server action in between) and **those functions checked nothing**; the table policies also let a seat write the tables directly, and `numeric(5,2)` accepts 7.25. A pad on a stale cached app, a queued score that outlives a step change in the Scoring settings, or a hand-built request would store 7.25 and blank the heat's totals.
  - *Head judge sheet entry, Save and submit, correction:* refused by the server action (`checkImpression` / `checkTrickScore`), but `head_set_trick_score` / `head_set_impression` themselves checked nothing.
  - *Simulator's virtual judges:* snap to the step (`snapToStep`) and call `submit_*`, so safe, and now double-checked.
  - **Fix at both ends.** Server: migration `20261019100000_fix_audit_1a_score_step.sql` adds the check (the division's own scale, overrides included) to the four write functions and to a trigger for direct table writes by signed-in users; refusals are `SCORE_OFF_STEP: step|below|above` and `SCORE_OUT_OF_RANGE: low|high`, shown as "That score is not on the 0.1 step. Use 7.2 or 7.3." and "That score is outside the scale (0 to 10)." with their Learn more link in the manual. The head judge's server action gives the same sentences. Engine: `computeHeat` never throws for a mark any more. An off-step value is counted as the nearest step (halves up), a value outside the scale as the nearest end, both written in the rider's explanation; something that is not a number, or a criteria mark that cannot be read, is left out (that judge is then "missing", which blocks Publish). `judgeTrickScore` stays strict. New: `off-step.test.ts`, extended `head-validate.test.ts`, `tests/rls/score-step.test.ts` and `tests/rls/score-flow.test.ts` (a whole heat through the real write functions as signed-in users, then Publish), both run against the hosted project after the migration was applied. The migration's check function was run on a throwaway Postgres 16 against 21 cases (on step, off step, outside, NaN, partial criteria, a 0.5 step override, a missed mark, the owner path) and gave the expected result in each.
  - *Not done, for Polish 2b:* the typed pad refuses silently. The judge sees the red box but no sentence; an off-step typed value could name the step (the text is ready in `copy.liveErrors.codes.SCORE_OFF_STEP`). The engine's rounded-mark note is in the explanation only: it is not a Publish blocker and the head console does not highlight it.
- **A1a-4 and A1a-5 left for after the event, on purpose; decision of the owner (3 Oct 2026): "never shorter than asked".** They do not come from the same helper: Shift truncates the projected start to HH:MM (`actions.ts`), the badge uses `Math.round` of the exact difference (`drift.ts`). The owner chose the same rule as the +1 minute and Pause break buttons: when the next heat's projected start has seconds, Shift +N rounds **up** to the next whole minute, so it never moves the heat less than N minutes. **Consequence to know on the day: the board (which shows HH:MM, seconds dropped) may then show N + 1 minutes of movement** (for example a heat projected at 10:18:40, Shift +5, now starts 10:24, where the board showed 10:18 before). The lateness badge (A1a-5) can still differ by 1 minute from the two times on the board for the same reason. When this is built after the event: Shift uses `roundUpToMinute` as `extendBreak` does (A1a-4), and the badge is worked out from the two displayed minutes (A1a-5). Their three tests stay `.fails` until then.
- **Still open as before:** A1a-2 (handled by procedure: lock the draw with 24 first) and A1a-6 (rule question). **A1a-7 (copying a plan) is fixed in Polish 2b (0.12.0)**: a copy brings only the heats that have not ended and never the other day's breaks or pins. **The silent typed-pad refusal is fixed in Polish 2b** too: the pad shows the server's sentence under the box.

## Summary (one page)

**Engines safe for Gouna: yes, with these fixes.**

- **Fix in code before Thursday (small):** A1a-1. Two riders on the same total who both have no counted trick (for example both crashed everything and got the same Impression) are not treated as tied. The engine says the tie was "resolved by highest counted trick", ranks them in slot order, and Publish is not blocked. In a heat of 3 where only the winner goes on, that picks the wrong rider. The fix is one line in `rank.ts`.
- **Handle by procedure on Thursday (or the owner decides a rule change):** A1a-2. With "exactly 3 per heat", one withdrawal before the draw is locked (24 → 23) turns Round 1 into 11 heats, 10 of them 1 v 1, and the event goes from 15 heats to 19. **Procedure:** confirm (lock) the draw with all 24 riders, then record no-shows as DNS. A locked draw keeps 15 heats, and a heat of 3 runs with 2.
- **A1a-7: fixed in Polish 2b (0.12.0).** (Until then: don't use "Copy Thursday's plan to Friday". Build Friday's run order from Friday's heats only. A copied plan shows Thursday's heats again, runs Thursday's lunch break again on Friday morning (pushing the 10:00 first heat to 10:20), and the drift badge reads hours early..) Now a copy brings only the heats that have not yet ended and never the other day's breaks or pins; the page says "Copied ‹n› heats — add this day's breaks and the first heat's pin".
- **Can wait until after the event:** A1a-3 (one bad score value blanks the whole heat), A1a-4 (Shift +N can be up to 59 s short), A1a-5 (drift badge can be 1 min off the times on the board), A1a-6 (the Impression tie-breaker can never decide in this preset).

What held up (each is now a test in the suite):
- **Scoring:** 3,000 random heats scored by `computeHeat` and by a brute-force scorer written from the rules (whole-hundredths arithmetic) agree on every total, component, counted trick, place and publish blocker. The only exception is A1a-1. These invariants held: totals never negative, at most 3 counted, a crash never counts, nothing past attempt 7 counts, an Absent judge leaves the mean over the judges who scored, an off-panel score changes nothing, and the explanation text matches the numbers.
- **Ladder:** at N = 24, 23, 22, 21 and 20, with 20 random results each, every rider is placed exactly once and every heat is within the planner's documented sizes. No round before the final has one heat. Every winner sits where the ladder says, N = 24 pairs adjacent heats 8 → 4 → 2 → final of 2, and N = 21 ends in a final of 3. The custom ladder checker raises every one of its 19 documented faults and never throws on 500 random ladders.
- **Timetable:** 1,500 random states of the two Arrow days, with pins, holds, running heats with seconds and pauses, a cancelled heat, a re-run, a heat with no length, a dangling row and a note. In every state it never throws, End = Start + length, and next Start = End + break + warm-up (or the pin, or now). A pin means "not before", and the +1 min and Pause break rules round up to a whole minute. The drift badge equals its own arithmetic, and on 600 states the organiser and public timetables give identical times, finish and drift.

Test files (new, nothing else changed):
- `src/lib/engine/scoring/audit-1a-gouna.test.ts`: 21 passing, none marked `.fails` (A1a-1 and A1a-3 fixed in 0.11.1)
- `src/lib/engine/ladder/audit-1a-gouna.test.ts`: 28 passing, 1 marked `.fails` (A1a-2)
- `src/lib/engine/schedule/audit-1a-gouna.test.ts`: 13 passing, 2 marked `.fails` (A1a-4, A1a-5); A1a-7 fixed in Polish 2b

A test marked `.fails` describes the correct behaviour and fails today. When the fix lands, vitest reports it as "unexpectedly passed", and the fix session then removes `.fails` and deletes the matching "… today" test, which pins down the current wrong behaviour.

### The configuration audited
- 24 riders, Knockout, heats of exactly 3 (target 3, minimum 3, maximum 3), 1 advances, final of 2, "By original seeding" (adjacent pairing), template `heats4-top2-single-elim` with those parameters.
- Warm-up 5 + heat 10, 3 min between heats, 5 min after the last heat of a round; 15 heats over two days (Thursday R1 with a lunch break, Friday R2, SF, Final), Africa/Cairo.
- 3 judges plus a head judge who also scores: 4 scores per attempt. `trimMinJudges` is 5, so this is a plain mean with no trimming. 1–2 spotters.
- Preset `kota-best3-impression` with `heat.maxAttemptsPerRider = 7`: 4 criteria 0–10 on the 0.1 step, best 3 tricks plus Impression (0–40), tie-breakers highest counted → next counted → Impression → most landed → head judge. Published after review.

## Findings by severity

### Blocks the event

#### A1a-2 — One withdrawal before lock turns Round 1 into 1 v 1 heats and adds 4 heats
- **Where:** `src/lib/engine/ladder/knockout-plan.ts` (`knockoutLayout`), `seeding.ts` (`feasibleHeatCounts`). The behaviour is documented (docs/04 decision 33, test 2G7), so this is a risk of the rule, not a coding slip.
- **What happens:** with minimum = maximum = 3, any field that is not a multiple of 3 cannot be split into heats of 3. The planner then runs the whole round as heats of 2:

  | Riders | Round 1 | Heats in the event |
  |---|---|---|
  | 24 | 8 × 3 | 15 |
  | 23 | 10 × 2 + 1 × 3 | **19** |
  | 22 | 11 × 2 | **19** |
  | 21 | 7 × 3 | 11 (final of 3) |
  | 20 | 10 × 2 | **18** |

  Four extra heats at 18 min each (warm-up 5 + heat 10 + 3 break) is about 72 minutes more. Most Round 1 riders also get a 1 v 1 instead of a heat of 3.
- **Reproduction:** `expandFormat(GOUNA, makeEntrants(24))`, then `withdrawEntrant(draw, "r1")` while the draw is still `draft`. Round 1 has 11 heats. Test: "A1a-2: one withdrawal before lock…" (`.fails`) and "the heat count for each N".
- **Proposed fix:**
  1. **For Thursday (no code):** confirm the draw with 24 riders before anyone withdraws. After `lockDraw`, a withdrawal is a DNS walkover: still 15 heats, and the heat of 3 runs with 2. A test covers this. If the organiser must re-draw with 23, set minimum 2 / maximum 3 instead: 12 heats, R1 7 × 3 + 1 × 2, then 3 heats, then a final of 3.
  2. **Rule change (owner decision, after the event):** when no split fits the minimum, use as many heats of the maximum as possible plus the fewest smaller heats (≥ 2). For 23 that gives 7 × 3 + 1 × 2 = 8 heats, keeping 8 → 4 → 2 → final. That changes decision 33, so the owner has to decide it.

### Wrong result

#### A1a-1 — Riders tied with no counted trick are "resolved" by slot order
- **Where:** `src/lib/engine/scoring/rank.ts`, `higherFirst`. For two riders with no counted trick it compares `-Infinity` with `-Infinity`. `b - a` is `NaN`, `Math.abs(NaN) < EPS` is false, so it returns `NaN`. `NaN !== 0` counts as "decided". The same applies to `highest_any_trick` (`Math.max()` of nothing).
- **What happens:** yellow and blue both crash everything and both get Impression 5.30. Ranking says yellow 1st and blue 2nd, both "resolved by highest counted trick", with no `tie_unresolved` blocker. Swapping the slot order swaps the winner. In a heat where one rider advances, the wrong rider can go through without the head judge being asked. It also happens to two riders on 0.00 with nothing landed. The random heats reach it (the property test counts it and checks it is reached).
- **Reproduction:** test "A1a-1: two riders on the same total with no counted trick are tied" (`.fails`) and "A1a-1 today" (green, shows the slot-order split).
- **Proposed fix:** in `higherFirst`, return 0 when `a === b` before subtracting (`if (a === b) return 0;`). That covers −∞ vs −∞. Then remove `.fails` and delete the "today" test. The brute-force property test then needs no exclusion: delete the `noTrickTie` branch.

#### A1a-7 — A day plan copied from Thursday shows Thursday's heats on Friday and moves Friday's start
- **Where:** `src/lib/schedule/day-plans.ts` `copyPlanToDay` copies every item (the known P2-14 gap). `computeTimetable` takes whatever the plan lists. Nothing stops a heat appearing in two days' plans.
- **What happens:** Thursday ran (heats 1–8 and a 45-min lunch). Friday is made with "Copy Thursday's plan" plus Friday's 7 heats, with Friday's first heat pinned at 10:00. Friday's timetable then shows:
  - Thursday's 8 heats again, as done, with Thursday's times
  - Thursday's lunch break again, as un-started, at 09:30–10:15, which pushes Friday's first heat from its 10:00 pin to **10:20**, on the organiser screens and the public page
  - a drift badge that says "early" by more than 150 minutes, because the plan-as-written puts Thursday's 8 heats on Friday morning.
- **Reproduction:** test "A1a-7: Friday made with 'Copy Thursday's plan'…" (`.fails`) and "A1a-7 today" (green, shows all three effects).
- **Proposed fix:** two parts.
  1. In `copyPlanToDay`, leave out heat rows whose heat has already started (`heatsRanOn` already exists), and leave out break items that sit between them.
  2. In `computeTimetable` (or the save action), warn on a heat row whose heat started on another day ("ran on Thu 8 Oct — take it out of this day"), so it takes no time and moves nothing, like a dangling row.

  Procedure for Thursday: don't copy plans; build Friday from Friday's heats.

### Annoying

#### A1a-3 — One off-step or out-of-range score blanks every total of the heat
- **Where:** `src/lib/engine/scoring/round.ts` `assertOnStep`, called from `judge.ts` and `heat.ts`. `computeHeat` throws `ScoringInputError` for the whole heat. Its callers catch it and show nothing: `head-totals.ts` shows "no total" for every rider, `publish-core.ts` refuses Publish with the engine's message, and `public/live-model.ts` shows no live scores.
- **What happens:** one Impression of 7.25, or a criterion of 10.5, takes every total of the heat off the console and the public live page until someone finds and fixes that one value. `impression_scores.value` is `numeric(5,2) check (value >= 0)`, so the database itself accepts 7.25. Whether the write functions refuse it is Part 1b scenario 1b-2.
- **Reproduction:** test "an off-step or out-of-range value is refused…" (green, documents the contract) and "A1a-3: one off-step mark should cost only that mark" (`.fails`).
- **Proposed fix:** in `computeHeat`, catch the error per mark rather than per heat. Treat a bad mark as missing (it is not in the mean), and add a publish blocker `{ type: "score_invalid", judge, rider, attemptSeq, message }`, so the head judge sees "Fawy: score for Red, attempt 2 is 7.25 — not on the 0.1 step" with **Fix**. Severity goes up to "blocks the event" if 1b-2 shows the server accepts such values.

#### A1a-4 — Shift +N moves the next heat by less than N when the projected start has seconds
- **Where:** `src/lib/engine/schedule/actions.ts` `shift`. It pins `utcToLocalHHMM(start + N min)`, which drops the seconds. `extendBreak` and `resumeBreak` in `break.ts` round up instead, per the owner's rule of 1 Oct: "never shorter than asked".
- **What happens:** R1 H1 ends at 10:10:40, so H2 is projected at 10:18:40. Shift +5 pins "10:23", so H2 moves by 4 min 20 s, not 5.
- **Reproduction:** test "A1a-4: Shift +N should move the next start by at least N minutes" (`.fails`) and "A1a-4 today" (green, 4 min 20 s).
- **Proposed fix:** use the same `roundUpToMinute` as `extendBreak`: `utcToLocalHHMM(Math.ceil((start + N·60000) / 60000) · 60000, tz)`.

### Cosmetic

#### A1a-5 — The drift badge can be 1 minute off the two times on the board
- **Where:** `src/lib/schedule/drift.ts` `driftOf` uses `Math.round` of the exact difference. The board shows `HH:MM` with the seconds dropped (`utcToLocalHHMM`).
- **What happens:** the plan says 10:18 and the board now says 10:20, but the badge says "3 min late", because the real start is 10:20:40. `Math.round` also rounds 2.5 late up to 3 but 2.5 early down to 2.
- **Reproduction:** test "A1a-5: the badge should agree with the two times on the board" (`.fails`), "A1a-5 today" and "A1a-5 detail" (green).
- **Proposed fix:** compute the badge from the two displayed minutes: `floor(current / 60000) − floor(planned / 60000)`. The badge then always equals the arithmetic a person does on the board.

#### A1a-6 — The Impression tie-breaker can never decide in this preset
- **Where:** `presets/scoring/kota-best3-impression.json` `tieBreakers`. This is a rule question, not a code bug.
- **What happens:** two riders reach the Impression tie-breaker only when their totals are equal and their counted and other landed tricks are equal too. Total = tricks + Impression, so their Impressions are then equal as well. "Most landed" can only decide through a landed trick that every judge marked Missed. In practice every real tie after the trick tie-breakers goes to the head judge. The rules page still lists 5 tie-breakers, which is misleading.
- **Reproduction:** test "3. Impression can never decide in this preset" (exhaustive, green) and "4. most landed: only reachable through a landed trick every judge marked Missed".
- **Proposed fix (owner decision):** either move `impression` before `next_counted_trick`, so a rider with the better whole heat wins a tie on highest trick, or leave the order and drop Impression from the list shown to riders. Don't change it before Thursday without the owner.

## Part 1b — system audit (deferred scenarios)

These rules live in database functions, server actions or the screens, not in the engines, so they were not run here. Each one is written as a scenario with the expected behaviour, for a session that may call the hosted development project and drive the browser.

- **1b-1 Attempt cap 7.** The spotter logs attempts 1–7 for Red, then an 8th. Expected: the 8th is refused with "This rider has already used 7 of 7 attempts in this heat." Deleting attempt 3 then lets an 8th in, and the engine never counts more than 7 (the engine part is green here).
- **1b-2 Off-step scores (A1a-3).** Send a criterion of 7.05, 10.5 and −0.1, and an Impression of 7.25, through each write path: judge pad, head judge's "Enter ‹judge›'s sheet", correction. Expected: each is refused before it is stored. If any is stored, A1a-3 becomes "blocks the event".
- **1b-3 The head judge's scores count.** The Gouna panel has 4 seats (J1, J2, J3, head judge). Expected: the head judge's seat is a panel member of every heat, so its scores are in the mean, not in `ignoredMarksFrom`. Remove the head seat from the panel: its scores show as "from a judge not on the panel" and do not count.
- **1b-4 Publish blocked exactly when required scores are missing.** One judge leaves attempt 2 unscored. Expected: Publish is refused and names that judge and attempt; setting it Absent clears the blocker (P2-1); an override needs a reason and is written to `audit_log` with who and when.
- **1b-5 A tie for the heat win (and A1a-1).** Two riders tie on total with equal tricks. Expected: Publish is refused with the tie blocker until the head judge records a decision; the decision reaches the ladder (the chosen rider fills the next seat) and `audit_log`. After the A1a-1 fix, repeat with two riders who crashed everything.
- **1b-6 Publish → next seat.** Publish R1 H3. Expected: its winner appears in R2 H2 seat 1 on the organiser draw, the console and the public ladder within one poll; correcting R1 H3 after R2 H2 has started is refused with a conflict naming R2 H2.
- **1b-7 Lock before withdrawals (A1a-2).** Expected: confirming the draw calls `lockDraw`, so a later withdrawal shows DNS and keeps 15 heats. Check the organiser can see whether the draw is confirmed before pressing Withdraw.
- **1b-8 Public timetable inputs.** Expected: `round_last`, `break_after_heat_min` and `break_after_round_min`, as the public timetable function computes them, equal what the organiser side reads from the stored draw. This audit proved both sides give identical times when those inputs agree; the SQL derivation itself is unchecked.
- **1b-9 Server time and pauses.** Expected: `started_at` and `ended_at` are set by the database clock, not the phone's. While a heat is paused, its projected end moves (check `paused_total_sec` includes the pause that is still running, or that the screens add it), so the next heat's estimate does not jump when the pause ends.
- **1b-10 Re-run a heat.** Expected: the original is cancelled and keeps its real times; the re-run heat gets its own row in the run order, its result is the one the ladder uses, and its label tells it apart from the original on the organiser run order. `buildHeatModel` labels heats `Heat ‹number›` with no suffix, while the public side shows the suffix.
- **1b-11 Score edits are audited.** Expected: a head judge correction writes `audit_log` with before, after, who, when and reason, and the published `heat_results` snapshot changes only on re-publish.
- **1b-12 Offline judge.** Expected: a judge phone that loses signal queues scores, shows "pending", and sends each once (idempotency key) when back; no duplicate score row and no lost score.
- **1b-13 Copy plan (A1a-7).** Expected: after the fix, copying Thursday to Friday leaves out heats that already ran; until then the run-order screen warns "Heats already ran on Thu 8 Oct".

## Not covered (for the full audit after the event)

**Scoring presets not audited:** `club-quick-best2`, `gka-category-overall`, `legacy-kol-best3-variety`, `megaloop-single-best`, `overall-impression`, `pukl-points`.

**Scoring features not exercised:**
- trimmed mean with 5 or more judges, and median
- best per category, distinct trick names, counted weights, trick weight ≠ 1, crash = zero
- height sensor (criterion and bonus)
- interference as percent or points, and more than one interference
- duplicate-attempt detection, flag-out, `requireAllJudges: false`, optional Impression
- the trick-name parser

**Formats not audited:** `kota-dingle`, `double-elimination`, `megaloop-men-16`, `megaloop-women-6`, `pools-to-final`, `qualifying-to-finals`, `round-robin`, `single-final`.

**Ladder features not exercised:**
- Knockout with heats of 4 and more than 1 advancing
- "By their result" re-seeding, byes, second chance
- "Seed now" walkovers, hand edits to the draw (`draw-edit`), regenerate keeping hand edits
- custom ladders other than the generated Gouna one, identifier clashes per identification scheme

**Timetable features not exercised:**
- plan switch (alternative plans), the `kitemania-day2` preset
- several divisions interleaved in one run order
- a day crossing midnight, a DST change (Egypt's summer time ends 29 Oct, after the event)
- ready-call times, the printed run order, the PNG export

**Not in any engine (Part 1b and later):** RLS, logins by PIN/QR, realtime, the client queue, screens, and the public pages' loaders.
