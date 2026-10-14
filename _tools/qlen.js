// qlen.js <page> [...]  – answer-length bias (rule 5: the right answer must not stand out by length).
// Hooks Course.predict / quiz / checkpoint while the page loads, then flags every multiple-choice question where the correct option is the longest
// AND at least 1.25x the mean of the others (ratio shown). Also prints how many are "longest" at all.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const f of process.argv.slice(2)) {
    const ctx = await b.newContext(); const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
    await pg.addInitScript(() => {
      window.__qs = []; let C;
      const strip = s => String(s).replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
      const rec = (kind, o, where) => { try { if (!o || !Array.isArray(o.opts) || typeof o.correct !== 'number') return; window.__qs.push({kind, where, q: strip(o.q || o.title || '').slice(0, 60), opts: o.opts.map(x => strip(typeof x === 'string' ? x : (x && (x.t || x.text || x.label)) || '')), correct: o.correct}); } catch (e) {} };
      Object.defineProperty(window, 'Course', { configurable: true, get() { return C; }, set(v) {
        C = v; const wrap = (name, fn) => { const orig = v[name]; if (typeof orig !== 'function') return; v[name] = function (el, o, ...r) { fn(el, o); return orig.call(this, el, o, ...r); }; };
        wrap('predict', (el, o) => rec('predict', o, (el && el.id) || ''));
        wrap('quiz', (el, list) => (list || []).forEach((o, i) => rec('quiz', o, ((el && el.id) || '') + '#' + (i + 1))));
        wrap('checkpoint', (el, list) => (list || []).forEach((o, i) => rec('cp', o, ((el && el.id) || '') + '#' + (i + 1))));
      } });
    });
    await pg.goto('http://localhost:8812/' + f + '.html'); await pg.waitForTimeout(900);
    const qs = await pg.evaluate(() => window.__qs);
    let longest = 0, flagged = [];
    qs.forEach(q => { const L = q.opts.map(s => s.length); const c = L[q.correct]; const others = L.filter((_, i) => i !== q.correct); if (!others.length) return;
      const mx = Math.max(...others), mean = others.reduce((a, b) => a + b, 0) / others.length;
      if (c > mx) { longest++; if (c >= 1.25 * mean) flagged.push(`${q.kind} ${q.where} ratio ${(c / mean).toFixed(2)} | ${q.q} | correct(${c}): ${q.opts[q.correct].slice(0, 70)}`); } });
    console.log(`== ${f}: ${qs.length} questions, correct is longest in ${longest}, flagged (>=1.25x) ${flagged.length}`); flagged.forEach(x => console.log('  ' + x));
    await ctx.close(); }
  await b.close(); })();
