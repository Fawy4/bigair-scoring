# 09 — Event-Day Runbook (Arrow launch, El Gouna) with paper fallback

> First written 29 September 2026; corrected to the built product (version 0.9.0) on 2 October 2026. The product manual's [Event day](manual/event-day.md) page is the minute-by-minute version with organiser and head-judge columns; keep the two in step.

## A. The day before (≈60 min)
1. **Wake the database**: open /admin/health; it must say “Database: reachable” and every required server setting “set”. If the Supabase dashboard shows “Paused”, press Resume (free tier pauses after ~7 days idle). Load the public event page once.
2. **Event step**: name "Arrow Big Air – El Gouna", web address `arrow-gouna`, time zone Africa/Cairo, logos and sponsors, the three visibility switches (live scores during a heat, results on publish, hold the final), **Ready call** 15, **Published** ticked.
3. **Divisions**: per division a scoring preset and its Simple dials, a format checked with **Preview with** the real rider count, heat lengths per round and breaks (More settings).
4. **Riders**: approve registrations, add walk-ins, set the seeds (sort, shuffle with a code, or drag), **Print start list**.
5. **Officials**: one seat per person (judges, head judge, spotters, announcer), **Panels** ticked for every division, **Print cards**, test one phone join.
6. **Draw**: **Generate draw** per division, check the ladder and the checks, **Lock draw** before any heat of the division (Reset goes back to that locked draw; a division without a saved copy is rebuilt from its current draw). **Print / PDF** for the noticeboard.
7. **Run order**: Plan A per day (Add all, breaks, **Pin** the first start, **Activate this plan**); **Duplicate plan** for Plan B (not active); **Export PDF / PNG** → WhatsApp group and noticeboard.
8. **Rehearse**: Simulator → **Run as simulation** (only before the real event's first heat), lock the copy's draws, play at ×10, try the scenarios, then delete the copy.
9. **Paper fallback**: print blank judge sheets yourself (the product does not print them) and the start lists.
10. **Devices**: judges' phones charged, brightness max, auto-lock off, the join page added to the Home Screen on iPhones and joined there; a power bank each; the head judge on a laptop or tablet with a hotspot as backup; the big-screen laptop opens `/screen/arrow-gouna`.

## B. Riders' briefing (10 min) — say this
- Lycra colours are your identity on every screen; check your colour on the timetable and your rider page.
- Ready call 15 min before your heat; times are **estimates** that update live — refresh the event page.
- Scoring as on the event's **Rules** page (generated from the real settings): what counts, the Impression / Variety score, tie-breakers, interference and penalties.
- Protest window (e.g. 10 min after publish, to the head judge).

## C. Judges' briefing (15 min) — say this
- Criteria and today's emphasis given the wind (write it down; **do not change during the event**).
- Anchor scores: agree what a 5, 7, 9 looks like after the first heat's warm-up jumps.
- Phone flow: the card arrives → score → **Save** (Missed when you did not see it; Flag to alert the head judge); Impression / Variety for every rider at the end → **Submit**.
- If your phone dies: tell the head judge; nothing is lost (the head judge enters your scores on the console with a reason).

## D. Running a heat (head judge + spotter)
1. Head judge: pick the heat in the run order → **Start heat** (a heat that is not next asks “Start anyway” / “Don’t start”). The timer runs from the server's clock on every screen.
2. Spotter: rider → trick → **Log** (or **CRASH**). Judges score as cards arrive.
3. Watch the score table: grey “missing” = nudge that judge; amber “outlier” = ask “sure?”; resolve open flags. Flag-out at its minute if the format has one.
4. Time up (the heat ends itself at 0:00, or **End heat**) → judges give Impression / Variety → **Submit**.
5. Read **Before you publish**; fix, **Choose order** for a tie, or **Publish with a reason** → **Publish**. Results reach the public when “results on publish” is on (otherwise **Release result**); the next round's seats fill.
6. Announcer reads totals and counted tricks from the announcer view.
7. Between heats: the break countdown (**+1 min**, **Pause break**, **Resume**); nothing starts by itself.

## E. Wind hold / delay
- **Hold** (Go live or the console) and a red wind call. Public pages show “Competition on hold — times will update when we resume.” Hold does not pause a running heat: **Pause** it if riders leave the water.
- When conditions return: **Resume at** the restart time → the timetable re-flows. Small slips: **Shift +5** / **Shift +10**.
- Wind drops for the day: Run order → activate **Plan B** (heats that started stay where they are).
- Shorter heats in strong wind: a row's **Length** in the run order (any heat not started), or the round's heat length in Divisions → Format (unlock with a reason after the first heat).

## F. Failure modes and what to do
| Problem | Do this |
|---|---|
| A judge's phone shows "Pending" for > 1 min | Keep scoring; it sends when signal returns (no duplicates). Still pending at the end: the head judge enters the missing scores on the console (**Edit score**, with a reason) or **Enter their Impression score** |
| Judge phone dead | The head judge enters that judge's scores after the heat from what they say or from paper, with a reason; or publishes with a reason without them |
| App unreachable for everyone | Run the heat on paper with the printed timetable and a stopwatch. Afterwards start and end the heat on the console and enter the scores with reasons (the console records its own times: heats cannot be started or ended with typed times) |
| Wrong result published | **Re-open** → correct → **Publish** (version 2; the audit log keeps both) — refused once a later heat filled by it has started |
| Rider no-show | Rider menu → **DNS**; the heat runs with the rest |
| A heat must be ridden again | **Re-run heat** (same riders, seats, Lycras; riders who do not ride again: Disqualified or Did not start) |
| Screens stop updating | Pull down to refresh; /admin/health; the head console is the truth |
| Public live scores cause arguments | Event step → untick “Show live scores during a heat”, or the head judge's per-heat switch **Not live** — takes effect at the next refresh |
| A page shows “This page could not be shown” | **Try again**; send the error reference to the owner (manual: Troubleshooting) |

## G. After the event
Make sure every heat is published and every held final released; the public Results, Ladder and Placings pages stay online — share the link; leave notes with the **Note** button for what to change. (Audit-log export, “Duplicate event” and **Restore from backup** are not built yet: see docs/STATUS.md, owed.)

### G1. Results and backup files (Export 1) — the procedure
The results of a real event must never live in one place only. Who: the organiser (all three files) or the head judge on the laptop console (the first two). Nothing here changes the event; it can be done during a running heat.
1. **After every published heat** (or every few): Go live → **Results and backup** → **Download results** (or the same button on the head console, under the wind call). It is a spreadsheet that opens in Excel: one row per rider per published heat, every attempt, total and place, then the placings and the ladder seats.
2. **At the end of each day**, in this order: tick **Include heats under review (draft)** and press **Download results** (the safety copy: unpublished heats come in labelled DRAFT); press **Open printable results** and **Print or save as PDF**; press **Download event backup**.
3. **Keep each file in two places that are not the event laptop** (own e-mail plus a shared folder or cloud drive). The backup holds riders' contact details: private, never in a group chat. It holds no PINs or passwords.
4. **Check** once: the spreadsheet opens in Excel with names right; the printable page has the event name and “Exported ‹date› ‹time›” at the top of every page; the backup opens in a text editor and shows the event's name.
5. **Restore from backup does not exist yet.** If the worst happens the backup is for a rebuild by a developer (docs/EXPORT-FORMAT.md, "How an import would work"); the printable results and the spreadsheet are the paper copy of every released result.
6. A refusal in words (“Only an organiser of this event or its head judge can download the results.”, “This event is not public yet …”) is explained in the manual's Errors page; judges, spotters, announcers and observers never see the buttons.

## H. One-page checklist (print)
☐ DB awake (Health) ☐ Event created, branded, published ☐ Divisions + presets ☐ Riders confirmed & seeded ☐ Officials, panels, PIN cards ☐ Draws generated, printed and locked before the first heat ☐ Plan A active, Plan B ready, exported ☐ Simulation rehearsed and deleted ☐ Blank paper sheets printed ☐ Devices charged/installed ☐ Big screen tested ☐ Briefings done ☐ First start pinned ☐ Hotspot ready ☐ Go live: Ready to run
