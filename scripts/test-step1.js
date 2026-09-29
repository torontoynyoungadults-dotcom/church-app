/**
 * Step 1 시험 — 진짜 구글에 연결하지 않고(scripts/fake-google.js) 다음을 확인합니다.
 *   npm run test:step1          (또는 node scripts/test-step1.js)
 *
 *  A. 지도   : 앱의 모든 시트 탭이 11개 시트 중 하나에 "명시적으로" 배정되어 있는가
 *  B. 코드   : app.js + permissions.js + deeplink.js 사이에 함수 이름이 겹치지 않는가
 *  C. 예전 방식 : DB_FOLDER_ID 없이 — 시트 하나로 예전처럼 동작하는가
 *  D. 새 방식  : 11개 시트로 읽고 쓰는가 · 옛 시트 예비 읽기 · 빠진 시트 안내 · 손으로 고친 시트 감지
 *  E. 권한   : 개인 허용/차단 · 위원회 범위 · 만료 · 범위(셀/팀) — 행이 없으면 예전과 같은가
 *  F. 딥링크 : 주소 만들기 · 줄임 표기 · resolveDeepLink (있음/없음/권한 없음)
 *  G. 이전 도구 : db-setup 의 status / create / migrate
 */
const fs = require('fs');
const path = require('path');
const { FakeGoogle } = require('./fake-google');

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'lib') + path.sep;
const BRIDGE = require.resolve('../lib/bridge');
process.env.TZ = 'America/Toronto';

/* ---------------------------------------------------------------- 작은 시험 틀 */
let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; return; }
  fail++; failures.push(msg); console.log('  ✗ ' + msg);
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, msg + (A === B ? '' : '  → 실제 ' + A + ' / 기대 ' + B));
}
function section(t) { console.log('\n■ ' + t); }
function throws(fn, re, msg) {
  try { fn(); } catch (e) { ok(re.test(String(e.message)), msg + ' (오류 메시지: ' + e.message + ')'); return; }
  ok(false, msg + ' (오류가 나야 하는데 나지 않음)');
}

/* ---------------------------------------------------------------- 부팅 */
const ENV_KEYS = ['DB_FOLDER_ID', 'DB_IDS', 'SPREADSHEET_ID', 'DB_LEGACY_FALLBACK', 'PUBLIC_URL'];
function boot(env, fake) {
  ENV_KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, { PUBLIC_URL: 'https://app.test' }, env);
  Object.keys(require.cache).forEach((k) => { if (k.indexOf(LIB) === 0 || k.indexOf(path.join(ROOT, 'scripts', 'db-setup')) === 0) delete require.cache[k]; });
  const stub = {
    sheets: (m, p) => fake.sheets(m, p), drive: (m, p) => fake.drive(m, p), calendar: (m, p) => fake.calendar(m, p),
    call: (op, a) => fake.call(op, a),
  };
  require.cache[BRIDGE] = { id: BRIDGE, filename: BRIDGE, loaded: true, exports: stub };
  const errs = [];
  const orig = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  let runtime;
  try { runtime = require('../lib/runtime'); } finally { console.error = orig; }
  return { runtime, google: require('../lib/google'), db: require('../lib/db'), warnings: errs, run: (fn) => runtime.run((api) => fn(api)).result };
}

/* ---------------------------------------------------------------- 시험 자료 */
const HEAD_교적 = ['이름', '전화번호', '카카오톡', '이메일', '생년월일', '세례여부', '섬기는사역', '성별', '제자훈련', '사진', '제자훈련출석',
  '영문이름', '주소', '등록일', '멤버십등록일', '헌금번호', '역할', '셀상태', '체류신분', '부모님성함'];
function person(name, n, roleTags) {
  const r = new Array(20).fill('');
  r[0] = name; r[1] = '416-555-' + String(1000 + n); r[16] = roleTags || '';
  return r;
}
const PHONE = (n) => String(4165551000 + n);          // 전화키_ = 뒤 10자리
const PEOPLE = ['김커미티', '이예배', '한차단', '강허용', '만료', '박새가족', '최셀장', '노셀장', '정일반', '윤팀장', '오팀장', '오범위'];
const tag = { 김커미티: '커미티', 이예배: '커미티', 한차단: '커미티', 박새가족: '새가족팀' };

function baseTabs(perms) {
  const nf = new Array(18).fill(''); nf[0] = '홍길동'; nf[11] = '진행중'; nf[10] = '2026-09-20';
  return {
    '설정': [['키', '값', '설명'], ['포털비밀키', 'secret-secret-secret-secret-secret', ''], ['관리자키', 'ADM', ''], ['우편번호확인', 'OFF', '']],
    '교적': [HEAD_교적].concat(PEOPLE.map((n, i) => person(n, i, tag[n]))),
    '셀목록': [['셀이름', '셀장', '이메일', '셀방'], ['1셀', '최셀장', '', ''], ['2셀', '노셀장', '', '']],
    '셀원명단': [['셀', '이름'], ['1셀', '정일반']],
    '사역팀': [['팀', '부서', '커미티', '팀장', '이메일'], ['찬양1팀', '예배영성부', '', '윤팀장', ''], ['재정팀', '회계', '', '오팀장', '']],
    '사역팀원': [['팀', '이름', '역할']],
    '새가족': [['이름', '성별', '생일', '연락처', '수세', '이전교회', '직업', '활동계획', '특징', '담당자', '등록일', '상태']].concat([nf]),
    '회의록': [['ID', '제목', '문서ID', '회의날짜', '등록자', '등록시각', '마지막읽음', '상태', '팀', '본문'],
      ['m1', '정기 회의', '', '2026-09-20', '김커미티', '', '', '', '', '본문'],
      ['m2', '찬양팀 회의', '', '2026-09-21', '김커미티', '', '', '', '찬양1팀', '본문']],
    '포토앨범': [['ID', '제목', '카테고리', '대상', '설명', '대표사진', '만든이', '만든날짜', '외부링크'], ['a1', '추석 모임', '', '', '', '', '', '', '']],
    '사용자권한': [['이름', '구분', '대상', '효과', '범위', '만료일', '메모', '만든이', '만든시각']].concat(perms || []),
  };
}
const PERMS = [
  ['이예배', '위원회', '예배영성부', '허용', '', '', '', '', ''],
  ['한차단', '메뉴', 'newfamily', '차단', '', '', '', '', ''],
  ['강허용', '메뉴', 'newfamily', '허용', '', '', '', '', ''],
  ['만료', '메뉴', 'newfamily', '허용', '', '2020-01-01', '', '', ''],
  ['오범위', '메뉴', 'leader', '허용', '1셀', '', '', '', ''],
];

/** 예전 방식: 시트 하나 */
function legacyWorld(perms) {
  const fake = new FakeGoogle();
  const legacy = fake.addBook('옛 통합 시트', baseTabs(perms));
  const env = boot({ SPREADSHEET_ID: legacy.id }, fake);
  return { fake, legacy, env };
}
/** 새 방식: 폴더 안 11개 시트 (+ 선택: 옛 시트 예비) */
function multiWorld(perms, opt) {
  opt = opt || {};
  const fake = new FakeGoogle();
  const tmpDb = boot({}, fake).db;                         // 지도(TABS)만 빌려 씁니다
  const tabs = baseTabs(perms);
  const byKey = {};
  Object.keys(tabs).forEach((t) => { const k = tmpDb.keyFor(t); (byKey[k] = byKey[k] || {})[t] = tabs[t]; });
  const books = {};
  tmpDb.WORKBOOKS.forEach((w) => {
    if (opt.skip && opt.skip.indexOf(w.key) !== -1) return;
    books[w.key] = fake.addBook(tmpDb.fileTitle(w), byKey[w.key] || { 'Sheet1': [] }, 'FOLDER');
  });
  const env = { DB_FOLDER_ID: 'FOLDER' };
  let legacy = null;
  if (opt.legacyTabs) {
    const lt = {};
    opt.legacyTabs.forEach((t) => { lt[t] = tabs[t]; });
    legacy = fake.addBook('옛 통합 시트', lt);
    env.SPREADSHEET_ID = legacy.id;
  }
  return { fake, books, legacy, env: boot(env, fake), tabs, byKey };
}

const tokenOf = (api, name) => api.포털토큰_(name, PHONE(PEOPLE.indexOf(name)), '');
const menuKeys = (api, name) => api.포털메뉴_(api.포털역할_(name), tokenOf(api, name)).map((x) => x.key).sort();
const adminKeys = (api, name) => api.포털관리메뉴_(api.포털역할_(name), tokenOf(api, name)).map((x) => x.key).sort();

/* ================================================================ A. 지도 */
function testMap() {
  section('A. 탭 → 11개 시트 지도');
  const fake = new FakeGoogle();
  const { db } = boot({}, fake);
  eq(db.WORKBOOKS.length, 11, '시트는 11개');
  eq(new Set(db.WORKBOOKS.map((w) => w.code)).size, 11, '코드 DB01~DB11 이 서로 다름');
  eq(db.WORKBOOKS.map((w) => w.code), Array.from({ length: 11 }, (_, i) => 'DB' + String(i + 1).padStart(2, '0')), '코드 순서 DB01..DB11');

  const src = ['logic/app.js', 'logic/permissions.js', 'logic/deeplink.js', 'logic/worship2.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const consts = Array.from(src.matchAll(/^var\s+SHEET_[^\s=]+\s*=\s*'([^']+)'/gm), (m) => m[1]);
  ok(consts.length >= 55, 'SHEET_ 상수를 충분히 찾음 (' + consts.length + '개)');
  const unmapped = consts.filter((t) => !db.isMapped(t));
  eq(unmapped, [], '지도에 없는 탭이 없음 (없으면 기본으로 [DB11]에 들어가 버립니다)');
  const wrong = Object.keys(db.TABS).filter((k) => !db.BY_KEY[k]);
  eq(wrong, [], '지도가 가리키는 시트가 모두 실제로 있음');
  const empty = db.WORKBOOKS.filter((w) => !(db.TABS[w.key] || []).length).map((w) => w.code);
  eq(empty, [], '탭이 하나도 없는 시트가 없음');
  const all = [].concat(...Object.keys(db.TABS).map((k) => db.TABS[k]));
  eq(all.filter((t, i) => all.indexOf(t) !== i), [], '한 탭이 두 시트에 배정되지 않음');
  eq(db.keyFor('[셀] 1셀'), 'cell', '"[셀] " 접두 탭은 셀 시트');
  eq(db.keyFor('처음보는탭'), 'system', '모르는 탭은 [DB11] 기타 시스템');
  eq(db.keyFor('새가족'), 'newcomers', '새가족 → DB04');
  eq(db.keyFor('사용자권한'), 'system', '사용자권한 → DB11');

  // resolve — 표식 · 별칭 · 중복 · 빠짐
  const files = [
    { id: 'f1', name: '[DB01] 셀 사역 및 관리 · Cell Ministry & Management' },
    { id: 'f2', name: '재정 자료 Finance Data' },
    { id: 'f3', name: '[DB04] 새가족' }, { id: 'f4', name: '[DB04] 새가족 (복사본)' },
    { id: 'f5', name: '전혀 상관없는 파일' },
  ];
  const r = db.resolve(files);
  eq(r.byKey.cell && r.byKey.cell.id, 'f1', '[DB01] 표식으로 찾음');
  eq(r.byKey.finance && r.byKey.finance.id, 'f2', '이름(별칭)으로 찾음');
  ok(r.duplicates.newcomers && r.duplicates.newcomers.length === 2, '같은 자리에 두 파일이면 중복으로 알림');
  ok(r.missing.indexOf('worship') !== -1 && r.missing.indexOf('cell') === -1, '없는 시트는 missing 에');
  ok(r.extra.some((f) => f.id === 'f5'), '상관없는 파일은 extra 에');
}

/* ================================================================ B. 함수 이름 */
function testDup() {
  section('B. 함수 이름 겹침');
  const files = ['app.js', 'permissions.js', 'deeplink.js', 'worship2.js'].map((f) => fs.readFileSync(path.join(ROOT, 'logic', f), 'utf8'));
  const all = [].concat(...files.map((s) => Array.from(s.matchAll(/^function\s+([^\s(]+)\s*\(/gm), (m) => m[1])));
  eq(all.filter((n, i) => all.indexOf(n) !== i), [], '겹치는 함수 없음');
  const av = [].concat(...files.map((s) => Array.from(s.matchAll(/^var\s+([^\s=;,]+)/gm), (m) => m[1])));
  eq(Array.from(new Set(av.filter((n, i) => av.indexOf(n) !== i))), [], '겹치는 전역 변수 없음');
  eq(legacyWorld([]).env.warnings.filter((x) => /같은 이름/.test(x)), [], '실행기가 겹침 경고를 내지 않음');
}

/* ================================================================ C. 예전 방식 */
function testLegacyMode() {
  section('C. 예전 방식 (DB_FOLDER_ID 없음)');
  const { fake, legacy, env } = legacyWorld([]);
  ok(!env.google.store.multi(), '새 방식이 꺼져 있음');
  env.run((api) => {
    ok(!!api.포털본인_(tokenOf(api, '정일반')), '포털 토큰이 통과');
    eq(api.포털권한_(tokenOf(api, '김커미티'), '새가족'), true, '커미티는 새가족 권한');
    eq(api.포털권한_(tokenOf(api, '정일반'), '새가족'), false, '일반 교인은 새가족 권한 없음');
    api.설정저장_('시험값', 'abc');
  });
  const ids = new Set();
  fake.log.forEach((l) => l.id && ids.add(l.id));
  eq(Array.from(ids), [legacy.id], '옛 시트 하나만 건드림');
  eq(fake.values(legacy.id, '설정').filter((r) => r[0] === '시험값').length, 1, '쓰기가 옛 시트에 저장됨');
}

/* ================================================================ D. 새 방식 */
function testMultiMode() {
  section('D. 새 방식 (11개 시트)');
  const w = multiWorld([]);
  const { fake, books, env } = w;
  ok(env.google.store.multi(), '새 방식이 켜져 있음');

  env.run((api) => {
    eq(api.포털권한_(tokenOf(api, '박새가족'), '새가족'), true, '교적/설정(DB11)을 읽어 판정');
    eq(api.새가족목록_().map((x) => x.name), ['홍길동'], '새가족 목록을 DB04 에서 읽음');
    eq(api.getCells().map((c) => c.name), ['1셀', '2셀'], '셀목록을 DB01 에서 읽음');
    eq(api.사역팀목록_().length, 2, '사역팀을 DB02 에서 읽음');
    eq(api.회의하나_('m1').title, '정기 회의', '회의록을 DB08 에서 읽음');
    eq(api.앨범하나_('a1').title, '추석 모임', '앨범을 DB07 에서 읽음');
  });
  const readIds = new Set(fake.log.filter((l) => /batchGet/.test(l.method)).map((l) => l.id));
  ['cell', 'ministry', 'newcomers', 'system', 'album', 'minutes'].forEach((k) => ok(readIds.has(books[k].id), k + ' 시트를 읽음'));
  ok(!readIds.has(books.finance.id) && !readIds.has(books.missions.id), '쓰지 않은 시트(재정·선교)는 읽지 않음');

  // 쓰기 — 각 탭은 자기 시트로
  fake.log.length = 0;
  env.run((api) => {
    api.설정저장_('시험값', 'xyz');                                  // system
    api.sheet_('새가족').appendRow(['이새로', '', '', '', '', '', '', '', '', '', '2026-09-27', '진행중']);   // newcomers
    api.캐시비움_();
  });
  eq(fake.values(books.system.id, '설정').filter((r) => r[0] === '시험값').length, 1, '설정 쓰기 → DB11');
  eq(fake.values(books.newcomers.id, '새가족').map((r) => r[0]), ['이름', '홍길동', '이새로'], '새가족 쓰기 → DB04');
  const wrote = new Set(fake.log.filter((l) => l.write).map((l) => l.id));
  eq(Array.from(wrote).sort(), [books.newcomers.id, books.system.id].sort(), '쓴 시트는 두 곳뿐');

  // 새 탭 만들기 — 지도대로 자기 시트에
  env.run((api) => { api.주보시트_('회의할일', ['ID', '회의록ID']); });
  ok(fake.books.get(books.minutes.id).sheets.some((s) => s.title === '회의할일'), '새 탭 "회의할일" 은 DB08 에 만들어짐');
  ok(!fake.books.get(books.system.id).sheets.some((s) => s.title === '회의할일'), '…DB11 에는 만들어지지 않음');

  // 손으로 고친 시트 감지 (앱을 거치지 않고 DB04 새가족 이름 수정)
  fake.editByHand(books.newcomers.id, '새가족', 2, 1, '홍길순');
  env.google.store.lastCheck = 0;
  env.run((api) => { eq(api.새가족목록_().map((x) => x.name).sort(), ['이새로', '홍길순'], '손으로 고친 값이 다음 요청에 반영됨'); });

  // 시트 하나가 폴더에 없음 → 무엇이 없는지 알려줌
  const w2 = multiWorld([], { skip: ['newcomers'] });
  let msg = '';
  try { w2.env.run((api) => api.새가족목록_()); } catch (e) { msg = e.message; }
  ok(/DB04/.test(msg) && /db:create/.test(msg), '빠진 시트는 [DB04] 와 해결 방법을 알려줌: ' + msg);
  w2.env.run((api) => { eq(api.getCells().length, 2, '…다른 시트는 정상 동작'); });

  // 옛 시트 예비: 새가족 탭이 아직 옛 시트에만 있는 경우
  const w3 = multiWorld([], { skip: ['newcomers'], legacyTabs: ['새가족'] });
  w3.env.run((api) => {
    eq(api.새가족목록_().map((x) => x.name), ['홍길동'], 'DB04 가 없어도 옛 시트에서 예비로 읽음');
    api.sheet_('새가족').appendRow(['이예비', '', '', '', '', '', '', '', '', '', '2026-09-27', '진행중']);
    api.캐시비움_();
  });
  eq(w3.fake.values(w3.legacy.id, '새가족').length, 3, '옮기지 않은 탭의 쓰기는 옛 시트로 (데이터가 갈라지지 않음)');

  // 새 시트에 같은 탭이 있으면 새 시트가 우선
  const w4 = multiWorld([], { legacyTabs: ['새가족'] });
  w4.fake.editByHand(w4.legacy.id, '새가족', 2, 1, '옛시트값');
  w4.env.run((api) => eq(api.새가족목록_().map((x) => x.name), ['홍길동'], '같은 탭이 둘 다 있으면 새 시트가 우선'));
}

/* ================================================================ E. 권한 */
function testPermissions() {
  section('E. 개인 권한 · 위원회');
  [['예전 방식', () => legacyWorld(PERMS)], ['새 방식', () => multiWorld(PERMS)]].forEach(([label, mk]) => {
    console.log('  (' + label + ')');
    const { env } = mk();
    env.run((api) => {
      const P = (n, kind, target) => api.포털권한_(tokenOf(api, n), kind, target);
      eq([P('정일반', '새가족'), P('박새가족', '새가족'), P('김커미티', '새가족'), P('최셀장', '셀', '1셀'), P('최셀장', '셀', '2셀'), P('윤팀장', '팀', '찬양1팀'), P('윤팀장', '팀', '재정팀')],
        [false, true, true, true, false, true, false], '행이 없는 사람은 예전 역할 계산 그대로');
      eq(P('한차단', '새가족'), false, '커미티라도 개인 차단이면 막힘');
      eq(P('강허용', '새가족'), true, '개인 허용은 열림');
      eq(P('만료', '새가족'), false, '만료된 허용은 무시');
      eq([P('오범위', '셀', '1셀'), P('오범위', '셀', '2셀')], [true, false], '범위(셀) 허용은 그 셀만');
      eq([P('이예배', '팀', '찬양1팀'), P('이예배', '팀', '재정팀'), P('이예배', '새가족'), P('이예배', '셀', '1셀')], [true, false, false, false], '위원회 범위 회원은 자기 위원회 팀만');
      eq([api.커미티토큰_(tokenOf(api, '김커미티')), api.커미티토큰_(tokenOf(api, '한차단')), api.커미티토큰_(tokenOf(api, '이예배')), api.커미티토큰_(tokenOf(api, '정일반')), api.커미티토큰_('ADM')],
        [true, true, false, false, true], '커미티토큰_: 전체 커미티만 true (위원회 범위 · 일반은 false, 관리자키는 true)');
      const has = (arr, ...k) => k.every((x) => arr.indexOf(x) !== -1);
      const none = (arr, ...k) => k.every((x) => arr.indexOf(x) === -1);
      ok(has(menuKeys(api, '김커미티'), 'album', 'leader', 'team', 'newfamily', 'worship', 'mission', 'forms', 'minutes'), '전체 커미티의 메뉴는 예전 그대로');
      const j = menuKeys(api, '정일반'); ok(has(j, 'album') && none(j, 'newfamily', 'leader', 'team', 'minutes', 'forms'), '일반 교인은 앨범 위주: ' + j);
      ok(has(menuKeys(api, '박새가족'), 'newfamily'), '새가족팀은 새가족 관리');
      ok(none(menuKeys(api, '한차단'), 'newfamily') && has(menuKeys(api, '한차단'), 'leader', 'minutes'), '차단한 메뉴만 사라짐');
      ok(has(menuKeys(api, '강허용'), 'newfamily'), '허용한 메뉴가 추가됨');
      ok(none(menuKeys(api, '만료'), 'newfamily'), '만료된 허용은 메뉴에 없음');
      const y = menuKeys(api, '이예배');
      ok(has(y, 'worship', 'team', 'minutes', 'album') && none(y, 'newfamily', 'leader', 'mission', 'forms'), '위원회 범위 회원은 그 위원회 메뉴만: ' + y);
      eq(adminKeys(api, '이예배'), [], '위원회 범위 회원에게 커미티 관리 칸 없음');
      const k = api.포털관리메뉴_(api.포털역할_('김커미티'), tokenOf(api, '김커미티'));
      ok(k.length > 0 && k.some((x) => /key=ADM/.test(x.url || '')), '전체 커미티는 예전처럼 관리자키 링크');
      ok(!JSON.stringify(api.포털관리메뉴_(api.포털역할_('이예배'), tokenOf(api, '이예배'))).includes('ADM'), '위원회 범위에는 관리자키가 실리지 않음');
      ok(api.이름권한_('이예배', 'newfamily', '').ok === false && api.이름권한_('이예배', 'worship', '').ok === true, '이름권한_ 설명 함수');
      eq(api.개인메뉴상태_('한차단', 'newfamily', api.포털역할_('한차단')).deny, true, '개인메뉴상태_ deny');
    });

    env.run((api) => {
      const res = api.savePermission('ADM', '정일반', '메뉴', 'newfamily', '허용', '', '', '시험');
      ok(res.ok && res.rows.some((r) => r.name === '정일반'), 'savePermission 저장');
      eq(api.포털권한_(tokenOf(api, '정일반'), '새가족'), true, '저장 즉시 반영');
      throws(() => api.savePermission('ADM', '정일반', '메뉴', 'album', '허용', '', '', ''), /지키지 않습니다/, '서버가 지키지 않는 메뉴 허용은 거절');
      throws(() => api.savePermission('ADM', '없는사람', '메뉴', 'newfamily', '허용', '', '', ''), /교적에 없는/, '교적에 없는 이름은 거절');
      throws(() => api.savePermission('ADM', '정일반', '메뉴', 'newfamily', '허용', '', '내일', ''), /만료일/, '만료일 형식 검사');
      throws(() => api.savePermission(tokenOf(api, '정일반'), '정일반', '메뉴', 'newfamily', '허용', '', '', ''), /커미티만/, '일반 교인은 권한을 바꿀 수 없음');
      throws(() => api.savePermission(tokenOf(api, '이예배'), '정일반', '메뉴', 'newfamily', '허용', '', '', ''), /커미티만/, '위원회 범위 회원도 권한을 바꿀 수 없음');
      const w = api.savePermission('ADM', '정일반', '메뉴', 'minutes', '차단', '', '', '');
      ok(/메뉴에서만/.test(w.warning), '서버가 안 지키는 메뉴 차단은 경고를 줌');
      api.deletePermission('ADM', '정일반', '메뉴', 'newfamily', '허용');
      eq(api.포털권한_(tokenOf(api, '정일반'), '새가족'), false, '삭제하면 예전으로 돌아감');
      ok(api.explainPermission('ADM', '이예배') && typeof api.explainPermission('ADM', '이예배') === 'object', 'explainPermission 이 결과를 줌');
      ok(api.myPermissions(tokenOf(api, '이예배')) && typeof api.myPermissions(tokenOf(api, '이예배')) === 'object', 'myPermissions 가 결과를 줌');
    });
  });

  const w = multiWorld([]);
  w.env.run((api) => api.savePermission('ADM', '정일반', '메뉴', 'newfamily', '허용', '', '', ''));
  ok(w.fake.values(w.books.system.id, '사용자권한').some((r) => r[0] === '정일반'), '권한 행은 [DB11] 에 저장');

  // 탭이 아예 없어도 (처음 켤 때) 안전
  const fake = new FakeGoogle();
  const tabs = baseTabs([]); delete tabs['사용자권한'];
  const lg = fake.addBook('옛 시트', tabs);
  const env = boot({ SPREADSHEET_ID: lg.id }, fake);
  env.run((api) => {
    eq(api.포털권한_(tokenOf(api, '박새가족'), '새가족'), true, '사용자권한 탭이 없어도 예전대로');
    api.savePermission('ADM', '정일반', '메뉴', 'newfamily', '허용', '', '', '');
  });
  ok(fake.books.get(lg.id).sheets.some((s) => s.title === '사용자권한'), '처음 저장할 때 탭이 저절로 만들어짐');
}

/* ================================================================ F. 딥링크 */
function testDeepLink() {
  section('F. 딥링크');
  const { env } = legacyWorld(PERMS);
  env.run((api) => {
    const enc = encodeURIComponent('홍길동');
    eq(api.딥링크주소_('newcomer', '홍길동'), 'https://app.test/?page=portal&go=newcomer&id=' + enc, '새가족 주소');
    eq(api.딥링크주소_('cell', '1셀', '2026-09-27'), 'https://app.test/?page=portal&go=cell&id=' + encodeURIComponent('1셀') + '&x=2026-09-27', '셀 + 날짜');
    eq(api.딥링크주소_('모름', 'x'), 'https://app.test/?page=portal', '모르는 종류는 포털 첫 화면');
    eq(api.딥링크주소_('newcomer', ''), 'https://app.test/?page=portal', '번호 없으면 포털 첫 화면');
    eq(api.딥링크정규화_('newcomer:홍길동'), api.딥링크주소_('newcomer', '홍길동'), '줄임 표기 newcomer:이름');
    eq(api.딥링크정규화_('cell:1셀@2026-09-27'), api.딥링크주소_('cell', '1셀', '2026-09-27'), '줄임 표기 cell:셀@날짜');
    eq(api.딥링크정규화_('https://example.com/x'), 'https://example.com/x', '일반 주소는 그대로');
    eq(api.딥링크정규화_('http://a.b:8080/x'), 'http://a.b:8080/x', 'http:// 는 줄임 표기로 오해하지 않음');

    const tk = (n) => tokenOf(api, n);
    let r = api.resolveDeepLink(tk('박새가족'), 'newcomer', '홍길동');
    ok(r.ok && /page=newfamily/.test(r.url) && /open=%ED%99%8D%EA%B8%B8%EB%8F%99/.test(r.url) && /t=/.test(r.url), '새가족팀 → 새가족 화면 + open=이름: ' + r.url);
    r = api.resolveDeepLink(tk('정일반'), 'newcomer', '홍길동');
    ok(!r.ok && r.code === 'forbidden', '권한 없으면 forbidden (오류를 던지지 않음)');
    r = api.resolveDeepLink(tk('박새가족'), 'newcomer', '없는사람');
    ok(!r.ok && r.code === 'notfound', '없는 새가족은 notfound');
    r = api.resolveDeepLink('YNP2.가짜.토큰', 'newcomer', '홍길동');
    ok(!r.ok && r.code === 'login', '가짜 토큰은 login');
    r = api.resolveDeepLink(tk('김커미티'), 'minutes', 'm1');
    ok(r.ok && /page=minutes/.test(r.url) && /id=m1/.test(r.url), '커미티 → 회의록');
    r = api.resolveDeepLink(tk('정일반'), 'minutes', 'm1');
    ok(!r.ok && r.code === 'forbidden', '일반 교인은 회의록 forbidden');
    r = api.resolveDeepLink(tk('윤팀장'), 'minutes', 'm2');
    ok(r.ok, '팀장은 자기 팀 회의록을 열 수 있음');
    r = api.resolveDeepLink(tk('오팀장'), 'minutes', 'm2');
    ok(!r.ok && r.code === 'forbidden', '다른 팀 회의록은 forbidden');
    r = api.resolveDeepLink(tk('정일반'), 'album', 'a1');
    ok(r.ok && /page=album/.test(r.url), '앨범은 교인이면 누구나');
    r = api.resolveDeepLink(tk('정일반'), 'album', 'zzz');
    ok(!r.ok && r.code === 'notfound', '없는 앨범 notfound');
    r = api.resolveDeepLink(tk('최셀장'), 'cell', '1셀', '2026-09-27');
    ok(r.ok && /page=leader/.test(r.url) && /cell=/.test(r.url) && /date=2026-09-27/.test(r.url), '셀장 → 자기 셀 보고서 + 날짜');
    r = api.resolveDeepLink(tk('최셀장'), 'cell', '2셀');
    ok(!r.ok && r.code === 'forbidden', '남의 셀은 forbidden');
    r = api.resolveDeepLink('ADM', 'newcomer', '홍길동');
    ok(r.ok, '관리자키는 통과');
    r = api.resolveDeepLink(tk('김커미티'), 'weird', 'x');
    ok(!r.ok && r.code === 'unknown', '모르는 종류는 unknown');
  });
  ok(env.runtime.isCallable('resolveDeepLink'), 'resolveDeepLink 는 브라우저에서 부를 수 있음');
  ok(!env.runtime.isCallable('딥링크확인_') && !env.runtime.isCallable('개인권한_'), '내부 함수는 브라우저에서 못 부름');
  ok(env.runtime.isCallable('savePermission') && env.runtime.isCallable('myPermissions'), '권한 API 는 부를 수 있음');

  const src = fs.readFileSync(path.join(ROOT, 'logic', 'app.js'), 'utf8');
  ok(/딥링크주소_\('newcomer'/.test(src) && /딥링크주소_\('minutes'/.test(src), 'app.js 알림들이 딥링크주소_ 를 사용');
  ok(/origin/.test(fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8')), 'sw.js 가 알림 주소의 출처를 확인');
  const portal = fs.readFileSync(path.join(ROOT, 'views', 'Portal.html'), 'utf8');
  ok(/resolveDeepLink/.test(portal) && /ynGo/.test(portal), 'Portal.html 이 resolveDeepLink 로 이동');
  ok(/openFromLink/.test(fs.readFileSync(path.join(ROOT, 'views', 'NewFamily.html'), 'utf8')), 'NewFamily.html 이 open= 을 처리');
}

/* ================================================================ G. 이전 도구 */
function testSetup() {
  section('G. db-setup (status / create / migrate)');
  const fake = new FakeGoogle();
  const lt = baseTabs(PERMS); lt['Sheet1'] = [];                             // 옛 시트에 남아 있던 빈 "Sheet1" 탭 (실제로 있었던 경우)
  const legacy = fake.addBook('옛 통합 시트', lt);
  fake.addBook('[DB11] 기타 시스템 자료', { 'Sheet1': [] }, 'FOLDER');       // 이미 하나는 만들어 둔 상태
  const env = boot({ SPREADSHEET_ID: legacy.id, DB_FOLDER_ID: 'FOLDER' }, fake);
  const log = console.log;
  const quiet = (fn) => { const out = []; console.log = (...a) => out.push(a.join(' ')); try { return { r: fn(), out }; } finally { console.log = log; } };
  const setup = require('./db-setup');
  const inFolder = () => Array.from(fake.books.values()).filter((b) => b.parent === 'FOLDER');

  let q = quiet(() => setup.status());
  ok(q.out.some((l) => /DB01/.test(l)) && process.exitCode === 1, '시트가 빠진 상태의 status 는 문제로 표시함');
  process.exitCode = 0;

  q = quiet(() => setup.create());
  eq(q.r, 10, 'create: 빠진 10개만 만듦');
  eq(inFolder().length, 11, '폴더 안에 11개');
  q = quiet(() => setup.status());
  ok(!process.exitCode, '11개가 갖춰진 뒤 status 는 통과'); process.exitCode = 0;
  q = quiet(() => setup.create());
  eq(q.r, 0, 'create 를 다시 하면 아무것도 안 만듦');

  const snap = () => JSON.stringify(inFolder().map((b) => b.sheets.map((s) => s.title)));
  const before = snap();
  q = quiet(() => setup.migrate({ apply: false }));
  eq(snap(), before, '미리보기(dry-run)는 아무것도 안 바꿈');
  ok(q.r && q.r.applied === false && q.r.rows.length >= 10, '미리보기에 계획이 나옴 (' + (q.r && q.r.rows.length) + '개 탭)');

  q = quiet(() => setup.migrate({ apply: true }));
  ok(q.r && q.r.applied && q.r.mismatch === 0, 'migrate --apply 후 값 검증 일치 (' + (q.r && q.r.mismatch) + '건 불일치)');
  ok(!process.exitCode, 'migrate 가 오류 표시 없이 끝남');
  process.exitCode = 0;
  const { db } = env;
  const legacyTabs = fake.books.get(legacy.id).sheets.map((s) => s.title);
  let allThere = true;
  legacyTabs.forEach((t) => {
    const w = db.BY_KEY[db.keyFor(t)];
    const b = inFolder().find((x) => x.name.indexOf('[' + w.code + ']') !== -1);
    if (!b || !b.sheets.some((s) => s.title === t)) { allThere = false; console.log('    없음: ' + t + ' → ' + w.code); }
    else if (JSON.stringify(fake.values(b.id, t)) !== JSON.stringify(fake.values(legacy.id, t))) { allThere = false; console.log('    값 다름: ' + t); }
  });
  ok(allThere, '옛 시트의 모든 탭이 맞는 시트에 같은 값으로 옮겨짐');
  eq(fake.books.get(legacy.id).sheets.length, legacyTabs.length, '옛 시트는 그대로 (지워지지 않음)');
  eq(inFolder().filter((b) => b.sheets.length > 1 && b.sheets.some((s) => /^Sheet1$/.test(s.title))).map((b) => b.name), ['[DB11] 기타 시스템 자료'],
    '새 시트의 빈 기본 "Sheet1" 은 정리되고, 옛 시트에서 온 "Sheet1" 탭([DB11])은 남음');

  q = quiet(() => setup.migrate({ apply: true }));
  ok(q.r && q.r.rows.every((r) => r.action !== 'copy'), '다시 실행하면 이미 있는 탭은 건너뜀');
  fake.editByHand(legacy.id, '교적', 2, 2, '000-000-0000');
  q = quiet(() => setup.migrate({ apply: true, overwrite: true }));
  ok(q.r && q.r.mismatch === 0, '--overwrite 로 옛 시트의 최신 값을 다시 복사');
  process.exitCode = 0;

  const env2 = boot({ SPREADSHEET_ID: legacy.id, DB_FOLDER_ID: 'FOLDER' }, fake);
  env2.run((api) => {
    eq(api.새가족목록_().map((x) => x.name), ['홍길동'], '이전 후 앱이 11개 시트에서 읽음');
    eq(api.포털권한_(tokenOf(api, '이예배'), '팀', '찬양1팀'), true, '이전 후에도 권한 판정 동일');
  });
  const env3 = boot({ DB_FOLDER_ID: 'FOLDER' }, fake);
  env3.run((api) => { eq(api.getCells().length, 2, '옛 시트 없이 11개 시트만으로 동작'); });
}

/* ---------------------------------------------------------------- 실행 */
[testMap, testDup, testLegacyMode, testMultiMode, testPermissions, testDeepLink, testSetup].forEach((t) => {
  try { t(); } catch (e) { fail++; failures.push(t.name + ': ' + e.message); console.log('  ✗ ' + t.name + ' 실행 중 오류: ' + (e.stack || e.message)); }
});
console.log('\n' + (fail ? '✗ 실패 ' + fail + '건' : '✓ 모두 통과') + ' (통과 ' + pass + ')');
if (fail) { failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
