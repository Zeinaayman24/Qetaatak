-- Lock the shops table's sensitive columns (change 1.35): exact location (lat, lng), storefront photo and internal notes
-- are no longer readable directly. Shops read their own row with my_shop(), the team with staff_shops(),
-- customers get names and photos through shop_cards() / shop_profile(), which hide them until allowed.
revoke select on public.shops from authenticated, anon;
revoke select on public.shops from authenticated, anon;
grant select (id, area, brands, status, created_at, governorate, shop_type, specialties, offers_delivery, fee_area, fee_city, fee_far,
              featured_until, hours, accepting, approved_at, submitted_at, public_until) on public.shops to authenticated;
