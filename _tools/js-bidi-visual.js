/* בדיקת סדר חזותי: לכל טוקן LTR (bdi/code) בכל שקף – האם האותיות מופיעות משמאל לימין בפועל (לפי מיקום במסך), ולא רק לפי ה-DOM */
const { chromium } = require('playwright');
(async () => {
  const file = process.argv[2] || 'js-basics';
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: +(process.argv[3] || 1000), height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('course-sound-noted', '1'); localStorage.setItem('course-sound', 'off'); } catch (e) {} });
  const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
  await pg.goto('http://localhost:8812/' + file + '.html'); await pg.waitForTimeout(400);
  const steps = await pg.evaluate(() => [...document.querySelectorAll('section.topic')].flatMap(s => [...s.querySelectorAll('article.spread')].map((a, i) => [s.dataset.id, i + 1])));
  let bad = 0, checked = 0;
  for (const [t, n] of steps) {
    await pg.evaluate(([t, n]) => Course.go(t, n), [t, n]); await pg.waitForTimeout(120);
    const r = await pg.evaluate(() => {
      const root = document.querySelector('article.spread:not([hidden])'); if (!root) return {n: 0, bad: []};
      root.querySelectorAll('details').forEach(d => d.open = true);
      const toks = [...root.querySelectorAll('bdi[dir=ltr], code, .t-kw, .jsb-msg, .cv, kbd')].filter(e => !e.closest('textarea'));
      const bad = []; let n = 0;
      for (const el of toks) {
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const pts = [];
        while (tw.nextNode()) { const nd = tw.currentNode; for (let k = 0; k < nd.nodeValue.length; k++) { const c = nd.nodeValue[k]; if (!/[A-Za-z0-9]/.test(c)) continue; const rg = document.createRange(); rg.setStart(nd, k); rg.setEnd(nd, k + 1); const q = rg.getClientRects()[0]; if (q && q.width) pts.push([c, q.left, Math.round(q.top / 6)]); } }
        if (pts.length < 2) continue; n++;
        const lines = {}; pts.forEach(p => (lines[p[2]] = lines[p[2]] || []).push(p));
        for (const l of Object.values(lines)) { if (l.length < 2) continue; let rev = 0; for (let i = 1; i < l.length; i++) if (l[i][1] < l[i - 1][1] - 0.5) rev++; if (rev) { bad.push(el.textContent.replace(/\s+/g, ' ').slice(0, 60)); break; } }
      }
      return {n, bad};
    });
    checked += r.n; if (r.bad.length) { bad += r.bad.length; console.log(t + '/' + n, JSON.stringify(r.bad)); }
  }
  console.log('tokens checked', checked, 'bad', bad); await b.close();
})();
