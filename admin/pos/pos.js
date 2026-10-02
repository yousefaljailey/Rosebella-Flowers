  // ── Toast ─────────────────────────────────────
  function apToast(msg) {
    const t = document.getElementById('apToast');
    t.textContent = '✓ ' + msg; t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), 2400);
  }

  // ══════════════════════════════════════════════
  //  POS SYSTEM
  // ══════════════════════════════════════════════
  const POS_ORDERS_KEY = 'rosebella_pos_orders';

  let posOrder = { items:[], discountType:'none', discountValue:0, paymentMethod:'cash', status:'paid' };
  let posOrders = (function(){ try{ return JSON.parse(localStorage.getItem(POS_ORDERS_KEY))||[]; }catch(e){ return []; } })();

  function savePosOrders() { localStorage.setItem(POS_ORDERS_KEY, JSON.stringify(posOrders)); }

  // ── Open / Close ──────────────────────────────
  function openPOS() {
    closeCart(); closePanel();
    document.getElementById('posOverlay').classList.add('show');
    renderPosProducts('');
    updatePosUI();
  }
  function closePOS() { document.getElementById('posOverlay').classList.remove('show'); }

  // ── Product browser ───────────────────────────
  function posFilterProducts(q) { renderPosProducts(q.trim().toLowerCase()); }

  function renderPosProducts(query) {
    const grid = document.getElementById('posProductGrid');
    let html = '', count = 0;
    document.querySelectorAll('.prod-card').forEach(card => {
      const nameEl  = card.querySelector('.prod-body h3');
      const catEl   = card.querySelector('.prod-cat');
      const priceEl = card.querySelector('.prod-price');
      const imgEl   = card.querySelector('.prod-img img');
      const bgEl    = card.querySelector('.prod-img-bg');
      const name    = nameEl  ? nameEl.textContent.trim()  : '';
      const cat     = catEl   ? catEl.textContent.trim()   : '';
      if (query && !name.toLowerCase().includes(query) && !cat.toLowerCase().includes(query)) return;
      let price = 0;
      if (priceEl) { const cl=priceEl.cloneNode(true); const cu=cl.querySelector('.currency'); if(cu) cu.remove(); price=parseFloat(cl.textContent.trim())||0; }
      const imgSrc   = imgEl ? imgEl.src : '';
      const bgMatch  = bgEl  ? (bgEl.className.match(/pi-\d+/)||[''])[0] : '';
      const safeN = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      const safeC = cat.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      count++;
      html += `
        <div class="pos-tile" onclick="posAddItem('${safeN}','${safeC}',${price})">
          <div class="pos-tile-img ${bgMatch}" style="${imgSrc?`background-image:url(${imgSrc});background-size:cover;background-position:center`:''}">
            ${!imgSrc ? '<span class="pos-tile-img-icon">🌸</span>' : ''}
          </div>
          <div class="pos-tile-body">
            <span class="pos-tile-cat">${cat}</span>
            <div class="pos-tile-name">${name}</div>
            <div class="pos-tile-footer">
              <span class="pos-tile-price">QR ${price}</span>
              <button class="pos-tile-add" onclick="event.stopPropagation();posAddItem('${safeN}','${safeC}',${price})">+</button>
            </div>
          </div>
        </div>`;
    });
    if (!count) html = '<div class="pos-no-results">No products match your search</div>';
    grid.innerHTML = html;
  }

  // ── Order mutations ───────────────────────────
  function posAddItem(name, cat, price) {
    const ex = posOrder.items.find(i => i.name === name);
    if (ex) { ex.qty++; } else { posOrder.items.push({ id: Date.now(), name, cat, price, qty:1 }); }
    updatePosUI();
  }
  function posChangeQty(id, delta) {
    const item = posOrder.items.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) posOrder.items = posOrder.items.filter(i => i.id !== id);
    updatePosUI();
  }
  function posRemoveItem(id) { posOrder.items = posOrder.items.filter(i => i.id !== id); updatePosUI(); }

  // ── Discount ──────────────────────────────────
  function posDiscTypeChange(type) {
    posOrder.discountType = type;
    const inp = document.getElementById('posDiscVal');
    inp.disabled = (type === 'none');
    if (type === 'none') { inp.value = '0'; posOrder.discountValue = 0; }
    updatePosUI();
  }
  function posUpdateDiscount() {
    posOrder.discountValue = parseFloat(document.getElementById('posDiscVal').value) || 0;
    updatePosUI();
  }

  // ── Payment / Status ──────────────────────────
  function posSetPayment(method) {
    posOrder.paymentMethod = method;
    document.querySelectorAll('[data-method]').forEach(b => b.classList.toggle('pay-active', b.dataset.method === method));
  }
  function posSetStatus(status) {
    posOrder.status = status;
    document.querySelectorAll('[data-status]').forEach(b => {
      b.classList.remove('paid-active','unpaid-active');
      if (b.dataset.status === status) b.classList.add(status === 'paid' ? 'paid-active' : 'unpaid-active');
    });
  }

  // ── Totals ────────────────────────────────────
  function posCalcTotals() {
    const subtotal = posOrder.items.reduce((s,i) => s + i.price * i.qty, 0);
    let discount = 0;
    if (posOrder.discountType === 'percent') discount = subtotal * posOrder.discountValue / 100;
    else if (posOrder.discountType === 'fixed') discount = Math.min(posOrder.discountValue, subtotal);
    return { subtotal, discount, total: Math.max(0, subtotal - discount) };
  }

  // ── Render UI ─────────────────────────────────
  function updatePosUI() {
    const { subtotal, discount, total } = posCalcTotals();
    const count = posOrder.items.reduce((s,i) => s + i.qty, 0);

    const badge = document.getElementById('posItemBadge');
    if (badge) badge.textContent = count > 0 ? `${count} item${count!==1?'s':''}` : '0 items';

    document.getElementById('posSubVal').textContent   = `QR ${subtotal.toFixed(0)}`;
    document.getElementById('posDiscAmt').textContent  = `−QR ${discount.toFixed(0)}`;
    document.getElementById('posTotalVal').textContent = total.toFixed(0);
    document.getElementById('posDiscRow').style.display = discount > 0 ? 'flex' : 'none';

    const container = document.getElementById('posOrderItems');
    if (posOrder.items.length === 0) {
      container.innerHTML = '<div class="pos-order-empty"><span>🛒</span><p>Tap a product to add it</p></div>';
      return;
    }
    container.innerHTML = posOrder.items.map(item => `
      <div class="pos-order-item">
        <div class="pos-oi-info">
          <span class="pos-oi-cat">${item.cat}</span>
          <span class="pos-oi-name">${item.name}</span>
        </div>
        <div class="pos-qty-grp">
          <button class="pos-qb" onclick="posChangeQty(${item.id},-1)">−</button>
          <span class="pos-qn">${item.qty}</span>
          <button class="pos-qb" onclick="posChangeQty(${item.id},1)">+</button>
        </div>
        <span class="pos-oi-price">QR ${(item.price*item.qty).toFixed(0)}</span>
        <button class="pos-oi-del" onclick="posRemoveItem(${item.id})">🗑</button>
      </div>`).join('');
  }

  // ── Complete order ────────────────────────────
  function posCompleteOrder() {
    if (posOrder.items.length === 0) { apToast('Add items before completing.'); return; }
    const { subtotal, discount, total } = posCalcTotals();
    const order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      items: posOrder.items.map(i => ({...i})),
      subtotal, discount, discountType: posOrder.discountType,
      discountValue: posOrder.discountValue, total,
      paymentMethod: posOrder.paymentMethod, status: posOrder.status
    };
    posOrders.unshift(order);
    savePosOrders();
    apToast(`✓ Order ${order.id} — QR ${total.toFixed(0)} saved`);
    posClearOrder(true);
  }

  function posClearOrder(skipConfirm) {
    if (!skipConfirm && posOrder.items.length > 0 && !confirm('Clear current order?')) return;
    posOrder = { items:[], discountType:'none', discountValue:0, paymentMethod: posOrder.paymentMethod, status:'paid' };
    const ds = document.getElementById('posDiscType');  if (ds) ds.value = 'none';
    const dv = document.getElementById('posDiscVal');   if (dv) { dv.value = '0'; dv.disabled = true; }
    posSetStatus('paid');
    updatePosUI();
  }

  // ══════════════════════════════════════════════
  //  SHARED RECEIPT ENGINE
  // ══════════════════════════════════════════════
  function rbOpenReceipt(html, title) {
    const w = window.open('', '_blank', 'width=680,height=900');
    w.document.write(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Montserrat:wght@400;500;600;700&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        @page { size: A4; margin: 14mm 16mm; }
        body { font-family:'Montserrat',Arial,sans-serif; background:#fff; color:#1a1a1a;
               max-width:600px; margin:0 auto; padding:32px 28px; font-size:13px; }
        /* Header */
        .rh { text-align:center; padding-bottom:20px; border-bottom:2px solid #C6922A; margin-bottom:20px; }
        .rh-brand { font-family:'Playfair Display',Georgia,serif; font-size:32px; font-weight:600;
                    letter-spacing:0.18em; color:#1a1a1a; }
        .rh-brand span { color:#C6922A; }
        .rh-sub { font-size:9px; letter-spacing:0.28em; text-transform:uppercase;
                  color:#999; margin-top:4px; }
        .rh-title { font-size:11px; font-weight:700; letter-spacing:0.22em; text-transform:uppercase;
                    color:#C6922A; margin-top:12px; }
        /* Meta row */
        .rm { display:flex; justify-content:space-between; align-items:flex-start;
              margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid #eee; gap:16px; }
        .rm-id { font-family:'Playfair Display',Georgia,serif; font-size:20px;
                 color:#1a1a1a; font-weight:600; }
        .rm-dt { font-size:11px; color:#888; text-align:right; line-height:1.6; }
        /* Badge row */
        .rb-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px; }
        .rb { font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
              padding:4px 12px; border-radius:3px; }
        .rb-gold    { background:#fdf3e0; color:#b07a10; border:1px solid #e8c870; }
        .rb-green   { background:#e8f8ec; color:#2a7a2a; border:1px solid #a8d8b8; }
        .rb-red     { background:#feeaec; color:#c0392b; border:1px solid #f5b8bc; }
        .rb-blue    { background:#e8f0ff; color:#2244aa; border:1px solid #b0c4f8; }
        .rb-grey    { background:#f4f4f4; color:#555;    border:1px solid #ddd; }
        .rb-purple  { background:#f3eaff; color:#7b3fa0; border:1px solid #d0aaf0; }
        /* Section labels */
        .sec-lbl { font-size:9px; font-weight:700; letter-spacing:0.22em; text-transform:uppercase;
                   color:#C6922A; margin-bottom:8px; margin-top:18px; }
        /* Items table */
        table { width:100%; border-collapse:collapse; }
        thead th { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;
                   color:#999; padding:6px 0; border-bottom:1px solid #eee; }
        tbody tr td { padding:9px 0; border-bottom:1px solid #f5f5f5; vertical-align:top; }
        .it-name { font-family:'Playfair Display',Georgia,serif; font-size:14px; color:#1a1a1a; }
        .it-cat  { font-size:10px; color:#bbb; margin-top:2px; }
        .it-qty  { font-size:12px; color:#888; text-align:center; }
        .it-unit { font-size:11px; color:#aaa; text-align:center; margin-top:2px; }
        .it-tot  { font-size:13px; font-weight:700; color:#1a1a1a; text-align:right; }
        /* Totals */
        .tot-row { display:flex; justify-content:space-between; padding:4px 0;
                   font-size:12px; color:#888; }
        .tot-row.disc { color:#2a7a2a; }
        .tot-row.grand { border-top:2px solid #1a1a1a; margin-top:8px; padding-top:10px;
                         font-size:16px; font-weight:700; color:#1a1a1a; }
        .tot-row.grand span:last-child { font-family:'Playfair Display',Georgia,serif; font-size:20px; }
        /* Delivery box */
        .del-box { background:#fafaf8; border:1px solid #eee; border-radius:6px;
                   padding:14px 16px; margin-top:6px; }
        .del-row { display:flex; gap:10px; margin-bottom:6px; font-size:12px; }
        .del-row:last-child { margin-bottom:0; }
        .del-lbl { font-weight:700; color:#888; min-width:90px; font-size:11px; letter-spacing:0.04em; }
        .del-val { color:#1a1a1a; flex:1; }
        /* Status pipeline */
        .pipe { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:6px; }
        .pipe-step { font-size:10px; font-weight:600; padding:5px 10px; border-radius:3px;
                     background:#f4f4f4; color:#bbb; }
        .pipe-step.done { background:#e8f8ec; color:#2a7a2a; }
        .pipe-step.active { background:#fdf3e0; color:#b07a10; font-weight:700; }
        .pipe-arr { color:#ccc; font-size:12px; }
        /* Gift */
        .gift-box { background:#fdf8f0; border:1px solid #e8c870; border-radius:6px;
                    padding:12px 16px; margin-top:6px; }
        .gift-msg { font-family:'Playfair Display',Georgia,serif; font-size:14px;
                    font-style:italic; color:#555; line-height:1.6; }
        /* Footer */
        .rf { text-align:center; margin-top:28px; padding-top:16px; border-top:1px solid #eee; }
        .rf-msg { font-family:'Playfair Display',Georgia,serif; font-size:14px; font-style:italic; color:#888; }
        .rf-contact { font-size:10px; color:#bbb; margin-top:6px; letter-spacing:0.04em; }
        @media print {
          body { max-width:none; padding:0; }
          .no-print { display:none !important; }
        }
        /* Print button (hidden on print) */
        .print-bar { display:flex; gap:10px; justify-content:center; margin-bottom:24px; }
        .print-btn { font-family:'Montserrat',Arial,sans-serif; font-size:10px; font-weight:700;
                     letter-spacing:0.14em; text-transform:uppercase; background:#C6922A; color:#fff;
                     border:none; padding:10px 28px; cursor:pointer; border-radius:4px; }
        .print-btn:hover { background:#d4a43e; }
      </style>
    </head><body>
      <div class="print-bar no-print">
        <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
        <button class="print-btn" style="background:#555;" onclick="window.close()">✕ Close</button>
      </div>
      ${html}
    </body></html>`);
    w.document.close();
    // Auto-prompt print after short delay
    setTimeout(() => w.print(), 600);
  }

  function rbReceiptHeader(orderId, dateStr, type, badges) {
    return `
      <div class="rh">
        <div class="rh-brand">ROSE<span>BELLA</span></div>
        <div class="rh-sub">Luxury Flowers &amp; Chocolates &nbsp;·&nbsp; Doha, Qatar</div>
        <div class="rh-title">${type}</div>
      </div>
      <div class="rm">
        <div class="rm-id">${orderId}</div>
        <div class="rm-dt">${dateStr}</div>
      </div>
      <div class="rb-row">${badges}</div>`;
  }

  function rbItemsTable(items) {
    return `
      <div class="sec-lbl">Items</div>
      <table>
        <thead><tr>
          <th style="text-align:left">Item</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Amount</th>
        </tr></thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td><div class="it-name">${i.name}</div>${i.cat?`<div class="it-cat">${i.cat}</div>`:''}</td>
              <td class="it-qty">${i.qty}<div class="it-unit">× QR ${(i.price||0).toFixed(0)}</div></td>
              <td class="it-tot">QR ${((i.price||0)*(i.qty||1)).toFixed(0)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  // ── POS Register receipt ──────────────────────
  function posPrintReceipt() {
    if (posOrder.items.length === 0) { apToast('Add items before printing.'); return; }
    const { subtotal, discount, total } = posCalcTotals();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
                  + ' &nbsp;·&nbsp; '
                  + now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    const orderId = `#${now.getTime().toString().slice(-6)}`;
    const payLabel   = posOrder.paymentMethod === 'cash' ? 'Cash' : 'Card';
    const payBadge   = posOrder.paymentMethod === 'cash' ? 'rb-grey' : 'rb-blue';
    const statusBadge= posOrder.status === 'paid' ? 'rb-green' : 'rb-red';
    const statusLabel= posOrder.status === 'paid' ? '✓ Paid' : '○ Unpaid';
    const discLabel  = posOrder.discountType === 'percent' ? `${posOrder.discountValue}% discount` : 'Discount';

    const html = `
      ${rbReceiptHeader(orderId, dateStr, 'In-Store Receipt',
          `<span class="rb rb-gold">🏪 POS Sale</span>
           <span class="rb ${payBadge}">💳 ${payLabel}</span>
           <span class="rb ${statusBadge}">${statusLabel}</span>`)}
      ${rbItemsTable(posOrder.items)}
      <div style="margin-top:14px;">
        <div class="tot-row"><span>Subtotal</span><span>QR ${subtotal.toFixed(0)}</span></div>
        ${discount > 0 ? `<div class="tot-row disc"><span>${discLabel}</span><span>−QR ${discount.toFixed(0)}</span></div>` : ''}
        <div class="tot-row grand"><span>Total</span><span>QR ${total.toFixed(0)}</span></div>
      </div>
      <div class="rf">
        <div class="rf-msg">"Thank you for choosing Rosebella 🌸"</div>
        <div class="rf-contact">+974 33 446 618 &nbsp;·&nbsp; www.rosebella.co &nbsp;·&nbsp; @rosebella.flowers</div>
      </div>`;
    rbOpenReceipt(html, `Receipt ${orderId}`);
  }

  // ── Order & Delivery receipt (POS history + Online orders) ──
  function posOrdPrintReceipt(orderId) {
    const posOrdersRaw = (function(){ try{ return JSON.parse(localStorage.getItem(POS_ORDERS_KEY))||[]; }catch(e){ return []; } })();
    const webOrdersRaw = (function(){ try{ return JSON.parse(localStorage.getItem('rosebella_orders'))||[]; }catch(e){ return []; } })();

    let o = posOrdersRaw.find(x => x.id === orderId);
    let source = 'pos';
    if (!o) { o = webOrdersRaw.find(x => x.id === orderId); source = 'online'; }
    if (!o) { apToast('Order not found.'); return; }

    const ts = new Date(source === 'pos' ? o.timestamp : o.createdAt);
    const dateStr = ts.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
                  + ' &nbsp;·&nbsp; '
                  + ts.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const delivStatus = delStatusMap[o.id] || (source === 'pos' ? 'delivered' : 'pending');
    const statusLabels = { pending:'Pending', preparing:'Preparing', out:'Out for Delivery', delivered:'Delivered' };
    const statusBadgeClass = { pending:'rb-gold', preparing:'rb-blue', out:'rb-purple', delivered:'rb-green' };

    const payLabel = (o.paymentMethod === 'cash' || o.paymentMethod === 'cash_on_delivery') ? 'Cash on Delivery' : 'Card';
    const payBadge = (o.paymentMethod === 'cash' || o.paymentMethod === 'cash_on_delivery') ? 'rb-grey' : 'rb-blue';
    const paidBadge = o.status === 'paid' ? 'rb-green' : o.status === 'unpaid' ? 'rb-red' : '';
    const paidLabel = o.status === 'paid' ? '✓ Paid' : o.status === 'unpaid' ? '○ Unpaid' : '';

    const sourceLabel = source === 'pos' ? '🏪 In-Store' : '🌐 Online Order';
    const sourceBadge = source === 'pos' ? 'rb-gold' : 'rb-blue';

    // Delivery pipeline
    const pipelineSteps = ['pending','preparing','out','delivered'];
    const doneIdx = pipelineSteps.indexOf(delivStatus);
    const pipeHtml = pipelineSteps.map((s, i) => {
      const cls = i < doneIdx ? 'done' : i === doneIdx ? 'active' : '';
      return `<span class="pipe-step ${cls}">${statusLabels[s]}</span>${i < pipelineSteps.length-1 ? '<span class="pipe-arr">›</span>' : ''}`;
    }).join('');

    // Delivery details section (online orders)
    let delivHtml = '';
    if (source === 'online' && o.recipient) {
      const r = o.recipient;
      const slotObj = (typeof TIME_SLOTS !== 'undefined') ? TIME_SLOTS.find(s => s.id === o.deliverySlot?.slot) : null;
      const delivDate = o.deliverySlot?.date ? new Date(o.deliverySlot.date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : '—';
      const delivTime = o.deliverySlot?.type === 'express' ? 'Express (90 min)' : (slotObj?.label || o.deliverySlot?.slot || '—');
      delivHtml = `
        <div class="sec-lbl">Delivery Details</div>
        <div class="del-box">
          <div class="del-row"><span class="del-lbl">Recipient</span><span class="del-val">${r.name || '—'}</span></div>
          <div class="del-row"><span class="del-lbl">Phone</span><span class="del-val">${r.phone || '—'}</span></div>
          <div class="del-row"><span class="del-lbl">Address</span><span class="del-val">${[r.landmark, r.address].filter(Boolean).join(', ') || '—'}</span></div>
          <div class="del-row"><span class="del-lbl">Date</span><span class="del-val">${delivDate}</span></div>
          <div class="del-row"><span class="del-lbl">Time slot</span><span class="del-val">${delivTime}</span></div>
        </div>`;
    }

    // Gift message
    const giftHtml = o.giftMessage ? `
      <div class="sec-lbl">Gift Message</div>
      <div class="gift-box"><div class="gift-msg">"${o.giftMessage}"</div></div>` : '';

    // Totals
    const subtotal = o.subtotal || o.total || 0;
    const disc = o.discount || 0;
    const expressFee = o.deliverySlot?.expressFee || o.coExpressFee || 0;

    const html = `
      ${rbReceiptHeader(o.id, dateStr, source === 'pos' ? 'In-Store Receipt' : 'Order Confirmation',
          `<span class="rb ${sourceBadge}">${sourceLabel}</span>
           <span class="rb ${statusBadgeClass[delivStatus]}">${statusLabels[delivStatus]}</span>
           <span class="rb ${payBadge}">${payLabel}</span>
           ${paidLabel ? `<span class="rb ${paidBadge}">${paidLabel}</span>` : ''}`)}
      ${rbItemsTable(o.items || [])}
      <div style="margin-top:14px;">
        ${disc > 0 ? `<div class="tot-row"><span>Subtotal</span><span>QR ${subtotal.toFixed(0)}</span></div>
                      <div class="tot-row disc"><span>Discount</span><span>−QR ${disc.toFixed(0)}</span></div>` : ''}
        ${expressFee > 0 ? `<div class="tot-row"><span>Express delivery</span><span>+QR ${expressFee.toFixed(0)}</span></div>` : ''}
        <div class="tot-row grand"><span>Total</span><span>QR ${(o.total||0).toFixed(0)}</span></div>
      </div>
      <div class="sec-lbl">Order Status</div>
      <div class="pipe">${pipeHtml}</div>
      ${delivHtml}
      ${giftHtml}
      <div class="rf">
        <div class="rf-msg">"Thank you for choosing Rosebella 🌸"</div>
        <div class="rf-contact">+974 33 446 618 &nbsp;·&nbsp; www.rosebella.co &nbsp;·&nbsp; @rosebella.flowers</div>
      </div>`;

    rbOpenReceipt(html, `Order ${o.id}`);
  }

  // ── History & Summary ─────────────────────────
  function openPosHistory()  { renderPosHistory(); document.getElementById('posHistoryBg').classList.add('show'); }
  function closePosHistory() { document.getElementById('posHistoryBg').classList.remove('show'); }

  function renderPosHistory() {
    const today    = new Date();
    const todayPfx = today.toISOString().slice(0,10);
    const todayOrd = posOrders.filter(o => o.timestamp.startsWith(todayPfx));
    const paidOrd  = todayOrd.filter(o => o.status === 'paid');
    const revenue  = paidOrd.reduce((s,o) => s + o.total, 0);
    const avgOrd   = paidOrd.length > 0 ? revenue / paidOrd.length : 0;
    const dayLabel = today.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });

    const summaryHtml = `
      <div class="pos-summary-card">
        <div class="pos-sum-title">Today's Summary — ${dayLabel}</div>
        <div class="pos-sum-stats">
          <div class="pos-sum-stat"><span class="pos-sum-num"><sub>QR</sub>${revenue.toFixed(0)}</span><span class="pos-sum-lbl">Revenue</span></div>
          <div class="pos-sum-stat"><span class="pos-sum-num">${todayOrd.length}</span><span class="pos-sum-lbl">Orders</span></div>
          <div class="pos-sum-stat"><span class="pos-sum-num"><sub>QR</sub>${avgOrd.toFixed(0)}</span><span class="pos-sum-lbl">Avg. Order</span></div>
        </div>
      </div>`;

    const ordersHtml = posOrders.length === 0
      ? '<div class="pos-no-orders">No orders recorded yet</div>'
      : posOrders.map(o => {
          const d = new Date(o.timestamp);
          const t = d.toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
          const items = o.items.map(i => `${i.name} ×${i.qty}`).join(', ');
          const sc = o.status === 'paid' ? 'pos-tag-paid' : 'pos-tag-unpaid';
          const sl = o.status === 'paid' ? '✓ Paid' : '○ Unpaid';
          const dc = o.discount > 0 ? `<span class="pos-tag pos-tag-disc">−QR ${o.discount.toFixed(0)}</span>` : '';
          return `
            <div class="pos-ord-row">
              <div class="pos-ord-hd"><span class="pos-ord-id">${o.id}</span><span class="pos-ord-time">${t}</span></div>
              <div class="pos-ord-items">${items}</div>
              <div class="pos-ord-meta">
                <span class="pos-ord-total">QR ${o.total.toFixed(0)}</span>
                ${dc}
                <span class="pos-tag pos-tag-method">${o.paymentMethod === 'cash' ? '💵 Cash' : '💳 Card'}</span>
                <span class="pos-tag ${sc}">${sl}</span>
              </div>
            </div>`;
        }).join('');

    document.getElementById('posHistoryBody').innerHTML = summaryHtml + ordersHtml;
  }

  // ══════════════════════════════════════════════
  //  POS NAV
  // ══════════════════════════════════════════════
  function posNavTo(panel, btn) {
    document.querySelectorAll('.pos-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.pos-nav-tab').forEach(t => t.classList.remove('active'));
    const el = document.getElementById('posPanel-' + panel);
    if (el) el.classList.add('active');
    if (btn) btn.classList.add('active');
    if (panel === 'inventory')  posInvRender();
    if (panel === 'orders')     posOrdRender();
    if (panel === 'crm')        posCrmRender();
    if (panel === 'analytics')  posAnalyticsRender();
    if (panel === 'wire')       posWireRender();
  }

  // ══════════════════════════════════════════════
  //  INVENTORY MODULE
  // ══════════════════════════════════════════════
  const INV_KEY = 'rosebella_inventory';
  const DEFAULT_INVENTORY = [
    { id:1,  name:'Red Roses',       type:'Roses',       qty:120, reorderAt:30, season:'Year-round', unit:'stems' },
    { id:2,  name:'Pink Roses',      type:'Roses',       qty:80,  reorderAt:20, season:'Year-round', unit:'stems' },
    { id:3,  name:'White Roses',     type:'Roses',       qty:60,  reorderAt:20, season:'Year-round', unit:'stems' },
    { id:4,  name:'Mixed Roses',     type:'Roses',       qty:100, reorderAt:25, season:'Year-round', unit:'stems' },
    { id:5,  name:'Peonies',         type:'Peonies',     qty:40,  reorderAt:15, season:'Spring',     unit:'stems' },
    { id:6,  name:'Tulips',          type:'Tulips',      qty:75,  reorderAt:20, season:'Spring',     unit:'stems' },
    { id:7,  name:'Orchids',         type:'Orchids',     qty:30,  reorderAt:10, season:'Year-round', unit:'stems' },
    { id:8,  name:'Lilies',          type:'Lilies',      qty:50,  reorderAt:15, season:'Year-round', unit:'stems' },
    { id:9,  name:'Godiva Chocolates', type:'Chocolates',qty:24,  reorderAt:8,  season:'Year-round', unit:'boxes' },
    { id:10, name:'Patchi Chocolates', type:'Chocolates',qty:18,  reorderAt:6,  season:'Year-round', unit:'boxes' },
    { id:11, name:'Balloons',        type:'Accessories', qty:50,  reorderAt:15, season:'Year-round', unit:'units' },
    { id:12, name:'Glass Vases',     type:'Accessories', qty:25,  reorderAt:8,  season:'Year-round', unit:'units' },
    { id:13, name:'Candles',         type:'Accessories', qty:30,  reorderAt:10, season:'Year-round', unit:'units' },
    { id:14, name:'Perfume',         type:'Accessories', qty:12,  reorderAt:5,  season:'Year-round', unit:'units' },
    { id:15, name:'Ribbon',          type:'Packaging',   qty:100, reorderAt:30, season:'Year-round', unit:'rolls' },
    { id:16, name:'Gift Boxes',      type:'Packaging',   qty:40,  reorderAt:12, season:'Year-round', unit:'units' },
  ];
  let inventory = (function(){ try{ return JSON.parse(localStorage.getItem(INV_KEY))||DEFAULT_INVENTORY.map(i=>({...i})); }catch(e){ return DEFAULT_INVENTORY.map(i=>({...i})); } })();
  function saveInventory() { localStorage.setItem(INV_KEY, JSON.stringify(inventory)); }

  function posInvStockClass(item) {
    if (item.qty <= 0)              return 'crit';
    if (item.qty <= item.reorderAt) return 'low';
    return 'ok';
  }

  function posInvRender() {
    const q    = (document.getElementById('posInvSearch')?.value || '').toLowerCase();
    const type = document.getElementById('posInvTypeFilter')?.value || '';
    const stock= document.getElementById('posInvStockFilter')?.value || '';
    const rows = inventory.filter(it => {
      if (q && !it.name.toLowerCase().includes(q) && !it.type.toLowerCase().includes(q)) return false;
      if (type && it.type !== type) return false;
      if (stock && posInvStockClass(it) !== stock) return false;
      return true;
    });
    const body = document.getElementById('posInvBody');
    if (!body) return;
    body.innerHTML = rows.map(it => {
      const cls = posInvStockClass(it);
      const badgeCls = { ok:'pos-inv-badge-ok', low:'pos-inv-badge-low', crit:'pos-inv-badge-crit' }[cls];
      const badgeTxt = { ok:'In Stock', low:'Low Stock', crit:'Critical' }[cls];
      const qCls     = { ok:'pos-stock-ok', low:'pos-stock-low', crit:'pos-stock-crit' }[cls];
      return `<tr>
        <td style="font-family:var(--serif);font-size:13px;color:var(--white);">${it.name}</td>
        <td>${it.type}</td>
        <td><input class="pos-inv-inp" type="number" min="0" value="${it.qty}" onchange="posInvSetQty(${it.id},this.value)" style="color:var(--${cls==='ok'?'white':''})" /></td>
        <td>${it.unit}</td>
        <td style="color:rgba(255,255,255,0.4);">${it.reorderAt}</td>
        <td style="color:rgba(255,255,255,0.4);">${it.season}</td>
        <td><span class="pos-inv-badge ${badgeCls}">${badgeTxt}</span></td>
        <td><div class="pos-inv-actions">
          <button class="pos-inv-btn" onclick="posInvAdjust(${it.id},-1)">−</button>
          <button class="pos-inv-btn" onclick="posInvAdjust(${it.id},1)">+</button>
          <button class="pos-inv-btn pos-inv-btn-del" onclick="posInvDelete(${it.id})">🗑</button>
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;font-family:var(--serif);font-style:italic;color:rgba(255,255,255,0.2);">No items match filters</td></tr>';
  }

  function posInvSetQty(id, val) {
    const it = inventory.find(i => i.id === id);
    if (it) { it.qty = Math.max(0, parseInt(val)||0); saveInventory(); posInvRender(); }
  }
  function posInvAdjust(id, delta) {
    const it = inventory.find(i => i.id === id);
    if (it) { it.qty = Math.max(0, it.qty + delta); saveInventory(); posInvRender(); }
  }
  function posInvDelete(id) {
    if (!confirm('Remove this inventory item?')) return;
    inventory = inventory.filter(i => i.id !== id); saveInventory(); posInvRender();
  }
  function posInvAdd() {
    const name = prompt('Item name:');
    if (!name || !name.trim()) return;
    const type = prompt('Type (e.g. Roses, Accessories):') || 'Other';
    const qty  = parseInt(prompt('Starting quantity:')) || 0;
    const unit = prompt('Unit (stems/boxes/units/rolls):') || 'units';
    const reorder = parseInt(prompt('Reorder alert when below:')) || 10;
    inventory.unshift({ id: Date.now(), name: name.trim(), type, qty, unit, reorderAt: reorder, season: 'Year-round' });
    saveInventory(); posInvRender();
  }

  // ══════════════════════════════════════════════
  //  ORDERS & DELIVERY MODULE
  // ══════════════════════════════════════════════
  const DEL_STATUS_KEY = 'rosebella_del_status';
  let delStatusMap = (function(){ try{ return JSON.parse(localStorage.getItem(DEL_STATUS_KEY))||{}; }catch(e){ return {}; } })();
  function saveDelStatus() { localStorage.setItem(DEL_STATUS_KEY, JSON.stringify(delStatusMap)); }

  let posOrdCurrentFilter = 'all';

  function posOrdSetFilter(f, btn) {
    posOrdCurrentFilter = f;
    document.querySelectorAll('#posOrdFilters .pos-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    posOrdRender();
  }

  function posOrdRender() {
    const q = (document.getElementById('posOrdSearch')?.value || '').toLowerCase();
    const onlineOrders = (function(){ try{ return JSON.parse(localStorage.getItem('rosebella_orders'))||[]; }catch(e){ return []; } })();
    const posOrdersRaw = (function(){ try{ return JSON.parse(localStorage.getItem(POS_ORDERS_KEY))||[]; }catch(e){ return []; } })();

    const allOrders = [
      ...onlineOrders.map(o => ({ ...o, source:'online', ts: o.createdAt, displayId: o.id })),
      ...posOrdersRaw.map(o  => ({ ...o, source:'pos',    ts: o.timestamp, displayId: o.id,
          recipient: { name:'Walk-in', phone:'—', address:'In-store' },
          deliverySlot: { type:'pos', date: o.timestamp?.slice(0,10) } }))
    ].sort((a,b) => new Date(b.ts) - new Date(a.ts));

    const filtered = allOrders.filter(o => {
      const status = delStatusMap[o.displayId] || (o.source==='pos' ? 'delivered' : 'pending');
      if (posOrdCurrentFilter !== 'all' && status !== posOrdCurrentFilter) return false;
      if (q) {
        const haystack = [o.displayId, o.recipient?.name, o.recipient?.phone, o.recipient?.address].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const el = document.getElementById('posOrdList');
    const countEl = document.getElementById('posOrdCount');
    if (countEl) countEl.textContent = `${filtered.length} order${filtered.length!==1?'s':''}`;
    if (!el) return;
    if (!filtered.length) { el.innerHTML = '<div class="pos-no-orders">No orders found</div>'; return; }

    const statusLabels = { pending:'Pending', preparing:'Preparing', out:'Out for Delivery', delivered:'Delivered' };
    el.innerHTML = filtered.map(o => {
      const status    = delStatusMap[o.displayId] || (o.source==='pos' ? 'delivered' : 'pending');
      const d         = new Date(o.ts);
      const dateStr   = d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      const timeStr   = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
      const itemsStr  = o.items ? o.items.map(i=>`${i.name} ×${i.qty||1}`).join(', ') : '—';
      const recip     = o.recipient || {};
      const addr      = [recip.landmark, recip.address].filter(Boolean).join(', ');
      const mapsLink  = addr && addr !== 'In-store' ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : '';
      const pipelineHtml = ['pending','preparing','out','delivered'].map(s =>
        `<button class="pos-status-btn ${status===s?'status-'+s:''}" onclick="posOrdSetStatus('${o.displayId}','${s}')">${statusLabels[s]}</button>`
      ).join('');
      const srcTag = `<span class="pos-source-tag ${o.source==='online'?'pos-source-online':'pos-source-pos'}">${o.source==='online'?'🌐 Online':'🏪 POS'}</span>`;
      return `<div class="pos-del-card">
        <div class="pos-del-hd">
          <div>
            <div class="pos-del-id">${o.displayId}</div>
            <div class="pos-del-time">${dateStr} · ${timeStr}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${srcTag}
            <span class="pos-ord-total" style="font-size:14px;">QR ${(o.total||0).toFixed(0)}</span>
          </div>
        </div>
        <div class="pos-del-items">${itemsStr}</div>
        ${recip.name && recip.name !== 'Walk-in' ? `<div class="pos-del-recipient">👤 ${recip.name}${recip.phone?' · '+recip.phone:''} ${addr?'· 📍 '+addr:''}</div>` : ''}
        <div class="pos-del-footer">
          <div class="pos-status-pipeline">${pipelineHtml}</div>
          ${mapsLink ? `<a class="pos-gps-btn" href="${mapsLink}" target="_blank">📍 GPS</a>` : ''}
          <button class="pos-gps-btn" onclick="posOrdPrintReceipt('${o.displayId}')" style="background:none;cursor:pointer;">📄 Receipt</button>
        </div>
      </div>`;
    }).join('');
  }

  function posOrdSetStatus(id, status) {
    delStatusMap[id] = status;
    saveDelStatus();
    posOrdRender();
    apToast(`Order ${id} → ${status}`);
  }

  // ══════════════════════════════════════════════
  //  CRM MODULE
  // ══════════════════════════════════════════════
  const CRM_KEY = 'rosebella_crm';
  let crmCustomers = (function(){ try{ return JSON.parse(localStorage.getItem(CRM_KEY))||[]; }catch(e){ return []; } })();
  function saveCrm() { localStorage.setItem(CRM_KEY, JSON.stringify(crmCustomers)); }

  function posCrmRender() {
    const q = (document.getElementById('posCrmSearch')?.value || '').toLowerCase();
    const onlineOrders = (function(){ try{ return JSON.parse(localStorage.getItem('rosebella_orders'))||[]; }catch(e){ return []; } })();

    // Auto-import customers from online orders
    onlineOrders.forEach(o => {
      if (!o.recipient?.phone) return;
      const exists = crmCustomers.find(c => c.phone === o.recipient.phone);
      if (!exists) {
        crmCustomers.push({ id: 'auto-' + o.recipient.phone, name: o.recipient.name || 'Unknown', phone: o.recipient.phone, email:'', preferredContact:'WhatsApp', prefs:'', notes:'Auto-imported from online order', importantDates:[], createdAt: o.createdAt });
        saveCrm();
      }
    });

    const visible = crmCustomers.filter(c => {
      if (!q) return true;
      return [c.name, c.phone, c.email].join(' ').toLowerCase().includes(q);
    });

    const grid = document.getElementById('posCrmGrid');
    if (!grid) return;
    if (!visible.length) { grid.innerHTML = '<div class="pos-no-orders" style="grid-column:1/-1;">No customers found</div>'; return; }

    // Order history counts
    const allOrders = (function(){ try{ return JSON.parse(localStorage.getItem('rosebella_orders'))||[]; }catch(e){ return []; } })();
    grid.innerHTML = visible.map(c => {
      const orders = allOrders.filter(o => o.recipient?.phone === c.phone);
      const spend  = orders.reduce((s,o) => s + (o.total||0), 0);
      const datesHtml = (c.importantDates||[]).slice(0,2).map(d => `<span class="pos-crm-date-tag">🗓 ${d.label}: ${d.date}</span>`).join('');
      return `<div class="pos-crm-card" onclick="posCrmOpenModal('${c.id}')">
        <div class="pos-crm-name">${c.name}</div>
        <div class="pos-crm-phone">${c.phone}${c.email?' · '+c.email:''}</div>
        <div class="pos-crm-stats">
          <div class="pos-crm-stat"><span class="pos-crm-stat-num">${orders.length}</span><span class="pos-crm-stat-lbl">Orders</span></div>
          <div class="pos-crm-stat"><span class="pos-crm-stat-num">QR ${spend.toFixed(0)}</span><span class="pos-crm-stat-lbl">Spent</span></div>
          ${c.prefs ? '<div class="pos-crm-stat"><span class="pos-crm-stat-num" style="font-size:14px;">★</span><span class="pos-crm-stat-lbl">Preferences</span></div>' : ''}
        </div>
        ${datesHtml ? `<div class="pos-crm-dates">${datesHtml}</div>` : ''}
      </div>`;
    }).join('');
  }

  function posCrmAddNew() {
    document.getElementById('crmEditId').value = '';
    document.getElementById('crmName').value = '';
    document.getElementById('crmPhone').value = '';
    document.getElementById('crmEmail').value = '';
    document.getElementById('crmContact').value = 'WhatsApp';
    document.getElementById('crmPrefs').value = '';
    document.getElementById('crmNotes').value = '';
    document.getElementById('crmHistorySection').style.display = 'none';
    posCrmRenderDates([]);
    document.getElementById('posCrmModalTitle').textContent = 'New Customer';
    document.getElementById('posCrmModalBg').classList.add('show');
  }

  function posCrmOpenModal(id) {
    const c = crmCustomers.find(x => x.id === id);
    if (!c) return;
    document.getElementById('crmEditId').value = id;
    document.getElementById('crmName').value = c.name || '';
    document.getElementById('crmPhone').value = c.phone || '';
    document.getElementById('crmEmail').value = c.email || '';
    document.getElementById('crmContact').value = c.preferredContact || 'WhatsApp';
    document.getElementById('crmPrefs').value = c.prefs || '';
    document.getElementById('crmNotes').value = c.notes || '';
    posCrmRenderDates(c.importantDates || []);
    document.getElementById('posCrmModalTitle').textContent = c.name || 'Customer Profile';
    // Order history
    const allOrders = (function(){ try{ return JSON.parse(localStorage.getItem('rosebella_orders'))||[]; }catch(e){ return []; } })();
    const orders = allOrders.filter(o => o.recipient?.phone === c.phone);
    const histSec = document.getElementById('crmHistorySection');
    const histList = document.getElementById('crmHistoryList');
    if (orders.length) {
      histSec.style.display = '';
      histList.innerHTML = orders.map(o => {
        const d = new Date(o.createdAt);
        const items = o.items?.map(i=>`${i.name} ×${i.qty||1}`).join(', ') || '—';
        return `<div class="pos-crm-history-item"><div class="pos-crm-hist-hd"><span class="pos-crm-hist-id">${o.id}</span><span class="pos-crm-hist-date">${d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span></div><div class="pos-crm-hist-items">${items} · QR ${(o.total||0).toFixed(0)}</div></div>`;
      }).join('');
    } else { histSec.style.display = 'none'; }
    document.getElementById('posCrmModalBg').classList.add('show');
  }

  function posCrmRenderDates(dates) {
    const list = document.getElementById('crmDatesList');
    list.innerHTML = dates.map((d, i) => `
      <div class="pos-crm-date-row">
        <input class="crm-date-label" value="${d.label||''}" placeholder="e.g. Birthday, Anniversary…" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(198,146,42,0.2);color:var(--white);font-family:var(--sans);font-size:12px;padding:8px 12px;outline:none;" />
        <input class="crm-date-val" type="date" value="${d.date||''}" style="background:rgba(255,255,255,0.07);border:1px solid rgba(198,146,42,0.2);color:var(--white);font-family:var(--sans);font-size:12px;padding:8px;outline:none;color-scheme:dark;" />
        <button class="pos-crm-del-date" onclick="this.closest('.pos-crm-date-row').remove()">✕</button>
      </div>`).join('');
  }

  function posCrmAddDate() {
    const list = document.getElementById('crmDatesList');
    const row = document.createElement('div');
    row.className = 'pos-crm-date-row';
    row.innerHTML = `<input class="crm-date-label" placeholder="e.g. Birthday, Anniversary…" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(198,146,42,0.2);color:var(--white);font-family:var(--sans);font-size:12px;padding:8px 12px;outline:none;" /><input class="crm-date-val" type="date" style="background:rgba(255,255,255,0.07);border:1px solid rgba(198,146,42,0.2);color:var(--white);font-family:var(--sans);font-size:12px;padding:8px;outline:none;color-scheme:dark;" /><button class="pos-crm-del-date" onclick="this.closest('.pos-crm-date-row').remove()">✕</button>`;
    list.appendChild(row);
  }

  function posCrmSave() {
    const id    = document.getElementById('crmEditId').value;
    const name  = document.getElementById('crmName').value.trim();
    if (!name) { alert('Name is required.'); return; }
    const dates = [...document.querySelectorAll('#crmDatesList .pos-crm-date-row')].map(row => ({
      label: row.querySelector('.crm-date-label')?.value.trim() || '',
      date:  row.querySelector('.crm-date-val')?.value || ''
    })).filter(d => d.label || d.date);
    const data = { name, phone: document.getElementById('crmPhone').value.trim(), email: document.getElementById('crmEmail').value.trim(), preferredContact: document.getElementById('crmContact').value, prefs: document.getElementById('crmPrefs').value.trim(), notes: document.getElementById('crmNotes').value.trim(), importantDates: dates };
    if (id) {
      const idx = crmCustomers.findIndex(c => c.id === id);
      if (idx >= 0) { crmCustomers[idx] = { ...crmCustomers[idx], ...data }; }
    } else {
      crmCustomers.unshift({ id: 'crm-' + Date.now(), createdAt: new Date().toISOString(), ...data });
    }
    saveCrm(); posCrmCloseModal(); posCrmRender(); apToast('Customer saved!');
  }

  function posCrmCloseModal() { document.getElementById('posCrmModalBg').classList.remove('show'); }

  // ══════════════════════════════════════════════
  //  ANALYTICS MODULE
  // ══════════════════════════════════════════════
  function posAnalyticsRender() {
    const period  = document.getElementById('posAnalyticsPeriod')?.value || 'today';
    const posOrdRaw  = (function(){ try{ return JSON.parse(localStorage.getItem(POS_ORDERS_KEY))||[]; }catch(e){ return []; } })();
    const webOrdRaw  = (function(){ try{ return JSON.parse(localStorage.getItem('rosebella_orders'))||[]; }catch(e){ return []; } })();
    const now = new Date();
    const cutoff = period === 'today' ? new Date(now.toDateString()) : period === 'all' ? new Date(0) : new Date(now - parseInt(period)*86400000);

    const posAll = posOrdRaw.map(o => ({ ...o, source:'pos', ts: new Date(o.timestamp) }));
    const webAll = webOrdRaw.map(o => ({ ...o, source:'online', ts: new Date(o.createdAt) }));
    const all    = [...posAll, ...webAll].filter(o => o.ts >= cutoff && o.status !== 'unpaid');

    const revenue    = all.reduce((s,o) => s + (o.total||0), 0);
    const orderCount = all.length;
    const avgOrder   = orderCount ? revenue / orderCount : 0;
    const itemsSold  = all.reduce((s,o) => s + (o.items||[]).reduce((ss,i)=>ss+(i.qty||1),0), 0);

    // Top products
    const prodMap = {};
    all.forEach(o => (o.items||[]).forEach(i => {
      prodMap[i.name] = (prodMap[i.name]||0) + (i.price||0)*(i.qty||1);
    }));
    const topProds = Object.entries(prodMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxProd  = topProds[0]?.[1] || 1;

    // Revenue trend — last 7 days
    const days = 7; const dayRevs = [];
    for (let i = days-1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate()-i);
      const pfx = d.toISOString().slice(0,10);
      const rev = all.filter(o => o.ts.toISOString().startsWith(pfx)).reduce((s,o)=>s+(o.total||0),0);
      dayRevs.push({ label: i===0?'Today':d.toLocaleDateString('en-GB',{weekday:'short'}), rev, isToday: i===0 });
    }
    const maxRev = Math.max(...dayRevs.map(d=>d.rev), 1);

    // Payment split
    const cashRev = all.filter(o=>o.paymentMethod==='cash').reduce((s,o)=>s+(o.total||0),0);
    const cardRev = all.filter(o=>o.paymentMethod!=='cash').reduce((s,o)=>s+(o.total||0),0);

    // Hourly breakdown
    const hourMap = {};
    all.forEach(o => { const h = o.ts.getHours(); hourMap[h] = (hourMap[h]||0) + 1; });
    const peakSlots = [
      { label:'9–12am',  hours:[9,10,11] },
      { label:'12–3pm',  hours:[12,13,14] },
      { label:'3–6pm',   hours:[15,16,17] },
      { label:'6–9pm',   hours:[18,19,20] },
    ].map(s => ({ ...s, count: s.hours.reduce((n,h)=>(n+(hourMap[h]||0)),0) }));
    const maxPeak = Math.max(...peakSlots.map(s=>s.count), 1);

    const periodLabel = { today:'Today', '7':'Last 7 Days', '30':'Last 30 Days', all:'All Time' }[period];

    const el = document.getElementById('posAnalyticsContent');
    if (!el) return;
    el.innerHTML = `
      <!-- KPIs -->
      <div class="pos-analytics-layout" style="margin-bottom:12px;">
        <div class="pos-kpi"><div class="pos-kpi-lbl">Revenue (${periodLabel})</div><div class="pos-kpi-val"><sup>QR</sup>${revenue.toFixed(0)}</div><div class="pos-kpi-sub">${orderCount} paid orders</div></div>
        <div class="pos-kpi"><div class="pos-kpi-lbl">Orders</div><div class="pos-kpi-val">${orderCount}</div><div class="pos-kpi-sub">Online + POS</div></div>
        <div class="pos-kpi"><div class="pos-kpi-lbl">Avg Order Value</div><div class="pos-kpi-val"><sup>QR</sup>${avgOrder.toFixed(0)}</div></div>
        <div class="pos-kpi"><div class="pos-kpi-lbl">Items Sold</div><div class="pos-kpi-val">${itemsSold}</div></div>
      </div>
      <!-- Charts row -->
      <div class="pos-analytics-row2" style="margin-bottom:12px;">
        <div class="pos-chart-card">
          <div class="pos-chart-title">Top Products by Revenue</div>
          ${topProds.length ? topProds.map(([name,val])=>`
            <div class="pos-bar-row">
              <div class="pos-bar-name">${name}</div>
              <div class="pos-bar-track"><div class="pos-bar-fill" style="width:${(val/maxProd*100).toFixed(1)}%"></div></div>
              <div class="pos-bar-val">QR ${val.toFixed(0)}</div>
            </div>`).join('') : '<div style="font-family:var(--serif);font-style:italic;color:rgba(255,255,255,0.2);font-size:13px;">No data yet</div>'}
        </div>
        <div class="pos-chart-card">
          <div class="pos-chart-title">Revenue — Last 7 Days</div>
          <div class="pos-trend-chart">
            ${dayRevs.map(d=>`<div class="pos-trend-col"><div class="pos-trend-bar${d.isToday?' today':''}" style="height:${(d.rev/maxRev*100).toFixed(1)}%"></div><div class="pos-trend-lbl">${d.label}</div></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="pos-analytics-row2">
        <div class="pos-chart-card">
          <div class="pos-chart-title">Payment Methods</div>
          <div class="pos-pie-row">
            <div class="pos-pie-legend">
              <div class="pos-pie-leg-item"><div class="pos-pie-dot" style="background:#C6922A"></div><span class="pos-pie-leg-name">Cash</span><span class="pos-pie-leg-val">QR ${cashRev.toFixed(0)}</span></div>
              <div class="pos-pie-leg-item"><div class="pos-pie-dot" style="background:#2196f3"></div><span class="pos-pie-leg-name">Card / Online</span><span class="pos-pie-leg-val">QR ${cardRev.toFixed(0)}</span></div>
            </div>
            <svg width="80" height="80" viewBox="0 0 32 32">
              ${revenue > 0 ? (function(){
                const cashPct = cashRev / revenue;
                const r = 14, cx = 16, cy = 16;
                const toXY = (pct) => [cx + r*Math.cos(2*Math.PI*pct - Math.PI/2), cy + r*Math.sin(2*Math.PI*pct - Math.PI/2)];
                const [x1,y1] = toXY(0), [x2,y2] = toXY(cashPct), [x3,y3] = toXY(1-0.001);
                const lf1 = cashPct > 0.5 ? 1 : 0, lf2 = (1-cashPct) > 0.5 ? 1 : 0;
                return cashPct === 0 ? `<circle cx="16" cy="16" r="14" fill="#2196f3"/>` :
                       cashPct === 1 ? `<circle cx="16" cy="16" r="14" fill="#C6922A"/>` :
                  `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${lf1},1 ${x2},${y2} Z" fill="#C6922A"/>
                   <path d="M${cx},${cy} L${x2},${y2} A${r},${r} 0 ${lf2},1 ${x3},${y3} Z" fill="#2196f3"/>`;
              })() : '<circle cx="16" cy="16" r="14" fill="rgba(255,255,255,0.06)"/>'}
            </svg>
          </div>
        </div>
        <div class="pos-chart-card">
          <div class="pos-chart-title">Peak Hours</div>
          ${peakSlots.map(s=>`
            <div class="pos-peak-row">
              <div class="pos-peak-lbl">${s.label}</div>
              <div class="pos-peak-bar-track"><div class="pos-peak-bar-fill" style="width:${(s.count/maxPeak*100).toFixed(1)}%"></div></div>
              <div style="font-family:var(--sans);font-size:10px;color:rgba(255,255,255,0.4);width:24px;text-align:right;">${s.count}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════
  //  WIRE SERVICES MODULE
  // ══════════════════════════════════════════════
  const WIRE_KEY = 'rosebella_wire_orders';
  const WIRE_INTEGRATIONS_KEY = 'rosebella_wire_integrations';
  let wireOrders = (function(){ try{ return JSON.parse(localStorage.getItem(WIRE_KEY))||[]; }catch(e){ return []; } })();
  let wireIntegrations = (function(){ try{ return JSON.parse(localStorage.getItem(WIRE_INTEGRATIONS_KEY))||{ FTD:false, Teleflora:false, '1-800-Flowers':false, BloomNation:false }; }catch(e){ return { FTD:false, Teleflora:false, '1-800-Flowers':false, BloomNation:false }; } })();
  function saveWire() { localStorage.setItem(WIRE_KEY, JSON.stringify(wireOrders)); }
  function saveWireIntegrations() { localStorage.setItem(WIRE_INTEGRATIONS_KEY, JSON.stringify(wireIntegrations)); }

  function posWireRender() {
    const logos = { FTD:'FTD', Teleflora:'Teleflora', '1-800-Flowers':'1-800-Flowers', BloomNation:'BloomNation' };
    const intEl = document.getElementById('posWireIntegrations');
    if (intEl) intEl.innerHTML = Object.keys(logos).map(name => {
      const active = wireIntegrations[name];
      return `<div class="pos-wire-integ">
        <div class="pos-wire-logo">${name}</div>
        <div><span class="pos-wire-status ${active?'pos-wire-status-active':'pos-wire-status-inactive'}">${active?'Connected':'Not Connected'}</span></div>
        <button class="pos-wire-connect ${active?'pos-wire-disconnect':''}" onclick="posWireToggle('${name}')">${active?'Disconnect':'Connect'}</button>
      </div>`;
    }).join('');

    const listEl = document.getElementById('posWireList');
    if (!listEl) return;
    const statusColors = { pending:'#ffc107', preparing:'#2196f3', out:'#9c27b0', delivered:'#4caf7d' };
    listEl.innerHTML = wireOrders.length ? wireOrders.map(o => {
      const d = new Date(o.createdAt);
      const sc = statusColors[o.status] || '#ffc107';
      return `<div class="pos-wire-order">
        <div class="pos-wire-ord-hd"><span class="pos-wire-ord-id">${o.orderId}</span><span class="pos-wire-ord-src">${o.service}</span></div>
        <div class="pos-wire-ord-details">${o.arrangement} · QR ${o.total} · ${o.recipient} · ${o.delivDate}</div>
        ${o.notes ? `<div style="font-family:var(--sans);font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:6px;">${o.notes}</div>` : ''}
        <div class="pos-wire-ord-footer">
          <div class="pos-status-pipeline">
            ${['pending','preparing','out','delivered'].map(s=>`<button class="pos-status-btn ${o.status===s?'status-'+s:''}" onclick="posWireSetStatus('${o.orderId}','${s}')">${{pending:'Pending',preparing:'Preparing',out:'Out for Delivery',delivered:'Delivered'}[s]}</button>`).join('')}
          </div>
          <button class="pos-inv-btn pos-inv-btn-del" onclick="posWireDelete('${o.orderId}')">🗑</button>
        </div>
      </div>`;
    }).join('') : '<div class="pos-no-orders">No wire orders yet</div>';
  }

  function posWireToggle(name) {
    wireIntegrations[name] = !wireIntegrations[name];
    saveWireIntegrations();
    posWireRender();
    apToast(`${name} ${wireIntegrations[name]?'connected':'disconnected'}`);
  }

  function posWireSubmit() {
    const service    = document.getElementById('wireService')?.value;
    const orderId    = document.getElementById('wireOrderId')?.value.trim();
    const arrangement= document.getElementById('wireArrangement')?.value.trim();
    const total      = document.getElementById('wireTotal')?.value;
    const recipient  = document.getElementById('wireRecipient')?.value.trim();
    const delivDate  = document.getElementById('wireDelivDate')?.value;
    const notes      = document.getElementById('wireNotes')?.value.trim();
    if (!orderId || !arrangement || !recipient) { apToast('Please fill Order ID, Arrangement, and Recipient.'); return; }
    wireOrders.unshift({ orderId: orderId || ('WIRE-'+Date.now().toString().slice(-6)), service, arrangement, total: parseFloat(total)||0, recipient, delivDate, notes, status:'pending', createdAt: new Date().toISOString() });
    saveWire();
    ['wireOrderId','wireArrangement','wireTotal','wireRecipient','wireDelivDate','wireNotes'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    posWireRender();
    apToast('Wire order logged!');
  }

  function posWireSetStatus(orderId, status) {
    const o = wireOrders.find(x => x.orderId === orderId);
    if (o) { o.status = status; saveWire(); posWireRender(); apToast(`${orderId} → ${status}`); }
  }

  function posWireDelete(orderId) {
    if (!confirm('Remove this wire order?')) return;
    wireOrders = wireOrders.filter(x => x.orderId !== orderId);
    saveWire(); posWireRender();
  }
