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
const saveHooks = [], startHooks = [];
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
  const ci = line.indexOf('/*');
  if (ci >= 0) { if (!line.slice(0, ci).trim()) return '<span class="t-cm">' + esc(line) + '</span>'; return hlCssLine(line.slice(0, ci)) + '<span class="t-cm">' + esc(line.slice(ci)) + '</span>'; }
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
function resolveImgs(src){ return src.replace(/(src\s*=\s*)(["']?)(?:\.\.\/)?(?:Img|img)\/([A-Za-z0-9_.-]+)\2(?=[\s>\/]|$)/gi, (x, a, q, f) => a + '"' + (IMAGES[f] || fakeImg(f.replace(/\.[a-z]+$/i,''))) + '"'); }
const BASE_CSS = ':host{display:block}:host([hidden]){display:none}x-page{display:block;background:#fff;color:#111;padding:12px 16px;font-family:Rubik,Arial,sans-serif;font-size:16px;line-height:1.5;direction:rtl;min-height:40px}' +
  '.hit{outline:3px solid #f43f5e!important;outline-offset:2px}.peek{outline:2px dashed #2f6fec;outline-offset:2px}' +
  'x-page.boxes *{outline:2px dashed #f97316;outline-offset:-2px;background-color:rgba(249,115,22,.07)}x-page.boxes *::before{content:attr(data-tag);font:11px monospace;color:#c2410c;background:#fff7ed;padding:0 4px;margin-inline-end:6px;border-radius:3px}x-page.boxes div{outline:3px solid #7c3aed;outline-offset:3px;background-color:rgba(124,58,237,.10)}x-page.boxes div::before{display:block;width:max-content;color:#fff;background:#7c3aed;font-weight:bold;margin-bottom:4px}' +
  'x-page.kinds [data-kind="block"]{outline:2px solid #2563eb;outline-offset:-2px;background-color:rgba(37,99,235,.06)}x-page.kinds [data-kind="inline"]{outline:2px dashed #db2777;outline-offset:0;background-color:rgba(219,39,119,.10)}';
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
/* stable shuffle of answer options: the right answer must not always sit in the same place (students learn "pick the 2nd").
   Seeded by lesson + question, so every student and every reload sees the same order. keepOrder:true, or options that all
   start with a number (1 / 4 / 6), keep the author's order. 'why' moves with its option. */
function hashStr(str){ let h = 2166136261; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function shuffled(o, key){
  if (!o || o.keepOrder || !Array.isArray(o.opts) || o.opts.length < 2 || typeof o.correct !== 'number') return o;
  const plainO = o.opts.map(x => String(x).replace(/<[^>]+>/g, '').trim());
  if (plainO.every(x => /^\d/.test(x))) return o;
  let seed = hashStr(key) || 1; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const idx = o.opts.map((x, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return Object.assign({}, o, {opts: idx.map(i => o.opts[i]), why: Array.isArray(o.why) ? idx.map(i => o.why[i]) : o.why, correct: idx.indexOf(o.correct)});
}
const predicts = [];
function predict(el, o){
  if (typeof el === 'string') el = $(el);
  o = shuffled(o, LESSON + ':' + el.id + ':' + o.q);
  predicts.push(el.id);
  if (o.quiz) el.classList.add('quiz');
  el.innerHTML = '<div class="q">' + o.q + '</div><div class="opts"></div><div class="fb" hidden></div>';
  const opts = el.querySelector('.opts'), fb = el.querySelector('.fb');
  const bs = o.opts.map((t,i) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = t; b.addEventListener('click', () => answer(i)); opts.appendChild(b); return b; });
  /* veil: hide the live result(s) of this step until the right answer, so the guess is a real guess.
     Results get an opaque cover; controls that would reveal the answer (buttons, checkboxes, labs) are locked;
     "what happened" boxes that come AFTER the question are covered too. o.veil:false = off, o.veil:'#sel' = only these; o.lock:false = no locks */
  let veiled = [], locked = [];
  if (o.veil !== false && !state[el.id]) {
    const scope = el.closest('.spread') || document;
    const outside = t => !el.contains(t) && !t.contains(el);
    let targets = typeof o.veil === 'string' ? [...document.querySelectorAll(o.veil)]
      : [...scope.querySelectorAll('.host, .framewrap, .boxstage, .devices, .minis')].map(h => h.closest('.split > .pane') || h);
    if (typeof o.veil !== 'string') scope.querySelectorAll('.what').forEach(w => { if (!w.hidden && (el.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING)) targets.push(w); });
    /* [data-lock] = spoiler text/demos: covered (not just faded), so they cannot be read before the guess */
    const covers = (o.lock === false ? [] : [...scope.querySelectorAll('[data-lock]')].concat(typeof o.lock === 'string' ? [...document.querySelectorAll(o.lock)] : []));
    covers.forEach(c => { c._lockCover = true; targets.push(c); });
    /* skip elements that are hidden inside the step anyway (e.g. a mock browser not shown yet) */
    const hiddenInside = t => { const h = t.parentElement && t.parentElement.closest('[hidden]'); return !!h && scope !== document && scope.contains(h) && h !== scope; };
    targets = targets.filter((t, k, a) => a.indexOf(t) === k && outside(t) && !t.hidden && !hiddenInside(t) && !a.some(x => x !== t && x.contains(t)));
    function coverIt(t){
      const v = {t};
      if (t.shadowRoot || /^(DETAILS|TABLE|IMG|IFRAME)$/.test(t.tagName)) { v.wrap = document.createElement('div'); v.wrap.className = 'veil-wrap veiling'; t.parentNode.insertBefore(v.wrap, t); v.wrap.appendChild(t); }
      else { t.classList.add('veil-wrap', 'veiling'); v.wrap = t; }
      v.cover = document.createElement('div'); v.cover.className = 'veil-cover'; v.cover.innerHTML = t._lockCover ? '<span>🔒 נפתח אחרי הניחוש</span>' : '<span>🙈 התוצאה מוסתרת – קודם ענו על שאלת הניחוש</span>';
      if (t._lockCover) v.wrap.classList.add('lock-cover');
      v.wrap.appendChild(v.cover);
      t.inert = true; t.setAttribute('aria-hidden', 'true');
      veiled.push(v);
    }
    targets.forEach(coverIt);
    if (o.lock !== false && typeof o.veil !== 'string') {
      [...scope.querySelectorAll('.ctrls, .rules, .sel-input, .chal')]
        .filter((c, k, a) => outside(c) && !c.hidden && !hiddenInside(c) && !targets.some(t => t.contains(c)) && !a.some(x => x !== c && x.contains(c)))
        .forEach(c => { c._lockCover = true; c.classList.add('locked'); coverIt(c); });
    }
  }
  function unveil(){
    veiled.forEach(v => { v.cover.remove(); v.t.inert = false; v.t.removeAttribute('aria-hidden');
      if (v.wrap !== v.t) { v.wrap.parentNode.insertBefore(v.t, v.wrap); v.wrap.remove(); } else v.t.classList.remove('veil-wrap', 'veiling', 'lock-cover'); });
    document.querySelectorAll('.locked').forEach(x => { if (!x.closest('.veil-wrap')) x.classList.remove('locked'); });
    veiled = []; locked = [];
  }
  function answer(i, silent){
    const ok = i === o.correct;
    bs[i].classList.add(ok ? 'right' : 'wrong');
    fb.hidden = false; fb.className = 'fb ' + (ok ? 'right' : 'wrong');
    fb.innerHTML = (ok ? '✔ נכון! ' : '✘ לא בדיוק. ') + (o.why[i] || '') + (ok ? '' : ' נסו שוב.');
    if (ok) { el.classList.add('solved'); bs.forEach(b => b.disabled = true); unveil(); if (!silent) { state[el.id] = true; save(); celebrate(bs[i], 'small'); } if (o.onCorrect) o.onCorrect(); }
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

/* ---------- playground: editors + live preview + auto-checked tasks ----------
   task: {id, text, test(doc, win) | manual:true, hints:['direction', 'where exactly'], solution:{code, lang:'css'|'html', explain, alt}, back:'topic:N'}
   Stuck mechanism (constitution §5): hint 1 -> hint 2 -> "show me the solution" (+ why, + "now try alone"),
   a gentle nudge back to the right step after ~3 unsuccessful tries, reset with confirm, and "how to ask" (askBox). */
function playground(container, o){
  if (typeof container === 'string') container = $(container);
  const id = o.id || 'pg';
  container.innerHTML = '<div class="pg"><div class="editor">' +
    '<span class="lbl">' + (o.htmlLabel || 'HTML') + '</span><textarea class="edH" spellcheck="false" aria-label="עורך HTML" aria-describedby="' + id + '-edhint"></textarea>' +
    (o.css !== undefined ? '<span class="lbl">' + (o.cssLabel || 'CSS – style.css') + '</span><textarea class="edC" spellcheck="false" aria-label="עורך CSS" aria-describedby="' + id + '-edhint"></textarea>' : '') +
    '<span class="edhint" id="' + id + '-edhint">⌨ Tab מוסיף רווחים. כדי לצאת מהעורך עם המקלדת: Esc ואז Tab.</span>' +
    '<div><button class="btn reset" type="button">↺ התחלה מחדש</button></div></div>' +
    '<div><div class="pg-frame"></div></div></div><ul class="tasks"></ul><div class="pg-ask"></div>';
  const edH = container.querySelector('.edH'), edC = container.querySelector('.edC');
  const frame = new Frame(container.querySelector('.pg-frame'), {url: o.url || 'localhost:7123/HTML/test.html', height: o.height || 440});
  const tasksBox = container.querySelector('.tasks');
  const done = (state.tasks = state.tasks || {});
  const help = (state.help = state.help || {});
  const key = t => id + ':' + t.id;
  const TS = o.tasks || [];
  const tries = {}, nudged = {}; let lastTry = 0, lastCode = null;
  TS.forEach((t,i) => {
    const li = document.createElement('li'); li.dataset.k = key(t);
    li.innerHTML = '<span class="st">' + (i+1) + '</span><div><div class="tt">' + t.text + (t.manual ? ' <label style="margin-inline-start:6px;white-space:nowrap"><input type="checkbox" data-manual="1" /> עובד אצלי</label>' : '') + '</div><div class="tk-x"></div></div>';
    const cb = li.querySelector('[data-manual]');
    if (cb) { cb.checked = !!done[key(t)]; cb.addEventListener('change', () => { done[key(t)] = cb.checked; save(); paintHelp(i); if (cb.checked) celebrate(li, 'small'); }); }
    li.querySelector('.tk-x').addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const h = help[key(t)] = help[key(t)] || {h:0};
      if (b.dataset.a === 'hint') h.h = Math.min((t.hints || []).length, (h.h || 0) + 1);
      if (b.dataset.a === 'sol') h.open = !h.open;
      if (b.dataset.a === 'alone') { h.open = false; h.seen = true; (edC || edH).focus(); }
      save(); paintHelp(i, b.dataset.a);
    });
    tasksBox.appendChild(li);
  });
  function paintHelp(i, focusAfter){
    const t = TS[i], li = tasksBox.children[i], x = li.querySelector('.tk-x'), k = key(t), h = help[k] || {h:0};
    const hints = t.hints || [], isDone = !!done[k];
    let html = '';
    hints.slice(0, h.h || 0).forEach((tx, n) => { html += '<div class="tk-hint">💡 <b>רמז ' + (n+1) + ':</b> ' + tx + (n === hints.length - 1 && t.back ? ' <a href="#" data-go="' + t.back + '">↩ השלב שמסביר את זה' + (stepName(t.back) ? ': ' + stepHtml(t.back) : '') + '</a>' : '') + '</div>'; });
    if (nudged[k] && !isDone) html += '<div class="tk-nudge">🤔 המשימה הזו מאתגרת? זה בסדר גמור – ככה לומדים. אפשר לפתוח רמז' + (t.back ? ', או לחזור רגע <a href="#" data-go="' + t.back + '">לשלב: ' + (stepName(t.back) ? stepHtml(t.back) : 'ההסבר') + '</a>' : '') + '.</div>';
    if (h.open && t.solution) {
      const so = t.solution;
      html += '<div class="tk-sol" role="region" aria-label="הפתרון"><b>🔓 הפתרון</b><div class="codeblock"><pre class="cv" data-sol="1"></pre></div>' + (so.explain ? '<p style="margin:4px 0"><b>למה זה עובד?</b> ' + so.explain + '</p>' : '') +
        (so.alt ? '<details class="more"><summary>🚀 דרך נוספת לפתור</summary>' + so.alt + '</details>' : '') +
        '<button class="btn primary" type="button" data-a="alone">הבנתי – עכשיו נסו לבד (הפתרון ייסגר)</button></div>';
    }
    const btns = [];
    if (!isDone && h.h < hints.length) btns.push('<button type="button" data-a="hint">💡 ' + (h.h ? 'רמז נוסף' : 'רמז') + '</button>');
    if (!isDone && t.solution && (h.h || 0) >= hints.length) btns.push('<button type="button" data-a="sol" aria-expanded="' + !!h.open + '">' + (h.open ? 'הסתירו את הפתרון' : '🔓 הראו לי את הפתרון') + '</button>');
    if (btns.length) html += '<div class="tk-help">' + btns.join('') + '</div>';
    if (isDone && h.seen) html += '<span class="tk-seen">👀 נעזרתם בפתרון – נסו בפעם הבאה עם רמז אחד פחות</span>';
    x.innerHTML = html;
    const pre = x.querySelector('pre[data-sol]'); if (pre) codeLines(pre, t.solution.code, t.solution.lang || (edC ? 'css' : 'html'));
    if (focusAfter) { const f = x.querySelector('[data-a="' + (focusAfter === 'hint' ? 'hint' : 'sol') + '"]') || x.querySelector('button,a'); if (f && focusAfter !== 'alone') f.focus(); }
  }
  function paint(){ TS.forEach((t,i) => { const li = tasksBox.children[i]; const ok = !!done[key(t)]; const was = li.classList.contains('done'); li.classList.toggle('done', ok); li.querySelector('.st').textContent = ok ? '✔' : (i+1); li.querySelector('.st').setAttribute('aria-label', ok ? 'הושלמה' : 'משימה ' + (i+1)); if (was !== ok) paintHelp(i); }); }
  saveHooks.push(paint);
  startHooks.push(() => TS.forEach((t,i) => paintHelp(i)));
  function render(){ frame.show({html: edH.value, css: edC ? edC.value.replace(/<\/style/gi,'') : '', links: o.links || []}); }
  frame.onLoad = d => {
    TS.forEach(t => { if (!t.manual) { let ok = false; try { ok = !!t.test(d, d.defaultView); } catch(e){} if (ok && !done[key(t)]) { done[key(t)] = true; const li = tasksBox.children[TS.indexOf(t)]; if (li) setTimeout(() => celebrate(li, TS.every(x => x.manual || done[key(x)]) ? 'big' : 'small'), 60); if (o.onTask) o.onTask(t); } } });
    if (o.onRender) try { o.onRender(d, edH.value, edC && edC.value); } catch(e){}
    /* count a "try" on the first unfinished task: the code changed and some time passed since the last counted try */
    const code = edH.value + '\n' + (edC ? edC.value : ''); const ci = TS.findIndex(t => !t.manual && !done[key(t)]);
    if (lastCode !== null && code !== lastCode && ci >= 0 && Date.now() - lastTry > 15000) {
      lastTry = Date.now(); const k = key(TS[ci]); tries[k] = (tries[k] || 0) + 1;
      if (tries[k] >= 3 && !nudged[k]) { nudged[k] = true; paintHelp(ci); }
    }
    lastCode = code;
    save();
  };
  let timer; const sched = () => { clearTimeout(timer); timer = setTimeout(() => { store.set('code-' + id, {h:edH.value, c:edC ? edC.value : ''}); render(); }, 350); };
  [edH, edC].filter(Boolean).forEach(t => {
    let free = false; /* after Esc, Tab leaves the editor (no keyboard trap) */
    t.addEventListener('input', sched);
    t.addEventListener('focus', () => { free = false; });
    t.addEventListener('keydown', e => {
      if (e.key === 'Escape') { free = true; return; }
      if (e.key === 'Tab' && !free && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); t.setRangeText('    ', t.selectionStart, t.selectionEnd, 'end'); sched(); }
    });
  });
  const saved = store.get('code-' + id);
  edH.value = saved ? saved.h : o.html; if (edC) edC.value = saved ? saved.c : o.css;
  const rb = container.querySelector('.reset'); let rbT;
  rb.addEventListener('click', () => {
    if (!rb.classList.contains('confirm')) { rb.classList.add('confirm'); rb.textContent = 'בטוחים? הקוד שכתבתם יימחק – לחצו שוב'; clearTimeout(rbT); rbT = setTimeout(() => { rb.classList.remove('confirm'); rb.textContent = '↺ התחלה מחדש'; }, 4000); return; }
    clearTimeout(rbT); rb.classList.remove('confirm'); rb.textContent = '↺ התחלה מחדש';
    edH.value = o.html; if (edC) edC.value = o.css; store.set('code-' + id, null); render(); toast('↺ הקוד חזר להתחלה. המשימות שכבר הצלחתם נשארות מסומנות.');
  });
  askBox(container.querySelector('.pg-ask'), {
    task: () => { const t = TS.find(t => !done[key(t)]); return t ? plain(t.text) : ''; },
    code: () => (edC ? '/* CSS */\n' + edC.value + '\n\n<!-- HTML -->\n' : '') + edH.value
  });
  render(); paint();
  return {edH, edC, frame, render};
}
const plain = h => { const d = document.createElement('div'); d.innerHTML = h; d.querySelectorAll('a').forEach(a => a.remove()); return d.textContent.replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').trim(); };

/* ---------- step names for "go back to step X" links ('topic:N' -> "topic title · step title") ---------- */
/* HTML version of a step title: keeps <code>/<bdi> so tokens like ../Img/a.jpg don't get scrambled in RTL */
function stepTitleHtml(st){ const h = st && st.querySelector('h3'); if (!h) return ''; const c = h.cloneNode(true); c.querySelectorAll('.sn').forEach(x => x.remove());
  c.querySelectorAll('*').forEach(x => { if (!/^(CODE|BDI|B|U|I)$/.test(x.tagName)) x.replaceWith(...x.childNodes); else [...x.attributes].forEach(a => x.removeAttribute(a.name)); }); return c.innerHTML.trim(); }
function stepHtml(go){
  const [tid, n] = String(go).split(':'); const t = T.find(x => x.id === tid); if (!t) return esc(go);
  const st = t.steps[(+n || 1) - 1]; return '<bdi>' + esc(t.title) + '</bdi> · <bdi>' + (st ? stepTitleHtml(st) : '') + '</bdi>';
}
function stepName(go){
  const [tid, n] = String(go).split(':'); const t = T.find(x => x.id === tid); if (!t) return '';
  const st = t.steps[(+n || 1) - 1]; return st ? t.title + ' · ' + stepTitle(st) : t.title;
}
function copyText(btn, text){
  const done = ok => { const o = btn.dataset.label || btn.textContent; btn.dataset.label = o; btn.textContent = ok ? 'הועתק ✔' : 'סמנו והעתיקו ידנית'; setTimeout(() => btn.textContent = o, 1600); };
  try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch(e){ done(false); }
}

/* ---------- 🆘 "stuck? this is how you ask" – WHO to ask and HOW (constitution §5, §3.14)
   📒 the topic's Gemini notebook = answers only from the course materials -> for "I didn't understand X"
   🧑‍🏫 the course mentor (Gem) = guides with questions & hints, no ready solution -> for "my code doesn't work" ---------- */
function askBox(host, o){
  if (typeof host === 'string') host = $(host);
  o = o || {};
  const d = document.createElement('details'); d.className = 'ask';
  d.innerHTML = '<summary>' + (o.summary || '🆘 תקועים? ככה שואלים') + '</summary>' +
    '<p class="who">על מה נתקעתם?</p><div class="route"><button type="button" data-r="nb" aria-pressed="false">📒 לא הבנתי משהו מהשיעור</button><button type="button" data-r="mentor" aria-pressed="false">🧑‍🏫 הקוד שלי לא עובד</button></div><div class="ask-body" aria-live="polite"></div>';
  host.appendChild(d);
  const body = d.querySelector('.ask-body');
  const where = () => {
    const lesson = (($('.lesson-head h1') || {}).textContent || document.body.dataset.title || '').trim();
    const t = T[pos.ti], st = t && t.steps[pos.si];
    return {lesson, topic: t ? t.title : '', step: st ? stepTitle(st) : ''};
  };
  function fill(r){
    d.querySelectorAll('.route button').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === r));
    const w = where();
    let lines, code = '';
    if (r === 'nb') {
      lines = ['בשיעור "' + w.lesson + '", בנושא "' + w.topic + '", בשלב "' + w.step + '":', 'לא הבנתי ___', 'אפשר הסבר במילים פשוטות, עם דוגמה קטנה?'];
      body.innerHTML = '<p class="who">פנו ל<b>📒 מחברת Gemini של הנושא</b> (בקלאסרום, בנושא HTML & CSS). היא עונה <b>רק מתוך חומרי הקורס</b> – לכן ההסברים שלה מתאימים בדיוק למה שלמדנו כאן.</p>' +
        '<p class="muted">💡 שאלה טובה אומרת <b>מה בדיוק</b> לא הבנתם. "לא הבנתי כלום" לא עוזר לה לעזור לכם. השלימו את ה-___ אחרי ההדבקה.</p>';
    } else {
      const task = o.task ? o.task() : ''; code = o.code ? o.code() : '';
      lines = ['אני בשיעור "' + w.lesson + '", בשלב "' + w.step + '".', 'המשימה: ' + (task || '___'), 'מה ניסיתי: ___', 'מה ציפיתי שיקרה: ___', 'מה קרה בפועל: ___', 'הקוד שלי:'];
      body.innerHTML = '<p class="who">פנו ל<b>🧑‍🏫 מנטור הקורס</b> (ה-Gem בקלאסרום). הוא <b>לא ייתן לכם פתרון מוכן</b> – הוא ישאל שאלות וייתן רמזים, עד שתמצאו את הטעות בעצמכם. ככה לומדים באמת.</p>' +
        '<p class="muted">לפני ששואלים: ניסיתם את הרמזים? עברתם על "עבד באתר ולא אצלי?"' + (code ? '' : ' הדביקו את הקוד שלכם במקום שמסומן.') + ' השלימו את ה-___ אחרי ההדבקה.</p>';
    }
    const tail = r === 'nb' ? '' : 'בבקשה רמז אחד – לא פתרון מלא.';
    const text = lines.join('\n') + (r === 'nb' ? '' : '\n' + (code || '(הדביקו כאן את הקוד)') + '\n' + tail);
    const tpl = document.createElement('div'); tpl.className = 'tpl';
    tpl.innerHTML = lines.map(l => esc(l).replace(/___/g, '<span class="blank">___</span>')).join('\n') +
      (r === 'nb' ? '' : '\n<pre class="cv" style="margin:6px 0;max-height:150px"></pre>' + esc(tail));
    body.appendChild(tpl);
    const pre = tpl.querySelector('pre'); if (pre) codeLines(pre, code || '(paste your code here)', 'html');
    const cb = document.createElement('button'); cb.type = 'button'; cb.className = 'btn primary'; cb.textContent = '📋 העתקת השאלה';
    cb.addEventListener('click', () => copyText(cb, text)); body.appendChild(cb);
  }
  d.querySelector('.route').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) fill(b.dataset.r); });
  if (o.route) d.addEventListener('toggle', () => { if (d.open && !body.innerHTML) fill(o.route); });
  return d;
}

/* ---------- 🔧 "works on the site but not for me? check in this order" (constitution §6) ----------
   Course.trouble(el, {add:[{t, how, first:true}], omit:['f12'], base:false, items:[...]}) */
const TROUBLE = [
  {id:'save', t:'שמרתם את הקובץ? (Ctrl+S)', how:'ב-Visual Studio, כוכבית <b>*</b> ליד שם הקובץ בלשונית = יש שינויים שלא נשמרו.'},
  {id:'refresh', t:'רעננתם את הדפדפן?', how:'לחצו <b>בתוך הדפדפן</b> Ctrl+F5 – רענון מלא, בלי גרסה ישנה שנשמרה בזיכרון (cache). (ב-Visual Studio עצמו אותו צירוף מריץ את הפרויקט – לכן לוחצים כשהדפדפן מולכם.)'},
  {id:'folder', t:'הקובץ בתיקייה הנכונה?', how:'דפים ב-<code>wwwroot/HTML</code>, תמונות ב-<code>wwwroot/Img</code>, עיצוב ב-<code>wwwroot/css</code>. בפרויקט חדש התיקיות HTML ו-Img <b>עוד לא קיימות</b> – יוצרים אותן (<a href="intro.html#page-2">איך? שיעור 1</a>).'},
  {id:'name', t:'השם והסיומת נכונים?', how:'בדיוק כמו בקוד, כולל אותיות גדולות וקטנות: <code>index.html</code> – ולא <code>Index.html</code> או <code>index.html.txt</code>.'},
  {id:'path', t:'הנתיב נכון?', how:'מדף שבתיקייה HTML קודם עולים תיקייה אחת: <code>../Img/pizza.jpg</code> או <code>../css/style.css</code>.'},
  {id:'f12', t:'יש שגיאה אדומה ב-F12?', how:'בדפדפן לוחצים F12 (כלי המפתחים) ‏←‏ לשונית Console. <b>404</b> = הקובץ לא נמצא – כמעט תמיד נתיב או שם שגוי.'}
];
function trouble(el, o){
  if (typeof el === 'string') el = $(el);
  if (!el || el.dataset.ready) return; el.dataset.ready = '1';
  o = o || {};
  let items = o.items || (o.base === false ? [] : TROUBLE.filter(x => !(o.omit || []).includes(x.id)));
  (o.add || []).forEach(a => a.first ? items.unshift(a) : items.push(a));
  el.classList.add('trouble');
  /* collapsed by default: whoever succeeded moves on; whoever is stuck opens one list, checks in order */
  el.innerHTML = '<details class="tr-d"><summary><b>🔧 עבד באתר ולא אצלי? בודקים לפי הסדר</b> <span class="muted">(' + items.length + ' בדיקות)</span></summary><p class="muted">סמנו כל בדיקה שעשיתם. כמעט תמיד התקלה מסתתרת באחת מהן.</p><ol>' +
    items.map(x => '<li><label><input type="checkbox" /><span class="tt"><b>' + x.t + '</b><span>' + x.how + '</span></span></label></li>').join('') + '</ol>' +
    '<div class="tr-foot"><button class="btn" type="button">↺ ניקוי הסימונים</button></div></details>';
  const dd = el.querySelector('details');
  dd.querySelector('.tr-foot button').addEventListener('click', () => el.querySelectorAll('input').forEach(i => i.checked = false));
  askBox(dd, {summary: '🆘 עברתם על הכול ועדיין לא עובד? ככה שואלים את המנטור', route: 'mentor'});
}

/* ---------- 💻 "now in your Visual Studio": <ol class="vsdo"> steps get remembered checkboxes ---------- */
function initVsdo(){
  state.vs = state.vs || {};
  document.querySelectorAll('ol.vsdo').forEach((ol, n) => {
    if (ol.dataset.ready) return; ol.dataset.ready = '1';
    const sec = ol.closest('section.topic'), base = 'vs:' + (sec ? sec.dataset.id : 'x') + ':' + n;
    const prog = document.createElement('p'); prog.className = 'vsprog'; prog.setAttribute('aria-live', 'polite'); ol.parentNode.insertBefore(prog, ol);
    const lis = [...ol.children];
    lis.forEach((li, i) => {
      const k = base + ':' + i, body = document.createElement('div'); body.className = 'vsbody';
      while (li.firstChild) body.appendChild(li.firstChild);
      const lab = document.createElement('label'); lab.className = 'vsck';
      lab.innerHTML = '<input type="checkbox" aria-label="סימנתי שעשיתי את צעד ' + (i+1) + '" />';
      li.append(lab, body);
      const cb = lab.querySelector('input'); cb.checked = !!state.vs[k]; li.classList.toggle('done', cb.checked);
      cb.addEventListener('change', () => { state.vs[k] = cb.checked; li.classList.toggle('done', cb.checked); paint(); save(); if (cb.checked && lis.every(x => x.classList.contains('done'))) celebrate(prog, 'big'); });
    });
    function paint(){ const k = lis.filter(li => li.classList.contains('done')).length;
      prog.innerHTML = k === lis.length ? '✔ <b>עשיתם את כל הצעדים אצלכם!</b> אם משהו לא עבד – הרשימה "עבד באתר ולא אצלי?" למטה.' : 'עשיתם צעד? סמנו אותו. <b>' + k + '/' + lis.length + '</b>'; }
    paint();
  });
}

/* ---------- 🎯 understanding check at the end of a topic (constitution §3.6, §3.11, §4) ----------
   Course.checkpoint('#cpRules', [
     {q, opts:[...], correct, why:[...], back:'rules:4'},                         // multiple choice (why per option)
     {type:'selector', q, html, expect:'.sale', must:sel => msg|null, answer, explain, back},  // write a selector, live highlight
     {type:'line', q, code, lang:'css'|'html', correct:3 (1-based), why:{2:'…'}, explain, back},  // find the wrong line
     {type:'text', q, accept:[/regex/, 'exact'], placeholder, answer, explain, back}             // short answer
   ]) – first try counts; every mistake points back to the step to review. */
const CPS = [];
function checkpoint(el, items, o){
  if (typeof el === 'string') el = $(el);
  o = o || {};
  const id = el.id || ('cp' + (CPS.length + 1));
  const sec = el.closest('section.topic'), tid = sec ? sec.dataset.id : '', ttitle = sec ? sec.dataset.title : '';
  CPS.push({id, tid}); CPS_N[id] = items.length; state.cp = state.cp || {}; state.cpTotal = CPS.length;
  el.classList.add('gcp');
  const nQ = n => n === 1 ? 'שאלה אחת' : n + ' שאלות';
  let results = [];
  const backsOf = it => [].concat(it.back || []);
  function summary(r){
    if (r.ok === r.n) return '<div class="gcp-sum ok"><h4>✔ מוכנים להמשיך!</h4><p style="margin:0">עניתם נכון על ' + (r.n === 1 ? 'השאלה' : 'כל ' + r.n + ' השאלות') + ' כבר בניסיון הראשון. הבנתם את הנושא "' + esc(ttitle) + '".</p></div>';
    return '<div class="gcp-sum more"><h4>' + r.ok + ' מתוך ' + r.n + ' נכון בניסיון הראשון – כדאי לחזור על:</h4><ul>' +
      (r.back || []).map(g => '<li><a href="#" data-go="' + g + '">' + stepHtml(g) + '</a></li>').join('') + '</ul>' +
      '<p class="muted" style="margin:0">אחרי החזרה – נסו שוב את הבדיקה. טעות היא חלק מהלמידה, לא סימן שאתם "לא מבינים".</p></div>';
  }
  function intro(){
    const prev = state.cp[id];
    el.innerHTML = (prev ? summary(prev) : '<div class="gcp-intro"><p style="margin:0">בדיקה קצרה – <b>לא חובה ובלי ציון</b>: ' + nQ(items.length) + ' על הדברים החשובים בנושא "' + esc(ttitle) + '". טעיתם? תקבלו הסבר וקישור לשלב שכדאי לחזור אליו.</p></div>') +
      '<div class="gcp-nav" style="justify-content:flex-start"><button class="btn primary" type="button" data-cp="start">' + (prev ? '↺ עשו את הבדיקה שוב' : 'התחילו את הבדיקה ▶') + '</button>' +
      (prev ? '' : '<span class="muted" style="align-self:center">לא עכשיו? אפשר להמשיך לשלב הבא.</span>') + '</div>';
  }
  function dots(i){ return '<ol class="gcp-dots" aria-label="התקדמות בבדיקה">' + items.map((x,k) => { const r = results[k];
    return '<li class="' + (k === i ? 'cur' : r || '') + '" aria-label="שאלה ' + (k+1) + (r === 'ok' ? ' – נכון בניסיון הראשון' : r === 'miss' ? ' – כדאי לחזור' : '') + '">' + (r === 'ok' ? '✔' : r === 'miss' ? '↺' : k+1) + '</li>'; }).join('') + '</ol>'; }
  function ask(i){
    const type = items[i].type || 'mc', it = type === 'mc' ? shuffled(items[i], LESSON + ':' + id + ':' + i + ':' + items[i].q) : items[i]; let wrongs = 0, solved = false;
    el.innerHTML = dots(i) + '<div class="gcp-q"><div class="qn">שאלה ' + (i+1) + ' מתוך ' + items.length + '</div><div class="qt" tabindex="-1">' + it.q + '</div><div class="gcp-body"></div><div class="gcp-fb" hidden aria-live="polite"></div><div class="gcp-nav"></div></div>';
    const body = el.querySelector('.gcp-body'), fb = el.querySelector('.gcp-fb'), nav = el.querySelector('.gcp-nav');
    const backLinks = () => backsOf(it).map(g => '<a class="back" href="#" data-go="' + g + '">↩ חזרו לשלב: ' + stepHtml(g) + '</a>').join('<br>');
    function wrong(msg){
      wrongs++; if (results[i] === undefined) results[i] = 'miss';
      fb.hidden = false; fb.className = 'gcp-fb wrong';
      fb.innerHTML = '✘ ' + (msg || 'לא בדיוק.') + ' נסו שוב.' + (backsOf(it).length ? '<br>' + backLinks() : '');
      if (type !== 'mc' && type !== 'line' && wrongs >= 2 && it.answer && !nav.querySelector('[data-cp="show"]')) nav.insertAdjacentHTML('afterbegin', '<button class="btn" type="button" data-cp="show">🔓 הראו לי את התשובה</button>');
    }
    function right(msg){
      if (solved) return; solved = true; if (results[i] === undefined) results[i] = 'ok';
      fb.hidden = false; fb.className = 'gcp-fb right';
      fb.innerHTML = '✔ ' + (results[i] === 'ok' ? 'נכון! ' : 'עכשיו נכון. ') + (msg || '');
      if (results[i] === 'ok') celebrate(fb, 'small');
      body.querySelectorAll('button,input').forEach(b => { if (!b.closest('.split')) b.disabled = true; });
      nav.innerHTML = '<button class="btn primary" type="button" data-cp="next">' + (i < items.length - 1 ? 'לשאלה הבאה ←' : 'לסיכום הבדיקה ←') + '</button>';
      nav.querySelector('button').focus();
    }
    if (type === 'mc') {
      body.innerHTML = '<div class="opts">' + it.opts.map((t,k) => '<button type="button" data-k="' + k + '">' + t + '</button>').join('') + '</div>';
      body.querySelector('.opts').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b || b.disabled) return; const k = +b.dataset.k;
        if (k === it.correct) { b.classList.add('right'); right((it.why || [])[k]); } else { b.classList.add('wrong'); b.disabled = true; wrong((it.why || [])[k]); } });
    }
    if (type === 'line') {
      const ls = it.code.split('\n'), f = it.lang === 'css' ? hlCssLine : hlHtmlLine;
      body.innerHTML = '<p class="muted" style="margin:0">לחצו על השורה שבה הטעות:</p><ol class="gcp-lines">' + ls.map((l,k) => '<li><button type="button" data-k="' + (k+1) + '" aria-label="שורה ' + (k+1) + ': ' + escA(l.trim() || 'ריקה') + '"><span class="n">' + (k+1) + '</span><span>' + (f(l) || ' ') + '</span></button></li>').join('') + '</ol>';
      body.querySelector('.gcp-lines').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b || b.disabled) return; const k = +b.dataset.k;
        if (k === it.correct) { b.classList.add('right'); right(it.explain); } else { b.classList.add('wrong'); b.disabled = true; wrong((it.why || {})[k] || 'השורה הזו תקינה.'); } });
    }
    if (type === 'selector' || type === 'text') {
      if (type === 'selector') body.innerHTML = '<div class="gcp-split"></div>';
      body.insertAdjacentHTML('beforeend', '<form class="gcp-in"><input spellcheck="false" autocomplete="off" aria-label="' + (type === 'selector' ? 'כתבו בורר CSS' : 'כתבו את התשובה') + '" placeholder="' + escA(it.placeholder || (type === 'selector' ? 'כתבו כאן בורר' : '')) + '"' + (it.ltr === false ? ' style="direction:rtl;text-align:right;font-family:inherit"' : '') + ' /><button class="btn primary" type="submit">בדיקה</button></form>');
      const inp = body.querySelector('input'); let sp;
      if (type === 'selector') {
        sp = new Split(body.querySelector('.gcp-split'), {resultTitle: 'מה הבורר שלכם בוחר (באדום)'}); sp.setHtml(it.html); if (it.css) sp.setCss(it.css);
        inp.addEventListener('input', () => { const v = inp.value.trim(); const r = v ? sp.highlight(v) : sp.highlight(''); sp.say(v ? (r === null ? '<span class="err">זה עוד לא בורר תקין</span>' : 'נבחרו <span class="count">' + r.length + '</span> תגיות') : ''); });
      }
      body.querySelector('form').addEventListener('submit', e => {
        e.preventDefault(); if (solved) return; const v = inp.value.trim(); if (!v) return;
        if (type === 'text') {
          const norm = x => x.replace(/\s+/g, ' ').trim().toLowerCase();
          const ok = (it.accept || []).some(a => a instanceof RegExp ? a.test(v) : norm(a) === norm(v));
          return ok ? right(it.explain) : wrong(it.wrong || '');
        }
        const got = sp.highlight(v); if (got === null) return wrong('זה לא בורר תקין – בדקו נקודה, סולמית ורווחים.');
        const exp = [...sp.stage.page.querySelectorAll(it.expect)];
        const same = got.length === exp.length && got.every(x => exp.includes(x));
        if (!same) return wrong('הבורר שלכם בחר ' + got.length + ' תגיות (מסומנות באדום), וצריך לבחור בדיוק ' + exp.length + '.' + (it.hint ? ' ' + it.hint : ''));
        const extra = it.must ? it.must(v) : null;
        extra ? wrong(extra) : right(it.explain);
      });
    }
    nav.addEventListener('click', e => { const b = e.target.closest('[data-cp]'); if (!b) return;
      if (b.dataset.cp === 'show') { if (type === 'selector' || type === 'text') { const inp = body.querySelector('input'); inp.value = it.answer; inp.dispatchEvent(new Event('input')); } right('התשובה: <code>' + esc(it.answer) + '</code>. ' + (it.explain || '')); }
      if (b.dataset.cp === 'next') i < items.length - 1 ? ask(i + 1) : finish(); });
    el.querySelector('.qt').focus({preventScroll: true});
  }
  function finish(){
    const ok = results.filter(r => r === 'ok').length;
    const back = []; items.forEach((it,k) => { if (results[k] !== 'ok') backsOf(it).forEach(g => { if (!back.includes(g)) back.push(g); }); });
    state.cp[id] = {n: items.length, ok, back, t: tid}; save();
    if (T.length) show(pos.ti, pos.si, false);
    el.innerHTML = dots(-1) + summary(state.cp[id]) + '<div class="gcp-nav" style="justify-content:flex-start"><button class="btn" type="button" data-cp="start">↺ עשו את הבדיקה שוב</button></div>';
    if (ok === items.length) { toast('🎯 מוכנים להמשיך! הבנתם את "' + esc(ttitle) + '"'); celebrate(el, 'big'); }
    const h = el.querySelector('h4'); if (h) { h.tabIndex = -1; h.focus({preventScroll: true}); }
  }
  el.addEventListener('click', e => { const b = e.target.closest('[data-cp="start"]'); if (b) { results = []; ask(0); } });
  startHooks.push(intro);
}

/* ---------- ⏱ time plan: measured from the page itself (so it never goes stale) ----------
   page time = reading + guesses + demos + playground (range: fluent reader … slower reader)
   VS time   = 💻 steps (2 min per action)   ·   optional = 🎯 checks + 🚀/🐢 boxes */
function measureTopic(t){
  const wc = s => (s.match(/[֐-׿A-Za-z]+/g) || []).length;
  let words = 0, opt = 0, pred = 0, ctrls = 0, code = 0, vs = 0, cpq = 0, pg = 0;
  t.steps.forEach(sp => {
    if (sp.classList.contains('vsstep')) { vs += sp.querySelectorAll('ol.vsdo > li').length; return; }
    if (sp.classList.contains('cpstep')) { const id = (sp.querySelector('.gcp') || {}).id; cpq += (CPS_N[id] || 4); return; }
    const c = sp.cloneNode(true);
    c.querySelectorAll('details.more').forEach(d => { opt += wc(d.textContent); d.remove(); });
    code += c.querySelectorAll('pre .ln').length;
    c.querySelectorAll('details, .trouble, .predict, pre, .cv, script, style, .tasks, [hidden], .sn, .veil-cover, .lock-note').forEach(x => x.remove());
    words += wc(c.textContent);
    pred += sp.querySelectorAll('.predict').length;
    ctrls += sp.querySelectorAll('.ctrls .seg, .ctrls > .btn').length;
    pg += sp.querySelectorAll('.tasks > li').length;
  });
  const fast = words / 160 + pred * 0.5 + ctrls * 0.4 + code * 0.04 + pg * 2.5;
  const slow = words / 100 + pred * 1 + ctrls * 0.75 + code * 0.08 + pg * 4;
  return {fast, slow, vs: vs * 2, opt: cpq * 1 + opt / 100};
}
const CPS_N = {};
const r5 = m => Math.max(1, Math.round(m));
const rng = (a, b) => { a = r5(a); b = r5(b); return a === b ? a + '' : a + '–' + b; };
function paintTimePlan(){
  const rows = T.map(t => Object.assign({t}, measureTopic(t)));
  T.forEach((t, i) => { t.time = rows[i]; });
  const tot = rows.reduce((s, r) => ({fast: s.fast + r.fast, slow: s.slow + r.slow, vs: s.vs + r.vs, opt: s.opt + r.opt}), {fast: 0, slow: 0, vs: 0, opt: 0});
  const host = document.querySelector('.spread.welcome'); if (!host || host.querySelector('.timeplan')) return;
  const box = document.createElement('details'); box.className = 'timeplan';
  box.innerHTML = '<summary><b>⏱ כמה זמן זה לוקח?</b> בדף: <b>' + rng(tot.fast, tot.slow) + ' דק׳</b> · ב-Visual Studio: <b>' + r5(tot.vs) + ' דק׳</b> <span class="muted">(פירוט לפי נושא – לתכנון)</span></summary>' +
    '<p class="muted" style="margin:6px 0">"בדף" = קריאה, ניחושים, דוגמאות ותרגול כאן. הטווח: מי שקורא מהר … מי שקורא לאט – שניהם בסדר גמור. "ב-Visual Studio" = שלבי 💻 בפרויקט שלכם. בנוסף, ברשות: בדיקות 🎯 ותיבות 🚀/🐢 (בערך ' + r5(tot.opt) + ' דק׳). אפשר בכמה ישיבות – ההתקדמות נשמרת.</p>' +
    '<table><tr><th>נושא</th><th>בדף</th><th>ב-VS</th><th>רשות</th></tr>' +
    rows.map(r => '<tr><td>' + r.t.icon + ' <bdi>' + esc(r.t.title) + '</bdi></td><td>' + rng(r.fast, r.slow) + '′</td><td>' + (r.vs ? r5(r.vs) + '′' : '–') + '</td><td>' + (r.opt >= 0.5 ? r5(r.opt) + '′' : '–') + '</td></tr>').join('') + '</table>';
  const egg = host.querySelector('.eggnote'); egg ? host.insertBefore(box, egg) : host.appendChild(box);
}

/* ---------- ↩ back-chip: after a "go back to step X" link, one click returns you to where you were ---------- */
let returnTo = null;
function paintBackChip(){
  let c = $('#backChip');
  if (!c) { c = document.createElement('button'); c.id = 'backChip'; c.type = 'button'; c.className = 'backchip'; c.hidden = true; document.body.appendChild(c);
    c.addEventListener('click', () => { const r = returnTo; returnTo = null; if (r) { show(r.ti, r.si, true); const q = T[r.ti].steps[r.si].querySelector('.gcp .qt, .tasks'); if (q && q.focus) { if (!q.hasAttribute('tabindex')) q.tabIndex = -1; q.focus({preventScroll: true}); } } paintBackChip(); }); }
  const on = returnTo && !(returnTo.ti === pos.ti && returnTo.si === pos.si);
  if (returnTo && !on) returnTo = null;
  c.hidden = !on; if (on) c.innerHTML = '↩ חזרה ל: <bdi>' + stepTitleHtml(T[returnTo.ti].steps[returnTo.si]) + '</bdi>';
}

/* ---------- 🎉 celebrate: a short, VARIED success effect – students never know which one comes next ----------
   Course.celebrate(el, 'small' | 'big'). Never blocks, never repeats the last effect, respects reduced motion. */
const CHEERS_S = ['נכון!', 'יש!', 'בול!', 'יפה!', 'מדויק!', 'ככה!', 'מצוין!'];
const CHEERS_B = ['מעולה!', 'אלופים!', 'וואו!', 'ככה עושים את זה!', 'קוד נקי!', 'מקצוענים!', 'בוערים! 🔥', 'עוד אחד בכיס!', 'פיצה דני גאה בכם 🍕', 'מתכנתים אמיתיים!'];
let lastFx = -1, lastCheer = '';
const pickNot = (arr, not) => { let x; do { x = arr[Math.floor(Math.random() * arr.length)]; } while (arr.length > 1 && x === not); return x; };
function celebrate(el, level){ setTimeout(() => celebrateNow(el, level), 60); }
function celebrateNow(el, level){
  try {
    if (typeof el === 'string') el = $(el);
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : {left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0};
    /* anchored to the page (not the viewport), so it stays on the element even if the page scrolls */
    const x = Math.min(innerWidth - 40, Math.max(40, r.left + r.width / 2)) + scrollX, y = Math.max(70, r.top + Math.min(r.height, 60) / 2) + scrollY;
    const big = level === 'big';
    const layer = document.createElement('div'); layer.className = 'cel-layer'; layer.setAttribute('aria-hidden', 'true');
    layer.style.left = x + 'px'; layer.style.top = y + 'px'; document.body.appendChild(layer);
    const cheer = pickNot(big ? CHEERS_B : CHEERS_S, lastCheer); lastCheer = cheer;
    const bubble = document.createElement('div'); bubble.className = 'cel-cheer' + (big ? ' big' : ''); bubble.textContent = cheer; layer.appendChild(bubble);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      const FX = [
        () => burst(['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6'], big ? 34 : 16, 'sq'),
        () => burst(['⭐', '✨', '🌟'], big ? 14 : 8, 'em'),
        () => burst(['🍕'], big ? 10 : 5, 'em', true),
        () => { const s = document.createElement('div'); s.className = 'cel-stamp'; s.textContent = '✔'; layer.appendChild(s); },
        () => { for (let k = 0; k < (big ? 3 : 1); k++) setTimeout(() => ring(k), k * 180); },
        () => burst(['🎉', '🥳', '💪', '🚀'], big ? 10 : 6, 'em'),
        () => { const s = document.createElement('div'); s.className = 'cel-rocket'; s.textContent = '🚀'; layer.appendChild(s); burst(['✨'], 6, 'em'); }
      ];
      let i; do { i = Math.floor(Math.random() * FX.length); } while (i === lastFx); lastFx = i; FX[i]();
      if (el && el.classList) { el.classList.remove('cel-glow'); void el.offsetWidth; el.classList.add('cel-glow'); setTimeout(() => el.classList.remove('cel-glow'), 1300); }
    }
    setTimeout(() => layer.remove(), 1600);
    function burst(items, n, kind, spin){
      for (let k = 0; k < n; k++) {
        const p = document.createElement('span'); p.className = 'cel-p ' + kind;
        const a = Math.random() * Math.PI * 2, d = (big ? 90 : 55) + Math.random() * (big ? 110 : 60);
        p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', (Math.sin(a) * d - 30) + 'px');
        p.style.setProperty('--rot', (spin ? 720 : (Math.random() * 540 - 270)) + 'deg');
        p.style.animationDelay = (Math.random() * 0.12) + 's';
        const it = items[k % items.length]; if (kind === 'sq') p.style.background = it; else p.textContent = it;
        layer.appendChild(p);
      }
    }
    function ring(k){ const c = document.createElement('span'); c.className = 'cel-ring'; c.style.setProperty('--h', (k * 70 + 200) + 'deg'); layer.appendChild(c); }
  } catch(e){}
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
/* 🎬 "after the video" mode (course-wide): whoever already watched the video skips the reading steps and does only the
   ACTIVE ones – guesses, 🎯 checks, 💻 steps, labs, practice. The chips mark reading steps, "next" jumps over them. */
function videoMode(){ try { return localStorage.getItem('course-video') === '1'; } catch(e){ return false; } }
function isActive(st){ return st.classList.contains('welcome') || st.classList.contains('vsstep') || st.classList.contains('cpstep') ||
  !!st.querySelector('.predict:not(.quiz), .tasks, .chal, .stepbox, .pg, .predict.quiz, #summary, .sel-input') || st.id === 'quiz' || st.id === 'summary'; }
function nextActive(ti, si, dir){
  let a = ti, b = si;
  for (;;) { if (dir > 0) { if (b < T[a].steps.length - 1) b++; else if (a < T.length - 1) { a++; b = 0; } else return null; }
    else { if (b > 0) b--; else if (a > 0) { a--; b = T[a].steps.length - 1; } else return null; }
    if (!videoMode() || isActive(T[a].steps[b])) return [a, b]; }
}
function paintVideoBox(){
  const host = document.querySelector('.spread.welcome'); if (!host) return;
  let box = host.querySelector('.videobox');
  if (!box) { box = document.createElement('div'); box.className = 'videobox'; const ways = host.querySelector('.ways'); ways ? ways.after(box) : host.appendChild(box);
    box.addEventListener('click', e => { if (!e.target.closest('button')) return; try { localStorage.setItem('course-video', videoMode() ? '0' : '1'); } catch(err){} paintVideoBox(); show(pos.ti, pos.si, false); }); }
  const on = videoMode();
  box.innerHTML = '<b>🎬 כבר צפיתם בסרטון? מומלץ מאוד לעבור גם כאן.</b> הסרטון מסביר – כאן <b>עושים</b>: מנחשים, טועים, מתקנים ובונים בפרויקט שלכם. ' +
    'כדי לא לקרוא פעמיים, הפעילו <b>מצב אחרי-סרטון</b>: הכפתור "הבא" ידלג על שלבי הקריאה, ויישארו רק החלקים הפעילים – ניחושים ❓, בדיקות 🎯, שלבי 💻 והתרגול. ' +
    '<div style="margin-top:8px"><button class="btn' + (on ? '' : ' primary') + '" type="button" aria-pressed="' + on + '">' + (on ? '✔ מצב אחרי-סרטון פועל – לחצו לכיבוי' : '🎬 צפיתי בסרטון – הפעילו מצב אחרי-סרטון') + '</button></div>';
}
function show(ti, si, scroll){
  ti = Math.max(0, Math.min(T.length - 1, ti)); si = Math.max(0, Math.min(T[ti].steps.length - 1, si));
  pos = {ti, si};
  T.forEach((t,a) => { t.el.hidden = a !== ti; t.steps.forEach((st,b) => st.hidden = !(a === ti && b === si)); });
  state.seen[T[ti].id + ':' + si] = true; state.pos = pos; save();
  $('#topics').innerHTML = T.map((t,a) => '<button type="button" data-t="' + a + '"' + (a === ti ? ' aria-current="true"' : '') + (t.steps.every((x,b) => state.seen[t.id + ':' + b]) ? ' class="done"' : '') + '><span class="ic">' + t.icon + '</span><bdi>' + t.title + '</bdi>' + cpBadge(t) + '</button>').join('');
  const vm = videoMode();
  $('#steps').innerHTML = T[ti].steps.map((st,b) => '<button type="button" data-s="' + b + '"' + (b === si ? ' aria-current="true"' : '') + ' class="' + (state.seen[T[ti].id + ':' + b] ? 'seen' : '') + (vm && !isActive(st) ? ' skim' : '') + '"' + ' title="' + escA(stepTitle(st)) + (vm && !isActive(st) ? ' (שלב קריאה – במצב אחרי-סרטון אפשר לדלג)' : '') + '"><span class="k">' + (b+1) + '</span><bdi>' + esc(stepTitle(st)) + '</bdi></button>').join('');
  const prev = nextActive(ti, si, -1);
  const next = nextActive(ti, si, 1);
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
  const tm = T[ti].time, tl = $('#topicTime');
  if (tl) tl.innerHTML = tm && ti > 0 ? '⏱ הנושא הזה: בדף ' + rng(tm.fast, tm.slow) + ' דק׳' + (tm.vs ? ' · ב-VS ' + r5(tm.vs) + ' דק׳' : '') : '';
  try { history.replaceState(null, '', '#' + T[ti].id + '-' + (si+1)); } catch(e){}
  ['#topics', '#steps'].forEach(q => { const ac = $(q + ' [aria-current="true"]'); if (ac && ac.scrollIntoView) ac.scrollIntoView({block:'nearest', inline:'center'}); });
  if (scroll) { const y = $('#topics').getBoundingClientRect().top + scrollY - 64; window.scrollTo({top: Math.max(0, y), behavior: 'smooth'}); }
  T[ti].steps[si].dispatchEvent(new CustomEvent('stepshow', {bubbles:true}));
  paintBackChip();
}
function cpBadge(t){
  const r = Object.values(state.cp || {}).find(x => x.t === t.id); if (!r) return '';
  return r.ok === r.n ? ' <span class="cpb" title="בדיקת ההבנה: מוכנים להמשיך">🎯✔</span><span class="sr">בדיקת ההבנה עברה</span>' : ' <span class="cpb" title="בדיקת ההבנה: כדאי לחזור על כמה שלבים">🎯↺</span><span class="sr">כדאי לחזור על כמה שלבים</span>';
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
  document.addEventListener('click', e => { const a = e.target.closest('[data-go]'); if (!a) return; e.preventDefault(); const [id, n] = a.dataset.go.split(':'); const t = T.findIndex(x => x.id === id);
    if (t >= 0) { try { $('#eggDlg').close(); } catch(err){} const from = a.closest('.spread'); if (from && !from.hidden) returnTo = {ti: pos.ti, si: pos.si}; show(t, (+n || 1) - 1, true); } });
  window.addEventListener('hashchange', () => { const m = location.hash.match(/^#([a-z0-9]+)-(\d+)$/); if (!m) return; const t = T.findIndex(x => x.id === m[1]); if (t >= 0 && !(t === pos.ti && +m[2] - 1 === pos.si)) show(t, +m[2] - 1, true); });
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
/* bidi: Latin tokens that end/start with a symbol (C#, .NET) flip in Hebrew text – isolate them everywhere, once */
function fixBidiTokens(root){
  const RX = /(C#|(?:ASP)?\.NET(?: Core)?)/g, skip = 'CODE,PRE,SCRIPT,STYLE,BDI,TEXTAREA,INPUT,KBD';
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => {
    for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (skip.includes(p.tagName) || p.classList.contains('cv') || p.dir === 'ltr') return NodeFilter.FILTER_REJECT;
    RX.lastIndex = 0; return RX.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }});
  const list = []; while (w.nextNode()) list.push(w.currentNode);
  list.forEach(n => { const f = document.createDocumentFragment(); n.nodeValue.split(RX).forEach((part, i) => { if (i % 2) { const b = document.createElement('bdi'); b.dir = 'ltr'; b.textContent = part; f.appendChild(b); } else if (part) f.appendChild(document.createTextNode(part)); }); n.replaceWith(f); });
}
function start(o){
  o = o || {};
  try { fixBidiTokens(document.querySelector('main') || document.body); } catch(e){}
  autoCode(); wireCopy();
  const pb = $('#printBtn'); if (pb) pb.addEventListener('click', () => window.print());
  initEggs(o.eggs, o.console);
  initVsdo();
  document.querySelectorAll('.trouble:not([data-ready])').forEach(el => trouble(el));
  initPlayer();
  startHooks.forEach(f => { try { f(); } catch(e){ console.error(e); } });
  try { paintVideoBox(); paintTimePlan(); const st = $('#steps'); if (st && !$('#topicTime')) { const d = document.createElement('div'); d.id = 'topicTime'; d.className = 'topictime'; st.parentNode.insertBefore(d, st.nextSibling); } show(pos.ti, pos.si, false); } catch(e){ console.error(e); }
  save();
}

window.Course = { $, esc, store, state, save, onSave: f => saveHooks.push(f), hlHtmlLine, hlCssLine, codeLines, autoCode, wireCopy,
  PIZZA_IMG, IMAGES, fakeImg, mapCss, Stage, Split, Frame, frameDoc, seg, predict, quiz, doneCheck, playground, toast, party, findEgg, start,
  checkpoint, trouble, askBox, stepName, celebrate,
  go: (id, n) => { const t = T.findIndex(x => x.id === id); if (t >= 0) show(t, (n || 1) - 1, true); } };
})();
