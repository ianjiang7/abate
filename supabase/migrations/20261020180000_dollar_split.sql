-- Hypothesis 1 split: half of cases get the dollar estimate in their first notice, assigned so the
-- groups stay balanced within each sender type. Null for cases created before the split.
alter table public.cases add column dollar_in_notice boolean;
