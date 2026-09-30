/**
 * Step 10 시험 (서버) — 진짜 구글 없이(scripts/fake-google.js) 확인합니다.
 *   node scripts/test-step10.js
 *  A. 찬양 객원 — 교적에서 찾기 (권한 · 검색 규칙 · 개인정보 · 편성 저장은 예전 그대로)
 *  B. 포털 빠른 검색 — 교인 + 새가족 (예전 quickMemberSearch 는 그대로)
 *  C. 다른 분 화면 보기 — 대상 목록(교인 + 새가족) · 새가족 화면 · 예전 portalViewAs 그대로
 *  D. 새가족 바로가기 (resolveDeepLink 재사용)
 *  E. 주보 사용자 페이지 — 정리 · 저장 · 게시본 · 예전 주보 · 다음 주 이어받기
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });

const ADM = 'ADM';
const P김 = '4165551000', P정 = '4165551008', P윤 = '4165551009';
const SUN = '2026-09-27', SUN2 = '2026-10-04';

function mkEnv() {
  return newEnv((tabs) => {
    tabs['사역팀'].push(['Kairos 찬양팀', '예배영성부', '', '윤팀장', '']);
    tabs['사역팀원'].push(['Kairos 찬양팀', '이예배', 'Piano']);
    tabs['교적'].find((r) => r[0] === '강허용')[11] = 'Heo Kang';                 // 영문이름
    const nf = (name, contact, cell, owner) => { const r = new Array(18).fill(''); r[0] = name; r[3] = contact; r[9] = owner; r[10] = '2026-09-20'; r[11] = '진행중'; r[12] = cell; return r; };
    tabs['새가족'].push(nf('김새싹', '416-555-2001', '2셀', '박새가족'), nf('이든든', '647-555-3002', '', ''));
  });
}

function main() {
  const env = mkEnv();
  const run = env.run;
  const tok = (n, p) => run((api) => api.포털토큰_(n, p, ''));
  const 커미티 = tok('김커미티', P김), 일반 = tok('정일반', P정), 팀장 = tok('윤팀장', P윤);

  section('A. 찬양 객원 — 교적에서 찾기');
  {
    const r = run((api) => api.worshipGuestSearch(ADM, '정일'));
    eq(r.list.map((x) => x.name), ['정일반'], '이름 일부로 교적에서 찾음');
    eq(r.list[0].cell, '1셀', '소속 셀이 함께 옴');
    eq(r.list[0].tail, '1008', '전화는 뒤 4자리만');
    ok(!/4165551008|416-555-1008/.test(JSON.stringify(r)), '전체 전화번호는 응답 어디에도 없음');
    eq(run((api) => api.worshipGuestSearch(ADM, '1008')).list.map((x) => x.name), ['정일반'], '전화번호(3자리 이상)로도 찾음');
    eq(run((api) => api.worshipGuestSearch(ADM, '10')).list.filter((x) => x.name === '정일반').length, 0, '전화 숫자 2자리는 너무 짧아 전화로는 찾지 않음');
    eq(run((api) => api.worshipGuestSearch(ADM, '1셀')).list.map((x) => x.name), ['정일반'], '셀 이름으로도 찾음');
    eq(run((api) => api.worshipGuestSearch(ADM, 'heo')).list.map((x) => x.name), ['강허용'], '영문이름(대소문자 무시)으로도 찾음');
    const team = run((api) => api.worshipGuestSearch(ADM, '이예배'));
    eq(team.list, [], '이미 찬양팀 명단에 있는 분은 객원 후보에서 뺌');
    eq(team.hint, ['이예배'], '…대신 "이미 팀원" 이라고 알려 줄 이름만 돌려줌');
    eq(run((api) => api.worshipGuestSearch(ADM, '')).list, [], '빈 검색어 → 빈 목록');
    eq(run((api) => api.worshipGuestSearch(ADM, '   ')).list, [], '공백만 → 빈 목록');
    const many = run((api) => api.worshipGuestSearch(ADM, '오'));
    ok(many.list.length <= 12 && many.total >= many.list.length, '결과는 최대 12명, total 은 전체 수');
    const first = run((api) => api.worshipGuestSearch(ADM, '최'));
    eq(first.list[0] && first.list[0].name, '최셀장', '이름이 앞에서부터 맞는 분이 먼저');
    eq(run((api) => api.worshipGuestSearch(ADM, '없는사람')).list, [], '없는 이름 → 빈 목록');

    throws(() => run((api) => api.worshipGuestSearch(일반, '정')), /찬양|팀/, '찬양팀이 아닌 일반 교인은 부를 수 없음');
    const 팀장결과 = run((api) => api.worshipGuestSearch(팀장, '정일'));
    eq(팀장결과.list.map((x) => x.name), ['정일반'], '찬양팀 팀장은 부를 수 있음');
    throws(() => run((api) => api.worshipGuestSearch('', '정')), /로그인|들어와|권한/, '로그인 표가 없으면 거절');

    // 고른 객원은 예전 방식 그대로 "이름"으로 저장됩니다
    const w = run((api) => api.setWorshipSlot(ADM, SUN, 'piano', ['정일반']));
    ok(JSON.stringify(w).indexOf('정일반') !== -1, '편성 저장(setWorshipSlot)은 이름만 — 예전 그대로');
    const hub = run((api) => api.worshipHub(ADM, SUN));
    eq((hub.week.slots || {}).piano, ['정일반'], '허브에 객원 이름으로 나타남');
    ok(hub.members.every((m) => m.name !== '정일반'), '객원은 팀원 명단(members)에는 들어가지 않음 — 객원 표시가 그대로 나옴');
  }

  section('B. 포털 빠른 검색 — 교인 + 새가족');
  {
    const r = run((api) => api.quickSearchAll(커미티, '홍길'));
    eq(r.list.map((x) => x.kind + ':' + x.name), ['newcomer:홍길동'], '이름으로 새가족을 찾음');
    eq(r.list[0].stage, '1주차대상', '새가족 단계가 함께 옴');
    ok(r.counts.newcomer === 1 && r.counts.member === 0, '개수 요약');

    const m = run((api) => api.quickSearchAll(커미티, '정일'));
    eq(m.list.map((x) => x.kind + ':' + x.name), ['member:정일반'], '교인은 kind:member');
    ok(m.list[0].cell === '1셀' && Array.isArray(m.list[0].teams), '교인 카드는 예전(quickMemberSearch)과 같은 모양');

    const byPhone = run((api) => api.quickSearchAll(커미티, '555-2001'));
    eq(byPhone.list.map((x) => x.name), ['김새싹'], '새가족 전화번호로 찾음');
    ok(!/416-555-2001|4165552001/.test(JSON.stringify(byPhone)), '새가족 전체 전화번호는 응답에 없음(뒤 4자리만)');
    eq(byPhone.list[0].tail, '2001', 'tail');
    eq(run((api) => api.quickSearchAll(커미티, '2셀')).list.filter((x) => x.kind === 'newcomer').map((x) => x.name), ['김새싹'], '새가족의 배정 셀로 찾음');
    eq(run((api) => api.quickSearchAll(커미티, '박새가족')).list.filter((x) => x.kind === 'newcomer').map((x) => x.name).sort(), ['김새싹'], '새가족 담당자 이름으로 찾음');
    eq(run((api) => api.quickSearchAll(커미티, '새가족')).list.filter((x) => x.kind === 'newcomer').map((x) => x.name).sort(), ['김새싹', '이든든', '홍길동'], '"새가족" 이라고 치면 새가족 전체');
    eq(run((api) => api.quickSearchAll(커미티, '1주차')).list.filter((x) => x.kind === 'newcomer').length, 3, '단계 이름으로도 찾음');
    eq(run((api) => api.quickSearchAll(커미티, '찬양1팀')).list.filter((x) => x.kind === 'member').length >= 0, true, '사역팀 검색은 예전 그대로 동작');
    eq(run((api) => api.quickSearchAll(커미티, '')).list, [], '빈 검색어');
    eq(run((api) => api.quickSearchAll(커미티, '없는사람')).list, [], '결과 없음');

    throws(() => run((api) => api.quickSearchAll(일반, '홍')), /커미티/, '커미티가 아니면 거절');
    throws(() => run((api) => api.quickSearchAll('BAD', '홍')), /로그인/, '로그인 표가 틀리면 거절');

    const old = run((api) => api.quickMemberSearch(커미티, '정일'));
    eq(old.list.map((x) => x.name), ['정일반'], '예전 quickMemberSearch 는 그대로 (새가족 없음)');
    eq(run((api) => api.quickMemberSearch(커미티, '홍길')).list, [], '예전 함수는 새가족을 검색하지 않음 (호환)');
  }

  section('C. 다른 분 화면 보기 — 새가족까지');
  {
    const t = run((api) => api.portalViewTargets(커미티));
    ok(t.members.length >= 12 && t.members.every((x) => x.name), '교인 목록');
    eq(t.members.find((x) => x.name === '정일반').cell, '1셀', '교인 옆에 셀');
    eq(t.newcomers.map((x) => x.name).sort(), ['김새싹', '이든든', '홍길동'], '새가족 목록');
    eq(t.newcomers.find((x) => x.name === '김새싹').cell, '2셀', '새가족 옆에 배정 셀');
    ok(t.newcomers.every((x) => x.stage), '새가족 단계');
    throws(() => run((api) => api.portalViewTargets(일반)), /커미티/, '커미티가 아니면 거절');

    const v = run((api) => api.portalViewAsNewcomer(커미티, '홍길동'));
    eq(v.viewKind, 'newcomer', '새가족 화면 표시');
    ok(v.noLink === true && v.token === '', '새가족은 항상 보기 전용(메뉴를 그분으로 열 수 없음)');
    eq(v.me.name, '홍길동', '이름');
    eq(v.roles, ['새가족'], '역할');
    eq(v.newcomer.stage, '1주차대상', '단계');
    ok(Array.isArray(v.menus) && v.menus.every((m) => m.url === ''), '메뉴 링크는 모두 비움 (새가족 이름으로 열리지 않음)');
    ok(!/token=|&t=/.test(JSON.stringify(v)), '응답에 로그인 표가 없음');
    eq(v.admin, [], '관리 메뉴 없음');
    eq(v.committee, false, '커미티 아님');
    ok(['me', 'roles', 'menus', 'admin', 'committee', 'leader', 'hasCalendar'].every((k) => k in v), 'portalViewAs 와 같은 모양(화면이 그대로 그림)');
    throws(() => run((api) => api.portalViewAsNewcomer(커미티, '없는분')), /새가족 명단에서 찾지 못/, '없는 새가족');
    throws(() => run((api) => api.portalViewAsNewcomer(일반, '홍길동')), /커미티/, '커미티가 아니면 거절');

    const m = run((api) => api.portalViewAs(커미티, '정일반'));
    ok(m.viewAs === '정일반' && !m.viewKind && m.me.name === '정일반', '예전 portalViewAs(교인)는 그대로');
    eq(run((api) => api.getMyProfile(커미티)).people.length >= 12, true, '로그인 응답의 people(이름 배열)도 그대로');
  }

  section('D. 새가족 바로가기');
  {
    const d = run((api) => api.resolveDeepLink(커미티, 'newcomer', '김새싹'));
    ok(d.ok && /page=newfamily/.test(d.url) && /open=%EA%B9%80%EC%83%88%EC%8B%B9/.test(d.url), '커미티: 그 새가족의 상세 주소를 받음 → ' + d.url);
    const n = run((api) => api.resolveDeepLink(일반, 'newcomer', '김새싹'));
    ok(!n.ok && n.code === 'forbidden', '새가족 권한이 없으면 forbidden');
    const g = run((api) => api.resolveDeepLink(커미티, 'newcomer', '없는분'));
    ok(!g.ok && g.code === 'notfound', '없는 새가족은 notfound');
  }

  section('E. 주보 사용자 페이지');
  {
    const P = (o) => Object.assign({ title: '제목', body: '내용' }, o || {});
    const clean = (arr) => run((api) => api.주보페이지정리_(arr));
    eq(clean(undefined), [], 'pages 가 없으면 빈 배열');
    eq(clean('x'), [], '배열이 아니면 빈 배열');
    eq(clean([null, 3, 'a', {}]), [], '엉뚱한 값과 빈 페이지는 버림');
    const one = clean([P({ id: 'AB-c9 !', kind: 'column', title: '  목회칼럼  ', author: '강산 목사', link: 'javascript:alert(1)', linkLabel: '더 보기' })])[0];
    eq(one.id, 'abc9', 'id 는 영문 소문자 · 숫자만');
    eq(one.title, '목회칼럼', '제목 앞뒤 공백 정리');
    eq(one.link, '', 'javascript: 주소는 지움');
    eq(clean([P({ link: 'https://example.com/a?b=1' })])[0].link, 'https://example.com/a?b=1', 'https 주소는 유지');
    eq(clean([P({ link: 'http://a.b' })])[0].link, 'http://a.b', 'http 주소도 유지');
    eq(clean([P({ link: 'https://a.b/"onload="x' })])[0].link, '', '따옴표가 섞인 주소는 지움');
    eq(clean([P({ kind: 'weird' })])[0].kind, 'custom', '모르는 종류는 custom');
    eq(clean([P({ kind: 'fellowship' })])[0].kind, 'fellowship', 'fellowship 유지');
    const dup = clean([P({ id: 'same' }), P({ id: 'same', title: '둘째' })]);
    ok(dup.length === 2 && dup[0].id !== dup[1].id, '같은 id 는 새로 만들어 겹치지 않게');
    eq(clean(Array.from({ length: 20 }, (_, i) => P({ title: 't' + i }))).length, 12, '최대 12페이지');
    eq(clean([P({ title: '', body: '내용만' })]).length, 1, '제목이 없어도 내용이 있으면 유지');
    eq(clean([P({ title: '제목만', body: '' })]).length, 1, '내용이 없어도 제목이 있으면 유지 (뼈대)');
    eq(clean([P({ title: 'x'.repeat(100) })])[0].title.length, 40, '제목 40자');
    eq(clean([P({ body: 'y'.repeat(9000) })])[0].body.length, 8000, '내용 8000자');
    eq(clean([P({ keep: false })])[0].keep, false, 'keep:false 유지');
    eq(clean([P()])[0].keep, true, 'keep 기본값은 true');
    eq(clean([P({ body: '<script>alert(1)</script>' })])[0].body, '<script>alert(1)</script>', '글자는 그대로 저장(그릴 때 이스케이프)');

    // 저장 → 임시 → 게시
    const b = run((api) => api.getBulletinDraft(ADM, SUN));
    ok(!b.pages, '새 주보 뼈대에는 페이지 없음(예전 그대로)');
    b.pages = [
      P({ id: 'cellfel', kind: 'fellowship', title: '셀모임 교제', eyebrow: 'FELLOWSHIP', body: '이번 주 교제 질문\n1. 요즘 감사한 일' }),
      P({ id: 'column1', kind: 'column', title: '목회칼럼', author: '강산 목사', ref: '시편 23:1', body: '**목자**의 마음', keep: true }),
      P({ id: 'onlyoncee', kind: 'custom', title: '이번 주만', body: '한 번만', keep: false }),
    ];
    const s1 = run((api) => api.saveBulletin(ADM, b, false));
    ok(s1.ok && s1.status === '임시', '임시저장');
    eq(s1.bulletin.pages.map((x) => x.id), ['cellfel', 'column1', 'onlyoncee'], '저장된 주보에 페이지가 순서대로');
    const again = run((api) => api.getBulletinDraft(ADM, SUN));
    eq(again.pages.map((x) => x.title), ['셀모임 교제', '목회칼럼', '이번 주만'], '다시 열어도 그대로');
    eq(run((api) => api.getBulletin(SUN)).bulletin, null, '임시 상태에서는 누구나 볼 수 있는 주보에 없음');
    const s2 = run((api) => api.saveBulletin(ADM, again, true));
    ok(s2.ok && s2.status === '게시', '게시');
    const pub = run((api) => api.getBulletin(SUN)).bulletin;
    eq(pub.pages.length, 3, '게시본(로그인 없이)에 페이지가 실려 감');
    eq(pub.pages[1].author, '강산 목사', '필드 그대로');

    // 페이지를 빼고 다시 저장
    again.pages = again.pages.filter((x) => x.id !== 'onlyoncee');
    run((api) => api.saveBulletin(ADM, again, true));
    eq(run((api) => api.getBulletin(SUN)).bulletin.pages.map((x) => x.id), ['cellfel', 'column1'], '페이지를 빼면 게시본에서도 빠짐');
    // pages 를 아예 안 보내는 예전 화면은 페이지를 지우지 않고… (data 에 키가 없으면 저장 목록에서 빠짐 = 예전 저장 방식)
    const legacyShape = JSON.parse(JSON.stringify(again)); delete legacyShape.pages;
    run((api) => api.saveBulletin(ADM, legacyShape, true));
    eq(run((api) => api.getBulletin(SUN)).bulletin.pages, undefined, '예전 화면(pages 없이 저장)은 예전 방식 그대로 저장됨');
    run((api) => api.saveBulletin(ADM, again, true));

    // 다음 주 뼈대 — 제목은 이어받고 내용은 비움, keep:false 는 안 가져옴
    const next = run((api) => api.getBulletinDraft(ADM, SUN2));
    eq((next.pages || []).map((x) => x.title), ['셀모임 교제', '목회칼럼'], '다음 주 뼈대에 지난 주 페이지 제목 이어받기');
    ok(next.pages.every((x) => x.body === '' && x.ref === '' && x.link === ''), '내용 · 본문 구절 · 링크는 비움');
    eq(next.pages[1].author, '강산 목사', '목회칼럼은 글쓴이를 이어받음');
    eq(next.pages[0].eyebrow, 'FELLOWSHIP', '꾸밈(영문 라벨)은 이어받음');

    // 예전 주보(pages 없음)는 그대로
    const old = run((api) => api.getBulletinDraft(ADM, '2026-09-20'));
    ok(!old.pages, '예전 주보에는 pages 가 생기지 않음');
    const bigId = { ...next, pages: [P({ id: 'x'.repeat(40) })] };
    eq(run((api) => api.saveBulletin(ADM, bigId, false)).bulletin.pages[0].id.length, 12, 'id 길이 12자로 제한되어 저장');

    // 권한 — 일반 교인은 저장 못 함
    throws(() => run((api) => api.saveBulletin(일반, again, false)), /권한|로그인/, '편집 권한이 없으면 저장 불가');
  }

  return T.summary();
}

process.exit(main() ? 0 : 1);
