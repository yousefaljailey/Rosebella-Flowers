/* ══════════════════════════════════════════════
   ROSEBELLA ADMIN — dashboard
   Firestore documents:
     catalog/main        { collections[], products[] }
     config/settings     { deliverySlots[], delivery{}, store{}, announcement{}, promos[] }
     config/heroSlides   { slides[] }
     orders/{id}         storefront orders  (+ orderStatus/{id} public status)
     customers/{uid}     storefront sign-ins
   ══════════════════════════════════════════════ */

const state = {
  catalog: null, catalogLoaded: false,
  settings: null, settingsLoaded: false,
  slides: [], slidesLoaded: false,
  orders: [], ordersError: null,
  customers: null,
  page: 'orders',
  orderFilter: 'all', orderQuery: '', openOrders: new Set(),
  catalogColl: '__all',
  custQuery: '',
};

const STATUSES = [
  ['pending', 'Pending'], ['preparing', 'Preparing'], ['out', 'Out for delivery'],
  ['delivered', 'Delivered'], ['cancelled', 'Cancelled'],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);

requireAdmin(user => {
  document.getElementById('whoami').textContent = user.email;
  document.getElementById('storefrontLink').href = STOREFRONT_URL;
  document.querySelectorAll('.nav-btn[data-page]').forEach(b => {
    b.onclick = () => { location.hash = b.dataset.page; document.body.classList.remove('nav-open'); };
  });
  window.addEventListener('hashchange', route);
  subscribe();
  route();
});

function route() {
  const p = (location.hash || '#orders').slice(1);
  state.page = PAGES[p] ? p : 'orders';
  document.querySelectorAll('.nav-btn[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === state.page));
  render();
}

function render() {
  renderSetupBanner();
  const el = document.getElementById('page');
  el.innerHTML = PAGES[state.page].html();
  PAGES[state.page].bind?.(el);
}

// Re-render only when the page shown depends on the data that changed
function refresh(...pages) {
  if (pages.includes(state.page)) render(); else renderSetupBanner();
}

// ── Live data ───────────────────────────────
function subscribe() {
  db.doc('catalog/main').onSnapshot(snap => {
    state.catalog = snap.exists ? normalizeCatalog(snap.data()) : null;
    state.catalogLoaded = true;
    refresh('catalog');
  }, e => toast(firestoreError(e), true));

  db.doc('config/settings').onSnapshot(snap => {
    state.settings = snap.exists ? snap.data() : null;
    state.settingsLoaded = true;
    refresh('slots', 'store', 'promos', 'extras');
  }, e => toast(firestoreError(e), true));

  db.doc('config/heroSlides').onSnapshot(snap => {
    state.slides = (snap.exists && Array.isArray(snap.data().slides)) ? snap.data().slides : [];
    state.slidesLoaded = true;
    refresh('slides');
  }, e => toast(firestoreError(e), true));

  db.collection('orders').orderBy('createdAt', 'desc').limit(300).onSnapshot(qs => {
    state.orders = qs.docs.map(d => ({ ...d.data(), id: d.id }));
    state.ordersError = null;
    const pending = state.orders.filter(o => (o.status || 'pending') === 'pending').length;
    const pc = document.getElementById('pendingCount');
    pc.hidden = !pending; pc.textContent = pending;
    refresh('orders');
  }, e => { state.ordersError = firestoreError(e); refresh('orders'); });
}

function normalizeCatalog(c) {
  return { collections: c.collections || [], products: c.products || [], version: c.version || 1 };
}

// ── First-run import ────────────────────────
function renderSetupBanner() {
  const el = document.getElementById('setupBanner');
  const missing = [];
  if (state.catalogLoaded && !state.catalog) missing.push('products & collections');
  if (state.settingsLoaded && !state.settings) missing.push('store settings');
  el.hidden = !missing.length;
  if (!missing.length) return;
  el.innerHTML = `<div class="banner banner-warn">
    <div><b>Finish setup:</b> no ${missing.join(' or ')} in Firestore yet. The storefront is showing the bundled copy until you import it.</div>
    <button class="btn btn-gold" onclick="importSeed()">Import starting data</button>
  </div>`;
}

async function importSeed() {
  try {
    const writes = [];
    if (!state.catalog) {
      const cat = await fetch('seed/catalog.json').then(r => r.json());
      writes.push(db.doc('catalog/main').set({ ...cat, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
    }
    if (!state.settings) {
      const set = await fetch('seed/settings.json').then(r => r.json());
      writes.push(db.doc('config/settings').set({ ...set, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
    }
    await Promise.all(writes);
    toast('Imported — the storefront now reads from the admin portal');
  } catch (e) { toast(firestoreError(e), true); }
}

// ── Save helpers ────────────────────────────
async function saveCatalog(msg) {
  try {
    await db.doc('catalog/main').set({
      ...state.catalog,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast(msg || 'Saved — live on the storefront');
    return true;
  } catch (e) { toast(firestoreError(e), true); return false; }
}

async function saveSettings(patch, msg) {
  try {
    await db.doc('config/settings').set({ ...patch, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    toast(msg || 'Saved — live on the storefront');
    return true;
  } catch (e) { toast(firestoreError(e), true); return false; }
}

function loadingHTML() { return '<div class="empty">Loading…</div>'; }
function pageHd(title, sub, actions) {
  return `<div class="page-hd"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
function fmtDate(v) {
  if (!v) return '—';
  const d = v.toDate ? v.toDate() : new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function money(n) { return 'QR ' + (Number(n) || 0).toFixed(0); }

// ── Modal ───────────────────────────────────
function openModal(html, onMount) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  const bg = root.firstElementChild;
  bg.addEventListener('mousedown', e => { if (e.target === bg) closeModal(); });
  onMount?.(bg.firstElementChild);
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* Image / video picker: upload to Cloudinary or paste a URL, click the preview to set the focal point. */
function mediaPickerHTML({ url = '', pos = '', wide = false, video = false }) {
  return `<div class="img-pick">
    <div class="img-prev ${wide ? 'wide' : ''}" data-role="prev" title="Click to set the focal point"></div>
    <div class="stack">
      <label class="field"><span>Upload ${video ? 'image or video' : 'image'}</span>
        <input type="file" data-role="file" accept="${video ? 'image/*,video/mp4,video/webm,video/quicktime' : 'image/*'}"></label>
      <label class="field"><span>…or paste a URL</span><input data-role="url" value="${esc(url)}" placeholder="https://"></label>
      <div class="upload-status" data-role="status">${url ? 'Click the preview to set which part of the photo stays in view.' : ''}</div>
      <input type="hidden" data-role="pos" value="${esc(pos)}">
    </div>
  </div>`;
}

function bindMediaPicker(root, { folder, onChange } = {}) {
  const prev = root.querySelector('[data-role=prev]');
  const file = root.querySelector('[data-role=file]');
  const urlI = root.querySelector('[data-role=url]');
  const posI = root.querySelector('[data-role=pos]');
  const stat = root.querySelector('[data-role=status]');
  const isVideo = u => /\/video\/upload\/|\.(mp4|webm|mov)(\?|$)/i.test(u);

  function parsePos() {
    const m = /(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/.exec(posI.value);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [50, 50];
  }
  function paint() {
    const u = urlI.value.trim();
    const [x, y] = parsePos();
    if (!u) { prev.innerHTML = ''; prev.style.backgroundImage = ''; return; }
    if (isVideo(u)) {
      prev.style.backgroundImage = '';
      prev.innerHTML = `<video src="${esc(u)}" muted autoplay loop playsinline></video>`;
    } else {
      prev.innerHTML = `<div class="marker" style="left:${x}%;top:${y}%"></div>`;
      prev.style.backgroundImage = `url("${u.replace(/"/g, '')}")`;
      prev.style.backgroundPosition = `${x}% ${y}%`;
    }
    onChange?.(u, isVideo(u));
  }
  prev.addEventListener('click', e => {
    if (!urlI.value.trim() || isVideo(urlI.value)) return;
    const r = prev.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 100);
    const y = Math.round(((e.clientY - r.top) / r.height) * 100);
    posI.value = `${x}% ${y}%`;
    paint();
  });
  urlI.addEventListener('change', () => { posI.value = ''; paint(); });
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    stat.textContent = `Uploading ${f.name}…`;
    try {
      urlI.value = await uploadMedia(f, folder);
      posI.value = '';
      stat.textContent = 'Uploaded ✓  Click the preview to set the focal point.';
      paint();
    } catch (e) { stat.textContent = '⚠ ' + e.message; }
    file.value = '';
  });
  paint();
  return {
    url: () => urlI.value.trim(),
    pos: () => posI.value,
    xy: () => parsePos(),
    isVideo: () => isVideo(urlI.value.trim()),
  };
}

/* ══════════════════════════════════════════════
   PAGES
   ══════════════════════════════════════════════ */
const PAGES = {};

// ── Orders ──────────────────────────────────
PAGES.orders = {
  html() {
    const head = pageHd('Online <em>Orders</em>', 'Orders placed on the storefront. Status changes show on the customer’s order tracking.');
    if (state.ordersError) return head + `<div class="banner banner-bad">${esc(state.ordersError)}</div>`;
    const q = state.orderQuery.toLowerCase();
    const list = state.orders.filter(o => {
      const st = o.status || 'pending';
      if (state.orderFilter !== 'all' && st !== state.orderFilter) return false;
      if (!q) return true;
      return [o.id, o.recipient?.name, o.recipient?.phone, o.recipient?.address, o.customer?.email]
        .join(' ').toLowerCase().includes(q);
    });
    const counts = {};
    state.orders.forEach(o => { const s = o.status || 'pending'; counts[s] = (counts[s] || 0) + 1; });
    const chips = [['all', 'All', state.orders.length], ...STATUSES.map(([k, l]) => [k, l, counts[k] || 0])]
      .map(([k, l, n]) => `<button class="chip ${state.orderFilter === k ? 'active' : ''}" data-filter="${k}">${l} · ${n}</button>`).join('');
    return head + `
      <div class="row" style="margin-bottom:12px">
        <input class="input" id="orderSearch" placeholder="Search by order ID, name, phone, address…" value="${esc(state.orderQuery)}" style="max-width:380px">
      </div>
      <div class="filters">${chips}</div>
      ${list.length ? list.map(orderHTML).join('') : '<div class="empty">No orders here yet.</div>'}`;
  },
  bind(el) {
    el.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { state.orderFilter = b.dataset.filter; render(); });
    const s = el.querySelector('#orderSearch');
    if (s) s.oninput = () => {
      state.orderQuery = s.value; render();
      const n = document.getElementById('orderSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
    };
    el.querySelectorAll('[data-toggle]').forEach(h => h.onclick = e => {
      if (e.target.closest('a,button')) return;
      const id = h.dataset.toggle;
      state.openOrders.has(id) ? state.openOrders.delete(id) : state.openOrders.add(id);
      render();
    });
    el.querySelectorAll('[data-status]').forEach(b => b.onclick = () => setOrderStatus(b.dataset.id, b.dataset.status));
    el.querySelectorAll('[data-verify]').forEach(b => b.onclick = () => verifyPayment(b));
  },
};

function orderHTML(o) {
  const st = o.status || 'pending';
  const r = o.recipient || {};
  const ds = o.deliverySlot || {};
  const open = state.openOrders.has(o.id);
  const delivery = ds.type === 'express' ? 'Express (90 min)'
    : [ds.date, slotLabel(ds.slot)].filter(Boolean).join(' · ') || '—';
  const phone = String(r.phone || '').replace(/\D/g, '');
  const addr = [r.landmark, r.address].filter(Boolean).join(', ');
  return `<div class="order">
    <div class="order-hd" data-toggle="${esc(o.id)}">
      <div>
        <div class="order-id">${esc(o.id)} <span class="badge st-${esc(st)}">${esc(STATUS_LABEL[st] || st)}</span></div>
        <div class="order-meta">${fmtDate(o.createdAt)} · ${esc(r.name || 'No recipient')} · ${esc(delivery)}</div>
      </div>
      <div class="row">
        <span class="order-meta">${esc(o.paymentMethod === 'cash' ? 'Cash on delivery' : (o.payment?.paymentId ? 'Paid online' : 'Card'))}</span>
        <span class="order-total">${money(o.total)}</span>
      </div>
    </div>
    ${open ? `<div class="order-body">
      <div>
        <h4>Items</h4>
        <ul class="order-items">${(o.items || []).map(i => `<li><span>${esc(i.name)} ×${esc(i.qty || 1)}
          ${i.variants?.addons?.length ? `<small>+ ${esc(i.variants.addons.join(', '))}</small>` : ''}</span>
          <span>${money((i.price || 0) * (i.qty || 1))}</span></li>`).join('')}</ul>
        ${o.deliverySlot?.expressFee ? `<div class="order-meta" style="margin-top:6px">Includes delivery fee ${money(o.deliverySlot.expressFee)}</div>` : ''}
        ${o.giftMessage ? `<h4 style="margin-top:14px">Gift message</h4><p>“${esc(o.giftMessage)}”</p>` : ''}
        <div class="pipeline">${STATUSES.map(([k, l]) =>
          `<button class="btn btn-sm ${st === k ? 'btn-dark' : ''}" data-status="${k}" data-id="${esc(o.id)}">${l}</button>`).join('')}</div>
      </div>
      <div>
        <h4>Recipient</h4>
        <p><b>${esc(r.name || '—')}</b><br>${esc(r.phone || '')}</p>
        <p style="margin-top:6px">${esc(addr || '—')}</p>
        ${r.occasion ? `<p class="order-meta">Occasion: ${esc(r.occasion)}</p>` : ''}
        ${r.notes ? `<p class="order-meta">Notes: ${esc(r.notes)}</p>` : ''}
        <div class="row" style="margin-top:10px">
          ${phone ? `<a class="btn btn-sm" href="https://wa.me/${phone}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${addr ? `<a class="btn btn-sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank" rel="noopener">Map</a>` : ''}
        </div>
        ${o.customer?.email ? `<h4 style="margin-top:14px">Customer</h4><p>${esc(o.customer.name || '')} ${esc(o.customer.email)}</p>` : ''}
        ${o.appliedPromo?.code ? `<p class="order-meta">Promo: ${esc(o.appliedPromo.code)}</p>` : ''}
        ${o.payment?.paymentId ? `<h4 style="margin-top:14px">Payment</h4>
          <p class="order-meta">MyFatoorah invoice ${esc(o.payment.invoiceId || '—')} · payment ${esc(o.payment.paymentId)}${o.payment.method ? ' · ' + esc(o.payment.method) : ''}</p>
          <div class="row" style="margin-top:6px"><button class="btn btn-sm" data-verify="${esc(o.payment.paymentId)}" data-total="${esc(o.total)}" data-ref="${esc(o.id)}">Verify payment</button>
          <span class="order-meta" data-verify-out="${esc(o.payment.paymentId)}"></span></div>` : ''}
      </div>
    </div>` : ''}
  </div>`;
}

function slotLabel(id) {
  if (!id) return '';
  return (state.settings?.deliverySlots || []).find(s => s.id === id)?.label || id;
}

async function setOrderStatus(id, status) {
  const entry = { status, at: new Date().toISOString() };
  const batch = db.batch();
  batch.update(db.collection('orders').doc(id), {
    status, statusHistory: firebase.firestore.FieldValue.arrayUnion(entry),
  });
  batch.set(db.collection('orderStatus').doc(id), {
    status, statusHistory: firebase.firestore.FieldValue.arrayUnion(entry),
  }, { merge: true });
  try { await batch.commit(); toast(`${id} → ${STATUS_LABEL[status]}`); }
  catch (e) { toast(firestoreError(e), true); }
}

// ── Products & collections ──────────────────
PAGES.catalog = {
  html() {
    if (!state.catalogLoaded) return loadingHTML();
    if (!state.catalog) return pageHd('Products &amp; <em>Collections</em>') + '<div class="empty">Import the starting data above to begin.</div>';
    const { collections, products } = state.catalog;
    const sorted = [...collections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const sel = state.catalogColl;
    const coll = collections.find(c => c.slug === sel);
    const list = products
      .filter(p => sel === '__all' || p.cat === sel)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const count = slug => products.filter(p => p.cat === slug).length;

    return pageHd('Products &amp; <em>Collections</em>', 'Changes go live on the storefront as soon as you save.',
      `<button class="btn" onclick="editCollection()">＋ New collection</button>
       <button class="btn btn-gold" onclick="editProduct(null)">＋ New product</button>`) + `
    <div class="catalog">
      <div class="coll-list">
        <div class="coll-item ${sel === '__all' ? 'active' : ''}" data-coll="__all">✦ All products <span class="n">${products.length}</span></div>
        ${sorted.map(c => `<div class="coll-item ${sel === c.slug ? 'active' : ''} ${c.visible === false ? 'off' : ''}" data-coll="${esc(c.slug)}">
          ${esc(c.icon || '🌸')} ${esc(c.name)} <span class="n">${count(c.slug)}</span></div>`).join('')}
      </div>
      <div>
        ${coll ? `<div class="card row" style="justify-content:space-between">
          <div class="row">
            <div style="width:54px;height:54px;border-radius:50%;background:${coll.image ? `url('${esc(coll.image)}') center/cover` : (coll.gradient ? esc(coll.gradient) : '#eee')}"></div>
            <div><h2>${esc(coll.icon || '')} ${esc(coll.name)}</h2>
            <div class="order-meta">/${esc(coll.slug)} · ${coll.visible === false ? 'Hidden from storefront' : 'Visible'}</div></div>
          </div>
          <div class="row">
            <button class="btn btn-sm" onclick="moveCollection('${esc(coll.slug)}',-1)">↑</button>
            <button class="btn btn-sm" onclick="moveCollection('${esc(coll.slug)}',1)">↓</button>
            <button class="btn btn-sm" onclick="editCollection('${esc(coll.slug)}')">Edit collection</button>
          </div>
        </div>` : ''}
        ${list.length ? `<div class="prod-grid">${list.map(productCardHTML).join('')}</div>`
          : `<div class="empty">No products in this collection yet.<br><br><button class="btn btn-gold" onclick="editProduct(null)">＋ Add product</button></div>`}
      </div>
    </div>`;
  },
  bind(el) {
    el.querySelectorAll('[data-coll]').forEach(c => c.onclick = () => { state.catalogColl = c.dataset.coll; render(); });
  },
};

function productCardHTML(p) {
  const coll = state.catalog.collections.find(c => c.slug === p.cat);
  return `<div class="prod ${p.visible === false ? 'off' : ''}">
    <div class="prod-img" style="${p.image ? `background-image:url('${esc(p.image)}');background-position:${esc(p.imagePos || 'center')}` : ''}">
      ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
      ${p.image ? '' : '<span class="noimg">No photo</span>'}
    </div>
    <div class="prod-info">
      <span class="order-meta">${esc(coll?.name || p.cat)}</span>
      <b>${esc(p.name)}</b>
      <span class="price">${money(p.price)}</span>
      ${p.visible === false ? '<span class="order-meta">Hidden</span>' : ''}
    </div>
    <div class="prod-actions">
      <button class="btn btn-sm" onclick="editProduct('${esc(p.id)}')">Edit</button>
      <button class="btn btn-sm" title="Move earlier" onclick="moveProduct('${esc(p.id)}',-1)">↑</button>
      <button class="btn btn-sm" title="Move later" onclick="moveProduct('${esc(p.id)}',1)">↓</button>
    </div>
  </div>`;
}

function renumber(list) { list.forEach((x, i) => { x.order = i; }); }

function moveProduct(id, dir) {
  const all = [...state.catalog.products].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const scope = state.catalogColl === '__all' ? all : all.filter(p => p.cat === state.catalogColl);
  const i = scope.findIndex(p => p.id === id), j = i + dir;
  if (j < 0 || j >= scope.length) return;
  const a = all.indexOf(scope[i]), b = all.indexOf(scope[j]);
  [all[a], all[b]] = [all[b], all[a]];
  renumber(all);
  state.catalog.products = all;
  render();
  saveCatalog('Order saved');
}

function moveCollection(slug, dir) {
  const all = [...state.catalog.collections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const i = all.findIndex(c => c.slug === slug), j = i + dir;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  renumber(all);
  state.catalog.collections = all;
  render();
  saveCatalog('Order saved');
}

function editProduct(id) {
  const isNew = !id;
  const p = isNew
    ? { id: 'p' + Date.now().toString(36), cat: state.catalogColl !== '__all' ? state.catalogColl : (state.catalog.collections[0]?.slug || ''),
        name: '', desc: '', price: '', badge: '', badgeStyle: 'new', image: '', imagePos: '', visible: true }
    : { ...state.catalog.products.find(x => x.id === id) };
  const opts = [...state.catalog.collections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(c => `<option value="${esc(c.slug)}" ${c.slug === p.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  openModal(`<h3>${isNew ? 'New product' : 'Edit product'}</h3>
    <form class="stack" id="prodForm">
      <div class="grid-2">
        <label class="field"><span>Name</span><input name="name" required value="${esc(p.name)}"></label>
        <label class="field"><span>Collection</span><select name="cat" required>${opts}</select></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Price (QR)</span><input name="price" type="number" min="0" step="1" required value="${esc(p.price)}"></label>
        <label class="field"><span>Badge text</span><input name="badge" value="${esc(p.badge)}" placeholder="e.g. Bestseller"></label>
        <label class="field"><span>Badge colour</span><select name="badgeStyle">
          ${[['popular', 'Gold (popular)'], ['new', 'Dark (new)'], ['sale', 'Red (sale)']].map(([v, l]) =>
            `<option value="${v}" ${p.badgeStyle === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      </div>
      <label class="field"><span>Description</span><textarea name="desc" dir="auto">${esc(p.desc)}</textarea></label>
      ${galleryHTML()}
      <label class="switch"><input type="checkbox" name="visible" ${p.visible !== false ? 'checked' : ''}> Show on storefront</label>
      <div class="modal-foot">
        <div>${isNew ? '' : '<button type="button" class="btn btn-danger" id="delProd">Delete product</button>'}</div>
        <div class="row"><button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" type="submit">Save product</button></div>
      </div>
    </form>`, m => {
    const gallery = bindGallery(m, (Array.isArray(p.images) && p.images.length ? p.images : [p.image]).filter(Boolean));
    m.querySelector('#delProd')?.addEventListener('click', async () => {
      if (!confirm(`Delete “${p.name}”? This removes it from the storefront.`)) return;
      state.catalog.products = state.catalog.products.filter(x => x.id !== p.id);
      if (await saveCatalog('Product deleted')) closeModal();
    });
    m.querySelector('#prodForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (gallery.busy()) { toast('Wait for the photos to finish uploading', true); return; }
      const images = gallery.images();
      const main = images[0] || '';
      const next = {
        ...p,
        name: f.get('name').trim(), cat: f.get('cat'),
        price: Number(f.get('price')) || 0,
        badge: f.get('badge').trim(), badgeStyle: f.get('badgeStyle'),
        desc: f.get('desc').trim(),
        images, image: main,
        imagePos: main === p.image ? (p.imagePos || '') : '',
        placeholder: main ? '' : (p.placeholder || ''),
        visible: !!f.get('visible'),
      };
      if (isNew) {
        next.order = Math.max(-1, ...state.catalog.products.map(x => x.order ?? 0)) + 1;
        state.catalog.products.push(next);
      } else {
        state.catalog.products = state.catalog.products.map(x => x.id === p.id ? next : x);
      }
      if (await saveCatalog()) closeModal();
    };
  });
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function editCollection(slug) {
  const isNew = !slug;
  const c = isNew ? { slug: '', name: '', icon: '🌸', image: '', gradient: '', visible: true }
    : { ...state.catalog.collections.find(x => x.slug === slug) };
  const n = isNew ? 0 : state.catalog.products.filter(p => p.cat === slug).length;

  openModal(`<h3>${isNew ? 'New collection' : 'Edit collection'}</h3>
    <form class="stack" id="collForm">
      <div class="grid-3">
        <label class="field" style="grid-column:span 2"><span>Name</span><input name="name" required value="${esc(c.name)}"></label>
        <label class="field"><span>Icon (emoji)</span><input name="icon" value="${esc(c.icon)}" maxlength="8"></label>
      </div>
      <label class="field"><span>Web address</span><input name="slug" value="${esc(c.slug)}" ${isNew ? '' : 'readonly'} placeholder="auto from name">
        <small class="order-meta">${isNew ? 'collection.html?cat=…' : 'Can’t be changed once products use it.'}</small></label>
      <div class="field"><span>Circle image (Shop by Collection)</span>${mediaPickerHTML({ url: c.image, pos: c.imagePos })}</div>
      <label class="switch"><input type="checkbox" name="visible" ${c.visible !== false ? 'checked' : ''}> Show on storefront</label>
      <div class="modal-foot">
        <div>${isNew ? '' : `<button type="button" class="btn btn-danger" id="delColl">Delete collection</button>`}</div>
        <div class="row"><button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" type="submit">Save collection</button></div>
      </div>
    </form>`, m => {
    const media = bindMediaPicker(m, { folder: 'rosebella/collections' });
    const nameI = m.querySelector('[name=name]'), slugI = m.querySelector('[name=slug]');
    if (isNew) nameI.addEventListener('input', () => { if (!slugI.dataset.touched) slugI.value = slugify(nameI.value); });
    slugI.addEventListener('input', () => { slugI.dataset.touched = '1'; });
    m.querySelector('#delColl')?.addEventListener('click', async () => {
      if (n) { alert(`“${c.name}” still has ${n} product${n === 1 ? '' : 's'}. Move or delete them first.`); return; }
      if (!confirm(`Delete the collection “${c.name}”?`)) return;
      state.catalog.collections = state.catalog.collections.filter(x => x.slug !== c.slug);
      state.catalogColl = '__all';
      if (await saveCatalog('Collection deleted')) closeModal();
    });
    m.querySelector('#collForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const newSlug = isNew ? slugify(f.get('slug') || f.get('name')) : c.slug;
      if (!newSlug) { toast('Enter a name', true); return; }
      if (isNew && state.catalog.collections.some(x => x.slug === newSlug)) { toast('A collection with that address already exists', true); return; }
      const next = { ...c, slug: newSlug, name: f.get('name').trim(), icon: f.get('icon').trim() || '🌸',
        image: media.url(), imagePos: media.pos(), visible: !!f.get('visible') };
      if (isNew) {
        next.order = Math.max(-1, ...state.catalog.collections.map(x => x.order ?? 0)) + 1;
        state.catalog.collections.push(next);
        state.catalogColl = newSlug;
      } else {
        state.catalog.collections = state.catalog.collections.map(x => x.slug === c.slug ? next : x);
      }
      if (await saveCatalog()) closeModal();
    };
  });
}

// ── Customers ───────────────────────────────
PAGES.customers = {
  html() {
    const head = pageHd('Customer <em>Accounts</em>', 'People who signed in on the storefront.',
      '<button class="btn" onclick="loadCustomers(true)">↻ Refresh</button>');
    if (state.customers === null) { loadCustomers(); return head + loadingHTML(); }
    if (state.customers.error) return head + `<div class="banner banner-bad">${esc(state.customers.error)}</div>`;
    const q = state.custQuery.toLowerCase();
    const rows = state.customers.filter(c => !q || [c.name, c.email].join(' ').toLowerCase().includes(q));
    return head + `<div class="card">
      <input class="input" id="custSearch" placeholder="Search name or email" value="${esc(state.custQuery)}" style="max-width:320px;margin-bottom:12px">
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Sign-in</th><th>Last login</th><th>Joined</th></tr></thead>
        <tbody>${rows.map(c => `<tr><td>${esc(c.name || '—')}</td><td>${esc(c.email || '—')}</td><td>${esc(c.method || '—')}</td>
          <td>${fmtDate(c.lastLogin)}</td><td>${fmtDate(c.createdAt)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No customers found</td></tr>'}</tbody>
      </table></div></div>`;
  },
  bind(el) {
    const s = el.querySelector('#custSearch');
    if (s) s.oninput = () => {
      state.custQuery = s.value; render();
      const n = document.getElementById('custSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
    };
  },
};

let _custLoading = false;
async function loadCustomers(force) {
  if (_custLoading) return;
  if (force) { state.customers = null; render(); }
  _custLoading = true;
  try {
    const qs = await db.collection('customers').orderBy('lastLogin', 'desc').limit(500).get();
    state.customers = qs.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { state.customers = []; state.customers.error = firestoreError(e); }
  _custLoading = false;
  refresh('customers');
}

// ── Delivery slots ──────────────────────────
PAGES.slots = {
  html() {
    if (!state.settingsLoaded) return loadingHTML();
    const slots = state.settings?.deliverySlots || [];
    const lead = state.settings?.delivery?.leadHours ?? 2;
    return pageHd('Delivery <em>Slots</em>', 'Shown in the date &amp; time picker at checkout.',
      '<button class="btn btn-gold" id="saveSlots">Save slots</button>') + `
      <div class="card">
        <div class="table-wrap"><table id="slotTable">
          <thead><tr><th>Label</th><th>Starts (hour, 0–23)</th><th>Fee (QR)</th><th>Available</th><th>Full width</th><th></th></tr></thead>
          <tbody>${slots.map(slotRowHTML).join('')}</tbody>
        </table></div>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="addSlot">＋ Add slot</button>
          <button class="btn" id="addExpress">＋ Add express slot</button>
        </div>
      </div>
      <div class="card">
        <h2>Same-day rules</h2>
        <p class="hint">Today’s slots are hidden when they start sooner than this many hours from now. Express slots are offered for today only.</p>
        <label class="field" style="max-width:200px"><span>Lead time (hours)</span><input id="leadHours" type="number" min="0" max="12" value="${esc(lead)}"></label>
      </div>`;
  },
  bind(el) {
    const tbody = el.querySelector('#slotTable tbody');
    el.querySelector('#addSlot').onclick = () => tbody.insertAdjacentHTML('beforeend',
      slotRowHTML({ id: 's' + Date.now().toString(36), label: '', start: 12, fee: 0, available: true }));
    el.querySelector('#addExpress').onclick = () => tbody.insertAdjacentHTML('beforeend',
      slotRowHTML({ id: 's_express', label: 'Within 90 minutes', start: -1, fee: 50, available: true, fullWidth: true }));
    tbody.addEventListener('click', e => { if (e.target.closest('[data-del]')) e.target.closest('tr').remove(); });
    el.querySelector('#saveSlots').onclick = () => {
      const rows = [...tbody.querySelectorAll('tr')].map(tr => {
        const g = n => tr.querySelector(`[name=${n}]`);
        const start = parseInt(g('start').value, 10);
        const s = { id: tr.dataset.id, label: g('label').value.trim(), start: isNaN(start) ? 0 : start,
          fee: Number(g('fee').value) || 0, available: g('available').checked };
        if (g('fullWidth').checked) s.fullWidth = true;
        return s;
      }).filter(s => s.label);
      const ids = rows.map(r => r.id);
      if (new Set(ids).size !== ids.length) { toast('Only one express slot is allowed', true); return; }
      saveSettings({ deliverySlots: rows, delivery: { leadHours: Number(el.querySelector('#leadHours').value) || 0 } });
    };
  },
};

function slotRowHTML(s) {
  return `<tr data-id="${esc(s.id)}">
    <td><input class="input" name="label" value="${esc(s.label)}" placeholder="3:00pm – 6:00pm"></td>
    <td>${s.id === 's_express'
      ? '<input type="hidden" name="start" value="-1"><span class="order-meta">Express · today only</span>'
      : `<input class="input" name="start" type="number" min="0" max="23" value="${esc(s.start)}" style="width:90px">`}</td>
    <td><input class="input" name="fee" type="number" min="0" value="${esc(s.fee)}" style="width:90px"></td>
    <td><label class="switch"><input type="checkbox" name="available" ${s.available ? 'checked' : ''}></label></td>
    <td><label class="switch"><input type="checkbox" name="fullWidth" ${s.fullWidth ? 'checked' : ''}></label></td>
    <td><button class="btn btn-sm btn-danger" data-del title="Remove">✕</button></td>
  </tr>`;
}

// ── Hero slides ─────────────────────────────
const CTA_LINKS = [['#collections', 'Shop / Collections'], ['#occasions', 'Shop by Collection'], ['shop.html', 'Shop page'], ['story.html', 'Our Story'], ['contact.html', 'Contact']];

PAGES.slides = {
  html() {
    if (!state.slidesLoaded) return loadingHTML();
    const s = state.slides;
    return pageHd('Hero <em>Slides</em>', 'The full-width slider at the top of the homepage.',
      '<button class="btn btn-gold" onclick="editSlide(null)">＋ Add slide</button>') + `
      <div class="card">${s.length ? s.map((sl, i) => `<div class="slide-row">
        <div class="slide-thumb" style="${sl.type !== 'video' && sl.src ? `background-image:url('${esc(sl.src)}');background-position:${sl.posX ?? 50}% ${sl.posY ?? 50}%` : ''}">
          ${sl.type === 'video' && sl.src ? `<video src="${esc(sl.src)}" muted preload="metadata"></video>` : ''}</div>
        <div><b>${esc(sl.title || '')} <em>${esc(sl.titleItalic || '')}</em></b>
          <div class="order-meta">${esc(sl.subtitle || '')}</div>
          ${String(sl.src || '').startsWith('blob:') || String(sl.src || '').startsWith('data:') || !sl.src
            ? '<div class="order-meta" style="color:var(--bad)">⚠ Media isn’t hosted online — upload it again so visitors can see it.</div>' : ''}</div>
        <div class="row">
          <button class="btn btn-sm" onclick="moveSlide(${i},-1)">↑</button>
          <button class="btn btn-sm" onclick="moveSlide(${i},1)">↓</button>
          <button class="btn btn-sm" onclick="editSlide(${i})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSlide(${i})">Delete</button>
        </div></div>`).join('')
        : '<div class="empty">No slides yet — the storefront shows its built-in default slide.</div>'}</div>`;
  },
};

async function saveSlides(slides, msg) {
  try { await db.doc('config/heroSlides').set({ slides }); toast(msg || 'Slides saved — live on the storefront'); return true; }
  catch (e) { toast(firestoreError(e), true); return false; }
}
function moveSlide(i, dir) {
  const s = [...state.slides], j = i + dir;
  if (j < 0 || j >= s.length) return;
  [s[i], s[j]] = [s[j], s[i]];
  saveSlides(s, 'Order saved');
}
function deleteSlide(i) {
  if (!confirm('Delete this slide?')) return;
  saveSlides(state.slides.filter((_, k) => k !== i), 'Slide deleted');
}

function editSlide(i) {
  const isNew = i === null;
  const s = isNew ? { id: Date.now(), type: 'image', src: '', eyebrow: 'Luxury Flowers & Chocolates', title: '', titleItalic: '',
    subtitle: '', cta: 'Shop Now', ctaLink: '#collections' } : { ...state.slides[i] };
  const custom = !CTA_LINKS.some(([v]) => v === s.ctaLink);
  const src = String(s.src || '').startsWith('blob:') ? '' : s.src;
  openModal(`<h3>${isNew ? 'New slide' : 'Edit slide'}</h3>
    <form class="stack" id="slideForm">
      <div class="field"><span>Photo or video</span>${mediaPickerHTML({ url: src, pos: s.type === 'image' && s.posX != null ? `${s.posX}% ${s.posY}%` : '', wide: true, video: true })}</div>
      <label class="field"><span>Small heading</span><input name="eyebrow" value="${esc(s.eyebrow)}"></label>
      <div class="grid-2">
        <label class="field"><span>Heading</span><input name="title" value="${esc(s.title)}" placeholder="Elegance"></label>
        <label class="field"><span>Heading in gold italics</span><input name="titleItalic" value="${esc(s.titleItalic)}" placeholder="Delivered"></label>
      </div>
      <label class="field"><span>Subtitle</span><input name="subtitle" value="${esc(s.subtitle)}"></label>
      <div class="grid-2">
        <label class="field"><span>Button label</span><input name="cta" value="${esc(s.cta)}"></label>
        <label class="field"><span>Button goes to</span><select name="ctaSel">
          ${CTA_LINKS.map(([v, l]) => `<option value="${v}" ${s.ctaLink === v ? 'selected' : ''}>${l}</option>`).join('')}
          <option value="custom" ${custom ? 'selected' : ''}>Custom link…</option></select>
          <input name="ctaCustom" placeholder="https://" value="${custom ? esc(s.ctaLink) : ''}" ${custom ? '' : 'hidden'}></label>
      </div>
      <div class="modal-foot"><div></div><div class="row">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" type="submit">Save slide</button></div></div>
    </form>`, m => {
    const media = bindMediaPicker(m, { folder: 'rosebella/hero' });
    const sel = m.querySelector('[name=ctaSel]'), cus = m.querySelector('[name=ctaCustom]');
    sel.onchange = () => { cus.hidden = sel.value !== 'custom'; };
    m.querySelector('#slideForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (!media.url()) { toast('Add a photo or video', true); return; }
      const [x, y] = media.xy();
      const next = { ...s, src: media.url(), type: media.isVideo() ? 'video' : 'image', posX: x, posY: y,
        eyebrow: f.get('eyebrow').trim(), title: f.get('title').trim(), titleItalic: f.get('titleItalic').trim(),
        subtitle: f.get('subtitle').trim(), cta: f.get('cta').trim() || 'Shop Now',
        ctaLink: sel.value === 'custom' ? (f.get('ctaCustom').trim() || '#collections') : sel.value };
      const slides = [...state.slides];
      if (isNew) slides.push(next); else slides[i] = next;
      if (await saveSlides(slides)) closeModal();
    };
  });
}

// ── Store info + announcement ───────────────
PAGES.store = {
  html() {
    if (!state.settingsLoaded) return loadingHTML();
    const s = state.settings?.store || {};
    const a = state.settings?.announcement || {};
    const f = (k, l, ph = '') => `<label class="field"><span>${l}</span><input name="${k}" value="${esc(s[k] || '')}" placeholder="${ph}"></label>`;
    return pageHd('Store <em>Info</em>', 'Contact details used across the storefront (WhatsApp buttons, footer, contact page).',
      '<button class="btn btn-gold" id="saveStore">Save</button>') + `
      <form id="storeForm">
        <div class="card"><h2>Contact</h2><p class="hint">WhatsApp orders and chat buttons use the WhatsApp number.</p>
          <div class="grid-2">
            ${f('whatsapp', 'WhatsApp number (with country code)', '97433446618')}
            ${f('phone', 'Phone (as displayed)', '+974 33 446 618')}
            ${f('email', 'Email', 'hello@rosebella.qa')}
            ${f('name', 'Store name', 'Rosebella')}
          </div></div>
        <div class="card"><h2>Social</h2><div class="grid-2">
            ${f('instagram', 'Instagram URL', 'https://www.instagram.com/…')}
            ${f('tiktok', 'TikTok URL', 'https://www.tiktok.com/@…')}
            ${f('facebook', 'Facebook URL', 'https://www.facebook.com/…')}
          </div></div>
        <div class="card"><h2>Announcement bar</h2><p class="hint">A thin bar across the top of every storefront page.</p>
          <div class="stack">
            <label class="switch"><input type="checkbox" name="annEnabled" ${a.enabled ? 'checked' : ''}> Show announcement</label>
            <label class="field"><span>Text</span><input name="annText" value="${esc(a.text || '')}" placeholder="Free delivery across Doha this weekend"></label>
            <label class="field"><span>Link (optional)</span><input name="annLink" value="${esc(a.link || '')}" placeholder="shop.html"></label>
          </div></div>
      </form>`;
  },
  bind(el) {
    el.querySelector('#saveStore').onclick = () => {
      const f = new FormData(el.querySelector('#storeForm'));
      const store = {};
      ['whatsapp', 'phone', 'email', 'name', 'instagram', 'tiktok', 'facebook'].forEach(k => { store[k] = (f.get(k) || '').trim(); });
      store.whatsapp = store.whatsapp.replace(/\D/g, '');
      saveSettings({ store, announcement: { enabled: !!f.get('annEnabled'), text: f.get('annText').trim(), link: f.get('annLink').trim() } });
    };
  },
};

// ── Promo codes ─────────────────────────────
PAGES.promos = {
  html() {
    if (!state.settingsLoaded) return loadingHTML();
    const promos = state.settings?.promos || [];
    return pageHd('Promo <em>Codes</em>', 'Customers enter these in the cart or at checkout.',
      '<button class="btn btn-gold" id="savePromos">Save codes</button>') + `
      <div class="card"><div class="table-wrap"><table id="promoTable">
        <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Active</th><th></th></tr></thead>
        <tbody>${promos.map(promoRowHTML).join('')}</tbody></table></div>
        <button class="btn" id="addPromo" style="margin-top:12px">＋ Add code</button></div>`;
  },
  bind(el) {
    const tbody = el.querySelector('#promoTable tbody');
    el.querySelector('#addPromo').onclick = () => tbody.insertAdjacentHTML('beforeend', promoRowHTML({ code: '', type: 'percent', value: 10, active: true }));
    tbody.addEventListener('click', e => { if (e.target.closest('[data-del]')) e.target.closest('tr').remove(); });
    el.querySelector('#savePromos').onclick = () => {
      const rows = [...tbody.querySelectorAll('tr')].map(tr => {
        const g = n => tr.querySelector(`[name=${n}]`);
        return { code: g('code').value.trim().toUpperCase().replace(/\s+/g, ''), type: g('type').value,
          value: Number(g('value').value) || 0, active: g('active').checked };
      }).filter(p => p.code);
      const codes = rows.map(r => r.code);
      if (new Set(codes).size !== codes.length) { toast('Each code must be unique', true); return; }
      if (rows.some(r => r.type === 'percent' && (r.value <= 0 || r.value > 100))) { toast('Percent discounts must be between 1 and 100', true); return; }
      saveSettings({ promos: rows });
    };
  },
};

function promoRowHTML(p) {
  return `<tr>
    <td><input class="input" name="code" value="${esc(p.code)}" placeholder="WELCOME20" style="text-transform:uppercase"></td>
    <td><select class="input" name="type"><option value="percent" ${p.type === 'percent' ? 'selected' : ''}>% off</option>
      <option value="fixed" ${p.type === 'fixed' ? 'selected' : ''}>QR off</option></select></td>
    <td><input class="input" name="value" type="number" min="0" value="${esc(p.value)}" style="width:100px"></td>
    <td><label class="switch"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}></label></td>
    <td><button class="btn btn-sm btn-danger" data-del title="Remove">✕</button></td>
  </tr>`;
}

// ── Gift extras ("Complete your gift" in the product popup) ──
const DEFAULT_EXTRAS = [
  { id: 'balloon',   label: 'Balloon',    icon: '🎈', price: 35, image: '', active: true, bg: 'radial-gradient(circle at 50% 35%, #fce4f0 0%, #f07898 50%, #b03060 100%)' },
  { id: 'chocolate', label: 'Chocolates', icon: '🍫', price: 55, image: '', active: true, bg: 'radial-gradient(circle at 50% 35%, #c8a078 0%, #8c5030 50%, #3e1008 100%)' },
  { id: 'vase',      label: 'Vase',       icon: '🏺', price: 45, image: '', active: true, bg: 'radial-gradient(circle at 50% 35%, #c8e8e0 0%, #60a890 50%, #1e6050 100%)' },
  { id: 'candle',    label: 'Candle',     icon: '🕯', price: 30, image: '', active: true, bg: 'radial-gradient(circle at 50% 35%, #fff0c0 0%, #e8c050 50%, #987010 100%)' },
  { id: 'perfume',   label: 'Perfume',    icon: '✨', price: 65, image: '', active: true, bg: 'radial-gradient(circle at 50% 35%, #ead0f8 0%, #9860c8 50%, #4a1080 100%)' },
];
function currentExtras() {
  return Array.isArray(state.settings?.addons) ? state.settings.addons.map(a => ({ ...a })) : DEFAULT_EXTRAS.map(a => ({ ...a }));
}
function extraThumbStyle(a) {
  return a.image
    ? `background:#2a2520 url('${esc(a.image)}') ${esc(a.imagePos || 'center')} / cover no-repeat`
    : `background:${esc(a.bg || '#c6922a')}`;
}

PAGES.extras = {
  html() {
    if (!state.settingsLoaded) return loadingHTML();
    const list = currentExtras();
    return pageHd('Gift <em>Extras</em>', 'The “Complete your gift” add-ons shown when a customer adds a product. Upload a photo for each.',
      '<button class="btn btn-gold" onclick="editExtra(null)">＋ Add extra</button>') + `
      <div class="card">${list.length ? list.map((a, i) => `<div class="slide-row">
        <div class="slide-thumb" style="${extraThumbStyle(a)};display:flex;align-items:center;justify-content:center;font-size:28px">${a.image ? '' : esc(a.icon || '')}</div>
        <div><b>${esc(a.label)}</b> <span class="order-meta">+QR ${esc(a.price)}</span>
          <div class="order-meta">${a.active === false ? 'Hidden from customers' : 'Shown to customers'}${a.image ? '' : ' · no photo yet'}</div></div>
        <div class="row">
          <button class="btn btn-sm" onclick="moveExtra(${i},-1)" title="Move earlier">↑</button>
          <button class="btn btn-sm" onclick="moveExtra(${i},1)" title="Move later">↓</button>
          <button class="btn btn-sm" onclick="editExtra(${i})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteExtra(${i})">Delete</button>
        </div></div>`).join('')
        : '<div class="empty">No extras — customers won’t see the “Complete your gift” section.</div>'}</div>`;
  },
};

function saveExtras(list, msg) { return saveSettings({ addons: list }, msg); }
function moveExtra(i, dir) {
  const l = currentExtras(), j = i + dir;
  if (j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  saveExtras(l, 'Order saved');
}
function deleteExtra(i) {
  const l = currentExtras();
  if (!confirm(`Delete “${l[i].label}”?`)) return;
  l.splice(i, 1);
  saveExtras(l, 'Extra deleted');
}

function editExtra(i) {
  const isNew = i === null;
  const list = currentExtras();
  const a = isNew ? { id: 'x' + Date.now().toString(36), label: '', price: '', icon: '🎁', image: '', active: true,
    bg: 'radial-gradient(circle at 50% 35%, #f5e6c8 0%, #c6922a 55%, #7a5410 100%)' } : list[i];
  openModal(`<h3>${isNew ? 'New gift extra' : 'Edit gift extra'}</h3>
    <form class="stack" id="extraForm">
      <div class="grid-3">
        <label class="field" style="grid-column:span 2"><span>Name</span><input name="label" required value="${esc(a.label)}" placeholder="e.g. Teddy Bear"></label>
        <label class="field"><span>Price (QR)</span><input name="price" type="number" min="0" step="1" required value="${esc(a.price)}"></label>
      </div>
      <div class="field"><span>Photo</span>${mediaPickerHTML({ url: a.image, pos: a.imagePos, wide: true })}</div>
      <label class="field" style="max-width:200px"><span>Emoji (shown if there’s no photo)</span><input name="icon" value="${esc(a.icon || '')}" maxlength="8"></label>
      <label class="switch"><input type="checkbox" name="active" ${a.active !== false ? 'checked' : ''}> Show to customers</label>
      <div class="modal-foot"><div></div><div class="row">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" type="submit">Save extra</button></div></div>
    </form>`, m => {
    const media = bindMediaPicker(m, { folder: 'rosebella/extras' });
    m.querySelector('#extraForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const next = { ...a, label: f.get('label').trim(), price: Number(f.get('price')) || 0,
        icon: f.get('icon').trim(), image: media.url(), imagePos: media.pos(), active: !!f.get('active') };
      if (isNew) list.push(next); else list[i] = next;
      if (await saveExtras(list)) closeModal();
    };
  });
}

// ── Product photo gallery (several photos; the first is the main one) ──
function galleryHTML() {
  return `<div class="field"><span>Photos <small style="text-transform:none;letter-spacing:0;font-weight:400">— the first photo is the main one on product cards; customers can browse and zoom all of them</small></span>
    <div class="gal" data-role="gal"></div>
    <div class="row" style="margin-top:8px">
      <label class="btn btn-sm">＋ Upload photos<input type="file" accept="image/*" multiple hidden data-role="galfile"></label>
      <input class="input" data-role="galurl" placeholder="…or paste a photo URL and press Enter" style="flex:1;min-width:180px">
    </div>
    <div class="upload-status" data-role="galstat"></div>
  </div>`;
}

function bindGallery(root, initial) {
  let images = [...initial];
  let uploading = 0;
  const gal = root.querySelector('[data-role=gal]');
  const stat = root.querySelector('[data-role=galstat]');
  function draw() {
    gal.innerHTML = images.length ? images.map((u, i) => `<div class="gal-item" style="background-image:url('${esc(u)}')">
        ${i === 0 ? '<span class="gal-main">Main</span>' : ''}
        <div class="gal-acts">
          <button type="button" data-a="left" data-i="${i}" title="Move earlier" ${i === 0 ? 'disabled' : ''}>‹</button>
          ${i ? `<button type="button" data-a="main" data-i="${i}" title="Make main photo">★</button>` : ''}
          <button type="button" data-a="right" data-i="${i}" title="Move later" ${i === images.length - 1 ? 'disabled' : ''}>›</button>
          <button type="button" data-a="del" data-i="${i}" title="Remove">✕</button>
        </div></div>`).join('')
      : '<div class="order-meta" style="padding:14px 0">No photos yet.</div>';
  }
  gal.addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const i = +b.dataset.i;
    if (b.dataset.a === 'del') images.splice(i, 1);
    if (b.dataset.a === 'left' && i > 0) [images[i - 1], images[i]] = [images[i], images[i - 1]];
    if (b.dataset.a === 'right' && i < images.length - 1) [images[i + 1], images[i]] = [images[i], images[i + 1]];
    if (b.dataset.a === 'main') images.unshift(images.splice(i, 1)[0]);
    draw();
  });
  root.querySelector('[data-role=galfile]').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    uploading += files.length;
    stat.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;
    const results = await Promise.allSettled(files.map(f => uploadMedia(f, 'rosebella/products')));
    uploading -= files.length;
    results.forEach(r => { if (r.status === 'fulfilled') images.push(r.value); });
    const failed = results.filter(r => r.status === 'rejected').length;
    stat.textContent = failed ? `⚠ ${failed} photo${failed > 1 ? 's' : ''} failed to upload.` : 'Uploaded ✓';
    draw();
  });
  const urlI = root.querySelector('[data-role=galurl]');
  urlI.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const u = urlI.value.trim();
    if (/^https?:\/\//.test(u)) { images.push(u); urlI.value = ''; draw(); }
  });
  draw();
  return { images: () => [...images], busy: () => uploading > 0 };
}

// Asks MyFatoorah (via the storefront's payment API) whether an online payment really went through
async function verifyPayment(btn) {
  const id = btn.dataset.verify;
  const out = document.querySelector(`[data-verify-out="${CSS.escape(id)}"]`);
  out.textContent = 'Checking…';
  try {
    const st = await fetch(`${STOREFRONT_URL}/api/pay?action=status&paymentId=${encodeURIComponent(id)}`).then(r => r.json());
    if (st.error) throw new Error(st.error);
    const amountOk = Math.abs((st.amount || 0) - Number(btn.dataset.total || 0)) < 1;
    const refOk = st.reference === btn.dataset.ref;
    out.innerHTML = st.paid
      ? `<b style="color:var(--ok)">✓ Paid QR ${esc(st.amount)}</b>${amountOk && refOk ? '' : ' <b style="color:var(--bad)">— amount or order doesn’t match, check in MyFatoorah</b>'}`
      : `<b style="color:var(--bad)">✕ Not paid (${esc(st.status || 'unknown')})</b>`;
  } catch (e) { out.textContent = 'Could not check: ' + e.message; }
}
