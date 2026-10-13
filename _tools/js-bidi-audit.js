// js-bidi-audit.js: every step, after clicking all options / 🔨 buttons: report Latin/digit text that is NOT isolated (would flip inside Hebrew)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1280,height:900}});
  await ctx.addInitScript(() => { try { localStorage.setItem('course-sound-noted','1'); localStorage.setItem('course-sound','off'); } catch(e){} });
  const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
  await pg.goto('http://localhost:8812/'+(process.env.PAGE||'js-basics')+'.html'); await pg.waitForTimeout(500);
  const steps = await pg.evaluate(() => [...document.querySelectorAll('section.topic')].flatMap(s => [...s.querySelectorAll('article.spread')].map((a, i) => [s.dataset.id, i + 1])));
  const seen = new Set(); let bad = 0;
  for (const [t, n] of steps) {
    await pg.evaluate(([t, n]) => Course.go(t, n), [t, n]); await pg.waitForTimeout(150);
    const sel = 'article.spread:not([hidden])';
    for (let k = 0; k < 4; k++) { const bs = await pg.$$(sel + ' .opts button:not([disabled]), ' + sel + ' .jsb-brk, ' + sel + ' .cp button'); for (const x of bs) { try { await x.click({timeout: 300}); await pg.waitForTimeout(40); } catch (e) {} } }
    const r = await pg.evaluate(sel => {
      const root = document.querySelector(sel); const out = [];
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode, v = n.nodeValue; if (!/[A-Za-z0-9]/.test(v)) continue;
        let skip = false; for (let p = n.parentElement; p && p !== root; p = p.parentElement) { if (/^(CODE|PRE|BDI|TEXTAREA|SCRIPT|STYLE|KBD|INPUT)$/.test(p.tagName) || p.dir === 'ltr' || p.classList.contains('jsb-con') || p.classList.contains('cv') || p.classList.contains('jsb-code')) { skip = true; break; } }
        if (skip) continue;
        const blk = n.parentElement.closest('p,li,td,button,div,h3,span') || n.parentElement;
        if (!/[֐-׿]/.test(blk.textContent)) continue;
        out.push(v.trim().slice(0, 90)); }
      return out; }, sel);
    r.forEach(s => { const k = t + '-' + n + ': ' + s; if (!seen.has(k)) { seen.add(k); bad++; console.log(k); } });
  }
  console.log(bad ? 'UNISOLATED: ' + bad : 'BIDI OK'); await b.close(); })();
