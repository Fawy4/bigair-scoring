# 01 — Product Requirements (PRD)

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack · Owner: Abdelrahman Fawy · Working name `[PRODUCT_NAME]`

## 1. Vision
A web-based competition operating system for kitesurfing Big Air (and later other judged kite disciplines) that any organiser can configure to their own rules in minutes: registration → divisions → judges → format/ladder → live timetable → phone judging → head-judge publishing → live public results. First used at the Arrow brand launch in El Gouna; then licensed per event or per season to other organisers.

## 2. Problem
Big Air comps today run on spreadsheets and paper: heats are re-timed by hand when the wind delays the start, judges' sheets are transcribed with errors, riders don't know when they ride, spectators can't follow, and every event invents its own scoring. Existing platforms (Liveheats, JudgeMate) are generic action-sports tools — not built around Big Air's trick-family counting, impression scores, flag-outs, wind holds or sensor heights.

## 3. Users
| Persona | Needs |
|---|---|
| **Organiser / race director** (you, Arrow team) | Set up fast on the beach, adapt format to rider count and wind, publish a timetable riders trust, look professional to sponsors |
| **Head judge** | See every mark, catch gaps/outliers, decide ties, publish with confidence, audit trail for disputes |
| **Judge** (3–5, sometimes volunteers) | Score on a phone in sunlight, no typing, no maths, can't make an invalid entry |
| **Spotter / trick caller** | Identify rider + trick quickly so judges only score |
| **Rider** | Register, see heat times and ready calls, see results and breakdown, share |
| **Spectator / commentator** | Live scores, who's up next, bracket, big screen |
| **Sponsor** (Arrow, WOO) | Branding everywhere; WOO height data showcased |

## 4. Scope — MVP for Gouna (must-have)
1. Event + divisions with configurable scoring presets (KOTA default; GKA-style, PUKL, Megaloop, overall, club-quick shipped) and format templates (single elimination heats-of-N, KOTA dingle, Megaloop, pools-to-final).
2. Riders: manual/CSV entry + public self-registration with organiser approval; seeds; withdrawals; configurable rider identification (coloured vests per heat, fixed lycra, bib numbers, kite brand/model/size/colours, rash-guard colour, photo) rendered identically on every screen.
3. Officials: min 3 judges, add/remove, optional head judge (scoring or not), spotter; PIN/QR join, no accounts.
4. Draw generation with snake seeding, byes/uneven heats, TBD placeholders, manual override.
5. Run order & timetable with anchors, durations, breaks, wind hold, alternative plans (from the Kitemania sheet).
6. Live heat ops: server-timed heat clock, spotter attempts, judge criteria scoring with retry queue, head-judge matrix with flags, edits with reason, flag-out, publish, automatic progression.
7. Public site: timetable, live heat, draw, results with breakdown, placings, rider page; big-screen mode.
8. Exports: results CSV/PDF, timetable PDF/PNG, paper judge sheets; audit log.
9. WOO height module (manual, off by default) with Highest Jump award.
10. Branding (event logo, sponsors), wind-call banner, PWA install.

## 5. Later (V1 commercial)
Multi-organisation accounts and billing · organiser preset marketplace · video-entry judging · WOO API integration · season rankings/points · notifications (WhatsApp/SMS ready calls) · streaming overlay graphics API · offline-first judging · multi-language (Arabic, French, Spanish, Dutch) · other disciplines (freestyle trick lists, hydrofoil big air).

## 6. Non-functional requirements
- Mobile-first, works on iOS Safari and Android Chrome; sunlight-readable.
- Live update latency ≤ 2 s on 4G; public pages fast on weak signal.
- No invalid score can be entered; every edit audited; results reproducible from stored marks.
- Availability during the event: app degrades gracefully (queue, tabulator mode, paper fallback).
- Data protection: EU-hosted database; rider consent captured; PINs hashed; no personal data on public pages beyond name/nationality/sponsor.
- Cost: $0 to build, ≈$45/month when commercial.

## 7. Success criteria for Gouna
- Every heat scored on phones; zero paper transcription.
- Timetable re-flowed at least once for wind with riders informed via the public page.
- Results published within 2 minutes of each heat ending.
- Head judge can explain any total from the breakdown on request.
- Judges rate the scorecard "easy" (informal 1–5 poll ≥ 4).

## 8. Out of scope (explicitly)
Payments at registration (collect off-platform for Gouna) · rider ranking across events · livestream production · hardware timers.

## 9. Key risks & mitigations
| Risk | Mitigation |
|---|---|
| Build not finished in time | Phase order puts engine + judging first; cut list in 00-START-HERE §5 |
| Poor signal at the tent | Retry queue; head-judge tabulator mode; paper sheets |
| Judges disagree on criteria | Criteria help text + briefing script in runbook; outlier flags |
| Rider count changes on the day | Generators handle any N; "Seed now" with walkovers |
| Claude credits exhausted | Sonnet by default, opusplan for planning, `/clear` per phase, Max 5x fallback |
| Supabase free project paused | Wake it the day before; upgrade to Pro before commercial use |
