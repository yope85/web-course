/* bidi-all.js [page…] [--w=1000]
   Visual direction check for EVERY page: a run of Latin text with no space in it (g-3, btn-outline-success, mt-3, Index.cshtml)
   must appear left-to-right ON SCREEN, even when it is built from several elements (coloured chips). Measured by the real
   position of each character, not by the DOM.
   Checks each step as it loads, then again after clicking every option of every seg control (the "pick a value" buttons),
   because much text is written into the page only after a click.
   Needs: python3 -m http.server 8812 in the site folder. Exit code 1 if anything is reversed. */
const { chromium } = require('playwright');
const ALL = ['intro', 'html-basics', 'css', 'html-advanced', 'bootstrap', 'razor', 'submission1', 'js-basics', 'html-css', 'javascript'];
(async () => {
  const args = process.argv.slice(2), W = +((args.find(a => a.startsWith('--w=')) || '--w=1000').slice(4));
  const pages = args.filter(a => !a.startsWith('--')); const list = pages.length ? pages : ALL;
  const b = await chromium.launch(); let bad = 0, runs = 0;
  for (const file of list) {
    const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('course-sound-noted', '1'); localStorage.setItem('course-sound', 'off'); } catch (e) {} });
    const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
    await pg.goto('http://localhost:8812/' + file + '.html'); await pg.waitForTimeout(400);
    const check = () => pg.evaluate(() => {
      const root = document.querySelector('article.spread:not([hidden])') || document.querySelector('main') || document.body;
      root.querySelectorAll('details').forEach(d => d.open = true);
      const LAT = /[A-Za-z0-9._\-\/@#:+=]/, chars = [], boxes = new Map(); let bid = 0;
      /* a run never crosses a box boundary (button, table cell, inline-block chip) – those are separate items, not one token */
      const boxOf = el => { while (el && getComputedStyle(el).display === 'inline') el = el.parentElement; if (!boxes.has(el)) boxes.set(el, ++bid); return boxes.get(el); };
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('textarea,script,style,.cv,pre,[hidden]') ? 2 : 1 });
      while (tw.nextNode()) { const nd = tw.currentNode;
        const box = boxOf(nd.parentElement);
        for (let k = 0; k < nd.nodeValue.length; k++) { const c = nd.nodeValue[k];
          if (!LAT.test(c)) { chars.push(null); continue; }
          const rg = document.createRange(); rg.setStart(nd, k); rg.setEnd(nd, k + 1); const q = rg.getClientRects()[0];
          chars.push(q && q.width ? [c, q.left, q.top, q.height, box] : null); } }
      /* runs = maximal sequences of visible Latin chars with nothing else between them in the DOM */
      const out = []; let run = [], n = 0;
      const flush = () => {
        /* punctuation at the edge of a run (Hebrew "ב-class", a full stop after a word) is placed by the Hebrew sentence – fine */
        while (run.length && !/[A-Za-z0-9]/.test(run[0][0])) run.shift(); while (run.length && !/[A-Za-z0-9]/.test(run[run.length - 1][0])) run.pop();
        if (run.length >= 2 && /[A-Za-z0-9]/.test(run.map(x => x[0]).join(''))) { n++;
          for (let i = 1; i < run.length; i++) { const a = run[i - 1], z = run[i];
            if (Math.abs(a[2] - z[2]) < a[3] / 2 && z[1] < a[1] - 0.5) { out.push(run.map(x => x[0]).join('')); break; } } }
        run = []; };
      chars.forEach(c => { if (c && run.length && run[run.length - 1][4] !== c[4]) flush(); if (c) run.push(c); else flush(); }); flush();
      return { n, out };
    });
    const steps = await pg.evaluate(() => [...document.querySelectorAll('section.topic')].flatMap(s => [...s.querySelectorAll('article.spread')].map((a, i) => [s.dataset.id, i + 1])));
    const report = (where, r) => { runs += r.n; if (r.out.length) { bad += r.out.length; console.log('✘', file + '.html#' + where, JSON.stringify([...new Set(r.out)])); } };
    if (!steps.length) report('(page)', await check());
    for (const [t, n] of steps) {
      await pg.evaluate(([t, n]) => Course.go(t, n), [t, n]); await pg.waitForTimeout(100);
      report(t + '-' + n, await check());
      const segs = await pg.$$('article.spread:not([hidden]) .seg button, article.spread:not([hidden]) [id$="seg"] button');
      for (let i = 0; i < segs.length; i++) {
        try { await segs[i].click({ timeout: 800 }); await pg.waitForTimeout(60); report(t + '-' + n + ' (אחרי בחירה ' + (i + 1) + ')', await check()); } catch (e) {}
      }
    }
    await ctx.close();
  }
  console.log('runs checked', runs, '· reversed', bad); await b.close(); process.exit(bad ? 1 : 0);
})();
