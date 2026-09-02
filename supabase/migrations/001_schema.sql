-- Additive foundation schema. Legacy workbooks are intentionally not referenced or imported.

create table if not exists public.monitoring_configurations (
  id text primary key,
  lot_name text not null,
  crop_name text not null,
  bed_count integer not null check (bed_count > 0),
  plants_per_bed integer not null check (plants_per_bed > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.organisms (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.configuration_organisms (
  configuration_id text not null references public.monitoring_configurations(id),
  organism_id text not null references public.organisms(id),
  primary key (configuration_id, organism_id)
);

create table if not exists public.beds (
  id text primary key,
  configuration_id text not null references public.monitoring_configurations(id),
  bed_number integer not null check (bed_number > 0),
  unique (configuration_id, bed_number)
);

create table if not exists public.plants (
  id text primary key,
  bed_id text not null references public.beds(id),
  plant_number integer not null check (plant_number > 0),
  unique (bed_id, plant_number)
);

create table if not exists public.reviews (
  id text primary key,
  configuration_id text not null references public.monitoring_configurations(id),
  review_week date not null,
  review_date date not null,
  observer_id text not null,
  review_slot smallint not null check (review_slot in (1, 2)),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  current_version integer not null default 1 check (current_version > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists reviews_one_submitted_slot
  on public.reviews (configuration_id, review_week, review_slot)
  where status = 'submitted';

create table if not exists public.review_versions (
  review_id text not null references public.reviews(id),
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'submitted')),
  correction_of_version integer,
  correction_reason text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (review_id, version),
  foreign key (review_id, correction_of_version) references public.review_versions(review_id, version),
  check ((status = 'draft' and submitted_at is null) or status = 'submitted'),
  check ((correction_of_version is null and correction_reason is null) or
         (correction_of_version is not null and length(trim(correction_reason)) > 0))
);

create table if not exists public.observations (
  review_id text not null,
  version integer not null,
  plant_id text not null references public.plants(id),
  organism_id text not null references public.organisms(id),
  severity smallint not null check (severity between 0 and 3),
  primary key (review_id, version, plant_id, organism_id),
  foreign key (review_id, version) references public.review_versions(review_id, version)
);

create table if not exists public.metrics (
  id text primary key,
  review_id text not null,
  version integer not null,
  organism_id text not null references public.organisms(id),
  grain text not null check (grain in ('review', 'bed', 'crop', 'configuration')),
  incidence_numerator integer not null check (incidence_numerator >= 0),
  incidence_denominator integer not null check (incidence_denominator > 0),
  severity_numerator integer not null check (severity_numerator >= 0),
  severity_denominator integer not null check (severity_denominator > 0),
  formula_version text not null check (formula_version = 'metrics.v1'),
  incidence_percent numeric not null,
  severity_percent numeric not null,
  calculated_at timestamptz not null default now(),
  unique (review_id, version, organism_id, grain),
  foreign key (review_id, version) references public.review_versions(review_id, version)
);

create index if not exists reviews_configuration_week on public.reviews (configuration_id, review_week);
create index if not exists observations_organism on public.observations (organism_id, review_id, version);
create index if not exists metrics_review on public.metrics (review_id, version, grain);

create or replace function public.prevent_submitted_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'submitted' then
    raise exception 'Submitted review versions are immutable';
  end if;
  if tg_op = 'delete' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists review_versions_immutable on public.review_versions;
create trigger review_versions_immutable
  before update or delete on public.review_versions
  for each row execute function public.prevent_submitted_version_mutation();

create or replace function public.prevent_submitted_observation_mutation()
returns trigger
language plpgsql
as $$
declare
  target_review_id text;
  target_version integer;
begin
  if tg_op = 'delete' then
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
  if tg_op = 'delete' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists observations_immutable on public.observations;
create trigger observations_immutable
  before insert or update or delete on public.observations
  for each row execute function public.prevent_submitted_observation_mutation();

create or replace function public.prevent_metric_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Derived metrics are immutable provenance records';
end;
$$;

drop trigger if exists metrics_immutable on public.metrics;
create trigger metrics_immutable
  before update or delete on public.metrics
  for each row execute function public.prevent_metric_mutation();
