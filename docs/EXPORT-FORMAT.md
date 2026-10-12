# EXPORT-FORMAT — the results CSV and the event backup file

What the two download files hold, field by field, and how a later "Restore from backup" would read them. **Restore does not exist yet** (Export 1 builds the files only). Everything below is what the code writes today: `src/lib/export-format/` (the formats, pure and tested), `src/lib/exports/` (the loaders that read the database), `src/app/export/[eventId]/` (the three routes).

| File | Route | Who | What it holds |
|---|---|---|---|
| Results CSV | `GET /export/<event id>/results.csv[?draft=1]` | an organiser of the event, or its head judge (the draft tick box: organiser only) | every released heat, one row per rider; then the division placings and the ladder seats |
| Printable results | `GET /export/<event id>/print[?draft=1]` | same | the same heats drawn by the public results page's own components |
| Event backup | `GET /export/<event id>/backup.json` | an organiser of the event only | the whole event, as one JSON file |

Every route answers `401` to a signed-out visitor and `403` (print: `404`) to anybody else. A practice (simulation) event never exports (`409`). Each file written also writes one audit line (`results_exported` or `backup_downloaded`, with who, when, which file) through the database function `log_export`; if that line cannot be written, no file is given. Nothing else is written.

---

## 1. The results CSV

**Encoding.** UTF-8 with a byte-order mark (so Excel reads names with accents), CRLF line ends, a cell quoted only when it holds a comma, a quote or a line break (`"` doubled). A text cell that starts with `=`, `+`, `-` or `@` gets a single quote in front so it can never run as a formula. File name: `<event slug>-results-<yyyy-mm-dd>-<hhmm>.csv`, the date and time in the **event's** time zone.

**Which heats.** Exactly the heats the public results page shows as complete: published and not held back, never cancelled. The rows come from the same function the public page reads (`get_public_results`, called as the person pressing the button), so the public visibility rules are the rules of the file; a single judge's marks are never in it. With the organiser's tick box *Include heats under review (draft)* the heats that are under review (scored here with the same engine the head console uses, from the panel's scores) and the heats published but held back (their stored result) are added with `Draft = DRAFT` and no result version, published-by or published-at.

### The heat table (the first table, with its header row)

| Column | Meaning |
|---|---|
| `Division`, `Round`, `Heat` | Names as on the public pages (`R1`, `Heat 3`, or the heat's own name). |
| `Draft` | `DRAFT` for a heat laid in by the draft box, otherwise empty. |
| `Rider label` | What the division's identification scheme shows for the rider in this heat (Lycra colour, bib, name…), as text. |
| `Rider` | First and last name. |
| `Lycra` | The Lycra colour of the seat in this heat (its name, or the key if the palette no longer has it); empty when the seat has none. |
| `Rider status` | `Riding`, `Did not start`, `Out of the event`, `Walkover`, `Did not finish` or `Disqualified`. A rider who did not ride has no `Heat total` (never 0.0); the rider who went through without riding is `Walkover` with place 1. |
| `Attempt n trick`, `Attempt n result`, `Attempt n score`, `Attempt n counted` | Repeated for n = 1 … the highest attempt count of any rider in the file (shorter riders leave the rest empty). Result is `Landed` or `Crashed`; score is the **panel** score (empty for a crash); counted is `Yes` / `No` (a counted attempt is one of the tricks that make the total). Attempts above the heat's cap are left out, as on the public page. |
| `<name> score` | The impression score under the event's configured name (Event step → *Name of the impression score*); when there is none, what the divisions' scoring models call it (joined with ` / ` when they differ; the house default is "Impression / Variety score"). |
| `Heat total` | The total as the public page shows it (empty for Did not start / Disqualified). |
| `Place in heat` | The rider's place in the heat. |
| `Result version` | The version of the published result (a corrected heat has 2, 3 …). |
| `Published by` | The head judge's seat name or the organiser's e-mail, from the audit log's `heat_published` line; empty when that line names nobody (a heat published by the test helpers or an older version). |
| `Published at` | Date and time in the event's time zone, `yyyy-mm-dd hh:mm`. |

### After the heat table (each preceded by an empty line and a title row)

- **`Placings so far`**: `Division, Place, Rider, Went out in` (`13=` for a shared place) for every division with a drawn ladder, from the public draw (only released heats feed it).
- **`Ladder seats`**: `Division, Round, Heat, Heat state, Seat, Rider, Lycra, Total or seat` — every seat of every heat of the ladder, with `1st H1`-style placeholders for seats not filled yet.
- **`Export`**: `Event`, `Exported at`, `Time zone`, `Includes draft heats`, `Heats in this file`.

### Example (docs/08-TEST-SCENARIOS.md §1A, KOTA preset, rider "Red", one published heat)

```
Division,Round,Heat,Draft,Rider label,Rider,Lycra,Rider status,Attempt 1 trick,Attempt 1 result,Attempt 1 score,Attempt 1 counted,… Attempt 5 counted,Impression score,Heat total,Place in heat,Result version,Published by,Published at
Pro Men,R1,Heat 1,,Sam Rivera,Sam Rivera,Red,Riding,Kiteloop board-off,Landed,7.71,Yes,Double loop,Landed,8.25,Yes,Late backroll kiteloop,Landed,7.29,No,Board-off,Crashed,,No,Contra loop,Landed,8.08,Yes,7.50,31.54,1,1,Head Judge Fawy,2026-10-04 14:32
```

The unit test `src/lib/export-format/results-export.test.ts` builds exactly this heat from the engine and checks the whole header and row.

---

## 2. The event backup (JSON)

File name `<event slug>-backup-<yyyy-mm-dd>-<hhmm>.json`. One object; the schema is `BackupSchema` in `src/lib/export-format/backup.ts` (Zod): `format` is `"bigair-event-backup"`, `formatVersion` is `1` (raised when a section changes shape). `counts` holds the length of every row list, and the schema refuses a file whose counts do not match.

| Key | What it holds | Source |
|---|---|---|
| `format`, `formatVersion`, `exportedAt` (UTC), `exportedBy` `{role, name}`, `app.version` | Which file this is, when, by whom, from which product version. | — |
| `organisation` | `{id, name, slug}` of the organisation that owned the event. | `organisations` |
| `event` | The event's row: name, slug, location, time zone, dates, status, `settings` (visibility switches, ready call, impression name, identification scheme, flags, sponsors…), branding, `trick_vocabulary_version`, archive flag. | `events` (named columns; never the join code's hash) |
| `trickBase` | `masterVersion` (the master trick base version this event uses), `master` `{key, version, contentHash}` (named, not copied) and `localBlocks` (the blocks this event added itself, in full). | `trick_vocabularies` |
| `divisions[]` | The division's row (scoring overrides, format parameters, live settings, identification, **`trick_base`** layout, the stored **`draw`** and the copy taken at lock time, lock time, panel) with `scoringModel` and `formatTemplate` laid in as they were used: `{id, key, name, version, content_hash, json}`. | `divisions`, `scoring_models`, `format_templates` |
| `panels[]`, `panelMembers[]` | Panels and the seat numbers on them. | |
| `riders[]`, `entries[]` | The riders of this event's entries (names, nationality, date of birth, e-mail, phone, sponsor — **personal data, keep the file private**) and the entries (division, seed, status, identifiers, consent time). | `riders`, `entries` |
| `officials[]` | The seats: `id, event_id, name, role, active, status, scores, spotter_assignment, created_at, updated_at`. **Never** a PIN, its hash or encrypted copy, a link token, a phone number, a device or the login behind the seat. | `judge_seats` (allow-list) |
| `rounds[]`, `heats[]`, `heatSlots[]` | The ladder's rows with every state: times, status, hold, flag state (`flag_out`, `armed_at`, `prestart_sec`…), draw uid, re-run links; the seats with Lycra colour, source, place, total and breakdown. | |
| `plans[]` | Every run order and plan: items, anchors, pins (`hand_pins`), `actual_starts`, hold, defaults, active flag. | `schedule_plans` |
| `attempts[]`, `scores[]`, `impressionScores[]`, `penalties[]`, `attemptFlags[]`, `judgeSheets[]`, `decisions[]` | Everything scored: attempts with their idempotency `client_key`, each judge's score or criteria, impression scores, interference, flags, who submitted a sheet, tie decisions and publish overrides. | |
| `results[]` | `heat_results`: **every version** of every published result, with its breakdown. A rider who did not ride has `breakdown.status` `WO` (walkover), `DNS` (did not start) or `OUT` (out of the event), no total, and a `status_word` in words (`Walkover`, `Did not start`, `Out of the event`). A walkover heat has `started_at = ended_at = published_at` in `heats[]`: it took no time and no attempt was logged. | `heat_results` |
| `windCalls[]`, `feedbackNotes[]` | Wind calls and the notes people left with the Note button. | |
| `auditLog[]` | Every audit line of the event (including the export lines of earlier downloads), with the secret keys of any before/after copy removed. | `audit_log` |
| `counts` | `{ <section>: <length> }` for every row list. | — |

### Secrets

Three layers: (1) seats and the event row are read with **named columns** (an allow-list); (2) free-form JSON (settings, the audit log, plans, decisions) passes through `stripSecrets`, which removes the keys `pin`, `pin_code`, `pin_hash`, `pin_enc`, `join_pin_hash`, `qr_token`, `qr_token_hash`, `qr_token_expires_at`, `token`, `access_token`, `refresh_token`, `secret`, `password`, `api_key`, `service_role_key`, `authorization`, `auth_user_id` at any depth; (3) `BackupSchema` runs `findSecrets` over the finished file and refuses it if any such key remains. The test `src/lib/export-format/backup.test.ts` builds a file from rows full of secrets and checks that neither the keys nor the values are in the output.

### Example (trimmed)

```json
{
  "format": "bigair-event-backup", "formatVersion": 1, "exportedAt": "2026-10-04T12:00:00Z",
  "exportedBy": { "role": "organiser", "name": "owner@example.com" }, "app": { "version": "0.14.0" },
  "organisation": { "id": "…", "name": "Arrow", "slug": "arrow" },
  "event": { "id": "…", "name": "Arrow Launch", "slug": "arrow-launch", "timezone": "Africa/Cairo", "settings": { "readyCallMin": 10 }, "trick_vocabulary_version": 7 },
  "trickBase": { "masterVersion": 7, "master": { "key": "big-air-vocabulary", "version": 7, "contentHash": "…" }, "localBlocks": [] },
  "divisions": [ { "id": "…", "name": "Pro Men", "scoringModel": { "key": "kota-best3-impression", "version": 1, "json": {} }, "formatTemplate": null, "draw": {} } ],
  "officials": [ { "id": "…", "name": "Head judge", "role": "head", "active": true, "status": "active" } ],
  "results": [ { "id": "…", "heat_id": "…", "entry_id": "…", "place": 1, "total": 31.54, "version": 1, "breakdown": {} } ],
  "counts": { "divisions": 1, "heats": 15, "attempts": 240, "results": 1 }
}
```

---

## 3. How an import would work (for the session that builds "Restore from backup")

**What must be remapped.** A restore creates a **new** event; it never overwrites one.
- **Every id.** All primary keys are uuids and are generated again. Build one map `old id → new id` per table and rewrite every foreign key. Ids also live *inside* JSON, and these must be rewritten too: `divisions.draw` and its lock-time copy (entrant ids = entry ids, heat ids, `uid`s), `heat_slots.source`, `schedule_plans.items[].heatId` and `hand_pins`, `heat_results.breakdown.riderId`, `heat_decisions.payload.riderIds`, `attempt_flags`, `audit_log.row_id` and the ids in its before/after, `events.settings` (anything naming a division or seat), `divisions.live_settings`, `rerun_of`. `heats.draw_uid` and the plan item ids (`i1`, `lunch`) are labels, not row ids: keep them.
- **Idempotency keys.** `trick_attempts.client_key`, `trick_scores.client_key`, `impression_scores.client_key` are unique across the whole database: generate new ones (the old phones' queues are gone).
- **The organisation.** The file names the organisation by `{id, slug}`; the importer asks the organiser which organisation of theirs receives the event (the caller must be a member) and rewrites `organisation_id` on the event, riders and presets; riders are matched by e-mail inside the target organisation before new ones are made.
- **The event's slug.** Slugs are unique; propose `<slug>-restored` unless free.
- **The trick base version.** `trickBase.master` names `{key, version, contentHash}`. If the target database has that version, pin the new event to it (`events.trick_vocabulary_version`); if it does not (a different environment), stop and say which version is missing — do not silently take the newest, because trick names, aliases and the per-division `trick_base` layouts were made against that version. `trickBase.localBlocks` are re-created as the event's own `event-additions` vocabulary row.
- **Scoring models and format templates.** Match `scoringModel` / `formatTemplate` by `key + version`, and compare `content_hash`; when absent or different, create an organisation-owned copy from the embedded `json` and point the division at it.
- **Seats and logins.** The file holds no PIN, token or login. Seats are re-created with the same name and role, `status = 'pending'` or without a PIN, and the organiser sets PINs again on the Officials step (`panel_members` follow the new seat ids). Observers and announcers come back the same way.

**What must be checked before anything is written** (all in one dry run that writes nothing and prints a report):
1. `formatVersion` is one this importer knows; the file parses with `BackupSchema` (counts match, no secret key).
2. The target organisation exists and the caller is one of its organisers; the target slug is free; no heat of the target is running.
3. Every foreign key in the file resolves inside the file (heats → rounds → divisions, slots → entries, scores → attempts and seats, results → heats and entries); report orphans.
4. The trick base version, scoring models and format templates resolve (above).
5. The ladder is consistent: each division's stored draw, its heats and their slots agree (same check the Draw step runs).
6. The stored results can be reproduced: re-score every published heat from its attempts and scores with the same engine (`computeHeat`) and compare totals and places with `results` (latest version). A mismatch is reported, not fixed.

**How it would be written.** In one database transaction, through a privileged function (the service key, like `publish_heat_commit`): insert in foreign-key order — organisation-level rows first (riders), then event, panels, seats, divisions, rounds, entries, heats, heat_slots, plans, attempts, scores, impression scores, penalties, flags, sheets, decisions, results, wind calls, notes. The state-machine and audit triggers must be passed over for the copy (heat times such as `started_at` are only set by triggers; a restore needs to keep the original ones), and `heats.live_rev` starts at 0. The audit log of the new event gets the old lines (as history, with a note in `reason`) plus one new line, "restored from backup <file name>". The restored event starts as **draft** and not public; after the checks above pass the organiser publishes it.

**Known gaps in the files (so a restore does not promise more than it has).**
- `Published by` is only as good as the audit log: it is read from the heat's `heat_published` line, which names the person who pressed Publish.
- The backup names the master trick base version but does not embed the master itself.
- The backup holds riders' contact details and dates of birth (a rebuild needs them); the file must be kept private.
- Uploaded files (logos, rider photos, feedback screenshots) are referenced by path/URL, not embedded.
