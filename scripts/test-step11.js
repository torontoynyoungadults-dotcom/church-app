/**
 * Step 11 시험 (서버) — 진짜 구글 없이(scripts/fake-google.js) 확인합니다.
 *   node scripts/test-step11.js
 *  A. 푸시는 짧게 (제목 40자 · 본문 100자, 줄은 · 로 이어 붙임)
 *  B. HTML 이메일 템플릿 (머리말 · 카드 · 버튼 · 꼬리말 · 안내 상자 · 이스케이프)
 *  C. 알림 미리보기 API (notificationPreview) — 권한 · 종류 · 저장 전 안내 문구 · 보내지 않음
 *  D. 실제 발송 — 푸시는 짧고 이메일은 스타일 HTML 이며 안내 문구는 이메일에만
 *  E. 포털 메뉴 재편 — 셀모임 / 사역팀(하위 메뉴 · 지출환급신청) / 일반 신청서 관리 / 수련회·선교 예산·정산
 *  F. 커미티 관리 카드 — 설교 · 말씀 / 알림 · 이메일이 독립, 앱 기능 관리는 그대로 권한을 따름
 *  G. 새가족 포털 편집 — 기본값(예전 화면과 같음) · 정리 · 권한 · newcomerHome 반영 · 미리보기
 *  I. 내 노트 — QT · 묵상 노트(source 'qt') 저장 · 종류 유지 · 목록 구분 · 설교 노트는 그대로
 *  H. 다른 분 화면 보기 1:1 — 교인(내 정보 · 알림 · 신청서 · 셀 신청) / 새가족(실제 첫 화면 자료)
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });

const ADM = 'ADM';
const P김 = '4165551000', P정 = '4165551008', P윤 = '4165551009';
const HEAD_푸시 = ['이름', '이메일', '기기', '구독', '등록일', '마지막알림', '상태'];

function mkEnv(pushed, mails) {
  const env = newEnv((tabs) => {
    tabs['설정'] = tabs['설정'].concat([['푸시공개키', 'pub', ''], ['푸시비밀키', 'pri', '']]);
    const 기기 = ['정일반', '윤팀장', '김커미티'];
    tabs['알림기기'] = [HEAD_푸시].concat(기기.map((n) => [n, '', '시험기기', JSON.stringify({ endpoint: 'https://push.test/' + encodeURIComponent(n) }), '2026-09-01', '', '']));
    const nf = (name, email) => { const r = new Array(18).fill(''); r[0] = name; r[3] = '416-555-2001'; r[10] = '2026-09-20'; r[11] = '진행중'; r[15] = email; return r; };
    tabs['새가족'].push(nf('김새싹', 'saessak@example.com'), nf('이무메일', ''));
  }, { GMAIL_USER: 'test@example.com', GMAIL_APP_PASSWORD: 'pw' });
  env.fake.call = (op, a) => {
    if (op === 'token') return 'fake-token';
    if (op === 'push') {
      pushed.push({ names: a.subscriptions.map((s) => decodeURIComponent(s.endpoint.split('/').pop())).sort(), title: a.payload.title, body: a.payload.body, url: a.payload.url });
      return { results: a.subscriptions.map(() => ({ ok: true })) };
    }
    if (op === 'mail') { mails.push(a); return null; }
    return null;
  };
  return env;
}

function main() {
  const pushed = [], mails = [];
  const env = mkEnv(pushed, mails);
  const run = env.run;
  const tok = (n, p) => run((api) => api.포털토큰_(n, p, ''));
  const 커미티 = tok('김커미티', P김), 일반 = tok('정일반', P정), 팀장 = tok('윤팀장', P윤);

  section('A. 푸시는 짧게');
  {
    const s = run((api) => api.알림푸시문구11_({ title: 'ㄱ'.repeat(60), body: '첫 줄입니다\n\n둘째 줄\n' + 'ㅏ'.repeat(300), url: '/x' }));
    ok(s.title.length <= 40 && /…$/.test(s.title), '제목은 40자 이내 + …');
    ok(s.body.length <= 100 && /…$/.test(s.body), '본문은 100자 이내 + …');
    ok(s.body.indexOf('첫 줄입니다 · 둘째 줄') === 0, '여러 줄은 " · " 로 이어 붙임 (빈 줄 제외)');
    eq(s.url, '/x', '다른 값(url 등)은 그대로');
    const t = run((api) => api.알림푸시문구11_({ title: '짧은 제목', body: '짧은 본문' }));
    eq([t.title, t.body], ['짧은 제목', '짧은 본문'], '짧은 글은 그대로');
    eq(run((api) => api.알림푸시문구11_(null)).body, '', 'null 도 안전');
  }

  section('B. HTML 이메일 템플릿');
  {
    const html = run((api) => api.알림메일템플릿11_({ title: '주보 <b>공지</b>', body: '첫 문단\n줄바꿈\n\n둘째 문단 & 특수문자', url: 'https://app.test/?page=bulletin', note: '문의는 커미티에게', label: '새 주보 · 공지' }));
    ok(/^<!DOCTYPE html>/.test(html), 'DOCTYPE 로 시작');
    ok(html.indexOf('토론토영락교회 청년1부') !== -1, '머리말에 교회 이름');
    ok(html.indexOf('주보 &lt;b&gt;공지&lt;/b&gt;') !== -1 && html.indexOf('<b>공지</b>') === -1, '제목의 HTML 은 이스케이프');
    ok(html.indexOf('둘째 문단 &amp; 특수문자') !== -1, '본문 특수문자 이스케이프');
    ok(/첫 문단<br>줄바꿈/.test(html), '한 줄 바꿈은 <br>, 빈 줄은 문단');
    ok(/<a href="https:\/\/app\.test\/\?page=bulletin"[^>]*>포털에서 확인하기<\/a>/.test(html), 'CTA 버튼(링크) 이 있음');
    ok(html.indexOf('문의는 커미티에게') !== -1 && html.indexOf('border-left:4px solid #EE5622') !== -1, '안내 문구는 강조 상자로 따로');
    ok(html.indexOf('새 주보 · 공지') !== -1, '분류 이름표');
    ok(html.indexOf('650 McNicoll Ave') !== -1, '꼬리말에 교회 주소');
    ok(/max-width:560px/.test(html) && /<table role="presentation"/.test(html), '표 기반 · 560px 폭 (메일 앱 호환)');
    const plain = run((api) => api.알림메일템플릿11_({ title: '제목만' }));
    ok(plain.indexOf('border-left:4px solid #EE5622') === -1 && plain.indexOf('/?page=portal') !== -1, '안내 문구가 없으면 상자 없음 · 주소 기본값은 포털');
    const legacy = run((api) => api.알림메일본문_({ title: '옛 호출', body: '본문', url: 'https://app.test/' }));
    ok(/^<!DOCTYPE html>/.test(legacy) && legacy.indexOf('옛 호출') !== -1, '예전 알림메일본문_ 호출도 새 템플릿으로 나감');
    ok(run((api) => api.알림메일템플릿11_({ title: 't', cta: '지금 열기' })).indexOf('지금 열기') !== -1, 'cta 글자 바꾸기');
  }

  section('C. 알림 미리보기 API');
  {
    const p = run((api) => api.notificationPreview(커미티, { kind: '셀보고' }));
    eq(p.kind, '셀보고', '종류');
    eq(p.kindName, '셀보고 독려', '종류 이름');
    ok(p.push.title && p.push.body && p.push.app === '토론토영락교회 청년1부', '푸시 미리보기: 앱 이름 · 제목 · 본문');
    ok(/^<!DOCTYPE html>/.test(p.email.html) && p.email.subject.indexOf('[청년1부] ') === 0, '이메일 미리보기: HTML · 제목');
    ok(p.email.html.indexOf('셀보고 독려') !== -1, '이메일에 분류 이름표');
    const before = pushed.length + mails.length;

    run((api) => api.saveNotifyNote(커미티, '셀보고', '저장된 안내 문구'));
    const p2 = run((api) => api.notificationPreview(커미티, { kind: '셀보고' }));
    ok(p2.email.html.indexOf('저장된 안내 문구') !== -1, '저장된 안내 문구는 이메일 카드에 실림');
    ok(p2.push.body.indexOf('저장된 안내 문구') === -1, '…푸시에는 실리지 않음');
    const p3 = run((api) => api.notificationPreview(커미티, { kind: '셀보고', note: '저장 전 고치는 중' }));
    ok(p3.email.html.indexOf('저장 전 고치는 중') !== -1 && p3.email.html.indexOf('저장된 안내 문구') === -1, '저장 전 문구(note)로도 미리보기');

    const c = run((api) => api.notificationPreview(커미티, { title: '수련회 안내 ' + 'ㅁ'.repeat(50), body: '길게 적은 내용\n둘째 줄', url: '?page=bulletin' }));
    eq(c.kind, '', '직접 쓴 공지는 종류 없음');
    ok(c.push.chars.title <= 40 && c.push.chars.body <= 100, '글자 수가 함께 옴');
    ok(c.push.url.indexOf('page=bulletin') !== -1, '고른 화면 주소');
    ok(c.email.html.indexOf('길게 적은 내용') !== -1, '이메일 본문은 줄이지 않음');

    eq(pushed.length + mails.length, before, '미리보기는 아무것도 보내지 않음');
    throws(() => run((api) => api.notificationPreview(일반, { kind: '셀보고' })), /커미티/, '커미티가 아니면 거절');
    throws(() => run((api) => api.notificationPreview(커미티, { kind: '없는종류' })), /없는 알림 종류/, '없는 종류');
    ok(run((api) => api.notificationPreview(커미티, {})).push.title === '(제목)', '아무것도 안 주면 자리표시');
  }

  section('D. 실제 발송 — 푸시는 짧게, 이메일은 스타일 HTML');
  {
    pushed.length = 0; mails.length = 0;
    const longBody = '첫 줄 안내입니다.\n' + '자세한 내용 '.repeat(40);
    run((api) => api.saveNotifyNote(커미티, '공지', '이 문구는 이메일에만'));
    const r = run((api) => api.sendNotice(커미티, { title: '긴 공지 ' + 'ㅂ'.repeat(50), body: longBody, target: '전체', push: true, mail: true, portal: false }));
    ok(r.push >= 1, '푸시 보냄');
    const p = pushed[pushed.length - 1];
    ok(p && p.title.length <= 40 && p.body.length <= 100, '푸시: 제목 40 · 본문 100자 이내');
    ok(p.body.indexOf('이 문구는 이메일에만') === -1, '푸시에 안내 문구가 없음');
    // 공지 이메일 — 교적에 이메일이 있는 분에게
    ok(mails.length >= 1, '이메일도 나감');
    const m = mails[mails.length - 1];
    ok(/^<!DOCTYPE html>/.test(m.htmlBody) && m.htmlBody.indexOf('자세한 내용') !== -1, '이메일은 스타일 HTML + 본문 전체');
    ok(m.subject.indexOf('[청년1부] 긴 공지') === 0, '이메일 제목');

    // 알림 종류(자동 알림)의 푸시 + 이메일
    pushed.length = 0; mails.length = 0;
    run((api) => api.설정저장_('알림메일_셀보고', 'ON'));
    run((api) => api.saveNotifyNote(커미티, '셀보고', '셀보고는 일요일까지'));
    const rr = run((api) => api.알림보내기_('셀보고', ['정일반'], { title: '셀보고서를 기다립니다', body: '9/28 보고서\n아직 안 올라왔어요', url: 'https://app.test/?page=leader' }));
    ok(rr.sent === 1, '푸시 1건');
    ok(pushed[0].body.indexOf('셀보고는 일요일까지') === -1 && pushed[0].body.indexOf('9/28 보고서 · 아직 안 올라왔어요') === 0, '푸시: 안내 문구 없이 줄만 이어 붙임');
    ok(mails.length === 1 && mails[0].htmlBody.indexOf('셀보고는 일요일까지') !== -1 && mails[0].htmlBody.indexOf('셀보고 독려') !== -1, '이메일: 안내 문구 상자 + 분류 이름표');
    ok(mails[0].htmlBody.indexOf('href="https://app.test/?page=leader"') !== -1, '이메일 버튼이 그 화면으로');
  }

  section('E. 포털 메뉴 재편');
  {
    const me = run((api) => api.getMyProfile(커미티));
    const byKey = {}; me.menus.forEach((m) => { byKey[m.key] = m; });
    eq(byKey.leader.title, '셀모임', '셀모임 보고서 → 셀모임');
    ok(!byKey.leader.subs && !byKey.team.subs, 'v2: 포털에는 하위 메뉴를 따로 펼치지 않음 (타일은 페이지로 바로 — 탭은 그 페이지 안에)');
    ok(/page=leader/.test(byKey.leader.url) && /page=team/.test(byKey.team.url), '셀모임 · 사역팀 타일 주소는 그대로');
    eq(byKey.team.title, '사역팀', '사역 보고서 → 사역팀');
    ok(!byKey.expense, '지출환급신청서 타일은 사역팀 페이지의 탭으로 들어감 (따로 안 보임)');
    eq(byKey.forms.title, '일반 신청서 관리', '신청서 관리 → 일반 신청서 관리');
    ok(byKey.forms.url.indexOf('page=forms') !== -1, '주소(권한 · 경로)는 그대로');
    ok(byKey.newfamily && byKey.worship && byKey.mission, '다른 메뉴는 그대로');
    ok(!/Youth Archive|아카이브/.test(JSON.stringify(me.menus)), '옛 이름이 남지 않음');
    if (byKey.budget) eq(byKey.budget.title, '수련회 · 선교 예산/정산', '행사 예산 · 정산 → 수련회 · 선교 예산/정산');

    const g = run((api) => api.getMyProfile(일반));
    ok(!g.menus.some((m) => m.key === 'team' || m.key === 'leader' && false), '팀장이 아닌 교인에게 사역팀 메뉴 없음');
    const ldr = run((api) => api.getMyProfile(팀장));
    ok(ldr.menus.some((m) => m.key === 'team' && m.title === '사역팀'), '팀장에게도 사역팀 타일');

    const order = run((api) => api.getMenuOrder(커미티));
    ok(order.portal.some((x) => x.key === 'budget' && x.title === '수련회 · 선교 예산/정산'), '메뉴 순서 화면: 새 이름');
    ok(!order.portal.some((x) => x.key === 'expense'), '메뉴 순서 화면에서 지출환급 타일은 빠짐');
    run((api) => api.saveMenuOrder(커미티, 'portal', ['forms', 'team', 'leader']));
    const me2 = run((api) => api.getMyProfile(커미티));
    eq(me2.menus.slice(0, 3).map((m) => m.key), ['forms', 'team', 'leader'], '저장된 순서(key 기준)가 새 이름에도 그대로 적용됨');
    run((api) => api.saveMenuOrder(커미티, 'portal', []));
  }

  section('F. 커미티 관리 카드 — 독립 메뉴');
  {
    const me = run((api) => api.getMyProfile(커미티));
    const keys = me.admin.map((a) => a.key);
    ok(['word', 'push', 'app'].every((k) => keys.indexOf(k) !== -1), '설교 · 말씀 / 알림 · 이메일 / 앱 기능 관리 카드가 각각 있음 → ' + keys.join(','));
    const w = me.admin.find((a) => a.key === 'word'), pu = me.admin.find((a) => a.key === 'push'), ap = me.admin.find((a) => a.key === 'app');
    ok(/#word$/.test(w.url) && /#push$/.test(pu.url) && /#app$/.test(ap.url), '각 카드가 자기 영역(#word · #push · #app)으로');
    ok(/메뉴 순서/.test(ap.desc) && /AI/.test(ap.desc) && /일정/.test(ap.desc) && /권한/.test(ap.desc), '앱 기능 관리 = 메뉴 순서 · AI · 일정 · 권한');
    ok(!/알림/.test(ap.desc) && !/설교/.test(ap.desc), '앱 기능 관리에서 설교 · 알림은 빠짐');
    ok(!keys.some((k) => k === 'home'), '옛 관리 홈 카드 없음');
    const order = run((api) => api.getMenuOrder(커미티));
    ok(order.admin.some((x) => x.key === 'word') && order.admin.some((x) => x.key === 'push'), '관리 카드 순서 화면에도 새 카드');
    // 권한 — '앱 기능 관리' 권한은 새 카드(설교 · 알림)에도 그대로 이어짐
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'logic', 'permissions.js'), 'utf8');
    ok(/word: 'admin\.app'/.test(src) && /push: 'admin\.app'/.test(src), '설교 · 알림 카드는 예전처럼 admin.app 권한을 따름 (관리메뉴권한키_)');
  }

  section('G. 새가족 포털 편집');
  {
    const d = run((api) => api.새가족포털설정11_());
    eq(d.widgets.filter((w) => w.on).map((w) => w.id), ['welcome', 'cellapp', 'mycell', 'todos', 'forms', 'edit'], '기본값은 예전 화면과 같은 위젯 (안내 · 바로가기는 꺼짐)');
    eq([d.title, d.showStatus], ['{name}님, 환영합니다', true], '기본 제목 · 상태 줄');

    const init = run((api) => api.newcomerPortalAdminInit(커미티));
    ok(init.catalog.length === 8 && init.config.widgets.length === 8, '편집 화면 첫 자료: 위젯 8종');
    throws(() => run((api) => api.newcomerPortalAdminInit(일반)), /새가족팀|커미티/, '일반 교인은 볼 수 없음');
    throws(() => run((api) => api.saveNewcomerPortalConfig(일반, {})), /새가족팀|커미티/, '일반 교인은 저장할 수 없음');

    const bad = {
      title: '  ' + 'ㅋ'.repeat(100), message: '문구\n둘째 줄', showStatus: false, todosTitle: '',
      widgets: [{ id: 'links', on: true }, { id: 'evil', on: true }, { id: 'welcome', on: false }, { id: 'links', on: false }, { id: 'notice', on: true }],
      notice: { title: '공지', text: '내용', label: '안내', url: 'javascript:alert(1)' },
      links: [{ label: '주보', url: '?page=bulletin' }, { label: '나쁜', url: 'javascript:alert(1)' }, { label: '', url: '?page=calendar' },
        { label: '바깥', url: 'https://example.com/a' }, { label: '7', url: '?page=devotion' }, { label: '8', url: '?page=notes' }, { label: '9', url: '?page=album' }, { label: '10', url: '?page=sermons' }]
    };
    const sv = run((api) => api.saveNewcomerPortalConfig(커미티, bad)).config;
    ok(sv.title.length <= 60, '제목 60자로 제한');
    eq(sv.widgets.map((w) => w.id).slice(0, 3), ['links', 'welcome', 'notice'], '입력한 순서를 지키고 · 모르는 위젯(evil)과 중복은 버림');
    ok(sv.widgets.length === 8 && sv.widgets.every((w) => w.id !== 'evil'), '빠진 위젯은 뒤에 덧붙어 8종이 유지됨');
    eq(sv.widgets.find((w) => w.id === 'welcome').on, true, '환영 카드는 끌 수 없음');
    eq(sv.todosTitle, '알림', '알림 카드 이름이 비면 기본값');
    eq(sv.notice.url, '', 'javascript: 링크는 버림');
    eq(sv.links.map((l) => l.label), ['주보', '바깥', '7', '8', '9', '10'], '나쁜 링크 · 이름 없는 링크는 버리고 최대 6개');

    const home = run((api) => api.newcomerHome(run((api2) => api2.새가족토큰_('saessak@example.com'))));
    eq(home.portalCfg.title, sv.title, 'newcomerHome 에 편집한 설정이 실림');
    ok(home.name === '김새싹' && Array.isArray(home.todos), '기존 필드(이름 · 알림)는 그대로');

    // 미리보기 자료
    ok(run((api) => api.새가족미리보기11_({ nfpreview: '1', t: 커미티 })), '커미티는 미리보기 자료를 받음');
    const pv = run((api) => api.새가족미리보기11_({ nfpreview: '1', t: 커미티 }));
    ok(pv.home.name === '홍길동' && pv.home.cellApp.state === 'open' && pv.home.todos.length >= 1 && pv.cfg.widgets.length === 8, '견본 자료 (셀 신청 · 내 셀 · 알림 · 신청서)');
    eq(run((api) => api.새가족미리보기11_({ nfpreview: '1', t: 일반 })), null, '권한 없는 표는 미리보기 없음');
    eq(run((api) => api.새가족미리보기11_({ t: 커미티 })), null, 'nfpreview 가 없으면 없음');

    const rs = run((api) => api.resetNewcomerPortalConfig(커미티)).config;
    eq(rs.widgets.filter((w) => w.on).map((w) => w.id), ['welcome', 'cellapp', 'mycell', 'todos', 'forms', 'edit'], '기본값으로 되돌림');
    eq(run((api) => api.새가족포털설정11_()).title, '{name}님, 환영합니다', '되돌린 뒤에 읽어도 기본값');
  }

  section('H. 다른 분 화면 보기 — 1:1');
  {
    // 교인
    const v = run((api) => api.portalViewAs(커미티, '정일반'));
    const real = run((api) => api.getMyProfile(일반));
    ok(v.viewAs === '정일반' && !v.viewKind && v.noLink === false, '예전 필드는 그대로');
    eq(v.me, real.me, '내 정보가 그분의 실제 화면과 똑같음');
    eq(v.todos, real.todos, '알림(내 할 일)이 그분의 실제 화면과 똑같음');
    eq(v.forms, real.forms, '신청서 목록이 똑같음');
    eq([v.cellApp, v.myCell], [real.cellApp, real.myCell], '셀 신청 · 내 셀이 똑같음');
    ok('sermon' in v && Array.isArray(v.menus) && Array.isArray(v.admin), '설교 · 메뉴 · 관리 카드');
    eq(v.token, '', '표는 화면에 보내지 않음');
    ok(v.menus.every((m) => /[?&]as=/.test(m.url)), '메뉴는 예전처럼 "as=" 로 그분 이름으로 열림');
    throws(() => run((api) => api.portalViewAs(일반, '정일반')), /커미티/, '커미티가 아니면 거절');

    // 새가족 — 실제 첫 화면 자료
    const n = run((api) => api.portalViewAsNewcomer(커미티, '김새싹'));
    const realNf = run((api) => api.newcomerHome(run((api2) => api2.새가족토큰_('saessak@example.com'))));
    ok(n.home && n.home.token === '', '새가족 실제 첫 화면 자료(home) — 표는 비어 있음');
    eq([n.home.name, n.home.joinedAt, n.home.status], [realNf.name, realNf.joinedAt, realNf.status], '이름 · 등록일 · 상태가 똑같음');
    eq(n.home.todos, realNf.todos, '새가족의 알림이 똑같음');
    eq(n.home.forms, realNf.forms, '새가족의 신청서 목록이 똑같음');
    ok(n.home.portalCfg && n.home.portalCfg.widgets.length === 8, '편집한 포털 설정이 함께 실림');
    ok(n.viewKind === 'newcomer' && n.noLink === true, '예전 필드(viewKind · noLink)는 그대로');
    const nm = run((api) => api.portalViewAsNewcomer(커미티, '이무메일'));
    ok(nm.home && nm.home.name === '이무메일' && Array.isArray(nm.home.todos), '이메일이 없는 새가족도 오류 없이(최소 자료)');
    ok(!/YNN1\./.test(JSON.stringify(n)), '응답 어디에도 새가족 로그인 표가 없음');
  }

  section('I. 내 노트 — 설교 노트 / QT · 묵상 노트');
  {
    let seq = 0;
    const mk = (o) => Object.assign({ id: 'Nq11' + (++seq).toString(36).padStart(6, '0') + 'zz', date: '2026-09-28', title: '', ref: '', preacher: '', body: '', reflection: '', source: 'note' }, o || {});
    const sermon = mk({ title: '설교 노트 제목', ref: '요 3:16', preacher: '강산 목사', body: '설교 필기' });
    const qtNote = mk({ source: 'qt', title: '오늘의 QT', ref: '시편 23:1-6', body: '관찰', reflection: '나의 묵상' });
    ok(run((api) => api.sermonNoteSave(일반, sermon, 0)).ok, '설교 노트 저장');
    const r = run((api) => api.sermonNoteSave(일반, qtNote, 0));
    ok(r.ok && r.version === 1, 'QT · 묵상 노트 저장');
    const g = run((api) => api.sermonNoteGet(일반, qtNote.id));
    eq([g.source, g.ref, g.reflection, g.preacher], ['qt', '시편 23:1-6', '나의 묵상', ''], 'QT 노트: 종류(source)와 본문 · 묵상이 그대로, 설교자는 비어 있음');
    const list = run((api) => api.sermonNotesInit(일반)).notes;
    eq(list.filter((n) => n.source === 'qt').map((n) => n.id), [qtNote.id], '목록에서 QT 노트를 구분할 수 있음 (source)');
    eq(list.filter((n) => n.source !== 'qt').map((n) => n.id), [sermon.id], '설교 노트는 그대로');
    // 다시 저장해도 종류가 바뀌지 않음 (화면이 source 를 바꿔 보내도 서버가 지킴)
    const again = run((api) => api.sermonNoteSave(일반, Object.assign({}, qtNote, { body: '관찰 수정', source: 'note' }), 1));
    ok(again.ok && again.version === 2, '수정 저장');
    eq(run((api) => api.sermonNoteGet(일반, qtNote.id)).source, 'qt', '수정해도 QT 종류 유지');
    // 엉뚱한 종류는 설교 노트로
    const odd = mk({ source: 'weird', title: 'x' });
    run((api) => api.sermonNoteSave(일반, odd, 0));
    eq(run((api) => api.sermonNoteGet(일반, odd.id)).source, 'note', '알 수 없는 종류는 설교 노트로');
    // 내 것만
    ok(!run((api) => api.sermonNotesInit(팀장)).notes.some((n) => n.id === qtNote.id), '다른 사람은 내 QT 노트를 못 봄');
  }

  return T.summary();
}

process.exit(main() ? 0 : 1);
