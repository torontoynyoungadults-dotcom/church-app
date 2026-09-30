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
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
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
  await page.screenshot({ path: SHOT + '/step11-portal-390.png', fullPage: false });
  await page.evaluate(() => { SERMON = null; renderSermonCard(); });
  check('설교가 없으면 주보 버튼이 한 줄을 다 씀', await page.evaluate(() => document.getElementById('bulSerRow').classList.contains('solo') && document.querySelector('#bulSerRow .pairbul').getBoundingClientRect().width > 300));
  const pair = await page.evaluate(() => { const a = document.getElementById('btnDevotion').getBoundingClientRect(), b = document.getElementById('notesBtn').getBoundingClientRect(); return { top: Math.abs(a.top - b.top), h: Math.abs(a.height - b.height), w: Math.abs(a.width - b.width) }; });
  check('두 버튼 모두 글자가 화살표(›)에 닿지 않음', await page.evaluate(() => Array.from(document.querySelectorAll('.aibtns .bulbtn.ai')).every((a) => { const b = a.querySelector('.bt b'), c = a.querySelector('.ba'); const r = document.createRange(); r.selectNodeContents(b); const t = r.getBoundingClientRect(); return t.right <= c.getBoundingClientRect().left - 2 && b.scrollWidth <= b.clientWidth + 1; })));   // 모자라면 줄바꿈으로 해결
  check('오늘의 묵상 · 내 설교 노트가 같은 줄 · 같은 크기(균형)', pair.top < 2 && pair.h < 2 && pair.w < 2, pair);

  // 신청서는 카드가 아니라 Teva Apps 격자 안 타일
  await page.evaluate(() => { renderForms({ forms: { list: [{ id: 'F1', title: '시험 수련회 신청', open: true, desc: '설명', submitted: false, closeAt: '10/30' }, { id: 'F2', title: '끝난 신청', open: false, why: '마감', submitted: true }] } }); });
  check('신청서 목록 상자(#formsBox)가 메인에 없음', await page.evaluate(() => !document.getElementById('formsBox') && !document.querySelector('#dash .fmbtn')));
  const ft = await page.evaluate(() => Array.from(document.querySelectorAll('#menus .tile.form')).map((t) => ({ title: t.querySelector('.tt').textContent, done: t.classList.contains('done'), inGrid: !!t.closest('.tiles') })));
  check('신청서가 Teva Apps 격자의 타일로 들어옴', ft.length === 2 && ft.every((x) => x.inGrid) && ft[0].title === '시험 수련회 신청' && ft[1].done, ft);
  await page.evaluate(() => { renderForms({ forms: { list: [] } }); });
  check('신청서가 없으면 타일도 없음', await page.evaluate(() => document.querySelectorAll('#menus .tile.form').length === 0));

  // 하위 메뉴
  const tt = await page.evaluate(() => Array.from(document.querySelectorAll('#menus .tile')).map((t) => t.getAttribute('data-key') || t.className.split(' ')[1]));
  check('셀모임 · 사역팀 타일이 있고 "지출환급신청서" 타일은 따로 없음', tt.indexOf('leader') !== -1 && tt.indexOf('team') !== -1 && tt.indexOf('expense') === -1, tt);
  check('타일 이름이 새 이름(셀모임 · 사역팀 · 일반 신청서 관리)', await page.evaluate(() => { const t = (k) => { const e = document.querySelector('#menus .tile.' + k + ' .tt'); return e ? e.textContent : ''; }; return t('leader') === '셀모임' && t('team') === '사역팀' && t('forms') === '일반 신청서 관리'; }));
  await page.click('#menus .tile.leader');
  const sp1 = await page.evaluate(() => ({ vis: getComputedStyle(document.getElementById('subPanel')).display !== 'none', rows: Array.from(document.querySelectorAll('#subPanel .subrow')).map((r) => r.querySelector('b').textContent), open: document.querySelector('#menus .tile.leader').getAttribute('aria-expanded') }));
  check('셀모임 → 셀 보고서 · 셀원 정보 · 대리 제출', sp1.vis && JSON.stringify(sp1.rows) === JSON.stringify(['셀 보고서', '셀원 정보', '대리 제출']) && sp1.open === 'true', sp1);
  const sp2 = await page.evaluate(() => Array.from(document.querySelectorAll('#subPanel .subrow')).map((r) => r.getAttribute('href')));
  check('하위 메뉴 주소(sub=members · sub=proxy)', /page=leader/.test(sp2[0]) && /sub=members/.test(sp2[1]) && /sub=proxy/.test(sp2[2]), sp2);
  await page.screenshot({ path: SHOT + '/step11-submenu.png' });
  await page.click('#menus .tile.team');
  const sp3 = await page.evaluate(() => ({ rows: Array.from(document.querySelectorAll('#subPanel .subrow b')).map((r) => r.textContent), exp: (Array.from(document.querySelectorAll('#subPanel .subrow')).pop() || {}).href || '', go: (Array.from(document.querySelectorAll('#subPanel .sr-go')).pop() || {}).textContent }));
  check('사역팀 → 팀 보고서 · 팀원 관리 · 지출환급신청(바로 이동 링크)', JSON.stringify(sp3.rows) === JSON.stringify(['팀 보고서', '팀원 관리', '지출환급신청']) && /page=expense/.test(sp3.exp) && /바로 이동/.test(sp3.go), sp3);
  await page.click('#subPanel .spx');
  check('닫기 버튼으로 하위 메뉴가 닫힘', await page.evaluate(() => getComputedStyle(document.getElementById('subPanel')).display === 'none'));

  // 하위 메뉴로 열면 해당 화면이 바로 열림
  await page.goto(BASE + '/?page=leader&sub=members&t=' + encodeURIComponent(커미티));
  check('셀모임 › 셀원 정보: 셀원 정보 패널이 바로 열림', await L.waitTrue(page, () => document.getElementById('dirPanel') && getComputedStyle(document.getElementById('dirPanel')).display === 'block', null, 10000));
  check('셀모임 화면 제목이 "셀모임"', await page.evaluate(() => document.querySelector('header h1').textContent.trim() === '셀모임' || /셀모임/.test(document.title)));
  await page.goto(BASE + '/?page=team&sub=members&t=' + encodeURIComponent(커미티));
  check('사역팀 › 팀원 관리: 팀원 관리 탭이 바로 열림', await L.waitTrue(page, () => document.getElementById('paneMem') && getComputedStyle(document.getElementById('paneMem')).display === 'block', null, 10000));
  check('사역팀 화면 제목이 "사역팀"', await page.evaluate(() => document.querySelector('header h1').textContent.trim() === '사역팀'));
  check('옛 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 다른 분 화면 보기 — 1:1 ================= */
  console.log('· 다른 분 화면 보기 — 교인 1:1 (내 정보 · 알림)');
  ({ ctx, page, errs } = await mk({ width: 390, height: 900 }, 커미티));
  await page.goto(BASE + '/?page=portal');
  await ready(page);
  await page.click('.astog'); await page.fill('#asName', '정일반'); await page.keyboard.press('Enter');
  check('정일반님 화면으로 바뀜', await L.waitTrue(page, () => /정일반/.test(document.getElementById('helloName').textContent) && /님이 보는 화면/.test(document.getElementById('asBox').textContent), null, 6000));
  const real = run((api) => api.getMyProfile(일반));
  const shown = await page.evaluate(() => TODOS.map((t) => t.id));
  check('알림(내 할 일)이 그분의 실제 화면과 똑같음', JSON.stringify(shown) === JSON.stringify(real.todos.map((t) => t.id)), [shown, real.todos.map((t) => t.id)]);
  check('알림 카드에는 완료 · 치우기 · 누르기 동작이 없음(보기 전용)', await page.evaluate(() => { renderTodos({ todos: [{ id: 'meet-9', kind: 'meet', title: '회의 할 일', tone: 'info', icon: '📝' }, { id: 'x1', title: '지울 수 있는 알림', tone: 'info', hideable: true, url: '?page=leader' }, { id: 'form-3', title: '신청서', tone: 'warn' }] }); const items = document.querySelectorAll('#todoBox .ti'); return VIEW && items.length === 3 && Array.from(items).every((x) => x.tagName === 'DIV' && !x.querySelector('.tick, .tix, .tigo')); }));
  check('"내 정보 관리" 버튼이 그분 화면에서도 보임', await page.evaluate(() => getComputedStyle(document.getElementById('meBtn')).display !== 'none'));
  await page.click('#meBtn');
  check('그분의 내 정보가 열리고 보기 전용(inert · 안내 문구)', await L.waitTrue(page, () => { const p = document.getElementById('profile'); return getComputedStyle(document.getElementById('profileView')).display !== 'none' && p.hasAttribute('inert') && /정일반/.test(p.textContent) && /보기 전용/.test(p.textContent); }, null, 4000));
  check('그분의 이름 · 전화번호가 그대로 보임', await page.evaluate(() => /416-555-1008/.test(document.getElementById('profile').textContent)));
  const eb = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#profile button')).find((x) => /내 정보 수정/.test(x.textContent)); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (eb) await page.mouse.click(eb.x, eb.y);
  await sleep(300);
  check('수정 버튼을 실제로 눌러도 편집 화면이 열리지 않음(inert)', await page.evaluate(() => !document.getElementById('e_phone')));
  await page.screenshot({ path: SHOT + '/step11-view-profile.png' });
  await page.click('.pvback');
  await page.click('#asBox .asview .btn');
  check('"내 화면으로" 후 내 정보는 내 것(김커미티)', await L.waitTrue(page, () => /김커미티/.test(document.getElementById('helloName').textContent), null, 4000));
  await page.click('#meBtn');
  check('내 화면의 내 정보는 편집 가능(inert 아님)', await page.evaluate(() => !document.getElementById('profile').hasAttribute('inert') && !/보기 전용/.test(document.getElementById('profile').textContent)));
  await page.click('.pvback');

  console.log('· 다른 분 화면 보기 — 새가족 1:1 (실제 첫 화면)');
  await page.click('.astog'); await page.click('#asKn'); await page.fill('#asName', '홍길동'); await page.keyboard.press('Enter');
  check('새가족 실제 첫 화면(환영 카드)이 그려짐', await L.waitTrue(page, () => { const h = document.querySelector('#nfHome .nfhome .hi'); return !!h && /홍길동님, 환영합니다/.test(h.textContent) && getComputedStyle(document.getElementById('main')).display === 'none'; }, null, 6000));
  check('보기 전용 배너 + "내 화면으로" 버튼', await page.evaluate(() => /보기 전용/.test(document.querySelector('#nfHome .nfasview').textContent) && !!document.querySelector('#nfHome .nfasview .btn')));
  check('새가족 화면의 버튼은 모두 잠김(inert · pointer-events none)', await page.evaluate(() => { const r = document.querySelector('#nfHome .nfro'); return r.hasAttribute('inert') && getComputedStyle(r).pointerEvents === 'none'; }));
  check('새가족 화면에는 로그아웃 링크가 없음(그분 것이 아님)', await page.evaluate(() => !/로그아웃/.test(document.getElementById('nfHome').textContent)));
  await page.screenshot({ path: SHOT + '/step11-view-newcomer.png' });
  await page.click('#nfHome .nfasview .btn');
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
