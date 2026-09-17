-- Allow draft versions to be deleted while keeping submitted versions immutable.
-- PostgreSQL exposes TG_OP as the uppercase operation name.
create or replace function public.prevent_submitted_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'submitted' then
    raise exception 'Submitted review versions are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
