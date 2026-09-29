/**
 * Step 2.9 — 설정 팀 실시간 공유 (진짜 server.js + 가짜 구글 + 진짜 웹소켓) · 스케줄표 겹침 수정
 *   쪽↔곡 연결 · 곡별 메트로놈 · 곡 정보(BPM · 송폼 · 유튜브) · 나만 보기 · 허브에서 콘티 저장 → 열린 연습 화면 갱신
 */
process.env.PORT = '4189';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const { mkpdf, MULTI } = require('./mkpdf');
const BASE = 'http://127.0.0.1:4189', KEY = 'ADM', DATE = '2026-10-04';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const post = async (fn, args) => { const r = await fetch(BASE + '/api/' + fn, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }); return r.json(); };
(async () => {
  await sleep(1200);
  const dataUrl = 'data:application/pdf;base64,' + mkpdf(MULTI).toString('base64');
  run((api) => api.saveWorshipSongs(KEY, DATE, '콘티', [
    { title: 'Amazing Grace', team: '테스트', key: 'G', bpm: '120', form: 'V1-C', link: '', note: '', solo: [] },
    { title: 'Second Song', team: '', key: 'Bb', bpm: '90', form: 'Intro-V-C', link: '', note: '', solo: [] }]));
  const up = run((api) => api.uploadWorshipSheet(KEY, DATE, 'Sunday All Songs.pdf', dataUrl, '콘티'));
  const fileId = up.sheets[0].id;
  const KIM = run((api) => api.포털토큰_('김커미티', '4165551000', ''));
  const br = await L.launch();
  const mk = async (tok, vp) => {
    const ctx = await br.newContext({ viewport: vp || { width: 1280, height: 800 } }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g/i.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto(BASE + '/?page=worship&' + (tok === KEY ? 'key=' : 't=') + encodeURIComponent(tok));
    await L.waitTrue(page, () => window.W && window.D && document.querySelector('.pvgo'), null, 12000);
    return { ctx, page, errs };
  };
  const openPv = async (h) => {
    await h.page.evaluate(() => openPractice(''));
    await L.waitTrue(h.page, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 4', null, 10000);
    await L.waitTrue(h.page, () => window.YNPractice.current().P.rt() && window.YNPractice.current().P.rt().state === 'online', null, 8000);
    await sleep(1500);
  };
  const P = (p, fn, ...a) => p.evaluate(([f, args]) => { const P = window.YNPractice.current().P; return eval('(' + f + ')')(P, ...args); }, [fn.toString(), a]);
  const A = await mk(KEY), B = await mk(KIM); const pa = A.page, pb = B.page;
  check('허브 두 곳이 열림 (A=관리자, B=김커미티)', await pa.evaluate(() => !!D) && await pb.evaluate(() => !!D && D.who === '김커미티'), await pb.evaluate(() => D.who));
  await openPv(A); await openPv(B);
  check('두 사람 모두 실시간 연결', await P(pa, (P) => P.rt().state === 'online') && await P(pb, (P) => P.rt().state === 'online'));
  check('곡 목록에 seq · kind 가 전달됨 (허브 → 연습 화면)', await P(pa, (P) => P.songs.map((s) => s.kind + s.seq).join()) === '콘티1,콘티2');
  const songOf = (p, pg) => P(p, (P, n) => P.pageSong(n), pg);

  console.log('1. 쪽 ↔ 곡 연결');
  check('처음: 3쪽 = Second Song(1번), 2쪽 = Amazing Grace(0번)', await songOf(pa, 2) === 0 && await songOf(pa, 3) === 1, [await songOf(pa, 2), await songOf(pa, 3)]);
  await pa.evaluate(() => window.YNPractice.current().P.el.querySelector('[data-a="next"]').click()); await sleep(600);
  await pa.evaluate(() => { const s = document.querySelector('.pv-songsel'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(600);
  check('A: 2쪽을 Second Song 으로 직접 연결', await songOf(pa, 2) === 1);
  check('B 화면에도 실시간으로 2쪽 = Second Song', await L.waitTrue(pb, () => window.YNPractice.current().P.pageSong(2) === 1, null, 4000), await songOf(pb, 2));
  let cfg = run((api) => api.worshipCfgLoad(KEY, DATE));
  check('시트(연습설정 탭)에 팀 설정으로 저장됨', cfg.team.some((e) => e.kind === 'map' && e.key === fileId && e.value['2'] === 1), cfg.team);
  const C = await mk(KIM); await openPv(C);
  check('새 기기(빈 저장소)로 열어도 서버에서 연결이 복원됨', await L.waitTrue(C.page, () => window.YNPractice.current().P.pageSong(2) === 1, null, 5000), await songOf(C.page, 2));
  await C.ctx.close();
  // 나만 보기
  await pb.evaluate(() => window.YNPractice.current().P.setLayer('mine')); await sleep(300);
  await pb.evaluate(() => window.YNPractice.current().P.el.querySelector('[data-a="next"]').click()); await sleep(600);
  await pb.evaluate(() => { const s = document.querySelector('.pv-songsel'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(900);
  check('B(나만 보기): 자기 화면에서는 2쪽 = Amazing Grace', await songOf(pb, 2) === 0, await songOf(pb, 2));
  check('나만 보기 연결은 A 에게 전달되지 않음', await songOf(pa, 2) === 1, await songOf(pa, 2));
  cfg = run((api) => api.worshipCfgLoad(KEY, DATE));
  check('팀 설정은 그대로 (2쪽 = 1번)', cfg.team.some((e) => e.kind === 'map' && e.value['2'] === 1));
  check('B 의 내 설정으로만 저장됨', run((api) => api.worshipCfgLoad(KIM, DATE)).mine.some((e) => e.kind === 'map' && e.value['2'] === 0) && !cfg.mine.some((e) => e.kind === 'map'));
  await pb.evaluate(() => window.YNPractice.current().P.setLayer('team'));

  console.log('2. 곡별 메트로놈 설정 (박자 · 강세 · 시작 전 마디 · BPM)');
  await pa.evaluate(() => window.YNPractice.current().P.goPage ? 0 : 0);
  await pa.evaluate(() => { const P = window.YNPractice.current().P; P.setSong(0); P.showTab('metro'); }); await pb.evaluate(() => { const P = window.YNPractice.current().P; P.setSong(0); P.showTab('metro'); }); await sleep(800);
  await pa.selectOption('[data-o="sig"]', '3/4'); await sleep(200);
  await pa.evaluate(() => document.querySelector('[data-beat="1"]').click()); await sleep(200);
  await pa.selectOption('[data-o="count"]', '1'); await sleep(200);
  await pa.fill('[data-role="bpm"]', '96'); await pa.dispatchEvent('[data-role="bpm"]', 'change');
  await sleep(1800);
  cfg = run((api) => api.worshipCfgLoad(KEY, DATE));
  const mc = (cfg.team.filter((e) => e.kind === 'metro' && e.key === 'Amazing Grace')[0] || {}).value;
  check('팀 설정으로 저장됨 (3/4 · 2박 강세 · 1마디 · 96)', !!mc && mc.num === 3 && mc.den === 4 && mc.bpm === 96 && mc.count === 1 && mc.marks[1] > 0, mc);
  check('B 메트로놈이 실시간으로 96 BPM · 3/4 · 강세 2박 · 시작 전 1마디로 바뀜', await L.waitTrue(pb, () => document.querySelector('[data-role="bpm"]').value === '96' && document.querySelector('[data-o="sig"]').value === '3/4' && document.querySelector('[data-beat="1"]').classList.contains('acc') && document.querySelector('[data-o="count"]').value === '1', null, 5000),
    await pb.evaluate(() => [document.querySelector('[data-role="bpm"]').value, document.querySelector('[data-o="sig"]').value, document.querySelector('[data-o="count"]').value]));
  // B 나만 보기로 다른 BPM
  await pb.evaluate(() => window.YNPractice.current().P.setLayer('mine')); await sleep(200);
  await pb.fill('[data-role="bpm"]', '70'); await pb.dispatchEvent('[data-role="bpm"]', 'change'); await sleep(1600);
  check('B(나만 보기) BPM 70 은 A 에게 안 감', await pa.evaluate(() => document.querySelector('[data-role="bpm"]').value) === '96');
  check('B 의 내 설정에만 저장', (run((api) => api.worshipCfgLoad(KIM, DATE)).mine.filter((e) => e.kind === 'metro')[0] || { value: {} }).value.bpm === 70 && (run((api) => api.worshipCfgLoad(KEY, DATE)).team.filter((e) => e.kind === 'metro')[0].value.bpm === 96));
  await pb.evaluate(() => window.YNPractice.current().P.setLayer('team'));
  // 연주 중에는 바뀌지 않고 멈추면 적용
  await pb.evaluate(() => { const P = window.YNPractice.current().P; P.cfgSet('metro', 'Amazing Grace', null); }); await sleep(500);

  console.log('3. 곡 정보 (BPM · 송폼 · 유튜브 링크)');
  await pa.evaluate(() => window.YNPractice.current().P.showTab('form')); await sleep(500);
  await pa.fill('[data-e="bpm"]', '101'); await pa.fill('[data-e="form"]', 'Int V C B C'); await pa.fill('[data-e="link"]', 'https://youtu.be/dQw4w9WgXcQ');
  await pa.evaluate(() => document.querySelector('[data-a="saveinfo"]').click()); await sleep(1200);
  const row = run((api) => api.콘티목록_(DATE, '콘티'))[0];
  check('허브 원본(찬양콘티)이 바뀜 — BPM · 송폼 · 링크', row.bpm === '101' && row.form === 'Int V C B C' && row.link === 'https://youtu.be/dQw4w9WgXcQ', row);
  check('B 화면의 곡 정보가 실시간으로 바뀜', await L.waitTrue(pb, () => { const s = window.YNPractice.current().P.songs[0]; return s.bpm === '101' && s.form === 'Int V C B C'; }, null, 4000), await P(pb, (P) => P.songs[0]));
  await pb.evaluate(() => window.YNPractice.current().P.setSong(0)); await sleep(300);
  check('B 에 유튜브 ▶ 버튼이 생김', await pb.evaluate(() => getComputedStyle(document.querySelector('.pv-ytbtn')).display !== 'none'));
  check('B 의 송폼 탭에도 새 송폼 · BPM 이 채워짐', await pb.evaluate(() => { window.YNPractice.current().P.showTab('form'); return true; }) && await L.waitTrue(pb, () => document.querySelector('[data-e="bpm"]').value === '101' && document.querySelector('[data-e="form"]').value === 'Int V C B C', null, 3000));
  check('B 알림창에 누가 바꿨는지', await pb.evaluate(() => /곡 정보를 바꿨습니다/.test(document.querySelector('.pv-toast').textContent)), await pb.evaluate(() => document.querySelector('.pv-toast').textContent));
  // 나만 보기 곡 정보
  await pb.evaluate(() => window.YNPractice.current().P.setLayer('mine')); await sleep(200);
  await pb.fill('[data-e="bpm"]', '77'); await pb.evaluate(() => document.querySelector('[data-a="saveinfo"]').click()); await sleep(1200);
  check('B(나만 보기)의 BPM 77 은 B 화면에만', await P(pb, (P) => P.songs[0].bpm) === '77' && await P(pa, (P) => P.songs[0].bpm) === '101');
  check('허브 원본은 그대로 (101)', run((api) => api.콘티목록_(DATE, '콘티'))[0].bpm === '101');
  check('B 의 내 설정(song)에 저장', run((api) => api.worshipCfgLoad(KIM, DATE)).mine.some((e) => e.kind === 'song' && e.key === 'Amazing Grace' && e.value.bpm === '77'));
  await pb.evaluate(() => window.YNPractice.current().P.setLayer('team')); await sleep(200);
  // 허브에서 콘티 저장 → 열린 연습 화면이 곡 목록을 다시 불러옴 (HTTP → 웹소켓 알림)
  const saved = await post('saveWorshipSong', [KEY, DATE, { seq: 2, title: 'Second Song', team: '', key: 'C', bpm: '88', form: 'V C', link: '', note: '', kind: '콘티' }]);
  check('허브 저장(saveWorshipSong)이 성공', saved.ok, saved.error);
  check('열려 있는 A · B 연습 화면이 곡 정보를 다시 불러옴 (Key C · 88)', await L.waitTrue(pa, () => { const s = window.YNPractice.current().P.songs[1]; return s.key === 'C' && s.bpm === '88'; }, null, 5000) && await L.waitTrue(pb, () => { const s = window.YNPractice.current().P.songs[1]; return s.key === 'C' && s.bpm === '88'; }, null, 5000), await P(pb, (P) => P.songs[1]));
  check('B 의 나만 보기 BPM(77)은 다시 불러온 뒤에도 유지', await P(pb, (P) => P.songs[0].bpm) === '77', await P(pb, (P) => P.songs[0].bpm));
  check('허브 저장이 쪽↔곡 연결을 깨지 않음 (A: 2쪽 = Second Song)', await songOf(pa, 2) === 1, await songOf(pa, 2));
  const post2 = await post('worshipCfgSave', ['bad-token', DATE, 'team', 'metro', 'x', { num: 3 }, 'c']);
  check('권한 없는 요청은 서버가 거절 (HTTP)', post2.ok === false, post2);
  const post3 = await post('worshipCfgSave', [KEY, DATE, 'team', 'metro', 'HTTP-Song', { num: 3, den: 4 }, 'zzz']);
  check('HTTP 응답에는 bcast 가 새지 않음 (화면에는 필요 없는 내부 값)', post3.ok && post3.result && post3.result.bcast === undefined && post3.result.value.num === 3, post3);
  check('그 저장도 B 에게 실시간 전달 (cfg 이벤트)', await L.waitTrue(pb, () => { const P = window.YNPractice.current().P; const v = P.cfgGet('metro', 'HTTP-Song'); return v && v.num === 3; }, null, 4000));

  console.log('4. 스케줄표 — 날짜 고르기와 사유 칸이 겹치지 않음');
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 780 }]) {
    const S = await mk(KIM, vp); const ps = S.page;
    await ps.evaluate(() => tab('sched')); await L.waitTrue(ps, () => window.ST && ST.rows && document.querySelector('.stpanel'), null, 10000); await sleep(500);
    await ps.evaluate(() => { ST.pick = []; render(); }); await sleep(300);
    const pickers = await ps.evaluate(() => Array.from(document.querySelectorAll('[onclick^="stPickDay"]')).length);
    check('[' + vp.width + 'px] 날짜 고르기 상태 — 고를 수 있는 날짜 칸이 있음', pickers > 0, pickers);
    await ps.evaluate(() => { const c = document.querySelectorAll('[onclick^="stPickDay"]'); c[Math.min(2, c.length - 1)].click(); }); await sleep(300);
    await ps.fill('#offReason', '출장'); await ps.evaluate(() => { const c = document.querySelectorAll('[onclick^="stPickDay"]'); c[Math.min(5, c.length - 1)].click(); }); await sleep(300);
    const lay = await ps.evaluate(() => {
      const r = document.getElementById('offReason'), bar = document.querySelector('.stbar'), rr = r.getBoundingClientRect(), br = bar.getBoundingClientRect();
      const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const cells = Array.from(document.querySelectorAll('[onclick^="stPickDay"]')).filter((c) => c.offsetParent);
      const over = cells.filter((c) => hit(c.getBoundingClientRect(), rr) || hit(c.getBoundingClientRect(), br));
      return { pos: getComputedStyle(bar).position, over: over.length, val: r.value, w: rr.width, vis: rr.height > 20, barBeforeTable: !!(bar.compareDocumentPosition(document.querySelector('[onclick^="stPickDay"]')) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    check('[' + vp.width + 'px] 사유 칸 · 저장 막대가 날짜 칸과 겹치지 않음', lay.over === 0 && lay.vis, lay);
    check('[' + vp.width + 'px] 막대가 화면에 떠 있지 않고(static) 표 위에 자리를 차지함', lay.pos === 'static' && lay.barBeforeTable, lay);
    check('[' + vp.width + 'px] 날짜를 더 골라도 적어 둔 사유가 지워지지 않음', lay.val === '출장', lay.val);
    await ps.evaluate(() => document.querySelector('.stbar').scrollIntoView({ block: 'start' })); await sleep(200); await ps.screenshot({ path: '/tmp/shot-sched-' + vp.width + '.png' });
    await ps.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(200);
    const after = await ps.evaluate(() => { const rr = document.getElementById('offReason').getBoundingClientRect(); const cells = Array.from(document.querySelectorAll('[onclick^="stPickDay"]')).filter((c) => c.offsetParent); const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1; return cells.filter((c) => hit(c.getBoundingClientRect(), rr)).length; });
    check('[' + vp.width + 'px] 아래로 스크롤해도 겹침 없음', after === 0, after);
    check('[' + vp.width + 'px] 작은 화면에서도 가로 넘침 없음', await ps.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), await ps.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
    await S.ctx.close();
  }

  const errs = A.errs.concat(B.errs);
  check('브라우저 오류 없음', errs.length === 0, errs.slice(0, 4));
  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
