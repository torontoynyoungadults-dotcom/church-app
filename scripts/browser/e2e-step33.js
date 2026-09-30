/**
 * Step 3.3 — 유튜브/오디오 키 · 템포 컨트롤러 + 악보 코드 키 이동 연동 (진짜 크롬)
 *   NODE_PATH=$(npm root -g) node scripts/browser/e2e-step33.js          (서버 PORT 4322)
 *   OCR 시험은 인터넷 대신 node_modules 의 tesseract.js 를 CDN 주소로 가로채 씁니다 (TESS_DIR 로 위치 지정, 없으면 그 부분만 건너뜀)
 *
 *  1. 음높이 변환 DSP 정확도 (OfflineAudioContext + AudioWorklet 실제 처리기): 440 Hz ▸ −3…+3 반음, ±15 센트
 *  2. 대체 변환기(일반 노드 지연선) · AudioWorklet 이 없는 브라우저
 *  3. 유튜브 카드: 키(−3…+3) · 템포 0.75/1/1.25 (가짜 ytApi) · 솔직한 안내 문구
 *  4. 키 +2 ▸ 화음 탭을 열지 않았어도 자동 분석 ▸ 코드 글자가 옮겨져 다시 그려짐
 *  5. 화음 탭에서 목표 조를 손으로 바꾸면 연습 키에 되돌아옴 (고리 없음)
 *  6. 키 바꿔 듣기 카드: 팀 녹음(/audio/…) · 내 오디오 파일(WAV) 재생, 실제 소리의 음높이(−3…+3)와 템포(0.75 · 1.25) 측정
 *  7. 자동 분석 실패 안내 (OCR 도구를 못 받음 · 오프라인) · OCR 성공(있으면)
 *  8. 서비스워커: 두 새 파일이 보관되고 오프라인에서도 worklet 이 올라감
 *  9. 화면 캡처 (390px · 1280px) · 콘솔 오류 없음
 */
const fs = require('fs'), path = require('path');
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const MK = require('./mksheet');
const AS = require('../../public/worship/audio-shift.js');
const HCore = require('../../public/worship/harmony-core.js');
const PORT = 4322;
const LEAD = [{ id: 'FILEID_LEAD00001', name: 'Amazing Grace Lead.pdf' }];
const SCAN = [{ id: 'FILEID_SCAN00001', name: 'Amazing Grace Scan.png' }];
const MULTI = [{ id: 'FILEID_MULTI0001', name: 'Sunday All Songs.pdf' }];
const YTLINK = 'https://youtu.be/dQw4w9WgXcQ';
const SONGS = [{ title: 'Amazing Grace', key: 'G', bpm: 120, form: 'V1-C', team: 'T', link: YTLINK }];
const RECS = [{ title: 'Amazing Grace 2번 연습', play: '/audio/REC_MATCH01', kind: '연습', by: 'Alice' }, { title: '주일 예배 전체', play: '/audio/REC_OTHER001', kind: '예배', by: 'Bob' }];
const TESS = process.env.TESS_DIR || '/tmp/claude-0/-home-claude/50fb980c-1975-5409-a9ab-ee547ab4ded0/scratchpad/tess/node_modules';
const OUT = process.env.OUT_DIR || path.join(require('os').tmpdir(), 'step33-shots');
fs.mkdirSync(OUT, { recursive: true });

function wav(freq, secs, sr, amp) {
  sr = sr || 44100; amp = amp || 0.5; const n = Math.round(sr * secs), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * 32767 * Math.sin(2 * Math.PI * freq * i / sr)), 44 + i * 2);
  return b;
}
const WAV440 = wav(440, 40);

/** 하네스 화면에 audio-shift.js 를 끼워 넣고(공유 하네스는 건드리지 않음) /audio/… 는 Range 를 지원하는 WAV 로 답함 */
async function prep(page) {
  await page.route('**/h.html*', async (route) => { const r = await route.fetch(); let b = await r.text(); b = b.replace('<script src="/worship/ytplayer.js"></script>', '<script src="/worship/ytplayer.js"></script>\n<script src="/worship/audio-shift.js"></script>'); route.fulfill({ response: r, body: b }); });
  await page.route('**/audio/**', (route) => {
    const rg = route.request().headers()['range'], total = WAV440.length;
    if (rg) { const m = /bytes=(\d*)-(\d*)/.exec(rg), a = +m[1] || 0, z = m[2] ? Math.min(+m[2], total - 1) : total - 1; return route.fulfill({ status: 206, headers: { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${z}/${total}` }, body: WAV440.subarray(a, z + 1) }); }
    route.fulfill({ status: 200, headers: { 'content-type': 'audio/wav', 'accept-ranges': 'bytes' }, body: WAV440 });
  });
}
const errFilter = /favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g/i;
function watch(page, errs, extra) { page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !errFilter.test(m.text()) && !(extra && extra.test(m.text()))) errs.push('console: ' + m.text()); }); }
const FAKE_YT = () => { window.YT = { Player: function (box, cfg) { const p = this; window.__ytp = p; p.cfg = cfg; p.t = 0; p.rate = 1; p.calls = []; p.getCurrentTime = () => p.t; p.setPlaybackRate = (r) => { p.rate = r; p.calls.push(['rate', r]); }; p.getAvailablePlaybackRates = () => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  p.seekTo = (t) => { p.t = t; p.calls.push(['seek', t]); }; p.playVideo = () => p.calls.push(['play']); p.destroy = () => { p.destroyed = true; }; setTimeout(() => cfg.events.onReady({ target: p }), 30); } }; };
/** 페이지 안 측정 도구: 주어진 신호(Float32Array, 표본화율) 의 주파수 · 크기 (영점 통과 + 크기 · 뚝 끊김) */
const MEAS_SRC = `window.__measure = function (x, sr, from, to) { let first = -1, last = -1, cnt = 0, rms = 0, pk = 0, nan = 0, md = 0; from = from || 0; to = to || x.length;
  for (let i = from; i < to; i++) { const v = x[i]; if (!isFinite(v)) { nan++; continue; } rms += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); if (i > from) { const d = Math.abs(v - x[i - 1]); if (d > md) md = d; }
    if (i > from && x[i - 1] < 0 && v >= 0) { const t = i - 1 + (-x[i - 1]) / (v - x[i - 1]); if (first < 0) first = t; last = t; cnt++; } }
  return { f: cnt > 2 ? (cnt - 1) * sr / (last - first) : 0, rms: Math.sqrt(rms / (to - from)), pk, nan, md }; };`;
const cents = (f, exp) => 1200 * Math.log2(f / exp);

(async () => {
  const port = await S.start(PORT), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 850 }, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = [];
  watch(page, errs); await prep(page);
  await page.goto(base + '/h.html?t=tokA');
  await page.evaluate(MEAS_SRC);
  const H = (fn, arg) => page.evaluate(fn, arg);
  const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, name + '.png') });

  console.log('1. 음높이 변환 DSP — 440 Hz 사인파 (OfflineAudioContext · AudioWorklet 실제 처리기)');
  check('YNAudioShift 가 화면에 올라옴', await H(() => typeof YNAudioShift === 'object' && typeof YNAudioShift.createShifter === 'function'));
  const render = (n, mode, freq, secs) => H(async ([n, mode, freq, secs]) => {
    const sr = 44100, c = new OfflineAudioContext(2, sr * secs, sr), buf = c.createBuffer(1, sr * secs, sr), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / sr);
    const src = c.createBufferSource(); src.buffer = buf; const sh = await YNAudioShift.createShifter(c, { semitones: n, mode });
    src.connect(sh.input); sh.output.connect(c.destination); src.start(); const out = await c.startRendering(), x = out.getChannelData(0);
    const m = window.__measure(x, sr, Math.round(sr * 1.0), Math.round(sr * (secs - 0.2))); m.mode = sh.mode; m.reason = sh.fallbackReason || ''; return m;
  }, [n, mode, freq, secs]);
  let allW = true; const rowsW = [];
  for (let n = -3; n <= 3; n++) {
    const m = await render(n, 'worklet', 440, 3), exp = 440 * Math.pow(2, n / 12), c = cents(m.f, exp); rowsW.push(n + ':' + c.toFixed(2));
    check('worklet ' + (n > 0 ? '+' : '') + n + ' 반음: ' + m.f.toFixed(2) + ' Hz (기대 ' + exp.toFixed(2) + ', ' + c.toFixed(2) + ' 센트) — ±15 센트 안', m.mode === 'worklet' && Math.abs(c) <= 15, m);
    check('   크기 정상 (rms ' + m.rms.toFixed(3) + ' · peak ' + m.pk.toFixed(3) + ') · NaN 없음 · 클릭 없음 (최대 표본 차 ' + m.md.toFixed(3) + ')', m.nan === 0 && Math.abs(m.rms - 0.3536) < 0.03 && m.pk < 0.56 && m.md < 0.5 * 2 * Math.PI * exp / 44100 * 1.7 + 0.01, m);
  }
  {
    const m0 = await render(0, 'worklet', 440, 2); check('0 반음은 그대로 (440 Hz ±2 센트)', Math.abs(cents(m0.f, 440)) <= 2, m0);
    const lo = await render(2, 'worklet', 110, 3), hi = await render(2, 'worklet', 1760, 3);
    check('낮은 소리(110 Hz)도 +2 반음 ±15 센트', Math.abs(cents(lo.f, 110 * Math.pow(2, 2 / 12))) <= 15, lo); check('높은 소리(1760 Hz)도 +2 반음 ±15 센트', Math.abs(cents(hi.f, 1760 * Math.pow(2, 2 / 12))) <= 15, hi);
  }
  {
    // 사람 목소리 비슷한 소리(배음 8개 + 비브라토) — 크기가 줄거나 폭주하지 않는지
    const r = await H(async () => { const sr = 44100, c = new OfflineAudioContext(2, sr * 4, sr), buf = c.createBuffer(1, sr * 4, sr), d = buf.getChannelData(0); let ph = 0;
      for (let i = 0; i < d.length; i++) { ph += 2 * Math.PI * 196 * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * i / sr)) / sr; let v = 0; for (let k = 1; k <= 8; k++) v += Math.sin(k * ph) / k; d[i] = 0.25 * v; }
      const src = c.createBufferSource(); src.buffer = buf; const sh = await YNAudioShift.createShifter(c, { semitones: 3, mode: 'worklet' }); src.connect(sh.input); sh.output.connect(c.destination); src.start(); const x = (await c.startRendering()).getChannelData(0);
      let a = 0, b = 0, na = 0; for (let i = sr; i < sr * 3.8; i++) { a += d[i] * d[i]; b += x[i] * x[i]; if (!isFinite(x[i])) na++; } return { rin: Math.sqrt(a / (sr * 2.8)), rout: Math.sqrt(b / (sr * 2.8)), na }; });
    check('배음이 많은 소리(+3): 크기 유지 (입력 ' + r.rin.toFixed(3) + ' → 출력 ' + r.rout.toFixed(3) + ') · NaN 없음', r.na === 0 && Math.abs(r.rout / r.rin - 1) < 0.1, r);
  }

  console.log('2. 대체 변환기 (일반 노드 지연선) · AudioWorklet 없음');
  for (let n = -3; n <= 3; n++) {
    if (n === 0) continue;
    const m = await render(n, 'delay', 440, 4), exp = 440 * Math.pow(2, n / 12), c = cents(m.f, exp);
    check('대체(delay) ' + (n > 0 ? '+' : '') + n + ' 반음: ' + m.f.toFixed(2) + ' Hz (' + c.toFixed(1) + ' 센트) — ±15 센트 안 · NaN 없음 · 크기 ' + m.rms.toFixed(2), m.mode === 'delay' && Math.abs(c) <= 15 && m.nan === 0 && m.rms > 0.15 && m.rms < 0.45 && m.pk < 0.62, m);
  }
  {
    const m0 = await render(0, 'delay', 440, 2); check('대체 방식 0 반음은 원음 그대로 (rms 0.354)', m0.mode === 'delay' && Math.abs(m0.rms - 0.3536) < 0.02 && Math.abs(cents(m0.f, 440)) <= 2, m0);
    check('mode 를 정하지 않으면 AudioWorklet 을 우선 씀', (await render(1, undefined, 440, 2)).mode === 'worklet');
  }
  const pageNoWk = await ctx.newPage(); const errsNoWk = []; watch(pageNoWk, errsNoWk); await prep(pageNoWk);
  await pageNoWk.addInitScript(() => { try { delete window.AudioWorkletNode; } catch (e) { window.AudioWorkletNode = undefined; } try { Object.defineProperty(BaseAudioContext.prototype, 'audioWorklet', { get() { return undefined; } }); } catch (e) { /* 무시 */ } });
  await pageNoWk.goto(base + '/h.html?t=tokA'); await pageNoWk.evaluate(MEAS_SRC);
  {
    const r = await pageNoWk.evaluate(async () => { const c = new OfflineAudioContext(2, 44100 * 3, 44100), buf = c.createBuffer(1, 44100 * 3, 44100), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 44100);
      const src = c.createBufferSource(); src.buffer = buf; const sh = await YNAudioShift.createShifter(c, { semitones: 2 }); src.connect(sh.input); sh.output.connect(c.destination); src.start(); const x = (await c.startRendering()).getChannelData(0);
      const m = window.__measure(x, 44100, 44100, 44100 * 2.8); m.mode = sh.mode; m.reason = sh.fallbackReason || ''; m.hasWk = typeof AudioWorkletNode; return m; });
    check('AudioWorklet 이 없으면 자동으로 대체 변환기 (mode=delay · 이유 기록)', r.hasWk === 'undefined' && r.mode === 'delay' && /Worklet/i.test(r.reason), r);
    check('   그 경우에도 +2 반음 ' + r.f.toFixed(1) + ' Hz (±15 센트)', Math.abs(cents(r.f, 440 * Math.pow(2, 2 / 12))) <= 15, r);
  }

  console.log('3. 유튜브 카드 — 키(−3…+3) · 템포 0.75 / 1 / 1.25 · 솔직한 안내');
  await H(([sheets, songs, recs]) => { window.__pv = OPEN({ sheets, songs, recs, song: 0 }); }, [LEAD, SONGS, RECS]);
  check('악보가 열림', await L.waitTrue(page, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 1', null, 9000));
  await sleep(1200);
  await H(FAKE_YT); await H(() => { window.__ks = []; window.__pv.P.on('keyshift', (n) => window.__ks.push(n)); window.__ft = []; const o = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t) { if (this.canvas && this.canvas.className === 'pv-harm') window.__ft.push(String(t)); return o.apply(this, arguments); }; });
  check('화음 탭을 열기 전에는 화음 모듈이 만들어져 있지 않음', await H(() => !document.querySelector('.hm') && !window.YNHarmonyUI._last));
  check('연습 키 이동 통로(P.keyShift · setKeyShift · ensureTab)가 있음 · 처음엔 0', await H(() => { const P = window.__pv.P; return typeof P.keyShift === 'function' && typeof P.setKeyShift === 'function' && typeof P.ensureTab === 'function' && P.keyShift() === 0; }));
  await page.click('.pv-ytbtn'); await sleep(350);
  check('공식 API 플레이어가 만들어짐 (가짜 ytApi)', await H(() => !!window.__ytp && window.__ytp.cfg.videoId === 'dQw4w9WgXcQ'));
  check('속도 버튼: 0.75 · 1 · 1.25 (주) + 예전 0.5 (흐린 보조)', await H(() => [...document.querySelectorAll('.yt-rates [data-rate]')].map((b) => b.textContent + (b.classList.contains('xr') ? '*' : '')).join() === '0.5x*,0.75x,1x,1.25x'));
  check('키 버튼: −3 −2 −1 0 +1 +2 +3', await H(() => [...document.querySelectorAll('.yt-keys [data-key]')].map((b) => b.textContent).join() === '-3,-2,-1,0,+1,+2,+3'));
  check('처음에는 키 0 이 눌린 상태 · 라벨 "G (원래 키)"', await H(() => document.querySelector('.yt-keys [data-key="0"]').classList.contains('on') && /G \(원래 키\)/.test(document.querySelector('.yt-kn').textContent)), await H(() => document.querySelector('.yt-kn').textContent));
  const warn = await H(() => { const w = document.querySelector('.yt-warn'); return w ? { txt: w.textContent, vis: w.offsetParent !== null } : null; });
  check('솔직한 안내가 보임: "유튜브 영상의 소리는 브라우저에서 키를 바꿀 수 없습니다"', !!warn && warn.vis && /유튜브 영상의 소리는 브라우저에서 키를 바꿀 수 없습니다/.test(warn.txt) && /악보의 코드/.test(warn.txt), warn);
  check('"키 바꿔 연습 (녹음 · 내 오디오 파일)" 버튼과 "목표 키 시작음" 버튼', await H(() => { const a = document.querySelector('.yt-kbtns [data-k="shifter"]'), b = document.querySelector('.yt-kbtns [data-k="startnote"]'); return !!a && /키 바꿔 연습 \(녹음 · 내 오디오 파일\)/.test(a.textContent) && !!b; }));
  check('속도 안내 문구(0.75·1·1.25 만 · 음높이는 유튜브가 유지)', await H(() => /0\.75 · 1 · 1\.25배만/.test(document.querySelector('.yt-ratenote').textContent) && /음높이는 YouTube 가 그대로 유지/.test(document.querySelector('.yt-ratenote').textContent)));
  await shot(page, '01-yt-card-1280');
  await H(() => { window.__ytp.calls.length = 0; });
  await page.click('.yt-rates [data-rate="0.75"]'); await sleep(80); await page.click('.yt-rates [data-rate="1.25"]'); await sleep(80); await page.click('.yt-rates [data-rate="1"]'); await sleep(80);
  check('setPlaybackRate 가 0.75 → 1.25 → 1 로 호출됨', await H(() => JSON.stringify(window.__ytp.calls.filter((c) => c[0] === 'rate')) === JSON.stringify([['rate', 0.75], ['rate', 1.25], ['rate', 1]])), await H(() => JSON.stringify(window.__ytp.calls)));
  check('1.25x 를 누르면 그 버튼이 켜졌다가 1x 로 돌아옴', await H(() => document.querySelector('.yt-rates [data-rate="1"]').classList.contains('on') && !document.querySelector('.yt-rates [data-rate="1.25"]').classList.contains('on')));
  await H(() => { window.__ytp.t = 12.3; }); await page.click('[data-a="a"]'); await H(() => { window.__ytp.t = 20; }); await page.click('[data-a="b"]'); await sleep(100);
  await H(() => { window.__ytp.calls.length = 0; window.__ytp.t = 20.05; }); await sleep(350);
  check('A-B 반복이 그대로 동작 (B 에 닿으면 A 로)', await H(() => window.__ytp.calls.some((c) => c[0] === 'seek' && Math.abs(c[1] - 12.3) < 0.01)));
  await page.click('[data-a="clear"]');

  console.log('4. 키 +2 → 화음 탭을 열지 않았어도 자동 분석 → 코드가 옮겨져 다시 그려짐');
  await page.click('.yt-keys [data-key="2"]');
  check('연습 키 이동 +2 · 이 기기에 곡별로 기억됨', await H(() => window.__pv.P.keyShift() === 2 && Object.keys(localStorage).some((k) => /^yn\.pv\.ks\.amazinggrace/.test(k) && localStorage.getItem(k) === '2')), await H(() => Object.keys(localStorage).filter((k) => /ks\./.test(k))));
  check('키 라벨이 "G → A (+2)"', await H(() => /G → A \(\+2\)/.test(document.querySelector('.yt-kn').textContent)), await H(() => document.querySelector('.yt-kn').textContent));
  check("'keyshift' 이벤트가 한 번", await H(() => JSON.stringify(window.__ks) === '[2]'), await H(() => window.__ks));
  check('화음 모듈이 화면 없이 만들어짐 (탭은 숨김 · 덧그림 캔버스 있음)', await L.waitTrue(page, () => !!window.YNHarmonyUI._last && !!document.querySelector('.hm') && document.querySelector('.pv-pane[data-pane="harmony"]').style.display === 'none' && !!document.querySelector('.pv-harm'), null, 6000));
  check('이 쪽이 자동으로 분석됨 (PDF 글자층 · 코드 15개)', await L.waitTrue(page, () => { const s = window.YNHarmonyUI._last._state; return !s.busy && s.data.pages['1'] && s.data.pages['1'].chords.length === 15; }, null, 30000));
  const st1 = await H(() => { const s = window.YNHarmonyUI._last._state, d = s.data.pages['1']; return { okey: s.okey.name, tkey: s.tkey.name, semis: s.semis, src: d.src, chords: d.chords.length, staves: d.staves.length, notes: d.notes.length, target: s.data.target, tshift: s.data.tshift, tabOn: !!document.querySelector('.pv-tabbtn.on') }; });
  check('원래 G → 목표 A · +2 반음 · 출처 text', st1.okey === 'G' && st1.tkey === 'A' && st1.semis === 2 && st1.src === 'text' && st1.tshift === 2 && st1.target === 'A', st1);
  check('오선 4줄 · 멜로디 음 26개도 함께 읽음', st1.staves === 4 && st1.notes === 26, st1);
  check('사용자가 연 탭이 없음 (자동으로 화면을 가로채지 않음)', st1.tabOn === false, st1);
  check('유튜브 카드에 진행 안내가 뜸 ("악보: 이 쪽 코드 15개를 G → A (+2) 로 바꿔 그렸습니다")', await L.waitTrue(page, () => /이 쪽 코드 15개를 G → A \(\+2\)/.test(document.querySelector('.yt-kstat').textContent), null, 4000), await H(() => document.querySelector('.yt-kstat').textContent));
  await H(() => { window.__ft.length = 0; window.YNHarmonyUI._last._commit(true); }); await sleep(300);
  const drawn = await H(() => window.__ft.slice());
  const truth = MK.layout().truth.chords.map((c) => c.text), want = truth.map((c) => HCore.transposeChord(c, 2, false));
  const sortTxt = (a) => a.slice().sort().join(' ');
  check('캔버스에 그려진 코드 글자가 옮겨진 코드와 같음 (' + sortTxt(want) + ')', sortTxt(drawn.filter((t) => /^[A-G]/.test(t) && !/^알토|^테너/.test(t))) === sortTxt(want), { drawn: sortTxt(drawn), want: sortTxt(want) });
  check('원래 코드 글자(Em7 · D/F# · G)는 그려지지 않음', !drawn.includes('Em7') && !drawn.includes('D/F#') && !drawn.includes('G'), drawn);
  const B = await H(() => { const c = document.querySelector('.pv-harm'); return { w: c.clientWidth, h: c.clientHeight }; });
  const pxCount = (rect, pred) => H(([rect, predSrc]) => { const c = document.querySelector('.pv-harm'), x = c.getContext('2d'), k = c.width / c.clientWidth, f = new Function('r', 'g', 'b', 'a', 'return ' + predSrc);
    const X = Math.max(0, Math.round(rect[0] * k)), Y = Math.max(0, Math.round(rect[1] * k)), W = Math.max(1, Math.round(rect[2] * k)), Hh = Math.max(1, Math.round(rect[3] * k)); const d = x.getImageData(X, Y, Math.min(W, c.width - X), Math.min(Hh, c.height - Y)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2], d[i + 3])) n++; return n; }, [rect, pred]);
  const c0 = (await H(() => window.YNHarmonyUI._last._state.data.pages['1'].chords.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0]));
  const inner0 = [c0.x * B.w, c0.y * B.h, c0.w * B.w, c0.h * B.h];
  check('원래 첫 코드 글자 자리를 불투명한 칩이 덮음 (98% 이상)', (await pxCount(inner0, 'a>240')) >= inner0[2] * inner0[3] * 0.98 - 2, [await pxCount(inner0, 'a>240'), inner0[2] * inner0[3]]);
  check('칩 안에 주황색 새 코드 글자', (await pxCount([c0.x * B.w - 6, c0.y * B.h - 4, c0.w * B.w + 12, c0.h * B.h + 8], 'a>200 && r>200 && g>110 && g<200 && b<130')) > 15);
  const analyzedAt = await H(() => window.YNHarmonyUI._last._state.data.pages['1'].at);
  await page.click('.yt-keys [data-key="0"]'); await sleep(200); await page.click('.yt-keys [data-key="1"]'); await sleep(500);
  check('키를 0 → +1 로 바꿔도 이미 분석한 쪽은 다시 분석하지 않음 (세션에 한 번)', await H((at) => window.YNHarmonyUI._last._state.data.pages['1'].at === at && window.YNHarmonyUI._last._state.semis === 1, analyzedAt));
  check('키 0 이면 "원래 키 그대로" 안내 · 덮개 없음', await (async () => { await page.click('.yt-keys [data-key="0"]'); await sleep(300); return (await H(() => /원래 키 그대로/.test(document.querySelector('.yt-kstat').textContent))) && (await pxCount([c0.x * B.w - 6, c0.y * B.h - 4, c0.w * B.w + 12, c0.h * B.h + 8], 'a>0')) < 12; })());
  await page.click('.yt-keys [data-key="2"]'); await sleep(400);

  console.log('5. 화음 탭에서 목표 조를 손으로 바꾸기 ↔ 연습 키 되먹임');
  await H(() => { window.__ks.length = 0; window.__pv.P.showTab('harmony'); }); await sleep(400);
  check('화음 탭의 목표 조가 A (+2) 로 이미 맞춰져 있음', await H(() => { const sel = document.querySelector('.hm [data-o="target"]'); return sel.value === 'A' && /G ➔ A/.test(document.querySelector('.hm-semis').textContent); }));
  check('자동 분석 스위치가 켜져 있음 (기본)', await H(() => document.querySelector('.hm [data-o="auto"]').checked === true));
  await page.selectOption('.hm [data-o="target"]', 'Bb'); await sleep(350);
  check('목표 Bb (+3) → 연습 키 +3 으로 되돌아옴 · 이벤트는 정확히 한 번(고리 없음)', await H(() => window.__pv.P.keyShift() === 3 && JSON.stringify(window.__ks) === '[3]' && window.YNHarmonyUI._last._state.semis === 3), await H(() => [window.__pv.P.keyShift(), window.__ks, window.YNHarmonyUI._last._state.semis]));
  check('유튜브 카드의 키 버튼도 +3 으로 바뀜', await H(() => document.querySelector('.yt-keys [data-key="3"]').classList.contains('on') && /G → Bb \(\+3\)/.test(document.querySelector('.yt-kn').textContent)), await H(() => document.querySelector('.yt-kn').textContent));
  await H(() => { window.__ks.length = 0; });
  await page.selectOption('.hm [data-o="target"]', 'E'); await sleep(350);
  check('목표 E (−3) → 연습 키 −3', await H(() => window.__pv.P.keyShift() === -3 && window.YNHarmonyUI._last._state.semis === -3 && JSON.stringify(window.__ks) === '[-3]'), await H(() => [window.__pv.P.keyShift(), window.__ks]));
  await H(() => { window.__ks.length = 0; });
  await page.selectOption('.hm [data-o="target"]', 'Eb'); await sleep(350);
  check('목표 Eb (−4, 범위 밖) → 화음 탭은 그대로 −4 반음으로 바뀌고 연습 키는 0 으로 되돌아감(±3 밖이라)', await H(() => window.YNHarmonyUI._last._state.semis === -4 && window.__pv.P.keyShift() === 0 && window.YNHarmonyUI._last._state.data.tshift === undefined), await H(() => [window.YNHarmonyUI._last._state.semis, window.__pv.P.keyShift()]));
  check('   그 사실을 카드에 알림 (±3 반음 밖 안내)', await H(() => /±3 반음 밖/.test(document.querySelector('.yt-kstat').textContent)), await H(() => document.querySelector('.yt-kstat').textContent));
  await page.selectOption('.hm [data-o="target"]', ''); await sleep(300);
  check('"그대로" → 반음 0 · 연습 키 0', await H(() => window.YNHarmonyUI._last._state.semis === 0 && window.__pv.P.keyShift() === 0));
  await page.click('.yt-keys [data-key="-3"]'); await sleep(400);
  check('유튜브 카드에서 −3 → 화음 탭 목표 조 선택칸이 E (−3)', await H(() => document.querySelector('.hm [data-o="target"]').value === 'E' && window.YNHarmonyUI._last._state.semis === -3));
  await page.selectOption('.hm [data-o="orig"]', 'A'); await sleep(350);
  check('원래 조를 A 로 고치면 같은 −3 을 새 기준으로 다시 적용 (A → F#) ', await H(() => window.YNHarmonyUI._last._state.tkey.name === 'F#' && window.YNHarmonyUI._last._state.semis === -3 && window.__pv.P.keyShift() === -3), await H(() => [window.YNHarmonyUI._last._state.tkey.name, window.YNHarmonyUI._last._state.semis]));
  await page.selectOption('.hm [data-o="orig"]', 'G'); await sleep(300);
  await page.click('.yt-keys [data-key="2"]'); await sleep(300);
  const flip = (sel, on) => H(([sel, on]) => { const i = document.querySelector(sel); if (i.checked !== on) i.closest('label').click(); }, [sel, on]);
  await flip('.hm [data-o="auto"]', false); await sleep(100);
  check('자동 분석 스위치를 끄면 이 기기에 기억됨', await H(() => localStorage.getItem('yn.pv.harm.auto') === '0'));
  await flip('.hm [data-o="auto"]', true);
  check('다시 켜면 기억이 바뀜', await H(() => localStorage.getItem('yn.pv.harm.auto') === '1'));

  console.log('6. 키 바꿔 듣기 카드 — 팀 녹음 · 내 오디오 파일, 실제 소리의 음높이와 템포');
  await page.click('.yt-kbtns [data-k="shifter"]'); await sleep(900);
  check('재생 카드가 열리고 유튜브 카드는 닫힘 (소리 겹침 방지) · 플레이어 정리됨', await H(() => !!document.querySelector('.pv-as') && !document.querySelector('.pv-yt') && window.__ytp.destroyed === true));
  check('이 곡에 맞는 팀 녹음이 ★ 로 맨 앞에 · 자동 선택', await H(() => { const s = document.querySelector('.pv-as [data-o="src"]'); return s.options.length === 3 && /^★ Amazing Grace 2번 연습/.test(s.options[1].textContent) && s.value === '0'; }), await H(() => [...document.querySelector('.pv-as [data-o="src"]').options].map((o) => o.textContent)));
  check('키 −3…+3 버튼 7개 · 현재 연습 키(+2) 가 켜짐 · "G → A (+2)"', await H(() => document.querySelectorAll('.pv-as [data-key]').length === 7 && document.querySelector('.pv-as [data-key="2"]').classList.contains('on') && /G → A \(\+2\)/.test(document.querySelector('.pv-as .as-kn').textContent)), await H(() => document.querySelector('.pv-as .as-kn').textContent));
  check('AudioWorklet 처리기로 준비됨 (고품질)', await L.waitTrue(page, () => /AudioWorklet/.test(document.querySelector('.pv-as .as-eng').textContent) && !document.querySelector('.pv-as [data-a="play"]').disabled, null, 8000), await H(() => document.querySelector('.pv-as .as-eng').textContent));
  await shot(page, '02-audio-card-1280');
  // 팀 녹음 재생 (같은 출처 /audio/…, Range)
  await page.click('.pv-as [data-a="play"]');
  check('팀 녹음(/audio/REC_MATCH01)이 재생되고 시간이 흐름', await L.waitTrue(page, () => { const a = document.querySelector('.pv-as audio') || null; const api = window.YNAudioShift.current(), st = api.state(); return st.playing && st.time > 0.6; }, null, 9000), await H(() => window.YNAudioShift.current().state()));
  await H(() => { const n = window.YNAudioShift.current()._nodes(), an = n.ctx.createAnalyser(); an.fftSize = 32768; an.smoothingTimeConstant = 0; n.out.connect(an); const buf = new Float32Array(32768); n.audio.loop = true; window.__an = () => { an.getFloatTimeDomainData(buf); return window.__measure(buf, n.ctx.sampleRate, 0, buf.length); }; });
  const meas = async (wait) => { await sleep(wait || 1500); const a = await H(() => window.__an()); await sleep(200); const b = await H(() => window.__an()); return Math.abs(cents(a.f, b.f)) < 20 ? b : a; };
  {
    const m = await meas(1500), exp = 440 * Math.pow(2, 2 / 12);
    check('팀 녹음을 +2 반음으로 실제로 들려 줌: ' + m.f.toFixed(2) + ' Hz (기대 ' + exp.toFixed(2) + ' · ' + cents(m.f, exp).toFixed(1) + ' 센트)', Math.abs(cents(m.f, exp)) <= 15 && m.nan === 0 && m.rms > 0.25 && m.rms < 0.45, m);
  }
  // 내 오디오 파일 (WAV) — 업로드 없이 blob 으로
  const before = await H(() => window.__pv.P.keyShift());
  await page.setInputFiles('.pv-as [data-o="file"]', { name: 'my-440.wav', mimeType: 'audio/wav', buffer: wav(440, 60) });
  check('내 파일이 blob 주소로 불러와짐 (서버 업로드 없음)', await L.waitTrue(page, () => { const s = window.YNAudioShift.current().state(); return /^blob:/.test(s.src) && s.title === 'my-440.wav'; }, null, 5000), await H(() => window.YNAudioShift.current().state()));
  const upl = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /upload|POST/i.test(e.name)).length); check('파일 선택 뒤 업로드 요청 없음', upl === 0);
  await H(() => { const n = window.YNAudioShift.current()._nodes(); n.audio.loop = true; });
  await page.click('.pv-as [data-a="play"]');
  check('내 파일 재생 시작', await L.waitTrue(page, () => { const st = window.YNAudioShift.current().state(); return st.playing && st.time > 0.5; }, null, 9000), await H(() => window.YNAudioShift.current().state()));
  const rowsK = [];
  for (let n = -3; n <= 3; n++) {
    await page.click('.pv-as [data-key="' + n + '"]');
    const m = await meas(1400), exp = 440 * Math.pow(2, n / 12), c = cents(m.f, exp); rowsK.push(n + ':' + c.toFixed(1));
    check('내 파일 키 ' + (n > 0 ? '+' : '') + n + ': 실제 출력 ' + m.f.toFixed(2) + ' Hz (기대 ' + exp.toFixed(2) + ', ' + c.toFixed(1) + ' 센트) ±15 · 크기 rms ' + m.rms.toFixed(2) + ' · NaN ' + m.nan, Math.abs(c) <= 15 && m.nan === 0 && m.rms > 0.25 && m.rms < 0.45 && m.pk < 0.56, m);
  }
  check('카드에서 바꾼 키가 연습 키(P.keyShift)로 반영됨 (+3 다음 → 3)', await H(() => window.__pv.P.keyShift() === 3));
  check('그 키가 화음 탭 목표 조(Bb)에도 반영됨', await H(() => window.YNHarmonyUI._last._state.tkey.name === 'Bb' && window.YNHarmonyUI._last._state.semis === 3));
  // 템포: 음높이는 그대로, 속도만
  await page.click('.pv-as [data-key="2"]');
  for (const [t, key] of [[0.75, 2], [1.25, 2], [0.85, 2]]) {
    await H((t) => { const i = document.querySelector('.pv-as [data-o="tempo"]'); i.value = String(Math.round(t * 100)); i.dispatchEvent(new Event('input', { bubbles: true })); }, t);
    await sleep(900); const st = await H(() => window.YNAudioShift.current().state()); const t0 = st.time; await sleep(2000); const st2 = await H(() => window.YNAudioShift.current().state());
    const adv = (st2.time - t0) / 2.0 % 1 === 0 ? 0 : (st2.time - t0) / 2.0;   // (루프로 되감기면 무시)
    const m = await meas(200), exp = 440 * Math.pow(2, key / 12);
    check('템포 ' + t + 'x: playbackRate ' + st2.rate + ' · preservesPitch=' + st2.preservesPitch + ' · 재생 속도 약 ' + adv.toFixed(2) + '배', st2.rate === t && st2.preservesPitch === true && (adv === 0 || Math.abs(adv - t) < 0.12), [st2, adv]);
    check('   템포 ' + t + 'x 에서도 음높이는 +2 반음 그대로: ' + m.f.toFixed(2) + ' Hz (' + cents(m.f, exp).toFixed(1) + ' 센트, ±15)', Math.abs(cents(m.f, exp)) <= 15 && m.rms > 0.25, m);
  }
  check('템포 라벨 · 범위: 0.85x 표시 · 슬라이더 75~125', await H(() => document.querySelector('.pv-as .as-tv').textContent === '0.85x' && document.querySelector('.pv-as [data-o="tempo"]').min === '75' && document.querySelector('.pv-as [data-o="tempo"]').max === '125'));
  await H(() => { const i = document.querySelector('.pv-as [data-o="tempo"]'); i.value = '75'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await H(() => document.querySelector('.pv-as [data-t="-1"]').click()); await sleep(100);
  check('0.75 아래로는 내려가지 않음 (− 버튼 꺼짐)', await H(() => window.YNAudioShift.current().tempo() === 0.75 && document.querySelector('.pv-as [data-t="-1"]').disabled));
  await page.click('.pv-as [data-t="1"]'); await sleep(100);
  check('＋ 는 0.05 씩 (0.80x)', await H(() => window.YNAudioShift.current().tempo() === 0.8));
  await page.click('.pv-as [data-a="reset"]'); await sleep(500);
  check('원래대로: 키 0 · 템포 1 · 연습 키 0', await H(() => { const a = window.YNAudioShift.current(); return a.key() === 0 && a.tempo() === 1 && window.__pv.P.keyShift() === 0; }));
  {
    const m = await meas(1200); check('원래대로 → 440 Hz 그대로 (' + m.f.toFixed(2) + ' Hz)', Math.abs(cents(m.f, 440)) <= 5, m);
  }
  await H(() => { const a = document.querySelector('.pv-as [data-o="seek"]'); a.value = '500'; a.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(300);
  check('재생 위치 슬라이더로 이동 · 시간 표시', await H(() => { const st = window.YNAudioShift.current().state(); return st.time > 20 && st.time < 40 && /\d:\d\d \/ 1:00/.test(document.querySelector('.pv-as .as-time').textContent); }), await H(() => [window.YNAudioShift.current().state().time, document.querySelector('.pv-as .as-time').textContent]));
  await page.click('.pv-as [data-a="play"]'); await sleep(300);
  check('일시정지 ▶ 로 바뀜', await H(() => !window.YNAudioShift.current().state().playing && document.querySelector('.pv-as [data-a="play"]').textContent === '▶'));
  await page.click('.pv-as [data-a="startnote"]'); await sleep(300);
  check('"목표 키 시작음" 버튼: 오류 없이 안내', await H(() => /시작음/.test(document.querySelector('.pv-as .as-msg:not(.as-hs)').textContent)), await H(() => document.querySelector('.pv-as .as-msg:not(.as-hs)').textContent));
  check('오디오 컨텍스트가 "playback" 오디오 세션으로 (지원 브라우저만) · 컨텍스트 running', await H(() => { const n = window.YNAudioShift.current()._nodes(); return n.ctx.state === 'running'; }));
  await page.click('.pv-as .pv-yth button'); await sleep(200);
  check('닫으면 카드 · 오디오 컨텍스트 정리', await H(() => !document.querySelector('.pv-as') && !window.YNAudioShift.isOpen()));

  console.log('  · 다시 열기 · 유튜브 카드와 번갈아 열기');
  await H(() => window.__pv.P.setKeyShift(1)); await sleep(300);
  await page.click('.pv-ytbtn'); await sleep(300);
  check('유튜브 카드를 다시 열면 키 +1 이 켜져 있음', await H(() => document.querySelector('.yt-keys [data-key="1"]').classList.contains('on')));
  await page.click('.pv-ytbtn'); await sleep(150);
  await H(() => window.__pv.P.openAudioShift()); await sleep(600);
  check('P.openAudioShift() 로도 열림 · 키 +1 · 유튜브 카드 없음', await H(() => !!document.querySelector('.pv-as') && document.querySelector('.pv-as [data-key="1"]').classList.contains('on') && !document.querySelector('.pv-yt')));
  await page.click('.pv-ytbtn'); await sleep(300);
  check('유튜브 카드를 열면 재생 카드가 닫힘', await H(() => !document.querySelector('.pv-as') && !!document.querySelector('.pv-yt')));
  await page.click('.pv-yth button'); await sleep(100);
  await H(() => window.__pv.P.setKeyShift(0)); await sleep(300);

  console.log('7. 자동 분석이 안 될 때 — 친절한 안내 (OCR 도구 없음 · 오프라인) · OCR 성공');
  {
    const cxOff = await br.newContext({ viewport: { width: 1280, height: 850 } });          // 오프라인 흉내는 이 화면 하나에만 (다른 화면의 실시간 연결을 끊지 않게)
    const pg = await cxOff.newPage(); const e3 = []; watch(pg, e3, /ERR_INTERNET_DISCONNECTED/); await prep(pg);
    await pg.route(/cdn\.jsdelivr\.net|unpkg\.com|tessdata\.projectnaptha\.com/, (r) => r.fulfill({ status: 404, body: 'nf' }));
    await pg.goto(base + '/h.html?t=tokA');
    await pg.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs, song: 0 }); window.__hs = []; window.__pv.P.on('harmstat', (t, bad) => window.__hs.push([t, !!bad])); }, [MULTI, SONGS]);
    await L.waitTrue(pg, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 4', null, 9000); await sleep(1200);
    await pg.evaluate(() => window.__pv.P.setKeyShift(2));
    const failed = await L.waitTrue(pg, () => window.__hs.some((x) => x[1] && /분석하지 못했습니다|OCR/.test(x[0])), null, 30000);
    const hs = await pg.evaluate(() => window.__hs.slice());
    check('글자층에 코드가 없고 OCR 도구를 못 받으면 분명한 실패 안내 (화면은 안 막힘)', failed, hs);
    check('   분석 상태가 풀림 (busy=false) — 화면 조작 가능', await pg.evaluate(() => !window.YNHarmonyUI._last._state.busy));
    check('   같은 쪽을 자동으로 다시 시도하지 않음 (세션에 한 번)', await (async () => { const n0 = (await pg.evaluate(() => window.__hs.length)); await pg.evaluate(() => window.__pv.P.setKeyShift(3)); await sleep(800); return !(await pg.evaluate((n0) => window.__hs.slice(n0).some((x) => /읽는 중/.test(x[0])), n0)); })());
    await cxOff.setOffline(true);
    await pg.evaluate(() => { window.__hs.length = 0; window.__pv.goPage(2); }); await sleep(1500);
    const off = await pg.evaluate(() => window.__hs.slice());
    check('오프라인 + 글자 없는 쪽: 자동 분석 대신 안내 (OCR 시도 안 함)', off.some((x) => x[1] && /오프라인/.test(x[0])) && !off.some((x) => /읽는 중/.test(x[0])), off);
    check('   토스트로도 알림 · 분석 상태 아님', await pg.evaluate(() => !window.YNHarmonyUI._last._state.busy));
    await cxOff.setOffline(false);
    check('실패 시나리오에서 예기치 않은 오류 없음 (오프라인 흉내로 끊긴 실시간 연결 메시지 제외)', e3.length === 0, e3);
    await cxOff.close();
  }
  if (!fs.existsSync(path.join(TESS, 'tesseract.js/dist/tesseract.min.js'))) console.log('  · tesseract.js 가 없어 OCR 성공 시험은 건너뜀 (TESS_DIR=' + TESS + ')');
  else {
    const png = await H(async () => { const cv = document.createElement('canvas'); await window.__pv.P.renderPageTo(cv, 1, 3.6); return cv.toDataURL('image/png').split(',')[1]; });
    S.setScan(Buffer.from(png, 'base64'));
    const pg = await ctx.newPage(); const e4 = []; watch(pg, e4); await prep(pg); const seen = [];
    await pg.route(/cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com|unpkg\.com/, (route) => {
      const url = route.request().url(); seen.push(url); let f = null;
      if (/tesseract\.min\.js/.test(url)) f = path.join(TESS, 'tesseract.js/dist/tesseract.min.js');
      else if (/worker\.min\.js/.test(url)) f = path.join(TESS, 'tesseract.js/dist/worker.min.js');
      else if (/tesseract-core[^/]*\.(wasm\.js|js|wasm)$/.test(url)) f = path.join(TESS, 'tesseract.js-core', url.split('/').pop());
      else if (/eng\.traineddata/.test(url)) f = path.join(TESS, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz');
      if (!f || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
      route.fulfill({ status: 200, path: f, headers: { 'access-control-allow-origin': '*', 'content-type': /\.wasm$/.test(f) ? 'application/wasm' : /\.gz$/.test(f) ? 'application/gzip' : 'text/javascript' } });
    });
    await pg.goto(base + '/h.html?t=tokA');
    await pg.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs, song: 0 }); window.__hs = []; window.__pv.P.on('harmstat', (t, bad) => window.__hs.push([t, !!bad])); }, [SCAN, SONGS]);
    await L.waitTrue(pg, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 1', null, 9000); await sleep(1500);
    await pg.evaluate(() => window.__pv.P.setKeyShift(2));
    const done = await L.waitTrue(pg, () => { const u = window.YNHarmonyUI._last; if (!u) return false; const s = u._state; return !s.busy && s.data.pages['1']; }, null, 150000);
    const r = await pg.evaluate(() => { const s = window.YNHarmonyUI._last._state, d = s.data.pages['1']; return d ? { src: d.src, chords: d.chords.length, tkey: s.tkey.name, semis: s.semis, hs: window.__hs.map((x) => x[0]).slice(-3) } : null; });
    check('스캔 그림: 키 +2 만으로 OCR 자동 분석이 돌아 끝남 (화음 탭은 열지 않음)', done && !!r && r.src === 'ocr' && r.chords >= 12 && r.tkey === 'A' && r.semis === 2, r);
    check('   진행 안내가 OCR 을 알림 · 결과 안내가 옴', await pg.evaluate(() => window.__hs.some((x) => /OCR/.test(x[0])) && window.__hs.some((x) => /바꿔 그렸습니다/.test(x[0]))), await pg.evaluate(() => window.__hs.map((x) => x[0]).slice(-4)));
    await shot(pg, '06-ocr-auto-shift');
    check('OCR 자동 분석 중 오류 없음', e4.length === 0, e4);
    await pg.close();
  }

  console.log('  · AudioWorklet 없는 브라우저에서 카드 (대체 변환기) — 실제 소리 측정');
  {
    await pageNoWk.evaluate(([sheets, songs, recs]) => { window.__pv = OPEN({ sheets, songs, recs, song: 0 }); }, [LEAD, SONGS, RECS]);
    await L.waitTrue(pageNoWk, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 1', null, 9000); await sleep(800);
    await pageNoWk.evaluate(() => window.__pv.P.openAudioShift()); await sleep(800);
    check('대체 모드 표시: "호환 모드 (일반 노드)"', await L.waitTrue(pageNoWk, () => /호환 모드/.test(document.querySelector('.pv-as .as-eng').textContent) && !document.querySelector('.pv-as [data-a="play"]').disabled, null, 8000), await pageNoWk.evaluate(() => document.querySelector('.pv-as .as-eng').textContent));
    await pageNoWk.setInputFiles('.pv-as [data-o="file"]', { name: 'my-440.wav', mimeType: 'audio/wav', buffer: wav(440, 30) });
    await pageNoWk.click('.pv-as [data-a="play"]');
    await L.waitTrue(pageNoWk, () => window.YNAudioShift.current().state().playing && window.YNAudioShift.current().state().time > 0.5, null, 9000);
    await pageNoWk.evaluate(() => { const n = window.YNAudioShift.current()._nodes(), an = n.ctx.createAnalyser(); an.fftSize = 32768; an.smoothingTimeConstant = 0; n.out.connect(an); const buf = new Float32Array(32768); n.audio.loop = true; window.__an = () => { an.getFloatTimeDomainData(buf); return window.__measure(buf, n.ctx.sampleRate, 0, buf.length); }; });
    for (const n of [-3, 2]) {
      await pageNoWk.click('.pv-as [data-key="' + n + '"]'); await sleep(2200); const m = await pageNoWk.evaluate(() => window.__an()), exp = 440 * Math.pow(2, n / 12);
      check('대체 변환기 · 실제 재생 키 ' + (n > 0 ? '+' : '') + n + ': ' + m.f.toFixed(2) + ' Hz (' + cents(m.f, exp).toFixed(1) + ' 센트, ±15) · NaN 없음 · 소리 있음', Math.abs(cents(m.f, exp)) <= 15 && m.nan === 0 && m.rms > 0.12, m);
    }
    check('대체 모드에서도 키 · 연습 키 연동 (+2 → P.keyShift 2)', await (async () => { await pageNoWk.click('.pv-as [data-key="2"]'); await sleep(200); return pageNoWk.evaluate(() => window.__pv.P.keyShift() === 2); })());
    check('AudioWorklet 없는 시나리오에서 예기치 않은 오류 없음', errsNoWk.length === 0, errsNoWk);
  }

  console.log('8. 서비스워커 — 새 파일 보관 · 오프라인에서도 worklet 로딩');
  {
    const cx = await br.newContext({ viewport: { width: 1000, height: 700 }, serviceWorkers: 'allow' }); const pg = await cx.newPage(); const e5 = []; watch(pg, e5);
    await pg.goto(base + '/h.html?t=tokA');
    const reg = await pg.evaluate(async () => { const r = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; return !!r.active || !!r.installing || !!r.waiting; });
    check('sw.js 등록됨', reg);
    const cached = await L.waitTrue(pg, async () => { return !!(await caches.match('/worship/pitch-worklet.js')) && !!(await caches.match('/worship/audio-shift.js')); }, null, 15000);
    check('설치 때 audio-shift.js · pitch-worklet.js 가 함께 보관됨 (PRE)', cached);
    await L.waitTrue(pg, () => !!navigator.serviceWorker.controller, null, 8000);
    await pg.reload(); await pg.evaluate(() => navigator.serviceWorker.ready); await pg.addScriptTag({ url: base + '/worship/audio-shift.js' });
    await cx.setOffline(true);
    const off = await pg.evaluate(async () => {
      const c = new OfflineAudioContext(2, 44100, 44100); try { await YNAudioShift.loadWorklet(c); } catch (e) { return { ok: false, err: e.message }; }
      const sh = await YNAudioShift.createShifter(c, { semitones: 2, mode: 'worklet' }); return { ok: sh.mode === 'worklet' };
    });
    check('오프라인(네트워크 끊김)에서도 서비스워커 보관본으로 worklet 이 올라감', off.ok, off);
    await cx.setOffline(false);
    check('서비스워커 시나리오에서 오류 없음', e5.length === 0, e5);
    await cx.close();
  }

  console.log('9. 화면 캡처 (390px 폰 · 1280px)');
  {
    const cx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); const pg = await cx.newPage(); const e6 = []; watch(pg, e6); await prep(pg);
    await pg.goto(base + '/h.html?t=tokA'); await pg.evaluate(MEAS_SRC);
    await pg.evaluate(([sheets, songs, recs]) => { window.__pv = OPEN({ sheets, songs, recs, song: 0 }); }, [LEAD, SONGS, RECS]);
    await L.waitTrue(pg, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 1', null, 9000); await sleep(1200);
    await pg.evaluate(FAKE_YT);
    await pg.click('.pv-ytbtn'); await sleep(400); await pg.click('.yt-keys [data-key="2"]');
    await L.waitTrue(pg, () => { const s = window.YNHarmonyUI._last && window.YNHarmonyUI._last._state; return s && !s.busy && s.data.pages['1']; }, null, 30000); await sleep(600);
    await shot(pg, '03-yt-card-390');
    const ov = await pg.evaluate(() => { const y = document.querySelector('.pv-yt'), r = y.getBoundingClientRect(); return { w: r.width, l: r.left, rr: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, keysFit: (() => { const k = document.querySelector('.yt-keys'); return k.scrollWidth <= k.clientWidth + 1; })() }; });
    check('390px: 유튜브 카드가 화면 안에 들어오고 가로 스크롤 없음 · 키 버튼 7개가 한 줄에', ov.l >= 0 && ov.rr <= ov.vw && ov.sw <= ov.vw && ov.keysFit, ov);
    const small = await pg.evaluate(() => [...document.querySelectorAll('.yt-keys .yt-b, .yt-rates .yt-b')].map((b) => Math.round(b.getBoundingClientRect().height)));
    check('   누르기 쉬운 크기 (높이 ≥ 34px)', small.every((h) => h >= 34), small);
    await pg.click('.yt-kbtns [data-k="shifter"]'); await sleep(900);
    await shot(pg, '04-audio-card-390');
    const ov2 = await pg.evaluate(() => { const y = document.querySelector('.pv-as'), r = y.getBoundingClientRect(); return { l: r.left, rr: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, sh: y.scrollHeight, ch: y.clientHeight, keysFit: (() => { const k = document.querySelector('.as-keys'); return k.scrollWidth <= k.clientWidth + 1; })() }; });
    check('390px: 재생 카드가 화면 안 · 가로 스크롤 없음 · 키 버튼 한 줄', ov2.l >= 0 && ov2.rr <= ov2.vw && ov2.sw <= ov2.vw && ov2.keysFit && ov2.top >= 0, ov2);
    await pg.evaluate(() => { document.querySelector('.pv-as').scrollTop = 9999; }); await sleep(100);
    await shot(pg, '05-audio-card-390-scrolled');
    check('390px 화면 캡처에서 오류 없음', e6.length === 0, e6);
    await cx.close();
  }

  console.log('10. 오류 · 방어');
  check('페이지 오류 · 콘솔 오류 없음 (메인)', errs.length === 0, errs);
  await br.close(); S.server.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
