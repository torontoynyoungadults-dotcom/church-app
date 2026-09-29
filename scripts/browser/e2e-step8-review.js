/**
 * Step 8 화면 시험 (별도 확인용) — 회계 승인 흐름을 "사람이 쓰는 순서대로" 진짜 크롬으로 끝까지 눌러 봅니다.
 *   node scripts/browser/e2e-step8-review.js          (진짜 server.js + 가짜 구글 + 진짜 크롬)
 *  A. 관리자: 새 행사(체크 기본 켜짐) → 5단계 · 예산 제출 → 잠금
 *  B. 입력자: 제출 뒤엔 승인 버튼이 없음 (화면을 우회한 직접 호출도 서버가 거절)
 *  C. 승인자: 수정 요청(사유 필수) → 되돌아감 → 재제출 → 승인 → 거래 → 정산 제출 → 정산 최종 승인 → 다시 열기
 *  D. 본인 승인 금지 · 낡은 화면 · 알림 바로가기(?ev=) · 예전 행사는 그대로 · 옛 행사에 켜기
 *  E. 모바일 폭 · 페이지 오류 없음
 */
process.env.PORT = '4197';
const path = require('path'), fs = require('fs');
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const BASE = 'http://127.0.0.1:4197';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
const SHOT = process.env.SHOT_DIR || path.join(__dirname, '..', '..', 'tmp-shots');
try { fs.mkdirSync(SHOT, { recursive: true }); } catch (e) { /* 사진 저장은 선택 */ }
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(SHOT, name + '.png'), fullPage: true }); } catch (e) { /* ignore */ } };

(async () => {
  await sleep(1200);
  run((api) => api.acctAccessSave('ADM', '이예배', '*', '입력', '', '제출 담당'));
  run((api) => api.acctAccessSave('ADM', '최셀장', '*', '정산', '', '승인 담당 A'));
  run((api) => api.acctAccessSave('ADM', '노셀장', '*', '정산', '', '승인 담당 B'));
  const T이 = run((api) => api.포털토큰_('이예배', '4165551001', ''));
  const T최 = run((api) => api.포털토큰_('최셀장', '4165551006', ''));
  const T노 = run((api) => api.포털토큰_('노셀장', '4165551007', ''));
  // 승인 절차를 쓰지 않는 예전 방식 행사 하나
  const old = run((api) => api.budgetSaveEvent('ADM', { name: '옛 방식 행사', year: '2026', dept: '청년부' })).event;
  run((api) => api.budgetSaveLine('ADM', old.id, { kind: '지출', category: '식비', name: '식사', amount: 100 }));

  const br = await L.launch(); const errs = [];
  const open = async (url, vp) => {
    const ctx = await br.newContext({ viewport: vp || { width: 1280, height: 900 }, timezoneId: 'America/Toronto', locale: 'ko-KR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '영수증 하나 빠짐' : undefined));
    await page.goto(BASE + url);
    return page;
  };
  const txt = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const cur = (page) => txt(page, '.bd-steps li.now b');
  const waitCur = (page, key) => L.waitTrue(page, (k) => { const e = document.querySelector('.bd-steps li.now b'); return !!e && e.textContent === k; }, key, 5000);
  const flowBtn = (page, a) => page.isVisible('[data-act="flow"][data-flow="' + a + '"]');
  const doFlow = async (page, action, fill) => {
    await page.click('[data-act="flow"][data-flow="' + action + '"]');
    await page.waitForSelector('[data-act="flow-go"]');
    if (fill) await fill();
    await page.click('[data-act="flow-go"]');
  };
  // 새로 고침하면 주소의 #행사번호 때문에 그 행사가 바로 열려 있습니다 — 그 경우엔 목록을 거치지 않습니다
  const openEv = async (page, name) => {
    await L.waitTrue(page, () => document.querySelectorAll('.bd-ev').length > 0 || document.getElementById('viewEvent').style.display !== 'none', null, 6000);
    const shown = () => page.evaluate((n) => document.getElementById('viewEvent').style.display !== 'none' && document.getElementById('evHead').textContent.includes(n), name);
    if (await shown()) return;
    if (await page.isVisible('#viewEvent')) await page.click('#btnBack');
    await page.locator('.bd-ev', { hasText: name }).click();
    await L.waitTrue(page, (n) => document.getElementById('viewEvent').style.display !== 'none' && document.getElementById('evHead').textContent.includes(n), name, 5000);
  };
  const reopenList = async (page, name) => { await page.reload(); await openEv(page, name); };

  /* ---------------------------------------------------------------- A. 관리자 */
  console.log('· A. 관리자 — 새 행사 + 예산 제출');
  const adm = await open('/?page=budget&key=ADM');
  check('목록이 보임', await L.waitTrue(adm, () => document.querySelectorAll('.bd-ev').length === 1, null, 6000));
  check('예전 행사 카드에는 승인 단계 뱃지가 없고 상태 뱃지만 있음', (await adm.locator('.bd-ev .bd-badge').count()) === 1 && !(await txt(adm, '.bd-ev')).includes('['));
  await adm.click('#btnNewEvent');
  check('새 행사 창의 "회계 승인 절차 사용" 체크가 기본으로 켜져 있음', (await adm.isVisible('#efFlow')) && (await adm.isChecked('#efFlow')));
  await adm.fill('#efName', '가을 수련회'); await adm.click('[data-act="save-event"]');
  check('새 행사 화면 + 승인 카드', await L.waitTrue(adm, () => document.getElementById('viewEvent').style.display !== 'none' && !!document.querySelector('#evFlow .bd-flow'), null, 5000));
  check('5단계가 그려지고 지금은 Draft', (await adm.locator('.bd-steps li').count()) === 5 && (await cur(adm)) === 'Draft');
  check('머리 뱃지에 단계가 보임 ([Draft])', (await txt(adm, '#evHead')).includes('[Draft]'));
  check('"예산 제출" 버튼', await flowBtn(adm, 'submitBudget'));
  check('거래 탭: 잠금 안내가 있고 거래 추가 버튼은 없음', await (async () => { await adm.click('[data-tab="tx"]'); return (await adm.isVisible('.bd-lock')) && !(await adm.isVisible('[data-act="add-tx"]')); })());
  await adm.click('[data-tab="lines"]');
  await doFlow(adm, 'submitBudget');
  check('예산 항목이 없으면 제출이 모달 안에서 거절됨', await L.waitTrue(adm, () => (document.getElementById('mMsg') || {}).textContent.includes('예산 항목을 하나 이상'), null, 4000));
  await adm.click('[data-act="close"]');
  await adm.click('[data-act="add-line"]'); await adm.fill('#lfName', '식사'); await adm.fill('#lfAmt', '500'); await adm.click('[data-act="save-line"]');
  check('예산 항목이 저장됨', await L.waitTrue(adm, () => document.getElementById('tabBody').textContent.includes('식사'), null, 4000));
  await adm.click('[data-act="add-line"]'); await adm.fill('#lfName', '참가비'); await adm.selectOption('#lfKind', '수입'); await adm.fill('#lfAmt', '800'); await adm.click('[data-act="save-line"]');
  await L.waitTrue(adm, () => document.getElementById('tabBody').textContent.includes('참가비'), null, 4000);
  await doFlow(adm, 'submitBudget');
  check('예산 제출 → Budget Submitted', await waitCur(adm, 'Budget Submitted'));
  check('예산 항목 추가 · 수정 버튼이 사라지고 잠금 안내', !(await adm.isVisible('[data-act="add-line"]')) && !(await adm.isVisible('[data-act="edit-line"]')) && (await txt(adm, '#tabBody')).includes('회계 검토 중'));
  check('"행사 정보" 버튼은 남아 있음', await adm.isVisible('[data-act="edit-event"]'));
  await shot(adm, 'step8r-submitted');
  const evId = run((api) => api.budgetInit('ADM')).events.filter((e) => e.name === '가을 수련회')[0].id;

  /* ---------------------------------------------------------------- B. 입력자 */
  console.log('· B. 입력자(이예배)');
  const p입 = await open('/?page=budget&t=' + encodeURIComponent(T이));
  await L.waitTrue(p입, () => document.querySelectorAll('.bd-ev').length >= 1, null, 6000);
  check('목록 카드에 [Budget Submitted] 뱃지', (await p입.locator('.bd-ev', { hasText: '가을 수련회' }).textContent()).includes('[Budget Submitted]'));
  await openEv(p입, '가을 수련회');
  check('승인 · 수정 요청 버튼이 없음', !(await flowBtn(p입, 'approveBudget')) && !(await flowBtn(p입, 'requestBudgetRevision')));
  check('서버가 내려 준 안내(검토를 기다리는 중)', (await txt(p입, '#evFlow')).includes('검토를 기다리는 중'));
  let blocked = ''; try { run((api) => api.budgetFlowAct(T이, evId, 'approveBudget', '')); } catch (e) { blocked = e.message; }
  check('직접 호출해도 서버가 승인을 거절', /"정산" 권한/.test(blocked), blocked);

  /* ---------------------------------------------------------------- C. 승인자 */
  console.log('· C. 승인자(최셀장) — 수정 요청 → 재제출 → 승인 → 거래 → 정산');
  const p승 = await open('/?page=budget&t=' + encodeURIComponent(T최));
  await L.waitTrue(p승, () => document.querySelectorAll('.bd-ev').length >= 1, null, 6000);
  await openEv(p승, '가을 수련회');
  check('승인 · 수정 요청 버튼이 보임', (await flowBtn(p승, 'approveBudget')) && (await flowBtn(p승, 'requestBudgetRevision')));
  check('예산 항목 추가 버튼은 없음', !(await p승.isVisible('[data-act="add-line"]')));
  await doFlow(p승, 'requestBudgetRevision');
  check('사유 없이 수정 요청하면 모달에서 막힘', (await txt(p승, '#mMsg')).includes('사유를 적어주세요'));
  check('그 사이 단계는 그대로', (await cur(p승)) === 'Budget Submitted');
  await p승.fill('#flNote', '식사 단가가 높습니다'); await p승.click('[data-act="flow-go"]');
  check('수정 요청 → Draft 로 돌아감', await waitCur(p승, 'Draft'));
  check('수정 요청 사유가 노란 안내로 보임', (await txt(p승, '.bd-callout')).includes('식사 단가가 높습니다'));
  await reopenList(adm, '가을 수련회');
  check('관리자 화면에서 다시 예산을 고칠 수 있음 (잠금 풀림)', await adm.isVisible('[data-act="add-line"]'));
  check('관리자 화면에도 사유가 보임', (await txt(adm, '.bd-callout')).includes('식사 단가가 높습니다'));
  await doFlow(adm, 'submitBudget'); await waitCur(adm, 'Budget Submitted');
  await reopenList(p승, '가을 수련회');
  await doFlow(p승, 'approveBudget');
  check('예산 승인 → Budget Approved', await waitCur(p승, 'Budget Approved'));
  check('예산 항목은 잠긴 채 · 거래 탭은 열림', await (async () => { await p승.click('[data-tab="tx"]'); return !(await p승.isVisible('[data-act="add-line"]')) && (await p승.isVisible('[data-act="add-tx"]')); })());
  await reopenList(p입, '가을 수련회');
  await p입.click('[data-tab="tx"]'); await p입.click('[data-act="add-tx"]'); await sleep(90);   // 창이 열린 뒤 30ms 에 첫 칸으로 포커스가 옮겨가므로 그 뒤에 입력
  await p입.fill('#tfDate', today); await p입.selectOption('#tfLine', { label: '식사' }); await p입.fill('#tfDetail', '점심 도시락'); await p입.fill('#tfAmt', '120.5');
  await p입.click('[data-act="save-tx"]');
  check('입력자가 거래를 기록함', await L.waitTrue(p입, () => document.getElementById('tabBody').textContent.includes('점심 도시락'), null, 4000));
  check('입력자에게 "정산 제출" 버튼', await flowBtn(p입, 'submitSettlement'));
  // Step 9 — 예산과 실적 차이가 큰 항목은 설명을 적어야 정산을 낼 수 있음
  check('승인 카드에 "정산 제출 전에 … 설명" 안내 + 실적 탭 바로가기', (await txt(p입, '#evFlow .bd-callout')).includes('정산 제출 전에') && await p입.isVisible('#evFlow [data-act="tab"][data-tab="actuals"]'));
  await doFlow(p입, 'submitSettlement');
  check('설명 없이 정산 제출하면 이유가 창에 보이고 단계는 그대로', await L.waitTrue(p입, () => (document.getElementById('mMsg') || {}).textContent.includes('차이가 큰 항목의 설명이 필요합니다'), null, 5000) && (await cur(p입)) === 'Budget Approved');
  await p입.click('[data-act="close"]');
  await p입.click('[data-tab="actuals"]');
  await p입.locator('.bd-vx').first().fill('참가자가 예상보다 적었습니다');
  for (const el of await p입.locator('.bd-vx').all()) if (!(await el.inputValue())) await el.fill('시험 설명');
  await p입.click('[data-act="save-notes"]');
  check('설명을 저장하면 실적 탭의 경고가 사라짐', await L.waitTrue(p입, () => !document.querySelector('.bd-need') && !/⚠/.test(document.getElementById('evTabs').textContent), null, 5000));
  await doFlow(p입, 'submitSettlement');
  check('정산 제출 → Settlement Submitted', await waitCur(p입, 'Settlement Submitted'));
  check('거래 탭이 잠김 (추가 · 수정 버튼 없음 + 잠금 안내)', await (async () => { await p입.click('[data-tab="tx"]'); return !(await p입.isVisible('[data-act="add-tx"]')) && !(await p입.isVisible('[data-act="edit-tx"]')) && (await p입.isVisible('.bd-lock')); })());
  await shot(p입, 'step8r-settle-submitted');

  /* ---------------------------------------------------------------- D. 본인 승인 · 낡은 화면 · 바로가기 */
  console.log('· D. 본인 승인 금지 · 낡은 화면 · 바로가기 · 예전 행사');
  await reopenList(p승, '가을 수련회');
  check('다른 사람이 제출한 정산이라 최셀장에게 최종 승인 버튼이 보임', await flowBtn(p승, 'approveSettlement'));
  run((api) => api.budgetFlowAct(T최, evId, 'requestSettlementRevision', '영수증 추가 필요'));     // 다른 곳에서 먼저 바꿈 → p승 화면은 낡음
  await p승.click('[data-act="flow"][data-flow="approveSettlement"]'); await p승.waitForSelector('#flNote');
  await p승.fill('#flNote', '수고하셨습니다'); await p승.click('[data-act="flow-go"]');
  check('낡은 화면에서 승인하면 이유가 보이고 화면이 새 단계(Budget Approved)로 갱신됨', await L.waitTrue(p승, () => (document.getElementById('mMsg') || {}).textContent.includes('먼저 상태를 바꿨') && document.querySelector('.bd-steps li.now b').textContent === 'Budget Approved', null, 5000));
  await p승.click('[data-act="close"]');
  // 최셀장이 직접 정산을 제출 → 본인은 승인 못함 · 노셀장이 승인
  await doFlow(p승, 'submitSettlement'); await waitCur(p승, 'Settlement Submitted');
  check('본인이 제출한 정산: 최종 승인 버튼이 없고 이유 안내가 보임', !(await flowBtn(p승, 'approveSettlement')) && (await txt(p승, '#evFlow')).includes('본인이 제출한 건은 다른 회계 담당자가 승인해야'));
  check('본인이 제출했어도 수정 요청은 할 수 있음', await flowBtn(p승, 'requestSettlementRevision'));
  let selfErr = ''; try { run((api) => api.budgetFlowAct(T최, evId, 'approveSettlement', '')); } catch (e) { selfErr = e.message; }
  check('직접 호출해도 서버가 본인 승인을 거절', /본인이 제출한 정산/.test(selfErr), selfErr);
  const p노 = await open('/?page=budget&t=' + encodeURIComponent(T노) + '&ev=' + encodeURIComponent(evId));
  check('알림 바로가기(?ev=)로 그 행사가 바로 열림', await L.waitTrue(p노, () => document.getElementById('viewEvent').style.display !== 'none' && document.getElementById('evHead').textContent.includes('가을 수련회'), null, 6000));
  await L.waitTrue(p노, () => !!document.querySelector('#evFlow .bd-flow'), null, 4000);
  await doFlow(p노, 'approveSettlement', async () => { await p노.fill('#flNote', '수고하셨습니다'); });
  check('다른 회계 담당자(노셀장)의 정산 최종 승인 → Settlement Approved', await waitCur(p노, 'Settlement Approved'));
  check('승인 완료 안내(toast)', (await txt(p노, '#toast')).includes('완료'));
  check('행사 상태도 정산완료 (기존 정산 확정과 같음)', run((api) => api.budgetGetEvent('ADM', evId)).event.status === '정산완료');
  await p노.click('[data-tab="settle"]');
  check('정산 탭: 확정됨 · 옛 "정산 확정" 버튼은 없음 (절차를 우회 못함) · 정산 기록 1건', (await txt(p노, '#tabBody')).includes('정산 확정됨') && !(await p노.isVisible('[data-act="settle"]')));
  check('정산 다시 열기 버튼은 있음', await p노.isVisible('[data-act="reopen"]'));
  await p노.click('[data-act="reopen"]');
  check('다시 열기 → Budget Approved (사유가 카드에)', await waitCur(p노, 'Budget Approved') && (await txt(p노, '.bd-callout')).includes('영수증 하나 빠짐'));
  check('이력 탭에 단계 이동이 남음', await (async () => { await p노.click('[data-tab="history"]'); await L.waitTrue(p노, () => document.getElementById('tabBody').textContent.includes('정산 다시 열기'), null, 4000); const t = await txt(p노, '#tabBody'); return t.includes('예산 제출') && t.includes('예산 수정 요청') && t.includes('정산 제출') && t.includes('정산 다시 열기'); })());
  const rd = run((api) => api.resolveDeepLink(T최, 'budget', evId));
  check('포털 바로가기가 ?page=budget&…&ev= 주소를 돌려줌', rd.ok && /page=budget/.test(rd.url) && /ev=/.test(rd.url), rd);

  await adm.goto(BASE + '/?page=budget&key=ADM'); await L.waitTrue(adm, () => document.querySelectorAll('.bd-ev').length >= 2, null, 6000);
  await openEv(adm, '옛 방식 행사');
  check('예전 행사: 예산 · 거래 버튼이 예전처럼 다 보임', (await adm.isVisible('[data-act="add-line"]')) && (await adm.isVisible('[data-tab="tx"]')));
  await adm.click('[data-tab="tx"]');
  check('예전 행사: 거래 추가 버튼도 그대로', await adm.isVisible('[data-act="add-tx"]'));
  await adm.click('[data-tab="settle"]');
  check('예전 행사: 정산 탭에 옛 "정산 확정" 버튼', await adm.isVisible('[data-act="settle"]'));
  check('예전 행사: 관리자에게만 "켜기" 안내 카드', (await txt(adm, '#evFlow')).includes('승인 절차 없이 운영 중') && (await flowBtn(adm, 'enableFlow')));
  await adm.click('[data-act="flow"][data-flow="enableFlow"]'); await adm.waitForSelector('[data-act="flow-go"]'); await adm.click('[data-act="flow-go"]');
  check('켜기 → 지금 상태(예산작성)에 맞춰 Draft 에서 시작', await waitCur(adm, 'Draft'));
  check('켠 뒤에는 "켜기" 버튼이 사라짐', !(await flowBtn(adm, 'enableFlow')));

  /* ---------------------------------------------------------------- E. 모바일 · 오류 */
  console.log('· E. 모바일 폭 · 오류');
  const mob = await open('/?page=budget&t=' + encodeURIComponent(T최) + '&ev=' + encodeURIComponent(evId), { width: 390, height: 800 });
  await L.waitTrue(mob, () => !!document.querySelector('#evFlow .bd-flow'), null, 6000);
  check('모바일: 가로 스크롤 없음', await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('모바일: 단계 칸이 화면 밖으로 나가지 않음', await mob.evaluate(() => Array.from(document.querySelectorAll('.bd-steps li')).every((x) => x.getBoundingClientRect().right <= window.innerWidth + 1)));
  check('모바일: 버튼 높이 ≥ 32px (앱의 작은 버튼과 같음)', await mob.evaluate(() => { const b = document.querySelector('#evFlow .bd-b'); return !b || b.getBoundingClientRect().height >= 32; }));
  await shot(mob, 'step8r-mobile');
  check('페이지 오류 없음', errs.length === 0, errs);
  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
