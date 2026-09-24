-- Allow draft observations to be replaced or removed while keeping submitted
-- observations immutable. PostgreSQL exposes TG_OP as uppercase.
create or replace function public.prevent_submitted_observation_mutation()
returns trigger
language plpgsql
as $$
declare
  target_review_id text;
  target_version integer;
begin
  if tg_op = 'DELETE' then
    target_review_id := old.review_id;
    target_version := old.version;
  else
    target_review_id := new.review_id;
    target_version := new.version;
  end if;

  if exists (
    select 1 from public.review_versions
    where review_id = target_review_id
      and version = target_version
      and status = 'submitted'
  ) then
    raise exception 'Observations for submitted review versions are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
