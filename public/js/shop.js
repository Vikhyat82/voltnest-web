(function () {
  const { $, esc, productCard, getProducts, CATS, observe } = VN;
  const params = new URLSearchParams(location.search);
  const state = { cat: CATS[params.get('cat')] ? params.get('cat') : 'all', q: params.get('q') || '', sort: 'feat', stock: false };
  let all = [];

  function sync() {
    const p = new URLSearchParams();
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.q) p.set('q', state.q);
    history.replaceState(null, '', p.toString() ? '?' + p : location.pathname);
  }
  function matches(p) {
    if (state.cat !== 'all' && p.category !== state.cat) return false;
    if (state.stock && p.stock <= 0) return false;
    if (!state.q) return true;
    const hay = `${p.name} ${p.id} ${p.description} ${p.subcategory || ''} ${(CATS[p.category] || {}).label || ''} ${p.options.map((o) => o.label).join(' ')}`.toLowerCase();
    return state.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }
  function sorted(list) {
    const l = [...list];
    if (state.sort === 'plow') l.sort((a, b) => a.from_price - b.from_price);
    else if (state.sort === 'phigh') l.sort((a, b) => b.from_price - a.from_price);
    else if (state.sort === 'name') l.sort((a, b) => a.name.localeCompare(b.name));
    else l.sort((a, b) => Number(b.featured) - Number(a.featured));
    return l;
  }
  function bar() {
    const count = (k) => all.filter((p) => k === 'all' || p.category === k).length;
    $('#catbar').innerHTML = [['all', 'All'], ...Object.entries(CATS).map(([k, c]) => [k, c.label])]
      .map(([k, l]) => `<button class="chip ${state.cat === k ? 'on' : ''}" data-cat="${k}" role="tab" aria-selected="${state.cat === k}">${esc(l)} <small>${count(k)}</small></button>`).join('');
  }
  function render() {
    const list = sorted(all.filter(matches));
    $('#grid').innerHTML = list.map((p, i) => productCard(p, i)).join('');
    $('#empty').classList.toggle('hide', list.length > 0);
    $('#grid').classList.toggle('hide', list.length === 0);
    $('#count').textContent = `${list.length} ${list.length === 1 ? 'item' : 'items'}${state.q ? ` for “${state.q}”` : ''}`;
    observe($('#grid')); bar(); sync();
  }

  $('#catbar').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; state.cat = b.dataset.cat; render(); });
  let t; $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $('#instock').addEventListener('change', (e) => { state.stock = e.target.checked; render(); });
  $('#clear').addEventListener('click', () => { state.cat = 'all'; state.q = ''; state.stock = false; $('#q').value = ''; $('#instock').checked = false; render(); });
  $('#q').value = state.q;

  getProducts().then((ps) => { all = ps; render(); })
    .catch(() => { $('#grid').innerHTML = '<p class="muted">Could not load products. Please refresh.</p>'; });
})();
