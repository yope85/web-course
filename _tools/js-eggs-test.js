/* בודק שכל ביצי שיעור JavaScript 1 נמצאות: ארבע דרך ארגזי הקוד, אחת דרך הקוד הסודי שבקונסול. */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.addInitScript(() => { try { localStorage.setItem('course-sound-noted', '1'); localStorage.setItem('course-sound', 'off'); } catch (e) {} });
  const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
  const logs = []; pg.on('console', m => logs.push(m.text()));
  await pg.goto('http://localhost:8812/js-basics.html'); await pg.waitForTimeout(600);
  const run = async (id, code) => pg.evaluate(async ([id, code]) => { const {box} = window.__jsbs[id]; box.setCode(code); box.runIt(false); for (let k = 0; k < 50; k++) { await new Promise(r => setTimeout(r, 100)); const r = box.getResult(); if (r && r.finished) break; } }, [id, code]);
  console.log('start', await pg.textContent('#eggCount'));
  await run('jsb5', 'console.log("5" * "פיצה");'); console.log('nan', await pg.textContent('#eggCount'));
  await run('jsb5', 'console.log(0.1 + 0.2);'); console.log('float', await pg.textContent('#eggCount'));
  await run('jsb5', 'console.log(typeof null);'); console.log('typenull', await pg.textContent('#eggCount'));
  await run('jsb12', 'let i = 0;\nwhile (true) {\n  i = i + 0;\n}'); console.log('loop', await pg.textContent('#eggCount'));
  console.log('console banner:', logs.filter(t => /DANI/.test(t)).length ? 'has DANI' : 'MISSING');
  await pg.click('#eggBtn'); await pg.fill('#codeIn', 'DANI'); await pg.press('#codeIn', 'Enter'); await pg.waitForTimeout(300);
  console.log('code', await pg.textContent('#eggCount'), '|', await pg.textContent('#codeMsg'));
  await b.close();
})();
