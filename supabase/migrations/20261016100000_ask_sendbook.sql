-- Ask Sendbook: the in-product assistant.
--   * ask_log: every question and answer (organisation, user or seat, route, question, answer, tokens, model, cost estimate). Written by the server only (the
--     service key); readable by the platform owner only. Nobody can change a row except the rating the server sets when the person presses a thumb.
--   * organisations.ask_monthly_budget: the organisation's monthly budget in input tokens at their billed weight (default 2 000 000; 0 switches Ask off for
--     that organisation). Set by the platform owner with admin_set_ask_budget (audited).
--   * ask_usage(org): this month's use against the budget, for the organisation's own members and the platform admins.
--   * feedback_notes: a new tag 'ask' (the "Was this right?" thumbs) and a new author role 'official' (a PIN seat's thumbs, written by the server).

alter table public.organisations
  add column if not exists ask_monthly_budget bigint not null default 2000000 check (ask_monthly_budget >= 0);

create table public.ask_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations on delete cascade, -- null = the platform owner asking from the admin screens
  event_id uuid references public.events on delete set null,
  user_id uuid references auth.users on delete set null,                  -- the login, or the anonymous session of a PIN seat
  seat_id uuid references public.judge_seats on delete set null,
  role text not null check (role in ('owner', 'staff', 'organiser', 'head', 'judge', 'spotter', 'announcer', 'visitor')),
  route text not null check (char_length(route) between 1 and 300),
  question text not null check (char_length(question) between 1 and 2000),
  answer text not null default '' check (char_length(answer) <= 20000),
  status text not null default 'answered' check (status in ('answered', 'failed', 'paused', 'limited', 'refused')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  budget_tokens integer not null default 0,     -- what this answer counts against the monthly budget (input at billed weight)
  cost_usd numeric(10, 6) not null default 0,   -- estimate from the list prices
  pages text[] not null default '{}',           -- the manual pages sent with the question
  cited text,                                   -- the /help link the answer cited
  context jsonb not null default '{}',          -- the live context as sent (already scrubbed)
  ip_hash text,                                 -- public questions only (ASK_SENDBOOK_PUBLIC=1): for the per-address limit
  rating text check (rating in ('up', 'down')),
  created_at timestamptz not null default now()
);
create index on public.ask_log (organisation_id, created_at);
create index on public.ask_log (user_id, created_at);
create index on public.ask_log (ip_hash, created_at);
create index on public.ask_log (event_id);
create index on public.ask_log (seat_id);
create index on public.ask_log (created_at desc);

alter table public.ask_log enable row level security;
revoke all on public.ask_log from anon, authenticated;
grant select on public.ask_log to authenticated;
create policy owner_reads on public.ask_log for select to authenticated using (private.is_platform_owner());

-- this month's use of an organisation's budget (from the 1st, 00:00 UTC)
create or replace function public.ask_usage(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_limit bigint; v_used bigint; v_questions integer;
begin
  if not (private.is_org_member(p_org) or private.is_platform_admin()) then raise exception 'NOT_ALLOWED'; end if;
  select ask_monthly_budget into v_limit from public.organisations where id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  select coalesce(sum(budget_tokens), 0), count(*) filter (where status = 'answered') into v_used, v_questions
  from public.ask_log where organisation_id = p_org and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  return jsonb_build_object('used', v_used, 'limit', v_limit, 'questions', v_questions);
end $$;
revoke all on function public.ask_usage from public, anon, authenticated;
grant execute on function public.ask_usage to authenticated;

create or replace function public.admin_set_ask_budget(p_org uuid, p_tokens bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if p_tokens is null or p_tokens < 0 or p_tokens > 1000000000 then raise exception 'BUDGET_INVALID'; end if;
  select ask_monthly_budget into v_old from public.organisations where id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.organisations set ask_monthly_budget = p_tokens where id = p_org;
  perform private.platform_audit('ask_budget_changed', p_org, 'organisations', p_org, jsonb_build_object('ask_monthly_budget', v_old), jsonb_build_object('ask_monthly_budget', p_tokens), null);
end $$;
revoke all on function public.admin_set_ask_budget from public, anon, authenticated;
grant execute on function public.admin_set_ask_budget to authenticated;

-- the thumbs write a feedback note tagged 'ask'; a PIN seat's note is written by the server with the role 'official'
alter table public.feedback_notes drop constraint if exists feedback_notes_tag_check;
alter table public.feedback_notes add constraint feedback_notes_tag_check check (tag in ('bug', 'wording', 'layout', 'new_rule', 'idea', 'ask'));
alter table public.feedback_notes drop constraint if exists feedback_notes_author_role_check;
alter table public.feedback_notes add constraint feedback_notes_author_role_check check (author_role in ('owner', 'staff', 'organiser', 'official'));
