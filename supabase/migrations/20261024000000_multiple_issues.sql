-- A case can list several problems (no heat and mold, say). issue_types holds all of them, most
-- serious first. issue_type keeps the most serious one, which the estimate uses, so older views and
-- the table editor still show one problem per case.
alter table public.cases add column issue_types text[] not null default '{}';
update public.cases set issue_types = array[issue_type] where cardinality(issue_types) = 0;
