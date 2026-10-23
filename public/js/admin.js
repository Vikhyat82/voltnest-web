/* VoltNest Owner Control Room Logic (Supabase Auth & Administration) */
(function () {
  const CFG = window.SUPABASE_CONFIG || window.CAMPUS_CIRCUIT_CONFIG || {};
  const isConfigured = !!(
    CFG.supabaseUrl &&
    CFG.supabaseAnonKey &&
    !CFG.supabaseUrl.includes('PASTE_') &&
    !CFG.supabaseAnonKey.includes('PASTE_')
  );

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => n == null || n === '' ? '—' : '₹' + Number(n).toLocaleString('en-IN');

  let sb = null;
  let products = [];
  let orders = [];
  let kits = [];
  let currentTab = 'products';
  let isDemo = false;

  const authPanel = $('#auth-panel');
  const dashPanel = $('#dashboard-panel');
  const ownerPill = $('#owner-pill');
  const ownerEmail = $('#owner-email');
  const signoutBtn = $('#signout-btn');
  const authErr = $('#auth-err');

  // Helper: Format date in Indian Standard Time
  function formatIST(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return iso;
    }
  }

  // Helper: Normalize phone to 10 digits
  function cleanPhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d.slice(-10);
  }

  async function ensureSupabase() {
    if (sb) return sb;
    if (!isConfigured) return null;

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      try {
        const mod = await import('https://esm.sh/@supabase/supabase-js@2');
        window.supabase = mod;
      } catch (err) {
        console.warn('Dynamic Supabase import failed:', err);
      }
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase library failed to load from CDN. Check your network or ad-blocker.');
    }

    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    return sb;
  }

  /* ---------------- AUTHENTICATION & ACCESS CONTROL ---------------- */
  async function initAuth() {
    // Wire up instant demo mode button
    const demoBtn = $('#demo-mode-btn');
    if (demoBtn) {
      demoBtn.addEventListener('click', enterDemoMode);
    }

    if (!isConfigured) {
      authErr.innerHTML = '⚠️ Setup required: Please open <code>public/js/supabase-config.js</code> and enter your Supabase URL & Anon Key.<br>Or click <b>Enter Demo Mode</b> below to preview immediately.';
      return;
    }

    try {
      await ensureSupabase();
    } catch (e) {
      authErr.textContent = 'Could not initialize Supabase client: ' + e.message;
      return;
    }

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        await verifyOwnerAccess(session.user);
      } else {
        showAuth();
      }

      sb.auth.onAuthStateChange(async (event, session) => {
        if (isDemo) return;
        if (session) {
          await verifyOwnerAccess(session.user);
        } else {
          showAuth();
        }
      });
    } catch (e) {
      authErr.textContent = 'Session error: ' + e.message;
    }
  }

  function enterDemoMode() {
    isDemo = true;
    authErr.textContent = '';
    authPanel.classList.add('hide');
    dashPanel.classList.remove('hide');
    ownerPill.classList.remove('hide');
    signoutBtn.classList.remove('hide');
    ownerEmail.innerHTML = '⚡ Demo Owner <span style="opacity:0.7">(Offline Mode)</span>';
    Promise.all([loadProducts(), loadOrders(), loadKits(), loadSettings()]);
  }

  function showAuth() {
    isDemo = false;
    authPanel.classList.remove('hide');
    dashPanel.classList.add('hide');
    ownerPill.classList.add('hide');
    signoutBtn.classList.add('hide');
  }

  async function verifyOwnerAccess(user) {
    authErr.textContent = 'Verifying owner permissions in store_admins…';
    try {
      const { data: adminRecord, error } = await sb
        .from('store_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !adminRecord) {
        await sb.auth.signOut();
        showAuth();
        authErr.innerHTML = `Signed in as <b>${esc(user.email)}</b>, but this user is not authorized in <code>store_admins</code>.<br><br>
        Run this SQL in Supabase SQL Editor to authorize:<br>
        <code>insert into public.store_admins (user_id) values ('${user.id}');</code>`;
        return;
      }

      // Access granted!
      authErr.textContent = '';
      authPanel.classList.add('hide');
      dashPanel.classList.remove('hide');
      ownerPill.classList.remove('hide');
      signoutBtn.classList.remove('hide');
      ownerEmail.textContent = user.email || 'Owner';

      await Promise.all([loadProducts(), loadOrders(), loadKits(), loadSettings()]);
    } catch (e) {
      authErr.textContent = 'Authorization error: ' + e.message;
    }
  }

  // Sign In Form Handler
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    authErr.textContent = '';
    const btn = $('#login-btn');
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;

    btn.disabled = true;
    btn.textContent = 'Verifying credentials…';

    try {
      await ensureSupabase();

      if (!sb) {
        throw new Error('Supabase client is not ready. Please verify your URL and Anon Key in supabase-config.js.');
      }

      const { data, error } = await sb.auth.signInWithPassword({ email, password });

      if (error) {
        throw error;
      }

      await verifyOwnerAccess(data.user);
    } catch (err) {
      authErr.textContent = err.message || String(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in to Control Room →';
    }
  });

  // Sign Out Handler
  signoutBtn.addEventListener('click', async () => {
    if (isDemo) {
      showAuth();
      return;
    }
    if (sb) await sb.auth.signOut();
    showAuth();
  });

  /* ---------------- TABS SWITCHING ---------------- */
  $$('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      currentTab = target;
      $$('.admin-tab').forEach((t) => t.classList.toggle('active', t === tab));
      $('#tab-products').classList.toggle('hide', target !== 'products');
      $('#tab-orders').classList.toggle('hide', target !== 'orders');
      $('#tab-kits').classList.toggle('hide', target !== 'kits');
      $('#tab-settings').classList.toggle('hide', target !== 'settings');
      if (target === 'kits') loadKits();
    });
  });

  /* ---------------- PRODUCTS MANAGEMENT ---------------- */
  async function loadProducts() {
    if (isDemo) {
      const saved = localStorage.getItem('voltnest_demo_products');
      if (saved) {
        try { products = JSON.parse(saved); } catch { products = []; }
      }
      if (!products || !products.length) {
        try {
          const res = await fetch('/data/products.json');
          const raw = await res.json();
          products = (raw.products || []).map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category || 'components',
            description: p.description || '',
            price: p.price,
            mrp: p.mrp || Math.round(p.price * 1.25),
            stock: 12,
            icon: p.icon || 'kit',
            specs: p.specs || [],
            options: p.options || [],
            is_active: true,
            featured: false,
            sku: (p.id || '').toUpperCase()
          }));
          localStorage.setItem('voltnest_demo_products', JSON.stringify(products));
        } catch (e) {
          console.error(e);
        }
      }
      updateMetrics();
      renderProducts();
      return;
    }

    if (!sb) return;
    const { data, error } = await sb
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading products:', error);
      return;
    }
    products = data || [];
    updateMetrics();
    renderProducts();
  }

  function renderProducts() {
    const tbody = $('#products-tbody');
    const term = ($('#search-products').value || '').trim().toLowerCase();

    const filtered = products.filter((p) => {
      const q = `${p.name} ${p.category} ${p.sku || ''} ${p.description || ''}`.toLowerCase();
      return q.includes(term);
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--admin-muted);padding:30px">No matching components found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((p) => {
      const stock = Number(p.stock) || 0;
      let stockCls = 'in', stockText = `${stock} in stock`;
      if (stock === 0) { stockCls = 'out'; stockText = 'Sold out'; }
      else if (stock <= 5) { stockCls = 'low'; stockText = `Low (${stock})`; }

      const iconSvg = window.icon ? window.icon(p.icon || 'kit') : '';

      return `<tr>
        <td>
          <div class="prod-cell">
            <div class="prod-thumb">${p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : iconSvg}</div>
            <div>
              <div class="prod-title">${esc(p.name)}</div>
              <div class="prod-sku">${esc(p.sku || p.id)}</div>
              ${Array.isArray(p.options) && p.options.length ? `<div style="margin-top:4px"><span style="display:inline-block;padding:2px 6px;border-radius:4px;background:rgba(55,230,208,0.12);color:var(--admin-cyan);font-size:0.72rem;font-weight:600">▾ ${p.options.length} variations</span></div>` : ''}
            </div>
          </div>
        </td>
        <td>
          <span class="status-pill" style="background:rgba(255,255,255,0.06);color:var(--admin-muted)">${esc(p.category)}</span>
          ${p.subcategory ? `<div style="font-size:0.75rem;color:var(--admin-muted);margin-top:4px;padding-left:2px">${esc(p.subcategory)}</div>` : ''}
        </td>
        <td style="font-weight:700;color:#fff">${inr(p.price)}</td>
        <td style="color:var(--admin-muted)">${p.mrp ? inr(p.mrp) : '—'}</td>
        <td><span class="stock-tag ${stockCls}">${stockText}</span></td>
        <td>
          <span class="status-pill ${p.is_active ? 'completed' : 'cancelled'}" style="cursor:pointer" data-toggle-live="${esc(p.id)}">
            ${p.is_active ? '● Live' : '○ Hidden'}
          </span>
        </td>
        <td style="text-align:right">
          <button class="admin-btn sm" data-edit-prod="${esc(p.id)}">Edit</button>
          <button class="admin-btn sm danger" data-delete-prod="${esc(p.id)}" style="margin-left:6px">Delete</button>
        </td>
      </tr>`;
    }).join('');
  }

  $('#search-products').addEventListener('input', renderProducts);
  $('#refresh-products').addEventListener('click', loadProducts);

  // Table Actions: Toggle Live, Edit, Delete
  $('#products-tbody').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('[data-toggle-live]');
    const editBtn = e.target.closest('[data-edit-prod]');
    const delBtn = e.target.closest('[data-delete-prod]');

    if (toggleBtn) {
      const id = toggleBtn.dataset.toggleLive;
      const p = products.find((x) => String(x.id) === String(id));
      if (!p) return;
      const newActive = !p.is_active;

      if (isDemo) {
        p.is_active = newActive;
        localStorage.setItem('voltnest_demo_products', JSON.stringify(products));
        renderProducts();
        updateMetrics();
        return;
      }

      const { error } = await sb.from('products').update({ is_active: newActive }).eq('id', id);
      if (!error) {
        p.is_active = newActive;
        renderProducts();
        updateMetrics();
      }
      return;
    }

    if (editBtn) {
      const id = editBtn.dataset.editProd;
      const p = products.find((x) => String(x.id) === String(id));
      if (p) openProductModal(p);
      return;
    }

    if (delBtn) {
      const id = delBtn.dataset.deleteProd;
      const p = products.find((x) => String(x.id) === String(id));
      if (!p) return;
      if (!confirm(`Are you sure you want to delete "${p.name}"?`)) return;

      if (isDemo) {
        products = products.filter((x) => String(x.id) !== String(id));
        localStorage.setItem('voltnest_demo_products', JSON.stringify(products));
        renderProducts();
        updateMetrics();
        return;
      }

      const { error } = await sb.from('products').delete().eq('id', id);
      if (!error) {
        products = products.filter((x) => String(x.id) !== String(id));
        renderProducts();
        updateMetrics();
      } else {
        alert('Could not delete product: ' + error.message);
      }
    }
  });

  /* ---------------- PRODUCT ADD / EDIT MODAL & VARIATIONS ---------------- */
  const productModal = $('#product-modal');
  let modalOptions = [];

  function renderModalOptions() {
    const container = $('#opts-items-list');
    const badge = $('#opt-count-badge');
    if (!container) return;
    if (badge) badge.textContent = `${modalOptions.length} option${modalOptions.length === 1 ? '' : 's'}`;

    if (!modalOptions.length) {
      container.innerHTML = `<div style="text-align:center;color:var(--admin-muted);font-size:0.82rem;padding:12px;border:1px dashed var(--admin-border);border-radius:6px;background:rgba(0,0,0,0.2)">
        No variations added. Product will sell at base price with no dropdown menu. Use the input below or "⚡ Bulk Paste" to add dropdown values.
      </div>`;
      const rawEl = $('#prod-options');
      if (rawEl) rawEl.value = '[]';
      return;
    }

    container.innerHTML = modalOptions.map((opt, idx) => {
      const hasPrice = opt.price != null && opt.price !== '' && !isNaN(Number(opt.price));
      return `<div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 12px;font-size:0.85rem">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="color:var(--admin-cyan);font-family:'JetBrains Mono',monospace;font-weight:600">▾ ${esc(opt.label)}</span>
          <span style="font-size:0.78rem;color:${hasPrice ? 'var(--admin-lime)' : 'var(--admin-muted)'}">
            ${hasPrice ? inr(opt.price) : '(base price)'}
          </span>
        </div>
        <button class="admin-btn sm danger" type="button" data-del-opt-idx="${idx}" style="padding:2px 8px;font-size:0.75rem;min-width:auto" title="Remove variation">&times;</button>
      </div>`;
    }).join('');

    const rawEl = $('#prod-options');
    if (rawEl) rawEl.value = JSON.stringify(modalOptions);
  }

  function addSingleOption() {
    const nameInput = $('#new-opt-name');
    const priceInput = $('#new-opt-price');
    if (!nameInput) return;
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const priceVal = priceInput ? priceInput.value.trim() : '';
    const price = priceVal !== '' && !isNaN(Number(priceVal)) ? Number(priceVal) : null;
    modalOptions.push({ label: name, price });
    nameInput.value = '';
    if (priceInput) priceInput.value = '';
    nameInput.focus();
    renderModalOptions();
  }

  const btnAddSingleOpt = $('#btn-add-single-opt');
  if (btnAddSingleOpt) btnAddSingleOpt.addEventListener('click', addSingleOption);

  const newOptNameInput = $('#new-opt-name');
  if (newOptNameInput) {
    newOptNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addSingleOption(); }
    });
  }

  const newOptPriceInput = $('#new-opt-price');
  if (newOptPriceInput) {
    newOptPriceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addSingleOption(); }
    });
  }

  const btnToggleBulk = $('#btn-toggle-bulk-opts');
  if (btnToggleBulk) {
    btnToggleBulk.addEventListener('click', () => {
      const panel = $('#bulk-opts-panel');
      if (!panel) return;
      panel.classList.toggle('hide');
      if (!panel.classList.contains('hide')) {
        $('#bulk-opts-text')?.focus();
      }
    });
  }

  const btnCancelBulk = $('#btn-cancel-bulk-opts');
  if (btnCancelBulk) {
    btnCancelBulk.addEventListener('click', () => {
      $('#bulk-opts-panel')?.classList.add('hide');
    });
  }

  const btnApplyBulk = $('#btn-apply-bulk-opts');
  if (btnApplyBulk) {
    btnApplyBulk.addEventListener('click', () => {
      const text = ($('#bulk-opts-text')?.value || '').trim();
      if (text) {
        const parts = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        parts.forEach((label) => {
          if (!modalOptions.some((x) => x.label.toLowerCase() === label.toLowerCase())) {
            modalOptions.push({ label, price: null });
          }
        });
      }
      const bulkText = $('#bulk-opts-text');
      if (bulkText) bulkText.value = '';
      $('#bulk-opts-panel')?.classList.add('hide');
      renderModalOptions();
    });
  }

  const btnClearAllOpts = $('#btn-clear-all-opts');
  if (btnClearAllOpts) {
    btnClearAllOpts.addEventListener('click', () => {
      if (!modalOptions.length) return;
      if (confirm('Clear all dropdown variations for this product?')) {
        modalOptions = [];
        renderModalOptions();
      }
    });
  }

  const optsItemsList = $('#opts-items-list');
  if (optsItemsList) {
    optsItemsList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del-opt-idx]');
      if (!btn) return;
      const idx = Number(btn.dataset.delOptIdx);
      if (!isNaN(idx) && idx >= 0 && idx < modalOptions.length) {
        modalOptions.splice(idx, 1);
        renderModalOptions();
      }
    });
  }

  function openProductModal(p = null) {
    const isEdit = !!p;
    $('#modal-title').textContent = isEdit ? 'Edit Component' : 'Add New Component';
    $('#prod-id').value = p ? p.id : '';
    $('#prod-name').value = p ? p.name : '';
    $('#prod-category').value = p ? (p.category || 'components').toLowerCase() : 'boards';
    $('#prod-subcategory').value = p ? (p.subcategory || '') : '';
    $('#prod-price').value = p && p.price != null ? p.price : '';
    $('#prod-mrp').value = p && p.mrp != null ? p.mrp : '';
    $('#prod-stock').value = p && p.stock != null ? p.stock : 10;
    $('#prod-icon').value = p && p.icon ? p.icon : 'kit';
    $('#prod-image-url').value = p && p.image_url ? p.image_url : '';
    $('#prod-desc').value = p && p.description ? p.description : '';
    $('#prod-specs').value = p && p.specs ? JSON.stringify(p.specs) : '';
    $('#prod-active').checked = p ? p.is_active !== false : true;
    $('#prod-featured').checked = p ? !!p.featured : false;

    // Load variations
    modalOptions = [];
    if (p && p.options) {
      let raw = p.options;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = []; }
      }
      if (Array.isArray(raw)) {
        modalOptions = raw.map((o) => {
          if (typeof o === 'string') return { label: o.trim(), price: null };
          return {
            label: String(o.label || o.name || '').trim(),
            price: o.price != null && o.price !== '' && !isNaN(Number(o.price)) ? Number(o.price) : null
          };
        }).filter((o) => o.label);
      }
    }
    $('#bulk-opts-panel')?.classList.add('hide');
    const bulkText = $('#bulk-opts-text');
    if (bulkText) bulkText.value = '';
    const nameInput = $('#new-opt-name');
    if (nameInput) nameInput.value = '';
    const priceInput = $('#new-opt-price');
    if (priceInput) priceInput.value = '';
    renderModalOptions();

    updateIconPreview();
    productModal.classList.remove('hide');
  }

  function closeProductModal() {
    productModal.classList.add('hide');
    $('#product-form').reset();
    modalOptions = [];
  }

  // ── Live Icon Preview ──────────────────────────────────
  function updateIconPreview() {
    const box = $('#icon-preview-box');
    const sel = $('#prod-icon');
    if (!box || !sel) return;
    const key = sel.value || 'kit';
    box.innerHTML = window.icon ? window.icon(key) : '';
    // Style the inner SVG to fit the preview box
    const svg = box.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
    }
  }

  const prodIconSelect = $('#prod-icon');
  if (prodIconSelect) {
    prodIconSelect.addEventListener('change', updateIconPreview);
  }

  $('#btn-add-product').addEventListener('click', () => openProductModal(null));
  $('#modal-close-btn').addEventListener('click', closeProductModal);
  $('#modal-cancel-btn').addEventListener('click', closeProductModal);

  $('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#prod-id').value;
    const name = $('#prod-name').value.trim();
    const category = $('#prod-category').value;
    const subcategory = ($('#prod-subcategory').value || '').trim();
    const price = Number($('#prod-price').value);
    const mrp = $('#prod-mrp').value ? Number($('#prod-mrp').value) : null;
    const stock = Number($('#prod-stock').value);
    const icon = $('#prod-icon').value;
    const image_url = $('#prod-image-url').value.trim();
    const description = $('#prod-desc').value.trim();
    const is_active = $('#prod-active').checked;
    const featured = $('#prod-featured').checked;

    let specs = [];
    try {
      const raw = $('#prod-specs').value.trim();
      if (raw) specs = JSON.parse(raw);
    } catch {
      specs = [];
    }

    const options = modalOptions;

    const payload = {
      name,
      category,
      subcategory: subcategory || null,
      price,
      mrp,
      stock,
      icon,
      image_url,
      description,
      specs,
      options,
      is_active,
      featured
    };

    const saveBtn = $('#modal-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    // Helper: attempt save, retry without subcategory if column missing in DB
    async function trySave(tbl, operation, p) {
      let res;
      if (operation === 'update') {
        res = await sb.from(tbl).update(p).eq('id', id).select().single();
      } else {
        res = await sb.from(tbl).insert(p).select().single();
      }
      if (res.error && (res.error.message.includes('subcategory') || res.error.message.includes('schema cache'))) {
        // Column not yet in DB — retry without subcategory
        const { subcategory: _sc, ...pFallback } = p;
        if (operation === 'update') {
          res = await sb.from(tbl).update(pFallback).eq('id', id).select().single();
        } else {
          res = await sb.from(tbl).insert(pFallback).select().single();
        }
      }
      return res;
    }

    try {
      if (isDemo) {
        if (id) {
          products = products.map((x) => String(x.id) === String(id) ? { ...x, ...payload } : x);
        } else {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('prod-' + Date.now().toString(36));
          payload.id = slug;
          payload.sku = slug.toUpperCase();
          payload.sort_order = 100;
          products.push(payload);
        }
        localStorage.setItem('voltnest_demo_products', JSON.stringify(products));
        closeProductModal();
        renderProducts();
        updateMetrics();
        return;
      }

      if (id) {
        // Update existing
        const { data, error } = await trySave('products', 'update', payload);
        if (error) throw error;
        products = products.map((x) => String(x.id) === String(id) ? { ...x, ...data } : x);
      } else {
        // Create new with slug-based ID
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('prod-' + Date.now().toString(36));
        payload.id = slug;
        payload.sku = slug.toUpperCase();
        payload.sort_order = 100;
        const { data, error } = await trySave('products', 'insert', payload);
        if (error) throw error;
        products.push({ ...payload, ...data });
      }

      closeProductModal();
      renderProducts();
      updateMetrics();
    } catch (err) {
      alert('Error saving product: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Component';
    }
  });

  /* ---------------- ORDERS MANAGEMENT ---------------- */
  async function loadOrders() {
    if (isDemo) {
      const saved = localStorage.getItem('voltnest_orders');
      if (saved) {
        try { orders = JSON.parse(saved); } catch { orders = []; }
      }
      if (!orders || !orders.length) {
        orders = [
          {
            id: 'ord-demo-1',
            order_code: 'ORD-8K2A1',
            customer_name: 'Rohan Sharma',
            phone: '9876543210',
            college: 'Sharda University',
            fulfilment: 'pickup',
            status: 'new',
            total: 1098,
            subtotal: 1098,
            delivery_fee: 0,
            created_at: new Date(Date.now() - 3600000).toISOString(),
            items: [{ name: 'ESP32 DevKit V1', qty: 2, price: 549 }]
          },
          {
            id: 'ord-demo-2',
            order_code: 'ORD-5M9B2',
            customer_name: 'Priya Verma',
            phone: '9123456780',
            college: 'Galgotias University',
            fulfilment: 'delivery',
            area: 'Knowledge Park II',
            status: 'confirmed',
            total: 629,
            subtotal: 599,
            delivery_fee: 30,
            created_at: new Date(Date.now() - 14400000).toISOString(),
            items: [{ name: 'Arduino Uno R3', qty: 1, price: 599 }]
          },
          {
            id: 'bom-demo-3',
            order_code: 'BOM-7X4K9',
            customer_name: 'Aman Gupta',
            phone: '9811223344',
            college: 'Galgotias University',
            fulfilment: 'pickup',
            status: 'new',
            total: 0,
            subtotal: 0,
            delivery_fee: 0,
            notes: '[Custom Component / BOM Sourcing Request] · [Urgency: Today / Tomorrow (Urgent)] · Need for embedded systems lab',
            created_at: new Date(Date.now() - 1800000).toISOString(),
            items: [
              { name: 'Arduino Nano V3 (ATmega328P)', qty: 2, price: 0, is_custom: true },
              { name: 'SIM800L GSM/GPRS Module', qty: 1, price: 0, is_custom: true },
              { name: '0.96 inch I2C OLED Display', qty: 1, price: 0, is_custom: true }
            ]
          }
        ];
        localStorage.setItem('voltnest_orders', JSON.stringify(orders));
      }
      updateMetrics();
      renderOrders();
      return;
    }

    if (!sb) return;
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error loading orders:', error);
      return;
    }
    orders = data || [];
    updateMetrics();
    renderOrders();
  }

  function renderOrders() {
    const container = $('#orders-list');
    const term = ($('#search-orders').value || '').trim().toLowerCase();
    const filterStatus = $('#filter-order-status').value;

    const filtered = orders.filter((o) => {
      const code = String(o.order_code || o.code || '');
      const isCustom = code.startsWith('BOM-') || code.startsWith('REQ-') || (o.notes && o.notes.includes('BOM')) || (Array.isArray(o.items) && o.items.some((it) => it.is_custom));

      let statusMatch = false;
      if (filterStatus === 'all') statusMatch = true;
      else if (filterStatus === 'custom') statusMatch = isCustom;
      else if (filterStatus === 'new') statusMatch = o.status === 'new' || o.status === 'pending';
      else statusMatch = o.status === filterStatus;

      if (!statusMatch) return false;

      const q = `${code} ${o.customer_name || o.name || ''} ${o.phone || ''} ${o.college || ''} ${o.area || ''} ${o.notes || ''}`.toLowerCase();
      return q.includes(term);
    });

    if (!filtered.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--admin-muted);padding:40px">No matching orders found.</div>';
      return;
    }

    container.innerHTML = filtered.map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      const isDelivery = String(o.fulfilment || o.method || '').toLowerCase().includes('delivery');
      const phoneDigits = cleanPhone(o.phone);
      const code = String(o.order_code || o.code || 'ORD-');
      const custName = o.customer_name || o.name || 'Customer';
      const isCustom = code.startsWith('BOM-') || code.startsWith('REQ-') || (o.notes && o.notes.includes('BOM')) || items.some((it) => it.is_custom);
      const attachedFile = items.find((it) => it.file)?.file;

      // WhatsApp message template based on current status & request type
      let waText = `Hi ${custName}! VoltNest here regarding your order *${code}*.\n`;
      if (isCustom) {
        waText = `Hi ${custName}! VoltNest here regarding your Custom Component / BOM request *${code}*.\n\n` +
          `We received your request for:\n` +
          items.map((it) => `• ${it.qty || 1}× ${it.name}`).join('\n') +
          `\n\nWe have checked with our suppliers in Greater Noida. Here is the availability and quote: `;
      } else if (o.status === 'new' || o.status === 'pending') {
        waText += `We have received your order request for ${items.length} item(s) totaling ${inr(o.total)}. We are confirming stock and will share 40% advance payment details shortly!`;
      } else if (o.status === 'confirmed') {
        const advAmt = Math.round(o.total * 0.4);
        waText += `Your order has been confirmed! Please transfer 40% advance payment (${inr(advAmt)}) so our team can pack and prepare your shipment. Remaining balance is paid on ${isDelivery ? 'delivery' : 'pickup'}.`;
      } else if (o.status === 'ready') {
        waText += isDelivery
          ? `Your shipment is ready and on the way for delivery!`
          : `Your shipment is ready for pickup at our Knowledge Park location. Bring your order code!`;
      }

      const waUrl = `https://wa.me/91${phoneDigits}?text=${encodeURIComponent(waText)}`;

      return `<div class="order-box">
        <div class="order-box-head">
          <div class="order-code-title">
            <span>${esc(code)}</span>
            <span class="status-pill ${esc(o.status)}">${o.status === 'ready' ? 'Shipment Ready' : esc(o.status)}</span>
            ${isCustom ? `<span class="status-pill" style="background:rgba(55,230,208,0.18);color:var(--admin-cyan);border:1px solid rgba(55,230,208,0.3)">📋 Custom BOM</span>` : ''}
          </div>
          <span style="color:var(--admin-muted);font-size:0.82rem">${formatIST(o.created_at)}</span>
        </div>

        <div class="order-meta-grid">
          <div class="order-meta-block">
            <span>Customer</span>
            <b>${esc(custName)}</b>
            <div style="color:var(--admin-muted);font-size:0.8rem">${esc(o.phone)}</div>
            ${o.email ? `<div style="color:var(--admin-muted);font-size:0.8rem">${esc(o.email)}</div>` : ''}
          </div>
          <div class="order-meta-block">
            <span>Fulfilment & Location</span>
            <b style="color:${isDelivery ? 'var(--admin-cyan)' : 'var(--admin-lime)'}">
              ${isDelivery ? '🚚 Delivery' : '📍 Pickup'}
            </b>
            ${o.college ? `<div style="font-size:0.8rem">${esc(o.college)}</div>` : ''}
            ${o.area ? `<div style="color:var(--admin-muted);font-size:0.8rem">${esc(o.area)}</div>` : ''}
            ${o.address ? `<div style="color:var(--admin-subtle);font-size:0.78rem">${esc(o.address)}</div>` : ''}
          </div>
          <div class="order-meta-block">
            <span>Payment Breakdown</span>
            ${isCustom ? `
              <b style="color:var(--admin-cyan)">Quote on WhatsApp</b>
              <div style="font-size:0.8rem;color:var(--admin-muted)">Out-of-stock / Sourcing parts</div>
              <div style="font-size:0.78rem;color:var(--admin-green)">Payment on delivery</div>
            ` : `
              <b>${inr(o.total)} total</b>
              <div style="font-size:0.82rem;color:var(--admin-cyan);font-weight:600">40% Advance: ${inr(Math.round(o.total * 0.4))}</div>
              <div style="font-size:0.78rem;color:var(--admin-muted)">Balance on ${isDelivery ? 'delivery' : 'pickup'}: ${inr(o.total - Math.round(o.total * 0.4))}</div>
            `}
          </div>
        </div>

        ${o.notes ? `<div style="background:rgba(255,184,59,0.08);border:1px solid rgba(255,184,59,0.2);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.82rem;color:#fce4a6"><b>Customer Note / Urgency:</b> ${esc(o.notes)}</div>` : ''}

        ${attachedFile ? `
          <div style="background:rgba(55,230,208,0.06);border:1px solid rgba(55,230,208,0.2);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <span style="font-size:0.85rem">📎 <b>Attached File:</b> ${esc(attachedFile.name)} (${Math.round((attachedFile.size || 0) / 1024)} KB)</span>
            ${attachedFile.dataUrl ? `<a href="${esc(attachedFile.dataUrl)}" download="${esc(attachedFile.name)}" class="admin-btn sm" target="_blank" style="font-size:0.78rem">⬇ View / Download File</a>` : ''}
          </div>
        ` : ''}

        <div class="order-items-table">
          ${items.map((it) => `
            <div class="order-item-line">
              <span>
                <b>${it.qty || it.quantity || 1} ×</b> ${esc(it.name)}
                ${it.option ? `<span class="opt">(${esc(it.option)})</span>` : ''}
                ${it.is_custom ? '<span style="font-size:0.75rem;color:var(--admin-cyan);margin-left:6px">[Custom]</span>' : ''}
              </span>
              <span>${it.is_custom ? '<span style="color:var(--admin-muted)">To Quote</span>' : inr((Number(it.price || it.unit_price) || 0) * (it.qty || it.quantity || 1))}</span>
            </div>
          `).join('')}
        </div>

        <div class="order-actions-bar">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:0.82rem;color:var(--admin-muted)">Status:</span>
            <select class="admin-select" style="width:auto;padding:6px 12px" data-order-status="${esc(o.id)}">
              <option value="new" ${o.status === 'new' ? 'selected' : ''}>New</option>
              <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="ready" ${o.status === 'ready' ? 'selected' : ''}>Shipment Ready</option>
              <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled (Restores Stock)</option>
            </select>
          </div>
          <div style="display:flex;gap:8px">
            <a class="admin-btn sm" href="${waUrl}" target="_blank" rel="noopener">WhatsApp Customer ↗</a>
            <button class="admin-btn sm" data-copy-phone="${esc(o.phone)}">Copy Phone</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  $('#search-orders').addEventListener('input', renderOrders);
  $('#filter-order-status').addEventListener('change', renderOrders);
  $('#refresh-orders').addEventListener('click', loadOrders);

  // Status Change & Copy Phone handlers
  $('#orders-list').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-order-status]');
    if (!sel) return;
    const orderId = sel.dataset.orderStatus;
    const newStatus = sel.value;

    if (isDemo) {
      const o = orders.find((x) => String(x.id) === String(orderId));
      if (o) o.status = newStatus;
      localStorage.setItem('voltnest_orders', JSON.stringify(orders));
      renderOrders();
      updateMetrics();
      return;
    }

    const { error } = await sb.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (!error) {
      const o = orders.find((x) => String(x.id) === String(orderId));
      if (o) o.status = newStatus;
      renderOrders();
      updateMetrics();
      // If order was cancelled, reload products as stock might have been restored by Postgres trigger
      if (newStatus === 'cancelled') loadProducts();
    } else {
      alert('Could not update status: ' + error.message);
      loadOrders();
    }
  });

  $('#orders-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy-phone]');
    if (btn) {
      const phone = btn.dataset.copyPhone;
      navigator.clipboard.writeText(phone).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    }
  });

  /* ---------------- STORE SETTINGS ---------------- */
  async function loadSettings() {
    if (isDemo) {
      const saved = localStorage.getItem('voltnest_settings');
      let data = null;
      if (saved) {
        try { data = JSON.parse(saved); } catch {}
      }
      data = data || {
        store_name: 'VoltNest',
        whatsapp: '919876543210',
        tagline: 'Electronic parts for students in Greater Noida. Order online, pay when you pick up.',
        pickup_address: 'Knowledge Park II, Greater Noida (near Metro Station)',
        pickup_hours: 'Mon–Sat, 10:00 AM – 8:00 PM',
        delivery_fee: 30,
        free_delivery_above: 500,
        announcement: 'Student discount active · Instant pickup available in Knowledge Park',
        delivery_enabled: true
      };
      $('#cfg-name').value = data.store_name || 'VoltNest';
      $('#cfg-whatsapp').value = data.whatsapp || '';
      if ($('#cfg-email')) $('#cfg-email').value = data.email || 'support@voltnest.in';
      if ($('#cfg-instagram')) $('#cfg-instagram').value = data.instagram || 'voltnest.in';
      $('#cfg-tagline').value = data.tagline || '';
      $('#cfg-pickup-addr').value = data.pickup_address || '';
      $('#cfg-pickup-hours').value = data.pickup_hours || '';
      $('#cfg-fee').value = data.delivery_fee != null ? data.delivery_fee : 30;
      $('#cfg-free-above').value = data.free_delivery_above != null ? data.free_delivery_above : 500;
      $('#cfg-announce').value = data.announcement || '';
      $('#cfg-delivery-enabled').checked = data.delivery_enabled !== false;
      return;
    }

    if (!sb) return;
    const { data } = await sb.from('store_settings').select('*').limit(1).maybeSingle();
    if (!data) return;

    let localExtra = {};
    try { localExtra = JSON.parse(localStorage.getItem('voltnest_settings') || '{}'); } catch {}

    $('#cfg-name').value = data.store_name || 'VoltNest';
    $('#cfg-whatsapp').value = data.whatsapp || '';
    if ($('#cfg-email')) $('#cfg-email').value = data.email || localExtra.email || 'support@voltnest.in';
    if ($('#cfg-instagram')) $('#cfg-instagram').value = data.instagram || localExtra.instagram || 'voltnest.in';
    $('#cfg-tagline').value = data.tagline || '';
    $('#cfg-pickup-addr').value = data.pickup_address || '';
    $('#cfg-pickup-hours').value = data.pickup_hours || '';
    $('#cfg-fee').value = data.delivery_fee != null ? data.delivery_fee : 30;
    $('#cfg-free-above').value = data.free_delivery_above != null ? data.free_delivery_above : 500;
    $('#cfg-announce').value = data.announcement || '';
    $('#cfg-delivery-enabled').checked = data.delivery_enabled !== false;
  }

  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#save-settings-btn');
    const feedback = $('#settings-feedback');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    feedback.textContent = '';

    const payload = {
      store_name: $('#cfg-name').value.trim(),
      whatsapp: $('#cfg-whatsapp').value.trim(),
      tagline: $('#cfg-tagline').value.trim(),
      pickup_address: $('#cfg-pickup-addr').value.trim(),
      pickup_hours: $('#cfg-pickup-hours').value.trim(),
      delivery_fee: Number($('#cfg-fee').value) || 0,
      free_delivery_above: Number($('#cfg-free-above').value) || 0,
      announcement: $('#cfg-announce').value.trim(),
      delivery_enabled: $('#cfg-delivery-enabled').checked
    };
    const localExtra = {
      email: ($('#cfg-email')?.value || '').trim() || 'support@voltnest.in',
      instagram: ($('#cfg-instagram')?.value || '').trim().replace(/^@/, '') || 'voltnest.in'
    };

    // Always keep a local copy so settings are immediately reflected across frontend pages
    localStorage.setItem('voltnest_settings', JSON.stringify({ ...payload, ...localExtra }));

    if (isDemo) {
      btn.disabled = false;
      btn.textContent = 'Save Store Settings';
      feedback.style.color = 'var(--admin-green)';
      feedback.textContent = 'Settings saved locally!';
      setTimeout(() => { feedback.textContent = ''; }, 3000);
      return;
    }

    // Attempt save to Supabase with email and instagram included
    let { error } = await sb.from('store_settings').update({ ...payload, ...localExtra }).eq('id', 'store');

    // If Supabase schema does not have email/instagram columns yet, fallback to saving standard fields
    if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
      const retry = await sb.from('store_settings').update(payload).eq('id', 'store');
      error = retry.error;
    }

    btn.disabled = false;
    btn.textContent = 'Save Store Settings';

    if (!error) {
      feedback.style.color = 'var(--admin-green)';
      feedback.textContent = 'Settings saved successfully!';
      setTimeout(() => { feedback.textContent = ''; }, 3000);
    } else {
      feedback.style.color = 'var(--admin-red)';
      feedback.textContent = 'Save failed: ' + error.message;
    }
  });

  /* ---------------- PROJECT KITS MANAGEMENT ---------------- */
  const DEFAULT_DEMO_KITS = [
    {
      id: 'kit-arduino-starter',
      name: 'Arduino DIY Starter Kit',
      category: 'kit',
      description: 'Hands-on starter pack for microcontrollers, sensors, and breadboard prototyping.',
      price: 899,
      mrp: 1199,
      stock: 8,
      icon: 'kit',
      image_url: '',
      is_active: true,
      featured: true,
      specs: [
        '1× Arduino Uno R3',
        '1× MB-102 830-Point Breadboard',
        '40× Jumper Wires (M-M)',
        '1× DHT11 Temp/Humidity Sensor',
        '1× 16×2 LCD Display with I2C',
        '10× Resistors & 5× LEDs'
      ]
    },
    {
      id: 'kit-esp32-weather',
      name: 'ESP32 IoT Weather Station Kit',
      category: 'kit',
      description: 'Connect to Wi-Fi, read live temperature/humidity, and show live telemetry on an OLED screen.',
      price: 1249,
      mrp: 1599,
      stock: 5,
      icon: 'kit',
      image_url: '',
      is_active: true,
      featured: true,
      specs: [
        '1× ESP32 NodeMCU Dev Board',
        '1× 0.96" I2C OLED Display',
        '1× DHT11 Sensor',
        '1× 400-Point Breadboard',
        '20× Jumper Wires (M-F)'
      ]
    },
    {
      id: 'kit-water-quality',
      name: 'Smart Water Quality Monitor Kit',
      category: 'kit',
      description: 'Measure TDS, turbidity, and water temperature. A classic engineering project.',
      price: 1799,
      mrp: 2200,
      stock: 4,
      icon: 'kit',
      image_url: '',
      is_active: true,
      featured: false,
      specs: [
        '1× ESP32 DevKit V1',
        '1× Analog TDS Sensor Module',
        '1× Turbidity Sensor Module',
        '1× DS18B20 Waterproof Probe',
        '1× Breadboard & Jumpers'
      ]
    }
  ];

  async function loadKits() {
    if (isDemo) {
      const saved = localStorage.getItem('voltnest_demo_kits');
      if (saved) {
        try { kits = JSON.parse(saved); } catch { kits = []; }
      }
      if (!kits || !kits.length) {
        kits = JSON.parse(JSON.stringify(DEFAULT_DEMO_KITS));
        localStorage.setItem('voltnest_demo_kits', JSON.stringify(kits));
      }
      updateMetrics();
      renderKits();
      return;
    }

    if (!sb) return;
    const { data, error } = await sb
      .from('products')
      .select('*')
      .eq('category', 'kit')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading kits:', error);
      return;
    }
    kits = data || [];
    updateMetrics();
    renderKits();
  }

  function getKitComponentsArray(k) {
    if (!k || !k.specs) return [];
    if (Array.isArray(k.specs)) {
      return k.specs.map((s) => {
        if (typeof s === 'string') return s;
        if (Array.isArray(s)) return s.filter(Boolean).join(': ');
        if (typeof s === 'object' && s !== null) return s.label || s.name || s.k || JSON.stringify(s);
        return String(s);
      }).filter(Boolean);
    }
    if (typeof k.specs === 'string') {
      try {
        const parsed = JSON.parse(k.specs);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {}
      return k.specs.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  function renderKits() {
    const tbody = $('#kits-tbody');
    if (!tbody) return;
    const term = ($('#search-kits')?.value || '').trim().toLowerCase();

    const filtered = kits.filter((k) => {
      const comps = getKitComponentsArray(k).join(' ');
      const q = `${k.name} ${k.description || ''} ${comps}`.toLowerCase();
      return q.includes(term);
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--admin-muted);padding:30px">No readymade projects found. Click "+ Add Readymade Project" above to create one.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((k) => {
      const stock = Number(k.stock) || 0;
      let stockCls = 'in', stockText = `${stock} in stock`;
      if (stock === 0) { stockCls = 'out'; stockText = 'Sold out'; }
      else if (stock <= 5) { stockCls = 'low'; stockText = `Low (${stock})`; }

      const iconSvg = window.icon ? window.icon(k.icon || 'kit') : '⚡';
      const comps = getKitComponentsArray(k);
      const compsPreview = comps.length ? comps.slice(0, 3).map(esc).join('<br>') + (comps.length > 3 ? `<br><small style="color:var(--admin-muted)">+${comps.length - 3} more</small>` : '') : '<span style="color:var(--admin-muted)">—</span>';

      return `<tr>
        <td>
          <div class="prod-cell">
            <div class="prod-thumb">${k.image_url ? `<img src="${esc(k.image_url)}" alt="">` : iconSvg}</div>
            <div>
              <div class="prod-title">${esc(k.name)}</div>
              <div class="prod-sku">${k.featured ? '<span style="color:var(--admin-yellow);font-size:0.75rem;font-weight:600">★ Featured</span> · ' : ''}${esc(k.id)}</div>
            </div>
          </div>
        </td>
        <td style="font-weight:700;color:#fff">${inr(k.price)}</td>
        <td style="color:var(--admin-muted)">${k.mrp ? inr(k.mrp) : '—'}</td>
        <td><span class="stock-tag ${stockCls}">${stockText}</span></td>
        <td style="font-size:0.82rem;line-height:1.4">${compsPreview}</td>
        <td>
          <span class="status-pill ${k.is_active ? 'completed' : 'cancelled'}" style="cursor:pointer" data-toggle-kit-live="${esc(k.id)}">
            ${k.is_active ? '● Live' : '○ Hidden'}
          </span>
        </td>
        <td style="text-align:right">
          <button class="admin-btn sm" data-edit-kit="${esc(k.id)}">Edit</button>
          <button class="admin-btn sm danger" data-delete-kit="${esc(k.id)}" style="margin-left:6px">Delete</button>
        </td>
      </tr>`;
    }).join('');
  }

  const searchKitsInput = $('#search-kits');
  if (searchKitsInput) searchKitsInput.addEventListener('input', renderKits);

  const refreshKitsBtn = $('#refresh-kits');
  if (refreshKitsBtn) refreshKitsBtn.addEventListener('click', loadKits);

  // Table Actions for Kits: Toggle Live, Edit, Delete
  const kitsTbody = $('#kits-tbody');
  if (kitsTbody) {
    kitsTbody.addEventListener('click', async (e) => {
      const toggleBtn = e.target.closest('[data-toggle-kit-live]');
      const editBtn = e.target.closest('[data-edit-kit]');
      const delBtn = e.target.closest('[data-delete-kit]');

      if (toggleBtn) {
        const id = toggleBtn.dataset.toggleKitLive;
        const k = kits.find((x) => String(x.id) === String(id));
        if (!k) return;
        const newActive = !k.is_active;

        if (isDemo) {
          k.is_active = newActive;
          localStorage.setItem('voltnest_demo_kits', JSON.stringify(kits));
          renderKits();
          updateMetrics();
          return;
        }

        const { error } = await sb.from('products').update({ is_active: newActive }).eq('id', id);
        if (!error) {
          k.is_active = newActive;
          renderKits();
          updateMetrics();
        } else {
          alert('Could not update project status: ' + error.message);
        }
        return;
      }

      if (editBtn) {
        const id = editBtn.dataset.editKit;
        const k = kits.find((x) => String(x.id) === String(id));
        if (k) openKitModal(k);
        return;
      }

      if (delBtn) {
        const id = delBtn.dataset.deleteKit;
        const k = kits.find((x) => String(x.id) === String(id));
        if (!k) return;
        if (!confirm(`Are you sure you want to delete project "${k.name}"?`)) return;

        if (isDemo) {
          kits = kits.filter((x) => String(x.id) !== String(id));
          localStorage.setItem('voltnest_demo_kits', JSON.stringify(kits));
          renderKits();
          updateMetrics();
          return;
        }

        const { error } = await sb.from('products').delete().eq('id', id);
        if (!error) {
          kits = kits.filter((x) => String(x.id) !== String(id));
          renderKits();
          updateMetrics();
        } else {
          alert('Could not delete project: ' + error.message);
        }
      }
    });
  }

  /* ---------------- READYMADE PROJECT ADD / EDIT MODAL ---------------- */
  const kitModal = $('#kit-modal');
  function openKitModal(k = null) {
    if (!kitModal) return;
    const isEdit = !!k;
    $('#kit-modal-title').textContent = isEdit ? 'Edit Readymade Project' : 'Add Readymade Project';
    $('#kit-id').value = k ? k.id : '';
    $('#kit-name').value = k ? k.name : '';
    $('#kit-price').value = k && k.price != null ? k.price : '';
    $('#kit-mrp').value = k && k.mrp != null ? k.mrp : '';
    $('#kit-stock').value = k && k.stock != null ? k.stock : 10;
    $('#kit-desc').value = k && k.description ? k.description : '';
    $('#kit-image-url').value = k && k.image_url ? k.image_url : '';
    $('#kit-active').checked = k ? k.is_active !== false : true;
    $('#kit-featured').checked = k ? !!k.featured : false;

    const comps = getKitComponentsArray(k);
    $('#kit-components').value = comps.join('\n');

    kitModal.classList.remove('hide');
  }

  function closeKitModal() {
    if (!kitModal) return;
    kitModal.classList.add('hide');
    const form = $('#kit-form');
    if (form) form.reset();
  }

  const btnAddKit = $('#btn-add-kit');
  if (btnAddKit) btnAddKit.addEventListener('click', () => openKitModal(null));

  const kitModalCloseBtn = $('#kit-modal-close-btn');
  if (kitModalCloseBtn) kitModalCloseBtn.addEventListener('click', closeKitModal);

  const kitModalCancelBtn = $('#kit-modal-cancel-btn');
  if (kitModalCancelBtn) kitModalCancelBtn.addEventListener('click', closeKitModal);

  const kitForm = $('#kit-form');
  if (kitForm) {
    kitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('#kit-id').value;
      const name = $('#kit-name').value.trim();
      const price = Number($('#kit-price').value);
      const mrp = $('#kit-mrp').value ? Number($('#kit-mrp').value) : null;
      const stock = Number($('#kit-stock').value);
      const description = $('#kit-desc').value.trim();
      const image_url = $('#kit-image-url').value.trim();
      const is_active = $('#kit-active').checked;
      const featured = $('#kit-featured').checked;

      const specs = $('#kit-components').value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name,
        category: 'kit',
        price,
        mrp,
        stock,
        description,
        specs,
        options: [],
        icon: 'kit',
        image_url,
        is_active,
        featured,
        sort_order: 10
      };

      const saveBtn = $('#kit-modal-save-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }

      try {
        if (isDemo) {
          if (id) {
            kits = kits.map((x) => String(x.id) === String(id) ? { ...x, ...payload } : x);
          } else {
            const slug = 'kit-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now().toString(36));
            payload.id = slug;
            payload.sku = slug.toUpperCase();
            kits.push(payload);
          }
          localStorage.setItem('voltnest_demo_kits', JSON.stringify(kits));
          closeKitModal();
          renderKits();
          updateMetrics();
          return;
        }

        if (id) {
          // Update existing kit in Supabase products table
          const { data, error } = await sb.from('products').update(payload).eq('id', id).select().single();
          if (error) throw error;
          kits = kits.map((x) => String(x.id) === String(id) ? data : x);
        } else {
          // Create new kit with slug id in Supabase products table
          const slug = 'kit-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now().toString(36));
          payload.id = slug;
          payload.sku = slug.toUpperCase();
          const { data, error } = await sb.from('products').insert(payload).select().single();
          if (error) throw error;
          kits.push(data);
        }

        closeKitModal();
        renderKits();
        updateMetrics();
      } catch (err) {
        alert('Error saving project: ' + err.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Readymade Project';
        }
      }
    });
  }

  /* ---------------- METRICS HELPER ---------------- */
  function updateMetrics() {
    const liveCount = products.filter((p) => p.is_active).length;
    const lowStockCount = products.filter((p) => Number(p.stock) <= 5).length;
    const pendingOrdersCount = orders.filter((o) => o.status === 'new' || o.status === 'pending').length;

    $('#stat-products').textContent = liveCount;
    $('#stat-products-desc').textContent = `${products.length} total in catalogue`;
    $('#stat-low-stock').textContent = lowStockCount;
    $('#stat-pending-orders').textContent = pendingOrdersCount;
    $('#stat-total-orders').textContent = orders.length;

    $('#badge-products').textContent = products.length;
    $('#badge-orders').textContent = pendingOrdersCount;
    const badgeKits = $('#badge-kits');
    if (badgeKits) badgeKits.textContent = kits.length;
  }

  // Start initialization
  initAuth();
})();
