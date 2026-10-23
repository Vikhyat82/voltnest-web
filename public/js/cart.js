(function () {
  const { $, esc, inr, Cart, toast, getProducts, getConfig, resolveCart, availableFor, observe } = VN;
  const root = $('#cartroot');
  let cfg;

  function thumb(p) { return p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : window.icon(p.icon); }

  async function render() {
    const [ps, c] = await Promise.all([getProducts(), cfg || getConfig()]); cfg = c;
    const { lines, dropped } = resolveCart(ps);
    if (dropped) toast('Some unavailable items were removed from your cart', 'err');
    if (!lines.length) {
      root.innerHTML = `<div class="empty"><div data-icon="kit"></div><h2>Your cart is empty</h2><p>Add a few parts and they will show up here.</p><p style="margin-top:18px"><a class="btn lg" href="/shop">Browse the shop</a></p></div>`;
      root.querySelectorAll('[data-icon]').forEach((e) => { e.innerHTML = window.icon(e.dataset.icon); });
      return;
    }
    let problem = false;
    const rows = lines.map((l, i) => {
      const avail = availableFor(lines, l);
      const out = l.p.stock <= 0, over = l.qty > Math.max(avail, 0);
      if (out || over) problem = true;
      return `<div class="card line ${out ? 'gone' : ''}" style="animation-delay:${i * 0.05}s">
        <a class="th" href="/product?id=${encodeURIComponent(l.p.id)}">${thumb(l.p)}</a>
        <div><h3><a href="/product?id=${encodeURIComponent(l.p.id)}">${esc(l.p.name)}</a></h3>${l.opt ? `<div class="opt">${esc(l.opt)}</div>` : ''}
          <div class="muted mono" style="font-size:.8rem">${inr(l.price)} each</div>
          ${out ? '<div class="badge out" style="margin-top:6px">Sold out. Please remove</div>' : over ? `<div class="badge low" style="margin-top:6px">Only ${Math.max(avail, 0)} available. Reduce quantity</div>` : ''}
          <div class="meta"><div class="qty"><button data-act="dec" data-i="${i}" aria-label="Decrease">−</button><input value="${l.qty}" data-act="set" data-i="${i}" inputmode="numeric" aria-label="Quantity"><button data-act="inc" data-i="${i}" aria-label="Increase">+</button></div>
          <button class="rm" data-act="rm" data-i="${i}">Remove</button></div></div>
        <div class="lt">${inr(l.price * l.qty)}</div></div>`;
    }).join('');
    const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const toFree = cfg.freeDeliveryAbove > 0 && cfg.deliveryEnabled && sub < cfg.freeDeliveryAbove ? cfg.freeDeliveryAbove - sub : 0;
    const belowMin = sub < cfg.minOrder;
    root.innerHTML = `<div class="cart-layout"><div class="lines">${rows}
      <p><a class="btn ghost sm" href="/shop">← Continue shopping</a> <button class="btn danger sm" data-act="clear" style="margin-left:6px">Empty cart</button></p></div>
      <aside class="card summary"><h3>Order summary</h3>
        <div class="srow"><span>Items (${lines.reduce((s, l) => s + l.qty, 0)})</span><span>${inr(sub)}</span></div>
        <div class="srow"><span>Delivery</span><span class="muted">${cfg.deliveryEnabled ? 'Choose at checkout' : 'Pickup only'}</span></div>
        <div class="srow total"><span>Total</span><b>${inr(sub)}</b></div>
        ${toFree ? `<p class="muted" style="font-size:.88rem">Add ${inr(toFree)} more for free delivery.</p>` : ''}
        <div class="pay-note">💵 <span>Pay on pickup or delivery. No online payment needed. Cash or UPI accepted.</span></div>
        ${belowMin ? `<p class="err-msg">Minimum order is ${inr(cfg.minOrder)}.</p>` : ''}
        <a class="btn lg block ${problem || belowMin ? 'hide' : ''}" href="/checkout">Continue to order form →</a>
        ${problem ? '<p class="err-msg">Fix the highlighted items to continue.</p>' : ''}
      </aside></div>`;
    observe(root);
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
    const act = b.dataset.act;
    if (act === 'clear') { Cart.clear(); return render(); }
    const cart = Cart.read(); const l = cart[Number(b.dataset.i)]; if (!l) return;
    if (act === 'rm') Cart.remove(l.id, l.opt || '');
    else Cart.setQty(l.id, l.opt || '', l.qty + (act === 'inc' ? 1 : -1));
    render();
  });
  root.addEventListener('change', (e) => {
    const b = e.target.closest('input[data-act=set]'); if (!b) return;
    const l = Cart.read()[Number(b.dataset.i)]; if (!l) return;
    Cart.setQty(l.id, l.opt || '', parseInt(b.value, 10) || 1); render();
  });
  render().catch(() => { root.innerHTML = '<p class="muted">Could not load your cart. Please refresh.</p>'; });
})();
