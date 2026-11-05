-- The customer can ask for installation when sending a part request, so shops that install price it in their offer.
alter table public.requests add column wants_install boolean not null default false;
