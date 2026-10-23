/* VoltNest + Campus Circuit Backend Adapter (Supabase & Demo Mode)
   Four core methods:
     Backend.config()           -> Returns store settings & contact information
     Backend.products()         -> Returns catalogue of active products
     Backend.createOrder(order) -> Places a new order and decrements inventory
     Backend.track(code, phone) -> Fetches order status for customer tracking
*/
(function () {
  const CFG = window.SUPABASE_CONFIG || window.CAMPUS_CIRCUIT_CONFIG || {};
  const isConfigured = !!(
    CFG.supabaseUrl &&
    CFG.supabaseAnonKey &&
    !CFG.supabaseUrl.includes('PASTE_') &&
    !CFG.supabaseAnonKey.includes('PASTE_')
  );

  const DEFAULT_CONFIG = {
    storeName: 'VoltNest',
    tagline: 'Electronic parts for students in Greater Noida. Order online, pay when you pick up.',
    phone: '',
    whatsapp: CFG.whatsappNumber || '',
    email: 'support@voltnest.in',
    instagram: 'voltnest.in',
    pickupAddress: 'Knowledge Park II, Greater Noida (near Knowledge Park II Metro Station)',
    pickupHours: 'Mon–Sat, 10:00 AM – 8:00 PM',
    deliveryEnabled: true,
    deliveryFee: 30,
    freeDeliveryAbove: 500,
    minOrder: 0,
    announcement: 'Student discount active · Instant pickup available in Knowledge Park',
    areas: [
      'Knowledge Park I',
      'Knowledge Park II',
      'Knowledge Park III',
      'Knowledge Park IV',
      'Knowledge Park V',
      'Alpha 1 / Alpha 2',
      'Beta 1 / Beta 2',
      'Gamma 1 / Gamma 2',
      'Delta 1 / Delta 2 / Delta 3',
      'Pari Chowk',
      'Sharda University area',
      'Galgotias University area',
      'GL Bajaj / NIET / GNIOT area',
      'Gautam Buddha University area',
      'Techzone / Greater Noida West'
    ]
  };

  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function generateOrderCode() {
    return 'ORD-' + Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  }

  function normPhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d.slice(-10);
  }

  // Parse specifications into an array of [key, value] pairs
  function parseSpecs(raw) {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return []; }
    }
    if (Array.isArray(raw)) {
      return raw.map((s) => {
        if (Array.isArray(s)) return s;
        if (typeof s === 'object' && s !== null) {
          return [s.k ?? s.label ?? s.name ?? '', s.v ?? s.value ?? ''];
        }
        return [String(s), ''];
      });
    }
    if (typeof raw === 'object') {
      return Object.entries(raw);
    }
    return [];
  }

  // Parse variant options into [{label, price}]
  function parseOptions(raw, basePrice) {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((o) => {
      if (typeof o === 'string') return { label: o, price: basePrice };
      return {
        label: o.label || o.name || '',
        price: o.price != null && !isNaN(Number(o.price)) ? Number(o.price) : basePrice
      };
    });
  }

  // Map any product record to the shape VoltNest pages expect
  function mapProduct(id, d) {
    const price = Number(d.price) || 0;
    const options = parseOptions(d.options, price);
    const specs = parseSpecs(d.specs);
    const sort = d.sort ?? d.sort_order ?? 100;
    const active = d.active !== false && d.is_active !== false;

    return {
      id: String(id || d.id),
      name: d.name || id,
      category: (d.category || 'components').toLowerCase(),
      subcategory: d.subcategory || '',
      price,
      mrp: d.mrp ? Number(d.mrp) : null,
      stock: Number(d.stock) || 0,
      description: d.description || '',
      specs,
      options,
      icon: d.icon || 'kit',
      image_url: d.image_url || d.imageUrl || '',
      featured: !!d.featured,
      sort,
      active,
      from_price: options.length ? Math.min(...options.map((o) => o.price)) : price
    };
  }

  const sortProducts = (a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name);

  /* ---------------- Supabase Live Implementation ---------------- */
  let sbClientPromise;
  async function getSupabase() {
    if (sbClientPromise) return sbClientPromise;
    sbClientPromise = (async () => {
      if (!window.supabase) {
        // Dynamically load Supabase client if not already loaded via script tag
        try {
          const mod = await import('https://esm.sh/@supabase/supabase-js@2');
          window.supabase = mod;
        } catch {
          throw new Error('Could not load Supabase client library.');
        }
      }
      return window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    })();
    return sbClientPromise;
  }

  const live = {
    async config() {
      try {
        const sb = await getSupabase();
        const { data, error } = await sb.from('store_settings').select('*').limit(1).maybeSingle();
        let localExtra = {};
        try { localExtra = JSON.parse(localStorage.getItem('voltnest_settings') || '{}'); } catch {}

        if (error || !data) {
          return { ...DEFAULT_CONFIG, ...localExtra };
        }

        return {
          storeName: data.store_name || DEFAULT_CONFIG.storeName,
          tagline: data.tagline || DEFAULT_CONFIG.tagline,
          phone: data.phone || DEFAULT_CONFIG.phone,
          whatsapp: data.whatsapp || CFG.whatsappNumber || DEFAULT_CONFIG.whatsapp,
          email: data.email || localExtra.email || DEFAULT_CONFIG.email,
          instagram: data.instagram || localExtra.instagram || DEFAULT_CONFIG.instagram,
          pickupAddress: data.pickup_address || DEFAULT_CONFIG.pickupAddress,
          pickupHours: data.pickup_hours || DEFAULT_CONFIG.pickupHours,
          deliveryEnabled: data.delivery_enabled !== false,
          deliveryFee: data.delivery_fee != null ? Number(data.delivery_fee) : DEFAULT_CONFIG.deliveryFee,
          freeDeliveryAbove: data.free_delivery_above != null ? Number(data.free_delivery_above) : DEFAULT_CONFIG.freeDeliveryAbove,
          minOrder: data.min_order != null ? Number(data.min_order) : DEFAULT_CONFIG.minOrder,
          announcement: data.announcement || '',
          areas: Array.isArray(data.areas) ? data.areas : DEFAULT_CONFIG.areas
        };
      } catch {
        return DEFAULT_CONFIG;
      }
    },

    async products() {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw new Error('Could not load catalogue from Supabase: ' + error.message);
      return (data || []).map((d) => mapProduct(d.id, d)).sort(sortProducts);
    },

    async createOrder(b) {
      const sb = await getSupabase();
      const name = String(b.name || '').trim();
      const phone = normPhone(b.phone);
      if (name.length < 2) throw new Error('Please enter your full name');
      if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit Indian mobile number');
      if (b.website) return { code: 'ORD-00000', total: 0, items: [], status: 'new', name, method: 'pickup', subtotal: 0, delivery_fee: 0 }; // Honeypot trap

      const method = b.method === 'delivery' ? 'delivery' : 'pickup';
      if (!Array.isArray(b.items) || !b.items.length) throw new Error('Your cart is empty');

      // Fetch live products to verify availability and prices
      const productIds = b.items.map((i) => String(i.id));
      const { data: dbProducts, error: pErr } = await sb.from('products').select('*').in('id', productIds);
      if (pErr) throw new Error('Failed to verify products: ' + pErr.message);

      const prodMap = new Map((dbProducts || []).map((p) => [String(p.id), mapProduct(p.id, p)]));
      const cfg = await this.config();

      let subtotal = 0;
      const orderLines = [];

      for (const item of b.items) {
        const p = prodMap.get(String(item.id));
        if (!p || !p.active) {
          const err = new Error('An item in your cart is no longer available. Please review your cart.');
          err.status = 409;
          throw err;
        }

        const qty = Number(item.qty) || 1;
        if (p.stock > 0 && qty > p.stock) {
          const err = new Error(`Only ${p.stock} of ${p.name} available in stock.`);
          err.status = 409;
          throw err;
        }

        let unitPrice = p.price;
        let optLabel = item.option || '';
        if (p.options && p.options.length) {
          const opt = p.options.find((o) => o.label === optLabel);
          if (opt && opt.price != null) unitPrice = opt.price;
        }

        const lineTotal = unitPrice * qty;
        subtotal += lineTotal;

        orderLines.push({
          id: p.id,
          name: p.name,
          category: p.category,
          option: optLabel,
          price: unitPrice,
          qty: qty,
          line_total: lineTotal
        });
      }

      if (subtotal < cfg.minOrder) {
        throw new Error(`Minimum order amount is ₹${cfg.minOrder}`);
      }

      const fee = method === 'delivery' && !(cfg.freeDeliveryAbove > 0 && subtotal >= cfg.freeDeliveryAbove) ? cfg.deliveryFee : 0;
      const total = subtotal + fee;
      const code = generateOrderCode();

      const payload = {
        order_code: code,
        customer_name: name,
        phone: phone,
        college: String(b.college || '').trim() || null,
        fulfilment: method,
        area: String(b.area || '').trim() || null,
        address: String(b.address || '').trim() || null,
        notes: String(b.notes || '').trim() || null,
        items: orderLines,
        subtotal: subtotal,
        delivery_fee: fee,
        total: total,
        status: 'new'
      };

      const { data: inserted, error: oErr } = await sb.from('orders').insert(payload).select().single();
      if (oErr) {
        throw new Error('Could not submit order: ' + oErr.message);
      }

      return {
        code: inserted.order_code || code,
        name: name,
        method: method,
        subtotal: subtotal,
        delivery_fee: fee,
        total: total,
        status: 'new',
        items: orderLines.map(({ name, option, price, qty }) => ({ name, option, price, qty }))
      };
    },

    async createCustomRequest(b) {
      const sb = await getSupabase();
      const name = String(b.name || '').trim();
      const phone = normPhone(b.phone);
      if (name.length < 2) throw new Error('Please enter your full name');
      if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit Indian mobile number');

      const itemsList = Array.isArray(b.items) && b.items.length ? b.items : [];
      if (!itemsList.length && !b.file) {
        throw new Error('Please enter at least one component or upload a component list file');
      }

      const orderLines = itemsList.length ? itemsList.map((it) => {
        const itemStr = typeof it === 'string' ? it.trim() : (it.name || '');
        const m = itemStr.match(/^(\d+)\s*[x×*]\s*(.+)$/i);
        const qty = m ? parseInt(m[1], 10) : (it.qty || 1);
        const cleanName = m ? m[2].trim() : itemStr;
        return {
          name: cleanName || 'Custom Component',
          qty: qty,
          price: 0,
          is_custom: true,
          unit_price: 0
        };
      }) : [{
        name: 'Custom Component Document: ' + (b.file?.name || 'Uploaded File'),
        qty: 1,
        price: 0,
        is_custom: true,
        unit_price: 0
      }];

      if (b.file && orderLines[0]) {
        orderLines[0].file = {
          name: b.file.name,
          size: b.file.size,
          type: b.file.type,
          dataUrl: b.file.dataUrl || ''
        };
      }

      const method = b.method === 'delivery' ? 'delivery' : 'pickup';
      const code = 'BOM-' + Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      
      const notesParts = ['[Custom Component / BOM Sourcing Request]'];
      if (b.deadline) notesParts.push(`[Urgency: ${b.deadline}]`);
      if (b.file) notesParts.push(`[File: ${b.file.name} (${Math.round((b.file.size || 0)/1024)} KB)]`);
      if (b.notes) notesParts.push(b.notes);

      const payload = {
        order_code: code,
        customer_name: name,
        phone: phone,
        college: String(b.college || '').trim() || null,
        fulfilment: method,
        area: String(b.area || '').trim() || null,
        address: String(b.address || '').trim() || null,
        notes: notesParts.join(' · '),
        items: orderLines,
        subtotal: 0,
        delivery_fee: 0,
        total: 0,
        status: 'new'
      };

      const { data: inserted, error: oErr } = await sb.from('orders').insert(payload).select().single();
      if (oErr) {
        throw new Error('Could not submit component request: ' + oErr.message);
      }

      return {
        code: inserted.order_code || code,
        name: name,
        phone: phone,
        method: method,
        items: orderLines,
        status: 'new'
      };
    },

    async track(code, phone) {
      const sb = await getSupabase();
      const cleanCode = String(code || '').trim().toUpperCase();
      const cleanP = normPhone(phone);
      if (!cleanCode || !cleanP) throw new Error('Enter both your order code and phone number');

      // 1. Try secure RPC function first
      try {
        const { data, error } = await sb.rpc('track_order', { p_code: cleanCode, p_phone: cleanP });
        if (!error && data) return data;
      } catch {}

      // 2. Direct query fallback
      const { data: rows, error: qErr } = await sb
        .from('orders')
        .select('*')
        .or(`order_code.ilike.${cleanCode},id.eq.${cleanCode}`)
        .limit(1);

      if (!qErr && rows && rows.length) {
        const o = rows[0];
        if (normPhone(o.phone) === cleanP) {
          return {
            code: o.order_code || cleanCode,
            status: o.status,
            name: o.customer_name,
            method: String(o.fulfilment || 'pickup').toLowerCase(),
            area: o.area || '',
            subtotal: Number(o.subtotal) || 0,
            delivery_fee: Number(o.delivery_fee) || 0,
            total: Number(o.total) || 0,
            created_at: o.created_at,
            updated_at: o.updated_at,
            items: (Array.isArray(o.items) ? o.items : []).map((i) => ({
              name: i.name,
              option: i.option || '',
              price: Number(i.price) || Number(i.unit_price) || 0,
              qty: Number(i.qty) || Number(i.quantity) || 1
            }))
          };
        }
      }

      throw new Error('No order found matching this code and phone number. Please check your details.');
    }
  };

  /* ---------------- Demo Mode (No Supabase connected yet) ---------------- */
  const DEMO_ORDERS_KEY = 'vn_demo_orders';
  const readDemoOrders = () => {
    try { return JSON.parse(localStorage.getItem(DEMO_ORDERS_KEY)) || []; } catch { return []; }
  };
  let demoProductsCache;

  const demo = {
    async config() {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem('voltnest_settings') || '{}'); } catch {}
      return {
        ...DEFAULT_CONFIG,
        ...saved,
        whatsapp: saved.whatsapp || CFG.whatsappNumber || DEFAULT_CONFIG.whatsapp
      };
    },

    async products() {
      if (!demoProductsCache) {
        const resp = await fetch('/data/products.json');
        const raw = await resp.json();
        demoProductsCache = raw.map((d) => mapProduct(d.id, d));
      }
      return demoProductsCache.filter((p) => p.active).sort(sortProducts);
    },

    async createOrder(b) {
      const cfg = DEFAULT_CONFIG;
      const ps = await this.products();
      const name = String(b.name || '').trim();
      const phone = normPhone(b.phone);
      if (name.length < 2) throw new Error('Please enter your full name');
      if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit mobile number');

      let subtotal = 0;
      const items = [];
      for (const it of b.items) {
        const p = ps.find((x) => x.id === it.id);
        if (!p) {
          const err = new Error('An item is no longer available');
          err.status = 409;
          throw err;
        }
        const o = p.options.find((x) => x.label === it.option);
        const price = o ? o.price : p.price;
        subtotal += price * it.qty;
        items.push({ name: p.name, option: o ? o.label : '', price, qty: it.qty });
      }

      const fee = b.method === 'delivery' && !(cfg.freeDeliveryAbove > 0 && subtotal >= cfg.freeDeliveryAbove) ? cfg.deliveryFee : 0;
      const code = generateOrderCode();
      const now = new Date().toISOString();

      const newOrder = {
        code,
        name,
        phone,
        college: b.college || '',
        method: b.method,
        area: b.area || '',
        address: b.address || '',
        notes: b.notes || '',
        subtotal,
        delivery_fee: fee,
        total: subtotal + fee,
        status: 'new',
        created_at: now,
        updated_at: now,
        items
      };

      const orders = readDemoOrders();
      orders.unshift(newOrder);
      localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(orders));

      return newOrder;
    },

    async createCustomRequest(b) {
      const name = String(b.name || '').trim();
      const phone = normPhone(b.phone);
      if (name.length < 2) throw new Error('Please enter your full name');
      if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit mobile number');

      const itemsList = Array.isArray(b.items) && b.items.length ? b.items : [];
      if (!itemsList.length && !b.file) {
        throw new Error('Please enter at least one component or upload a component list file');
      }

      const orderLines = itemsList.length ? itemsList.map((it) => {
        const itemStr = typeof it === 'string' ? it.trim() : (it.name || '');
        const m = itemStr.match(/^(\d+)\s*[x×*]\s*(.+)$/i);
        const qty = m ? parseInt(m[1], 10) : (it.qty || 1);
        const cleanName = m ? m[2].trim() : itemStr;
        return {
          name: cleanName || 'Custom Component',
          qty: qty,
          price: 0,
          is_custom: true,
          unit_price: 0
        };
      }) : [{
        name: 'Custom Component Document: ' + (b.file?.name || 'Uploaded File'),
        qty: 1,
        price: 0,
        is_custom: true,
        unit_price: 0
      }];

      if (b.file && orderLines[0]) {
        orderLines[0].file = {
          name: b.file.name,
          size: b.file.size,
          type: b.file.type,
          dataUrl: b.file.dataUrl || ''
        };
      }

      const code = 'BOM-' + Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      const now = new Date().toISOString();
      const notesParts = ['[Custom Component / BOM Sourcing Request]'];
      if (b.deadline) notesParts.push(`[Urgency: ${b.deadline}]`);
      if (b.file) notesParts.push(`[File: ${b.file.name} (${Math.round((b.file.size || 0)/1024)} KB)]`);
      if (b.notes) notesParts.push(b.notes);

      const newOrder = {
        order_code: code,
        code,
        customer_name: name,
        name,
        phone,
        college: b.college || '',
        fulfilment: b.method || 'pickup',
        method: b.method || 'pickup',
        area: b.area || '',
        address: b.address || '',
        notes: notesParts.join(' · '),
        subtotal: 0,
        delivery_fee: 0,
        total: 0,
        status: 'new',
        created_at: now,
        updated_at: now,
        items: orderLines
      };

      const orders = readDemoOrders();
      orders.unshift(newOrder);
      localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(orders));

      // Also ensure it is present in voltnest_orders so Owner Control Room sees it immediately in demo mode!
      try {
        const adminOrders = JSON.parse(localStorage.getItem('voltnest_orders') || '[]');
        adminOrders.unshift(newOrder);
        localStorage.setItem('voltnest_orders', JSON.stringify(adminOrders));
      } catch {}

      return newOrder;
    },

    async track(code, phone) {
      const cleanCode = String(code || '').trim().toUpperCase();
      const cleanP = normPhone(phone);
      const orders = readDemoOrders();
      const o = orders.find((x) => x.code === cleanCode && normPhone(x.phone) === cleanP);
      if (!o) throw new Error('No order found with these details in demo storage.');
      return o;
    }
  };

  // Expose on global window object
  window.Backend = isConfigured ? live : demo;
  window.BACKEND_MODE = isConfigured ? 'supabase' : 'demo';
  window.mapProduct = mapProduct;

  if (!isConfigured) {
    document.addEventListener('DOMContentLoaded', () => {
      // Friendly banner when previewing without live credentials
      const b = document.createElement('div');
      b.id = 'demo-badge';
      b.innerHTML = 'Preview mode · add Supabase keys in <code>js/supabase-config.js</code> to go live <a href="/admin.html" style="color:#000;font-weight:700;margin-left:6px;text-decoration:underline">Owner login →</a>';
      b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:900;background:#ffc83d;color:#000;font:600 12px/1.3 system-ui,-apple-system,sans-serif;padding:7px 12px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.4);opacity:.96;transition:opacity .2s';
      document.body.appendChild(b);
    });
  }
})();
