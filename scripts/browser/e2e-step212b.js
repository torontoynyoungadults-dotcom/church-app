/**
 * Step 2.12 — 송폼 마디 수 · 직접 입력(기도 · 키 업) · 애플 펜슬 손바닥 무시
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
  const fake = { speaking: false, getVoices() { return []; }, cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {}, speak(u) { (window.__spoken = window.__spoken || []).push(u.text); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  document.addEventListener('animationstart', (e) => { if (e.animationName === 'pvflash') window.__flashes++; }, true);
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
  const P = (fn) => pa.evaluate(fn);

  console.log('· 송폼 만들기 — 마디 수 · 직접 입력');
  await P(() => window.__pv.P.showTab('form')); await sleep(400);
  const inp = () => pa.evaluate(() => document.querySelector('[data-e="form"]').value);
  await pa.evaluate(() => { const f = document.querySelector('[data-e="form"]'); f.value = ''; f.dispatchEvent(new Event('change', { bubbles: true })); });
  await pa.click('.fb [data-add="V1"]'); await sleep(100);
  check('칸을 고르면 "마디 수" 줄이 나타남 (없음 · 2 · 4 · 8 · 12 · 16 + 직접)', await pa.evaluate(() => document.querySelectorAll('.fb-bars [data-bars]').length === 6 && !!document.querySelector('.fb-bars [data-role="barsin"]')));
  await pa.click('.fb-bars [data-bars="8"]'); await sleep(100);
  check('8마디 → 칩에 "8마디" 표시', await pa.evaluate(() => /8마디/.test(document.querySelector('.fb-chip.on').textContent)));
  check('저장 문자열은 "V1:8"', await inp() === 'V1:8', await inp());
  await pa.fill('.fb [data-role="barsin"]', '6'); await pa.dispatchEvent('.fb [data-role="barsin"]', 'change'); await sleep(100);
  check('직접 입력한 마디 수(6)도 됨', await inp() === 'V1:6', await inp());
  await pa.click('.fb [data-add="C"]'); await pa.click('.fb-bars [data-bars="4"]'); await pa.click('.fb [data-act="rep"]'); await sleep(100);
  check('마디 수와 반복(×2)을 함께: "C:4×2"', (await inp()) === 'V1:6-C:4×2', await inp());
  await pa.click('.fb [data-add="Prayer"]'); await sleep(100);
  check('팔레트에 기도(Prayer) 버튼', /Prayer/.test(await inp()), await inp());
  await pa.fill('.fb [data-role="cin"]', '키 업'); await pa.press('.fb [data-role="cin"]', 'Enter'); await sleep(100);
  check('직접 입력 "키 업" → 표준 칸(KeyUp)으로', /KeyUp/.test(await inp()), await inp());
  await pa.fill('.fb [data-role="cin"]', '마지막 줄, 한 번 더'); await pa.fill('.fb [data-role="cbars"]', '2'); await pa.click('.fb [data-act="addcustom"]'); await sleep(100);
  check('직접 입력 글 + 마디 수 → 한 칸으로 (쉼표는 공백으로): "마지막 줄 한 번 더:2"', /마지막 줄 한 번 더:2/.test(await inp()), await inp());
  check('직접 입력 칸은 다시 비워짐 · 칩이 custom 표시', await pa.evaluate(() => document.querySelectorAll('.fb-chip.custom').length === 1));
  const saved = await inp();
  await pa.evaluate((v) => { const P = window.__pv.P; P.songs[0].form = v; P.emit('songedit'); }, saved); await sleep(300);
  check('재생 화면(송폼 순서)에 마디 수가 보임', await pa.evaluate(() => Array.from(document.querySelectorAll('.fp-chip em')).map((e) => e.textContent).join() === '6마디,4마디,2마디' ), await pa.evaluate(() => Array.from(document.querySelectorAll('.fp-chip em')).map((e) => e.textContent).join()));
  check('옛 형식(마디 수 없음)은 그대로 읽힘', await pa.evaluate(() => { const F = window.YNForm; return F.stringify(F.parse('Intro-V1-C-V2×2-B')) === 'Intro-V1-C-V2×2-B' && F.parse('V1-C').every((t) => !t.bars); }));
  await pa.evaluate(() => { window.__spoken = []; });
  await pa.click('.fp-chip:has(b:text-is("Prayer"))'); await sleep(500);
  check('재생 화면에서 기도 칸 → 음성 "Prayer"', await pa.evaluate(() => (window.__spoken || []).indexOf('Prayer') >= 0), await pa.evaluate(() => window.__spoken));
  await pa.click('.fp-chip:has(b:text-is("KeyUp"))'); await sleep(400);
  check('키 업 칸 → 음성 "Key Up"', await pa.evaluate(() => (window.__spoken || []).indexOf('Key Up') >= 0), await pa.evaluate(() => window.__spoken));
  await pa.click('.fp-chip.fp-chip:has(b:text-is("마지막 줄 한 번 더"))'); await sleep(400);
  check('직접 입력한 글 그대로 음성 안내', await pa.evaluate(() => (window.__spoken || []).indexOf('마지막 줄 한 번 더') >= 0), await pa.evaluate(() => window.__spoken));

  console.log('· 애플 펜슬 손바닥 무시');
  await P(() => window.__pv.P.showTab('anno')); await pa.click('.pv-tool[data-tool="pen"]'); await sleep(200);
  const pg0 = await pa.evaluate(() => window.__pv.P.page());
  const tch = (type, x, y, extra) => pa.evaluate(([type, x, y, extra]) => { const st = document.querySelector('.pv-stage'); const t = new Touch(Object.assign({ identifier: 1, target: st, clientX: x, clientY: y }, extra || {})); const list = type === 'touchend' ? [] : [t]; st.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: [t] })); }, [type, x, y, extra]);
  const pen = (type) => pa.evaluate((type) => { const cv = document.querySelector('.pv-anno'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 77, pointerType: 'pen', clientX: r.x + 200, clientY: r.y + 200, isPrimary: true })); }, type);
  await pen('pointermove'); await sleep(50);
  check('펜슬이 화면 위에 있으면 악보 칸이 잠김(.pv-penlock · touch-action:none)', await pa.evaluate(() => { const s = document.querySelector('.pv-stage'); return s.classList.contains('pv-penlock') && getComputedStyle(s).touchAction === 'none'; }));
  const st0 = await pa.evaluate(() => document.querySelector('.pv-stage').scrollTop);
  await tch('touchstart', 600, 300); await tch('touchmove', 300, 300); await tch('touchmove', 100, 300); await tch('touchend', 100, 300); await sleep(200);
  check('펜슬 근처의 손바닥 쓸기는 쪽을 넘기지 않음', await pa.evaluate(() => window.__pv.P.page()) === pg0);
  check('화면도 움직이지 않음', await pa.evaluate(() => document.querySelector('.pv-stage').scrollTop) === st0);
  await sleep(1100);
  check('펜슬이 떠나면 잠금이 풀림', await pa.evaluate(() => !document.querySelector('.pv-stage').classList.contains('pv-penlock')));
  await tch('touchstart', 600, 300, { radiusX: 60, radiusY: 60 }); await tch('touchmove', 300, 300, { radiusX: 60, radiusY: 60 }); await tch('touchmove', 100, 300, { radiusX: 60, radiusY: 60 }); await tch('touchend', 100, 300, { radiusX: 60, radiusY: 60 }); await sleep(200);
  check('닿는 면이 넓은 터치(손바닥)도 쪽을 넘기지 않음', await pa.evaluate(() => window.__pv.P.page()) === pg0);
  await P(() => window.__pv.P.anno().setPenMode('always')); await sleep(100);
  await tch('touchstart', 600, 300); await tch('touchmove', 300, 300); await tch('touchmove', 100, 300); await tch('touchend', 100, 300); await sleep(300);
  check('펜슬 전용 모드에서 손가락(펜슬 없음)으로 쓸면 여전히 쪽이 넘어감 (기존 동작)', await pa.evaluate(() => window.__pv.P.page()) === pg0 + 1, await pa.evaluate(() => window.__pv.P.page()));
  await P(() => window.__pv.P.anno().setPenMode('auto'));
  check('캔버스는 항상 touch-action:none', await pa.evaluate(() => document.querySelector('.pv-anno').style.touchAction === 'none'));
  await pa.evaluate(() => { const cv = document.querySelector('.pv-anno'); const n0 = window.__pv.P.anno().items('team').length; window.__n0 = n0; });
  await pa.evaluate(() => { const cv = document.querySelector('.pv-anno'), r = cv.getBoundingClientRect(); const ev = (t, x, y, ty, id) => cv.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: id, pointerType: ty, clientX: r.x + x, clientY: r.y + y, isPrimary: true, pressure: 0.5, buttons: t === 'pointerup' ? 0 : 1, width: ty === 'touch' ? 80 : 1, height: ty === 'touch' ? 80 : 1 })); ev('pointerdown', 100, 300, 'touch', 5); ev('pointermove', 150, 320, 'touch', 5); ev('pointerup', 150, 320, 'touch', 5); });
  await sleep(500);
  check('손바닥(넓은 터치)은 필기로 그려지지 않음', await pa.evaluate(() => window.__pv.P.anno().items('team').length === window.__n0));
  check('잔여 오류 없음', noErr(), [A.errs]);
  await br.close(); S.server.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
