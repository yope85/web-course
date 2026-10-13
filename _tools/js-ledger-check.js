// js-ledger-check.js page  – concept ledger, mechanically: no term appears (anywhere in a step's full text, hidden parts included)
// before the step that teaches it. Run dump.js first: node dump.js <page>. The LEDGER below grows with every topic.
// A hit is a QUESTION for the manager, not a verdict: "מזכירים עכשיו, מלמדים אחר כך" is allowed only in an explicit sentence.
const fs = require('fs'), path = require('path');
const page = process.argv[2] || 'js-basics-draft';
const f = path.join(__dirname, '..', 'tools', 'dump', page + '.txt');
const file = fs.existsSync(f) ? f : '/home/claude/tools/dump/' + page + '.txt';
const txt = fs.readFileSync(file, 'utf8');
const parts = txt.split(/^----- #(\S+) \[[^\]]*\] -----$/m); // [pre, id1, body1, id2, body2 …]
const steps = []; for (let i = 1; i < parts.length; i += 2) steps.push({id: parts[i], body: parts[i + 1]});
// the hidden strings that live in the lesson script (predict answers, 🔨 explanations, hints, solutions, 🎯) belong to a step by the marker comment  /* ---- topic-N · … ---- */
const si = txt.indexOf('======== סקריפטים בדף');
if (si >= 0) { const sc = txt.slice(si).split(/\/\* ---- ([a-z]+-\d+) · [^\n]*?---- \*\//); for (let i = 1; i < sc.length; i += 2) { const st = steps.find(x => x.id === sc[i]); if (st) st.body += '\n' + sc[i + 1]; else if (!/^ignore/.test(sc[i])) console.log('marker without a step: ' + sc[i]); } }
const idx = id => { const k = steps.findIndex(s => s.id === id); return k < 0 ? 1e9 : k; };
// [regex, id of the step that teaches it]   (1e9 = not taught yet in this page)
const LEDGER = [
  [/alert\(/, 'intro-3'], [/<script/i, 'intro-3'], [/נקודה-פסיק/, 'intro-3'],
  [/console\.log/, 'intro-5'],
  [/SyntaxError|ReferenceError|TypeError|שגיאת תחביר|שגיאת ריצה/, 'intro-6'],
  [/document\.write|\bdocument\b/, 'intro-7'],
  [/\/\/|\/\*|\*\//, 'intro-9'], [/הערה|הערות/, 'intro-9'],
  [/\bsrc=|wwwroot\/js|\.js\b|קובץ js|קובץ נפרד/, 'intro-10'],
  // taught in later topics (not yet in this page)
  [/\blet\b|\bvar\b|משתנה|משתנים/, 'later'], [/\bprompt\b/, 'later'], [/parseInt|parseFloat/, 'later'], [/\bNaN\b/, 'later'],
  [/\bnull\b|\bundefined\b|typeof/, 'later'], [/\bif\b|\belse\b|\bswitch\b|\bwhile\b|\bfor \(|תנאי|לולאה|לולאות/, 'later'], [/מחרוזת|שרשור/, 'later'], [/פונקציה|פונקציות/, 'later']
];
let bad = 0;
steps.forEach((s, k) => LEDGER.forEach(([re, at]) => {
  if (idx(at) <= k) return;
  if (at === 'later' && s.id === 'intro-1') return; // the opening step is an overview of the whole lesson
  const m = re.exec(s.body); if (!m) return;
  bad++; const i = Math.max(0, m.index - 40);
  console.log(`#${s.id}  "${m[0]}" (נלמד ב-${at})  …${s.body.slice(i, m.index + 50).replace(/\s+/g, ' ')}…`);
}));
console.log(bad ? `\n${bad} מקרים לבדיקה` : 'ledger clean');
