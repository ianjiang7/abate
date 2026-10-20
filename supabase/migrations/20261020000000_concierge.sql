-- Concierge pilot: the Abate team sends follow-ups on the tenant's behalf, with the tenant's
-- approval on each one. Tenants can still choose to send messages themselves.

alter table public.cases
  add column send_mode text not null default 'self' check (send_mode in ('abate', 'self')),
  add column send_authorized_at timestamptz,   -- tenant authorized Abate to email management for them
  add column tenant_email text,                -- copied on every message Abate sends
  add column paused_at timestamptz,            -- tenant paused Abate (hypothesis 2: did they back out?)
  add column pause_reason text;

alter table public.messages
  add column ready_on date,                    -- when this step became ready (outgoing)
  add column approved_at timestamptz,          -- tenant approved Abate sending it (outgoing, abate mode)
  add column sent_by text check (sent_by in ('team', 'tenant')),
  add column classified_by text check (classified_by in ('agent', 'team', 'tenant'));

-- Teammates' send queue: approved messages waiting to be sent from the team inbox.
create view public.messages_to_send as
  select m.id, c.code, c.tenant_name, c.tenant_email, c.mgmt_name, c.mgmt_email, m.step, m.subject,
         m.approved_at
  from public.messages m
  join public.cases c on c.id = m.case_id
  where m.direction = 'outgoing' and m.approved_at is not null and m.sent_at is null and not c.is_test
  order by m.approved_at;

alter view public.messages_to_send set (security_invoker = on);

-- The due list now also shows how each case is sent.
create or replace view public.cases_due as
  select code, tenant_name, tenant_contact, address, unit, issue_type, next_step, next_due_on,
         created_at, send_mode, tenant_email
  from public.cases
  where status = 'open'
    and not is_test
    and paused_at is null
    and next_due_on <= (now() at time zone 'America/New_York')::date
  order by next_due_on, created_at;

alter view public.cases_due set (security_invoker = on);
