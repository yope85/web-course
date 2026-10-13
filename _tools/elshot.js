// elshot.js page#topic-N selector out.png [w] [js]
const { chromium } = require('playwright');
(async () => { const [spec, sel, out, w, js] = process.argv.slice(2); const [p, tn] = spec.split('#'); const W = +(w || 1280);
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: W, height: 900}});
  await ctx.addInitScript(() => { localStorage.setItem('course-sound-noted','1'); localStorage.setItem('course-sound','off'); });
  const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
  await pg.goto('http://localhost:8812/' + p + '.html'); await pg.waitForTimeout(400);
  if (tn) { const [t, n] = [tn.replace(/-\d+$/, ''), tn.match(/-(\d+)$/)[1]]; await pg.evaluate(([t, n]) => Course.go(t, +n), [t, n]); await pg.waitForTimeout(300); }
  if (js) { await pg.evaluate(js); await pg.waitForTimeout(400); }
  const el = await pg.$(sel); await el.screenshot({path: out}); await b.close(); })();
