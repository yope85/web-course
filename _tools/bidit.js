const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const pg = await b.newPage(); await pg.route(/fonts\./, r => r.abort());
  await pg.goto('http://localhost:8812/css.html'); await pg.waitForTimeout(500);
  await pg.evaluate(() => Course.go('wins', 1)); await pg.waitForTimeout(300);
  const btns = await pg.$$('section[data-id="wins"] article.spread .predict .opts button');
  for (const x of btns) { await x.click(); await pg.waitForTimeout(150);
    const r = await pg.evaluate(() => { const fb = document.querySelector('section[data-id="wins"] article.spread .predict .fb'); return fb.innerHTML.slice(0, 300); }); console.log(r.includes('C#') ? 'HAS C#: ' + (r.match(/.{0,30}C#.{0,10}/) || [''])[0] : '-'); }
  await b.close(); })();
