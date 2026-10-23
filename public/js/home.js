(function () {
  const { $, $$, esc, inr, Cart, toast, fly, CATS, getConfig, getProducts, productCard, observe } = VN;

  const PARTS = ['ESP32', 'ESP8266', 'Arduino Uno R3', 'ESP32-C3 SuperMini', 'DS18B20', 'TDS sensor', 'Turbidity sensor', 'AD8232 ECG', 'OLED 0.96"', 'LCD 16×2', 'NE555', 'DHT11', 'Mini PIR', 'LM135', 'BC547', 'LM358', 'Breadboard', 'Multimeter', 'Soldering kit', 'Transformers', 'LiPo battery', 'LEDs'];
  $('#marquee').innerHTML = [0, 1].map(() => `<span>${PARTS.map(esc).join('</span><span>')}</span>`).join('');

  const KITS = [
    { id: 'weather', icon: ['esp', 'dht', 'oled'], name: 'Weather station', blurb: 'Show live temperature and humidity on an OLED, and send it over Wi-Fi.', items: ['esp32-devkit', 'dht11', 'oled-096', 'breadboard-830', 'jumper-mm-40'] },
    { id: 'water', icon: ['esp', 'turbidity', 'probe'], name: 'Water quality monitor', blurb: 'Measure TDS, turbidity and temperature. A classic final-year project.', items: ['esp32-devkit', 'tds-sensor', 'turbidity-sensor', 'ds18b20-probe', 'breadboard-830', 'jumper-mf-40'] },
    { id: 'motion', icon: ['uno', 'pir', 'led'], name: 'Motion alarm', blurb: 'Detect movement with a mini PIR and light up an LED alert on Arduino.', items: ['arduino-uno-r3', 'mini-pir-motion', 'led-kit-100', 'resistor-kit-600', 'breadboard-830', 'jumper-mm-40'] },
    { id: 'lab', icon: ['meter', 'solder', 'perf'], name: 'Lab starter pack', blurb: 'Meter, soldering kit and a bag of basics for your first bench.', items: ['multimeter-dt830b', 'soldering-kit', 'perfboard-7x9', 'resistor-kit-600', 'led-kit-100'] }
  ];

  async function init() {
    const [cfg, ps] = await Promise.all([getConfig(), getProducts()]);
    const byId = Object.fromEntries(ps.map((p) => [p.id, p]));

    // stats
    const set = (id, n) => { const e = $(id); e.dataset.count = n; };
    set('#st-parts', ps.length); set('#st-areas', cfg.areas.length); set('#st-fee', cfg.deliveryFee);
    $('#st-fee-l').textContent = cfg.deliveryEnabled ? (cfg.freeDeliveryAbove > 0 ? `campus delivery, free over ${inr(cfg.freeDeliveryAbove)}` : 'flat campus delivery') : 'pickup only right now';
    $('#tagline').textContent = cfg.tagline;
    observe($('#stats'));

    // categories
    $('#catgrid').innerHTML = Object.entries(CATS).map(([k, c], i) => {
      const n = ps.filter((p) => p.category === k).length;
      return `<a class="card cat reveal" style="--d:${i * 0.06}s" href="/shop?cat=${k}">${window.icon(c.icon)}<h3>${esc(c.label)}</h3><small>${n} items · ${esc(c.blurb)}</small></a>`;
    }).join('');

    // featured
    const feat = ps.filter((p) => p.featured).slice(0, 8);
    $('#featgrid').innerHTML = (feat.length ? feat : ps.slice(0, 8)).map((p, i) => productCard(p, i)).join('');

    // Readymade Projects (renders database projects if available, else preset projects)
    const dbKits = ps.filter((p) => p.category === 'kit');
    if (dbKits.length) {
      $('#kitgrid').innerHTML = dbKits.map((k, i) => {
        const comps = Array.isArray(k.specs) ? k.specs.map((s) => typeof s === 'string' ? s : (Array.isArray(s) ? s.join(': ') : (s.name || s.label || JSON.stringify(s)))) : [];
        const inStock = Number(k.stock) > 0;
        const iconSvg = window.icon ? window.icon(k.icon || 'kit') : '';
        return `<div class="card kit reveal" style="--d:${i * 0.08}s">
          <div class="row">${k.image_url ? `<img src="${esc(k.image_url)}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover">` : iconSvg}</div>
          <h3>${esc(k.name)}</h3><p>${esc(k.description || '')}</p>
          <ul>${comps.slice(0, 5).map((c) => `<li>${esc(c)}</li>`).join('')}${comps.length > 5 ? `<li class="muted">+${comps.length - 5} more deliverables</li>` : ''}</ul>
          <div class="tot"><b>${inr(k.price)}</b><button class="btn sm" data-db-kit="${esc(k.id)}" ${inStock ? '' : 'disabled'}>${inStock ? 'Add project to cart' : 'Sold out'}</button></div></div>`;
      }).join('');
      $('#kitgrid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-db-kit]'); if (!b) return;
        const k = dbKits.find((x) => String(x.id) === String(b.dataset.dbKit));
        if (k) { Cart.add(k.id, 1, ''); fly(b); toast(`${k.name} project added to your cart`); }
      });
    } else {
      $('#kitgrid').innerHTML = KITS.map((k, i) => {
        const items = k.items.map((id) => byId[id]).filter(Boolean);
        const total = items.reduce((s, p) => s + p.price, 0);
        const ok = items.length === k.items.length && items.every((p) => p.stock > 0);
        return `<div class="card kit reveal" style="--d:${i * 0.08}s"><div class="row">${k.icon.map((i2) => window.icon(i2)).join('')}</div>
          <h3>${esc(k.name)}</h3><p>${esc(k.blurb)}</p>
          <ul>${items.map((p) => `<li>${esc(p.name)}</li>`).join('')}</ul>
          <div class="tot"><b>${inr(total)}</b><button class="btn sm" data-kit="${k.id}" ${ok ? '' : 'disabled'}>${ok ? 'Add project to cart' : 'Unavailable'}</button></div></div>`;
      }).join('');
      $('#kitgrid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-kit]'); if (!b) return;
        const k = KITS.find((x) => x.id === b.dataset.kit);
        k.items.forEach((id) => Cart.add(id, 1, ''));
        fly(b); toast(`${k.name} project added to your cart`);
      });
    }

    // delivery + pickup
    $('#areachips').innerHTML = cfg.deliveryEnabled ? cfg.areas.map((a) => `<span class="chip">${esc(a)}</span>`).join('') : '<span class="muted">Delivery is paused. Pickup is open.</span>';
    $('#deliv-note').textContent = cfg.deliveryEnabled ? `Flat ${inr(cfg.deliveryFee)} delivery${cfg.freeDeliveryAbove > 0 ? `, free on orders over ${inr(cfg.freeDeliveryAbove)}` : ''}. Pay on delivery or pickup.` : 'Delivery is paused for now.';
    $('#p-addr').textContent = cfg.pickupAddress; $('#p-hours').textContent = cfg.pickupHours;
    initCustomRequest(cfg);
    observe();
  }
  init().catch(() => { $('#featgrid').innerHTML = '<p class="muted">Could not load products. Please refresh.</p>'; });

  /* ---------------- CUSTOM COMPONENT REQUEST / BOM SOURCING ---------------- */
  function initCustomRequest(cfg) {
    const form = $('#bom-request-form');
    if (!form) return;

    const tabText = $('#bom-tab-text');
    const tabFile = $('#bom-tab-file');
    const textPane = $('#bom-text-pane');
    const filePane = $('#bom-file-pane');
    const sampleBtn = $('#bom-sample-btn');
    const textArea = $('#bom-text');
    const countBadge = $('#bom-count-badge');
    const dropzone = $('#bom-dropzone');
    const fileInput = $('#bom-file-input');
    const fileBadge = $('#bom-file-badge');
    const fileName = $('#bom-file-name');
    const fileSize = $('#bom-file-size');
    const fileIcon = $('#bom-file-icon');
    const fileRemove = $('#bom-file-remove');
    const submitBtn = $('#bom-submit-btn');
    const errBox = $('#bom-err');

    let attachedFile = null;

    // Check URL parameters for pre-filling (e.g. from out-of-stock product link /?part=ESP32)
    const urlParams = new URLSearchParams(window.location.search);
    const prefillPart = urlParams.get('part');
    if (prefillPart && textArea) {
      textArea.value = `1× ${prefillPart.trim()}`;
      updateCount();
      setTimeout(() => {
        const sec = $('#custom-request');
        if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      }, 400);
    }

    // Tabs toggle
    if (tabText && tabFile) {
      tabText.addEventListener('click', () => {
        tabText.style.background = 'var(--lime)';
        tabText.style.color = '#07120c';
        tabFile.style.background = 'transparent';
        tabFile.style.color = 'var(--ink)';
      });
      tabFile.addEventListener('click', () => {
        tabFile.style.background = 'var(--cyan)';
        tabFile.style.color = '#07120c';
        tabText.style.background = 'transparent';
        tabText.style.color = 'var(--ink)';
        fileInput.click();
      });
    }

    // Line counter helper
    function updateCount() {
      if (!textArea || !countBadge) return;
      const lines = textArea.value.split('\n').map((l) => l.trim()).filter(Boolean);
      countBadge.textContent = `${lines.length} ${lines.length === 1 ? 'item' : 'items'}`;
    }
    if (textArea) textArea.addEventListener('input', updateCount);

    // Sample BOM button
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => {
        if (!textArea) return;
        textArea.value = `2× Arduino Nano V3 (ATmega328P)\n5× BC547 NPN Transistors\n1× SIM800L GSM/GPRS Module\n1× 0.96 inch I2C OLED (SSD1306)\n10× 10kΩ 1/4W Metal Film Resistors\n1× SG90 Micro Servo Motor\n1× 12V 2A DC Power Adapter`;
        updateCount();
        toast('Loaded sample project BOM!');
      });
    }

    // File Dropzone & Selection
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--lime)';
        dropzone.style.background = 'rgba(182,255,59,0.06)';
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--line2)';
        dropzone.style.background = 'rgba(255,255,255,0.02)';
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--line2)';
        dropzone.style.background = 'rgba(255,255,255,0.02)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) {
          handleFile(fileInput.files[0]);
        }
      });
    }

    function handleFile(file) {
      if (file.size > 5 * 1024 * 1024) {
        toast('File is too large. Maximum size is 5 MB.', 'err');
        return;
      }

      let icon = '📄';
      if (file.type.startsWith('image/')) icon = '🖼️';
      else if (file.name.endsWith('.pdf')) icon = '📕';
      else if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) icon = '📊';

      fileName.textContent = file.name;
      fileSize.textContent = `${Math.round(file.size / 1024)} KB`;
      fileIcon.textContent = icon;
      fileBadge.classList.remove('hide');

      const reader = new FileReader();
      reader.onload = (e) => {
        attachedFile = {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl: e.target.result
        };
        toast(`Attached: ${file.name}`);
      };
      reader.readAsDataURL(file);
    }

    if (fileRemove) {
      fileRemove.addEventListener('click', () => {
        attachedFile = null;
        fileInput.value = '';
        fileBadge.classList.add('hide');
      });
    }

    // Submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';

      const name = $('#bom-name').value.trim();
      const phone = ($('#bom-phone').value || '').trim();
      const college = ($('#bom-college').value || '').trim();
      const deadline = $('#bom-deadline').value;
      const method = ($('input[name="bom-method"]:checked')?.value) || 'pickup';
      const notes = ($('#bom-notes').value || '').trim();

      const lines = (textArea?.value || '').split('\n').map((l) => l.trim()).filter(Boolean);

      if (!lines.length && !attachedFile) {
        errBox.textContent = 'Please enter at least one component or upload a component file.';
        return;
      }
      if (name.length < 2) {
        errBox.textContent = 'Please enter your full name.';
        $('#bom-name').focus();
        return;
      }
      const cleanP = phone.replace(/\D/g, '').slice(-10);
      if (!/^[6-9]\d{9}$/.test(cleanP)) {
        errBox.textContent = 'Please enter a valid 10-digit Indian WhatsApp mobile number.';
        $('#bom-phone').focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Submitting Request…</span>';

      try {
        const res = await Backend.createCustomRequest({
          name,
          phone: cleanP,
          college,
          method,
          deadline,
          notes,
          items: lines,
          file: attachedFile
        });

        // Hide form, show confirmation
        $('#bom-form-container').classList.add('hide');
        const successBox = $('#bom-success-container');
        successBox.classList.remove('hide');
        $('#bom-result-code').textContent = res.code;

        // WhatsApp direct link for the student to send to owner
        const waNumber = cfg.whatsapp || '9876543210';
        let waMsg = `Hi ${cfg.storeName || 'VoltNest'}! I submitted a Custom Component / Project BOM request on your website.\n\n` +
          `*Request Code:* ${res.code}\n` +
          `*Name:* ${name}\n` +
          (college ? `*College:* ${college}\n` : '') +
          `*Urgency:* ${deadline}\n` +
          `*Handover:* ${method === 'delivery' ? 'Campus Delivery' : 'Pickup in Knowledge Park II'}\n\n` +
          `*Components Needed:*\n` +
          (lines.length ? lines.map((l) => `• ${l}`).join('\n') : `• See attached file: ${attachedFile?.name || 'Uploaded document'}`) +
          (attachedFile ? `\n\n[Attached File: ${attachedFile.name}]` : '') +
          (notes ? `\n\n*Notes:* ${notes}` : '') +
          `\n\nPlease let me know availability and price quote!`;

        const waUrl = `https://wa.me/91${waNumber}?text=${encodeURIComponent(waMsg)}`;
        const waBtn = $('#bom-wa-btn');
        if (waBtn) waBtn.href = waUrl;

        const trackBtn = $('#bom-track-btn');
        if (trackBtn) trackBtn.href = `/track?code=${encodeURIComponent(res.code)}&phone=${encodeURIComponent(cleanP)}`;

        // Recap items display
        const recapItems = $('#bom-recap-items');
        if (recapItems) {
          recapItems.textContent = lines.length ? lines.join('\n') : `Attached File: ${attachedFile?.name}`;
        }

        successBox.scrollIntoView({ behavior: 'smooth' });
        toast('Component list submitted successfully!');
      } catch (err) {
        errBox.textContent = err.message || 'Error submitting request. Please try again.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Send Component Request →</span>';
      }
    });

    // Reset button
    const resetBtn = $('#bom-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        form.reset();
        attachedFile = null;
        if (fileBadge) fileBadge.classList.add('hide');
        updateCount();
        $('#bom-success-container').classList.add('hide');
        $('#bom-form-container').classList.remove('hide');
      });
    }
  }

  // "How it works" line fills as you scroll
  const steps = $('#steps'), kids = $$('.step', steps);
  function prog() {
    const r = steps.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (innerHeight * 0.75 - r.top) / (r.height + 40)));
    steps.style.setProperty('--p', p.toFixed(3));
    kids.forEach((k, i) => k.classList.toggle('on', p > i / kids.length + 0.04));
  }
  addEventListener('scroll', () => requestAnimationFrame(prog), { passive: true }); prog();
})();
