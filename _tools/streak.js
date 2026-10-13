// streak.js – long streak: cheer bubble milestones (3, 5, 10, 15, 20) and the streak counter
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('course-sound-noted','1'); localStorage.setItem('course-sound','off'); });
  const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort()); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('http://localhost:8812/css.html'); await pg.waitForTimeout(400);
  const out = await pg.evaluate(async () => { const r = []; const el = document.querySelector('article.spread');
    for (let i = 1; i <= 21; i++) { Course.celebrate(el, 'small'); await new Promise(z => setTimeout(z, 120));
      const c = [...document.querySelectorAll('.cel-cheer')].map(x => x.textContent).pop();
      if ([3, 4, 5, 10, 15, 20].includes(i)) r.push(i + ':' + (c || '?') + ':' + Course.SFX.streak()); }
    return r; });
  console.log(out.join(' | '), errs); await b.close(); })();
