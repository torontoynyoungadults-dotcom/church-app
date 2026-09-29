/**
 * Step 2.11b — 한 쪽 맞춤 기본 · 전체 화면 모드 · 떠 있는 도구 막대 · 모든 박 깜빡임 · BPM 숫자 패드
 * 진짜 브라우저 3개(Alice 인도자 · Carol 인도자 · Bob 팀원)로 시험합니다.
 */
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const INIT = `(() => {
  window.__osc = []; window.__ctxs = []; window.__flashes = 0;
  const AC = window.AudioContext;
  const co = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () {
    const o = co.call(this); const st = o.start.bind(o); const sf = o.frequency.setValueAtTime.bind(o.frequency); let f = 0;
    o.frequency.setValueAtTime = (v, t) => { if (!f) f = v; return sf(v, t); };
    o.start = (t) => { window.__osc.push({ t: t == null ? this.currentTime : t, f: f || o.frequency.value }); return st(t); };
    return o;
  };
  const Orig = window.AudioContext; window.AudioContext = function (...a) { const c = new Orig(...a); window.__ctxs.push(c); return c; }; window.AudioContext.prototype = Orig.prototype;
  const fake = { speaking: false, getVoices() { return []; }, cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {}, speak() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  document.addEventListener('animationstart', (e) => { if (/^pvflash/.test(e.animationName)) window.__flashes++; }, true);
})();`;
(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const mk = async (tok) => { const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); await ctx.addInitScript(INIT); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto(base + '/h.html?t=' + tok); await page.click('#go'); return { ctx, page, errs }; };
  const A = await mk('tokA'), C = await mk('tokC'), B = await mk('tokB'); const pa = A.page, pc = C.page, pb = B.page;
  for (const p of [pa, pb, pc]) { await L.waitTrue(p, () => document.querySelector('.pv-pg') && /1 \//.test(document.querySelector('.pv-pg').textContent), null, 8000); await L.waitTrue(p, () => /실시간/.test(document.querySelector('.pv-conn').textContent), null, 6000); }
  const osc = (p) => p.evaluate(() => window.__osc.map((o) => ({ t: o.t, f: o.f })));
  const txt = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
  const openTab = async (p, id) => { await p.click('.pv-tabbtn[data-tab="' + id + '"]'); await sleep(150); };
  const running = (p) => p.evaluate(() => /멈춤/.test(document.querySelector('[data-role="toggle"]').textContent));
  const wallBeats = (p, since) => p.evaluate((s) => { const c = window.__ctxs[0]; const wall = Date.now(), ct = c.currentTime; return window.__osc.filter((o) => o.t >= s).map((o) => ({ w: wall + (o.t - ct) * 1000, f: o.f })); }, since || 0);
  const noErr = () => [A].every((x) => !x.errs.length);
  const rect = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vis: e.offsetParent !== null || getComputedStyle(e).position === 'fixed' }; }, sel);

  console.log('· 한 쪽 맞춤이 기본 (컴퓨터 1280×800)');
  check('처음부터 "한 쪽 맞춤" (컴퓨터)', await pa.evaluate(() => window.__pv.P.fit()) === 'page');
  await pa.click('.pv-b[data-a="zfit"]'); await sleep(300);
  check('맞춤 버튼으로 가로 폭 맞춤과 오가기', await pa.evaluate(() => window.__pv.P.fit()) === 'width');
  await pa.click('.pv-b[data-a="zfit"]'); await sleep(300);
  check('다시 누르면 한 쪽 맞춤', await pa.evaluate(() => window.__pv.P.fit()) === 'page');
  { const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await ctx.addInitScript(INIT); const p2 = await ctx.newPage();
    await p2.goto(base + '/h.html?t=tokA'); await p2.click('#go'); await L.waitTrue(p2, () => document.querySelector('.pv-pg') && /1 \//.test(document.querySelector('.pv-pg').textContent), null, 8000);
    check('폰 세로 화면도 처음부터 한 쪽 맞춤', await p2.evaluate(() => window.__pv.P.fit()) === 'page');
    await p2.evaluate(() => window.__pv.P.setFullscreen(true)); await sleep(500);
    check('폰: 전체 화면이 켜지고 위 메뉴가 사라짐', await p2.evaluate(() => document.querySelector('.pv').classList.contains('pv-fs') && document.querySelector('.pv-top').offsetParent === null));
    check('폰: 얇은 메뉴가 화면 위에 보이고 버튼이 44px 이상', await p2.evaluate(() => { const b = document.querySelector('.pv-fsbar [data-a="fs"]').getBoundingClientRect(); return b.height >= 44 && b.top >= 0 && b.right <= innerWidth + 1; }));
    await ctx.close(); }

  console.log('· 떠 있는 도구 막대 (컴퓨터)');
  { const tb = await rect(pa, '.pv-tools'), st = await rect(pa, '.pv-stage'), cs = await pa.evaluate(() => getComputedStyle(document.querySelector('.pv-tools')).position);
    check('도구 막대가 악보 위에 떠 있음 (position:absolute)', cs === 'absolute', cs);
    check('도구 막대가 악보 칸 안쪽 위에 있고 높이가 작음', tb.y >= st.y - 1 && tb.h < 110 && tb.x >= st.x, [tb, st]);
    const top = await rect(pa, '.pv-top'); check('악보 칸이 화면 위 메뉴 바로 아래부터 시작 (도구 줄이 자리를 차지하지 않음)', Math.abs(st.y - (top.y + top.h)) < 4, [st, top]); }

  console.log('· 모든 박 깜빡임');
  await openTab(pa, 'metro');
  await pa.fill('[data-role="bpm"]', '120'); await pa.dispatchEvent('[data-role="bpm"]', 'change');
  await pa.check('[data-o="flash"]');
  check('"모든 박에서 깜빡임" 이 기본 켜짐', await pa.evaluate(() => document.querySelector('[data-o="flashall"]').checked));
  await pa.evaluate(() => { window.__flashes = 0; }); await pa.click('[data-role="toggle"]'); await sleep(2300);
  { const n = await pa.evaluate(() => window.__flashes); check('120 BPM 4/4 를 2초 남짓 → 박마다 번쩍 (4번 이상)', n >= 4, n); }
  await pa.click('[data-role="toggle"]'); await sleep(200);
  await pa.uncheck('[data-o="flashall"]'); await pa.evaluate(() => { window.__flashes = 0; }); await pa.click('[data-role="toggle"]'); await sleep(2300);
  { const n = await pa.evaluate(() => window.__flashes); check('끄면 첫 박에만 (2번 이하)', n >= 1 && n <= 2, n); }
  await pa.click('[data-role="toggle"]'); await sleep(200); await pa.uncheck('[data-o="flash"]');
  check('깜빡임 화면이 클릭을 막지 않음', await pa.evaluate(() => getComputedStyle(document.querySelector('.pv-flash')).pointerEvents === 'none'));

  console.log('· BPM 숫자 패드 (inputmode=numeric)');
  check('메트로놈 BPM 입력칸', await pa.evaluate(() => document.querySelector('[data-role="bpm"]').getAttribute('inputmode') === 'numeric'));
  await pa.evaluate(() => window.__pv.P.showTab('form')); await sleep(300);
  check('송폼 탭: 미니 메트로놈 BPM · 곡 정보 BPM 입력칸', await pa.evaluate(() => document.querySelector('.pv-mini-in').getAttribute('inputmode') === 'numeric' && document.querySelector('[data-e="bpm"]').getAttribute('inputmode') === 'numeric'));

  console.log('· 전체 화면 모드');
  await pa.evaluate(() => window.__pv.P.showTab('metro')); await openTab(pa, 'metro'); await pa.click('.pv-b[data-a="panel"]').catch(() => {});
  const before = await rect(pa, '.pv-stage');
  await pa.click('.pv-fsbtn'); await sleep(700);
  check('전체 화면: 위 메뉴 · 도구 막대 · 패널이 사라짐', await pa.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !e || e.offsetParent === null || getComputedStyle(e).display === 'none'; }; return document.querySelector('.pv').classList.contains('pv-fs') && v('.pv-top') && v('.pv-tools') && !document.querySelector('.pv').classList.contains('pv-sideopen'); }));
  { const now = await rect(pa, '.pv-stage'); check('악보 칸이 넓어짐 (위 메뉴 높이만큼 위로 · 패널만큼 옆으로)', now.h > before.h + 20 && now.y < 5, [before, now]); }
  check('처음에는 얇은 메뉴가 보임 (나가기 · 쪽 · 맞춤 · 도구 · 패널)', await pa.evaluate(() => { const b = document.querySelector('.pv-fsbar').getBoundingClientRect(); return document.querySelector('.pv').classList.contains('pv-fsbar-on') && b.bottom > 20 && b.top >= -1; }));
  check('메뉴의 쪽 표시', /\d+ \/ \d+/.test(await txt(pa, '.pv-fspg')));
  await pa.click('.pv-fsbar [data-a="next"]'); await sleep(500);
  check('메뉴의 다음 쪽 버튼이 동작 (쪽 번호 갱신)', /^2 \//.test(await txt(pa, '.pv-fspg')), await txt(pa, '.pv-fspg'));
  await pa.evaluate(() => document.querySelector('.pv').classList.remove('pv-fsbar-on')); await sleep(300);
  check('메뉴가 숨으면 위 가운데 손잡이가 보임', await pa.evaluate(() => getComputedStyle(document.querySelector('.pv-fshandle')).display !== 'none'));
  { const st = await rect(pa, '.pv-stage'); await pa.mouse.click(st.x + st.w / 2, st.y + st.h / 2); await sleep(300); }
  check('악보를 톡 누르면 메뉴가 나타남', await pa.evaluate(() => document.querySelector('.pv').classList.contains('pv-fsbar-on')));
  { const st = await rect(pa, '.pv-stage'); await pa.mouse.click(st.x + st.w / 2, st.y + st.h / 2 + 40); await sleep(300); }
  check('한 번 더 누르면 메뉴가 사라짐', await pa.evaluate(() => !document.querySelector('.pv').classList.contains('pv-fsbar-on')));
  { const st = await rect(pa, '.pv-stage'); await pa.mouse.move(st.x + 300, st.y + 300); await pa.mouse.down(); await pa.mouse.move(st.x + 420, st.y + 380, { steps: 6 }); await pa.mouse.up(); await sleep(300); }
  check('끌기(스크롤·확대 손짓)는 메뉴를 켜지 않음', await pa.evaluate(() => !document.querySelector('.pv').classList.contains('pv-fsbar-on')));
  await pa.evaluate(() => window.__pv.P.setTool ? 0 : 0); await pa.keyboard.press('KeyP'); await sleep(200);
  { const st = await rect(pa, '.pv-stage'); await pa.mouse.click(st.x + st.w / 2, st.y + st.h / 2); await sleep(300); }
  check('필기 도구를 쓰는 중에는 톡 눌러도 메뉴가 뜨지 않음 (필기 방해 없음)', await pa.evaluate(() => !document.querySelector('.pv').classList.contains('pv-fsbar-on')));
  await pa.click('.pv-fshandle'); await sleep(250);
  check('손잡이를 누르면 메뉴가 나타남 (필기 중에도)', await pa.evaluate(() => document.querySelector('.pv').classList.contains('pv-fsbar-on')));
  await pa.click('.pv-fsbar [data-a="fs-tools"]'); await sleep(300);
  check('메뉴의 "도구" 로 필기 도구를 다시 꺼낼 수 있음', await pa.evaluate(() => !document.querySelector('.pv').classList.contains('pv-toolshide')));
  await pa.click('.pv-fsbar [data-a="fs"]'); await sleep(700);
  check('나가기: 위 메뉴가 돌아오고 전체 화면 표시가 사라짐 (필기 도구 표시도 그대로)', await pa.evaluate(() => { const p = document.querySelector('.pv'); return !p.classList.contains('pv-fs') && document.querySelector('.pv-top').offsetParent !== null && !p.classList.contains('pv-toolshide'); }));
  await pa.click('.pv-fsbtn'); await sleep(500); await pa.keyboard.press('Escape'); await sleep(500);
  check('Esc 는 전체 화면만 끝내고 세션은 닫지 않음', await pa.evaluate(() => !!document.querySelector('.pv') && !document.querySelector('.pv').classList.contains('pv-fs')));
  await pa.click('.pv-fsbtn'); await sleep(400);
  await pa.evaluate(() => window.YNPractice.close()); await sleep(300);
  check('전체 화면 중 세션을 닫아도 깔끔히 정리됨', await pa.evaluate(() => !document.querySelector('.pv') && !document.fullscreenElement));
  check('잔여 오류 없음', noErr(), [A.errs]);
  await br.close(); S.server.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
