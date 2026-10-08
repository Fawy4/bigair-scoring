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

## 0.18.2 — 8 Oct 2026 {#release-0-18-2}

PR: #43

### What changed
- **The Draw page's seat colours follow the event's own colour list.** Fault seen on the live address: with the list cut to Red, Black, White, seat 1 showed RED but seats 2 and 3 showed "NOT SET" with no rider name; after putting the list back in order Red, Black, White and regenerating, seats still showed RED / YELLOW / BLUE. Cause: the draw dealt colours from the built-in list of the format, not from the event's list. Now seat 1 gets the first colour of the event's list, seat 2 the second, seat 3 the third, when a draw is made, regenerated, when a rider is moved by hand and in every later round. A division with its own list uses its own, and a line above the ladder says which list is in use.
- **A list with too few colours is refused**: "Heats here have up to 3 riders — keep at least 3 colours." (when saving the list, and when pressing Generate draw).
- **The rider label always shows the colour word and the name**, wrapping on a second line instead of being cut. If a colour is ever missing the name still shows.
- **"Changed by hand" now sits under the seat**, never over the colour or the name.
- A draw made before this fix keeps its old colours until **Regenerate draw** is pressed (a hand change also re-deals heats that have not started). A line on the Draw page says when that is the case.

### What to test
- [ ] Event step → More settings → Rider identification: the colour palette is Red, Black, White in that order. Draw → pick "Big Air Open" → **Regenerate draw**: every heat shows seat 1 RED, seat 2 BLACK, seat 3 WHITE, each with the rider's name, and the line above the ladder says "Seat colours follow the event's list: Red, Black, White."
- [ ] Move a rider by hand into another heat's seat 3: the rider now shows WHITE, the "changed by hand" tag sits under their name, not over it.
- [ ] On a phone, join as a judge in a heat of three: the rider strip shows the same colour word and name per rider as the Draw page.

### Known issues
- The list is checked against the draws already made and when a draw is generated; a division that has no draw yet is checked when you press Generate draw.

## 0.18.1 — 6 Oct 2026 {#release-0-18-1}

PR: #42

### What changed
- **The Impression card shows each rider properly.** Fault seen on the live address: on the head judge's console the Impression card showed only the Lycra word ("Red") on each rider's row. Now each row is the same Rider label as everywhere else: the Lycra block with the colour word, the name and the nationality, following the event's Rider identification scheme.
- **The selectable bars are in the rider's colours.** In the head judge's Impression sheet each rider's bar was white. Now it is filled in the rider's Lycra colour with the colour word on it in black or white, whichever reads at 7:1 or better (a plain plate under the word for middling colours such as red), then the name and nationality. The selected bar has a thick border and a tick. Day and Dark both.
- How Impression scores are entered and saved is unchanged. The card's rider column is a little wider so the name and nationality fit; at 1280 px with 5 riders the card is still a card.

### What to test
- [ ] Impression card: rider names. On the head console of a heat that has just ended (a simulation at ×1 will do), look at the Impression card: each rider's row shows the Lycra block with the colour word, the name and the nationality (for example RED, Omar Hassan, EGY).
- [ ] Impression sheet: coloured bars. Tap a judge's cell on the card: the sheet that opens has one bar per rider in that rider's colour (a red bar that says RED), the selected one with a thick border and a tick; tap another rider and the tick moves.
- [ ] Day and Dark: on the head console switch Daylight / Dark and open the same sheet: the colour words, names and the tick stay readable, and a bar is only white when that rider's Lycra is white.

### Known issues
- The manual screenshot of the Impression sheet was taken on a development server; `npm run manual:shots` will retake it on the production build.

## 0.18.0 — 6 Oct 2026 {#release-0-18-0}

PR: #41

### What changed
- **Judge: Rider sheet.** Beside the queue, judges get a second view. A switch at the top of the scoring screen (**Queue / Rider sheet**, remembered on each phone; the head judge's **Score** tab has it too) opens the heat's rider cards and, for the rider you tap, numbered lines (7 for Arrow). Type a score on a line the moment you see the jump, before the spotter has logged it. Your score is saved straight away as a private “pending” note; when the spotter logs the attempt the trick appears on the line and your score lands on it, by order of logging. If the spotter logs a crash, that line greys and any note on it is dropped. Change a score by typing again; there is no Save button.
- **Console.** Pending notes show as hatched rows (“pending · J1, J3”) after the logged attempts, are never counted or published, and never reach the public pages. **Publish is blocked** while one remains (“Omar Hassan: J3 has a score with no attempt”, with Learn more); the judge presses **Clear**, or the head judge adds the attempt.
- **Head judge Clear.** On a pending row of the console, a **Clear** beside a judge's note (one confirmation, reason optional) throws it away: the way out when that judge's phone is dead. The audit log says “Head judge cleared J3's pending score on Omar Hassan line 4: ‹reason or no reason given›”; the blocker sentence now says “…ask J3 to clear it, or clear it here”. Only the head judge's seat or an organiser can.
- **Spotter Undo** that removes an attempt which had taken a judge's note puts the note back on that line as pending (the trick vanishes, the score stays).
- **Submit** (end of heat) is refused while a judge still holds a note, and says which lines; the sheet shows “no attempt logged here” with **Clear**.
- **Audit log** lists a judge changing their own score (“J2 changed attempt 3 from 7.0 to 8.5 at 14:21:05”).
- **Unchanged:** the Queue, the spotter, Publish rules for everything else, the scoring. A division scored by criteria stays on the Queue.
- Fixed a fault where two screens following the same heat on one page (the head judge's Score tab) tried to add listeners to an already-open live channel.

### What to test
- [ ] Judge phone: open the scoring screen; it shows **Queue**. Tap **Rider sheet**, tap a rider: you see 7 numbered lines. Close the page and open it again: it is still on the Rider sheet.
- [ ] With a simulation at ×1 and no attempt logged yet, type 7.5, 6.0 and 8.0 on lines 1, 2 and 3. Each shows “pending”. Reload the phone: the scores are still there. On the laptop console they show as hatched “pending · J1” rows.
- [ ] Spotter: log a landing, a crash, a landing. On your phone, line 1 and line 3 show the tricks and keep your scores; line 2 is grey with “Crash”. On the console the pending rows are gone and your scores sit in your column on attempts 1 and 3.
- [ ] Change line 3 to 8.5: the console shows 8.5 within a few seconds without you pressing anything.
- [ ] Type a score on line 4, end the heat, press **Publish**: it is blocked with “‹rider›: ‹J1› has a score with no attempt” and a Learn more link, and cannot be published past. On the judge phone, **Submit** says which line; open the Rider sheet, press **Clear**; the blocker goes and Publish works.
- [ ] Head judge: leave a note on line 4 for a judge, end the heat, and on the console's pending row press **Clear**, confirm (leave the reason empty): the blocker goes, the judge's line is empty again, Publish works. The audit log shows “Head judge cleared … no reason given”.
- [ ] Judge types 7.5 on line 1; the spotter logs an attempt and presses **Undo** at once: the judge's line 1 loses its trick but keeps 7.5 as pending; the next attempt takes it.
- [ ] Another judge phone left on **Queue** still gets each attempt as a card and scores it with the pad; the console shows both judges' scores.

### Known issues
- The head judge's Clear is on the laptop console's pending rows; the phone's Control tab lists the blocker but has no Clear button.
- If a later attempt of the rider is logged before the spotter's Undo, nothing moves and the score stays on the removed attempt.
- Divisions scored by criteria are Queue only.

## 0.17.1 — 6 Oct 2026 {#release-0-17-1}

PR: #40

### What changed
- **The heat clock runs the run order's length.** Fault seen on the live address: you changed a heat's length in the run order and the run order showed the new length and re-flowed, but when the head judge started the heat the clock ran the old length, the one the draw had given it. Now the length on a heat's run order row is the one source: the moment you type it, the heat carries it, and when the heat starts (or its start sequence begins) its clock counts down from it. A heat that is in no run order, or whose row has no length of its own, still runs the length the draw gave it. Clearing a row's length gives the draw's length back.
- **Every screen shows the same length before and during the heat:** the head console, the judges' and spotters' phones, the Flag view, both big screens and the public pages. **+1 min** and the last-minute yellow work on top of it, and a simulation at any speed divides the run order's length (6 minutes at ×10 runs 36 seconds).
- **Heats that have started, ended or been published never change**, whatever is edited in the run order afterwards.
- Under the hood: one new column on a heat (the length the draw gave it, remembered while the run order overrides it) and database functions that keep a not-started heat in step with its run order row. Nothing else was changed.
- **Not in this version:** an “Apply to the not-started heats of this round” button next to Timing per round. It needs the Timing per round table to be editable after the draw is locked (it is read-only then), which is a bigger change; until then, set the length of a heat on its run order row.

### What to test
- [ ] Run order → set an un-run heat to **6** minutes (the draw says 10), press Start heat on the head console: the console, a judge's phone, the Flag view and the public live page all count down from **6:00**, and the heat ends at 0:00 after six minutes.
- [ ] On the same run order, clear that heat's length box before starting another heat: that heat runs the length its round was drawn with (for example 10:00).
- [ ] While a heat is running, change its length in the run order: the row is locked (a heat that started cannot be changed) and the clock keeps its own time; **+1 min** still adds a minute.

### Known issues
- “Apply to the not-started heats of this round” (Timing per round) is not built yet; change a heat's length on its run order row.
- A simulation shows the public live page only to its organiser, so the Flag view and public live page were checked at ×1; at ×10 the console and a judge's phone were checked.

## 0.17.0 — 4 Oct 2026 {#release-0-17-0}

PR: #39

### What changed
- **Presets you can manage (organisers).** Open **Load…** on a division's Scoring or Format tab, or the new **Presets** card on Organisation settings. Your own presets get **Rename**, **Delete** and (from the Load… menu) **Update preset from this division**; built-in presets get **Hide** / **Show**. Delete is refused, in plain words and naming the division, while a division of a live event uses the preset. A division that already loaded a preset is never changed by anything done to the preset afterwards.
- **Hiding built-in presets.** A hidden built-in is gone from your organisation's Load… menus only; **Show hidden (‹n›)** at the bottom of the menu brings it back. The owner's DEFAULT built-in cannot be hidden.
- **Built-in presets without JSON (owner).** Admin → Master presets lists scoring models and formats with **Add a preset**, **Edit** (the organisers' own Simple / More settings form), **Rename**, **Retire** / **Restore**, **Set as DEFAULT** and **Delete** (refused while any division uses it). **Save as built-in** appears on a division's settings while you are opened as an organisation. JSON import and export stay under Advanced.
- **The Load… menu stays on screen.** Every menu of that kind on the organiser and admin screens opens upwards when there is no room below and never runs off the edge.
- **A new home page.** The product name large, the live event first as a larger card with a gently pulsing dot, then Coming up and Results, the event code field and the quiet links; light or dark as the phone says. No sign-up, no new addresses, nothing else on the site changed.
- **A new division's Scoring tab starts filled in.** It begins with the DEFAULT built-in scoring preset already applied and editable (no “Choose a scoring preset…” first). **Based on: KOTA-style… (edited)** shows where it came from and whether you changed it; **Load…** is still the way to start from another preset, and **Save as preset…** still saves your own. The live dot on the home page is orange too (the only other accent besides the Go button); the arc is gone.
- **A way home.** On an event's public pages, the Join pages and the sign-in pages, the product name (or the organisation's logo) is a link to the home page and a quiet **Home** link sits at the foot. Not on the judge, spotter, console, Flag and announcer screens, nor on the big screens: they stay clean.
- **The Join pages in the home page's design.** The same header, type and spacing; rounded role cards; the PIN entry as the clear primary action (accent); the officials' part first and the riders' part (“Register to ride” / “Registration is closed”) below it; light and dark as the device says. Joining itself (addresses, role links, the PIN flow, the lockout rule) did not change.
- **Help everywhere.** A quiet **Help** link (the manual) on the public event pages, the Join pages, the sign-in pages and in the top bar of the organiser and admin screens; never on the officials' live screens or the big screens. It does not preload the manual.
- **+1 min on a running heat (head console).** Beside the heat clock, from the moment the heat runs until it ends, including the last minute: each press adds exactly 60 seconds to the time that is left, as often as needed. Every screen follows (judges, spotters, Flag view, big screens, public live page, Follow the heat); in the last minute the flag goes back to green and the yellow with its horn returns at the new 1:00; the run order re-flows from the new end; the audit log says who pressed and when the heat now ends. Not offered when the heat is not running. On a simulation a minute of heat time is scaled with the speed (6 s at ×10).
- **End heat asks once (head console and simulator).** “End this heat now? The clock stops and the heat goes to review.” with **Confirm** and **Cancel** (a reason is optional and goes to the audit log); what End does once confirmed is unchanged.
- **The start controls no longer vanish after End or Publish.** Cause: the console kept showing the heat that had just ended, and the start controls only belong to a heat that has not started, so they disappeared until a refresh; on a simulation, auto-play then starting the next heat looked like the next heat starting by itself. Now, when the heat shown is over and nothing is on the water, **Start heat sequence** and the **Pre-start** group are those of the next heat of the run order, within a second, on the laptop and the phone. On a real event nothing ever starts or arms by itself; only a running simulation with auto-play playing arms its next heat.
- **The red banner counts down the break.** After a heat the banner keeps “Finished” (or “Stopped”) and adds “Next heat in 3:40 · Advanced · R2 · Heat 12 · est. 14:20”, counting down from the run order's break (warm-up included); at 0:00 it reads “Next heat due · …” and starts nothing. On the console, the Flag view, the big screens and Follow the heat. With no active run order the banner is as before.
- **Break: +1 min, + Other… and Set length… (head console).** A **Break** group on its own line under the red banner (the banner has its own full-width line and is never covered; Pre-start stays beside Start heat sequence): the planned length ticked, **+1 min**, **+ Other…** (adds a typed time, m:ss or whole minutes) and **Set length…** (the whole break, counted from the end of the last heat, warm-up included). It changes the real break in the run order (the next heat's planned start moves; the run order's step and the public timetable show the new estimate; every banner counts down to the same new 0:00); both changes are audited and re-flow the day like Shift. No horn for a break.
- **Wind call buttons.** The picked colour is ticked, filled and has a thick border, the call that is showing carries an “On now” tag, and the buttons read Red — Stop, Amber — Hold, Green — LETS GO!.
- **Abort stays aborted.** On a simulation with auto-play playing, the simulator armed the same heat again at its next step, so Abort looked like a reset. A person's Abort now makes the simulator leave that heat alone (it keeps playing; the head judge starts the heat when ready). A real event was never affected.
- **The wind call on both big screens.** It was missing on Follow the heat. Both big screens now show it at the very top, in its colour, reading “Wind Call: ‹message›”; with no message it reads “Wind Call: Stop” / “Hold” / “LETS GO!” for red / amber / green, so it never relies on colour alone. The public pages use the same words.
- Under the hood: two new tables (which built-ins an organisation hid, which built-in is the DEFAULT), a "retired" mark on presets and a few database functions; nothing existing was changed.

### What to test
- [ ] On a throwaway organisation, a division's Scoring tab → **Load…** → **⋯** by one of **My organisation’s** presets: **Rename** shows the new name in the menu; **Delete** is refused (naming the division, with **Learn more**) while a division uses it and works when none does; **Update preset from this division** → **Yes, update the preset** says “version 2” and a division that loaded it earlier keeps its numbers. **Load…** → **⋯** on a built-in → **Hide**: gone, and **Show hidden (1)** brings it back; the DEFAULT has no Hide. A menu near the bottom of the screen opens with the whole menu on screen.
- [ ] As platform owner, Admin → **Master presets** → **Add a preset** (Load… a built-in, name, **Save**); then **Edit**, **Rename**, **Retire** (gone from an organiser's Load…), **Restore**, **Delete**. A division that loaded it earlier is unchanged.
- [ ] Add a new division: its **Scoring** tab shows the form at once with “Based on: KOTA-style: best 3 tricks + impression”; change “Best tricks that count” and “(edited)” appears; **Load…** another preset and the settings change.
- [ ] Open an event's public page, then its **Join** page: tap the product name at the top, then try again with **Home** at the foot: both land on the home page (do the same on /org/login). On the Join page the role cards are rounded with a thin border, the PIN button is the one orange thing, the officials' part is above “Register to ride” / “Registration is closed”, and dark mode follows the phone. Join with a PIN as before. The home page itself: the wordmark, one orange accent (the Go button and the live dot), the live or next event as a clear card, the **Have an event code?** field; dark mode follows the phone.
- [ ] **Help** is there and opens the manual: at the foot of an event page and the Join page, on the sign-in page, in the top bar of the organiser screens and of /admin. On a judge phone and on a big screen there is no Help or Home link.
- [ ] **Running heat → +1 min:** with a heat running (a simulation is fine), press **+1 min** beside the clock on the head console: the judge's phone, the Flag view and the public live page show one more minute; press it at about 0:40 and the flag goes back to green and the yellow comes back at 1:00. It is offered on the console while the heat runs and not otherwise.
- [ ] **End heat asks, and the start controls come back.** On the head console (laptop and phone) press **End heat**: the heat is still running and “End this heat now? The clock stops and the heat goes to review.” waits for **Confirm**; **Cancel** leaves the heat running. After **Confirm**, and again after **Publish**, the next heat's **Start heat sequence** and **Pre-start** group are there within a second without refreshing, and nothing starts by itself however long you wait. Start a heat sequence and press **Abort**: it stays aborted (on a simulation the panel keeps saying Playing and the simulator leaves that heat alone).
- [ ] **The red banner counts down the break.** End a heat whose break is 4 minutes: the red banner on the console, the Flag view and Follow the heat reads “Finished · Next heat in 4:00 · ‹division› · R1 · Heat 2 · est. ‹hh:mm›” and counts down. **Break: +1 min** makes it 5:00 everywhere and the next heat's estimate one minute later on the run order and the public timetable; **+ Other…** with 2:30 adds 2:30; **Set length…** with 2:30 makes the whole break 2:30 from when the heat ended. At 0:00 it reads “Next heat due · …” and nothing has started. Set a wind call with a message on Go live: both big screens, at the very top, show “Wind Call: ‹message›”, including Follow the heat; clear the message and set amber: it reads “Wind Call: Hold”.

### Known issues
- The **Format** tab was not changed: it never forced a preset (it offers the seven ladder types as cards), so only Scoring starts pre-filled.
- “Update preset from this division” is only in the Load… menu (it needs a division); the Presets card offers Rename, Delete, Hide and Show.
- “Set as DEFAULT” only protects a built-in (never hidden, never retired); it does not preselect anything for a new division.
- The brand brief (branding/LOGO-BRIEF.md) is not in the repository; the colours (#111111, #FF6A00) and shapes follow the pull request's description of it.

## 0.16.0 — 4 Oct 2026 {#release-0-16-0}

PR: #38

### What changed
- **Skip to end of heat now finishes the job.** After the virtual officials have logged and scored every attempt, the heat **ends** (the flag goes red, the clock reads 0:00) and waits **under review** for the head judge. It is **not published**: the virtual head judge leaves it alone until you press **Publish** on the console or **End heat and publish** on the panel. While it works the button reads “Fast-forwarding…”; with the auto-play paused it says so in a sentence.
- **Reasons are optional everywhere.** Reset event, Reset this division, Reset this heat, Cancel heat, Re-run heat, Re-open, hold a result, score and attempt edits, past-the-cap, publishing past a blocker, Unlock draw, Unlock scoring and format, and dismissing a trick proposal: one click confirms. The box stays, labelled **Reason (optional, for the audit log)**; with it empty the audit line says “no reason given”. (Clear actual times never asked for one.)
- **The simulator's auto-play respects the break.** After a heat is published it waits for the next heat's start time on the run order (break and warm-up, divided by the speed) and raises the yellow so that it *ends* at that start, never earlier. The head console's break countdown, the Flag view and **Follow the heat** show the same time. Simulator only: on the beach the head judge still raises the yellow by hand.
- **The simulator's left rail works.** Clicking **Draw**, **Riders** … on the simulator page opens that step (the page was busy asking the server for updates and the click waited behind it).
- **New: Clear this plan** on the Run order step. One click (reason optional) returns every heat that has not started to “Heats not in the run order”; breaks, notes and the times you pinned go with them; heats that have started, ended or been published stay (“3 heats already run stay”). The run order remains, empty.
- **Follow the heat:** one clock only (the flag pill with the time; the big black clock is gone); the live heat shows each rider's total, the formula line and **every trick's score in a box as it lands**, exactly as the public Live tab (under the event's live-scores switch); a heat that does not fit is split across pages instead of shrunk; the “page 1 of 2” counter is gone, the pages simply rotate.
- **New: Refresh from event** on the simulator panel (“Settings from ‹event› at hh:mm”). A simulation copy keeps the settings it was made with; Refresh copies the real event's current settings and each division's scoring rules, the attempt limit among them, before any heat has started.
- **Event step:** the empty “Name of the impression score” field shows the name the division uses now; the refusals judges and the head judge meet about this score use the name you set.
- **Event step: the section cards fold.** Behind **More settings**, every card (Web address, Branding and sponsor logos, Test run, Timing and the big screens, Scoring settings, Flags, Public page, Registration, Officials' join details) has a header with a small chevron: click to fold or unfold. The first card is open, the others folded; your choice is remembered in this browser; a card with a mistake in it opens by itself when you press Save. Only the layout changed: the **?** buttons, the Simple / More settings switch and everything inside the cards are as before; the phone folds the same way.
- **The public Join tab no longer hides itself while registration is closed.** It follows its own switch on the Event step's Public page card and nothing else, so officials can always enter their PIN there. When registration is closed the new **Riders** part of the Join page says “Registration is closed” (with your closed message); when it is open it offers **Register to ride**. The Public page card's **?** says so.
- Two small functions were added to the database (`clear_schedule_plan`, `sim_refresh_from_event`); nothing existing was changed. No scoring, ladder or timetable rule changed.

### What to test
- [ ] Simulator of a throwaway event at **×10**: **Start**, wait for a heat to run, press **Skip to end of heat**. The button says “Fast-forwarding…”, then every rider has attempts, the flag is red, the clock reads 0:00, the heat is under review, **Publish** is available on the head console, and nothing is published until you press it.
- [ ] Head console of a throwaway heat: **Reset this heat…** and **Cancel heat** each confirm with one click and the Reason box empty; then Go live → **Reset event…** on a throwaway event: type the web address and confirm with one click. Nobody asks for a reason; the audit log says “no reason given”.
- [ ] Simulation at ×10, after a publish: the next yellow does not start at once; it starts about 18 seconds after the heat ended (for a 4-minute break and a 1-minute pre-start) and the console's “Next: … starts in” counts down to it.
- [ ] On the simulator page click **Draw** in the left rail: the Draw step opens with **Draw** highlighted. Then on the Run order of a throwaway event press **Clear this plan** → **Yes, clear this plan**: the run order is empty and every heat is under “Heats not in the run order”; heats that already ran stay.
- [ ] Open **Follow the heat** (/screen/‹event›/follow) while a simulation runs: one clock (in the flag), each rider's total, the formula line and a box per trick as the scores come in, no “page 1 of 2”.
- [ ] Event step → **More settings**: only the first card is open. Click **Branding**'s header: it folds and its fields disappear; click again and what you typed is still there. Reload the page: the cards are as you left them. Type a bad web address in a sponsor's link, fold the card, press **Save event**: the card opens by itself and shows the message.
- [ ] Event step → Public page card: **Join** has no “hides itself” note. Close registration (Registration card), open the event's public page: the **Join** tab is still there, and on it the PIN doors work and the **Riders** part says “Registration is closed”. Open registration: the Riders part offers **Register to ride**.
- [ ] Change the attempt limit on the real event (Divisions → Scoring), then on its simulation press **Refresh from event**: the line “Settings from …” updates and the virtual spotters stop at the new limit. The Event step's empty impression-name field shows the division's name.

### Known issues
- Refresh from event matches divisions by name and does not touch the draw, heat lengths or the run order; it is grey once a heat of the simulation has started (Reset the simulation first).
- The platform owner's trick-proposal Dismiss also has an optional reason now; the organiser then sees “not added to the master base: no reason given”.
- Registration still has its own page (/e/‹event›/register); the Join tab only links to it, it does not repeat the form.
- The design preview pages (/design) keep their mock consoles; only the real consoles changed.

## 0.15.1 — 4 Oct 2026 {#release-0-15-1}

PR: #37

### What changed
- **Speed pass.** The organiser's screens, the simulator and Publish were taking two to four seconds because each one asked the database six to nine questions one after another. On a throwaway event with 24 riders and 15 heats (production build, the real database): every step of the left rail now opens in about half a second (it was 1.5 to 2.5 seconds), **Save** on the Event step answers in about 0.4 seconds (it was 3.9), **Lock draw** in 0.3, a simulator **speed** button looks pressed at once (it was 3.3 seconds), **Start heat sequence** and **Pause** show on the console at once and the database confirms within half a second (they were 1.6 and 3.5 seconds), and **Publish** asks the database twice instead of nineteen times (3.6 seconds before; about 1.2 seconds now, more when the database is busy).
- **Nothing about the rules changed.** Scoring, ladder and timetable are exactly as before; the same engine scores the heat and the same transaction writes it. The public pages, the judges, the spotters and the Flag view are untouched.
- A press on the head judge's console is shown at once and confirmed by the database; if the database refuses, the button goes back and says why. **End heat** and the plain **Start heat** (flags off) are not guessed: they show from the database's answer, a moment later.
- The head judge's score, Impression and Absent actions read the heat's scoring rules in one request instead of four, so **Absent** on the review bar turns it green in about 1.5 to 2.5 seconds (3.9 seconds before).
- A **Pause** or **Resume** pressed on the console shows on the simulator panel the moment it is written.
- **View as…** on the simulator panel lists **Big screen — Follow the heat**, opening the new address for the simulation event.
- The measuring tool used for these numbers is in the repository (`e2e/speed.spec.ts`); the before and after tables are in the pull request.

### What to test
- [ ] On the live address, open an event and click through the left rail: **Event → Divisions → Riders → Officials → Run order → Go live**. Each step opens in about half a second (under a second), with no blank wait.
- [ ] Event step: change the event name and press **Save event**. “Event saved” appears in under a second and “● Unsaved changes” goes away; press Save again straight after a second change and it is just as quick.
- [ ] Draw step on a throwaway division: press **Lock draw**. It says Locked in well under a second.
- [ ] Simulator panel of a throwaway simulation event: press **×10** (then **×1**). The button looks pressed the moment you press it, and a reload shows the same speed.
- [ ] Head console of the simulation: **Start heat sequence**, then **Pause**, then **Resume**. Each shows on the console at once (the yellow, the frozen countdown, the countdown going again) and the sentence under the buttons follows within about half a second.
- [ ] Simulator panel open beside the head console: press **Pause** on the console. The simulator panel says **Paused** within a second without you touching it.
- [ ] On the head console, end a throwaway heat with all scores in and press **Publish this result** → **Publish**. The heat shows as published (Re-open is available) in about a second.
- [ ] Press **Publish** on a heat that still has a missing score: the same list of what blocks it appears as before, with the same **Fix** buttons.

### Known issues
- The numbers in this entry come from the sandbox the work was done in, which reaches the hosted database through a proxy (about 0.15 seconds per round trip); on the real address the same screens should be faster. Publish still waits for the database to write the result (the write is the larger of its two calls), so on a busy free-tier database it can take over a second.
- The screen text file (`ui-copy.ts`, about 82 kB compressed) is still shipped whole with every page; splitting it is a large change for its own pull request. The steps do not keep earlier steps' data in the browser between clicks (see the pull request for why); each step asks the database once instead.
- Two foreign-key columns have no index (`sim_seats.viewed_by`, `trick_attempts.possible_duplicate_of`); no organiser screen filters by them, so none was added.
## 0.15.0 — 4 Oct 2026 {#release-0-15-0}

PR: #36

### What changed
- **New: Big screen — Follow the heat** (a second big-screen address, /screen/‹event›/follow, for a TV or a projector — never a phone). While a heat is armed or running it stays on that heat: the riders with their Lycra colours, the clock, the flag frame and the state word, live totals only if the event allows live scores. When the head judge ends the heat it stays on it and says **Judges reviewing** until the result is published.
- **Then it alternates Results and Ladder:** the result of the heat just published, the ladder, the result of the heat before, the ladder … through every heat published today, then round again (a new publish starts the walk again from it). Each Results page names its heat and when it was published and shows the full result as on the public Results page: every rider's attempts with their scores (counted ones highlighted, crashes marked), the Impression / Variety score, the total and the place. A heat or a ladder that does not fit at TV size is split across pages (“page 1 of 2”), never shrunk.
- **The moment the next heat is armed** the screen jumps to the live heat by itself. A thin line at the bottom says “Next: ‹heat› · est. ‹time›”. If the connection drops it keeps the last page and shows a small **Reconnecting** label.
- **New setting** on the Event step, behind **More settings**: **Follow the heat — seconds per page** (default 15, 5 to 120). The existing **Big screen: seconds per page** still controls the first big screen only.
- **Go live** has a new shortcut, **Big screen — Follow the heat**.
- **The Note button is gone from the big screen** (the old one too), even for a signed-in organiser. Nothing else changes on the first big screen.

### What to test
- [ ] Go live → **Big screen — Follow the heat** opens a new tab with a clean screen (no Note button, no menu, no prompts). Press **F** on a laptop: full screen on; press **F** again: off.
- [ ] On a throwaway event with a simulation running at ×20 (Event step → Simulation, then Simulate → Start): open the screen through the simulator's **View as → Big screen** and change the address to end in /follow. While a heat runs it stays on that heat (flag frame, clock, riders with their Lycra colours) and does not rotate.
- [ ] When the heat ends the screen says **Judges reviewing** and stays on that heat. Press **Publish** on the head console (**View as → Head judge (laptop)**): the screen switches to that heat's **Results** page (“…· published hh:mm”).
- [ ] After the first publish, watch 40 seconds: Results and Ladder alternate every 15 seconds; after two or three heats are published each Results page is the heat before (newest, then the one before, then the one before that, then the newest again). Each Results page shows every attempt's score of every rider, the same as **Results** on the public page for that heat.
- [ ] While it is alternating, press **Space**: the walk stops (“Paused — press space to continue”); press it again to carry on. Press **D**: Day / Dark colours switch and are remembered after a reload.
- [ ] Event step → More settings → **Follow the heat — seconds per page**: type 4 and click elsewhere: the box holds 5; type 121: it holds 120 (nothing outside 5 to 120 can be saved). Type 7 and Save: the pages now change every 7 seconds.
- [ ] While the walk is showing a Results page, press **Start heat sequence** on the head console (the yellow): within a few seconds the screen jumps to the live heat by itself.
- [ ] Open the first **Big screen** (Go live → **Big screen**): it looks and rotates as before, and has no Note button.

### Known issues
- The screen asks the server twice a second, but the public pages and the big screens share a copy of the answers that is at most about 3 seconds old (Fix session 2), so on the live address the jump to the live heat and “Judges reviewing” follow the head judge's button within about 3 to 4 seconds, not two. Anonymous visitors cannot listen to the database's realtime channel, so the screen polls, as the public pages do.
- If a heat's division has no ladder, its Results page is not followed by a Ladder page.
- An old heat that was ended and never published stops holding the screen on “Judges reviewing” as soon as a later heat has started.
- The Follow the heat screen is not offered in the simulator's **View as** list; open it by adding /follow to the big screen's address.

## 0.14.1 — 4 Oct 2026 {#release-0-14-1}

PR: #35

### What changed
- **Fix session 2 — the audit's fix list.** The officials are walled off from the crowd: the public pages and the big screen answer from a shared copy that is at most about 3 seconds old (so 300 phones cost one set of database calls per page every 3 seconds, not 300), and past a safety limit the extra visitors get a calm **Updating…** page that retries by itself. The console, the judges, the spotters, the Flag view and the organiser screens never go through it. The "last seen" mark is written at most once a minute.
- **A withdrawal after the draw is locked becomes a walkover** (Riders step) and the public ladder shows it; **Remove** of a rider who has a seat is refused and points to Withdrawn.
- **Resets are refused during a yellow** (“Abort the start sequence first.”); **switching Flags off** no longer un-starts a running heat and works during a paused yellow.
- **Joining can no longer be blocked by strangers:** wrong PINs count per phone and connection; a right PIN from a clean phone always works.
- **Trick base:** + Add block shows the renamed families (v7), the panel and the spotter agree, saving never writes old families back.
- **Console:** the Impression card stays a card at 1280 px and wider with 3, 4 and 5 riders.
- **Big screen and Flag view:** no text is ever cut with “…”; the header fits the width (the heat pill whole, the event name wrapping), the Day / Dark button has its own corner.

### What to test
- [ ] On a throwaway event with a **locked** 15-heat draw: Riders step → set a rider to **Withdrawn** → the Draw step shows their seat as a walkover and the public **Ladder** page shows it too.
- [ ] Riders step → **Remove** on a rider who has a seat → refused with “This rider has a seat in the draw — set them to Withdrawn instead” and a **Learn more** link; **Remove** on a rider without a seat still works.
- [ ] Head console: **Start heat sequence** (yellow up) → press **Reset this heat** → refused with “Abort the start sequence first.”; press **Abort**, then reset works.
- [ ] Start a heat sequence, **Pause** the yellow, then Event step → Flags off → Save: it saves and the heat is simply not started (nothing armed).
- [ ] Join page: type 10 wrong PINs on one phone → that phone is told to wait; a second phone with the right PIN joins at once.
- [ ] Divisions → **Trick base**: the family names are the newest master version's (for example “Board Variations”, “Landings”), **+ Add block** lists the same names, and the spotter shows them after you tick or untick a block.
- [ ] Open the **big screen** for an event with a very long name on a 1920 px TV or laptop: the event name wraps, the “Next: …” pill shows the whole heat name, nothing ends in “…”, and the quiet Day / Dark button (move the mouse) sits in the bottom left corner without covering any text.
- [ ] Head console on a 15-inch laptop (about 1366 px) with 3 riders in an ended heat: the **Impression** card is a card beside the rider cards, not a button.

### Known issues
- The **hosting** is still the owner's half of A1b-0 and A1b-11 (Supabase Pro with the Small compute; Vercel Pro). The load proof (300 spectators, ramp to 300) was measured on 4 Oct on the compute as it was (60 connections, not the Small compute): the officials stayed fast and nothing failed; the tables are in the pull request and `docs/AUDIT.md`.
- The head judge's **Did not start** in the console's rider menu still sets a DNS for one heat only; Withdrawn in the Riders step is the way to make a seat a walkover.
- Eight stale browser tests (A1b-12) are listed in the pull request: see "Tests" there.

## 0.14.0 — 4 Oct 2026 {#release-0-14-0}

PR: #34

### What changed
- **Download results** on the Go live step (and on the head judge's laptop console): a spreadsheet (CSV, opens in Excel) with one row per rider per published heat — division, round, heat, Rider label, name, Lycra, each attempt with its score, Landed / Crashed and whether it counted, the Impression / Variety score, the heat total, the place, the result version, who published it and when — then the division placings so far and the ladder seats.
- **Open printable results**: a page in a new tab showing every published heat exactly as the public Results page does (same pieces, so they cannot disagree), division by division, newest heat first, with the event name and the export date and time at the top of every page. Print it or save it as PDF.
- Only what the public sees is in the files. **Include heats under review (draft)** (organisers only) adds heats under review or held back, labelled DRAFT, for an end-of-day safety copy.
- **Download event backup** (Go live, organisers only): one file `‹event›-backup-‹date›-‹time›.json` with the whole event — settings, divisions with scoring and trick base, riders, officials (names and roles, never PINs or passwords), the draw, run orders, heats, attempts, scores, every result version, the audit log and the notes. **Restoring from a backup does not exist yet.**
- Judges, spotters, announcers, observers and the public never see the buttons and are refused by the addresses. A download changes nothing in the event; its only trace is one audit-log line. `docs/EXPORT-FORMAT.md` describes both files for the session that will build the restore.
- **Database update** (migration `20261025100000_export_audit.sql`, already applied to the hosted project): two small functions, `export_role` and `log_export`. Without them the buttons answer “The file could not be made.”

### What to test
- [ ] On a test event with two published heats, open **Go live** on a laptop. In the **Results and backup** card press **Download results**. Open the file in Excel: you see one row per rider per heat, every attempt's score, each rider's total and place, then “Placings so far” and “Ladder seats”.
- [ ] Tick **Include heats under review (draft)** (tap **?** to read what it does) and press **Download results** again: a heat that is under review appears, labelled DRAFT; unticked, it is not in the file.
- [ ] Press **Open printable results**: a new tab shows the heats like the public Results page, with the event name and “Exported ‹date› ‹time›” at the top; use **Print or save as PDF** and check the header repeats on every page.
- [ ] Press **Download event backup**: one file downloads; open it in a text editor and recognise your event (its name, a division, a rider) with no PIN anywhere.
- [ ] Open the head judge console on the laptop with the head judge's PIN: **Download results** and **Open printable results** are under the wind call; there is no backup button and no draft box. Press **Download results** while a heat is running: the heat is not disturbed.
- [ ] On a judge's phone (and a spotter's, and an observer's) look at every screen: no download button anywhere. Open `‹live address›/export/‹event id›/results.csv` on the judge's phone: it says “Only an organiser of this event or its head judge can download the results.”
- [ ] Open the public event page as a visitor: no download button on any page.

### Known issues
- The backup holds some fields named `key`, `content_hash` or `client_key`. They are not secrets: palette colour names, fingerprints of the public scoring-model presets, and the random numbers that stop a score being saved twice. No PIN, PIN hash, QR token, link or password is in either file (searched on a test event with planted values).
- A restore from a backup does not exist.

## 0.13.1 — 4 Oct 2026 {#release-0-13-1}

PR: #33

### What changed
- **Self-audit 1b (no change to the product):** the system was tested end to end for the Gouna configuration — the ladder on the real database, the flags and start sequence, phones racing each other, security, data integrity, the screens, a virtual rehearsal at ×20 and the hosting limits. The findings, with a fix list in order, are in `docs/AUDIT.md`; the new tests are in the test suites (those that describe a fault are marked to fail until it is fixed).
- **The headline:** the database machine of the free hosting fell over for 1 h 43 min during the audit (3 Oct, 21:42–23:25 UTC, every screen and the live address down), and a load test shows it slowing to unusable at 300 spectators. The hosting must be upgraded before Thursday (A1b-0, A1b-11 in the audit).
- Nothing on any screen, setting or database object changed.

### What to test
Nothing to test on the live address.

### Known issues
- Everything in `docs/AUDIT.md` → "Findings by severity", A1b-0 to A1b-21, for the next fix session.
- Eight browser tests are red on main because they are wrong or out of date (the master trick base v7 renamed families; the manual has 43 pages; publish-blockers builds an accidental tie; the e-mail link test cannot run in a sandbox) — A1b-12.

## 0.13.0 — 3 Oct 2026 {#release-0-13-0}

PR: #32

### What changed
- **Flags:** the heat clock now drives four flags — yellow before the start, green while the heat runs, yellow for the last minute, red when nothing is running (the words say Finished, Paused or Hold). On for every event, existing ones included (Event step → **Flags** to switch off, rename or recolour; pre-start and last-minute lengths).
- **Start heat sequence:** on the head judge's console **Start heat** is now **Start heat sequence**, the one primary button. The pre-start is a labelled setting beside it, **Pre-start:** — the event's default (ticked), **Other…** (type 1:30 or whole minutes, 0:10 to 15:00) and **Start now**. The heat starts by itself at the end of the yellow, with a horn, and does not depend on any phone staying awake.
- **During the yellow** the head judge keeps control at every moment: **Start now**, **+1 min** (exactly one more minute, as often as needed, written to the audit log, on every screen within a second), **Pause** / **Resume** (the countdown freezes and carries on) and **Abort**.
- **Reset this heat** is a visible button right before **Cancel heat** (the heat menu is gone: it held nothing else). A reset heat is not started: the flag shows red / Stopped and no start sequence is left on it.
- **Flag strip** on every live screen, a coloured frame on the big screen, announcer cues, the **Flag view** for the beach marshal at /e/‹event›/flag (grey after 10 seconds without the server; it now refreshes every second) and **horns** behind **Sound on**.
- **Review bar and Impression card** on the console; the live-scores switch is back in the **More** menu and **Release result** is a visible button beside **Publish**. The Impression card has a proper heading above its grid.
- **Name of the impression score** (Event step → **Scoring settings**): Impression, Variety… used on the card, the judges' phones, the review bar, the judges' sheets, the public results and rules and the big screen. Empty keeps the name each division's scoring gives it.
- **Simulator:** every speed is measured: the heat, the pre-start, the last minute, the break and the virtual officials all follow the speed. **Pause** freezes the yellow too, and the auto-play arms a heat only while it is playing and only if the head judge has not armed it. **Skip to end of heat** now fast-forwards the virtual officials and leaves the heat running; the old behaviour is **End heat and publish**.
- **Draw step:** compact cards (a seat is one line; the heats of a round in tight columns: 8 heats of 3 fit a laptop screen) and the selection banner is pinned to the top of the window.
- **Rider door:** a public **Riders** tab lists everybody and each name opens that rider's page; every rider page has a QR, its address and an Add to home screen hint; the Riders step has **Rider links** (a printable sheet with a QR and address per rider and “Name — address” lines for WhatsApp).
- **Wider organiser and admin screens:** the content uses the window up to 1400 px; tables and cards use the full width; only explanatory text stays at about 70 characters a line.
- **Needs the database changes** `20261021100000_flags_start_sequence.sql`, `20261022100000_flags_prestart_controls.sql` , `20261023100000_impression_name.sql` and `20261023100100_drop_unused_fast_forward.sql` (all applied to the hosted project; the first also switches Flags on for every existing event, Arrow, EKL and Demo included).

### What to test
- [ ] On Demo, open the head judge console on a laptop. The button says **Start heat sequence**, on its own; beside it a box labelled **Pre-start:** has **1:00** ticked, **Other…** and **Start now**. Pick **Other…**, type **0:05** and press Enter: a sentence says the pre-start has to be between 0:10 and 15:00. Type **1:30**: **Other…** now reads **1:30** and is ticked. On your phone open the **Flag marshal's screen** (Go live → **Flag marshal's screen**): it is red and says what comes next.
- [ ] Press **Start heat sequence**: the phone turns **yellow** counting down from 1:30. At about 0:40 press **+1 min** on the laptop: both show about 1:40 within a second; press it again for another minute. Press **Pause**: the phone turns red and says **Paused**, the countdown stands still; **Start now**, **+1 min** and **Abort** are still there. **Resume**: yellow again from the same time. Press **Abort**: the phone is red and the heat is not started. Start again with **Start now** ticked: green at once (tap **Sound on** on the phone first to hear the horn).
- [ ] With a heat running: at the last minute both turn **yellow** with one horn; at 0:00 both turn **red**, say **Finished — next: …** and sound two horns. On a judge's and a spotter's phone the clock line is the coloured strip and every button is still on screen; the big screen has a coloured frame. Switch the Flag view's phone to aeroplane mode for 12 seconds: it turns **grey** and says “No connection — check with the head judge”. Event step → **Flags**: switch **Flags on** off, save: plain **Start heat** and the plain timer return; switch it back on.
- [ ] End a heat while one judge has not pressed Submit: an **amber** bar under the heat's name names the judge; a missing score makes it **red** with **Fix** and **Absent**; then **green**. An **Impression** card with its **heading above the grid** (same style as **Riders**) sits beside the rider cards. Then press **Reset this heat**: the button is on the same row as **Cancel heat** and asks once; afterwards the phone is **red / Stopped** (not Finished) and the console offers **Start heat sequence** again. A held final shows **Release result** next to **Publish**, and **More** still has the **Live scores** switch.
- [ ] Event step → **Scoring settings** → **Name of the impression score**: type **Variety**, save. The console's card heading, a judge's phone (after the heat), the review bar's red sentence and the public results (“= tricks 15.5 + Variety 5.0”) all say **Variety**. Empty the field and save: each division's own name returns.
- [ ] On the Demo's simulation set the speed to **×10** and Start: the yellow lasts about 6 seconds, the heat about a minute, the last minute about 6 seconds. During a yellow press the simulator's **Pause**: the countdown stops; **Resume** (on the console) carries on. During a running heat press **Skip to end of heat**: every rider's attempts and scores fill in at once but the heat keeps running until you press **End heat**. **End heat and publish** ends and publishes in one go.
- [ ] Organiser → Draw step on a 24-rider Knockout: round 1 (8 heats of 3) shows as two short rows and fits the screen without scrolling; each seat is one line (colour block, name, seed). Tap a rider and scroll down: the banner with **Swap with…** / **Move here** and **Cancel** stays at the top of the window. **Print / PDF** looks as before. Open **/admin → Organisations → Arrow**: the table is as wide as the window and the Actions cell no longer wraps every sentence; on your phone nothing changed.
- [ ] Open the public event page: there is a **Riders** tab listing everybody; tap a name: that rider's page has **Share** with a QR code, an address (open it: same page) and the “Add this page to your home screen” hint. In the Riders step press **Rider links**: a sheet with a QR and address per rider, and a box of “Name — address” lines with **Copy the lines** to paste into WhatsApp.

### Known issues
- Not tried on a real phone; the horn sound is a synthesised tone, not a recorded horn.
- At ×10 the break countdown follows the speed but **+1 min** on a break still adds a whole minute of the run order.
- The speed applies from the next heat: a heat already in its yellow or on the water keeps the speed it began with.
- The strip's words after “Finished” stay until the next heat starts, also during a long break.

## 0.12.0 — 3 Oct 2026 {#release-0-12-0}

PR: #31

### What changed
- **One pause:** pausing a simulated heat from the head judge's console or from the simulator is now one state — the heat clock and the virtual officials stop together and resume together, from either place.
- **Release result** is a visible button beside Publish on the console (laptop and phone) when a heat's result is held. (A first version of this entry said the live-scores switch moved out of the More menu; that was wrong and is corrected in 0.13.0.)
- **Big screen colours:** Day and Dark; tap or move the mouse for the button, **D** on a laptop; remembered per browser; the Event step sets the default.
- **Admin → Feedback:** date filter, tick boxes, Select all, Set done / Reopen many notes at once; the export follows the filter.
- **Public page tabs:** the organiser switches tabs off on the Event step; an old link to a hidden tab lands on the first visible tab. Join hides itself while registration is closed (the join page itself keeps working for officials).
- **Copy a plan to another day:** only heats that have not ended, no breaks or pins (audit A1a-7 fixed).
- **Judge pad:** a typed score off the step says why, under the box.
- **Needs the database changes** `20261020100000_polish2b_one_pause.sql` and `20261020100100_polish2b_public_site_settings.sql` (both applied to the hosted project).
- **Tests only:** the simulator RLS test describes the one-pause behaviour; the simulator browser test taps the speed button until the page has loaded (the button itself works); the head judge browser test expects the Learn more link; the trick base browser tests follow the owner's published master edits and step aside while an owner draft is open.

### What to test
- [ ] On the Demo's simulation (or a throwaway one), set the speed to ×10 and Start. Open View as → Head judge laptop. Press **Pause** on the console: the simulator panel says **Paused** within a second or two and no new attempts or scores appear for 10 seconds. Press **Resume** on the simulator: both run again. Then press **Pause** on the simulator and **Resume** on the console.
- [ ] On the head console, publish a final of an event whose results are held (Event step: results not shown on publish). Next to **Publish** a **Release result** button appears; tap it: “Result released to the public.” A heat that is not held has no such button. **More** has the **Live scores** switch (Follow division / Live / Not live) as before.
- [ ] Open the big screen (/screen/‹event›). Move the mouse or tap: a Day / Dark button appears in the top left and goes away after three seconds. Tap it: the colours switch. Reload: the choice is remembered. Press **D**: it switches back.
- [ ] Event step → More settings → **Big screen: colours**: choose Day, save, open the big screen in a private window: it opens in Day.
- [ ] Admin → Feedback: click **Today**, tick three notes, press **Set done**, confirm: it says “3 notes changed”. Select them again and press **Reopen**. Press **Export for Claude**: only the notes of the filtered list are in the file.
- [ ] Event step → More settings → **Public page**: switch **Rules** and **Join** off, save. Open the public event page: the tabs no longer show them. Open the old address /e/‹event›/rules: it lands on the first tab, not on “not found”.
- [ ] Run order, on a day with no plan: **Copy ‹other day›'s plan to ‹day›** brings only the heats that have not ended, no breaks and no pins, and says “Copied ‹n› heats — add this day's breaks and the first heat's pin”.
- [ ] On a judge's phone (or the Design page), type 7.25 in the small score box on a 0.1 step: **Save** stays grey and “That score is not on the 0.1 step. Use 7.2 or 7.3.” shows under the pad with a **Learn more** link.

### Known issues
- The console shows a pause made on the simulator through its live connection (under a second on the live address); where live connection is blocked it asks every 5 seconds.
- A pause of one heat pauses the simulator's virtual officials for the whole simulated event (one state), also when another heat of another division is running.
- Removing an outside leaderboard shifts the numbering of the ones after it; a tab switched off by number may then belong to the next one.
- The master trick base has an unpublished draft of the owner on the hosted project, so the trick base editor browser tests step aside until it is published or discarded.

## 0.11.1 — 3 Oct 2026 {#release-0-11-1}

PR: #29

### What changed
- **Tie with no counted trick (audit A1a-1):** two riders on the same total who both have no counted trick (for example both crashed everything and got the same Impression) are now a real tie. The console says the tie is open, Publish is blocked until the head judge decides, and the order the riders were listed in no longer picks the winner. Before, the engine said "resolved by highest counted trick" and put them in slot order. In a final of 2 that picked the winner without anyone deciding.
- **Scores off the step (audit A1a-3):** a score that is not on the division's step (7.25 on a 0.1 step) or outside the scale is now refused by the database for every judge and for the head judge, with a sentence that names the step and the two nearest values ("That score is not on the 0.1 step. Use 7.2 or 7.3."). The scoring engine also no longer blanks a heat for such a value: it counts the nearest allowed value and the rider's explanation says "J1: Impression 7.25 is not on the 0.1 step, counted as 7.3", so every total still appears.
- **Needs the database change:** migration `20261019100000_fix_audit_1a_score_step.sql` (applied to the hosted project; the live address needs this release deployed too). The tie fix and the engine change need nothing.
- Not changed, on purpose: the knockout sizing rule (A1a-2), copying a plan (A1a-7), and Shift / the lateness badge (A1a-4, A1a-5; see Known issues).

### What to test
- [ ] On a test event (not Arrow, EKL or the Demo), open a heat of two riders, log only crashes for both, end the heat and give both riders the same Impression: the head console lists a tie for first place and "Before you publish" is blocked until you choose who goes ahead.
- [ ] Choose a rider in that tie: Publish becomes available and the chosen rider is placed first.
- [ ] On the head console of an ended heat, open "Enter ‹judge›'s sheet" for a division with a 0.1 step and type 7.25 as a rider's Impression: you see "That score is not on the 0.1 step. Use 7.2 or 7.3." and nothing is saved.
- [ ] Type 10.5 in the same place: you see "That score is outside the scale (0 to 10)."
- [ ] Type 7.2: it saves.
- [ ] On a judge's phone in a running heat, type 7.25 in the small score box: Save stays grey and the box is outlined red; type 7.2: Save works.

### Known issues
- Shift +N can still move the next heat up to 59 seconds less than asked, and the lateness badge can still show 1 minute more than the two times on the board (audit A1a-4 and A1a-5). They do not share a helper. Decision: when it is built (after the event) Shift will be "never shorter than asked", like the +1 minute rule, so the board may then show N + 1 minutes. Left for after the event.
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
