// look.js page#topic-N[@w][!dark][+js] ... -> look/<name>.png (viewport-size screenshot of the step region)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const spec of process.argv.slice(2)) {
    const m = /^([a-z0-9-]+)(?:#([a-z0-9]+)-(\d+))?(?:@(\d+))?(!dark)?(?:\+(.*))?$/.exec(spec); if (!m) { console.log('bad', spec); continue; }
    const [, p, t, n, w, dark, js] = m; const W = +(w || 1280);
    const ctx = await b.newContext({viewport: {width: W, height: W < 600 ? 844 : 900}});
    await ctx.addInitScript(d => { try { localStorage.setItem('course-sound-noted','1'); localStorage.setItem('course-sound','off'); if (d) localStorage.setItem('course-theme','dark'); } catch(e){} }, !!dark);
    const pg = await ctx.newPage(); await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await pg.goto('http://localhost:8812/' + p + '.html'); await pg.waitForTimeout(400);
    if (t) { await pg.evaluate(([t, n]) => Course.go(t, +n), [t, n]); await pg.waitForTimeout(250); }
    if (js) { await pg.evaluate(js); await pg.waitForTimeout(400); }
    const name = spec.replace(/[^a-z0-9-]+/gi, '_').slice(0, 60);
    await pg.screenshot({path: __dirname + '/look/' + name + '.png', fullPage: true});
    console.log(name); await ctx.close(); }
  await b.close(); })();
