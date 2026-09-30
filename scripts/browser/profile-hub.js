/**
 * 찬양 허브 성능 측정 (개발용 — 시험 아님)
 *   NODE_PATH=$(npm root -g) PORT=4195 node scripts/browser/profile-hub.js [cpu배율]
 *  · 날짜 바꾸기(처음 · 다시) · 세션/연습 시작 까지 걸린 시간과 메인 스레드를 50ms 넘게 붙잡은 일(long task)을 잽니다.
 *  · 아이패드처럼 느린 기기를 흉내 내려고 CPU 를 느리게 (기본 4배)
 */
process.env.PORT = process.env.PORT || '4195';
const L = require('./e2e-lib'); const { sleep } = L;
require('./e2e-full-server.js');
const { mkpdf, SAMPLE } = require('./mkpdf');
const { mkpng } = require('./mkpng');
const BASE = 'http://127.0.0.1:' + process.env.PORT, KEY = 'ADM';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const RATE = +(process.argv[2] || 4);
const DATES = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'];
(async () => {
  await sleep(1200);
  const pdfUrl = 'data:application/pdf;base64,' + mkpdf(SAMPLE).toString('base64');
  const big = mkpng(3024, 4032);                   // 휴대폰으로 찍은 악보 사진 크기
  const pngUrl = 'data:image/png;base64,' + big.toString('base64');
  DATES.forEach((d, i) => {
    run((api) => api.saveWorshipSongs(KEY, d, '콘티', [1, 2, 3, 4, 5].map((n) => ({ title: '곡 ' + n + ' ' + i, team: '팀', key: 'G', bpm: '72', form: 'V1-C-V2-C-B-C', link: '', note: '@일렉 솔로', solo: [] }))));
    run((api) => api.uploadWorshipSheet(KEY, d, '곡 1 ' + i + '.pdf', pdfUrl, '콘티'));
    run((api) => api.uploadWorshipSheet(KEY, d, '곡 2 ' + i + '.png', pngUrl, '콘티'));
    run((api) => api.uploadWorshipSheet(KEY, d, '곡 3 ' + i + '.png', pngUrl, '콘티'));
  });
  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.addInitScript(() => {
    window.__lt = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  });
  await page.goto(BASE + '/?page=worship&key=' + KEY);
  await L.waitTrue(page, () => window.W && window.D, null, 20000);
  await sleep(3500);                              // 첫 화면 + 미리 받기가 끝날 때까지
  const lt = () => page.evaluate(() => { const x = window.__lt.slice(); window.__lt.length = 0; return x; });
  await lt();
  async function measure(label, fn, doneFn, ms) {
    await lt();
    const t0 = Date.now();
    await page.evaluate(fn);
    const ok = await L.waitTrue(page, doneFn, null, ms || 15000);
    const dt = Date.now() - t0;
    await sleep(600);
    const tasks = await lt();
    const tot = tasks.reduce((a, b) => a + b.d, 0), max = tasks.reduce((a, b) => Math.max(a, b.d), 0);
    console.log(label.padEnd(34), (ok ? '' : '(시간 초과) ') + dt + 'ms', '· long task', tasks.length + '개 합', tot + 'ms 최대', max + 'ms');
  }
  for (const d of DATES.slice(1)) await measure('날짜 바꾸기 → ' + d, `goWeek('${d}')`, `window.W && W.date==='${d}' && document.querySelectorAll('.song.card').length>=5`);
  for (const d of DATES) await measure('다시 (캐시) → ' + d, `goWeek('${d}')`, `window.W && W.date==='${d}' && document.querySelectorAll('.song.card').length>=5`);
  await measure('세션/연습 시작 (PDF)', `openPractice('')`, `(function(){var l=document.querySelector('.pv-loading');return l&&l.style.display==='none'})()`);
  await measure('다음 악보 (큰 사진)', `YNPractice.current().P ? 0 : 0; document.querySelector('.pv-sheetsel').value='1'; document.querySelector('.pv-sheetsel').onchange()`, `(function(){var l=document.querySelector('.pv-loading');return l&&l.style.display==='none'})()`);
  await measure('메트로놈 탭 열기', `document.querySelector('[data-tab="metro"]') && document.querySelector('[data-tab="metro"]').click()`, `!!document.querySelector('[data-pane="metro"] *')`);
  await measure('닫기', `YNPractice.close()`, `!document.querySelector('.pv')`);
  await measure('세션/연습 다시 시작', `openPractice('')`, `(function(){var l=document.querySelector('.pv-loading');return l&&l.style.display==='none'})()`);
  await page.evaluate(() => YNPractice.close());
  if (process.env.PROF) {
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
    const what = process.env.PROF;
    if (/w/.test(what)) { for (let i = 0; i < 3; i++) { await page.evaluate(`goWeek('${DATES[1]}')`); await sleep(400); await page.evaluate(`goWeek('${DATES[0]}')`); await sleep(400); } }
    if (/p/.test(what)) { await page.evaluate(`openPractice('')`); await sleep(3000); }
    if (/i/.test(what)) { await page.evaluate(`openPractice('')`); await sleep(3000); await page.evaluate(`document.querySelector('.pv-sheetsel').value='2'; document.querySelector('.pv-sheetsel').onchange()`); await sleep(3000); }
    const { profile } = await cdp.send('Profiler.stop');
    const self = {}; const byId = {}; profile.nodes.forEach((n) => { byId[n.id] = n; });
    const dts = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId[id]; const k = n.callFrame.functionName + ' ' + n.callFrame.url.replace(/.*\//, '') + ':' + n.callFrame.lineNumber; self[k] = (self[k] || 0) + (dts[i] || 0) / 1000; });
    Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(Math.round(v) + 'ms', k));
  }
  await br.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
