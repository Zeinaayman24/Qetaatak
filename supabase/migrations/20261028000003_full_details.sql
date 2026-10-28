-- Fuller customer and shop details for safety and delivery.

-- customer (private: visible to the person, admins, and the shop they bought from)
alter table public.profiles
  add column email        text not null default '',
  add column country      text not null default 'مصر',
  add column governorate  text not null default '',
  add column street       text not null default '',
  add column building     text not null default '',
  add column floor        text not null default '',
  add column apartment    text not null default '',
  add column landmark     text not null default '',
  add column postal_code  text not null default '' check (postal_code = '' or postal_code ~ '^[0-9]{5}$');

-- shop, public part (customers see this before choosing)
alter table public.shops
  add column governorate     text not null default '',
  add column shop_type       text not null default 'used' check (shop_type in ('used', 'new', 'both')),
  add column specialties     text[] not null default '{}',
  add column offers_delivery boolean not null default false;

-- shop, private part (revealed after a customer chooses the shop)
alter table public.shop_private
  add column phone2              text not null default '',
  add column street              text not null default '',
  add column building            text not null default '',
  add column landmark            text not null default '',
  add column postal_code         text not null default '' check (postal_code = '' or postal_code ~ '^[0-9]{5}$'),
  add column commercial_register text not null default '';

-- a customer can only pick home delivery from a shop that delivers
create or replace function public.choose_quote(p_request uuid, p_quote uuid, p_mode text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_mode not in ('delivery', 'pickup') then raise exception 'bad mode'; end if;
  if p_mode = 'delivery' and not exists (
    select 1 from public.quotes q join public.shops s on s.id = q.shop_id where q.id = p_quote and s.offers_delivery
  ) then raise exception 'shop does not deliver'; end if;
  update public.requests r
     set status = 'chosen', chosen_quote_id = p_quote, delivery_mode = p_mode, chosen_at = now()
   where r.id = p_request and r.customer_id = auth.uid() and r.status = 'open'
     and exists (select 1 from public.quotes q where q.id = p_quote and q.request_id = p_request);
  if not found then raise exception 'cannot choose this quote'; end if;
end $$;
