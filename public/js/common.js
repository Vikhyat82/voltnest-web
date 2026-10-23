/* Shared storefront code: API, cart, header/footer, toasts, scroll animations. */
(function () {
  document.documentElement.classList.add('js');
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const CATS = {
    boards: { label: 'Boards & MCUs', icon: 'esp', blurb: 'ESP32, ESP8266, Arduino' },
    sensors: { label: 'Sensors', icon: 'sensor', blurb: 'Water, motion, temperature, ECG' },
    displays: { label: 'Displays', icon: 'oled', blurb: 'OLED and LCD screens' },
    components: { label: 'Components', icon: 'resistor', blurb: 'Resistors, capacitors, ICs, LEDs' },
    prototyping: { label: 'Prototyping', icon: 'breadboard', blurb: 'Breadboards, wires, perfboards' },
    power: { label: 'Power', icon: 'lipo', blurb: 'LiPo, 9 V, transformers' },
    tools: { label: 'Tools', icon: 'meter', blurb: 'Multimeter, soldering kit' },
    kit: { label: 'Projects', icon: 'kit', blurb: 'Readymade working hardware models' }
  };

  // ---------- API ----------
  async function api(url, opts = {}) {
    const o = { credentials: 'same-origin', ...opts, headers: { Accept: 'application/json', 'X-Requested-With': 'fetch', ...(opts.headers || {}) } };
    if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
    if (o.body) o.headers['Content-Type'] = 'application/json';
    let r;
    try { r = await fetch(url, o); } catch { const e = new Error('Network problem. Check your internet and try again.'); e.status = 0; throw e; }
    let d = null; try { d = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((d && d.error) || 'Something went wrong'); e.status = r.status; throw e; }
    return d;
  }
  let cfgP, prodP;
  const getConfig = () => cfgP || (cfgP = Backend.config().then((c) => { store.set('vn_store', c.storeName); return c; }));
  const getProducts = () => prodP || (prodP = Backend.products());

  // ---------- Cart (kept in this browser) ----------
  const Cart = {
    key: 'vn_cart_v1',
    read() { const a = store.get(this.key, []); return Array.isArray(a) ? a : []; },
    write(a) { store.set(this.key, a); window.dispatchEvent(new Event('cartchange')); },
    add(id, qty = 1, opt = '') {
      const a = this.read(); const l = a.find((x) => x.id === id && (x.opt || '') === opt);
      if (l) l.qty = Math.min(99, l.qty + qty); else a.push({ id, qty: Math.min(99, qty), opt });
      this.write(a);
    },
    setQty(id, opt, qty) {
      let a = this.read(); const l = a.find((x) => x.id === id && (x.opt || '') === opt);
      if (l) l.qty = Math.max(1, Math.min(99, qty)); this.write(a);
    },
    remove(id, opt) { this.write(this.read().filter((x) => !(x.id === id && (x.opt || '') === opt))); },
    clear() { this.write([]); },
    count() { return this.read().reduce((s, l) => s + l.qty, 0); }
  };

  // ---------- Toast + fly-to-cart ----------
  function toast(msg, type = '') {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2800);
  }
  function fly(from) {
    const cartBtn = $('.cart-btn'); const src = from && from.closest('.pcard,.pd,.kit') && from.closest('.pcard,.pd,.kit').querySelector('svg.ico,img');
    if (!cartBtn || !src || reduced) return;
    const a = src.getBoundingClientRect(), b = cartBtn.getBoundingClientRect();
    const c = src.cloneNode(true); c.classList.add('flyer'); c.style.left = a.left + a.width / 2 - 28 + 'px'; c.style.top = a.top + a.height / 2 - 28 + 'px';
    c.style.animation = 'none'; document.body.appendChild(c);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const an = c.animate([{ transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 }, { transform: `translate(${dx * .6}px,${dy * .3 - 60}px) scale(.8) rotate(120deg)`, opacity: 1, offset: .5 },
      { transform: `translate(${dx}px,${dy}px) scale(.15) rotate(300deg)`, opacity: .2 }], { duration: 750, easing: 'cubic-bezier(.4,0,.6,1)' });
    an.onfinish = () => { c.remove(); const n = $('.cart-count'); if (n) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); } };
  }

  // ---------- Header / footer ----------
  const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="7" width="18" height="18" rx="3" fill="#0e211a" stroke="#b6ff3b" stroke-width="2"/><path d="M11 3v4M16 3v4M21 3v4M11 25v4M16 25v4M21 25v4M3 11h4M3 16h4M3 21h4M25 11h4M25 16h4M25 21h4" stroke="#b6ff3b" stroke-width="2" stroke-linecap="round"/><path d="M17.5 10l-4 6h3l-1 6 4.500-7h-3z" fill="#b6ff3b"/></svg>`;
  const CART_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.600h7.800a2 2 0 0 0 2-1.500L21 8H6"/></svg>`;
  const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.600 15.100L2 22l5-1.300A10 10 0 1 0 12 2zm5.200 14.200c-.2.600-1.300 1.200-1.800 1.200-.5.100-1 .2-3.300-.7-2.800-1.100-4.600-4-4.700-4.200-.1-.2-1.100-1.500-1.100-2.800 0-1.400.7-2 1-2.300.2-.3.500-.3.700-.3h.5c.2 0 .4 0 .6.500l.9 2.200c.1.200.1.400 0 .5l-.4.600-.4.400c-.1.200-.3.300-.1.600.2.300.8 1.300 1.700 2.100 1.200 1 2.100 1.300 2.400 1.500.3.100.5.100.6-.1l.9-1.100c.2-.3.400-.2.700-.1l2 1c.3.100.5.200.5.300.1.300.1.800-.1 1.400z"/></svg>`;

  function pageName() { const p = location.pathname.replace(/\/$/, ''); return p === '' ? '/' : p.replace(/\.html$/, ''); }

  function buildChrome() {
    const name = store.get('vn_store', 'VoltNest');
    const cur = pageName();
    const links = [['/', 'Home'], ['/shop', 'Shop'], ['/#custom-request', 'Upload your list'], ['/contact', 'Contact'], ['/track', 'Track order'], ['/about', 'About']];
    const hd = $('#site-header');
    if (hd) hd.innerHTML = `<a class="skip" href="#main">Skip to content</a><div id="announce"></div>
      <header class="site-header"><div class="container nav">
        <a class="logo" href="/" aria-label="Home">${LOGO}<span data-store>${esc(name)}</span></a>
        <nav class="nav-links" id="navlinks" aria-label="Main">${links.map(([h, t]) => `<a href="${h}" class="${cur === h || (h === '/shop' && cur === '/product') ? 'active' : ''}">${t}</a>`).join('')}</nav>
        <div class="nav-right"><a class="cart-btn" href="/cart" aria-label="Cart">${CART_SVG}<span class="lbl">Cart</span><span class="cart-count" id="cartcount">0</span></a>
        <button class="burger" aria-label="Menu" aria-expanded="false" aria-controls="navlinks"><span></span></button></div>
      </div></header>`;
    const ft = $('#site-footer');
    if (ft) ft.innerHTML = `<footer class="site-footer"><div class="container">
      <div class="f-grid">
        <div><a class="logo" href="/">${LOGO}<span data-store>${esc(name)}</span></a><p id="f-tag" style="margin-top:12px;max-width:320px"></p></div>
        <div><h4>Shop</h4>${Object.entries(CATS).slice(0, 5).map(([k, c]) => `<a href="/shop?cat=${k}">${c.label}</a>`).join('')}<a href="/shop">All products</a></div>
        <div><h4>Help</h4><a href="/contact">Contact us</a><a href="/track">Track your order</a><a href="/about#how">How ordering works</a><a href="/about#faq">FAQ</a><a href="/cart">Your cart</a><a href="/admin.html" style="color:var(--lime)">Owner login →</a></div>
        <div><h4>Pickup & delivery</h4><p id="f-addr">Greater Noida</p><p id="f-hours"></p><p id="f-phone"></p></div>
      </div>
      <div class="f-bottom"><span>© ${new Date().getFullYear()} <span data-store>${esc(name)}</span> · Made for students in Greater Noida</span><span>🚚 Free delivery · GL Bajaj &amp; KCC · Cash / UPI</span></div>
    </div></footer>`;
    const burger = $('.burger'), nav = $('#navlinks');
    if (burger) {
      burger.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
      nav.addEventListener('click', (e) => { if (e.target.closest('a')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });
    }
    // floating buttons + progress
    const bar = document.createElement('div'); bar.id = 'progress'; document.body.appendChild(bar);
    const top = document.createElement('button'); top.id = 'totop'; top.className = 'fab'; top.setAttribute('aria-label', 'Back to top');
    top.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })); document.body.appendChild(top);
    const hdr = $('.site-header');
    let ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const h = document.documentElement; const max = h.scrollHeight - h.clientHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(1, h.scrollTop / max) : 0})`;
        if (hdr) hdr.classList.toggle('scrolled', h.scrollTop > 10);
        top.classList.toggle('show', h.scrollTop > 700);
        ticking = false;
      });
    };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    updateCount();
  }
  function updateCount() { const n = Cart.count(); $$('.cart-count').forEach((e) => { e.textContent = n; }); }
  addEventListener('cartchange', updateCount);
  addEventListener('storage', (e) => { if (e.key === Cart.key) updateCount(); });

  function applyConfig(cfg) {
    $$('[data-store]').forEach((e) => { e.textContent = cfg.storeName; });
    const t = $('body').dataset.title;
    document.title = (t ? t + ' · ' : '') + cfg.storeName + (t ? '' : ' · Student electronics, Greater Noida');
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('#f-tag', cfg.tagline); set('#f-addr', cfg.pickupAddress); set('#f-hours', cfg.pickupHours);
    if (cfg.phone) set('#f-phone', '☎ ' + cfg.phone);
    const an = $('#announce');
    if (an && cfg.announcement) an.innerHTML = `<div class="announce">${esc(cfg.announcement)}</div>`;
    if (cfg.whatsapp && !$('#wa')) {
      const a = document.createElement('a'); a.id = 'wa'; a.className = 'fab'; a.href = `https://wa.me/91${cfg.whatsapp}?text=${encodeURIComponent('Hi ' + cfg.storeName + '! I have a question about an order.')}`;
      a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', 'Chat on WhatsApp'); a.innerHTML = WA_SVG; document.body.appendChild(a);
    }
  }

  // ---------- Scroll animations ----------
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
  const cio = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; cio.unobserve(e.target); countUp(e.target);
  }), { threshold: 0.5 }) : null;
  function countUp(el) {
    const to = Number(el.dataset.count) || 0, suf = el.dataset.suffix || '', dur = reduced ? 1 : 1300, t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 3); el.textContent = (el.dataset.prefix || '') + Math.round(to * e) + suf; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function observe(root = document) {
    $$('.reveal:not(.in)', root).forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
    $$('[data-count]', root).forEach((el) => { if (cio) cio.observe(el); else el.textContent = (el.dataset.prefix || '') + el.dataset.count + (el.dataset.suffix || ''); });
  }
  function initParallax() {
    const items = $$('.fl[data-speed]'); if (!items.length || reduced) return;
    let mx = 0, my = 0, pend = false;
    items.forEach((el) => { el.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)'; });
    const run = () => {
      pend = false;
      items.forEach((el) => {
        const sp = Number(el.dataset.speed) || 0, d = Number(el.dataset.depth) || 0;
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) return;
        el.style.transform = `translate3d(${mx * d}px, ${-r.top * sp + my * d}px, 0)`;
      });
    };
    const q = () => { if (!pend) { pend = true; requestAnimationFrame(run); } };
    addEventListener('scroll', q, { passive: true });
    addEventListener('mousemove', (e) => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; q(); }, { passive: true });
    run();
  }

  // ---------- product helpers ----------
  const stockInfo = (p) => (p.stock <= 0 ? { cls: 'out', t: 'Sold out' } : p.stock <= 5 ? { cls: 'low', t: 'Only ' + p.stock + ' left' } : { cls: 'ok', t: 'In stock' });
  const priceVaries = (p) => p.options.length > 1 && p.options.some((o) => o.price !== p.options[0].price);
  function productCard(p, i = 0) {
    const s = stockInfo(p), has = p.options.length > 0;
    const disc = p.mrp && p.mrp > p.price && !has ? Math.round((1 - p.price / p.mrp) * 100) : 0;
    const href = '/product?id=' + encodeURIComponent(p.id);
    const media = p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : `<div class="pico" style="--bd:${(i % 6) * -0.7}s">${window.icon(p.icon)}</div>`;
    const act = p.stock <= 0 ? '<button class="btn sm dark" disabled>Sold out</button>'
      : has ? `<a class="btn sm ghost" href="${href}">Choose option</a>`
        : `<button class="btn sm" data-add="${esc(p.id)}">Add to cart</button>`;
    return `<article class="card pcard reveal" style="--d:${(i % 4) * 0.07}s">
      <a class="pthumb" href="${href}" aria-label="${esc(p.name)}"><span class="badge ${s.cls}">${s.t}</span>${disc ? `<span class="off">-${disc}%</span>` : ''}${media}</a>
      <div class="pbody"><span class="pcat">${esc((CATS[p.category] || {}).label || p.category)}${p.subcategory ? ` <span style="opacity:0.6">· ${esc(p.subcategory)}</span>` : ''}</span>
        <h3><a href="${href}">${esc(p.name)}</a></h3>
        <div class="pprice">${priceVaries(p) ? `<small>from</small><b>${inr(p.from_price)}</b>` : `<b>${inr(p.price)}</b>`}${p.mrp && p.mrp > p.price && !has ? `<s>${inr(p.mrp)}</s>` : ''}</div>
        <div class="pact">${act}</div></div></article>`;
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    const id = b.dataset.add; const ps = await getProducts(); const p = ps.find((x) => x.id === id);
    if (!p || p.stock <= 0) return toast('Sorry, that item is sold out', 'err');
    const inCart = Cart.read().filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0);
    if (inCart >= p.stock) return toast(`Only ${p.stock} in stock. You already have them in your cart.`, 'err');
    Cart.add(id, 1, ''); fly(b); toast(`Added “${p.name}” to cart`);
  });


  // Turn the saved cart into priced lines using the live catalogue. Drops items that no longer exist.
  function resolveCart(ps) {
    const by = Object.fromEntries(ps.map((p) => [p.id, p]));
    const lines = []; let dropped = 0;
    for (const l of Cart.read()) {
      const p = by[l.id]; if (!p) { dropped++; continue; }
      let price = p.price, opt = l.opt || '';
      if (p.options.length) { const o = p.options.find((x) => x.label === opt); if (!o) { dropped++; continue; } price = o.price; } else opt = '';
      lines.push({ p, opt, qty: l.qty, price });
    }
    if (dropped) Cart.write(lines.map((l) => ({ id: l.p.id, qty: l.qty, opt: l.opt })));
    return { lines, dropped };
  }
  // How many more of this line's product can be added (stock is shared across options).
  const availableFor = (lines, line) => line.p.stock - lines.filter((l) => l !== line && l.p.id === line.p.id).reduce((s, l) => s + l.qty, 0);

  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());
  ready(() => {
    $$('[data-icon]').forEach((el) => { el.innerHTML = window.icon(el.dataset.icon); });
    buildChrome(); observe(); initParallax();
    getConfig().then(applyConfig).catch(() => {});
  });

  window.VN = { $, $$, esc, inr, api, Cart, toast, fly, CATS, getConfig, getProducts, productCard, stockInfo, observe, ready, store, reduced, priceVaries, resolveCart, availableFor };
})();
