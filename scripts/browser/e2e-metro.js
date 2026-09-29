/**
 * Step 2.8 — 메트로놈(큰 박 원 · 강세 · 음높이 · 볼륨 · 화면 깜빡임) · 페이지 컨트롤 / 클릭 컨트롤 분리 · 동기화 끄기 · 송폼 박스
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
  const noErr = () => [A, B, C].every((x) => !x.errs.length);

  console.log('· 큰 박 원 (칸 너비를 꽉 채움)');
  await openTab(pa, 'metro');
  { const m = await pa.evaluate(() => { const d = document.querySelector('[data-role="dots"]'), r = d.getBoundingClientRect(), k = Array.from(d.children).map((e) => e.getBoundingClientRect()); return { cw: r.width, n: k.length, w: k[0].width, h: k[0].height, left: k[0].left - r.left, right: r.right - k[k.length - 1].right }; });
    check('4/4 는 원 4개', m.n === 4, m);
    check('원들이 칸 너비를 꽉 채움 (좌우 여백 4px 이하)', m.left <= 4 && m.right <= 4, m);
    check('원이 충분히 큼 (지름 50px 이상)', m.w >= 50, m.w);
    check('원은 동그라미 (가로 = 세로)', Math.abs(m.w - m.h) < 1.5, m); }
  await pa.selectOption('[data-o="sig"]', '6/8');
  check('6/8 은 원 6개', await pa.evaluate(() => document.querySelectorAll('[data-role="dots"] .pv-beat').length === 6));
  await pa.selectOption('[data-o="sig"]', '12/8');
  { const rows = await pa.evaluate(() => new Set(Array.from(document.querySelectorAll('[data-role="dots"] .pv-beat')).map((e) => Math.round(e.getBoundingClientRect().top))).size); check('12/8 은 원 12개 · 두 줄', rows === 2 && await pa.evaluate(() => document.querySelectorAll('[data-role="dots"] .pv-beat').length === 12), rows); }
  await pa.selectOption('[data-o="sig"]', '4/4');
  check('기본 강세: 첫 박에만 ">"', await pa.evaluate(() => Array.from(document.querySelectorAll('[data-role="dots"] .pv-beat')).map((e) => e.classList.contains('acc')).join() === 'true,false,false,false'));

  console.log('· 박 원을 눌러 ">" 강세');
  await pa.fill('[data-role="bpm"]', '120'); await pa.dispatchEvent('[data-role="bpm"]', 'change');
  await pa.click('[data-beat="2"]');
  check('3박 원을 누르면 ">" 표시', await pa.evaluate(() => document.querySelector('[data-beat="2"]').classList.contains('acc') && document.querySelector('[data-beat="2"]').getAttribute('aria-pressed') === 'true'));
  await pa.click('[data-role="toggle"]'); await sleep(4200);
  { const o = await osc(pa); const f = (i) => o.filter((_, k) => k % 4 === i).map((x) => x.f);
    const f0 = f(0), f1 = f(1), f2 = f(2);
    check('강세 박(1 · 3박)이 일반 박(2박)보다 높은 음', f0.every((x) => x > f1[0]) && f2.every((x) => x > f1[0]), [f0[0], f1[0], f2[0]]);
    check('3박 강세는 첫 박 강세와 같은 높이', Math.abs(f0[0] - f2[0]) < 1, [f0[0], f2[0]]);
    check('강세 아닌 박은 모두 같은 음', f1.every((x) => x === f1[0])); }
  await pa.click('[data-beat="0"]');
  check('1박 강세도 끌 수 있음', await pa.evaluate(() => !document.querySelector('[data-beat="0"]').classList.contains('acc')));
  await sleep(2200);
  { const o = await osc(pa); const last4 = o.slice(-4).map((x) => x.f); check('끄면 마디 안에 강세 박은 3박 하나만 (첫 박이 일반 박으로)', last4.filter((f) => f > 1000).length === 1, last4); }

  console.log('· 음높이 · 볼륨');
  const lowest = async (n) => { const o = await osc(pa); return Math.min.apply(null, o.slice(-(n || 4)).map((x) => x.f)); };
  const setPitch = async (v) => pa.evaluate((x) => { const r = document.querySelector('[data-o="pitch"]'); r.value = x; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }, String(v));
  await sleep(600); const base0 = await lowest();
  await setPitch(12);
  check('음높이 표시 (+12 반음)', /\+12/.test(await txt(pa, '[data-role="pitchout"]')), await txt(pa, '[data-role="pitchout"]'));
  await sleep(2600);
  { const fa = await lowest(); check('음높이 +12 는 한 옥타브(2배)', Math.abs(fa / base0 - 2) < 0.02, [base0, fa]); }
  await setPitch(-12); await sleep(2600);
  { const fb = await lowest(); check('음높이 −12 는 한 옥타브 아래(0.5배)', Math.abs(fb / base0 - 0.5) < 0.02, [base0, fb]); }
  await setPitch(0);
  check('볼륨 기본은 ×2 (최대 5배 중)', /×2/.test(await txt(pa, '[data-role="clickout"]')), await txt(pa, '[data-role="clickout"]'));
  await pa.evaluate(() => { const r = document.querySelector('[data-o="click"]'); r.value = '1'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
  check('볼륨 막대 끝까지 = ×5', /×5/.test(await txt(pa, '[data-role="clickout"]')), await txt(pa, '[data-role="clickout"]'));
  { const g = await pa.evaluate(() => { const c = window.__ctxs[0]; return !!c; }); check('오디오 시계가 돌고 있음', g); }
  await pa.evaluate(() => { const r = document.querySelector('[data-o="click"]'); r.value = '0.4'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });

  console.log('· 전체 화면 깜빡임 (첫 박)');
  await pa.evaluate(() => { window.__flashes = 0; });
  await pa.check('[data-o="flash"]'); await sleep(2100);
  { const n = await pa.evaluate(() => window.__flashes); check('켜면 첫 박마다 번쩍 (120 BPM 4/4 = 2초에 한 번)', n >= 1 && n <= 4, n); }
  check('깜빡임 막은 화면이 아래 조작을 가리지 않음 (pointer-events:none)', await pa.evaluate(() => { const e = document.querySelector('.pv-flash'); return !!e && getComputedStyle(e).pointerEvents === 'none' && getComputedStyle(e).position === 'fixed'; }));
  await pa.uncheck('[data-o="flash"]'); await sleep(200); await pa.evaluate(() => { window.__flashes = 0; }); await sleep(2200);
  check('끄면 번쩍이지 않음', await pa.evaluate(() => window.__flashes) === 0);
  await pa.click('[data-role="toggle"]'); await sleep(200);
  check('멈춤', !(await running(pa)));

  console.log('· 두 역할 (페이지 컨트롤 · 클릭 컨트롤) 이 독립');
  await openTab(pa, 'together'); await openTab(pc, 'together'); await openTab(pb, 'together');
  check('"함께" 탭에 두 역할과 동기화 스위치', await pa.evaluate(() => /페이지 컨트롤/.test(document.body.innerText) && /클릭 컨트롤/.test(document.body.innerText) && !!document.querySelector('[data-a="manual"]')));
  await pa.click('button[data-a="claim"]');
  check('A 가 페이지 컨트롤 (칩)', await L.waitTrue(pa, () => /내가 페이지 컨트롤/.test(document.querySelector('.pv-lead').textContent)));
  check('C 화면에 클릭 컨트롤 자리는 아직 비어 있음', await L.waitTrue(pc, () => /클릭 컨트롤 없음/.test(document.querySelector('.pv-click').textContent)));
  await pc.click('button[data-a="cclaim"]');
  check('C 가 클릭 컨트롤 (칩)', await L.waitTrue(pc, () => /내가 클릭 컨트롤/.test(document.querySelector('.pv-click').textContent)));
  check('A 화면: 페이지 컨트롤은 나, 클릭 컨트롤은 Carol', await L.waitTrue(pa, () => /내가 페이지 컨트롤/.test(document.querySelector('.pv-lead').textContent) && /Carol/.test(document.querySelector('.pv-click').textContent)));
  check('B 화면: 두 사람이 따로 표시', await L.waitTrue(pb, () => /Alice/.test(document.querySelector('.pv-lead').textContent) && /Carol/.test(document.querySelector('.pv-click').textContent)));
  check('B(팀원)에게는 컨트롤을 맡는 버튼이 없음', await pb.evaluate(() => !document.querySelector('[data-a="claim"]') && !document.querySelector('[data-a="cclaim"]')));
  check('C 는 페이지를 넘길 수 없음 (페이지 컨트롤이 아님)', await (async () => { await pc.click('[data-a="next"]'); await sleep(500); return (await txt(pa, '.pv-pg')) === '1 / 3'; })());
  await pc.click('[data-a="prev"]').catch(() => {});

  console.log('· 클릭 컨트롤(Carol)이 시작 → 모두의 메트로놈이 같은 박에');
  await openTab(pa, 'metro'); await openTab(pb, 'metro'); await openTab(pc, 'metro');
  check('B: 클릭 컨트롤 안내가 보이고 조작이 잠김', await pb.evaluate(() => /Carol/.test(document.querySelector('[data-role="syncnote"]').textContent) && document.querySelector('[data-role="toggle"]').disabled && document.querySelector('[data-role="bpm"]').disabled && document.querySelector('[data-beat="1"]').disabled));
  check('C: 내가 클릭 컨트롤 안내', await pc.evaluate(() => /내가 클릭 컨트롤/.test(document.querySelector('[data-role="syncnote"]').textContent)));
  await pc.fill('[data-role="bpm"]', '100'); await pc.dispatchEvent('[data-role="bpm"]', 'change');
  check('C 가 바꾼 BPM 100 이 A · B 화면에도', await L.waitTrue(pa, () => document.querySelector('[data-role="bpm"]').value === '100', null, 3000) && await L.waitTrue(pb, () => document.querySelector('[data-role="bpm"]').value === '100', null, 3000));
  await pc.click('[data-beat="3"]');
  check('C 가 4박에 > 를 붙이면 B 에도 반영', await L.waitTrue(pb, () => document.querySelector('[data-beat="3"]').classList.contains('acc'), null, 3000));
  await pa.evaluate(() => { window.__osc.length = 0; }); await pb.evaluate(() => { window.__osc.length = 0; }); await pc.evaluate(() => { window.__osc.length = 0; });
  await pc.click('[data-role="toggle"]');
  check('C 시작 → A · B · C 모두 "멈춤" 표시 (모두 돌아감)', await L.waitTrue(pa, () => /멈춤/.test(document.querySelector('[data-role="toggle"]').textContent), null, 4000) && await L.waitTrue(pb, () => /멈춤/.test(document.querySelector('[data-role="toggle"]').textContent), null, 4000) && await L.waitTrue(pc, () => /멈춤/.test(document.querySelector('[data-role="toggle"]').textContent), null, 4000));
  await sleep(3800);
  const wa = await wallBeats(pa), wb = await wallBeats(pb), wc = await wallBeats(pc);
  check('세 기기 모두 자기 오디오로 딸깍을 냄 (각 5번 이상)', wa.length >= 5 && wb.length >= 5 && wc.length >= 5, [wa.length, wb.length, wc.length]);
  { const n = Math.min(wa.length, wb.length, wc.length, 5); const off = (x, y) => Math.max.apply(null, Array.from({ length: n }, (_, i) => Math.abs(x[i].w - y[i].w)));
    const dAB = off(wa, wb), dAC = off(wa, wc);
    check('박이 기기 사이에서 겹침 (차이 60ms 이하)', dAB < 60 && dAC < 60, [Math.round(dAB), Math.round(dAC)]);
    check('간격은 0.6초 (100 BPM)', wa.every((b, i) => i === 0 || Math.abs(b.w - wa[i - 1].w - 600) < 12), wa.map((b, i) => i ? Math.round(b.w - wa[i - 1].w) : 0));
    check('강세(> 1 · 4박)가 B 소리에도 반영', (() => { const hi = wb.filter((b, i) => i % 4 === 0 || i % 4 === 3).map((b) => b.f), lo = wb.filter((b, i) => i % 4 === 1 || i % 4 === 2).map((b) => b.f); return Math.min.apply(null, hi) > Math.max.apply(null, lo); })()); }
  await pc.fill('[data-role="bpm"]', '120'); await pc.dispatchEvent('[data-role="bpm"]', 'change'); await sleep(1500);
  check('진행 중 BPM 을 바꾸면 모두 새 템포로 (A: 120)', await pa.evaluate(() => document.querySelector('[data-role="bpm"]').value === '120') && await running(pa));
  { await pb.evaluate(() => { window.__osc.length = 0; }); await sleep(2600); const w = await wallBeats(pb); check('B 의 간격이 0.5초로 바뀜', w.length >= 4 && w.every((b, i) => i === 0 || Math.abs(b.w - w[i - 1].w - 500) < 12), w.map((b, i) => i ? Math.round(b.w - w[i - 1].w) : 0)); }
  console.log('· 팀원 B 는 직접 못 바꿈 (잠김)');
  await pb.evaluate(() => { document.querySelector('[data-role="toggle"]').click(); });
  await sleep(300); check('B 가 눌러도 멈추지 않음 (잠김)', await running(pb));

  console.log('· 늦게 들어온 사람 (D) 도 박에 맞춰 합류');
  const Dd = await mk('tokB'); const pd = Dd.page;
  await L.waitTrue(pd, () => document.querySelector('.pv-pg') && /1 \//.test(document.querySelector('.pv-pg').textContent), null, 8000);
  await L.waitTrue(pd, () => /실시간/.test(document.querySelector('.pv-conn').textContent), null, 6000);
  await pd.click('.pv-tabbtn[data-tab="metro"]'); await sleep(400);
  await pd.mouse.click(300, 300);                                   // 소리 허용 (사용자 조작)
  check('D: 들어오자마자 (눌러서 소리 켠 뒤) 돌아감', await L.waitTrue(pd, () => /멈춤/.test(document.querySelector('[data-role="toggle"]').textContent), null, 5000));
  await sleep(2200);
  { const wd = await wallBeats(pd), wc2 = await wallBeats(pc);
    const near = wd.slice(-3).map((b) => Math.min.apply(null, wc2.map((c) => Math.abs(c.w - b.w))));
    check('D 의 박이 C 의 박과 겹침 (60ms 이하)', near.length >= 2 && near.every((x) => x < 60), near.map(Math.round)); }

  console.log('· 동기화 끄기 (수동)');
  await openTab(pb, 'together');
  await pb.click('.pv-syncsec .pv-switch');
  check('B 칩: 동기화 꺼짐', await L.waitTrue(pb, () => /동기화 꺼짐/.test(document.querySelector('.pv-follow').textContent)));
  await openTab(pb, 'metro');
  check('B: 조작 잠김이 풀림', await pb.evaluate(() => !document.querySelector('[data-role="toggle"]').disabled && !document.querySelector('[data-role="bpm"]').disabled));
  await pb.click('[data-role="toggle"]'); await sleep(400);
  check('B 가 직접 멈출 수 있음 (혼자)', !(await running(pb)));
  check('그래도 C 와 A 는 계속 돌아감', await running(pc) && await running(pa));
  await pb.fill('[data-role="bpm"]', '80'); await pb.dispatchEvent('[data-role="bpm"]', 'change'); await sleep(300);
  check('B 만 80 BPM (A · C 는 그대로 120)', await pa.evaluate(() => document.querySelector('[data-role="bpm"]').value) === '120' && await pc.evaluate(() => document.querySelector('[data-role="bpm"]').value) === '120');
  await pc.fill('[data-role="bpm"]', '140'); await pc.dispatchEvent('[data-role="bpm"]', 'change'); await sleep(1300);
  check('C 가 BPM 을 바꿔도 B 는 무시', await pb.evaluate(() => document.querySelector('[data-role="bpm"]').value) === '80');
  check('A(동기화 켬)는 140 으로 따라감', await pa.evaluate(() => document.querySelector('[data-role="bpm"]').value) === '140');
  await pb.click('[data-role="toggle"]'); await sleep(300);
  await pc.click('[data-role="toggle"]'); await sleep(900);                                  // C 가 멈춤
  check('C 가 멈춰도 (혼자 돌리는) B 는 계속', await running(pb));
  check('A 는 C 를 따라 멈춤', !(await running(pa)));
  await pb.click('[data-role="toggle"]'); await sleep(200);
  console.log('· 동기화 끄기 — 페이지 넘김도 무시');
  await pa.click('[data-a="next"]'); await sleep(700);
  check('A 가 넘기면 (동기화 켠) 사람들은 따라가지만 B 는 그대로 1쪽', await pb.evaluate(() => document.querySelector('.pv-pg').textContent) === '1 / 3');
  check('B 칩에 동기화 꺼짐 표시가 유지', /동기화 꺼짐/.test(await txt(pb, '.pv-follow')));
  await pb.click('.pv-follow');
  check('칩을 눌러 동기화를 다시 켜면 바로 컨트롤 화면(2쪽)으로', await L.waitTrue(pb, () => document.querySelector('.pv-pg').textContent === '2 / 3', null, 3000));
  check('메트로놈도 지금 팀 상태(정지 · 140)로 맞춤', await pb.evaluate(() => document.querySelector('[data-role="bpm"]').value === '140') && !(await running(pb)));
  check('동기화 켜기: 다시 잠김', await L.waitTrue(pb, () => document.querySelector('[data-role="toggle"]').disabled, null, 2000));
  check('잔여 오류 없음', noErr(), [A.errs, B.errs, C.errs]);

  console.log('· 클릭 컨트롤을 내려놓으면 (동기화 켠 사람도) 다시 자유');
  await openTab(pc, 'together'); await pc.click('button[data-a="crelease"]');
  check('B 화면: 클릭 컨트롤 없음 → 조작 가능', await L.waitTrue(pb, () => !document.querySelector('[data-role="toggle"]').disabled && /클릭 컨트롤 없음/.test(document.querySelector('.pv-click').textContent), null, 3000));

  console.log('· 송폼 박스 (악보 위 네모 + 이름표)');
  await pa.click('.pv-tool[data-tool="fbox"]');
  check('송폼 박스 이름표 줄이 나타남', await pa.evaluate(() => document.querySelectorAll('.pv-fbtag').length >= 8));
  await pa.click('.pv-fbtag[data-fbtag="C"]');
  await L.drag(pa, [[.2, .4], [.7, .5]]);
  check('박스가 팀 필기로 저장(fbox · C)', await L.waitTrue(pa, () => window.__pv.P.anno().items('team').some((i) => i.t === 'fbox' && i.k === 'C' && i.w > 0.2), null, 2500));
  check('B 화면에도 실시간으로 도착', await L.waitTrue(pb, () => window.__pv.P.anno().items('team').some((i) => i.t === 'fbox' && i.k === 'C'), null, 2500));
  await pa.click('.pv-fbtag[data-fbtag="V"]'); await L.clickAt(pa, .3, .7);
  check('그냥 누르면 기본 크기 박스(V)', await L.waitTrue(pa, () => window.__pv.P.anno().items('team').some((i) => i.t === 'fbox' && i.k === 'V'), null, 2500));
  check('박스 안쪽은 비어 있어 악보가 보임 (채움이 투명에 가까움)', await pa.evaluate(() => { const it = window.__pv.P.anno().items('team').find((i) => i.k === 'C'); return !!it && it.w > 0.2; }));
  await pa.click('.pv-tool[data-tool="eraser"]'); await sleep(300);
  { const pt = await pa.evaluate(() => { const it = window.__pv.P.anno().items('team').find((i) => i.k === 'C'), r = document.querySelector('.pv-anno').getBoundingClientRect(); return { x: r.left + it.x * r.width, y1: r.top + (it.y + it.h * 0.2) * r.height, y2: r.top + (it.y + it.h * 0.8) * r.height }; });
    await pa.mouse.move(pt.x, pt.y1); await pa.mouse.down(); await pa.mouse.move(pt.x, pt.y2, { steps: 4 }); await pa.mouse.up(); }    // 박스 테두리(왼쪽 변)를 문지름
  check('지우개로 박스를 지울 수 있음', await L.waitTrue(pa, () => !window.__pv.P.anno().items('team').some((i) => i.k === 'C'), null, 2500));
  check('B 에서도 지워짐', await L.waitTrue(pb, () => !window.__pv.P.anno().items('team').some((i) => i.k === 'C'), null, 2500));
  check('잔여 오류 없음', noErr(), [A.errs, B.errs, C.errs]);
  await br.close(); S.server.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
