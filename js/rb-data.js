/* ══════════════════════════════════════════════
   ROSEBELLA — shared storefront data
   Catalog + settings are managed in the admin portal and stored in
   Firestore (catalog/main, config/settings). Pages read them through
   the Firestore REST API, so no Firebase SDK is required here.
   Order of sources: localStorage cache → Firestore → /data/*.json
   ══════════════════════════════════════════════ */
(function () {
  const PROJECT = 'rosebella-bac0e';
  const API_KEY = 'AIzaSyCWaVcGjH3ZZ11Oy1vEBJOE9L_wbsgYET0';
  const DOCS = { catalog: 'catalog/main', settings: 'config/settings' };
  const CACHE_PREFIX = 'rb_cache_';

  // ── Firestore REST value decoding ──────────────
  function decode(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue'  in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue'  in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue'    in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue'   in v) return (v.arrayValue.values || []).map(decode);
    if ('mapValue'     in v) return decodeFields(v.mapValue.fields || {});
    return null;
  }
  function decodeFields(fields) {
    const o = {};
    for (const k in fields) o[k] = decode(fields[k]);
    return o;
  }

  function readCache(name) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + name)); } catch (e) { return null; }
  }
  function writeCache(name, data) {
    try { localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(data)); } catch (e) {}
  }

  async function fetchFirestore(name) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${DOCS[name]}?key=${API_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Firestore ' + res.status);
    const doc = await res.json();
    return decodeFields(doc.fields || {});
  }

  async function fetchFallback(name) {
    const res = await fetch('/data/' + name + '.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Fallback ' + res.status);
    return res.json();
  }

  /* Calls cb(data) with cached data right away (if any), then again with
     fresh data if it differs. Returns a promise for the fresh data. */
  function load(name, cb) {
    const cached = readCache(name);
    const cachedStr = cached ? JSON.stringify(cached) : '';
    if (cached) { try { cb(cached); } catch (e) { console.error(e); } }

    return fetchFirestore(name)
      .catch(err => { console.warn('[RB] using bundled ' + name + ':', err.message); return fetchFallback(name); })
      .then(data => {
        if (JSON.stringify(data) !== cachedStr) {
          writeCache(name, data);
          try { cb(data); } catch (e) { console.error(e); }
        }
        return data;
      })
      .catch(err => { console.error('[RB] could not load ' + name, err); return cached; });
  }

  // ── Helpers ─────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cssUrl(u) { return String(u || '').replace(/["\\\n]/g, ''); }

  function visibleCollections(catalog) {
    return (catalog?.collections || [])
      .filter(c => c.visible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  function visibleProducts(catalog) {
    const hidden = new Set((catalog?.collections || []).filter(c => c.visible === false).map(c => c.slug));
    return (catalog?.products || [])
      .filter(p => p.visible !== false && !hidden.has(p.cat))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  function collectionName(catalog, slug) {
    return (catalog?.collections || []).find(c => c.slug === slug)?.name || slug;
  }

  // Matches the original storefront .prod-card markup
  function productCardHTML(p, catName, index) {
    const img = p.image
      ? `<div class="prod-img-bg" style="background-image:url(&quot;${esc(cssUrl(p.image))}&quot;);background-size:cover;background-position:${esc(p.imagePos || 'center center')};"></div>`
      : `<div class="prod-img-bg ${esc(p.placeholder || '')}"></div>`;
    const badge = p.badge ? `<span class="prod-badge badge-${esc(p.badgeStyle || 'new')}">${esc(p.badge)}</span>` : '';
    return `<div class="prod-card show" data-cat="${esc(p.cat)}" data-id="${esc(p.id)}" data-original-index="${index}">
        <div class="prod-img">
          ${img}
          ${badge}
          <button class="prod-wishlist" onclick="toggleWish(this)">♡</button>
        </div>
        <div class="prod-body">
          <span class="prod-cat">${esc(catName)}</span>
          <h3>${esc(p.name)}</h3>
          <p class="prod-desc">${esc(p.desc)}</p>
          <div class="prod-footer">
            <div class="prod-price"><span class="currency">QR</span>${esc(p.price)}</div>
            <button class="prod-add" onclick="openVariantModal(this,this.closest('.prod-card').querySelector('h3').textContent)">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke-linecap="round"></path></svg>
              Add
            </button>
          </div>
        </div>
      </div>`;
  }

  function collCardHTML(c) {
    const bg = c.image
      ? `background:url(&quot;${esc(cssUrl(c.image))}&quot;) ${esc(c.imagePos || 'center center')} / cover;`
      : (c.gradient ? `background:${esc(c.gradient)};` : '');
    return `<a class="coll-card" href="collection.html?cat=${encodeURIComponent(c.slug)}&amp;name=${encodeURIComponent(c.name)}" data-slug="${esc(c.slug)}">
            <div class="coll-card-img" style="${bg}"></div>
            <div class="coll-card-body"><span class="coll-icon">${esc(c.icon || '🌸')}</span><span class="coll-name">${esc(c.name)}</span></div>
          </a>`;
  }

  // ── Store info: contact links + announcement bar ──
  function applyStore(settings) {
    const s = settings?.store || {};
    const wa = String(s.whatsapp || '').replace(/\D/g, '');
    const tel = String(s.phone || '').replace(/[^\d+]/g, '');
    document.querySelectorAll('a[href*="wa.me/"]').forEach(a => {
      if (wa) a.href = a.href.replace(/wa\.me\/\d+/, 'wa.me/' + wa);
    });
    // Only rewrite a link's text when it is plain text (not a card with markup inside)
    const plain = a => a.children.length === 0;
    document.querySelectorAll('a[href^="tel:"]').forEach(a => {
      if (!tel) return;
      a.href = 'tel:' + tel;
      if (plain(a) && /^[\s+\d()-]+$/.test(a.textContent)) a.textContent = s.phone;
    });
    if (s.email) {
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        a.href = 'mailto:' + s.email;
        if (plain(a) && a.textContent.includes('@')) a.textContent = s.email;
      });
    }
    // Text spots marked up as <… data-store="phone|email">
    document.querySelectorAll('[data-store]').forEach(el => {
      const v = s[el.dataset.store];
      if (v) el.textContent = v;
    });
    const social = { instagram: 'instagram.com', tiktok: 'tiktok.com', facebook: 'facebook.com' };
    for (const k in social) {
      if (!s[k]) continue;
      document.querySelectorAll(`a[href*="${social[k]}"]`).forEach(a => { a.href = s[k]; });
    }
    renderAnnouncement(settings?.announcement);
  }

  function renderAnnouncement(ann) {
    let bar = document.getElementById('rbAnnounceBar');
    const dismissedKey = 'rb_announce_dismissed';
    let dismissed = '';
    try { dismissed = sessionStorage.getItem(dismissedKey) || ''; } catch (e) {}
    if (!ann || !ann.enabled || !ann.text || dismissed === ann.text) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rbAnnounceBar';
      bar.className = 'rb-announce-bar';
      document.body.prepend(bar);
    }
    const text = ann.link
      ? `<a class="rb-announce-text" href="${esc(ann.link)}">${esc(ann.text)}</a>`
      : `<span class="rb-announce-text">${esc(ann.text)}</span>`;
    bar.innerHTML = `${text}<button class="rb-announce-close" aria-label="Dismiss">✕</button>`;
    bar.querySelector('.rb-announce-close').onclick = () => {
      try { sessionStorage.setItem(dismissedKey, ann.text); } catch (e) {}
      bar.remove();
    };
  }

  // ── Gift extras ("Complete your gift") ─────────
  // Managed in the admin portal (config/settings → addons); these are the defaults.
  const DEFAULT_ADDONS = [
    { id: 'balloon',   label: 'Balloon',    icon: '🎈', price: 35, image: '', active: true,
      bg: 'radial-gradient(circle at 50% 35%, #fce4f0 0%, #f07898 50%, #b03060 100%)' },
    { id: 'chocolate', label: 'Chocolates', icon: '🍫', price: 55, image: '', active: true,
      bg: 'radial-gradient(circle at 50% 35%, #c8a078 0%, #8c5030 50%, #3e1008 100%)' },
    { id: 'vase',      label: 'Vase',       icon: '🏺', price: 45, image: '', active: true,
      bg: 'radial-gradient(circle at 50% 35%, #c8e8e0 0%, #60a890 50%, #1e6050 100%)' },
    { id: 'candle',    label: 'Candle',     icon: '🕯', price: 30, image: '', active: true,
      bg: 'radial-gradient(circle at 50% 35%, #fff0c0 0%, #e8c050 50%, #987010 100%)' },
    { id: 'perfume',   label: 'Perfume',    icon: '✨', price: 65, image: '', active: true,
      bg: 'radial-gradient(circle at 50% 35%, #ead0f8 0%, #9860c8 50%, #4a1080 100%)' },
  ];

  function activeAddons(settings) {
    const list = Array.isArray(settings?.addons) ? settings.addons : DEFAULT_ADDONS;
    return list.filter(a => a && a.active !== false && a.label)
      .map(a => ({ ...a, price: Number(a.price) || 0 }));
  }

  // Style + inner markup for an extra's picture area (photo if set, else colour + emoji)
  function addonVisual(a) {
    if (a.image) {
      return {
        style: `background:#2a2520 url(&quot;${esc(cssUrl(a.image))}&quot;) ${esc(a.imagePos || 'center center')} / cover no-repeat;`,
        inner: '',
      };
    }
    return {
      style: `background:${esc(a.bg || 'linear-gradient(150deg,#c6922a,#7a5410)')};`,
      inner: a.icon ? `<span class="vm-addon-icon">${esc(a.icon)}</span>` : '',
    };
  }

  window.RB = {
    load, esc, DEFAULT_ADDONS, activeAddons, addonVisual,
    visibleCollections, visibleProducts, collectionName,
    productCardHTML, collCardHTML, applyStore,
  };
})();
