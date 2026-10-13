// sweep.js page [page...]  – every step × (1280 light, 390 light, 390 dark): console errors, page errors, sideways scroll, screenshots
// usage: NODE_PATH=$(npm root -g) node sweep.js intro css ...   (SHOTS=1 to save screenshots in tools/shots/<page>/)
const { chromium } = require('playwright');
const fs = require('fs');
const pages = process.argv.slice(2);
const MODES = [{w: 1280, h: 900, theme: 'light'}, {w: 390, h: 844, theme: 'light'}, {w: 390, h: 844, theme: 'dark'}];
(async () => {
  const b = await chromium.launch();
  const report = [];
  for (const p of pages) {
    for (const m of MODES) {
      const ctx = await b.newContext({viewport: {width: m.w, height: m.h}});
      await ctx.addInitScript(t => { try { localStorage.setItem('course-sound-noted', '1'); localStorage.setItem('course-theme', t); localStorage.setItem('course-sound', 'off'); } catch (e) {} }, m.theme);
      const pg = await ctx.newPage();
      await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
      const errs = [];
      pg.on('console', msg => { if (msg.type() === 'error' && !/lostpizza/.test((msg.location() || {}).url || '') && !/fonts\.(googleapis|gstatic)|ERR_FAILED/.test(msg.text())) errs.push(msg.text().slice(0, 200)); });
      pg.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 200)));
      await pg.goto('http://localhost:8812/' + p + '.html', {waitUntil: 'load'});
      await pg.waitForTimeout(400);
      const steps = await pg.evaluate(() => [...document.querySelectorAll('section.topic')].map(s => [s.dataset.id, s.querySelectorAll(':scope article.spread').length]));
      for (const [id, n] of steps) for (let k = 1; k <= n; k++) {
        const before = errs.length;
        await pg.evaluate(([id, k]) => Course.go(id, k), [id, k]);
        await pg.waitForTimeout(120);
        const r = await pg.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.documentElement.scrollHeight}));
        if (r.sw > r.iw) report.push(`${p} #${id}-${k} ${m.w}/${m.theme}: SIDEWAYS ${r.sw}>${r.iw}`);
        if (errs.length > before) report.push(`${p} #${id}-${k} ${m.w}/${m.theme}: ERR ${errs.slice(before).join(' | ')}`);
        if (process.env.SHOTS && !(m.w === 390 && m.theme === 'light')) {
          const dir = __dirname + '/shots/' + p; fs.mkdirSync(dir, {recursive: true});
          await pg.screenshot({path: `${dir}/${id}-${k}-${m.w}-${m.theme}.png`, fullPage: true});
        }
      }
      await ctx.close();
    }
    console.log('done', p);
  }
  await b.close();
  fs.writeFileSync(__dirname + '/sweep-report.txt', report.join('\n'));
  console.log(report.length ? report.join('\n') : 'ALL CLEAN');
})();
