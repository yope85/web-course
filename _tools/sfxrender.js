// Renders the REAL engine sounds (Course.SFX) offline to a WAV file, so they can be heard and measured.
// usage: node sfxrender.js out.wav "ok*15,bad,ok*3" [gap=0.85]
const { chromium } = require('playwright'); const fs = require('fs');
const [out, seqArg, gapArg] = process.argv.slice(2); const gap = +(gapArg || 0.85);
const seq = seqArg.split(',').flatMap(x => { const [k, n] = x.split('*'); return Array(+(n || 1)).fill(k); });
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  const total = seq.length * gap + 2;
  await ctx.addInitScript(total => {
    localStorage.setItem('course-sound-noted', '1'); localStorage.setItem('course-sound', 'on');
    const off = new OfflineAudioContext(1, Math.ceil(44100 * total), 44100); window.__off = off; window.__t = 0;
    class FakeAC { constructor(){ this.state = 'running'; } get currentTime(){ return window.__t; } get destination(){ return off.destination; }
      createOscillator(){ return off.createOscillator(); } createGain(){ return off.createGain(); } resume(){ return Promise.resolve(); } suspend(){ return Promise.resolve(); } }
    window.AudioContext = FakeAC; window.webkitAudioContext = FakeAC;
  }, total);
  const pg = await ctx.newPage(); await pg.route(/fonts\./, r => r.abort());
  await pg.goto('http://localhost:8812/intro.html'); await pg.waitForTimeout(300);
  const res = await pg.evaluate(async ({seq, gap}) => {
    seq.forEach((k, i) => { window.__t = 0.2 + i * gap; Course.SFX.play(k); });
    const buf = await window.__off.startRendering(); const d = buf.getChannelData(0);
    let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
    // per-event spectral centroid (brightness) via a simple DFT on 4096 samples after each onset
    const N = 4096, cents = seq.map((k, i) => { const s0 = Math.round((0.2 + i * gap + 0.02) * 44100); let num = 0, den = 0;
      for (let f = 50; f < 8000; f += 25) { let re = 0, im = 0; for (let n = 0; n < N; n += 2) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N), x = d[s0 + n] * w, a = 2 * Math.PI * f * n / 44100; re += x * Math.cos(a); im -= x * Math.sin(a); } const m = Math.hypot(re, im); num += f * m; den += m; }
      return Math.round(num / (den || 1)); });
    const pcm = new Int16Array(d.length); const g = 0.9 / (peak || 1) > 1 ? 1 : 0.9 / peak; for (let i = 0; i < d.length; i++) pcm[i] = Math.max(-32767, Math.min(32767, d[i] * g * 32767));
    let bin = ''; const u8 = new Uint8Array(pcm.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return {peak, cents, b64: btoa(bin)};
  }, {seq, gap});
  const data = Buffer.from(res.b64, 'base64'); const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(44100, 24); h.writeUInt32LE(88200, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(out, Buffer.concat([h, data]));
  console.log('peak', res.peak.toFixed(3), '| brightness (Hz) per sound:', seq.map((k, i) => k + ':' + res.cents[i]).join(' '));
  await b.close();
})();
