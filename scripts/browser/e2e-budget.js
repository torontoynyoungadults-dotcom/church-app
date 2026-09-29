/** 행사 예산 화면 시험 — 진짜 server.js + 가짜 구글 + 진짜 크롬 (목록 → 예산 → 거래 → 엑셀 왕복 → PDF → 정산 → 접근) */
process.env.PORT = '4191';
const fs = require('fs'), path = require('path');
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const BASE = 'http://127.0.0.1:4191';
const XLSX = require('../../public/vendor/xlsx.mini.min.js');
const IO = require('../../public/budget/xlsx-io.js');
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
(async () => {
  await sleep(1200);
  const ev = run((api) => api.budgetSaveEvent('ADM', { name: '2026 가을 수련회', year: '2026', dept: '청년부', owner: '정일반', start: '', end: '', memo: '' })).event;
  run((api) => api.budgetSaveLine('ADM', ev.id, { kind: '지출', category: '식비', name: '식사', amount: 500 }));
  run((api) => api.budgetSaveLine('ADM', ev.id, { kind: '수입', category: '회비', name: '참가비', amount: 800 }));
  const br = await L.launch(); const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '금액 정정 필요' : undefined));
  const txt = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);

  console.log('· 목록');
  await page.goto(BASE + '/?page=budget&key=ADM');
  check('행사 카드가 보임', await L.waitTrue(page, () => document.querySelectorAll('.bd-ev').length === 1, null, 6000));
  check('카드에 행사명', (await txt('.bd-ev')).includes('2026 가을 수련회'));
  check('새 행사 버튼 보임 (관리 권한)', await page.isVisible('#btnNewEvent'));

  console.log('· 새 행사 만들기');
  await page.click('#btnNewEvent'); await page.fill('#efName', '겨울 캠프'); await page.selectOption('#efDept', { index: 1 });
  await page.click('[data-act="save-event"]');
  check('새 행사 상세로 이동', await L.waitTrue(page, () => document.getElementById('viewEvent').style.display !== 'none' && document.getElementById('evHead').textContent.includes('겨울 캠프'), null, 5000));
  await page.click('#btnBack');
  check('목록에 2개', await L.waitTrue(page, () => document.querySelectorAll('.bd-ev').length === 2, null, 4000));

  console.log('· 행사 열기 — 예산 탭');
  await page.click('.bd-ev:has-text("가을 수련회")');
  check('예산 표가 보임', await L.waitTrue(page, () => document.getElementById('evHead').textContent.includes('가을 수련회') && document.querySelectorAll('#tabBody .bd-table tbody tr').length > 3, null, 4000));
  { const tt = await txt('#evTiles'); check('지출 예산 타일 $500.00', tt.includes('$500.00'), tt); }

  console.log('· 거래 기록');
  await page.click('[data-tab="tx"]'); await page.click('[data-act="add-tx"]');
  await page.fill('#tfDate', today); await page.selectOption('#tfLine', { label: '식사' }); await page.fill('#tfDetail', '점심 도시락'); await page.fill('#tfAmt', '120.5');
  await page.click('[data-act="save-tx"]');
  check('거래 저장됨', await L.waitTrue(page, () => document.getElementById('tabBody').textContent.includes('점심 도시락'), null, 4000));
  check('지출 타일이 실지출 반영', (await txt('#evTiles')).includes('$120.50'));
  await page.click('[data-act="add-tx"]'); await page.fill('#tfDate', today); await page.fill('#tfDetail', '항목 없는 지출'); await page.fill('#tfAmt', '10');
  await page.click('[data-act="save-tx"]');
  check('미분류 거래도 저장', await L.waitTrue(page, () => document.getElementById('tabBody').textContent.includes('항목 없는 지출'), null, 4000));
  await page.click('[data-act="add-tx"]'); await page.fill('#tfDate', today); await page.fill('#tfDetail', '나쁜금액'); await page.fill('#tfAmt', '0');
  await page.click('[data-act="save-tx"]');
  await sleep(800); console.log('   mMsg:', await txt('#mMsg'));
  check('금액 0 은 오류를 모달에 표시', await L.waitTrue(page, () => document.getElementById('mMsg') && document.getElementById('mMsg').textContent.includes('0보다'), null, 4000));
  await page.click('[data-act="close"]');

  console.log('· 엑셀 내려받기 → 고침 → 올리기');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('[data-act="xlsx-down"]')]);
  const file = path.join(require('os').tmpdir(), 'budget-e2e.xlsx'); await dl.saveAs(file);
  check('엑셀 파일이 내려받아짐', /\.xlsx$|^download$/.test(dl.suggestedFilename()), dl.suggestedFilename());   // 헤드리스 크롬은 한글 파일명을 'download'로 보고함(실제 크롬은 정상)
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const sh = wb.Sheets['예산']; const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  const rowIdx = rows.findIndex((r) => r[3] === '식사'); rows[rowIdx][4] = 650;                                          // 식사 예산 500 → 650
  rows.push(['', '지출', '교통', '버스 대절', 300, '']);                                                                 // 새 항목
  wb.Sheets['예산'] = XLSX.utils.aoa_to_sheet(rows); fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await page.setInputFiles('#fileXlsx', file);
  await sleep(1500); console.log('   toast:', await txt('#toast'), '| modal:', (await txt('#modalBody')).slice(0, 300), '| errs:', errs);
  check('미리보기가 열림', await L.waitTrue(page, () => document.getElementById('impGo') !== null, null, 5000));
  const pv = await txt('#modalBody');
  check('수정 1 · 추가 1 표시', /1\s*수정/.test(pv) && /1\s*수수?정|추가/.test(pv), pv.slice(0, 200));
  await page.click('#impGo');
  check('엑셀 내용 저장됨', await L.waitTrue(page, () => document.getElementById('modal').className.indexOf('on') === -1 && document.getElementById('evTiles').textContent.includes('$950.00'), null, 5000));
  console.log('· 예전 버전 파일은 경고');
  await page.evaluate(() => { document.getElementById('fileXlsx').value = ''; });
  await page.setInputFiles('#fileXlsx', file);
  check('낡은 파일 경고 체크박스', await L.waitTrue(page, () => document.getElementById('impStale') !== null, null, 5000));
  await page.click('[data-act="close"]');

  console.log('· PDF');
  for (const k of ['budget', 'transactions', 'settlement']) {
    const [pd] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('[data-act="pdf"][data-kind="' + k + '"]')]);
    if (!pd) console.log('   toast:', await txt('#toast'), '| pages:', ctx.pages().length);
    const fb = !pd && /인쇄 창/.test(await txt('#toast'));                                   // 서버 PDF 변환이 안 되는 환경(가짜 구글)이면 인쇄 화면으로 대체
    check('PDF ' + k + ' 내려받음 또는 인쇄 화면 대체', (!!pd && /\.pdf$|^download$/.test(pd.suggestedFilename())) || fb, pd && pd.suggestedFilename());
    if (fb) { const w = ctx.pages()[ctx.pages().length - 1]; check('  인쇄 화면에 행사 이름이 있음', (await w.content()).includes('2026 가을 수련회')); await w.close(); }
    if (pd) { const p = path.join(require('os').tmpdir(), 'b-' + k + '.pdf'); await pd.saveAs(p); check('  PDF 서명 %PDF', fs.readFileSync(p).slice(0, 4).toString() === '%PDF'); }
  }

  console.log('· 정산');
  await page.click('[data-tab="settle"]');
  check('정산 버튼 보임', await page.isVisible('[data-act="settle"]'));
  await page.click('[data-act="settle"]');
  check('미분류 거래가 있으면 확정 거절', await L.waitTrue(page, () => /연결되지 않은/.test(document.getElementById('toast').textContent), null, 4000));
  await page.check('#stUn'); await page.click('[data-act="settle"]');
  check('정산 확정됨', await L.waitTrue(page, () => document.getElementById('evHead').textContent.includes('정산완료'), null, 5000));
  check('확정 뒤 거래 추가 버튼이 사라짐', await L.waitTrue(page, () => { document.querySelector('[data-tab="tx"]').click(); return !document.querySelector('[data-act="add-tx"]'); }, null, 3000));
  await page.click('[data-tab="settle"]'); await page.click('[data-act="reopen"]');
  check('다시 열기', await L.waitTrue(page, () => document.getElementById('evHead').textContent.includes('진행중'), null, 5000));

  console.log('· 접근 권한');
  await page.click('[data-tab="access"]');
  check('접근 탭 표시', await L.waitTrue(page, () => document.getElementById('acName') !== null, null, 4000));
  await page.fill('#acName', '이예배'); await page.selectOption('#acLevel', '조회'); await page.click('[data-act="acc-add"]');
  check('이예배 추가됨', await L.waitTrue(page, () => document.getElementById('tabBody').textContent.includes('이예배'), null, 4000));
  await page.fill('#acName', '없는사람'); await page.click('[data-act="acc-add"]');
  check('교적에 없으면 오류', await L.waitTrue(page, () => /교적에 없는/.test(document.getElementById('acMsg').textContent), null, 4000));

  console.log('· 이력');
  await page.click('[data-tab="history"]');
  check('이력에 정산 확정 기록', await L.waitTrue(page, () => document.getElementById('tabBody').textContent.includes('정산 확정'), null, 4000));

  console.log('· 개인 권한(포털 로그인) — 조회자는 편집 버튼이 없음');
  const tok = run((api) => api.포털토큰_('이예배', '4165551001', ''));
  await page.goto(BASE + '/?page=budget&t=' + encodeURIComponent(tok));
  await sleep(1500); console.log('   grid:', (await txt('#evGrid')).slice(0, 200));
  check('커미티는 기본 "조회" 권한으로 행사가 보임', await L.waitTrue(page, () => document.querySelectorAll('.bd-ev').length === 2 && Array.from(document.querySelectorAll('.bd-ev .bd-chip')).every((c) => /조회/.test(c.textContent)), null, 6000));
  check('새 행사 버튼 숨김', !(await page.isVisible('#btnNewEvent')));
  await page.click('.bd-ev');
  await L.waitTrue(page, () => document.getElementById('viewEvent').style.display !== 'none', null, 4000);
  check('엑셀 올리기 · 예산 항목 추가 버튼 없음', !(await page.isVisible('[data-act="xlsx-up"]')) && !(await page.isVisible('[data-act="add-line"]')));
  check('접근 탭 없음', !(await page.isVisible('[data-tab="access"]')));
  console.log('· 모바일 폭');
  await page.setViewportSize({ width: 390, height: 800 });
  check('가로 스크롤 없음', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('페이지 오류 없음', errs.length === 0, errs);
  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
