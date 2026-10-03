/* ══════════════════════════════════════════════
   ROSEBELLA — order receipt (same layout as the Rosebella invoice template)
   RBReceipt.pdf(order)   → Blob (A4 PDF)
   RBReceipt.image(order) → Blob (JPEG, for links in WhatsApp / email)
   RBReceipt.download(order)
   Used by the storefront (order confirmed screen) and the admin portal.
   ══════════════════════════════════════════════ */
(function () {
  const LOGO = 'data:image/png;base64,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';
  const LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  ];
  const GOLD = '#c39029', CREAM = '#f7ecd9';
  const STORE = {
    tagline: 'Fresh flowers, crafted with passion and love — delivered with care to help your moments bloom.',
    cr: '156868', tel: '+974 3344 6618', web: 'www.rosebella.qa', email: 'Rosebellaflowersqa@gmail.com',
    accountName: 'Rosebella Flowers', iban: 'QA96QNBA000000000260076005001',
    terms: 'If no objection is received within (10) days, this is considered as accepted unconditionally for payment.',
  };

  let libsReady = null;
  function loadLibs() {
    if (libsReady) return libsReady;
    libsReady = LIBS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    })), Promise.resolve());
    return libsReady;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => { const v = Math.round((Number(n) || 0) * 100) / 100; return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  function dateOf(v) {
    const d = v && v.toDate ? v.toDate() : new Date(v || Date.now());
    return isNaN(d) ? '' : [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((x, i) => i < 2 ? String(x).padStart(2, '0') : x).join('/');
  }

  // Lines on the receipt: products, then delivery fee and promo so the column adds up to the total
  function lines(o) {
    const out = (o.items || []).map(i => ({
      desc: i.name + (i.variants?.addons?.length ? ' + ' + i.variants.addons.join(', ') : ''),
      qty: Number(i.qty) || 1, unit: Number(i.price) || 0,
    }));
    const sub = out.reduce((s, l) => s + l.qty * l.unit, 0);
    const fee = Number(o.deliverySlot?.expressFee) || 0;
    if (fee) out.push({ desc: 'Delivery fee  رسوم التوصيل', qty: 1, unit: fee });
    const discount = Math.round((sub + fee - (Number(o.total) || 0)) * 100) / 100;
    if (discount > 0) out.push({ desc: 'Discount' + (o.appliedPromo?.code ? ' (' + o.appliedPromo.code + ')' : '') + '  خصم', qty: 1, unit: -discount });
    return out;
  }

  function customerName(o) {
    const real = n => n && !/^(guest|customer)$/i.test(String(n).trim()) ? n : '';
    return real(o.buyer?.name) || real(o.customer?.name) || (o.recipient?.notes !== 'gift' ? real(o.recipient?.name) : '') || '';
  }

  function html(o) {
    const L = lines(o);
    const rows = Math.max(12, L.length);
    const pay = o.paymentMethod === 'cash' ? 'Cash on delivery — الدفع عند الاستلام'
      : 'Paid online — مدفوع' + (o.payment?.invoiceId ? ' (MyFatoorah ' + o.payment.invoiceId + ')' : '');
    const ds = o.deliverySlot || {};
    const cell = 'border-right:1px solid #e7d7b8;padding:0 10px;';
    const th = 'color:#fff;font-weight:700;text-align:center;padding:8px 6px;font-size:12px;line-height:1.25;';
    return `<div style="width:794px;min-height:1123px;box-sizing:border-box;padding:46px 60px 40px;background:#fff;color:#2b2b2b;font-family:Arial,Helvetica,Tahoma,sans-serif;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><img src="${LOGO}" style="width:270px;display:block">
          <div style="font-size:10px;font-weight:700;color:#555;letter-spacing:.06em;margin-top:8px">FLOWERS · CR ${STORE.cr}</div></div>
        <div style="text-align:center;padding-top:6px">
          <div style="font-size:24px;font-weight:700;color:#555">فاتورة</div>
          <div style="font-size:30px;font-weight:700;color:#555;margin-top:14px;letter-spacing:.02em">RECEIPT</div></div>
        <div style="width:150px;background:${CREAM};padding:14px 12px;font-size:10px;font-style:italic;color:#7a5a1e;line-height:1.35;min-height:110px;box-sizing:border-box">${STORE.tagline}</div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:26px;font-size:13px">
        <div style="flex:1;border-bottom:1px dotted #bbb;padding-bottom:5px;margin-right:60px"><b style="color:${GOLD}">No.</b>&nbsp;&nbsp;&nbsp;<b>${esc(o.id)}</b></div>
        <div style="width:230px;border-bottom:1px dotted #bbb;padding-bottom:5px;display:flex;justify-content:space-between"><span style="font-size:11px;font-weight:700">التاريخ: Date</span><b>${dateOf(o.createdAt)}</b></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:13px;border-bottom:1px dotted #bbb;padding-bottom:5px">
        <div><b style="color:${GOLD};font-size:11px">Miss/Mr:</b>&nbsp;&nbsp;${esc(customerName(o))}</div>
        <div style="font-size:11px;font-weight:700">السيدة \\ السيد :</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:12px;border:1px solid ${GOLD}">
        <tr style="background:${GOLD}">
          <td style="${th}width:62px">الرقم<br>Sl No.</td><td style="${th}">التفاصيل<br>Description</td>
          <td style="${th}width:62px">الكمية<br>Qty.</td><td style="${th}width:92px">سعر الوحدة<br>Unit Price<br><span style="font-weight:400;font-size:10px">Qrs. ريال</span></td>
          <td style="${th}width:112px">المبلغ<br>Amount<br><span style="font-weight:400;font-size:10px">Qrs. ريال</span></td></tr>
        ${Array.from({ length: rows }, (_, i) => { const l = L[i]; return `<tr style="height:27px;border-bottom:1px dotted #ccb88f">
          <td style="${cell}text-align:center;color:#555">${i + 1}</td>
          <td style="${cell}" dir="auto">${l ? esc(l.desc) : ''}</td>
          <td style="${cell}text-align:center">${l ? l.qty : ''}</td>
          <td style="${cell}text-align:right">${l ? num(l.unit) : ''}</td>
          <td style="padding:0 10px;text-align:right">${l ? num(l.unit * l.qty) : ''}</td></tr>`; }).join('')}
        <tr style="background:${CREAM};height:64px;border-top:2px solid #222">
          <td colspan="2" style="padding:0 10px;font-size:16px;font-weight:700;color:#6b5a3a">Total</td>
          <td colspan="2" style="padding:0 10px;text-align:right;font-size:14px;font-weight:700;color:#6b5a3a;border-right:2px solid #222">المجموع</td>
          <td style="padding:0 10px;text-align:right;font-size:17px;font-weight:700">QR ${num(o.total)}</td></tr>
      </table>
      <div style="margin-top:14px;font-size:12px;display:flex;justify-content:space-between;gap:20px">
        <div><b>Payment:</b> ${esc(pay)}</div>
        <div dir="auto">${ds.type === 'express' ? 'Express delivery (90 min)' : esc([ds.date, ds.slotLabel].filter(Boolean).join(' · '))}</div>
      </div>
      <p style="font-family:Georgia,'Times New Roman',serif;font-size:13px;margin-top:18px">${STORE.terms}</p>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;margin-top:16px;line-height:1.5">PAYMENT INFO:<br>Account Name: ${STORE.accountName}<br>Iban Number: ${STORE.iban}</div>
      <div style="display:flex;justify-content:space-between;margin-top:70px;font-size:12px;font-weight:700;color:#444">
        <div style="width:300px;border-top:1px solid #333;padding-top:22px;text-align:center">توقيع الزبون&nbsp;&nbsp; Client's Signature</div>
        <div style="width:300px;border-top:1px solid #333;padding-top:22px;text-align:center">توقيع المستلم&nbsp;&nbsp; Receiver's Signature</div>
      </div>
      <div style="position:absolute;left:60px;right:60px;bottom:40px">
        <div style="background:${GOLD};color:#fff;font-size:11px;font-weight:700;text-align:center;padding:8px">Tel: ${STORE.tel} &nbsp;|&nbsp; Doha - Qatar &nbsp;|&nbsp; CR ${STORE.cr} &nbsp;|&nbsp; ${STORE.web}</div>
        <div style="background:#8a5f17;color:#fff;font-size:11px;font-weight:700;text-align:center;padding:7px;margin:0 70px">E-mail: ${STORE.email}</div>
      </div>
    </div>`;
  }

  async function canvas(o) {
    await loadLibs();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1';
    host.innerHTML = html(o);
    document.body.appendChild(host);
    try {
      await Promise.all([...host.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      return await window.html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', logging: false });
    } finally { host.remove(); }
  }

  async function pdf(o) {
    const c = await canvas(o);
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const w = doc.internal.pageSize.getWidth(), h = c.height * w / c.width;
    doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
    return doc.output('blob');
  }
  async function image(o) {
    const c = await canvas(o);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
  }
  async function download(o) {
    const blob = await pdf(o);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `Rosebella-receipt-${o.id}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  window.RBReceipt = { html, pdf, image, download, lines };
})();
