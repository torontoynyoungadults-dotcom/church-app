/**
 * Step 6 화면 시험 — 진짜 server.js + 가짜 구글 + 진짜 크롬
 *   node scripts/browser/e2e-step6.js
 *  P. 신청자 화면(포털): 진한 유리 카드의 테두리 대비 · 고르면 주황 · "기타" 입력칸 · 별점/표정/숫자 · 서식 안내글 · 보내기 전 검사
 *  A. 관리자 화면(신청서 관리): 굵게/주황 강조 편집기 · 유형 바꾸기(내용 유지) · 기타 켜기 · 별점 설정 · 미리보기 · 저장 · 결과
 *  S. 성능: 문항 60개 그리기
 */
process.env.PORT = '4197';
const path = require('path'), fs = require('fs');
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:4197';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const SHOT = process.env.SHOT_DIR || path.join(__dirname, '..', '..', 'tmp-shots');
try { fs.mkdirSync(SHOT, { recursive: true }); } catch (e) { /* 사진 저장은 선택 */ }
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(SHOT, name + '.png'), fullPage: true }); } catch (e) { /* ignore */ } };

/** 화면에 그려진 색으로 명암비를 잽니다 (겹친 투명도까지 합성) */
const AUDIT_FN = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 1]; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (t, b) => { const a = t[3]; return [t[0] * a + b[0] * (1 - a), t[1] * a + b[1] * (1 - a), t[2] * a + b[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const backdrop = (node) => { const chain = []; for (let n = node; n; n = n.parentElement) chain.push(getComputedStyle(n).backgroundColor); let base = [255, 255, 255, 1]; for (let i = chain.length - 1; i >= 0; i--) { const c = parse(chain[i]); if (c[3] > 0) base = over(c, base); } return base; };
  const r1 = (x) => Math.round(x * 10) / 10;
  const out = { opts: [], marks: [], texts: [] };
  document.querySelectorAll('#fmWrap .fx-opt:not(.on), #fmWrap .fx-r:not(.on)').forEach((n) => {
    const cs = getComputedStyle(n), r = n.getBoundingClientRect(); if (!r.width) return;
    const outside = backdrop(n.parentElement);                 // 카드 바깥(밝은 패널)
    const card = over(parse(cs.backgroundColor), outside);     // 카드 바탕
    const border = over(parse(cs.borderTopColor), outside);
    out.opts.push(r1(ratio(border, outside)));                 // 카드 테두리 ↔ 패널
    const mk = n.querySelector('.fx-mark');
    if (mk) { const mc = getComputedStyle(mk); out.marks.push(r1(ratio(over(parse(mc.borderTopColor), card), card))); }   // 동그라미 · 네모 테두리 ↔ 카드
    const tx = n.querySelector('.fx-txt') || n.querySelector('.fx-rg');
    if (tx) out.texts.push(r1(ratio(over(parse(getComputedStyle(tx).color), card), card)));
  });
  const mn = (a) => a.length ? Math.min.apply(null, a) : null;
  return { optBorder: mn(out.opts), markBorder: mn(out.marks), text: mn(out.texts), n: out.opts.length };
};

(async () => {
  await sleep(1200);
  const tok = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const tokB = run((api) => api.포털토큰_('최셀장', '4165551006', ''));
  const br = await L.launch();
  const mk = async (vp, init) => {
    const ctx = await br.newContext({ viewport: vp, timezoneId: 'America/Toronto', locale: 'ko-KR', acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [], api = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    page.on('request', (r) => { const m = /\/api\/(\w+)/.exec(r.url()); if (m) api.push(m[1]); });
    if (init) await page.addInitScript(init.fn, init.arg);
    return { ctx, page, errs, api };
  };

  /* ------------------------------------------------ 시험용 신청서 */
  const Q = [
    { id: 'qc', type: 'choice', label: '티셔츠 사이즈', help: '평소 입는 것으로', req: true, opts: ['S', 'M', 'L'], other: true, otherLabel: '기타 사이즈' },
    { id: 'qk', type: 'checks', label: '가져올 것', opts: ['성경', '필기구', '우산'], other: true, max: 3 },
    { id: 'qs', type: 'rating', label: '별점', req: true, scale: 5, variant: 'star', lowLabel: '별로', highLabel: '최고' },
    { id: 'qf', type: 'rating', label: '만족도', scale: 5, variant: 'face', lowLabel: '매우 불만족', highLabel: '매우 만족' },
    { id: 'qn', type: 'rating', label: '추천 점수', scale: 10, variant: 'number' },
    { id: 'qt', type: 'text', label: '한 줄 의견' },
    { id: 'qx', type: 'section', label: '안내', help: '읽어 주세요', helpHtml: '<b>꼭</b> 읽어 주세요<br><mark class="hl">마감 임박</mark>' },
  ];
  const fid = run((api) => api.formSave('ADM', {
    title: 'Step6 시험 신청서', status: '받는중', target: '모두', notify: false, mail: false, editable: true,
    desc: '수련회 안내\n날짜 확인', descHtml: '<b>수련회 안내</b><br>날짜 <mark class="hl">확인</mark>', questions: Q })).id;

  /* ============================================================ P. 신청자 화면 */
  console.log('· P. 신청자 화면 (휴대폰 폭)');
  const P = await mk({ width: 390, height: 900 }, { fn: (t) => { try { if (!sessionStorage.getItem('ynPortalToken')) sessionStorage.setItem('ynPortalToken', t); } catch (e) { /* ignore */ } }, arg: tok });
  const pg = P.page;
  await pg.goto(BASE + '/?page=portal');
  check('포털이 열림', await L.waitTrue(pg, () => document.getElementById('main').style.display === 'block', null, 9000));
  await pg.evaluate((id) => openFormPage(id), fid);
  check('신청서 화면이 그려짐', await L.waitTrue(pg, () => document.querySelectorAll('#fmWrap .fx-mount .fx-opt').length > 0, null, 6000));
  check('고르기 · 여러 개 · 별점 3개 = 문항 5개가 부품으로 그려짐', await pg.evaluate(() => document.querySelectorAll('#fmWrap .fx-mount').length) === 5);
  check('진짜 라디오 · 체크 상자가 있음 (키보드 · 스크린리더)',
    await pg.evaluate(() => document.querySelectorAll('#fmWrap input[type=radio]').length > 0 && document.querySelectorAll('#fmWrap input[type=checkbox]').length > 0));
  check('라디오 묶음에 role=radiogroup + 이름표', await pg.evaluate(() => { const g = document.querySelector('#fmWrap .fx-group[role=radiogroup]'); return !!g && !!document.getElementById(g.getAttribute('aria-labelledby')); }));

  console.log('  - 안내글 서식');
  const d = await pg.evaluate(() => { const b = document.querySelector('#fmWrap .fmdesc b'), m = document.querySelector('#fmWrap .fmdesc mark.hl'); return { b: b && b.textContent, bw: b && getComputedStyle(b).fontWeight, m: m && m.textContent, mbg: m && getComputedStyle(m).backgroundColor, txt: document.querySelector('#fmWrap .fmdesc').innerText }; });
  check('굵게 (<b>)', d.b === '수련회 안내' && Number(d.bw) >= 700, d);
  check('주황 강조 (mark.hl)', d.m === '확인' && d.mbg !== 'rgba(0, 0, 0, 0)', d);
  check('줄바꿈 유지', /수련회 안내\s*\n\s*날짜 확인/.test(d.txt), d.txt);
  check('안내 문구(section)도 서식으로', await pg.evaluate(() => !!document.querySelector('#fmWrap .fmsec .fx-rich b') && !!document.querySelector('#fmWrap .fmsec mark.hl')));
  const xss = await pg.evaluate(() => { window.__x = 0; const h = FormsCore.safeHtml('<img src=x onerror="window.__x=1"><b onclick="window.__x=2" style="x">a</b><script>window.__x=3<\/script><a href="javascript:1">l</a><mark class="hl evil" onmouseover=1>m</mark>'); const t = document.createElement('div'); t.innerHTML = h; return { h, x: window.__x, bad: t.querySelectorAll('img,script,a,[onclick],[onmouseover],[style]').length }; });
  check('클라이언트 정리기: 위험한 태그 · 속성이 모두 사라짐', xss.x === 0 && xss.bad === 0 && /^<b>a<\/b>l<mark class="hl">m<\/mark>$/.test(xss.h), xss);

  console.log('  - 고르지 않은 칸의 경계 대비 (예전: 약 1.1 : 1)');
  const c0 = await pg.evaluate(AUDIT_FN);
  check('고르지 않은 카드 테두리 ↔ 패널 ≥ 3 : 1', c0.optBorder >= 3, c0);
  check('동그라미 · 네모 테두리 ↔ 카드 ≥ 3 : 1', c0.markBorder >= 3, c0);
  check('선택지 글씨 ↔ 카드 ≥ 4.5 : 1', c0.text >= 4.5, c0);
  await shot(pg, 'p1-portal-unselected');

  console.log('  - 고르기');
  const optM = pg.locator('#fmWrap .fx-mount[data-q="qc"] .fx-opt', { hasText: /^M$/ });
  await optM.click();
  let st = await pg.evaluate(() => ({ ans: FM_ANS.qc, on: document.querySelector('#fmWrap .fx-mount[data-q="qc"] .fx-opt.on .fx-txt').textContent, chk: document.querySelector('#fmWrap .fx-mount[data-q="qc"] input:checked').value }));
  check('M 를 누르면 고른 값이 M', st.ans === 'M' && st.on === 'M' && st.chk === 'M', st);
  await sleep(400);   // 색이 바뀌는 애니메이션(.14초)이 끝난 뒤에 읽습니다
  const sel = await pg.evaluate(() => { const o = document.querySelector('#fmWrap .fx-mount[data-q="qc"] .fx-opt.on'), m = o.querySelector('.fx-mark'); return { border: getComputedStyle(o).borderTopColor, mark: getComputedStyle(m).backgroundColor }; });
  check('고른 칸은 주황 #FF6B00 (테두리 · 표시)', sel.border === 'rgb(255, 107, 0)' && sel.mark === 'rgb(255, 107, 0)', sel);
  await optM.click();
  check('다시 누르면 해제 (예전 동작 유지)', await L.waitTrue(pg, () => FM_ANS.qc === '' && !document.querySelector('#fmWrap .fx-mount[data-q="qc"] input:checked'), null, 1500));
  await pg.locator('#fmWrap .fx-mount[data-q="qc"] .fx-opt', { hasText: /^L$/ }).click();
  await pg.locator('#fmWrap .fx-mount[data-q="qc"] .fx-opt', { hasText: /^S$/ }).click();
  check('하나만 고를 수 있음 (S 로 바뀜)', await pg.evaluate(() => FM_ANS.qc === 'S' && document.querySelectorAll('#fmWrap .fx-mount[data-q="qc"] .fx-opt.on').length === 1));

  console.log('  - 기타 (직접 입력)');
  const otherVisible = () => pg.evaluate(() => { const o = document.querySelector('#fmWrap .fx-mount[data-q="qc"] .fx-other'); return getComputedStyle(o).display !== 'none' && o.getBoundingClientRect().height > 10; });
  check('처음에는 기타 입력칸이 숨겨져 있음', !(await otherVisible()));
  await pg.locator('#fmWrap .fx-mount[data-q="qc"] .fx-opt.is-other').click();
  check('"기타 사이즈" 를 고르면 입력칸이 나타남', await otherVisible());
  check('입력칸에 커서가 들어감 (바로 쓸 수 있게)', await pg.evaluate(() => document.activeElement && document.activeElement.classList.contains('fx-otext')));
  check('기타 칸 이름이 붙음', await pg.locator('#fmWrap .fx-mount[data-q="qc"] .fx-opt.is-other .fx-txt').innerText() === '기타 사이즈');
  check('내용을 적기 전 값은 "기타: "', await pg.evaluate(() => FM_ANS.qc === '기타: '), await pg.evaluate(() => FM_ANS.qc));
  const errBefore = P.api.filter((x) => x === 'submitForm').length;
  await pg.click('#fmSubmit');
  check('기타 내용이 비면 보내지 않고 안내 (서버 호출 없음)', await L.waitTrue(pg, () => /기타/.test(document.getElementById('fmMsg').textContent), null, 1500) && P.api.filter((x) => x === 'submitForm').length === errBefore, await pg.locator('#fmMsg').innerText());
  await pg.fill('#fmWrap .fx-mount[data-q="qc"] .fx-otext', '  XL   특대  ');
  check('적은 내용이 "기타: …" 로 답에 들어감', await pg.evaluate(() => FM_ANS.qc === '기타:   XL   특대  '.replace(/^기타:\s*/, '기타: ')) || await pg.evaluate(() => /^기타: +XL/.test(FM_ANS.qc)), await pg.evaluate(() => FM_ANS.qc));
  await pg.locator('#fmWrap .fx-mount[data-q="qc"] .fx-opt', { hasText: /^M$/ }).click();
  check('다른 것을 고르면 기타 입력칸이 닫히고 값이 M', !(await otherVisible()) && await pg.evaluate(() => FM_ANS.qc === 'M'));
  await pg.locator('#fmWrap .fx-mount[data-q="qc"] .fx-opt.is-other').click();
  check('기타를 다시 열면 적어 둔 글이 남아 있음', await pg.evaluate(() => document.querySelector('#fmWrap .fx-mount[data-q="qc"] .fx-otext').value === 'XL   특대' || document.querySelector('#fmWrap .fx-mount[data-q="qc"] .fx-otext').value.trim().length > 0));

  console.log('  - 여러 개 고르기 (체크 상자 · 키보드)');
  await pg.locator('#fmWrap .fx-mount[data-q="qk"] .fx-opt', { hasText: '성경' }).click();
  await pg.locator('#fmWrap .fx-mount[data-q="qk"] .fx-opt', { hasText: '우산' }).click();
  check('두 개 고름', await pg.evaluate(() => JSON.stringify(FM_ANS.qk) === JSON.stringify(['성경', '우산'])), await pg.evaluate(() => FM_ANS.qk));
  await pg.focus('#fmWrap .fx-mount[data-q="qk"] .fx-opt:nth-child(2) input');
  await pg.keyboard.press('Space');
  check('키보드(스페이스)로도 고를 수 있음', await pg.evaluate(() => FM_ANS.qk.indexOf('필기구') !== -1));
  check('키보드로 고를 때 눈에 띄는 포커스 표시가 있음', await pg.evaluate(() => { const i = document.querySelector('#fmWrap .fx-mount[data-q="qk"] .fx-opt:nth-child(2) input'); const m = i.parentNode.querySelector('.fx-mark'); return getComputedStyle(m).outlineStyle !== 'none' || i.matches(':focus-visible') === false; }));
  await pg.locator('#fmWrap .fx-mount[data-q="qk"] .fx-opt.is-other').click();
  check('복수 선택에도 기타 입력칸이 열림', await pg.evaluate(() => document.querySelector('#fmWrap .fx-mount[data-q="qk"] .fx-other').classList.contains('open')));
  await pg.fill('#fmWrap .fx-mount[data-q="qk"] .fx-otext', '텀블러');
  check('복수 선택의 기타 값이 배열에 들어감', await pg.evaluate(() => FM_ANS.qk.indexOf('기타: 텀블러') !== -1 && FM_ANS.qk.length === 4), await pg.evaluate(() => FM_ANS.qk));
  await pg.click('#fmSubmit');
  check('최대 3개 초과 → 보내지 않고 안내', await L.waitTrue(pg, () => /3개까지/.test(document.getElementById('fmMsg').textContent), null, 1500), await pg.locator('#fmMsg').innerText());
  await pg.locator('#fmWrap .fx-mount[data-q="qk"] .fx-opt', { hasText: '우산' }).click();

  console.log('  - 별점 · 만족도');
  await pg.click('#fmSubmit');
  check('필수 별점 비었을 때 안내', await L.waitTrue(pg, () => /별점/.test(document.getElementById('fmMsg').textContent) && /점수/.test(document.getElementById('fmMsg').textContent), null, 1500), await pg.locator('#fmMsg').innerText());
  await pg.locator('#fmWrap .fx-mount[data-q="qs"] .fx-r').nth(3).click();
  const stars = await pg.evaluate(() => ({ ans: FM_ANS.qs, on: document.querySelectorAll('#fmWrap .fx-mount[data-q="qs"] .fx-r.on').length, lab: document.querySelector('#fmWrap .fx-mount[data-q="qs"] .fx-rends').innerText }));
  check('별 4번째를 누르면 4점 · 별 4개가 켜짐', stars.ans === 4 && stars.on === 4, stars);
  check('낮은 쪽 · 높은 쪽 이름이 보임', /별로/.test(stars.lab) && /최고/.test(stars.lab), stars);
  await pg.locator('#fmWrap .fx-mount[data-q="qs"] .fx-r').nth(1).click();
  check('다른 별을 누르면 그 점수로 바뀜', await pg.evaluate(() => FM_ANS.qs === 2 && document.querySelectorAll('#fmWrap .fx-mount[data-q="qs"] .fx-r.on').length === 2));
  await pg.locator('#fmWrap .fx-mount[data-q="qf"] .fx-r').nth(4).click();
  check('표정 5단계: 마지막 표정 = 5점', await pg.evaluate(() => FM_ANS.qf === 5 && document.querySelectorAll('#fmWrap .fx-mount[data-q="qf"] .fx-r').length === 5 && document.querySelectorAll('#fmWrap .fx-mount[data-q="qf"] .fx-r.on').length === 1));
  await pg.locator('#fmWrap .fx-mount[data-q="qn"] .fx-r').nth(6).click();
  check('숫자 10단계: 7 을 누르면 7점', await pg.evaluate(() => FM_ANS.qn === 7 && document.querySelectorAll('#fmWrap .fx-mount[data-q="qn"] .fx-r').length === 10));
  const c1 = await pg.evaluate(AUDIT_FN);
  check('별점 칸 테두리 대비도 ≥ 3 : 1', c1.optBorder >= 3, c1);
  await shot(pg, 'p2-portal-selected');

  console.log('  - 보내기 · 다시 열기');
  await pg.fill('#fmWrap input[type=text]:not(.fx-otext)', '좋았어요');
  await pg.click('#fmSubmit');
  check('제출 성공 화면', await L.waitTrue(pg, () => /접수되었습니다/.test(document.getElementById('fmWrap').innerText), null, 6000), await pg.locator('#fmWrap').innerText());
  const saved = run((api) => api.formResults('ADM', fid)).rows.filter((r) => r.name === '정일반')[0];
  check('서버에 저장된 답 (기타는 "기타: …" 문자열)', saved && saved.answers.qc === '기타: XL 특대' && saved.answers.qk.indexOf('기타: 텀블러') !== -1 && saved.answers.qs === 2 && saved.answers.qf === 5 && saved.answers.qn === 7, saved && saved.answers);
  await pg.evaluate(() => afterForm());
  await pg.evaluate((id) => openFormPage(id), fid);
  check('다시 열면 저장한 답이 그대로 골라져 있음', await L.waitTrue(pg, () => !!document.querySelector('#fmWrap .fx-mount[data-q="qs"] .fx-r.on'), null, 5000) &&
    await pg.evaluate(() => FM_ANS.qc === '기타: XL 특대' && FM_ANS.qs === 2 && FM_ANS.qk.indexOf('기타: 텀블러') !== -1 &&
      document.querySelector('#fmWrap .fx-mount[data-q="qk"] .fx-otext').value === '텀블러' && document.querySelector('#fmWrap .fx-mount[data-q="qc"] .fx-otext').value === 'XL 특대' && document.querySelector('#fmWrap .fx-mount[data-q="qk"] .fx-other').classList.contains('open')));

  // 최셀장: 기타를 고른 답으로 결과 집계에 "기타" 가 묶이는지 (서버) — 화면 확인용 자료도 만듭니다
  run((api) => api.submitForm(tokB, fid, { qc: '기타: XXL', qk: ['성경'], qs: 5, qf: 3, qn: 9, qt: '' }));

  console.log('  - 성능 (문항 40개 그리기)');
  const bigQ = []; for (let i = 0; i < 40; i++) bigQ.push({ id: 'b' + i, type: i % 3 === 0 ? 'rating' : (i % 3 === 1 ? 'choice' : 'checks'), label: '문항 ' + i, opts: ['가', '나', '다', '라'], other: true, scale: 5, variant: 'star' });
  const bigId = run((api) => api.formSave('ADM', { title: '큰 신청서', status: '받는중', target: '모두', questions: bigQ })).id;
  await pg.evaluate(() => afterForm());
  await pg.evaluate((id) => openFormPage(id), bigId);
  check('40문항도 그려짐', await L.waitTrue(pg, () => document.querySelectorAll('#fmWrap .fx-mount').length === 40 && document.querySelectorAll('#fmWrap .fx-mount .fx-opt, #fmWrap .fx-mount .fx-r').length > 100, null, 8000));
  const perf = await pg.evaluate(() => { const t0 = performance.now(); paintForm(); return performance.now() - t0; });
  check('paintForm(40문항) < 400ms', perf < 400, Math.round(perf) + 'ms');
  await pg.evaluate(() => afterForm());
  check('포털 화면 페이지 오류 없음', P.errs.length === 0, P.errs);
  await P.ctx.close();

  /* ============================================================ A. 관리자 화면 */
  console.log('· A. 관리자 화면 (신청서 관리)');
  const A = await mk({ width: 1100, height: 1000 });
  const ap = A.page;
  await ap.goto(BASE + '/?page=forms&key=ADM');
  check('신청서 관리 화면이 열림', await L.waitTrue(ap, () => !!window.D && document.getElementById('root').innerText.length > 5, null, 9000));
  await ap.evaluate((id) => openForm(id), fid);
  check('신청서 고치기 화면', await L.waitTrue(ap, () => !!document.getElementById('fDescEd') && !!document.querySelector('#fDescEd .fx-ed'), null, 6000));
  check('저장된 서식이 편집기에 그대로 열림', await ap.evaluate(() => !!document.querySelector('#fDescEd .fx-ed b') && !!document.querySelector('#fDescEd .fx-ed mark')));

  console.log('  - 굵게 · 주황 강조 편집기');
  await ap.evaluate(() => DESC_ED.setText(''));
  await ap.click('#fDescEd .fx-ed');
  await ap.keyboard.type('첫째 줄 굵게할것');
  await ap.keyboard.press('Enter');
  await ap.keyboard.type('둘째 줄 강조할것');
  // "굵게할것" 선택 → 굵게
  const sel1 = async (needle) => ap.evaluate((n) => { const ed = document.querySelector('#fDescEd .fx-ed'); const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) { const i = x.nodeValue.indexOf(n); if (i >= 0) { const r = document.createRange(); r.setStart(x, i); r.setEnd(x, i + n.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } } return false; }, needle);
  check('선택 잡기(굵게)', await sel1('굵게할것'));
  await ap.click('#fDescEd .fx-bold');
  let h1 = await ap.evaluate(() => DESC_ED.getHtml());
  check('굵게 버튼 → <b>굵게할것</b>', /<b>굵게할것<\/b>/.test(h1), h1);
  check('굵게 버튼이 눌린 표시(aria-pressed) 로 바뀜', await ap.evaluate(() => document.querySelector('#fDescEd .fx-bold').getAttribute('aria-pressed')) === 'true');
  check('선택 잡기(주황)', await sel1('강조할것'));
  await ap.click('#fDescEd .fx-hl');
  h1 = await ap.evaluate(() => DESC_ED.getHtml());
  check('주황 강조 버튼 → <mark class="hl">강조할것</mark>', /<mark class="hl">강조할것<\/mark>/.test(h1), h1);
  check('두 줄이 <br> 로 나뉨', /<br>/.test(h1), h1);
  const mirror = await ap.evaluate(() => ({ v: document.getElementById('fDesc').value, d: F.desc, dh: F.descHtml }));
  check('숨은 칸(#fDesc)에 서식 뺀 글이 따라 들어감 (AI 편집 · 예전 코드 호환)', mirror.v === '첫째 줄 굵게할것\n둘째 줄 강조할것' && mirror.d === mirror.v, mirror);
  check('선택 잡기(주황 끄기)', await sel1('강조할것'));
  await ap.click('#fDescEd .fx-hl');
  check('같은 버튼을 다시 누르면 강조가 꺼짐 (토글)', !/mark/.test(await ap.evaluate(() => DESC_ED.getHtml())));
  await sel1('강조할것'); await ap.click('#fDescEd .fx-hl');
  await ap.evaluate(() => { const ed = document.querySelector('#fDescEd .fx-ed'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await ap.click('#fDescEd .fx-clr');
  check('"서식 지우기" 로 모두 일반 글이 됨 (글은 그대로)', await ap.evaluate(() => DESC_ED.getHtml() === '' && DESC_ED.getText() === '첫째 줄 굵게할것\n둘째 줄 강조할것'));
  await sel1('굵게할것'); await ap.click('#fDescEd .fx-bold'); await sel1('강조할것'); await ap.click('#fDescEd .fx-hl');
  // 붙여넣기는 글자만
  await ap.evaluate(() => { const ed = document.querySelector('#fDescEd .fx-ed'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const dt = new DataTransfer(); dt.setData('text/plain', ' 붙임'); dt.setData('text/html', '<b>HTML</b><img src=x onerror="window.__p=1">'); ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  const paste = await ap.evaluate(() => ({ h: DESC_ED.getHtml(), p: window.__p }));
  check('붙여넣기는 글자만 (HTML · 스크립트가 딸려오지 않음)', /붙임/.test(paste.h) && !/HTML|<img/.test(paste.h) && !paste.p, paste);
  await shot(ap, 'a1-admin-editor');

  console.log('  - 유형 바꾸기 (내용 유지)');
  await ap.evaluate(() => toggleQ(0));
  check('첫 문항이 열림 + 유형 버튼줄', await ap.evaluate(() => document.querySelectorAll('.fx-types button').length >= 8));
  const before = await ap.evaluate(() => JSON.stringify({ l: F.questions[0].label, o: F.questions[0].opts, other: F.questions[0].other, ol: F.questions[0].otherLabel }));
  await ap.click('.fx-types button:has-text("복수선택")');
  const t2 = await ap.evaluate(() => ({ type: F.questions[0].type, l: F.questions[0].label, o: F.questions[0].opts, on: document.querySelector('.fx-types button.on').innerText }));
  check('고르기 → 복수 선택으로 바뀜 (문항 id · 질문 · 선택지 그대로)', t2.type === 'checks' && t2.l === '티셔츠 사이즈' && JSON.stringify(t2.o) === JSON.stringify(['S', 'M', 'L']), t2);
  await ap.click('.fx-types button:has-text("별점")');
  const t3 = await ap.evaluate(() => ({ type: F.questions[0].type, o: F.questions[0].opts, sc: F.questions[0].scale, v: F.questions[0].variant, hasScale: !!document.querySelector('[id^=qsc]') }));
  check('별점으로 바꾸면 별점 설정이 나타나고 옛 선택지는 남아 있음', t3.type === 'rating' && t3.hasScale && t3.sc === 5 && JSON.stringify(t3.o) === JSON.stringify(['S', 'M', 'L']), t3);
  await ap.click('.fx-types button:has-text("객관식")');
  const t4 = await ap.evaluate(() => ({ type: F.questions[0].type, before: null, o: F.questions[0].opts, other: F.questions[0].other, ol: F.questions[0].otherLabel, l: F.questions[0].label }));
  check('원래 유형으로 돌아오면 선택지 · 기타 설정까지 그대로 복원', t4.type === 'choice' && JSON.stringify(t4.o) === JSON.stringify(['S', 'M', 'L']) && t4.other === true && t4.ol === '기타 사이즈' && t4.l === '티셔츠 사이즈', t4);
  check('신청자가 이미 있다는 경고가 보임', await ap.evaluate(() => /이미 \d+명이 신청/.test(document.querySelector('.fx-warn') ? document.querySelector('.fx-warn').innerText : '')));

  console.log('  - 기타 켜기 · 미리보기');
  check('미리보기에 "기타 사이즈" 선택지가 있음', await ap.evaluate(() => /기타 사이즈/.test(document.querySelector('.fx-preview').innerText)));
  await ap.locator('.fx-preview .fx-opt.is-other').click();
  check('미리보기에서 기타를 누르면 입력칸이 열림', await ap.evaluate(() => getComputedStyle(document.querySelector('.fx-preview .fx-other')).display !== 'none'));
  await ap.uncheck('[id^=qother]');
  check('기타 끄기 → 미리보기에서 사라짐', await L.waitTrue(ap, () => !document.querySelector('.fx-preview .fx-opt.is-other') && !document.querySelector('[id^=qotl]'), null, 2000));
  await ap.check('[id^=qother]');
  await ap.fill('[id^=qotl]', '기타 사이즈');
  check('기타 켜기 → 이름칸 · 미리보기 다시 생김', await L.waitTrue(ap, () => !!document.querySelector('.fx-preview .fx-opt.is-other'), null, 2000));
  await ap.fill('[id^=qo]:not([id^=qother]):not([id^=qotl])', 'S (수정)');
  check('선택지를 고치면 미리보기가 따라 바뀜 (입력 중 글은 유지)', await L.waitTrue(ap, () => /S \(수정\)/.test(document.querySelector('.fx-preview').innerText), null, 2000));
  await ap.fill('[id^=qo]:not([id^=qother]):not([id^=qotl])', 'S');

  console.log('  - 별점 설정');
  await ap.evaluate(() => toggleQ(2));      // 별(qs)
  await ap.selectOption('[id^=qsc]', '7');
  check('7단계로 바꾸면 미리보기 7칸 · 표정 버튼 잠김', await ap.evaluate(() => document.querySelectorAll('.fx-preview .fx-r').length === 7 && document.querySelector('.fx-seg button[disabled]') !== null));
  await ap.click('.fx-seg button:has-text("숫자")');
  check('숫자 모양', await ap.evaluate(() => document.querySelector('.fx-preview .v-number') !== null && F.questions[2].variant === 'number'));
  await ap.click('button:has-text("만족도 5단계")');
  const pr = await ap.evaluate(() => ({ q: F.questions[2], faces: document.querySelectorAll('.fx-preview .v-face .fx-r').length, ends: document.querySelector('.fx-preview .fx-rends').innerText }));
  check('"만족도 5단계" 버튼: 5단계 · 표정 · 이름 자동', pr.q.scale === 5 && pr.q.variant === 'face' && pr.faces === 5 && /매우 불만족/.test(pr.ends), pr);
  await ap.click('.fx-seg button:has-text("별")');
  await ap.fill('[id^=qlow]', '별로'); await ap.fill('[id^=qhigh]', '최고');
  await ap.selectOption('[id^=qsc]', '5');

  console.log('  - 안내 문구(section) 서식 편집기');
  await ap.evaluate(() => toggleQ(6));
  check('안내 문구 문항에 서식 편집기가 열림 (기존 서식 표시)', await ap.evaluate(() => !!document.querySelector('[id^=qhEd] .fx-ed b') && !!document.querySelector('[id^=qhEd] .fx-ed mark')));
  await ap.evaluate(() => SEC_ED.setText('새 안내'));
  check('편집 내용이 문항에 바로 반영', await ap.evaluate(() => F.questions[6].help === '새 안내'));
  await ap.evaluate(() => SEC_ED.setHtml('<b>꼭</b> 읽어 주세요<br><mark class="hl">마감 임박</mark>'));
  check('안내 문구 서식 되돌림', await ap.evaluate(() => /<b>꼭<\/b>/.test(F.questions[6].helpHtml)));
  await shot(ap, 'a2-admin-question');

  console.log('  - 저장');
  await ap.evaluate(() => saveForm());
  check('저장됨', await L.waitTrue(ap, () => /저장했습니다/.test((document.getElementById('saveMsg') || {}).textContent || '') || document.getElementById('root').innerText.indexOf('신청서') >= 0 && VIEW === 'list', null, 6000));
  const g = run((api) => api.formGet('ADM', fid)).form;
  check('저장된 안내글: 서식 (굵게 · 주황) + 서식 뺀 글', /<b>첫째 줄 굵게할것<\/b>|<b>굵게할것<\/b>/.test(g.descHtml) && /<mark class="hl">강조할것/.test(g.descHtml) && /^첫째 줄 굵게할것\n둘째 줄 강조할것/.test(g.desc), { d: g.desc, h: g.descHtml });
  check('저장된 문항: 유형 · 선택지 · 기타 그대로', g.questions[0].type === 'choice' && g.questions[0].other === true && g.questions[0].otherLabel === '기타 사이즈' && JSON.stringify(g.questions[0].opts) === JSON.stringify(['S', 'M', 'L']), g.questions[0]);
  check('저장된 별점 설정', g.questions[2].type === 'rating' && g.questions[2].scale === 5 && g.questions[2].variant === 'star' && g.questions[2].lowLabel === '별로' && g.questions[2].highLabel === '최고', g.questions[2]);
  check('옛 문항(텍스트)에는 별점 칸이 새로 생기지 않음', !('scale' in g.questions[5]) && !('variant' in g.questions[5]), g.questions[5]);
  check('저장된 안내 문구 서식', /<b>꼭<\/b>/.test(g.questions[6].helpHtml) && g.questions[6].help === '꼭 읽어 주세요\n마감 임박', g.questions[6]);

  console.log('  - 결과 화면');
  await ap.evaluate((id) => showResults(id), fid);
  check('결과 화면', await L.waitTrue(ap, () => !!document.querySelector('.fbars'), null, 6000));
  const rs = await ap.evaluate(() => ({ t: document.getElementById('root').innerText, others: !!document.querySelector('.fx-others') }));
  check('"기타" 로 적은 내용이 묶여서 나옴', rs.others && /XXL/.test(rs.t) && /기타 사이즈/.test(rs.t) && /텀블러/.test(rs.t), rs.t.slice(0, 300));
  check('별점 평균 · 몇 명', /\/ 5 \(2명 평균\)/.test(rs.t) && /3\.5/.test(rs.t), rs.t.slice(0, 500));
  await shot(ap, 'a3-admin-results');

  console.log('  - 성능 (문항 60개 관리 화면)');
  await ap.evaluate((id) => openForm(id), fid);
  await L.waitTrue(ap, () => !!document.getElementById('qList') && !!window.F && F.id, null, 6000);
  const perfA = await ap.evaluate((qs) => { F.questions = qs.map(normQ); OPENQ = 3; const t0 = performance.now(); drawQuestions(); return { ms: performance.now() - t0, n: document.querySelectorAll('.q').length }; },
    Array.from({ length: 60 }, (_, i) => ({ id: 'z' + i, type: ['choice', 'checks', 'rating', 'text'][i % 4], label: '문항 ' + i, opts: ['가', '나'], other: i % 2 === 0 })));
  check('60개 문항 그리기 < 250ms · 60개 모두 그려짐', perfA.n === 60 && perfA.ms < 250, perfA);
  check('관리자 화면 페이지 오류 없음', A.errs.length === 0, A.errs);
  await A.ctx.close();

  await br.close();
  const okAll = L.summary(); process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
