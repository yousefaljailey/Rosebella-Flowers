/* ══════════════════════════════════════════════
   ROSEBELLA POS — glue between the POS module (pos/pos.js) and Firestore
   • POS records (sales, inventory, CRM, wire orders, delivery statuses) are
     mirrored to adminData/pos so they follow you across devices.
   • Online storefront orders stream in from the `orders` collection.
   • Products come from the catalog (catalog/main + catalog/products_N).
   ══════════════════════════════════════════════ */
const POS_SYNC_KEYS = [
  'rosebella_pos_orders', 'rosebella_inventory', 'rosebella_del_status',
  'rosebella_crm', 'rosebella_wire', 'rosebella_wire_integrations',
];
const posDataRef = db.doc('adminData/pos');
let posCatalog = null;
let posSlots = [];

requireAdmin(async () => {
  // 1. Pull saved POS data before the POS module reads localStorage
  try {
    const snap = await posDataRef.get();
    const data = snap.exists ? snap.data() : {};
    const local = {};
    POS_SYNC_KEYS.forEach(k => {
      if (typeof data[k] === 'string') localStorage.setItem(k, data[k]);
      else if (localStorage.getItem(k) != null) local[k] = localStorage.getItem(k);
    });
    // First run on this device: upload anything already stored here
    if (Object.keys(local).length) await posDataRef.set(local, { merge: true });
  } catch (e) { toast(firestoreError(e), true); }

  // 2. Push every later change
  const pending = {};
  let timer = null;
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === localStorage && POS_SYNC_KEYS.includes(k)) {
      pending[k] = String(v);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const batch = { ...pending };
        Object.keys(pending).forEach(x => delete pending[x]);
        posDataRef.set({ ...batch, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
          .catch(e => toast(firestoreError(e), true));
      }, 600);
    }
  };

  // 3. Start the POS module
  await loadScript('pos/pos.js');
  installPosOverrides();
  posNavTo('register', document.querySelector('.pos-nav-tab[data-panel="register"]'));
  updatePosUI();

  // 4. Live data
  subscribeCatalog(({ catalog }) => {
    posCatalog = catalog;
    renderPosProducts((document.getElementById('posSearch')?.value || '').trim().toLowerCase());
  }, e => toast(firestoreError(e), true));

  db.doc('config/settings').onSnapshot(s => {
    posSlots = (s.exists && s.data().deliverySlots) || [];
  });

  db.collection('orders').orderBy('createdAt', 'desc').limit(300).onSnapshot(qs => {
    const orders = qs.docs.map(d => ({ ...d.data(), id: d.id }));
    // The POS module reads online orders from this key (local only, not synced)
    origSet.call(localStorage, 'rosebella_orders', JSON.stringify(orders));
    orders.forEach(o => { if (o.status) delStatusMap[o.id] = o.status; });
    rerenderActivePanel();
  }, e => toast(firestoreError(e), true));
});

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.body.appendChild(s);
  });
}

function rerenderActivePanel() {
  const active = document.querySelector('.pos-panel.active')?.id?.replace('posPanel-', '');
  if (active === 'orders') posOrdRender();
  if (active === 'crm') posCrmRender();
  if (active === 'analytics') posAnalyticsRender();
}

function installPosOverrides() {
  window.closePOS   = () => { location.href = 'index.html'; };
  window.closeCart  = () => {};
  window.closePanel = () => {};
  Object.defineProperty(window, 'TIME_SLOTS', { get: () => posSlots, configurable: true });

  // Products come from the catalog instead of the storefront's DOM
  window.renderPosProducts = function (query) {
    const grid = document.getElementById('posProductGrid');
    if (!posCatalog) { grid.innerHTML = '<div class="pos-no-results">Loading products…</div>'; return; }
    const names = Object.fromEntries((posCatalog.collections || []).map(c => [c.slug, c.name]));
    const items = (posCatalog.products || [])
      .filter(p => p.visible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter(p => !query || p.name.toLowerCase().includes(query) || (names[p.cat] || '').toLowerCase().includes(query));
    if (!items.length) { grid.innerHTML = '<div class="pos-no-results">No products match your search</div>'; return; }
    grid.innerHTML = items.map((p, i) => {
      const cat = names[p.cat] || p.cat;
      return `<div class="pos-tile" data-i="${i}">
        <div class="pos-tile-img ${p.image ? '' : esc(p.placeholder || '')}" style="${p.image ? `background-image:url('${esc(p.image)}');background-size:cover;background-position:${esc(p.imagePos || 'center')}` : ''}">
          ${p.image ? '' : '<span class="pos-tile-img-icon">🌸</span>'}
        </div>
        <div class="pos-tile-body">
          <span class="pos-tile-cat">${esc(cat)}</span>
          <div class="pos-tile-name">${esc(p.name)}</div>
          <div class="pos-tile-footer">
            <span class="pos-tile-price">QR ${esc(p.price)}</span>
            <button class="pos-tile-add">+</button>
          </div>
        </div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.pos-tile').forEach(t => {
      const p = items[+t.dataset.i];
      t.onclick = () => posAddItem(p.name, names[p.cat] || p.cat, Number(p.price) || 0);
    });
  };

  // Online order status changes also update the storefront order
  const origSetStatus = window.posOrdSetStatus;
  window.posOrdSetStatus = function (id, status) {
    origSetStatus(id, status);
    const online = JSON.parse(localStorage.getItem('rosebella_orders') || '[]').some(o => o.id === id);
    if (!online) return;
    const entry = { status, at: new Date().toISOString() };
    const batch = db.batch();
    batch.update(db.collection('orders').doc(id), { status, statusHistory: firebase.firestore.FieldValue.arrayUnion(entry) });
    batch.set(db.collection('orderStatus').doc(id), { status, statusHistory: firebase.firestore.FieldValue.arrayUnion(entry) }, { merge: true });
    batch.commit().catch(e => toast(firestoreError(e), true));
  };
}
