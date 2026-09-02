-- Canonical MVP catalog only. No values are imported from quarantined legacy files.

insert into public.monitoring_configurations (id, lot_name, crop_name, bed_count, plants_per_bed)
values
  ('hortisimulador-tomato', 'Hortisimulador', 'Tomato', 6, 4),
  ('lot-g-strawberry', 'Lot G', 'Strawberry', 15, 5),
  ('lot-g-blueberry', 'Lot G', 'Blueberry', 2, 4),
  ('lot-f-cucumber', 'Lot F', 'Cucumber', 2, 15),
  ('lot-f-tomato', 'Lot F', 'Tomato', 5, 15)
on conflict (id) do nothing;

insert into public.organisms (id, name)
values
  ('cladosporium', 'Cladosporium'),
  ('mildeo', 'Mildeo'),
  ('botrytis', 'Botrytis'),
  ('aphids', 'Aphids'),
  ('thrips', 'Thrips'),
  ('mites', 'Mites'),
  ('tuta', 'Tuta'),
  ('plutella', 'Plutella')
on conflict (id) do nothing;

insert into public.beds (id, configuration_id, bed_number)
select configuration.id || '-bed-' || numbers.number, configuration.id, numbers.number
from public.monitoring_configurations as configuration
cross join lateral generate_series(1, configuration.bed_count) as numbers(number)
on conflict (id) do nothing;

insert into public.plants (id, bed_id, plant_number)
select bed.id || '-plant-' || numbers.number, bed.id, numbers.number
from public.beds as bed
join public.monitoring_configurations as configuration on configuration.id = bed.configuration_id
cross join lateral generate_series(1, configuration.plants_per_bed) as numbers(number)
on conflict (id) do nothing;

insert into public.configuration_organisms (configuration_id, organism_id)
select configuration.id, organism.id
from public.monitoring_configurations as configuration
cross join public.organisms as organism
on conflict (configuration_id, organism_id) do nothing;
