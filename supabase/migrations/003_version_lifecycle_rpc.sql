-- The API supplies validated JSON; these functions keep each submitted version atomic.

create or replace function public.submit_review_version(
  p_review_id text,
  p_user_id text,
  p_version integer,
  p_metrics jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.reviews%rowtype;
begin
  select * into target from public.reviews where id = p_review_id and observer_id = p_user_id for update;
  if not found or target.current_version <> p_version or target.status <> 'draft' then
    raise exception 'stale review version';
  end if;
  update public.review_versions
    set status = 'submitted', submitted_at = now()
    where review_id = p_review_id and version = p_version;
  update public.reviews set status = 'submitted' where id = p_review_id;
  insert into public.metrics (
    id, review_id, version, organism_id, grain, incidence_numerator, incidence_denominator,
    severity_numerator, severity_denominator, formula_version, incidence_percent, severity_percent, calculated_at
  )
  select md5(p_review_id || ':' || p_version || ':' || item.organism_id || ':' || item.grain),
    p_review_id, p_version, item.organism_id, item.grain, item.incidence_numerator, item.incidence_denominator,
    item.severity_numerator, item.severity_denominator, item.formula_version, item.incidence_percent, item.severity_percent,
    coalesce(item.calculated_at, now())
  from jsonb_to_recordset(p_metrics) as item(
    organism_id text, grain text, incidence_numerator integer, incidence_denominator integer,
    severity_numerator integer, severity_denominator integer, formula_version text,
    incidence_percent numeric, severity_percent numeric, calculated_at timestamptz
  );
end;
$$;

create or replace function public.create_review_correction(
  p_review_id text,
  p_user_id text,
  p_base_version integer,
  p_reason text,
  p_entries jsonb,
  p_metrics jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.reviews%rowtype;
  next_version integer;
begin
  select * into target from public.reviews where id = p_review_id and observer_id = p_user_id for update;
  if not found or target.current_version <> p_base_version or target.status <> 'submitted' then
    raise exception 'stale review version';
  end if;
  next_version := p_base_version + 1;
  insert into public.review_versions (review_id, version, status, correction_of_version, correction_reason, submitted_at)
  values (p_review_id, next_version, 'submitted', p_base_version, trim(p_reason), now());
  insert into public.observations (review_id, version, plant_id, organism_id, severity)
  select p_review_id, next_version, item.plant_id, item.organism_id, item.severity
  from jsonb_to_recordset(p_entries) as item(plant_id text, organism_id text, severity smallint);
  insert into public.metrics (
    id, review_id, version, organism_id, grain, incidence_numerator, incidence_denominator,
    severity_numerator, severity_denominator, formula_version, incidence_percent, severity_percent, calculated_at
  )
  select md5(p_review_id || ':' || next_version || ':' || item.organism_id || ':' || item.grain),
    p_review_id, next_version, item.organism_id, item.grain, item.incidence_numerator, item.incidence_denominator,
    item.severity_numerator, item.severity_denominator, item.formula_version, item.incidence_percent, item.severity_percent,
    coalesce(item.calculated_at, now())
  from jsonb_to_recordset(p_metrics) as item(
    organism_id text, grain text, incidence_numerator integer, incidence_denominator integer,
    severity_numerator integer, severity_denominator integer, formula_version text,
    incidence_percent numeric, severity_percent numeric, calculated_at timestamptz
  );
  update public.reviews set current_version = next_version where id = p_review_id;
end;
$$;

revoke all on function public.submit_review_version(text, text, integer, jsonb) from public;
revoke all on function public.create_review_correction(text, text, integer, text, jsonb, jsonb) from public;
