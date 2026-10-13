const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1280,height:900}});
  await ctx.addInitScript(() => { try { localStorage.setItem('course-sound-noted','1'); } catch(e){} });
  for (const f of ['intro','html-basics','css','html-advanced','bootstrap','razor','js-basics','submission1']) {
    const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
    const errs = [], cons = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') cons.push(m.text() + ' @ ' + (m.location().url || '')); });
    await pg.goto('http://localhost:8812/' + f + '.html'); await pg.waitForTimeout(700);
    const r = await pg.evaluate(() => ({cnt: document.querySelector('#eggCount').textContent, n: [...document.querySelectorAll('.eggn')].map(x => x.textContent).join(','), note: document.querySelector('.eggnote') && document.querySelector('.eggnote').textContent.slice(0, 60)}));
    let codeRes = '';
    if (f === 'submission1') { await pg.click('#eggBtn'); await pg.fill('#codeIn', 'lostpizza.jpg'); await pg.press('#codeIn', 'Enter'); await pg.waitForTimeout(200); codeRes = await pg.textContent('#codeMsg') + ' | ' + await pg.textContent('#eggCount'); }
    console.log(f, '| count', r.cnt, '| eggn', r.n, '| errs', errs.length, errs.slice(0,2).join(' / '), '| console errors:', cons.join(' ; ').slice(0, 200), codeRes ? '| code: ' + codeRes : '');
    await pg.close();
  }
  // stale found id is pruned + hub numbers
  const pg = await ctx.newPage(); await pg.goto('http://localhost:8812/html-css.html'); await pg.waitForTimeout(400);
  console.log('hub:', await pg.textContent('#totals'));
  await b.close(); })();
