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
/* balanced placement (constitution §3.4 / §11): shuffling every question on its own made streaks ("5 of 6 first").
   A block (a page's predicts, a quiz, a 🎯 checkpoint) spreads the right answers evenly over the positions,
   never 3 in a row in the same place. Seeded, so the order is stable across reloads. */
function ansBlock(seed){ return {counts:[], hist:[], seed: hashStr(seed) || 1}; }
function pickTarget(b, k){
  const rnd = () => { let x = b.seed; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; b.seed = x || 1; return x / 4294967296; };
  const h = b.hist, ban = h.length >= 2 && h[h.length-1] === h[h.length-2] ? h[h.length-1] : -1;
  let c = [...Array(k).keys()].filter(p => p !== ban); const min = Math.min(...c.map(p => b.counts[p] || 0));
  c = c.filter(p => (b.counts[p] || 0) === min); const t = c[Math.floor(rnd() * c.length)];
  b.counts[t] = (b.counts[t] || 0) + 1; h.push(t); return t;
}
function shuffled(o, key, block){
  if (!o || o.keepOrder || !Array.isArray(o.opts) || o.opts.length < 2 || typeof o.correct !== 'number') return o;
  const plainO = o.opts.map(x => String(x).replace(/<[^>]+>/g, '').trim());
  if (plainO.every(x => /^\d/.test(x))) return o;
  let seed = hashStr(key) || 1; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const idx = o.opts.map((x, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  if (block) { const t = pickTarget(block, idx.length), cur = idx.indexOf(o.correct); [idx[t], idx[cur]] = [idx[cur], idx[t]]; }
  if (window.__ansLog) window.__ansLog.push([key, idx.indexOf(o.correct) + 1, idx.length]); /* QA hook: answer positions */
  return Object.assign({}, o, {opts: idx.map(i => o.opts[i]), why: Array.isArray(o.why) ? idx.map(i => o.why[i]) : o.why, correct: idx.indexOf(o.correct)});
}
let predBlock = null;
const predicts = [];
function predict(el, o){
  if (typeof el === 'string') el = $(el);
  o = shuffled(o, LESSON + ':' + el.id + ':' + o.q, o._block || (predBlock = predBlock || ansBlock(LESSON + ':predicts')));
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
    fb.innerHTML = (ok ? '✔ נכון! ' + noDup(o.why[i]) : '✘ לא בדיוק. ' + (o.why[i] || '') + ' נסו שוב.');
    if (ok) { el.classList.add('solved'); bs.forEach(b => b.disabled = true); unveil(); if (!silent) { state[el.id] = true; save(); if (!(o._done && o._done(bs[i]))) celebrate(bs[i], 'small'); } if (o.onCorrect) o.onCorrect(); }
    else if (!silent) { if (o._miss) o._miss(); SFX.play('bad'); }
  }
  if (state[el.id]) answer(o.correct, true);
}
function quiz(container, list){
  if (typeof container === 'string') container = $(container);
  const blk = ansBlock(LESSON + ':quiz:' + (container.id || ''));
  /* the end of the quiz: a summary line that stays, and ONE finale instead of the answer tone of the last question.
     First try counts (like the 🎯 checks): state.qz[id] = {miss:{3:1}} ; legacy = answers from before this was recorded (no claim of "perfect"). */
  const cid = container.id || 'quiz', N = list.length, qid = i => 'q' + (i + 1);
  state.qz = state.qz || {};
  const rec = state.qz[cid] = state.qz[cid] || {miss: {}, legacy: list.some((q, i) => state[qid(i)]) ? 1 : 0};
  const allDone = () => list.every((q, i) => state[qid(i)]);
  const sum = document.createElement('div'); sum.className = 'qz-sum'; sum.hidden = true; sum.setAttribute('role', 'status');
  function paintSum(){
    if (!allDone()) { sum.hidden = true; return null; }
    const miss = Object.keys(rec.miss || {}).length, ok = N - miss, perfect = !miss && !rec.legacy;
    sum.hidden = false; sum.classList.toggle('ok', perfect);
    sum.innerHTML = perfect ? '<b>🏆 בוחן מושלם!</b> עניתם נכון על כל ' + N + ' השאלות כבר בניסיון הראשון.' + ' <span class="fin-badge">🏆 ' + N + '/' + N + '</span>'
      : rec.legacy ? '<b>✔ סיימתם את הבוחן.</b> עניתם על כל ' + N + ' השאלות.'
      : '<b>✔ סיימתם את הבוחן.</b> ' + ok + ' מתוך ' + N + ' בניסיון הראשון. בשאלות שטעיתם בהן קיבלתם הסבר – וככה בדיוק לומדים.';
    return {perfect, ok};
  }
  list.forEach((qq,i) => { const d = document.createElement('div'); d.className = 'predict'; d.id = qid(i); container.appendChild(d);
    predict(d, Object.assign({quiz:true}, qq, {q:(i+1) + '. ' + qq.q, _block: blk,
      _miss: () => { rec.miss = rec.miss || {}; rec.miss[i + 1] = 1; save(); },
      _done: btn => { const r = paintSum(); if (!r) return false;
        if (r.perfect) finale(btn, {perfect: true, key: 'quiz:' + cid, title: 'בוחן מושלם!', sub: N + ' מתוך ' + N + ' בניסיון הראשון'});
        else { finMark('quiz:' + cid, false, container); celebrate(btn, 'done', {cheer: 'סיימתם את הבוחן 👏', fx: false}); }
        return true; }})); });
  container.appendChild(sum); paintSum();
}
/* the engine already writes "נכון!" – drop a second one at the start of the explanation */
const noDup = t => String(t || '').replace(/^\s*נכון\s*[:!.,–-]\s*/, '');
/* "I did it" checkbox that is remembered */
function doneCheck(el, key){
  if (typeof el === 'string') el = $(el);
  if (!el) return;
  const lab = el.closest('label'); if (lab) lab.classList.add('dck');
  const paint = () => { if (lab) lab.classList.toggle('dck-on', el.checked); };
  el.checked = !!state[key]; paint();
  /* ticking it is a real milestone (the step was done in the student's own project): a "stamp" sound + a small cheer. Unticking is silent. */
  el.addEventListener('change', () => { state[key] = el.checked; save(); paint();
    if (el.checked) celebrate(lab || el, 'small', {sound: 'check', up: 16, cheer: lastCheer = pickNot(CHEERS_D, lastCheer)}); });
}
const CHEERS_D = ['נרשם! 💪', 'עוד צעד באתר שלכם ✔', 'מתקדמים! 👣', 'בפרויקט שלכם – הכי חשוב!', 'יפה, עשיתם את זה!'];

/* ---------- playground: editors + live preview + auto-checked tasks ----------
   task: {id, text, test(doc, win) | manual:true, hints:['direction', 'where exactly'], solution:{code, lang:'css'|'html', explain, alt}, back:'topic:N'}
   Stuck mechanism (constitution §5): hint 1 -> hint 2 -> "show me the solution" (+ why, + "now try alone"),
   a gentle nudge back to the right step after ~3 unsuccessful tries, reset with confirm, and "how to ask" (askBox). */
/* ---------- tag checker: the browser silently fixes a missing </p>, so a task could "pass" with broken code.
   Returns [{k:'open'|'stray', tag, line}] – unclosed opening tags and closing tags without an opening one. ---------- */
const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
function tagIssues(src){
  src = String(src || '');
  const out = [], stack = [];
  const lineAt = i => src.slice(0, i).split('\n').length;
  const blank = m => m.replace(/[^\n]/g, ' ');
  src = src.replace(/<!--[\s\S]*?-->/g, blank).replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi, (m, a, n, b, c) => a + blank(b) + c);
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g; let m;
  while ((m = re.exec(src))) {
    const close = !!m[1], tag = m[2].toLowerCase();
    if (VOID_TAGS.has(tag) || (!close && m[3])) continue;
    if (!close) { stack.push({tag, line: lineAt(m.index)}); continue; }
    let j = stack.length - 1; while (j >= 0 && stack[j].tag !== tag) j--;
    if (j < 0) { out.push({k:'stray', tag, line: lineAt(m.index)}); continue; }
    stack.splice(j).slice(1).forEach(x => out.push({k:'open', tag: x.tag, line: x.line}));
  }
  stack.forEach(x => out.push({k:'open', tag: x.tag, line: x.line}));
  return out.sort((a, b) => a.line - b.line);
}
/* issues in `now` that were not already in `base` (a seeded "find the bug" stays the task's own business) */
function newTagIssues(now, base){
  const cnt = {}; tagIssues(base).forEach(x => { const k = x.k + x.tag; cnt[k] = (cnt[k] || 0) + 1; });
  return tagIssues(now).filter(x => { const k = x.k + x.tag; if (cnt[k]) { cnt[k]--; return false; } return true; });
}
function tagIssueText(x){
  const t = esc(x.tag);
  return x.k === 'open'
    ? 'לתגית <code>&lt;' + t + '&gt;</code> שבשורה ' + x.line + ' חסרה התגית הסוגרת <code>&lt;/' + t + '&gt;</code>'
    : 'בשורה ' + x.line + ' יש תגית סוגרת <code>&lt;/' + t + '&gt;</code> – בלי תגית פותחת לפניה';
}

function playground(container, o){
  if (typeof container === 'string') container = $(container);
  const id = o.id || 'pg';
  container.innerHTML = '<div class="pg"><div class="editor">' +
    '<span class="lbl">' + (o.htmlLabel || 'HTML') + '</span><textarea class="edH" spellcheck="false" aria-label="עורך HTML" aria-describedby="' + id + '-edhint"></textarea>' +
    (o.css !== undefined ? '<span class="lbl">' + (o.cssLabel || 'CSS – style.css') + '</span><textarea class="edC" spellcheck="false" aria-label="עורך CSS" aria-describedby="' + id + '-edhint"></textarea>' : '') +
    '<span class="edhint" id="' + id + '-edhint">⌨ Tab מוסיף רווחים. כדי לצאת מהעורך עם המקלדת: Esc ואז Tab.</span>' +
    '<div><button class="btn reset" type="button">↺ התחלה מחדש</button></div></div>' +
    '<div><div class="pg-frame"></div></div></div><p class="pg-fin" role="status"></p><ul class="tasks"></ul><div class="pg-ask"></div>';
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
    li.innerHTML = '<span class="st">' + (i+1) + '</span><div><div class="tt">' + t.text + (t.manual ? ' <label style="margin-inline-start:6px;white-space:nowrap"><input type="checkbox" data-manual="1" /> עובד אצלי</label>' : '') + '</div><div class="tk-lint" role="status" hidden></div><div class="tk-x"></div></div>';
    const cb = li.querySelector('[data-manual]');
    if (cb) { cb.checked = !!done[key(t)]; cb.addEventListener('change', () => { done[key(t)] = cb.checked; save(); paintHelp(i); if (cb.checked) celebrate(li, 'small'); }); }
    li.querySelector('.tk-x').addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const h = help[key(t)] = help[key(t)] || {h:0};
      if (b.dataset.a === 'hint') h.h = Math.min((t.hints || []).length, (h.h || 0) + 1);
      if (b.dataset.a === 'sol') { h.open = !h.open; h.sol = true; }
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
  /* the finale belongs to the tasks that are checked automatically; "perfect" = finished without opening a solution (hints are fine) */
  const AUTO = TS.filter(t => !t.manual), finBox = container.querySelector('.pg-fin');
  const autoDone = () => AUTO.length > 0 && AUTO.every(t => done[key(t)]);
  const noSol = () => !TS.some(t => { const h = help[key(t)]; return h && (h.sol || h.seen || h.open); });
  function paintFin(){
    if (!finBox) return; const n = TS.filter(t => done[key(t)]).length, N = TS.length; if (!N) { finBox.hidden = true; return; }
    const all = autoDone(), txt = all ? '<b>🏆 ' + (n === N ? 'כל ' + N + ' המשימות הושלמו!' : 'הושלמו ' + n + ' מתוך ' + N + ' משימות') + '</b>' + (noSol() ? ' <span class="fin-badge">⭐ לבד – בלי לפתוח פתרון</span>' : '')
      : 'הושלמו <b>' + n + ' מתוך ' + N + '</b> משימות';
    const html = '<span class="pg-bar"><i style="width:' + (100 * n / N) + '%"></i></span><span>' + txt + '</span>';
    if (finBox.dataset.h !== html) { finBox.dataset.h = html; finBox.innerHTML = html; finBox.classList.toggle('all', all); }
  }
  function paint(){ TS.forEach((t,i) => { const li = tasksBox.children[i]; const ok = !!done[key(t)]; const was = li.classList.contains('done'); li.classList.toggle('done', ok); li.querySelector('.st').textContent = ok ? '✔' : (i+1); li.querySelector('.st').setAttribute('aria-label', ok ? 'הושלמה' : 'משימה ' + (i+1)); if (was !== ok) paintHelp(i); }); paintFin(); }
  saveHooks.push(paint);
  startHooks.push(() => TS.forEach((t,i) => paintHelp(i)));
  function render(){ frame.show({html: edH.value, css: edC ? edC.value.replace(/<\/style/gi,'') : '', links: o.links || []}); }
  frame.onLoad = d => {
    /* strict tags: a task is not done while the student's code has an unclosed / stray tag that wasn't in the starting code */
    const issues = o.strictTags === false ? [] : newTagIssues(edH.value, o.html);
    TS.forEach((t, i) => { const lb = tasksBox.children[i] && tasksBox.children[i].querySelector('.tk-lint'); if (lb) { lb.hidden = true; lb.innerHTML = ''; } });
    const fresh = [];
    TS.forEach(t => { if (!t.manual) { let ok = false; try { ok = !!t.test(d, d.defaultView); } catch(e){}
      if (ok && !done[key(t)] && issues.length && t.strictTags !== false) {
        const lb = tasksBox.children[TS.indexOf(t)].querySelector('.tk-lint'); ok = false;
        if (tasksBox.querySelector('.tk-lint:not([hidden])')) return;
        lb.innerHTML = '✋ <b>כמעט!</b> בתצוגה זה כבר נראה נכון – כי הדפדפן משלים לבד תגיות שחסרות. אבל בקוד ' + tagIssueText(issues[0]) + ' – תקנו, והמשימה תסומן.';
        lb.hidden = false;
      }
      if (ok && !done[key(t)]) { done[key(t)] = true; fresh.push(t); if (o.onTask) o.onTask(t); } } });
    /* ONE celebration per render, even when several tasks turn green together: the last task that was solved, or the finale when all are done */
    if (fresh.length) { const li = tasksBox.children[TS.indexOf(fresh[fresh.length - 1])], all = autoDone(), pf = all && noSol();
      setTimeout(() => all ? finale(finBox || li, {near: li, perfect: pf, key: 'pg:' + id, title: pf ? 'לבד, עד הסוף!' : 'כל המשימות הושלמו!', sub: AUTO.length + ' מתוך ' + AUTO.length + ' משימות' + (pf ? ' – בלי לפתוח פתרון' : '')}) : celebrate(li, 'small'), 60); }
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
  {id:'name', t:'השם והסיומת נכונים?', how:'השם בקוד (או בכתובת) זהה לשם הקובץ, אות באות: <code>index.html</code> – ולא <code>index.html.txt</code> או <code>idnex.html</code>. (ב-Windows אותיות גדולות וקטנות לא משנות – אבל בשרתים באינטרנט כן. לכן מתרגלים לכתוב בדיוק.)'},
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
  const rule = document.createElement('div'); rule.className = 'tr-rule';
  rule.innerHTML = '📏 <b>חוק 3 השלבים</b> (כלל הזהב משיעור 0): <b>1.</b> מנסים לבד 10–15 דקות – למשל עם הרשימה הזו. <b>2.</b> חוזרים להסבר – לשלב המתאים כאן, לסרטון או למצגת. <b>3.</b> עדיין תקועים? שואלים את המנטור – ומבקשים רמז, לא פתרון.<br>✍️ התקלה לקחה יותר מ-10 דקות? רשמו שורה ב<b>יומן התקלות</b> (המסמך האישי במטלה "הגשה סופית"): מה קרה, ואיך פתרתם.';
  dd.appendChild(rule);
  askBox(dd, {summary: '🆘 עברתם על הכול ועדיין לא עובד? ככה שואלים את המנטור', route: 'mentor'});
}

/* ---------- 📌 assignments in Classroom: ONE source of truth for numbers, titles and due dates ----------
   Course.assignment(el, {n, lead, items:['html', …], how, after}) renders the box (remembered checklist, days left, where to submit).
   <span data-asg="N"></span> anywhere in a page becomes a short "📌 מטלה N · עד יום ה׳ 22/10" chip. */
const ASSIGN = {
  0: {label:'משימת הפתיחה', title:'מתרגלים ללמוד נכון עם AI', due:'', est:''},
  1: {title:'התקנת סביבת העבודה Visual Studio 2022', due:'2026-10-22', est:'כשעה וחצי'},
  2: {title:'האתר הראשון שלי (המשפחה שלי או נושא לבחירה)', due:'2026-10-29', est:'כ-3.5 שעות'},
  3: {title:'בחירת נושא הפרויקט והשראה', due:'2026-11-05', est:'כשעה'},
  4: {title:'בניית דפי הפרויקט המעוצבים', due:'2026-11-19', est:'כ-6 שעות'},
  5: {title:'הגשה 1: האתר המעוצב', due:'2026-12-24', est:'כ-12 שעות', graded:true},
  final: {label:'ההגשה הסופית', title:'הפרויקט ותיק הפרויקט', due:'', est:'', graded:true}
};
/* 🏠 topic home: every lesson returns to the home page of ITS topic (html-css.html, later javascript.html...). <body data-home="x.html" data-home-name="..."> overrides. */
const TOPIC_HOME = [(document.body && document.body.dataset.home) || 'html-css.html', (document.body && document.body.dataset.homeName) || 'HTML & CSS'];
(function(){ const add = () => { const b = document.querySelector('.topbar .brand'); if (!b || document.querySelector('.topbar .homelnk')) return;
  const a = document.createElement('a'); a.className = 'homelnk'; a.href = TOPIC_HOME[0]; a.title = 'חזרה לדף הבית – ' + TOPIC_HOME[1]; a.setAttribute('aria-label', a.title);
  a.innerHTML = '🏠 <span>דף הבית</span>'; b.parentNode.insertBefore(a, b); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add(); })();
const asgName = n => (ASSIGN[n] && ASSIGN[n].label) || ('מטלה ' + n);
/* the dates come from assets/cohort.js (the one file to edit for a new cohort); the dates above are only a fallback */
try { const C = window.COHORT && window.COHORT.due; if (C) Object.keys(C).forEach(n => { const ok = /^\d{4}-\d{2}-\d{2}$/.test(C[n] || ''); if (ok || ASSIGN[n]) (ASSIGN[n] = ASSIGN[n] || {title:'', est:''}).due = ok ? C[n] : ''; }); } catch(e){}
const HE_DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
function asgDate(n){
  const a = ASSIGN[n]; if (!a || !a.due) return null;
  const [y, m, d] = a.due.split('-').map(Number), due = new Date(y, m - 1, d, 23, 59);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(y, m - 1, d) - today) / 864e5);
  return {a, text: 'יום ' + HE_DAYS[due.getDay()] + ', ' + d + '/' + m, days};
}
function asgLeft(days){ return days > 1 ? 'נשארו ' + days + ' ימים' : days === 1 ? 'נשאר יום אחד' : days === 0 ? 'היום!' : 'תאריך היעד עבר – הגישו כמה שיותר מהר'; }
function paintAsgChips(){
  document.querySelectorAll('[data-asg]').forEach(x => { const r = asgDate(x.dataset.asg); if (!r) return;
    x.className = 'asgchip'; x.innerHTML = '📌 ' + esc(asgName(x.dataset.asg)) + ' בקלאסרום · עד ' + r.text; });
}
function assignment(el, o){
  if (typeof el === 'string') el = $(el); if (!el) return;
  const r = asgDate(o.n); if (!r) return; const a = r.a;
  state.asg = state.asg || {}; const st = state.asg[o.n] = state.asg[o.n] || {};
  const items = o.items || [];
  el.classList.add('asg');
  el.innerHTML = '<div class="asg-h"><span class="asg-tag">📌 ' + esc(asgName(o.n)) + ' בקלאסרום</span> <b>' + esc(a.title) + '</b></div>' +
    '<div class="asg-meta"><span>📅 עד ' + r.text + ', בשעה 23:59</span><span class="asg-left' + (r.days < 0 ? ' late' : r.days <= 3 ? ' soon' : '') + '">' + asgLeft(r.days) + '</span><span>⏱ ' + esc(a.est) + '</span><span>' +
      (a.graded ? '🎯 הגשה עם ציון' : '📝 מטלת תרגול: בלי ציון, עם משוב – וההגשה חובה') + '</span></div>' +
    (o.lead ? '<p class="asg-lead">' + o.lead + '</p>' : '') +
    (items.length ? '<p class="asg-prog" aria-live="polite"></p><ol class="asg-list">' + items.map((h, i) => '<li><label class="vsck"><input type="checkbox" aria-label="סימנתי: ' + (i+1) + '" /></label><div class="vsbody">' + h + '</div></li>').join('') + '</ol>' : '') +
    '<div class="asg-how">📤 <b>איך מגישים:</b> ' + (o.how ? o.how.replace(/\{name\}/g, '"' + esc(asgName(o.n)) + ' – ' + esc(a.title) + '"') : 'בקלאסרום &rlm;←&rlm; <b>סביבת הלמידה</b> &rlm;←&rlm; הנושא <b><bdi>HTML &amp; CSS</bdi></b> &rlm;←&rlm; "מטלה ' + o.n + ' – ' + esc(a.title) + '" &rlm;←&rlm; <b>הוספה או יצירה</b> &rlm;←&rlm; <b>קובץ</b> &rlm;←&rlm; מעלים את הקובץ &rlm;←&rlm; <b>הגשה</b>. ההוראות המלאות – במטלה עצמה, בקלאסרום.') + '</div>' +
    (o.after ? '<p class="asg-after">' + o.after + '</p>' : '');
  const lis = [...el.querySelectorAll('.asg-list > li')], prog = el.querySelector('.asg-prog');
  function paint(){ const n = lis.filter((li, i) => st[i]).length; lis.forEach((li, i) => { li.classList.toggle('done', !!st[i]); li.querySelector('input').checked = !!st[i]; });
    if (prog) prog.textContent = n === lis.length ? '✔ הכול מוכן – נשאר רק להגיש בקלאסרום.' : 'סימנתם ' + n + ' מתוך ' + lis.length; }
  lis.forEach((li, i) => li.querySelector('input').addEventListener('change', e => { st[i] = e.target.checked; save(); paint(); if (e.target.checked && lis.every((x, k) => st[k])) listFinale('asg:' + o.n, prog || el, {icon: '📌', title: 'הכול מוכן להגשה!', sub: 'נשאר רק להגיש בקלאסרום', near: li}); }));
  paint();
}
/* a ticked-off checklist gets its finale once per visit: ticking, unticking and ticking again must not turn into a confetti button */
const finOnce = {};
function listFinale(key, el, o){ if (finOnce[key]) return; finOnce[key] = 1; finale(el, Object.assign({key}, o)); }

/* ---------- 💻 "now in your Visual Studio": <ol class="vsdo"> steps get remembered checkboxes ---------- */
/* ---------- 🧭 guided tour: <ol class="ctour" aria-label="title"><li data-t="🧭 card title">…</li>…</ol>
   One card at a time, in a logical order (constitution §2 + attention difficulties): less on the screen, a clear "next",
   progress dots, and "show all" for whoever wants the overview. Without JS it stays a plain list. ---------- */
function initTour(){
  document.querySelectorAll('ol.ctour:not([data-ready])').forEach((ol, n) => {
    ol.dataset.ready = '1';
    const cards = [...ol.children], N = cards.length, key = 'tour' + n;
    let i = Math.min(+state[key] || 0, N - 1), all = false;
    const box = document.createElement('div'); box.className = 'ctour-box';
    ol.parentNode.insertBefore(box, ol);
    box.innerHTML = '<div class="ctour-top"><b>' + esc(ol.getAttribute('aria-label') || '') + '</b><span class="ctour-n" aria-live="polite"></span>' +
      '<button type="button" class="btn ctour-all"></button></div><div class="ctour-dots" role="group" aria-label="כרטיסים"></div>';
    box.appendChild(ol);
    const nav = document.createElement('div'); nav.className = 'ctour-nav';
    nav.innerHTML = '<button type="button" class="btn ctour-prev">→ הקודם</button><button type="button" class="btn primary ctour-next"></button>';
    box.appendChild(nav);
    cards.forEach((li, k) => { const t = li.dataset.t; if (t) li.insertAdjacentHTML('afterbegin', '<h5 class="ctour-t">' + t + '</h5>'); });
    const dots = box.querySelector('.ctour-dots');
    dots.innerHTML = cards.map((li, k) => '<button type="button" data-k="' + k + '" aria-label="כרטיס ' + (k+1) + ': ' + esc((li.dataset.t || '').replace(/<[^>]+>/g, '')) + '"></button>').join('');
    const prev = nav.querySelector('.ctour-prev'), next = nav.querySelector('.ctour-next'), allB = box.querySelector('.ctour-all'), cnt = box.querySelector('.ctour-n');
    function paint(focus){
      box.classList.toggle('ctour-open', all);
      cards.forEach((li, k) => { li.hidden = !all && k !== i; });
      dots.hidden = all; nav.hidden = all;
      dots.querySelectorAll('button').forEach((b, k) => { b.classList.toggle('on', k === i); b.classList.toggle('seen', k < i); b.setAttribute('aria-current', k === i ? 'step' : 'false'); });
      cnt.textContent = all ? N + ' כרטיסים' : (i + 1) + ' מתוך ' + N;
      allB.textContent = all ? '👣 כרטיס אחד בכל פעם' : '📋 הצגת הכול';
      prev.disabled = i === 0;
      next.textContent = i === N - 1 ? '↺ שוב מההתחלה' : 'הבא ←';
      if (focus) { const h = cards[i].querySelector('.ctour-t'); if (h) { h.tabIndex = -1; h.focus({preventScroll:true}); } }
      state[key] = i; save();
    }
    prev.addEventListener('click', () => { if (i > 0) { i--; paint(true); } });
    next.addEventListener('click', () => { i = i === N - 1 ? 0 : i + 1; paint(true); });
    dots.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { i = +b.dataset.k; paint(true); } });
    allB.addEventListener('click', () => { all = !all; paint(false); });
    paint(false);
  });
}

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
      cb.addEventListener('change', () => { state.vs[k] = cb.checked; li.classList.toggle('done', cb.checked); paint(); save(); if (cb.checked && lis.every(x => x.classList.contains('done'))) listFinale(base, prog, {icon: '💻', title: 'עשיתם את זה אצלכם!', sub: 'כל ' + lis.length + ' הצעדים מסומנים', near: li}); });
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
  const cpBlk = ansBlock(LESSON + ':cp:' + id), SHUF = items.map((it, i) => (it.type || 'mc') === 'mc' ? shuffled(it, LESSON + ':' + id + ':' + i + ':' + it.q, cpBlk) : it);
  const nQ = n => n === 1 ? 'שאלה אחת' : n + ' שאלות';
  let results = [];
  const backsOf = it => [].concat(it.back || []);
  function summary(r){
    if (r.ok === r.n) return '<div class="gcp-sum ok"><h4>✔ מוכנים להמשיך! <span class="fin-badge">🏆 ' + r.n + '/' + r.n + '</span></h4><p style="margin:0">עניתם נכון על ' + (r.n === 1 ? 'השאלה' : 'כל ' + r.n + ' השאלות') + ' כבר בניסיון הראשון. הבנתם את הנושא "' + esc(ttitle) + '".</p></div>';
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
    const type = items[i].type || 'mc', it = SHUF[i]; let wrongs = 0, solved = false;
    el.innerHTML = dots(i) + '<div class="gcp-q"><div class="qn">שאלה ' + (i+1) + ' מתוך ' + items.length + '</div><div class="qt" tabindex="-1">' + it.q + '</div><div class="gcp-body"></div><div class="gcp-fb" hidden aria-live="polite"></div><div class="gcp-nav"></div></div>';
    const body = el.querySelector('.gcp-body'), fb = el.querySelector('.gcp-fb'), nav = el.querySelector('.gcp-nav');
    const backLinks = () => backsOf(it).map(g => '<a class="back" href="#" data-go="' + g + '">↩ חזרו לשלב: ' + stepHtml(g) + '</a>').join('<br>');
    function wrong(msg){
      wrongs++; if (results[i] === undefined) results[i] = 'miss'; SFX.play('bad');
      fb.hidden = false; fb.className = 'gcp-fb wrong';
      fb.innerHTML = '✘ ' + (msg || 'לא בדיוק.') + ' נסו שוב.' + (backsOf(it).length ? '<br>' + backLinks() : '');
      if (type !== 'mc' && type !== 'line' && wrongs >= 2 && it.answer && !nav.querySelector('[data-cp="show"]')) nav.insertAdjacentHTML('afterbegin', '<button class="btn" type="button" data-cp="show">🔓 הראו לי את התשובה</button>');
    }
    function right(msg){
      if (solved) return; solved = true; if (results[i] === undefined) results[i] = 'ok';
      fb.hidden = false; fb.className = 'gcp-fb right';
      fb.innerHTML = '✔ ' + (results[i] === 'ok' ? 'נכון! ' : 'עכשיו נכון. ') + noDup(msg);
      if (results[i] === 'ok') celebrate(fb, 'small'); else SFX.play('ok');
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
    const sm = el.querySelector('.gcp-sum') || el;
    if (ok === items.length) { toast('🎯 מוכנים להמשיך! הבנתם את "' + esc(ttitle) + '"'); finale(sm, {perfect: true, key: 'cp:' + id, sub: (items.length === 1 ? 'נכון' : items.length + ' מתוך ' + items.length) + ' בניסיון הראשון'}); }
    else celebrate(sm, 'done', {cheer: 'סיימתם את הבדיקה 👏', fx: false});   /* finished with mistakes: a warm "done", never silence – and never a punishment */
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
    c.querySelectorAll('details, .trouble, .predict, pre, .cv, script, style, .tasks, [hidden], .sn, .veil-cover, .lock-note, .pg-fin, .qz-sum').forEach(x => x.remove());
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
/* Levels:  'small' = one right answer (tone climbs with the streak)   ·   'done' = warm "you finished" (a block completed with mistakes on the way)
            'big'   = a whole block is finished -> the FINALE (so every lab that already called celebrate(el,'big') gets it).
   o.cheer = the text of the bubble, o.sound = another SFX kind, o.fx:false = bubble only. */
let finAt = 0;
function celebrate(el, level, o){
  if (level === 'big') return finale(el, o);
  o = o || {};
  SFX.play(o.sound || (level === 'done' ? 'done' : 'ok'));
  if (Date.now() - finAt < 450) return;   /* a finale has just started: it is the one effect on the screen */
  if (level === 'done') try { document.querySelectorAll('.cel-layer').forEach(x => x.remove()); } catch(e){}
  setTimeout(() => celebrateNow(el, level, o), 60);
}
function celebrateNow(el, level, o){
  try {
    o = o || {};
    if (Date.now() - finAt < 450) return;
    if (typeof el === 'string') el = $(el);
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : {left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0};
    /* anchored to the page (not the viewport), so it stays on the element even if the page scrolls */
    const x = Math.min(innerWidth - 40, Math.max(40, r.left + r.width / 2)) + scrollX, y = Math.max(70, r.top + Math.min(r.height, 60) / 2 - (o.up || 0)) + scrollY;
    const big = level === 'big' || level === 'done';
    const layer = document.createElement('div'); layer.className = 'cel-layer'; layer.setAttribute('aria-hidden', 'true');
    layer.style.left = x + 'px'; layer.style.top = y + 'px'; document.body.appendChild(layer);
    const st = SFX.streak(); const cheer = o.cheer || ((!big && st >= 3) ? (st === 5 ? '🔥 5 ברצף – בוערים!' : st === 10 ? '🔥🔥 10 ברצף – אלופים!' : '🔥 ' + st + ' ברצף!') : pickNot(big ? CHEERS_B : CHEERS_S, lastCheer)); lastCheer = cheer;
    const bubble = document.createElement('div'); bubble.className = 'cel-cheer' + (big ? ' big' : ''); bubble.textContent = cheer; layer.appendChild(bubble);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && o.fx !== false) {
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

/* ---------- 🏆 finale: a WHOLE block is finished (all the tasks of a lab / playground, a 🎯 check, a quiz, a 💻 or 📌 checklist) ----------
   Course.finale(el, {perfect, key, title, sub, icon, near})
     perfect:true  = finished without a single mistake -> trophy card, gold, extra sparkle in the sound, and a ★ on the step chip (remembered).
     key:'myLab'   = remember it in state.fin[key] = {p: 0|1, s: 'topic:step'}  ->  Course.finBadge('myLab') gives the "🏆 מושלם" chip to print in the lab.
   One sound, one effect: the answer tone of the last question is replaced by the finale (see SFX), a second finale within a second is ignored.
   The effect lives in a fixed, click-through layer over the viewport (never blocks a button, never makes the page scroll); it is gone after ~2.5 s.
   prefers-reduced-motion: no confetti – only the card. */
const FIN_P = ['מושלם!', 'בלי אף טעות!', 'עבודה מושלמת!', 'מאה אחוז!', 'פיצה דני מצדיע 🍕'];
const FIN_THEMES = [
  {em: ['🍕'], col: ['#e9a23b', '#d9472b', '#f6d365', '#2d6a2d', '#c0392b']},          /* Danny's pizza: crust, sauce, cheese, basil, pepperoni */
  {em: ['⭐', '✨'], col: ['#fbbf24', '#f59e0b', '#60a5fa', '#a78bfa', '#fde68a']},
  {em: ['🎉', '🎈'], col: ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6']}
];
let lastFin = -1;
function stepRef(el){ const sp = el && el.closest ? el.closest('.spread') : null; if (!sp) return ''; for (const t of T) { const i = t.steps.indexOf(sp); if (i >= 0) return t.id + ':' + i; } return ''; }
function finMark(key, perfect, el){
  state.fin = state.fin || {}; const old = state.fin[key] || {};
  state.fin[key] = {p: perfect || old.p ? 1 : 0, s: stepRef(el) || old.s || ''}; save(); paintAced();
}
/* "🏆 מושלם" chip for a block that was finished without mistakes (remembered). Returns '' when it was not. */
function finBadge(key, text){ const r = (state.fin || {})[key]; return r && r.p ? ' <span class="fin-badge">' + (text || '🏆 מושלם') + '</span>' : ''; }
/* ★ on the chips of the steps whose block was finished perfectly – so students see what they aced */
function acedSteps(){
  const set = {};
  Object.values(state.fin || {}).forEach(r => { if (r && r.p && r.s) set[r.s] = 1; });
  Object.keys(state.cp || {}).forEach(id => { const r = state.cp[id]; if (r && r.ok === r.n) { const s = stepRef(document.getElementById(id)); if (s) set[s] = 1; } });
  return set;
}
function paintAced(){
  try {
    if (!T.length) return; const set = acedSteps(), t = T[pos.ti];
    document.querySelectorAll('#steps button[data-s]').forEach(b => { const on = !!set[t.id + ':' + b.dataset.s]; if (on === b.classList.contains('aced')) return;
      b.classList.toggle('aced', on); if (on) b.title = (b.title ? b.title + ' · ' : '') + '★ הושלם בלי טעויות'; });
  } catch(e){}
}
function finale(el, o){
  o = o || {}; if (typeof el === 'string') el = $(el);
  if (o.key) { try { finMark(o.key, !!o.perfect, el); } catch(e){} }
  if (Date.now() - finAt < 900) return;
  finAt = Date.now();
  SFX.play('finale', {perfect: !!o.perfect});
  try { document.querySelectorAll('.cel-layer, .cel-fin').forEach(x => x.remove()); } catch(e){}
  setTimeout(() => finaleNow(el, o), 60);
}
function finaleNow(el, o){
  try {
    const perfect = !!o.perfect, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
    const seen = x => { const q = x && x.getBoundingClientRect ? x.getBoundingClientRect() : null; return q && (q.width + q.height) > 0 && q.bottom > 70 && q.top < vh - 20 ? q : null; };
    const r = seen(el) || seen(o.near), vis = !!r;   /* o.near = where to show it when the block's own status line is scrolled out of view */
    const cx = vis ? Math.min(vw - 24, Math.max(24, r.left + r.width / 2)) : vw / 2;
    const cy = vis ? Math.min(vh - 60, Math.max(110, r.top + Math.min(r.height, 80) / 2)) : vh * 0.42;
    const ov = document.createElement('div'); ov.className = 'cel-fin' + (perfect ? ' perfect' : ''); ov.setAttribute('aria-hidden', 'true');
    const title = o.title || pickNot(perfect ? FIN_P : CHEERS_B, lastCheer); lastCheer = title;
    const card = document.createElement('div'); card.className = 'cel-fin-card';
    card.innerHTML = '<span class="cel-fin-ic">' + (o.icon || (perfect ? '🏆' : '🎉')) + '</span><span class="cel-fin-tx"><b>' + esc(title) + '</b>' + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span>';
    ov.appendChild(card); document.body.appendChild(ov);
    /* the card sits just above the finished block, always fully inside the viewport */
    const cw = card.offsetWidth, ch = card.offsetHeight;
    card.style.left = Math.max(12, Math.min(vw - cw - 12, cx - cw / 2)) + 'px';
    card.style.top = Math.max(64, Math.min(vh - ch - 12, cy - ch - 22)) + 'px';
    if (!reduce) confetti(ov, cx, cy, perfect);
    if (el && el.classList) { const g = perfect ? 'cel-gold' : 'cel-glow'; el.classList.remove('cel-glow', 'cel-gold'); void el.offsetWidth; el.classList.add(g); setTimeout(() => el.classList.remove(g), 1500); }
    setTimeout(() => ov.remove(), 2600);
  } catch(e){}
}
/* confetti on one canvas (cheap: no DOM nodes per piece): a fan that shoots up from the finished block and falls; perfect = two more side bursts */
function confetti(ov, cx, cy, perfect){
  const cv = document.createElement('canvas'), W = ov.clientWidth, H = ov.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!W || !H) return;
  cv.className = 'cel-fin-cv'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ov.insertBefore(cv, ov.firstChild);
  const g = cv.getContext('2d'); if (!g) return; g.scale(dpr, dpr);
  let ti; do { ti = Math.floor(Math.random() * FIN_THEMES.length); } while (ti === lastFin); lastFin = ti;
  const th = FIN_THEMES[ti], P = [], scale = Math.min(1, 0.5 + W / 1800), rnd = (a, b) => a + Math.random() * (b - a);
  function shoot(x, y, n, dir, spread, v0, v1, delay){
    for (let k = 0; k < n; k++) { const a = dir + rnd(-spread, spread), v = rnd(v0, v1);
      P.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rnd(0, 6.3), vr: rnd(-9, 9), s: rnd(6, 11), t0: delay + rnd(0, 0.1),
        em: k % 7 === 3 ? th.em[k % th.em.length] : '', c: perfect && k % 4 === 0 ? '#fbbf24' : th.col[k % th.col.length], round: k % 5 === 1}); }
  }
  shoot(cx, cy, Math.round((perfect ? 80 : 64) * scale), -Math.PI / 2, 1.2, 380, 900, 0);
  if (perfect) { shoot(W * 0.08, H, Math.round(30 * scale), -1.15, 0.4, 700, 1250, 0.28); shoot(W * 0.92, H, Math.round(30 * scale), -1.99, 0.4, 700, 1250, 0.28); }
  const T0 = performance.now(), LIFE = 2.3; let last = T0;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '22px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  (function frame(nowMs){
    if (!cv.isConnected) return;
    const t = (nowMs - T0) / 1000, dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000)); last = nowMs;
    g.clearRect(0, 0, W, H);
    if (t > LIFE) return;
    g.globalAlpha = t > LIFE - 0.6 ? Math.max(0, (LIFE - t) / 0.6) : 1;
    for (const p of P) { if (t < p.t0) continue;
      p.vy += 1500 * dt; p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 0.9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      if (p.em) g.fillText(p.em, 0, 0);
      else { g.fillStyle = p.c; if (p.round) { g.beginPath(); g.arc(0, 0, p.s / 2, 0, 6.3); g.fill(); } else g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66 * Math.abs(Math.cos(p.rot * 1.7)) + 1.5); }
      g.restore(); }
    requestAnimationFrame(frame);
  })(T0);
}

/* ---------- sequence: an animation made of steps, played automatically or "step by step"
   (the student clicks "הצעד הבא ←" for every step – time to read each caption). The mode is remembered for the whole course.
   const seq = Course.sequence(ctrlsEl, {delay}); seq.run([fn, fn, …], onEnd)  – a step may return 'stop' to end early. ---------- */
function sequence(ctrls, o){
  o = o || {}; if (typeof ctrls === 'string') ctrls = $(ctrls);
  const getMode = () => { try { return localStorage.getItem('course-seqmode') || 'manual'; } catch(e){ return 'manual'; } };
  const box = document.createElement('span'); box.className = 'seqbox';
  box.innerHTML = '<span class="seqmode" role="group" aria-label="איך להציג את השלבים"><button type="button" data-m="manual">👣 צעד אחר צעד</button><button type="button" data-m="auto">⏩ אוטומטי</button></span>' +
    '<button class="btn primary seqnext" type="button" hidden></button>';
  ctrls.appendChild(box);
  const nextBtn = box.querySelector('.seqnext');
  let steps = [], i = 0, timer = null, onEnd = null, running = false;
  function paintMode(){ box.querySelectorAll('[data-m]').forEach(b => { const on = b.dataset.m === getMode(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
  function finish(){ running = false; clearTimeout(timer); nextBtn.hidden = true; const f = onEnd; onEnd = null; if (f) f(); }
  function stepOnce(){
    if (!running) return;
    const r = steps[i++](); 
    if (r === 'stop' || i >= steps.length) return finish();
    if (getMode() === 'auto') { nextBtn.hidden = true; timer = setTimeout(stepOnce, o.delay || 2000); }
    else { nextBtn.hidden = false; nextBtn.textContent = 'הצעד הבא (' + (i + 1) + '/' + steps.length + ') ←'; }
  }
  nextBtn.addEventListener('click', () => { const had = document.activeElement === nextBtn; stepOnce(); if (had && !nextBtn.hidden) nextBtn.focus(); });
  box.querySelector('.seqmode').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    try { localStorage.setItem('course-seqmode', b.dataset.m); } catch(err){}
    document.querySelectorAll('.seqbox').forEach(x => x.dispatchEvent(new Event('seqmode')));
    if (running) { clearTimeout(timer); if (b.dataset.m === 'auto') { nextBtn.hidden = true; timer = setTimeout(stepOnce, 600); } else { nextBtn.hidden = false; nextBtn.textContent = 'הצעד הבא (' + (i + 1) + '/' + steps.length + ') ←'; } }
  });
  box.addEventListener('seqmode', paintMode); paintMode();
  return {
    run(list, end){ clearTimeout(timer); steps = list; i = 0; onEnd = end || null; running = true; stepOnce(); },
    get running(){ return running; }, mode: getMode
  };
}

/* ---------- sounds: short synthesized feedback (Web Audio – no files, nothing to download).
   'ok'  = a bright two-note "ding" that climbs a clear step (pentatonic) with every correct answer in a row (streak);
           from 3 in a row a third sparkle note is added and the cheer bubble says "🔥 N ברצף!",
   'big' = a short rising arpeggio (topic / all tasks done),
   'bad' = a soft, low two-note "hmm" – quiet and never harsh (feedback on the task, not a punishment).
   On by default; one small 🔊 button in the top bar mutes it on every lesson (localStorage 'course-sound'). ---------- */
/* ---------- every success gets a sound ----------
   Simulators and labs report their result in a ".simfb" box (".simfb ok" / ".simfb bad"). The engine listens to those boxes:
   a NEW success message plays the success tone (with the cheer bubble and the streak), a new error plays the soft "try again" tone.
   Only right after a real click / key press – never on page load. */
function simSounds(){
  let lastUser = 0, lastT = 0; const seen = new WeakMap();
  ['pointerdown', 'keydown', 'input', 'change'].forEach(ev => document.addEventListener(ev, () => { lastUser = Date.now(); }, true));
  new MutationObserver(ms => { for (const m of ms) {
    let el = m.target.nodeType === 1 ? m.target : m.target.parentElement; el = el && el.closest ? el.closest('.simfb') : null; if (!el) continue;
    const kind = el.classList.contains('ok') ? 'ok' : el.classList.contains('bad') ? 'bad' : '';
    const prev = seen.get(el) || {}, key = kind + '|' + el.textContent; if (prev.key === key) continue;
    const now = Date.now(), fresh = prev.kind !== kind || now - (prev.t || 0) > 1500;   /* typing in a field: one tone, not one per letter */
    seen.set(el, {key, kind, t: fresh ? now : prev.t});
    if (!kind || !fresh || now - lastUser > 1500 || now - lastT < 300) continue; lastT = now;
    if (kind === 'ok') celebrate(el, 'small'); else SFX.play('bad');
  } }).observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class']});
}
/* every ticked line of a checklist (💻 steps, 📌 assignment lists – anything built with label.vsck) gets a light "pip" that climbs
   with the number of ticked lines, and a small bounce. Unticking is silent. The line that completes the list gets the finale instead. */
function tickSounds(){
  document.addEventListener('change', e => {
    const cb = e.target; if (!cb || cb.type !== 'checkbox' || !cb.checked || !cb.closest) return;
    const lab = cb.closest('label.vsck'); if (!lab) return;
    lab.classList.remove('tk-pop'); void lab.offsetWidth; lab.classList.add('tk-pop');
    if (Date.now() - finAt < 300) return;
    const list = cb.closest('ol, ul'), all = list ? [...list.querySelectorAll('label.vsck input[type="checkbox"]')] : [cb], k = all.filter(x => x.checked).length;
    SFX.play('tick', {step: all.length > 1 ? Math.round(7 * (k - 1) / (all.length - 1)) : 0});
  });
}
const SFX = (() => {
  let ctx = null, combo = 0, out = null, cur = null;
  const STEPS = [0, 2, 4, 7, 9, 12, 14, 16];   /* pentatonic climb: each step is clearly higher */
  /* ONE sound at a time. Every sound plays through its own volume knob ("group"). A new sound fades the previous one out (50 ms)
     instead of piling on top of it; while a strong sound is in its first moments (HOLD), a weaker one is simply not played.
     So "last answer + whole block finished" is heard as one clean finale, never as two sounds fighting.
     The vocabulary, from light to festive:  tick < check < ok (climbs with the streak) < done < big < finale (+ sparkle when perfect). */
  const PRIO = {tick:1, bad:2, ok:2, on:2, check:2, egg:3, done:3, big:3, finale:4};
  const HOLD = {egg:0.3, done:0.35, big:0.4, finale:0.8};   /* seconds; every other sound: 0.12 (so a tick fired right after an answer tone never cuts it) */
  const LEN = {tick:0.12, bad:0.4, ok:0.6, on:0.3, check:0.5, egg:0.75, done:0.85, big:1, finale:1.25};
  const qa = (kind, what) => { if (window.__sfxLog) window.__sfxLog.push([kind, what, Date.now()]); };   /* QA hook, like __ansLog */
  const isOn = () => { try { return localStorage.getItem('course-sound') !== 'off'; } catch(e){ return true; } };
  function ac(){
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C({latencyHint:'interactive'}); } catch(e){ try { ctx = new C(); } catch(e2){ return null; } } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  /* "ready" sound: the first tone after a pause came late – the browser creates the audio engine on demand, and many
     speakers / Bluetooth headphones fall asleep after a few seconds of silence. So on the first touch of the page we
     start the engine, and keep the output awake with an inaudible low hum (about -66 dB, 40 Hz). Stops when sound is off or the tab is hidden. */
  let keep = null;
  function warm(){
    if (!isOn() || document.hidden) return;
    const c = ac(); if (!c || keep) return;
    try { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 40; g.gain.value = 0.0005; o.connect(g); g.connect(c.destination); o.start(); keep = o; } catch(e){}
  }
  function cool(){ if (keep) { try { keep.stop(); } catch(e){} keep = null; } if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, warm, {capture:true, passive:true}));
  document.addEventListener('visibilitychange', () => { if (document.hidden) cool(); });
  function tone(c, f, t0, dur, vol, type, f2){
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out || c.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  const ST = n => Math.pow(2, n / 12);
  function play(kind, opt){
    /* the streak counts even when muted (the cheer bubble shows it) */
    if (kind === 'bad') combo = 0; else if (kind === 'ok' || kind === 'big' || kind === 'done' || kind === 'finale') combo++;
    if (!isOn()) return qa(kind, 'muted');
    const c = ac(); if (!c) return; const now = c.currentTime, t = now + 0.01, pr = PRIO[kind] || 2;
    if (cur && now < cur.hold && pr < cur.prio) return qa(kind, 'skipped');
    try {
      if (cur && now < cur.end) { const gp = cur.g.gain; gp.cancelScheduledValues(now); gp.setValueAtTime(1, now); gp.linearRampToValueAtTime(0.0001, now + 0.05); }
      out = c.createGain(); out.gain.value = 1; out.connect(c.destination);
      cur = {g: out, prio: pr, hold: now + (HOLD[kind] || 0.12), end: now + (LEN[kind] || 0.6)};
    } catch(e){ out = null; cur = null; }
    qa(kind, 'played');
    try {
      if (kind === 'tick') {
        /* a light "pip" for one ticked line; opt.step (0-7) lifts it up the same pentatonic ladder, so a checklist climbs towards its finale */
        const k = ST(STEPS[Math.max(0, Math.min(STEPS.length - 1, (opt && opt.step) | 0))]);
        tone(c, 880 * k, t, 0.09, 0.075, 'sine', 880 * k * 1.12); tone(c, 440 * k, t, 0.05, 0.05, 'triangle');
      } else if (kind === 'check') {
        /* "I did it in my project": a soft stamp + two notes together (a chord, not a melody – so it is not mistaken for a right answer) */
        tone(c, 196, t, 0.1, 0.09, 'sine', 110);
        tone(c, 783.99, t + 0.03, 0.42, 0.07, 'triangle'); tone(c, 987.77, t + 0.03, 0.42, 0.07, 'triangle'); tone(c, 1567.98, t + 0.03, 0.2, 0.02, 'sine');
      } else if (kind === 'done') {
        /* warm "you finished" (a block completed, with some mistakes on the way): three calm notes, lower and slower than 'ok' */
        tone(c, 392, t, 0.2, 0.1, 'triangle'); tone(c, 523.25, t + 0.12, 0.2, 0.1, 'triangle');
        tone(c, 659.25, t + 0.24, 0.55, 0.1, 'triangle'); tone(c, 261.63, t + 0.24, 0.5, 0.05, 'sine');
      } else if (kind === 'egg') {
        /* a hidden egg: a quick "magic" run (augmented chord – the one sound in the page that says "surprise") */
        [987.77, 1244.51, 1567.98, 1975.53].forEach((f, i) => tone(c, f, t + i * 0.07, i === 3 ? 0.45 : 0.16, 0.07, 'sine'));
        tone(c, 493.88, t, 0.12, 0.04, 'triangle');
      } else if (kind === 'finale') {
        /* a whole block finished: three quick rising notes land on a full, held chord with a soft low drum under it
           (the only sound with harmony and bass – clearly bigger than any single answer). Perfect = three extra sparkles on top. About 1–1.2 s. */
        [523.25, 659.25, 783.99].forEach((f, i) => { tone(c, f, t + i * 0.075, 0.15, 0.1, 'triangle'); tone(c, f * 2, t + i * 0.075, 0.09, 0.02, 'sine'); });
        const h = t + 0.235;
        tone(c, 130.81, h, 0.16, 0.085, 'sine', 65.41);
        [[261.63, 'sine', 0.055], [392, 'triangle', 0.035], [523.25, 'triangle', 0.05], [659.25, 'triangle', 0.05], [783.99, 'triangle', 0.045], [1046.5, 'triangle', 0.058]].forEach(v => tone(c, v[0], h, 0.78, v[2], v[1]));
        tone(c, 2093, h + 0.16, 0.42, 0.03, 'sine', 3135.96);
        if (opt && opt.perfect) { tone(c, 2637.02, h + 0.42, 0.16, 0.035, 'sine'); tone(c, 3135.96, h + 0.54, 0.16, 0.035, 'sine'); tone(c, 4186.01, h + 0.66, 0.3, 0.03, 'sine'); }
      } else if (kind === 'ok') {
        const k = ST(STEPS[Math.min(combo - 1, STEPS.length - 1)]);
        tone(c, 659.25 * k, t, 0.16, 0.13, 'triangle'); tone(c, 1318.5 * k, t, 0.10, 0.03, 'sine');
        tone(c, 987.77 * k, t + 0.085, 0.30, 0.13, 'triangle'); tone(c, 1975.5 * k, t + 0.085, 0.18, 0.03, 'sine');
        if (combo >= 3) tone(c, 1318.5 * k, t + 0.17, 0.35, 0.07, 'sine', 1318.5 * k * 1.5);
      } else if (kind === 'big') {
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { tone(c, f, t + i * 0.075, i === 4 ? 0.55 : 0.2, 0.12, 'triangle'); tone(c, f * 2, t + i * 0.075, 0.12, 0.025, 'sine'); });
        tone(c, 2093, t + 0.4, 0.5, 0.035, 'sine', 2637);
      } else if (kind === 'on') {
        tone(c, 784, t, 0.12, 0.09, 'sine'); tone(c, 1046.5, t + 0.07, 0.18, 0.09, 'sine');
      } else if (kind === 'bad') {
        tone(c, 330, t, 0.13, 0.07, 'sine'); tone(c, 262, t + 0.12, 0.22, 0.07, 'sine');
      }
    } catch(e){}
  }
  function paintBtn(b){ const on = isOn(); b.textContent = on ? '🔊' : '🔇'; b.setAttribute('aria-pressed', String(!on)); b.setAttribute('aria-label', on ? 'צלילים פועלים – לחצו כדי לכבות' : 'צלילים כבויים – לחצו כדי להפעיל'); b.title = b.getAttribute('aria-label'); }
  function set(on){ try { localStorage.setItem('course-sound', on ? 'on' : 'off'); } catch(e){} document.querySelectorAll('.sndbtn').forEach(paintBtn); if (on) { play('on'); warm(); } else cool(); }
  function init(){
    const tb = $('#themeBtn'); if (!tb || $('#sndBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'sndBtn'; b.className = 'sndbtn';
    tb.parentNode.insertBefore(b, tb); paintBtn(b);
    b.addEventListener('click', () => set(!isOn()));
    let noted = false; try { noted = !!localStorage.getItem('course-sound-noted'); } catch(e){}
    if (noted) return;
    const n = document.createElement('div'); n.className = 'sndnote'; n.setAttribute('role', 'region'); n.setAttribute('aria-label', 'הודעה על צלילים');
    n.innerHTML = '<span>🔊 בדף יש <b>צלילים קצרים</b> כשמצליחים. אפשר לכבות אותם בכל רגע – בכפתור 🔊 למעלה.</span><span class="sn-b"><button class="btn" type="button" data-s="off">🔇 כבו צלילים</button><button class="btn primary" type="button" data-s="ok">👍 בסדר</button></span>';
    const hdr = document.querySelector('.topbar'); if (hdr && hdr.parentNode) hdr.parentNode.insertBefore(n, hdr.nextSibling); else document.body.prepend(n);
    n.addEventListener('click', e => { const x = e.target.closest('button[data-s]'); if (!x) return;
      try { localStorage.setItem('course-sound-noted', '1'); } catch(e){}
      if (x.dataset.s === 'off') set(false); else set(true);
      n.remove(); b.focus(); });
  }
  return {play, init, isOn, streak: () => combo};   /* play(kind[, {step, perfect}]) */
})();

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
  /* a surprise deserves its own sound; the last egg gets the finale (with the pizza rain) */
  if (n === EGGS.length) { party(); finAt = Date.now(); SFX.play('finale', {perfect: true}); } else SFX.play('egg');
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
function isActive(st){ return st.classList.contains('welcome') || st.classList.contains('act') || !!st.querySelector('.asg') || st.classList.contains('vsstep') || st.classList.contains('cpstep') ||
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
    'כדי לא לקרוא פעמיים, הפעילו <b>מצב אחרי-סרטון</b>: הכפתור "הבא" ידלג על שלבי הקריאה, ויישארו רק החלקים הפעילים – ניחושים ❓, סימולטורים ותרגול, בדיקות 🎯, שלבי 💻 והמטלה 📌. ' +
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
  paintAced();
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
      (nextLesson ? '<a class="btn primary" href="' + nextLesson + '">לשיעור הבא: ' + esc(nextName || '') + ' ←</a>' : '<a href="' + TOPIC_HOME[0] + '">🏠 חזרה לדף הבית – ' + TOPIC_HOME[1] + '</a>') + '</div>');
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
  /* one more step: the progress bar answers with a short pulse (visual only – nothing plays while reading) */
  if (paintProgress.n !== undefined && n > paintProgress.n) { const pr = $('#progBar').closest('.progress'); if (pr) { pr.classList.remove('prog-pop'); void pr.offsetWidth; pr.classList.add('prog-pop'); } }
  paintProgress.n = n;
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
  try { initTour(); } catch(e){ console.error(e); }
  document.querySelectorAll('.trouble:not([data-ready])').forEach(el => trouble(el));
  initPlayer();
  try { SFX.init(); } catch(e){}
  try { simSounds(); } catch(e){}
  try { tickSounds(); } catch(e){}
  try { paintAsgChips(); } catch(e){}
  startHooks.forEach(f => { try { f(); } catch(e){ console.error(e); } });
  try { paintVideoBox(); paintTimePlan(); const st = $('#steps'); if (st && !$('#topicTime')) { const d = document.createElement('div'); d.id = 'topicTime'; d.className = 'topictime'; st.parentNode.insertBefore(d, st.nextSibling); } show(pos.ti, pos.si, false); } catch(e){ console.error(e); }
  save();
}

window.Course = { $, esc, store, state, save, onSave: f => saveHooks.push(f), hlHtmlLine, hlCssLine, codeLines, autoCode, wireCopy,
  PIZZA_IMG, IMAGES, fakeImg, mapCss, Stage, Split, Frame, frameDoc, seg, predict, quiz, doneCheck, playground, tagIssues, newTagIssues, SFX, sequence, assignment, ASSIGN, toast, party, findEgg, start,
  checkpoint, trouble, askBox, stepName, celebrate, finale, finBadge,
  go: (id, n) => { const t = T.findIndex(x => x.id === id); if (t >= 0) show(t, (n || 1) - 1, true); } };
})();
