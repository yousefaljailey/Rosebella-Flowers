/* ══════════════════════════════════════════════
   ROSEBELLA — homepage product sections
   New Arrivals · Recently Arrived · Best Sellers (sliding rows)
   Recommended for You (grid)
   Managed in the admin portal (config/settings → homeSections). A section with
   no hand-picked products fills itself automatically.
   ══════════════════════════════════════════════ */
(function () {
  const DEFAULT_SECTIONS = [
    { id: 'new',         title: 'New Arrivals',        subtitle: 'Fresh designs, just added',          layout: 'slider', visible: true, productIds: [] },
    { id: 'recent',      title: 'Recently Arrived',    subtitle: 'In the studio this week',            layout: 'slider', visible: true, productIds: [] },
    { id: 'best',        title: 'Best Sellers',        subtitle: 'Our most loved arrangements',        layout: 'slider', visible: true, productIds: [] },
    { id: 'recommended', title: 'Recommended for You', subtitle: 'Picked with you in mind',            layout: 'grid',   visible: true, productIds: [] },
  ];
  const VIEWED_KEY = 'rb_viewed';

  const CSS = `
    .rb-hs { max-width: 1280px; margin: 0 auto; padding: 64px 48px 8px; }
    .rb-hs + .rb-hs { padding-top: 40px; }
    .rb-hs-hd { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
    .rb-hs-title { font-family: var(--serif); font-weight: 400; font-size: clamp(28px, 3vw, 38px); color: var(--charcoal); line-height: 1.1; }
    .rb-hs-title em { font-style: italic; color: var(--gold); }
    .rb-hs-sub { font-family: var(--serif); font-style: italic; font-size: 15px; color: var(--taupe); margin-top: 4px; }
    .rb-hs-link { font-family: var(--sans); font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); text-decoration: none; white-space: nowrap; }
    .rb-hs-link:hover { color: var(--gold-light); }
    .rb-hs-nav { display: flex; gap: 8px; }
    .rb-hs-arrow { width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(198,146,42,0.35); background: #fff; color: var(--charcoal); font-size: 18px; cursor: pointer; transition: all .2s; }
    .rb-hs-arrow:hover:not(:disabled) { background: var(--gold); border-color: var(--gold); color: #fff; }
    .rb-hs-arrow:disabled { opacity: .35; cursor: default; }

    /* Sliding row of rectangular cards */
    .rb-row { display: flex; gap: 18px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth; padding: 4px 2px 18px; scrollbar-width: none; }
    .rb-row::-webkit-scrollbar { display: none; }
    .rb-row .prod-card { flex: 0 0 236px; scroll-snap-align: start; border-radius: 14px; box-shadow: 0 2px 14px rgba(0,0,0,0.05); }
    .rb-row .prod-card:hover { transform: translateY(-3px); }
    .rb-hs .prod-card .prod-img { padding-top: 118%; border-radius: 14px 14px 0 0; }
    .rb-hs .prod-card .prod-desc { display: none; }
    .rb-hs .prod-card .prod-body { padding: 12px 14px 14px; }
    .rb-hs .prod-card .prod-body h3 { font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rb-hs .prod-card .prod-footer { margin-top: 8px; padding-top: 0; border-top: none; }
    .rb-hs-progress { height: 3px; background: rgba(198,146,42,0.15); border-radius: 3px; max-width: 420px; margin: 4px auto 0; overflow: hidden; }
    .rb-hs-progress span { display: block; height: 100%; background: var(--gold); border-radius: 3px; transition: transform .15s, width .15s; transform-origin: left; }

    /* Recommended grid */
    .rb-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
    .rb-grid .prod-card { border-radius: 14px; box-shadow: 0 2px 14px rgba(0,0,0,0.05); }

    @media (max-width: 1100px) { .rb-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 760px) {
      .rb-hs { padding: 44px 16px 4px; }
      .rb-hs-nav { display: none; }
      .rb-row { gap: 12px; }
      .rb-row .prod-card { flex-basis: 64vw; max-width: 240px; }
      .rb-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .rb-hs .prod-card .prod-body h3 { font-size: 15px; }
    }`;

  function ensureCss() {
    if (document.getElementById('rbHomeCss')) return;
    const st = document.createElement('style'); st.id = 'rbHomeCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function sectionsFrom(settings) {
    const saved = Array.isArray(settings?.homeSections) ? settings.homeSections : [];
    // Keep saved order/titles, fall back to defaults for anything missing
    const byId = Object.fromEntries(saved.map(s => [s.id, s]));
    const list = saved.length ? saved.map(s => ({ ...DEFAULT_SECTIONS.find(d => d.id === s.id), ...s }))
                              : DEFAULT_SECTIONS.map(d => ({ ...d }));
    DEFAULT_SECTIONS.forEach(d => { if (!byId[d.id] && saved.length) list.push({ ...d }); });
    return list;
  }

  function viewedIds() {
    try { return JSON.parse(localStorage.getItem(VIEWED_KEY)) || []; } catch (e) { return []; }
  }
  function cartNames() {
    try { return (JSON.parse(localStorage.getItem('rosebella_cart')) || []).map(i => i.name); } catch (e) { return []; }
  }

  // Automatic picks when a section has no hand-picked products
  function autoPick(sec, products, used) {
    const id = sec.id, skip = new Set(sec.excludeIds || []);
    // Automatic rows only use products that have a photo (and weren't removed from this row in the admin)
    const fresh = products.filter(p => !used.has(p.id) && p.image && !skip.has(p.id));
    // Sections added in the admin fill from their chosen collection
    if (!DEFAULT_SECTIONS.some(d => d.id === id)) {
      return sec.collection ? fresh.filter(p => p.cat === sec.collection).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 12) : [];
    }
    const byNewest = [...fresh].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
    if (id === 'new') {
      const tagged = byNewest.filter(p => /new/i.test(p.badge || '') || p.badgeStyle === 'new');
      return [...tagged, ...byNewest.filter(p => !tagged.includes(p))].slice(0, 10);
    }
    if (id === 'recent') return byNewest.slice(0, 10);
    if (id === 'best') {
      const tagged = fresh.filter(p => /best|popular/i.test(p.badge || '') || p.badgeStyle === 'popular');
      const rest = fresh.filter(p => !tagged.includes(p) && p.image).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return [...tagged, ...rest].slice(0, 10);
    }
    if (id === 'recommended') {
      // Same collections as what the shopper viewed or added to the bag
      const seen = new Set(viewedIds());
      const names = new Set(cartNames());
      const likedCats = new Set(products.filter(p => seen.has(p.id) || names.has(p.name)).map(p => p.cat));
      const fromLiked = fresh.filter(p => likedCats.has(p.cat) && !seen.has(p.id) && !names.has(p.name) && p.image);
      const others = fresh.filter(p => !fromLiked.includes(p) && p.image).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return [...fromLiked, ...others].slice(0, 8);
    }
    return byNewest.slice(0, 10);
  }

  function bindSlider(sec) {
    const row = sec.querySelector('.rb-row');
    const prev = sec.querySelector('.rb-prev'), next = sec.querySelector('.rb-next');
    const bar = sec.querySelector('.rb-hs-progress span');
    if (!row) return;
    const step = () => Math.max(row.clientWidth * 0.8, 240);
    prev && (prev.onclick = () => row.scrollBy({ left: -step(), behavior: 'smooth' }));
    next && (next.onclick = () => row.scrollBy({ left: step(), behavior: 'smooth' }));
    const update = () => {
      const max = row.scrollWidth - row.clientWidth;
      const frac = max > 0 ? row.scrollLeft / max : 1;
      const vis = row.scrollWidth > 0 ? row.clientWidth / row.scrollWidth : 1;
      if (bar) { bar.style.width = `${Math.max(vis, 0.12) * 100}%`; bar.style.transform = `translateX(${frac * (1 / Math.max(vis, 0.12) - 1) * 100}%)`; }
      if (prev) prev.disabled = row.scrollLeft <= 4;
      if (next) next.disabled = row.scrollLeft >= max - 4;
      sec.querySelector('.rb-hs-progress').style.visibility = max > 4 ? '' : 'hidden';
    };
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  function titleHTML(t) {
    // Last word in gold italics, like the rest of the site
    const esc = RB.esc(t || '');
    return esc.replace(/(\s)(\S+)$/, '$1<em>$2</em>');
  }

  function render(catalog, settings) {
    const root = document.getElementById('rbHomeSections');
    if (!root || !catalog) return;
    ensureCss();
    const products = RB.visibleProducts(catalog);
    const byId = Object.fromEntries(products.map(p => [p.id, p]));
    const used = new Set();
    const html = sectionsFrom(settings).filter(s => s.visible !== false).map(s => {
      let items = (s.productIds || []).map(id => byId[id]).filter(Boolean);
      if (!items.length) items = autoPick(s, products, s.id === 'recommended' ? new Set() : used);
      items.forEach(p => used.add(p.id));
      if (!items.length) return '';
      const cards = items.map((p, i) => RB.productCardHTML(p, RB.collectionName(catalog, p.cat), i)).join('');
      const slider = s.layout !== 'grid';
      return `<section class="rb-hs" data-section="${RB.esc(s.id)}">
        <div class="rb-hs-hd">
          <div><h2 class="rb-hs-title">${titleHTML(s.title)}</h2>${s.subtitle ? `<div class="rb-hs-sub">${RB.esc(s.subtitle)}</div>` : ''}</div>
          ${slider
            ? '<div class="rb-hs-nav"><button class="rb-hs-arrow rb-prev" aria-label="Scroll left">‹</button><button class="rb-hs-arrow rb-next" aria-label="Scroll right">›</button></div>'
            : `<a class="rb-hs-link" href="${s.collection ? 'collection.html?cat=' + encodeURIComponent(s.collection) : 'shop.html'}">View all →</a>`}
        </div>
        ${slider ? `<div class="rb-row">${cards}</div><div class="rb-hs-progress"><span></span></div>` : `<div class="rb-grid">${cards}</div>`}
      </section>`;
    }).join('');
    root.innerHTML = html;
    root.querySelectorAll('.rb-hs').forEach(bindSlider);
    try { RB.cartUI.sync(); } catch (e) {}
  }

  // Remember products a shopper opens (used for "Recommended for You")
  function rememberViewed(id) {
    if (!id) return;
    const list = viewedIds().filter(x => x !== id);
    list.unshift(id);
    try { localStorage.setItem(VIEWED_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
  }

  window.RB = window.RB || {};
  RB.home = { render, rememberViewed, DEFAULT_SECTIONS };
})();
