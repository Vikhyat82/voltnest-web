(function () {
  const { $, esc, inr, api, store } = VN;
  const params = new URLSearchParams(location.search);
  const last = store.get('vn_last', {});
  $('#code').value = (params.get('code') || last.code || '').toUpperCase();
  $('#phone').value = last.phone && (!params.get('code') || params.get('code') === last.code) ? last.phone : '';

  const STEPS = [['new', 'Placed'], ['confirmed', 'Confirmed'], ['ready', 'Shipment Ready'], ['completed', 'Completed']];
  const MSG = {
    new: 'We have received your order. We will confirm it shortly and request your 40% advance payment.',
    confirmed: 'Your order is confirmed! Please transfer the 40% advance payment so our team can pack your items.',
    ready: (o) => (o.method === 'pickup' ? 'Your shipment is ready for pickup! Bring your order code and pay remaining balance.' : 'Your shipment is ready and on the way to your delivery address.'),
    completed: 'Order completed. Thanks for shopping with VoltNest!',
    cancelled: 'This order was cancelled.'
  };
  const when = (s) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  function show(o) {
    const idx = STEPS.findIndex((s) => s[0] === o.status);
    const m = typeof MSG[o.status] === 'function' ? MSG[o.status](o) : MSG[o.status];
    const adv = Math.round(o.total * 0.4);
    const bal = o.total - adv;
    $('#result').innerHTML = `<div class="card panel reveal in">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><h3 class="mono" style="color:var(--lime)">${esc(o.code)}</h3><span class="muted">Placed ${esc(when(o.created_at))}</span></div>
      ${o.status === 'cancelled' ? `<div class="cancelled-box">❌ ${m}</div>` :
        `<div class="timeline">${STEPS.map((s, i) => `<div class="tl ${i <= idx ? 'done' : ''} ${i === idx ? 'now' : ''}"><b>${s[1]}</b></div>`).join('')}</div><p style="margin:12px 0;font-size:0.95rem;color:var(--text)">${m}</p>`}
      <div style="margin-top:18px">${o.items.map((i) => `<div class="srow"><span>${i.qty} × ${esc(i.name)}${i.option ? ` (${esc(i.option)})` : ''}</span><span>${inr(i.price * i.qty)}</span></div>`).join('')}
        <div class="srow"><span>${o.method === 'pickup' ? 'Pickup' : 'Delivery to ' + esc(o.area)}</span><span>${o.delivery_fee ? inr(o.delivery_fee) : 'Free'}</span></div>
        <div class="srow total"><span>Order Total</span><b>${inr(o.total)}</b></div>
        <div class="srow" style="color:var(--cyan);font-weight:600"><span>40% Advance</span><b>${inr(adv)}</b></div>
        <div class="srow" style="color:var(--muted);font-size:.85rem"><span>Balance on ${o.method === 'pickup' ? 'pickup' : 'delivery'}</span><b>${inr(bal)}</b></div></div></div>`;
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function check() {
    const err = $('#terr'); err.textContent = ''; $('#result').innerHTML = '';
    const code = $('#code').value.trim(), phone = $('#phone').value.trim();
    if (!code || !phone) { err.textContent = 'Enter both your order code and phone number'; return; }
    try { show(await Backend.track(code, phone)); }
    catch (e) { err.textContent = e.message; }
  }
  $('#trackform').addEventListener('submit', (e) => { e.preventDefault(); check(); });
  if ($('#code').value && $('#phone').value) check();
})();
