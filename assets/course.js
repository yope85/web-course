/* =====================================================================
   course.js – the shared engine of the interactive course
   Every lesson page = content (topics > steps) + a small lesson script.
   This file gives: theme, progress, code highlighting, live mini-pages
   (Stage / Split / Frame), segmented buttons, guess questions,
   playground with auto-checked tasks, quiz, easter eggs, and the
   "course player" (one step at a time, topic tabs, deep links).
   ===================================================================== */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const LESSON = document.body.dataset.lesson || 'lesson';
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(LESSON + '-' + k)); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(LESSON + '-' + k, JSON.stringify(v)); } catch(e){} }
};
const state = store.get('state') || {};
const saveHooks = [];
let T = [];
function save(){ if (T.length) paintProgress(); saveHooks.forEach(f => { try { f(); } catch(e){} }); store.set('state', state); }

/* ---------- theme (shared across lessons) ---------- */
function getTheme(){ try { return localStorage.getItem('course-theme'); } catch(e){ return null; } }
const savedTheme = getTheme() || store.get('theme'); if (savedTheme) document.documentElement.dataset.theme = savedTheme;
const themeBtn = $('#themeBtn');
if (themeBtn) themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = next;
  try { localStorage.setItem('course-theme', next); } catch(e){}
});

/* ---------- syntax highlight ---------- */
const HE = /[֐-׿]/;
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function hlHtmlLine(line){
  const cont = !line.includes('<') && line.match(/^(\s+)([a-z-]+:[^"]*)("?\s*\/?>?)$/);
  if (cont) return cont[1] + '<span class="t-str">' + esc(cont[2]) + '</span>' + '<span class="t-str">' + esc(cont[3].replace(/\s*\/?>$/, '')) + '</span>' + esc(cont[3].replace(/^"?/, ''));
  let out = ''; const re = /<!--[\s\S]*?-->|<[^>]*>?|[^<]+/g; let m;
  while ((m = re.exec(line))) {
    const t = m[0];
    if (t.startsWith('<!--')) out += '<span class="t-cm">' + (HE.test(t) ? '<span class="he">' + esc(t) + '</span>' : esc(t)) + '</span>';
    else if (t[0] === '<') {
      let e = esc(t);
      e = e.replace(/([a-zA-Z-]+)=(&quot;|")([^"]*)"/g, (x, an, q, av) => '<span class="t-attr">' + an + '</span>=<span class="t-str">"' + (HE.test(av) ? '<span class="he">' + av + '</span>' : av) + '"</span>');
      e = e.replace(/ ([a-zA-Z-]+)="([^"]*)$/, (x, an, av) => ' <span class="t-attr">' + an + '</span>=<span class="t-str">"' + av + '</span>');
      e = e.replace(/^(&lt;\/?)([a-zA-Z0-9!]+)/, '$1<span class="t-tag">$2</span>');
      out += e;
    } else out += HE.test(t) ? t.replace(/^(\s*)(.*?)(\s*)$/, (x,a,b,c) => a + '<span class="he">' + esc(b) + '</span>' + c) : esc(t);
  }
  return out;
}
function hlCssLine(line){
  if (/\/\*/.test(line)) return '<span class="t-cm">' + esc(line) + '</span>';
  if (line.includes('{')) { const i = line.indexOf('{'); return '<span class="t-sel">' + esc(line.slice(0,i)) + '</span>' + esc(line.slice(i)); }
  const m = line.match(/^(\s*)([a-zA-Z-]+)(\s*:\s*)([^;]*)(;?)(.*)$/);
  if (m) return m[1] + '<span class="t-prop">' + m[2] + '</span>' + esc(m[3]) + '<span class="t-val">' + esc(m[4]) + '</span>' + m[5] + esc(m[6]);
  return esc(line);
}
function hlPlainLine(line){ return HE.test(line) ? '<span class="he">' + esc(line) + '</span>' : esc(line); }
function codeLines(pre, src, kind, marks){
  marks = marks || {};
  const f = kind === 'css' ? hlCssLine : kind === 'text' ? hlPlainLine : hlHtmlLine;
  pre.innerHTML = src.split('\n').map((l,i) => '<span class="ln' + (marks[i] ? ' ' + marks[i] : '') + '" data-i="' + i + '">' + (f(l) || ' ') + '</span>').join('');
  return pre;
}
/* <pre class="cv" data-code="html|css|text"> with raw text inside -> highlighted (marks via data-marks="3:new,4:new") */
function autoCode(root){
  (root || document).querySelectorAll('pre[data-code]').forEach(pre => {
    if (pre.dataset.done) return; pre.dataset.done = '1';
    const raw = pre.textContent.replace(/^\n/, '').replace(/\s+$/, '');
    const marks = {}; (pre.dataset.marks || '').split(',').filter(Boolean).forEach(p => { const [i, m] = p.split(':'); marks[+i - 1] = m || 'new'; });
    pre.classList.add('cv'); codeLines(pre, raw, pre.dataset.code, marks);
  });
}
function wireCopy(root){
  (root || document).querySelectorAll('.codeblock .copy').forEach(b => {
    if (b.dataset.wired) return; b.dataset.wired = '1';
    b.addEventListener('click', async () => {
      const t = b.parentElement.querySelector('pre').innerText;
      try { await navigator.clipboard.writeText(t); b.textContent = 'הועתק ✔'; } catch(e){ b.textContent = 'סמנו והעתיקו'; }
      setTimeout(() => b.textContent = 'העתקה', 1500);
    });
  });
}

/* ---------- live stage (shadow DOM = isolated mini page) ---------- */
const PIZZA_IMG = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='47' fill='#e9a23b'/><circle cx='50' cy='50' r='40' fill='#d9472b'/><circle cx='50' cy='50' r='37' fill='#f6d365'/><circle cx='35' cy='38' r='6' fill='#c0392b'/><circle cx='63' cy='35' r='6' fill='#c0392b'/><circle cx='59' cy='63' r='6' fill='#c0392b'/><circle cx='36' cy='64' r='5' fill='#c0392b'/><circle cx='48' cy='50' r='3' fill='#2d6a2d'/><circle cx='71' cy='51' r='3' fill='#2d6a2d'/></svg>");
const IMAGES = { 'pizza.jpg': PIZZA_IMG };
function fakeImg(label, bg, fg){ return "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 110'><rect width='160' height='110' rx='10' fill='" + (bg || '#bfdbfe') + "'/><text x='80' y='64' font-family='Arial' font-size='22' text-anchor='middle' fill='" + (fg || '#1e3a8a') + "'>" + label + "</text></svg>"); }
function resolveImgs(src){ return src.replace(/(src=")(?:\.\.\/)?(?:Img|img)\/([A-Za-z0-9_.-]+)"/g, (x, a, f) => a + (IMAGES[f] || fakeImg(f.replace(/\.[a-z]+$/,''))) + '"'); }
const BASE_CSS = ':host{display:block}:host([hidden]){display:none}x-page{display:block;background:#fff;color:#111;padding:12px 16px;font-family:Rubik,Arial,sans-serif;font-size:16px;line-height:1.5;direction:rtl;min-height:40px}' +
  '.hit{outline:3px solid #f43f5e!important;outline-offset:2px}.peek{outline:2px dashed #2f6fec;outline-offset:2px}' +
  'x-page.boxes *{outline:2px dashed #f97316;outline-offset:-2px;background-color:rgba(249,115,22,.07)}x-page.boxes *::before{content:attr(data-tag);font:11px monospace;color:#c2410c;background:#fff7ed;padding:0 4px;margin-inline-end:6px;border-radius:3px}x-page.boxes div{outline:3px solid #7c3aed;outline-offset:3px;background-color:rgba(124,58,237,.10)}x-page.boxes div::before{display:block;width:max-content;color:#fff;background:#7c3aed;font-weight:bold;margin-bottom:4px}' +
  'x-page.kinds [data-kind="block"]{outline:2px dashed #2563eb;outline-offset:-2px;background-color:rgba(37,99,235,.06)}x-page.kinds [data-kind="inline"]{outline:2px dashed #db2777;outline-offset:0;background-color:rgba(219,39,119,.10)}';
const INLINE_TAGS = /^(a|span|b|strong|i|em|img|br|label|input|button|select|textarea|code|small|u|sup|sub)$/;
function mapCss(css){ return css.replace(/(^|[\s,}])body(?=[\s,{:.])/g, '$1x-page'); }
class Stage {
  constructor(host){
    this.root = host.attachShadow({mode:'open'});
    this.root.innerHTML = '<style>' + BASE_CSS + '</style><style class="u"></style><x-page></x-page>';
    this.page = this.root.querySelector('x-page'); this.u = this.root.querySelector('style.u');
    // links inside a mini page never navigate away
    this.page.addEventListener('click', e => { const a = e.target.closest('a'); if (a) { e.preventDefault(); if (this.onLink) this.onLink(a); } });
    this.page.addEventListener('submit', e => { e.preventDefault(); if (this.onSubmit) this.onSubmit(e.target); });
  }
  html(src){ this.page.innerHTML = resolveImgs(src); this.all().forEach(e => { const t = e.tagName.toLowerCase(); e.dataset.tag = t; e.dataset.kind = INLINE_TAGS.test(t) ? 'inline' : 'block'; }); return this; }
  css(src){ this.u.textContent = mapCss(src || ''); return this; }
  all(){ return [...this.page.querySelectorAll('*')]; }
}
/* Split: code (HTML [+CSS]) beside the live result, with line <-> element linking */
class Split {
  constructor(el, o){
    o = o || {};
    this.el = el; el.classList.add('split');
    el.innerHTML = '<div class="pane"><div class="pane-h"><span class="dot"></span>' + (o.htmlTitle || 'HTML') + '</div><pre class="cv h"></pre>' +
      '<div class="cssw" hidden><div class="pane-h"><span class="dot"></span>' + (o.cssTitle || 'CSS – בתוך תגית style') + '</div><pre class="cv c"></pre></div></div>' +
      '<div class="pane"><div class="pane-h"><span class="dot"></span>' + (o.resultTitle || 'מה רואים בדפדפן') + '</div><div class="host"></div><div class="res-note"></div></div>';
    this.hPre = el.querySelector('pre.h'); this.cPre = el.querySelector('pre.c'); this.cssw = el.querySelector('.cssw');
    this.note = el.querySelector('.res-note');
    this.stage = new Stage(el.querySelector('.host'));
    this.hPre.addEventListener('mouseover', e => { const ln = e.target.closest('.ln'); this.peek(ln ? +ln.dataset.i : -1); });
    this.hPre.addEventListener('mouseleave', () => this.peek(-1));
    this.stage.page.addEventListener('mouseover', e => { const t = e.target.closest('[data-ln]'); this.peek(t ? +t.dataset.ln : -1); });
    this.stage.page.addEventListener('mouseleave', () => this.peek(-1));
  }
  setHtml(src, marks){
    this.src = src; codeLines(this.hPre, src, 'html', marks);
    this.stage.html(src);
    // k-th opening tag in the source <-> k-th element in document order
    const lineOf = []; src.split('\n').forEach((l,i) => { const m = l.replace(/<!--[\s\S]*?-->/g,'').match(/<[a-zA-Z][a-zA-Z0-9]*/g); if (m) m.forEach(() => lineOf.push(i)); });
    this.stage.all().forEach((e,k) => { e.dataset.ln = lineOf[k]; });
    return this;
  }
  setCss(css, marks){
    this.cssSrc = css || '';
    this.cssw.hidden = !css; if (css) codeLines(this.cPre, css, 'css', marks);
    this.stage.css(css); return this;
  }
  peek(i){
    this.hPre.querySelectorAll('.ln.peek').forEach(x => x.classList.remove('peek'));
    this.stage.page.querySelectorAll('.peek').forEach(x => x.classList.remove('peek'));
    if (i < 0) return;
    const els = this.stage.all().filter(e => +e.dataset.ln === i);
    if (!els.length) return;
    els.forEach(e => e.classList.add('peek'));
    const ln = this.hPre.querySelector('.ln[data-i="' + i + '"]'); if (ln) ln.classList.add('peek');
  }
  highlight(sel){
    this.hPre.querySelectorAll('.ln.hit').forEach(x => x.classList.remove('hit'));
    this.stage.page.querySelectorAll('.hit').forEach(x => x.classList.remove('hit'));
    if (!sel) return [];
    let list; try { list = [...this.stage.page.querySelectorAll(sel)]; } catch(e){ return null; }
    list.forEach(e => { e.classList.add('hit'); const ln = this.hPre.querySelector('.ln[data-i="' + e.dataset.ln + '"]'); if (ln) ln.classList.add('hit'); });
    return list;
  }
  say(html){ this.note.innerHTML = html || ''; }
}
/* Frame: a real mini browser (iframe) – for things that need a real viewport:
   Bootstrap breakpoints, forms that submit, full pages with <head>. */
function frameDoc(o){
  const links = (o.links || []).map(h => '<link rel="stylesheet" href="' + h + '">').join('');
  const scripts = (o.scripts || []).map(h => '<script src="' + h + '"><\/script>').join('');
  return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + links +
    '<style>body{font-family:Rubik,Arial,sans-serif;margin:0;padding:12px;background:#fff;color:#111}' + (o.css || '') + '</style></head><body>' + resolveImgs(o.html || '') + scripts + '</body></html>';
}
class Frame {
  constructor(host, o){
    o = o || {};
    this.wrap = document.createElement('div'); this.wrap.className = 'framewrap';
    this.bar = document.createElement('div'); this.bar.className = 'urlbar'; this.bar.innerHTML = '<span class="dots"><i></i><i></i><i></i></span><span class="url" dir="ltr"></span>';
    this.iframe = document.createElement('iframe'); this.iframe.className = 'mini'; this.iframe.title = o.title || 'תצוגה חיה';
    this.iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms');
    if (o.height) this.iframe.style.height = o.height + 'px';
    this.wrap.append(this.bar, this.iframe); host.appendChild(this.wrap);
    this.url(o.url || 'localhost:7123/HTML/page.html');
    this.onLoad = null;
    this.iframe.addEventListener('load', () => { if (this.onLoad) { let d = null; try { d = this.iframe.contentDocument; } catch(e){} if (d) this.onLoad(d); } });
  }
  url(u){ this.bar.querySelector('.url').textContent = u; return this; }
  show(o){ this.iframe.srcdoc = frameDoc(o); return this; }
  width(px){ this.iframe.style.width = px ? px + 'px' : '100%'; return this; }
}

/* ---------- small UI helpers ---------- */
function seg(el, options, onPick, start){
  el.innerHTML = ''; const btns = [];
  options.forEach((o,i) => {
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = o.label || o;
    if (o.mono) b.className = 'chip';
    b.addEventListener('click', () => pick(i)); el.appendChild(b); btns.push(b);
  });
  function pick(i){ btns.forEach((b,j) => b.setAttribute('aria-pressed', i === j)); onPick(options[i], i); }
  pick(start || 0); return pick;
}
const predicts = [];
function predict(el, o){
  if (typeof el === 'string') el = $(el);
  predicts.push(el.id);
  if (o.quiz) el.classList.add('quiz');
  el.innerHTML = '<div class="q">' + o.q + '</div><div class="opts"></div><div class="fb" hidden></div>';
  const opts = el.querySelector('.opts'), fb = el.querySelector('.fb');
  const bs = o.opts.map((t,i) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = t; b.addEventListener('click', () => answer(i)); opts.appendChild(b); return b; });
  function answer(i, silent){
    const ok = i === o.correct;
    bs[i].classList.add(ok ? 'right' : 'wrong');
    fb.hidden = false; fb.className = 'fb ' + (ok ? 'right' : 'wrong');
    fb.innerHTML = (ok ? '✔ נכון! ' : '✘ לא בדיוק. ') + (o.why[i] || '') + (ok ? '' : ' נסו שוב.');
    if (ok) { el.classList.add('solved'); bs.forEach(b => b.disabled = true); if (!silent) { state[el.id] = true; save(); } if (o.onCorrect) o.onCorrect(); }
  }
  if (state[el.id]) answer(o.correct, true);
}
function quiz(container, list){
  if (typeof container === 'string') container = $(container);
  list.forEach((qq,i) => { const d = document.createElement('div'); d.className = 'predict'; d.id = 'q' + (i+1); container.appendChild(d); predict(d, Object.assign({quiz:true}, qq, {q:(i+1) + '. ' + qq.q})); });
}
/* "I did it" checkbox that is remembered */
function doneCheck(el, key){
  if (typeof el === 'string') el = $(el);
  el.checked = !!state[key]; el.addEventListener('change', () => { state[key] = el.checked; save(); });
}

/* ---------- playground: editors + live preview + auto-checked tasks ---------- */
function playground(container, o){
  if (typeof container === 'string') container = $(container);
  const id = o.id || 'pg';
  container.innerHTML = '<div class="pg"><div class="editor">' +
    '<span class="lbl">' + (o.htmlLabel || 'HTML') + '</span><textarea class="edH" spellcheck="false" aria-label="עורך HTML"></textarea>' +
    (o.css !== undefined ? '<span class="lbl">' + (o.cssLabel || 'CSS – style.css') + '</span><textarea class="edC" spellcheck="false" aria-label="עורך CSS"></textarea>' : '') +
    '<div><button class="btn reset" type="button">↺ התחלה מחדש</button></div></div>' +
    '<div><div class="pg-frame"></div></div></div><ul class="tasks"></ul>';
  const edH = container.querySelector('.edH'), edC = container.querySelector('.edC');
  const frame = new Frame(container.querySelector('.pg-frame'), {url: o.url || 'localhost:7123/HTML/test.html', height: o.height || 440});
  const tasksBox = container.querySelector('.tasks');
  const done = (state.tasks = state.tasks || {});
  const key = t => id + ':' + t.id;
  (o.tasks || []).forEach((t,i) => {
    const li = document.createElement('li'); li.dataset.k = key(t);
    li.innerHTML = '<span class="st">' + (i+1) + '</span><div>' + t.text + (t.manual ? ' <label style="margin-inline-start:6px;white-space:nowrap"><input type="checkbox" data-manual="1" /> עובד אצלי</label>' : '') + '</div>';
    const cb = li.querySelector('[data-manual]');
    if (cb) { cb.checked = !!done[key(t)]; cb.addEventListener('change', () => { done[key(t)] = cb.checked; save(); }); }
    tasksBox.appendChild(li);
  });
  function paint(){ (o.tasks || []).forEach((t,i) => { const li = tasksBox.children[i]; const ok = !!done[key(t)]; li.classList.toggle('done', ok); li.querySelector('.st').textContent = ok ? '✔' : (i+1); }); }
  saveHooks.push(paint);
  function render(){ frame.show({html: edH.value, css: edC ? edC.value.replace(/<\/style/gi,'') : '', links: o.links || []}); }
  frame.onLoad = d => {
    (o.tasks || []).forEach(t => { if (!t.manual) { let ok = false; try { ok = !!t.test(d, d.defaultView); } catch(e){} if (ok && !done[key(t)]) { done[key(t)] = true; if (o.onTask) o.onTask(t); } } });
    if (o.onRender) try { o.onRender(d, edH.value, edC && edC.value); } catch(e){}
    save();
  };
  let timer; const sched = () => { clearTimeout(timer); timer = setTimeout(() => { store.set('code-' + id, {h:edH.value, c:edC ? edC.value : ''}); render(); }, 350); };
  [edH, edC].filter(Boolean).forEach(t => {
    t.addEventListener('input', sched);
    t.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); t.setRangeText('    ', t.selectionStart, t.selectionEnd, 'end'); sched(); } });
  });
  const saved = store.get('code-' + id);
  edH.value = saved ? saved.h : o.html; if (edC) edC.value = saved ? saved.c : o.css;
  container.querySelector('.reset').addEventListener('click', () => { edH.value = o.html; if (edC) edC.value = o.css; store.set('code-' + id, null); render(); });
  render(); paint();
  return {edH, edC, frame, render};
}

/* ---------- toast + celebration ---------- */
function toast(html){ const t = $('#toast'); if (!t) return; t.innerHTML = html; t.classList.add('show'); clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 4200); }
function party(){
  const p = $('#party'); if (!p) return; const em = ['🍕','🥚','🎉','🍕','⭐'];
  for (let i = 0; i < 45; i++) { const s = document.createElement('span'); s.textContent = em[i % em.length]; s.style.left = Math.random() * 100 + '%'; s.style.animationDuration = (2.5 + Math.random() * 2.5) + 's'; s.style.animationDelay = Math.random() * 1.5 + 's'; p.appendChild(s); }
  setTimeout(() => p.innerHTML = '', 7000);
}

/* ---------- easter eggs ---------- */
let EGGS = [];
const found = state.eggs || {}; const hints = state.hints || {};
function paintEggs(){
  const n = EGGS.filter(e => found[e.id]).length;
  $('#eggCount').textContent = n + '/' + EGGS.length;
  $('#eggIntro').innerHTML = n === EGGS.length ? '🏆 <b>מצאתם את כל הביצים!</b> סקרנות היא התכונה הכי חשובה של מפתחים – ויש לכם אותה.' : 'בדף מוחבאות ' + EGGS.length + ' ביצים. כל אחת נמצאת בעזרת משהו שלומדים בשיעור. תקועים? לחצו על "רמז נוסף".';
  $('#eggList').innerHTML = EGGS.map(e => found[e.id]
    ? '<li class="found"><b>' + e.icon + ' ' + e.name + ' ✔</b>' + e.learn + '</li>'
    : '<li><b>❓ ביצה נסתרת</b>' + e.h1 + (hints[e.id] ? '<span class="h2">💡 ' + e.h2 + '</span>' : '<br><button class="hintbtn" type="button" data-hint="' + e.id + '">רמז נוסף</button>') + '</li>').join('');
}
function findEgg(id){
  if (found[id] || !EGGS.some(x => x.id === id)) return;
  found[id] = true; state.eggs = found; save(); paintEggs();
  const e = EGGS.find(x => x.id === id), n = EGGS.filter(x => found[x.id]).length;
  toast(e.icon + ' מצאתם ביצה: <b>' + e.name + '</b> (' + n + '/' + EGGS.length + ')' + (n === EGGS.length ? ' – כולן! 🏆' : ''));
  const b = $('#eggBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  if (n === EGGS.length) party();
}
function initEggs(eggs, consoleLines){
  EGGS = eggs || []; state.eggTotal = EGGS.length;
  window.__egg = findEgg;
  $('#eggBtn').addEventListener('click', () => { paintEggs(); $('#codeMsg').textContent = ''; try { $('#eggDlg').showModal(); } catch(e){ $('#eggDlg').setAttribute('open',''); } });
  $('#eggClose').addEventListener('click', () => $('#eggDlg').close());
  $('#eggDlg').addEventListener('click', e => { if (e.target === $('#eggDlg')) $('#eggDlg').close(); });
  $('#eggList').addEventListener('click', e => { const b = e.target.closest('[data-hint]'); if (b) { hints[b.dataset.hint] = true; state.hints = hints; save(); paintEggs(); } });
  $('#codeForm').addEventListener('submit', e => {
    e.preventDefault();
    let v = ''; try { v = btoa($('#codeIn').value.trim().toUpperCase()); } catch(err){}
    const egg = EGGS.find(x => x.code && x.code === v);
    if (egg) { const was = found[egg.id]; findEgg(egg.id); $('#codeMsg').innerHTML = was ? 'את הביצה הזו כבר מצאתם 🙂' : '✔ נכון!'; $('#codeIn').value = ''; }
    else $('#codeMsg').innerHTML = '<span class="err">הקוד לא נכון. בדקו שוב 🙂</span>';
  });
  if (consoleLines) { console.log('%c' + consoleLines[0], 'font-size:22px;font-weight:bold;color:#e67e22'); console.log('%c' + consoleLines[1], 'font-size:14px;color:#2f6fec;line-height:1.6'); }
  const polls = EGGS.filter(e => e.poll);
  if (polls.length) setInterval(() => polls.forEach(e => { if (!found[e.id]) { let ok = false; try { ok = e.poll(); } catch(err){} if (ok) findEgg(e.id); } }), 1500);
  paintEggs();
}

/* ---------- course player: topics -> steps, one step at a time ---------- */
const stepTitle = st => { const h = st.querySelector('h3'); if (!h) return ''; const c = h.cloneNode(true); const sn = c.querySelector('.sn'); if (sn) sn.remove(); return c.textContent.trim(); };
const escA = x => esc(x).replace(/"/g,'&quot;');
let pos = {ti:0, si:0};
function show(ti, si, scroll){
  ti = Math.max(0, Math.min(T.length - 1, ti)); si = Math.max(0, Math.min(T[ti].steps.length - 1, si));
  pos = {ti, si};
  T.forEach((t,a) => { t.el.hidden = a !== ti; t.steps.forEach((st,b) => st.hidden = !(a === ti && b === si)); });
  state.seen[T[ti].id + ':' + si] = true; state.pos = pos; save();
  $('#topics').innerHTML = T.map((t,a) => '<button type="button" data-t="' + a + '"' + (a === ti ? ' aria-current="true"' : '') + (t.steps.every((x,b) => state.seen[t.id + ':' + b]) ? ' class="done"' : '') + '><span class="ic">' + t.icon + '</span><bdi>' + t.title + '</bdi></button>').join('');
  $('#steps').innerHTML = T[ti].steps.map((st,b) => '<button type="button" data-s="' + b + '"' + (b === si ? ' aria-current="true"' : '') + (state.seen[T[ti].id + ':' + b] ? ' class="seen"' : '') + ' title="' + escA(stepTitle(st)) + '"><span class="k">' + (b+1) + '</span><bdi>' + esc(stepTitle(st)) + '</bdi></button>').join('');
  const prev = si > 0 ? [ti, si-1] : ti > 0 ? [ti-1, T[ti-1].steps.length - 1] : null;
  const next = si < T[ti].steps.length - 1 ? [ti, si+1] : ti < T.length - 1 ? [ti+1, 0] : null;
  const label = (p, isNext) => {
    const st = T[p[0]].steps[p[1]], other = p[0] !== ti;
    const top = isNext ? (ti === 0 && si === 0 ? 'בואו נתחיל ←' : other ? 'לנושא הבא: ' + T[p[0]].title + ' ←' : 'הבא ←') : (other ? '→ לנושא הקודם' : '→ הקודם');
    return '<small>' + top + '</small><bdi>' + esc(stepTitle(st)) + '</bdi>';
  };
  const nextLesson = document.body.dataset.next, nextName = document.body.dataset.nextName;
  $('#stepnav').innerHTML = (prev ? '<button type="button" class="prev">' + label(prev, false) + '</button>' : '<span></span>') +
    (next ? '<button type="button" class="next">' + label(next, true) + '</button>' :
      '<div class="what finish" style="margin:0">🎉 סיימתם את ' + esc(document.body.dataset.title || 'השיעור') + '! ' +
      (EGGS.length && !EGGS.every(e => found[e.id]) ? 'עוד לא מצאתם את כל הביצים? <a href="#" id="openEggs">רמזים כאן</a>. ' : '') +
      (nextLesson ? '<a class="btn primary" href="' + nextLesson + '">לשיעור הבא: ' + esc(nextName || '') + ' ←</a>' : '<a href="index.html">חזרה לכל השיעורים</a>') + '</div>');
  if (prev) $('#stepnav .prev').onclick = () => show(prev[0], prev[1], true);
  if (next) $('#stepnav .next').onclick = () => show(next[0], next[1], true);
  const oe = $('#openEggs'); if (oe) oe.onclick = e => { e.preventDefault(); $('#eggBtn').click(); };
  $('#now').innerHTML = '· ' + T[ti].icon + ' <bdi>' + T[ti].title + '</bdi>';
  try { history.replaceState(null, '', '#' + T[ti].id + '-' + (si+1)); } catch(e){}
  ['#topics', '#steps'].forEach(q => { const ac = $(q + ' [aria-current="true"]'); if (ac && ac.scrollIntoView) ac.scrollIntoView({block:'nearest', inline:'center'}); });
  if (scroll) { const y = $('#topics').getBoundingClientRect().top + scrollY - 64; window.scrollTo({top: Math.max(0, y), behavior: 'smooth'}); }
  T[ti].steps[si].dispatchEvent(new CustomEvent('stepshow', {bubbles:true}));
}
function paintProgress(){
  const total = T.reduce((n,t) => n + t.steps.length, 0); if (!total) return;
  const n = T.reduce((k,t) => k + t.steps.filter((x,b) => state.seen[t.id + ':' + b]).length, 0);
  state.stepsTotal = total; state.stepsSeen = n;
  $('#progBar').style.width = (100 * n / total) + '%'; $('#progTxt').textContent = n + '/' + total;
}
function initPlayer(){
  T = [...document.querySelectorAll('section.topic')].map(el => ({el, id:el.dataset.id, title:el.dataset.title, icon:el.dataset.icon, steps:[...el.querySelectorAll(':scope > .spread')]}));
  state.seen = state.seen || {};
  T.forEach(t => t.steps.forEach((st,si) => { const h = st.querySelector('h3'); if (h) { const b = document.createElement('span'); b.className = 'sn'; b.textContent = 'שלב ' + (si+1) + ' מתוך ' + t.steps.length; h.prepend(b); } }));
  $('#topics').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; const t = +b.dataset.t; const u = T[t].steps.findIndex((x,i) => !state.seen[T[t].id + ':' + i]); show(t, u < 0 ? 0 : u, true); });
  $('#steps').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) show(pos.ti, +b.dataset.s, false); });
  document.addEventListener('click', e => { const a = e.target.closest('[data-go]'); if (!a) return; e.preventDefault(); const [id, n] = a.dataset.go.split(':'); const t = T.findIndex(x => x.id === id); if (t >= 0) { try { $('#eggDlg').close(); } catch(err){} show(t, (+n || 1) - 1, true); } });
  document.addEventListener('keydown', e => {
    const src = (e.composedPath && e.composedPath()[0]) || e.target;
    if ((src.closest && src.closest('input,textarea,select,dialog,[contenteditable]')) || e.target.closest('input,textarea,select,dialog') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') { const b = $('#stepnav .next'); if (b) b.click(); }
    if (e.key === 'ArrowRight') { const b = $('#stepnav .prev'); if (b) b.click(); }
  });
  window.__goto = sel => { const sp = document.querySelector(sel).closest('.spread'); T.forEach((t,a) => t.steps.forEach((st,b) => { if (st === sp) show(a, b, false); })); };
  const m = location.hash.match(/^#([a-z0-9]+)-(\d+)$/);
  if (m) { const t = T.findIndex(x => x.id === m[1]); if (t >= 0) return show(t, +m[2] - 1, false); }
  if (state.pos && T[state.pos.ti]) return show(state.pos.ti, state.pos.si, false);
  show(0, 0, false);
}

/* ---------- start: called by each lesson after its own demos are ready ---------- */
function start(o){
  o = o || {};
  autoCode(); wireCopy();
  const pb = $('#printBtn'); if (pb) pb.addEventListener('click', () => window.print());
  initEggs(o.eggs, o.console);
  initPlayer();
}

window.Course = { $, esc, store, state, save, onSave: f => saveHooks.push(f), hlHtmlLine, hlCssLine, codeLines, autoCode, wireCopy,
  PIZZA_IMG, IMAGES, fakeImg, mapCss, Stage, Split, Frame, frameDoc, seg, predict, quiz, doneCheck, playground, toast, party, findEgg, start,
  go: (id, n) => { const t = T.findIndex(x => x.id === id); if (t >= 0) show(t, (n || 1) - 1, true); } };
})();
