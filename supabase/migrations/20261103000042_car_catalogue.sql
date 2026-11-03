-- Car catalogue: makes and models managed from the management app, with the powertrain
-- (petrol, diesel, hybrid, plug-in hybrid, range-extender, electric) so a request says exactly which car.
-- Requests, cars and profiles keep the make/model as text (shops match on the Arabic make name),
-- and gain a powertrain. Old rows are untouched.

create table public.car_makes (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name_ar     text not null unique check (char_length(name_ar) between 1 and 40),
  name_en     text not null check (char_length(name_en) between 1 and 40),
  country     text not null default '',
  logo_url    text not null default '',
  home_rank   int check (home_rank is null or home_rank between 1 and 99),  -- shown on the home screen, in this order
  powertrains text[] not null default array['petrol']::text[],
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.car_models (
  id          uuid primary key default gen_random_uuid(),
  make_id     text not null references public.car_makes (id) on update cascade on delete cascade,
  name_ar     text not null check (char_length(name_ar) between 1 and 40),
  name_en     text not null default '' check (char_length(name_en) <= 40),
  year_from   int check (year_from is null or year_from between 1960 and 2100),
  year_to     int check (year_to is null or year_to between 1960 and 2100),
  powertrains text[] not null default array['petrol']::text[]
              check (powertrains <@ array['petrol','diesel','hev','phev','erev','ev']::text[] and cardinality(powertrains) > 0),
  sort        int not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (make_id, name_ar)
);
create index car_models_make_idx on public.car_models (make_id, sort);

alter table public.car_makes add constraint car_makes_powertrains_ok
  check (powertrains <@ array['petrol','diesel','hev','phev','erev','ev']::text[]);

alter table public.car_makes enable row level security;
alter table public.car_models enable row level security;
create policy car_makes_read on public.car_makes for select to anon, authenticated using (true);
create policy car_models_read on public.car_models for select to anon, authenticated using (true);
create policy car_makes_admin on public.car_makes for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy car_models_admin on public.car_models for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- the powertrain travels with the car into the request
alter table public.profiles add column car_powertrain text not null default ''
  check (car_powertrain in ('', 'petrol', 'diesel', 'hev', 'phev', 'erev', 'ev'));
alter table public.cars add column powertrain text not null default ''
  check (powertrain in ('', 'petrol', 'diesel', 'hev', 'phev', 'erev', 'ev'));
alter table public.requests add column powertrain text not null default ''
  check (powertrain in ('', 'petrol', 'diesel', 'hev', 'phev', 'erev', 'ev'));
alter table public.requests add column part_number text not null default '' check (char_length(part_number) <= 40);

-- brand logos: public to read, admins upload
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-logos', 'brand-logos', true, 524288, array['image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;
create policy brand_logos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-logos' and (select private.is_admin()));
create policy brand_logos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-logos' and (select private.is_admin()));
create policy brand_logos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-logos' and (select private.is_admin()));

-- cars customers typed by hand that the catalogue doesn't know yet (staff only)
create or replace function public.catalogue_misses()
returns table (make text, model text, requests bigint, last_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.car_make, r.car_model, count(*), max(r.created_at)
  from public.requests r
  where private.is_staff()
    and not exists (select 1 from public.car_models m join public.car_makes k on k.id = m.make_id
                    where k.name_ar = r.car_make and (m.name_ar = r.car_model or lower(m.name_en) = lower(r.car_model)))
  group by r.car_make, r.car_model
  order by count(*) desc, max(r.created_at) desc
  limit 200
$$;
revoke execute on function public.catalogue_misses() from public, anon;
grant execute on function public.catalogue_misses() to authenticated;

insert into public.car_makes (id, name_ar, name_en, country, home_rank, powertrains) values
  ('hyundai', 'هيونداي', 'Hyundai', 'كوريا', 1, array['petrol','diesel','hev','phev','ev']::text[]),
  ('toyota', 'تويوتا', 'Toyota', 'اليابان', 2, array['petrol','diesel','hev','phev','ev']::text[]),
  ('chevrolet', 'شيفروليه', 'Chevrolet', 'أمريكا', 3, array['petrol','diesel','ev']::text[]),
  ('nissan', 'نيسان', 'Nissan', 'اليابان', 4, array['petrol','diesel','hev','ev']::text[]),
  ('kia', 'كيا', 'Kia', 'كوريا', 5, array['petrol','diesel','hev','phev','ev']::text[]),
  ('fiat', 'فيات', 'Fiat', 'إيطاليا', 6, array['petrol','diesel','hev','ev']::text[]),
  ('mg', 'إم جي', 'MG', 'الصين', 7, array['petrol','hev','phev','ev']::text[]),
  ('byd', 'بي واي دي', 'BYD', 'الصين', 8, array['petrol','phev','ev']::text[]),
  ('chery', 'شيري', 'Chery', 'الصين', 9, array['petrol','phev','ev']::text[]),
  ('mitsubishi', 'ميتسوبيشي', 'Mitsubishi', 'اليابان', 10, array['petrol','diesel','phev']::text[]),
  ('peugeot', 'بيجو', 'Peugeot', 'فرنسا', 11, array['petrol','diesel','hev','phev','ev']::text[]),
  ('renault', 'رينو', 'Renault', 'فرنسا', 12, array['petrol','diesel','hev','ev']::text[]),
  ('skoda', 'سكودا', 'Skoda', 'التشيك', 13, array['petrol','diesel','phev','ev']::text[]),
  ('opel', 'أوبل', 'Opel', 'ألمانيا', 14, array['petrol','diesel','hev','phev','ev']::text[]),
  ('suzuki', 'سوزوكي', 'Suzuki', 'اليابان', 15, array['petrol','hev']::text[]),
  ('geely', 'جيلي', 'Geely', 'الصين', 16, array['petrol','hev','phev','ev']::text[]),
  ('daewoo', 'دايو', 'Daewoo', 'كوريا', 17, array['petrol']::text[]),
  ('mercedes', 'مرسيدس-بنز', 'Mercedes-Benz', 'ألمانيا', 18, array['petrol','diesel','hev','phev','ev']::text[]),
  ('bmw', 'بي إم دبليو', 'BMW', 'ألمانيا', 19, array['petrol','diesel','hev','phev','ev']::text[]),
  ('volkswagen', 'فولكس فاجن', 'Volkswagen', 'ألمانيا', 20, array['petrol','diesel','hev','phev','ev']::text[]),
  ('ford', 'فورد', 'Ford', 'أمريكا', null, array['petrol','diesel','hev','phev','ev']::text[]),
  ('honda', 'هوندا', 'Honda', 'اليابان', null, array['petrol','hev','ev']::text[]),
  ('jeep', 'جيب', 'Jeep', 'أمريكا', null, array['petrol','diesel','phev','ev']::text[]),
  ('citroen', 'ستروين', 'Citroën', 'فرنسا', null, array['petrol','diesel','hev','ev']::text[]),
  ('seat', 'سيات', 'Seat', 'إسبانيا', null, array['petrol','diesel','phev']::text[]),
  ('audi', 'أودي', 'Audi', 'ألمانيا', null, array['petrol','diesel','hev','phev','ev']::text[]),
  ('mazda', 'مازدا', 'Mazda', 'اليابان', null, array['petrol','diesel','hev','phev','ev']::text[]),
  ('subaru', 'سوبارو', 'Subaru', 'اليابان', null, array['petrol','hev','ev']::text[]),
  ('volvo', 'فولفو', 'Volvo', 'السويد', null, array['petrol','diesel','hev','phev','ev']::text[]),
  ('land-rover', 'لاند روفر', 'Land Rover', 'بريطانيا', null, array['petrol','diesel','hev','phev']::text[]),
  ('jaguar', 'جاكوار', 'Jaguar', 'بريطانيا', null, array['petrol','diesel','hev','ev']::text[]),
  ('lexus', 'لكزس', 'Lexus', 'اليابان', null, array['petrol','hev','phev','ev']::text[]),
  ('porsche', 'بورشه', 'Porsche', 'ألمانيا', null, array['petrol','hev','phev','ev']::text[]),
  ('avatr', 'أفاتر', 'AVATR', 'الصين', null, array['ev','erev']::text[]),
  ('zeekr', 'زيكر', 'ZEEKR', 'الصين', null, array['ev','phev']::text[]),
  ('xpeng', 'إكس بنج', 'XPENG', 'الصين', null, array['ev','erev']::text[]),
  ('nio', 'نيو', 'NIO', 'الصين', null, array['ev']::text[]),
  ('li-auto', 'لي أوتو', 'Li Auto', 'الصين', null, array['erev','ev']::text[]),
  ('deepal', 'ديبال', 'Deepal', 'الصين', null, array['ev','erev']::text[]),
  ('gac', 'جي إيه سي', 'GAC', 'الصين', null, array['petrol','hev','phev','ev']::text[]),
  ('gac-aion', 'جي إيه سي أيون', 'GAC AION', 'الصين', null, array['ev']::text[]),
  ('dongfeng', 'دونج فينج', 'Dongfeng', 'الصين', null, array['petrol','phev','ev']::text[]),
  ('hongqi', 'هونشي', 'Hongqi', 'الصين', null, array['petrol','hev','phev','ev']::text[]),
  ('leapmotor', 'ليب موتور', 'Leapmotor', 'الصين', null, array['ev','erev']::text[]),
  ('changan', 'شانجان', 'Changan', 'الصين', null, array['petrol','phev','ev','erev']::text[]),
  ('great-wall', 'جريت وول', 'Great Wall Motors', 'الصين', null, array['petrol','diesel','hev','phev']::text[]),
  ('ora', 'أورا', 'ORA', 'الصين', null, array['ev']::text[]),
  ('im', 'آي إم', 'IM Motors', 'الصين', null, array['ev','erev']::text[]),
  ('lynk-co', 'لينك آند كو', 'Lynk & Co', 'الصين', null, array['petrol','hev','phev','ev']::text[]),
  ('xiaomi', 'شاومي', 'Xiaomi Auto', 'الصين', null, array['ev','erev']::text[]),
  ('baic', 'بايك', 'BAIC', 'الصين', null, array['petrol','ev','erev']::text[]),
  ('jac', 'جاك', 'JAC', 'الصين', null, array['petrol','diesel','ev']::text[]),
  ('seres', 'سيريس', 'SERES', 'الصين', null, array['ev','erev']::text[]),
  ('jetour', 'جيتور', 'Jetour', 'الصين', null, array['petrol','phev','ev']::text[]),
  ('forthing', 'فورثينج', 'Forthing', 'الصين', null, array['petrol','phev','ev']::text[]),
  ('tank', 'تانك', 'Tank', 'الصين', null, array['petrol','diesel','hev','phev']::text[]),
  ('denza', 'دنزا', 'Denza', 'الصين', null, array['ev','phev']::text[]),
  ('tesla', 'تسلا', 'Tesla', 'أمريكا', null, array['ev']::text[]),
  ('polestar', 'بولستار', 'Polestar', 'السويد', null, array['ev']::text[]),
  ('lucid', 'لوسيد', 'Lucid', 'أمريكا', null, array['ev']::text[]),
  ('rivian', 'ريفيان', 'Rivian', 'أمريكا', null, array['ev']::text[]),
  ('vinfast', 'فين فاست', 'VinFast', 'فيتنام', null, array['ev']::text[])
on conflict (id) do nothing;

insert into public.car_models (make_id, name_ar, name_en, powertrains, sort) values
  ('hyundai', 'إلنترا', 'Elantra', array['petrol','hev']::text[], 1),
  ('hyundai', 'أكسنت', 'Accent', array['petrol']::text[], 2),
  ('hyundai', 'فيرنا', 'Verna', array['petrol']::text[], 3),
  ('hyundai', 'توسان', 'Tucson', array['petrol','diesel','hev','phev']::text[], 4),
  ('hyundai', 'كريتا', 'Creta', array['petrol']::text[], 5),
  ('hyundai', 'i10', 'i10', array['petrol']::text[], 6),
  ('hyundai', 'سانتا في', 'Santa Fe', array['petrol','diesel','hev','phev']::text[], 7),
  ('hyundai', 'ماتريكس', 'Matrix', array['petrol']::text[], 8),
  ('hyundai', 'كونا', 'Kona', array['petrol','hev','ev']::text[], 9),
  ('hyundai', 'أيونك ٥', 'IONIQ 5', array['ev']::text[], 10),
  ('toyota', 'كورولا', 'Corolla', array['petrol','hev']::text[], 1),
  ('toyota', 'ياريس', 'Yaris', array['petrol','hev']::text[], 2),
  ('toyota', 'فورتشنر', 'Fortuner', array['petrol','diesel']::text[], 3),
  ('toyota', 'لاند كروزر', 'Land Cruiser', array['petrol','diesel']::text[], 4),
  ('toyota', 'هايلوكس', 'Hilux', array['petrol','diesel']::text[], 5),
  ('toyota', 'راف ٤', 'RAV4', array['petrol','hev','phev']::text[], 6),
  ('toyota', 'سي إتش آر', 'C-HR', array['petrol','hev','phev']::text[], 7),
  ('toyota', 'كامري', 'Camry', array['petrol','hev']::text[], 8),
  ('toyota', 'راش', 'Rush', array['petrol']::text[], 9),
  ('toyota', 'بيلتا', 'Belta', array['petrol']::text[], 10),
  ('nissan', 'صني', 'Sunny', array['petrol']::text[], 1),
  ('nissan', 'سنترا', 'Sentra', array['petrol']::text[], 2),
  ('nissan', 'قشقاي', 'Qashqai', array['petrol','hev']::text[], 3),
  ('nissan', 'إكس تريل', 'X-Trail', array['petrol','hev']::text[], 4),
  ('nissan', 'جوك', 'Juke', array['petrol','hev']::text[], 5),
  ('nissan', 'ليف', 'Leaf', array['ev']::text[], 6),
  ('kia', 'سيراتو', 'Cerato', array['petrol']::text[], 1),
  ('kia', 'بيكانتو', 'Picanto', array['petrol']::text[], 2),
  ('kia', 'ريو', 'Rio', array['petrol']::text[], 3),
  ('kia', 'سبورتاج', 'Sportage', array['petrol','diesel','hev','phev']::text[], 4),
  ('kia', 'سورينتو', 'Sorento', array['petrol','diesel','hev','phev']::text[], 5),
  ('kia', 'بيجاس', 'Pegas', array['petrol']::text[], 6),
  ('kia', 'سول', 'Soul', array['petrol','ev']::text[], 7),
  ('kia', 'نيرو', 'Niro', array['hev','phev','ev']::text[], 8),
  ('kia', 'EV6', 'EV6', array['ev']::text[], 9),
  ('chevrolet', 'أوبترا', 'Optra', array['petrol']::text[], 1),
  ('chevrolet', 'أفيو', 'Aveo', array['petrol']::text[], 2),
  ('chevrolet', 'لانوس', 'Lanos', array['petrol']::text[], 3),
  ('chevrolet', 'كروز', 'Cruze', array['petrol']::text[], 4),
  ('chevrolet', 'كابتيفا', 'Captiva', array['petrol','diesel']::text[], 5),
  ('chevrolet', 'سبارك', 'Spark', array['petrol']::text[], 6),
  ('chevrolet', 'ماليبو', 'Malibu', array['petrol']::text[], 7),
  ('fiat', 'تيبو', 'Tipo', array['petrol','diesel']::text[], 1),
  ('fiat', '١٢٨', '128', array['petrol']::text[], 2),
  ('fiat', 'بونتو', 'Punto', array['petrol']::text[], 3),
  ('fiat', '٥٠٠', '500', array['petrol','hev','ev']::text[], 4),
  ('fiat', 'دوبلو', 'Doblo', array['petrol','diesel']::text[], 5),
  ('mg', 'MG5', 'MG5', array['petrol','ev']::text[], 1),
  ('mg', 'ZS', 'ZS', array['petrol','hev','ev']::text[], 2),
  ('mg', 'RX5', 'RX5', array['petrol','phev']::text[], 3),
  ('mg', 'HS', 'HS', array['petrol','phev']::text[], 4),
  ('mg', 'MG4', 'MG4', array['ev']::text[], 5),
  ('mg', 'MG6', 'MG6', array['petrol']::text[], 6),
  ('mg', 'One', 'One', array['petrol']::text[], 7),
  ('byd', 'F3', 'F3', array['petrol']::text[], 1),
  ('byd', 'أتو ٣', 'Atto 3', array['ev']::text[], 2),
  ('byd', 'دولفين', 'Dolphin', array['ev']::text[], 3),
  ('byd', 'سيل', 'Seal', array['ev']::text[], 4),
  ('byd', 'سونج بلس', 'Song Plus', array['phev','ev']::text[], 5),
  ('byd', 'هان', 'Han', array['phev','ev']::text[], 6),
  ('byd', 'تانج', 'Tang', array['phev','ev']::text[], 7),
  ('byd', 'تشين بلس', 'Qin Plus', array['phev','ev']::text[], 8),
  ('byd', 'سي جل', 'Seagull', array['ev']::text[], 9),
  ('byd', 'سيل يو', 'Seal U', array['phev','ev']::text[], 10),
  ('chery', 'تيجو ٣', 'Tiggo 3', array['petrol']::text[], 1),
  ('chery', 'تيجو ٤', 'Tiggo 4', array['petrol']::text[], 2),
  ('chery', 'تيجو ٧', 'Tiggo 7', array['petrol','phev']::text[], 3),
  ('chery', 'تيجو ٨', 'Tiggo 8', array['petrol','phev']::text[], 4),
  ('chery', 'أريزو ٥', 'Arrizo 5', array['petrol']::text[], 5),
  ('mitsubishi', 'لانسر', 'Lancer', array['petrol']::text[], 1),
  ('mitsubishi', 'باجيرو', 'Pajero', array['petrol','diesel']::text[], 2),
  ('mitsubishi', 'إكليبس كروس', 'Eclipse Cross', array['petrol','phev']::text[], 3),
  ('mitsubishi', 'أوتلاندر', 'Outlander', array['petrol','phev']::text[], 4),
  ('mitsubishi', 'أتراج', 'Attrage', array['petrol']::text[], 5),
  ('mitsubishi', 'إكسباندر', 'Xpander', array['petrol']::text[], 6),
  ('peugeot', '٣٠١', '301', array['petrol']::text[], 1),
  ('peugeot', '٢٠٨', '208', array['petrol','ev']::text[], 2),
  ('peugeot', '٢٠٠٨', '2008', array['petrol','ev']::text[], 3),
  ('peugeot', '٣٠٠٨', '3008', array['petrol','diesel','hev','phev','ev']::text[], 4),
  ('peugeot', '٥٠٠٨', '5008', array['petrol','diesel','hev','ev']::text[], 5),
  ('peugeot', '٥٠٨', '508', array['petrol','diesel','phev']::text[], 6),
  ('peugeot', '٤٠٥', '405', array['petrol']::text[], 7),
  ('peugeot', '٤٠٦', '406', array['petrol']::text[], 8),
  ('renault', 'لوجان', 'Logan', array['petrol']::text[], 1),
  ('renault', 'سانديرو', 'Sandero', array['petrol']::text[], 2),
  ('renault', 'داستر', 'Duster', array['petrol','diesel','hev']::text[], 3),
  ('renault', 'ميجان', 'Megane', array['petrol','diesel','ev']::text[], 4),
  ('renault', 'كادجار', 'Kadjar', array['petrol','diesel']::text[], 5),
  ('renault', 'فلوانس', 'Fluence', array['petrol']::text[], 6),
  ('renault', 'كليو', 'Clio', array['petrol','hev']::text[], 7),
  ('skoda', 'أوكتافيا', 'Octavia', array['petrol','diesel','phev']::text[], 1),
  ('skoda', 'فابيا', 'Fabia', array['petrol']::text[], 2),
  ('skoda', 'كودياك', 'Kodiaq', array['petrol','diesel','phev']::text[], 3),
  ('skoda', 'كاميك', 'Kamiq', array['petrol']::text[], 4),
  ('skoda', 'كاروك', 'Karoq', array['petrol','diesel']::text[], 5),
  ('skoda', 'سوبيرب', 'Superb', array['petrol','diesel','phev']::text[], 6),
  ('skoda', 'سكالا', 'Scala', array['petrol']::text[], 7),
  ('skoda', 'إنياك', 'Enyaq', array['ev']::text[], 8),
  ('opel', 'أسترا', 'Astra', array['petrol','diesel','phev','ev']::text[], 1),
  ('opel', 'كورسا', 'Corsa', array['petrol','ev']::text[], 2),
  ('opel', 'إنسيجنيا', 'Insignia', array['petrol','diesel']::text[], 3),
  ('opel', 'جراندلاند', 'Grandland', array['petrol','hev','phev','ev']::text[], 4),
  ('opel', 'كروسلاند', 'Crossland', array['petrol']::text[], 5),
  ('opel', 'موكا', 'Mokka', array['petrol','ev']::text[], 6),
  ('suzuki', 'سويفت', 'Swift', array['petrol','hev']::text[], 1),
  ('suzuki', 'ألتو', 'Alto', array['petrol']::text[], 2),
  ('suzuki', 'سياز', 'Ciaz', array['petrol']::text[], 3),
  ('suzuki', 'ديزاير', 'Dzire', array['petrol']::text[], 4),
  ('suzuki', 'فيتارا', 'Vitara', array['petrol','hev']::text[], 5),
  ('suzuki', 'إرتيجا', 'Ertiga', array['petrol']::text[], 6),
  ('suzuki', 'إس بريسو', 'S-Presso', array['petrol']::text[], 7),
  ('geely', 'إمجراند', 'Emgrand', array['petrol']::text[], 1),
  ('geely', 'كولراي', 'Coolray', array['petrol']::text[], 2),
  ('geely', 'أوكافانجو', 'Okavango', array['petrol']::text[], 3),
  ('geely', 'جيومتري سي', 'Geometry C', array['ev']::text[], 4),
  ('daewoo', 'لانوس', 'Lanos', array['petrol']::text[], 1),
  ('daewoo', 'نوبيرا', 'Nubira', array['petrol']::text[], 2),
  ('daewoo', 'سيلو', 'Cielo', array['petrol']::text[], 3),
  ('daewoo', 'ماتيز', 'Matiz', array['petrol']::text[], 4),
  ('mercedes', 'C-Class', 'C-Class', array['petrol','diesel','phev']::text[], 1),
  ('mercedes', 'E-Class', 'E-Class', array['petrol','diesel','phev']::text[], 2),
  ('mercedes', 'A-Class', 'A-Class', array['petrol','phev']::text[], 3),
  ('mercedes', 'GLC', 'GLC', array['petrol','diesel','phev']::text[], 4),
  ('mercedes', 'GLA', 'GLA', array['petrol','phev']::text[], 5),
  ('mercedes', 'EQA', 'EQA', array['ev']::text[], 6),
  ('mercedes', 'EQS', 'EQS', array['ev']::text[], 7),
  ('bmw', 'الفئة الثالثة', '3 Series', array['petrol','diesel','phev']::text[], 1),
  ('bmw', 'الفئة الخامسة', '5 Series', array['petrol','diesel','phev','ev']::text[], 2),
  ('bmw', 'X1', 'X1', array['petrol','diesel','phev','ev']::text[], 3),
  ('bmw', 'X3', 'X3', array['petrol','diesel','phev']::text[], 4),
  ('bmw', 'X5', 'X5', array['petrol','diesel','phev']::text[], 5),
  ('bmw', 'iX3', 'iX3', array['ev']::text[], 6),
  ('bmw', 'i4', 'i4', array['ev']::text[], 7),
  ('volkswagen', 'جولف', 'Golf', array['petrol','diesel','phev']::text[], 1),
  ('volkswagen', 'باسات', 'Passat', array['petrol','diesel','phev']::text[], 2),
  ('volkswagen', 'بولو', 'Polo', array['petrol']::text[], 3),
  ('volkswagen', 'جيتا', 'Jetta', array['petrol']::text[], 4),
  ('volkswagen', 'تيجوان', 'Tiguan', array['petrol','diesel','phev']::text[], 5),
  ('volkswagen', 'ID.4', 'ID.4', array['ev']::text[], 6),
  ('tesla', 'Model 3', 'Model 3', array['ev']::text[], 1),
  ('tesla', 'Model Y', 'Model Y', array['ev']::text[], 2),
  ('tesla', 'Model S', 'Model S', array['ev']::text[], 3),
  ('tesla', 'Model X', 'Model X', array['ev']::text[], 4)
on conflict do nothing;
