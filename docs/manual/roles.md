# Roles: who sees what, who may do what, how they get in

Platform owner, organiser, head judge, judge, spotter, announcer, rider and spectator: what each sees, what each may do, and how each gets in.

Last checked: 3 Oct 2026 · Product version 0.11.0

The database checks every action against the person's role (Row Level Security on every table): a screen never decides alone, so a stale or tampered phone is refused the same way.

| Role | How they get in | Sees | May do | May not |
|---|---|---|---|---|
| {#role-owner} **Platform owner** | An organiser login made platform owner once with `npm run bootstrap:platform-admin -- --email …`; signs in at /org/login (or the home page's **Admin** link) and lands on /admin. | Every organisation (/admin), the audit log, feedback, the Ask log, health, releases, master presets, platform settings; any organisation's screens through **Open as this organiser** (strip “Viewing as ‹organisation›”). | Everything an organiser may, in any organisation; create, archive, restore, delete organisations; invite and remove organisers; move, archive, delete events; **Restore** a reset event; publish master presets; edit and publish the master trick base, accept or dismiss trick proposals (with a reason); export feedback; platform settings; tick release checks and confirm a version as tested. | Delete an organisation or event with published results (archive instead). |
| {#role-staff} **Platform staff** | As the owner, with `--role staff`. | /admin, read only for most things. | Save preset drafts (not of the trick base); look at everything. | Change the trick base, publish presets, save platform settings, delete, restore, export, tick release checks (owner only). |
| {#role-organiser} **Organiser** (member of an organisation: owner, admin or staff) | Invited by the platform owner (an e-mailed link that works once, for 24 hours, and lands them in their organisation); sets a password with **Set a password** and signs in at /org/login with e-mail and password from then on (**Forgot password?** if needed). The platform owner can **Remove** them: access ends at once and they are signed out everywhere. | Their organisation's events and every setup step, Go live, the head console, the simulator, their team's feedback. | Set up and run events (all seven steps); act as head judge (an organiser acts as head when the event has no head seat); Hold / Shift / wind call; Reset event, division, heat; Clear actual times; Practice heat and the simulator on simulation events; owners and admins also change Organisation settings. | See other organisations; delete or archive events (owner only); Restore a reset (owner only). |
| {#role-head} **Head judge** | A seat with role Head judge; joins with the event code and PIN (or QR card) on the join page; the phone stays bound to the seat. | The head console (/head/‹event›): every judge's scores, flags, blockers, audit log; with “Head judge also scores”, a Score tab like a judge's. | Start, pause, resume, end, cancel, re-run, publish (with a reason past blockers), re-open, release or hold a result; edit scores and attempts with reasons; DNS / DNF / DSQ / interference; tie order; flag-out; add an attempt past the cap; Hold, Resume at, Shift, +1 min, Pause break; wind call; Reset this heat. | Setup steps; Reset event or division; Clear actual times. |
| {#role-judge} **Judge** | A Judge seat's PIN or QR card. Must be ticked on a division's panel to score it. | The judge screen (/judge/‹event›): the queue of the running heat of their panel, their own scores only. | Score attempts (or Missed), flag, correct their own scores until Submit or review, give Impression / Variety scores, Submit; log attempts when “Judges may log attempts too” is on. | See other judges' scores; change scores after Submit or review (the head judge reopens). |
| {#role-spotter} **Spotter** | A Spotter seat's PIN or QR card; free, or assigned to riders. | The spotter screen (/spot/‹event›). | Log attempts (landed / CRASH) while the heat runs; undo within 10 seconds. | Log past a rider's attempt cap; act while the heat is paused or not running. |
| {#role-announcer} **Announcer** | An Announcer seat's PIN; or an organiser at /head/‹event›?mode=announcer. | The read-only score table and trick feed of the heat on (judge columns by tag). | Read. | Change anything. |
| {#role-rider} **Rider** | No login. | The public pages, their rider page, the registration page. | Register (when open); share their result. | See anything before it is published (unless live scores are on). |
| {#role-spectator} **Spectator** | No login. | The home page, the public event pages, the big screen. | Follow and share. | See judges' individual scores (never public), drafts, simulations, archived events. |

## Ask Sendbook {#role-ask}

Who may use **Ask** ([Ask Sendbook](ask-sendbook.md)) and what it may tell them. The server checks the person, not the screen.

| Role | Ask button | Asks about | The answer may use |
|---|---|---|---|
| Platform owner and staff | Every organiser and admin screen | Any event | Everything their login can see. Only the **owner** reads the Ask log and changes an organisation's Ask budget. |
| Organiser | Every organiser screen and the head console | Their own organisation's events (another organisation's event is refused: “You cannot ask about this event.”) | What their login can see; the organisation's budget pays. They see this month's use in Organisation settings, not the log. |
| Head judge, judge, spotter, announcer (PIN seats) | Head console, judge and spotter headers | Only the event their seat belongs to, while the seat is switched on (otherwise “This phone is not connected to a seat of this event. Join again with your PIN.”) | What the seat can see: a judge's screen never sends other judges' scores, and no screen sends PINs or e-mail addresses. |
| Rider, spectator | No button | — | Only when the owner sets ASK_SENDBOOK_PUBLIC=1 (off): then 10 questions per address per hour, about public pages only. |

Every role: 30 questions per hour per person; the organisation's monthly budget; **Was this right?** writes a feedback note the owner reads.

**One phone, one seat.** A seat is held by one phone at a time: when the same PIN joins on a second phone, the first phone's seat page says “Not connected” (a seat locked to its phone answers “This seat is locked to another phone. Ask the organiser to unlock it.”). **Regenerate PIN** signs every phone of the seat out. A browser signed in as an organiser cannot join a seat: use another browser or a private window. On iPhone, add the join page to the Home Screen first and join inside the home-screen app.
