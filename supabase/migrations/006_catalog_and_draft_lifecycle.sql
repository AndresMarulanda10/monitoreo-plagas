-- Extend the shared catalog without removing or rewriting existing observations.

update public.monitoring_configurations
set bed_count = 3, plants_per_bed = 4
where id = 'lot-g-blueberry'
  and (bed_count, plants_per_bed) <> (3, 4);

insert into public.monitoring_configurations (id, lot_name, crop_name, bed_count, plants_per_bed)
values
  ('lot-e-kale-liso', 'Lote E', 'Kale liso', 7, 2),
  ('lot-e-kale-crespo', 'Lote E', 'Kale crespo', 7, 2),
  ('lot-e-kale-crespo-morado', 'Lote E', 'Kale crespo morado', 7, 2)
on conflict (id) do update
set lot_name = excluded.lot_name,
    crop_name = excluded.crop_name,
    bed_count = excluded.bed_count,
    plants_per_bed = excluded.plants_per_bed;

insert into public.beds (id, configuration_id, bed_number)
select configuration.id || '-bed-' || numbers.number, configuration.id, numbers.number
from public.monitoring_configurations as configuration
cross join lateral generate_series(1, configuration.bed_count) as numbers(number)
where configuration.id in ('lot-g-blueberry', 'lot-e-kale-liso', 'lot-e-kale-crespo', 'lot-e-kale-crespo-morado')
on conflict (id) do nothing;

insert into public.plants (id, bed_id, plant_number)
select bed.id || '-plant-' || numbers.number, bed.id, numbers.number
from public.beds as bed
join public.monitoring_configurations as configuration on configuration.id = bed.configuration_id
cross join lateral generate_series(1, configuration.plants_per_bed) as numbers(number)
where configuration.id in ('lot-g-blueberry', 'lot-e-kale-liso', 'lot-e-kale-crespo', 'lot-e-kale-crespo-morado')
on conflict (id) do nothing;

insert into public.configuration_organisms (configuration_id, organism_id)
select configuration.id, organism.id
from public.monitoring_configurations as configuration
cross join public.organisms as organism
where configuration.id in ('lot-e-kale-liso', 'lot-e-kale-crespo', 'lot-e-kale-crespo-morado')
on conflict (configuration_id, organism_id) do nothing;

-- Draft deletion is one owned, atomic operation. Submitted versions remain immutable.
create or replace function public.delete_review_draft(p_review_id text, p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.reviews%rowtype;
begin
  select * into target from public.reviews where id = p_review_id for update;
  if not found then
    raise exception 'review not found';
  end if;
  if target.observer_id <> p_user_id then
    raise exception 'review is not available to this user';
  end if;
  if target.status <> 'draft' then
    raise exception 'submitted review is immutable';
  end if;

  delete from public.observations where review_id = p_review_id;
  delete from public.review_versions where review_id = p_review_id;
  delete from public.reviews where id = p_review_id;
end;
$$;

revoke all on function public.delete_review_draft(text, text) from public;
