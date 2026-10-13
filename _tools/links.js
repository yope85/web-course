// links.js – every data-go / back / X.html#topic-N in all pages (HTML + scripts) points to a step that exists
const fs = require('fs');
const dir = '/home/claude/web-course/';
const pages = ['intro', 'html-basics', 'css', 'html-advanced', 'bootstrap', 'razor', 'submission1', 'html-css'];
const steps = {};
for (const p of pages) {
  const s = fs.readFileSync(dir + p + '.html', 'utf8');
  steps[p] = {};
  // count article.spread per section.topic in source order
  const re = /<section class="topic" data-id="([^"]+)"|<article class="spread[^"]*"/g; let m, cur = null;
  while ((m = re.exec(s))) { if (m[1]) { cur = m[1]; steps[p][cur] = 0; } else if (cur) steps[p][cur]++; }
}
const bad = [];
for (const p of pages) {
  const s = fs.readFileSync(dir + p + '.html', 'utf8');
  for (const m of s.matchAll(/data-go="([a-z0-9]+):(\d+)"/g)) if (!(steps[p][m[1]] >= +m[2])) bad.push(`${p}: data-go ${m[1]}:${m[2]}`);
  for (const m of s.matchAll(/back\s*:\s*(\[[^\]]*\]|'[^']*')/g)) for (const g of m[1].matchAll(/'([a-z0-9]+):(\d+)'/g)) if (!(steps[p][g[1]] >= +g[2])) bad.push(`${p}: back ${g[1]}:${g[2]}`);
  for (const m of s.matchAll(/data-go=\\?"([a-z0-9]+):(\d+)\\?"/g)) if (!(steps[p][m[1]] >= +m[2])) bad.push(`${p}: data-go(js) ${m[1]}:${m[2]}`);
  for (const m of s.matchAll(/([a-z0-9-]+)\.html#([a-z0-9]+)-(\d+)/g)) { const q = m[1]; if (!steps[q]) continue; if (!(steps[q][m[2]] >= +m[3])) bad.push(`${p}: xlink ${q}.html#${m[2]}-${m[3]}`); }
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, Object.entries(v).map(([a, b]) => a + ' ' + b).join(', ')])), null, 1));
console.log(bad.length ? 'BAD:\n' + [...new Set(bad)].join('\n') : 'ALL LINKS OK');
