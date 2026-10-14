// hintcheck.js <page> [...] – rule 7: the 2nd hint says WHERE to look, it is not the solution. Hooks Course.playground / jsbox while the page loads,
// and flags tasks whose last hint (hints[1], or the last one) contains the solution code (or most of its tokens).
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const f of process.argv.slice(2)) {
    const ctx = await b.newContext(); const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
    await pg.addInitScript(() => {
      window.__tk = []; let C;
      const rec = (kind, o) => { try { (o.tasks || []).forEach(t => window.__tk.push({kind, id: t.id, hints: t.hints || [], sol: t.solution && (t.solution.code || t.solution.html || t.solution.css || (typeof t.solution === 'string' ? t.solution : JSON.stringify(t.solution))) })); } catch (e) {} };
      Object.defineProperty(window, 'Course', { configurable: true, get() { return C; }, set(v) { C = v;
        for (const n of ['playground', 'jsbox']) { const orig = v[n]; if (typeof orig === 'function') v[n] = function (el, o, ...r) { rec(n, o || {}); return orig.call(this, el, o, ...r); }; } } });
    });
    await pg.goto('http://localhost:8812/' + f + '.html'); await pg.waitForTimeout(900);
    const tk = await pg.evaluate(() => window.__tk);
    const norm = s => String(s || '').replace(/<[^>]*>/g, m => m).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
    let n = 0, flagged = [];
    tk.forEach(t => { if (!t.sol || t.hints.length < 2) return; n++;
      const h = norm(t.hints[t.hints.length - 1]), sol = norm(t.sol);
      const toks = [...new Set(sol.split(/[\s{}();:,]+/).filter(x => x.length > 2))]; const hit = toks.filter(x => h.includes(x)).length;
      const whole = sol.length > 6 && h.includes(sol);
      if (whole || (toks.length >= 3 && hit / toks.length >= 0.8)) flagged.push(`${t.kind} ${t.id}: last hint ≈ solution (${whole ? 'contains whole solution' : hit + '/' + toks.length + ' tokens'}) | ${h.slice(0, 90)}`); });
    console.log(`== ${f}: ${n} tasks with hints+solution, flagged ${flagged.length}`); flagged.forEach(x => console.log('  ' + x));
    await ctx.close(); }
  await b.close(); })();
