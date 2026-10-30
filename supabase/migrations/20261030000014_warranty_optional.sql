-- Most shops sell parts without a warranty: 0 now means "no warranty".
-- Every order still carries the "part must match the description" promise (handled in the app and by support).
alter table public.quotes drop constraint quotes_warranty_days_check;
alter table public.quotes add constraint quotes_warranty_days_check check (warranty_days in (0, 3, 7, 14, 30));
alter table public.quotes alter column warranty_days set default 0;
