-- Phase 3 / step 2: every table in docs/05 §5 (plus the approved additions, docs/05 §12).
-- Statuses are text + CHECK (easier to evolve than enums). Scores are numeric(5,2) / totals numeric(6,2).

-- ---------------------------------------------------------------- tenants and events
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  branding jsonb not null default '{}',
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  location text,
  timezone text not null default 'Africa/Cairo',
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft', 'published', 'live', 'complete')),
  settings jsonb not null default '{"publicLiveScores":"after_publish","readyCallMin":10,"judgeGraceSec":180,"judgesMayLogAttempts":false,"livePollSec":7}',
  branding jsonb not null default '{}',
  join_pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- presets
create table public.scoring_models (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations on delete cascade, -- null = system preset
  key text not null,
  name text not null,
  version int not null default 1,
  json jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scoring_models_key_unique unique nulls not distinct (organisation_id, key, version)
);

create table public.format_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations on delete cascade,
  key text not null,
  name text not null,
  version int not null default 1,
  json jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint format_templates_key_unique unique nulls not distinct (organisation_id, key, version)
);

create table public.trick_vocabularies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations on delete cascade,
  event_id uuid references public.events on delete cascade,
  key text not null,
  json jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trick_vocabularies_key_unique unique nulls not distinct (organisation_id, event_id, key)
);

-- ---------------------------------------------------------------- officials and panels
create table public.judge_seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  role text not null check (role in ('judge', 'head', 'spotter', 'announcer')),
  pin_hash text,                      -- hashed 6-digit PIN, shown once on the printable card
  qr_token_hash text,                 -- sha-256 of a single-use QR token
  qr_token_expires_at timestamptz,
  locked boolean not null default false, -- true: a PIN can no longer rebind this seat to another phone
  auth_user_id uuid references auth.users on delete set null,
  bound_at timestamptz,
  device_label text,
  active boolean not null default true,
  scores boolean not null default false, -- convenience flag; scoring rights come from panel_members
  spotter_assignment jsonb,
  status text not null default 'active' check (status in ('active', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.panels (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.panel_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  panel_id uuid not null references public.panels on delete cascade,
  judge_seat_id uuid not null references public.judge_seats on delete cascade,
  seat_no int not null check (seat_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (panel_id, judge_seat_id),
  unique (panel_id, seat_no)
);

-- ---------------------------------------------------------------- divisions, riders, entries
create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  sort_order int not null default 0,
  scoring_model_id uuid references public.scoring_models,
  scoring_overrides jsonb not null default '{}', -- deep-merge object over the model, e.g. {"heat":{"maxAttemptsPerRider":5}}
  format_template_id uuid references public.format_templates,
  format_params jsonb not null default '{}',
  panel_id uuid references public.panels on delete set null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'running', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.riders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  first_name text not null,
  last_name text not null,
  nationality text,
  dob date,
  email text,
  phone text,
  sponsor text,
  woo_id text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  division_id uuid not null references public.divisions on delete cascade,
  rider_id uuid not null references public.riders,
  seed int,
  status text not null default 'registered' check (status in ('registered', 'confirmed', 'withdrawn', 'no_show')),
  source text not null default 'manual' check (source in ('self', 'import', 'manual')),
  paid boolean not null default false,
  consent_at timestamptz,
  identifiers jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, rider_id)
);

-- ---------------------------------------------------------------- ladder
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  division_id uuid not null references public.divisions on delete cascade,
  sort_order int not null default 0,
  name text not null,
  short_name text,
  spec jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.heats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,  -- filled from the round by trigger
  division_id uuid not null references public.divisions on delete cascade, -- filled from the round by trigger
  round_id uuid not null references public.rounds on delete cascade,
  number int not null,
  number_suffix text,                 -- e.g. "R" for a re-run
  status text not null default 'scheduled' check (status in ('scheduled', 'running', 'paused', 'ended', 'under_review', 'published', 'cancelled')),
  duration_sec int not null default 600 check (duration_sec > 0),
  started_at timestamptz,             -- server time; only the state-machine trigger sets these
  paused_at timestamptz,
  paused_total_sec int not null default 0,
  ended_at timestamptz,
  published_at timestamptz,
  flag_out jsonb,
  manual_override boolean not null default false,
  live_rev int not null default 0,    -- bumped by trigger on any attempt/score/impression/penalty/slot change
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.heat_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  heat_id uuid not null references public.heats on delete cascade,
  position int not null,
  entry_id uuid references public.entries on delete set null,
  vest_colour text,
  source jsonb,
  place int,
  total numeric(6,2),                 -- written by the server at publish only, never provisional values
  breakdown jsonb,
  modifier text check (modifier in ('DNS', 'DNF', 'DSQ')),
  flagged_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (heat_id, position)
);

-- ---------------------------------------------------------------- attempts and scores
create table public.trick_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  heat_id uuid not null references public.heats on delete cascade,
  entry_id uuid not null references public.entries,
  seq int not null,
  client_key uuid not null unique,    -- idempotency key for retries from the phone queue
  direction text check (direction in ('left', 'right')),
  category_key text,
  trick_name text,
  trick_parts jsonb not null default '{}',
  status text not null check (status in ('landed', 'crashed')),
  height_m numeric(5,2),
  created_by_seat uuid references public.judge_seats on delete set null,
  input_method text not null default 'builder' check (input_method in ('builder', 'text', 'speech')),
  raw_text text,
  deleted_at timestamptz,
  deleted_by uuid,
  possible_duplicate_of uuid references public.trick_attempts on delete set null,
  video_ts numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (heat_id, entry_id, seq)
);

create table public.trick_scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  heat_id uuid not null references public.heats on delete cascade,   -- filled by trigger
  attempt_id uuid not null references public.trick_attempts on delete cascade,
  judge_seat_id uuid not null references public.judge_seats,
  criteria jsonb not null default '{}',
  score numeric(5,2) check (score >= 0),
  missed boolean not null default false,
  flag text check (flag in ('crash', 'wrong_rider', 'duplicate', 'other')),
  client_key uuid not null unique,
  client_rev bigint not null default 0, -- newer edits win; late retries of older edits are ignored
  version int not null default 1,
  edited_by uuid,
  edit_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, judge_seat_id),
  check ((missed and score is null) or (not missed and score is not null))
);

create table public.impression_scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  heat_id uuid not null references public.heats on delete cascade,
  entry_id uuid not null references public.entries,
  judge_seat_id uuid not null references public.judge_seats,
  value numeric(5,2) not null check (value >= 0),
  client_key uuid not null unique,
  client_rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (heat_id, entry_id, judge_seat_id)
);

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  heat_id uuid not null references public.heats on delete cascade,
  entry_id uuid not null references public.entries,
  type text not null check (type in ('INT', 'other')),
  value jsonb not null default '{}',
  reason text,
  issued_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only: no updated_at, triggers reject UPDATE and DELETE.
create table public.heat_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled by trigger
  heat_id uuid not null references public.heats on delete cascade,
  entry_id uuid not null references public.entries,
  place int,
  total numeric(6,2),
  percent numeric(5,2),
  breakdown jsonb,
  published_at timestamptz not null default now(),
  version int not null default 1,
  created_at timestamptz not null default now(),
  unique (heat_id, entry_id, version)
);

-- ---------------------------------------------------------------- timetable and wind
create table public.schedule_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  day date not null,
  name text not null,
  items jsonb not null default '[]',
  anchors jsonb not null default '{}',
  actual_starts jsonb not null default '{}',
  hold jsonb,
  defaults jsonb not null default '{}',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wind_calls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  status text not null check (status in ('red', 'amber', 'green')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit and join bookkeeping
-- Append-only. event_id has no foreign key on purpose: the trail outlives what it describes.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  actor_user_id uuid,
  actor_seat_id uuid,
  action text not null,
  table_name text not null,
  row_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  at timestamptz not null default now()
);

-- Service-only: failed/successful join attempts, for rate limiting.
create table public.join_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  ip text not null,
  seat_id uuid,
  ok boolean not null,
  at timestamptz not null default now()
);
