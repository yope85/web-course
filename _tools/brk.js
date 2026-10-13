// brk.js step-topic step-n [breakIndex] [w] -> look/brk.png : opens the step, answers predict by clicking every option until locked-free, clicks a 🔨 button
const { chromium } = require('playwright');
(async () => { const [t, n, bi, w] = process.argv.slice(2); const W = +(w||1280);
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:W,height:W<600?844:900}});
  await ctx.addInitScript(() => { try { localStorage.setItem('course-sound-noted','1'); localStorage.setItem('course-sound','off'); } catch(e){} });
  const pg = await ctx.newPage(); await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await pg.goto('http://localhost:8812/js-basics.html'); await pg.waitForTimeout(400);
  await pg.evaluate(([t,n]) => Course.go(t, +n), [t,n]); await pg.waitForTimeout(300);
  await pg.screenshot({path: __dirname+'/look/brk-before.png', fullPage:true});
  // answer predicts by trying options
  for (let k=0;k<6;k++){ const bs = await pg.$$('.spread:not([hidden]) .predict .opts button:not([disabled])'); if(!bs.length) break; for (const x of bs){ try{ await x.click({timeout:500}); }catch(e){} } await pg.waitForTimeout(150); }
  const brs = await pg.$$('.spread:not([hidden]) .jsb-brk'); console.log('breaks', brs.length);
  if (brs.length) { await brs[+(bi||0)].click(); await pg.waitForTimeout(500); }
  await pg.screenshot({path: __dirname+'/look/brk.png', fullPage:true});
  await b.close(); })();
