/* ══════════════════════════════════════════════
   ROSEBELLA — send order receipts through the WhatsApp Cloud API (Meta)

   GET  /api/whatsapp                         → { configured, template }
   POST /api/whatsapp   Authorization: Bearer <Firebase ID token of an admin>
        { orderId, phone, name, total, pdfBase64 }  → { ok, messageId, via }

   The PDF is uploaded to WhatsApp, then sent as a document. Customers who have
   not messaged the shop in the last 24 h can only receive an approved template,
   so the template (with a Document header) is used whenever it is configured.

   Environment (Vercel → rosebella-flowers):
     WHATSAPP_TOKEN            permanent System User access token
     WHATSAPP_PHONE_NUMBER_ID  the sending number's Phone number ID
     WHATSAPP_TEMPLATE         template name (default: order_receipt)
     WHATSAPP_TEMPLATE_LANG    template language code (default: en)
     ADMIN_EMAILS              comma-separated admin emails (default: the portal admin)
   ══════════════════════════════════════════════ */
const GRAPH = 'https://graph.facebook.com/v21.0';
const FIREBASE_API_KEY = 'AIzaSyCWaVcGjH3ZZ11Oy1vEBJOE9L_wbsgYET0';
const ADMIN_ALLOWED_ORIGINS = ['https://rosebella-admin.vercel.app'];

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function config() {
  return {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    template: process.env.WHATSAPP_TEMPLATE || 'order_receipt',
    lang: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
    admins: (process.env.ADMIN_EMAILS || 'yousefaljailey@gmail.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  };
}

// Only a signed-in, verified portal admin may send messages
async function requireAdmin(req, cfg) {
  const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!idToken) throw httpError(401, 'Please sign in to the admin portal again.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  const d = await r.json().catch(() => ({}));
  const u = (d.users || [])[0];
  if (!r.ok || !u) throw httpError(401, 'Your admin session has expired — sign in again.');
  if (!u.emailVerified || !cfg.admins.includes(String(u.email || '').toLowerCase())) throw httpError(403, 'Not allowed.');
}

async function graph(path, cfg, init) {
  const r = await fetch(`${GRAPH}/${path}`, { ...init, headers: { Authorization: `Bearer ${cfg.token}`, ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) {
    console.error('WhatsApp', path, r.status, JSON.stringify(d).slice(0, 600));
    const e = d.error || {};
    throw httpError(502, explain(e) || `WhatsApp error ${r.status}`);
  }
  return d;
}

// Plain-language versions of the errors people actually hit
function explain(e) {
  const code = e.code, sub = e.error_subcode;
  if (code === 190) return 'The WhatsApp access token is invalid or expired — create a permanent System User token and update WHATSAPP_TOKEN.';
  if (code === 131030) return 'This customer number is not in the allowed test list. Add it in Meta (WhatsApp → API Setup → To) or connect your real business number.';
  if (code === 132001) return 'The WhatsApp template was not found — check the template name/language or wait for Meta to approve it.';
  if (code === 131047) return 'More than 24 hours since this customer last messaged you — an approved template is required.';
  if (code === 131026) return 'This number cannot receive WhatsApp messages (not on WhatsApp, or an old app version).';
  if (code === 133010) return 'The sending phone number is not registered with the WhatsApp Cloud API yet.';
  if (code === 100 && /template/i.test(e.message || '')) return 'The template does not match: it needs a Document header and 3 body variables.';
  return e.error_user_msg || e.message || (sub ? `WhatsApp error ${code}/${sub}` : '');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin || '';
  if (ADMIN_ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  const cfg = config();
  try {
    if (req.method === 'GET') return res.status(200).json({ configured: !!(cfg.token && cfg.phoneId), template: cfg.template });
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    if (!cfg.token || !cfg.phoneId) throw httpError(503, 'WhatsApp is not connected yet.');
    await requireAdmin(req, cfg);

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const orderId = String(body.orderId || '');
    if (!/^RB-[A-Z0-9]{4,20}$/.test(orderId)) throw httpError(400, 'Invalid order id.');
    let phone = String(body.phone || '').replace(/\D/g, '');
    if (phone.length === 8) phone = '974' + phone;
    if (!/^\d{10,15}$/.test(phone)) throw httpError(400, 'Invalid customer phone number.');
    const pdf = Buffer.from(String(body.pdfBase64 || ''), 'base64');
    if (pdf.length < 500 || pdf.slice(0, 4).toString() !== '%PDF') throw httpError(400, 'The receipt PDF is missing.');
    if (pdf.length > 3 * 1024 * 1024) throw httpError(400, 'The receipt PDF is too large.');
    const filename = `Rosebella-receipt-${orderId}.pdf`;
    const name = String(body.name || '').replace(/[\n\t]+/g, ' ').trim().slice(0, 60) || 'there';
    const total = String(body.total ?? '').replace(/[^\d.]/g, '') || '0';

    // 1. Upload the PDF to WhatsApp
    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');
    fd.append('type', 'application/pdf');
    fd.append('file', new Blob([pdf], { type: 'application/pdf' }), filename);
    const media = await graph(`${cfg.phoneId}/media`, cfg, { method: 'POST', body: fd });

    // 2. Send it — template first (works any time), plain document as a fallback (24 h window only)
    const send = payload => graph(`${cfg.phoneId}/messages`, cfg, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, ...payload }),
    });
    let sent, via = 'template';
    try {
      sent = await send({ type: 'template', template: {
        name: cfg.template, language: { code: cfg.lang },
        components: [
          { type: 'header', parameters: [{ type: 'document', document: { id: media.id, filename } }] },
          { type: 'body', parameters: [name, orderId, total].map(text => ({ type: 'text', text })) },
        ],
      } });
    } catch (e) {
      if (!/template/i.test(e.message)) throw e;
      via = 'document';
      sent = await send({ type: 'document', document: { id: media.id, filename,
        caption: `Thank you for your order with Rosebella 🌹\nOrder ${orderId} · Total QR ${total}` } });
    }
    return res.status(200).json({ ok: true, via, messageId: sent.messages?.[0]?.id || '' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ error: e.message || 'WhatsApp error' });
  }
};
