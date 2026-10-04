/* ══════════════════════════════════════════════
   ROSEBELLA — "Complete your gift" for the quick-add pop-up (homepage, collection pages, product page)
   Same rules as the product page: several of each extra, and extras linked to a collection
   (Balloon → Balloons, Chocolates → chocolate boxes) open a picker of that collection's products.
   Plugs into the pop-up's existing functions (vmRenderAddons, vmCalcPrice, variantAddToCart).
   ══════════════════════════════════════════════ */
(function () {
  let catalog = null;
  RB.load('catalog', c => { if (c) catalog = c; });

  const CSS = `
    .rbx-step { display:inline-flex; align-items:center; gap:8px; margin-top:4px; }
    .rbx-step button { width:24px; height:24px; border-radius:50%; border:1px solid var(--gold,#C6922A); background:transparent; color:var(--gold,#C6922A); font-size:14px; line-height:1; cursor:pointer; padding:0; }
    .rbx-step b { font-family:var(--sans,'Montserrat',sans-serif); font-size:12px; min-width:12px; text-align:center; color:inherit; }
    .vm-addon .rbx-step b { color:#fff; }
    #rbxPick { position:fixed; inset:0; z-index:100001; background:rgba(0,0,0,0.55); display:none; align-items:flex-end; justify-content:center; }
    #rbxPick.show { display:flex; }
    #rbxPick .pdp-card { background:var(--ivory,#faf8f2); width:min(720px,100%); max-height:86vh; border-radius:18px 18px 0 0; display:flex; flex-direction:column; overflow:hidden; color:var(--charcoal,#2D2D2D); }
    @media (min-width:769px) { #rbxPick { align-items:center; } #rbxPick .pdp-card { border-radius:18px; } }
    #rbxPick .pdp-hd { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid rgba(198,146,42,0.18); }
    #rbxPick .pdp-hd b { font-family:var(--serif,'Cormorant Garamond',serif); font-size:22px; font-weight:500; }
    #rbxPick .pdp-x { width:34px; height:34px; border-radius:50%; border:1px solid #ddd; background:#fff; cursor:pointer; }
    #rbxPick .pdp-grid { overflow-y:auto; flex:1 1 auto; min-height:0; padding:14px; display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); grid-auto-rows:max-content; align-content:start; gap:12px; }
    #rbxPick .pdp-item { background:#fff; border:1.5px solid rgba(198,146,42,0.15); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
    #rbxPick .pdp-item.on { border-color:var(--gold,#C6922A); box-shadow:0 0 0 1px var(--gold,#C6922A); }
    #rbxPick .pdp-img { position:relative; aspect-ratio:1; background:#efe9dc center / cover no-repeat; cursor:pointer; }
    #rbxPick .pdp-n { position:absolute; top:6px; right:6px; min-width:24px; height:24px; padding:0 6px; border-radius:12px; background:var(--gold,#C6922A); color:#fff; font:700 12px/24px var(--sans,sans-serif); text-align:center; }
    #rbxPick .pdp-name { font-family:var(--sans,sans-serif); font-size:11px; font-weight:600; padding:8px 10px 0; line-height:1.3; min-height:2.6em; }
    #rbxPick .pdp-row { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:6px 10px 10px; }
    #rbxPick .pdp-price { font-family:var(--sans,sans-serif); font-size:11px; color:var(--taupe,#8a7f72); }
    #rbxPick .pdp-add { border:1px solid var(--gold,#C6922A); background:#fff; color:var(--gold,#C6922A); border-radius:999px; padding:5px 10px; font:700 10px var(--sans,sans-serif); cursor:pointer; }
    #rbxPick .pdp-foot { padding:12px 16px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid rgba(198,146,42,0.18); }
    #rbxPick .pdp-done { width:100%; border:none; border-radius:999px; background:var(--gold,#C6922A); color:#fff; padding:14px; font:700 11px var(--sans,sans-serif); letter-spacing:.14em; text-transform:uppercase; cursor:pointer; }`;
  function ensureCss() {
    if (document.getElementById('rbxCss')) return;
    const st = document.createElement('style'); st.id = 'rbxCss'; st.textContent = CSS; document.head.appendChild(st);
  }

  const addons = () => (typeof VARIANTS !== 'undefined' && VARIANTS.addons) || [];
  const esc = RB.esc;

  function productsFor(a) {
    if (!a.collection || !catalog) return [];
    const words = String(a.filter || '').toLowerCase().trim();
    return (catalog.products || []).filter(p => p.cat === a.collection && p.visible !== false && Number(p.price) > 0 && p.image
        && (!words || p.name.toLowerCase().includes(words)))
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
  }
  const priceFor = (a, p) => a.ownPrice ? (Number(a.price) || 0) : (Number(p.price) || 0);
  const count = (sel, a) => Object.values(sel).filter(x => x.group === a.id).reduce((n, x) => n + x.qty, 0);

  // The pop-up keeps its choices on activeVariant.sel
  function sel() {
    if (typeof activeVariant === 'undefined') return {};
    if (!activeVariant.sel) activeVariant.sel = {};
    return activeVariant.sel;
  }

  function renderTiles() {
    const box = document.getElementById('vmAddons'); if (!box) return;
    ensureCss();
    const s = sel();
    box.innerHTML = addons().map(a => {
      const v = RB.addonVisual(a), n = count(s, a), linked = productsFor(a).length > 0;
      const foot = linked
        ? `<span class="vm-addon-price">${n ? `${n} chosen · tap to change` : `${a.ownPrice ? '' : 'from '}QR ${Math.min(...productsFor(a).map(p => priceFor(a, p)))} · choose`}</span>`
        : n ? `<span class="rbx-step" onclick="event.stopPropagation()"><button type="button" onclick="RB.extras.addonQty('${esc(a.id)}',-1)" aria-label="One less">−</button><b>${n}</b><button type="button" onclick="RB.extras.addonQty('${esc(a.id)}',1)" aria-label="One more">+</button></span>`
            : `<span class="vm-addon-price">+QR ${esc(a.price)}</span>`;
      return `<div role="button" tabindex="0" class="vm-addon${n ? ' active' : ''}" onclick="${linked ? `RB.extras.openPicker('${esc(a.id)}')` : `RB.extras.addonQty('${esc(a.id)}',1)`}">
        <div class="vm-addon-visual" style="${v.style}">${v.inner}${n ? `<span class="vm-addon-tick">${n > 1 ? '×' + n : '✓'}</span>` : ''}</div>
        <div class="vm-addon-foot"><span class="vm-addon-label">${esc(a.label)}</span>${foot}</div>
      </div>`;
    }).join('');
  }
  function changed() { renderTiles(); if (typeof vmUpdatePrice === 'function') vmUpdatePrice(); }

  function addonQty(id, d) {
    const a = addons().find(x => x.id === id); if (!a) return;
    const s = sel(), k = 'a:' + id, n = Math.max(0, Math.min(20, (s[k]?.qty || 0) + d));
    if (n) s[k] = { type: 'addon', id, group: id, label: a.label, price: Number(a.price) || 0, qty: n }; else delete s[k];
    changed();
  }
  let pickGroup = '';
  function productQty(pid, d) {
    const a = addons().find(x => x.id === pickGroup), p = (catalog?.products || []).find(x => x.id === pid); if (!a || !p) return;
    const s = sel(), k = 'p:' + pid, n = Math.max(0, Math.min(20, (s[k]?.qty || 0) + d));
    if (n) s[k] = { type: 'product', id: pid, group: a.id, label: p.name, price: priceFor(a, p), qty: n }; else delete s[k];
    renderPicker(); changed();
  }
  function openPicker(id) {
    pickGroup = id; ensureCss();
    let el = document.getElementById('rbxPick');
    if (!el) {
      el = document.createElement('div'); el.id = 'rbxPick';
      el.innerHTML = '<div class="pdp-card" role="dialog" aria-modal="true"><div class="pdp-hd"><b id="rbxTitle"></b><button type="button" class="pdp-x" onclick="RB.extras.closePicker()" aria-label="Close">✕</button></div><div class="pdp-grid" id="rbxGrid"></div><div class="pdp-foot"><button type="button" class="pdp-done" id="rbxDone" onclick="RB.extras.closePicker()"></button></div></div>';
      el.addEventListener('click', e => { if (e.target === el) closePicker(); });
      document.body.appendChild(el);
    }
    renderPicker(); el.classList.add('show');
  }
  function closePicker() { document.getElementById('rbxPick')?.classList.remove('show'); }
  function renderPicker() {
    const a = addons().find(x => x.id === pickGroup); if (!a || !document.getElementById('rbxPick')) return;
    const s = sel();
    document.getElementById('rbxTitle').textContent = 'Choose ' + a.label.replace(/^\d+\s*/, '').toLowerCase();
    document.getElementById('rbxGrid').innerHTML = productsFor(a).map(p => {
      const n = s['p:' + p.id]?.qty || 0;
      return `<div class="pdp-item${n ? ' on' : ''}">
        <div class="pdp-img" style="background-image:url(&quot;${esc(RB.cardImg(p.image))}&quot;)" onclick="RB.extras.productQty('${esc(p.id)}',1)">${n ? `<span class="pdp-n">${n}</span>` : ''}</div>
        <div class="pdp-name">${esc(p.name)}</div>
        <div class="pdp-row"><span class="pdp-price">QR ${esc(priceFor(a, p))}</span>
          ${n ? `<span class="rbx-step"><button type="button" onclick="RB.extras.productQty('${esc(p.id)}',-1)" aria-label="One less">−</button><b>${n}</b><button type="button" onclick="RB.extras.productQty('${esc(p.id)}',1)" aria-label="One more">+</button></span>`
              : `<button type="button" class="pdp-add" onclick="RB.extras.productQty('${esc(p.id)}',1)">＋ Add</button>`}</div>
      </div>`;
    }).join('');
    const chosen = Object.values(s).filter(x => x.group === a.id);
    const cnt = chosen.reduce((n, x) => n + x.qty, 0), sum = chosen.reduce((t, x) => t + x.qty * x.price, 0);
    document.getElementById('rbxDone').textContent = cnt ? `Done · ${cnt} added · +QR ${sum}` : 'Done';
  }

  // What goes into the bag line
  function variantsOf(s) {
    const chosen = Object.values(s).sort((x, y) => (x.type + x.id).localeCompare(y.type + y.id));
    return {
      addons: chosen.map(x => (x.qty > 1 ? x.qty + '× ' : '') + x.label),
      extras: chosen.map(x => ({ type: x.type, id: x.id, qty: x.qty, group: x.group })),
      sig: chosen.map(x => x.type + ':' + x.id + 'x' + x.qty).join(','),
      total: chosen.reduce((t, x) => t + x.price * x.qty, 0),
    };
  }

  RB.extras = { addonQty, productQty, openPicker, closePicker, variantsOf };

  // Take over the quick-add pop-up's extras (its page scripts define these first)
  function install() {
    if (!document.getElementById('vmAddons')) return;
    window.vmRenderAddons = renderTiles;
    window.vmToggleAddon = id => addonQty(id, 1);
    window.vmCalcPrice = () => (activeVariant.basePrice || 0) + variantsOf(sel()).total;
    const origOpen = window.openVariantModal;
    if (typeof origOpen === 'function') window.openVariantModal = function (btn, name) {
      origOpen(btn, name);
      activeVariant.sel = {};
      renderTiles(); if (typeof vmUpdatePrice === 'function') vmUpdatePrice();
    };
    window.variantAddToCart = function () {
      const v = variantsOf(sel());
      const price = (activeVariant.basePrice || 0) + v.total;
      const vKey = `${activeVariant.name}|${v.sig}`;
      const existing = cart.find(i => i.variantKey === vKey);
      if (existing) existing.qty++;
      else {
        const bgEl = activeVariant.cardEl?.querySelector('.prod-img-bg');
        const piClass = bgEl ? (bgEl.className.match(/pi-\d+/) || [''])[0] : '';
        const img = activeVariant.img || (bgEl?.style.backgroundImage || '').replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        cart.push({ id: Date.now(), name: activeVariant.name, cat: activeVariant.cat, price, basePrice: activeVariant.basePrice, qty: 1,
          variantKey: vKey, variants: { addons: v.addons, extras: v.extras }, piClass, img });
      }
      saveCart(); updateCartUI(); closeVariantModal(); RB.cartUI.toast();
      const addBtn = activeVariant.cardEl?.querySelector('.prod-add');
      if (addBtn) { const orig = addBtn.innerHTML; addBtn.innerHTML = '✓ Added'; addBtn.style.background = '#4a8c4a'; setTimeout(() => { addBtn.innerHTML = orig; addBtn.style.background = ''; }, 1400); }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
