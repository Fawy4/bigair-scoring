# 05 — Architecture, Data Model & Security

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack

## 1. Stack (and why — for a non-developer owner)

| Layer | Choice | Why |
|---|---|---|
| Web app | **Next.js 15** (App Router) + TypeScript strict | One codebase for public pages, organiser console and official screens; excellent Claude Code support; deploys in one click to Vercel |
| UI | Tailwind CSS + shadcn/ui | Fast to build, accessible components, mobile-first |
| Database, login, live updates | **Supabase** (Postgres + Auth + Realtime + Storage + Row Level Security) | Managed Postgres with per-row security; live updates to every phone without extra servers; free to start; GDPR-friendly EU region (Frankfurt) |
| Validation | Zod | One schema = types + runtime validation of presets and forms |
| Tests | Vitest (engine), Playwright (smoke) | Claude Code can verify its own work |
| Hosting | Vercel | Git push → deployed; free to build; **Pro $20/month when commercial** |
| Installability | PWA manifest | Officials add the app to their home screen; full-screen |

Costs: build phase $0. First commercial event: Vercel Pro $20 + Supabase Pro $25 ≈ **$45/month** (Supabase Pro also removes the 7-day auto-pause of free projects and adds daily backups).

## 2. Runtime shape
- **Public pages** are server-rendered then subscribe to Realtime for changes (fast on mobile data).
- **Official screens** (judge, spotter, head judge) are client components with an outgoing **submission queue** (IndexedDB) and Realtime subscriptions filtered by `heat_id`.
- **All writes** go through server actions (Zod-validated) or direct Supabase inserts protected by RLS; the **engine** runs on the server for publishing (authoritative) and on the client for instant live previews (same pure code).
- **Time**: `heats.started_at` (server `now()` on Start) is the single truth; clients render countdowns from it; offsets are corrected using the server time header on each request.

## 3. Route map
```
/                         product landing (later: organisation sign-up)
/org                      organiser dashboard (auth: magic link)
/org/events/[id]/...      wizard: settings · divisions · riders · officials · draw · schedule · live
/join                     officials: enter PIN or scan QR → bound seat
/judge/[heatId]           judge scorecard          /head/[eventId]   head judge console
/spot/[heatId]            spotter trick caller     /screen/[slug]    big screen
/e/[slug]                 public: home + timetable · /e/[slug]/live · /draw/[divisionId] · /results/[heatId] · /placings/[divisionId] · /rider/[entryId] · /register · /join (role picker: judge, spotter, head judge, announcer, leaderboard, bracket, timetable) · /rules (auto-generated "how scoring works" per division)
/o/[orgSlug]              public organisation page: upcoming, live and past events (no admin wall for spectators)
/api/export/...           CSV/PDF endpoints (signed URLs)
```

## 4. Environments
- `.env.local` (never committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `NEXT_PUBLIC_PRODUCT_NAME`, `NEXT_PUBLIC_DEFAULT_TZ=Africa/Cairo`, `NEXT_PUBLIC_SITE_URL`.
- Local Supabase via CLI for development (`npx supabase start`), hosted project for staging/production. Migrations are the only way schema changes happen.

## 5. Data model (Postgres). All tables: `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`.

| Table | Key columns | Notes |
|---|---|---|
| `organisations` | name, slug, branding jsonb, plan | tenant (multi-event, multi-customer later) |
| `memberships` | organisation_id, user_id, role (`owner|admin|staff`) | organiser access |
| `events` | organisation_id, name, slug, location, timezone, start_date, end_date, status (`draft|published|live|complete`), settings jsonb (`publicLiveScores: "live"|"after_publish"|"off"`, `readyCallMin`, `identification` = scheme id + overrides from presets/identification), branding jsonb (logo, sponsors[]), join_pin_hash | one competition |
| `divisions` | event_id, name, order, scoring_model_id, scoring_overrides jsonb, format_template_id, format_params jsonb, panel_id, status | |
| `riders` | organisation_id, first_name, last_name, nationality, dob, email, phone, sponsor, woo_id, photo_url | reusable across events |
| `entries` | division_id, rider_id, seed int, status (`registered|confirmed|withdrawn|no_show`), source (`self|import|manual`), paid bool, consent_at, identifiers jsonb (`bib_number`, `vest_colour` when fixed per rider, `kite {brand, model, size, colours}`, `rashguard_colour`, `helmet_colour`) | one rider in one division; identifiers rendered as the rider chip per the event's identification scheme |
| `scoring_models` | organisation_id null=system, json jsonb, name, version | presets (validated by Zod on save) |
| `format_templates` | organisation_id null=system, json jsonb, name | presets |
| `rounds` | division_id, order, spec jsonb (RoundSpec), name, short_name | expanded from template |
| `heats` | round_id, division_id, event_id, number int, status (`scheduled|running|paused|ended|under_review|published|cancelled`), duration_sec, started_at, paused_at, paused_total_sec, ended_at, published_at, flag_out jsonb, manual_override bool | |
| `heat_slots` | heat_id, position, entry_id null, vest_colour null (set only when the scheme assigns vests per heat slot), source jsonb ({round, heat, place} placeholder), place int, total numeric(6,2), breakdown jsonb, modifier (`null|DNS|DNF|DSQ`), flagged_out bool | |
| `judge_seats` | event_id, name, role (`judge|head|spotter|announcer`), pin_code (per-seat, 6 digits), auth_user_id null, device_label, active bool, scores bool (head judge also scores), spotter_assignment jsonb (entry ids / slot positions this spotter calls; null = free), status (`active|pending`) | officials; bound on join; `pending` = self-added from the join page until approved |
| `panels` / `panel_members` | event_id, name / panel_id, judge_seat_id, seat_no | which judges score which division |
| `trick_attempts` | heat_id, entry_id, seq int, direction (`left|right` null), category_key, trick_name, trick_parts jsonb (builder keys), status (`landed|crashed`), height_m numeric(5,2), created_by_seat, input_method (`builder|text|speech`), raw_text, created_at, deleted_at null, deleted_by, possible_duplicate_of null, video_ts | logged by spotter or judge; `unique(heat_id, entry_id, seq)`; soft-deleted rows excluded from all views/counters |
| `trick_vocabularies` | organisation_id null=system, event_id null, json jsonb | trick-builder vocabulary (`presets/tricks/`), editable per event |
| `trick_scores` | attempt_id, judge_seat_id, criteria jsonb, score numeric(5,2) null when missed, missed bool default false, flag text null (`crash|wrong_rider|duplicate|other`), client_key uuid unique, version int, edited_by, edit_reason | `unique(attempt_id, judge_seat_id)`; idempotent via client_key |
| `impression_scores` | heat_id, entry_id, judge_seat_id, value numeric(5,2), client_key unique | |
| `penalties` | heat_id, entry_id, type (`INT|other`), value jsonb, reason, issued_by | |
| `heat_results` | heat_id, entry_id, place, total, percent, breakdown jsonb, published_at, version | immutable snapshot per publish (new version on re-publish) |
| `schedule_plans` | event_id, day date, name, items jsonb, anchors jsonb, actual_starts jsonb, hold jsonb, defaults jsonb, active bool | timetable (doc 04 §7) |
| `wind_calls` | event_id, status (`red|amber|green`), message, created_at | banner history |
| `audit_log` | actor_user_id, actor_seat_id, action, table_name, row_id, before jsonb, after jsonb, reason, at | trigger-populated for scores/results; app-populated for overrides |

Derived/live: a Postgres view `v_live_heat` joins heat, slots, attempts, scores for one query per heat.

## 6. Security model (RLS)
- **Organisers**: `memberships.user_id = auth.uid()` and matching `organisation_id` → full CRUD on their org's rows (events cascade).
- **Officials**: `judge_seats.auth_user_id = auth.uid()`. Policies: judges can `insert/update` `trick_scores` only where the attempt's heat is `running|ended` and the judge is a `panel_member` of that heat's division; spotters can insert `trick_attempts` for running heats of their event; head judges can update scores/attempts/heats of their event (audited) and publish; announcers read-only.
- **Public (anon)**: read `events` (published), `divisions`, `rounds`, `heats`, `heat_slots`, `heat_results` (published), `schedule_plans` (active), `wind_calls`; read `trick_attempts`/`trick_scores` of running heats only when `events.settings.publicLiveScores = "live"` (implemented as a view with a security-definer function). Never expose `pin_code`, emails, phones.
- **Service role** only in server actions for publish/progression (transactional) and exports.
- PINs: per seat, hashed; join page rate-limited; QR encodes a one-time token. Seats can be revoked instantly (`active=false`).

## 7. Realtime & consistency
- Publication includes `heats, heat_slots, trick_attempts, trick_scores, impression_scores, heat_results, schedule_plans, wind_calls`.
- Clients subscribe with `filter: heat_id=eq.<id>` (officials) or `event_id=eq.<id>` (public). On reconnect, refetch the heat snapshot, then resume the stream.
- **Attempt cap**: attempts are inserted through a server action or Postgres function that counts the rider's non-deleted attempts in the heat and rejects the insert with `ATTEMPT_CAP_REACHED` when the division's cap is reached. A head-judge override passes `overrideReason` and is written to `audit_log`. Phone counters ("5 / 7") come from the same count via Realtime.
- **Submission queue** (officials): each mark gets a `client_key`; write → on failure keep in IndexedDB → retry with backoff → server upsert on `(attempt_id, judge_seat_id)` so retries never duplicate. UI badge: pending / synced / failed (tap to retry).
- **Publish** is a single server action in a transaction: lock heat → run `computeHeat` + `rankHeat` with the division's model → insert `heat_results` version → set slots' place/total → `applyHeatResult` progression → update `schedule_plans.actual_starts/ends` → status `published`. Idempotent per version.

## 8. Heat state machine
`scheduled → running` (Start: `started_at = now()`; timetable actual start) → `paused ⇄ running` (wind/safety; accumulates `paused_total_sec`) → `ended` (timer 0 or head judge End; judges enter impression; scores lock for judges after grace period configurable, default 3 min) → `under_review` (head judge checks matrix, flags, edits with reason) → `published` (snapshot, progression) → optional `re-opened` (audited) → `published` v2. `cancelled` for abandoned heats (re-run creates a new heat number suffix "R").

## 9. Performance & offline
- Public pages: ISR + Realtime; images optimised; avoid heavy libraries.
- Officials: PWA cached shell; the scorecard works during brief drops (queue). Full offline-first is **not** in MVP (good 4G/5G in Gouna); the design leaves room for it.
- Heat timer: rendered from `started_at + duration − paused` with server offset correction; large digits; optional beep at 1 min and 0.

## 10. Observability & ops
- Vercel logs + Supabase logs; a `/org/health` page showing DB reachable, Realtime connected, last publish time.
- Backups: Supabase daily (Pro) or manual `pg_dump` before the event (runbook).
- Exports as the audit trail for disputes: CSV of every mark with judge seat and timestamps.

## 11. Testing strategy
- Engine: Vitest with the exact vectors in doc 08 (authoritative).
- Schema: every preset parses; invalid presets fail with readable messages.
- RLS: Vitest using anon vs service clients against local Supabase.
- E2E: Playwright happy path (join as judge → score → publish → public result).
- Manual: the dry run in doc 09 with three phones.
