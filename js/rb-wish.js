/* ══════════════════════════════════════════════
   ROSEBELLA — "Liked" products (wishlist)
   • ♡ on any product card / product page saves it (kept in this browser)
   • A heart next to the bag in the top bar shows the count and opens the Liked panel
   ══════════════════════════════════════════════ */
(function () {
  const KEY = 'rb_wishlist';
  let catalog = null;
  RB.load('catalog', c => { if (c) { catalog = c; renderPanel(); } });

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const write = ids => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) {} };
  const has = id => read().includes(id);

  function toggle(id, btn) {
    if (!id) return;
    const ids = read(), i = ids.indexOf(id);
    if (i === -1) ids.unshift(id); else ids.splice(i, 1);
    write(ids);
    sync(); renderPanel();
    if (btn) { btn.classList.add('rbw-pop'); setTimeout(() => btn.classList.remove('rbw-pop'), 300); }
    try { RB.cartUI.toast(i === -1 ? '♥ Saved to your liked items' : 'Removed from liked items'); } catch (e) {}
  }

  // Only touch the button when it changes (the page watches for changes)
  function paint(b, on) {
    const t = on ? '♥' : '♡';
    if (b.textContent !== t) b.textContent = t;
    if (b.classList.contains('liked') !== on) b.classList.toggle('liked', on);
    const l = on ? 'Remove from liked' : 'Save to liked';
    if (b.getAttribute('aria-label') !== l) b.setAttribute('aria-label', l);
  }
  // Paint every heart on the page
  function sync() {
    const ids = new Set(read());
    document.querySelectorAll('.prod-card[data-id] .prod-wishlist').forEach(b => {
      const on = ids.has(b.closest('.prod-card').dataset.id);
      paint(b, on);
    });
    document.querySelectorAll('[data-wish-id]').forEach(b => {
      const on = ids.has(b.dataset.wishId);
      paint(b, on); b.classList.toggle('active', on);
    });
    const n = ids.size, badge = document.getElementById('wishCount');
    if (badge) { if (badge.textContent !== String(n)) badge.textContent = n; if (badge.classList.contains('show') !== n > 0) badge.classList.toggle('show', n > 0); }
  }

  const CSS = `
    #wishNavBtn { position:relative; background:none; border:none; cursor:pointer; color:inherit; padding:4px; display:flex; align-items:center; justify-content:center; transition:color .2s; }
    #wishNavBtn:hover { color:var(--gold,#C6922A); }
    #wishCount { position:absolute; top:-4px; right:-6px; min-width:17px; height:17px; padding:0 4px; border-radius:9px; background:#e05060; color:#fff;
      font:700 9px/17px var(--sans,'Montserrat',sans-serif); text-align:center; opacity:0; transform:scale(.5); transition:opacity .2s, transform .2s; }
    #wishCount.show { opacity:1; transform:scale(1); }
    .rbw-pop { animation:rbwPop .3s ease; }
    @keyframes rbwPop { 50% { transform:scale(1.35); } }
    #rbwOverlay { position:fixed; inset:0; z-index:99990; background:rgba(0,0,0,0.45); opacity:0; pointer-events:none; transition:opacity .25s; }
    #rbwOverlay.show { opacity:1; pointer-events:auto; }
    #rbwPanel { position:fixed; top:0; right:0; z-index:99991; width:min(400px,92vw); height:100vh; height:100dvh; background:var(--ivory,#faf8f2);
      display:flex; flex-direction:column; transform:translateX(100%); transition:transform .3s cubic-bezier(.25,.46,.45,.94); box-shadow:-10px 0 40px rgba(0,0,0,.15); }
    #rbwPanel.show { transform:none; }
    .rbw-hd { display:flex; align-items:center; justify-content:space-between; padding:18px 20px; padding-top:max(18px, env(safe-area-inset-top)); border-bottom:1px solid rgba(198,146,42,.18); }
    .rbw-hd h2 { font-family:var(--serif,'Cormorant Garamond',serif); font-weight:400; font-size:26px; color:var(--charcoal,#2D2D2D); }
    .rbw-hd h2 em { color:var(--gold,#C6922A); }
    .rbw-x { width:36px; height:36px; border-radius:50%; border:1px solid #ddd; background:#fff; cursor:pointer; font-size:14px; }
    .rbw-list { flex:1; overflow-y:auto; padding:8px 20px 20px; }
    .rbw-item { display:flex; gap:14px; align-items:center; padding:14px 0; border-bottom:1px solid rgba(0,0,0,.06); }
    .rbw-img { width:72px; height:72px; flex:none; border-radius:10px; background:#efe9dc center/cover no-repeat; }
    .rbw-info { flex:1; min-width:0; }
    .rbw-name { display:block; font-family:var(--serif,serif); font-size:18px; color:var(--charcoal,#2D2D2D); text-decoration:none; line-height:1.2; }
    .rbw-price { font-family:var(--sans,sans-serif); font-size:12px; font-weight:600; color:var(--charcoal,#2D2D2D); margin-top:4px; }
    .rbw-view { display:inline-block; margin-top:6px; font-family:var(--sans,sans-serif); font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--gold,#C6922A); text-decoration:none; }
    .rbw-rm { width:32px; height:32px; flex:none; border-radius:50%; border:1px solid #eee; background:#fff; color:#e05060; font-size:16px; cursor:pointer; }
    .rbw-empty { text-align:center; padding:60px 20px; font-family:var(--serif,serif); font-style:italic; font-size:18px; color:var(--taupe,#8a7f72); }
    .rbw-empty b { display:block; font-size:42px; font-style:normal; color:#e05060; margin-bottom:10px; }
    .pd-like { width:44px; height:44px; border-radius:50%; border:1px solid rgba(198,146,42,.35); background:#fff; color:#e05060; font-size:20px; cursor:pointer; vertical-align:middle; margin-left:10px; }`;

  function ensureUi() {
    if (!document.getElementById('rbwCss')) {
      const st = document.createElement('style'); st.id = 'rbwCss'; st.textContent = CSS; document.head.appendChild(st);
    }
    // Heart next to the bag in the top bar
    const cartBtn = document.getElementById('cartNavBtn') || document.querySelector('nav .nav-cart-btn');
    if (cartBtn && !document.getElementById('wishNavBtn')) {
      const b = document.createElement('button');
      b.id = 'wishNavBtn'; b.type = 'button'; b.title = 'Liked'; b.setAttribute('aria-label', 'Liked items');
      b.innerHTML = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg><span id="wishCount">0</span>';
      b.onclick = open;
      cartBtn.parentNode.insertBefore(b, cartBtn);
      b.style.color = getComputedStyle(cartBtn).color;   // same colour as the bag icon
    }
    if (!document.getElementById('rbwPanel')) {
      const ov = document.createElement('div'); ov.id = 'rbwOverlay'; ov.onclick = close;
      const p = document.createElement('aside'); p.id = 'rbwPanel'; p.setAttribute('aria-label', 'Liked items');
      p.innerHTML = '<div class="rbw-hd"><h2>Your <em>Liked</em> Items</h2><button type="button" class="rbw-x" aria-label="Close">✕</button></div><div class="rbw-list" id="rbwList"></div>';
      p.querySelector('.rbw-x').onclick = close;
      document.body.append(ov, p);
    }
  }
  function open() { ensureUi(); renderPanel(); document.getElementById('rbwOverlay').classList.add('show'); document.getElementById('rbwPanel').classList.add('show'); }
  function close() { document.getElementById('rbwOverlay')?.classList.remove('show'); document.getElementById('rbwPanel')?.classList.remove('show'); }

  function renderPanel() {
    const list = document.getElementById('rbwList'); if (!list) return;
    const esc = RB.esc, ids = read();
    const prods = ids.map(id => (catalog?.products || []).find(p => p.id === id)).filter(p => p && p.visible !== false);
    list.innerHTML = prods.length ? prods.map(p => `<div class="rbw-item">
        <a class="rbw-img" href="${esc(RB.productUrl(p))}" style="background-image:url(&quot;${esc(RB.cardImg(p.image || ''))}&quot;)"></a>
        <div class="rbw-info"><a class="rbw-name" href="${esc(RB.productUrl(p))}">${esc(p.name)}</a>
          <div class="rbw-price">QR ${esc(p.price)}</div><a class="rbw-view" href="${esc(RB.productUrl(p))}">View &amp; add to bag →</a></div>
        <button type="button" class="rbw-rm" onclick="RB.wish.toggle('${esc(p.id)}')" aria-label="Remove ${esc(p.name)}">♥</button>
      </div>`).join('')
      : `<div class="rbw-empty"><b>♡</b>Tap the heart on any product<br>to save it here.</div>`;
  }

  window.RB = window.RB || {};
  RB.wish = { toggle, has, ids: read, open, close, sync };

  function install() {
    ensureUi(); sync();
    // Cards' ♡ buttons call toggleWish(this) — save by the card's product id
    window.toggleWish = btn => toggle(btn.closest('[data-id]')?.dataset.id || btn.dataset.wishId, btn);
    // Hearts on cards that appear later (rows, filters, search)
    let queued = false;
    new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sync(); }); })
      .observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
