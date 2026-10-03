-- Only active evaluation labels are unique. Historical/deleted rows remain unchanged.
-- The index covers INSERT and UPDATE atomically, including concurrent requests.
create unique index projects_active_name_unique
on public.projects (lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))))
where deleted_at is null;
