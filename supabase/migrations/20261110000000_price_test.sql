-- Sprint 3 price test, a fake door: nothing is ever charged. price_arm is the arm id from
-- src/lib/domain/pricing.ts shown on the start form; price_choice is Buy or "Just the free first
-- letter"; price_ok_to_ask is the optional "Tell me when paid plans open" box, only after Buy.
-- Null for cases created before the test. No RLS or view changes needed.
alter table public.cases
  add column price_arm text,
  add column price_choice text check (price_choice in ('buy', 'free')),
  add column price_ok_to_ask boolean check (price_ok_to_ask is null or price_choice = 'buy');
