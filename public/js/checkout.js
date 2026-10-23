(function () {
  const { $, esc, inr, Cart, toast, api, store, getProducts, getConfig, resolveCart, availableFor, observe } = VN;
  const root = $('#coroot');

  const COLLEGES = ['Sharda University', 'Galgotias University', 'GL Bajaj Institute', 'NIET', 'GNIOT', 'Gautam Buddha University', 'Bennett University', 'Noida International University', 'Galgotias College of Engineering', 'KCC Institute', 'IIMT'];

  async function init() {
    const [ps, cfg] = await Promise.all([getProducts(), getConfig()]);
    const { lines } = resolveCart(ps);
    if (!lines.length) { location.replace('/cart'); return; }
    if (lines.some((l) => l.p.stock <= 0 || l.qty > Math.max(availableFor(lines, l), 0))) { toast('Please fix your cart first', 'err'); setTimeout(() => location.replace('/cart'), 700); return; }
    const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const saved = store.get('vn_customer', {});
    const feeFor = (m) => (m === 'delivery' && !(cfg.freeDeliveryAbove > 0 && sub >= cfg.freeDeliveryAbove) ? cfg.deliveryFee : 0);

    root.innerHTML = `<form id="of" class="cart-layout" novalidate>
      <div class="card panel">
        <h3>Your details</h3>
        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label for="name">Full name *</label><input class="input" id="name" autocomplete="name" maxlength="60" required value="${esc(saved.name || '')}"></div>
          <div class="field"><label for="phone">Mobile number *</label><input class="input" id="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="10-digit number" maxlength="16" required value="${esc(saved.phone || '')}"></div>
          <div class="field full"><label for="college">College / hostel (optional)</label><input class="input" id="college" list="colleges" maxlength="80" placeholder="e.g. Sharda University, Hostel B" value="${esc(saved.college || '')}"><datalist id="colleges">${COLLEGES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        </div>
        <h3 style="margin:26px 0 12px">Pickup or delivery?</h3>
        <div class="methods">
          <label class="method"><input type="radio" name="method" value="pickup" checked><b>Pickup</b><small>Collect from us. Free.</small></label>
          <label class="method ${cfg.deliveryEnabled ? '' : 'hide'}"><input type="radio" name="method" value="delivery"><b>Delivery</b><small id="dsub"></small></label>
        </div>
        <div id="pickinfo" class="note">📍 <b>${esc(cfg.pickupAddress)}</b><br>🕒 ${esc(cfg.pickupHours)}</div>
        <div id="delivbox" class="form-grid hide" style="margin-top:14px">
          <div class="field full"><label for="area">Delivery area *</label><select class="input" id="area"><option value="">Select your area…</option>${cfg.areas.map((a) => `<option>${esc(a)}</option>`).join('')}</select></div>
          <div class="field full"><label for="address">Address / hostel &amp; room / landmark *</label><textarea class="input" id="address" rows="2" maxlength="200" placeholder="e.g. Room 214, Boys Hostel 3, near the main gate"></textarea></div>
        </div>
        <div class="field" style="margin-top:20px"><label for="notes">Notes (optional)</label><textarea class="input" id="notes" rows="2" maxlength="300" placeholder="Need a value that is not listed? Preferred time? Write it here."></textarea></div>
        <div class="hp" aria-hidden="true"><label>Website <input id="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="err-msg" id="err" role="alert"></div>
      </div>
      <aside class="card summary"><h3>Order summary</h3>
        ${lines.map((l) => `<div class="srow"><span>${l.qty} × ${esc(l.p.name)}${l.opt ? ` <span class="opt mono" style="color:var(--cyan);font-size:.78rem">(${esc(l.opt)})</span>` : ''}</span><span>${inr(l.price * l.qty)}</span></div>`).join('')}
        <div class="srow" style="border-top:1px solid var(--line);margin-top:6px"><span>Subtotal</span><span>${inr(sub)}</span></div>
        <div class="srow"><span>Delivery</span><span id="fee">—</span></div>
        <div class="srow total"><span>Total</span><b id="total"></b></div>
        <div class="pay-note">💵 <span>Pay on <span id="paywhen">pickup</span>. No advance needed. Cash or UPI accepted.</span></div>
        <button class="btn lg block" type="submit" id="submit">Send order</button>
        <p class="muted" style="font-size:.8rem;margin-top:10px;text-align:center">We confirm by call or WhatsApp. Pay when you collect your items.</p>
      </aside></form>`;
    observe(root);

    const method = () => root.querySelector('input[name=method]:checked').value;
    $('#dsub').textContent = `${inr(cfg.deliveryFee)}${cfg.freeDeliveryAbove > 0 ? `, free over ${inr(cfg.freeDeliveryAbove)}` : ''}`;
    function refresh() {
      const m = method(), fee = feeFor(m);
      const total = sub + fee;
      $('#delivbox').classList.toggle('hide', m !== 'delivery'); $('#pickinfo').classList.toggle('hide', m !== 'pickup');
      $('#fee').textContent = m === 'pickup' ? 'Pickup (free)' : fee ? inr(fee) : 'Free';
      $('#total').textContent = inr(total);
      $('#paywhen').textContent = m === 'pickup' ? 'pickup' : 'delivery';
    }
    root.querySelectorAll('input[name=method]').forEach((r) => r.addEventListener('change', refresh)); refresh();

    $('#of').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#err'); err.textContent = '';
      const body = { name: $('#name').value.trim(), phone: $('#phone').value.trim(), college: $('#college').value.trim(), method: method(),
        area: $('#area').value, address: $('#address').value.trim(), notes: $('#notes').value.trim(), website: $('#website').value,
        items: lines.map((l) => ({ id: l.p.id, qty: l.qty, option: l.opt })) };
      const fail = (m, id) => { err.textContent = m; if (id) $(id).focus(); err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      if (body.name.length < 2) return fail('Please enter your name', '#name');
      const d = body.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(d)) return fail('Enter a valid 10-digit mobile number', '#phone');
      if (body.method === 'delivery') {
        if (!body.area) return fail('Choose your delivery area', '#area');
        if (body.address.length < 5) return fail('Enter your delivery address', '#address');
      }
      const btn = $('#submit'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const o = await Backend.createOrder(body);
        store.set('vn_customer', { name: body.name, phone: d, college: body.college });
        store.set('vn_last', { code: o.code, phone: d });
        Cart.clear(); success(o, cfg);
      } catch (ex) {
        btn.disabled = false; btn.textContent = 'Send order';
        fail(ex.message); if (ex.status === 409) toast('Your cart needs a quick update', 'err');
        if (ex.status === 409) setTimeout(() => (location.href = '/cart'), 1800);
      }
    });
  }

  function success(o, cfg) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    root.innerHTML = `<div class="card success">
      <svg class="check" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><path d="M30 52l14 14 27-30"/></svg>
      <h2>Order received!</h2><p class="muted">Thanks ${esc(o.name.split(' ')[0])}. Save this code to track your order:</p>
      <div class="code-box" id="codebox">${esc(o.code)}</div>
      <div><button class="btn sm ghost" id="copy">Copy code</button></div>
      <div class="recap">${o.items.map((i) => `<div class="srow"><span>${i.qty} × ${esc(i.name)}${i.option ? ` (${esc(i.option)})` : ''}</span><span>${inr(i.price * i.qty)}</span></div>`).join('')}
        <div class="srow"><span>Delivery</span><span>${o.method === 'pickup' ? 'Pickup' : o.delivery_fee ? inr(o.delivery_fee) : 'Free'}</span></div>
        <div class="srow total"><span>Pay on ${o.method === 'pickup' ? 'pickup' : 'delivery'}</span><b>${inr(o.total)}</b></div></div>
      <div class="pay-note" style="text-align:left">${o.method === 'pickup' ? `📍 <span>Pick up from <b>${esc(cfg.pickupAddress)}</b> (${esc(cfg.pickupHours)}) after we confirm.</span>` : '🚚 <span>We will call or WhatsApp you to confirm and arrange delivery.</span>'}</div>
      <div class="hero-cta" style="justify-content:center"><a class="btn" href="/track?code=${encodeURIComponent(o.code)}">Track this order</a><a class="btn ghost" href="/shop">Keep shopping</a></div></div>`;
    $('#copy').onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(o.code) : Promise.reject()).then(() => toast('Code copied'), () => toast('Select and copy the code manually', 'err')); };
  }

  init().catch(() => { root.innerHTML = '<p class="muted">Could not load checkout. Please refresh.</p>'; });
})();
