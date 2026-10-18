-- Abate MVP schema. All access goes through the server with the secret key, so every table has
-- row level security on and no policies: the public (anon) key can read or write nothing.

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,               -- long random secret in the private case link
  code text not null unique,                -- short code for the CC plus-address and invites
  created_at timestamptz not null default now(),
  is_test boolean not null default false,   -- rows created by automated tests

  -- Where
  address text not null,
  unit text,
  borough text,
  bbl text,
  bin text,

  -- What
  issue_type text not null,
  issue_description text,
  started_on date not null,
  first_reported_on date not null,
  first_reported_via text not null,
  prior_followups integer not null default 0,
  monthly_rent numeric(10, 2) not null,

  -- Who
  tenant_name text not null,
  tenant_contact text,                      -- phone or email, for teammates' nudges
  mgmt_name text,
  mgmt_email text,
  ai_consent boolean not null default false,
  invited_by_case_id uuid references public.cases (id) on delete set null,

  -- Progress (filled in by the app and by teammates)
  status text not null default 'open' check (status in ('open', 'fixed')),
  next_step text,
  next_due_on date,
  mgmt_first_replied_at timestamptz,
  repair_scheduled_for date,
  repair_scheduled_at timestamptz,
  repair_missed_at timestamptz,             -- tenant said a scheduled repair didn't happen
  fixed_on date,
  help_requested_at timestamptz,
  help_contact text
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  storage_path text not null,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  created_at timestamptz not null default now(),
  direction text not null check (direction in ('outgoing', 'incoming')),

  -- Outgoing follow-ups
  step text,
  subject text,
  body text,
  draft_body text,                          -- what the app drafted, before any tenant edits
  edited boolean,
  sent_at timestamptz,

  -- Incoming replies
  received_at timestamptz,
  logged_by text check (logged_by in ('tenant', 'team')),
  classification text,                      -- category the ladder uses (tenant corrections win)
  ai_classification text,                   -- what the agent originally said, for measuring it
  classification_summary text,
  classification_date date,
  reply_reference text,                     -- agent's factual sentence the next message may quote
  ai_source text,                           -- model id, or 'stand-in'
  team_verdict text check (team_verdict in ('correct', 'incorrect')),
  team_note text
);

create table public.events (
  id bigint generated always as identity primary key,
  case_id uuid references public.cases (id) on delete cascade,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.building_cache (
  bbl text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create index on public.photos (case_id);
create index on public.messages (case_id, created_at);
create index on public.events (case_id, created_at);
create index on public.events (name, created_at);
create index on public.cases (next_due_on) where status = 'open';

alter table public.cases enable row level security;
alter table public.photos enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
alter table public.building_cache enable row level security;

-- Teammates' to-do list in the Supabase table editor: open cases with a step due today or earlier
-- (New York time).
create view public.cases_due as
  select code, tenant_name, tenant_contact, address, unit, issue_type, next_step, next_due_on,
         created_at
  from public.cases
  where status = 'open'
    and not is_test
    and next_due_on <= (now() at time zone 'America/New_York')::date
  order by next_due_on, created_at;

-- Replies waiting for a teammate to check the agent's reading.
create view public.replies_to_check as
  select m.id, c.code, m.received_at, m.ai_classification, m.classification, m.classification_summary,
         m.classification_date, m.reply_reference, m.ai_source, m.body
  from public.messages m
  join public.cases c on c.id = m.case_id
  where m.direction = 'incoming' and m.team_verdict is null and not c.is_test
  order by m.received_at;

alter view public.cases_due set (security_invoker = on);
alter view public.replies_to_check set (security_invoker = on);

-- Private bucket for photos (and screenshots later). Files are served through short-lived signed
-- URLs created on the server.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
