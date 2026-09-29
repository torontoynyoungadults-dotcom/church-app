/**
 * Step 2.11 — 따라가기 두 스위치(페이지 · 메트로놈) 4가지 조합 · 저장 · 서버 동기화 · 큐 버튼(키 업 · 기도)
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
  const pg = (p) => p.evaluate(() => document.querySelector('.pv-pg').textContent);
  const bpmOf = (p) => p.evaluate(() => document.querySelector('[data-role="bpm"]').value);
  const setBpm = async (p, v) => { await p.fill('[data-role="bpm"]', String(v)); await p.dispatchEvent('[data-role="bpm"]', 'change'); };
  const st = (p) => p.evaluate(() => ({ f: window.__pv.P.follow(), m: window.__pv.P.followMetro(), manual: window.__pv.P.manual(), ls: [localStorage.getItem('yn.pv.fpage'), localStorage.getItem('yn.pv.fmetro')] }));
  const sw = async (p, which, on) => { await openTab(p, 'together'); const sel = '.pv-follows input[data-a="' + which + '"]'; const cur = await p.evaluate((s) => document.querySelector(s).checked, sel); if (cur !== on) { await p.click(sel + ' + span'); } await sleep(250); };

  console.log('· 준비: A = 페이지 컨트롤, C = 클릭 컨트롤, B = 따라가는 사람');
  await openTab(pa, 'together'); await pa.click('button[data-a="claim"]'); await L.waitTrue(pa, () => /내가 페이지 컨트롤/.test(document.querySelector('.pv-lead').textContent));
  await openTab(pc, 'together'); await pc.click('button[data-a="cclaim"]'); await L.waitTrue(pc, () => /내가 클릭 컨트롤/.test(document.querySelector('.pv-click').textContent));
  await openTab(pb, 'metro'); await openTab(pc, 'metro'); await openTab(pa, 'metro'); await openTab(pb, 'together');
  check('"함께" 탭에 두 스위치가 따로 있음 (페이지 컨트롤 따라가기 · 메트로놈 컨트롤 따라가기)', await pb.evaluate(() => /페이지 컨트롤 따라가기/.test(document.body.innerText) && /메트로놈 컨트롤 따라가기/.test(document.body.innerText) && !!document.querySelector('.pv-follows input[data-a="follow"]') && !!document.querySelector('.pv-follows input[data-a="followm"]')));
  check('기본은 둘 다 켜짐', await pb.evaluate(() => window.__pv.P.follow() && window.__pv.P.followMetro()));
  check('페이지 칩 · 메트로놈 칩이 따로 보임', await pb.evaluate(() => { const a = document.querySelector('.pv-follow'), b = document.querySelector('.pv-followm'); return !!a && !!b && a.offsetParent !== null && b.offsetParent !== null && /따라가는 중/.test(a.textContent) && /메트로놈 따라감/.test(b.textContent); }));

  console.log('· ① 둘 다 켬 — 쪽도 메트로놈도 따라감');
  await openTab(pc, 'metro'); await setBpm(pc, 120); await sleep(400);
  await pa.click('[data-a="next"]'); check('B 가 A 를 따라 2쪽', await L.waitTrue(pb, () => document.querySelector('.pv-pg').textContent === '2 / 3', null, 3000));
  await pc.click('[data-role="toggle"]'); check('B 메트로놈이 C 를 따라 시작', await L.waitTrue(pb, () => /멈춤/.test(document.querySelector('[data-role="toggle"]').textContent), null, 4000));
  check('B 메트로놈 조작은 잠김 (클릭 컨트롤이 있으므로)', await pb.evaluate(() => document.querySelector('[data-role="toggle"]').disabled));

  console.log('· ② 페이지 끔 / 메트로놈 켬');
  await sw(pb, 'follow', false);
  { const s = await st(pb); check('상태: 페이지 꺼짐 · 메트로놈 켜짐 (동기화 전체 꺼짐은 아님)', s.f === false && s.m === true && s.manual === false, s); }
  await pa.click('[data-a="next"]'); await sleep(800);
  check('A 가 3쪽으로 넘겨도 B 는 2쪽 그대로', await pg(pb) === '2 / 3', await pg(pb));
  check('B 페이지 칩: 따라가기 꺼짐 · 컨트롤 3쪽', /꺼짐 · 컨트롤 3쪽/.test(await txt(pb, '.pv-follow')), await txt(pb, '.pv-follow'));
  await openTab(pb, 'metro'); await setBpm(pc, 140); await sleep(1400);
  check('그래도 메트로놈은 C 를 따라 140', await bpmOf(pb) === '140', await bpmOf(pb));
  await pc.click('[data-role="toggle"]'); check('C 가 멈추면 B 도 멈춤', await L.waitTrue(pb, () => /시작/.test(document.querySelector('[data-role="toggle"]').textContent), null, 3000));
  await pc.click('[data-role="toggle"]'); check('C 가 다시 시작하면 B 도 시작', await L.waitTrue(pb, () => /멈춤/.test(document.querySelector('[data-role="toggle"]').textContent), null, 4000));

  console.log('· ③ 페이지 켬 / 메트로놈 끔');
  await sw(pb, 'follow', true);
  check('페이지를 켜면 컨트롤이 있는 3쪽으로 바로 이동', await L.waitTrue(pb, () => document.querySelector('.pv-pg').textContent === '3 / 3', null, 3000));
  await sw(pb, 'followm', false);
  { const s = await st(pb); check('상태: 페이지 켜짐 · 메트로놈 꺼짐', s.f === true && s.m === false && s.manual === false, s); }
  await openTab(pb, 'metro');
  check('B 메트로놈 조작이 풀림 (잠금 없음)', await pb.evaluate(() => !document.querySelector('[data-role="toggle"]').disabled && !document.querySelector('[data-role="bpm"]').disabled));
  await pb.click('[data-role="toggle"]'); await sleep(500);
  check('B 가 직접 멈출 수 있음 (혼자) — C 는 계속 돌아감', !(await running(pb)) && await running(pc));
  await setBpm(pb, 90); await sleep(300); await setBpm(pc, 110); await sleep(1300);
  check('C 가 BPM 을 바꿔도 B 는 내 값(90)', await bpmOf(pb) === '90', await bpmOf(pb));
  check('B 의 조작은 팀에 안 나감 (C 는 110)', await bpmOf(pc) === '110' && await bpmOf(pa) === '110');
  await pa.click('[data-a="prev"]'); check('페이지는 계속 따라감 (A 가 2쪽으로)', await L.waitTrue(pb, () => document.querySelector('.pv-pg').textContent === '2 / 3', null, 3000));
  check('B 메트로놈 칩: 따라가기 꺼짐', /꺼짐/.test(await txt(pb, '.pv-followm')), await txt(pb, '.pv-followm'));

  console.log('· ④ 둘 다 끔');
  await sw(pb, 'follow', false);
  { const s = await st(pb); check('상태: 둘 다 꺼짐 = 동기화 전체 꺼짐과 같음', s.f === false && s.m === false && s.manual === true, s); }
  check('페이지 칩이 "동기화 꺼짐" 으로 바뀜', /동기화 꺼짐/.test(await txt(pb, '.pv-follow')), await txt(pb, '.pv-follow'));
  await pa.click('[data-a="next"]'); await sleep(700);
  check('A 가 넘겨도 B 는 2쪽', await pg(pb) === '2 / 3');
  await setBpm(pc, 130); await sleep(1200);
  check('C 가 바꿔도 B 는 90', await bpmOf(pb) === '90');
  await pb.click('.pv-follow');
  { const s = await st(pb); check('칩을 누르면 둘 다 켜짐(기존 동작 그대로)', s.f === true && s.m === true, s); }
  check('켜면 바로 팀 상태로 (3쪽 · 130 BPM)', await L.waitTrue(pb, () => document.querySelector('.pv-pg').textContent === '3 / 3' && document.querySelector('[data-role="bpm"]').value === '130', null, 4000));

  console.log('· 저장 — 이 기기 · 새로고침 · 다른 기기(서버)');
  await sw(pb, 'follow', false); await sw(pb, 'followm', true);
  { const s = await st(pb); check('이 기기에 저장됨 (localStorage)', s.ls[0] === '0' && s.ls[1] === '1', s.ls); }
  await sleep(900);
  check('접속자 목록(A 화면)에 "B 는 페이지 따로"', await L.waitTrue(pa, () => { const t = document.body.innerText; return /페이지 따로/.test(t); }, null, 2500) || (await openTab(pa, 'together'), await L.waitTrue(pa, () => /페이지 따로/.test(document.body.innerText), null, 2500)));
  await pb.goto(base + '/h.html?t=tokB'); await pb.click('#go'); await L.waitTrue(pb, () => document.querySelector('.pv-pg') && /실시간/.test(document.querySelector('.pv-conn').textContent), null, 8000);
  { const s = await st(pb); check('새로고침 후에도 유지 (페이지 꺼짐 · 메트로놈 켜짐)', s.f === false && s.m === true, s); }
  const Dx = await mk('tokB'); const pd = Dx.page; await L.waitTrue(pd, () => document.querySelector('.pv-pg') && /실시간/.test(document.querySelector('.pv-conn').textContent), null, 8000);
  check('다른 기기(저장 비어 있음)도 서버에 저장된 상태를 불러옴', await L.waitTrue(pd, () => window.__pv.P.follow() === false && window.__pv.P.followMetro() === true, null, 5000), await st(pd));
  check('예전 저장값(manual=1)은 둘 다 끔으로 옮겨짐', await (async () => { const c2 = await br.newContext({ viewport: { width: 1280, height: 800 } }); await c2.addInitScript(INIT); await c2.addInitScript("try{localStorage.setItem('yn.pv.manual','1')}catch(e){}"); const p2 = await c2.newPage(); await p2.goto(base + '/h.html?t=tokD'); await p2.click('#go'); await L.waitTrue(p2, () => document.querySelector('.pv-pg'), null, 8000); const r = await st(p2); await c2.close(); return r.f === false && r.m === false; })());

  console.log('· 큐 버튼 (키 업 · 기도)');
  await openTab(pa, 'metro'); await pa.evaluate(() => window.__pv.P.showTab('metro'));
  check('큐 버튼: 키 업 · 기도 + 요청한 콜아웃이 모두 있음', await pa.evaluate(() => { const t = Array.from(document.querySelectorAll('[data-cue]')).map((b) => b.dataset.cue); return ['repc', 'halfc', 'tag', 'lastl', 'once', 'onebar', 'keyup', 'prayer'].every((id) => t.indexOf(id) >= 0); }));
  check('영어 이름: Key Up · Prayer', await pa.evaluate(() => { const g = (id) => (document.querySelector('[data-cue="' + id + '"]') || {}).textContent; return g('keyup') === 'Key Up' && g('prayer') === 'Prayer'; }));
  { const before = await pa.evaluate(() => window.__spoken ? window.__spoken.length : 0); void before; }

  console.log('· 송폼 탭에서도 메트로놈과 큐가 함께 보임');
  await pa.evaluate(() => window.__pv.P.showTab('form')); await sleep(400);
  { const v = await pa.evaluate(() => { const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 20 && r.top >= 0 && r.bottom <= innerHeight + 2 && e.offsetParent !== null; }; const q = (s) => document.querySelector(s);
      return { mini: vis(q('.pv-mini')), go: vis(q('.pv-mini-go')), inp: vis(q('.pv-mini-in')), cues: q('.pv-fcues') && q('.pv-fcues').offsetParent !== null, player: q('[data-role="player"]') && q('[data-role="player"]').offsetParent !== null }; });
    check('송폼 탭 맨 위에 미니 메트로놈(시작 · BPM)이 보임', v.mini && v.go && v.inp, v);
    check('송폼 순서 · 콜아웃 큐 버튼과 같은 화면', v.player && v.cues, v); }
  check('미니 메트로놈에도 BPM 이 표시됨', /^\d+$/.test(await pa.evaluate(() => document.querySelector('.pv-mini-in').value)));
  check('콜아웃 버튼 8개 (키 업 · 기도 포함)', await pa.evaluate(() => document.querySelectorAll('.pv-fcues [data-cue]').length === 8 && !!document.querySelector('.pv-fcues [data-cue="keyup"]') && !!document.querySelector('.pv-fcues [data-cue="prayer"]')));
  check('C 가 클릭 컨트롤이라 A 의 미니 메트로놈은 잠김 + 안내 문구', await pa.evaluate(() => document.querySelector('.pv-mini-go').disabled && /클릭 컨트롤/.test(document.querySelector('.pv-mini-note').textContent)));
  await pa.evaluate(() => window.__pv.P.setFollowMetro(false)); await sleep(300);
  check('메트로놈 따라가기를 끄면 미니 메트로놈 잠금이 풀림', await pa.evaluate(() => !document.querySelector('.pv-mini-go').disabled && !document.querySelector('.pv-mini-in').disabled));
  if (await running(pa)) { await pa.click('.pv-mini-go'); await sleep(400); check('따라가던 메트로놈을 미니 ■ 로 내 것만 멈출 수 있음 (클릭 컨트롤 C 는 계속)', !(await running(pa)) && await running(pc)); }
  await pa.click('.pv-mini-go'); await sleep(500);
  check('미니 ▶ 를 누르면 실제로 시작 (메트로놈 탭과 같은 상태)', await pa.evaluate(() => document.querySelector('.pv-mini-go').textContent === '■') && await running(pa));
  check('미니 박 표시가 박마다 움직임', await L.waitTrue(pa, () => !!document.querySelector('.pv-mini-dots i.on'), null, 2500));
  const b0 = await bpmOf(pa); await pa.click('.pv-mini-bpm [data-m="b+"]'); await sleep(400);
  check('미니 + 로 BPM 이 1 올라감', +(await pa.evaluate(() => document.querySelector('.pv-mini-in').value)) === +b0 + 1, [b0, await bpmOf(pa)]);
  await pa.click('.pv-fcues [data-cue="prayer"]'); await sleep(300);
  check('콜아웃(기도)을 눌러도 메트로놈은 계속 돌아감', await running(pa));
  await pa.click('.pv-mini-go'); await sleep(300);
  check('미니 ■ 로 멈춤', !(await running(pa)));
  check('잔여 오류 없음', [A, B, C, Dx].every((x) => !x.errs.length), [A.errs, B.errs, C.errs, Dx.errs]);
  await br.close(); S.server.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
