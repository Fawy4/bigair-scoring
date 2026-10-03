# Releases

Every version of the product, newest first: what changed in plain words, what to test on the live address, and what is known not to work yet. The admin page **/admin/releases** shows this file with tick boxes for the checks.

How the numbers work:
- The version is `version` in `package.json`. Every pull request raises it before it is merged: a fix raises the last number (0.10.0 → 0.10.1), a feature raises the middle one (0.10.1 → 0.11.0). 1.0.0 comes after the Arrow launch event.
- Every pull request adds its entry here in the same pull request, at the top. A test fails when `package.json`'s version has no entry.
- "What to test" is 3 to 8 checks a non-developer can do on the live address in about 15 minutes, each written as one thing to do and what you should see. A pull request that changes no screen (tests only, docs only) still raises the version and adds its entry, and its "What to test" may be the single line "Nothing to test on the live address." instead.
- Pull requests #1–#25 were merged before this file existed. `package.json` said 0.1.0 until #23 set 0.9.0; #25 did not change it and #24 set 0.9.1. Their entries are numbered in the order they were merged, as builds of those versions: 0.1.0 to 0.1.21, then 0.9.0 (#23), 0.9.1 (#25) and 0.9.2 (#24, merged after #25). From 0.10.0 on, every number is the one the pull request really set.

How to write an entry (copy the newest one):
- A heading `## ‹version› — ‹date› {#release-‹version with dashes›}`, then a line `PR: #‹number›`.
- `### What changed` (a short list in plain words), `### What to test` (one `- [ ] ` line per check, or "Nothing to test on the live address."), `### Known issues` (a short list, or "None known.").

## 0.11.1 — 3 Oct 2026 {#release-0-11-1}

PR: #29

### What changed
- **Tie with no counted trick (audit A1a-1):** two riders on the same total who both have no counted trick (for example both crashed everything and got the same Impression) are now a real tie. The console says the tie is open, Publish is blocked until the head judge decides, and the order the riders were listed in no longer picks the winner. Before, the engine said "resolved by highest counted trick" and put them in slot order. In a final of 2 that picked the winner without anyone deciding.
- **Scores off the step (audit A1a-3):** a score that is not on the division's step (7.25 on a 0.1 step) or outside the scale is now refused by the database for every judge and for the head judge, with a sentence that names the step and the two nearest values ("That score is not on the 0.1 step. Use 7.2 or 7.3."). The scoring engine also no longer blanks a heat for such a value: it counts the nearest allowed value and the rider's explanation says "J1: Impression 7.25 is not on the 0.1 step, counted as 7.3", so every total still appears.
- **Needs the database change:** migration `20261016100000_fix_audit_1a_score_step.sql` must be applied to the hosted project (`npm run db:apply`) before the refusals work. The tie fix and the engine change need nothing.
- Not changed, on purpose: the knockout sizing rule (A1a-2), copying a plan (A1a-7), and Shift / the lateness badge (A1a-4, A1a-5; see Known issues).

### What to test
- [ ] On a test event (not Arrow, EKL or the Demo), open a heat of two riders, log only crashes for both, end the heat and give both riders the same Impression: the head console lists a tie for first place and "Before you publish" is blocked until you choose who goes ahead.
- [ ] Choose a rider in that tie: Publish becomes available and the chosen rider is placed first.
- [ ] On the head console of an ended heat, open "Enter ‹judge›'s sheet" for a division with a 0.1 step and type 7.25 as a rider's Impression: you see "That score is not on the 0.1 step. Use 7.2 or 7.3." and nothing is saved.
- [ ] Type 10.5 in the same place: you see "That score is outside the scale (0 to 10)."
- [ ] Type 7.2: it saves.
- [ ] On a judge's phone in a running heat, type 7.25 in the small score box: Save stays grey and the box is outlined red; type 7.2: Save works.

### Known issues
- Shift +N can still move the next heat up to 59 seconds less than asked, and the lateness badge can still show 1 minute more than the two times on the board (audit A1a-4 and A1a-5). They do not share a helper, and fixing Shift needs a decision: "never shorter than asked" (the rule of 1 Oct, which can show N+1 minutes on the board) or "exactly N on the board" (up to 59 seconds short). Left for after the event.
- The knockout planner's sizing after one withdrawal (A1a-2) and "Copy plan to another day" (A1a-7) are handled by procedure for Thursday, see docs/AUDIT.md.
- A judge's typed score that is off the step greys out Save and outlines the box in red but says no sentence; written up for Polish 2b.
## 0.11.0 — 3 Oct 2026 {#release-0-11-0}

PR: #30

### What changed
- **Observer**: a new kind of official seat for people who watch but must not touch anything — a sponsor, a WOO engineer, a trainee head judge, a journalist, or you watching a customer's event. Made on the Officials step like any seat (its own PIN and printable card; as many as you like).
- An observer who joins sees a bar **Whose screen**: Head judge console (laptop and phone), Judge 1, 2, 3…, each spotter, the announcer, the big screen and the public page. Each screen is the official's real screen, live, with every button disabled and a quiet “Observing — read only” strip.
- The database refuses every change from an observer seat, whatever the phone sends. Observers never count towards a panel, never appear among the judges, are never played by the simulator and never show on the public pages.
- The head judge sees “2 observers watching” under **Judges**. Switching the seat off or **Regenerate PIN** ends the observer's view at once.
- The simulator's **View as…** has an **Observer** row.

### What to test
- [ ] On Demo, open Officials → **Add a seat**, Role **Observer**, name it, **Add seat and make PIN**: a PIN box appears like for any seat, and the seat is not in the panel table.
- [ ] On your phone, open Demo's join page, tap **Observer**, type the PIN: the phone opens a page with **Whose screen** at the top and “Observing — read only” under it.
- [ ] On the laptop, start the simulator at **×10**. On the phone choose **Head judge console (phone)**, then **Judge 1**, then a **Spotter**: each shows the heat that is on and changes as the simulation plays (Judge 1's scores appear one by one).
- [ ] On each of those screens, tap buttons (a score number, Start, Missed): nothing happens and nothing changes on the laptop.
- [ ] Choose **Head judge console (laptop)** on the phone: the whole laptop console is shown shrunk to fit; **Actual size** lets you scroll it at full size.
- [ ] On the laptop, open the head judge console: under **Judges** it says “1 observer watching”, and the observer is not one of the judges.
- [ ] On the laptop, switch the Observer seat off on the Officials step: within about 10 seconds the phone says the seat was switched off. Switch it on again and join again with the PIN.
- [ ] On the simulator, **View as…** → **Observer** → **Open**: the observer view opens in a new tab.

### Known issues
- The phone of an observer shows the officials' screens inside a frame: a laptop screen on a phone is small until you choose **Actual size**.
- A spotter's feed is shown open on the observer's screen (the observer cannot tap **Feed**); on the spotter's own phone it is behind **Feed** as before.
- Not tried on a real phone before merging.

## 0.10.1 — 3 Oct 2026 {#release-0-10-1}

PR: #27

### What changed
- **Self-audit 1a (Gouna configuration):** the scoring, ladder and timetable engines were tested against the configuration of the Arrow event (24 riders, heats of 3, 4 scores per attempt, best 3 of 7 + Impression, two days). The findings, with what to do before Thursday, are in docs/AUDIT.md.
- New tests only; no screen, setting or database change.

### What to test
Nothing to test on the live address.

### Known issues
- Nothing to test on the live address — see docs/AUDIT.md: the findings A1a-1 to A1a-7 are listed there and are not fixed in this release.

## 0.10.0 — 3 Oct 2026 {#release-0-10-0}

PR: #26

### What changed
- **Releases page** for the platform owner at Admin → **Releases** (/admin/releases): every version, newest first, with what changed, what to test and known issues.
- The checks of each version are **tick boxes**: a tick is saved at once, with who ticked it and when, and stays for everybody who opens the page.
- **Confirm version tested** signs a version off once all its checks are ticked. Unticking a check afterwards takes the "tested" status away again.
- The **Health** page and the admin home (Organisations) show the current version and how far its testing is, for example "0.10.0 — 2 of 8 checks done".
- The manual's **Changelog** links each version to its entry here.
- Behind the scenes: every pull request now raises the version and adds its entry to this file before it can be merged (a test checks it).

### What to test
- [ ] Sign in as the platform owner, open Admin → **Releases**: the top card says "Current version 0.10.0" and "0 of 8 checks done" (or how many are already ticked).
- [ ] Tick the first check of 0.10.0, then reload the page: it is still ticked and shows your e-mail address and the time.
- [ ] Untick it, reload: it is unticked again.
- [ ] **Confirm version tested** is grey while a check is unticked, with the reason under it ("Tick every check first: ‹n› left").
- [ ] Open **Health**: it shows "0.10.0 — ‹n› of 8 checks done", the same number as on Releases; the admin home (Organisations) shows the same line.
- [ ] Open **Help** → **Changelog**, find 0.10.0 and tap the "0.10.0" link after "Release entry": the Releases page opens at the 0.10.0 card.
- [ ] On a phone, open /admin/releases: the tick boxes are easy to tap and nothing runs off the side of the screen.
- [ ] Tick every check, press **Confirm version tested**: the card says "Tested by ‹you› on ‹date›" and Health shows "0.10.0 — tested".

### Known issues
- A check whose words are changed later in this file counts as a new check and needs a new tick.
- Older versions (before 0.9.1) have no checks: they were merged before this file existed.

## 0.9.2 — 3 Oct 2026 {#release-0-9-2}

PR: #24

### What changed
- **Publish blockers in words, with Fix**: a blocked Publish names the judge and the exact thing ("Fawy: score for Red, attempt 2 missing"), and **Fix** opens that score. Once the head judge sets every missing score of a judge to **Absent**, that judge's sheet counts as submitted.
- **Console after the heat**: each judge's Impression / Variety scores per rider (done, missing, Absent). The head judge can type a judge's whole sheet: one **Save** per rider, the next rider is picked by itself, **Save and submit**.
- **Simulator**: **View as** gives the seat back when you leave (or after 90 s), with **Give back to the simulator**; **Pause** pauses the heat clock too ("Paused by the simulator"), **Resume** resumes both, **Stop** leaves the heat paused; behaviour settings no longer reset each other; new **Skip to end of heat** and **Run the whole event**.
- **Divisions**: Scoring shows the main dials first and "21 more settings"; Format has one **Timing per round** table. Every "?" ends with where the setting shows and what it changes.
- **Run order per day**: **Create a plan for ‹day›** or copy another day's plan; the Day list says which plan is active or "no plan"; every grey control says why; **Clear actual times** names the pins that stay.
- On every organiser step the Next / Previous bar sticks to the bottom with the **Note** button above it; number boxes have their up / down arrows again; a button that asks once (Archive, Delete, Reset…) stays grey until the page is ready, so an early tap is not lost.

### What to test
- [ ] Head console, an ended heat with a missing score, press **Publish**: you see "‹judge›: score for ‹rider›, attempt ‹n› missing" with **Fix**. Press Fix, choose **Absent**: that line goes away.
- [ ] Do the same for a missing Impression / Variety score: once every missing one is Absent, Publish goes through without asking for a reason.
- [ ] In the same heat's side panel, open **Enter ‹judge›'s sheet**, type a value: the next rider is picked by itself; **Save and submit** submits the sheet.
- [ ] Simulator → **View as** Judge 1, then close that tab: within a few seconds the panel shows the seat back with the simulator (or press **Give back to the simulator**).
- [ ] Simulator → **Start**, then **Pause**: the head console says "Paused by the simulator" and its clock stops; **Resume** starts both again.
- [ ] Simulator → **Skip to end of heat**: the heat ends; then **Run the whole event**: the event plays on heat after heat.
- [ ] Divisions → Scoring shows the main dials and "21 more settings"; Format shows the **Timing per round** table; tap any "?": its last sentence says where the setting shows.
- [ ] Run order → pick a day with no plan: **Create a plan for ‹day›** and **Copy ‹day›'s plan** are offered; on a phone, the **Note** button sits above Next / Previous and number boxes have arrows.

### Known issues
- Copying a plan to another day copies **all** its heats: remove the ones that do not belong to that day.
- Not tried on a real phone before merging.

## 0.9.1 — 3 Oct 2026 {#release-0-9-1}

PR: #25

### What changed
- **Trick base editor**: Admin → Master presets → **Trick base** is a form (families, blocks, aliases, categories, naming) instead of JSON. Every save is a draft version; **Publish to all customers** shows the changes in words first.
- Proposals from events are accepted into a family or dismissed with a reason the organiser sees.
- Each event keeps its trick base version until its organiser presses **Update to latest** on Divisions → Trick base.

### What to test
- [ ] Open Admin → Master presets → **Trick base**: the families and blocks show as a form, with the JSON under "Advanced: edit as JSON".
- [ ] Rename a block's alias and press **Save as a new draft**: a new draft version appears in the version history.
- [ ] Press **Publish to all customers**: the changes are listed in words before you confirm.
- [ ] In an event, open Divisions → **Trick base**: "Update to latest" offers the new version and lists the same changes.

### Known issues
- None known.

## 0.9.0 — 2 Oct 2026 {#release-0-9-0}

PR: #23

### What changed
- **Product manual** at **/help**: every screen, setting, refusal sentence and fix, with search, screenshots and **Download as PDF**.
- **Learn more** after every refusal sentence and in every "?" opens the matching part of the manual.
- The product version shows on the Health page and in the home page's footer.

### What to test

### Known issues
- None known.

## 0.1.21 — 2 Oct 2026 {#release-0-1-21}

PR: #22

### What changed
- **Simulator panel** tidied into the design system (one toolbar, cards, PIN behind "Show PIN").
- **Organiser access**: the owner invites an organiser by e-mail, the link works once for 24 hours, the organiser sets their own password, and the owner can remove them.

### What to test

### Known issues
- None known.

## 0.1.20 — 2 Oct 2026 {#release-0-1-20}

PR: #20

### What changed
- **Design system** across the organiser and admin screens and a new home page: calmer frames, teal accent, bigger touch targets, Daylight and Dark.

### What to test

### Known issues
- None known.

## 0.1.19 — 2 Oct 2026 {#release-0-1-19}

PR: #21

### What changed
- **Reset per section**: Reset this division, Clear actual times (hand-set pins stay) and Reset this heat, each with one confirmation and one audit line.

### What to test

### Known issues
- None known.

## 0.1.18 — 2 Oct 2026 {#release-0-1-18}

PR: #19

### What changed
- **Simulator**: copy any event into a simulation, play it at ×1 to ×20 speed with virtual judges and spotters, and open any official's screen with **View as**.

### What to test

### Known issues
- None known.

## 0.1.17 — 2 Oct 2026 {#release-0-1-17}

PR: #18

### What changed
- **Head judge console redesign** after the owner's first real test: division tabs, the timer beside Start / Pause / End, the run order on the left, a calmer score table.

### What to test

### Known issues
- None known.

## 0.1.16 — 2 Oct 2026 {#release-0-1-16}

PR: #17

### What changed
- **Organiser shell**: the seven-step rail (Event … Go live), the **Go live** dashboard with a readiness checklist, and the Simple / More settings pattern.

### What to test

### Known issues
- None known.

## 0.1.15 — 2 Oct 2026 {#release-0-1-15}

PR: #14

### What changed
- **Public pages** under /e/‹address›: home, live heat, results, ladder, placings, rider pages, rules and join.
- **Big screen** at /screen/‹address›, and the **wind call** banner everywhere.

### What to test

### Known issues
- None known.

## 0.1.14 — 2 Oct 2026 {#release-0-1-14}

PR: #16

### What changed
- Fix: the timetable no longer crashes when a run order row names a heat that was deleted; such rows are flagged and the rest of the day is still timed.

### What to test

### Known issues
- None known.

## 0.1.13 — 2 Oct 2026 {#release-0-1-13}

PR: #15

### What changed
- **Organiser design preview** at /design/organiser: the whole organiser look with a made-up event, for the owner to approve.

### What to test

### Known issues
- None known.

## 0.1.12 — 1 Oct 2026 {#release-0-1-12}

PR: #13

### What changed
- Plan only: the organiser design plan (Phase 7a) and the owner's notes. Nothing changed on screen.

### What to test
Nothing to test on the live address.

### Known issues
- None known.

## 0.1.11 — 1 Oct 2026 {#release-0-1-11}

PR: #12

### What changed
- **Head judge console** on a laptop: live score table, edits with a reason, DNS / DNF / DSQ / Interference.
- **Publish** with plain-word blockers, Re-open, Cancel heat and Re-run heat; **visibility** settings for what the public sees.

### What to test

### Known issues
- None known.

## 0.1.10 — 1 Oct 2026 {#release-0-1-10}

PR: #11

### What changed
- **Heat timer** on server time (Start / Pause / Resume / End), the **spotter** screen (tap, type or speak a trick) and the **judge** screen with a send queue that retries.

### What to test

### Known issues
- None known.

## 0.1.9 — 1 Oct 2026 {#release-0-1-9}

PR: #10

### What changed
- **Design preview** at /design: the judge pad, spotter and public pieces with made-up riders, tested outdoors on an iPhone.

### What to test

### Known issues
- None known.

## 0.1.8 — 1 Oct 2026 {#release-0-1-8}

PR: #9

### What changed
- Plan only: the build plan for live heats (timer, spotter, judge, head judge, publish). Nothing changed on screen.

### What to test
Nothing to test on the live address.

### Known issues
- None known.

## 0.1.7 — 1 Oct 2026 {#release-0-1-7}

PR: #8

### What changed
- **Draw** step (generate, lock, print one page for WhatsApp), the custom ladder builder, and the **Run order** step with the timetable.

### What to test

### Known issues
- None known.

## 0.1.6 — 30 Sep 2026 {#release-0-1-6}

PR: #7

### What changed
- **Riders** step (by hand, paste or CSV, public registration), **Officials** step with PINs and QR cards, Rider label per division, trick base and feedback.

### What to test

### Known issues
- None known.

## 0.1.5 — 30 Sep 2026 {#release-0-1-5}

PR: #6

### What changed
- **Platform owner admin** at /admin: organisations, invites, archive, Open as this organiser, master presets, audit log, Health, demo organisation.

### What to test

### Known issues
- None known.

## 0.1.4 — 30 Sep 2026 {#release-0-1-4}

PR: #5

### What changed
- **Organisation settings**, and the **Event** and **Divisions** steps of the event setup (scoring and format per division).

### What to test

### Known issues
- None known.

## 0.1.3 — 30 Sep 2026 {#release-0-1-3}

PR: #4

### What changed
- **Database, security and logins**: all tables with access rules, organiser sign-in links, and PIN / QR sign-in for officials.

### What to test

### Known issues
- None known.

## 0.1.2 — 29 Sep 2026 {#release-0-1-2}

PR: #3

### What changed
- **Ladder and timetable engine**: seeding, the formats, progression after each heat, placings, and the day's timetable with breaks and holds (no screens yet).

### What to test

### Known issues
- None known.

## 0.1.1 — 29 Sep 2026 {#release-0-1-1}

PR: #2

### What changed
- **Scoring engine**: judge scores to panel score to counted tricks to heat total and rank, checked against every number in the test scenarios (no screens yet).

### What to test

### Known issues
- None known.

## 0.1.0 — 29 Sep 2026 {#release-0-1-0}

PR: #1

### What changed
- **Scaffold**: the empty app that builds and shows "Build OK".

### What to test

### Known issues
- None known.
