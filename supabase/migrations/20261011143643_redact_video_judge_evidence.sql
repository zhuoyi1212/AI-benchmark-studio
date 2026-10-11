-- Video OCR/ASR can reveal tool watermarks. Redact known project identities
-- inside the trusted database boundary without returning the names/mapping.
create function public.redact_video_judge_evidence(
  p_judge_run_id uuid,
  p_test_case_id uuid,
  p_content text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  token text;
  output text := p_content;
  token_position integer;
  search_from integer;
begin
  select run.project_id into v_project_id
  from public.judge_runs run
  join public.test_cases test_case on test_case.protocol_id = run.protocol_id
  join public.protocols protocol on protocol.id = run.protocol_id
  join public.projects project on project.id = run.project_id
  where run.id = p_judge_run_id and test_case.id = p_test_case_id
    and run.status = 'running' and protocol.status = 'locked'
    and project.deleted_at is null;
  if v_project_id is null then
    raise exception 'Video evidence requires an active locked JudgeRun and matching TestCase';
  end if;
  if p_content is null or pg_catalog.octet_length(p_content) > 2000000 then
    raise exception 'Video evidence text is missing or exceeds the limit';
  end if;
  for token in
    select distinct identity_token from (
      select product.name as identity_token
      from public.project_products link join public.products product on product.id = link.product_id
      where link.project_id = v_project_id
      union all
      select product.official_url from public.project_products link join public.products product on product.id = link.product_id
      where link.project_id = v_project_id
      union all
      select pg_catalog.regexp_replace(pg_catalog.split_part(pg_catalog.regexp_replace(product.official_url, '^https?://', '', 'i'), '/', 1), '^www\.', '', 'i')
      from public.project_products link join public.products product on product.id = link.product_id
      where link.project_id = v_project_id
    ) identities
    where pg_catalog.char_length(identity_token) >= 2
    order by identity_token
  loop
    -- Literal case-insensitive replacement; names are never regex programs.
    search_from := 1;
    token_position := pg_catalog.strpos(pg_catalog.lower(output), pg_catalog.lower(token));
    while token_position > 0 loop
      output := pg_catalog.substr(output, 1, token_position - 1) || '[…]' || pg_catalog.substr(output, token_position + pg_catalog.char_length(token));
      search_from := token_position + pg_catalog.char_length('[…]');
      token_position := pg_catalog.strpos(pg_catalog.lower(pg_catalog.substr(output, search_from)), pg_catalog.lower(token));
      if token_position > 0 then token_position := token_position + search_from - 1; end if;
    end loop;
  end loop;
  return output;
end;
$$;

revoke all on function public.redact_video_judge_evidence(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.redact_video_judge_evidence(uuid, uuid, text) to service_role;
comment on function public.redact_video_judge_evidence(uuid, uuid, text) is 'Server-only video/screenshot/transcript identity redaction before Blind Judge. Does not change original artifacts or stored scores.';
