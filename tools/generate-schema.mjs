import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsPath = path.join(__dirname, '..', 'public', 'data', 'products.json');
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

function sqlStr(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sqlJson(j) {
  if (j == null) return "'[]'::jsonb";
  return "'" + JSON.stringify(j).replace(/'/g, "''") + "'::jsonb";
}

let out = `-- ====================================================================
-- VoltNest + Campus Circuit Database Schema for Supabase (PostgreSQL)
-- Run this entire script in Supabase Dashboard > SQL Editor > New Query
-- ====================================================================

-- Enable pgcrypto for UUIDs & hashing
create extension if not exists pgcrypto;

-- 1. PRODUCTS TABLE
create table if not exists public.products (
  id text primary key,
  name text not null check (char_length(name) between 1 and 140),
  category text not null default 'components',
  description text,
  sku text,
  price numeric(10,2) check (price is null or price >= 0),
  mrp numeric(10,2) check (mrp is null or mrp >= 0),
  stock integer check (stock is null or stock >= 0) default 0,
  specs jsonb not null default '[]'::jsonb,
  options jsonb not null default '[]'::jsonb,
  icon text not null default 'kit',
  image_url text not null default '',
  featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. STORE SETTINGS TABLE
create table if not exists public.store_settings (
  id text primary key default 'store',
  store_name text not null default 'VoltNest',
  tagline text default 'Electronic parts for students in Greater Noida. Order online, pay when you pick up.',
  phone text default '',
  whatsapp text default '',
  pickup_address text default 'Knowledge Park II, Greater Noida (near Knowledge Park II Metro Station)',
  pickup_hours text default 'Mon–Sat, 10:00 AM – 8:00 PM',
  delivery_enabled boolean not null default true,
  delivery_fee numeric(10,2) not null default 30,
  free_delivery_above numeric(10,2) not null default 500,
  min_order numeric(10,2) not null default 0,
  announcement text default 'Student discount active · Instant pickup available in Knowledge Park',
  areas jsonb not null default '["Knowledge Park I","Knowledge Park II","Knowledge Park III","Knowledge Park IV","Knowledge Park V","Alpha 1 / Alpha 2","Beta 1 / Beta 2","Gamma 1 / Gamma 2","Delta 1 / Delta 2 / Delta 3","Pari Chowk","Sharda University area","Galgotias University area","GL Bajaj / NIET / GNIOT area","Gautam Buddha University area","Techzone / Greater Noida West"]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seed default settings row if not present
insert into public.store_settings (id, store_name, tagline, phone, whatsapp, pickup_address, pickup_hours, delivery_enabled, delivery_fee, free_delivery_above, min_order, announcement)
values ('store', 'VoltNest', 'Electronic parts for students in Greater Noida. Order online, pay when you pick up.', '', '', 'Knowledge Park II, Greater Noida (near Knowledge Park II Metro Station)', 'Mon–Sat, 10:00 AM – 8:00 PM', true, 30, 500, 0, 'Student discount active · Instant pickup available in Knowledge Park')
on conflict (id) do nothing;

-- 3. STORE ADMINS TABLE (Maps to Supabase auth.users)
create table if not exists public.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 4. ORDERS TABLE
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null default ('ORD-' || upper(substr(md5(random()::text), 1, 5))),
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  phone text not null check (char_length(phone) between 8 and 30),
  email text,
  college text,
  fulfilment text not null check (lower(fulfilment) in ('pickup', 'delivery', 'local delivery')),
  area text,
  address text,
  notes text,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status text not null default 'new' check (status in ('new','pending','confirmed','ready','completed','cancelled')),
  owner_note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for high-speed queries
create index if not exists idx_products_active_sort on public.products (is_active, sort_order, name);
create index if not exists idx_products_category on public.products (category);
create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_order_code on public.orders (order_code);
create index if not exists idx_orders_phone on public.orders (phone);

-- Helper trigger for updated_at timestamps
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated_at on public.store_settings;
create trigger trg_settings_updated_at before update on public.store_settings for each row execute function public.set_updated_at();

-- Trigger: Automatically decrement stock when a new order is placed
create or replace function public.on_order_created()
returns trigger language plpgsql security definer as $$
declare
  item jsonb;
  prod_id text;
  qty integer;
begin
  for item in select * from jsonb_array_elements(new.items) loop
    prod_id := item->>'id';
    if prod_id is null then
      prod_id := item->>'productId';
    end if;
    qty := coalesce((item->>'qty')::integer, (item->>'quantity')::integer, 1);
    
    if prod_id is not null and qty > 0 then
      update public.products
      set stock = greatest(0, coalesce(stock, 0) - qty),
          updated_at = now()
      where id = prod_id;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_order_decrement_stock on public.orders;
create trigger trg_order_decrement_stock
after insert on public.orders
for each row execute function public.on_order_created();

-- Trigger: Restore stock if an order is cancelled
create or replace function public.on_order_cancelled()
returns trigger language plpgsql security definer as $$
declare
  item jsonb;
  prod_id text;
  qty integer;
begin
  if (old.status != 'cancelled' and new.status = 'cancelled') then
    for item in select * from jsonb_array_elements(new.items) loop
      prod_id := item->>'id';
      if prod_id is null then
        prod_id := item->>'productId';
      end if;
      qty := coalesce((item->>'qty')::integer, (item->>'quantity')::integer, 1);
      
      if prod_id is not null and qty > 0 then
        update public.products
        set stock = coalesce(stock, 0) + qty,
            updated_at = now()
        where id = prod_id;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_restore_stock on public.orders;
create trigger trg_order_restore_stock
after update on public.orders
for each row execute function public.on_order_cancelled();

-- 5. SECURE ORDER TRACKING RPC (Customer can query their order by code + phone without exposed select)
create or replace function public.track_order(p_code text, p_phone text)
returns jsonb language plpgsql security definer as $$
declare
  v_order record;
  v_phone_digits text;
begin
  v_phone_digits := right(regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g'), 10);
  
  if char_length(v_phone_digits) < 10 then
    return null;
  end if;

  select * into v_order from public.orders
  where (
    upper(order_code) = upper(trim(p_code))
    or id::text = lower(trim(p_code))
  )
  and right(regexp_replace(phone, '\\D', '', 'g'), 10) = v_phone_digits
  order by created_at desc
  limit 1;
  
  if not found then
    return null;
  end if;
  
  return jsonb_build_object(
    'code', v_order.order_code,
    'status', v_order.status,
    'name', v_order.customer_name,
    'method', lower(v_order.fulfilment),
    'area', coalesce(v_order.area, ''),
    'subtotal', v_order.subtotal,
    'delivery_fee', v_order.delivery_fee,
    'total', v_order.total,
    'items', v_order.items,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at
  );
end;
$$;

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
alter table public.products enable row level security;
alter table public.store_settings enable row level security;
alter table public.store_admins enable row level security;
alter table public.orders enable row level security;

-- Products RLS:
-- Public visitors can read active products. Authorized store admins have full CRUD.
drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products" on public.products
  for select to anon, authenticated
  using (is_active = true or exists (select 1 from public.store_admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products" on public.products
  for insert to authenticated
  with check (exists (select 1 from public.store_admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products" on public.products
  for update to authenticated
  using (exists (select 1 from public.store_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.store_admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products" on public.products
  for delete to authenticated
  using (exists (select 1 from public.store_admins a where a.user_id = auth.uid()));

-- Store Settings RLS:
drop policy if exists "Anyone can read store settings" on public.store_settings;
create policy "Anyone can read store settings" on public.store_settings
  for select to anon, authenticated
  using (true);

drop policy if exists "Admins can update store settings" on public.store_settings;
create policy "Admins can update store settings" on public.store_settings
  for update to authenticated
  using (exists (select 1 from public.store_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.store_admins a where a.user_id = auth.uid()));

-- Store Admins RLS:
drop policy if exists "Admins can read own membership" on public.store_admins;
create policy "Admins can read own membership" on public.store_admins
  for select to authenticated
  using (user_id = auth.uid());

-- Orders RLS:
-- Public can place orders. Only store admins can read/update all orders.
drop policy if exists "Anyone can submit orders" on public.orders;
create policy "Anyone can submit orders" on public.orders
  for insert to anon, authenticated
  with check (
    status in ('new', 'pending')
    and char_length(customer_name) between 1 and 120
    and char_length(phone) between 8 and 30
    and jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) between 1 and 100
  );

drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders" on public.orders
  for select to authenticated
  using (exists (select 1 from public.store_admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders" on public.orders
  for update to authenticated
  using (exists (select 1 from public.store_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.store_admins a where a.user_id = auth.uid()));

-- 7. SEED INITIAL 41 PRODUCTS (VoltNest catalogue)
insert into public.products (id, name, category, description, sku, price, mrp, stock, specs, options, icon, image_url, featured, is_active, sort_order)
values
`;

const rows = products.map((p) => {
  return `  (${sqlStr(p.id)}, ${sqlStr(p.name)}, ${sqlStr(p.category)}, ${sqlStr(p.description)}, ${sqlStr(p.id.toUpperCase())}, ${p.price ?? 'NULL'}, ${p.mrp ?? 'NULL'}, ${p.stock ?? 0}, ${sqlJson(p.specs)}, ${sqlJson(p.options)}, ${sqlStr(p.icon || 'kit')}, ${sqlStr(p.image_url || '')}, ${p.featured ? 'true' : 'false'}, ${p.active !== false ? 'true' : 'false'}, ${p.sort ?? 100})`;
});

out += rows.join(',\n') + '\non conflict (id) do update set\n  name = excluded.name,\n  category = excluded.category,\n  description = excluded.description,\n  price = excluded.price,\n  mrp = excluded.mrp,\n  stock = excluded.stock,\n  specs = excluded.specs,\n  options = excluded.options,\n  icon = excluded.icon,\n  image_url = excluded.image_url,\n  featured = excluded.featured,\n  is_active = excluded.is_active,\n  sort_order = excluded.sort_order;\n';

const schemaPath = path.join(__dirname, '..', 'schema.sql');
fs.writeFileSync(schemaPath, out, 'utf8');
console.log('Successfully wrote schema.sql at', schemaPath, 'with', products.length, 'products.');
