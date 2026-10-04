# Changelog

One entry per product version: the date, what changed for users, and which manual pages were updated. Each entry links to its **release entry** (what to test on the live address, known issues), which the platform owner ticks off on Admin → [Releases](screens/admin-releases.md).

Last checked: 4 Oct 2026 · Product version 0.16.0

## 0.16.0 — 4 Oct 2026 {#cl-0-16-0}

Release entry: [0.16.0](/admin/releases#release-0-16-0) (platform owner only)

**What changed for users**
- **Skip to end of heat** now ends the heat (flag red, clock 0:00) and leaves it under review, unpublished. **Reasons are optional** wherever one is asked for (“no reason given” in the audit log). The simulator's auto-play **waits for the break**; its **left rail works**; **Refresh from event** brings the simulation up to date with the real event.
- **Clear this plan** on the Run order step. **Follow the heat** shows one clock, every trick's score as it lands, and no page counter. The Event step's empty impression-name field shows the division's name.

**Manual pages updated**
- [Simulator](screens/simulator.md), [Head judge console (laptop)](screens/console-laptop.md), [Run order](screens/organiser-run-order.md), [Big screen](screens/big-screen.md), [Event step](screens/organiser-event.md), [Divisions](screens/organiser-divisions.md), [Draw](screens/organiser-draw.md), [Admin: trick base](screens/admin-trick-base.md), [Flags](screens/flags.md), [Resets and undo](resets-and-undo.md), [Dependencies](dependencies.md), [Event day](event-day.md), [Glossary](glossary.md), the errors appendix.

## 0.15.1 — 4 Oct 2026 {#cl-0-15-1}

Release entry: [0.15.1](/admin/releases#release-0-15-1) (platform owner only)

**What changed for users**
- **Faster organiser screens:** each step of the left rail opens in about half a second, **Save** and **Lock draw** answer in well under a second.
- **Faster console and simulator:** **Start heat sequence**, **Pause**, **Resume**, **Abort** and **+1 min** show at the moment you press them and the database confirms within half a second; a simulator **speed** button looks pressed at once; **Publish** asks the database twice instead of nineteen times and the heat shows as published as soon as the result is stored. A Pause pressed on the console shows on the simulator panel at once.
- No scoring, ladder or timetable rule changed.

**Manual pages updated**
- [Head judge console (laptop)](screens/console-laptop.md), [Head judge console (phone)](screens/console-phone.md), [Simulator](screens/simulator.md), [Event step](screens/organiser-event.md). No screen changed its look, so no screenshot was retaken.

## 0.15.0 — 4 Oct 2026 {#cl-0-15-0}

Release entry: [0.15.0](/admin/releases#release-0-15-0) (platform owner only)

**What changed for users**
- **Big screen — Follow the heat** (/screen/‹event›/follow), a second big-screen address for a TV or projector: it stays on the heat while it is armed or running, says **Judges reviewing** until Publish, then alternates the full Results of today's published heats (newest first, one heat per page, every attempt's score as on the public Results page) and the Ladder; arming the next heat jumps straight back to the live heat. A thin “Next: ‹heat› · est. ‹time›” line, a **Reconnecting** label when the connection drops, Space to pause, F for full screen, D for Day / Dark.
- **Event step → Follow the heat — seconds per page** (default 15, 5 to 120). **Go live** has the shortcut **Big screen — Follow the heat**.
- **The Note button is gone from the big screen**, the first one too.

**Manual pages updated**
- [Big screen](screens/big-screen.md) (new section “Follow the heat” with pictures of each state), [Organiser: Event step](screens/organiser-event.md), [Organiser: Go live](screens/organiser-go-live.md), [Glossary](glossary.md), [Event day](event-day.md), [Settings](settings.md) (regenerated).

## 0.14.1 — 4 Oct 2026 {#cl-0-14-1}

Release entry: [0.14.1](/admin/releases#release-0-14-1) (platform owner only)

**What changed for users**
- **The crowd cannot slow the officials:** the public pages and the big screen answer from a shared copy at most about 3 seconds old (a published result shows within seconds, a held one never shows until it is released); when very many people ask at once they get a calm **Updating…** page that asks again by itself. The head judge's console, the judges' and spotters' phones, the Flag view and the organiser screens never go through it. "Last seen" is written at most once a minute.
- **Withdrawn after the draw is locked** turns the rider's seat into a **walkover** (Riders step); **Remove** of a rider who has a seat is refused and points to Withdrawn.
- **Resets during a yellow are refused** (“Abort the start sequence first.”) and a reset never leaves a heat armed.
- **Flags off:** a heat whose pre-start is over keeps running (only the strip is hidden); a paused yellow can be switched off.
- **Joining:** wrong PINs are counted per phone and connection, so strangers can never lock the officials out; a right PIN from a clean phone always works.
- **Trick base:** **+ Add block** shows the family names of the version the event uses; the panel starts from the stored layout.
- **Console:** the Impression card stays a card at 1280 px and wider with 3, 4 and 5 riders.
- **Big screen and Flag view:** nothing is ever cut with “…”; the header fits the width, the event name wraps, the heat pill shows the whole heat name, the Day / Dark button has its own corner, every page is fitted to the screen.

**Manual pages updated**
- [Riders step](screens/organiser-riders.md), [Head judge console (laptop)](screens/console-laptop.md), [Flags](screens/flags.md), [Join page](screens/public-join.md), [Public event pages](screens/public-event.md), [Divisions step](screens/organiser-divisions.md), [Big screen](screens/big-screen.md), [Resets and undo](resets-and-undo.md); the errors appendix and troubleshooting index (regenerated).

## 0.14.0 — 4 Oct 2026 {#cl-0-14-0}

Release entry: [0.14.0](/admin/releases#release-0-14-0) (platform owner only)

**What changed for users**
- **Download results** (Go live step, and the head judge's laptop console): a spreadsheet of every published heat — each attempt with its score, Landed / Crashed and whether it counted, the Impression / Variety score, total, place, result version, who published and when — followed by the division placings and the ladder seats.
- **Open printable results**: the public Results page's own heats, division by division, newest heat first, with the event name and the export date and time on every page; print it or save it as PDF.
- **Include heats under review (draft)**: organiser-only tick box that adds heats under review or held back, labelled DRAFT.
- **Download event backup** (Go live, organisers only): the whole event in one file, without any PIN or password. Restoring from a backup does not exist yet.
- Each download writes one line to the audit log. Nothing else is changed by a download.

**Manual pages updated**
- New: [Exporting results and backups](exporting.md). Updated: [Organiser: Go live](screens/organiser-go-live.md), [Head judge console on a laptop](screens/console-laptop.md), [Event day](event-day.md), [Roles](roles.md), [Glossary](glossary.md), [Errors and refusals](errors.md), [Troubleshooting](troubleshooting.md). Screenshots: the Go live card, the console buttons and the printable page.

## 0.13.1 — 4 Oct 2026 {#cl-0-13-1}

Release entry: [0.13.1](/admin/releases#release-0-13-1) (platform owner only)

**What changed for users**
- Nothing: this version adds tests and the self-audit report (`docs/AUDIT.md`), no screen, setting or rule changed.

**Manual pages updated**
- None.

## 0.13.0 — 3 Oct 2026 {#cl-0-13-0}

Release entry: [0.13.0](/admin/releases#release-0-13-0) (platform owner only)

**What changed for users**
- **Flags:** four flag states driven by the heat clock — **Before start** (yellow), **Running** (green), **Last minute** (yellow), **Stopped or paused** (red; the words say Finished, Paused or Hold). On by default for every event, existing ones included. Event step → **Flags**: on/off, the word and colour of each state, the pre-start length and the last-minute length.
- **Start heat sequence:** on the head judge's console **Start heat** becomes **Start heat sequence**, the one primary button. The pre-start is a labelled setting beside it, **Pre-start:** — the event's default (ticked), **Other…** (type 1:30 or whole minutes, 0:10 to 15:00; anything else is refused) and **Start now**. The heat starts by itself at 0:00 of the pre-start, with a horn, on the server's clock.
- **During the yellow** the head judge keeps **Start now**, **+1 min** (exactly one more minute, repeatable, audited, on every screen within a second; it never changes the heat length or the last-minute setting), **Pause** / **Resume** (the countdown freezes and carries on) and **Abort**.
- **Reset this heat** is a visible button immediately before **Cancel heat** (the heat menu is gone: it held nothing else). A reset heat shows red / Stopped and keeps no start sequence.
- **Flag strip** on every live screen (console on laptop and phone, judge, spotter, announcer, observer views, the public live tab and home page); a **flag frame** and large state word on the big screen; text cues on the announcer's view.
- **Flag view** (/e/‹event›/flag): the flag marshal's screen, linked from Go live and the Officials step (with a QR to print). Turns grey after 10 seconds without the server.
- **Horns** (behind **Sound on**): one at green, one at the last minute, two at red, one at resume. Nothing vibrates.
- **Console corrections and additions:** the per-heat live-scores switch is back in the **More** menu with **Follow division / Live / Not live** (0.12.0 moved the wrong control into a pill); **Release result** is a visible button beside **Publish** for a held result; a **review bar** under the heat's header from End heat until Publish (amber, red, green, and a quiet line while the heat runs); an **Impression** card beside the rider cards (a button with a pop-over when there is no room), and a block on the phone.
- **Simulator:** virtual officials follow the sequence; every speed is measured: at ×10 a 1:00 pre-start lasts 6 seconds, a 1:00 last minute 6 seconds and the break countdown shrinks too. **Pause** freezes the yellow like the heat clock, and the auto-play arms a heat only while it is playing and only when the head judge has not armed it. **Skip to end of heat** now fast-forwards the virtual officials (all attempts logged and scored) and leaves the heat running; the old behaviour is the separate **End heat and publish**. New scenario **Abort the start**; **View as…** has **Flag view**. The Flag view now refreshes every second.
- **Name of the impression score** (Event step → **Scoring settings**): Impression, Variety… used on the console's card, the judges' phones and sheets, the review bar, the public results, the rules text and the big screen; the card has a proper heading above its grid.
- **Draw step:** compact cards (a seat is one line: Lycra block, name, seed; heats of a round in tight columns; **+ Seat** and **Take heat out** behind a small button on each card) and the selection banner is pinned to the top of the window. The printed page is unchanged.
- **Rider page door:** a public **Riders** tab lists everybody on the public list; each name opens that rider's page, which now has a QR code, its address and an Add to home screen hint; the Riders step has **Rider links**, a printable sheet with a QR and address per rider and “Name — address” lines for WhatsApp.
- **Wider organiser and admin screens:** the content area uses the window up to 1400 px (centred beyond), tables and cards the full width, explanatory text about 70 characters a line; the phone is unchanged.
- **Fixed:** the judge's Impression step no longer shows “This page could not be shown” when the page opens before the heat's riders have loaded.
- New refusals, with Learn more: the flags are off, a start heat sequence already running, nothing to abort; the “one heat at a time” sentence now also covers a heat in its yellow.

**Manual pages updated**
- New: [Flags and the start heat sequence](screens/flags.md). Updated: [Console on a laptop](screens/console-laptop.md) (review bar, Impression card, Release result, live-scores switch), [Console on a phone](screens/console-phone.md), [Judge](screens/judge.md), [Spotter](screens/spotter.md), [Announcer](screens/announcer.md), [Observer](screens/observer.md), [Big screen](screens/big-screen.md), [Public live](screens/public-live.md), [Public home](screens/public-home.md), [Organiser: Event step](screens/organiser-event.md), [Organiser: Officials](screens/organiser-officials.md), [Organiser: Go live](screens/organiser-go-live.md), [Simulator](screens/simulator.md), [Organiser: Draw](screens/organiser-draw.md), [Organiser: Riders](screens/organiser-riders.md), [Public: the rider page](screens/public-rider.md), [Public event](screens/public-event.md), [Dependency map](dependencies.md), [Glossary](glossary.md), [Settings](settings.md) and [Errors](errors.md) (generated).

## 0.12.0 — 3 Oct 2026 {#cl-0-12-0}

Release entry: [0.12.0](/admin/releases#release-0-12-0) (platform owner only)

**What changed for users**
- **One pause (simulator):** the head judge's **Pause** on the console and the simulator's **Pause** are the same state. Pausing on either side pauses the heat clock and the virtual officials; **Resume** on either side resumes both; each side shows the real state within about a second.
- **Console:** a held final's **Release result** is a visible button beside **Publish** (laptop and phone). (This entry first described the per-heat live-scores switch as a pill beside Publish; that was a mistake and is corrected in 0.13.0: the switch is back in the **More** menu.)
- **Big screen:** **Day** and **Dark** colours. A quiet button shows on mouse move or tap and hides after three seconds; **D** switches on a laptop; the browser remembers its choice; the Event step sets the default (**Big screen: colours**, Dark).
- **Admin → Feedback:** a date filter (From / To; Today, Last 7 days, All), tick boxes with **Select all**, **Set done** and **Reopen** for many notes at once (asks once, says how many changed), and the export follows the filter.
- **Public event page:** the organiser chooses its tabs (Event step → **Public page**, all on by default); Join also hides while registration is closed; an old link to a hidden tab lands on the first visible tab.
- **Run order:** **Copy ‹day›'s plan to ‹day›** brings only the heats that have not ended and never the other day's breaks or pins (audit finding A1a-7).
- **Judge pad:** a typed score off the step shows “That score is not on the 0.1 step. Use 7.2 or 7.3.” under the box, with a Learn more link; the head judge's score and sheet entry use the same pad.

**Manual pages updated**
- [Console on a laptop](screens/console-laptop.md), [Console on a phone](screens/console-phone.md), [Big screen](screens/big-screen.md), [Admin: Feedback](screens/admin-feedback.md), [Organiser: Event step](screens/organiser-event.md), [Public event page](screens/public-event.md), [Organiser: Run order](screens/organiser-run-order.md), [Judge screen](screens/judge.md), [Simulator](screens/simulator.md), [Organiser: Draw step](screens/organiser-draw.md) (the refusals it can show and its Learn more targets), [Settings](settings.md) and [Errors](errors.md) (generated).

## 0.11.1 — 3 Oct 2026 {#cl-0-11-1}

Release entry: [0.11.1](/admin/releases#release-0-11-1) (platform owner only)

**What changed for users**
- Two riders on the same total who both have no counted trick (for example both crashed everything and got the same Impression) are now a tie for the head judge to decide; Publish is blocked until that is done. Before, the engine put them in slot order.
- A score that is not on the division's step (7.25 on a 0.1 step) or is outside the scale is refused by the database, for a judge and for the head judge. The refusal names the step and the two nearest values (“That score is not on the 0.1 step. Use 7.2 or 7.3.”) or the range.
- If such a value is ever found in a heat (an older score), the totals still appear: it is counted as the nearest value and the rider's explanation says so.

**Manual pages updated**
- [Errors](errors.md) (generated: the two refusal sentences and their codes), [Troubleshooting](troubleshooting.md) (generated), [Judge screen](screens/judge.md).
Last checked: 3 Oct 2026 · Product version 0.11.0

## 0.11.0 — 3 Oct 2026 {#cl-0-11-0}

Release entry: [0.11.0](/admin/releases#release-0-11-0) (platform owner only)

**What changed for users**
- **Observer** (observer-role): a read-only official seat, made on the Officials step with its own PIN and card (several allowed). After joining it sees **Whose screen** — head judge console (laptop, phone), each judge, each spotter, the announcer, the big screen, the public page — each the real screen, live, with every control disabled and the strip “Observing — read only”. The database refuses every change from it; it never counts towards a panel, never appears among the judges, is never played by the simulator and never shows on the public pages.
- Head judge console: “‹n› observers watching” under **Judges**.
- Simulator: **View as… → Observer**.
- Join page: an **Observer** card.

**Manual pages updated**
- New: [Observer view](screens/observer.md). Updated: [Roles](roles.md), [Officials](screens/organiser-officials.md), [Join and register](screens/public-join.md), [Head console on a laptop](screens/console-laptop.md), [Simulator](screens/simulator.md), the README's list of screens; [Errors and refusals](errors.md) regenerated (OBSERVER_NOT_ON_PANEL); screenshots retaken.

## 0.10.1 — 3 Oct 2026 {#cl-0-10-1}

Release entry: [0.10.1](/admin/releases#release-0-10-1) (platform owner only)

**What changed for users**
- Nothing on screen: a self-audit of the engines for the Gouna event settings added tests and docs/AUDIT.md (findings and what to do before the event).

**Manual pages updated**
- This changelog only.

## 0.10.0 — 3 Oct 2026 {#cl-0-10-0}

Release entry: [0.10.0](/admin/releases#release-0-10-0) (platform owner only)

**What changed for users**
- **Releases** (release-tracker): Admin → **Releases** lists every version newest first with what changed, what to test and known issues. The checks are tick boxes saved with who and when; **Confirm version tested** signs a version off once every check is ticked.
- The **Health** page and the admin home show the current version and its testing, for example “0.10.0 — 2 of 8 checks done”.
- Every changelog entry links to its release entry.

**Manual pages updated**
- New: [Admin: releases](screens/admin-releases.md). Updated: [Admin: health](screens/admin-health.md), [Admin: organisations](screens/admin-organisations.md) (the version line), this changelog, the README's [product version](README.md#readme-version) section, [Errors and refusals](errors.md) (generated).

## 0.9.2 — 3 Oct 2026 {#cl-0-9-2}

Release entry: [0.9.2](/admin/releases#release-0-9-2) (platform owner only)

Polish 2 – simulator, console and organiser fixes.

**What changed for users**
- **Publish** (head judge): a blocked Publish names the judge and the exact thing (“Fawy: score for Red, attempt 2 missing”, “Fawy: Impression / Variety score for Red missing”), each with **Fix**, which opens that score. When the head judge sets every missing score of a judge to **Absent**, that judge's sheet counts as submitted and Publish needs no reason.
- **Console, after the heat**: each judge's Impression / Variety scores per rider (done, missing, Absent). The head judge can type a judge's whole sheet: one **Save** for every rider, the next rider is picked by itself, **Save and submit** submits the sheet.
- **Simulator**: **View as** gives the seat back when you leave (or after 90 s without a sign of life) and the panel shows who holds each seat, with **Give back**; **Pause** pauses the heat clock too (the console says “Paused by the simulator”), **Resume** resumes both, **Stop** leaves the heat paused; behaviour settings no longer reset each other; auto-play keeps its full speed; new **Skip to end of heat** and **Run the whole event**.
- **Divisions → Scoring**: the main dials first; the settings of a choice show only with that choice; “21 more settings” (it said 53).
- **Divisions → Format**: one **Timing per round** table (warm-up, heat length, break after each heat), the duplicate settings removed.
- Every “?” ends with where the setting shows and what it changes.
- **Run order**: a day without a plan offers **Create a plan for ‹day›** and **Copy ‹other day›'s plan to ‹day›**; the Day list says which plan is active or “no plan”; every grey button says why; **Clear actual times** names the pins that stay; the Go live **Fix** opens on today.
- The Next / Previous bar stays at the bottom and the **Note** button floats above it; the up / down arrows are back on number boxes; a button that asks once (Archive, Delete, Reset…) stays grey until the page is ready, so an early tap is not lost.

**Manual pages updated**
- [Head judge console (laptop)](screens/console-laptop.md), [Simulator](screens/simulator.md), [Divisions](screens/organiser-divisions.md), [Run order](screens/organiser-run-order.md), [Event](screens/organiser-event.md), [Quick start](quick-start.md), [Event day](event-day.md), [Dependency map](dependencies.md); [Settings](settings.md), [Errors and refusals](errors.md) and [Troubleshooting](troubleshooting.md) regenerated; screenshots retaken.

## 0.9.1 — 3 Oct 2026 {#cl-0-9-1}

Release entry: [0.9.1](/admin/releases#release-0-9-1) (platform owner only)

**What changed for users**
- **Master trick base editor** (trick-base-editor): Admin → Master presets → **Trick base** edits the master trick base as a form (families, blocks, aliases (type one, Enter), categories, takes a multiplier, rotation, on for new events; rename, move, reorder, retire, restore, add; families renamed, reordered and added; category precedence; naming template with a live example) with the JSON under “Advanced: edit as JSON”. Every save is a draft version; **Publish to all customers** shows the changes in words first; the version history says who published what and when, with **View**. Proposals from events are accepted into a family (name and aliases edited first) or dismissed with a reason the organiser sees. Each event keeps its version until **Update to latest** on its Trick base tab. Trick names follow the naming template (`{direction} {blocks}`, the same names as before).

**Manual pages updated**
- After the trick base editor: [Admin: trick base](screens/admin-trick-base.md) rewritten with its screenshots, [Admin: master presets](screens/admin-presets.md), [Divisions](screens/organiser-divisions.md) (Trick base tab), [Errors and refusals](errors.md) and [Troubleshooting](troubleshooting.md) (generated), the README's “Being built” note.

## 0.9.0 — 2 Oct 2026 {#cl-0-9-0}

Release entry: [0.9.0](/admin/releases#release-0-9-0) (platform owner only)

The version for the Arrow launch event (El Gouna, 8–9 October 2026). 1.0.0 follows after it.

**What changed for users**
- **Organiser access** (Polish 1): the owner invites an organiser by e-mail; the link works once for 24 hours and lands them in their organisation; they set their own password; the owner can remove an organiser (signed out at once) and invite them again.
- **Help** at /help: the whole product manual, with contents, search and **Download as PDF**.
- **Learn more** after every refusal sentence and in every “?” on the organiser, admin and head judge screens, opening the matching part of the manual.
- The product version is shown on the Health page and in the home page's footer (with a **Help** link).
- Fixes: the Trick base tab and the Scoring / Format panels now point to **More settings** (they said “Show all settings”); a division's Scoring or Format tab no longer says “Unsaved changes” before anything was touched; the empty notification area no longer hides the bottom right of laptop pages (“Opens in a new tab.” on Go live) or the top of phone pages.
- Everything built up to this date: the organiser setup and Go live, the judge, spotter, head judge and announcer screens, the public pages and big screen, the simulator, resets per event, division and heat, the platform owner's admin.

**Manual pages updated**
- All pages written (first version): README, Quick start, Dependency map, Event day, Troubleshooting, every screen page, Settings, Resets and undo, Roles, Glossary, Errors and refusals, Changelog.
- After Polish 1 (PR #22): [Organiser access](screens/organiser-access.md) (invite, link, own password, remove), [Admin: organisations](screens/admin-organisations.md), [Roles](roles.md), the invite and simulator rows of the [dependency map](dependencies.md), [Troubleshooting](troubleshooting.md) (e-mail limit, links), the [Simulator](screens/simulator.md) screenshots. Still being built: [Admin: trick base](screens/admin-trick-base.md) (its own pull request updates it).

## How to add an entry {#cl-how}

Newest first. Use the version that the release puts in `package.json`, the date, a line “Release entry: [‹version›](/admin/releases#release-‹version with dashes›)”, two short lists (“What changed for users”, “Manual pages updated”), and link the pages. The release entry itself is in `docs/RELEASES.md` (see [Admin: releases](screens/admin-releases.md#releases-rule)). See [the update rule](README.md#readme-update-rule).
