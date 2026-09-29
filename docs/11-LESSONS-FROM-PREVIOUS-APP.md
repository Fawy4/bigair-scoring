# 11 — Lessons from the previous app ("Kite Competition Judging", KOL 26 U16)

> Generated: Tuesday 29 September 2026, 21:05 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack · Source: read-only browse of https://kite-comp-judging.vercel.app/?comp=cpr01kppib5g on 29 Sep 2026 (public screens only; judge/spotter/admin screens sit behind access codes and were not opened). Screenshots in `reference/previous-app/`.

## 1. What the old app was
A single-page web app (query-string routes `?comp=<id>&role=<role>`) for one competition record — "KOL 26 – U16 (5 Riders)". Landing = **role picker** (Admin · Spotter · Judge · Leaderboard · Bracket). Riders were scored **per trick** by judges (average shown, e.g. "4.7 avg"), with **7 attempts per rider per heat**, **best 3 tricks + one "variety" mark** per heat (formula printed on every row: `17.3 = best3 13 + variety 4.3`). Crashes were logged as attempts with the intended trick name ("Right Frontroll Crash", score 0). Spotters logged *what* was landed; judges scored *how well*. Heats of 2–3 riders; Round 1 (2 heats) → Finals (a final of 3 and a small final of 2). Officials picked their name and unlocked with an admin-issued access code; no accounts.

Trick vocabulary observed: `[Left|Right] [xN] [Base trick] [modifiers]` — "Left x2 Backroll", "Left Simple Jump", "Left Backroll Board Off Handle".

## 2. Keep (already in the new spec, or added now)
| Lesson | Where it lives in the new system |
|---|---|
| Role picker landing with deep-linkable URLs per event and role | **Added**: `/e/[slug]/join` role picker (Judge · Spotter · Head judge · Announcer · Leaderboard · Bracket · Timetable) — `docs/06` §7 |
| Formula visible on every result row; counted tricks highlighted; tap a chip to see trick name + panel average | **Made explicit**: result rows render `total = counted tricks + impression (± penalties)` with counted chips highlighted, greyed non-counted, red CRASH — `docs/06` §7 |
| Attempt cap per rider per heat with a live "5 / 7" counter | **Added** `heat.maxAttemptsPerRider` to the scoring model (null = unlimited) — `docs/03` §3, §4.3 |
| Crashes recorded with the intended trick | Already: attempt `status = crashed` keeps `trickName`/category |
| Spotter identifies the trick, judges score quality | Already; **added** a structured **trick builder** for spotters (direction · count · base trick · modifiers) so names are consistent and categories are derived automatically — `docs/06` §5 |
| No-account access with codes shown on the admin's screen; "remember on this device" | Already: per-seat PIN/QR; **added** "Not on the list? register your name → organiser approves and issues a PIN" — `docs/06` §1 step 4 |
| Very light, fast, phone-first UI | Design rules in `docs/06` |
| Continuity of the scoring model you used | **Added preset** `legacy-kol-best3-variety` (single mark 0–10 per trick, best 3 + Variety 0–10, 7 attempts) — scales confirmed by the owner on 29 Sep 2026 |

## 3. Fix (gaps in the old app the new one closes)
| Old app | New system |
|---|---|
| Colour = heat slot, never explained; only names, no bib/kite/nationality | Configurable identification scheme with text labels and a legend on public pages (`docs/06` §0) |
| No schedule, heat times, durations, countdown or "live now" | Timetable engine with anchors/holds; leaderboard defaults to the **live** heat; "Now / Up next" everywhere (`docs/04` §7) |
| No overall final ranking, no rules or criteria text, no tie-break rules | Final placings page (shared places "13="); **auto-generated "How scoring works" page** from the division's scoring model (criteria, scale, counting, impression, tie-breakers, penalties) (`docs/06` §7) |
| Judges' individual marks hidden even from review | Head-judge matrix with missing/outlier flags; event setting for public judge-level transparency |
| Repeated identical tricks all count toward best 3 (Badr: same trick twice) | `counting.distinctTrickNames` option (only the best of identically-named tricks can count) and `best_per_category` (`docs/03` §3, §4.3) |
| "Switch competition" leads to an admin password wall; no public event list | Public organisation page `/o/[orgSlug]` listing events; every event has its own public URL |
| Attempt counter inconsistency (Heat 3 said 21 tricks, showed 14) | Counters computed from the same query as the list; soft-deleted attempts excluded; tests on counts (`docs/08` §1F) |
| No branding/sponsors, no wind or status info | Event branding, sponsor strip, wind-call banner, heat status |
| Variety judged subjectively without any hint | Impression/variety prompt shows landed/attempted and the counted tricks per rider (`landedRatioHint`) |

## 4. Behind the access code — the live flow as described by the owner (29 Sep 2026)
1. Head judge/admin makes the heat **live** → spotters' and judges' screens show it immediately.
2. **Spotter screen**: rider names; trick **direction** (Left/Right); a **CRASH** button; a **large trick list with variations** — multipliers (×2, ×3 for double/triple rotations or loops), board-offs, etc. — that can be **mixed** into combinations; alternatively the spotter **types** the trick or uses **speech**.
3. On submit, the trick **appears on every judge's screen** to be scored; a judge can press **Missed** if they didn't see it.
4. When the heat finishes, **every judge must submit a variety score for each rider**.
5. An **admin overlooks everything**: removes tricks (two spotters logged the same one, or a wrong trick) and edits them.

All five points are now explicit requirements: auto-follow of the live heat (docs/06 §4–§5), the trick builder with list/typed/speech input and a vocabulary preset (`presets/tricks/big-air-vocabulary.json`), the judge **Missed** and **Flag** buttons (docs/03 §3–§4), mandatory variety/impression before publish (`impression.required`), and head-judge attempt management with duplicate detection, merge, edit and soft-delete (docs/06 §6, docs/05). Added as acceptance checks in docs/07 Phase 5 and tests in docs/08 §1F.

## 5. Resolved
The owner confirmed on 29 Sep 2026: judges gave **one mark 0–10 per trick** and a **Variety mark 0–10** per rider per heat. The legacy preset now uses those scales (heat total 0–40). All such parameters are set per event/division in the organiser wizard — presets are only starting points.
