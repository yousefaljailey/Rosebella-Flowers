/* Shared by the serverless functions: only a signed-in, verified portal admin passes. */
const FIREBASE_API_KEY = 'AIzaSyCWaVcGjH3ZZ11Oy1vEBJOE9L_wbsgYET0';
const ADMIN_ORIGINS = ['https://rosebella-admin.vercel.app'];

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function adminEmails() {
  return (process.env.ADMIN_EMAILS || 'yousefaljailey@gmail.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function requireAdmin(req) {
  const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!idToken) throw httpError(401, 'Please sign in to the admin portal again.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  const d = await r.json().catch(() => ({}));
  const u = (d.users || [])[0];
  if (!r.ok || !u) throw httpError(401, 'Your admin session has expired — sign in again.');
  if (!u.emailVerified || !adminEmails().includes(String(u.email || '').toLowerCase())) throw httpError(403, 'Not allowed.');
  return u.email;
}

// CORS for calls coming from the admin portal; returns true when the request was a preflight
function adminCors(req, res) {
  const origin = req.headers.origin || '';
  if (ADMIN_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

module.exports = { requireAdmin, adminCors, httpError };
