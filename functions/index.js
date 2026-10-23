/* REFERENCE implementation of the two callable functions the frontend expects.
   Adapt freely: the frontend only cares about the request/response shapes (see README). */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp();
const db = getFirestore();
const OPTS = { region: 'asia-south1', maxInstances: 10 };   // must match FUNCTIONS_REGION in js/firebase-config.js
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
const bad = (m) => new HttpsError('invalid-argument', m);
function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const newCode = () => 'ORD-' + Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

exports.placeOrder = onCall(OPTS, async ({ data: b }) => {
  const name = clean(b.name); if (name.length < 2 || name.length > 60) throw bad('Please enter your name');
  const phone = normPhone(b.phone); if (!phone) throw bad('Enter a valid 10-digit mobile number');
  if (clean(b.website)) return { code: 'ORD-00000', total: 0, items: [], status: 'new', name, method: 'pickup', subtotal: 0, delivery_fee: 0 }; // honeypot
  const method = b.method === 'delivery' ? 'delivery' : b.method === 'pickup' ? 'pickup' : null; if (!method) throw bad('Choose pickup or delivery');
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 60) throw bad('Your cart is empty');

  const merged = new Map();
  for (const it of b.items) {
    const id = clean(it.id).slice(0, 80), qty = Number(it.qty), opt = clean(it.option).slice(0, 60);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 99) throw bad('Invalid item quantity');
    const k = id + '\u0000' + opt; merged.set(k, { id, opt, qty: (merged.get(k)?.qty || 0) + qty });
  }

  return db.runTransaction(async (tx) => {
    const cfgSnap = await tx.get(db.doc('settings/store')); const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    const deliveryEnabled = cfg.deliveryEnabled !== false, fee0 = cfg.deliveryFee ?? 30, freeAbove = cfg.freeDeliveryAbove ?? 500, minOrder = cfg.minOrder ?? 0;
    let area = '', address = '';
    if (method === 'delivery') {
      if (!deliveryEnabled) throw bad('Delivery is not available right now. Please choose pickup.');
      area = clean(b.area); address = clean(b.address);
      if (cfg.areas && !cfg.areas.includes(area)) throw bad('Please choose a delivery area from the list');
      if (address.length < 5 || address.length > 200) throw bad('Enter your delivery address');
    }
    const ids = [...new Set([...merged.values()].map((l) => l.id))];
    const snaps = await Promise.all(ids.map((id) => tx.get(db.doc(`products/${id}`))));   // all reads before any write
    const prods = Object.fromEntries(snaps.map((s) => [s.id, s]));
    const used = {}; const items = []; let subtotal = 0;
    for (const { id, opt, qty } of merged.values()) {
      const s = prods[id]; if (!s.exists || s.data().active === false) throw new HttpsError('failed-precondition', 'An item in your cart is no longer available. Please refresh your cart.');
      const p = s.data(); let price = p.price, label = '';
      if (p.options && p.options.length) {
        const o = p.options.map((x) => (typeof x === 'string' ? { label: x } : x)).find((x) => x.label === opt);
        if (!o) throw bad(`Please choose an option for ${p.name}`); label = o.label; price = o.price ?? p.price;
      }
      used[id] = (used[id] || 0) + qty;
      if (used[id] > p.stock) throw new HttpsError('failed-precondition', p.stock <= 0 ? `${p.name} is sold out` : `Only ${p.stock} of ${p.name} left in stock`);
      items.push({ product_id: id, name: p.name, option: label, price, qty }); subtotal += price * qty;
    }
    if (subtotal < minOrder) throw bad(`Minimum order is ₹${minOrder}`);
    const fee = method === 'delivery' && !(freeAbove > 0 && subtotal >= freeAbove) ? fee0 : 0;
    let code = newCode(); while ((await tx.get(db.doc(`orders/${code}`))).exists) code = newCode();
    const now = new Date().toISOString();
    const order = { code, name, phone, college: clean(b.college).slice(0, 80), method, area, address, notes: clean(b.notes).slice(0, 300),
      subtotal, delivery_fee: fee, total: subtotal + fee, status: 'new', owner_note: '', items, created_at: now, updated_at: now };
    tx.set(db.doc(`orders/${code}`), order);
    for (const [id, n] of Object.entries(used)) tx.update(db.doc(`products/${id}`), { stock: prods[id].data().stock - n });
    return { code, name, method, subtotal, delivery_fee: fee, total: subtotal + fee, status: 'new', items: items.map(({ name, option, price, qty }) => ({ name, option, price, qty })) };
  });
});

exports.trackOrder = onCall(OPTS, async ({ data }) => {
  const code = clean(data.code).toUpperCase(), phone = normPhone(data.phone);
  const snap = code ? await db.doc(`orders/${code}`).get() : null;
  if (!snap || !snap.exists || !phone || snap.data().phone !== phone) throw new HttpsError('not-found', 'No order found with these details');
  const o = snap.data();
  return { code: o.code, status: o.status, method: o.method, area: o.area, subtotal: o.subtotal, delivery_fee: o.delivery_fee, total: o.total,
    created_at: o.created_at, updated_at: o.updated_at, items: o.items.map(({ name, option, price, qty }) => ({ name, option, price, qty })) };
});

/* For your owner dashboard: change status; cancelling puts the stock back. Requires the custom claim admin:true. */
exports.setOrderStatus = onCall(OPTS, async ({ auth, data }) => {
  if (!auth || auth.token.admin !== true) throw new HttpsError('permission-denied', 'Owner only');
  const STATUSES = ['new', 'confirmed', 'ready', 'completed', 'cancelled'];
  if (!STATUSES.includes(data.status)) throw bad('Invalid status');
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`orders/${clean(data.code)}`); const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', 'Order not found');
    const o = s.data(); if (o.status === 'cancelled') throw new HttpsError('failed-precondition', 'Cancelled orders cannot be changed');
    const prodSnaps = data.status === 'cancelled' ? await Promise.all(o.items.map((i) => tx.get(db.doc(`products/${i.product_id}`)))) : [];
    tx.update(ref, { status: data.status, updated_at: new Date().toISOString() });
    prodSnaps.forEach((ps, i) => { if (ps.exists) tx.update(ps.ref, { stock: ps.data().stock + o.items[i].qty }); });
    return { ok: true };
  });
});
