# Troubleshooting

Look up the symptom: what you see, why it happens, how to fix it — first the common problems on the beach, then every sentence the product can show, alphabetically.

Last checked: 3 Oct 2026 · Product version 0.9.2

**One-minute method.** 1) Read the sentence on the screen: almost every refusal names its fix, and the organiser screens put a **Learn more** link after it. 2) A grey button has its reason written under it. 3) Search this manual (top of /help) for two words of the sentence. 4) Check the [dependency map](dependencies.md): most problems are a missing step before the one you are on. 5) Still stuck: /admin/health, then the server logs with the error reference.

## Common problems {#t-common}

| Symptom | Cause | Fix |
|---|---|---|
| {#t-grey-button} **A button is grey** (dashed frame) | Something it needs is not true yet. The reason is written under the button (on the head console's phone view, under the button too). | Do what the sentence says. The [dependency map](dependencies.md#dep-map) lists every button's conditions; for Hold, Resume at and Shift it is almost always “no run order is active for today” ([Hold](dependencies.md#dep-hold)). |
| {#t-404} **A public page says “This event isn't public” (404)** | The event is a draft (Published not ticked), a simulation event, archived, or its organisation is archived — or the address is wrong. The page never says which, on purpose. | Event step → tick **Published**, Save. A simulation is never public (use the Simulator's View as). Check the address (the event code is its last part). |
| {#t-404-page} **“This page doesn't exist”** | A wrong address; or /admin opened by somebody who is not a platform owner or staff. | Check the address; sign in with the right login. |
| {#t-no-ladder} **Public ladder or heats missing for one division** | Its draw is not locked; a division whose draw is not locked is not public (it still appears on Rules). | Draw step → **Lock draw**. |
| {#t-no-results} **Results do not appear on the public pages** | The heat is not published; or “Show results automatically when a heat is published” is off and the result was not released; or it is the held final. | Head console → **Publish**, then **Release result**. Event step → tick “Show results automatically…”. |
| {#t-judge-no-attempts} **A judge sees no attempts** | The judge is not on the panel of the running heat's division (“You are not on the panel of a heat that is running.”); or no heat is running; or the spotter is logging on another heat; or the phone is offline. | Officials → **Panels**: tick the judge for that division. Check the heat is started (head console). Check the spotter's screen shows the same heat. Look at the connection badge. |
| {#t-pin-refused} **A PIN is refused** | “That event code or PIN is not recognised…”: wrong event code or PIN, the seat is switched off, the PIN was regenerated, or the event is archived. “Too many wrong tries…”: ten-minute lock-out. “This browser is signed in as an organiser…”: use another browser. | Officials → **Show PIN** (read it out), **Switch on**, or **Regenerate PIN**. Wait ten minutes after too many tries. On an organiser's laptop use a private window. |
| {#t-qr-refused} **A QR card does not work** | A QR code works once; printing the cards again makes older codes stop working. | Type the PIN, or print the card again. |
| {#t-heat-cannot-start} **A heat cannot start** | The draw is not locked; the division's panel is short of judges; a seat still waits for a rider (“1st H1”); another heat is running (one at a time by default); the heat is cancelled. | Read the red sentence; see [Start a heat](dependencies.md#dep-start-heat). |
| {#t-winner-not-in-seat} **The winner is not in the next heat's seat** | The feeding heat is not published; or the next round re-seeds from every result (“By their result in the previous round”), so its seats are dealt only when every feeding heat is published (“seat pending”); or, on the public ladder only, the result is held and not released. | Publish the feeding heats; release a held result. Use Draw → seat menu to place a rider by hand if you must (audited). |
| {#t-times-wrong} **Times are wrong** (all estimates, wrong day, wrong hour) | No plan is active for today; the first row is not pinned (“No finish yet: pin the first start time”); the event's time zone is wrong; a heat has no length (“No heat length — set it in Divisions → Format”); a row points at a heat no longer in the draw; the run order is on hold. Times are estimates: pins mean “not before” and the day re-flows from real starts. | Run order: Activate today's plan, Pin the first start, take out ⚠ rows. Event step: Time zone. Divisions → Format: heat length per round. Resume a hold with Resume at. |
| {#t-application-error} **“Application error” or “This page could not be shown”** | The page failed while loading; nothing was changed. Since 1 Oct 2026 every live page, organiser step and public page shows a readable page with **Try again** and an error reference instead of a blank “Application error”; a part of a page (the run-order list) can fail alone. | **Try again**. If it repeats: note the error reference and the time, open /admin/health, tell the owner (the hosting logs name the cause). The run-order crash of 1 Oct (a row pointing at a removed heat) is fixed: such a row now shows a ⚠ note with ✕. |
| {#t-offline-badge} **The badge says Offline or Pending ‹n›** | The phone has no connection; scores and attempts wait in the phone's queue. | Keep the page open; move toward the hotspot. They are sent when the signal is back, without duplicates (“Synced”). **Failed — tap to retry**: tap it; read the sentence. |
| {#t-memory-only} **“This phone cannot keep unsent scores through a reload…”** | The browser blocks storage (private mode, some in-app browsers). | Keep the page open until Synced; on iPhone use the home-screen app. |
| {#t-duplicates} **The same jump appears twice** (“possible duplicate”) | Two spotters logged the same rider within the duplicate window (default 20 seconds). | Head console: tick both → **Merge** (keeps the first logged attempt), or attempt menu → **Merge duplicate**; **Delete** one if it was a mistake. |
| {#t-outlier-colours} **Coloured cells on the score table** | Each judge's cell is coloured by its distance from the panel score: green within the tolerance (the scoring rules' outlier warning, % of the scale), then yellow, orange, red; “outlier” in amber. Nothing is changed automatically. | Ask the judge (“sure?”); **Edit score** with a reason if it was a typo. The tolerance is in Divisions → Scoring → More settings. |
| {#t-email-limit} **Sign-in e-mails do not arrive / “Too many sign-in emails were requested”** | The hosted e-mail plan sends only 2 sign-in e-mails per hour; the built-in sender may only write to the project team's own addresses. | Sign in with a password (set it once with **Set a password**). For a new organiser the owner unticks **Send the sign-in email now** and sends the link shown (WhatsApp); it works once, for 24 hours. Or wait up to an hour. |
| {#t-link-failed} **“That sign-in link did not work.” / “…has already been used or has expired”** | An invitation link works once, for 24 hours (in any browser). A link asked for on the sign-in page must be opened in the same browser that asked for it. | Sign in with the password; or **Forgot password?**; or ask the platform owner for a new invitation. |
| {#t-hold-grey} **Hold / Shift / Resume at are grey on Go live** | No run order active *for today* in the event's time zone (an active plan for another day does not count), or already on hold / not on hold. | Run order → today's day → **Activate this plan**. See [Hold](dependencies.md#dep-hold). |
| {#t-no-countdown} **No break countdown on the console** | “No countdown: …” says why: no active run order, no heat left, or the next heat has no start time. | Activate the plan and Pin the first start. |
| {#t-publish-grey} **Publish is grey or refused** | The heat has not ended, or something blocks it (missing scores, missing Impression, a judge has not submitted, a tie). | End the heat; read **Before you publish** (each line names the judge and the score); press **Fix** on a line, type the score or set the judge to **Absent**; **Choose order**; or **Publish with a reason**. A judge whose every gap you set to Absent no longer holds Publish back. |
| {#t-out-of-attempts} **A rider is grey on the spotter screen** | The rider used every attempt the division allows (“Out of attempts · 7 / 7”). | Correct: the head judge may add one past the cap with a reason (attempt menu → Add attempt). |
| {#t-locked-rules} **Scoring, format or Rider label cannot be changed** | A heat of the division has started; rules lock to protect results already entered. | Scoring and format: **Unlock scoring and format** with a reason. The Rider label and ticked trick blocks stay fixed. |
| {#t-public-slow} **Public pages update slowly** | Public pages ask for news every “Live update every (seconds)” (default 7) while visible; there is no push to spectators. | Lower the number in the Event step (3 at least); refresh. |
| {#t-db-paused} **Everything fails at once in the morning** | The free database paused after about a week idle. | Supabase dashboard → Resume; /admin/health shows “Database: reachable”. |
| {#t-pins-missing} **Go live: “‹n› seats have no PIN”** | Seats made before PINs were stored. | Officials → that seat → **Regenerate PIN**. |
| {#t-no-learn-more} **A refusal has no “Learn more” link** | The sentence is not one the manual knows (or it is on an official's phone, where the links are not shown). | Search the sentence here; tell the owner so it can be added to `scripts/manual/error-notes.ts`. |

## Every sentence, alphabetically {#t-index}

Every refusal or error sentence the product can show, with its fix; **Details** opens its row in [Errors and refusals](errors.md) with where it appears and what it means. ‹name› stands for a value the product fills in. *Generated by `npm run manual:generate`.*

<!-- generated:index:start -->
| Sentence on screen | Fix | Details |
|---|---|---|
| “A ‹noun› file must contain one JSON object (starting with “{”).” | Use a file exported with Export as JSON from the same tab. | [Organiser: Divisions](errors.md#err-presets-notobject) |
| “A block in ‹family› has no name.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-errors-emptylabel) |
| “A cancelled heat cannot be started. Re-run it instead.” | Press Re-run heat. | [Grey buttons on the head console](errors.md#err-controlwhy-startcancelled) |
| “A crash is not scored.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-not-scorable) |
| “A demo organisation already exists, so nothing was created.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-demo-exists) |
| “A division has no saved starting draw. Nothing was changed.” | Follow the sentence. | [Resets](errors.md#err-reset-errors-draw-copy-missing) |
| “a full web address, starting with https://” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-sponsorurl) |
| “A heat has started since the reset, so it can no longer be restored.” | Follow the sentence. | [Resets](errors.md#err-reset-restore-errors-heat-started) |
| “A heat has started, so blocks cannot be removed.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-errors-locked) |
| “A heat has started, so that cannot be changed.” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-errors-started) |
| “A heat has started, so the draw cannot be regenerated.” | Change single seats by hand, or Reset this division (Divisions step) to start the division over. | [Organiser: Draw](errors.md#err-draw-regeneraterefusedstarted) |
| “A heat has started, so the draw cannot be replaced.” | Change seats in the Draw step, or Reset this division first. | [Organiser: Divisions](errors.md#err-builder-drawstarted) |
| “A heat has started, so the event was not reset.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-not-reset) |
| “A heat has started, so this block cannot be removed any more.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-cannotuntick) |
| “A heat has started: started and finished heats cannot be changed (you can still rename them), and the draw cannot be regenerated.” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-startednote) |
| “A heat is running or paused: not now.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-org-moverunning) |
| “A heat of this division has started: blocks can still be added, but a ticked block cannot be unticked.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-lockednote) |
| “A heat of this division has started: the Rider label cannot be changed any more.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-identification-errors-locked) |
| “A heat of this event has already started, so this can no longer be changed.” | Use Run as simulation on the Simulator page to rehearse a real event instead. | [Organiser: event list and Event step](errors.md#err-event-simulationlocked) |
| “A heat of this event is running or paused, so it cannot be moved now. Try again when no heat is running.” | End the running heat, then move the event. | [Platform owner (/admin)](errors.md#err-admin-errors-heat-running) |
| “A heat of this event is running or paused. Update when no heat is running.” | Wait until no heat of the event is running or paused (between heats), then press Update to latest. | [Admin: trick base](errors.md#err-trickeditor-event-errors-heat-running) |
| “A heat that is no longer in the draw” | Take the row out with ✕ (or Take row out of the run order), then Add the heats that are missing. | [Organiser: Run order](errors.md#err-runorder-goneheat) |
| “A later heat has already started, so this correction would change who rides in it. Nothing was changed.” | Reset or finish the later heat first, or leave the result. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-downstream-started) |
| “A later heat that depends on this result has already started (‹heat›). Reset that heat first, then this one.” | Reset the later heat first, then this one. | [Resets](errors.md#err-resetparts-errors-downstream-started) |
| “A later round was arranged by hand, so its seats cannot be rebuilt from the current draw. Nothing was changed.” | Follow the sentence. | [Resets](errors.md#err-reset-rebuildarranged) |
| “A newer version is already the default, so this older one cannot be published. Save its content as a new version instead.” | Save the content as a new version; that version can be published. | [Platform owner (/admin)](errors.md#err-admin-presets-errors-not-newer) |
| “A person has that seat.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-seat-is-real) |
| “A practice (simulation) event has no results to export.” | Nothing to fix: export from the real event. | [Other](errors.md#err-exportfiles-refused-simulation) |
| “A preset must be a JSON object.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-presets-errors-not-object) |
| “A reason is required.” | Type a reason; it is written to the audit log. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-reason-required) |
| “A reason of at least 5 characters is needed, because results of this event were shown publicly.” | Follow the sentence. | [Resets](errors.md#err-reset-errors-reason-required) |
| “A reset is not possible yet:” | Follow the sentence. | [Resets](errors.md#err-reset-blocked) |
| “A rider needs a first and a last name.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-errors-namerequired) |
| “A tie is settled by choosing the order, never by a reason.” | Press Choose order and set the order of the tied riders. | [Head console](errors.md#err-headlive-publishnooverride) |
| “Abort the start sequence first.” | On the head console press Abort while the yellow is up, then reset. Nothing was changed. | [Resets](errors.md#err-reset-errors-heat-armed) |
| “Add a division first (Step 2), then come back to add riders.” | Divisions step → + Add division. | [Organiser: Riders](errors.md#err-riders-nodivisions) |
| “Add a division first.” | Follow the sentence. | [Organiser: Officials](errors.md#err-officials-panelsnodivisions) |
| “Add confirmed riders first (Riders step).” | Follow the sentence. | [Organiser: Divisions](errors.md#err-builder-applynoriders) |
| “Add judge seats first.” | Add a seat with role Judge first. | [Organiser: Officials](errors.md#err-officials-panelsnojudges) |
| “Add trick categories first; limits are set per category.” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-addcategoriesfirst) |
| “Already first.” | Nothing to fix. | [Organiser: Riders](errors.md#err-riders-firstrow) |
| “Already in your organisation: linked to that rider, nothing is overwritten.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-alreadyinorganisation) |
| “Already last.” | Nothing to fix. | [Organiser: Riders](errors.md#err-riders-lastrow) |
| “Already re-run as ‹heat›” | Work on the re-run heat. | [Resets](errors.md#err-resetparts-alreadyrerunas) |
| “Already so in the published version (not blocking; base tricks are read first): ‹sentence›” | Optional: remove the word from one of the blocks. | [Admin: trick base](errors.md#err-trickeditor-errors-alreadyshared) |
| “Another heat is already running or starting (‹max› at a time). End it or abort its start first, or ask the organiser to allow more in the Event step” | End the other heat or abort its start, or raise “Heats that can run at the same time” in the Event step. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-already-running) |
| “Another plan of this day already has that name.” | Follow the sentence. | [Organiser: Run order](errors.md#err-runorder-errors-nametaken) |
| “Another rider in your organisation already has that email address.” | Use the rider who already has that email (Add from this organisation’s riders). | [Organiser: Riders](errors.md#err-riders-errors-emailused) |
| “Another tab is playing this simulation.” | Close the other tab, or use it. If you see it with one tab open, reload the page. | [Simulator](errors.md#err-simulator-play-lines-busy) |
| “At least one tab must stay on (Join does not count: it hides itself while registration is closed).” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-onetabon) |
| “at most 20 sponsors” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-sponsorsmax) |
| “at most 6 extra leaderboards” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-leaderboardsmax) |
| “Available once the heat has ended.” | Press End heat (or wait for the clock). | [Grey buttons on the head console](errors.md#err-controlwhy-publish) |
| “Available while a heat is running or paused.” | Do what the sentence says, or pick another heat in the run order. | [Grey buttons on the head console](errors.md#err-controlwhy-live) |
| “Available while a heat is running, paused or waiting to be published.” | Follow the sentence. | [Simulator](errors.md#err-simulator-endpublish-why) |
| “Available while a heat is running.” | Start the auto-play; the button turns on when a heat starts. | [Simulator](errors.md#err-simulator-skip-why) |
| “Available while the heat is running, paused, ended or under review.” | Do what the sentence says, or pick another heat in the run order. | [Grey buttons on the head console](errors.md#err-controlwhy-cancel) |
| “Base trick “‹label›” needs a scoring category.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-errors-baseneedscategory) |
| “Bib ‹bib› is given to more than one rider: ‹names›.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-repeatedbib) |
| “Bib ‹bib› is used by more than one rider: ‹names›.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-clash-bib) |
| “Bib “‹v›” is too long (20 characters at most).” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-badbib) |
| “Check “‹name›”.” | Follow the sentence. | [Rider registration](errors.md#err-registration-errors-field) |
| “Choose ×1, ×5, ×10 or ×20.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-bad-speed) |
| “Choose a division.” | Follow the sentence. | [Rider registration](errors.md#err-registration-errors-division) |
| “Choose a format for this division first (Divisions step, Format tab).” | Divisions → the division → Format tab → choose a format → Save format. | [Organiser: Draw](errors.md#err-draw-noformat) |
| “Choose a format for this division first.” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-errors-noformat) |
| “Choose a PNG, JPEG or WebP photo.” | Follow the sentence. | [Rider registration](errors.md#err-registration-photonotimage) |
| “Choose at least two riders.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-tie) |
| “Choose Disqualified or Did not start for riders who do not ride again.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-leave-out) |
| “Choose judge, spotter or announcer.” | Follow the sentence; the organiser can regenerate a PIN in the Officials step. | [Officials joining](errors.md#err-join-selfadd-errors-invalid-role) |
| “Choose one of the five families.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-errors-family) |
| “Choose the closing day as well as the time” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-timeneedsdate) |
| “Choose two different attempts.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-merge) |
| “Choose Virtual or Real.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-bad-mode) |
| “colour key must be lowercase letters, numbers or _” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-validation-colourkey) |
| “colour keys must be unique (duplicate: ‹d›)” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-validation-keysunique) |
| “colour must look like #e11d48” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-validation-colourhex) |
| “‹column› “‹v›” is not one of the colours for this division (‹names›).” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-badcolour) |
| “‹column› is too long (‹max› characters at most).” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-toolong) |
| “Could not copy: select the link and copy it by hand.” | Select the link and copy it by hand. | [Organiser: event list and Event step](errors.md#err-sluglink-copyfailed) |
| “Could not copy: use Download instead.” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-exportcopyfailed) |
| “Could not do that: ‹why›” | Follow the sentence. | [Organiser: Go live](errors.md#err-org-dashboard-failed) |
| “Could not find a free PIN; try again.” | Press again: a new random PIN is tried. | [Organiser: Officials](errors.md#err-officials-errors-pininuse) |
| “Could not hear that. Try again or type it.” | Follow the sentence. | [Judge and spotter phones](errors.md#err-live-builder-micfailed) |
| “Could not keep: ‹names› (they no longer fit).” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-droppednote) |
| “Could not undo: ‹why›” | Ask the head judge to delete the attempt. | [Judge and spotter phones](errors.md#err-spotter-undofailed) |
| “Database: not reachable” | Open the Supabase dashboard and press Resume; load the home page once. | [Platform owner (/admin)](errors.md#err-admin-health-databasedown) |
| “Dictation is not available in this browser: use the microphone key on your keyboard.” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-dictateunavailable) |
| “Direction is left or right.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-direction) |
| “‹division› needs ‹need› judges on its panel and has ‹have› — add judges in the Officials step” | Officials → Panels: tick more judges, or lower “Number of judges” in Divisions → Scoring. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-panel-too-small) |
| “‹division› needs ‹need› judges, ‹have› assigned” | Officials → Panels: tick more judges for the division, or lower “Number of judges” in Divisions → Scoring. | [Organiser: Officials](errors.md#err-officials-shortfall) |
| “‹division› was locked before Reset existed (or re-locked after its first heat), so its starting draw is not known and it cannot be reset.” | Reset this division (it rebuilds from the current draw), or leave it. | [Resets](errors.md#err-reset-copyunknown) |
| “‹division›: unlock and lock the draw again first” | Draw step → Unlock draw (reason) → Lock draw, while no heat of the division has started. | [Resets](errors.md#err-reset-copyrelock) |
| “Draw for ‹division› is not locked — lock it in the Draw step” | Draw step → Lock draw. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-draw-not-locked) |
| “Email ‹v› is used twice in this file (first on line ‹line›). Each rider needs their own.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-repeatedemail) |
| “Email “‹v›” is not an email address.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-bademail) |
| “End the heat before publishing it.” | Press End heat first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-not-ended) |
| “Enter a number” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-enternumber) |
| “Enter a real email address.” | Follow the sentence. | [Rider registration](errors.md#err-registration-errors-email) |
| “Enter a score.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-score-required) |
| “Enter a whole number” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-wholenumber) |
| “Enter every criterion.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-score-missing-criterion) |
| “Enter your first name.” | Follow the sentence. | [Rider registration](errors.md#err-registration-errors-first) |
| “Enter your last name.” | Follow the sentence. | [Rider registration](errors.md#err-registration-errors-last) |
| “Enter your name (2 to 60 characters).” | Follow the sentence; the organiser can regenerate a PIN in the Officials step. | [Officials joining](errors.md#err-join-selfadd-errors-invalid-name) |
| “Every family needs a name.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-errors-emptyfamily) |
| “Every rider needs a score or Absent before the sheet can be submitted. Save keeps what you typed so far.” | Give every rider a score or Absent. Save keeps what you typed so far without submitting. | [Head console](errors.md#err-headlive-sheetincomplete) |
| “Failed — tap to retry” | Tap the badge to retry. If it still fails, read the sentence; the head judge can type the score on the console. | [Judge and spotter phones](errors.md#err-live-connection-failed) |
| “First name is missing.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-firstmissing) |
| “Fix the highlighted settings to see the preview.” | Change the highlighted number; the preview comes back when the format can run. | [Organiser: Divisions](errors.md#err-formatsimple-fixfirst) |
| “Fix the problems listed above first.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-rules-saveinvalid) |
| “Fix the problems listed first.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-identification-fixfirst) |
| “Fix the red points first.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-builder-applyblocked) |
| “Give the block a name.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-errors-empty) |
| “give the colour a name (it is always shown as text too)” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-validation-colourname) |
| “Give the division a name (at least 2 characters).” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-namemin) |
| “Give the event a name” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-namemin) |
| “give the leaderboard a short title (up to 40 letters)” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-leaderboardtitle) |
| “Give the organisation a name” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-validation-namemin) |
| “Give the organisation a name of 2 to 80 characters.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-invalid-name) |
| “Give the plan a name of at least 2 characters.” | Follow the sentence. | [Organiser: Run order](errors.md#err-runorder-errors-namerequired) |
| “Give the preset a name (2 to 80 characters).” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-presetname) |
| “Give the preset a name (at least 2 characters).” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-nametooshort) |
| “Give the preset a name of at least 2 characters first.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-rules-presetneedsname) |
| “give the scheme a name” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-validation-schemename) |
| “Give the seat a name (2 to 60 characters).” | Follow the sentence. | [Organiser: Officials](errors.md#err-officials-errors-namerequired) |
| “give the sponsor a name” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-sponsorname) |
| “‹heat› is not ready: its draw is not locked or a seat has no rider yet.” | Lock the division's draw; finish the earlier heats that fill this heat's seats. | [Simulator](errors.md#err-simulator-play-lines-notready) |
| “‹heat› is running. End it first.” | Follow the sentence. | [Simulator](errors.md#err-simulator-reset-running) |
| “‹heat› is waiting for ‹names› (a real person) to submit.” | Submit on that phone, or set the judge to Virtual. | [Simulator](errors.md#err-simulator-play-lines-waitjudges) |
| “‹heat› is waiting for the head judge, who is a real person. Review and publish it on the head console.” | Publish on the head console, or set the head judge to Virtual. | [Simulator](errors.md#err-simulator-play-lines-waithead) |
| ““Hide this multiplier” must be one of the multipliers, or empty.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-errors-hidenotmultiplier) |
| “Invalid identification scheme: ‹detail›” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-validation-invalid) |
| “Keep the message to 140 letters.” | Follow the sentence. | [Organiser: Go live](errors.md#err-windcall-errors-message-too-long) |
| “Kite size “‹v›” is not a number such as 9 or 12.5.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-badkitesize) |
| ““‹l›” already exists in that family.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-errors-exists) |
| “‹label› has the category “‹category›”, which is not in the category list.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-errors-unknowncategory) |
| “‹label› is in a published version: retire it instead of removing it.” | Undo the removal (reload the page) and press Retire instead: it is hidden from new events and kept for history. | [Admin: trick base](errors.md#err-trickeditor-errors-publishedremoved) |
| “‹label› is out of attempts · ‹n› / ‹max›” | Only the head judge can add one more, with a reason (console → Add attempt). | [Judge and spotter phones](errors.md#err-spotter-outofattempts) |
| “‹label› is out of attempts (‹max› / ‹max›) — that attempt was not logged” | Head judge adds it with a reason if it really happened. | [Judge and spotter phones](errors.md#err-spotter-refusedcap) |
| “‹label›: not done. ‹why›” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-failed) |
| “‹label›: this setting cannot be edited here.” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-cannotedit) |
| “Last name is missing.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-lastmissing) |
| “Location is too long” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-locationmax) |
| “Lycra colour ‹colour› is given to more than one rider: ‹names›. Judges could not tell them apart.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-clash-lycra) |
| “Must be at least ‹n›” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-atleast) |
| “Must be at most ‹n›” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-atmost) |
| “‹n› divisions have no locked draw in the copy. Lock their draw on the Draw step of the copy before pressing Start.” | Open the copy's Draw step and lock each division's draw before Start. | [Simulator](errors.md#err-simulator-notsimulation-notdrawn) |
| “‹n› divisions have no locked draw. The simulator plays locked draws only: lock them on the Draw step.” | Draw step → Lock draw for each division (of the simulation copy). | [Simulator](errors.md#err-simulator-needlock) |
| “‹n› judges have not submitted yet. Give a reason to go on without them.” | Wait for the judges' Submit, or Publish with a reason. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-sheets-not-submitted) |
| “‹n› riders have no ‹name› score from this judge yet. Enter it, or set the judge to Absent for them.” | Enter the score for each rider shown as missing, or press Judge absent for this rider, then submit again. | [Head console](errors.md#err-headlive-sheetstillmissing) |
| “‹n› riders have no Impression / Variety score from you yet.” | Give each rider an Impression / Variety score, then Submit. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-impression-missing) |
| “‹n› seats in this heat still wait for a rider — finish the earlier heats first, or fill the seat in the Draw step” | Publish the earlier heat, or place a rider in the seat in the Draw step. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-seats-not-filled) |
| “‹n› things to fix first (see Details)” | Open Details (phone) or read “Before you publish” (laptop); fix them or Publish with a reason. | [Grey buttons on the head console](errors.md#err-controlwhy-blockers) |
| “‹name› gets no riders: send at least one place to it.” | Fix the red point it names; then Apply to draw is on. | [Organiser: Divisions](errors.md#err-custombuilder-noriders) |
| “‹name› receives ‹riders› riders in ‹heats› heats of ‹lo›–‹hi›, but the limits are ‹min› to ‹max› per heat.” | Fix the red point it names; then Apply to draw is on. | [Organiser: Divisions](errors.md#err-custombuilder-sizes) |
| “‹names› has already started — this correction would change who rides in it. Nothing was changed.” | Leave the result, or reset the later heat first. | [Head console](errors.md#err-publish-downstream) |
| “Needs at least two riders.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-needtwo) |
| “No active run order — create one in Run order & timetable.” | Run order step → pick today → Activate this plan. | [Grey buttons on the head console](errors.md#err-controlwhy-noplan) |
| “No connection. It will be sent when the connection is back.” | Keep the page open; move toward the hotspot. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-network) |
| “No countdown: no heat is left in the run order.” | Follow the sentence. | [Head console](errors.md#err-headv2-breaknone-nothing-next) |
| “No countdown: the next heat has no start time yet.” | Run order step → pin a start time on the first row. | [Head console](errors.md#err-headv2-breaknone-no-time) |
| “No countdown: there is no active run order.” | Run order step → Activate this plan for today. | [Head console](errors.md#err-headv2-breaknone-no-plan) |
| “No heat has been published yet.” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-nopublished) |
| “No heat is on the water or waiting to be published, so there is nothing to end. Start the auto-play first.” | Follow the sentence. | [Simulator](errors.md#err-simulator-endpublish-noheat) |
| “No heat is on the water, so there is nothing to skip. Start the auto-play first.” | Press Start (or Run the whole event) and skip once a heat is on the water. | [Simulator](errors.md#err-simulator-skip-noheat) |
| “No heat is running.” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-norunning) |
| “No PIN on file for this seat (it was made before PINs could be shown). Use Regenerate PIN to make a new one.” | Regenerate PIN (the old PIN stops working and the seat's phones are signed out). | [Organiser: Officials](errors.md#err-officials-pinunknown) |
| “No PIN on file: regenerate it first” | Regenerate PIN for that seat, then print. | [Organiser: Officials](errors.md#err-officials-printnopin) |
| “No rounds to list yet: the preview cannot run with the current settings. Check the number in "Preview with" and the ladder settings.” | Change the number in “Preview with” or the ladder settings until the preview shows rounds. | [Organiser: Divisions](errors.md#err-formatsimple-perround-empty) |
| “No run order is active for today, so the heats are listed by division.” | Run order step → pick today → Activate this plan. | [Head console](errors.md#err-heatcontrol-noplan) |
| “No run order is active for today. Activate one in Run order.” | Run order step → choose today's day → Activate this plan. If the plan is for another day, the Go live checklist names both days. | [Organiser: Go live](errors.md#err-org-dashboard-noplantoday) |
| “No start heat sequence is running for this heat, so there is nothing to abort.” | Nothing to do: the heat is not in its pre-start. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-nothing-armed) |
| “Not a known time zone (for example Africa/Cairo)” | Pick a time zone from the list, for example Africa/Cairo. | [Organiser: event list and Event step](errors.md#err-event-validation-timezone) |
| “Not drawn again (no format, no riders or nothing to draw): ‹names›.” | Follow the sentence. | [Simulator](errors.md#err-simulator-reset-rebuildskipped) |
| “Not logged for ‹label›: ‹why›” | Follow the sentence. | [Judge and spotter phones](errors.md#err-spotter-refusedother) |
| “Not the next heat in the run order — ‹next› was next” | Start anyway (the timetable re-flows) or Don’t start. | [Head console](errors.md#err-headv2-notnext) |
| “Nothing is left to shift: every heat has started.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-nothing-to-shift) |
| “Nothing is on hold.” | Follow the sentence. | [Organiser: Go live](errors.md#err-org-dashboard-notheld) |
| “Nothing to import yet.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-importnothing) |
| “One of the values is not allowed. Check the highlighted fields.” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-notallowedvalue) |
| “Only a copy made with Run as simulation can be deleted. The Demo is reset, not deleted.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-not-a-copy) |
| “Only a heat that has not started can be started.” | Pick the next heat in the run order. | [Grey buttons on the head console](errors.md#err-controlwhy-start) |
| “Only a paused heat can be resumed.” | Do what the sentence says, or pick another heat in the run order. | [Grey buttons on the head console](errors.md#err-controlwhy-resume) |
| “Only a platform owner can publish presets.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-presets-errors-not-allowed) |
| “Only a published heat can be re-opened.” | Do what the sentence says, or pick another heat in the run order. | [Grey buttons on the head console](errors.md#err-controlwhy-reopen) |
| “Only a running heat can be paused.” | Do what the sentence says, or pick another heat in the run order. | [Grey buttons on the head console](errors.md#err-controlwhy-pause) |
| “Only a running or paused heat can be ended.” | Do what the sentence says, or pick another heat in the run order. | [Grey buttons on the head console](errors.md#err-controlwhy-end) |
| “Only a version newer than the published one can be published.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-codes-not-newer) |
| “Only an organiser can include heats under review.” | Download without the tick box, or sign in as an organiser. | [Other](errors.md#err-exportfiles-refused-draft) |
| “Only an organiser of this event can download the event backup.” | Sign in as an organiser and press Download event backup on the Go live step. | [Other](errors.md#err-exportfiles-refused-backup) |
| “Only an organiser of this event or its head judge can download the results.” | Sign in as an organiser, or open the head judge console with the head judge's PIN. | [Other](errors.md#err-exportfiles-refused-results) |
| “Only attempts of the same rider can be merged.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-not-same-rider) |
| “Only owners and admins can change organisation settings.” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-notallowed) |
| “Only owners and admins can change these settings. You can look, but not save.” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-readonly) |
| “Only owners and admins can save these settings.” | Ask an owner of the organisation, or the platform owner. | [Organiser: organisation settings](errors.md#err-orgsettings-readonlyreason) |
| “Only platform owners can accept a proposal.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-admin-owneronly) |
| “Only platform owners can accept or dismiss a proposal.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-proposals-owneronly) |
| “Only platform owners can change the trick base.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-codes-not-allowed) |
| “Only platform owners can change the trick base. You can look, but not change it.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-staffnote) |
| “Only platform owners can delete an organisation.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-org-owneronlydelete) |
| “Only platform owners can delete or archive an event here.” | Follow the sentence. An event with published results can only be archived. | [Organiser: event list and Event step](errors.md#err-eventlifecycle-owneronly) |
| “Only platform owners can do this. You can look, but not change it.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-owneronly) |
| “Only platform owners can export.” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-exportowneronly) |
| “Only platform owners can move an event.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-org-moveowneronly) |
| “Only platform owners can restore.” | Follow the sentence. | [Resets](errors.md#err-reset-restore-errors-not-allowed) |
| “Only platform owners can save these settings.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-settings-readonlyreason) |
| “Only PNG, JPEG or WebP images can be attached.” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-screenshotnotimage) |
| “Only the active run order can be changed.” | Run order step → Activate this plan. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-plan-not-active) |
| “Only the head judge can add an attempt past the cap.” | Follow the sentence. | [Head console](errors.md#err-headlive-pastcapnotallowed) |
| “Only the head judge or an organiser can change the wind call.” | Follow the sentence. | [Organiser: Go live](errors.md#err-windcall-errors-not-allowed) |
| “Only the platform owner can tick release checks and confirm a version as tested.” | Sign in as the platform owner. | [Platform owner (/admin)](errors.md#err-admin-releases-codes-not-allowed) |
| “Only your own presets can get new versions. Use “Save as new preset” for built-in ones.” | Use “Save as new preset”. | [Organiser: Divisions](errors.md#err-divisions-errors-onlyown) |
| “Part of this page could not be loaded (‹what›). The rest still works; the details are in the server logs.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-partproblem) |
| “Paste the text first.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-rules-pasteempty) |
| “Paused — logging is off until the head judge resumes.” | Follow the sentence. | [Judge and spotter phones](errors.md#err-spotter-paused) |
| “Photo URL “‹v›” must start with http:// or https://.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-badphoto) |
| “Pick a date” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-pickdate) |
| “Pick one of the options” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-pickone) |
| “Pick red, amber or green.” | Follow the sentence. | [Organiser: Go live](errors.md#err-windcall-errors-bad-wind-status) |
| “PINs cannot be shown or made because the server has no PIN key. Ask the owner to check the server settings (SUPABASE_SERVICE_ROLE_KEY, or SEAT_PIN_KEY). Logging in with PINs already given is not affected.” | Owner: Admin → Health → Server settings; set SUPABASE_SERVICE_ROLE_KEY (or SEAT_PIN_KEY) on the host and redeploy. | [Organiser: Officials](errors.md#err-officials-errors-nokey) |
| “Platform settings: could not be read, so the built-in values are in use” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-health-settingsunreadable) |
| “Practice heats run only on a simulation event.” | Use Run as simulation, or tick Simulation event before any heat starts. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-not-a-simulation) |
| “Rash guard colour ‹colour› is used by more than one rider: ‹names›.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-clash-rashguard) |
| “Re-open the heat instead.” | Re-open the heat, correct it, Publish again. | [Grey buttons on the head console](errors.md#err-controlwhy-rerunpublished) |
| “Realtime: Not connected” | Reload; check the hotspot. Not blocking: screens still update by polling. | [Platform owner (/admin)](errors.md#err-admin-health-realtimeoff) |
| “Registration cannot close after the event has ended” | Set the closing day on or before the event's last day. | [Organiser: event list and Event step](errors.md#err-event-validation-closesafterend) |
| “Registration is closed for this event.” | Organiser: Event step → Rider registration → Open, closing day in the future; Published ticked. | [Rider registration](errors.md#err-registration-closeddefault) |
| “‹round›: ‹detail›. Send fewer places on, or make the heats bigger.” | Fix the red point it names; then Apply to draw is on. | [Organiser: Divisions](errors.md#err-custombuilder-eliminatesnobody) |
| “Save or undo your changes first.” | Press Save as a new draft (or reload to drop the edits), then accept. | [Admin: trick base](errors.md#err-trickeditor-proposals-savefirst) |
| “Save your changes first.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-savebeforepublish) |
| “Scoring and format are locked because a heat of this division has started. Unlock them with a written reason first.” | Divisions → the division → “Unlock scoring and format” with a reason of at least 5 characters (written to the audit log). | [Organiser: Divisions](errors.md#err-divisions-errors-ruleslocked) |
| “Seats made before PINs were stored show here. Open Officials and choose Regenerate PIN.” | Officials step → that seat → Regenerate PIN. | [Organiser: Go live](errors.md#err-readiness-pinhint) |
| “Seed ‹seed› is given to more than one rider: ‹names›. Press “Sort by seed number” to renumber.” | Press “Sort by seed number” to renumber 1, 2, 3… | [Organiser: Riders](errors.md#err-riders-seedrepeated) |
| “Seed ‹seed› is given to more than one rider: ‹names›. Sort or drag them afterwards.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-repeatedseed) |
| “Seed “‹v›” is not a whole number of 1 or more.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-badseed) |
| “Shown once the heat has ended.” | Follow the sentence. | [Head console](errors.md#err-headlive-agreementwait) |
| “Sign in first.” | Sign in again and press the button again. | [Other](errors.md#err-exportfiles-refused-signin) |
| “Some settings need fixing.” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-fixthese) |
| “Some settings need fixing. They are highlighted below.” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-fixthese) |
| “Someone saved a newer version while you were editing. Reload the page; your changes were not saved.” | Reload the page, make the change again and save. | [Admin: trick base](errors.md#err-trickeditor-codes-trick-base-stale) |
| “Something still blocks Publish. See the list.” | Read “Before you publish”; fix each line, or Publish with a reason (ties must be ordered, never overridden). | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-publish-blocked) |
| “Something went wrong. Please try again.” | Nothing was saved. Check the connection and press the button again. If it keeps failing, note the time and tell the owner (the server log names the cause). | [Officials joining](errors.md#err-join-othererror) |
| “Something went wrong. Try again.” | Follow the sentence. | [Simulator](errors.md#err-simulator-generic) |
| “Start a heat first: the feed plays into the running heat.” | Start a heat, then Start the practice feed. | [Head console](errors.md#err-headlive-practicenoheat) |
| “Still sending your scores. Try Submit again when it says Synced.” | Wait for Synced (check signal), then Submit. | [Judge and spotter phones](errors.md#err-judge-stillsending) |
| “Stopped at a blocker: ‹text›” | Follow the sentence. | [Simulator](errors.md#err-simulator-play-lines-stoppedatblocker) |
| “Submit is on when every rider has a score” | Follow the sentence. | [Judge and spotter phones](errors.md#err-live-impression-submitwaiting) |
| “Submitted. Ask the head judge to reopen it.” | Head judge: console → judge's row → reopen the sheet. | [Judge and spotter phones](errors.md#err-live-impression-submitted) |
| ““‹text›” is already an alias of ‹owner›.” | Remove the word from one of the two blocks (the sentence names the block that already had it). | [Admin: trick base](errors.md#err-trickeditor-errors-aliastaken) |
| ““‹text›” is already the name of ‹owner›.” | Remove that alias, or rename one of the blocks. | [Admin: trick base](errors.md#err-trickeditor-errors-nametaken) |
| “That account is not an organiser. Ask the owner to add you.” | The platform owner adds it to an organisation. | [Organiser sign-in](errors.md#err-login-notanorganiser) |
| “That address does not look right.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-invalid-url) |
| “That attempt no longer exists.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-attempt-not-found) |
| “That check is not in the releases file any more. Reload the page.” | Reload the page and tick the check as it reads now. | [Platform owner (/admin)](errors.md#err-admin-releases-codes-invalid-check) |
| “That copy is older than 30 days and can no longer be restored.” | Follow the sentence. | [Resets](errors.md#err-reset-restore-errors-snapshot-expired) |
| “That copy no longer exists.” | Follow the sentence. | [Resets](errors.md#err-reset-restore-errors-snapshot-not-found) |
| “That did not work. Nothing was changed; try again.” | Follow the sentence. An event with published results can only be archived. | [Organiser: event list and Event step](errors.md#err-eventlifecycle-errors-generic) |
| “That did not work. Nothing was changed.” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-errors-failed) |
| “That did not work. Nothing was sent; try again in a moment.” | Nothing was saved. Check the connection and press the button again. If it keeps failing, note the time and tell the owner (the server log names the cause). | [Officials joining](errors.md#err-join-selfadd-failed) |
| “That division was not found.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-notfound) |
| “That does not look like an email address.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-org-invitebademail) |
| “That email address and password do not match. Check them and try again, or sign in with a link.” | Check them, or use “Sign in with a link instead”. | [Organiser sign-in](errors.md#err-login-wrongpassword) |
| “That email address is not registered as an organiser. Ask the owner to add you.” | The platform owner invites the address (Admin → organisation → Invite organiser). | [Organiser sign-in](errors.md#err-login-notregistered) |
| “That event code or PIN is not recognised. Check the card you were given and try again.” | Check the event code (the last part of the event address) and the PIN on the card. The organiser sees every PIN in Officials → Show PIN, or makes a new one with Regenerate PIN. | [Officials joining](errors.md#err-join-errors-invalid-pin) |
| “That event was not found, or you do not have access to it.” | Pick the organisation in the switcher at the top, then open the event from the events list. | [Organiser: event list and Event step](errors.md#err-event-notfound) |
| “That event was not found.” | Open the event from your events list and press the button there. | [Other](errors.md#err-exportfiles-refused-notfound) |
| “That file is empty.” | Use a PNG, JPEG or WebP file of at most 2 MB. | [Organiser: event list and Event step](errors.md#err-logo-empty) |
| “That file is larger than 512 KB, far more than a trick base needs. Is it the right file?” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-jsontoolarge) |
| “That file is not a PNG, JPEG or WebP image. Save the logo as one of those and try again.” | Use a PNG, JPEG or WebP file of at most 2 MB. | [Organiser: event list and Event step](errors.md#err-logo-wrongtype) |
| “That flag does not fit this attempt.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-flag-not-applicable) |
| “That flag is not valid.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-flag) |
| “That flag no longer exists.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-flag-not-found) |
| “That format is not available to start from.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-rules-startfrommissing) |
| “That heat is not there any more.” | Follow the sentence. | [Resets](errors.md#err-resetparts-errors-heat-not-found) |
| “That heat no longer exists.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-not-found) |
| “That image is ‹mb› MB. The limit is 2 MB: export a smaller version and try again.” | Use a PNG, JPEG or WebP file of at most 2 MB. | [Organiser: event list and Event step](errors.md#err-logo-toobig) |
| “That image is over 5 MB. Try a smaller one.” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-screenshottoobig) |
| “That is not a valid penalty.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-penalty) |
| “That is not a valid state for an attempt.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-status) |
| “That is not a valid state.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-bad-state) |
| “That is not a valid status for a rider.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-modifier) |
| “That is not an email address.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-errors-bademail) |
| “That is not the event's web address.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-slug-mismatch) |
| “That is not the event’s web address. Nothing was changed.” | Follow the sentence. | [Resets](errors.md#err-reset-errors-slug-mismatch) |
| “That is too long (‹n› characters at most).” | Follow the sentence. | [Rider registration](errors.md#err-registration-errors-toolong) |
| “That is your own login.” | Another platform owner can remove it. | [Platform owner (/admin)](errors.md#err-admin-org-removeself) |
| “That item no longer exists.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-parent-not-found) |
| “That judge is not on this division's panel.” | Officials → Panels: tick the judge for the division. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-not-on-panel) |
| “That login does not exist.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-user-not-found) |
| “That logo address must start with https://” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-settings-validation-logourl) |
| “That name for the re-run is not valid.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-rerun-name) |
| “That name is too long (‹n› characters at most).” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-errors-toolong) |
| “That name is too long (100 characters at most)” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-namemax) |
| “That name is too long (60 characters at most).” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-namemax) |
| “That name is too long (80 characters at most)” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-validation-namemax) |
| “That note is too long (4000 characters at most).” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-errors-toolong) |
| “That organisation no longer exists.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-not-found) |
| “That penalty no longer exists.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-penalty-not-found) |
| “That person is not an organiser of this organisation (any more).” | Reload the organisation page. | [Platform owner (/admin)](errors.md#err-admin-errors-not-a-member) |
| “That phone number is too long.” | Follow the sentence; the organiser can regenerate a PIN in the Officials step. | [Officials joining](errors.md#err-join-selfadd-errors-invalid-phone) |
| “That photo is still over 2 MB after shrinking. Choose a smaller one.” | Follow the sentence. | [Rider registration](errors.md#err-registration-phototoobig) |
| “That plan names a heat that is not in this event.” | Take the row out and add the heat again. | [Organiser: Run order](errors.md#err-runorder-errors-unknownheat) |
| “That preset is not valid: ‹why›” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-presets-invalid) |
| “That preset was not found.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-presetnotfound) |
| “That rider has used every attempt. Adding one more is saved with your reason.” | Follow the sentence. | [Head console](errors.md#err-headlive-pastcapneedsreason) |
| “That rider is already in this division.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-errors-alreadyindivision) |
| “That rider is not in this division.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-entry-not-in-division) |
| “That rider is not in this heat.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-rider-not-in-heat) |
| “That rider is not riding (did not start, or flagged out).” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-rider-not-riding) |
| “That rider is out of attempts.” | Only the head judge adds one more, with a reason. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-attempt-cap-reached) |
| “That role is not known.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-invalid-role) |
| “That run order no longer exists.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-plan-not-found) |
| “That scheme is not valid yet.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-identification-errors-invalid) |
| “That score is not on the ‹detail› step.” | Enter one of the two values the sentence names (for example 7.2 or 7.3). The score pad only offers values on the step. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-score-off-step) |
| “That score is outside the scale.” | Enter a value inside the range the sentence names. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-score-out-of-range) |
| “That seat is not waiting for approval.” | Follow the sentence. | [Organiser: Officials](errors.md#err-officials-errors-notpending) |
| “That seat no longer exists.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-seat-not-found) |
| “That seat was not found.” | Follow the sentence. | [Organiser: Officials](errors.md#err-officials-errors-unknownseat) |
| “That sign-in link did not work. It may have expired, or it was opened in a different browser than the one you asked from. Ask for a new one below.” | Ask for a new link and open it on the same phone or computer, in the same browser. | [Organiser sign-in](errors.md#err-login-linkfailed) |
| “That sign-in link has already been used or has expired: each link works once, for 24 hours. Ask for a new one below (Forgot password?) or ask the person who invited you to send another.” | Ask for a new one with “Forgot password?” (once a password is set) or ask the platform owner to send another invitation. | [Organiser sign-in](errors.md#err-login-linkexpired) |
| “That tap was already used for another heat.” | Reload the page. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-client-key-reused) |
| “That text is not valid JSON. Nothing was saved.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-presets-notjson) |
| “That text is too long (20,000 characters at most)” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-settings-validation-legal) |
| “That time is not valid.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-plan-value) |
| “That time zone is not known” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-settings-validation-timezone) |
| “That time zone is not known.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-invalid-timezone) |
| “That trick base is not complete (it needs base tricks and modifiers).” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-codes-invalid-json) |
| “That value is not allowed.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-errors-badvalue) |
| “That version is already published.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-codes-already-default) |
| “That version is not in the releases file.” | Reload the page. | [Platform owner (/admin)](errors.md#err-admin-releases-codes-invalid-version) |
| “That version no longer exists.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-presets-errors-not-found) |
| “That version or proposal no longer exists. Reload the page.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-codes-not-found) |
| “That web address is already used by another event.” | Choose another web address (slug). | [Organiser: event list and Event step](errors.md#err-event-slugtaken) |
| “That web address is already used by another organisation.” | Choose another web address. | [Organiser: organisation settings](errors.md#err-orgsettings-slugtaken) |
| “The banner is switched off in the Event step, so nothing shows on the public pages.” | Event step → tick “Show the wind-call banner…”. | [Organiser: Go live](errors.md#err-windcall-banneroffnote) |
| “The chosen preset is not valid.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-presetinvalid) |
| “The demo organisation was created, but its draw could not be built. Run “npm run seed:demo” to finish it.” | On a computer with the keys: npm run seed:demo. | [Platform owner (/admin)](errors.md#err-admin-demo-drawfailed) |
| “The draw changed while the reset was being prepared. Nothing was changed; try again.” | Follow the sentence. | [Resets](errors.md#err-resetparts-errors-draw-changed) |
| “The draw is locked, so it cannot be replaced. Unlock it in the Draw step first.” | Draw step → Unlock draw with a reason, then apply. | [Organiser: Divisions](errors.md#err-builder-drawlocked) |
| “The draw is locked: seats, heats and rounds cannot be changed. Unlock it with a reason if you must.” | Unlock draw with a reason only if you must change it. | [Organiser: Draw](errors.md#err-draw-lockedhelp) |
| “The draw is locked. Unlock it (with a reason) to change it.” | Unlock draw (with a reason), change it, lock again. | [Organiser: Draw](errors.md#err-draw-errors-locked) |
| “The draw is locked. Unlock it (with a reason) to regenerate.” | Unlock draw (with a reason), regenerate, lock again. | [Organiser: Draw](errors.md#err-draw-regeneraterefusedlocked) |
| “The draw of this division is locked: changing seeds here does not change it. A rider you set to Withdrawn or No-show keeps the seat as a walkover.” | To use new seeds: Draw step → Unlock (reason) → Regenerate → Lock (only before the first heat). | [Organiser: Riders](errors.md#err-riders-drawlocked) |
| “The e-mail to ‹email› could not be sent. The login was created. Send them this link yourself.” | Copy the sign-in link shown and send it privately. | [Platform owner (/admin)](errors.md#err-admin-org-inviteemailfailed-other) |
| “The e-mail to ‹email› was not sent: the built-in sender of this plan only writes to your own team's addresses. The login was created. Send them this link yourself.” | Copy the sign-in link shown and send it privately. A custom e-mail sender (SMTP) removes this limit. | [Platform owner (/admin)](errors.md#err-admin-org-inviteemailfailed-not-authorised) |
| “The e-mail to ‹email› was not sent: this plan allows only ‹n› sign-in e-mails per hour and that limit is used up. The login was created. Send them this link yourself, or invite them again in an hour.” | Copy the sign-in link shown and send it privately (WhatsApp); it works once, for 24 hours. Or invite again after an hour. | [Platform owner (/admin)](errors.md#err-admin-org-inviteemailfailed-rate-limit) |
| “The event could not be saved (no permission). Nothing was changed.” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-savedenied) |
| “The event could not be saved. Nothing was changed; try again.” | Nothing was saved. Check the connection and press the button again. If it keeps failing, note the time and tell the owner (the server log names the cause). | [Organiser: event list and Event step](errors.md#err-event-savefailed) |
| “The event does not allow a different scheme per division yet. Tick “Allow a different scheme for individual divisions” in the Event step first.” | Event step → Rider identification → tick “Allow a different scheme for individual divisions”, Save event, then come back. | [Organiser: Divisions](errors.md#err-divisions-identification-switchoff) |
| “The event is already in that organisation.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-same-organisation) |
| “The event list could not be loaded just now. Try again in a minute.” | Wait a minute and reload. On the free plan the owner wakes the database before the event. | [Public pages](errors.md#err-landing-loaderror) |
| “the fallback must differ from the primary identifier” | Choose a different fallback, or No fallback. | [Organiser: Rider label](errors.md#err-ident-validation-fallbackdiffers) |
| “The file could not be made. Try again in a minute; nothing has been changed.” | Wait a minute and press the button again. If it repeats, check the Health page and send the error to the owner. | [Other](errors.md#err-exportfiles-refused-failed) |
| “The file has a header but no riders under it.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-norows) |
| “The file has more than ‹n› riders. Split it into smaller files.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-toomany) |
| “The file is empty.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-empty) |
| “the final takes the same number of riders from each draw, so its size must be even” | Change the highlighted number; the preview comes back when the format can run. | [Organiser: Divisions](errors.md#err-formatsimple-finaleven) |
| “The flags are switched off for this event, so there is no start heat sequence. Press Start heat, or switch Flags on in the Event step.” | Press Start heat, or Event step → Flags → Flags on. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-flags-off) |
| “The format cannot make a draw: ‹why›” | Divisions → Format tab: fix the format until its preview shows a ladder for this number of riders. | [Organiser: Draw](errors.md#err-draw-errors-badformat) |
| “The head judge has taken this heat into review. Your scores are locked.” | Tell the head judge the correction; they edit it on the console with a reason. | [Judge and spotter phones](errors.md#err-judge-reviewlocked) |
| “The health check could not run.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-health-loaderror) |
| “The heat cannot do that in its current state.” | Reload; the buttons show what the heat can do now. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-illegal-heat-transition) |
| “The heat is not running, so nothing can be logged.” | Follow the sentence. | [Judge and spotter phones](errors.md#err-spotter-notrunning) |
| “The heat is not running.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-not-running) |
| “The heat is still in its yellow, so there is nothing to skip yet. Wait for the green, or press Start now.” | Follow the sentence. | [Simulator](errors.md#err-simulator-skip-inyellow) |
| “The image could not be uploaded. Check your connection and try again.” | Check the connection and choose the file again. | [Organiser: event list and Event step](errors.md#err-logo-uploadfailed) |
| “The import did not finish. Nothing was half-saved; try again.” | Nothing was saved. Check the connection and press the button again. If it keeps failing, note the time and tell the owner (the server log names the cause). | [Organiser: Riders](errors.md#err-riders-importfailed) |
| “The Impression / Variety score opens when the heat has ended.” | Wait for the head judge to end the heat. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-impression-not-open) |
| “The key of ‹label› may only use a–z, 0–9 and _ (80 characters at most).” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-errors-badkey) |
| “The ladders changed while the reset was being prepared. Nothing was changed; try again.” | Follow the sentence. | [Resets](errors.md#err-reset-errors-bad-projection) |
| “The last day cannot be before the first day” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-endbeforestart) |
| “The last round, ‹name›, has ‹heats› heats: the ladder should end in one heat.” | Fix the red point it names; then Apply to draw is on. | [Organiser: Divisions](errors.md#err-custombuilder-lastround) |
| “The master base already has a block with that name in that family.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-trickbase-admin-clash) |
| “The master base already has this block.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-proposals-clash) |
| “The master trick base could not be found. Ask the owner to seed the presets.” | On a computer with the keys: npm run seed:presets. | [Organiser: Divisions](errors.md#err-trickbase-errors-novocabulary) |
| “the maximum per heat cannot be less than the target” | Change the highlighted number; the preview comes back when the format can run. | [Organiser: Divisions](errors.md#err-formatsimple-maxbelowtarget) |
| “The message is too long (300 characters at most)” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-closedmessagemax) |
| “The microphone is not allowed on this phone. Type the trick instead.” | Allow the microphone in the phone's settings, or type the trick. | [Judge and spotter phones](errors.md#err-live-builder-micdenied) |
| “the minimum per heat cannot be more than the target” | Change the highlighted number; the preview comes back when the format can run. | [Organiser: Divisions](errors.md#err-formatsimple-minabovetarget) |
| “The naming template has an unknown part: ‹part›. Use {direction} and {blocks}.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-errors-namingunknown) |
| “The naming template must contain {blocks}.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-errors-namingmissingblocks) |
| “The next heat is not the final.” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-nofinal) |
| “The note could not be saved. Try again.” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-failed) |
| “The organisation was created, but its logo could not be uploaded. Add it on this page.” | Upload the logo again on the organisation's page. | [Platform owner (/admin)](errors.md#err-admin-org-logofailed) |
| “The organisation you chose no longer exists.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-target-not-found) |
| “The organisations could not be loaded.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-org-loaderror) |
| “the palette needs at least one colour” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-validation-palettemin) |
| “The password could not be saved. Sign in with a link again, then try once more.” | Sign in with a link again, then set the password. | [Organiser sign-in](errors.md#err-setpassword-couldnotsave) |
| “The photo could not be uploaded. You can register without it and send it to the organiser.” | Register without the photo and send it to the organiser. | [Rider registration](errors.md#err-registration-photofailed) |
| “The picture could not be made. Use Print / PDF instead.” | Use Print / PDF and choose “Save as PDF”. | [Organiser: Draw](errors.md#err-draw-sheet-pngfailed) |
| “The plan is not valid:” | Follow the sentence. | [Organiser: Run order](errors.md#err-runorder-errors-notvalid) |
| “The pre-start has to be between 0:10 and 15:00. Type it as minutes and seconds (1:30) or as whole minutes (2).” | Type it as 1:30 or as whole minutes (2), or pick the event's default or Start now. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-bad-prestart) |
| “The preset could not be saved. Nothing was changed; try again.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-presetsavefailed) |
| “The preset could not be saved. Try again.” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-savefailed) |
| “The preset does not match its schema.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-presets-errors-invalid) |
| “The product name can be at most 60 characters” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-settings-validation-productname) |
| “The reset could not be done. Nothing was changed; try again.” | Follow the sentence. | [Resets](errors.md#err-reset-errors-failed) |
| “The restore could not be done. Nothing was changed.” | Follow the sentence. | [Resets](errors.md#err-reset-restore-errors-failed) |
| “The result changed while you were pressing. Look at it again.” | Look at the heat again, then act. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-version-conflict) |
| “The rounds cannot be listed yet because the format has a problem (see the notice below). Fix it and the table fills in.” | Change the highlighted number; the preview comes back when the format can run. | [Organiser: Divisions](errors.md#err-formatsimple-perround-emptyinvalid) |
| “The run order changed while you were pressing. Press again.” | Press again. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-plan-changed) |
| “The run order is already on hold.” | Follow the sentence. | [Organiser: Go live](errors.md#err-org-dashboard-alreadyheld) |
| “The run order is not on hold.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-not-on-hold) |
| “The run order is on hold: use Resume at instead of Shift.” | Use Resume at (pick the restart time). | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-on-hold) |
| “The run order is on hold. Resume it first.” | Resume at… first, or use Resume at to set the restart time. | [Organiser: Go live](errors.md#err-org-dashboard-shiftheld) |
| “The run order is on hold. Resume it to carry on.” | Resume the run order (Go live → Resume at…, or the scenario button again). | [Simulator](errors.md#err-simulator-play-lines-hold) |
| “The saved starting draw already holds results, so it cannot be used to start over.” | Follow the sentence. | [Resets](errors.md#err-reset-copyhasresults) |
| “The server has no key to protect PINs, so fresh PINs cannot be made.” | Owner: set SUPABASE_SERVICE_ROLE_KEY (or SEAT_PIN_KEY) on the host. | [Simulator](errors.md#err-simulator-errors-no-key) |
| “The settings are not valid yet, so they cannot be saved as a preset.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-presetnotvalid) |
| “The settings could not be saved (no permission). Nothing was changed.” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-savedenied) |
| “The settings could not be saved. Nothing was changed; try again.” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-savefailed) |
| “The sign-in email could not be sent. Check the address and your connection, then try again.” | Follow the sentence. The link must be opened in the same browser that asked for it. | [Organiser sign-in](errors.md#err-login-couldnotsend) |
| “The simulator is not set up for this event yet.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-sim-not-enabled) |
| “The stored draw does not match this heat. Nothing was changed.” | Reload the page; if it repeats, tell the owner. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-draw-mismatch) |
| “The system presets are not published yet, so the demo cannot be built. Run “npm run seed:presets” first.” | On a computer with the keys: npm run seed:presets. | [Platform owner (/admin)](errors.md#err-admin-errors-presets-missing) |
| “The tagline can be at most 160 characters” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-settings-validation-tagline) |
| “The tick could not be saved. Check the connection and try again.” | Check the connection and tick again; Health says whether the database is reachable. | [Platform owner (/admin)](errors.md#err-admin-releases-codes-generic) |
| “The two passwords are not the same.” | Follow the sentence. | [Organiser sign-in](errors.md#err-setpassword-mismatch) |
| “The vocabulary is missing: ‹parts›.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-presets-vocabularymissing) |
| “The web address can be at most 40 characters” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-validation-slugmax) |
| “The web address can be at most 60 characters” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-slugmax) |
| “The web address can only use lowercase letters, numbers and hyphens (2 to 40 characters).” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-invalid-slug) |
| “The web address needs at least 2 characters” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-slugmin) |
| “The web address you typed does not match. Nothing was deleted.” | Type the event's web address exactly as shown under the box. | [Organiser: event list and Event step](errors.md#err-eventlifecycle-errors-slug-mismatch) |
| “There are no actual start times or pins written while the day ran to clear in this run order.” | Follow the sentence. | [Resets](errors.md#err-resetparts-plan-nothing) |
| “There are no confirmed riders to draw.” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-errors-noriders) |
| “There are no heats yet. Make each division's draw first.” | Draw step → Generate draw for each division. | [Organiser: Run order](errors.md#err-runorder-noheats) |
| “There are no open notes to export.” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-exportnone) |
| “There is no active run order for today.” | Run order step → pick today → Activate this plan. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-no-active-plan) |
| “There is no draw yet.” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-errors-nodraw) |
| “There is no newer draft to publish.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-nothingtopublish) |
| “There is no other organisation to move it to.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-org-movenoothers) |
| “There is no run order yet.” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-noplan) |
| “There is no virtual head judge to do it.” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-noheadseat) |
| “There is no virtual judge on this heat's panel.” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-nojudge) |
| “There is no virtual spotter to do it.” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-nospotter) |
| “There is nobody to do it to.” | Follow the sentence. | [Simulator](errors.md#err-simulator-log-noriders) |
| “There is nothing to print yet. Approve or add a seat first.” | Follow the sentence. | [Organiser: Officials](errors.md#err-officials-printnone) |
| “These riders have almost the same kite: ‹names›.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-clash-kite) |
| “These settings are not valid together.” | Read the list of problems above the Save button and fix each one. | [Organiser: Divisions](errors.md#err-divisions-errors-notvalidtogether) |
| “This admin page could not be shown” | Press Try again; open Health to check the server settings; search the hosting logs for the error reference. | [Platform owner (/admin)](errors.md#err-admin-crash-heading) |
| “This browser is signed in as an organiser. Use another browser or a private window to join as a judge or spotter.” | Use another browser or a private window to join as an official. | [Officials joining](errors.md#err-join-errors-organiser-session) |
| “This division already has heats, so it cannot be deleted.” | Keep it, or use Reset this division. | [Organiser: Divisions](errors.md#err-divisions-errors-hasheats) |
| “This division has heats, so it cannot be deleted.” | Keep it, or rename it. To start the division again use Reset this division. | [Organiser: Divisions](errors.md#err-divisions-hasheats) |
| “This division has its own scheme saved, but the event’s switch is off, so the event’s scheme is used until you turn it on again.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-identification-ownkeptbutoff) |
| “This division has no attempt cap. Set one in the Divisions step first.” | Divisions → Scoring → set “Attempts per rider”. | [Simulator](errors.md#err-simulator-log-nocap) |
| “This division has no confirmed riders yet (Riders step).” | Riders step → set riders to Confirmed (or approve registrations). | [Organiser: Draw](errors.md#err-draw-noriders) |
| “This division has no draw yet, so there is nothing to reset.” | Follow the sentence. | [Resets](errors.md#err-resetparts-errors-no-draw) |
| “This division has no heats yet, so there is nothing to reset.” | Follow the sentence. | [Resets](errors.md#err-resetparts-division-noheats) |
| “This division has no usable scoring rules, so it cannot be published.” | Divisions → the division → Scoring tab → choose a preset → Save. | [Head console](errors.md#err-publish-nomodel) |
| “This division is full. Ask the organiser if you would like to be on a waiting list.” | Organiser: raise the number in the Event step, or add the rider by hand in Riders. | [Rider registration](errors.md#err-registration-fullline) |
| “This division's rules have no Impression / Variety score.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-no-impression) |
| “This event has already been run, so it is not a clean starting point. Copy it before its first heat starts, or reset it first.” | Copy the event before its first heat, or reset it first. | [Simulator](errors.md#err-simulator-errors-source-already-run) |
| “This event has no divisions to register for yet.” | Follow the sentence. | [Rider registration](errors.md#err-registration-nodivisions) |
| “This event has no saved locked draw to go back to, because it was played before Reset existed.” | Use “Wipe and draw again”. | [Simulator](errors.md#err-simulator-reset-nobaseline) |
| “This event has published results (‹n›), so it cannot be deleted: results are permanent. Archive it instead.” | Archive the event instead (hidden everywhere, nothing deleted). | [Organiser: event list and Event step](errors.md#err-eventlifecycle-deleteblocked) |
| “This event has published results, so it cannot be deleted. Archive it instead.” | Follow the sentence. An event with published results can only be archived. | [Organiser: event list and Event step](errors.md#err-eventlifecycle-errors-published-results) |
| “This event is not available.” | As organiser: Event step → Published; not a simulation; not archived. | [Public pages](errors.md#err-publicsite-eventnotfound) |
| “This event is not on the public site.” | As organiser: check Published, and that the rider is in a locked draw. | [Public pages](errors.md#err-pub-common-notfound) |
| “This event is not public yet, so no result has been published and there is nothing to export.” | Publish the event; the files then hold every released heat. | [Other](errors.md#err-exportfiles-refused-notpublic) |
| “This event is not taking registrations.” | Follow the sentence. | [Rider registration](errors.md#err-registration-archived) |
| “This event is not taking requests.” | Follow the sentence; the organiser can regenerate a PIN in the Officials step. | [Officials joining](errors.md#err-join-selfadd-errors-event-not-found) |
| “This event isn't public” | Event step → tick “Published” and Save event. A simulation event is never public; an archived event or organisation is hidden. | [Public pages](errors.md#err-notfound-eventtitle) |
| “This file cannot be imported.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-cannotimport) |
| “This file is larger than ‹kb› KB, which is far more than a ‹noun› needs. Is it the right file?” | Use a file exported with Export as JSON from the same tab. | [Organiser: Divisions](errors.md#err-presets-toolarge) |
| “This file is not valid JSON‹where›. ‹detail›” | Use a file exported with Export as JSON from the same tab. | [Organiser: Divisions](errors.md#err-presets-notjson) |
| “This format flags out at most ‹n› riders.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-flag-out-too-many) |
| “This format has no flag-out.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-flag-out-not-available) |
| “This heat cannot be changed in its current state.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-not-editable) |
| “This heat has already been re-run.” | Work on the re-run heat (for example H1R). | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-already-rerun) |
| “This heat has not started, so there is nothing to reset.” | Follow the sentence. | [Resets](errors.md#err-resetparts-heat-scheduledwhy) |
| “This heat has not started. Start it instead.” | Press Start heat. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-not-started) |
| “This heat is already published.” | Head judge: Re-open, correct, Publish again (a new version). | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-published) |
| “This heat was cancelled and already re-run. Reset the re-run instead; the cancelled heat stays as it is.” | Reset the re-run heat instead. | [Resets](errors.md#err-resetparts-errors-heat-already-rerun) |
| “This heat was cancelled.” | Re-run the heat instead (head console). | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-cancelled) |
| “This heat's start heat sequence is already running.” | Wait for the green, press Start now, or Abort. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-already-armed) |
| “This is already the first division.” | Nothing to fix. | [Organiser: Divisions](errors.md#err-divisions-firstdivision) |
| “This is already the last division.” | Nothing to fix. | [Organiser: Divisions](errors.md#err-divisions-lastdivision) |
| “This is needed” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-needed) |
| “This is not a simulation event.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-not-a-simulation) |
| “This key is in a published version, so it can no longer change (events and stored tricks use it).” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-keylocked) |
| “This looks like a ‹other›, not a ‹noun›. Import it in the matching place.” | Import a scoring file in the Scoring tab and a format file in the Format tab. | [Organiser: Divisions](errors.md#err-presets-wrongkind) |
| “This organisation has published results (‹n›), so it cannot be deleted. Archive it instead: results stay permanent.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-org-deleteblocked) |
| “This organisation has published results, so it cannot be deleted. Archive it instead.” | Archive the organisation instead. | [Platform owner (/admin)](errors.md#err-admin-errors-published-results) |
| “This page could not be shown” | Press Try again; use the link back. Send the error reference to the owner if it repeats. | [Pages that fail](errors.md#err-crash-heading) |
| “This page doesn't exist” | Check the address; start from the home page. | [Public pages](errors.md#err-notfound-pagetitle) |
| “This phone cannot keep unsent scores through a reload. Keep this page open until it says Synced.” | Keep the page open until Synced; on iPhone use the home-screen app. | [Judge and spotter phones](errors.md#err-live-queue-memoryonly) |
| “This phone does not hold a seat yet.” | Join with the PIN. | [Officials joining](errors.md#err-seat-noseat) |
| “This PIN could not be read back. Use Regenerate PIN to make a new one.” | Regenerate PIN. | [Organiser: Officials](errors.md#err-officials-pincouldnotread) |
| “This plan is active. Activate another plan first.” | Activate another plan of that day first, then delete this one. | [Organiser: Run order](errors.md#err-runorder-errors-deleteactive) |
| “This QR code has already been used or has expired. Ask the organiser for a new card, or type your PIN instead.” | Type the PIN instead, or print a fresh card (Officials → Print card). | [Officials joining](errors.md#err-join-errors-invalid-token) |
| “This rider has a seat in the draw — set them to Withdrawn instead” | Set the rider to Withdrawn: after the draw is locked their seat becomes a walkover. | [Organiser: Riders](errors.md#err-riders-indraw) |
| “This rider is not on the public list.” | Lock the division's draw; open the rider from the Results or Ladder page. | [Public pages](errors.md#err-pub-rider-notfound) |
| “This rider's heat has already started. Use Did not start on the head console instead.” | On the head console use Did not start for that rider in that heat. | [Organiser: Riders](errors.md#err-riders-withdrawheatstarted) |
| “This row has ‹got› values but the header has ‹columns› columns. Check for a missing quote or an extra comma.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-toomanyvalues) |
| “This seat already gave scores, so it cannot be deleted. Switch it off instead.” | Switch the seat off instead. | [Organiser: Officials](errors.md#err-officials-errors-hasscores) |
| “✖ This seat has been switched off by the organiser.” | Organiser: Officials → the seat → Switch on. | [Officials joining](errors.md#err-seat-switchedoff) |
| “This seat is locked to another phone. Ask the organiser to unlock it.” | Organiser: Officials → Regenerate PIN for the seat (signs the old phone out), then join with the new PIN. | [Officials joining](errors.md#err-join-errors-seat-locked) |
| “This section is needed” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-sectionneeded) |
| “This sponsor is already first.” | Nothing to fix. | [Organiser: event list and Event step](errors.md#err-event-sponsorfirst) |
| “This sponsor is already last.” | Nothing to fix. | [Organiser: event list and Event step](errors.md#err-event-sponsorlast) |
| “This version is already the default.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-presets-errors-already-default) |
| “Tick “I understand, change the address” first.” | Tick “I understand, change the address”, then Save. | [Organiser: organisation settings](errors.md#err-orgsettings-understandfirst) |
| “Tick every check of this version before confirming it as tested.” | Reload, tick the open checks after doing them, then press Confirm version tested again. | [Platform owner (/admin)](errors.md#err-admin-releases-codes-release-checks-open) |
| “Tick the box to continue.” | Follow the sentence. | [Rider registration](errors.md#err-registration-errors-consent) |
| “Time is up for this heat.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-heat-time-up) |
| “Too late to undo: ask the head judge to delete it.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-undo-too-late) |
| “Too many people are already waiting. Ask the organiser in person.” | Organiser: Officials → Waiting for approval → approve or decline. | [Officials joining](errors.md#err-join-selfadd-errors-too-many-pending) |
| “Too many sign-in emails were requested. Wait a few minutes (up to an hour) and try again.” | Wait up to an hour, or sign in with a password (set one once from the account menu → Set or change password). | [Organiser sign-in](errors.md#err-login-toomany) |
| “Too many tries from this connection. Please wait a little and try again.” | Follow the sentence. | [Rider registration](errors.md#err-registration-ratelimited) |
| “Too many tries from this connection. Wait a little and try again.” | Follow the sentence; the organiser can regenerate a PIN in the Officials step. | [Officials joining](errors.md#err-join-selfadd-errors-rate-limited) |
| “Too many wrong tries. Wait ten minutes, or ask the organiser for help.” | Wait ten minutes, or let the organiser read the PIN out from Officials → Show PIN. | [Officials joining](errors.md#err-join-errors-rate-limited) |
| “Two blocks use the key “‹key›”: ‹a› and ‹b›. Each key must be unique.” | Change the key of the new block (only a block that was never published can change its key). | [Admin: trick base](errors.md#err-trickeditor-errors-duplicatekey) |
| “two colours share a name; colours are called out by name, so each needs its own” | Fix the colour or field the sentence names, then save. | [Organiser: Rider label](errors.md#err-ident-validation-namesunique) |
| “Two plans cannot be active on the same day.” | Activate the plan you want; the other active plan of that day is switched off by Activate this plan. | [Organiser: Run order](errors.md#err-runorder-errors-twoactive) |
| “Two riders are both called ‹name›. The spotter could not call them out separately.” | Add a nickname or a bib number. | [Organiser: Riders](errors.md#err-riders-clash-name) |
| “Two riders are tied at the cut: choose who is flagged out.” | Tick the rider to flag out. | [Head console](errors.md#err-headlive-flagoutundecided) |
| “Type a first and a last name.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-namerequiredhint) |
| “Type a name of at least 2 letters.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-nametooshort) |
| “Type numbers separated by commas, like 1, 0.75, 0.5” | Type a value the sentence asks for. | [Organiser: Divisions](errors.md#err-friendly-numberslist) |
| “Type the code from the event's address, for example arrow-launch-2026.” | Type the last part of the event's address, for example arrow-launch-2026. | [Public pages](errors.md#err-landing-codeinvalid) |
| “Type the web address exactly first.” | Follow the sentence. | [Resets](errors.md#err-reset-needaddress) |
| “Type your email address above first, then press “Forgot password?” again.” | Follow the sentence. The link must be opened in the same browser that asked for it. | [Organiser sign-in](errors.md#err-login-forgotneedsemail) |
| “Unknown event.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-unknownevent) |
| “Unlock the rules first to load a different set.” | Unlock scoring and format with a reason first. | [Organiser: Divisions](errors.md#err-rules-loadlocked) |
| “Use 24 characters or fewer for the name of the impression score” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-impressionname) |
| “use a date” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-usedate) |
| “Use a number from 1 to 500, or leave it empty for no limit” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-maxperdivision) |
| “Use a whole number” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-wholenumber) |
| “Use a whole number of seconds from 5 to 120 for the pages of the Follow the heat screen” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-followrotate) |
| “Use at least ‹n› characters.” | Follow the sentence. | [Organiser sign-in](errors.md#err-setpassword-tooshort) |
| “Use only lowercase letters, numbers and hyphens, starting with a letter or number” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-slugchars) |
| “Use the form 18:30” | Fix the highlighted field and press Save event again. | [Organiser: event list and Event step](errors.md#err-event-validation-usetime) |
| “Use the heat buttons to change a heat.” | Follow the sentence; the dependency map names what must be true first. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-use-heat-functions) |
| “Wait until ‹heat› ends, or end the heat first.” | Wait until the heat ends. | [Organiser: Officials](errors.md#err-officials-inheat) |
| “We could not find a “First” and a “Last” column. The columns in the file are: ‹found›.” | Follow the sentence. | [Organiser: Riders](errors.md#err-riders-csv-nonamecolumns) |
| “We could not find that event.” | Follow the sentence. | [Rider registration](errors.md#err-registration-notfound) |
| “‹what› could not be shown (‹message›). The rest of the page still works.” | Press Try again. If it repeats, send the error reference (or the sentence) to the owner. | [Pages that fail](errors.md#err-crash-part) |
| “With ‹n› riders: this format cannot run (‹why›)” | Change the number of riders per heat, how many advance, or pick another format. | [Organiser: Divisions](errors.md#err-ladder-cannotrun) |
| “Write a reason (at least 5 characters).” | Write at least 5 characters, for example “wind dropped, shorter heats”. | [Organiser: Divisions](errors.md#err-divisions-errors-reason) |
| “Write a reason first.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-proposals-reasonneeded) |
| “Write a reason of at least 5 characters first.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-rules-unlockneedsreason) |
| “Write a reason of at least 5 characters.” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-unlockreasonshort) |
| “Write a reason: the organiser sees it.” | Follow the sentence: fix the block it names, then press Save as a new draft again. | [Admin: trick base](errors.md#err-trickeditor-codes-reason-required) |
| “Write something first.” | Follow the sentence. | [Feedback notes](errors.md#err-feedback-errors-empty) |
| “Write the points for 1st, 2nd, 3rd … separated by commas, e.g. 4, 3, 2, 1” | Change the highlighted number; the preview comes back when the format can run. | [Organiser: Divisions](errors.md#err-formatsimple-pointsinvalid) |
| “You are not a member of an organisation.” | Follow the sentence. Only owners and admins of the organisation may save. | [Organiser: organisation settings](errors.md#err-orgsettings-nomembership) |
| “You are not a member of any organisation yet. Ask the product owner to add you.” | The platform owner invites the login as organiser of an organisation (Admin → Organisations → Invite organiser). | [Organiser: event list and Event step](errors.md#err-orghome-noorg) |
| “You are not allowed to change this draw.” | Follow the sentence. | [Organiser: Draw](errors.md#err-draw-errors-notallowed) |
| “You are not allowed to change this plan.” | Follow the sentence. | [Organiser: Run order](errors.md#err-runorder-errors-notallowed) |
| “You are not allowed to do that.” | Follow the sentence. | [Simulator](errors.md#err-simulator-errors-not-allowed) |
| “You are not allowed to do this to that event.” | Follow the sentence. An event with published results can only be archived. | [Organiser: event list and Event step](errors.md#err-eventlifecycle-errors-not-allowed) |
| “You are not allowed to do this.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-not-allowed) |
| “You are not allowed to reset this event.” | Follow the sentence. | [Resets](errors.md#err-reset-errors-not-allowed) |
| “You are not on the panel of a heat that is running.” | Organiser: Officials → Panels → tick the judge for that division. | [Judge and spotter phones](errors.md#err-judge-notonpanel) |
| “You cannot remove your own login.” | Follow the sentence. Most admin changes need the platform owner role. | [Platform owner (/admin)](errors.md#err-admin-errors-cannot-remove-self) |
| “You do not have permission to do that.” | Follow the sentence. | [Organiser: Divisions](errors.md#err-divisions-errors-notallowed) |
| “Your phone could not start a session. Check your connection and try again.” | Check the connection; on iPhone join from the home-screen app, not a private tab. | [Officials joining](errors.md#err-join-errors-no-session) |
| “Your sheet is locked. Ask the head judge to reopen it.” | Head judge reopens the sheet. | [Head console, judge and spotter (database answers)](errors.md#err-liveerrors-codes-sheet-locked) |
<!-- generated:index:end -->
