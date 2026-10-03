# Resets and undo

What each reset wipes and what it keeps, and every way to take something back: Restore, Re-open, Re-run, Cancel, Undo, Unlock, and the audit log that keeps all of it.

Last checked: 2 Oct 2026 · Product version 0.9.0

**The rule.** Every reset is refused while any heat of the event is running or paused, and names it (“Heat 3 is running. End it first.”). Every reset asks once and shows the counts first. A reason of at least 5 characters is needed when something it wipes was ever shown publicly. Every reset writes one audit line.

## The resets {#ru-resets}

| Reset | Where | Wipes | Keeps | Undo |
|---|---|---|---|---|
| {#ru-event} **Reset event…** | Go live → Quick actions (also the Simulator's Reset) | Every attempt, score, penalty, flag, judge sheet, tie decision, published result, heat time (start, end), the run order's actual start times; re-run heats are removed; every ladder goes back to its draw as it was when locked (a division with no saved copy is rebuilt: Round 1 keeps its seats, every later seat goes back to its placeholder). | Riders, officials, PINs, settings, rules, the run order itself (rows, hand-set pins). | A copy is kept for 30 days: the platform owner can **Restore** it (below). |
| {#ru-division} **Reset this division…** | Divisions step, on the division's card | The division's heats back to not started; its attempts, scores, penalties, flags, sheets, tie decisions, published results and actual times; its re-run heats; its draw back to the saved starting copy (or rebuilt). | Other divisions; riders, officials, settings. | None from the screen (the audit line keeps the counts). |
| {#ru-heat} **Reset this heat…** | Head console → the **Reset this heat…** button before **Cancel heat** (head judge or organiser) | The heat back to not started with the same riders in the same seats. A published result is taken back and the next round's seats it filled go back to their placeholders. | Its attempts, scores, penalties, sheets and results are kept for the audit (readable by organisers and the head judge) and no longer count. DNS stays on a seat; DSQ stays only on a re-run. | None from the screen. Refused when a later heat that depends on it has started (reset that one first). A cancelled heat that has a re-run is not reset: reset the re-run. |
| {#ru-clear-times} **Clear actual times** | Run order step (per plan) | The plan's actual starts and the pins written while the day ran (Shift, Resume at, +1 min, Pause break). | Pins you set by hand (lunch, a briefing, a pinned heat); heats keep their real start and end (use Reset this heat / division for those); a wind hold (Resume ends it). A plan made before hand-set pins were told apart keeps every pin and says so. | None. |
| {#ru-sim} **Reset to the locked draw** / **Wipe and draw again** | Simulator | The same as Reset event, plus the simulator's own leftovers (wind calls, shortened clocks, a Plan B it made, its numbers). Wipe and draw again (only for an event with no saved draw, like the Demo) draws and locks every division again. | Checklist ticks. | As Reset event. |

## Taking one thing back {#ru-undo}

| Action | Where | What it does | Limits |
|---|---|---|---|
| {#ru-restore} **Restore results from ‹date›** | /admin → organisation → Events (platform owner only) | Brings back everything the event had before a Reset event. | Within 30 days; refused if a heat has started since the reset (“A heat has started since the reset, so it can no longer be restored.”). |
| {#ru-reopen} **Re-open** | Head console | Takes a published result back to review (“Result under correction”); spectators keep the old result until you publish again; Publish writes the next version (version 2). | Publishing again is refused when it would change who rides in a later heat that has started. |
| {#ru-rerun} **Re-run heat** | Head console | Cancels the heat and makes “H‹n›R” next in the run order: same riders, seats, Lycras, timing; later seats follow the re-run; everything scored stays stored for the audit. Riders who do not ride again: Disqualified or Did not start (ranked last). | Not on a published heat (Re-open instead); once per heat (“Already re-run as H1R”); not on a heat cancelled before it started. |
| {#ru-cancel} **Cancel heat** | Head console | Stops the heat for good, with a reason. A cancelled heat takes no time on any timetable and cannot be started. | Re-run it to ride it again. |
| {#ru-spotter-undo} **Undo** | Spotter | Takes back the last logged attempt. | 10 seconds; after that the head judge deletes it. |
| {#ru-edit} **Edit score**, **Delete**, **Merge duplicate**, **Clear status**, **Take back interference** | Head console | Corrects one score or attempt, with a reason where asked. | While the heat is not published (Re-open first). |
| {#ru-sheet} Reopen a judge's sheet | Head console | Lets one judge change their scores after Submit. | — |
| {#ru-unlock-rules} **Unlock scoring and format** | Divisions | Allows changing rules after the first heat; reason written to the audit log. | The Rider label and ticked trick blocks stay fixed. |
| {#ru-unlock-draw} **Unlock draw** | Draw | Allows changing a locked draw; reason written to the log. | Started heats never change; no regenerate after the first heat. |
| {#ru-archive} **Archive** / **Restore** an event or organisation | Event step (owner), /admin | Hides it everywhere; restore shows it again. | Delete is only possible while no result was published. |

## The audit log {#ru-audit}

- **Per heat**: head console → **More** → Audit log: every score edit (before, after, who, reason), deleted, merged, added past the cap, status (DNS / DNF / DSQ), interference, flag-out, tie decided, moved to review, published (with blockers), re-opened, sheet re-opened, flag resolved, cancelled, re-run.
- **Platform**: /admin → Audit log: organisations, organisers added, “Viewing as” visits, presets, settings, events moved, deleted, archived, and (with “Everything”) scoring changes.
- **Resets** write `event_reset`, `division_reset`, `heat_reset`, `plan_actuals_cleared` with their counts; unlocks write their reason.
- Published results and the audit log can never be edited or deleted (the database refuses with `APPEND_ONLY`).
