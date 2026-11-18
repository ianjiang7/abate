-- Run with the matching app release. Existing tenants retain full access, regardless of price choice.
begin;
alter table public.cases add column plan_tier text not null default 'full'
  check (plan_tier in ('free', 'full'));
alter table public.cases alter column plan_tier set default 'free';
alter table public.cases add column upgraded_at timestamptz;

-- Keep the previous mode in an event for historical analysis. This is a product migration,
-- not a tenant backing out of the original pilot.
insert into public.events (case_id, name, props)
select id, 'self_send_migration', jsonb_build_object('previous_send_mode', send_mode,
  'previously_paused', paused_at is not null, 'grandfathered_full', true)
from public.cases;

-- Withdraw ALL unsent approvals, including ones previously opened by a teammate.
update public.messages set withdrawn_at = now()
where direction = 'outgoing' and sent_at is null and approved_at is not null and withdrawn_at is null;
update public.cases set send_mode = 'self', paused_at = null;
alter table public.cases alter column send_mode set default 'self';
alter table public.cases add constraint cases_tenant_sends_only check (send_mode = 'self');
-- Clear stale queue hints; the application derives the current ladder from message history.
update public.cases set next_step = null, next_due_on = null where status = 'open';
commit;
