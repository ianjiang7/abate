-- Whether the tenant had already told management before starting the case. When they hadn't
-- (told_before = false), the first notice is the first report: the estimate's clock starts the day
-- it's sent, first_reported_on holds the day the case started, and first_reported_via is "email".
-- These cases stay out of the with/without-$ comparison (dollar_in_notice is null).
alter table public.cases add column told_before boolean not null default true;
