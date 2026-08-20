alter table public.test_artifacts
  drop constraint if exists test_artifacts_kind_check;

alter table public.test_artifacts
  add constraint test_artifacts_kind_check
  check (kind in ('image', 'pdf', 'text', 'video'));
