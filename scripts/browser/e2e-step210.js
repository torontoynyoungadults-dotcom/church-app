/**
 * Step 2.10 — 송폼 라벨 · 무음 모드 오디오 · 화면 켜짐 · 메트로놈 빠른 버튼 · 성능(쪽 그림 저장소 · 필기 그림 저장 · 리스너 정리 · 오디오 노드 정리) (진짜 크롬)
 *   NODE_PATH=... node scripts/browser/e2e-step210.js
 */
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const SONGS = [{ title: 'Amazing Grace', key: 'G', bpm: 120, form: 'V1-C', team: 'T' }, { title: 'Second Song', key: 'Bb', bpm: 90, form: 'Intro-V-C', team: '' }];
const MULTI = [{ id: 'FILEID_MULTI0001', name: 'Sunday All Songs.pdf' }];
/** 기기 기능을 흉내내고 호출 횟수를 셉니다: Wake Lock · audioSession · <audio> 재생 · 오디오 노드 · PDF 그리기 · 리스너 · 획 그리기 */
const INIT = (noWake) => `(() => {
  window.__wl = { req: 0, rel: 0, live: [] };
  ${noWake ? 'try { Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true }); } catch (e) {}' : `
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request(type) { window.__wl.req++; const ls = {}; const s = { type, released: false, addEventListener(n, f) { ls[n] = f; }, release() { if (this.released) return Promise.resolve(); this.released = true; window.__wl.rel++; return Promise.resolve(); }, fire() { this.released = true; ls.release && ls.release({}); } }; window.__wl.live.push(s); return Promise.resolve(s); } } });`}
  window.__as = { type: 'auto' };
  Object.defineProperty(navigator, 'audioSession', { configurable: true, value: window.__as });
  window.__media = [];
  const P0 = HTMLMediaElement.prototype.play, PA = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function () { window.__media.push({ ev: 'play', loop: this.loop, src: String(this.currentSrc || this.src).slice(0, 5), tag: this.tagName }); return P0.apply(this, arguments); };
  HTMLMediaElement.prototype.pause = function () { window.__media.push({ ev: 'pause', tag: this.tagName }); return PA.apply(this, arguments); };
  window.__osc = { made: 0, disc: 0 };
  const AC = window.AudioContext, co = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { const o = co.apply(this, arguments); window.__osc.made++; const d = o.disconnect.bind(o); o.disconnect = function () { window.__osc.disc++; return d.apply(null, arguments); }; return o; };
  window.__renders = []; let _pj;
  Object.defineProperty(window, 'pdfjsLib', { configurable: true, get() { return _pj; }, set(v) { _pj = v; try {
    const gd = v.getDocument.bind(v);
    v.getDocument = (...a) => { const t = gd(...a); const pr = t.promise.then((doc) => { const gp = doc.getPage.bind(doc); doc.getPage = (n) => gp(n).then((pg) => { if (!pg.__w) { pg.__w = 1; const r = pg.render.bind(pg); pg.render = (o) => { window.__renders.push({ n, w: o.viewport.width }); return r(o); }; } return pg; }); return doc; }); return new Proxy(t, { get(tt, k) { return k === 'promise' ? pr : (typeof tt[k] === 'function' ? tt[k].bind(tt) : tt[k]); } }); };
  } catch (e) {} } });
  window.__lis = {};
  const TY = { keydown: 1, keyup: 1, pointerup: 1, pointerdown: 1, resize: 1, orientationchange: 1, pagehide: 1, visibilitychange: 1, pageshow: 1, focus: 1 };
  const A0 = EventTarget.prototype.addEventListener, R0 = EventTarget.prototype.removeEventListener, key = (t, ty) => (t === document ? 'doc:' : t === window ? 'win:' : null) && ((t === document ? 'doc:' : 'win:') + ty);
  EventTarget.prototype.addEventListener = function (ty, fn, o) { if ((this === document || this === window) && TY[ty]) { const k = key(this, ty); window.__lis[k] = (window.__lis[k] || 0) + 1; } return A0.apply(this, arguments); };
  EventTarget.prototype.removeEventListener = function (ty, fn, o) { if ((this === document || this === window) && TY[ty]) { const k = key(this, ty); window.__lis[k] = (window.__lis[k] || 0) - 1; } return R0.apply(this, arguments); };
  window.__strokes = 0; const St = CanvasRenderingContext2D.prototype.stroke; CanvasRenderingContext2D.prototype.stroke = function () { window.__strokes++; return St.apply(this, arguments); };
})();`;
(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const mk = async (tok, o) => {
    o = o || {};
    const ctx = await br.newContext({ viewport: o.vp || { width: 1280, height: 800 }, hasTouch: !!o.touch, isMobile: !!o.mobile, acceptDownloads: true }); await ctx.addInitScript(INIT(o.noWake)); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g/i.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto(base + '/h.html?t=' + tok);
    if (!o.noOpen) {
      await page.evaluate(([sheets, songs]) => { window.__lisBefore = JSON.parse(JSON.stringify(window.__lis)); window.__pv = OPEN({ sheets, songs }); }, [MULTI, SONGS]);
      await L.waitTrue(page, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 4', null, 9000); await sleep(1200);
    }
    return { ctx, page, errs };
  };
  const ev = (p, fn, a) => p.evaluate(fn, a);

  /* ============================================================ 1. 화면 켜짐 */
  console.log('1. 화면 켜짐 유지 (Wake Lock)');
  const A = await mk('tokA'); const pa = A.page;
  check('세션이 열리면 Wake Lock 을 요청', await ev(pa, () => window.__wl.req >= 1), await ev(pa, () => window.__wl));
  check('상태: api 방식으로 켜짐', await ev(pa, () => window.__pv.P.wake().mode === 'api' && window.__pv.P.wake().active));
  { const r0 = await ev(pa, () => window.__wl.req); await ev(pa, () => window.__wl.live[window.__wl.live.length - 1].fire()); await sleep(300);
    check('잠금이 저절로 풀리면 (화면이 보이는 중) 곧바로 다시 잡음', await ev(pa, (n) => window.__wl.req > n, r0), await ev(pa, () => window.__wl)); }
  { const r0 = await ev(pa, () => window.__wl.req);
    await ev(pa, () => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.__wl.live[window.__wl.live.length - 1].fire(); });
    await sleep(200); const hiddenReq = await ev(pa, () => window.__wl.req);
    check('탭이 숨겨진 동안에는 요청하지 않음', hiddenReq === r0, [r0, hiddenReq]);
    await ev(pa, () => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(300);
    check('다시 보이면 곧바로 다시 잡음', await ev(pa, (n) => window.__wl.req > n && window.__pv.P.wake().mode === 'api', r0), await ev(pa, () => window.__wl)); }

  /* ============================================================ 2. 무음 모드 오디오 + 메트로놈 빠른 버튼 (컴퓨터) */
  console.log('2. 메트로놈 · 콜아웃 (위 도크 맨 앞) · 무음 모드 오디오 (컴퓨터 화면)   [Step 2.15: 예전 떠 있던 빠른 버튼은 도크 맨 앞 라이브 컨트롤로 옮겨짐]');
  check('v6: 메트로놈 · 콜아웃 라이브 컨트롤은 떠 있는 메트로놈 창에 (도구 도크와 따로 옮김)', await ev(pa, () => { const m = document.querySelector('.pv-metro'), l = m && m.querySelector('.pv-live'); return !!l && getComputedStyle(m).display !== 'none' && !!l.querySelector('.pv-lv-go') && !document.querySelector('.pv-tools .pv-live'); }));
  check('도크가 보일 때는 예전 떠 있는 빠른 버튼을 감춤 (같은 기능이 두 곳에 겹치지 않게)', await ev(pa, () => { const m = document.querySelector('.pv-mq'); return !m || getComputedStyle(m).display === 'none'; }));
  check('버튼이 화면 안에 보이고 (스크롤 없이) 다른 것에 가려지지 않음', await ev(pa, () => { const b = document.querySelector('.pv-lv-go').getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2; const t = document.elementFromPoint(x, y); return b.width > 30 && b.height > 30 && b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth && !!t && !!t.closest('.pv-live'); }));
  check('BPM 표시 (곡 BPM 120)', await ev(pa, () => document.querySelector('.pv-lv-bpm b').textContent === '120'), await ev(pa, () => document.querySelector('.pv-lv-bpm b').textContent));
  check('시작 전에는 audioSession 을 건드리지 않음 · 소리 없는 <audio> 도 없음', await ev(pa, () => window.__as.type === 'auto' && !window.__media.some((m) => m.ev === 'play' && m.tag === 'AUDIO')));
  await pa.click('.pv-lv-go');
  check('시작: 버튼이 ■ (멈춤 표시) 로 바뀜', await L.waitTrue(pa, () => document.querySelector('.pv-lv-go').classList.contains('on') && document.querySelector('.pv-lv-go').getAttribute('aria-pressed') === 'true' && !!document.querySelector('.pv-lv-go rect'), null, 3000));
  check('무음 모드 대책 ①: audioSession.type = "playback"', await ev(pa, () => window.__as.type === 'playback'), await ev(pa, () => window.__as.type));
  check('무음 모드 대책 ②: 소리 없는 <audio> 를 반복(loop) 재생', await ev(pa, () => window.__media.some((m) => m.ev === 'play' && m.tag === 'AUDIO' && m.loop && m.src === 'blob:')), await ev(pa, () => window.__media));
  check('소리 없는 wav 는 올바른 WAV 파일 (RIFF · 1초)', await ev(pa, async () => { const a = [...document.querySelectorAll('audio')]; const u = window.YNMetro && window.YNMetro.Media.el && window.YNMetro.Media.el.src; if (!u) return false; const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); return String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WAVE' && b.length === 44 + 16000 && b.slice(44).every((x) => x === 0); }));
  check('메트로놈이 실제로 돌아감 (딸깍 예약됨)', await L.waitTrue(pa, () => window.__osc.made >= 4, null, 3000), await ev(pa, () => window.__osc));
  check('패널 시작 버튼도 같은 상태 (■ 멈춤)', await ev(pa, () => { const b = document.querySelector('[data-role="toggle"]'); return !b || /멈춤/.test(b.textContent); }) );
  check('빠른 버튼의 BPM 점이 박마다 깜빡임 (클래스가 바뀜)', await L.waitTrue(pa, () => /b[01]/.test(document.querySelector('.pv-lv-dot').className), null, 2000));
  await sleep(1500);
  await pa.click('.pv-lv-go');
  check('멈춤: 버튼이 ▶ 로 돌아옴', await L.waitTrue(pa, () => !document.querySelector('.pv-lv-go').classList.contains('on') && !!document.querySelector('.pv-lv-go polygon'), null, 3000));
  check('멈추면 소리 없는 <audio> 도 멈춤 (배터리)', await L.waitTrue(pa, () => window.__media.filter((m) => m.tag === 'AUDIO').slice(-1)[0].ev === 'pause', null, 2000), await ev(pa, () => window.__media));
  await sleep(700);
  { const o = await ev(pa, () => window.__osc);
    check('다 울린 딸깍 소리 노드는 바로 끊어짐 (disconnect 횟수 ≈ 만든 수)', o.made >= 6 && o.disc >= o.made - 3, o); }
  await pa.click('.pv-lv-bpm');
  check('BPM 을 누르면 메트로놈 패널이 열림', await L.waitTrue(pa, () => !!document.querySelector('.pv-tabbtn[data-tab="metro"].on'), null, 2000));
  check('패널 메트로놈 탭: 시작 버튼이 맨 위(BPM 입력칸보다 위)에 있음', await ev(pa, () => { const g = document.querySelector('[data-role="toggle"]').getBoundingClientRect(), b = document.querySelector('[data-role="bpm"]').getBoundingClientRect(); return g.top < b.top; }));
  await pa.evaluate(() => { document.querySelector('[data-o="mq"]').click(); });
  check('설정에서 (폰 · 전체화면용) 빠른 버튼을 끌 수 있음 (기억됨)', await ev(pa, () => getComputedStyle(document.querySelector('.pv-mq')).display === 'none' && localStorage.getItem('yn.pv.mq') === '0'));
  await pa.evaluate(() => { document.querySelector('[data-o="mq"]').click(); });
  check('다시 켜면 기억됨 (도크가 보이는 화면에서는 여전히 감춤)', await ev(pa, () => localStorage.getItem('yn.pv.mq') === '1'));

  /* ============================================================ 3. 성능: 쪽 그림 저장소 */
  console.log('3. 성능 — 쪽 그림 저장소 · 다시 그리기 묶기');
  const mainRenders = (p) => p.evaluate(() => window.__renders.filter((r) => r.w > 400).length);
  await sleep(1800);                                                // 앞 · 뒤 쪽을 미리 그릴 시간
  await L.waitTrue(pa, () => window.__pv.P.cacheInfo().pages >= 2, null, 6000);
  const ci0 = await ev(pa, () => window.__pv.P.cacheInfo());
  check('지금 쪽 + 미리 그린 다음 쪽이 저장소에 있음 (2쪽 이상)', ci0.pages >= 2 && ci0.bytes > 0 && ci0.bytes <= 96 * 1024 * 1024, ci0);
  const r0 = await mainRenders(pa);
  await pa.click('[data-a="next"]'); await L.waitTrue(pa, () => document.querySelector('.pv-pg').textContent === '2 / 4', null, 3000); await sleep(400);
  const r1 = await mainRenders(pa);
  check('2쪽으로 넘겨도 PDF 를 새로 그리지 않음 (저장소에서 붙임)', r1 === r0, [r0, r1]);
  check('넘긴 쪽에 악보가 실제로 보임', (await L.pdfInk(pa)) > 500, await L.pdfInk(pa));
  await sleep(1200);
  const r2a = await mainRenders(pa);
  await pa.click('[data-a="prev"]'); await L.waitTrue(pa, () => document.querySelector('.pv-pg').textContent === '1 / 4', null, 3000); await sleep(400);
  const r2 = await mainRenders(pa);
  check('1쪽으로 되돌아와도 새로 그리지 않음', r2 === r2a, [r2a, r2]);
  check('되돌아온 쪽에도 악보가 보임', (await L.pdfInk(pa)) > 500);
  await sleep(1200);
  const r3a = await mainRenders(pa);
  await ev(pa, () => { for (let i = 0; i < 12; i++) window.dispatchEvent(new Event('resize')); });
  await sleep(700);
  check('창 크기 이벤트가 12번 몰려도 (크기가 같으면) 다시 그리지 않음', (await mainRenders(pa)) === r3a, [r3a, await mainRenders(pa)]);
  for (let i = 0; i < 4; i++) { await pa.click('.pv-tabbtn[data-tab="metro"]'); await pa.click('.pv-tabbtn[data-tab="together"]'); }
  await sleep(800);
  check('패널 탭을 8번 바꿔도 다시 그리지 않음', (await mainRenders(pa)) === r3a, [r3a, await mainRenders(pa)]);
  { const a0 = await mainRenders(pa); for (let k = 0; k < 2; k++) { await pa.click('.pv-tools [data-a="dockhide"]'); await sleep(120); await pa.click('.pv-toolsbtn'); await sleep(120); } await sleep(900);   // v6 — ▴ 로 접고 알약으로 폄
    const a1 = await mainRenders(pa); check('도구 막대를 4번 접고 펴도 그리기는 아주 적음 (최대 3번: 본 화면 1 + 앞뒤 미리 그리기 2)', a1 - a0 <= 3, [a0, a1]); }
  { const a0 = await mainRenders(pa);
    await ev(pa, () => { const st = document.querySelector('.pv-stage'); for (let i = 0; i < 8; i++) st.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -40, bubbles: true, cancelable: true })); });
    await sleep(900); const a1 = await mainRenders(pa);
    check('Ctrl+휠 확대를 8번 연달아 해도 다시 그리기는 한 번 (미리보기는 CSS)', a1 - a0 <= 3 && (await ev(pa, () => window.__pv.P.canvas() && true)), [a0, a1]);
    check('확대 뒤 CSS 미리보기가 원래대로 돌아옴 (transform 없음)', await ev(pa, () => document.querySelector('.pv-pagebox').style.transform === ''));
    await pa.click('[data-a="zfit"]'); await sleep(300); await pa.click('[data-a="zfit"]'); await sleep(400); }

  /* ============================================================ 4. 성능: 필기 그림 저장 */
  console.log('4. 성능 — 필기가 많은 쪽에서 획을 그을 때');
  await pa.click('.pv-tool[data-tool="pen"]');
  await ev(pa, () => { const an = window.__pv.P.anno(), pg = window.__pv.P.page(); for (let i = 0; i < 60; i++) { const p = []; for (let k = 0; k < 12; k++) p.push(0.1 + ((i * 7 + k * 5) % 80) / 100, 0.1 + ((i * 13 + k * 3) % 80) / 100); an.remoteAdd('team', { id: 'perf' + i, t: 'pen', pg, c: '#e53935', w: 0.003, p, by: 'X' }); } });
  await sleep(400);
  const inkBefore = await L.overlayPx(pa);
  { const b = await L.vis(pa); await pa.mouse.move(b.x + .2 * b.width, b.y + .5 * b.height); await pa.mouse.down(); await sleep(60);
    await ev(pa, () => { window.__strokes = 0; window.__f0 = 0; const f = () => { window.__f0++; window.__raf = requestAnimationFrame(f); }; f(); });
    for (let i = 1; i <= 24; i++) { await pa.mouse.move(b.x + (.2 + i * .02) * b.width, b.y + (.5 + Math.sin(i / 3) * .05) * b.height); await sleep(24); }
    const st = await ev(pa, () => { cancelAnimationFrame(window.__raf); return { strokes: window.__strokes, frames: window.__f0 }; });
    check('획을 긋는 동안 확정된 60개 필기를 매 프레임 다시 그리지 않음 (프레임당 stroke 20회 미만)', st.frames > 8 && st.strokes / st.frames < 20, st);
    await pa.mouse.up(); }
  await sleep(500);
  check('획을 그은 뒤 새 획이 반영되어 필기 픽셀이 늘어남', (await L.overlayPx(pa)) > inkBefore, [inkBefore, await L.overlayPx(pa)]);
  check('확정된 필기 60개 + 새 획 1개가 모두 보존됨', (await L.teamCount(pa)) === 61, await L.teamCount(pa));
  { const b = await L.vis(pa); const px0 = await L.overlayPx(pa);
    await ev(pa, () => window.__pv.P.anno().remoteAdd('team', { id: 'perf-late', t: 'pen', pg: window.__pv.P.page(), c: '#2563eb', w: 0.004, p: [0.05, 0.95, 0.95, 0.96], by: 'X' })); await sleep(300);
    check('남이 새로 그린 필기도 저장해 둔 그림에 밀리지 않고 바로 보임', (await L.overlayPx(pa)) > px0, [px0, await L.overlayPx(pa)]); }
  await pa.click('.pv-tool[data-tool="none"]');

  /* ============================================================ 5. 정리: 닫으면 리스너 · 타이머 · 저장소가 남지 않음 */
  console.log('5. 정리 — 닫으면 리스너 · 그림 저장소 · 화면 켜짐이 남지 않음');
  const relBefore = await ev(pa, () => window.__wl.rel);
  await ev(pa, () => window.YNPractice.close());
  await sleep(400);
  const diff = await ev(pa, () => { const d = {}; Object.keys(window.__lis).forEach((k) => { if (/^win:pointer/.test(k)) return; /* 시험 도구(Playwright)가 클릭할 때 window 에 잠깐 붙였다 떼는 것 */ const n = (window.__lis[k] || 0) - ((window.__lisBefore || {})[k] || 0); if (n) d[k] = n; }); return d; });
  check('닫은 뒤 window · document 리스너가 열기 전과 같음 (keydown · keyup · pointerup · pointerdown · resize · orientationchange · pagehide · visibilitychange · pageshow · focus)', Object.keys(diff).length === 0, diff);
  check('닫으면 Wake Lock 을 놓음', await ev(pa, (n) => window.__wl.rel > n, relBefore), await ev(pa, () => window.__wl));
  check('닫은 뒤에는 다시 잡지 않음 (숨김 → 보임)', await (async () => { const n0 = await ev(pa, () => window.__wl.req); await ev(pa, () => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); }); await sleep(300); return (await ev(pa, () => window.__wl.req)) === n0; })());
  check('닫으면 메트로놈 빠른 버튼도 사라짐', await ev(pa, () => !document.querySelector('.pv-mq')));
  check('닫으면 소리 없는 <audio> 도 정리됨', await ev(pa, () => !window.YNMetro.Media.el && !window.YNMetro.Media.on));
  check('잔여 오류 없음 (컴퓨터)', A.errs.length === 0, A.errs);

  /* ============================================================ 6. 폰 화면: 버튼이 위에 · 패널의 시작 버튼이 스크롤해도 붙어 있음 */
  console.log('6. 폰 화면 (390×844) — 메트로놈 시작 버튼');
  const Ph = await mk('tokA', { vp: { width: 390, height: 844 }, touch: true, mobile: true }); const pp = Ph.page;
  check('폰: 압축(compact) 배치', await ev(pp, () => document.querySelector('.pv').classList.contains('pv-compact')));
  check('폰: 빠른 버튼이 화면 위쪽 (첫 화면 위 1/3 안)에 있음', await ev(pp, () => { const b = document.querySelector('.pv-mq').getBoundingClientRect(); return b.top >= 0 && b.bottom < innerHeight / 3 + 60 && b.right <= innerWidth; }), await ev(pp, () => JSON.stringify(document.querySelector('.pv-mq').getBoundingClientRect())));
  check('폰: 빠른 버튼을 누를 수 있음 (다른 요소에 안 가려짐 · 터치 크기 44px 이상)', await ev(pp, () => { const g = document.querySelector('.pv-mq-go').getBoundingClientRect(), t = document.elementFromPoint(g.x + g.width / 2, g.y + g.height / 2); return g.width >= 44 && g.height >= 44 && !!t && !!t.closest('.pv-mq'); }));
  await pp.tap('.pv-mq-go'); await sleep(500);
  check('폰: 탭하면 메트로놈 시작', await ev(pp, () => document.querySelector('.pv-mq-go').textContent === '■'));
  await pp.tap('.pv-mq-bpm'); await sleep(600);
  check('폰: BPM 을 탭하면 패널이 아래에서 올라옴', await ev(pp, () => document.querySelector('.pv').classList.contains('pv-sideopen') && !!document.querySelector('.pv-tabbtn[data-tab="metro"].on')));
  await ev(pp, () => { const p = document.querySelector('.pv-panes'); p.scrollTop = p.scrollHeight; }); await sleep(300);
  check('폰: 패널 맨 아래까지 스크롤해도 시작/멈춤 버튼이 패널 맨 위에 붙어 보임', await ev(pp, () => { const s = document.querySelector('.pv-mstick').getBoundingClientRect(), p = document.querySelector('.pv-panes').getBoundingClientRect(); return document.querySelector('.pv-panes').scrollTop > 100 && Math.abs(s.top - p.top) <= 2 && s.height > 40; }), await ev(pp, () => [document.querySelector('.pv-mstick').getBoundingClientRect().top, document.querySelector('.pv-panes').getBoundingClientRect().top, document.querySelector('.pv-panes').scrollTop]));
  await pp.tap('[data-role="toggle"]'); await sleep(500);
  check('폰: 붙어 있는 버튼으로 멈출 수 있음 (빠른 버튼과 상태 동기)', await ev(pp, () => document.querySelector('.pv-mq-go').textContent === '▶' && /시작/.test(document.querySelector('[data-role="toggle"]').textContent)));
  check('폰: 잔여 오류 없음', Ph.errs.length === 0, Ph.errs);

  /* ============================================================ 7. Wake Lock API 가 없는 기기 → 작은 동영상 예비 방법 */
  console.log('7. Wake Lock 이 없는 기기 — 예비 방법 (소리 · 화면 없는 작은 동영상)');
  const N = await mk('tokA', { noWake: true }); const pn = N.page;
  check('API 없음을 인식 (api:false)', await ev(pn, () => window.__pv.P.wake().api === false));
  check('예비: 보이지 않는 <video> 를 만들어 재생함', await L.waitTrue(pn, () => { const v = document.querySelector('video[aria-hidden="true"]'); return !!v && !v.paused && v.loop && v.muted; }, null, 4000), await ev(pn, () => { const v = document.querySelector('video'); return v ? { paused: v.paused, err: v.error && v.error.code, src: v.currentSrc.slice(0, 30) } : null; }));
  check('예비 방식 상태: mode = video', await ev(pn, () => window.__pv.P.wake().mode === 'video'), await ev(pn, () => window.__pv.P.wake()));
  check('<video> 는 화면에서 안 보임 (1px · 투명 · 클릭 통과)', await ev(pn, () => { const v = document.querySelector('video[aria-hidden="true"]'), c = getComputedStyle(v); return v.getBoundingClientRect().width <= 1 && +c.opacity < 0.05 && c.pointerEvents === 'none'; }));
  await ev(pn, () => window.YNPractice.close()); await sleep(300);
  check('닫으면 <video> 도 없어짐', await ev(pn, () => !document.querySelector('video')));
  check('예비 방식 잔여 오류 없음', N.errs.length === 0, N.errs);

  /* ============================================================ 8. 실시간 · 서버 요청 절약 */
  console.log('8. 서버 요청 절약 — 내 필기 기억 · 팀 필기는 시트 읽기 생략');
  S.store.callLog.length = 0;
  const R = await mk('tokA', { noOpen: true }); const pr = R.page;
  await pr.evaluate(() => { window.__pv = OPEN({ sheets: [{ id: 'FILEID_AAAAAAA1', name: 'Amazing Grace.pdf' }, { id: 'FILEID_BBBBBBB2', name: 'Second Song.pdf' }] }); });
  await L.waitTrue(pr, () => document.querySelector('.pv-pg') && /\/ 3/.test(document.querySelector('.pv-pg').textContent), null, 9000); await sleep(900);
  const loads = () => S.store.callLog.filter((c) => c.fn === 'worshipAnnoLoad');
  let mc0 = 0;
  const first = loads().filter((c) => c.args[0] === 'FILEID_AAAAAAA1');
  check('실시간이 연결된 뒤 열면 팀 필기는 시트에서 읽지 않음 (mineOnly=true)', first.length >= 1 && first.every((c) => c.args[2] === true), first);
  { const n0 = loads().length; await pr.evaluate(() => window.__pv.loadSheet(1, 1)); await sleep(700); const n1 = loads().length;
    check('다른 악보로 가면 그 악보의 내 필기는 새로 읽음', n1 > n0, [n0, n1]);
    await pr.evaluate(() => window.__pv.loadSheet(0, 1)); await sleep(700); const n2 = loads().length;
    check('처음 악보로 돌아오면 기억해 둔 내 필기를 씀 → 서버 요청 없음', n2 === n1, [n1, n2]);
    mc0 = await ev(pr, () => window.__pv.P.cacheInfo().mine);
    check('기억된 내 필기 개수가 보임 (cacheInfo.mine)', mc0 >= 2, mc0); }
  { await pr.click('.pv-tool[data-tool="pen"]'); await pr.evaluate(() => document.querySelector('[data-layer="mine"], .pv-layerchk, input[data-o="mine"]') && 0);
    await ev(pr, () => window.__pv.P.setLayer('mine')); await L.drag(pr, [[.2, .3], [.5, .4], [.7, .3]]); await sleep(600);
    const ci = await ev(pr, () => window.__pv.P.cacheInfo().mine);
    check('내 필기를 새로 쓰면 그 악보의 기억은 비워짐 (오래된 내용을 다시 쓰지 않게)', ci < mc0, [mc0, ci]);
    await ev(pr, () => window.__pv.loadSheet(1, 1)); await sleep(900); await ev(pr, () => window.__pv.loadSheet(0, 1)); await sleep(900);
    check('돌아왔을 때 방금 쓴 내 필기가 그대로 보임', (await L.mineCount(pr)) >= 1, await L.mineCount(pr));
  }
  check('잔여 오류 없음 (서버 요청)', R.errs.length === 0, R.errs);

  await br.close(); S.server.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
