/**
 * Step 9 화면 시험 — 행사 실적: 통화 · 환율 · 영수증 · 차이 설명 · Executive Summary / 비고를 진짜 크롬으로 눌러 봅니다.
 *   node scripts/browser/e2e-step9.js          (진짜 server.js + 가짜 구글 + 진짜 크롬 — 개발 기기에는 Playwright 가 없어 클라우드에서 돌립니다)
 *  A. 거래 입력창: 통화 고르기 → 원금액 · 환율 ↔ CAD 자동 계산 · 영수증 올리기 / 빼기 / 취소하면 버림
 *  B. 거래 표: 통화 · 영수증 표시, 다시 열면 값이 채워져 있음
 *  C. 실적 탭: 설명이 필요한 항목 표시 · 저장 · 새로 고쳐도 남음 · Executive Summary / 비고
 *  D. 조회 등급은 읽기만 · 모바일 폭 · 페이지 오류 없음
 */
process.env.PORT = '4198';
const path = require('path'), fs = require('fs');
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const BASE = 'http://127.0.0.1:4198';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
const SHOT = process.env.SHOT_DIR || path.join(__dirname, '..', '..', 'tmp-shots');
try { fs.mkdirSync(SHOT, { recursive: true }); } catch (e) { /* 사진 저장은 선택 */ }
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(SHOT, name + '.png'), fullPage: true }); } catch (e) { /* ignore */ } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

(async () => {
  await sleep(1200);
  run((api) => api.acctAccessSave('ADM', '이예배', '*', '조회', '', '읽기 전용'));
  const T이 = run((api) => api.포털토큰_('이예배', '4165551001', ''));
  const ev = run((api) => api.budgetSaveEvent('ADM', { name: '실적 시험 행사', year: '2026', dept: '청년부' })).event;
  run((api) => api.budgetSaveLine('ADM', ev.id, { kind: '지출', category: '식비', name: '식사', amount: 1000 }));
  run((api) => api.budgetSaveLine('ADM', ev.id, { kind: '지출', category: '숙박', name: '숙소', amount: 400 }));

  const br = await L.launch(); const errs = [];
  const open = async (url, vp) => {
    const ctx = await br.newContext({ viewport: vp || { width: 1280, height: 900 }, timezoneId: 'America/Toronto', locale: 'ko-KR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url);
    return page;
  };
  const txt = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const val = (page, sel) => page.evaluate((s) => document.querySelector(s).value, sel);
  const files = () => Array.from(global.__fake.files.values()).filter((f) => !/folder/.test(f.mimeType));
  const png = (name) => ({ name, mimeType: 'image/png', buffer: PNG });

  /* ---------------------------------------------------------------- A. 거래 입력창 */
  console.log('· A. 통화 · 환율 · 영수증');
  const adm = await open('/?page=budget&key=ADM&ev=' + encodeURIComponent(ev.id));
  check('행사가 열림', await L.waitTrue(adm, () => document.getElementById('viewEvent').style.display !== 'none', null, 6000));
  check('탭에 "실적"이 있음', (await txt(adm, '#evTabs')).includes('실적'));
  await adm.click('[data-tab="tx"]'); await adm.click('[data-act="add-tx"]'); await sleep(90);   // 창이 열린 뒤 30ms 에 첫 칸으로 포커스가 옮겨가므로 그 뒤에 입력
  check('통화 기본은 CAD · 환율 칸은 숨김', (await val(adm, '#tfCur')) === 'CAD' && !(await adm.isVisible('#tfRate')));
  check('통화 목록: CAD · USD · JPY', (await adm.locator('#tfCur option').allTextContents()).join() === 'CAD,USD,JPY');
  await adm.fill('#tfDate', today); await adm.selectOption('#tfLine', { label: '식사' }); await adm.fill('#tfDetail', '미국 기념품');
  await adm.selectOption('#tfCur', 'USD');
  check('USD 를 고르면 원금액 · 환율 칸이 보임', (await adm.isVisible('#tfForeign')) && (await adm.isVisible('#tfRate')));
  check('라벨에 통화가 보임', (await txt(adm, '#tfRateLbl')).includes('1 USD') && (await txt(adm, '#tfForeignLbl')).includes('USD'));
  await adm.fill('#tfForeign', '100'); await adm.fill('#tfRate', '1.37');
  check('원금액 × 환율 = CAD 금액이 자동으로 채워짐', (await val(adm, '#tfAmt')) === '137.00');
  await adm.fill('#tfAmt', '140');
  check('CAD 금액을 고치면 환율을 역산', (await val(adm, '#tfRate')) === '1.4');
  await adm.fill('#tfRate', '1.37');
  check('환율을 다시 고치면 CAD 금액도 따라감', (await val(adm, '#tfAmt')) === '137.00');
  await adm.setInputFiles('#tfFile', [png('영수증A.png'), png('영수증B.png')]);
  check('영수증 2장이 올라가 칩으로 보임', await L.waitTrue(adm, () => document.querySelectorAll('#tfRc .bd-rc').length === 2, null, 6000));
  check('저장 버튼은 올리는 동안만 잠기고 지금은 열림', !(await adm.isDisabled('[data-act="save-tx"]')));
  const before = files().filter((f) => !f.trashed).length;
  await adm.locator('#tfRc .bd-rcx').first().click();
  check('영수증을 빼면 칩이 1장으로', await L.waitTrue(adm, () => document.querySelectorAll('#tfRc .bd-rc').length === 1, null, 3000));
  check('방금 올렸다 뺀 파일은 바로 휴지통으로', await L.waitTrue(adm, () => true, null, 500) && (await (async () => { await sleep(600); return files().filter((f) => !f.trashed).length === before - 1; })()));
  await shot(adm, 'step9-txform');
  await adm.click('[data-act="save-tx"]');
  check('저장됨 — 표에 USD 원금액 × 환율이 보임', await L.waitTrue(adm, () => /USD 100\.00 × 1\.37/.test(document.getElementById('tabBody').textContent), null, 5000));
  check('표에 영수증 링크(📎1)와 CAD 금액', (await adm.locator('#tabBody .bd-rcl').count()) === 1 && (await txt(adm, '#tabBody')).includes('$137.00'));
  await shot(adm, 'step9-txlist');

  /* ---------------------------------------------------------------- B. 다시 열기 · 취소 · JPY */
  console.log('· B. 다시 열기 · 취소하면 버림 · JPY');
  await adm.click('[data-act="edit-tx"]');
  check('수정창에 통화 · 원금액 · 환율 · 영수증이 채워져 있음', (await val(adm, '#tfCur')) === 'USD' && (await val(adm, '#tfForeign')) === '100' && (await val(adm, '#tfRate')) === '1.37' && (await adm.locator('#tfRc .bd-rc').count()) === 1);
  await adm.setInputFiles('#tfFile', [png('저장안함.png')]);
  await L.waitTrue(adm, () => document.querySelectorAll('#tfRc .bd-rc').length === 2, null, 6000);
  const live = files().filter((f) => !f.trashed).length;
  await adm.click('[data-act="close"]');
  check('저장하지 않고 닫으면 방금 올린 영수증은 버려짐', await L.waitTrue(adm, () => true, null, 300) && (await (async () => { await sleep(700); return files().filter((f) => !f.trashed).length === live - 1; })()));
  await adm.click('[data-act="edit-tx"]');
  check('닫은 뒤 다시 열어도 원래 영수증 1장만', (await adm.locator('#tfRc .bd-rc').count()) === 1);
  await adm.click('[data-act="close"]');

  await adm.click('[data-act="add-tx"]'); await sleep(90);   // 창이 열린 뒤 30ms 에 첫 칸으로 포커스가 옮겨가므로 그 뒤에 입력
  await adm.fill('#tfDate', today); await adm.selectOption('#tfLine', { label: '숙소' }); await adm.fill('#tfDetail', '일본 간식');
  await adm.selectOption('#tfCur', 'JPY');
  check('USD 환율이 있어도 JPY 에는 이전 JPY 환율만 미리 채움 (없으면 비어 있음)', (await val(adm, '#tfRate')) === '');
  check('JPY 는 원금액에 소수를 받지 않음 (step=1)', (await adm.getAttribute('#tfForeign', 'step')) === '1');
  await adm.fill('#tfForeign', '10000'); await adm.fill('#tfRate', '0.0092');
  check('JPY 10000 × 0.0092 = 92.00', (await val(adm, '#tfAmt')) === '92.00');
  await adm.click('[data-act="save-tx"]');
  check('JPY 거래가 표에 보임', await L.waitTrue(adm, () => /JPY 10,000 × 0\.0092/.test(document.getElementById('tabBody').textContent), null, 5000), await adm.evaluate(() => 'msg=' + ((document.getElementById('mMsg') || {}).textContent || '') + ' modal=' + document.getElementById('modal').className + ' toast=' + document.getElementById('toast').textContent + ' amt=' + ((document.getElementById('tfAmt') || {}).value) + ' rate=' + ((document.getElementById('tfRate') || {}).value) + ' foreign=' + ((document.getElementById('tfForeign') || {}).value) + ' cur=' + ((document.getElementById('tfCur') || {}).value)));
  await L.waitTrue(adm, () => !document.getElementById('modal').classList.contains('on'), null, 4000);
  await adm.click('[data-act="add-tx"]'); await sleep(90);   // 창이 열린 뒤 30ms 에 첫 칸으로 포커스가 옮겨가므로 그 뒤에 입력
  await adm.fill('#tfDate', today); await adm.fill('#tfDetail', '환율 없는 USD'); await adm.selectOption('#tfCur', 'USD');
  check('USD 를 다시 고르면 이 행사에서 마지막에 쓴 USD 환율이 미리 채워짐', (await val(adm, '#tfRate')) === '1.37');
  await adm.fill('#tfForeign', '10'); await adm.fill('#tfRate', ''); await adm.fill('#tfAmt', '');
  await adm.click('[data-act="save-tx"]');
  check('환율도 CAD 금액도 없으면 오류가 창에 보임', await L.waitTrue(adm, () => (document.getElementById('mMsg') || {}).textContent.includes('환율'), null, 4000), await txt(adm, '#mMsg') + ' | modal=' + await adm.evaluate(() => document.getElementById('modal').className) + ' | rate=' + await val(adm, '#tfRate') + ' amt=' + await val(adm, '#tfAmt').catch(() => 'n/a'));
  await adm.click('[data-act="close"]');

  /* ---------------------------------------------------------------- C. 실적 탭 */
  console.log('· C. 실적 탭 — 차이 설명 · 요약 · 비고');
  const tabLabel = await txt(adm, '#evTabs');
  check('실적 탭에 설명이 필요한 항목 수(⚠)가 보임', /실적 ⚠2/.test(tabLabel), tabLabel);
  await adm.click('[data-tab="actuals"]');
  check('설명이 필요한 항목 2건이 강조됨 (식사 · 숙소) · 각각 설명 입력칸이 붙음', (await adm.locator('.bd-vitem.bd-need').count()) === 2 && (await adm.locator('.bd-vx').count()) === 2);
  check('통화별 합계 카드 (USD · JPY)', (await txt(adm, '#tabBody')).includes('통화별 합계') && (await txt(adm, '#tabBody')).includes('USD 100.00') && (await txt(adm, '#tabBody')).includes('JPY 10,000'));
  await adm.fill('#acSummary', '캠프는 계획대로 진행했다.'); await adm.fill('#acRemarks', '숙소 잔금은 다음 달 지급');
  await adm.locator('.bd-vx').nth(0).fill('참가자가 예상보다 적었습니다');
  await adm.click('[data-act="save-notes"]');
  check('저장하면 경고가 1건 줄어듦 (⚠1)', await L.waitTrue(adm, () => /실적 ⚠1/.test(document.getElementById('evTabs').textContent) && document.querySelectorAll('.bd-vitem.bd-need').length === 1, null, 5000));
  await adm.locator('.bd-vx').nth(1).fill('숙소 예약을 취소했습니다');
  await adm.click('[data-act="save-notes"]');
  check('모두 적으면 경고가 사라짐', await L.waitTrue(adm, () => !/⚠/.test(document.getElementById('evTabs').textContent) && !document.querySelector('.bd-need'), null, 5000));
  await shot(adm, 'step9-actuals');
  await adm.reload();
  await L.waitTrue(adm, () => document.getElementById('viewEvent').style.display !== 'none', null, 6000);
  await adm.click('[data-tab="actuals"]');
  check('새로 고쳐도 요약 · 비고 · 설명이 남아 있음', (await val(adm, '#acSummary')) === '캠프는 계획대로 진행했다.' && (await val(adm, '#acRemarks')) === '숙소 잔금은 다음 달 지급' && (await val(adm, '.bd-vx')) === '참가자가 예상보다 적었습니다');
  const html = run((api) => api.budgetReportHtml('ADM', ev.id, 'settlement')).html;
  check('정산서(PDF 원본 HTML)에도 요약 · 설명 · 통화별 합계가 들어감', /Executive Summary/.test(html) && /숙소 예약을 취소했습니다/.test(html) && /통화별 합계/.test(html));

  /* ---------------------------------------------------------------- D. 조회 등급 · 모바일 · 오류 */
  console.log('· D. 조회 등급 · 모바일');
  const ro = await open('/?page=budget&t=' + encodeURIComponent(T이) + '&ev=' + encodeURIComponent(ev.id));
  await L.waitTrue(ro, () => document.getElementById('viewEvent').style.display !== 'none', null, 6000);
  await ro.click('[data-tab="actuals"]');
  check('조회 등급: 요약 · 비고 칸은 잠기고 저장 버튼이 없음', (await ro.isDisabled('#acSummary')) && !(await ro.isVisible('[data-act="save-notes"]')) && !(await ro.isVisible('.bd-vx')));
  check('조회 등급: 설명 문구는 글로 보임', (await txt(ro, '#tabBody')).includes('참가자가 예상보다 적었습니다'));
  await ro.click('[data-tab="tx"]');
  check('조회 등급: 거래 추가 버튼 없음 · 영수증 링크는 보임', !(await ro.isVisible('[data-act="add-tx"]')) && (await ro.locator('#tabBody .bd-rcl').count()) === 1);

  const mob = await open('/?page=budget&key=ADM&ev=' + encodeURIComponent(ev.id), { width: 390, height: 800 });
  await L.waitTrue(mob, () => document.getElementById('viewEvent').style.display !== 'none', null, 6000);
  await mob.click('[data-tab="actuals"]');
  check('모바일: 실적 탭 가로 스크롤 없음', await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(mob, 'step9-mobile-actuals');
  await mob.click('[data-tab="tx"]'); await mob.click('[data-act="add-tx"]'); await mob.selectOption('#tfCur', 'USD');
  check('모바일: 거래 입력창(통화 칸 포함) 가로 스크롤 없음', await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('.bd-sheet').scrollWidth <= document.querySelector('.bd-sheet').clientWidth + 1));
  await shot(mob, 'step9-mobile-txform');
  check('페이지 오류 없음', errs.length === 0, errs);
  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
