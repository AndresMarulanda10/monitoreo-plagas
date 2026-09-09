-- Split review slots by data-entry area without changing the shared catalog.
-- Rows created before area support remain explicit legacy records for combined reporting.
alter table public.reviews add column if not exists area text;

update public.reviews
set area = 'legacy'
where area is null;

alter table public.reviews alter column area set default 'legacy';
alter table public.reviews alter column area set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and conname = 'reviews_area_check'
  ) then
    alter table public.reviews
      add constraint reviews_area_check check (area in ('microbiology', 'entomology', 'legacy'));
  end if;
end;
$$;

drop index if exists public.reviews_one_slot;
drop index if exists public.reviews_one_submitted_slot;

create unique index if not exists reviews_one_area_slot
  on public.reviews (area, configuration_id, review_week, review_slot);

create index if not exists reviews_area on public.reviews (area, review_date);
