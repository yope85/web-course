/* לכל כפתור 🔨 בכל ארגז JS: לוחץ, ומדפיס איזו שורה סומנה, מה בה, ומה ההפרש שהוצג – לבדיקה שהסימון על השורה הנכונה */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: +(process.argv[2] || 1000), height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('course-sound-noted', '1'); localStorage.setItem('course-sound', 'off'); } catch (e) {} });
  const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
  await pg.goto('http://localhost:8812/js-basics.html'); await pg.waitForTimeout(400);
  const steps = await pg.evaluate(() => [...document.querySelectorAll('section.topic')].flatMap(s => [...s.querySelectorAll('article.spread')].map((a, i) => [s.dataset.id, i + 1])));
  let total = 0, bad = 0;
  for (const [t, n] of steps) {
    await pg.evaluate(([t, n]) => Course.go(t, n), [t, n]); await pg.waitForTimeout(120);
    for (let k = 0; k < 6; k++) { const bs = await pg.$$('.spread:not([hidden]) .predict .opts button:not([disabled])'); if (!bs.length) break; for (const x of bs) { try { await x.click({ timeout: 300 }); } catch (e) {} } await pg.waitForTimeout(100); }
    const cnt = await pg.$$eval('.spread:not([hidden]) .jsb-brk', e => e.length);
    for (let i = 0; i < cnt; i++) {
      const r = await pg.evaluate(async (i) => {
        const root = document.querySelector('.spread:not([hidden])'); const btn = root.querySelectorAll('.jsb-brk')[i];
        const box = btn.closest('.jsbox, [class*=jsb]') && btn.closest('.jsb') || btn.parentElement.closest('div[id]') || root;
        const ta = btn.closest('.spread').querySelector('.jsb-code'); const wrap = ta.parentElement;
        btn.click(); await new Promise(r => setTimeout(r, 350));
        const hl = wrap.querySelector('.jsb-hl'); const why = btn.closest('.spread').querySelector('.jsb-why');
        const lh = parseFloat(getComputedStyle(ta).lineHeight), pt = parseFloat(getComputedStyle(ta).paddingTop);
        const vis = hl && !hl.hidden && hl.children.length > 0; let first = -1, cntl = 0, inView = !!vis; const idx = [];
        if (vis) for (const bar of hl.children) { const f = Math.round((parseFloat(bar.style.top) - pt + ta.scrollTop) / lh), c = Math.round(parseFloat(bar.style.height) / lh); for (let q = 0; q < c; q++) idx.push(f + q); if (parseFloat(bar.style.top) < -1 || parseFloat(bar.style.top) + parseFloat(bar.style.height) > ta.clientHeight + 2) inView = false; }
        first = idx.length ? idx[0] : -1; cntl = idx.length;
        const lines = ta.value.split('\n');
        const out = {label: btn.textContent, vis, line: first + 1, n: cntl, text: vis ? idx.map(q => 'ש' + (q + 1) + ': ' + lines[q]).join(' ⏎ ') : null, inView, diff: !!(why && why.querySelector('.jd-new, .jd-old')), diffTxt: why ? [...why.querySelectorAll('.jd-old code, .jd-new code')].map(c => c.textContent).join(' → ') : ''};
        const fix = why && why.querySelector('.jsb-fix'); if (fix) fix.click(); await new Promise(r => setTimeout(r, 150));
        return out;
      }, i);
      total++; const ok = r.vis && r.inView && r.diff; if (!ok) bad++;
      console.log((ok ? '✔' : '✘') + ' ' + t + '/' + n + ' [' + r.label + '] שורה ' + r.line + '×' + r.n + ': ' + (r.text || '—') + '   ||   ' + r.diffTxt.replace(/\n/g, '⏎'));
    }
  }
  console.log('breaks', total, 'bad', bad); await b.close();
})();
