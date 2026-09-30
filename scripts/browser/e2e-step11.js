/** Step 11 화면 시험 — 진짜 server.js + 가짜 구글 + 진짜 크롬
 *  포털: Teva Apps 제목 · 로고/제목 클릭 · 벨(🔔) · 알림 아코디언 · 주보+설교 한 줄 · 신청서 타일 · 하위 메뉴
 *  다른 분 화면 보기 1:1 (교인 · 새가족) · 새가족 포털 편집(미리보기) · 셀 신청 가독성 · 헌금봉투 버튼
 *  관리: 옛 홈 없음 · 앱 기능 관리 탭 · 설교 · 알림 독립 · 미리보기 모달 · 찬양 허브 팀원 관리 제거 */
process.env.PORT = '4199';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:4199';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const SHOT = process.env.SHOT_DIR || '/tmp';

(async () => {
  await sleep(1200);
  const 커미티 = run((api) => api.포털토큰_('김커미티', '4165551000', ''));
  const 일반 = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const br = await L.launch();
  const PUSH_STUB = () => {
    window.__push = { on: false, calls: [] };
    window.YNPush = {
      state: () => 'default',
      subscribed: (cb) => cb(window.__push.on),
      enable: (t, ok) => { window.__push.on = true; window.__push.calls.push('enable'); ok(); },
      disable: (t, ok) => { window.__push.on = false; window.__push.calls.push('disable'); ok(); }
    };
  };
  const mk = async (vp, tok, stubPush) => {
    const ctx = await br.newContext({ viewport: vp || { width: 390, height: 800 }, timezoneId: 'America/Toronto', locale: 'ko-KR' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g|Failed to fetch/.test(m.text())) errs.push('console: ' + m.text()); });
    if (tok) await page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, tok);
    page.__stubPush = !!stubPush;
    return { ctx, page, errs };
  };
  const ready = (page) => L.waitTrue(page, () => document.getElementById('main').style.display === 'block' && !!document.querySelector('#menus .tile'), null, 10000);

  /* ================= 포털 — 제목 · 로고 · 벨 ================= */
  console.log('· 포털 — Teva Apps · 로고/제목 · 벨');
  let { ctx, page, errs } = await mk({ width: 390, height: 900 }, 커미티, true);
  await page.goto(BASE + '/?page=portal');
  check('포털이 열림', await ready(page));
  await page.evaluate(PUSH_STUB); await page.evaluate(() => renderPush());   // app.js 의 진짜 YNPush 를 시험용으로 교체
  check('제목이 Teva Apps', await page.evaluate(() => document.querySelector('#menuWrap .seclabel').textContent.trim() === 'Teva Apps'));
  check('예전 제목 "청년부 아카이브 & 예배 관리" 는 화면 어디에도 없음', await page.evaluate(() => !/아카이브 & 예배 관리|아카이브 &amp; 예배 관리/.test(document.body.innerHTML)));
  check('알림 배너(#pushBox · .pushcard)가 없음', await page.evaluate(() => !document.getElementById('pushBox') && !document.querySelector('.pushcard')));

  const bell = await page.evaluate(() => { const b = document.getElementById('bellBtn'), r = document.querySelector('.ynrefresh'); if (!b || !r) return null; const a = b.getBoundingClientRect(), c = r.getBoundingClientRect(); return { vis: getComputedStyle(b).display !== 'none', top: Math.abs(a.top - c.top), right: a.right <= c.left + 1, w: a.width, gap: c.left - a.right }; });
  check('벨이 보이고 새로고침 버튼 바로 왼쪽 같은 줄에 있음', !!bell && bell.vis && bell.top < 2 && bell.right && bell.gap < 30, bell);
  check('벨 터치 크기 40px 이상', !!bell && bell.w >= 40, bell);
  check('꺼진 상태: 벨 클릭 → 팝오버에 "알림 꺼짐" + "알림 켜기"', await (async () => { await page.click('#bellBtn'); return L.waitTrue(page, () => getComputedStyle(document.getElementById('bellPop')).display !== 'none' && /알림 꺼짐/.test(document.getElementById('bellPop').textContent) && /알림 켜기/.test(document.getElementById('bellAct').textContent), null, 3000); })());
  await page.click('#bellAct');
  check('켜기 → 벨이 켜진 모양 · 팝오버가 "알림 켜짐"', await L.waitTrue(page, () => document.getElementById('bellBtn').classList.contains('on') && /알림 켜짐/.test(document.getElementById('bellPop').textContent) && /끄기/.test(document.getElementById('bellAct').textContent), null, 3000));
  check('YNPush.enable 이 불림', await page.evaluate(() => window.__push.calls.indexOf('enable') !== -1));
  await page.screenshot({ path: SHOT + '/step11-bell.png' });
  await page.click('#bellAct');
  check('끄기 → 다시 "알림 꺼짐"', await L.waitTrue(page, () => !document.getElementById('bellBtn').classList.contains('on') && /알림 꺼짐/.test(document.getElementById('bellPop').textContent), null, 3000));
  await page.keyboard.press('Escape');
  check('Esc 로 팝오버가 닫힘', await page.evaluate(() => getComputedStyle(document.getElementById('bellPop')).display === 'none'));

  // 로고 · 제목 → 포털 첫 화면 (다른 화면에서도)
  await page.click('#meBtn');
  check('내 정보 관리 화면이 열림', await L.waitTrue(page, () => getComputedStyle(document.getElementById('profileView')).display !== 'none' && getComputedStyle(document.getElementById('dash')).display === 'none', null, 3000));
  await page.click('header h1');
  check('제목("토론토영락교회 청년1부")을 누르면 포털 첫 화면', await L.waitTrue(page, () => getComputedStyle(document.getElementById('dash')).display !== 'none' && getComputedStyle(document.getElementById('profileView')).display === 'none', null, 3000));
  await page.click('#meBtn');
  await page.click('header .homelink');
  check('로고를 누르면 포털 첫 화면', await L.waitTrue(page, () => getComputedStyle(document.getElementById('dash')).display !== 'none' && getComputedStyle(document.getElementById('profileView')).display === 'none', null, 3000));
  check('제목이 키보드로도 열림(role=link · tabindex)', await page.evaluate(() => { const h = document.querySelector('header h1'); return h.getAttribute('role') === 'link' && h.getAttribute('tabindex') === '0'; }));

  /* ================= 포털 — 알림 아코디언 · 한 줄 배치 · 타일 ================= */
  console.log('· 포털 — 알림 아코디언 · 주보+설교 · 묵상+노트 · 신청서 타일');
  await page.evaluate(() => { SELF = SELF || {}; SELF.todos = [{ id: 't1', title: '알림 하나', tone: 'info', icon: '📌' }, { id: 't2', title: '알림 둘', tone: 'notice', icon: '📣' }, { id: 't3', title: '알림 셋', tone: 'warn', icon: '⚠️' }]; renderTodos(SELF); });
  check('"내 할 일" 이 "알림" 아코디언으로 바뀜', await page.evaluate(() => { const h = document.querySelector('#todoBox .todoacc-h'); return !!h && /알림/.test(h.textContent) && !/내 할 일/.test(document.getElementById('todoBox').textContent) && h.hasAttribute('aria-expanded'); }));
  const open1 = await page.evaluate(() => document.querySelector('#todoBox .todoacc-h').getAttribute('aria-expanded'));
  await page.click('#todoBox .todoacc-h');
  const open2 = await page.evaluate(() => document.querySelector('#todoBox .todoacc-h').getAttribute('aria-expanded'));
  check('누르면 접히고/펴짐', open1 !== open2, [open1, open2]);
  check('접힌 상태에서는 카드가 안 보이고 개수 배지는 보임', await (async () => { if (open2 === 'true') await page.click('#todoBox .todoacc-h'); return page.evaluate(() => document.querySelectorAll('#todoBox .ti').length === 0 && !!document.querySelector('#todoBox .todoacc-h .n')); })());
  await page.click('#todoBox .todoacc-h');
  check('펴면 알림 카드가 보임', await page.evaluate(() => document.querySelectorAll('#todoBox .ti').length > 0));

  // 설교 영상을 넣어서 한 줄 배치 확인
  await page.evaluate(() => { SERMON = { id: 'abcdefghijk', title: '시험 설교 제목이 조금 깁니다 두 줄까지', preacher: '강산 목사', date: '2026-09-27' }; renderSermonCard(); });
  const row = await page.evaluate(() => { const a = document.querySelector('#bulSerRow .pairbul').getBoundingClientRect(), b = document.querySelector('#bulSerRow .sermoncard').getBoundingClientRect(); return { sameRow: Math.abs(a.top - b.top) < 2, sameH: Math.abs(a.height - b.height) < 2, left: a.left < b.left, wA: a.width, wB: b.width, solo: document.getElementById('bulSerRow').classList.contains('solo') }; });
  check('주보 · 설교 영상이 한 줄에 나란히(같은 높이)', row.sameRow && row.sameH && row.left && !row.solo, row);
  check('두 카드 너비가 비슷함(균형)', Math.abs(row.wA - row.wB) < 6, row);
  const hs = await page.evaluate(() => ({ pair: Array.from(document.querySelectorAll('#bulSerRow .pairbul, #bulSerRow .sermoncard')).map((x) => Math.round(x.getBoundingClientRect().height)), ai: Array.from(document.querySelectorAll('.aibtns .bulbtn.ai')).map((x) => Math.round(x.getBoundingClientRect().height)) }));
  check('주보 · 설교 영상 카드 높이가 오늘의 묵상 · 내 노트 카드와 같은 낮은 높이(≤ 76px)', hs.pair.length === 2 && hs.ai.length === 2 && hs.pair.concat(hs.ai).every((h) => h <= 76) && new Set(hs.pair.concat(hs.ai)).size === 1, hs);
  await page.screenshot({ path: SHOT + '/step11-portal-390.png', fullPage: false });
  await page.evaluate(() => { SERMON = null; renderSermonCard(); });
  check('설교가 없으면 주보 버튼이 한 줄을 다 씀', await page.evaluate(() => document.getElementById('bulSerRow').classList.contains('solo') && document.querySelector('#bulSerRow .pairbul').getBoundingClientRect().width > 300));
  const pair = await page.evaluate(() => { const a = document.getElementById('btnDevotion').getBoundingClientRect(), b = document.getElementById('notesBtn').getBoundingClientRect(); return { top: Math.abs(a.top - b.top), h: Math.abs(a.height - b.height), w: Math.abs(a.width - b.width) }; });
  check('"내 설교 노트" 이름이 "내 노트" 로 바뀜', await page.evaluate(() => document.querySelector('#notesBtn .bt b').textContent.trim() === '내 노트'));
  check('두 버튼 모두 글자가 화살표(›)에 닿지 않음', await page.evaluate(() => Array.from(document.querySelectorAll('.aibtns .bulbtn.ai')).every((a) => { const b = a.querySelector('.bt b'), c = a.querySelector('.ba'); const r = document.createRange(); r.selectNodeContents(b); const t = r.getBoundingClientRect(); return t.right <= c.getBoundingClientRect().left - 2 && b.scrollWidth <= b.clientWidth + 1; })));   // 모자라면 줄바꿈으로 해결
  check('오늘의 묵상 · 내 노트가 같은 줄 · 같은 크기(균형)', pair.top < 2 && pair.h < 2 && pair.w < 2, pair);

  // 신청서는 카드가 아니라 Teva Apps 격자 안 타일
  await page.evaluate(() => { renderForms({ forms: { list: [{ id: 'F1', title: '시험 수련회 신청', open: true, desc: '설명', submitted: false, closeAt: '10/30' }, { id: 'F2', title: '끝난 신청', open: false, why: '마감', submitted: true }] } }); });
  check('신청서 목록 상자(#formsBox)가 메인에 없음', await page.evaluate(() => !document.getElementById('formsBox') && !document.querySelector('#dash .fmbtn')));
  const ft = await page.evaluate(() => Array.from(document.querySelectorAll('#menus .tile.form')).map((t) => ({ title: t.querySelector('.tt').textContent, done: t.classList.contains('done'), inGrid: !!t.closest('.tiles') })));
  check('신청서가 Teva Apps 격자의 타일로 들어옴', ft.length === 2 && ft.every((x) => x.inGrid) && ft[0].title === '시험 수련회 신청' && ft[1].done, ft);
  await page.evaluate(() => { renderForms({ forms: { list: [] } }); });
  check('신청서가 없으면 타일도 없음', await page.evaluate(() => document.querySelectorAll('#menus .tile.form').length === 0));

  // 타일 — 하위 메뉴를 포털에 펼치지 않고 그 페이지로 바로 (탭은 페이지 안에)
  const tt = await page.evaluate(() => Array.from(document.querySelectorAll('#menus .tile')).map((t) => t.getAttribute('data-key') || t.className.split(' ')[1]));
  check('셀모임 · 사역팀 타일이 있고 "지출환급신청서" 타일은 따로 없음', tt.indexOf('leader') !== -1 && tt.indexOf('team') !== -1 && tt.indexOf('expense') === -1, tt);
  check('타일 이름이 새 이름(셀모임 · 사역팀 · 일반 신청서 관리)', await page.evaluate(() => { const t = (k) => { const e = document.querySelector('#menus .tile.' + k + ' .tt'); return e ? e.textContent : ''; }; return t('leader') === '셀모임' && t('team') === '사역팀' && t('forms') === '일반 신청서 관리'; }));
  check('타일은 펼침 패널 없이 그 페이지로 바로 가는 링크', await page.evaluate(() => { const l = document.querySelector('#menus .tile.leader'), t = document.querySelector('#menus .tile.team'); return l.tagName === 'A' && /page=leader/.test(l.getAttribute('href')) && t.tagName === 'A' && /page=team/.test(t.getAttribute('href')) && getComputedStyle(document.getElementById('subPanel')).display === 'none' && !document.querySelector('#menus .tile[aria-expanded]'); }));

  // 셀모임 페이지 — 위쪽 탭 (셀 보고서 | 셀원 정보 | 대리 제출)
  await page.goto(BASE + '/?page=leader&t=' + encodeURIComponent(커미티));
  check('셀모임 화면 제목이 "셀모임"', await L.waitTrue(page, () => document.querySelector('header h1').textContent.trim() === '셀모임' && document.getElementById('app').style.display === 'block', null, 10000));
  const lt = await page.evaluate(() => ({ tabs: Array.from(document.querySelectorAll('#app .pgtabs button')).map((b) => b.textContent.trim()), on: (document.querySelector('#app .pgtabs button.on') || {}).textContent, rep: getComputedStyle(document.getElementById('attendanceField')).display, dpanel: getComputedStyle(document.getElementById('meetingDate')).display }));
  check('탭바: 셀 보고서 | 셀원 정보 | 대리 제출 (처음엔 셀 보고서)', JSON.stringify(lt.tabs) === JSON.stringify(['셀 보고서', '셀원 정보', '대리 제출']) && lt.on === '셀 보고서', lt);
  check('탭바가 새가족 관리 탭바와 같은 모양(가로 나란히 · 둥근 유리 버튼 · 46px 이상)', await page.evaluate(() => { const bs = Array.from(document.querySelectorAll('#app .pgtabs button')); const r = bs.map((b) => b.getBoundingClientRect()); return bs.length === 3 && r.every((x) => x.height >= 46 && Math.abs(x.top - r[0].top) < 2) && getComputedStyle(bs[0]).borderRadius === '12px'; }));
  check('셀 보고서 탭: 보고서 칸들이 보이고 셀원 정보 · 대리 패널은 닫힘', await page.evaluate(() => !!document.getElementById('meetingDate').getClientRects().length && getComputedStyle(document.getElementById('dirPanel')).display === 'none' && getComputedStyle(document.getElementById('dgForm')).display === 'none' && !!document.getElementById('submitBtn').getClientRects().length));
  await page.click('#ltb_members');
  check('셀원 정보 탭: 셀원 목록 패널이 열리고 보고서 칸은 숨음', await L.waitTrue(page, () => document.getElementById('ltb_members').className === 'on' && getComputedStyle(document.getElementById('dirPanel')).display === 'block' && !document.getElementById('meetingDate').getClientRects().length && !document.getElementById('submitBtn').getClientRects().length, null, 4000));
  check('주소가 ?sub=members 로 바뀜(새로고침해도 그 탭)', await page.evaluate(() => /[?&]sub=members/.test(location.search)));
  await page.click('#ltb_proxy');
  check('양육팀(전체 셀)은 셀을 고르기 전에는 안내 문구가 보임', await L.waitTrue(page, () => document.getElementById('ltNote').style.display === 'block' && /셀을 먼저 고르면/.test(document.getElementById('ltNote').textContent), null, 3000));
  await page.selectOption('#cellSelect', { index: 1 });
  check('대리 제출 탭: 대리 작성자 지정 패널이 열리고 셀원 정보는 닫힘', await L.waitTrue(page, () => document.getElementById('ltb_proxy').className === 'on' && getComputedStyle(document.getElementById('dgForm')).display === 'block' && getComputedStyle(document.getElementById('dirPanel')).display === 'none' && !document.getElementById('meetingDate').getClientRects().length, null, 4000));
  await page.screenshot({ path: SHOT + '/step11-leader-tabs.png' });
  await page.click('#ltb_report');
  check('다시 셀 보고서 탭: 보고서가 돌아오고 패널은 모두 닫힘 · ?sub 없어짐', await L.waitTrue(page, () => !!document.getElementById('meetingDate').getClientRects().length && getComputedStyle(document.getElementById('dgForm')).display === 'none' && getComputedStyle(document.getElementById('dirPanel')).display === 'none' && !/sub=/.test(location.search), null, 4000));
  await page.goto(BASE + '/?page=leader&sub=members&t=' + encodeURIComponent(커미티));
  check('셀모임 › 셀원 정보 주소로 들어오면 그 탭이 바로 열림(포털 예전 링크도 동작)', await L.waitTrue(page, () => document.getElementById('ltb_members') && document.getElementById('ltb_members').className === 'on' && getComputedStyle(document.getElementById('dirPanel')).display === 'block', null, 10000));
  await page.goto(BASE + '/?page=leader&sub=proxy&t=' + encodeURIComponent(커미티));
  check('셀모임 › 대리 제출 주소로 들어오면 그 탭이 바로 열림(셀 고르면 패널)', await L.waitTrue(page, () => document.getElementById('ltb_proxy') && document.getElementById('ltb_proxy').className === 'on' && !document.getElementById('meetingDate').getClientRects().length, null, 10000));
  await page.selectOption('#cellSelect', { index: 1 });
  check('…셀을 고르면 대리 작성자 패널이 열림', await L.waitTrue(page, () => getComputedStyle(document.getElementById('dgForm')).display === 'block', null, 4000));

  // 사역팀 페이지 — 위쪽 탭 (팀 보고서 | 팀원 관리 | 지출환급신청)
  await page.goto(BASE + '/?page=team&t=' + encodeURIComponent(커미티));
  check('사역팀 화면 제목이 "사역팀"', await L.waitTrue(page, () => document.querySelector('header h1').textContent.trim() === '사역팀' && document.getElementById('app').style.display === 'block', null, 10000));
  const tm = await page.evaluate(() => ({ tabs: Array.from(document.querySelectorAll('#app .pgtabs > *')).map((b) => b.textContent.replace(/[↗\s]+$/, '').trim()), exp: (document.getElementById('tabExp') || {}).getAttribute && document.getElementById('tabExp').getAttribute('href') }));
  check('탭바: 팀 보고서 | 팀원 관리 | 지출환급신청', JSON.stringify(tm.tabs) === JSON.stringify(['팀 보고서', '팀원 관리', '지출환급신청']), tm);
  check('세 탭 글자 크기가 같음(링크 탭도)', await page.evaluate(() => new Set(Array.from(document.querySelectorAll('#app .pgtabs > *')).map((b) => getComputedStyle(b).fontSize)).size === 1));
  check('지출환급신청 탭은 지출환급신청서 링크(?page=expense)', /page=expense/.test(tm.exp || ''), tm);
  await page.click('#tabMem');
  check('팀원 관리 탭이 열리고 보고서는 숨음', await L.waitTrue(page, () => getComputedStyle(document.getElementById('paneMem')).display === 'block' && getComputedStyle(document.getElementById('paneRep')).display === 'none' && document.getElementById('tabMem').className === 'on', null, 4000));
  await page.click('#tabRep');
  check('팀 보고서 탭으로 돌아옴', await page.evaluate(() => getComputedStyle(document.getElementById('paneRep')).display !== 'none'));
  await page.goto(BASE + '/?page=team&sub=members&t=' + encodeURIComponent(커미티));
  check('사역팀 › 팀원 관리 주소로 들어오면 그 탭이 바로 열림', await L.waitTrue(page, () => document.getElementById('paneMem') && getComputedStyle(document.getElementById('paneMem')).display === 'block', null, 10000));
  await page.screenshot({ path: SHOT + '/step11-team-tabs.png' });
  check('옛 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 다른 분 화면 보기 — 1:1 ================= */
  console.log('· 다른 분 화면 보기 — 교인 1:1 (내 정보 · 알림)');
  ({ ctx, page, errs } = await mk({ width: 390, height: 900 }, 커미티));
  await page.goto(BASE + '/?page=portal');
  await ready(page);
  await page.click('.astog'); await page.fill('#asName', '정일반'); await page.keyboard.press('Enter');
  check('정일반님 화면으로 바뀜', await L.waitTrue(page, () => /정일반/.test(document.getElementById('helloName').textContent) && /님이 보는 화면/.test((document.getElementById('asFloat') || {}).textContent || ''), null, 6000));
  const real = run((api) => api.getMyProfile(일반));
  const shown = await page.evaluate(() => TODOS.map((t) => t.id));
  check('알림(내 할 일)이 그분의 실제 화면과 똑같음', JSON.stringify(shown) === JSON.stringify(real.todos.map((t) => t.id)), [shown, real.todos.map((t) => t.id)]);
  // 허브 v5 — 알림 카드도 그분 화면과 같은 모양(치우기 · 완료 단추까지)으로 그리고, 누르는 순간 막습니다
  check('알림 카드는 그분 화면과 같은 모양 · 눌러도 바뀌지 않음(보기 전용)', await page.evaluate(async () => { renderTodos({ todos: [{ id: 'meet-9', kind: 'meet', title: '회의 할 일', tone: 'info', icon: '📝' }, { id: 'x1', title: '지울 수 있는 알림', tone: 'info', hideable: true, url: '?page=leader' }, { id: 'form-3', title: '신청서', tone: 'warn' }] }); const h = document.querySelector('#todoBox .todoacc-h'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); const items = document.querySelectorAll('#todoBox .ti'); const x = document.querySelector('#todoBox .tix'); const n = TODOS.length; x.click(); await new Promise((r) => setTimeout(r, 200)); return VIEW && items.length === 3 && !!document.querySelector('#todoBox .tick') && TODOS.length === n && /보기 전용/.test(document.getElementById('asToast').textContent); }));
  check('"내 정보 관리" 버튼이 그분 화면에서도 보임', await page.evaluate(() => getComputedStyle(document.getElementById('meBtn')).display !== 'none'));
  await page.click('#meBtn');
  check('그분의 내 정보가 열리고 보기 전용(inert · 안내 문구)', await L.waitTrue(page, () => { const p = document.getElementById('profile'); return getComputedStyle(document.getElementById('profileView')).display !== 'none' && p.hasAttribute('inert') && /정일반/.test(p.textContent); }, null, 4000));
  check('그분의 이름 · 전화번호가 그대로 보임', await page.evaluate(() => /416-555-1008/.test(document.getElementById('profile').textContent)));
  const eb = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#profile button')).find((x) => /내 정보 수정/.test(x.textContent)); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (eb) await page.mouse.click(eb.x, eb.y);
  await sleep(300);
  check('수정 버튼을 실제로 눌러도 편집 화면이 열리지 않음(inert)', await page.evaluate(() => !document.getElementById('e_phone')));
  await page.screenshot({ path: SHOT + '/step11-view-profile.png' });
  await page.click('.pvback');
  await page.click('#asFloat .btn');
  check('"내 화면으로" 후 내 정보는 내 것(김커미티)', await L.waitTrue(page, () => /김커미티/.test(document.getElementById('helloName').textContent), null, 4000));
  await page.click('#meBtn');
  check('내 화면의 내 정보는 편집 가능(inert 아님)', await page.evaluate(() => !document.getElementById('profile').hasAttribute('inert') && !/보기 전용/.test(document.getElementById('profile').textContent)));
  await page.click('.pvback');

  console.log('· 다른 분 화면 보기 — 새가족 1:1 (실제 첫 화면)');
  await page.click('.astog'); await page.click('#asKn'); await page.fill('#asName', '홍길동'); await page.keyboard.press('Enter');
  check('새가족 실제 첫 화면(환영 카드)이 그려짐', await L.waitTrue(page, () => { const h = document.querySelector('#nfHome .nfhome .hi'); return !!h && /홍길동님, 환영합니다/.test(h.textContent) && getComputedStyle(document.getElementById('main')).display === 'none'; }, null, 6000));
  check('보기 전용 안내 띠 + "내 화면으로" 버튼 (화면 흐름 밖)', await page.evaluate(() => /보기 전용/.test(document.getElementById('asFloat').textContent) && !!document.querySelector('#asFloat .btn')));
  check('새가족 화면의 버튼을 눌러도 아무것도 바뀌지 않음', await page.evaluate(async () => { const b = Array.from(document.querySelectorAll('#nfHome button')).find((x) => /고치기/.test(x.textContent)); if (b) b.click(); await new Promise((r) => setTimeout(r, 200)); return /보기 전용/.test((document.getElementById('asToast') || {}).textContent || '') && !!document.querySelector('#nfHome .nfhome'); }));
  await page.screenshot({ path: SHOT + '/step11-view-newcomer.png' });
  await page.click('#asFloat .btn');
  check('"내 화면으로" → 내 포털로 복귀', await L.waitTrue(page, () => getComputedStyle(document.getElementById('main')).display === 'block' && /김커미티/.test(document.getElementById('helloName').textContent) && getComputedStyle(document.getElementById('lock')).display === 'none', null, 5000));
  check('화면 보기 중 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 셀 신청 · 교적 확인 — 가독성 · 헌금봉투 ================= */
  console.log('· 셀 신청 — 객관식 가독성 · 헌금봉투 신청 버튼');
  ({ ctx, page, errs } = await mk({ width: 390, height: 900 }, 일반));
  await page.goto(BASE + '/?page=portal');
  await ready(page);
  await page.evaluate(() => {
    CA = { year: '2026', prev: null, notice: '안내 글', envelopeRules: ['조건 하나', '조건 둘'],
      promise: { intro: '약속', items: [['하나', '내용']], outro: '끝' },
      options: { residency: ['시민권', '영주권', '워크퍼밋', '학생비자', '기타'], baptized: ['성인세례', '없음'] },
      form: { name: '정일반', engFirst: 'Il', engLast: 'Jung', gender: '남', birthday: '1990-01-01', phone: '416-555-1008', kakao: '', email: 'jung@example.com', address: { street: '', unit: '', city: '', postal: '' }, residency: '', baptized: '', parents: '', joinedAt: '2020-01-01', envelopeNo: '', envelopeRequest: null, cell: '1셀' } };
    document.getElementById('main').style.display = 'none';
    document.getElementById('caWrap').style.display = 'block';
    paintCellApp();
  });
  const opt = await page.evaluate(() => {
    const b = document.querySelector('#caRes button'); const cs = getComputedStyle(b);
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    // 실제 배경: 패널(어두운 유리) 위에 반투명 칩 — 패널 색을 바탕으로 합성
    const panel = parse(getComputedStyle(document.querySelector('#caWrap .panel')).backgroundColor);
    const bg = parse(cs.backgroundColor), fg = parse(cs.color);
    const base = (panel.length >= 3 && (panel[3] === undefined || panel[3] > 0.5)) ? panel.slice(0, 3) : [28, 26, 24];
    const a = bg[3] === undefined ? 1 : bg[3];
    const mix = [0, 1, 2].map((i) => base[i] * (1 - a) + bg[i] * a);
    const L1 = lum(fg), L2 = lum(mix);
    return { color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor, h: b.getBoundingClientRect().height, fontW: cs.fontWeight, ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) };
  });
  check('객관식 글자가 흰색 · 대비 4.5:1 이상', opt.color === 'rgb(255, 255, 255)' && opt.ratio >= 4.5, opt);
  check('객관식 칩 높이 48px 이상(터치)', opt.h >= 47.5, opt);
  check('칩 테두리가 또렷함(투명도 0.3 이상)', (() => { const m = opt.border.match(/[\d.]+/g).map(Number); return (m[3] === undefined ? 1 : m[3]) >= 0.3; })(), opt.border);
  await page.locator('#caRes button').nth(1).scrollIntoViewIfNeeded();
  const hover = await (async () => { const bx = await page.locator('#caRes button').nth(1).boundingBox(); await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await sleep(200); return page.evaluate(() => getComputedStyle(document.querySelectorAll('#caRes button')[1]).borderTopColor); })();
  check('마우스를 올리면 테두리가 주황빛으로 바뀜', /255, 178, 130|255, 17\d, 1[23]\d/.test(hover), hover);
  await page.locator('#caRes button').nth(1).click();
  const sel = await page.evaluate(() => { const b = document.querySelectorAll('#caRes button')[1]; const cs = getComputedStyle(b); return { on: b.classList.contains('on'), bgImg: cs.backgroundImage, color: cs.color, check: getComputedStyle(b, '::before').content, pick: CA_PICK.residency }; });
  check('선택하면 주황 그라데이션 + ✓ 표시 + 값 저장', sel.on && /linear-gradient/.test(sel.bgImg) && sel.color === 'rgb(255, 255, 255)' && /✓/.test(sel.check) && sel.pick === '영주권', sel);
  const unsel = await page.evaluate(() => getComputedStyle(document.querySelectorAll('#caRes button')[0]).backgroundImage);
  check('선택 안 된 칩은 그라데이션이 없음(구분됨)', unsel === 'none', unsel);
  await page.screenshot({ path: SHOT + '/step11-cellapp-options.png', fullPage: true });

  // 헌금봉투번호 신청 버튼
  await page.evaluate(() => document.getElementById('caEnvLab').scrollIntoView({ block: 'center' }));
  const env0 = await page.evaluate(() => { const l = document.getElementById('caEnvLab'); const r = l.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { h: r.height, onTop: l.contains(top), more: getComputedStyle(document.getElementById('caEnvMore')).display, on: l.classList.contains('on') }; });
  check('헌금봉투 신청 버튼: 높이 48px 이상 · 맨 위에서 눌림(z-index)', env0.h >= 48 && env0.onTop, env0);
  check('처음에는 꺼짐 · 발급 조건은 접혀 있음', !env0.on && env0.more === 'none', env0);
  await page.evaluate(() => document.getElementById('caEnvLab').scrollIntoView({ block: 'center' }));
  await page.click('#caEnvLab');
  const env1 = await page.evaluate(() => ({ on: document.getElementById('caEnvLab').classList.contains('on'), checked: document.getElementById('caEnv').checked, more: getComputedStyle(document.getElementById('caEnvMore')).display, bg: getComputedStyle(document.getElementById('caEnvLab')).backgroundColor }));
  check('누르면 켜짐 · 발급 조건이 펼쳐짐 · 색이 달라짐', env1.on && env1.checked && env1.more === 'block', env1);
  await page.evaluate(() => document.getElementById('caEnvAgreeLab').scrollIntoView({ block: 'center' }));
  await page.click('#caEnvAgreeLab');
  check('조건 확인 체크가 눌림(강조)', await page.evaluate(() => document.getElementById('caEnvAgree').checked && document.getElementById('caEnvAgreeLab').classList.contains('on')));
  await page.click('#caEnvLab');
  check('다시 누르면 꺼짐 · 조건 확인도 함께 풀림', await page.evaluate(() => !document.getElementById('caEnv').checked && !document.getElementById('caEnvAgree').checked && getComputedStyle(document.getElementById('caEnvMore')).display === 'none'));
  await page.screenshot({ path: SHOT + '/step11-cellapp-env.png', fullPage: true });

  // 프로필의 헌금봉투 신청 · 신청하기(꺼짐/켜짐)
  await page.evaluate(() => { document.getElementById('caWrap').style.display = 'none'; document.getElementById('main').style.display = 'block'; showProfile(true); });
  await L.waitTrue(page, () => !!document.getElementById('envOpen'), null, 4000);
  const eo = await page.evaluate(() => { const b = document.getElementById('envOpen'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b ? { h: r.height, onTop: b.contains(top), img: getComputedStyle(b).backgroundImage } : null; });
  check('프로필 "헌금봉투번호 신청하기": 높이 48px 이상 · 맨 위 · 주황 활성', !!eo && eo.h >= 47.5 && eo.onTop && /linear-gradient/.test(eo.img), eo);
  await page.click('#envOpen');
  const g0 = await page.evaluate(() => { const g = document.getElementById('envGo'); return { dis: g.disabled, img: getComputedStyle(g).backgroundImage, bs: getComputedStyle(g).borderTopStyle }; });
  check('동의 전 "신청하기"는 비활성 — 점선 · 회색(활성과 확실히 다름)', g0.dis && g0.img === 'none' && g0.bs === 'dashed', g0);
  await page.evaluate(() => document.getElementById('envAgreeBox').scrollIntoView({ block: 'center' }));
  await page.click('#envAgreeBox');
  const g1 = await page.evaluate(() => { const g = document.getElementById('envGo'); return { dis: g.disabled, img: getComputedStyle(g).backgroundImage, h: g.getBoundingClientRect().height }; });
  check('동의하면 "신청하기"가 활성 — 주황 · 48px 이상', !g1.dis && /linear-gradient/.test(g1.img) && g1.h >= 47.5, g1);
  check('셀 신청 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 관리 화면 ================= */
  console.log('· 관리 — 옛 홈 없음 · 앱 기능 관리 탭 · 설교/알림 독립 · 미리보기 모달');
  ({ ctx, page, errs } = await mk({ width: 1000, height: 900 }));
  await page.goto(BASE + '/?page=admin&key=ADM');
  check('#없이 관리 페이지를 열면 옛 홈 대신 포털로 이동', await L.waitTrue(page, () => /page=portal|^\/$|\/\?/.test(location.search + location.pathname) && !document.getElementById('sec_home'), null, 8000));
  await page.goto(BASE + '/?page=admin&key=ADM#app');
  check('앱 기능 관리가 열림', await L.waitTrue(page, () => document.getElementById('main') && getComputedStyle(document.getElementById('main')).display !== 'none' && getComputedStyle(document.getElementById('sec_app')).display !== 'none', null, 8000));
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#sec_app .subtabs button, #sec_app [id^="st_app_"]')).map((b) => b.textContent.trim()));
  check('앱 기능 관리 탭: 메뉴 순서 · AI 설정 · 일정 관리 · 권한 관리', ['메뉴 순서', 'AI 설정', '일정 관리', '권한 관리'].every((t) => tabs.some((x) => x.indexOf(t) !== -1)), tabs);
  check('앱 기능 관리 안에 설교/알림 패널이 없음(독립)', await page.evaluate(() => !document.querySelector('#sec_app #wordAdmin, #sec_app #pa_send')));
  for (const sub of ['ai', 'sched', 'perm', 'menu']) {
    await page.evaluate((s) => go('app', s), sub);
    check('탭 ' + sub + ' 이 열림', await page.evaluate((s) => { const p = document.getElementById('ap_' + s) || document.getElementById('app_' + s); return !p || getComputedStyle(p).display !== 'none'; }, sub));
  }
  await page.evaluate(() => go('word'));
  check('설교 · 말씀 관리가 독립 메뉴로 열림', await L.waitTrue(page, () => getComputedStyle(document.getElementById('sec_word')).display !== 'none', null, 8000));
  await page.evaluate(() => go('push'));
  check('알림 · 이메일 관리가 독립 메뉴로 열림', await L.waitTrue(page, () => getComputedStyle(document.getElementById('sec_push')).display !== 'none' && !!document.getElementById('pgTitle'), null, 10000));

  // 미리보기 모달 — 공지
  await page.fill('#pgTitle', '10/11 사역 박람회 안내');
  await page.fill('#pgBody', '첫 줄 안내입니다.\n\n둘째 문단 — 자세한 내용은 아래 버튼으로 확인해주세요.');
  await page.click('button:has-text("미리보기 (푸시 · 이메일)")');
  check('미리보기 모달이 열림 · 푸시 배너 + 이메일 iframe', await L.waitTrue(page, () => document.getElementById('pvBack') && document.getElementById('pvBack').classList.contains('on') && !!document.querySelector('#pvPush .pvBanner .tt') && !!document.getElementById('pvMailFrame').srcdoc, null, 6000));
  const pv = await page.evaluate(() => ({ push: document.querySelector('#pvPush .tt').textContent, body: document.querySelector('#pvPush .bd').textContent, cnt: document.getElementById('pvCnt').textContent, head: document.getElementById('pvMailHead').textContent, html: document.getElementById('pvMailFrame').srcdoc }));
  check('푸시 배너에 제목 · 짧은 본문', pv.push === '10/11 사역 박람회 안내' && /첫 줄 안내입니다\./.test(pv.body), pv);
  check('이메일에 헤더 · 카드 본문 · 버튼 · 꼬리말', /토론토영락교회 청년1부/.test(pv.html) && /둘째 문단/.test(pv.html) && /포털에서 확인하기/.test(pv.html) && /650 McNicoll/.test(pv.html), pv.html.slice(0, 200));
  check('이메일 제목이 "[청년1부] …"', /\[청년1부\] 10\/11 사역 박람회 안내/.test(pv.head), pv.head);
  await page.evaluate(() => { const f = document.getElementById('pvMailFrame'); f.style.height = '520px'; });
  await page.screenshot({ path: SHOT + '/step11-preview-modal.png' });
  // 모달 안에서 고치면 실시간 반영
  await page.fill('#pvTitle', '고친 제목');
  check('모달에서 제목을 고치면 푸시 · 이메일 미리보기가 바로 바뀜', await L.waitTrue(page, () => document.querySelector('#pvPush .tt').textContent === '고친 제목' && /고친 제목/.test(document.getElementById('pvMailFrame').srcdoc), null, 4000));
  check('…위 폼의 제목도 함께 바뀜', await page.evaluate(() => document.getElementById('pgTitle').value === '고친 제목'));
  await page.fill('#pvBody', '길게 '.repeat(80));
  check('긴 본문은 푸시에서 100자 이내로 줄고 이메일에는 그대로', await L.waitTrue(page, () => document.querySelector('#pvPush .bd').textContent.length <= 100 && (document.getElementById('pvMailFrame').srcdoc.match(/길게/g) || []).length >= 60, null, 4000));
  await page.keyboard.press('Escape');
  check('Esc 로 닫힘', await page.evaluate(() => !document.getElementById('pvBack').classList.contains('on')));
  // 종류별 미리보기
  await page.evaluate(() => document.getElementById('sec_push').scrollIntoView());
  await page.evaluate(() => go('push', 'auto'));
  await L.waitTrue(page, () => !!document.querySelector('#pa_auto .pkrow'), null, 5000);
  await page.click('#pa_auto .pkrow button:has-text("미리보기")');
  check('알림 종류 미리보기 — 이메일 카드에 붙는 안내 문구 입력칸', await L.waitTrue(page, () => document.getElementById('pvBack').classList.contains('on') && !!document.getElementById('pvNote') && !!document.querySelector('#pvPush .tt'), null, 6000));
  await page.fill('#pvNote', '문의는 청년부 커미티에게');
  check('안내 문구가 이메일에만 실림(푸시에는 없음)', await L.waitTrue(page, () => /문의는 청년부 커미티에게/.test(document.getElementById('pvMailFrame').srcdoc) && !/문의는 청년부 커미티에게/.test(document.getElementById('pvPush').textContent), null, 4000));
  await page.keyboard.press('Escape');
  check('관리 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();

  console.log('· 찬양 허브 — 팀원 관리 모듈 제거');
  ({ ctx, page, errs } = await mk({ width: 420, height: 900 }));
  await page.goto(BASE + '/?page=worship&key=ADM');
  check('허브가 열림', await L.waitTrue(page, () => window.W && window.D && window.D.positions && window.D.positions.length > 0, null, 10000));
  check('팀원 관리 버튼 · 탭 · 함수가 없음', await page.evaluate(() => !document.getElementById('mgbar') && !document.querySelector('.mgbtn') && typeof window.teamTab === 'undefined' && typeof window.loadTeamMgr === 'undefined' && !Array.from(document.querySelectorAll('#tabs button')).some((b) => /팀원/.test(b.textContent))));
  check('다른 탭(예배콘티 · 공지 · 스케줄 · 행사 · 통계 · 아카이브)은 그대로', await page.evaluate(() => Array.from(document.querySelectorAll('#tabs button')).map((b) => b.textContent.trim()).join(',') === '예배콘티,공지사항,스케줄표,행사,통계,아카이브'));
  check('허브 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 내 노트 ================= */
  console.log('· 내 노트 — 설교 노트 / QT · 묵상 노트');
  ({ ctx, page, errs } = await mk({ width: 1100, height: 900 }, 일반));
  const E2 = global.__E2E;
  await page.goto(BASE + '/?page=notes&t=' + encodeURIComponent(일반));
  check('제목이 "내 노트" · 모드 단추 2개(설교 노트 | QT · 묵상 노트)', await L.waitTrue(page, () => document.getElementById('ttl') && document.getElementById('ttl').textContent === '내 노트' && document.getElementById('modeSermon').textContent.trim().indexOf('설교 노트') !== -1 && document.getElementById('modeQt').textContent.trim().indexOf('QT · 묵상 노트') !== -1 && !!document.querySelector('#cards .yn-empty'), null, 10000));
  check('처음에는 설교 노트가 선택됨', await page.evaluate(() => document.getElementById('modeSermon').getAttribute('aria-selected') === 'true' && document.getElementById('modeQt').getAttribute('aria-selected') === 'false'));
  // 설교 노트 — 날짜를 고르면 그 주 주보에서 자동으로 채움
  await page.click('#fab');
  check('설교 노트 편집기: 설교자 칸 · 주보에서 불러오기가 있고 성경 책 고르기는 없음', await L.waitTrue(page, () => !!document.getElementById('ynTitle') && !!document.getElementById('ynFill') && !document.getElementById('ynBook') && document.getElementById('ynTitle').placeholder === '설교 제목', null, 5000));
  check('처음 날짜(이번 주일)의 주보 내용이 자동으로 채워짐', await L.waitTrue(page, () => document.getElementById('ynTitle').value === '베드로 (1) 부르시는 주님' && document.getElementById('ynPre').value === '강산 목사', null, 5000));
  await page.fill('#ynDate', E2.PREV);
  check('날짜를 지난주로 고르면 그 주 주보(제목 · 본문 · 설교자)로 바뀜', await L.waitTrue(page, () => document.getElementById('ynTitle').value === '지난주 말씀' && document.getElementById('ynRef').value === '요한복음 1:1-5' && document.getElementById('ynPre').value === '전대혁 목사', null, 5000));
  await page.fill('#ynTaBody', '설교 필기 시험');
  check('설교 노트가 서버에 저장됨(source ≠ qt)', await L.waitTrue(page, () => true, null, 100) && await (async () => { for (let i = 0; i < 40; i++) { const r = run((api) => api.sermonNotesInit(일반)).notes.filter((n) => n.title === '지난주 말씀'); if (r.length) return r[0].source !== 'qt'; await sleep(250); } return false; })());

  // QT · 묵상 노트 — 본문 · 묵상을 직접
  await page.click('#modeQt');
  check('QT 모드로 바꾸면 설교 노트는 목록에서 빠지고 안내가 QT 용으로 바뀜', await L.waitTrue(page, () => document.getElementById('modeQt').getAttribute('aria-selected') === 'true' && /QT · 묵상 노트가 없어요/.test(document.getElementById('cards').textContent) && document.getElementById('fab').textContent.indexOf('새 QT 노트') !== -1, null, 5000));
  await page.click('#fab');
  check('QT 편집기: 성경 책 고르기 + 본문 칸, 설교자 · 주보 불러오기는 없음', await L.waitTrue(page, () => !!document.getElementById('ynBook') && !document.getElementById('ynFill') && getComputedStyle(document.getElementById('ynPre').closest('label')).display === 'none' && document.getElementById('ynTitle').placeholder.indexOf('묵상 제목') !== -1, null, 5000));
  check('탭 이름이 "본문 · 관찰" / "묵상 · 적용" · 날짜는 오늘', await page.evaluate(() => { const d = new Date(), t = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); return document.getElementById('ynTabBody').textContent === '본문 · 관찰' && document.getElementById('ynTabRef').textContent === '묵상 · 적용' && document.getElementById('ynDate').value === t; }));
  check('QT 노트는 주보를 자동으로 채우지 않음(제목 · 본문 비어 있음)', await page.evaluate(() => document.getElementById('ynTitle').value === '' && document.getElementById('ynRef').value === ''));
  await page.selectOption('#ynBook', '시편');
  check('성경 책을 고르면 본문 칸이 "시편 " 로 시작하고 커서가 그 칸으로 옮겨감', await L.waitTrue(page, () => document.getElementById('ynRef').value === '시편 ' && document.activeElement === document.getElementById('ynRef'), null, 3000));
  await page.keyboard.type('23:1-6');
  const bk2 = await page.evaluate(() => ({ v: document.getElementById('ynRef').value, book: document.getElementById('ynBook').value }));
  check('장:절을 직접 쓰면 본문이 "시편 23:1-6"', bk2.v === '시편 23:1-6' && bk2.book === '시편', bk2);
  await page.fill('#ynRef', '요한1서 4:7-12');
  check('본문을 직접 고쳐 쓰면 책 칸이 따라감(요한1서 ≠ 요한복음)', await page.evaluate(() => document.getElementById('ynBook').value === '요한1서'));
  await page.fill('#ynRef', '시편 23:1-6');
  await page.fill('#ynTitle', '오늘의 QT');
  await page.fill('#ynTaBody', '본문에서 관찰한 것');
  await page.click('#ynTabRef'); await page.fill('#ynTaRef', '나의 묵상과 적용');
  await page.fill('#ynDate', E2.PREV);
  await sleep(700);
  check('날짜를 바꿔도 QT 노트는 주보로 덮어쓰지 않음', await page.evaluate(() => document.getElementById('ynTitle').value === '오늘의 QT' && document.getElementById('ynRef').value === '시편 23:1-6' && document.getElementById('ynPre').value === ''));
  const qtSaved = await (async () => { for (let i = 0; i < 40; i++) { const r = run((api) => api.sermonNotesInit(일반)).notes.filter((n) => n.title === '오늘의 QT'); if (r.length) { const g = run((api) => api.sermonNoteGet(일반, r[0].id)); if (g.reflection === '나의 묵상과 적용' && g.body === '본문에서 관찰한 것') return g; } await sleep(250); } return null; })();
  check('QT 노트가 서버에 저장됨(source=qt · 본문 · 관찰 · 묵상)', !!qtSaved && qtSaved.source === 'qt' && qtSaved.ref === '시편 23:1-6' && qtSaved.preacher === '', qtSaved);
  await page.screenshot({ path: SHOT + '/step11-notes-qt.png' });
  check('QT 목록에 이 노트가 🌿 QT 표시로 보임', await L.waitTrue(page, () => Array.from(document.querySelectorAll('#cards .yn-card')).some((c) => /오늘의 QT/.test(c.textContent) && !!c.querySelector('.yn-badge.qt')), null, 5000));
  await page.click('#modeSermon');
  check('설교 모드로 돌아가면 QT 노트는 안 보이고 설교 노트만 보임', await L.waitTrue(page, () => { const t = document.getElementById('cards').textContent; return t.indexOf('지난주 말씀') !== -1 && t.indexOf('오늘의 QT') === -1; }, null, 5000));
  await page.click('#cards .yn-card');
  check('설교 노트를 열면 설교 편집기(설교자 · 주보 불러오기)', await L.waitTrue(page, () => !!document.getElementById('ynFill') && !document.getElementById('ynBook') && document.getElementById('ynTitle').value === '지난주 말씀', null, 5000));
  await page.click('#modeQt');
  check('열려 있던 설교 노트는 저장되고 닫힘(편집기 비움)', await L.waitTrue(page, () => !document.getElementById('ynTitle') || !document.getElementById('ynTitle').offsetParent, null, 5000));
  await page.click('#cards .yn-card');
  check('QT 노트를 열면 성경 책 칸이 시편으로 채워져 있음', await L.waitTrue(page, () => !!document.getElementById('ynBook') && document.getElementById('ynBook').value === '시편' && document.getElementById('ynTaBody').value === '본문에서 관찰한 것', null, 5000));
  await page.goto(BASE + '/?page=notes&t=' + encodeURIComponent(일반));
  check('다시 들어오면 마지막에 쓰던 QT 모드가 유지됨', await L.waitTrue(page, () => document.getElementById('modeQt') && document.getElementById('modeQt').getAttribute('aria-selected') === 'true' && /오늘의 QT/.test(document.getElementById('cards').textContent), null, 8000));
  await page.goto(BASE + '/?page=notes&mode=sermon&t=' + encodeURIComponent(일반));
  check('?mode=sermon 주소는 설교 모드로', await L.waitTrue(page, () => document.getElementById('modeSermon') && document.getElementById('modeSermon').getAttribute('aria-selected') === 'true', null, 8000));
  check('내 노트 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 새가족 포털 편집 ================= */
  console.log('· 새가족 포털 편집 — 위젯 · 글 · 실시간 미리보기 · 저장');
  ({ ctx, page, errs } = await mk({ width: 1280, height: 900 }));
  await page.goto(BASE + '/?page=newfamily&t=' + encodeURIComponent(커미티));
  check('새가족 관리가 열림', await L.waitTrue(page, () => getComputedStyle(document.getElementById('main')).display !== 'none' && !!document.getElementById('ntb_portal'), null, 10000));
  await page.click('#ntb_portal');
  check('"포털 화면" 편집 탭: 위젯 8개 + 미리보기 iframe', await L.waitTrue(page, () => document.querySelectorAll('#npEdit .npw').length === 8 && !!document.getElementById('npFrame').getAttribute('src'), null, 8000));
  const fr = () => page.frames().find((f) => /nfpreview=1/.test(f.url()));
  check('미리보기가 새가족의 실제 화면(환영 카드 · 셀 신청 · 알림)으로 그려짐', await L.waitTrue(page, () => { const f = window.frames[0]; try { const d = f.document; return !!d.querySelector('#nfHome .nfhome .hi') && /홍길동님, 환영합니다/.test(d.querySelector('#nfHome .nfhome .hi').textContent) && !!d.querySelector('#nfHome .cabtn') && !!d.querySelector('#todoBoxNf .todoacc'); } catch (e) { return false; } }, null, 10000));
  check('미리보기 안은 잠겨 있음(inert) · 머리말은 숨김', await page.evaluate(() => { const d = window.frames[0].document; return !!d.querySelector('.nfro[inert]') && getComputedStyle(d.querySelector('header')).display === 'none'; }));
  await page.fill('#npTitle', '{name}님 어서 오세요 🎉');
  check('제목을 고치면 미리보기가 바로 바뀜({name} 치환)', await L.waitTrue(page, () => /홍길동님 어서 오세요/.test(window.frames[0].document.querySelector('#nfHome .nfhome .hi').textContent), null, 4000));
  await page.fill('#npMsg', '환영합니다!\n둘째 줄');
  check('안내 문구(줄바꿈 포함)가 바뀜', await L.waitTrue(page, () => /환영합니다!/.test(window.frames[0].document.querySelector('#nfHome .nfhome .st').textContent), null, 4000));
  await page.click('#npEdit .npw:has-text("안내 카드") .tg');
  check('안내 카드를 켜면 편집 칸이 나타남', await L.waitTrue(page, () => !!document.getElementById('npNT'), null, 3000));
  await page.fill('#npNT', '수련회 안내'); await page.fill('#npNB', '10월 11일 수련회가 있습니다.'); await page.fill('#npNU', '?page=calendar');
  check('안내 카드가 미리보기에 나타남(제목 · 내용 · 버튼)', await L.waitTrue(page, () => { const d = window.frames[0].document; const n = d.querySelector('#nfHome .nfnotice'); return !!n && /수련회 안내/.test(n.textContent) && /10월 11일/.test(n.textContent) && !!n.querySelector('a[href="?page=calendar"]'); }, null, 4000));
  // 순서: 안내 카드를 맨 위로
  const idxBefore = await page.evaluate(() => { const d = window.frames[0].document; const kids = Array.from(d.querySelector('.nfro').children); return kids.findIndex((k) => k.classList.contains('nfnotice')); });
  for (let i = 0; i < 6; i++) { await page.evaluate(() => { const rows = Array.from(document.querySelectorAll('#npEdit .npw')); const i = rows.findIndex((r) => /안내 카드/.test(r.textContent)); if (i > 0) rows[i].querySelector('button[aria-label="위로"]').click(); }); }
  check('위로 버튼으로 순서를 바꾸면 미리보기 순서도 바뀜', await L.waitTrue(page, (b) => { const d = window.frames[0].document; const kids = Array.from(d.querySelector('.nfro').children); const i = kids.findIndex((k) => k.classList.contains('nfnotice')); return i >= 0 && i < b; }, idxBefore, 4000), idxBefore);
  // 위젯 끄기: 알림 끄면 사라짐
  await page.click('#npEdit .npw:has-text("알림") .tg');
  check('위젯을 끄면 미리보기에서 사라짐', await L.waitTrue(page, () => !window.frames[0].document.querySelector('#todoBoxNf .todoacc'), null, 4000));
  await page.click('#npSave');
  check('저장 → "저장했습니다"', await L.waitTrue(page, () => /저장했습니다/.test(document.getElementById('npMsgLine').textContent), null, 5000));
  await page.screenshot({ path: SHOT + '/step11-nf-editor.png' });
  const saved = run((api) => api.새가족포털설정11_());
  check('서버에 저장됨(제목 · 안내 카드 · 위젯 순서)', /어서 오세요/.test(saved.title) && saved.notice.title === '수련회 안내' && saved.widgets[0].id !== 'welcome' && saved.widgets.find((w) => w.id === 'todos').on === false, saved);
  await ctx.close();

  // 저장한 화면이 새가족 본인에게도 그대로
  ({ ctx, page, errs } = await mk({ width: 390, height: 900 }));
  const nfTok = run((api) => api.새가족토큰_('saessak@example.com'));
  const nfTok2 = (() => { try { return run((api) => api.새가족토큰_('hong@example.com')); } catch (e) { return ''; } })();
  await page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); localStorage.setItem('ynPortalToken', t); } catch (e) {} }, nfTok2 || nfTok);
  // 새가족 로그인 표로 실제 화면을 연다 (홍길동 이메일이 없으면 가짜 자료로 renderNfHome 시험)
  await page.goto(BASE + '/?page=portal');
  await L.waitTrue(page, () => getComputedStyle(document.getElementById('entering')).display === 'none', null, 8000);
  const real2 = await page.evaluate((h) => { renderNfHome(h); const d = document.getElementById('nfHome'); return { hi: (d.querySelector('.nfhome .hi') || {}).textContent, notice: !!d.querySelector('.nfnotice'), first: d.firstElementChild && d.firstElementChild.className, logout: /로그아웃/.test(d.textContent), edit: !!Array.from(d.querySelectorAll('button')).find((b) => /내 등록 정보 고치기/.test(b.textContent)) }; },
    { token: '', name: '김새싹', email: 's@example.com', joinedAt: '2026-09-20', status: '진행중', mine: null, cellApp: {}, myCell: null, forms: { list: [] }, todos: [], portalCfg: saved });
  check('새가족 본인 화면: 편집한 제목 · 안내 카드 · 순서가 그대로 · 로그아웃/고치기 유지', /김새싹님 어서 오세요/.test(real2.hi) && real2.notice && /nfnotice/.test(real2.first) && real2.logout && real2.edit, real2);
  await ctx.close();
  run((api) => api.resetNewcomerPortalConfig(커미티));

  await br.close();
  const okAll = L.summary();
  process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
