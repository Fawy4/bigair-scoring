# Event day

The event-day runbook (docs/09, corrected to the built product): the day before, the morning minute by minute, each heat, wind holds, failures and the end of the day, with what the organiser and the head judge do side by side.

Last checked: 2 Oct 2026 · Product version 0.9.0

Times below assume a first heat at 10:00 and a ready call of 15 minutes; move them with your own run order. “HJ” is the head judge. Every button named here exists in version 0.9.0; the end of the page lists what docs/09 expected but the product does not have.

## The day before (about 60 minutes) {#ed-day-before}

| When | Organiser | Head judge |
|---|---|---|
| T−1, any time | **Wake the database**: open /admin/health (or the Supabase dashboard → Resume if it says Paused); load the public event page once. Health must say “Database: reachable” and every required server setting “set”. | — |
| | **Event step**: name, dates, Africa/Cairo, logos, sponsors; visibility switches (live scores during a heat, results on publish, hold the final); **Ready call** 15; **Published** ticked. | Agree the visibility switches with the organiser. |
| | **Divisions**: scoring preset and dials, format and **Preview with** the real rider count; check heat lengths per round and breaks. | Read each division's **Rules** page (/e/‹event›/rules): it is what you will apply. |
| | **Riders**: approve registrations, add walk-ins, seeds (sort, shuffle with a code, or drag), **Print start list**. | — |
| | **Officials**: one seat per person (judges, head judge, spotters, announcer); **Panels** ticked for every division; **Print cards**; test one phone join. | Join with your own PIN on the phone or laptop you will use. |
| | **Draw**: **Generate draw** per division, check the ladder and the checks, **Lock draw** — lock before any heat of the division, so Reset can go back to it. **Print / PDF** for the noticeboard. | — |
| | **Run order**: Plan A for each day (Add all, breaks, **Pin** the first start, **Activate this plan**); **Duplicate plan** to make Plan B (fewer rounds or later start) without activating it; **Export PDF / PNG** → WhatsApp group and noticeboard. | — |
| | **Rehearse**: Simulator → **Run as simulation** (only before any real heat), lock the copy's draws, Start at ×10, try the scenarios; then **Delete the simulation**. | Run one simulated heat on the head console with View as. |
| | **Devices**: phones charged, brightness up, auto-lock off, join page added to the Home Screen on iPhones and joined there; a power bank each; the big-screen laptop opens /screen/‹event›; a hotspot as backup. | Set **Sound on** once on the console device. |
| | **Go live**: every row of **Ready to run?** green (the run-order row turns green on the day itself: it asks for a plan active *today*). | — |

## The morning {#ed-morning}

| Time | Organiser | Head judge |
|---|---|---|
| 07:30 | /admin/health: database reachable, realtime connected (not blocking if not). Open Go live: the checklist should say **Ready to run**. If the run-order row says “No run order is active for today, ‹day› — the active plan is for ‹day›”, activate today's plan in Run order. | Open the head console (laptop) or join with the PIN (phone); pick the first division's tab. |
| 08:00 | Officials arrive: they join with the event code and PIN or scan their card; Officials shows “Connected” and “Last seen just now”. A missing PIN: **Show PIN**; a lost phone: **Regenerate PIN**. | Check the **Judges** list on the console: every judge “Live”. |
| 08:30 | Wind check. Set the **Wind call** (green / amber / red, a short message) on Go live; it shows on the public pages and the big screen. | — |
| 08:45 | Riders' briefing: Lycra colours are their identity on every screen; ready call 15 minutes before their heat; times are estimates that update live on the event page and their rider page; scoring as on the Rules page. | Judges' briefing: what a 5, 7 and 9 look like today; the phone flow (card → score → Save; Missed when you did not see it; Flag to alert the HJ); Impression / Variety at the end, then **Submit**; if a phone dies, tell the HJ — nothing is lost. |
| 09:30 | Big screen on (/screen/‹event›, full screen). Share the public link (Go live → Public event page → Copy link / QR). | — |
| 09:45 | Ready call for the first heat (15 minutes before 10:00). | The countdown shows the first heat when the plan is active and pinned. |

## Running a heat {#ed-heat}

| Minute | Organiser | Head judge | Spotter / judges |
|---|---|---|---|
| −15 | Ready call. | Check the heat's riders in **Riders in this heat**; the break countdown shows “starts in …”. | — |
| 0 | — | **Start heat** (if it is not the next heat: **Start anyway** or **Don’t start**). The timer starts for everybody from the server's clock. | Spotter: tap rider → trick → **Log** (or **CRASH**). Judges: each card → score → Save (Missed / Flag when needed). |
| During | Watch Go live: Now and next, drift badge. | Watch the score table: grey “missing” = nudge that judge; amber “outlier” = ask “sure?”; open flags → **Resolve**. Pause only for safety (Pause / Resume). | Phones show Pending when offline; they send when the signal is back. |
| Flag-out minute | — | Formats with flag-out: **Flag out…** (the lowest riders are ticked). | — |
| 0:00 | — | The heat ends itself at 0:00 (or **End heat**). | Judges: Impression / Variety for every rider → **Submit**. |
| +1–3 | — | Read **Before you publish**: each line names the judge and the missing score (“Fawy: score for Omar, attempt 3 missing”, “Fawy: sheet not submitted — 3 attempts unscored”), ties (**Choose order**). **Fix** opens the score; type it from paper or set the judge to **Absent**. Fix them, or **Publish with a reason** (not for a tie). **Publish**. | — |
| +3 | Results appear on the public pages if “results on publish” is on; otherwise **Release result** on the console. The next round's seats fill. | Hold the final's result for the podium if wanted; **Release result** after the prize-giving. | Announcer reads totals and counted tricks from the announcer view. |
| Break | — | The countdown: **+1 min**, **Pause break**, **Resume**. Nothing starts by itself. | — |

## Wind hold and delays {#ed-wind}

- **Stop for wind**: Go live or the console → **Hold** (and set the wind call red). Public pages: “Competition on hold — times will update when we resume.” A running heat is not paused by Hold: **Pause** it on the console if riders must leave the water.
- **Restart**: **Resume at** with the restart time; every heat not started re-flows from it. Small slips: **Shift +5** / **Shift +10**.
- **Wind drops for the day**: Run order → choose today's **Plan B** → **Activate this plan** (heats that started stay where they are); riders see the new order at the next refresh.
- **Shorter heats in strong wind**: Run order → a row's **Length** (any heat not started), or Divisions → Format → heat length per round (unlock with a reason after the first heat).

## When something goes wrong {#ed-failures}

| Problem | Do this |
|---|---|
| A judge's phone shows Pending for more than a minute | Keep scoring; it sends when the signal is back (no duplicates). Still pending at the end: HJ types the missing scores on the console (**Edit score** with a reason) or **Enter their Impression score**. |
| A judge's phone is dead | HJ enters that judge's scores after the heat from what they say or from paper (edit with a reason), or publishes with a reason without them. |
| The app is unreachable for everyone | Run the heat on paper with the printed timetable and a stopwatch. Afterwards: start and end the heat on the console and enter the scores with reasons (the heat's times will be the real ones of the console, not the beach's). |
| Wrong result published | **Re-open** → correct → **Publish** (version 2; both are in the audit log). Refused if a later heat filled by it has started. |
| A rider does not show | Rider menu → **DNS (did not start)**; the heat runs with the others. |
| A heat must be ridden again | **Re-run heat** (same riders, seats, Lycras; riders who do not ride again: Disqualified / Did not start). |
| Screens stop updating | Pull down to refresh; /admin/health; the head console is the truth. |
| Live scores cause arguments | Event step → untick “Show live scores during a heat” (or the HJ's per-heat switch: **Not live**). |
| A page says “Application error” or “This page could not be shown” | **Try again**; send the error reference to the owner; see [Troubleshooting](troubleshooting.md#t-application-error). |

## After the event {#ed-after}

- Make sure every heat is published and every held final released (Placings complete).
- The public Results, Ladder and Placings pages stay online; share the link.
- Archive the event only when it should disappear from the public site (platform owner).
- Leave notes with the **Note** button for what to change; the owner exports them.

## Not in version 0.9.0 {#ed-not-built}

Do these by hand; they are owed for a later version (docs/STATUS.md):

- Results export (CSV / PDF per division), audit-log export, “Duplicate event” as a template for the next event.
- Printed **paper judge sheets**: print blank sheets yourself.
- Starting or ending a heat with typed times: the console always uses the server's clock.
- There is no separate “tabulator mode”: the head judge enters missing scores with **Edit score** (with a reason) and **Enter their Impression score**.
