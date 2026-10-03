/* Shared by the serverless functions (files starting with "_" are not routes).
   The catalog is stored as catalog/main { collections, productChunks } plus
   catalog/products_0 … products_N { products[] } so it never hits Firestore's
   1 MB-per-document limit. Older single-document catalogs (main.products) still load. */
const PROJECT = 'rosebella-bac0e';
const FB_KEY  = 'AIzaSyCWaVcGjH3ZZ11Oy1vEBJOE9L_wbsgYET0';

function decode(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) { const o = {}; for (const k in v.mapValue.fields || {}) o[k] = decode(v.mapValue.fields[k]); return o; }
  return null;
}

async function readDoc(path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}?key=${FB_KEY}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  const d = await r.json();
  return decode({ mapValue: { fields: d.fields || {} } });
}

async function loadCatalog() {
  const main = await readDoc('catalog/main');
  if (!main) return null;
  let products = main.products || [];
  const n = Number(main.productChunks) || 0;
  if (n) {
    const chunks = await Promise.all(Array.from({ length: n }, (_, i) => readDoc(`catalog/products_${i}`)));
    products = chunks.flatMap(c => (c && c.products) || []);
  }
  return { version: main.version || 1, collections: main.collections || [], products };
}

module.exports = { decode, readDoc, loadCatalog };
