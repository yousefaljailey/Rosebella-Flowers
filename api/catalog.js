/* GET /api/catalog — the whole storefront catalog as one compact, CDN-cached JSON.
   Shoppers get a single compressed download instead of reading Firestore on every page view. */
const { loadCatalog } = require('./_catalog');

module.exports = async (req, res) => {
  try {
    const catalog = await loadCatalog();
    if (!catalog) return res.status(404).json({ error: 'No catalog yet' });
    // Fresh within ~30 s of an admin save; served from the edge cache in between
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=600');
    res.status(200).json(catalog);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Catalog unavailable' });
  }
};
