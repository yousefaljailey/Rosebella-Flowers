/* ══════════════════════════════════════════════
   ROSEBELLA — MyFatoorah payments (Vercel serverless function)

   POST /api/pay?action=session   { order }            → { sessionId, countryCode, currency, amount }
   POST /api/pay?action=execute   { order, orderId, sessionId | method:'naps' } → { paymentUrl, amount }
   GET  /api/pay?action=status&paymentId=…             → { paid, status, amount, invoiceId, reference }

   The secret key lives only in the MYFATOORAH_API_KEY environment variable.
   The amount is always recalculated here from the live catalog + settings,
   never taken from the browser.
   ══════════════════════════════════════════════ */
const MF_BASE  = process.env.MYFATOORAH_BASE_URL || 'https://api-qa.myfatoorah.com';  // Qatar live
const PROJECT  = 'rosebella-bac0e';
const FB_KEY   = 'AIzaSyCWaVcGjH3ZZ11Oy1vEBJOE9L_wbsgYET0';
const NAPS_METHOD_ID = 6;   // Qatar Debit Card (redirect only)

const DEFAULT_ADDONS = [
  { id: 'balloon', label: 'Balloon', price: 35 }, { id: 'chocolate', label: 'Chocolates', price: 55 },
  { id: 'vase', label: 'Vase', price: 45 }, { id: 'candle', label: 'Candle', price: 30 },
  { id: 'perfume', label: 'Perfume', price: 65 },
];
const DEFAULT_SLOTS = [
  { id: 's1', fee: 0 }, { id: 's2', fee: 0 }, { id: 's3', fee: 25 }, { id: 's4', fee: 25 },
  { id: 's5', fee: 25 }, { id: 's6', fee: 25 }, { id: 's_express', fee: 50 },
];

// ── Firestore (public read) ─────────────────────
function decode(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) { const o = {}; for (const k in v.mapValue.fields || {}) o[k] = decode(v.mapValue.fields[k]); return o; }
  return null;
}
async function readDoc(path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}?key=${FB_KEY}`);
  if (!r.ok) throw new Error(`Could not load ${path}`);
  const d = await r.json();
  return decode({ mapValue: { fields: d.fields || {} } });
}

// ── Pricing ─────────────────────────────────────
async function priceOrder(order) {
  if (!order || !Array.isArray(order.items) || !order.items.length) throw httpError(400, 'Your gift bag is empty.');
  if (order.items.length > 50) throw httpError(400, 'Too many items in one order.');
  const [catalog, settings] = await Promise.all([readDoc('catalog/main'), readDoc('config/settings')]);
  const hiddenCols = new Set((catalog.collections || []).filter(c => c.visible === false).map(c => c.slug));
  const products = (catalog.products || []).filter(p => p.visible !== false && !hiddenCols.has(p.cat));
  const addons = (Array.isArray(settings.addons) ? settings.addons : DEFAULT_ADDONS).filter(a => a.active !== false);

  const lines = order.items.map(it => {
    const p = products.find(x => x.name === it.name);
    if (!p) throw httpError(400, `“${it.name}” is no longer available. Please remove it from your gift bag.`);
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= 99)) throw httpError(400, 'Invalid quantity.');
    const extras = (it.variants?.addons || []).map(label => {
      const a = addons.find(x => x.label === label);
      if (!a) throw httpError(400, `The extra “${label}” is no longer available.`);
      return a;
    });
    const unit = (Number(p.price) || 0) + extras.reduce((s, a) => s + (Number(a.price) || 0), 0);
    return { name: p.name + (extras.length ? ` + ${extras.map(a => a.label).join(', ')}` : ''), qty, unit };
  });

  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  let discount = 0;
  if (order.promoCode) {
    const promo = (settings.promos || []).find(x => x.active !== false && String(x.code).toUpperCase() === String(order.promoCode).toUpperCase());
    if (promo) discount = promo.type === 'percent' ? subtotal * (Number(promo.value) || 0) / 100 : Math.min(Number(promo.value) || 0, subtotal);
  }
  let deliveryFee = 0;
  if (order.slotId) {
    const slot = (Array.isArray(settings.deliverySlots) ? settings.deliverySlots : DEFAULT_SLOTS).find(s => s.id === order.slotId);
    deliveryFee = Number(slot?.fee) || 0;
  }
  const total = Math.round((Math.max(0, subtotal - discount) + deliveryFee) * 100) / 100;
  if (total <= 0) throw httpError(400, 'Order total must be more than zero.');
  return { lines, subtotal, discount, deliveryFee, total };
}

// ── MyFatoorah ──────────────────────────────────
async function mf(path, body) {
  const key = process.env.MYFATOORAH_API_KEY;
  if (!key) throw httpError(500, 'Payments are not configured yet.');
  const r = await fetch(`${MF_BASE}/v2/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.IsSuccess) {
    const detail = (d.ValidationErrors || []).map(v => v.Error).join(' ') || d.Message || `MyFatoorah error ${r.status}`;
    console.error('MyFatoorah', path, r.status, JSON.stringify(d).slice(0, 500));
    throw httpError(502, detail);
  }
  return d.Data;
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function siteOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}
function cleanText(s, max) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, max); }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const action = req.query.action;

    if (action === 'status' && req.method === 'GET') {
      // Status is non-sensitive (paid flag, amount, ids) — the admin portal reads it too
      res.setHeader('Access-Control-Allow-Origin', '*');
      const paymentId = String(req.query.paymentId || '');
      const invoiceId = String(req.query.invoiceId || '');
      let d;
      if (paymentId) {
        if (!/^[\w-]{4,64}$/.test(paymentId)) throw httpError(400, 'Invalid payment id.');
        d = await mf('GetPaymentStatus', { Key: paymentId, KeyType: 'PaymentId' });
      } else if (/^\d{3,15}$/.test(invoiceId)) {
        d = await mf('GetPaymentStatus', { Key: invoiceId, KeyType: 'InvoiceId' });
      } else throw httpError(400, 'Invalid payment id.');
      const txs = d.InvoiceTransactions || [];
      const tx = txs.find(t => String(t.PaymentId) === paymentId) || txs.find(t => t.TransactionStatus === 'Succss' || t.TransactionStatus === 'Success') || txs[txs.length - 1] || {};
      return res.status(200).json({
        paid: d.InvoiceStatus === 'Paid',
        status: d.InvoiceStatus,
        transactionStatus: tx.TransactionStatus || '',
        error: tx.Error || '',
        amount: Number(d.InvoiceValue) || 0,
        invoiceId: d.InvoiceId,
        reference: d.CustomerReference || '',
        method: tx.PaymentGateway || '',
        paymentId: tx.PaymentId ? String(tx.PaymentId) : paymentId,
      });
    }

    if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const priced = await priceOrder(body.order);

    if (action === 'session') {
      const d = await mf('InitiateSession', {});
      return res.status(200).json({ sessionId: d.SessionId, countryCode: d.CountryCode || 'QAT', currency: 'QAR', amount: priced.total });
    }

    if (action === 'execute') {
      const orderId = cleanText(body.orderId, 40);
      if (!/^RB-[A-Z0-9]{4,20}$/.test(orderId)) throw httpError(400, 'Invalid order id.');
      const r = body.order.recipient || {};
      const phone = String(r.phone || '').replace(/\D/g, '').replace(/^974/, '');
      const origin = siteOrigin(req);
      const payload = {
        InvoiceValue: priced.total,
        DisplayCurrencyIso: 'QAR',
        CustomerName: cleanText(body.order.customerName || r.name, 60) || 'Rosebella customer',
        CustomerReference: orderId,
        UserDefinedField: orderId,
        Language: 'en',
        CallBackUrl: `${origin}/?mf=return&order=${orderId}`,
        ErrorUrl: `${origin}/?mf=error&order=${orderId}`,
      };
      if (/^\d{8}$/.test(phone)) { payload.MobileCountryCode = '+974'; payload.CustomerMobile = phone; }
      const email = cleanText(body.order.customerEmail, 80);
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) payload.CustomerEmail = email;

      if (body.method === 'naps') payload.PaymentMethodId = NAPS_METHOD_ID;
      else if (body.sessionId && /^[\w-]{10,64}$/.test(body.sessionId)) payload.SessionId = body.sessionId;
      else throw httpError(400, 'Missing payment details.');

      const d = await mf('ExecutePayment', payload);
      return res.status(200).json({ paymentUrl: d.PaymentURL, invoiceId: d.InvoiceId, amount: priced.total });
    }

    throw httpError(400, 'Unknown action.');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ error: e.message || 'Payment error' });
  }
};
