(function () {
  const { $, esc, inr, getConfig } = VN;
  getConfig().then((c) => {
    $('#a-addr').textContent = c.pickupAddress; $('#a-hours').textContent = c.pickupHours;
    if (c.pickupAddress && !/^Add your/i.test(c.pickupAddress)) { const a = $('#a-map'); a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.pickupAddress); a.classList.remove('hide'); }
    $('#a-deliv').textContent = c.deliveryEnabled ? `Flat ${inr(c.deliveryFee)} per order${c.freeDeliveryAbove > 0 ? `, free over ${inr(c.freeDeliveryAbove)}` : ''}. Pay on delivery.` : 'Delivery is paused right now. Pickup is open.';
    $('#a-areas').innerHTML = c.deliveryEnabled ? c.areas.map((a) => `<span class="chip">${esc(a)}</span>`).join('') : '';
    if (c.minOrder > 0) $('#a-min').textContent = `Yes, the minimum order is ${inr(c.minOrder)}.`;
    const bits = [];
    if (c.whatsapp) bits.push(`WhatsApp: ${c.whatsapp}`); if (c.phone) bits.push(`Call: ${c.phone}`);
    if (bits.length) $('#a-contact').textContent = bits.join(' · ') + '. Tell us your project and we will suggest a parts list.';
  });
})();
