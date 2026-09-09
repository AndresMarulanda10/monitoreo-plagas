-- A weekly slot is unique regardless of whether its review is still a draft.
-- Existing duplicate rows must be resolved before applying this migration.
create unique index if not exists reviews_one_slot
  on public.reviews (configuration_id, review_week, review_slot);
