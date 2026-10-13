/* בודק את ארגז החול של JavaScript (Course.jsbox): log, שגיאות, שורות, prompt, alert, לולאה אינסופית, document.write */
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8812/_tools/jsbox-test.html');
  const cases = [
    ['log', `console.log("hi");\nconsole.log(5 + 3, "5" + "3", "5" * "3");`],
    ['refErr', `let a = 1;\nconsole.log(a);\nconsole.log(b);`],
    ['syntax', `let a = 1;\nconsole.log("x";\n`],
    ['alert', `alert("שלום");\nconsole.log("after");`],
    ['prompt', `let n = prompt("מספר?");\nconsole.log(typeof n, n);`],
    ['loop', `let i = 0;\nwhile (true) {\n  i++;\n}\nconsole.log("never");`],
    ['write', `document.write("<b>hi</b>");`],
    ['const', `const x = 1;\nx = 2;`],
    ['strloop', `console.log("while (true) {");\nfor (let i = 0; i < 3; i++) { console.log(i); }`],
    ['nan', `console.log(0 / 0, parseInt("פיצה"), 1 / 0, [1, NaN], -0);\ndocument.write("a<br>b");`],
    ['bl1', `while(true);\nconsole.log("never");`],
    ['bl2', `let i = 0;\nwhile (i < 3);\nconsole.log("never");`],
    ['bl3', `for(;;);\nconsole.log("never");`],
    ['bl4', `let i = 0;\nwhile (i < 3) console.log(i++);\nconsole.log("done");`],
    ['regex', `var r = /"/;\nfor (let i = 0; i < 2; i++) console.log("a" + i);\nconsole.log(r.test('"'));`],
  ];
  for (const [name, code] of cases) {
    const out = await pg.evaluate(async ([name, code]) => {
      const host = document.createElement('div'); host.id = 'c-' + name; document.getElementById('b').appendChild(host);
      const box = Course.jsbox(host, {id: name, code});
      box.run();
      for (let k = 0; k < 80; k++) { await new Promise(r => setTimeout(r, 100)); const r = box.getResult(); if (r && (r.finished || r.need)) break; }
      let r = box.getResult();
      if (r && r.need) { host.querySelector('.jsb-ai').value = '7'; host.querySelector('[data-a="ok"]').click(); for (let k = 0; k < 80; k++) { await new Promise(r => setTimeout(r, 100)); r = box.getResult(); if (r && r.finished) break; } }
      return {logs: r.logs, alerts: r.alerts, prompts: r.prompts, errors: r.errors, text: r.text, console: [...host.querySelectorAll('.jsb-row')].map(x => x.textContent), help: [...host.querySelectorAll('.jsb-help')].map(x => x.textContent.slice(0, 90))};
    }, [name, code]);
    console.log('==', name, JSON.stringify(out));
  }
  console.log('PAGE ERRORS:', errs.length ? errs : 'none');
  await br.close();
})();
