# Big Air Scoring System — Claude Code Handover Pack

> **Generated:** Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Prepared for Abdelrahman Fawy · Working product name: `[PRODUCT_NAME]` (replace everywhere once you pick one)

This pack is everything Claude Code needs to build a web-based, fully configurable scoring and competition-management system for kitesurfing Big Air — first for the **Arrow launch event in El Gouna next weekend**, then as a product you can license to other competitions.

You do not need to know how to code. Your job is to (1) set up three free accounts, (2) paste the phase prompts from `docs/07-BUILD-PROMPTS.md` into Claude Code one at a time, (3) test what it builds on your phone, and (4) tell it what is wrong in plain English.

---

> **If you read nothing else:** humans read three files — this one, **`01-STEP-BY-STEP-NO-INSTALL.md`** (creating the accounts and running the first build entirely in the browser — nothing to install, works on a locked-down laptop) and **`docs/07-BUILD-PROMPTS.md`** (what to paste into Claude Code). `01-STEP-BY-STEP-FOR-BEGINNERS.md` is the alternative for a computer where you *can* install software. Everything else in the pack is written for Claude Code — you copy it into the project folder and let it read. Optional fourth read: `02-HOW-IT-WORKS-END-TO-END.md`, the plain-English walkthrough of the finished system from the provider's, the organiser's and each user's point of view.

## 1. The three things to know

1. **Everything about a competition is data, not code.** Scoring criteria, how many tricks count, judge counts, heat formats, ladders, break lengths, bib colours — all live in editable JSON "presets" (`presets/`) that the organiser can change per event and per division. Claude Code must never hard-code a rule. This is what makes the product sellable to events that run differently from yours.
2. **The scoring engine and the ladder engine are pure, tested logic.** They take inputs and produce outputs with a full breakdown, and they have test cases with exact expected numbers (`docs/08-TEST-SCENARIOS.md`). If those tests pass, results on the beach will be right. Build these first (Phases 1–2), before any screens.
3. **Protect your Claude Pro credits.** One phase per session, `/clear` between phases, Sonnet for building, Opus only for planning. Details in §5.

---

## 2. What we decided (from your answers on 29 Sep 2026)

| Topic | Decision |
|---|---|
| Event | Launch event for **Arrow** (new kite brand), **El Gouna, Egypt**, next weekend. Rider count and divisions unknown → the system must generate everything from whatever is entered on the day. |
| Default scoring preset | **KOTA-style: best 3 tricks + impression** (each trick 0–10 on Height, Extremity, Technicality, Execution; best 3 tricks = 75%, one impression score = 25%). Five other presets ship too (GKA-style categories, PUKL-style points, Megaloop single-best-jump, simple overall score, quick club/expression format). |
| Judges | Probably 3 for Gouna. Minimum 3, add/remove freely, **optional** head judge (who may or may not also score). |
| Height | Judged by eye for now. **WOO is a sponsor** → a switchable "sensor height" module: off by default, on when sensors are available (manual entry first, API later). |
| Connectivity | Good 4G/5G at the beach → online-first design with an automatic retry queue for score submissions as a safety net. |
| Roles for next weekend | Judge scoring (phone) · Head judge console · Spotter/trick caller · Public live scoreboard · Big-screen/commentator view · Rider self-registration. |
| Rider identification | Configurable per event (and per division): coloured vests assigned per heat (default), one fixed lycra per rider, bib/sail numbers, kite (brand, model, size, colours), rash-guard or helmet colour, rider photo — any as primary, the rest as secondary, always rendered as text as well as colour. A "brand launch" preset covers the Arrow case where most riders fly the same kites. See `docs/06-SCREENS-UX.md` §0 and `presets/identification/`. |
| Lessons from your previous app | Kept: role-picker page with deep links, formula printed on every result row, attempt cap with a "5 / 7" counter, spotter/judge split, code-based access without accounts, your legacy scoring model as a preset. Fixed: unexplained colours, no timetable or live marker, no overall ranking or rules page, hidden judge marks, repeated tricks all counting, admin wall when switching competitions. See `docs/11-LESSONS-FROM-PREVIOUS-APP.md` and the screenshots in `reference/previous-app/`. |
| Live-heat flow (your description) | Heat goes live → spotter and judge phones open it automatically. Spotter: rider names, Left/Right, CRASH button, large trick list with multipliers (×2, ×3) and modifiers (board-off, handle pass…) combinable, or typed, or spoken. Submitted trick appears on every judge's phone; judges can press **Missed**. At heat end every judge must submit a variety/impression mark per rider before the heat can be published. Head judge/admin can remove duplicate or wrong tricks and edit anything (audited). |
| Timetable | Reproduce your Kitemania timetable logic in-app: one anchored first heat, End = Start + Duration, next Start = End + Break, extra anchors when you re-start after a wind hold, and alternative running orders (good wind / bad wind). See `docs/04-FORMAT-LADDER-SPEC.md` §7. |
| Tooling | Claude Pro subscription, GitHub connected. Credit efficiency matters. |

---

## 3. What is in the pack

```
bigair-scoring-handover/
├── 00-START-HERE.md                 ← you are here
├── 01-STEP-BY-STEP-NO-INSTALL.md   ← accounts → Claude Code cloud sessions → first build, all in the browser (read second)
├── 01-STEP-BY-STEP-FOR-BEGINNERS.md ← alternative local-install path (or inside a GitHub Codespace)
├── 02-HOW-IT-WORKS-END-TO-END.md   ← how the finished system is used: provider, organiser, judges, riders, spectators
├── CLAUDE.md                        ← copy to the ROOT of your code repository (Claude Code reads it every session)
├── docs/
│   ├── 01-PRD.md                    ← what we are building, for whom, MVP vs later
│   ├── 02-DOMAIN-RULES-REFERENCE.md ← how Big Air is really judged (KOTA, GKA, Megaloop, PUKL…) with sources
│   ├── 03-SCORING-ENGINE-SPEC.md    ← the configurable scoring maths, schema, worked examples  ★ core
│   ├── 04-FORMAT-LADDER-SPEC.md     ← formats, ladders, seeding, progression, TIMETABLE engine  ★ core
│   ├── 05-ARCHITECTURE-DATA-MODEL.md← tech stack, database tables, security, realtime, deployment
│   ├── 06-SCREENS-UX.md             ← every screen per role, mobile-first
│   ├── 07-BUILD-PROMPTS.md          ← the prompts to paste into Claude Code, phase by phase  ★ start here to build
│   ├── 08-TEST-SCENARIOS.md         ← exact expected numbers Claude Code must make its tests pass
│   ├── 09-EVENT-DAY-RUNBOOK.md      ← how to run Gouna on the system, with paper fallback
│   ├── 10-COMMERCIAL-ROADMAP.md     ← multi-event product, pricing, competitors, costs
│   └── 11-LESSONS-FROM-PREVIOUS-APP.md ← keep/fix list from your old judging app
├── presets/
    ├── scoring/                     ← 7 scoring models as JSON (KOTA default; includes your legacy model)
    ├── formats/                     ← 5 competition formats/ladders as JSON
    ├── schedule/                    ← your Kitemania timetable re-expressed as a schedule preset
    ├── tricks/                      ← spotter trick-builder vocabulary (directions, multipliers, base tricks, modifiers, speech/text aliases)
    └── identification/              ← rider identification schemes (vests per heat, fixed lycra, bib numbers, kites, brand launch)
└── reference/previous-app/          ← 4 screenshots of your previous judging app (role picker, leaderboard, bracket, access gate)
```

Copy the whole `docs/` and `presets/` folders into the repository too — Claude Code will read them with `@docs/...` references.

---

## 4. Set-up before you open Claude Code (≈45 minutes, once)

> **No admin rights on your laptop?** Skip the installs in this table entirely: Claude Code **cloud sessions** (claude.ai/code, included in Pro) build in the cloud against your GitHub repository, Vercel gives every pull request a test address for your phone, and GitHub Codespaces provides a browser terminal if you ever need one. Click-by-click: `01-STEP-BY-STEP-NO-INSTALL.md`. The table below is the local-install summary (`01-STEP-BY-STEP-FOR-BEGINNERS.md`).

You already have GitHub connected to Claude. You also need:

| Step | What | Why | Cost |
|---|---|---|---|
| 1 | Install **Node.js LTS** (nodejs.org) and **Git** on your laptop | Runs the app locally so you can test on your phone over Wi-Fi | Free |
| 2 | Install **Claude Code** (`npm install -g @anthropic-ai/claude-code`, then `claude` in a terminal and log in) | The builder | Included in Pro |
| 3 | Create a **Supabase** account → New project → region **Frankfurt (eu-central-1)** (closest to Egypt with low latency) → save the project URL, anon key, service-role key and the database password | Database, login, live updates | Free tier for the build; note free projects **pause after ~7 days of inactivity** — wake it from the dashboard the day before the event, or upgrade to Pro ($25/month) once you are commercial |
| 4 | Create a **Vercel** account with your GitHub login → you will import the repo in Phase 0 | Hosting; every `git push` deploys automatically | Hobby plan is free but **licensed for non-commercial use only** — move to Pro ($20/month) the moment you charge an event |
| 5 | Create an empty **GitHub repository** (private) called e.g. `bigair-scoring` | Where the code lives | Free |
| 6 | (Optional) Install the GitHub CLI `gh` and run `gh auth login` | Lets Claude Code open pull requests and read issues efficiently | Free |
| 7 | Domain name (optional now) | e.g. `scores.[yourbrand].com` mapped in Vercel | ~$10–15/year |

Keep the Supabase keys in a password manager. They go into a `.env.local` file that is never committed (CLAUDE.md enforces this).

---

## 5. How to build it — the loop, and how to protect your credits

### The loop (repeat per phase)
*(Cloud version: start a session at claude.ai/code on the `bigair` environment, paste the prompt, let it run, create the PR, test on the PR's Vercel preview from your phone, merge — see `01-STEP-BY-STEP-NO-INSTALL.md` §5. The local version follows.)*
1. Open a terminal in the repo folder and run `claude`.
2. Run `/usage` to see how much of your 5-hour and weekly allowance is left. Do not start a heavy phase with <40% of the 5-hour window.
3. Paste the phase prompt from `docs/07-BUILD-PROMPTS.md`. Each prompt tells Claude which docs to read, what "done" means, and to show test output as evidence.
4. When it says done: run the app (`npm run dev`), open it on your phone (`http://<your-laptop-ip>:3000`), and try the acceptance checks listed for that phase.
5. Report problems in one message with the exact symptom ("on the judge screen, tapping 8.5 for Height saves 8.0"). Claude fixes; re-test.
6. Ask Claude to commit and push (`git push` triggers the Vercel deploy). Then `/clear`, and move to the next phase.

### Model and effort recommendations (Claude Pro, September 2026)
Your Pro plan has a rolling 5-hour allowance plus a weekly cap, shared between Claude Code and the Claude app; Opus draws down the allowance several times faster than Sonnet, and Opus has its own tighter weekly bucket. Effort controls how much Claude reads, verifies and pushes on before checking back — the current default is **medium** for both Sonnet 5.5 and Opus 5.5, and Anthropic's own guidance is to stay there unless you have a reason.

| Situation | Model | Effort | Why |
|---|---|---|---|
| Phases 0, 3, 4, 6, 7, 8 (scaffold, database, screens, polish) | `/model sonnet` | medium (default) | Best value; these are well-specified tasks |
| Phases 1, 2 (scoring engine, ladder + timetable engine) | `/model opusplan` | medium | Uses Opus only while in **plan mode**, then switches to Sonnet to write the code — the ideal compromise |
| Phase 5 (live heat console — the most interactive part) | `/model opusplan` | medium; **high** only if a bug survives two fix attempts | Interaction logic benefits from a better plan |
| Tiny edits (rename a label, change a colour, fix a typo) | `/model haiku` | low | Almost free |
| A spec question you are unsure about | Claude app (web), not Claude Code | — | Same pool, but no code context is loaded, so it costs far less |

Do **not** use `max`/`xhigh` effort for routine work — it costs 2–3× and tends to over-think. Fable models are not included in Pro limits (pay-as-you-go only) — avoid.

### Session hygiene that saves the most credits
- **One phase per session; `/clear` before the next.** Every message re-sends the whole conversation; a long session costs many times a fresh one.
- **Reference files, don't paste them.** Write `@docs/03-SCORING-ENGINE-SPEC.md` in the prompt; never paste the document text.
- **Keep `CLAUDE.md` short** (it is loaded every turn). Everything long lives in `docs/`.
- **Ask for evidence, not narration:** "run `npm test` and show me the summary line" beats "explain what you did".
- **After two failed corrections on the same bug, `/clear` and re-prompt** with what you learned (symptom + likely file + what fixed looks like).
- **Use plan mode (Shift+Tab) for Phases 1, 2, 5** and approve the plan before it writes code — a bad plan is the most expensive mistake.
- **Let Claude keep `docs/STATUS.md` updated** at the end of every phase (the prompts ask for this). Your next session reads that instead of re-exploring the repo.
- If you hit the weekly cap mid-build, the **Max 5x plan ($100/month)** is roughly the crossover point; you can downgrade after the event.

### If the plan slips before Gouna, cut in this order (last = cut first)
1. Rider self-registration (collect names on WhatsApp/Google Form, import CSV)
2. Big-screen mode (use the public scoreboard on a laptop full-screen)
3. WOO height module (award "Highest jump" from the WOO app manually)
4. Spotter role (judges create attempts themselves — the design allows it)
5. Public live scores during a heat (publish results after each heat only)

Never cut: scoring engine + tests, ladder + timetable, judge scorecard, head judge publish, results page.

---

## 6. Suggested timeline (event next weekend)

| Day | Goal | Phases |
|---|---|---|
| Day 1 (Wed) | Accounts, repo, CLAUDE.md + docs in repo, hello-world deployed; scoring engine passing tests | 0, 1 |
| Day 2 (Thu) | Ladder + timetable engine passing tests; database + login + judge PIN join | 2, 3 |
| Day 3 (Fri) | Organiser wizard (event → divisions → riders → judges → format → draw → timetable) | 4 |
| Day 4 (Sat) | Judge scorecard, head judge console, spotter — full heat run-through with friends on 3 phones | 5 |
| Day 5 (Sun) | Public scoreboard, results, big screen, exports, branding; **full dry run** with the runbook | 6, 7, 8 |
| Event −1 day | Create the real event, import riders, brief judges (15 min), print paper backup sheets | Runbook |

If the event is the weekend after, spread the same phases over more days and add Phase 7's optional items.

---

## 7. When something breaks

- **Build/red error in terminal** → paste it into Claude Code: "the build fails with this error: […]. Fix the root cause and verify the build succeeds."
- **Screen looks wrong** → take a phone screenshot, paste it: "this is what I see, this is what I expected".
- **Claude went down a bad path** → press `Esc` to stop; `Esc Esc` (or `/rewind`) to restore the code to an earlier checkpoint.
- **App down on event day** → the runbook has a paper-sheet fallback and a "re-enter scores later" path. Check Vercel → Deployments (is the latest green?) and Supabase → project status (is it paused?).
- **Live updates not appearing** → almost always Realtime not enabled on the table or a Row-Level-Security policy; tell Claude exactly which screen didn't update.

---

## 8. Two-minute glossary

**Division** – a category with its own entrants, scoring preset and format (e.g. Pro Men, Women, Amateur). **Round → Heat → Slot** – a heat is a timed session with 1–10 riders in coloured vests; slots are the positions in it. **Attempt** – one jump/trick by one rider, logged by the spotter (or a judge). **Panel score** – judges' marks for one attempt combined (mean, or drop high/low with 5+ judges). **Counting rule** – which attempts make up the heat total (best 3, best per category, single best…). **Impression** – one extra 0–10 mark per rider per heat for the overall performance. **Ladder** – how heat placings feed later rounds. **Anchor** – a manually pinned start time in the timetable; everything after it re-flows. **Wind hold** – a pause that pushes all remaining heats. **Modifier** – DNS (did not start), DNF, DSQ, INT (interference penalty).
