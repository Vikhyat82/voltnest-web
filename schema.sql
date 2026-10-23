-- ====================================================================
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
  subcategory text,
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
  email text default 'support@voltnest.in',
  instagram text default 'voltnest.in',
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
insert into public.store_settings (id, store_name, tagline, phone, whatsapp, email, instagram, pickup_address, pickup_hours, delivery_enabled, delivery_fee, free_delivery_above, min_order, announcement)
values ('store', 'VoltNest', 'Electronic parts for students in Greater Noida. Order online, pay when you pick up.', '', '', 'support@voltnest.in', 'voltnest.in', 'Knowledge Park II, Greater Noida (near Knowledge Park II Metro Station)', 'Mon–Sat, 10:00 AM – 8:00 PM', true, 30, 500, 0, 'Student discount active · Instant pickup available in Knowledge Park')
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
  v_phone_digits := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  
  if char_length(v_phone_digits) < 10 then
    return null;
  end if;

  select * into v_order from public.orders
  where (
    upper(order_code) = upper(trim(p_code))
    or id::text = lower(trim(p_code))
  )
  and right(regexp_replace(phone, '\D', '', 'g'), 10) = v_phone_digits
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
  ('esp32-devkit', 'ESP32 DevKit V1 (30-pin)', 'boards', 'The go-to board for IoT projects: dual-core processor with built-in Wi-Fi and Bluetooth. Works with the Arduino IDE, MicroPython and ESP-IDF.', 'ESP32-DEVKIT', 549, 699, 25, '[{"k":"Processor","v":"Dual-core Xtensa LX6, up to 240 MHz"},{"k":"Wireless","v":"Wi-Fi 802.11 b/g/n + Bluetooth/BLE"},{"k":"Memory","v":"520 KB SRAM, 4 MB flash"},{"k":"Logic level","v":"3.3 V"},{"k":"USB","v":"Micro-USB (CP2102 / CH340)"}]'::jsonb, '[]'::jsonb, 'esp', '', true, true, 0),
  ('esp8266-nodemcu', 'ESP8266 NodeMCU', 'boards', 'Low-cost Wi-Fi board that is perfect for first IoT projects: web servers, MQTT, sensor dashboards and home automation.', 'ESP8266-NODEMCU', 329, 399, 30, '[{"k":"Processor","v":"Tensilica L106, 80/160 MHz"},{"k":"Wireless","v":"Wi-Fi 802.11 b/g/n"},{"k":"Flash","v":"4 MB"},{"k":"Logic level","v":"3.3 V"},{"k":"Analog input","v":"1 channel (0–1 V on chip, 3.3 V on board)"}]'::jsonb, '[]'::jsonb, 'esp', '', false, true, 1),
  ('esp32-c3-supermini', 'ESP32-C3 SuperMini', 'boards', 'Thumb-sized ESP32 with native USB-C, Wi-Fi and Bluetooth 5 (LE). Ideal for wearables, small sensor nodes and battery projects.', 'ESP32-C3-SUPERMINI', 299, 369, 20, '[{"k":"Processor","v":"RISC-V single core, 160 MHz"},{"k":"Wireless","v":"Wi-Fi 4 + Bluetooth 5 (LE)"},{"k":"Flash","v":"4 MB"},{"k":"Size","v":"approx. 22.5 × 18 mm"},{"k":"USB","v":"USB-C (native)"}]'::jsonb, '[]'::jsonb, 'mini', '', true, true, 2),
  ('arduino-uno-r3', 'Arduino Uno R3 (with USB cable)', 'boards', 'The classic learning board. 5 V logic, huge community and thousands of tutorials. Comes with a USB cable.', 'ARDUINO-UNO-R3', 449, 549, 20, '[{"k":"Microcontroller","v":"ATmega328P, 16 MHz"},{"k":"Digital I/O","v":"14 pins (6 PWM)"},{"k":"Analog inputs","v":"6"},{"k":"Logic level","v":"5 V"},{"k":"Input voltage","v":"7–12 V (barrel jack)"}]'::jsonb, '[]'::jsonb, 'uno', '', true, true, 3),
  ('breadboard-830', 'Breadboard 830 Tie-Points', 'prototyping', 'Full-size solderless breadboard with power rails. Build and change circuits without soldering.', 'BREADBOARD-830', 89, 120, 40, '[{"k":"Tie points","v":"830"},{"k":"Size","v":"approx. 165 × 55 mm"},{"k":"Rails","v":"4 power rails"}]'::jsonb, '[]'::jsonb, 'breadboard', '', false, true, 4),
  ('jumper-mm-40', 'Jumper Wires Male–Male (40 pcs)', 'prototyping', '20 cm colour-coded ribbon of male–male jumper wires for breadboard connections.', 'JUMPER-MM-40', 59, NULL, 60, '[{"k":"Quantity","v":"40 pcs"},{"k":"Length","v":"20 cm"},{"k":"Ends","v":"Male – Male"}]'::jsonb, '[]'::jsonb, 'wires', '', false, true, 5),
  ('jumper-mf-40', 'Jumper Wires Male–Female (40 pcs)', 'prototyping', 'Connect sensor modules and boards with header pins to a breadboard.', 'JUMPER-MF-40', 59, NULL, 60, '[{"k":"Quantity","v":"40 pcs"},{"k":"Length","v":"20 cm"},{"k":"Ends","v":"Male – Female"}]'::jsonb, '[]'::jsonb, 'wires', '', false, true, 6),
  ('jumper-ff-40', 'Jumper Wires Female–Female (40 pcs)', 'prototyping', 'Connect two header-pin modules directly, with no breadboard needed.', 'JUMPER-FF-40', 59, NULL, 50, '[{"k":"Quantity","v":"40 pcs"},{"k":"Length","v":"20 cm"},{"k":"Ends","v":"Female – Female"}]'::jsonb, '[]'::jsonb, 'wires', '', false, true, 7),
  ('thin-hookup-wire', 'Thin Connecting Wire (multi-colour set)', 'prototyping', 'Thin, flexible single-core wire in assorted colours for soldering on perfboard, wiring small gadgets and tight spaces.', 'THIN-HOOKUP-WIRE', 99, NULL, 35, '[{"k":"Type","v":"Thin hook-up wire (approx. 30 AWG)"},{"k":"Colours","v":"Assorted"},{"k":"Use","v":"Soldering, point-to-point wiring"}]'::jsonb, '[]'::jsonb, 'wires', '', false, true, 8),
  ('perfboard-7x9', 'Prototype Board (Perfboard) 7 × 9 cm', 'prototyping', 'Double-sided plated-through-hole prototype board. Solder your tested breadboard circuit into a permanent project.', 'PERFBOARD-7X9', 49, NULL, 50, '[{"k":"Size","v":"7 × 9 cm"},{"k":"Pitch","v":"2.54 mm"},{"k":"Sides","v":"Double-sided, plated holes"}]'::jsonb, '[]'::jsonb, 'perf', '', false, true, 9),
  ('turbidity-sensor', 'Turbidity Sensor with Module', 'sensors', 'Measures how cloudy water is by detecting light scattering. Comes with the signal-conditioning module, so you can read it on an Arduino or ESP32. A favourite for water-quality projects.', 'TURBIDITY-SENSOR', 449, 549, 12, '[{"k":"Output","v":"Analog + digital (adjustable threshold)"},{"k":"Supply","v":"5 V"},{"k":"Use","v":"Water quality monitoring, washing-machine and dishwasher style detection"}]'::jsonb, '[]'::jsonb, 'turbidity', '', false, true, 10),
  ('tds-sensor', 'Analog TDS Sensor Module with Probe', 'sensors', 'Estimates total dissolved solids (water purity) in ppm. Pair it with a DS18B20 for temperature compensation.', 'TDS-SENSOR', 499, 599, 12, '[{"k":"Output","v":"Analog voltage"},{"k":"Supply","v":"3.3–5.5 V"},{"k":"Range","v":"0–1000 ppm"},{"k":"Use","v":"Water purity / RO monitoring"}]'::jsonb, '[]'::jsonb, 'turbidity', '', true, true, 11),
  ('ds18b20-probe', 'DS18B20 Waterproof Temperature Probe', 'sensors', 'Digital 1-Wire temperature sensor sealed in a stainless-steel probe on a 1 m cable. Needs only one data pin and a 4.7 kΩ pull-up.', 'DS18B20-PROBE', 99, 129, 40, '[{"k":"Range","v":"–55 to +125 °C"},{"k":"Accuracy","v":"±0.5 °C (–10 to +85 °C)"},{"k":"Interface","v":"1-Wire digital"},{"k":"Cable","v":"approx. 1 m"}]'::jsonb, '[]'::jsonb, 'probe', '', false, true, 12),
  ('ad8232-ecg', 'AD8232 ECG Sensor Module (with leads)', 'sensors', 'Single-lead heart-rate / ECG front end. Plot your own heartbeat on a serial plotter or OLED. For learning and hobby projects only — not a medical device.', 'AD8232-ECG', 449, 549, 10, '[{"k":"Chip","v":"AD8232"},{"k":"Supply","v":"3.3 V"},{"k":"Output","v":"Analog"},{"k":"Includes","v":"Pads / lead cable"}]'::jsonb, '[]'::jsonb, 'ecg', '', false, true, 13),
  ('accelerometer-module', 'Accelerometer Sensor Module (3-axis)', 'sensors', 'Measures acceleration for tilt, motion, vibration and free-fall detection. Great for gesture controllers and self-balancing projects.', 'ACCELEROMETER-MODULE', 199, 249, 20, '[{"k":"Axes","v":"3-axis"},{"k":"Supply","v":"3.3–5 V"},{"k":"Use","v":"Tilt, motion, vibration"}]'::jsonb, '[]'::jsonb, 'accel', '', false, true, 14),
  ('dht11', 'DHT11 Temperature & Humidity Sensor', 'sensors', 'The easiest way to read temperature and humidity. Single-wire digital output with ready libraries for Arduino and ESP boards.', 'DHT11', 89, 120, 40, '[{"k":"Temperature","v":"0–50 °C, ±2 °C"},{"k":"Humidity","v":"20–80 % RH, ±5 %"},{"k":"Supply","v":"3.3–5.5 V"},{"k":"Interface","v":"Single-wire digital"}]'::jsonb, '[]'::jsonb, 'dht', '', true, true, 15),
  ('gl12-ldr', 'GL12 Light Sensor (LDR)', 'sensors', 'Light-dependent resistor: its resistance drops as light increases. Use it in a voltage divider for automatic night lights, light meters and solar trackers.', 'GL12-LDR', 15, NULL, 60, '[{"k":"Type","v":"Photoresistor (LDR)"},{"k":"Use","v":"Light sensing with an analog pin"},{"k":"Tip","v":"Pair with a 10 kΩ resistor"}]'::jsonb, '[]'::jsonb, 'ldr', '', false, true, 16),
  ('mini-pir-motion', 'Miniature Motion Sensor (Mini PIR)', 'sensors', 'Tiny passive-infrared motion sensor with a digital output. Perfect for compact motion alarms and auto-lights.', 'MINI-PIR-MOTION', 89, 110, 20, '[{"k":"Type","v":"Mini PIR (HC-SR505 style)"},{"k":"Supply","v":"4.5–20 V"},{"k":"Output","v":"Digital HIGH on motion"},{"k":"Range","v":"approx. 3 m"}]'::jsonb, '[]'::jsonb, 'pir', '', false, true, 17),
  ('lm135-sensor', 'LM135 Precision Temperature Sensor', 'sensors', 'Precision analog temperature sensor that behaves like a zener diode with +10 mV per kelvin. Needs a series resistor and (optionally) a calibration pot.', 'LM135-SENSOR', 299, 349, 10, '[{"k":"Output","v":"10 mV / K"},{"k":"Range","v":"–55 to +150 °C"},{"k":"Type","v":"Analog, 2-terminal + adjust"}]'::jsonb, '[]'::jsonb, 'to92', '', false, true, 18),
  ('oled-096', '0.96" OLED Display 128×64 (I2C)', 'displays', 'Sharp, high-contrast display that needs just 4 wires. Show sensor readings, graphs and icons. Works with Adafruit SSD1306 / U8g2 libraries.', 'OLED-096', 229, 299, 25, '[{"k":"Resolution","v":"128 × 64"},{"k":"Driver","v":"SSD1306"},{"k":"Interface","v":"I2C (4 pins)"},{"k":"Supply","v":"3.3–5 V"}]'::jsonb, '[]'::jsonb, 'oled', '', true, true, 19),
  ('lcd-16x2', 'LCD Display 16×2 (HD44780)', 'displays', 'Classic character display with backlight. Use the LiquidCrystal library on Arduino. Needs a 10 kΩ pot for contrast.', 'LCD-16X2', 149, 189, 25, '[{"k":"Characters","v":"16 × 2"},{"k":"Controller","v":"HD44780 compatible"},{"k":"Supply","v":"5 V"},{"k":"Interface","v":"Parallel (4/8-bit)"}]'::jsonb, '[]'::jsonb, 'lcd', '', false, true, 20),
  ('ne555-timer', 'NE555 Timer IC (DIP-8)', 'components', 'The legendary timer chip: astable and monostable circuits, PWM, delays, tone generators.', 'NE555-TIMER', 15, NULL, 100, '[{"k":"Package","v":"DIP-8"},{"k":"Supply","v":"4.5–16 V"},{"k":"Output current","v":"up to 200 mA"}]'::jsonb, '[]'::jsonb, 'ic555', '', false, true, 21),
  ('push-button-mini', 'Miniature Push Button (tactile, pack of 10)', 'components', '6 × 6 mm tactile switches that fit straight into a breadboard. Pack of 10.', 'PUSH-BUTTON-MINI', 20, NULL, 120, '[{"k":"Size","v":"6 × 6 mm"},{"k":"Pins","v":"4-pin"},{"k":"Pack","v":"10 pcs"}]'::jsonb, '[]'::jsonb, 'button', '', false, true, 22),
  ('resistor-14w', 'Carbon Film Resistor ¼ W (pack of 10)', 'components', 'Pick the value you need. Each pack has 10 resistors, 5 % tolerance. If you need a value that is not listed, mention it in the order notes.', 'RESISTOR-14W', 10, NULL, 400, '[{"k":"Power","v":"¼ W"},{"k":"Tolerance","v":"5 %"},{"k":"Pack","v":"10 pcs"}]'::jsonb, '[{"label":"10Ω","price":null},{"label":"22Ω","price":null},{"label":"47Ω","price":null},{"label":"100Ω","price":null},{"label":"150Ω","price":null},{"label":"220Ω","price":null},{"label":"330Ω","price":null},{"label":"470Ω","price":null},{"label":"680Ω","price":null},{"label":"1kΩ","price":null},{"label":"2.2kΩ","price":null},{"label":"3.3kΩ","price":null},{"label":"4.7kΩ","price":null},{"label":"10kΩ","price":null},{"label":"22kΩ","price":null},{"label":"47kΩ","price":null},{"label":"100kΩ","price":null},{"label":"220kΩ","price":null},{"label":"470kΩ","price":null},{"label":"1MΩ","price":null}]'::jsonb, 'resistor', '', false, true, 23),
  ('resistor-kit-600', 'Resistor Assortment Kit (600 pcs, 30 values)', 'components', '30 common values × 20 pieces of ¼ W resistors in an organiser. The easiest way to never run out.', 'RESISTOR-KIT-600', 199, 260, 20, '[{"k":"Quantity","v":"600 pcs"},{"k":"Values","v":"30 common E12 values"},{"k":"Power","v":"¼ W"}]'::jsonb, '[]'::jsonb, 'kit', '', false, true, 24),
  ('potentiometer', 'Potentiometer / Trimpot', 'components', 'Rotary potentiometers and small preset trimpots for volume, contrast and calibration.', 'POTENTIOMETER', 25, NULL, 80, '[{"k":"Type","v":"Linear (B-type)"},{"k":"Mount","v":"Breadboard-friendly legs"}]'::jsonb, '[{"label":"1kΩ rotary","price":null},{"label":"5kΩ rotary","price":null},{"label":"10kΩ rotary","price":null},{"label":"50kΩ rotary","price":null},{"label":"100kΩ rotary","price":null},{"label":"10kΩ preset trimpot","price":15}]'::jsonb, 'resistor', '', false, true, 25),
  ('ceramic-capacitor', 'Ceramic Capacitor (pack of 10)', 'components', 'Disc ceramic capacitors for decoupling, filtering and timing. Choose a value. Pack of 10.', 'CERAMIC-CAPACITOR', 15, NULL, 300, '[{"k":"Voltage","v":"50 V"},{"k":"Pack","v":"10 pcs"}]'::jsonb, '[{"label":"22pF","price":null},{"label":"100pF","price":null},{"label":"1nF (102)","price":null},{"label":"10nF (103)","price":null},{"label":"100nF (104)","price":null},{"label":"1µF","price":null}]'::jsonb, 'capc', '', false, true, 26),
  ('electrolytic-capacitor', 'Electrolytic Capacitor (pack of 5)', 'components', 'Polarised capacitors for power supply smoothing and audio coupling. Pack of 5.', 'ELECTROLYTIC-CAPACITOR', 25, NULL, 200, '[{"k":"Type","v":"Radial electrolytic"},{"k":"Pack","v":"5 pcs"}]'::jsonb, '[{"label":"1µF 50V","price":null},{"label":"10µF 25V","price":null},{"label":"47µF 25V","price":null},{"label":"100µF 25V","price":null},{"label":"220µF 25V","price":null},{"label":"470µF 25V","price":null},{"label":"1000µF 16V","price":null},{"label":"2200µF 25V","price":35}]'::jsonb, 'cape', '', false, true, 27),
  ('capacitor-kit', 'Capacitor Assortment Kit (ceramic + electrolytic)', 'components', 'A box of the most-used ceramic and electrolytic capacitor values for projects and labs.', 'CAPACITOR-KIT', 249, 320, 15, '[{"k":"Contents","v":"Ceramic + electrolytic assortment"},{"k":"Use","v":"Labs and projects"}]'::jsonb, '[]'::jsonb, 'kit', '', false, true, 28),
  ('bjt-transistor', 'Small-Signal Transistor (pack of 5)', 'components', 'General-purpose BJTs for switching and amplifying. Pick the part number. Pack of 5.', 'BJT-TRANSISTOR', 15, NULL, 200, '[{"k":"Package","v":"TO-92"},{"k":"Pack","v":"5 pcs"}]'::jsonb, '[{"label":"BC547 (NPN)","price":null},{"label":"BC548 (NPN)","price":null},{"label":"BC557 (PNP)","price":null},{"label":"2N2222 (NPN)","price":20},{"label":"2N3904 (NPN)","price":20},{"label":"2N3906 (PNP)","price":20}]'::jsonb, 'to92', '', false, true, 29),
  ('power-transistor-mosfet', 'Power Transistor / MOSFET (each)', 'components', 'For motors, relays, LED strips and power supplies. Price is per piece.', 'POWER-TRANSISTOR-MOSFET', 25, NULL, 100, '[{"k":"Sold","v":"Per piece"}]'::jsonb, '[{"label":"TIP31C (NPN)","price":null},{"label":"TIP32C (PNP)","price":null},{"label":"TIP122 (Darlington NPN)","price":35},{"label":"TIP127 (Darlington PNP)","price":35},{"label":"2N3055","price":79},{"label":"IRF540N MOSFET","price":59},{"label":"IRFZ44N MOSFET","price":59},{"label":"IRF9540 P-MOSFET","price":69},{"label":"2N7000 MOSFET","price":15}]'::jsonb, 'to92', '', false, true, 30),
  ('linear-ic', 'Op-Amp, Regulator & Linear IC (each)', 'components', 'Op-amps, comparators and voltage regulators. Price is per piece.', 'LINEAR-IC', 25, NULL, 150, '[{"k":"Sold","v":"Per piece"}]'::jsonb, '[{"label":"LM358 dual op-amp","price":null},{"label":"LM324 quad op-amp","price":null},{"label":"LM741 op-amp","price":15},{"label":"LM339 comparator","price":null},{"label":"LM393 comparator","price":20},{"label":"LM386 audio amp","price":45},{"label":"TL071 op-amp","price":35},{"label":"LM317 adjustable regulator","price":null},{"label":"LM7805 (5 V)","price":15},{"label":"LM7812 (12 V)","price":15},{"label":"LM7905 (–5 V)","price":20},{"label":"AMS1117-3.3","price":20},{"label":"LM35 temperature sensor","price":59}]'::jsonb, 'dip', '', false, true, 31),
  ('logic-ic', 'Digital Logic IC 74xx / CD4xxx (each)', 'components', 'Gates, flip-flops, counters, decoders and shift registers. Price is per piece. Ask us if you need a part that is not listed.', 'LOGIC-IC', 20, NULL, 150, '[{"k":"Sold","v":"Per piece"}]'::jsonb, '[{"label":"74HC00 NAND","price":null},{"label":"74HC04 NOT","price":null},{"label":"74HC08 AND","price":null},{"label":"74HC32 OR","price":null},{"label":"74HC74 D flip-flop","price":25},{"label":"74HC138 decoder","price":30},{"label":"74HC245 buffer","price":35},{"label":"74HC595 shift register","price":35},{"label":"CD4017 counter","price":30},{"label":"CD4511 BCD-7seg","price":35},{"label":"CD4060 counter/oscillator","price":40},{"label":"CD4093 Schmitt NAND","price":25},{"label":"74LS47 BCD-7seg","price":35}]'::jsonb, 'dip', '', false, true, 32),
  ('driver-ic', 'Driver, Interface & Converter IC (each)', 'components', 'Motor drivers, level shifters, I/O expanders and data converters. Price is per piece.', 'DRIVER-IC', 25, NULL, 80, '[{"k":"Sold","v":"Per piece"}]'::jsonb, '[{"label":"L293D motor driver","price":65},{"label":"L298N IC","price":179},{"label":"ULN2003A","price":null},{"label":"MAX232","price":69},{"label":"PCF8574 I/O expander","price":79},{"label":"CD4051 analog mux","price":35},{"label":"ADC0804","price":149},{"label":"DAC0808","price":129},{"label":"LM3914 bar driver","price":99}]'::jsonb, 'dip', '', false, true, 33),
  ('led-5mm', '5 mm LED (pack of 10)', 'components', 'Standard 5 mm diffused LEDs. Choose a colour. Remember a 220 Ω resistor!', 'LED-5MM', 20, NULL, 300, '[{"k":"Size","v":"5 mm"},{"k":"Pack","v":"10 pcs"}]'::jsonb, '[{"label":"Red","price":null},{"label":"Green","price":null},{"label":"Yellow","price":null},{"label":"Orange","price":null},{"label":"Blue","price":30},{"label":"White","price":30}]'::jsonb, 'led', '', false, true, 34),
  ('led-kit-100', 'LED Assortment Kit (100 pcs, 3 mm + 5 mm)', 'components', '100 LEDs in 5 colours and 2 sizes. Enough for every lab and project.', 'LED-KIT-100', 99, 140, 30, '[{"k":"Quantity","v":"100 pcs"},{"k":"Sizes","v":"3 mm and 5 mm"}]'::jsonb, '[]'::jsonb, 'led', '', false, true, 35),
  ('lipo-small', 'Small LiPo Battery 3.7 V', 'power', 'Rechargeable lithium-polymer cells for ESP32 and wearable projects. Use a proper LiPo charger module (TP4056 with protection). Choose a capacity.', 'LIPO-SMALL', 149, NULL, 20, '[{"k":"Voltage","v":"3.7 V nominal (4.2 V full)"},{"k":"Warning","v":"Never short or puncture. Use a protected charger."}]'::jsonb, '[{"label":"3.7V 150mAh","price":null},{"label":"3.7V 500mAh","price":229},{"label":"3.7V 1000mAh","price":329},{"label":"3.7V 2000mAh","price":499}]'::jsonb, 'lipo', '', false, true, 36),
  ('battery-9v-clip', '9 V Battery with Snap Clip', 'power', 'A 9 V battery with a snap-on connector. Powers an Arduino Uno through the barrel jack or runs small circuits.', 'BATTERY-9V-CLIP', 59, NULL, 40, '[{"k":"Voltage","v":"9 V"},{"k":"Includes","v":"Battery + snap clip"}]'::jsonb, '[]'::jsonb, 'batt9', '', false, true, 37),
  ('transformer', 'Step-Down Transformer', 'power', 'Mains step-down transformers for power-supply and rectifier projects. Choose the rating. Mains voltage is dangerous: get supervision if you are a beginner.', 'TRANSFORMER', 149, NULL, 25, '[{"k":"Primary","v":"230 V AC"},{"k":"Warning","v":"Mains voltage can be deadly"}]'::jsonb, '[{"label":"0-12V 500mA","price":null},{"label":"0-12V 1A","price":199},{"label":"12-0-12V 500mA","price":189},{"label":"12-0-12V 1A","price":269},{"label":"0-9V 500mA","price":139},{"label":"9-0-9V 500mA","price":159}]'::jsonb, 'transformer', '', false, true, 38),
  ('multimeter-dt830b', 'Digital Multimeter (DT830B)', 'tools', 'Compact digital multimeter: measure voltage, current and resistance, and test diodes and transistors. Essential for every student lab bench.', 'MULTIMETER-DT830B', 349, 449, 12, '[{"k":"Measures","v":"DC/AC voltage, DC current, resistance"},{"k":"Extras","v":"Diode test, hFE transistor test"},{"k":"Display","v":"Digital LCD"}]'::jsonb, '[]'::jsonb, 'meter', '', true, true, 39),
  ('soldering-kit', 'Soldering Kit (iron, solder, flux & stand)', 'tools', 'Everything to start soldering: iron, solder wire, flux and a stand. Use in a ventilated area.', 'SOLDERING-KIT', 449, 599, 10, '[{"k":"Includes","v":"Soldering iron, solder wire, flux, stand"},{"k":"Supply","v":"230 V AC"}]'::jsonb, '[]'::jsonb, 'solder', '', true, true, 40)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  price = excluded.price,
  mrp = excluded.mrp,
  stock = excluded.stock,
  specs = excluded.specs,
  options = excluded.options,
  icon = excluded.icon,
  image_url = excluded.image_url,
  featured = excluded.featured,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;
