# 02 — Domain Rules Reference: how Big Air kitesurfing is judged and run

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack · Compiled from public web research on 29 Sep 2026; sources listed in §9. Where an official rulebook could not be fetched in full (GKA Chapter 5), this is stated explicitly — do not let Claude Code guess those rules; feed it the PDF.

## 1. What every Big Air format has in common
- Riders compete in **timed heats** (8–15 min) of 1–4 riders (up to ~10 in amateur "expression session" heats), identified by **coloured vests**.
- Judges score **individual jumps/tricks** (not runs). A rider's heat total is built from a **limited number of counting tricks** (best 3, best per trick family, or the single best), often plus an **overall/impression** mark for the whole heat.
- Core criteria everywhere: **height/amplitude**, **extremity** (power, kite angle, horizontal travel — "yank"), **technicality/difficulty** (rotations, board-offs, handle passes, grabs, loop variations), **execution** (control, style, landing). Emphasis shifts with wind: stronger wind → height/extremity dominate.
- **Consistency of criteria during an event** is sacred: "No criteria changes during the competition" (GKA judge Marijn Ploeg). The system must lock a division's model once its first heat starts (organiser can still fix typos with an audit entry).
- Progression is by **knock-out ladders** with a second chance in early rounds (repechage), finishing with a 3-rider or man-on-man final.
- Wind is the master variable: events use **wind windows / waiting periods** and call the event on with a traffic-light system.

## 2. Red Bull King of the Air (KOTA) — 2026 format and criteria (the default preset)
**Criteria**: Height (altitude of jumps), Extremity (intensity and daring), Technicality (difficulty), Execution (style, control, smoothness). Qualifier guidance: "Low height + extreme = low score. Super high + not extreme = low score. Super high + extreme = high score."

**Scoring**: each trick scored out of 10; the **best 3 tricks** contribute up to 75 % of the heat score; an **impression score** contributes 25 %. "Final heat score = Trick 1 (25 %) + Trick 2 (25 %) + Trick 3 (25 %) + Impression score (25 %)." Impression = technical difficulty, style, execution (both directions, flow, clean landings), risk, show, innovation, with big emphasis on **variety** across the whole heat; it is "not a variety-score only" and deliberately judged holistically.

**Format ("Dingle Elimination")**: Round 1 — six heats of three riders, **13 minutes**; winners go straight to Round 3; 2nd and 3rd are **reseeded into Round 2**. **Flag-out**: after the first 8 minutes the lowest-scoring rider is flagged out (vest flag removed); the other two ride the final 5 minutes with scores carried over. Round 2 (repechage) — six heats of two, 10 min; winners to Round 3; losers finish **equal 13th**. Round 3 and semi-finals — man-on-man single elimination, 10-min heats; semis are three heats → three finalists. Final — **one 15-minute heat with three riders**, no flag-out.

**Seeding**: past KOTA results, qualifier tour rankings, video-entry performance. **Video qualification**: max 5 moves, best 3 "significantly different" tricks + flow, ≤60 s, last 12 months, no POV/FPV.

**2026 calendar**: Qualifier Hsinchu, Taiwan 21–26 Oct 2026; Cape Town main event window 21 Nov–6 Dec 2026.

## 3. GKA Kite World Tour — Big Air (world championship series)
From the GKA discipline page: height, amplitude and explosiveness are the biggest element; as wind increases the emphasis on height "increases exponentially". Extra criteria — the **"wow" factor**, variety, smoothness, risk, and the **proportion of tricks landed vs crashed** — combine into an **Overall Score that is added to the counting trick scores**. Tricks are broken into **categories, with only the highest score from each category counting** to the heat total (rewards the most complete rider). Judging is "usually about a 70/30 split between height and technical difficulty".

Head Judge Javo Santangelo (July 2024) on **extremity**: "big, high and powered, with the kite in the power zone, at a good angle" — speed in/speed out, amplitude and projection; a double loop that is not powered "is not going to score well". In lighter wind (≈30–35 kn) technical single loops scored relatively higher.

**Rulebook 2025** (last update 7 Oct 2025; PDF link in §9): Chapter 5 "Big Air discipline" = sections 39–44 (equipment; entry allocation & seeding; elimination procedure, heat schedule, heat procedure, discipline scoring, prize money; interference penalty procedure; judging procedure; ties; **Big Air trick categories** (44.3); judging criteria (44.4)); Appendix C2 = Big Air twin-tip trick list, C3 = surfboard. General chapter: 6.2 events need a Race Director, a Head Judge and **at least 5 judges** (3 judges + head judge under special circumstances); 4.2 divisions may be merged if fewer than 6 competitors; 7.1 max 28 competitors per discipline; 5.1 conditions decided by Race Director/Head Judge; 17.3 seeding; 18 competition format; 19–20 right of way and interference; 21 general judging rules.

> The Chapter 5 text could not be fetched in full for this pack. To make the `gka-category-overall` preset exact, download the PDF and give Claude Code the pages for sections 41–44 and Appendix C2, asking it to encode categories, counting and tie rules into the preset JSON.

## 4. Red Bull Megaloop (Noordwijk, NL) — single-best-jump model
22 riders (16 men: 10 invited + 6 video; 6 women: 2 + 4). Men's maximum **18 m lines**. Runs only in storm conditions (35+ kn window, 2026 window 29 Aug–7 Nov). **Only a rider's highest-scoring jump counts.** Criteria: **Extremity 70 %** (height, power, distance covered, kite angle); **Execution & Flow 30 %** = trick 15 % + style 10 % + landing 5 %.

**Ladders** — Men: R1 16 riders in 8 heats → 8 winners to R3, 8 runners-up to R2; R2 4 heats → top 4 to R3; R3 12 riders in 6 heats → winners to semis; semis 3 heats → final; **Final = 3-way battle**. Women: R1 6 riders in 2 heats → winners to Final, runners-up to a semi (1 heat) → winner to Final; Final of 3.

## 5. PUKL — British Kiteboarding National Championships (Portland, UK) — points-per-trick model
Built by riders to fix inconsistent judging. **Each trick scored out of 10: Height 3 + Risk 3 + Technicality 3 + Ingenuity 1.** Divisions: Division 1 Open (video entry), Division 2 Advanced (16 spots, minimum kiteloops in 35 kn, £50), Division 2 Women's (£25), **Division 2.5 Intermediate — "scored in heats of up to 10, expression-session style", no trick beyond a kiteloop allowed** (£25, unlimited). **Traffic-light wind call**: Red (no call), Amber (called Tuesdays — be ready to travel), Green (confirmed Wed/Thu — heats are set); 35 kn sustained trigger; weekends-only window mid-Sep to early Nov (3–4 Oct 2026 excluded for Speed Week). 100 % of entry fees go to prize money (£5,000 last year), 200–300 spectators, fantasy league for fans. Run in partnership with the BKSA.

## 6. Other formats and mechanics worth supporting
- **Overall-impression heats** (club level): each judge gives one 0–10 mark per rider per heat; averaged (JudgeMate describes this as the format "most events actually use": 4–6 riders, 10–15 min).
- **Judge aggregation precedents**: mean with 3 judges; with 5+ judges drop the highest and lowest and average the rest (used across judged sports — e.g. World Skate, ISU). Tie-break precedent (World Skate): highest single score, then next, and so on.
- **Head-judge tooling precedents (Liveheats)**: warnings when judges differ by more than 15 % of the scale, warnings when a judge misses a ride, head-judge approval before scores go public ("rank and release"), modifiers DNS/DNF/Interference/DQ, internet-time-synchronised heat timers, single-device "tabulator mode".
- **Big Air League UK** (WOO/Surfr height leagues): divisions by measured jump height 0–4 m … 20 m+, quarterly leaderboards — a model for a sensor-only side competition.
- **Video-entry qualification** (KOTA, Megaloop, PUKL Div 1) — later product feature: judges score submitted clips with the same criteria.

## 7. Measured height (WOO)
WOO 4.0 is a board-mounted sensor (≈€230) that records jump height, airtime and landing G-force; WOO describes it as the recommended device for professional events (e.g. the GKA Big Air team challenge) because take-off/landing detection and measurement are uniform across riders; WOO is an official GKA partner. Smart-watch estimates exist but WOO itself does not consider them fair for competing. WOO offers a "WOO Events" feature for organisers to create leaderboard competitions. Implication for the product: start with **manual entry** of WOO readings per attempt (read from the rider's app after the heat, or from a WOO official at the tent), with an API integration as a later phase. Uses: display + "Highest Jump" award (safe first step), auto-filled Height criterion (needs the riders' committee to accept a mapping), or bonus points.

## 8. Rules the system should make configurable (checklist)
Criteria (names, scales, weights, help text) · trick-score entry (criteria vs single mark) · crash handling · judge count, aggregation, trimming threshold, outlier warning, missing-score policy · counting rule (best N / per category / single best / all / none) · impression on/off, scale, weight · total display (raw / %) · categories list · tie-breakers order · modifiers and interference penalty · height-sensor module · heat sizes, durations, breaks, flag-out · ladder structure, seeding, reseeding, byes · eliminated placings (shared vs ranked) · run order, anchors, wind hold · public visibility of live scores and judge-level detail · vest colours · divisions and minimum entries.

## 9. Sources (retrieved 29 Sep 2026)
- Red Bull King of the Air 2026 — Format: https://www.redbull.com/us-en/events/red-bull-king-of-the-air/red-bull-king-of-the-air-competition-format-explained
- Red Bull King of the Air Qualifier — Judging criteria: https://www.redbull.com/us-en/events/red-bull-king-of-the-air/red-bull-king-of-the-air-qualifier-judging-criteria-2026
- Red Bull King of the Air Qualifier — Video content guidelines: https://www.redbull.com/gb-en/events/red-bull-king-of-the-air/red-bull-king-of-the-air-qualifier-south-africa-video-contest-rules
- GKA Kite World Tour — Big Air discipline page: https://www.gkakiteworldtour.com/discipline-big-air/
- GKA — "The judging unpacked: what to expect at Gran Canaria finale" (3 Jul 2024): https://www.gkakiteworldtour.com/the-judging-unpacked-what-to-expect-at-gran-canaria-finale/
- GKA Rulebook 2025 (PDF, last update 7 Oct 2025): https://gkakiteworldtour.com/rulebooks/2025/GKA%20RULEBOOK%202025.pdf
- North Kiteboarding — "Judging criteria explained" (KOTA 2024): https://northactionsports.com/blogs/all/judging-criteria-explained
- Red Bull Megaloop 2026 — Format: https://www.redbull.com/int-en/events/red-bull-megaloop-2025/red-bull-megaloop-format
- PUKL — British Kiteboarding National Championships: https://pukl.co.uk/
- Liveheats organiser support — live scoring articles: https://help.liveheats.com/en/category/live-scoring-at-your-event-pbg952/ and https://organiser.liveheats.com/live-scoring/
- JudgeMate — Freestyle/Big Air kiteboarding scoring: https://www.judgemate.com/en/sports/kiteboarding-freestyle
- WOO Sports — devices and events: https://docs.woosports.com/docs/disciplines-hardware and https://www.woosports.com/en
- Big Air League UK: https://www.bigairleague.com/
- Big Air Kite League (BAKL): https://www.bigairkiteleague.com/ (site shows the league as "resting" in Sep 2026)
