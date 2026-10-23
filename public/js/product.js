(function () {
  const { $, esc, inr, Cart, toast, fly, CATS, getProducts, getConfig, productCard, stockInfo, observe, priceVaries } = VN;
  const id = new URLSearchParams(location.search).get('id');
  const root = $('#pd');

  function notFound() {
    root.innerHTML = '<div class="empty"><div data-icon="kit"></div><h2>Product not found</h2><p>It may have been removed or sold out for good.</p><p style="margin-top:16px"><a class="btn" href="/shop">Back to the shop</a></p></div>';
    root.querySelectorAll('[data-icon]').forEach((e) => { e.innerHTML = window.icon(e.dataset.icon); });
  }

  function render(p, all) {
    const cat = CATS[p.category] || { label: p.category };
    const has = p.options.length > 0, s = stockInfo(p);
    const media = p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : window.icon(p.icon);
    root.innerHTML = `<div class="crumbs"><a href="/shop">Shop</a> / <a href="/shop?cat=${esc(p.category)}">${esc(cat.label)}</a> / ${esc(p.name)}</div>
    <div class="pd">
      <div class="pd-media reveal" data-anim="zoom">${media}</div>
      <div class="reveal" data-anim="right">
        <span class="badge ${s.cls}">${s.t}</span>
        <h1>${esc(p.name)}</h1>
        <div class="price"><b id="price">${priceVaries(p) ? 'from ' : ''}${inr(has ? p.from_price : p.price)}</b>${p.mrp && p.mrp > p.price && !has ? `<s>${inr(p.mrp)}</s>` : ''}</div>
        <p class="muted">${esc(p.description)}</p>
        ${has ? `<div class="field" style="margin-top:20px"><label for="opt">Choose option</label><select id="opt" class="input"><option value="">Select…</option>${p.options.map((o) => `<option value="${esc(o.label)}">${esc(o.label)}${priceVaries(p) ? ' — ' + inr(o.price) : ''}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="qty">Quantity</label>
          <div class="qty"><button type="button" id="dec" aria-label="Decrease">−</button><input id="qty" type="number" min="1" max="${Math.min(99, p.stock)}" value="1" inputmode="numeric"><button type="button" id="inc" aria-label="Increase">+</button></div></div>
        <div class="buy-row">
          <button class="btn lg" id="add" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Sold out' : 'Add to cart'}</button>
          <button class="btn lg ghost" id="buy" ${p.stock <= 0 ? 'disabled' : ''}>Buy now</button>
        </div>
        ${p.stock <= 0 ? `<div style="margin-top:14px;padding:12px 14px;border:1px dashed var(--line2);border-radius:12px;background:rgba(255,184,59,0.06);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><b style="color:var(--amber)">Need this out-of-stock part?</b><div style="font-size:0.82rem;color:var(--mute)">Add it to your custom component request and we'll source it!</div></div>
          <a class="btn sm" href="/#custom-request?part=${encodeURIComponent(p.name)}" style="background:var(--amber);color:#06100c">Request this part →</a>
        </div>` : ''}
        <div class="note">💵 <b>40% advance payment</b> required after your order is confirmed. Remaining 60% paid on pickup or delivery.</div>
        ${p.specs.length ? `<h3 style="margin-top:30px">${p.category === 'kit' ? 'Included Project Deliverables & Components' : 'Specifications'}</h3><table class="specs">${p.specs.map(([k, v]) => v ? `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>` : `<tr><td colspan="2">✓ ${esc(k)}</td></tr>`).join('')}</table>` : ''}
      </div></div>`;
    observe(root);

    const qty = $('#qty'), opt = $('#opt');
    const clamp = () => { let v = parseInt(qty.value, 10); if (!v || v < 1) v = 1; qty.value = Math.min(v, Math.min(99, Math.max(1, p.stock))); };
    $('#dec').onclick = () => { qty.value = Number(qty.value) - 1; clamp(); };
    $('#inc').onclick = () => { qty.value = Number(qty.value) + 1; clamp(); };
    qty.onchange = clamp;
    if (opt) opt.onchange = () => {
      const o = p.options.find((x) => x.label === opt.value);
      $('#price').textContent = o ? inr(o.price) : (priceVaries(p) ? 'from ' : '') + inr(p.from_price);
    };
    const add = () => {
      clamp();
      if (has && !opt.value) { toast('Please choose an option first', 'err'); opt.focus(); return false; }
      const n = Number(qty.value);
      const inCart = Cart.read().filter((l) => l.id === p.id).reduce((s, l) => s + l.qty, 0);
      if (inCart + n > p.stock) { toast(`Only ${p.stock} in stock${inCart ? ` (you already have ${inCart} in your cart)` : ''}`, 'err'); return false; }
      Cart.add(p.id, n, has ? opt.value : ''); return true;
    };
    $('#add').onclick = (e) => { if (add()) { fly(e.currentTarget); toast(`Added ${qty.value} × “${p.name}”`); } };
    $('#buy').onclick = () => { if (add()) location.href = '/checkout'; };

    const rel = all.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
    if (rel.length) { $('#rel').innerHTML = rel.map((x, i) => productCard(x, i)).join(''); $('#rel-sec').classList.remove('hide'); observe($('#rel-sec')); }
  }

  getProducts().then((all) => {
    const p = all.find((x) => x.id === id);
    if (!p) return notFound();
    render(p, all);
    getConfig().then((c) => { document.title = `${p.name} · ${c.storeName}`; });
  }).catch(notFound);
})();
