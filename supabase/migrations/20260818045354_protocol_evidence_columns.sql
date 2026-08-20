alter table public.test_cases
  add column if not exists expected_output_types jsonb not null default '[]'::jsonb
    check (jsonb_typeof(expected_output_types) = 'array'),
  add column if not exists evidence_requirements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_requirements) = 'array');

comment on column public.test_cases.expected_output_types is
  'Protocol-declared expected output classes such as text, image, document, video, code, or mixed.';
comment on column public.test_cases.evidence_requirements is
  'Protocol-declared raw evidence the user should preserve for reliable scoring.';
