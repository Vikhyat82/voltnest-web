(function () {
  const { $, esc, toast, observe, getConfig } = VN;

  async function init() {
    const cfg = await getConfig();

    const waNum = cfg.whatsapp || '919876543210';
    const emailAddr = cfg.email || 'support@voltnest.in';
    const igHandle = (cfg.instagram || 'voltnest.in').replace(/^@/, '');

    // Format display for WhatsApp
    const displayPhone = waNum.startsWith('91') && waNum.length === 12
      ? `+91 ${waNum.slice(2, 7)} ${waNum.slice(7)}`
      : (waNum.length === 10 ? `+91 ${waNum.slice(0, 5)} ${waNum.slice(5)}` : waNum);

    // Set text displays
    const waEl = $('#c-wa-val'); if (waEl) waEl.textContent = displayPhone;
    const igEl = $('#c-ig-val'); if (igEl) igEl.textContent = `@${igHandle}`;
    const emailEl = $('#c-email-val'); if (emailEl) emailEl.textContent = emailAddr;

    // Set interactive links
    const waText = encodeURIComponent(`Hi ${cfg.storeName || 'VoltNest'}! I have a question about electronic components.`);
    const waBtn = $('#c-wa-btn'); if (waBtn) waBtn.href = `https://wa.me/${waNum}?text=${waText}`;
    const igBtn = $('#c-ig-btn'); if (igBtn) igBtn.href = `https://instagram.com/${igHandle}`;
    const emailBtn = $('#c-email-btn'); if (emailBtn) emailBtn.href = `mailto:${emailAddr}?subject=${encodeURIComponent('Inquiry regarding ' + (cfg.storeName || 'VoltNest'))}`;

    // Set location & hours
    if (cfg.pickupAddress) {
      const addrEl = $('#c-addr'); if (addrEl) addrEl.textContent = cfg.pickupAddress;
      const mapBtn = $('#c-map-btn'); if (mapBtn) mapBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.pickupAddress)}`;
    }
    if (cfg.pickupHours) {
      const hoursEl = $('#c-hours'); if (hoursEl) hoursEl.textContent = cfg.pickupHours;
    }

    // Copy to clipboard helpers
    function setupCopy(btnId, textToCopy, label) {
      const btn = $(btnId);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(textToCopy);
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          toast(`Copied ${label} to clipboard`);
          setTimeout(() => { btn.textContent = orig; }, 2000);
        } catch {
          toast(`Press and hold to copy: ${textToCopy}`);
        }
      });
    }

    setupCopy('#c-wa-copy', waNum, 'WhatsApp number');
    setupCopy('#c-ig-copy', `@${igHandle}`, 'Instagram handle');
    setupCopy('#c-email-copy', emailAddr, 'Email address');

    // On-page message form
    const form = $('#contact-form');
    const errBox = $('#m-err');
    const feedbackBox = $('#m-feedback');

    function buildMessageText() {
      const name = ($('#m-name')?.value || '').trim();
      const phone = ($('#m-phone')?.value || '').trim();
      const email = ($('#m-email')?.value || '').trim();
      const topic = ($('#m-topic')?.value || '').trim();
      const msg = ($('#m-msg')?.value || '').trim();

      return `Hi ${cfg.storeName || 'VoltNest'}! New inquiry from your website:\n\n` +
        `*Name:* ${name}\n` +
        `*WhatsApp:* ${phone}\n` +
        (email ? `*Email:* ${email}\n` : '') +
        `*Topic:* ${topic}\n\n` +
        `*Message:*\n${msg}`;
    }

    // Direct WhatsApp Button
    $('#m-wa-direct-btn')?.addEventListener('click', () => {
      const msg = ($('#m-msg')?.value || '').trim();
      const name = ($('#m-name')?.value || '').trim();
      if (!name || !msg) {
        if (errBox) errBox.textContent = 'Please enter your name and message before opening WhatsApp.';
        return;
      }
      if (errBox) errBox.textContent = '';
      const text = buildMessageText();
      window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(text)}`, '_blank');
    });

    // Submit handler
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errBox) errBox.textContent = '';
      if (feedbackBox) feedbackBox.textContent = '';

      const name = ($('#m-name')?.value || '').trim();
      const phone = ($('#m-phone')?.value || '').trim();
      const email = ($('#m-email')?.value || '').trim();
      const topic = ($('#m-topic')?.value || '').trim();
      const msg = ($('#m-msg')?.value || '').trim();

      if (name.length < 2) {
        if (errBox) errBox.textContent = 'Please enter your full name.';
        return;
      }
      const cleanP = phone.replace(/\D/g, '').slice(-10);
      if (!/^[6-9]\d{9}$/.test(cleanP)) {
        if (errBox) errBox.textContent = 'Please enter a valid 10-digit mobile number.';
        return;
      }
      if (!msg) {
        if (errBox) errBox.textContent = 'Please enter your message.';
        return;
      }

      const sendBtn = $('#m-send-btn');
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span>Sending Message…</span>';
      }

      try {
        await Backend.createCustomRequest({
          name,
          phone: cleanP,
          college: email ? `Email: ${email}` : '',
          method: 'pickup',
          deadline: topic,
          notes: `[Contact Page Message] [Topic: ${topic}] ${msg}`,
          items: [`Inquiry: ${topic}`]
        });

        if (feedbackBox) {
          feedbackBox.style.color = 'var(--lime)';
          feedbackBox.innerHTML = `✓ Message received! <a href="https://wa.me/${waNum}?text=${encodeURIComponent(buildMessageText())}" target="_blank" style="color:var(--cyan);text-decoration:underline;margin-left:6px">Open in WhatsApp to chat instantly →</a>`;
        }
        form.reset();
        toast('Message sent successfully!');
      } catch (err) {
        if (feedbackBox) {
          feedbackBox.style.color = 'var(--amber)';
          feedbackBox.innerHTML = `Notice: <a href="https://wa.me/${waNum}?text=${encodeURIComponent(buildMessageText())}" target="_blank" style="color:var(--cyan);text-decoration:underline">Click here to send directly on WhatsApp →</a>`;
        }
      } finally {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<span>Send Message →</span>';
        }
      }
    });

    observe();
  }

  init().catch((err) => {
    console.error('Error initializing contact page:', err);
  });
})();
