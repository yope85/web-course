// dump.js <page> [...]  -> tools/dump/<page>.txt : full text of every step, incl. hidden parts
const { chromium } = require('playwright');
const fs = require('fs');
const pages = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  fs.mkdirSync(__dirname + '/dump', { recursive: true });
  for (const p of pages) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('course-sound-noted', '1'); } catch (e) {} });
    const pg = await ctx.newPage();
    await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await pg.goto('http://localhost:8812/' + p + '.html', { waitUntil: 'load' });
    await pg.waitForTimeout(800);
    const out = await pg.evaluate(() => {
      const BLOCK = /^(P|DIV|LI|H1|H2|H3|H4|H5|TR|PRE|SECTION|ARTICLE|UL|OL|TABLE|DETAILS|SUMMARY|BLOCKQUOTE|FIGURE|FIGCAPTION|DL|DT|DD|HR|BR|FORM|LABEL)$/;
      function walk(n, acc, hid) {
        if (n.nodeType === 3) { acc.push(n.textContent.replace(/\s+/g, ' ')); return; }
        if (n.nodeType !== 1) return;
        const t = n.tagName;
        if (t === 'SCRIPT' || t === 'STYLE') return;
        if (t === 'IFRAME') { acc.push(' [iframe] '); return; }
        if (t === 'IMG') { acc.push(' [img alt="' + (n.getAttribute('alt') || '') + '"] '); return; }
        if (t === 'TEXTAREA' || t === 'INPUT') { const v = n.value || n.getAttribute('placeholder') || ''; acc.push(' [' + t.toLowerCase() + (n.type ? ':' + n.type : '') + (v ? ' = ' + v.slice(0, 400) : '') + '] '); return; }
        const isHid = n.hasAttribute('hidden');
        const blk = BLOCK.test(t);
        if (blk) acc.push('\n');
        if (t === 'BUTTON') acc.push('[כפתור: ');
        if (t === 'SUMMARY') acc.push('▸ ');
        if (t === 'CODE' && n.parentElement && n.parentElement.tagName !== 'PRE') acc.push('`');
        if (isHid && !hid) acc.push('⟦מוסתר: ');
        if (t === 'PRE' || n.classList.contains('cv')) { const ls = n.querySelectorAll('.ln'); acc.push('\n```\n' + (ls.length ? [...ls].map(x => x.textContent).join('\n') : n.textContent).trim() + '\n```\n'); }
        else for (const c of n.childNodes) walk(c, acc, hid || isHid);
        if (isHid && !hid) acc.push('⟧');
        if (t === 'CODE' && n.parentElement && n.parentElement.tagName !== 'PRE') acc.push('`');
        if (t === 'BUTTON') acc.push(']');
        if (blk) acc.push('\n');
      }
      const res = [];
      const head = document.querySelector('header, .hero, .top');
      res.push('# ' + document.title);
      document.querySelectorAll('section.topic').forEach(sec => {
        res.push('\n\n======== נושא: ' + sec.dataset.title + ' (' + sec.dataset.id + ') ========');
        const steps = [...sec.querySelectorAll(':scope > article, :scope article.spread')].filter((a, i, arr) => arr.indexOf(a) === i);
        steps.forEach((a, i) => {
          const acc = []; for (const c of a.childNodes) walk(c, acc, false);
          const txt = acc.join('').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
          res.push('\n----- #' + sec.dataset.id + '-' + (i + 1) + ' [' + [...a.classList].join(' ') + '] -----\n' + txt);
        });
      });
      return res.join('\n');
    });
    // inline scripts (quiz/checkpoint/playground data with hints & whys)
    const html = fs.readFileSync('/home/claude/web-course/' + p + '.html', 'utf8');
    const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1].trim()).filter(Boolean);
    fs.writeFileSync(__dirname + '/dump/' + p + '.txt', out + '\n\n\n======== סקריפטים בדף (נתוני שאלות/רמזים/הסברים) ========\n' + scripts.join('\n\n/* ---- */\n\n'));
    console.log(p, out.length, 'chars text;', scripts.join('').length, 'chars script');
    await ctx.close();
  }
  await b.close();
})();
