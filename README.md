# VoltNest — Student Electronics Storefront & Control Room

A student electronics e-commerce store with an animated frontend and a **Supabase (PostgreSQL)** backend with an authenticated **Owner Control Room**.

## Project Architecture

```
voltnest-web/
├── public/                       <- Customer storefront & Owner dashboard
│   ├── index.html                <- Homepage (hero animations, component marquee, project kits)
│   ├── shop.html                 <- Component shelf (filter by category, search, sort)
│   ├── product.html              <- Product detail (specifications, variants, stock, add to cart)
│   ├── cart.html                 <- Shopping cart review & quantity adjustments
│   ├── checkout.html             <- Student checkout (pickup/delivery, college, Greater Noida areas)
│   ├── track.html                <- Live order tracking by ORD-XXXXX code & phone number
│   ├── about.html                <- Store info, pickup point & ordering FAQ
│   ├── admin.html                <- Owner Control Room (Catalogue CRUD, Orders, Store settings)
│   ├── css/
│   │   ├── style.css             <- Storefront styling & micro-animations
│   │   └── admin.css             <- Owner control room styling
│   ├── js/
│   │   ├── backend.js            <- Single adapter: Backend.config, products, createOrder, track
│   │   ├── supabase-config.js    <- Your Supabase project URL & browser-safe anon key
│   │   ├── admin.js              <- Owner dashboard logic (Supabase Auth & administration)
│   │   ├── icons.js              <- Procedural SVG illustrations for 30+ components
│   │   └── common.js, cart.js, checkout.js, track.js, home.js, shop.js, product.js
│   └── data/products.json        <- 41 starter components (also used for zero-config preview mode)
└── schema.sql                    <- Complete PostgreSQL database setup & seed for Supabase
```

---

## 1. Quick Preview (Zero Configuration)

The storefront comes with an automatic **Preview Mode** that runs without any setup:
- If `public/js/supabase-config.js` is not yet configured, the site automatically serves starter components from `public/data/products.json`.
- Test orders are safely saved in your browser's `localStorage` so you can test placing orders and tracking them immediately.

To run locally:
```powershell
npx serve public
```
Or open any static server pointing to the `public/` directory.

---

## 2. Connect Your Live Supabase Backend

### Step 1: Create a Supabase Project
1. Go to [Supabase](https://supabase.com/) and create a new project.
2. Under **Project Settings → API**, copy:
   - **Project URL**
   - **Project API Anon Key** (browser-safe public key).

### Step 2: Configure the Frontend
Open `public/js/supabase-config.js` and paste your credentials:
```javascript
window.SUPABASE_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_ID.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  whatsappNumber: '919876543210' // Your 10-digit number with country code for WhatsApp order alerts
};
```

### Step 3: Run the Database Schema
1. In the Supabase Dashboard, go to **SQL Editor** → **New Query**.
2. Open [`schema.sql`](./schema.sql), copy its entire contents, paste it into the SQL editor, and click **Run**.
3. This creates:
   - `products` table (pre-seeded with all 41 components, specs, and pricing).
   - `orders` table (with order codes, customer details, and items).
   - `store_settings` table (delivery fees, pickup hours, and Greater Noida areas).
   - `store_admins` table (protected owner authorization).
   - Automatic database trigger that atomically decrements stock when orders are placed and restores stock if an order is cancelled.
   - Secure `track_order` RPC function that allows customers to track only their order without exposing other customer records.

---

## 3. Create Your Owner Account

1. In Supabase Dashboard, open **Authentication → Users** and click **Add User** (Create User).
2. Enter your email and a password.
3. In the Users table, copy your user's **UUID** (ID column).
4. Go to **SQL Editor** and run this one-time command (replace with your UUID):
   ```sql
   insert into public.store_admins (user_id)
   values ('PASTE_YOUR_COPIED_UUID_HERE');
   ```
5. Open `/admin.html` in your browser and sign in. You now have full access to:
   - **Catalogue**: Add, edit, delete, toggle live/hidden, change price, and manage stock.
   - **Orders**: View incoming orders, filter by status, update status, and message customers directly on WhatsApp with one click.
   - **Settings**: Update pickup location, delivery fees, and announcement banner.

---

## 4. Deploying Live

This is a clean static web application with no build step required. You can deploy it instantly on:
- **Vercel**: Import repository → Root directory: `public` → Deploy.
- **Netlify**: Publish directory: `public`.
- **Cloudflare Pages**: Direct upload or git integration pointing to `public`.
- **Firebase Hosting**: Run `firebase deploy --only hosting` (configured in `firebase.json`).
