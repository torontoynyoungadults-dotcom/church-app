/** Step 3.2 · Feature 1 — 예배 타이머 · 상태 막대 (진짜 server.js + 가짜 구글 + 진짜 웹소켓 + 진짜 크롬)
 *   node scripts/browser/e2e-step32.js         (서버 PORT 4321)
 *   · 인도자(ADM 관리자키 · 오팀장 인도자)와 읽기 전용(방송팀 정일반) 두 화면이 같은 숫자를 보는지
 *   · 모든 탭 · 세션 화면(전체 화면 포함)에서 막대가 보이고 겹치지 않는지 · 웹소켓이 막혔을 때 HTTP 로 동기화되는지 · 폰 폭 390px
 * 화면 그림은 SHOTS 폴더(기본: 이 시험의 임시 폴더)에 저장됩니다.
 */
process.env.PORT = process.env.PORT || '4321';
const path = require('path'), os = require('os'), fs = require('fs');
const L = require('./e2e-lib'); const { check, sleep } = L;
// 시험용 명단: 방송팀 정일반(읽기 전용: 교적 '-찬양팀') · 찬양팀 인도자 오팀장
const fx = require('./fixture'); const baseTabs0 = fx.baseTabs;
fx.baseTabs = (p) => {
  const t = baseTabs0(p);
  t['사역팀'].push(['Kairos 찬양팀', '예배영성부', '', '', ''], ['HOPE 방송팀', '예배영성부', '', '', '']);
  t['사역팀원'].push(['HOPE 방송팀', '정일반', '카메라'], ['Kairos 찬양팀', '오팀장', '인도자']);
  t['교적'].forEach((r) => { if (r[0] === '정일반') r[16] = '-찬양팀'; });
  return t;
};
require('./e2e-full-server.js');
const { mkpdf, MULTI } = require('./mkpdf');
const BASE = 'http://127.0.0.1:' + process.env.PORT, KEY = 'ADM';
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'e2e-step32-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
const secOf = (t) => { const p = String(t).replace(/^[+−-]/, '').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

(async () => {
  await sleep(1200);
  const hub = run((api) => api.worshipHub(KEY, '')); const DATE = hub.week.date;
  const dataUrl = 'data:application/pdf;base64,' + mkpdf(MULTI).toString('base64');
  run((api) => api.saveWorshipSongs(KEY, DATE, '콘티', [
    { title: 'Amazing Grace', team: '테스트', key: 'G', bpm: '120', form: 'V1-C', link: '', note: '', solo: [] },
    { title: 'Second Song', team: '', key: 'Bb', bpm: '90', form: 'Intro-V-C', link: '', note: '', solo: [] }]));
  run((api) => api.uploadWorshipSheet(KEY, DATE, 'Sunday All Songs.pdf', dataUrl, '콘티'));
  const RO_TOK = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const OH_TOK = run((api) => api.포털토큰_('오팀장', '4165551010', ''));
  const br = await L.launch();
  const IGN = /favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g|WebSocket|ERR_FAILED|ERR_ABORTED|ERR_TUNNEL|Failed to fetch|net::|socket\.io|polling/i;
  const mk = async (tokQ, vp, o) => {
    o = o || {};
    const ctx = await br.newContext({ viewport: vp || { width: 1100, height: 900 }, timezoneId: 'America/Toronto', locale: 'ko-KR' });
    if (o.blockSockets) {
      await ctx.addInitScript(() => { window.WebSocket = function () { throw new Error('blocked'); }; });
      await ctx.route('**/socket.io/**', (r) => (o.blockScript || !/socket\.io\.js$/.test(r.request().url()) ? r.abort() : r.continue()));
    }
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !IGN.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto(BASE + '/?page=worship&' + tokQ);
    await L.waitTrue(page, () => window.W && window.D && document.querySelector('.yt-hub'), null, 12000);
    return { ctx, page, errs };
  };
  const V = '.yt-hub';                                           // 허브 막대
  const txt = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
  const total = (p, root) => txt(p, (root || V) + ' .yt-total .yt-v');
  const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
  const ctlCount = (p, root) => p.evaluate((s) => Array.from(document.querySelectorAll(s + ' .yt-ctl')).filter((e) => e.offsetParent !== null).length, root || V);
  const syncOf = (p, root) => p.evaluate((s) => { const e = document.querySelector(s + ' .yt-sync'); return e ? e.getAttribute('data-s') : null; }, root || V);
  const waitSync = (p, st, ms) => L.waitTrue(p, ([s, want]) => { const e = document.querySelector(s + ' .yt-sync'); return e && e.getAttribute('data-s') === want; }, [V, st], ms || 8000);

  console.log('1. 두 화면 열기 (인도자 · 읽기 전용)');
  const A = await mk('key=' + KEY), R = await mk('t=' + encodeURIComponent(RO_TOK));
  const pa = A.page, pr = R.page;
  check('두 허브 화면이 열림 (A=관리자, R=방송팀 정일반)', await pa.evaluate(() => !!D) && await pr.evaluate(() => D.who === '정일반' && !D.canEdit), await pr.evaluate(() => [D.who, D.canEdit]));
  check('두 화면 모두 상단에 타이머 막대가 있고 보임', await visible(pa, V) && await visible(pr, V));
  check('막대는 세 시계 (예배 경과 · 찬양 구간 · 설교까지)', await pa.evaluate(() => Array.from(document.querySelectorAll('.yt-hub .yt-chip .yt-l')).map((e) => e.textContent).join('|')) === '예배 경과|찬양 구간|설교까지');
  check('두 화면 모두 웹소켓으로 동기화됨 (표시 "동기화됨")', await waitSync(pa, 'socket') && await waitSync(pr, 'socket') && /동기화됨/.test(await txt(pr, V + ' .yt-sync')), [await syncOf(pa), await syncOf(pr)]);
  check('인도자 화면에는 조작 버튼(시작 · 다음 곡)이 보임', await ctlCount(pa) === 2, await ctlCount(pa));
  check('읽기 전용 화면에는 조작 버튼이 하나도 없음', await ctlCount(pr) === 0, await ctlCount(pr));
  check('읽기 전용 화면의 조작 버튼은 접근성 트리에도 없음 (hidden)', await pr.evaluate(() => Array.from(document.querySelectorAll('.yt-hub .yt-ctl')).every((b) => b.hidden)));
  check('시작 전에는 0:00', await total(pa) === '0:00' && await total(pr) === '0:00');
  check('접근성: 그룹 이름 · 시계 역할 · 버튼 이름', await pa.evaluate(() => { const b = document.querySelector('.yt-hub'); return b.getAttribute('role') === 'group' && b.getAttribute('aria-label') === '예배 타이머' && b.querySelectorAll('[role=timer][aria-label]').length === 3 && Array.from(b.querySelectorAll('button')).every((x) => x.getAttribute('aria-label')); }));
  await shot(pa, '01-hub-lead-idle');

  console.log('2. 곡 목록 · 설교 예상');
  check('인도자 화면의 콘티(2곡)가 서버에 저장되어 읽기 전용 화면도 설교 예상을 계산함', await L.waitTrue(pr, () => /^\d+:\d\d$/.test(document.querySelector('.yt-hub .yt-ser .yt-v').textContent.trim()), null, 6000), await txt(pr, V + ' .yt-ser .yt-v'));
  const ser0 = secOf(await txt(pr, V + ' .yt-ser .yt-v'));
  check('시작 전 예상 = 2곡 × 5분 = 약 10분', Math.abs(ser0 - 600) <= 2, ser0);
  check('예상 시각(오전/오후)이 함께 표시됨', /^(오전|오후) \d{1,2}:\d\d · 예상$/.test(await txt(pr, V + ' .yt-ser .yt-s')), await txt(pr, V + ' .yt-ser .yt-s'));

  console.log('3. 인도자 시작 → 읽기 전용 화면이 같은 숫자');
  await pa.click(V + ' [data-a=toggle]');
  check('읽기 전용 화면이 곧바로 "진행 중" 으로', await L.waitTrue(pr, () => document.querySelector('.yt-hub .yt-total').classList.contains('run'), null, 3000));
  await sleep(3300);
  const ta = secOf(await total(pa)), tr = secOf(await total(pr));
  check('두 화면의 예배 경과가 같음 (±1초): A=' + ta + ' R=' + tr, Math.abs(ta - tr) <= 1 && ta >= 3, [ta, tr]);
  check('시작 버튼이 일시정지 모양(이름)으로 바뀜', await pa.evaluate(() => document.querySelector('.yt-hub [data-a=toggle]').getAttribute('aria-label')) === '예배 일시정지');
  await pa.click(V + ' [data-a=toggle]');
  await sleep(600);
  const pa1 = await total(pa), pr1 = await total(pr); await sleep(1600);
  check('일시정지: 두 화면 모두 멈춤', await total(pa) === pa1 && await total(pr) === pr1 && pa1 === pr1, [pa1, pr1, await total(pa), await total(pr)]);
  await pa.click(V + ' [data-a=toggle]'); await sleep(1500);
  check('다시 시작하면 이어서 감 (0 부터가 아님)', secOf(await total(pa)) > secOf(pa1) && secOf(await total(pr)) > secOf(pr1), [pa1, await total(pa)]);
  check('읽기 전용 화면에서 (강제로) 조작을 보내도 서버가 거절함', await pr.evaluate(async () => { const c = YNTimer._reg; const k = Object.keys(c)[0]; try { await c[k].c.send({ action: 'reset' }); return 'sent'; } catch (e) { return e.code || e.message; } }) === 'perm');

  console.log('4. 다음 곡 (찬양 구간)');
  await pa.click(V + ' [data-a=segnext]');
  check('구간 이름이 첫 곡 제목으로 (두 화면)', await L.waitTrue(pa, () => /Amazing Grace/.test(document.querySelector('.yt-hub .yt-seg .yt-l').textContent), null, 3000) && await L.waitTrue(pr, () => /Amazing Grace/.test(document.querySelector('.yt-hub .yt-seg .yt-l').textContent), null, 3000), await txt(pr, V + ' .yt-seg .yt-l'));
  await sleep(2200);
  const sa = secOf(await txt(pa, V + ' .yt-seg .yt-v')), sr = secOf(await txt(pr, V + ' .yt-seg .yt-v'));
  check('구간 시계가 0 부터 올라감 · 두 화면 같음 (A=' + sa + ' R=' + sr + ')', sa >= 1 && sa < 8 && Math.abs(sa - sr) <= 1);
  check('구간 옆에 "1 / 2곡"', /1 \/ 2곡/.test(await txt(pr, V + ' .yt-seg .yt-s')), await txt(pr, V + ' .yt-seg .yt-s'));
  const serA = secOf(await txt(pr, V + ' .yt-ser .yt-v'));
  check('설교까지 남은 시간이 첫 곡을 시작해도 대략 (10분 − 진행분)', serA > 440 && serA <= 600, serA);
  await pa.click(V + ' [data-a=segnext]');
  check('두 번째 곡: 이름 · 구간이 0 근처로 다시 시작', await L.waitTrue(pr, () => /Second Song/.test(document.querySelector('.yt-hub .yt-seg .yt-l').textContent) && /^0:0\d$/.test(document.querySelector('.yt-hub .yt-seg .yt-v').textContent.trim()), null, 3000), await txt(pr, V + ' .yt-seg .yt-v'));
  await pa.click(V + ' [data-a=segnext]');
  check('마지막 곡 다음은 "찬양 종료" · 구간이 멈춤', await L.waitTrue(pr, () => /찬양 종료/.test(document.querySelector('.yt-hub .yt-seg .yt-l').textContent), null, 3000));
  await pa.evaluate(() => YNTimer._reg[Object.keys(YNTimer._reg)[0]].c.send({ action: 'segGoto', idx: 0 })); await sleep(300);

  console.log('5. 방송 모드 (큰 글씨 패널)');
  await pr.click(V + ' [data-a=expand]');
  check('읽기 전용: 방송 모드가 열리고 큰 숫자 3개', await L.waitTrue(pr, () => !!document.querySelector('.yt-panel') && document.querySelectorAll('.yt-panel .yt-bv').length === 3, null, 2000));
  check('큰 숫자가 충분히 큼 (글자 크기 ≥ 52px)', await pr.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.yt-panel .yt-bv')).fontSize) >= 52));
  check('읽기 전용에는 조작판이 없고 안내 문구만', await pr.evaluate(() => { const c = document.querySelector('.yt-panel .yt-only-lead'), ro = document.querySelector('.yt-panel .yt-only-ro'); return c.hidden && getComputedStyle(c).display === 'none' && !ro.hidden && Array.from(document.querySelectorAll('.yt-panel [data-a]')).filter((b) => b.offsetParent !== null).length === 1; }));
  check('패널은 dialog · 닫기 버튼에 포커스', await pr.evaluate(() => { const d = document.querySelector('.yt-panel'); return d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && document.activeElement === d.querySelector('[data-a=close]'); }));
  await shot(pr, '02-panel-readonly');
  check('패널의 숫자도 실시간 (예배 경과가 바뀜)', await (async () => { const a = await pr.evaluate(() => document.querySelector('.yt-panel [data-c=total] .yt-bv').textContent); await sleep(1300); return a !== await pr.evaluate(() => document.querySelector('.yt-panel [data-c=total] .yt-bv').textContent); })());
  await pr.keyboard.press('Escape');
  check('Esc 로 닫힘 · 포커스가 열었던 버튼으로', await L.waitTrue(pr, () => !document.querySelector('.yt-panel') && document.activeElement && document.activeElement.getAttribute('data-a') === 'expand', null, 1500));
  await pa.click(V + ' [data-a=expand]');
  check('인도자: 방송 모드에 조작판이 보임', await pa.evaluate(() => { const c = document.querySelector('.yt-panel .yt-only-lead'); return !c.hidden && c.offsetParent !== null && !!document.querySelector('.yt-panel [data-a=segnext]'); }));
  await pa.click('.yt-panel [data-a=tset][data-v="180"]');
  check('목표 3분 → 두 화면에 "남음 …"', await L.waitTrue(pr, () => /남음 [0-3]:\d\d/.test(document.querySelector('.yt-hub .yt-seg .yt-s').textContent), null, 3000), await txt(pr, V + ' .yt-seg .yt-s'));
  await pa.click('.yt-panel [data-a=tplus]');
  check('+30초 → 목표 3:30', await L.waitTrue(pa, () => document.querySelector('.yt-panel [data-f=tval]').textContent === '3:30', null, 2000));
  await pa.click('.yt-panel [data-a=mman]'); await pa.click('.yt-panel [data-a=min][data-v="10"]');
  check('설교 시작 "10분 뒤" 수동 → 읽기 전용 화면에 ~10분 · "수동"', await L.waitTrue(pr, () => { const v = document.querySelector('.yt-hub .yt-ser .yt-v').textContent.trim().split(':'); return /수동/.test(document.querySelector('.yt-hub .yt-ser .yt-s').textContent) && Number(v[0]) >= 9 && Number(v[0]) <= 10; }, null, 3000), await txt(pr, V + ' .yt-ser .yt-v'));
  await pa.click('.yt-panel [data-a=mplus][data-v="1"]');
  check('+1분 → 11분 근처', await L.waitTrue(pr, () => { const v = document.querySelector('.yt-hub .yt-ser .yt-v').textContent.trim().split(':'); return Number(v[0]) >= 10 && Number(v[0]) <= 11; }, null, 3000), await txt(pr, V + ' .yt-ser .yt-v'));
  await pa.click('.yt-panel [data-a=mauto]');
  check('자동으로 되돌리면 다시 "예상"', await L.waitTrue(pr, () => /예상/.test(document.querySelector('.yt-hub .yt-ser .yt-s').textContent), null, 3000));
  await shot(pa, '03-panel-lead');
  await pa.click('.yt-panel [data-a=reset]');
  check('"처음부터" 는 한 번 더 눌러야 실행 (실수 방지)', await pa.evaluate(() => /정말/.test(document.querySelector('.yt-panel [data-a=reset]').textContent)) && secOf(await total(pr)) > 0);
  await pa.click('.yt-panel [data-a=reset]');
  check('두 번 누르면 모두 0 으로 (두 화면)', await L.waitTrue(pr, () => document.querySelector('.yt-hub .yt-total .yt-v').textContent.trim() === '0:00' && document.querySelector('.yt-hub .yt-seg .yt-v').textContent.trim() === '0:00', null, 3000));
  await pa.click('.yt-panel [data-a=close]');
  await pa.click(V + ' [data-a=toggle]'); await L.waitTrue(pr, () => document.querySelector('.yt-hub .yt-total').classList.contains('run'), null, 3000);

  console.log('6. 모든 탭에서 막대가 보임 · 내용을 가리지 않음 (허브 막대는 화면 아래에 떠 있음)');
  const tabs = await pa.evaluate(() => TABS.map((t) => t[0]));
  for (const t of tabs) {
    await pa.evaluate((k) => tab(k), t); await sleep(350);
    const at = async (y) => { await pa.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(120); return pa.evaluate(() => { const e = document.querySelector('.yt-hub'), b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), vis: b.width > 0 && b.height > 0 && getComputedStyle(e).display !== 'none' }; }); };
    const r0 = await at(0), r1 = await at(400), r2 = await at(99999);
    check('탭 ' + t + ': 맨 위 · 중간 · 맨 아래 어디서나 막대가 화면 아래에 보임', [r0, r1, r2].every((r) => r.vis && r.bottom <= 900 && r.bottom >= 880), { r0, r1, r2 });
    check('탭 ' + t + ': 맨 아래까지 내려도 마지막 내용(푸터)이 막대 위에 보임 (가리지 않음)', await pa.evaluate(() => { const f = document.querySelector('footer').getBoundingClientRect(), b = document.querySelector('.yt-hub').getBoundingClientRect(); return f.bottom <= b.top + 1; }));
  }
  await pa.evaluate(() => { tab('plan'); window.scrollTo(0, 0); }); await sleep(350);
  const stick = await pa.evaluate(async () => { window.scrollTo(0, 500); await new Promise((r) => setTimeout(r, 200)); const s = document.querySelector('#body .pvstart'), b = document.querySelector('.yt-hub').getBoundingClientRect(); return s ? { top: Math.round(s.getBoundingClientRect().top), bottom: Math.round(s.getBoundingClientRect().bottom), barTop: Math.round(b.top) } : null; });
  check('스크롤해도 "연주 시작" 막대는 예전처럼 맨 위에 붙어 있고 (0~20px) 타이머 막대와 겹치지 않음', !stick || (stick.top >= 0 && stick.top <= 20 && stick.bottom < stick.barTop), stick);
  await pa.evaluate(() => window.scrollTo(0, 0));
  check('허브 막대 폭이 화면 콘텐츠 폭과 같음 (최대 680px · 가운데)', await pa.evaluate(() => { const b = document.querySelector('.yt-hub').getBoundingClientRect(); return Math.abs((b.left + b.right) / 2 - innerWidth / 2) <= 1 && b.width <= 680 && b.width >= 600; }));
  await pa.evaluate(() => { const i = document.createElement('input'); i.id = 'tmpin'; i.type = 'text'; document.body.appendChild(i); i.focus(); }); await sleep(200);
  check('글을 입력하는 동안(키보드)에는 막대가 잠시 숨음 · 입력이 끝나면 다시 보임', !(await visible(pa, V)) && (await pa.evaluate(() => { document.getElementById('tmpin').blur(); return true; })) && await L.waitTrue(pa, () => getComputedStyle(document.querySelector('.yt-hub')).display !== 'none', null, 1500));
  await pa.evaluate(() => document.getElementById('tmpin').remove());

  console.log('7. 세션 / 연습 화면 (전체 화면 포함)');
  for (const [who, h] of [['인도자', A], ['읽기 전용', R]]) {
    await h.page.evaluate(() => openPractice(''));
    await L.waitTrue(h.page, () => window.YNPractice.current() && document.querySelector('.pv .yt-viewer'), null, 10000);
    await L.waitTrue(h.page, () => document.querySelector('.pv-pg') && /\/ \d+/.test(document.querySelector('.pv-pg').textContent), null, 10000);
    await sleep(700);
    check(who + ': 세션 화면에 타이머 막대가 있고 보임', await visible(h.page, '.pv .yt-viewer'));
    check(who + ': 화면에 보이는 막대는 하나뿐 (허브 막대는 숨김 — 겹쳐 보이지 않음)', await h.page.evaluate(() => Array.from(document.querySelectorAll('.yt-bar')).filter((b) => { const r = b.getBoundingClientRect(); return getComputedStyle(b).display !== 'none' && r.width > 0 && r.height > 0; }).length === 1));
    check(who + ': v6 떠 있는 타이머 창 — 악보 칸 안(위 막대 아래)에 뜨고 손잡이 · 작게 보기 단추가 있음', await h.page.evaluate(() => { const top = document.querySelector('.pv-top').getBoundingClientRect(), bar = document.querySelector('.pv .yt-viewer').getBoundingClientRect(), main = document.querySelector('.pv-main').getBoundingClientRect(); return bar.top >= top.bottom - 1 && bar.bottom <= main.bottom + 1 && getComputedStyle(document.querySelector('.pv .yt-viewer')).position === 'absolute' && !!document.querySelector('.pv .yt-viewer .pv-grip') && !!document.querySelector('.pv .yt-viewer [data-a="mini"]'); }));
    check(who + ': 세션 막대도 같은 숫자 (허브 막대와)', await (async () => { const a = secOf(await txt(h.page, '.pv .yt-viewer .yt-total .yt-v')); const b = secOf(await total(h.page === pa ? pr : pa)); return Math.abs(a - b) <= 2; })());
    check(who + ': 세션 화면에 실시간 연결(자기 연습 소켓)도 정상 — 막대와 별개로 동작', await h.page.evaluate(() => window.YNPractice.current().P.rt().state) === 'online');
  }
  check('세션 막대: 인도자만 조작 버튼', await ctlCount(pa, '.pv .yt-viewer') === 2 && await ctlCount(pr, '.pv .yt-viewer') === 0, [await ctlCount(pa, '.pv .yt-viewer'), await ctlCount(pr, '.pv .yt-viewer')]);
  await shot(pa, '04-viewer-lead');
  const before = await txt(pr, '.pv .yt-viewer .yt-seg .yt-l');
  await pa.click('.pv .yt-viewer [data-a=segnext]');
  check('세션 화면에서 다음 곡 → 읽기 전용 세션 화면의 구간 이름이 바뀜', await L.waitTrue(pr, (b) => document.querySelector('.pv .yt-viewer .yt-seg .yt-l').textContent !== b, before, 3000), [before, await txt(pr, '.pv .yt-viewer .yt-seg .yt-l')]);
  await pa.click('.pv .yt-viewer [data-a=expand]');
  check('세션 화면에서도 방송 모드가 열림 (세션 화면보다 위)', await pa.evaluate(() => { const p = document.querySelector('.yt-panel'); if (!p) return false; const z = (e) => Number(getComputedStyle(e).zIndex); return z(p) > z(document.querySelector('.pv')) && document.elementFromPoint(innerWidth / 2, 60).closest('.yt-panel') !== null; }));
  await pa.keyboard.press('Escape');
  check('방송 모드의 Esc 가 세션 화면을 닫지 않음', await L.waitTrue(pa, () => !document.querySelector('.yt-panel') && !!document.querySelector('.pv'), null, 1500));
  // 전체 화면
  await pa.click('.pv-fsbtn'); await sleep(500);
  check('전체 화면(악보만 크게)에서도 타이머 창이 그대로 보임 (화면 안)', await pa.evaluate(() => document.querySelector('.pv').classList.contains('pv-fs')) && await visible(pa, '.pv .yt-viewer') && await pa.evaluate(() => { const r = document.querySelector('.pv .yt-viewer').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }));
  check('전체 화면: 악보 영역이 화면 맨 위부터 (타이머는 떠 있음)', await pa.evaluate(() => document.querySelector('.pv-main').getBoundingClientRect().top <= 1));
  await shot(pa, '05-viewer-fullscreen');
  await pa.evaluate(() => { const p = document.querySelector('.pv'); p.classList.add('pv-fsbar-on'); }); await sleep(400);
  check('전체 화면 메뉴(위에서 내려오는 줄)는 맨 위에 (타이머 창은 떠 있어 겹치지 않게 옮길 수 있음)', await pa.evaluate(() => document.querySelector('.pv-fsbar').getBoundingClientRect().top <= 1));
  await shot(pa, '06-viewer-fullscreen-menu');
  await pa.click('.pv-fsbar [data-a=fs]'); await sleep(300);
  check('전체 화면을 나가면 다시 헤더 아래', await pa.evaluate(() => !document.querySelector('.pv').classList.contains('pv-fs') && document.querySelector('.pv .yt-viewer').getBoundingClientRect().top >= document.querySelector('.pv-top').getBoundingClientRect().bottom - 1));
  for (const h of [A, R]) { await h.page.evaluate(() => YNPractice.close()); await sleep(300); }
  check('세션 화면을 닫으면 세션 막대가 사라지고 허브 막대가 다시 보임', await pa.evaluate(() => !document.querySelector('.yt-viewer')) && await visible(pa, V) && await visible(pr, V));
  check('세션을 여닫아도 소켓 연결(막대) 하나를 계속 공유 (누적되지 않음)', await pa.evaluate(() => Object.keys(YNTimer._reg).length === 1 && YNTimer._reg[Object.keys(YNTimer._reg)[0]].n === 1));

  console.log('8. 웹소켓이 막힌 화면 (HTTP 대체 통로)');
  const B1 = await mk('t=' + encodeURIComponent(RO_TOK), null, { blockSockets: true });       // socket.io 스크립트는 오지만 연결이 막힘
  const B2 = await mk('t=' + encodeURIComponent(OH_TOK), null, { blockSockets: true, blockScript: true });   // 스크립트 자체가 막힘 (인도자 · 오팀장)
  const p1 = B1.page, p2 = B2.page;
  check('막힌 화면 1: 웹소켓 없이도 대체 연결로 상태를 받음 (표시: 동기화됨 · 대체)', await waitSync(p1, 'poll', 10000), await syncOf(p1));
  check('막힌 화면 1: 읽기 전용 · 조작 버튼 없음', await ctlCount(p1) === 0);
  check('막힌 화면 2(스크립트 자체가 막힘): 대체 연결로 인도자 권한 확인', await waitSync(p2, 'poll', 10000) && await ctlCount(p2) === 2, [await syncOf(p2), await ctlCount(p2)]);
  check('두 막힌 화면도 같은 예배 경과 (±2초, 서버 시계 보정)', await (async () => { const x = secOf(await total(p1)), y = secOf(await total(p2)), z = secOf(await total(pa)); return Math.abs(x - z) <= 2 && Math.abs(y - z) <= 2; })(), [await total(p1), await total(p2), await total(pa)]);
  check('막힌 화면에 표시된 상태 설명(툴팁)에 "3초마다"', /3초마다/.test(await p1.evaluate(() => document.querySelector('.yt-hub .yt-sync').title)));
  const stAt = Date.now();
  await pa.click(V + ' [data-a=toggle]');                                            // 정상 화면의 인도자가 일시정지
  check('정상 화면의 조작이 막힌 화면들에 몇 초 안에 도착 (일시정지)', await L.waitTrue(p1, () => !document.querySelector('.yt-hub .yt-total').classList.contains('run'), null, 6000) && await L.waitTrue(p2, () => !document.querySelector('.yt-hub .yt-total').classList.contains('run'), null, 6000), Date.now() - stAt);
  console.log('   도착까지 ' + (Date.now() - stAt) + 'ms');
  await p2.click(V + ' [data-a=segnext]');                                           // 막힌 화면의 인도자가 HTTP 로 조작
  check('막힌 화면(HTTP)의 인도자 조작이 정상 소켓 화면들에 즉시 반영', await L.waitTrue(pa, () => /찬양 종료|Second Song|Amazing/.test(document.querySelector('.yt-hub .yt-seg .yt-l').textContent) && document.querySelector('.yt-hub .yt-seg .yt-l').textContent !== '찬양 구간', null, 2500) && await L.waitTrue(pr, () => document.querySelector('.yt-hub .yt-seg .yt-l').textContent !== '찬양 구간', null, 2500), await txt(pr, V + ' .yt-seg .yt-l'));
  await p2.click(V + ' [data-a=toggle]');
  check('막힌 화면의 시작 버튼 → 모든 화면이 진행 중', await L.waitTrue(pr, () => document.querySelector('.yt-hub .yt-total').classList.contains('run'), null, 2500) && await L.waitTrue(p1, () => document.querySelector('.yt-hub .yt-total').classList.contains('run'), null, 6000));
  check('HTTP 화면끼리 서로의 조작을 몇 초 안에 봄 (p2 조작 → p1)', await L.waitTrue(p1, () => document.querySelector('.yt-hub .yt-total').classList.contains('run'), null, 6000));
  await shot(p1, '07-hub-blocked-poll');
  // 소켓이 다시 되살아나는 경우: 막힘이 풀린 뒤에는 (새 접속) 웹소켓으로 돌아감
  check('막힌 화면들의 오류 없음', B1.errs.length === 0 && B2.errs.length === 0, B1.errs.concat(B2.errs).slice(0, 4));
  await B1.ctx.close(); await B2.ctx.close();

  console.log('9. 폰 폭 390px');
  const ph = { width: 390, height: 844 };
  const PL = await mk('key=' + KEY, ph), PR = await mk('t=' + encodeURIComponent(RO_TOK), ph);
  await waitSync(PL.page, 'socket'); await waitSync(PR.page, 'socket'); await sleep(600);
  for (const [nm, h] of [['인도자', PL], ['읽기 전용', PR]]) {
    const m = await h.page.evaluate(() => {
      const bar = document.querySelector('.yt-hub'), br = bar.getBoundingClientRect(), sc = document.scrollingElement;
      const chips = Array.from(bar.querySelectorAll('.yt-chip')).map((c) => c.getBoundingClientRect());
      const vals = Array.from(bar.querySelectorAll('.yt-v')).map((v) => v.scrollWidth <= v.clientWidth + 1);
      return { pageOverflow: sc.scrollWidth > innerWidth, barRight: Math.round(br.right), barLeft: Math.round(br.left), barH: Math.round(br.height), barOverflow: bar.scrollWidth > bar.clientWidth, chipMin: Math.round(Math.min.apply(null, chips.map((c) => c.width))), valsOk: vals.every(Boolean), chipBoxes: chips.map((c) => [Math.round(c.left), Math.round(c.right)]) };
    });
    check(nm + ' 폰: 가로 스크롤 없음 · 막대가 화면 안', !m.pageOverflow && !m.barOverflow && m.barRight <= 390 && m.barLeft >= 0, m);
    check(nm + ' 폰: 막대 높이 콤팩트 (≤ 56px)', m.barH <= 56, m.barH);
    check(nm + ' 폰: 숫자가 칸 안에서 잘리지 않음', m.valsOk, m);
  }
  // 1시간이 넘는 긴 숫자 · 초과 표시에서도 (글자를 직접 바꿔 넣어 넘치는지)
  const wide = await PL.page.evaluate(() => { const bar = document.querySelector('.yt-hub'); const vs = bar.querySelectorAll('.yt-v'); const old = Array.from(vs).map((v) => v.textContent); vs[0].textContent = '12:34:56'; vs[1].textContent = '59:59'; vs[2].textContent = '+12:34'; const r = { bar: bar.scrollWidth > bar.clientWidth, vals: Array.from(vs).map((v) => v.scrollWidth <= v.clientWidth + 1), page: document.scrollingElement.scrollWidth > innerWidth }; Array.from(vs).forEach((v, i) => { v.textContent = old[i]; }); return r; });
  check('폰: 12:34:56 같은 긴 숫자도 넘치지 않음', !wide.bar && !wide.page && wide.vals.every(Boolean), wide);
  await shot(PL.page, '08-hub-phone-lead');
  await PL.page.evaluate(() => document.querySelector('.yt-hub [data-a=expand]').click()); await sleep(400);
  check('폰: 방송 모드가 화면 폭 안 · 큰 숫자 (스크롤은 세로만)', await PL.page.evaluate(() => { const p = document.querySelector('.yt-panel'); return p.scrollWidth <= p.clientWidth && parseFloat(getComputedStyle(p.querySelector('.yt-bv')).fontSize) >= 52; }));
  await shot(PL.page, '09-panel-phone-lead');
  await PL.page.keyboard.press('Escape');
  await PL.page.evaluate(() => openPractice(''));
  await L.waitTrue(PL.page, () => document.querySelector('.pv .yt-viewer') && /\/ \d+/.test((document.querySelector('.pv-pg') || {}).textContent || ''), null, 10000); await sleep(600);
  const pv = await PL.page.evaluate(() => { const b = document.querySelector('.pv .yt-viewer').getBoundingClientRect(); return { h: Math.round(b.height), right: Math.round(b.right), over: document.querySelector('.pv .yt-viewer').scrollWidth > document.querySelector('.pv .yt-viewer').clientWidth, page: document.scrollingElement.scrollWidth > innerWidth, mainBottom: Math.round(document.querySelector('.pv-main').getBoundingClientRect().bottom) }; });
  check('폰 세션 화면: 타이머 창이 폭 안 · 낮음 (≤ 56px, 처음엔 작게) · 악보 영역이 화면 밖으로 밀리지 않음', pv.right <= 390 && !pv.over && !pv.page && pv.h <= 56 && pv.mainBottom <= 844, pv);
  await shot(PL.page, '10-viewer-phone');
  await PL.ctx.close(); await PR.ctx.close();

  console.log('10. 태블릿 폭 (820×1180)');
  const TB = await mk('key=' + KEY, { width: 820, height: 1180 });
  await waitSync(TB.page, 'socket');
  check('태블릿: 막대가 한 줄 · 넘치지 않음', await TB.page.evaluate(() => { const b = document.querySelector('.yt-hub'); return b.scrollWidth <= b.clientWidth && b.getBoundingClientRect().height < 80 && document.scrollingElement.scrollWidth <= innerWidth; }));
  await shot(TB.page, '11-hub-tablet');
  await TB.page.evaluate(() => openPractice(''));
  await L.waitTrue(TB.page, () => document.querySelector('.pv .yt-viewer') && /\/ \d+/.test((document.querySelector('.pv-pg') || {}).textContent || ''), null, 10000); await sleep(600);
  await shot(TB.page, '12-viewer-tablet');
  await TB.ctx.close();

  console.log('11. 서버 재시작 복구 · 오류');
  // 서버 저장소가 사라진 것처럼 (재시작) — 인도자 화면이 마지막 상태를 서버에 되살림
  const RT = require('../../lib/realtime');
  const tBefore = await total(pa); const seq0 = await pa.evaluate(() => YNTimer._reg[Object.keys(YNTimer._reg)[0]].c.state.seq);
  RT.timerReset();
  await pa.evaluate(() => YNTimer._reg[Object.keys(YNTimer._reg)[0]].c.poll());          // 재시작 뒤 소켓이 다시 붙어 새(빈) 상태를 받는 것과 같은 효과
  check('서버 상태를 지우면(재시작 흉내) 인도자 화면이 기억하던 상태로 되살림 · 읽기 전용도 이어감', await L.waitTrue(pr, () => document.querySelector('.yt-hub .yt-total').classList.contains('run'), null, 8000) && secOf(await total(pr)) >= secOf(tBefore), [tBefore, await total(pr), seq0]);
  check('되살린 뒤 두 화면 숫자가 같음 (±2초)', Math.abs(secOf(await total(pa)) - secOf(await total(pr))) <= 2, [await total(pa), await total(pr)]);
  check('화면 오류 없음 (A · R)', A.errs.length === 0 && R.errs.length === 0, A.errs.concat(R.errs).slice(0, 5));
  await br.close();
  console.log('   화면 그림: ' + SHOTS);
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e); process.exit(1); });
