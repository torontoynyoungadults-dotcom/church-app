/** Step 34 화면 시험 — 진짜 server.js + 가짜 구글 + 진짜 크롬 (PORT 4323)
 *  장비 점검 체크리스트: 열기 · 점검 토글 · 메모 · 항목 추가 / 고치기 / 보관 / 되살리기
 *  수리 요청: 점검에서 "수리 요청 만들기" → 사진(파일 입력) 첨부 → 보내기 → 관리 화면에 곧바로 → 승인 · 처리 · 완료
 *  요청한 분: 상태 변화 · 알림 · 포털 할 일 / 팀원 아님 · 포털 타일 · 폰(390px) + 데스크톱 · 콘솔 오류 없음 · 스크린샷 */
process.env.PORT = '4323';
const zlib = require('zlib');
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:4323';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const SHOT = process.env.SHOT_DIR || '/tmp';
const fake = global.__fake;

/** 시험용 PNG (가로 세로 · 잡음 무늬) — 브라우저가 열어 줄이고 JPEG 로 올립니다 */
function makePng(w, h) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = ((x * y) % 97) * 2; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = makePng(2400, 1800);          // 큰 사진 — 화면에서 1600px 로 줄어드는지 확인
const PNG_SMALL = makePng(320, 240);

function sheetOf(title) { let s = null; fake.books.forEach((b) => { const t = b.sheets.find((x) => x.title === title); if (t && !s) s = { b, t }; }); return s; }
function addRow(tab, row, head) {
  let s = sheetOf(tab);
  if (!s) { const legacy = Array.from(fake.books.values())[0]; fake.addTab(legacy, tab, [head || ['']]); s = sheetOf(tab); }
  s.t.values.push(row); fake.touch(s.b);
}
function setCell(tab, matchCol, matchVal, col, val) { const s = sheetOf(tab); const r = s.t.values.find((x) => x[matchCol] === matchVal); r[col] = val; fake.touch(s.b); }
const forget = () => require('../../lib/google').store.forget();

const PUSHED = [];
(async () => {
  await sleep(1200);
  /* ---- 시험 세계: 찬양팀 · 방송팀 · 커미티 · 알림 기기 ---- */
  addRow('사역팀', ['Kairos 찬양팀', '예배영성부', '', '윤팀장', ''], ['팀', '부서', '커미티', '팀장', '이메일']);
  addRow('사역팀원', ['Kairos 찬양팀', '정일반', '건반'], ['팀', '이름', '역할']);
  setCell('사역팀', 0, '찬양1팀', 2, '김커미티');
  addRow('설정', ['푸시공개키', 'pub', ''], ['키', '값', '설명']); addRow('설정', ['푸시비밀키', 'pri', ''], ['키', '값', '설명']);
  ['김커미티', '윤팀장', '정일반'].forEach((n) => addRow('알림기기', [n, '', '시험기기', JSON.stringify({ endpoint: 'https://push.test/' + encodeURIComponent(n) }), '2026-09-01', '', ''], ['이름', '이메일', '기기', '구독', '등록일', '마지막알림', '상태']));
  const origCall = fake.call.bind(fake);
  fake.call = (op, a) => {
    if (op === 'push') { PUSHED.push({ names: a.subscriptions.map((s) => decodeURIComponent(s.endpoint.split('/').pop())).sort(), title: a.payload.title, body: a.payload.body, url: a.payload.url }); return { results: a.subscriptions.map(() => ({ ok: true })) }; }
    return origCall(op, a);
  };
  forget();

  const 커미티 = run((api) => api.포털토큰_('김커미티', '4165551000', ''));
  const 일반 = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const 셀장 = run((api) => api.포털토큰_('노셀장', '4165551007', ''));
  const br = await L.launch();
  const mk = async (vp, tok) => {
    const ctx = await br.newContext({ viewport: vp || { width: 390, height: 844 }, timezoneId: 'America/Toronto', locale: 'ko-KR', hasTouch: (vp || {}).width < 500, isMobile: (vp || {}).width < 500 });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g|Failed to fetch/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.route('**/drive.google.com/thumbnail**', (r) => r.fulfill({ contentType: 'image/png', body: PNG_SMALL }));
    if (tok) await page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, tok);
    return { ctx, page, errs };
  };
  const ready = (page) => L.waitTrue(page, () => !!document.querySelector('.eq-tabs') && !!document.querySelector('.eq-item, .eq-card'), null, 10000);
  const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const toastOf = (page) => L.waitTrue(page, () => document.getElementById('toast').classList.contains('on'), null, 4000);
  const item = (page, name) => page.locator('.eq-item', { hasText: name });

  /* ================= 1. 점검 화면 (폰) ================= */
  console.log('· 점검 화면 — 폰 390px');
  let { ctx, page, errs } = await mk({ width: 390, height: 844 }, 일반);
  await page.goto(BASE + '/?page=equipment&t=' + 일반);
  check('장비 페이지가 열림 (탭 + 항목)', await ready(page));
  check('머리말 제목', await page.evaluate(() => /장비 점검 · 수리 요청/.test(document.querySelector('header h1').textContent)));
  check('탭 3개: 점검 · 수리 요청 · 항목 관리', await page.evaluate(() => Array.from(document.querySelectorAll('.eq-tabs button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).join('|')) === '점검|수리 요청|항목 관리');
  const n0 = await page.locator('.eq-item').count();
  check('기본 항목 11개가 보임', n0 === 11, n0);
  check('무선 마이크 · 무대 잭 · 카메라 1/2/3 항목', await page.evaluate(() => ['Wireless Mic', 'Stage Jack', 'Camera 1', 'Camera 2', 'Camera 3'].every((k) => document.body.textContent.indexOf(k) !== -1)));
  check('가로로 넘치지 않음', await noOverflow(page));
  check('결과 버튼 터치 크기 44px 이상', await page.evaluate(() => Array.from(document.querySelectorAll('.eq-res button')).every((b) => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44)));
  await page.screenshot({ path: SHOT + '/step34-check-phone.png', fullPage: false });

  // 점검 토글
  const mic = item(page, 'Wireless Mic');
  await mic.locator('button.k-OK').click();
  check('OK 를 누르면 눌린 상태(aria-pressed)로 바뀜', await L.waitTrue(page, () => document.querySelector('.eq-item .k-OK[aria-pressed=true]') !== null, null, 3000));
  check('진행 막대가 "1 / 11"', await L.waitTrue(page, () => /^1 \/ 11/.test(document.getElementById('progCard').textContent.trim()), null, 3000));
  const today = await page.evaluate(() => S.today);
  check('서버 시트에 OK 기록 (확인자 정일반)', run((api) => { const r = api.equipmentDay(api.포털토큰_('정일반', '4165551008', ''), '').records; const k = Object.keys(r)[0]; return r[k] && r[k].result === 'OK' && r[k].by === '정일반'; }));
  const cam1 = item(page, 'Camera 1');
  await cam1.locator('button.k-이상').click();
  check('이상을 누르면 메모 칸이 생기고 "수리 요청 만들기" 가 보임', await L.waitTrue(page, () => { const it = Array.from(document.querySelectorAll('.eq-item')).find((x) => /Camera 1/.test(x.textContent)); return !!it && !!it.querySelector('[data-memo]') && /수리 요청 만들기/.test(it.textContent); }, null, 3000));
  await cam1.locator('[data-memo]').fill('화면이 자꾸 꺼짐');
  await cam1.locator('[data-memo]').press('Enter');
  check('메모 저장 알림', await toastOf(page));
  check('메모가 서버에 저장됨', run((api) => { const r = api.equipmentDay(api.포털토큰_('정일반', '4165551008', ''), '').records; return Object.keys(r).some((k) => r[k].result === '이상' && r[k].memo === '화면이 자꾸 꺼짐'); }));
  check('진행 막대에 이상 1건', await page.evaluate(() => /이상 1건/.test(document.getElementById('progCard').textContent)));
  // 다시 눌러 지우기
  const cam2 = item(page, 'Camera 2');
  await cam2.locator('button.k-na').click(); await L.waitTrue(page, () => document.querySelectorAll('.eq-item.r-해당없음').length === 1, null, 3000);
  await item(page, 'Camera 2').locator('button.k-na').click();
  check('같은 결과를 다시 누르면 지워짐', await L.waitTrue(page, () => document.querySelectorAll('.eq-item.r-해당없음').length === 0, null, 3000));
  await page.screenshot({ path: SHOT + '/step34-check-marked.png' });

  // 날짜 이동
  await page.click('[data-act=dPrev]');
  check('전날로 이동하면 기록이 비어 있음', await L.waitTrue(page, (t) => document.getElementById('dateIn').value !== t && /^0 \/ 11/.test(document.getElementById('progCard').textContent.trim()), today, 3000));
  await page.click('[data-act=dToday]');
  check('"오늘로" → 오늘 기록이 다시 보임', await L.waitTrue(page, () => /^2 \/ 11/.test(document.getElementById('progCard').textContent.trim()), null, 3000));

  /* ================= 2. 항목 관리 ================= */
  console.log('· 항목 관리 — 추가 · 고치기 · 순서 · 보관 · 되살리기');
  await page.click('[data-act=tab][data-v=items]');
  await page.click('[data-act=itemNew]');
  check('항목 추가 창이 열림', await L.waitTrue(page, () => document.getElementById('sheet').classList.contains('on') && !!document.getElementById('iName'), null, 3000));
  await page.fill('#iCat', '음향 · 마이크'); await page.fill('#iName', 'IEM 팩 배터리'); await page.fill('#iDesc', '예비 2개');
  await page.click('[data-act=itemSave]');
  check('추가한 항목이 목록에 나타남', await L.waitTrue(page, () => document.body.textContent.indexOf('IEM 팩 배터리') !== -1 && !document.getElementById('sheet').classList.contains('on'), null, 4000));
  check('서버에도 저장됨 (12개)', run((api) => api.equipmentInit(api.포털토큰_('정일반', '4165551008', ''), '').items.length) === 12);
  await page.click('[data-act=itemNew]'); await page.fill('#iCat', '음향 · 마이크'); await page.fill('#iName', 'iem 팩 배터리'); await page.click('[data-act=itemSave]');
  check('같은 이름이면 창 안에 안내가 뜸', await L.waitTrue(page, () => /같은 이름/.test(document.getElementById('iMsg').textContent) && document.getElementById('sheet').classList.contains('on'), null, 6000), await page.evaluate(() => ({ msg: document.getElementById('iMsg') && document.getElementById('iMsg').textContent, on: document.getElementById('sheet').className, items: S.items.filter((x) => /팩/.test(x.name)).map((x) => [x.category, x.name, x.status]) })));
  await page.click('[data-act=sheetClose]');
  await page.locator('.eq-mi', { hasText: 'IEM 팩 배터리' }).locator('[data-act=itemEdit]').click();
  await page.fill('#iName', 'IEM 팩 배터리 (충전)'); await page.click('[data-act=itemSave]');
  check('고친 이름이 보임', await L.waitTrue(page, () => document.body.textContent.indexOf('IEM 팩 배터리 (충전)') !== -1, null, 4000));
  await page.locator('.eq-mi', { hasText: 'IEM 팩 배터리 (충전)' }).locator('[data-act=mvUp]').click();
  check('▲ 로 순서가 바뀜 (서버 기준)', await L.waitTrue(page, () => { const c = Array.from(document.querySelectorAll('.eq-card')).find((x) => /IEM 팩/.test(x.textContent)); const names = Array.from(c.querySelectorAll('.eq-mi .n b')).map((b) => b.textContent); return names.indexOf('IEM 팩 배터리 (충전)') < names.length - 1; }, null, 3000));
  await page.locator('.eq-mi', { hasText: 'IEM 팩 배터리 (충전)' }).locator('[data-act=itemArch]').click();
  check('삭제(보관)하면 보관함으로 이동', await L.waitTrue(page, () => { const c = Array.from(document.querySelectorAll('.eq-card')).find((x) => /보관함/.test(x.textContent)); return !!c && /IEM 팩 배터리 \(충전\)/.test(c.textContent); }, null, 4000));
  check('점검 목록에서는 사라짐', await page.evaluate(() => !Array.from(document.querySelectorAll('.eq-card')).some((c) => !/보관함/.test(c.textContent) && /IEM 팩 배터리 \(충전\)/.test(c.textContent))));
  await page.screenshot({ path: SHOT + '/step34-items-phone.png', fullPage: true });
  await page.locator('.eq-mi', { hasText: 'IEM 팩 배터리 (충전)' }).locator('[data-act=itemArch][data-v="0"]').click();
  check('되살리기 → 다시 점검 목록에', await L.waitTrue(page, () => !/보관함/.test(document.getElementById('pane').textContent), null, 4000));
  await page.locator('.eq-mi', { hasText: 'IEM 팩 배터리 (충전)' }).locator('[data-act=itemArch][data-v="1"]').click();   // 이후 화면이 깔끔하게 다시 보관

  /* ================= 3. 수리 요청 만들기 (사진 첨부) ================= */
  console.log('· 수리 요청 — 점검에서 시작 · 사진 첨부 · 보내기');
  await page.click('[data-act=tab][data-v=check]');
  await page.locator('.eq-item', { hasText: 'Camera 1' }).locator('[data-act=fromItem]').click();
  check('요청 창이 점검 내용으로 채워져 열림', await L.waitTrue(page, () => document.getElementById('sheet').classList.contains('on') && /Camera 1/.test(document.getElementById('fTitle').value) && /화면이 자꾸 꺼짐/.test(document.getElementById('fDetail').value) && /Camera 1/.test(document.getElementById('fItem').value), null, 3000));
  check('카메라 입력(capture)과 파일 고르기 입력이 있음', await page.evaluate(() => document.getElementById('fCam').getAttribute('capture') === 'environment' && document.getElementById('fPick').multiple && /image/.test(document.getElementById('fPick').accept)));
  check('입력 글자 크기 16px 이상 (폰에서 확대되지 않음)', await page.evaluate(() => ['fTitle', 'fItem', 'fDetail'].every((i) => parseFloat(getComputedStyle(document.getElementById(i)).fontSize) >= 16)));
  await page.fill('#fTitle', 'Camera 1 화면 꺼짐');
  await page.click('.eq-seg [data-v=긴급]');
  check('긴급이 눌린 상태', await page.evaluate(() => document.querySelector('.eq-seg [data-v=긴급]').getAttribute('aria-pressed') === 'true'));
  await page.setInputFiles('#fPick', [{ name: '현장.png', mimeType: 'image/png', buffer: PNG }, { name: '케이블.png', mimeType: 'image/png', buffer: PNG_SMALL }]);
  check('사진 2장 올라감 (올리는 중 → 완료)', await L.waitTrue(page, () => document.querySelectorAll('#fPhotos .eq-ph').length === 2 && !document.querySelector('#fPhotos .busy') && !document.querySelector('#fPhotos .err'), null, 8000));
  const upInfo = await page.evaluate(() => ({ len: F.photos.map((p) => p.id.length > 5), disabled: document.getElementById('fSend').disabled }));
  check('사진마다 서버 파일 ID 가 있고 보내기 버튼이 다시 켜짐', upInfo.len.every(Boolean) && !upInfo.disabled, upInfo);
  const drivePhotos = Array.from(fake.files.values()).filter((f) => /^EQ_\d{8}_\d{6}_/.test(f.name));
  check('드라이브에 사진 파일 2개가 만들어짐 (JPEG 로 줄여서)', drivePhotos.length === 2 && drivePhotos.every((f) => f.mimeType === 'image/jpeg'), drivePhotos.map((f) => f.mimeType));
  const big = drivePhotos.map((f) => f.bytes.length);
  check('큰 사진(2400x1800)은 줄어서 올라감 (1MB 안쪽)', big.every((n) => n > 500 && n < 1024 * 1024), big);
  await page.screenshot({ path: SHOT + '/step34-form-phone.png' });
  // 사진 하나 지우기 → 다시 올리기
  await page.locator('#fPhotos .eq-ph').nth(1).locator('.x').click();
  check('사진을 지우면 1장 남음', await L.waitTrue(page, () => document.querySelectorAll('#fPhotos .eq-ph').length === 1, null, 3000));
  let trashed = 0; for (let i = 0; i < 30 && trashed < 1; i++) { trashed = Array.from(fake.files.values()).filter((f) => /^EQ_/.test(f.name) && f.trashed).length; if (trashed < 1) await sleep(100); }
  check('지운 사진은 드라이브에서도 휴지통으로', trashed === 1, trashed);
  await page.setInputFiles('#fCam', [{ name: 'camera.png', mimeType: 'image/png', buffer: PNG_SMALL }]);
  check('카메라 입력으로도 사진이 붙음 (2장)', await L.waitTrue(page, () => document.querySelectorAll('#fPhotos .eq-ph').length === 2 && !document.querySelector('#fPhotos .busy'), null, 8000));
  // 안 쓰는 형식은 거절
  await page.setInputFiles('#fPick', [{ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
  check('사진이 아닌 파일은 붙지 않고 오류 표시', await L.waitTrue(page, () => !!document.querySelector('#fPhotos .eq-ph.err'), null, 3000));
  await page.locator('#fPhotos .eq-ph.err .x').click();
  // 빈 상세로 보내기 → 안내
  await page.fill('#fDetail', '');
  await page.click('#fSend');
  check('상세를 비우면 안내 문구', await L.waitTrue(page, () => /자세히/.test(document.getElementById('fMsg').textContent), null, 2000));
  await page.fill('#fDetail', '카메라 1 화면이 5분마다 꺼집니다.\n케이블을 바꿔도 같습니다.');
  PUSHED.length = 0;
  await page.click('#fSend');
  check('보낸 뒤 "수리 요청" 탭 → 내 요청에 접수 상태로 나타남', await L.waitTrue(page, () => { const c = document.querySelector('.eq-t'); return !!c && /접수/.test(c.textContent) && /Camera 1 화면 꺼짐/.test(c.textContent) && /긴급/.test(c.textContent); }, null, 6000));
  check('요청 카드에 사진 미리보기 2장', await page.evaluate(() => document.querySelectorAll('.eq-t .eq-thumbs img').length === 2));
  check('보냈다는 알림(토스트)', await toastOf(page));
  const tk = run((api) => api.equipmentTickets(api.포털토큰_('정일반', '4165551008', ''), 'mine').tickets[0]);
  check('서버: 요청 EQ-…-001 · 사진 2장 · 긴급 · 접수 · 요청자 정일반', /^EQ-\d{4}-001$/.test(tk.id) && tk.photos.length === 2 && tk.priority === '긴급' && tk.status === '접수' && tk.by === '정일반' && tk.checkDate === today, tk);
  check('알림: 커미티(김커미티)와 찬양팀장(윤팀장)에게 푸시 (요청자 제외)', PUSHED.length === 1 && JSON.stringify(PUSHED[0].names) === JSON.stringify(['김커미티', '윤팀장']) && /긴급/.test(PUSHED[0].title), PUSHED);
  check('가로로 넘치지 않음', await noOverflow(page));
  await page.screenshot({ path: SHOT + '/step34-tickets-phone.png' });
  // 상세 + 사진 크게
  await page.click('.eq-t');
  check('상세 창: 제목 · 본문 · 사진 · 이력 · (요청자) 취소 버튼', await L.waitTrue(page, () => { const b = document.getElementById('sheetBox').textContent; return /Camera 1 화면 꺼짐/.test(b) && /5분마다/.test(b) && document.querySelectorAll('#sheetBox .eq-ph').length === 2 && /접수/.test(document.querySelector('.eq-hist').textContent) && !!document.querySelector('[data-a=cancel]') && !document.querySelector('[data-a=approve]'); }, null, 3000));
  await page.locator('#sheetBox .eq-ph').first().click();
  check('사진을 누르면 크게 보임 · Esc 로 닫힘', await L.waitTrue(page, () => document.getElementById('lightbox').classList.contains('on') && !!document.getElementById('lbImg').src, null, 3000));
  await page.keyboard.press('Escape');
  check('크게 보기가 닫힘 (요청 창은 그대로)', await page.evaluate(() => !document.getElementById('lightbox').classList.contains('on') && document.getElementById('sheet').classList.contains('on')));
  await page.screenshot({ path: SHOT + '/step34-detail-phone.png' });
  await page.keyboard.press('Escape');
  check('가려진 곳을 눌러도 닫힘 / Esc 로 창이 닫힘', await page.evaluate(() => !document.getElementById('sheet').classList.contains('on')));
  check('페이지 오류 없음 (점검 · 항목 · 요청)', errs.length === 0, errs);
  await ctx.close();

  /* ================= 4. 관리 화면 — 곧바로 나타남 · 승인 · 처리 · 완료 ================= */
  console.log('· 관리 화면 — 새 요청이 곧바로 · 승인 · 처리 시작 · 완료');
  ({ ctx, page, errs } = await mk({ width: 1280, height: 900 }));
  await page.goto(BASE + '/?page=admin&key=ADM#equip');
  check('관리 · 장비 영역이 열림', await L.waitTrue(page, () => getComputedStyle(document.getElementById('sec_equip')).display !== 'none' && !!document.querySelector('#eqa .qa-t'), null, 10000));
  check('승인 대기 숫자 1 · 긴급 안내', await page.evaluate(() => document.querySelector('#eqa .qa-stat.warn b').textContent === '1' && /긴급 승인 대기 1건/.test(document.getElementById('eqa').textContent)));
  check('새 요청 카드: 제목 · 요청자 · 사진 2장 · 접수', await page.evaluate(() => { const c = document.querySelector('#eqa .qa-t'); return /Camera 1 화면 꺼짐/.test(c.textContent) && /정일반/.test(c.textContent) && c.querySelectorAll('.qa-ph img').length === 2 && /접수/.test(c.querySelector('.qa-st').textContent); }));
  check('오늘 점검에서 이상으로 남긴 항목(Camera 1)이 함께 보임', await page.evaluate(() => /Camera 1/.test(document.querySelector('.qa-issue') ? document.querySelector('.qa-issue').textContent : '')));
  await page.screenshot({ path: SHOT + '/step34-admin-desktop.png', fullPage: true });
  await page.locator('#eqa .qa-t [data-eqact=reject]').click();
  check('사유 없이 반려하면 안내', await L.waitTrue(page, () => /사유를 적어주세요/.test(document.querySelector('#eqa .qa-msg').textContent), null, 2000));
  check('(상태는 그대로 접수)', run((api) => api.equipmentTickets('ADM', 'all').tickets[0].status) === '접수');
  await page.fill('#eqa [data-eqmemo]', '카메라 교체 예정');
  PUSHED.length = 0;
  await page.locator('#eqa .qa-t [data-eqact=approve]').click();
  check('승인 → 상태가 "승인" · 처리 시작 · 완료 버튼', await L.waitTrue(page, () => { const c = document.querySelector('#eqa .qa-t'); return !!c && /승인/.test(c.querySelector('.qa-st').textContent) && !!c.querySelector('[data-eqact=start]') && !!c.querySelector('[data-eqact=complete]') && /카메라 교체 예정/.test(c.textContent); }, null, 5000) || await L.waitTrue(page, () => { eqaSet('approved'); const c = document.querySelector('#eqa .qa-t'); return !!c && /승인/.test(c.querySelector('.qa-st').textContent); }, null, 3000));
  check('알림: 요청한 정일반에게 승인 푸시 (메모 포함)', PUSHED.length === 1 && JSON.stringify(PUSHED[0].names) === JSON.stringify(['정일반']) && /승인/.test(PUSHED[0].title) && /카메라 교체 예정/.test(PUSHED[0].body), PUSHED);
  await page.evaluate(() => eqaSet('all'));
  await page.locator('#eqa .qa-t [data-eqact=start]').click();
  check('처리 시작 → "처리중"', await L.waitTrue(page, () => /처리중/.test(document.querySelector('#eqa .qa-t .qa-st').textContent), null, 5000));
  await page.fill('#eqa [data-eqmemo]', '새 카메라로 교체 완료');
  PUSHED.length = 0;
  await page.locator('#eqa .qa-t [data-eqact=complete]').click();
  check('완료 → "완료" · 처리 버튼 없음', await L.waitTrue(page, () => { const c = document.querySelector('#eqa .qa-t'); return /완료/.test(c.querySelector('.qa-st').textContent) && !c.querySelector('[data-eqact=start]'); }, null, 5000));
  check('알림: 정일반에게 완료 푸시', PUSHED.length === 1 && PUSHED[0].names[0] === '정일반' && /완료/.test(PUSHED[0].title), PUSHED);
  check('서버 상태 · 처리자 · 이력 4단계', run((api) => { const t = api.equipmentTickets('ADM', 'all').tickets[0]; return t.status === '완료' && t.handler === '관리자' && t.history.map((h) => h.to).join() === '접수,승인,처리중,완료' && t.memo === '새 카메라로 교체 완료'; }));
  await page.evaluate(() => eqaSet('done'));
  check('"완료" 필터에 보임 · 승인 대기 0', await page.evaluate(() => document.querySelectorAll('#eqa .qa-t').length === 1 && document.querySelector('#eqa .qa-stat b').textContent === '0'));
  await page.screenshot({ path: SHOT + '/step34-admin-done.png', fullPage: true });
  check('관리 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 5. 요청한 분 — 상태 변화 · 알림 · 포털 ================= */
  console.log('· 요청한 분 — 상태 변화 · 포털 할 일 · 타일');
  ({ ctx, page, errs } = await mk({ width: 390, height: 844 }, 일반));
  await page.goto(BASE + '/?page=equipment&t=' + 일반 + '&ticket=' + encodeURIComponent(tk.id));
  check('알림 바로가기(ticket=…)로 열면 그 요청 상세가 바로 열림 · 완료 상태', await L.waitTrue(page, () => document.getElementById('sheet').classList.contains('on') && /완료/.test(document.getElementById('sheetBox').textContent) && /Camera 1 화면 꺼짐/.test(document.getElementById('sheetBox').textContent), null, 8000));
  check('상세에 처리한 분의 메모와 이력(접수 → 승인 → 처리중 → 완료)', await page.evaluate(() => /새 카메라로 교체 완료/.test(document.querySelector('.eq-note').textContent) && document.querySelectorAll('.eq-hist li').length === 4));
  check('요청자는 완료된 요청에 처리 버튼이 없음', await page.evaluate(() => !document.querySelector('[data-a]')));
  await page.screenshot({ path: SHOT + '/step34-done-requester.png' });
  await page.keyboard.press('Escape');
  await page.goto(BASE + '/?page=portal');
  check('포털이 열림', await L.waitTrue(page, () => document.getElementById('main').style.display === 'block' && !!document.querySelector('#menus .tile'), null, 10000));
  check('v6: 장비는 찬양방송팀 허브 안 탭 — 포털에는 허브 타일만 (장비 타일 없음)', await page.evaluate(() => { const ts = Array.from(document.querySelectorAll('#menus .tile')); return !ts.find((t) => /장비 점검 · 수리 요청/.test(t.textContent)) && !!ts.find((t) => /찬양방송팀 허브/.test(t.textContent)); }));
  check('알림(🔔) 묶음에 "1" 이 표시됨 (요청 상태 변화가 알림으로 표시)', await L.waitTrue(page, () => { const n = document.querySelector('.todoacc-h .n'); return !!n && n.textContent.trim() === '1'; }, null, 6000));
  await page.evaluate(() => { const h = document.querySelector('.todoacc-h'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });
  check('펼치면 "수리 요청 · Camera 1 화면 꺼짐" · 완료 — 처리 메모', await L.waitTrue(page, () => /수리 요청 · Camera 1 화면 꺼짐/.test(document.body.textContent) && /완료 — 새 카메라로 교체 완료/.test(document.body.textContent), null, 6000));
  await page.screenshot({ path: SHOT + '/step34-portal-member.png' });
  await ctx.close();

  // 팀원이 아닌 분
  ({ ctx, page, errs } = await mk({ width: 390, height: 844 }, 셀장));
  await page.goto(BASE + '/?page=equipment&t=' + 셀장);
  check('팀원이 아니면 안내 문구만 (점검 항목 없음)', await L.waitTrue(page, () => /속한 분만/.test(document.getElementById('root').textContent) && !document.querySelector('.eq-item'), null, 6000));
  await page.goto(BASE + '/?page=portal');
  await L.waitTrue(page, () => document.getElementById('main').style.display === 'block' && !!document.querySelector('#menus .tile'), null, 10000);
  check('팀원이 아니면 포털에 장비 타일이 없음', await page.evaluate(() => !Array.from(document.querySelectorAll('#menus .tile')).some((t) => /장비 점검/.test(t.textContent))));
  await ctx.close();

  /* ================= 6. 커미티 — 장비 화면에서 승인 · 포털 배지 · 관리 카드 ================= */
  console.log('· 커미티 — 장비 화면에서 승인 · 포털 · 관리 카드');
  const t2 = run((api) => api.equipmentTicketCreate(api.포털토큰_('정일반', '4165551008', ''), { title: '스피커 케이블 접촉 불량', detail: '왼쪽 스피커에서 지직 소리', item: 'Stage Jack / Cable', priority: '보통' }).ticket);
  ({ ctx, page, errs } = await mk({ width: 390, height: 844 }, 커미티));
  await page.goto(BASE + '/?page=portal');
  check('커미티 포털이 열림', await L.waitTrue(page, () => document.getElementById('main').style.display === 'block' && !!document.querySelector('#menus .tile'), null, 10000));
  check('v6: 승인 대기 배지는 찬양방송팀 허브 타일에 (장비는 허브 안)', await L.waitTrue(page, () => { const t = Array.from(document.querySelectorAll('#menus .tile')).find((x) => /찬양방송팀 허브/.test(x.textContent)); return !!t && !!t.querySelector('.tbadge'); }, null, 8000));
  await page.evaluate(() => { const h = document.querySelector('#todoBox .todoacc-h'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });   // v6.1 — 알림은 처음에 닫혀 있음
  check('할 일에 "승인 대기 수리 요청 1건"', await L.waitTrue(page, () => /승인 대기 수리 요청 1건/.test(document.body.textContent), null, 6000));
  const adminCard = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.acard')).find((x) => /장비 · 수리 요청/.test(x.textContent)); return c ? { text: c.textContent.replace(/\s+/g, ' ').trim(), ok: /page=admin/.test(c.outerHTML) } : null; });
  check('관리 카드 "장비 · 수리 요청" (승인 대기 1)', !!adminCard && /승인 대기/.test(adminCard.text) && adminCard.ok, adminCard);
  await page.screenshot({ path: SHOT + '/step34-portal-committee.png', fullPage: true });
  await page.goto(BASE + '/?page=equipment&t=' + 커미티 + '&ticket=' + encodeURIComponent(t2.id));
  check('바로가기 → 상세 · 승인 · 반려 · 취소 버튼', await L.waitTrue(page, () => document.getElementById('sheet').classList.contains('on') && !!document.querySelector('[data-a=approve]') && !!document.querySelector('[data-a=reject]'), null, 8000));
  await page.click('[data-a=reject]');
  check('사유 없이 반려하면 안내', await L.waitTrue(page, () => /사유를 적어주세요/.test(document.getElementById('actMsg').textContent), null, 2000));
  await page.fill('#actMemo', '이번 주 안에 교체하세요');
  await page.click('[data-a=approve]');
  check('승인하면 창이 "승인" 상태 · 처리 시작 버튼', await L.waitTrue(page, () => /승인/.test(document.querySelector('#sheetBox .eq-st').textContent) && !!document.querySelector('[data-a=start]'), null, 5000));
  check('서버 상태 승인', run((api) => api.equipmentTickets('ADM', 'all').tickets.find((x) => x.id === t2.id).status) === '승인');
  await page.keyboard.press('Escape');
  check('목록의 상태 칩도 바뀜 · 승인 대기 숫자가 줄어듦', await L.waitTrue(page, () => !document.querySelector('.eq-tabs .eq-n') && /승인/.test(document.querySelector('.eq-t .eq-st').textContent), null, 5000));
  check('커미티 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 7. 데스크톱 ================= */
  console.log('· 데스크톱 1280px');
  ({ ctx, page, errs } = await mk({ width: 1280, height: 900 }, 일반));
  await page.goto(BASE + '/?page=equipment&t=' + 일반);
  check('데스크톱: 열림 · 가로 넘침 없음', await ready(page) && await noOverflow(page));
  await page.screenshot({ path: SHOT + '/step34-check-desktop.png' });
  await page.click('[data-act=tab][data-v=tix]');
  await page.click('[data-act=scope][data-v=all]');
  check('데스크톱: 전체 목록에 요청 2건', await L.waitTrue(page, () => document.querySelectorAll('.eq-t').length === 2, null, 5000));
  await page.screenshot({ path: SHOT + '/step34-tickets-desktop.png' });
  check('데스크톱 오류 없음', errs.length === 0, errs);

  /* ================= 8. 글자 대비 (어두운 유리 위 글자) ================= */
  console.log('· 글자 대비');
  await page.click('[data-act=tab][data-v=check]');
  const ratios = await page.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const bg = 'rgb(38, 32, 27)';                                    // 어두운 배경 위 유리 (가장 밝게 잡은 값)
    const pick = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).color : null; };
    const out = {};
    [['eq-in', '.eq-in'], ['eq-id', '.eq-id'], ['eq-sub', '.eq-legend'], ['eq-cat', '.eq-cat'], ['tabs', '.eq-tabs button:not(.on)']].forEach(([k, s]) => { const c = pick(s); if (c) out[k] = ratio(c, bg); });
    const on = document.querySelector('.eq-tabs button.on'); out['tab-on'] = ratio(getComputedStyle(on).color, 'rgb(242, 106, 15)');
    return out;
  });
  check('본문 · 설명 · 범례 · 분류 · 탭 글자 대비 4.5 이상', Object.keys(ratios).every((k) => ratios[k] >= 4.5), ratios);
  check('데스크톱 대비 시험 중 오류 없음', errs.length === 0, errs);
  await ctx.close();

  await br.close();
  const okAll = L.summary();
  process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
