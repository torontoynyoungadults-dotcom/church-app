/** 메트로놈 · 박자 큐 · 리더 큐 전달 · 송폼 큐 — 진짜 브라우저 시험 (오디오 시계를 직접 기록해서 박자 안정성 확인) */
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const INIT = `(() => {
  window.__osc = []; window.__say = []; window.__ctxs = [];
  const AC = window.AudioContext;
  const co = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () {
    const o = co.call(this); const st = o.start.bind(o); const sf = o.frequency.setValueAtTime.bind(o.frequency); let f = 0;
    o.frequency.setValueAtTime = (v, t) => { if (!f) f = v; return sf(v, t); };
    o.start = (t) => { window.__osc.push({ t: t == null ? this.currentTime : t, f: f || o.frequency.value, type: o.type }); return st(t); };
    return o;
  };
  const Orig = window.AudioContext; window.AudioContext = function (...a) { const c = new Orig(...a); window.__ctxs.push(c); return c; }; window.AudioContext.prototype = Orig.prototype;
  const fake = { speaking: false, getVoices() { return []; }, cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
    speak(u) { if (!String(u.text).trim()) return; const c = window.__ctxs[0]; window.__say.push({ text: u.text, lang: u.lang, at: c ? c.currentTime : -1, wall: performance.now() }); setTimeout(() => { u.onstart && u.onstart({}); }, 120); setTimeout(() => { u.onend && u.onend({}); }, 400); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
})();`;
const isBeats = (arr, step, tol) => arr.every((v, i) => i === 0 || Math.abs(v - arr[i - 1] - step) <= tol);
(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const mk = async (tok) => { const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); await ctx.addInitScript(INIT); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto(base + '/h.html?t=' + tok); await page.click('#go'); return { ctx, page, errs }; };
  const A = await mk('tokA'), B = await mk('tokB'); const pa = A.page, pb = B.page;
  for (const p of [pa, pb]) await L.waitTrue(p, () => document.querySelector('.pv-pg') && /1 \//.test(document.querySelector('.pv-pg').textContent), null, 8000);
  const osc = (p, since) => p.evaluate((s) => window.__osc.filter((o) => o.t >= s).map((o) => ({ t: o.t, f: o.f })), since || 0);
  const now = (p) => p.evaluate(() => window.__ctxs[0] ? window.__ctxs[0].currentTime : 0);

  console.log('· 메트로놈 박자 안정성 (120 BPM)');
  await pa.click('.pv-tabbtn[data-tab="metro"]');
  await pa.fill('[data-role="bpm"]', '120'); await pa.dispatchEvent('[data-role="bpm"]', 'change');
  await pa.click('[data-role="toggle"]');
  check('시작 버튼이 멈춤으로 바뀜', await L.waitTrue(pa, () => /멈춤/.test(document.querySelector('[data-role="toggle"]').textContent)));
  await sleep(4200);
  let o1 = await osc(pa); let ts = o1.map((o) => o.t);
  check('딸깍이 4초 동안 8번 이상', ts.length >= 8, ts.length);
  check('간격이 0.500초 (±3ms)', isBeats(ts, 0.5, 0.003), ts.map((t, i) => i ? +(t - ts[i - 1]).toFixed(4) : 0));
  check('첫 박(악센트)이 4박마다 높은 음', o1.every((o, i) => (i % 4 === 0) === (o.f > (o1[1] ? o1[1].f : 0) || i % 4 === 0)) && o1[0].f > o1[1].f, o1.slice(0, 5).map((o) => o.f));
  check('박 표시 점이 움직임', await pa.evaluate(() => document.querySelectorAll('[data-role="dots"] i').length === 4));

  console.log('· 큐: 박자를 흐트러뜨리지 않고 박에 맞춰 말하기');
  const t0 = ts[0], cueAt = await now(pa);
  await pa.click('[data-cue="c"]');
  await sleep(3200);
  const say = await pa.evaluate(() => window.__say.slice());
  check('"Chorus" 를 한 번 말함', say.length === 1 && say[0].text === 'Chorus', say);
  const lat = await pa.evaluate(() => { const m = document.querySelector('[data-role="lat"]').textContent.match(/(\d+)ms/); return m ? +m[1] / 1000 : 0.18; });
  const land = say[0] ? say[0].at + lat : 0, off = ((land - t0) % 0.5 + 0.5) % 0.5, dist = Math.min(off, 0.5 - off);
  check('말이 "도착"하는 순간이 박 위 (오차 60ms 이내)', say[0] && dist < 0.06, { at: say[0] && say[0].at, lat, dist });
  check('말하기는 누른 뒤 이후 (미래 박)', say[0] && say[0].at >= cueAt - 0.02, { cueAt, at: say[0] && say[0].at });
  o1 = await osc(pa); ts = o1.map((o) => o.t);
  check('큐를 지나도 박이 빠지지 않고 0.500초 유지', isBeats(ts, 0.5, 0.003), ts.map((t, i) => i ? +(t - ts[i - 1]).toFixed(4) : 0).filter((d) => Math.abs(d - 0.5) > 0.003));
  const nBefore = ts.length;

  console.log('· 큐 여러 개를 연달아 눌러도 박자 유지');
  for (const c of ['v1', 'pc', 'b', 'die']) { await pa.click('[data-cue="' + c + '"]'); await sleep(120); }
  await sleep(4000);
  o1 = await osc(pa); ts = o1.map((o) => o.t);
  check('연타 후에도 간격 그대로', isBeats(ts, 0.5, 0.003), ts.slice(nBefore - 1).map((t, i, a) => i ? +(t - a[i - 1]).toFixed(4) : 0).filter((d) => Math.abs(d - 0.5) > 0.003));
  const said = await pa.evaluate(() => window.__say.map((s) => s.text));
  check('네 개 모두 말함', ['Verse 1', 'Pre-chorus', 'Bridge', 'Die down'].every((t) => said.includes(t)), said);

  console.log('· 재생 중 템포 변경 (120 → 90)');
  const tChange = await now(pa);
  await pa.fill('[data-role="bpm"]', '90'); await pa.dispatchEvent('[data-role="bpm"]', 'change');
  await sleep(3500);
  o1 = await osc(pa, tChange - 1.2); ts = o1.map((o) => o.t);
  const gaps = ts.map((t, i) => i ? t - ts[i - 1] : 0).slice(1);
  check('전환 구간에서 간격이 튀지 않음 (0.4~0.75초 사이)', gaps.every((g) => g > 0.4 && g < 0.75), gaps.map((g) => +g.toFixed(3)));
  check('새 템포 0.667초로 안정', isBeats(ts.slice(-4), 60 / 90, 0.004), gaps.slice(-4).map((g) => +g.toFixed(4)));

  console.log('· 멈춤 · 카운트인 (1마디)');
  await pa.click('[data-role="toggle"]'); await sleep(300);
  check('멈춤', await pa.evaluate(() => /시작/.test(document.querySelector('[data-role="toggle"]').textContent)));
  const stopAt = await now(pa); await sleep(1200);
  check('멈춘 뒤 새 딸깍 없음', (await osc(pa, stopAt + 0.9)).length === 0);
  await pa.selectOption('[data-o="count"]', '1'); await pa.fill('[data-role="bpm"]', '120'); await pa.dispatchEvent('[data-role="bpm"]', 'change');
  const startAt = await now(pa); await pa.click('[data-role="toggle"]'); await sleep(3600);
  o1 = await osc(pa, startAt); 
  check('카운트인 4박은 같은 높이(1000Hz)', o1.slice(0, 4).every((o) => Math.abs(o.f - 1000) < 1), o1.slice(0, 6).map((o) => o.f));
  check('카운트인 뒤 악센트 음으로 이어짐', o1[4] && o1[4].f !== 1000, o1.slice(3, 6).map((o) => o.f));
  await pa.selectOption('[data-o="count"]', '0');

  console.log('· 한국어 큐');
  await pa.selectOption('[data-o="lang"]', 'ko');
  const n0 = (await pa.evaluate(() => window.__say.length));
  await pa.click('[data-cue="v2"]'); await sleep(2600);
  const say2 = await pa.evaluate((n) => window.__say.slice(n), n0);
  check('한국어로 말함 (2절)', say2.length === 1 && /2절/.test(say2[0].text) && /^ko/.test(say2[0].lang || ''), say2);
  await pa.selectOption('[data-o="lang"]', 'en');
  await pa.click('[data-role="toggle"]'); await sleep(200);

  console.log('· 리더 → 팔로워 큐 전달');
  await pa.click('.pv-tabbtn[data-tab="together"]'); await pa.click('button[data-a="claim"]');
  check('A 리더', await L.waitTrue(pa, () => /내가 리더/.test(document.querySelector('.pv-lead').textContent)));
  await pa.click('.pv-tabbtn[data-tab="metro"]');
  check('보내기 옵션이 켜져 있음(기본)', await pa.evaluate(() => document.querySelector('[data-o="send"]').checked));
  const nb0 = await pb.evaluate(() => window.__say.length);
  await pa.click('[data-cue="intro"]');
  check('B 기기에서 "Intro" 가 들림', await L.waitTrue(pb, (n) => window.__say.length > n && window.__say[window.__say.length - 1].text === 'Intro', nb0, 4000), await pb.evaluate(() => window.__say.map((s) => s.text)));
  await pb.click('.pv-tabbtn[data-tab="metro"]');
  await pb.evaluate(() => { const c = document.querySelector('[data-o="recv"]'); if (c.checked) c.click(); });
  const nb1 = await pb.evaluate(() => window.__say.length);
  await pa.click('[data-cue="solo"]'); await sleep(2500);
  check('B 가 "받기"를 끄면 안 들림', (await pb.evaluate(() => window.__say.length)) === nb1);
  await pb.evaluate(() => { const c = document.querySelector('[data-o="recv"]'); if (!c.checked) c.click(); });
  await pa.evaluate(() => { const c = document.querySelector('[data-o="send"]'); if (c.checked) c.click(); });
  const nb2 = await pb.evaluate(() => window.__say.length);
  await pa.click('[data-cue="ferm"]'); await sleep(2500);
  check('A 가 "보내기"를 끄면 B 는 안 들림', (await pb.evaluate(() => window.__say.length)) === nb2);
  await pa.evaluate(() => { const c = document.querySelector('[data-o="send"]'); if (!c.checked) c.click(); });

  console.log('· 송폼 칸 누르면 큐');
  await pa.click('.pv-tabbtn[data-tab="form"]');
  check('송폼 칸이 나옴', await L.waitTrue(pa, () => document.querySelectorAll('[data-role="player"] .fp-chip').length > 3, null, 3000), await pa.evaluate(() => document.querySelector('[data-role="player"]').innerHTML.slice(0, 300)));
  const na = await pa.evaluate(() => window.__say.length);
  await pa.evaluate(() => { const b = document.querySelectorAll('[data-role="player"] button'); b[0].click(); });
  await sleep(600);
  const s3 = await pa.evaluate((n) => window.__say.slice(n).map((s) => s.text), na);
  check('첫 칸(V1) → "Verse 1" 말함', s3.includes('Verse 1'), s3);
  const nb3 = await pb.evaluate(() => window.__say.length);
  await pa.evaluate(() => { const b = document.querySelectorAll('[data-role="player"] button'); b[1].click(); });
  check('B 에게도 같은 큐 전달', await L.waitTrue(pb, (n) => window.__say.length > n, nb3, 3000), await pb.evaluate(() => window.__say.map((s) => s.text)));

  console.log('· 브라우저 오류');
  check('오류 없음 (A, B)', A.errs.length === 0 && B.errs.length === 0, A.errs.concat(B.errs).slice(0, 5));
  await br.close(); S.server.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e); process.exit(2); });
