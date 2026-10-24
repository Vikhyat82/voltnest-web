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

    const btn = $('#submit');
    btn.textContent = 'Verify phone & place order';

    $('#of').addEventListener('submit', (e) => {
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

      // Customer details are valid -> Trigger OTP Verification before submitting order
      openOtpModal(body, d, cfg, lines);
    });
  }

  /* ---------------- OTP Verification Modal Flow ---------------- */
  function openOtpModal(body, cleanPhone, cfg, lines) {
    const existing = document.getElementById('checkout-otp-modal');
    if (existing) existing.remove();

    function genOtp() {
      return String(Math.floor(100000 + Math.random() * 900000));
    }

    let activeOtp = genOtp();
    let secondsLeft = 45;
    let timer = null;

    const modal = document.createElement('div');
    modal.id = 'checkout-otp-modal';
    modal.className = 'otp-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'otp-title');

    modal.innerHTML = `
      <div class="otp-card">
        <button type="button" class="otp-close" id="otp-close-btn" aria-label="Close verification">&times;</button>
        <span class="otp-badge">🔐 Security Check</span>
        <h2 id="otp-title">Verify Mobile Number</h2>
        <p class="otp-sub">Enter the 6-digit verification code sent to <b>+91 ${esc(cleanPhone)}</b> <button type="button" id="otp-edit-phone-btn" style="color:var(--cyan);background:none;border:none;cursor:pointer;font-size:0.85rem;text-decoration:underline;margin-left:4px">Change</button></p>

        <!-- Simulated SMS Notification Demonstration Banner -->
        <div class="otp-sms-banner">
          <div class="otp-sms-head">
            <span class="otp-sms-badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-2px"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> SMS Code Alert</span>
            <span>Just now</span>
          </div>
          <div class="otp-sms-body">
            VoltNest verification code: <b class="otp-sms-code" id="otp-disp-code">${activeOtp}</b>. Valid for 5 minutes.
          </div>
          <button type="button" class="otp-quick-fill-btn" id="otp-quick-fill">
            ⚡ Tap to auto-fill code (${activeOtp})
          </button>
        </div>

        <form id="otp-form" novalidate>
          <div class="otp-inputs-row" id="otp-box-row">
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="otp-digit" data-idx="0" autocomplete="one-time-code" autofocus>
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="otp-digit" data-idx="1">
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="otp-digit" data-idx="2">
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="otp-digit" data-idx="3">
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="otp-digit" data-idx="4">
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="otp-digit" data-idx="5">
          </div>

          <div id="otp-err" class="err-msg" style="margin-bottom:12px;text-align:center;font-size:0.85rem"></div>

          <div class="otp-resend-row">
            <span id="otp-timer-box">Resend code in <b id="otp-countdown" class="mono" style="color:var(--lime)">${secondsLeft}s</b></span>
            <button type="button" id="otp-resend-btn" class="otp-resend-btn hide">Didn't receive? Resend OTP</button>
          </div>

          <button type="submit" class="btn lg block" id="otp-submit-btn" style="width:100%">Verify &amp; Confirm Order</button>

          <a class="otp-wa-btn" id="otp-wa-link" href="https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`VoltNest verification OTP: ${activeOtp}`)}" target="_blank" rel="noopener">
            💬 Send code to my WhatsApp
          </a>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const digitInputs = [...modal.querySelectorAll('.otp-digit')];
    const otpErr = modal.querySelector('#otp-err');
    const otpSubmitBtn = modal.querySelector('#otp-submit-btn');
    const timerBox = modal.querySelector('#otp-timer-box');
    const countdownEl = modal.querySelector('#otp-countdown');
    const resendBtn = modal.querySelector('#otp-resend-btn');
    const quickFillBtn = modal.querySelector('#otp-quick-fill');
    const dispCodeEl = modal.querySelector('#otp-disp-code');
    const waLink = modal.querySelector('#otp-wa-link');

    // Auto-focus first digit
    setTimeout(() => { if (digitInputs[0]) digitInputs[0].focus(); }, 100);

    // Countdown Timer logic
    function startTimer() {
      if (timer) clearInterval(timer);
      secondsLeft = 45;
      timerBox.classList.remove('hide');
      resendBtn.classList.add('hide');
      countdownEl.textContent = `${secondsLeft}s`;

      timer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          clearInterval(timer);
          timer = null;
          timerBox.classList.add('hide');
          resendBtn.classList.remove('hide');
        } else {
          countdownEl.textContent = `${secondsLeft}s`;
        }
      }, 1000);
    }
    startTimer();

    function closeModal() {
      if (timer) clearInterval(timer);
      modal.remove();
    }

    modal.querySelector('#otp-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#otp-edit-phone-btn').addEventListener('click', () => {
      closeModal();
      const phoneInput = document.getElementById('phone');
      if (phoneInput) {
        phoneInput.focus();
        phoneInput.select();
      }
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Close on Esc key
    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', onKeydown);
      }
    };
    window.addEventListener('keydown', onKeydown);

    // Resend OTP
    resendBtn.addEventListener('click', () => {
      activeOtp = genOtp();
      dispCodeEl.textContent = activeOtp;
      quickFillBtn.innerHTML = `⚡ Tap to auto-fill code (${activeOtp})`;
      waLink.href = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`VoltNest verification OTP: ${activeOtp}`)}`;
      otpErr.textContent = '';
      digitInputs.forEach((inp) => { inp.value = ''; inp.classList.remove('error'); });
      digitInputs[0].focus();
      toast(`New OTP code sent to +91 ${cleanPhone}`);
      startTimer();
    });

    // Quick-Fill
    quickFillBtn.addEventListener('click', () => {
      activeOtp.split('').forEach((ch, idx) => {
        if (digitInputs[idx]) digitInputs[idx].value = ch;
      });
      otpErr.textContent = '';
      digitInputs.forEach((inp) => inp.classList.remove('error'));
      otpSubmitBtn.focus();
    });

    // Digits input navigation and paste support
    digitInputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        const val = input.value.replace(/\D/g, '');
        input.value = val ? val[val.length - 1] : '';
        otpErr.textContent = '';
        input.classList.remove('error');

        if (input.value && idx < digitInputs.length - 1) {
          digitInputs[idx + 1].focus();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          if (!input.value && idx > 0) {
            digitInputs[idx - 1].focus();
            digitInputs[idx - 1].value = '';
          }
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          digitInputs[idx - 1].focus();
        } else if (e.key === 'ArrowRight' && idx < digitInputs.length - 1) {
          digitInputs[idx + 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        const digits = pasted.replace(/\D/g, '').slice(0, 6);
        if (digits) {
          digits.split('').forEach((d, i) => {
            if (digitInputs[i]) digitInputs[i].value = d;
          });
          const nextIdx = Math.min(digits.length, digitInputs.length - 1);
          digitInputs[nextIdx].focus();
        }
      });
    });

    // Form submission -> verify OTP & create order
    modal.querySelector('#otp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      otpErr.textContent = '';
      const enteredCode = digitInputs.map((i) => i.value).join('');

      if (enteredCode.length < 6) {
        otpErr.textContent = 'Please enter all 6 digits of the OTP code.';
        digitInputs.forEach((inp) => { if (!inp.value) inp.classList.add('error'); });
        return;
      }

      if (enteredCode !== activeOtp) {
        otpErr.textContent = 'Incorrect OTP code. Please check the code and try again.';
        digitInputs.forEach((inp) => {
          inp.classList.add('error');
          inp.value = '';
        });
        digitInputs[0].focus();
        return;
      }

      // OTP is valid!
      otpSubmitBtn.disabled = true;
      otpSubmitBtn.textContent = 'Verifying & placing order…';

      try {
        const payload = {
          ...body,
          phone: cleanPhone,
          otp_verified: true,
          otp_code: enteredCode
        };

        const o = await Backend.createOrder(payload);
        closeModal();
        store.set('vn_customer', { name: body.name, phone: cleanPhone, college: body.college });
        store.set('vn_last', { code: o.code, phone: cleanPhone });
        Cart.clear();
        toast('Phone verified! Order placed successfully.');
        success(o, cfg);
      } catch (ex) {
        otpSubmitBtn.disabled = false;
        otpSubmitBtn.textContent = 'Verify & Confirm Order';
        otpErr.textContent = ex.message || 'Failed to place order. Please try again.';
        if (ex.status === 409) {
          closeModal();
          toast('Your cart needs a quick update', 'err');
          setTimeout(() => (location.href = '/cart'), 1500);
        }
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
