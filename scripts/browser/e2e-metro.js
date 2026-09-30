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

  /* v6 — 메트로놈 따라가기(클릭 컨트롤)는 없앴습니다: 메트로놈은 기기마다 따로, 따라가기는 페이지만 */
  console.log('· v6 메트로놈은 기기마다 따로 · 따라가기는 페이지만');
  await openTab(pa, 'together'); await openTab(pb, 'together');
  check('"함께" 탭: 페이지 컨트롤 · 페이지 따라가기만 (클릭 컨트롤 · 메트로놈 따라가기 없음)', await pa.evaluate(() => /페이지 컨트롤/.test(document.body.innerText) && !/클릭 컨트롤/.test(document.querySelector('.pv-panes').innerText) && !document.querySelector('[data-a="cclaim"]') && !document.querySelector('[data-a="followm"]') && !!document.querySelector('[data-a="follow"]')));
  check('위 막대에 클릭 컨트롤 · 메트로놈 따라가기 칩이 보이지 않음', await pa.evaluate(() => { const c = document.querySelector('.pv-click'), m = document.querySelector('.pv-followm'); return (!c || c.style.display === 'none') && (!m || m.style.display === 'none'); }));
  await pa.click('button[data-a="claim"]');
  check('A 가 페이지 컨트롤 (칩)', await L.waitTrue(pa, () => /내가 페이지 컨트롤/.test(document.querySelector('.pv-lead').textContent)));
  await pa.click('[data-a="next"]');
  check('페이지 따라가기는 그대로 — B 도 2쪽', await L.waitTrue(pb, () => document.querySelector('.pv-pg').textContent === '2 / 3', null, 3000));
  await openTab(pa, 'metro'); await openTab(pb, 'metro'); await openTab(pc, 'metro');
  check('B 의 메트로놈 조작이 잠기지 않음', await pb.evaluate(() => !document.querySelector('[data-role="toggle"]').disabled && !document.querySelector('[data-role="bpm"]').disabled));
  await pa.fill('[data-role="bpm"]', '100'); await pa.dispatchEvent('[data-role="bpm"]', 'change'); await sleep(900);
  check('A 가 BPM 100 으로 바꿔도 B · C 는 그대로', await pb.evaluate(() => document.querySelector('[data-role="bpm"]').value) !== '100' && await pc.evaluate(() => document.querySelector('[data-role="bpm"]').value) !== '100');
  await pa.click('[data-role="toggle"]'); await sleep(1200);
  check('A 가 시작해도 B · C 는 멈춘 채 (각자)', await running(pa) && !(await running(pb)) && !(await running(pc)));
  await pb.click('[data-role="toggle"]'); await sleep(600);
  check('B 도 혼자 시작 · 멈춤 가능', await running(pb));
  await pb.click('[data-role="toggle"]'); await pa.click('[data-role="toggle"]'); await sleep(400);
  check('잔여 오류 없음', noErr(), [A.errs, B.errs, C.errs]);

  console.log('· 송폼 라벨 (박스 없이 V · C · P · B · Int 글자만)');
  const alphaAt = (pg, fx, fy) => pg.evaluate(([x, y]) => { const c = document.querySelector('.pv-anno'), d = c.getContext('2d').getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data; return d[3]; }, [fx, fy]);
  const inkIn = (pg, fx, fy, r) => pg.evaluate(([x, y, rr]) => { const c = document.querySelector('.pv-anno'), w = Math.round(rr * c.width), h = Math.round(rr * c.height), d = c.getContext('2d').getImageData(Math.max(0, Math.round(x * c.width) - w), Math.max(0, Math.round(y * c.height) - h), w * 2, h * 2).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; }, [fx, fy, r]);
  await pa.click('.pv-tool[data-tool="fbox"]');
  check('송폼 라벨 이름표 줄이 나타남', await pa.evaluate(() => document.querySelectorAll('.pv-fbtag').length >= 8));
  check('도구 이름이 "송폼 라벨"', await pa.evaluate(() => /송폼 라벨/.test(document.querySelector('.pv-tool[data-tool="fbox"]').textContent)));
  await pa.click('.pv-fbtag[data-fbtag="C"]');
  await L.clickAt(pa, .2, .4);
  check('누른 자리에 라벨이 팀 필기로 저장(fbox · C · 박스 크기 없음)', await L.waitTrue(pa, () => window.__pv.P.anno().items('team').some((i) => i.t === 'fbox' && i.k === 'C' && i.w <= 0.03 && i.h <= 0.03), null, 2500));
  check('B 화면에도 실시간으로 도착', await L.waitTrue(pb, () => window.__pv.P.anno().items('team').some((i) => i.t === 'fbox' && i.k === 'C'), null, 2500));
  await sleep(250);
  const itC = await pa.evaluate(() => window.__pv.P.anno().items('team').find((i) => i.k === 'C'));
  check('누른 자리에 글자가 그려짐 (잉크 있음)', (await inkIn(pa, itC.x, itC.y, .02)) > 30, await inkIn(pa, itC.x, itC.y, .02));
  check('둘레에 네모 테두리가 없음 (옛 박스 자리에 투명)', (await alphaAt(pa, itC.x + .15, itC.y)) === 0 && (await alphaAt(pa, itC.x, itC.y + .05)) === 0);
  await pa.click('.pv-fbtag[data-fbtag="V"]');
  { const b = await L.vis(pa); await pa.mouse.move(b.x + .5 * b.width, b.y + .6 * b.height); await pa.mouse.down(); await pa.mouse.move(b.x + .7 * b.width, b.y + .62 * b.height, { steps: 5 }); await pa.mouse.up(); }
  check('누른 채 끌면 뗀 자리에 놓임 (V — 누른 자리보다 오른쪽)', await L.waitTrue(pa, () => window.__pv.P.anno().items('team').some((i) => i.t === 'fbox' && i.k === 'V' && i.w <= 0.03), null, 2500) && await pa.evaluate(() => { const v = window.__pv.P.anno().items('team').find((i) => i.k === 'V'), c = window.__pv.P.anno().items('team').find((i) => i.k === 'C'); return v.x > c.x + 0.2; }));
  await pa.evaluate(() => window.__pv.P.anno().remoteAdd('team', { id: 'legacybox1', t: 'fbox', pg: window.__pv.P.page(), k: 'B', x: 0.3, y: 0.75, w: 0.3, h: 0.07, c: '#e53935', sz: 0.02, by: 'Old' })); await sleep(250);
  { const q = [await alphaAt(pa, 0.6, 0.785), await alphaAt(pa, 0.45, 0.75), await alphaAt(pa, 0.45, 0.82), await inkIn(pa, 0.3 + 0.012, 0.75 - 0.012, 0.02)];
    check('예전 송폼 박스도 글자만 남기고 박스는 그리지 않음', q[0] === 0 && q[1] === 0 && q[2] === 0 && q[3] > 5, q); }
  await pa.click('.pv-tool[data-tool="eraser"]'); await sleep(300);
  { const pt = await pa.evaluate(() => { const it = window.__pv.P.anno().items('team').find((i) => i.k === 'C'), r = document.querySelector('.pv-anno').getBoundingClientRect(); return { x: r.left + it.x * r.width, y1: r.top + (it.y - 0.02) * r.height, y2: r.top + (it.y + 0.02) * r.height }; });
    await pa.mouse.move(pt.x - 4, pt.y1); await pa.mouse.down(); await pa.mouse.move(pt.x + 4, pt.y2, { steps: 5 }); await pa.mouse.up(); }
  check('지우개로 라벨을 지울 수 있음', await L.waitTrue(pa, () => !window.__pv.P.anno().items('team').some((i) => i.k === 'C'), null, 2500));
  check('B 에서도 지워짐', await L.waitTrue(pb, () => !window.__pv.P.anno().items('team').some((i) => i.k === 'C'), null, 2500));
  check('잔여 오류 없음', noErr(), [A.errs, B.errs, C.errs]);
  await br.close(); S.server.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
