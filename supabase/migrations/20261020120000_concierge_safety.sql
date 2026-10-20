-- Concierge safety and measurement fixes from review.

alter table public.messages
  add column claimed_at timestamptz,     -- a teammate opened it to send (so a stale page can't send it twice)
  add column withdrawn_at timestamptz,   -- approved but never sent: the tenant paused, switched, or a reply changed the plan
  add column classified_at timestamptz;  -- when someone decided what this reply meant (when the next step became ready)

alter table public.cases
  add column send_mode_chosen boolean not null default false;  -- this case was offered the who-sends choice

-- At most one approved-but-unsent message per case.
create unique index messages_one_pending_per_case on public.messages (case_id)
  where direction = 'outgoing' and approved_at is not null and sent_at is null and withdrawn_at is null;

-- The send queue skips withdrawn messages and paused cases.
create or replace view public.messages_to_send as
  select m.id, c.code, c.tenant_name, c.tenant_email, c.mgmt_name, c.mgmt_email, m.step, m.subject,
         m.approved_at
  from public.messages m
  join public.cases c on c.id = m.case_id
  where m.direction = 'outgoing' and m.approved_at is not null and m.sent_at is null
    and m.withdrawn_at is null and c.paused_at is null and not c.is_test
  order by m.approved_at;

alter view public.messages_to_send set (security_invoker = on);
