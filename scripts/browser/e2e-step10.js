/** Step 10 화면 시험 — 진짜 server.js + 가짜 구글 + 진짜 크롬
 *  포털(검색 z-index · 새가족 검색/바로가기 · 화면 보기 · 설교노트 메뉴 · 제목 · 아이콘 크기)
 *  찬양 허브(교적에서 객원 찾기) · 주보 편집/보기(추가 페이지) */
process.env.PORT = '4198';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:4198';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const SHOT = process.env.SHOT_DIR || '/tmp/claude-0/-home-claude/2aa96b4c-631a-5597-833a-1d9bf1b64cba/scratchpad';
const E = () => global.__E2E;

(async () => {
  await sleep(1200);
  const 커미티 = run((api) => api.포털토큰_('김커미티', '4165551000', ''));
  const 일반 = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const br = await L.launch();
  const mk = async (vp, tok) => {
    const ctx = await br.newContext({ viewport: vp || { width: 390, height: 800 }, timezoneId: 'America/Toronto', locale: 'ko-KR' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    if (tok) await page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, tok);
    return { ctx, page, errs };
  };

  /* ================= 포털 ================= */
  console.log('· 포털 — 제목 · 설교 노트 · 아이콘');
  let { ctx, page, errs } = await mk({ width: 390, height: 800 }, 커미티);
  await page.goto(BASE + '/?page=portal');
  check('포털이 열림', await L.waitTrue(page, () => document.getElementById('main').style.display === 'block' && !!document.querySelector('#menus .tile'), null, 10000));
  check('제목이 "Teva Apps" (Step 11 에서 "청년부 아카이브 & 예배 관리" 를 바꿈)', await page.evaluate(() => document.querySelector('#menuWrap .seclabel').textContent.trim() === 'Teva Apps'), await page.evaluate(() => document.querySelector('#menuWrap .seclabel').textContent));
  check('예전 제목 "청년부 행정" 은 없음', await page.evaluate(() => !/청년부 행정/.test(document.body.innerText)));
  check('내 설교 노트가 프로필 카드(.hero) 안에 없음', await page.evaluate(() => !document.querySelector('.hero #notesBtn') && !document.querySelector('.hero a[href*="page=notes"]')));
  check('내 설교 노트가 메인 메뉴(오늘의 묵상 옆)에 있음 + 로그인 표 포함', await page.evaluate(() => { const a = document.getElementById('notesBtn'); return !!a && !!a.closest('.aibtns') && /page=notes&t=/.test(a.getAttribute('href')) && a.getBoundingClientRect().width > 100 && /내 설교 노트/.test(a.textContent); }));
  check('설교 노트가 묵상 버튼과 같은 줄(같은 크기)', await page.evaluate(() => { const a = document.getElementById('notesBtn').getBoundingClientRect(), b = document.getElementById('btnDevotion').getBoundingClientRect(); return Math.abs(a.top - b.top) < 2 && Math.abs(a.height - b.height) < 2 && Math.abs(a.width - b.width) < 2; }));
  const icons = await page.evaluate(() => {
    const box = (sel) => Array.from(document.querySelectorAll(sel)).filter((x) => x.getBoundingClientRect().width > 0).map((x) => { const r = x.getBoundingClientRect(), s = x.querySelector('svg'); const sr = s && s.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), sr ? Math.round(sr.width) : 0]; });
    return { tile: box('.tile .ticon'), adm: box('.acard .ac-ic'), bul: box('.bulbtn .bi'), me: Array.from(document.querySelectorAll('.mebtn svg')).map((s) => Math.round(s.getBoundingClientRect().width)) };
  });
  const all = [].concat(icons.tile, icons.adm, icons.bul);
  check('메뉴 · 관리 · 버튼 아이콘 상자가 모두 같은 크기(48)', all.length >= 8 && all.every((a) => a[0] === 48 && a[1] === 48), icons);
  check('아이콘 그림이 모두 같은 크기(26)', all.every((a) => a[2] === 26) && icons.me.every((w) => w === 26), icons);
  check('타일 아이콘이 예전 .ti(할 일 카드) 스타일을 받지 않음(테두리 · 배경 흐림 없음)', await page.evaluate(() => { const i = document.querySelector('.tile .ticon'); const c = getComputedStyle(i); return !i.classList.contains('ti') && (c.backdropFilter === 'none' || !c.backdropFilter); }));
  await page.screenshot({ path: SHOT + '/step10-portal-menu.png', fullPage: true });

  console.log('· 포털 — 검색 결과가 "내 할 일" 위에 (z-index)');
  await page.evaluate(() => window.scrollTo(0, 0));
  // 이 시험 자료에는 할 일이 없어서 — 화면에 할 일 카드 4개를 직접 그려 실제와 같은 겹침 상황을 만듭니다
  const seedTodos = () => page.evaluate(() => renderTodos({ todos: [
    { id: 't1', tone: 'urgent', icon: '⏰', title: '지출 결재 요청', sub: '오늘까지 확인이 필요합니다', url: '/x' },
    { id: 't2', tone: 'warn', icon: '📝', title: '회의록 확인', sub: '서명 대기 중', url: '/x' },
    { id: 't3', tone: 'info', icon: '📣', title: '주보 게시 전 확인', sub: '이번 주 주보', url: '/x' },
    { id: 't4', tone: 'ok', icon: '✅', title: '새가족 배정', sub: '2명', url: '/x' }] }));
  await seedTodos();
  const todos = await page.evaluate(() => document.querySelectorAll('#todoBox .ti').length);
  console.log('    (할 일 카드 ' + todos + '개)');
  check('검색창이 커미티에게 보임', await page.evaluate(() => getComputedStyle(document.querySelector('.qsearch')).display !== 'none'));
  await page.fill('#qsInput', '새가족');
  check('검색 결과가 열림', await L.waitTrue(page, () => document.getElementById('qsDrop').style.display === 'block' && document.querySelectorAll('#qsDrop .qsrow').length > 0, null, 5000));
  const z = await page.evaluate(() => { const d = document.getElementById('qsDrop'), c = getComputedStyle(d); return { z: c.zIndex, pos: c.position, hero: getComputedStyle(document.querySelector('.hero')).zIndex }; });
  check('결과 상자: position absolute · z-index 9999', z.pos === 'absolute' && z.z === '9999', z);
  const topmost = () => page.evaluate(() => {
    const d = document.getElementById('qsDrop'), r = d.getBoundingClientRect();
    const vh = window.innerHeight; const bad = [];
    Array.from(d.querySelectorAll('.qsrow')).forEach((row, i) => {
      const b = row.getBoundingClientRect();
      const y = Math.min(b.top + b.height / 2, vh - 2); if (b.top > vh) return;
      const t = document.elementFromPoint(b.left + b.width / 2, y);
      if (!t || !d.contains(t)) bad.push([i, t && (t.className || t.tagName)]);
    });
    return { bad, rows: d.querySelectorAll('.qsrow').length, overlapsTodo: (() => { const td = document.getElementById('todoBox').getBoundingClientRect(); return td.height > 0 && r.bottom > td.top; })() };
  });
  const tp = await topmost();
  check('모든 결과 줄의 맨 위에 실제로 결과 상자가 보임(elementFromPoint)', tp.bad.length === 0 && tp.rows > 0, tp);
  console.log('    (결과 ' + tp.rows + '줄 · 할 일 영역과 겹침: ' + tp.overlapsTodo + ')');
  if (todos > 0) {
    // 음성 대조 — 예전 CSS(hero z-index 없음 · 결과 z-index 30)로 되돌리면 정말 가려지는지
    await page.addStyleTag({ content: '.hero{z-index:auto !important;position:static !important}.qsdrop{z-index:30 !important}' });
    const old = await topmost();
    check('(대조) 예전 CSS 로 되돌리면 결과가 가려짐 — 시험이 버그를 잡아냄', old.bad.length > 0 || !old.overlapsTodo, old);
    await page.reload();
    await L.waitTrue(page, () => document.getElementById('main').style.display === 'block' && !!document.querySelector('#menus .tile'), null, 10000);
    await seedTodos();
    await page.fill('#qsInput', '새가족');
    await L.waitTrue(page, () => document.querySelectorAll('#qsDrop .qsrow').length > 0, null, 5000);
  }
  const heads = await page.evaluate(() => Array.from(document.querySelectorAll('#qsDrop .qshead')).map((h) => h.textContent.replace(/\s+/g, ' ').trim()));
  check('"새가족" 이라고 치면 새가족 묶음이 나옴', heads.some((h) => /^새가족/.test(h)), heads);
  await page.screenshot({ path: SHOT + '/step10-portal-search.png' });

  console.log('· 포털 — 새가족 검색 · 바로가기');
  await page.fill('#qsInput', '홍길');
  check('이름으로 새가족이 나오고 "새가족" 표시', await L.waitTrue(page, () => { const r = document.querySelector('#qsDrop .qsrow.nf'); return !!r && /홍길동/.test(r.textContent) && !!r.querySelector('.qstag'); }, null, 5000));
  await page.fill('#qsInput', '홍길');
  await L.waitTrue(page, () => !!document.querySelector('#qsDrop .qsrow.nf'), null, 5000);
  await Promise.all([page.waitForURL(/page=newfamily/, { timeout: 8000 }).catch(() => {}), page.click('#qsDrop .qsrow.nf')]);
  const u = page.url();
  check('새가족을 누르면 그 새가족 상세 주소(?page=newfamily&open=…)로 이동', /page=newfamily/.test(u) && /open=%ED%99%8D%EA%B8%B8%EB%8F%99|open=홍길동/.test(u) && /[?&]t=/.test(u), u);
  check('새가족 화면이 열림', await L.waitTrue(page, () => document.body.innerText.length > 50 && !/찾을 수 없|오류/.test(document.title), null, 6000));
  await page.screenshot({ path: SHOT + '/step10-newfamily-deeplink.png' });

  console.log('· 포털 — 교인 검색은 예전 그대로');
  await page.goto(BASE + '/?page=portal');
  await L.waitTrue(page, () => document.getElementById('main').style.display === 'block' && !!document.querySelector('#menus .tile'), null, 10000);
  await page.fill('#qsInput', '정일');
  check('교인 결과가 나옴(교인 묶음 · 셀)', await L.waitTrue(page, () => { const r = document.querySelector('#qsDrop .qsrow[data-kind="member"]'); return !!r && /정일반/.test(r.textContent) && /1셀/.test(r.textContent); }, null, 5000));
  await page.click('#qsDrop .qsrow[data-kind="member"]');
  check('교인을 누르면 예전처럼 상세 창', await L.waitTrue(page, () => document.getElementById('qsModal').style.display === 'flex' && /정일반/.test(document.getElementById('qsModalBody').textContent) && !!document.querySelector('#qsModalBody .qsgrid'), null, 5000));
  await page.screenshot({ path: SHOT + '/step10-member-detail.png' });
  await page.click('#qsModal .ynmodalx');
  await page.fill('#qsInput', '없는사람이름');
  check('결과가 없으면 안내 문구', await L.waitTrue(page, () => /일치하는/.test(document.getElementById('qsDrop').textContent), null, 4000));
  await page.fill('#qsInput', '');
  check('검색어를 지우면 결과 상자가 닫힘', await L.waitTrue(page, () => document.getElementById('qsDrop').style.display === 'none', null, 3000));

  console.log('· 포털 — 다른 분 화면 보기 (새가족 포함)');
  await page.click('.astog');
  check('교인 / 새가족 선택이 보임', await L.waitTrue(page, () => getComputedStyle(document.getElementById('asIn')).display !== 'none' && !!document.getElementById('asKn'), null, 3000));
  check('교인 목록이 채워짐', await L.waitTrue(page, () => document.querySelectorAll('#asList option').length >= 12, null, 5000), await page.evaluate(() => document.querySelectorAll('#asList option').length));
  await page.click('#asKn');
  const nfOpts = await page.evaluate(() => Array.from(document.querySelectorAll('#asList option')).map((o) => o.value));
  check('새가족으로 바꾸면 새가족 이름만 목록에', nfOpts.indexOf('홍길동') !== -1 && nfOpts.indexOf('정일반') === -1, nfOpts);
  await page.fill('#asName', '홍길동'); await page.keyboard.press('Enter');
  // Step 11 — 새가족 화면 보기는 새가족이 실제로 보는 첫 화면(#nfHome)을 그대로 그립니다
  check('새가족 화면으로 바뀜(보기 전용 안내)', await L.waitTrue(page, () => getComputedStyle(document.getElementById('lock')).display !== 'none' && /홍길동/.test(document.getElementById('nfHome').textContent) && /보기 전용/.test(document.getElementById('nfHome').textContent), null, 6000), await page.evaluate(() => document.getElementById('nfHome').textContent.slice(0, 120)));
  check('새가족이 보는 환영 카드가 그대로 나옴', await page.evaluate(() => /홍길동님, 환영합니다/.test(document.querySelector('#nfHome .nfhome .hi').textContent)));
  check('눌러서 바뀌는 것은 잠김(inert)', await page.evaluate(() => { const r = document.querySelector('#nfHome .nfro'); return !!r && r.hasAttribute('inert') && getComputedStyle(r).pointerEvents === 'none'; }));
  check('그분 화면에서는 내 포털 메뉴 · 검색이 가려짐(새가족 화면만 보임)', await page.evaluate(() => getComputedStyle(document.getElementById('main')).display === 'none'));
  await page.screenshot({ path: SHOT + '/step10-view-newcomer.png' });
  await page.click('#nfHome .nfasview .btn');
  check('"내 화면으로" 를 누르면 내 화면', await L.waitTrue(page, () => /김커미티/.test(document.getElementById('helloName').textContent) && !!document.querySelector('.astog'), null, 5000));
  await page.click('.astog');
  await page.fill('#asName', '정일반'); await page.keyboard.press('Enter');
  check('교인 화면 보기는 예전 그대로', await L.waitTrue(page, () => /정일반/.test(document.getElementById('helloName').textContent) && /님이 보는 화면/.test(document.getElementById('asBox').textContent), null, 6000));
  await page.click('#asBox .asview .btn');
  await L.waitTrue(page, () => /김커미티/.test(document.getElementById('helloName').textContent), null, 4000);
  check('포털 화면에 오류 없음', errs.length === 0, errs);
  await ctx.close();

  console.log('· 포털 — 일반 교인(커미티 아님)');
  ({ ctx, page, errs } = await mk({ width: 390, height: 800 }, 일반));
  await page.goto(BASE + '/?page=portal');
  check('일반 교인 화면이 열림', await L.waitTrue(page, () => document.getElementById('main').style.display === 'block', null, 10000));
  check('일반 교인에게도 내 설교 노트 메뉴가 있음', await page.evaluate(() => { const a = document.getElementById('notesBtn'); return !!a && a.getBoundingClientRect().width > 100; }));
  check('검색창 · 화면 보기는 커미티에게만', await page.evaluate(() => getComputedStyle(document.querySelector('.qsearch')).display === 'none' && !document.querySelector('.astog')));
  await page.click('#notesBtn');
  check('설교 노트 페이지로 이동', await L.waitTrue(page, () => /page=notes/.test(location.search) && !!document.querySelector('#fab'), null, 8000));
  await ctx.close();

  /* ================= 찬양 허브 ================= */
  console.log('· 찬양 허브 — 교적에서 객원 찾기');
  ({ ctx, page, errs } = await mk({ width: 420, height: 900 }));
  await page.goto(BASE + '/?page=worship&key=ADM');
  check('허브가 열림', await L.waitTrue(page, () => window.W && window.D && window.D.positions && window.D.positions.length > 0 && !!document.querySelector('.lineup2, .lineup'), null, 10000));
  await page.evaluate(() => { const p = window.D.positions.filter((x) => x.key === 'piano')[0] || window.D.positions[0]; window.openPicker(p.key); });
  check('고르는 칸에 "교적에서 찾기" 검색창이 있음', await L.waitTrue(page, () => !!document.getElementById('gsQ'), null, 4000));
  check('예전 "직접 입력" 도 그대로 있음', await page.evaluate(() => !!document.getElementById('guestName')));
  await page.fill('#gsQ', '정일');
  check('교적 검색 결과에 정일반(셀 · 전화 뒤 4자리)', await L.waitTrue(page, () => { const b = document.querySelector('#gsRes .pick'); return !!b && /정일반/.test(b.textContent) && /1셀/.test(b.textContent) && /1008/.test(b.textContent); }, null, 5000), await page.evaluate(() => document.getElementById('gsRes').textContent));
  check('전체 전화번호는 화면에 없음', await page.evaluate(() => !/416-?555-?1008|4165551008/.test(document.getElementById('gsRes').textContent)));
  await page.screenshot({ path: SHOT + '/step10-worship-guest.png' });
  const slotKey = await page.evaluate(() => window.openPos);
  await page.click('#gsRes .pick');
  check('누르면 그 자리에 객원으로 저장됨', await L.waitTrue(page, (k) => (window.W.slots[k] || []).indexOf('정일반') !== -1, slotKey, 6000), await page.evaluate((k) => window.W.slots[k], slotKey));
  const week = await page.evaluate(() => window.DATE);
  const sv = run((api) => api.getWorshipWeek('ADM', week));
  check('서버(찬양편성 시트)에는 예전과 같이 이름으로 저장', (sv.slots[slotKey] || []).indexOf('정일반') !== -1, sv.slots[slotKey]);
  check('객원 표시(점선)로 나옴', await L.waitTrue(page, () => Array.from(document.querySelectorAll('.nm.guest, .pe.guest, .pick.on')).some((x) => /정일반/.test(x.textContent)), null, 4000));
  await page.evaluate((k) => { openPos = k; render(); }, slotKey);
  await page.fill('#gsQ', '없는분이름');
  check('교적에 없으면 직접 입력 안내', await L.waitTrue(page, () => /직접 입력/.test(document.getElementById('gsRes').textContent), null, 4000));
  check('허브 화면에 오류 없음', errs.length === 0, errs);
  await ctx.close();
  console.log('· 찬양 허브 — 찬양팀이 아닌 교인은 검색 불가');
  { const r = await fetch(BASE + '/api/worshipGuestSearch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: [일반, '정'] }) }); const j = await r.json().catch(() => ({}));
    check('일반 교인의 객원 검색은 서버가 거절', r.status >= 400 || j.ok === false || j.error, [r.status, j]); }

  /* ================= 주보 ================= */
  console.log('· 주보 편집 — 추가 페이지 만들기');
  ({ ctx, page, errs } = await mk({ width: 420, height: 900 }));
  await page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, 커미티);
  await page.goto(BASE + '/?page=bulletin&edit=1&t=' + encodeURIComponent(커미티));
  check('편집기가 열림', await L.waitTrue(page, () => !!document.getElementById('eTabs'), null, 10000));
  check('"추가 페이지" 탭이 있음', await page.evaluate(() => !!document.querySelector('#eTabs button[data-t="pages"]')));
  await page.click('#eTabs button[data-t="pages"]');
  check('처음엔 페이지가 없고 추가 버튼 3개', await page.evaluate(() => document.querySelectorAll('.sub-item[data-pg]').length === 0 && document.querySelectorAll('[data-add]').length === 3));
  await page.click('[data-add="fellowship"]');
  await page.click('[data-add="column"]');
  await page.click('[data-add="custom"]');
  check('셀모임 교제 · 목회칼럼 · 직접 만들기 3개가 생김', await page.evaluate(() => document.querySelectorAll('.sub-item[data-pg]').length === 3 && B.pages.map((p) => p.kind).join() === 'fellowship,column,custom'), await page.evaluate(() => B.pages));
  check('탭에 개수 표시', await page.evaluate(() => /\(3\)/.test(document.querySelector('#eTabs button[data-t="pages"]').textContent)));
  check('종류에 맞는 기본 제목', await page.evaluate(() => B.pages[0].title === '셀모임 교제' && B.pages[1].title === '목회칼럼' && B.pages[2].title === ''));
  await page.fill('#pgBody0', '이번 주 교제 질문\n1. 요즘 감사한 일은?');
  await page.fill('#pgBody1', '**목자**의 마음으로');
  await page.evaluate(() => { B.pages[1].author = '강산 목사'; B.pages[1].ref = '시편 23:1'; });
  await page.fill('#pgTitle2', '수련회 안내');
  await page.fill('#pgBody2', '접수 안내');
  check('입력한 내용이 편집 자료에 반영', await page.evaluate(() => B.pages[0].body.indexOf('감사한') !== -1 && B.pages[2].title === '수련회 안내'));
  await page.click('.sub-item[data-pg] >> nth=2 >> button.ic >> nth=0');
  check('▲ 로 순서를 바꿈', await page.evaluate(() => B.pages.map((p) => p.kind).join() === 'fellowship,custom,column'), await page.evaluate(() => B.pages.map((p) => p.kind)));
  page.once('dialog', (d) => d.accept());
  await page.click('.sub-item[data-pg] >> nth=1 >> button[data-act="del"]');
  check('✕ 로 페이지를 뺌', await page.evaluate(() => B.pages.map((p) => p.kind).join() === 'fellowship,column' && document.querySelectorAll('.sub-item[data-pg]').length === 2), await page.evaluate(() => B.pages.map((p) => p.kind)));
  await page.click('[data-add="custom"]');
  await page.fill('#pgTitle2', '한 번만 보이는 안내');
  await page.fill('#pgBody2', '이번 주만');
  await page.evaluate(() => { B.pages[2].keep = false; });
  await page.screenshot({ path: SHOT + '/step10-bulletin-editor-pages.png', fullPage: true });
  await page.click('#eTabs button[data-t="preview"]');
  check('미리보기에 추가 페이지가 섬김이 앞에 그려짐', await page.evaluate(() => { const ids = Array.from(document.querySelectorAll('.pv .sheet')).map((s) => s.id.replace('pv-', '')); const i = ids.indexOf('servants'); return ids.length > 3 && /^pg_.*_p$/.test(ids[i - 1]) && ids.filter((x) => /^pg_/.test(x)).length === 3; }), await page.evaluate(() => Array.from(document.querySelectorAll('.pv .sheet')).map((s) => s.id)));
  check('굵은 글씨(**목자**)가 강조로 그려짐', await page.evaluate(() => !!document.querySelector('.pv .pgsec .sbody .em-b')));
  check('글쓴이 · 구절이 표시됨', await page.evaluate(() => /강산 목사/.test(document.querySelector('.pv .pgsec .pgby') ? document.querySelector('.pv .pgsec .pgby').textContent : '') ));
  await page.click('.ebar .b.or');           // 게시하기
  page.on('dialog', (d) => d.accept());
  await page.evaluate(() => save(true)).catch(() => {});
  check('게시됨', await L.waitTrue(page, () => /게시했습니다/.test(document.getElementById('eBarSt').textContent), null, 8000), await page.evaluate(() => document.getElementById('eBarSt').textContent));
  const BDATE = await page.evaluate(() => B.date);
  const pub = run((api) => api.getBulletin(BDATE)).bulletin;
  check('게시본(서버)에 3개 페이지', pub && pub.pages && pub.pages.length === 3, pub && pub.pages && pub.pages.map((p) => p.title));
  await ctx.close();

  console.log('· 주보 보기 — 로그인 없이');
  ({ ctx, page, errs } = await mk({ width: 390, height: 800 }));
  await page.goto(BASE + '/?page=bulletin&date=' + BDATE);
  check('주보가 열림', await L.waitTrue(page, () => !!document.getElementById('vnav'), null, 8000));
  const navs = await page.evaluate(() => Array.from(document.querySelectorAll('#vnav a')).map((a) => a.textContent));
  check('위쪽 이동 메뉴에 추가 페이지 이름이 섬김이 앞에', navs.indexOf('셀모임 교제') !== -1 && navs.indexOf('목회칼럼') !== -1 && navs.indexOf('한 번만 보이는 안내') !== -1 && navs.indexOf('셀모임 교제') < navs.indexOf('섬김이'), navs);
  check('추가 페이지가 화면에 그려짐(제목 · 내용)', await page.evaluate(() => { const t = document.body.innerText; return /셀모임 교제/.test(t) && /감사한 일은/.test(t) && /목자/.test(t) && /강산 목사/.test(t); }));
  await page.click('#vnav a:nth-child(' + (navs.indexOf('셀모임 교제') + 1) + ')');
  await sleep(500);
  check('이동 메뉴를 누르면 그 페이지로 스크롤', await page.evaluate(() => { const s = document.querySelector('.pgsec'); const r = s.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }));
  check('기존 다섯 구역은 그대로', await page.evaluate(() => ['worship', 'servants'].every((k) => !!document.getElementById('sec-' + k))));
  await page.screenshot({ path: SHOT + '/step10-bulletin-view.png', fullPage: true });
  check('주보 화면에 오류 없음', errs.length === 0, errs);
  await ctx.close();

  console.log('· 다음 주 새 주보 — 제목만 이어받기');
  { const d = new Date(BDATE + 'T12:00:00'); d.setDate(d.getDate() + 14);
    const nd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const next = run((api) => api.getBulletinDraft(커미티, nd));
    check('다음 주 뼈대에 지난 주 페이지(유지 표시한 것)', (next.pages || []).map((p) => p.title).join() === '셀모임 교제,목회칼럼', (next.pages || []).map((p) => p.title));
    check('내용은 비어 있음', (next.pages || []).every((p) => p.body === '')); }

  await br.close();
  return L.summary();
})().then((ok) => process.exit(ok ? 0 : 1)).catch((e) => { console.error(e); process.exit(1); });
