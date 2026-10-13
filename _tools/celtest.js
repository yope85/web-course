const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1280,height:900}});
  await ctx.addInitScript(() => { localStorage.setItem('course-sound-noted','1'); window.__sfxLog = []; });
  const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('http://localhost:8812/html-basics.html'); await pg.waitForTimeout(500);
  await pg.evaluate(() => Course.go('practice', 2)); await pg.waitForTimeout(300);
  const dck = 'section[data-id="practice"] article.spread:nth-of-type(2) label.dck input';
  const has = await pg.$(dck); console.log('doneCheck present:', !!has);
  const layers = () => pg.evaluate(() => document.querySelectorAll('.cel-layer, .cel-fin').length);
  if (has) {
    await pg.click(dck); await pg.waitForTimeout(200); const a = await layers(); await pg.waitForTimeout(1800);
    await pg.click(dck); await pg.waitForTimeout(100); await pg.evaluate(() => window.__sfxLog = []);
    await pg.click(dck); await pg.waitForTimeout(250); const c = await layers();
    console.log('first check layers:', a, '| re-check layers:', c, '| sounds on re-check:', JSON.stringify(await pg.evaluate(() => window.__sfxLog.map(x => x[0]))));
  }
  // vsdo finale once
  await pg.evaluate(() => Course.go('anatomy', 4)); await pg.waitForTimeout(300);
  const boxes = await pg.$$('section[data-id="anatomy"] ol.vsdo label.vsck input');
  for (const x of boxes) { await x.click(); await pg.waitForTimeout(60); }
  await pg.waitForTimeout(200); const f1 = await pg.evaluate(() => document.querySelectorAll('.cel-fin').length);
  await pg.waitForTimeout(2800); await boxes[1].click(); await pg.waitForTimeout(80); await boxes[1].click(); await pg.waitForTimeout(250);
  const f2 = await pg.evaluate(() => document.querySelectorAll('.cel-fin').length);
  console.log('vsdo boxes:', boxes.length, '| finale first:', f1, '| finale after re-tick:', f2);
  const bags = await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('course-bag')).map(k => k + '=' + JSON.parse(localStorage.getItem(k)).q.length));
  console.log('bags:', bags.join(', '));
  // bidi C# in explanation after answer (css wins-1)
  await pg.goto('http://localhost:8812/css.html'); await pg.waitForTimeout(500);
  await pg.evaluate(() => Course.go('wins', 1)); await pg.waitForTimeout(300);
  const bd = await pg.evaluate(() => { const sp = document.querySelector('section[data-id="wins"] article.spread'); const r = [...sp.querySelectorAll('bdi[dir="ltr"]')].map(x => x.textContent); return r; });
  console.log('wins-1 isolated tokens before answer:', bd.join('|'));
  const btns = await pg.$$('section[data-id="wins"] article.spread .predict .opts button'); for (const x of btns) { await x.click(); await pg.waitForTimeout(100); }
  const bd2 = await pg.evaluate(() => [...document.querySelectorAll('section[data-id="wins"] article.spread .predict .fb bdi[dir="ltr"]')].map(x => x.textContent));
  console.log('in feedback:', bd2.join('|'), '| errors:', errs.length ? errs : 'none');
  await b.close(); })();
