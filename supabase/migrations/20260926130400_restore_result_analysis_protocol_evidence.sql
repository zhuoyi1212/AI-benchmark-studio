-- The preceding lifecycle update was already applied to the linked database
-- before its snapshot projection was aligned with the latest protocol schema.
-- Patch that deployed function forward without rewriting migration history.
do $$
declare
  original_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.begin_result_analysis(uuid, uuid)'::regprocedure)
  into original_definition;

  if position('''expectedOutputTypes''' in original_definition) > 0 then
    return;
  end if;

  corrected_definition := regexp_replace(
    original_definition,
    '(''prompt'', test_case\.prompt,[[:space:]]*)(''observationFocus'')',
    E'\\1''expectedOutputTypes'', test_case.expected_output_types,\n            ''evidenceRequirements'', test_case.evidence_requirements,\n            \\2'
  );

  if corrected_definition = original_definition then
    raise exception 'Unable to restore Result Analysis protocol evidence fields';
  end if;

  execute corrected_definition;
end;
$$;
