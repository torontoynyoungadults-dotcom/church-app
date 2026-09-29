/**
 * Step 2.13 — 음성 큐도 무음 스위치를 우회 (딸깍 소리와 같은 미디어 채널)
 * speak() 바로 앞에서: audioSession='playback' → 무음 <audio> 재생 → AudioContext resume → 무음 버퍼 → 그 다음 speak, 음량은 설정값.
 * 진짜 iPhone 의 무음 스위치는 이 시험으로 확인할 수 없고, "올바른 순서로 호출되는지"만 확인합니다.
 */
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const INIT = `(() => {
  const log = (window.__log = []);
  try { Object.defineProperty(navigator, 'audioSession', { value: { _t: 'auto', get type() { return this._t; }, set type(v) { this._t = v; log.push('session:' + v); } }, configurable: true }); } catch (e) {}
  const ap = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { log.push('audio-play'); return ap.call(this); };
  const AC = window.AudioContext;
  const cb = AC.prototype.createBufferSource;
  AC.prototype.createBufferSource = function () { const s = cb.call(this); const st = s.start.bind(s); s.start = (t) => { log.push('silent-buffer'); return st(t); }; return s; };
  const rs = AC.prototype.resume;
  AC.prototype.resume = function () { log.push('ctx-resume'); return rs.call(this); };
  const Orig = window.AudioContext; window.AudioContext = function (...a) { const c = new Orig(...a); log.push('ctx-new'); window.__ctxN = (window.__ctxN || 0) + 1; return c; }; window.AudioContext.prototype = Orig.prototype;
  const fake = { speaking: false, getVoices() { return []; }, cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {}, speak(u) { log.push('speak:' + u.text + ':session=' + navigator.audioSession.type + ':ctx=' + (window.__ctxN || 0) + ':vol=' + u.volume); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
})();`;
(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addInitScript(INIT);
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code/.test(m.text())) errs.push(m.text()); });
  await p.goto(base + '/h.html?t=tokA'); await p.click('#go');
  await L.waitTrue(p, () => document.querySelector('.pv-pg') && /1 \//.test(document.querySelector('.pv-pg').textContent), null, 8000);
  await p.click('.pv-tabbtn[data-tab="form"]'); await sleep(200);
  const log = () => p.evaluate(() => window.__log.slice());
  const clear = () => p.evaluate(() => { window.__log.length = 0; });
  const idx = (a, k) => a.findIndex((x) => x.indexOf(k) === 0);

  console.log('· 메트로놈이 멈춘 채 큐 버튼 (사용자가 누른 순간)');
  await clear();
  await p.click('.pv-fcues [data-cue="keyup"]'); await sleep(300);
  { const a = await log(); const sp = idx(a, 'speak:');
    check('음성이 나감', sp >= 0, a);
    check('말하는 순간 audioSession = playback', /session=playback/.test(a[sp]), a[sp]);
    check('무음 <audio> 재생이 음성보다 먼저', idx(a, 'audio-play') !== -1 && idx(a, 'audio-play') < sp, a);
    check('말하는 순간 AudioContext 가 이미 있음', /ctx=[1-9]/.test(a[sp]), a[sp]);
    check('무음 버퍼를 흘려 오디오 경로를 "재생 중"으로 (음성보다 먼저)', idx(a, 'silent-buffer') !== -1 && idx(a, 'silent-buffer') < sp, a);
    check('음량이 명시됨 (기본 1)', /vol=1$/.test(a[sp]), a[sp]); }

  console.log('· 음성 볼륨 설정이 실제로 적용');
  await p.click('.pv-tabbtn[data-tab="metro"]'); await sleep(150);
  const hasVol = await p.evaluate(() => !!document.querySelector('[data-o="voice"], [data-role="voice"]'));
  if (hasVol) {
    await p.evaluate(() => { const e = document.querySelector('[data-o="voice"], [data-role="voice"]'); e.value = 0.5; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.click('.pv-tabbtn[data-tab="form"]'); await sleep(150); await clear();
    await p.click('.pv-fcues [data-cue="prayer"]'); await sleep(300);
    { const a = await log(); const sp = idx(a, 'speak:'); check('음성 볼륨 0.5 가 utterance.volume 에 반영', sp >= 0 && /vol=0\.5$/.test(a[sp]), a); }
  } else console.log('  (음성 볼륨 입력 없음 — 건너뜀)');

  console.log('· 메트로놈이 도는 중 예약된 큐 (setTimeout 으로 나가는 음성)');
  await p.click('.pv-tabbtn[data-tab="metro"]'); await sleep(150);
  await p.click('[data-role="toggle"]'); await sleep(900);
  await p.click('.pv-tabbtn[data-tab="form"]'); await sleep(100); await clear();
  await p.click('.pv-fcues [data-cue="keyup"]'); await sleep(4500);
  { const a = await log(); const sp = idx(a, 'speak:');
    check('예약된 음성도 나감', sp >= 0, a);
    check('예약 음성 직전에도 무음 버퍼 + 무음 <audio> 를 다시 건드림', a.slice(0, sp).includes('silent-buffer') && a.slice(0, sp).includes('audio-play'), a); }
  await p.click('.pv-tabbtn[data-tab="metro"]'); await sleep(150); await p.click('[data-role="toggle"]'); await sleep(200);

  check('잔여 오류 없음', errs.length === 0, errs);
  await br.close(); S.server.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
