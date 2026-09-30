/**
 * v6 화면 시험 (진짜 크롬 + 진짜 server.js + 가짜 구글)
 *   NODE_PATH=$(npm root -g) PORT=4198 node scripts/browser/e2e-v6.js
 *  A. 라이브 악보: 떠 있는 창(도구 · 메트로놈 · 송폼 · 타이머) · 옮기기 · 기억 · 보이기/숨기기 · 빈 곳 톡 → 도구 접기
 *  B. 도구를 쓴 뒤 빈 곳 톡 → 선택·이동 (글자 · 펜 · 기호) · 메트로놈 따라가기 없음
 *  C. 밝은/어두운 전환: 한 번에(transition 없음) · 글씨색 보정도 같은 순간
 *  D. 허브 탭 "장비 · 수리" · "라이브 악보 시작" · 허브 타이머 작게 보기
 */
process.env.PORT = process.env.PORT || '4198';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const { mkpdf, SAMPLE } = require('./mkpdf');
const BASE = 'http://127.0.0.1:' + process.env.PORT, KEY = 'ADM';
const SHOT = process.env.SHOT_DIR || '/tmp';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;

(async () => {
  await sleep(1200);
  const pdfUrl = 'data:application/pdf;base64,' + mkpdf(SAMPLE).toString('base64');
  const d = run((api) => api.worshipHub(KEY, '')).nextWeek || '2026-10-04';
  run((api) => api.saveWorshipSongs(KEY, d, '콘티', [1, 2].map((n) => ({ title: '주님의 은혜 ' + n, team: '팀', key: 'G', bpm: '72', form: 'I-V1-C-B-C-O', link: '', note: '', solo: [] }))));
  run((api) => api.uploadWorshipSheet(KEY, d, '주님의 은혜 1.pdf', pdfUrl, '콘티'));
  const br = await L.launch();
  const mk = async (vp, extra) => {
    const ctx = await br.newContext(Object.assign({ viewport: vp, locale: 'ko-KR' }, extra || {}));
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|ERR_|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    return { ctx, page, errs };
  };
  const openHub = async (page) => { await page.goto(BASE + '/?page=worship&key=' + KEY + '&date=' + d); await L.waitTrue(page, () => window.W && document.querySelectorAll('.song.card').length >= 2, null, 15000); await page.evaluate((dd) => { if (window.DATE !== dd) goWeek(dd); }, d); await sleep(600); };
  const openPv = async (page) => { await page.evaluate(() => openPractice('')); return L.waitTrue(page, () => { const l = document.querySelector('.pv-loading'); return !!document.querySelector('.pv') && l && l.style.display === 'none'; }, null, 12000); };
  const tool = (page) => page.evaluate(() => YNPractice.current().P.anno().state().tool);
  const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);

  /* ================= A. 떠 있는 창 ================= */
  console.log('· A. 라이브 악보 — 떠 있는 창');
  let { ctx, page, errs } = await mk({ width: 1180, height: 820 }, { hasTouch: true });
  await openHub(page);
  check('허브 버튼 이름 "라이브 악보 시작"', await page.evaluate(() => /라이브 악보 시작/.test(document.body.innerText) && !/세션 \/ 연습 시작/.test(document.body.innerText)));
  check('라이브 악보가 열림', await openPv(page));
  await sleep(600);
  const top = await rect(page, '.pv-top');
  check('위 막대는 한 줄 (높이 70px 이하)', top && top.h <= 70, top);
  const fl = await page.evaluate(() => ['.pv-tools', '.pv-metro', '.pv-form', '.yt-viewer'].map((s) => { const e = document.querySelector(s); return !!e && e.classList.contains('pv-float') && getComputedStyle(e).position === 'absolute' && e.offsetParent !== null; }));
  check('도구 · 메트로놈 · 송폼 · 타이머가 모두 떠 있는 창', fl.every(Boolean), fl);
  check('송폼 창에 곡 이름 · 키 · BPM · 송폼', await page.evaluate(() => { const t = document.querySelector('.pv-form').textContent; return /주님의 은혜 1/.test(t) && /Key G/.test(t) && /72 BPM/.test(t) && /V1/.test(t); }));
  check('악보 위 예전 송폼 배지는 보이지 않음 · 악보를 밀어내지 않음', await page.evaluate(() => Array.from(document.querySelectorAll('.pv-formbadge')).every((b) => b.offsetParent === null)));
  check('메트로놈(▶ · BPM · 콜아웃)은 도구 도크가 아니라 메트로놈 창에', await page.evaluate(() => !!document.querySelector('.pv-metro .pv-live .pv-lv-go') && !document.querySelector('.pv-tools .pv-live')));
  // 옮기기
  const t0 = await rect(page, '.pv-tools');
  const g = await rect(page, '.pv-tools > .pv-grip');
  check('도구 창에 손잡이', !!g, g);
  await page.mouse.move(g.x + g.w / 2, g.y + g.h / 2); await page.mouse.down(); await page.mouse.move(g.x + 200, g.y + 300, { steps: 8 }); await page.mouse.up();
  const t1 = await rect(page, '.pv-tools');
  check('손잡이를 끌면 도구 창이 따라옴', Math.abs(t1.x - t0.x - (200 - 0)) < 30 && Math.abs(t1.y - t0.y - 300) < 30, { t0, t1 });
  const saved = await page.evaluate(() => localStorage.getItem('yn.pv.pos.tools'));
  check('자리를 이 기기에 기억', !!saved && /"x"/.test(saved), saved);
  const gm = await rect(page, '.pv-metro .pv-grip');
  await page.mouse.move(gm.x + 5, gm.y + 8); await page.mouse.down(); await page.mouse.move(gm.x + 405, gm.y - 200, { steps: 8 }); await page.mouse.up();
  const m1 = await rect(page, '.pv-metro');
  check('메트로놈 창도 옮길 수 있음', m1.x > gm.x + 300 && m1.y < gm.y - 150, m1);
  // 보이기 / 숨기기
  await page.click('.pv-flt[data-k="timer"]');
  check('⏱ 로 타이머 숨기기', (await rect(page, '.yt-viewer')) === null);
  await page.click('.pv-flt[data-k="timer"]');
  check('다시 누르면 보임', (await rect(page, '.yt-viewer')) !== null);
  await page.click('.pv-flt[data-k="form"]');
  check('🎼 로 송폼 숨기기 (기억)', (await rect(page, '.pv-form')) === null && await page.evaluate(() => localStorage.getItem('yn.pv.show.form') === '0'));
  await page.click('.pv-flt[data-k="form"]');
  // 타이머 작게
  await page.click('.yt-viewer [data-a="mini"]');
  const mini = await page.evaluate(() => { const b = document.querySelector('.yt-viewer'); return { mini: b.classList.contains('yt-mini'), seg: document.querySelector('.yt-viewer .yt-seg').offsetParent === null, w: b.offsetWidth }; });
  check('타이머 "작게" — 예배 경과만 남음', mini.mini && mini.seg && mini.w < 330, mini);
  await page.click('.yt-viewer [data-a="mini"]');
  // 빈 곳 톡 → 도구 접기
  const pb = await rect(page, '.pv-pagebox');
  await page.evaluate(() => YNPractice.current().P.anno && 0);
  await page.mouse.click(pb.x + pb.w * 0.5, pb.y + pb.h * 0.55);
  check('이동 모드에서 악보 빈 곳을 톡 → 도구 창이 접힘 (알약만)', await L.waitTrue(page, () => document.querySelector('.pv').classList.contains('pv-toolshide') && document.querySelector('.pv-toolsbtn').offsetParent !== null, null, 2000));
  const pill = await rect(page, '.pv-toolsbtn'), tl = t1;
  check('알약은 도구 창이 있던 자리에', Math.abs(pill.x - tl.x) < 40 && Math.abs(pill.y - tl.y) < 40, { pill, tl });
  await page.click('.pv-toolsbtn');
  check('알약을 누르면 도구 창이 다시 (같은 자리)', await L.waitTrue(page, () => !document.querySelector('.pv').classList.contains('pv-toolshide'), null, 2000) && Math.abs((await rect(page, '.pv-tools')).x - t1.x) < 30);
  check('메트로놈 따라가기 칩 · 클릭 컨트롤 칩 없음, 따라가기는 페이지만', await page.evaluate(() => { const P = YNPractice.current().P; const fm = document.querySelector('.pv-followm'), ck = document.querySelector('.pv-click'); return (!fm || fm.style.display === 'none') && (!ck || ck.style.display === 'none') && P.followMetro() === false; }));
  await page.evaluate(() => YNPractice.current().P.showTab('together'));
  check('"함께" 탭에 메트로놈 따라가기 스위치 없음', await page.evaluate(() => !document.querySelector('.pv-panes input[data-a="followm"]') && !!document.querySelector('.pv-panes input[data-a="follow"]')));
  await page.screenshot({ path: SHOT + '/v6-pv-ipadL.png' });

  /* ================= B. 쓰고 난 뒤 빈 곳 톡 → 선택·이동 ================= */
  console.log('· B. 자동 선택·이동');
  await page.evaluate(() => { const P = YNPractice.current().P; if (P.showTab) {} document.querySelector('.pv').classList.contains('pv-sideopen') && document.querySelector('[data-a="panel"]').click(); });
  await sleep(300);
  const box = await rect(page, '.pv-anno');
  const at = (fx, fy) => ({ x: box.x + fx * box.w, y: box.y + fy * box.h });
  await page.click('.pv-tool[data-tool="text"]');
  let p = at(0.3, 0.45); await page.mouse.click(p.x, p.y);
  check('글자 도구: 악보를 누르면 입력칸', await L.waitTrue(page, () => !!document.querySelector('.an-editor input'), null, 2000));
  await page.keyboard.type('Hi'); await sleep(100);
  p = at(0.65, 0.7); await page.mouse.click(p.x, p.y); await sleep(300);
  const afterText = await page.evaluate(() => { const an = YNPractice.current().P.anno(); return { tool: an.state().tool, ed: an.state().ed, items: an.items('team').concat(an.items('mine')).filter((i) => i.t === 'text').length, btn: document.querySelector('.pv-tool[data-tool="select"]').classList.contains('on') }; });
  check('글을 쓴 뒤 다른 곳을 톡 → 글자는 저장되고 선택·이동 모드로 (새 입력칸 없음)', afterText.tool === 'select' && !afterText.ed && afterText.items === 1 && afterText.btn, afterText);
  // 처음 한 번은 그대로 (쓰기 전에 바로 바뀌지 않음)
  await page.click('.pv-tool[data-tool="pen"]');
  const n0 = await page.evaluate(() => YNPractice.current().P.anno().items('team').concat(YNPractice.current().P.anno().items('mine')).length);
  await L.drag(page, [[0.2, 0.2], [0.3, 0.25], [0.4, 0.2]]);
  const n1 = await page.evaluate(() => YNPractice.current().P.anno().items('team').concat(YNPractice.current().P.anno().items('mine')).length);
  check('펜: 그은 획은 그대로 저장', n1 === n0 + 1, { n0, n1 });
  p = at(0.8, 0.85); await page.mouse.click(p.x, p.y); await sleep(250);
  const n2 = await page.evaluate(() => YNPractice.current().P.anno().items('team').concat(YNPractice.current().P.anno().items('mine')).length);
  check('펜으로 쓴 뒤 톡 → 점을 찍지 않고 선택·이동 모드로', n2 === n1 && (await tool(page)) === 'select', { n2, tool: await tool(page) });
  await page.click('.pv-tool[data-tool="sym"]');
  p = at(0.5, 0.62); await page.mouse.click(p.x, p.y); await sleep(200);
  const s1 = await page.evaluate(() => YNPractice.current().P.anno().items('team').concat(YNPractice.current().P.anno().items('mine')).filter((i) => i.t === 'sym').length);
  p = at(0.15, 0.9); await page.mouse.click(p.x, p.y); await sleep(200);
  const s2 = await page.evaluate(() => YNPractice.current().P.anno().items('team').concat(YNPractice.current().P.anno().items('mine')).filter((i) => i.t === 'sym').length);
  check('기호: 하나 놓고 빈 곳 톡 → 두 번째는 놓지 않고 선택·이동', s1 === 1 && s2 === 1 && (await tool(page)) === 'select', { s1, s2 });
  await page.click('.pv-tool[data-tool="text"]');
  p = at(0.4, 0.6); await page.mouse.click(p.x, p.y);
  check('도구를 다시 고르면 처음처럼 한 번 더 쓸 수 있음', await L.waitTrue(page, () => !!document.querySelector('.an-editor input'), null, 2000));
  await page.keyboard.press('Escape');
  check('A · B 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 폰 (좁은 화면) ================= */
  ({ ctx, page, errs } = await mk({ width: 390, height: 844 }, { isMobile: true, hasTouch: true }));
  await openHub(page); await openPv(page); await sleep(600);
  const ph = await page.evaluate(() => ({ drawer: !!document.querySelector('.pv-drawer .pv-tools'), metro: document.querySelector('.pv-metro').offsetParent === null, mini: document.querySelector('.yt-viewer').classList.contains('yt-mini'), over: document.scrollingElement.scrollWidth - innerWidth }));
  check('폰: 도구는 서랍 메뉴 안 · 메트로놈 창 대신 빠른 버튼 · 타이머는 처음에 작게', ph.drawer && ph.metro && ph.mini && ph.over <= 0, ph);
  await page.screenshot({ path: SHOT + '/v6-pv-phone.png' });
  check('폰 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= C. 밝은/어두운 전환 ================= */
  console.log('· C. 밝은/어두운 전환 — 한 번에');
  ({ ctx, page, errs } = await mk({ width: 1280, height: 860 }));
  await openHub(page);
  const snap = () => page.evaluate(() => Array.from(document.querySelectorAll('.panel, .wk, .tabs button, header h1')).slice(0, 25).map((e) => { const s = getComputedStyle(e); return s.backgroundColor + '|' + s.color; }).join(';'));
  await page.evaluate(() => YNTheme.set('light'));
  const a0 = await snap(); await sleep(700); const a1 = await snap();
  check('밝게: 누르는 즉시 모든 색이 최종 색 (조금씩 번지지 않음)', a0 === a1);
  check('밝게: 글씨색 보정도 같은 순간에 끝남 (흰 바탕 위 흰 글씨 없음)', await page.evaluate(() => { const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; }; return Array.from(document.querySelectorAll('.panel h2, .panel b, .panel .chip, .panel span')).filter((e) => e.offsetParent && e.textContent.trim()).every((e) => lum(getComputedStyle(e).color) < 0.75); }));
  await sleep(300);
  const tr = await page.evaluate(async () => { await YNTheme.set('dark'); const e = document.querySelector('.panel'); return { cls: document.documentElement.classList.contains('yn-notrans'), tr: getComputedStyle(e).transitionDuration }; });
  check('전환 순간에는 transition 이 꺼져 있음', tr.cls && /^0s/.test(tr.tr), tr);
  const b0 = await snap(); await sleep(700); const b1 = await snap();
  check('어둡게도 한 번에', b0 === b1);
  check('전환이 끝나면 다시 평소대로 (yn-notrans 해제)', await L.waitTrue(page, () => !document.documentElement.classList.contains('yn-notrans'), null, 2000));
  await page.evaluate(() => YNTheme.set('light')); await sleep(400);
  const lt = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, panel: getComputedStyle(document.querySelector('.panel')).backgroundColor }));
  check('밝은 화면: 바탕 #F3F4F6 · 카드 흰색', lt.bg === 'rgb(243, 244, 246)' && lt.panel === 'rgb(255, 255, 255)', lt);
  await page.screenshot({ path: SHOT + '/v6-hub-light.png' });

  /* ================= D. 허브 — 장비 · 수리 탭 · 타이머 작게 ================= */
  console.log('· D. 허브 — 장비 · 수리 탭');
  await page.evaluate(() => YNTheme.set('dark'));
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#tabs button')).map((b) => b.textContent));
  check('허브 탭: 아카이브 다음 "장비 · 수리"', tabs.indexOf('장비 · 수리') === tabs.indexOf('아카이브') + 1, tabs);
  await page.evaluate(() => tab('equip'));
  check('장비 화면이 허브 안에 뜸 (머리말 없이)', await L.waitTrue(page, () => { const f = document.querySelector('.eqframe'); if (!f || !f.contentDocument) return false; const d2 = f.contentDocument; return !!d2.documentElement && d2.documentElement.classList.contains('eq-embed') && !!d2.querySelector('#root') && !!d2.querySelector('.shell > header') && getComputedStyle(d2.querySelector('.shell > header')).display === 'none'; }, null, 30000));   // 시험 환경은 인터넷이 막혀 글꼴 요청이 늦게 끝남
  const src1 = await page.evaluate(() => document.querySelector('.eqframe').src);
  await page.evaluate(() => { render(); });
  check('장비 탭에서 화면을 다시 그려도 장비 화면을 다시 불러오지 않음', await page.evaluate((s) => !!document.querySelector('.eqframe') && document.querySelector('.eqframe').src === s, src1));
  await page.evaluate(() => tab('plan')); await sleep(400);
  const hb = await page.evaluate(() => { const b = document.querySelector('.yt-hub'); if (!b) return null; b.querySelector('[data-a="mini"]').click(); return { mini: b.classList.contains('yt-mini'), w: b.offsetWidth, saved: localStorage.getItem('yn.yt.mini.hub') }; });
  check('허브 아래 타이머도 "작게" (오른쪽 작은 알약) · 기억', hb && hb.mini && hb.w < 360 && hb.saved === '1', hb);
  check('C · D 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= E. 설문 · 투표 ================= */
  console.log('· E. 설문 · 투표');
  const 커 = run((api) => api.포털토큰_('김커미티', '4165551000', ''));
  const 정 = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const 노 = run((api) => api.포털토큰_('노셀장', '4165551007', ''));
  run((api) => api.addTeamMember(커, '찬양1팀', '정일반', '베이스'));
  const sid = run((api) => api.formSave(커, { title: '점심 메뉴 투표', kind: 'survey', status: '받는중', target: '교인', editable: true, showCount: true, audience: ['팀:찬양1팀'],
    survey: { anonymous: false, results: 'after', allowAdd: true }, questions: [{ id: 'q1', type: 'choice', label: '메뉴', req: true, opts: ['김밥', '라면'] }] })).id;
  const mkP = async (tok, vp) => { const r = await mk(vp || { width: 390, height: 900 }); await r.page.addInitScript((x) => { try { sessionStorage.setItem('ynPortalToken', x); } catch (e) {} }, tok); return r; };
  ({ ctx, page, errs } = await mkP(정));
  await page.goto(BASE + '/?page=portal');
  check('팀원: 포털 Teva Apps 에 투표 타일 (📊 · 투표 중)', await L.waitTrue(page, () => { const x = document.querySelector('#menus .tile.form.survey'); return !!x && /점심 메뉴 투표/.test(x.textContent) && /투표 중/.test(x.textContent); }, null, 10000));
  await page.click('#menus .tile.form.survey');
  check('투표 화면: 📊 투표 · 이름으로 참여 · 참여하면 결과', await L.waitTrue(page, () => { const h = document.querySelector('.svhead'); return !!h && /투표/.test(h.textContent) && /정일반/.test(h.textContent) && /참여하면 결과/.test(h.textContent); }, null, 8000));
  await page.fill('.svadd input', '떡볶이'); await page.click('.svadd button');
  check('항목 추가: "떡볶이" 가 선택지에 생기고 골라짐', await page.evaluate(() => FM_ANS.q1 === '떡볶이' && /떡볶이/.test(document.querySelector('#fmWrap .fx-mount[data-q="q1"]').textContent)));
  await page.click('#fmSubmit');
  check('투표하면 바로 결과 — 내 선택(✓) · 인원 · 퍼센트', await L.waitTrue(page, () => { const m = document.querySelector('.svopt.me'); return !!m && /떡볶이/.test(m.textContent) && /1명 · 100%/.test(m.textContent) && /1명 참여/.test(document.querySelector('.svsum').textContent); }, null, 8000));
  check('익명이 아니면 고른 사람 이름', await page.evaluate(() => /정일반/.test(document.querySelector('.svopt.me .svwho').textContent)));
  check('서버에도 새 선택지 저장', run((api) => api.신청서찾기_(sid)).questions[0].opts.indexOf('떡볶이') !== -1);
  await page.screenshot({ path: SHOT + '/v6-survey-result.png' });
  check('E(팀원) 오류 없음', errs.length === 0, errs);
  await ctx.close();
  ({ ctx, page, errs } = await mkP(노));
  await page.goto(BASE + '/?page=portal');
  await L.waitTrue(page, () => document.getElementById('main').style.display === 'block', null, 10000); await sleep(800);
  check('대상이 아닌 분(노셀장)의 포털에는 투표 타일이 없음', await page.evaluate(() => !document.querySelector('#menus .tile.form.survey')));
  await ctx.close();
  ({ ctx, page, errs } = await mkP(커, { width: 1100, height: 900 }));
  await page.goto(BASE + '/?page=forms&t=' + encodeURIComponent(커));
  check('각종 Form 관리: 설문 · 투표 본보기', await L.waitTrue(page, () => document.querySelectorAll('#svBox button').length >= 5 && /각종 Form 관리/.test(document.title + document.body.innerText), null, 10000));
  check('목록 카드에 📊 투표 · 대상 배지 · 참여 수', await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.fcard')).find((x) => /점심 메뉴 투표/.test(x.textContent)); return !!c && /📊 투표/.test(c.textContent) && /찬양1팀/.test(c.textContent) && /참여/.test(c.textContent); }));
  await page.click('#svBox button');
  check('본보기 → 설문으로 열림 (종류 · 익명 · 결과 공개 · 대상 고르기)', await L.waitTrue(page, () => document.querySelector('.fx-kind button.on') && /설문/.test(document.querySelector('.fx-kind button.on').textContent) && !!document.getElementById('svAnon') && document.querySelectorAll('input[name="svRes"]').length === 3 && !!document.getElementById('audSel'), null, 5000));
  await page.selectOption('#audSel', '팀장'); await page.click('button[onclick="addAud()"]');
  check('대상 "팀장들" 칩 · 인원 미리 보기', await L.waitTrue(page, () => /팀장/.test(document.getElementById('audChips').textContent) && /대상 \d+명/.test(document.getElementById('audN').textContent), null, 5000));
  await page.evaluate((id) => showResults(id), sid);
  check('결과: 참여 현황 (1 / 2명) · 아직 안 한 분 · 다시 알림 단추', await L.waitTrue(page, () => { const t = document.body.innerText; return /1 \/ 2명/.test(t) && /아직 안 한 분 1명/.test(t) && /윤팀장/.test(t) && !!document.querySelector('button[onclick="remindNow(false)"]'); }, null, 6000));
  await page.click('button[onclick="remindNow(false)"]');
  check('다시 알림 보냄', await L.waitTrue(page, () => /1명께 다시 알렸습니다/.test(document.getElementById('remMsg').textContent), null, 5000));
  await page.screenshot({ path: SHOT + '/v6-survey-admin.png', fullPage: true });
  check('E(관리) 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= F. 다른 분 화면 보기 — 알림 · 신청서까지 ================= */
  console.log('· F. 다른 분 화면 보기');
  const vid = run((api) => api.formSave(커, { title: '노셀장 확인 투표', kind: 'survey', status: '받는중', target: '교인', editable: true, audience: ['사람:노셀장'],
    survey: { anonymous: false, results: 'after' }, questions: [{ id: 'q1', type: 'choice', label: '가능?', req: true, opts: ['예', '아니요'] }] })).id;
  run((api) => api.formSave('ADM', { title: '새가족 환영 신청', status: '받는중', target: '새가족', notify: false, editable: true, questions: [{ id: 'q1', type: 'text', label: '한마디' }] }));
  ({ ctx, page, errs } = await mkP(커, { width: 390, height: 900 }));
  await page.goto(BASE + '/?page=portal');
  await L.waitTrue(page, () => document.getElementById('main').style.display === 'block', null, 10000); await sleep(600);
  check('포털 알림은 처음에 닫혀 있음', await page.evaluate(() => { const b = document.querySelector('.todoacc'); return !b || !b.classList.contains('open'); }));
  await page.evaluate(() => viewAs('노셀장', 'member'));
  check('노셀장 화면: 그분의 투표 타일이 보임', await L.waitTrue(page, () => Array.from(document.querySelectorAll('#menus .tile.form')).some((x) => /노셀장 확인 투표/.test(x.textContent)), null, 10000));
  await page.evaluate(() => Array.from(document.querySelectorAll('#menus .tile.form')).find((x) => /노셀장 확인 투표/.test(x.textContent)).click());
  check('눌러서 열면 그분에게 보이는 투표 — 보기 전용 (내기 단추 없음)', await L.waitTrue(page, () => { const w = document.getElementById('fmWrap'); return !!w && /가능\?/.test(w.textContent) && /보기 전용/.test(w.textContent) && !document.getElementById('fmSubmit'); }, null, 8000));
  check('서버에는 아무것도 내지 않음', run((api) => api.formResults(커, vid)).rows.length === 0);
  await page.screenshot({ path: SHOT + '/v6-viewas-form.png' });
  await page.evaluate(() => viewAs('홍길동', 'newcomer'));
  check('새가족(이메일 없음) 화면: 새가족 신청서가 보임', await L.waitTrue(page, () => /새가족 환영 신청/.test(document.getElementById('nfHome').textContent), null, 10000));
  await page.evaluate(() => Array.from(document.querySelectorAll('#nfHome a.fmbtn')).find((x) => /새가족 환영 신청/.test(x.textContent)).click());
  check('새가족 신청서도 열어 볼 수 있음 (보기 전용)', await L.waitTrue(page, () => { const w = document.getElementById('fmWrap'); return !!w && /한마디/.test(w.textContent) && /보기 전용/.test(w.textContent); }, null, 8000));
  check('F 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= G. v6.1 라이브 악보 — 아이패드 세로 ================= */
  console.log('· G. 아이패드 세로 — 손가락 필기 · 한 줄 막대 · 핀치 · 쓸어 넘기기 · 송폼 창 크기 · 메트로놈 동그라미');
  run((api) => api.uploadWorshipSheet(KEY, d, '주님의 은혜 2.pdf', pdfUrl, '콘티'));
  ({ ctx, page, errs } = await mk({ width: 820, height: 1180 }, { hasTouch: true, isMobile: true }));
  await openHub(page); check('세로에서 라이브 악보가 열림', await openPv(page)); await sleep(700);
  const lay = await page.evaluate(() => { const pv = document.querySelector('.pv'), top = document.querySelector('.pv-top'); return { compact: pv.classList.contains('pv-compact'), narrow: pv.classList.contains('pv-narrow'), h: top.getBoundingClientRect().height, over: top.scrollWidth - top.clientWidth, float: document.querySelector('.pv-tools').classList.contains('pv-float') }; });
  check('아이패드 세로는 서랍(좁은 화면)이 아니라 떠 있는 도구 창', !lay.compact && lay.narrow && lay.float, lay);
  check('위 막대는 한 줄 · 넘치지 않음 (유튜브 단추 포함)', lay.h <= 70 && lay.over <= 2, lay);
  check('유튜브 단추도 같은 줄', await page.evaluate(() => { const y = document.querySelector('.pv-ytbtn'); y.style.display = ''; const a = y.getBoundingClientRect(), b = document.querySelector('.pv-top [data-a="close"]').getBoundingClientRect(); return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) < 12; }));
  const cdp = await ctx.newCDPSession(page);
  const tch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i + 1, radiusX: 22, radiusY: 22 })) });
  const sb = await page.evaluate(() => { const r = document.querySelector('.pv-stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.click('.pv-tool[data-tool="pen"]'); await sleep(200);
  const cnt = () => page.evaluate(() => YNPractice.current().P.anno().count());
  const m0 = await cnt();
  await tch('touchStart', [[sb.x + sb.w * 0.3, sb.y + sb.h * 0.45]]);
  for (let i = 1; i <= 8; i++) { await tch('touchMove', [[sb.x + sb.w * (0.3 + i * 0.04), sb.y + sb.h * (0.45 + (i % 2) * 0.02)]]); await sleep(16); }
  await tch('touchEnd', []); await sleep(400);
  check('세로에서 손가락으로 펜 필기가 됨 (반지름 22px 손가락)', (await cnt()) === m0 + 1, { m0, m1: await cnt() });
  // 쓸어 넘기기 — 끄는 동안 쪽이 따라옴
  await page.click('.pv-tool[data-tool="none"]'); await sleep(200);
  const pg0 = await page.evaluate(() => document.querySelector('.pv-pg').textContent);
  await tch('touchStart', [[sb.x + sb.w * 0.8, sb.y + sb.h * 0.5]]);
  for (let i = 1; i <= 6; i++) { await tch('touchMove', [[sb.x + sb.w * (0.8 - i * 0.07), sb.y + sb.h * 0.5]]); await sleep(20); }
  const follow = await page.evaluate(() => document.querySelector('.pv-pagebox').style.transform);
  check('쓸어 넘기는 동안 악보가 손가락을 따라 움직임', /translateX\(-\d+px\)/.test(follow), follow);
  await tch('touchEnd', []); await sleep(700);
  const pg1 = await page.evaluate(() => document.querySelector('.pv-pg').textContent);
  check('놓으면 다음 쪽으로 넘어감 · 제자리로 돌아옴', pg1 !== pg0 && await page.evaluate(() => !document.querySelector('.pv-pagebox').style.transform), { pg0, pg1 });
  // 두 손가락 확대
  const zoomOf = () => page.evaluate(() => { const r = document.querySelector('.pv-pagebox').getBoundingClientRect(); return Math.round(r.width); });
  const w0 = await zoomOf(); const cx = sb.x + sb.w / 2, cy = sb.y + sb.h / 2;
  await tch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let i = 1; i <= 6; i++) { await tch('touchMove', [[cx - 40 - i * 25, cy], [cx + 40 + i * 25, cy]]); await sleep(20); }
  await tch('touchEnd', []); await sleep(1200);
  const w1 = await zoomOf();
  check('두 손가락으로 벌리면 확대됨', w1 > w0 * 1.3, { w0, w1 });
  const dtap = async () => { for (let k = 0; k < 2; k++) { await tch('touchStart', [[cx, cy]]); await tch('touchEnd', []); await sleep(90); } await sleep(1200); };
  await dtap();
  const w2 = await zoomOf();
  check('두 번 톡 → 한 쪽 맞춤으로 (사진 앱처럼)', Math.abs(w2 - w0) < 12, { w0, w2 });
  await tch('touchStart', [[cx - 200, cy], [cx + 200, cy]]);
  for (let i = 1; i <= 6; i++) { await tch('touchMove', [[cx - 200 + i * 28, cy], [cx + 200 - i * 28, cy]]); await sleep(20); }
  const mid = await page.evaluate(() => document.querySelector('.pv-pagebox').style.transform);
  await tch('touchEnd', []); await sleep(1200);
  const w3 = await zoomOf();
  check('오므리는 동안 작아졌다가, 놓으면 한 쪽 맞춤으로 돌아옴', /scale\(0\./.test(mid) && Math.abs(w3 - w0) < 12, { mid, w0, w3 });
  await dtap();
  const w4 = await zoomOf();
  check('두 번 톡 → 2배 확대', w4 > w0 * 1.8, { w0, w4 });
  await dtap();
  // 송폼 창 크기 조절
  const fr0 = await rect(page, '.pv-form'), rz = await rect(page, '.pv-form .pv-rsz');
  check('송폼 창에 크기 조절 모서리', !!rz, rz);
  await page.mouse.move(rz.x + rz.w / 2, rz.y + rz.h / 2); await page.mouse.down(); await page.mouse.move(rz.x + rz.w / 2 - 0, rz.y + 60, { steps: 5 }); await page.mouse.move(rz.x - 200 + 300, rz.y + 60, { steps: 5 }); await page.mouse.up(); await sleep(200);
  const fr1 = await rect(page, '.pv-form'); const sz = await page.evaluate(() => JSON.parse(localStorage.getItem('yn.pv.size.form') || 'null'));
  check('끌면 송폼 창 폭 · 글자 크기가 바뀌고 기억됨', sz && sz.w > 0 && sz.s > 1 && Math.abs(fr1.w - fr0.w) > 20, { fr0, fr1, sz });
  // 메트로놈 동그라미
  check('송폼 창에 메트로놈 동그라미 (BPM 72)', await page.evaluate(() => { const m = document.querySelector('.pv-form .pv-mc'); return !!m && /72/.test(m.textContent); }));
  await page.click('.pv-form .pv-mc'); await sleep(700);
  check('동그라미를 누르면 메트로놈 시작 (■ · 박마다 반짝)', await page.evaluate(() => document.querySelector('.pv-form .pv-mc').classList.contains('on')));
  await page.click('.pv-form .pv-mc'); await sleep(200);
  check('다시 누르면 멈춤', await page.evaluate(() => !document.querySelector('.pv-form .pv-mc').classList.contains('on')));
  await page.screenshot({ path: SHOT + '/v61-ipad-portrait.png' });
  check('G 오류 없음', errs.length === 0, errs);
  await ctx.close();

  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
