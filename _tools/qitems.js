// prints the index and first 70 chars of q for each quiz item, using a real browser
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const f of process.argv.slice(2)) { const pg = await b.newPage(); await pg.route(/fonts\./, r => r.abort());
    await pg.goto('http://localhost:8812/' + f + '.html'); await pg.waitForTimeout(500);
    const r = await pg.evaluate(() => [...document.querySelectorAll('#quiz > .predict')].map(d => d.id + ' | ' + (d.querySelector('.q') || d).textContent.slice(0, 80)));
    console.log('== ' + f); r.forEach(x => console.log(x)); await pg.close(); }
  await b.close(); })();
