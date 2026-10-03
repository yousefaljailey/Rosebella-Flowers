/* ══════════════════════════════════════════════
   ROSEBELLA ADMIN — dashboard
   Firestore documents:
     catalog/main        { collections[], productChunks }  + catalog/products_N { products[] }
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
  subscribeCatalog(({ catalog, chunks }) => {
    state.catalog = catalog ? normalizeCatalog(catalog) : null;
    state.catalogChunks = chunks;
    state.catalogLoaded = true;
    refresh('catalog', 'home');
  }, e => toast(firestoreError(e), true));

  db.doc('config/settings').onSnapshot(snap => {
    state.settings = snap.exists ? snap.data() : null;
    state.settingsLoaded = true;
    refresh('slots', 'store', 'promos', 'extras', 'home');
  }, e => toast(firestoreError(e), true));

  db.doc('config/heroSlides').onSnapshot(snap => {
    state.slides = (snap.exists && Array.isArray(snap.data().slides)) ? snap.data().slides : [];
    state.slidesLoaded = true;
    refresh('slides');
  }, e => toast(firestoreError(e), true));

  let firstOrders = true;
  db.collection('orders').orderBy('createdAt', 'desc').limit(300).onSnapshot(qs => {
    state.orders = qs.docs.map(d => ({ ...d.data(), id: d.id }));
    // New order alerts (not for the orders already there when the portal opened)
    if (!firstOrders) qs.docChanges().forEach(ch => {
      if (ch.type === 'added' && !ch.doc.metadata.hasPendingWrites) newOrderAlert({ ...ch.doc.data(), id: ch.doc.id });
    });
    firstOrders = false;
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
      writes.push(writeCatalog(cat, state.catalogChunks));
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
    state.catalogChunks = await writeCatalog(state.catalog, state.catalogChunks);
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
    el.querySelectorAll('[data-invoice]').forEach(b => b.onclick = () => sendInvoice(b.dataset.invoice));
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
          ${invoicePhone(o) ? `<button class="btn btn-sm btn-gold" data-invoice="${esc(o.id)}">${o.invoiceSentAt ? 'Send invoice again' : 'Send invoice'}</button>` : ''}
          ${phone ? `<a class="btn btn-sm" href="https://wa.me/${phone}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${addr ? `<a class="btn btn-sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank" rel="noopener">Map</a>` : ''}
        </div>
        ${o.invoiceSentAt ? `<p class="order-meta" style="margin-top:6px">✓ Invoice sent ${fmtDate(o.invoiceSentAt)}</p>` : ''}
        ${o.buyer?.phone && o.recipient?.notes === 'gift' ? `<h4 style="margin-top:14px">Ordered by</h4><p>${esc(o.buyer.name || '')} ${esc(o.buyer.phone)}</p>` : ''}
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

// ── New order alerts: sound + popup + desktop notification ──
const ALERTS_KEY = 'rb_order_alerts';
let audioCtx = null, unseenOrders = 0;
const alertsOn = () => { try { return localStorage.getItem(ALERTS_KEY) !== 'off'; } catch (e) { return true; } };

function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    // Two soft rising "ding-dong" chimes
    [[0, 880], [0.18, 1318.5], [0.9, 880], [1.08, 1318.5]].forEach(([at, f]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.7);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + at); o.stop(t0 + at + 0.75);
    });
  } catch (e) {}
}

function newOrderAlert(o) {
  if (!alertsOn()) return;
  chime();
  const r = o.recipient || {};
  const items = (o.items || []).map(i => `${i.name} ×${i.qty || 1}`).join(', ');
  // Pop-up inside the portal
  const box = document.createElement('div');
  box.className = 'order-alert';
  box.innerHTML = `<div class="oa-hd"><b>🛎 New order</b><button class="oa-x" title="Dismiss">✕</button></div>
    <div class="oa-id">${esc(o.id)} · <b>${money(o.total)}</b></div>
    <div class="oa-meta">${esc(items)}</div>
    <div class="oa-meta">${esc(r.name || '')} · ${esc(o.paymentMethod === 'cash' ? 'Cash on delivery' : 'Paid online')}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn btn-sm btn-gold" data-a="view">View order</button>
      ${invoicePhone(o) ? '<button class="btn btn-sm" data-a="inv">Send invoice</button>' : ''}
    </div>`;
  box.querySelector('.oa-x').onclick = () => box.remove();
  box.querySelector('[data-a=view]').onclick = () => {
    state.orderFilter = 'all'; state.openOrders.add(o.id);
    location.hash = 'orders'; render(); box.remove();
    setTimeout(() => document.querySelector(`[data-toggle="${CSS.escape(o.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  box.querySelector('[data-a=inv]')?.addEventListener('click', () => { sendInvoice(o.id); box.remove(); });
  document.getElementById('orderAlerts').prepend(box);
  // Desktop notification (shows even when this tab is in the background)
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(`New order ${o.id} — ${money(o.total)}`, { body: items + (r.name ? `\n${r.name}` : ''), tag: o.id, requireInteraction: true });
      n.onclick = () => { window.focus(); box.querySelector('[data-a=view]').click(); n.close(); };
    } catch (e) {}
  }
  // Tab title counter until the portal is looked at
  if (document.hidden) { unseenOrders++; document.title = `(${unseenOrders}) New order — Rosebella Admin`; }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { unseenOrders = 0; document.title = 'Rosebella Admin'; }
});

function syncAlertsBtn() {
  const st = document.getElementById('alertsState'); if (!st) return;
  const perm = 'Notification' in window ? Notification.permission : 'denied';
  st.textContent = !alertsOn() ? 'Off' : perm === 'granted' ? 'On' : 'Sound only';
}
document.getElementById('alertsBtn')?.addEventListener('click', async () => {
  const perm = 'Notification' in window ? Notification.permission : 'denied';
  if (alertsOn() && perm === 'default') { await Notification.requestPermission(); }
  else { try { localStorage.setItem(ALERTS_KEY, alertsOn() ? 'off' : 'on'); } catch (e) {} }
  syncAlertsBtn();
  if (alertsOn()) { chime(); toast(Notification.permission === 'granted' ? 'Order alerts on — sound + pop-up + desktop notification' : 'Order alerts on (sound + pop-up). Allow notifications in the browser for desktop pop-ups.'); }
  else toast('Order alerts off');
});
// Browsers only allow sound after a click on the page — unlock it on the first click
document.addEventListener('pointerdown', () => { if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }, { once: true });
syncAlertsBtn();

// ── Invoice by WhatsApp ──
// Goes to the person who placed the order; for gifts never to the recipient
function invoicePhone(o) {
  const d = String(o.buyer?.phone || (o.recipient?.notes !== 'gift' ? o.recipient?.phone : '') || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 8 ? '974' + d : d;
}
function invoiceText(o) {
  const ds = o.deliverySlot || {};
  const items = o.items || [];
  const sub = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  const fee = Number(ds.expressFee) || 0;
  const discount = Math.max(0, Math.round((sub + fee - (Number(o.total) || 0)) * 100) / 100);
  const store = state.settings?.store || {};
  const lines = [
    `🌹 *ROSEBELLA — Invoice*`,
    `Order *${o.id}*`,
    `Date: ${fmtDate(o.createdAt)}`,
    '',
    ...items.map(i => `• ${i.name}${i.variants?.addons?.length ? ' + ' + i.variants.addons.join(', ') : ''} ×${i.qty || 1} — QR ${((Number(i.price) || 0) * (Number(i.qty) || 1)).toFixed(0)}`),
    '',
    `Subtotal: QR ${sub.toFixed(0)}`,
    ...(fee ? [`Delivery fee: QR ${fee}`] : []),
    ...(discount && o.appliedPromo?.code ? [`Promo ${o.appliedPromo.code}: −QR ${discount}`] : []),
    `*Total: QR ${Number(o.total || 0).toFixed(0)}*`,
    `Payment: ${o.paymentMethod === 'cash' ? 'Cash on delivery' : 'Paid online' + (o.payment?.invoiceId ? ' (ref ' + o.payment.invoiceId + ')' : '')}`,
    '',
    `🚚 Delivery: ${ds.type === 'express' ? 'Express (90 min)' : [ds.date, slotLabel(ds.slot)].filter(Boolean).join(' · ')}`,
    ...(o.recipient?.notes === 'gift' ? [`🎁 For: ${o.recipient.name || ''}`] : []),
    '',
    `Thank you for choosing Rosebella 💐`,
    `rosebella.qa${store.phone ? ' · ' + store.phone : ''}`,
  ];
  return lines.join('\n');
}
async function sendInvoice(id) {
  const o = state.orders.find(x => x.id === id); if (!o) return;
  const phone = invoicePhone(o);
  if (!phone) { toast('This order has no customer phone number', true); return; }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(invoiceText(o))}`, '_blank', 'noopener');
  try { await db.collection('orders').doc(id).update({ invoiceSentAt: new Date().toISOString() }); } catch (e) { toast(firestoreError(e), true); }
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

// ── Homepage sections (New Arrivals, Recently Arrived, Best Sellers, Recommended) ──
const HOME_DEFAULTS = [
  { id: 'new',         title: 'New Arrivals',        subtitle: 'Fresh designs, just added',   layout: 'slider', visible: true, productIds: [] },
  { id: 'recent',      title: 'Recently Arrived',    subtitle: 'In the studio this week',     layout: 'slider', visible: true, productIds: [] },
  { id: 'best',        title: 'Best Sellers',        subtitle: 'Our most loved arrangements', layout: 'slider', visible: true, productIds: [] },
  { id: 'recommended', title: 'Recommended for You', subtitle: 'Picked with you in mind',      layout: 'grid',   visible: true, productIds: [] },
];
let homeDraft = null;   // edited copy, saved with the Save button

function homeSections() {
  const saved = Array.isArray(state.settings?.homeSections) ? state.settings.homeSections : [];
  if (!saved.length) return HOME_DEFAULTS.map(d => ({ ...d, productIds: [], excludeIds: [] }));
  const list = saved.map(x => ({ ...HOME_DEFAULTS.find(d => d.id === x.id), ...x, productIds: [...(x.productIds || [])], excludeIds: [...(x.excludeIds || [])] }));
  HOME_DEFAULTS.forEach(d => { if (!list.some(x => x.id === d.id)) list.push({ ...d, productIds: [], excludeIds: [] }); });
  return list;
}

const isBuiltinSection = id => HOME_DEFAULTS.some(d => d.id === id);

// Same automatic rules as the storefront (js/rb-home.js)
function homeAutoPreview(sec) {
  const id = sec.id, skip = new Set(sec.excludeIds || []);
  const prods = (state.catalog?.products || []).filter(p => p.visible !== false && p.image && !skip.has(p.id));
  if (!isBuiltinSection(id)) return sec.collection ? prods.filter(p => p.cat === sec.collection).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 12) : [];
  const newest = [...prods].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  if (id === 'new') { const t = newest.filter(p => /new/i.test(p.badge || '') || p.badgeStyle === 'new'); return [...t, ...newest.filter(p => !t.includes(p))].slice(0, 10); }
  if (id === 'recent') return newest.slice(0, 10);
  if (id === 'best') { const t = prods.filter(p => /best|popular/i.test(p.badge || '') || p.badgeStyle === 'popular'); return [...t, ...prods.filter(p => !t.includes(p) && p.image)].slice(0, 10); }
  if (id === 'recommended') return [...prods].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 8);
  return [];
}

PAGES.home = {
  html() {
    if (!state.settingsLoaded || !state.catalogLoaded) return loadingHTML();
    if (!homeDraft) homeDraft = homeSections();
    const byId = Object.fromEntries((state.catalog?.products || []).map(p => [p.id, p]));
    const collectionNames = Object.fromEntries((state.catalog?.collections || []).map(c => [c.slug, c.name]));
    const thumb = p => `<span class="hp-thumb" style="${p.image ? `background-image:url('${esc(p.image)}')` : ''}"></span>`;
    return pageHd('Homepage <em>Sections</em>', 'The product rows on the homepage. Leave a section empty to fill it automatically, or hand-pick the products and their order.',
      '<button class="btn btn-gold" id="saveHome">Save sections</button>') +
      homeDraft.map((sec, si) => {
        sec.productIds = sec.productIds.filter(id => byId[id]);   // drop products that were deleted
        const picked = sec.productIds.map(id => byId[id]);
        const auto = !picked.length;
        const preview = auto ? homeAutoPreview(sec) : [];
        const builtin = isBuiltinSection(sec.id);
        const removed = (sec.excludeIds || []).length;
        const autoText = !builtin
          ? (sec.collection ? `Products from “${esc(collectionNames[sec.collection] || sec.collection)}”, in collection order.` : 'Choose a collection to fill this row automatically, or add products by hand below.')
          : sec.id === 'recommended' ? 'Personalised for each visitor from what they viewed and added to their bag. First-time visitors see these:'
          : sec.id === 'best' ? 'Products with a “Bestseller” badge first, then the rest of your catalog.'
          : sec.id === 'new' ? 'Products with a “New” badge first, then the most recently added.'
          : 'The most recently added products.';
        return `<div class="card" data-si="${si}">
          <div class="row" style="justify-content:space-between;margin-bottom:12px">
            <div class="row"><b style="font-size:15px">${esc(sec.title)}</b>
              <span class="badge ${sec.visible === false ? 'st-cancelled' : 'st-delivered'}">${sec.visible === false ? 'Hidden' : 'Shown'}</span>
              <span class="order-meta">${sec.layout === 'grid' ? 'Grid' : 'Sliding row'}</span></div>
            <div class="row">
              <button class="btn btn-sm" data-act="up" title="Move section up">↑</button>
              <button class="btn btn-sm" data-act="down" title="Move section down">↓</button>
              ${builtin ? '' : '<button class="btn btn-sm btn-danger" data-act="delsec" title="Delete this section">Delete section</button>'}
            </div>
          </div>
          <div class="grid-3">
            <label class="field"><span>Title</span><input data-f="title" value="${esc(sec.title)}"></label>
            <label class="field"><span>Subtitle</span><input data-f="subtitle" value="${esc(sec.subtitle || '')}"></label>
            <label class="field"><span>Layout</span><select data-f="layout">
              <option value="slider" ${sec.layout !== 'grid' ? 'selected' : ''}>Sliding row</option>
              <option value="grid" ${sec.layout === 'grid' ? 'selected' : ''}>Grid</option></select></label>
          </div>
          ${builtin ? '' : `<label class="field" style="margin-top:12px;max-width:420px"><span>Fill automatically from</span><select data-f="collection">
              <option value="">— Nothing (hand-picked only) —</option>
              ${(state.catalog?.collections || []).map(c => `<option value="${esc(c.slug)}" ${sec.collection === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select></label>`}
          <label class="switch" style="margin-top:12px"><input type="checkbox" data-f="visible" ${sec.visible !== false ? 'checked' : ''}> Show on homepage</label>
          <div style="margin-top:16px">
            <div class="field"><span>Products ${auto ? '— filling automatically' : `— ${picked.length} hand-picked`}</span></div>
            ${auto
              ? `<p class="order-meta" style="margin:6px 0 10px">${autoText}${removed ? ` &nbsp;·&nbsp; ${removed} removed <button class="btn btn-sm btn-ghost" data-act="restore">Restore</button>` : ''}</p>
                 <div class="hp-list hp-preview">${preview.map(p => `<div class="hp-item" data-pid="${esc(p.id)}">${thumb(p)}<span>${esc(p.name)}</span>
                   <span class="hp-tools"><button class="btn btn-sm" data-act="pedit" title="Edit product">Edit</button><button class="btn btn-sm btn-danger" data-act="xrm" title="Remove from this row">✕</button></span></div>`).join('')}</div>
                 ${preview.length ? '<button class="btn btn-sm btn-ghost" data-act="freeze" style="margin-top:8px">Arrange these by hand</button>' : ''}`
              : `<div class="hp-list">${picked.map((p, pi) => `<div class="hp-item" data-pi="${pi}" data-pid="${esc(p.id)}">${thumb(p)}<span>${esc(p.name)}</span>
                   <span class="hp-tools"><button class="btn btn-sm" data-act="pedit" title="Edit product">Edit</button><button class="btn btn-sm btn-danger" data-act="prm" title="Remove from this row">✕</button></span>
                   <span class="hp-acts"><button class="btn btn-sm" data-act="pup" title="Move left">‹</button><button class="btn btn-sm" data-act="pdown" title="Move right">›</button></span></div>`).join('')}</div>`}
            <div class="hp-add">
              <input class="input" data-add placeholder="＋ Add a product — type its name" autocomplete="off">
              <div class="hp-results" hidden></div>
            </div>
            ${auto ? '' : '<button class="btn btn-sm btn-ghost" data-act="clear" style="margin-top:8px">Clear picks (fill automatically)</button>'}
          </div>
        </div>`;
      }).join('') +
      '<button class="btn" id="addHomeSection" style="width:100%;padding:16px;border-style:dashed">＋ Add a section</button>';
  },
  bind(el) {
    el.querySelector('#addHomeSection').onclick = () => {
      homeDraft.push({ id: 'custom-' + Date.now().toString(36), title: 'New section', subtitle: '', layout: 'slider', visible: true, collection: '', productIds: [], excludeIds: [] });
      render();
      const cards = document.querySelectorAll('.card[data-si]');
      cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cards[cards.length - 1]?.querySelector('[data-f=title]')?.select();
    };
    const byName = (state.catalog?.products || []).filter(p => p.visible !== false);
    el.querySelectorAll('.card[data-si]').forEach(card => {
      const si = +card.dataset.si, sec = homeDraft[si];
      card.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => {
        sec[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value;
      }));
      card.querySelectorAll('[data-f=visible],[data-f=layout],[data-f=collection]').forEach(inp => inp.addEventListener('change', () => {
        sec[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value; render();
      }));
      card.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const act = b.dataset.act;
        const pi = +(b.closest('[data-pi]')?.dataset.pi ?? -1);
        if (act === 'up' && si > 0) [homeDraft[si - 1], homeDraft[si]] = [homeDraft[si], homeDraft[si - 1]];
        if (act === 'down' && si < homeDraft.length - 1) [homeDraft[si + 1], homeDraft[si]] = [homeDraft[si], homeDraft[si + 1]];
        if (act === 'pup' && pi > 0) [sec.productIds[pi - 1], sec.productIds[pi]] = [sec.productIds[pi], sec.productIds[pi - 1]];
        if (act === 'pdown' && pi < sec.productIds.length - 1) [sec.productIds[pi + 1], sec.productIds[pi]] = [sec.productIds[pi], sec.productIds[pi + 1]];
        if (act === 'prm') sec.productIds.splice(pi, 1);
        if (act === 'xrm') { const pid = b.closest('[data-pid]')?.dataset.pid; if (pid) (sec.excludeIds = sec.excludeIds || []).push(pid); }
        if (act === 'restore') sec.excludeIds = [];
        if (act === 'freeze') sec.productIds = homeAutoPreview(sec).map(p => p.id);
        if (act === 'pedit') { const pid = b.closest('[data-pid]')?.dataset.pid; if (pid) editProduct(pid); return; }
        if (act === 'delsec') { if (!confirm(`Delete the section “${sec.title || 'Untitled'}”?`)) return; homeDraft.splice(si, 1); }
        if (act === 'clear') sec.productIds = [];
        render();
      });
      const addI = card.querySelector('[data-add]'), res = card.querySelector('.hp-results');
      addI.addEventListener('input', () => {
        const q = addI.value.trim().toLowerCase();
        const hits = q ? byName.filter(p => p.name.toLowerCase().includes(q) && !sec.productIds.includes(p.id)).slice(0, 8) : [];
        res.hidden = !hits.length;
        res.innerHTML = hits.map(p => `<button type="button" data-pid="${esc(p.id)}"><span class="hp-thumb" style="${p.image ? `background-image:url('${esc(p.image)}')` : ''}"></span>${esc(p.name)} <span class="order-meta">QR ${esc(p.price)}</span></button>`).join('');
      });
      res.addEventListener('mousedown', e => {
        const b = e.target.closest('[data-pid]'); if (!b) return;
        e.preventDefault();
        sec.productIds.push(b.dataset.pid);
        render();
        document.querySelector(`.card[data-si="${si}"] [data-add]`)?.focus();
      });
      addI.addEventListener('blur', () => setTimeout(() => { res.hidden = true; }, 150));
    });
    el.querySelector('#saveHome').onclick = async () => {
      const clean = homeDraft.map(x => ({ id: x.id, title: (x.title || '').trim() || HOME_DEFAULTS.find(d => d.id === x.id)?.title || 'New section',
        subtitle: (x.subtitle || '').trim(), layout: x.layout === 'grid' ? 'grid' : 'slider', visible: x.visible !== false,
        collection: isBuiltinSection(x.id) ? '' : (x.collection || ''), productIds: x.productIds, excludeIds: x.excludeIds || [] }));
      if (await saveSettings({ homeSections: clean })) homeDraft = null;
    };
  },
};
