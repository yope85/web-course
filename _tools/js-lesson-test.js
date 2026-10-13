/* בודק את כל ארגזי הקוד בשיעור JavaScript: כל משימה עם הפתרון שלה (חייבת להצליח), וכל קוד מוצא (🔨) – מה הוא מדפיס.
   שימוש: NODE_PATH=$(npm root -g) node _tools/js-lesson-test.js [page]   (שרת על 8812) */
const { chromium } = require('playwright');
(async () => {
  const page = process.argv[2] || 'js-basics';
  const br = await chromium.launch(); const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8812/' + page + '.html'); await pg.waitForTimeout(500);
  const ids = await pg.evaluate(() => Object.keys(window.__jsbs || {}));
  let bad = 0;
  for (const id of ids) {
    const out = await pg.evaluate(async id => {
      const {box, o} = window.__jsbs[id];
      const wait = async () => { for (let k = 0; k < 90; k++) { await new Promise(r => setTimeout(r, 100)); let r = box.getResult(); if (r && r.need) { const host = document.querySelector('.jsb-ask'); const inp = host && host.querySelector('.jsb-ai'); if (inp) inp.value = id === 'jsb6' ? '5' : '3'; if (host) host.querySelector('[data-a="ok"]').click(); continue; } if (r && r.finished) return r; } return box.getResult(); };
      const rep = {id, base: null, tasks: [], breaks: []};
      box.setCode(o.code || ''); box.runIt(false); let r = await wait();
      rep.base = {logs: r.logs.slice(0, 12), errors: r.errors.map(e => e.name + ':' + e.msg), text: (r.text || '').slice(0, 60)};
      for (const t of (o.tasks || [])) {
        if (!t.solution) { rep.tasks.push({id: t.id, ok: 'no-solution'}); continue; }
        box.setCode(t.solution.code); box.runIt(false); r = await wait();
        let ok = false; try { ok = !!t.test(r) && (!r.errors.length || t.allowErrors === true); } catch (e) { ok = 'ERR ' + e; }
        // the starter must NOT already satisfy the task
        box.setCode(o.code || ''); box.runIt(false); const r0 = await wait(); let pre = false; try { pre = !!t.test(r0); } catch (e) {}
        rep.tasks.push({id: t.id, ok, starterAlreadyPasses: pre, logs: r.logs.slice(0, 8)});
      }
      for (const b of (o.breaks || [])) {
        const base = o.code; const code = typeof b.apply === 'function' ? b.apply(base) : base.replace(b.from, b.to);
        box.setCode(code); box.runIt(false); r = await wait();
        rep.breaks.push({label: b.label, changed: code !== base, logs: r.logs.slice(0, 8), errors: r.errors.map(e => e.name + ':' + e.msg), loop: r.loop});
      }
      return rep;
    }, id);
    const flag = out.tasks.some(t => t.ok !== true) || out.tasks.some(t => t.starterAlreadyPasses) || out.breaks.some(b => !b.changed);
    if (flag) bad++;
    console.log((flag ? '✘ ' : '✔ ') + id, JSON.stringify(out));
  }
  console.log('PAGE ERRORS:', errs.length ? errs : 'none'); console.log(bad ? bad + ' boxes with problems' : 'ALL BOXES OK');
  await br.close();
})();
