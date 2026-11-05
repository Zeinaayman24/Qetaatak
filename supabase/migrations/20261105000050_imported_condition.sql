-- Part conditions in the words shops use: مستعملة، جديدة أصلي، جديدة ماركة تانية، استيراد.
-- Adds «استيراد» (imported). used_clean stays valid for old offers but is no longer offered.
alter table public.quotes drop constraint quotes_condition_check;
alter table public.quotes add constraint quotes_condition_check
  check (condition in ('used_original', 'used_clean', 'new_aftermarket', 'new_original', 'imported'));
