/* ══════════════════════════════════════════════
   ROSEBELLA — bigger text on phones
   On screens up to 768px wide, every font size set in px in the site's own styles is made
   2px larger (sizes in em/rem/% follow automatically). Styles added later by the shared scripts
   (cards, bag bar, extras picker…) are boosted as they appear. Computers are unchanged.
   ══════════════════════════════════════════════ */
(function () {
  const BOOST = 2;
  if (!window.matchMedia || !matchMedia('(max-width: 768px)').matches) return;
  const done = new WeakSet();

  function boostRules(rules) {
    for (const r of rules) {
      if (r.cssRules && !r.style) { boostRules(r.cssRules); continue; }       // @media, @supports …
      if (!r.style || done.has(r)) continue;
      done.add(r);
      const v = r.style.getPropertyValue('font-size');
      const m = /^(\d+(?:\.\d+)?)px$/.exec(v.trim());
      if (m) r.style.setProperty('font-size', (parseFloat(m[1]) + BOOST) + 'px', r.style.getPropertyPriority('font-size'));
      // shorthand "font: 700 12px/1.4 …" keeps its own size — boost it too
      const f = r.style.getPropertyValue('font');
      const fm = /(^|\s)(\d+(?:\.\d+)?)px(\/|\s)/.exec(f);
      if (fm) r.style.setProperty('font', f.replace(fm[0], `${fm[1]}${parseFloat(fm[2]) + BOOST}px${fm[3]}`), r.style.getPropertyPriority('font'));
    }
  }
  function boostAll() {
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }          // fonts from Google can't be read — skip
      if (rules) boostRules(rules);
    }
  }
  boostAll();
  document.addEventListener('DOMContentLoaded', boostAll);
  window.addEventListener('load', boostAll);
  // styles injected later (cards, bag bar, extras picker…)
  new MutationObserver(() => boostAll()).observe(document.head, { childList: true });
})();
