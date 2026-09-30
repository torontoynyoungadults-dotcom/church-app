/**
 * Hub v5 화면 시험 ② 포털 · 사역팀 (진짜 크롬 + 진짜 server.js + 가짜 구글)
 *   NODE_PATH=$(npm root -g) PORT=4192 node scripts/browser/e2e-hub5b.js
 *  · 사역팀: 보고서 탭의 팀원 정보 목록 없음 · 팀원 관리에서 이름을 누르면 카드 펼침/접힘 · 출석 표시 · 긴 이메일이 잘리지 않음
 *  · 다른 분 화면 보기: 교인 · 새가족 모두 그분이 로그인했을 때와 화소 하나까지 같은지 (떠 있는 안내 띠만 빼고) · 누르기는 막힘
 *  · 새가족 알림: 치우면 다시 열어도 안 뜸
 *  · 설교 요약: 서버를 멈추지 않는 비동기 호출 (AI 를 기다리는 동안 다른 요청이 처리됨)
 *  · 밝은 화면: 포털 · 사역팀
 */
process.env.PORT = process.env.PORT || '4192';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:' + process.env.PORT;
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const SHOT = process.env.SHOT_DIR || '/tmp';
const LONG_MAIL = 'jeongilban.very.long.email.address.for.testing@youngnak-toronto-young-adults.example.com';

(async () => {
  await sleep(1200);
  const 커 = run((api) => api.포털토큰_('김커미티', '4165551000', ''));
  const 정 = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  // 정일반 — 긴 이메일 · 찬양1팀 팀원
  run((api) => { const sh = api.sheet_('교적'); const v = sh.getDataRange().getValues(); for (let i = 1; i < v.length; i++) if (v[i][0] === '정일반') sh.getRange(i + 1, 4).setValue(LONG_MAIL); api.캐시비움_(); });
  run((api) => api.addTeamMember(커, '찬양1팀', '정일반', '베이스'));
  run((api) => api.addTeamMember(커, '찬양1팀', '최셀장', ''));
  // 새가족 — 이메일로 로그인하는 분 (화면 보기 1:1 비교용) + 오늘 등록한 김민솔
  const today = run((api) => api.ymd_(new Date()));
  run((api) => { const sh = api.sheet_('새가족'); const r = new Array(18).fill(''); r[0] = '이새봄'; r[1] = '여'; r[10] = today; r[11] = '진행중'; r[15] = 'saebom@example.com'; sh.appendRow(r);
    const k = new Array(18).fill(''); k[0] = '김민솔'; k[1] = '여'; k[10] = today; k[11] = '진행중'; sh.appendRow(k); api.캐시비움_(); });
  const nfTok = run((api) => api.새가족토큰_('saebom@example.com'));

  const br = await L.launch();
  const mk = async (vp, tok, extra) => {
    const ctx = await br.newContext(Object.assign({ viewport: vp || { width: 390, height: 900 }, timezoneId: 'America/Toronto', locale: 'ko-KR', deviceScaleFactor: 1 }, extra || {}));
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g|Failed to fetch/.test(m.text())) errs.push('console: ' + m.text()); });
    if (tok) await page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, tok);
    return { ctx, page, errs };
  };
  const ready = (page) => L.waitTrue(page, () => document.getElementById('main').style.display === 'block' && !!document.querySelector('#menus .tile'), null, 10000);
  /** 두 화면 사진을 화소 단위로 비교 (브라우저 canvas 로) — 다른 화소 수 */
  async function pixDiff(page, a, b) {
    return page.evaluate(async ([x, y]) => {
      const load = (s) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
      const [A, B] = await Promise.all([load(x), load(y)]);
      if (A.width !== B.width || A.height !== B.height) return { size: [A.width, A.height, B.width, B.height], diff: -1 };
      const c = (im) => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const d1 = c(A), d2 = c(B); let n = 0, first = null;
      for (let i = 0; i < d1.length; i += 4) if (Math.abs(d1[i] - d2[i]) > 2 || Math.abs(d1[i + 1] - d2[i + 1]) > 2 || Math.abs(d1[i + 2] - d2[i + 2]) > 2) { n++; if (!first) first = { x: (i / 4) % A.width, y: Math.floor(i / 4 / A.width) }; }
      return { diff: n, total: d1.length / 4, first, size: [A.width, A.height] };
    }, [a.toString('base64'), b.toString('base64')]);
  }
  const settle = async (page) => { await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); const f = document.getElementById('asFloat'); if (f) f.style.visibility = 'hidden'; const t = document.getElementById('asToast'); if (t) t.style.display = 'none'; }); await sleep(900); };
  const freeze = { animations: 'disabled', caret: 'hide' };

  /* ================= 사역팀 ================= */
  console.log('· 사역팀 — 팀 보고서 · 팀원 관리 카드');
  let { ctx, page, errs } = await mk({ width: 390, height: 900 }, 커);
  await page.goto(BASE + '/?page=team&t=' + encodeURIComponent(커));
  check('사역팀 화면이 열림', await L.waitTrue(page, () => document.getElementById('app').style.display === 'block', null, 10000));
  await page.evaluate(() => { const s = document.getElementById('teamSelect'); if (s && s.options.length) { const i = Array.from(s.options).findIndex((o) => /찬양1팀/.test(o.textContent)); if (i >= 0) { s.selectedIndex = i; onTeamChange(); } } });
  check('팀 보고서 탭: 아래 "팀원 정보" 목록(보기 버튼 · 목록)이 없음', await page.evaluate(() => !document.getElementById('dirToggle') && !document.getElementById('dirPanel') && !document.getElementById('dirList') && !/팀원 정보 보기/.test(document.getElementById('paneRep').textContent)));
  check('팀 보고서의 "팀원 상태" 칸은 그대로', await page.evaluate(() => !!document.getElementById('memberStates') && /정일반/.test(document.getElementById('memberStates').textContent)));
  await page.click('#tabMem');
  check('팀원 관리: 팀원 줄이 보이고 아래 따로 된 "팀원 정보" 목록은 없음', await L.waitTrue(page, () => document.querySelectorAll('#memManage .mmrow').length >= 2 && !document.getElementById('dirList2'), null, 5000));
  const row = await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#memManage .mmrow')).find((x) => /정일반/.test(x.textContent)); const h = r.querySelector('.mmhead'); return { tag: h.tagName, exp: h.getAttribute('aria-expanded'), hidden: r.querySelector('.mmbody').hidden }; });
  check('처음에는 접혀 있음 (이름 줄은 누를 수 있는 단추 · aria-expanded=false)', row.tag === 'BUTTON' && row.exp === 'false' && row.hidden, row);
  await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#memManage .mmrow')).find((x) => /정일반/.test(x.textContent)); r.querySelector('.mmhead').scrollIntoView({ block: 'center' }); });
  await page.locator('#memManage .mmrow', { hasText: '정일반' }).locator('.mmhead').click();
  check('이름을 누르면 자세한 정보 카드가 펼쳐짐', await L.waitTrue(page, () => { const r = Array.from(document.querySelectorAll('#memManage .mmrow')).find((x) => /정일반/.test(x.textContent)); return r.classList.contains('open') && !r.querySelector('.mmbody').hidden && r.querySelector('.mmhead').getAttribute('aria-expanded') === 'true' && /이메일/.test(r.querySelector('.mmdet').textContent) && /전화번호/.test(r.querySelector('.mmdet').textContent); }, null, 5000));
  const mail = await page.evaluate((m) => { const r = Array.from(document.querySelectorAll('#memManage .mmrow')).find((x) => /정일반/.test(x.textContent)); const f = Array.from(r.querySelectorAll('.field')).find((x) => /이메일/.test(x.textContent)); const v = f.querySelector('.fv'); const pr = r.getBoundingClientRect(), vr = v.getBoundingClientRect(); return { text: v.textContent, sw: v.scrollWidth, cw: v.clientWidth, inside: vr.right <= pr.right + 1, fields: r.querySelectorAll('.field').length, dup: Array.from(r.querySelectorAll('.fk')).filter((k) => k.textContent === '소속 셀').length, page: document.scrollingElement.scrollWidth - innerWidth }; }, LONG_MAIL);
  check('긴 이메일이 잘리지 않고 줄바꿈되어 카드 안에 다 보임', mail.text === LONG_MAIL && mail.sw <= mail.cw + 1 && mail.inside && mail.page <= 0, mail);
  check('"소속 셀" 칸이 두 번 나오지 않음 (예전 중복)', mail.dup === 1, mail);
  await page.screenshot({ path: SHOT + '/hub5-team-open.png', fullPage: true });
  await page.locator('#memManage .mmrow', { hasText: '정일반' }).locator('.mmhead').click();
  check('다시 누르면 접힘', await L.waitTrue(page, () => { const r = Array.from(document.querySelectorAll('#memManage .mmrow')).find((x) => /정일반/.test(x.textContent)); return !r.classList.contains('open') && r.querySelector('.mmbody').hidden; }, null, 3000));
  const lbl = await page.evaluate(() => [attLabel({ rate: 100, present: 3, totalMeetings: 3 }), attLabel({ rate: 67, present: 2, totalMeetings: 3 }), attLabel({ rate: null })]);
  check('출석 표시가 "셀 출석 100% (3/3회)" 처럼 무엇인지 알 수 있게', lbl[0] === '셀 출석 100% (3/3회)' && lbl[1] === '셀 출석 67% (2/3회)' && lbl[2] === '', lbl);
  check('사역팀 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 다른 분 화면 보기 — 교인 1:1 ================= */
  console.log('· 다른 분 화면 보기 — 교인 (화소 비교)');
  const VP = { width: 390, height: 1400 };
  ({ ctx, page, errs } = await mk(VP, 정));
  await page.goto(BASE + '/?page=portal'); check('정일반 본인 로그인', await ready(page));
  await settle(page);
  const realShot = await page.screenshot(freeze);
  const realTodos = await page.evaluate(() => TODOS.map((t) => t.id));
  const e1 = errs.slice(); await ctx.close();
  ({ ctx, page, errs } = await mk(VP, 커));
  await page.goto(BASE + '/?page=portal'); await ready(page);
  await page.click('.astog'); await page.fill('#asName', '정일반'); await page.keyboard.press('Enter');
  check('정일반님 화면으로 바뀜 · 떠 있는 안내 띠', await L.waitTrue(page, () => /정일반/.test(document.getElementById('helloName').textContent) && !!document.getElementById('asFloat') && /보는 화면/.test(document.getElementById('asFloat').textContent), null, 6000));
  check('화면 흐름 안에는 안내 상자가 없음 (내용이 밀리지 않음)', await page.evaluate(() => document.getElementById('asBox').innerHTML === '' && getComputedStyle(document.getElementById('asFloat')).position === 'fixed'));
  check('알림 목록도 그분 것과 같음', JSON.stringify(await page.evaluate(() => TODOS.map((t) => t.id))) === JSON.stringify(realTodos));
  await settle(page);
  const viewShot = await page.screenshot(freeze);
  const d1 = await pixDiff(page, realShot, viewShot);
  check('그분이 로그인했을 때와 화소 단위로 같음 (안내 띠만 빼고)', d1.diff === 0, d1);
  if (d1.diff) { require('fs').writeFileSync(SHOT + '/hub5-real.png', realShot); require('fs').writeFileSync(SHOT + '/hub5-view.png', viewShot); }
  // 누르기 막기 — 모양은 같지만 바뀌지 않음
  await page.evaluate(() => { const f = document.getElementById('asFloat'); if (f) f.style.visibility = ''; });
  await page.click('#meBtn');
  const prof = await page.evaluate(() => { const p = document.getElementById('profile'); return { inert: p.hasAttribute('inert'), name: /정일반/.test(p.textContent), note: /보기 전용입니다/.test(p.textContent) }; });
  check('그분의 "내 정보" — 누르기만 막힘(inert), 화면 모양은 그대로(안내 문구를 끼워 넣지 않음)', prof.inert && prof.name && !prof.note, prof);
  await page.click('.pvback');
  const hasTodoX = await page.evaluate(() => !!document.querySelector('#todoBox .tix'));
  if (hasTodoX) {
    const before = await page.evaluate(() => TODOS.length);
    await page.evaluate(() => { const h = document.querySelector('#todoBox .todoacc-h'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });
    await page.locator('#todoBox .tix').first().click();
    await sleep(300);
    check('알림 "치우기"를 눌러도 그분 알림은 그대로 + "보기 전용" 안내', (await page.evaluate(() => TODOS.length)) === before && await page.evaluate(() => /보기 전용/.test((document.getElementById('asToast') || {}).textContent || '')));
  }
  await page.click('#asFloat .btn');
  check('"내 화면으로" → 내 포털 · 안내 띠 사라짐', await L.waitTrue(page, () => /김커미티/.test(document.getElementById('helloName').textContent) && !document.getElementById('asFloat'), null, 5000));
  check('교인 화면 보기 오류 없음', errs.length === 0 && e1.length === 0, errs.concat(e1));
  await ctx.close();

  /* ================= 다른 분 화면 보기 — 새가족 1:1 ================= */
  console.log('· 다른 분 화면 보기 — 새가족 (화소 비교)');
  ({ ctx, page, errs } = await mk(VP, nfTok));
  await page.goto(BASE + '/?page=portal');
  check('새가족 이새봄 본인 로그인 — 새가족 첫 화면', await L.waitTrue(page, () => { const h = document.querySelector('#nfHome .nfhome .hi'); return !!h && /이새봄/.test(h.textContent); }, null, 10000));
  await settle(page);
  const nfReal = await page.screenshot(freeze);
  await ctx.close();
  ({ ctx, page, errs } = await mk(VP, 커));
  await page.goto(BASE + '/?page=portal'); await ready(page);
  await page.click('.astog'); await page.click('#asKn'); await page.fill('#asName', '이새봄'); await page.keyboard.press('Enter');
  check('새가족 화면 보기가 열림', await L.waitTrue(page, () => { const h = document.querySelector('#nfHome .nfhome .hi'); return !!h && /이새봄/.test(h.textContent) && !!document.getElementById('asFloat'); }, null, 6000));
  await settle(page);
  const nfView = await page.screenshot(freeze);
  const d2 = await pixDiff(page, nfReal, nfView);
  check('새가족이 로그인했을 때와 화소 단위로 같음 (위 버튼줄 · 로그아웃 줄까지)', d2.diff === 0, d2);
  if (d2.diff) { require('fs').writeFileSync(SHOT + '/hub5-nf-real.png', nfReal); require('fs').writeFileSync(SHOT + '/hub5-nf-view.png', nfView); }
  await page.evaluate(() => { const f = document.getElementById('asFloat'); if (f) f.style.visibility = ''; });
  const eb = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#nfHome button')).find((x) => /등록 정보 고치기/.test(x.textContent)); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (eb) await page.mouse.click(eb.x, eb.y);
  await sleep(300);
  check('"내 등록 정보 고치기"를 눌러도 열리지 않음 (보기 전용 안내)', !!eb && await page.evaluate(() => !document.getElementById('nfForm') || getComputedStyle(document.getElementById('nfForm')).display === 'none') && await page.evaluate(() => /보기 전용/.test((document.getElementById('asToast') || {}).textContent || '')));
  const lo = await page.evaluate(() => { const a = Array.from(document.querySelectorAll('#nfHome a')).find((x) => /로그아웃/.test(x.textContent)); if (!a) return null; a.click(); return true; });
  check('로그아웃 줄도 보이지만 눌러도 내 로그인은 그대로', lo && await page.evaluate(() => !!(sessionStorage.getItem('ynPortalToken') || '')));
  await page.click('#asFloat .btn');
  check('"내 화면으로" → 내 포털', await L.waitTrue(page, () => getComputedStyle(document.getElementById('main')).display === 'block' && /김커미티/.test(document.getElementById('helloName').textContent), null, 5000));
  check('새가족 화면 보기 오류 없음', errs.length === 0, errs);

  /* ================= 새가족 알림 — 치우면 다시 안 뜸 ================= */
  console.log('· 새가족 알림 (김민솔)');
  const nfIds = () => page.evaluate(() => TODOS.filter((t) => /^nf-new-/.test(t.id)).map((t) => t.id + '|' + t.sub));
  let ids = await nfIds();
  check('커미티 알림에 "새로 등록한 새가족" (김민솔 · 이새봄)', ids.length === 1 && /김민솔/.test(ids[0]) && /이새봄/.test(ids[0]), ids);
  await page.evaluate(() => { const h = document.querySelector('#todoBox .todoacc-h'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });
  await page.evaluate(() => { const it = Array.from(document.querySelectorAll('#todoBox .ti')).find((x) => /새로 등록한 새가족/.test(x.textContent)); it.querySelector('.tix').click(); });
  await sleep(800);
  check('치우면 바로 사라짐', (await nfIds()).length === 0);
  await page.reload(); await ready(page); await sleep(300);
  check('다시 열어도(저장해 둔 첫 화면 → 서버 새로 받기) 다시 뜨지 않음', (await nfIds()).length === 0, await nfIds());
  const srv = run((api) => api.myTodos(커)).list.filter((x) => /^nf-new-/.test(x.id));
  check('서버에서도 그 두 분은 "확인함"', srv.length === 0, srv);
  await ctx.close();

  /* ================= 설교 요약 — 서버를 멈추지 않음 ================= */
  console.log('· 설교 요약 — 비동기 (영상으로)');
  const rf = global.fetch; let aiBody = null;
  global.fetch = async (url, opt) => {
    if (/generativelanguage\.googleapis\.com/.test(String(url)) && /fileData/.test(String(opt && opt.body))) {
      aiBody = JSON.parse(opt.body); await sleep(1500);
      const t = JSON.stringify({ title: '부르시는 주님', preacher: '강산 목사', passage: '누가복음 5:1-11', points: ['하나', '둘', '셋'], messages: ['가', '나', '다'], apply: ['a', 'b'], short3: ['1', '2', '3'] });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return rf(url, opt);
  };
  const post = (fn, args) => rf(BASE + '/api/' + fn, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json());
  const t0 = Date.now();
  const pMake = post('sermonMake', [커, 'CCCCCCCCCCC', '']);
  await sleep(200);
  const t1 = Date.now(); const other = await post('myTodos', [정]); const quick = Date.now() - t1;
  const made = await pMake; global.fetch = rf;
  check('AI 가 영상을 보는 동안에도 다른 요청은 곧바로 처리됨', other.ok && quick < 1200 && Date.now() - t0 >= 1500, { quick, total: Date.now() - t0 });
  check('자막이 없는 영상은 유튜브 주소를 AI 에게 넘겨 요약 · 저장', made.ok && /영상/.test(made.result.source) && aiBody && aiBody.contents[0].parts[0].fileData.fileUri === 'https://www.youtube.com/watch?v=CCCCCCCCCCC' && aiBody.generationConfig.mediaResolution === 'MEDIA_RESOLUTION_LOW', made);
  const bad = await post('sermonMake', [정, 'CCCCCCCCCCC', '']);
  check('커미티가 아니면 거절', !bad.ok && /커미티/.test(bad.error), bad);

  /* ================= 밝은 화면 — 포털 · 사역팀 ================= */
  console.log('· 밝은 화면 — 포털 · 사역팀');
  ({ ctx, page, errs } = await mk({ width: 390, height: 900 }, 커));
  await page.addInitScript(() => { try { localStorage.setItem('ynTheme', 'light'); } catch (e) {} });
  await page.goto(BASE + '/?page=portal'); await ready(page); await sleep(1500);
  const lp = await page.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const white = Array.from(document.querySelectorAll('#main .tile .tt, #main #helloName, #main .panel .chip')).filter((e) => e.offsetParent && lum(parse(getComputedStyle(e).color)) > 0.7).map((e) => e.textContent.slice(0, 12));
    return { theme: document.documentElement.getAttribute('data-theme'), btn: !!document.querySelector('header .yntheme'), white };
  });
  check('포털도 밝은 화면 · 전환 단추가 있음 · 흰 글씨가 남지 않음', lp.theme === 'light' && lp.btn && lp.white.length === 0, lp);
  await page.screenshot({ path: SHOT + '/hub5-portal-light.png', fullPage: true });
  await page.goto(BASE + '/?page=team&sub=members&t=' + encodeURIComponent(커));
  await L.waitTrue(page, () => document.getElementById('paneMem') && getComputedStyle(document.getElementById('paneMem')).display === 'block', null, 8000);
  await page.evaluate(() => { const s = document.getElementById('teamSelect'); if (s && s.options.length) { const i = Array.from(s.options).findIndex((o) => /찬양1팀/.test(o.textContent)); if (i >= 0) { s.selectedIndex = i; onTeamChange(); drawMemManage(); } } });
  await L.waitTrue(page, () => document.querySelectorAll('#memManage .mmrow').length >= 2, null, 5000);
  await page.locator('#memManage .mmrow', { hasText: '정일반' }).locator('.mmhead').click(); await sleep(1200);
  const tlight = await page.evaluate(() => { const b = document.querySelector('#memManage .mmrow.open .mmn b'); const c = getComputedStyle(b).color.match(/\d+/g).map(Number); return c; });
  check('사역팀 카드도 밝은 화면에서 진한 이름 글씨', tlight[0] < 90, tlight);
  await page.screenshot({ path: SHOT + '/hub5-team-light.png', fullPage: true });
  check('밝은 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();
  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
