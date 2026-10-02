/* ══════════════════════════════════════════════
   ROSEBELLA — in-page "added to bag" experience (shared by storefront pages)
   • Product cards switch from "Add" to a −/+ quantity control once in the bag
   • A bottom bar shows the bag total with a "Review order" button
   • A short toast confirms each add
   Each page supplies its own cart + actions through RB.cartUI.init(...).
   ══════════════════════════════════════════════ */
(function () {
  const CSS = `
    .rb-qty { display: inline-flex; align-items: center; border: 1px solid var(--gold, #C6922A); border-radius: 999px; overflow: hidden; background: #fff; }
    .rb-qty button { width: 32px; height: 32px; border: none; background: none; color: var(--gold, #C6922A); font-size: 17px; line-height: 1; cursor: pointer; transition: background .15s; }
    .rb-qty button:hover { background: rgba(198,146,42,0.12); }
    .rb-qty-n { min-width: 62px; text-align: center; font-family: var(--sans, 'Montserrat', sans-serif); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--charcoal, #2D2D2D); white-space: nowrap; }
    #rbReviewBar { position: fixed; left: 50%; bottom: 18px; transform: translate(-50%, 140%); z-index: 8999;
      display: flex; align-items: center; gap: 18px; padding: 10px 10px 10px 22px; border-radius: 999px;
      background: #18160f; color: #FAF8F0; box-shadow: 0 10px 34px rgba(0,0,0,.28);
      font-family: var(--sans, 'Montserrat', sans-serif); transition: transform .3s ease; max-width: calc(100vw - 32px); }
    #rbReviewBar.show { transform: translate(-50%, 0); }
    #rbReviewBar .rb-rb-info { font-size: 11px; letter-spacing: .04em; white-space: nowrap; }
    #rbReviewBar .rb-rb-info b { color: var(--gold, #C6922A); font-weight: 700; }
    #rbReviewBar button { border: none; border-radius: 999px; background: var(--gold, #C6922A); color: #fff; cursor: pointer;
      padding: 11px 20px; font-family: inherit; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; white-space: nowrap; }
    #rbReviewBar button:hover { background: var(--gold-light, #D4A84B); }
    body.cart-open #rbReviewBar { transform: translate(-50%, 140%); }
    body.rb-has-bar #waBubble { bottom: 86px !important; }
    #rbToast { position: fixed; left: 50%; bottom: 84px; transform: translate(-50%, 12px); z-index: 99999; opacity: 0; pointer-events: none;
      background: #18160f; color: #FAF8F0; padding: 10px 18px; border-radius: 999px; font-family: var(--sans, 'Montserrat', sans-serif);
      font-size: 11px; letter-spacing: .06em; transition: opacity .2s, transform .2s; border: 1px solid rgba(198,146,42,.4); }
    #rbToast.show { opacity: 1; transform: translate(-50%, 0); }
    @media (max-width: 520px) {
      #rbReviewBar { left: 16px; right: 16px; transform: translateY(140%); justify-content: space-between; gap: 10px; padding-left: 16px; }
      #rbReviewBar.show { transform: none; }
      body.cart-open #rbReviewBar { transform: translateY(140%); }
    }`;

  let opts = null;
  let toastTimer = null;

  function ensureChrome() {
    if (!document.getElementById('rbCartCss')) {
      const s = document.createElement('style'); s.id = 'rbCartCss'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    if (!document.getElementById('rbReviewBar')) {
      const bar = document.createElement('div');
      bar.id = 'rbReviewBar';
      bar.innerHTML = '<span class="rb-rb-info"></span><button type="button">Review order →</button>';
      bar.querySelector('button').onclick = () => opts && opts.review();
      document.body.appendChild(bar);
    }
  }

  function qtyByName(cart) {
    const m = {};
    (cart || []).forEach(i => { m[i.name] = (m[i.name] || 0) + (i.qty || 0); });
    return m;
  }

  /* Re-draw card controls + bottom bar from the current cart */
  function sync() {
    if (!opts) return;
    ensureChrome();
    const cart = opts.getCart() || [];
    const qty = qtyByName(cart);

    document.querySelectorAll(opts.card).forEach(card => {
      const name = opts.name(card);
      const n = qty[name] || 0;
      const addBtn = opts.addBtn(card);
      let ctl = card.querySelector('.rb-qty');
      if (n > 0) {
        if (!ctl) {
          ctl = document.createElement('div');
          ctl.className = 'rb-qty';
          ctl.innerHTML = '<button type="button" data-d="-1" aria-label="Remove one">−</button><span class="rb-qty-n"></span><button type="button" data-d="1" aria-label="Add one more">+</button>';
          (addBtn ? addBtn.parentNode : card).insertBefore(ctl, addBtn || null);
        }
        ctl.querySelector('.rb-qty-n').textContent = `${n} added`;
        if (addBtn) addBtn.style.display = 'none';
      } else {
        if (ctl) ctl.remove();
        if (addBtn) addBtn.style.display = '';
      }
    });

    const count = cart.reduce((s, i) => s + (i.qty || 0), 0);
    const total = cart.reduce((s, i) => s + (i.price || 0) * (i.qty || 0), 0);
    const bar = document.getElementById('rbReviewBar');
    bar.querySelector('.rb-rb-info').innerHTML =
      `<b>${count} item${count === 1 ? '' : 's'}</b> &nbsp;·&nbsp; QR ${total.toFixed(0)}`;
    bar.classList.toggle('show', count > 0);
    document.body.classList.toggle('rb-has-bar', count > 0);
  }

  function toast(msg) {
    ensureChrome();
    let t = document.getElementById('rbToast');
    if (!t) { t = document.createElement('div'); t.id = 'rbToast'; document.body.appendChild(t); }
    t.textContent = msg || '✦ Added to your gift bag';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // −/+ on a card changes that product's quantity in the bag
  document.addEventListener('click', e => {
    const b = e.target.closest('.rb-qty button');
    if (!b || !opts) return;
    e.preventDefault(); e.stopPropagation();
    const card = b.closest(opts.card);
    if (card) opts.changeQty(opts.name(card), Number(b.dataset.d));
  }, true);

  /* Changes the most recently added bag line for a product by ±1.
     Used by pages whose cart is an array of { name, qty, ... } lines. */
  function changeLastLine(cart, name, delta) {
    for (let i = cart.length - 1; i >= 0; i--) {
      if (cart[i].name !== name) continue;
      cart[i].qty += delta;
      if (cart[i].qty <= 0) cart.splice(i, 1);
      return true;
    }
    return false;
  }

  window.RB = window.RB || {};
  RB.cartUI = {
    init(o) {
      opts = o;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
      else sync();
    },
    sync, toast, changeLastLine,
  };
})();
