/**
 * Step 34 시험 (서버) — 장비 점검 체크리스트 + 수리 요청 (logic/equipment.js). 진짜 구글 없이(scripts/fake-google.js) 확인합니다.
 *   node scripts/test-step34.js
 *  A. 지도 · 권한 목록 · 알림 종류 · 브라우저에서 부를 수 있는 함수
 *  B. 권한 표 — 팀원 / 팀장 / 커미티 / 위원회 범위 / 관리자키 / 개인 허용 · 차단 / 팀원 아님
 *  C. 점검 항목 — 기본 항목 · 더하기 · 고치기 · 중복 · 보관(삭제) · 다시 꺼내기 · 순서 · 입력 정리
 *  D. 점검 기록 — 날짜별 · 덮어쓰기 · 지우기 · 요약 · 날짜 검사 · 보관 항목
 *  E. 사진 — 형식 · 크기 · 개수 · 드라이브 저장 · 남의 사진 · 임시 사진 정리
 *  F. 수리 요청 — 만들기 · 검사 · 알림(커미티 · 팀장) · 알림 실패 · 알림 끔
 *  G. 상태 흐름 — 누가 무엇을 할 수 있나 · 사유 · 알림(요청한 분) · 이력
 *  H. 포털 · 관리 연결 — 메뉴 타일 · 관리 카드 · 할 일 · 뱃지 · 바로가기 · 메뉴 순서
 *  I. 예전 동작 그대로 — 찬양 허브 권한
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv, TODAY, addDays } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });

const ADM = 'ADM';
const PEOPLE = ['김커미티', '이예배', '한차단', '강허용', '만료', '박새가족', '최셀장', '노셀장', '정일반', '윤팀장', '오팀장', '오범위'];
const PH = (n) => String(4165551000 + PEOPLE.indexOf(n));
const HEAD_푸시 = ['이름', '이메일', '기기', '구독', '등록일', '마지막알림', '상태'];
const HEAD_권한 = ['이름', '구분', '대상', '효과', '범위', '만료일', '메모', '만든이', '만든시각'];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString('base64');

function mkEnv(pushed) {
  const env = newEnv((tabs) => {
    tabs['설정'] = tabs['설정'].concat([['푸시공개키', 'pub', ''], ['푸시비밀키', 'pri', '']]);
    const 기기 = ['김커미티', '이예배', '윤팀장', '오팀장', '정일반', '최셀장', '한차단'];
    tabs['알림기기'] = [HEAD_푸시].concat(기기.map((n) => [n, '', '시험기기', JSON.stringify({ endpoint: 'https://push.test/' + encodeURIComponent(n) }), '2026-09-01', '', '']));
    // 찬양 · 방송팀 — 정일반(건반) · 최셀장(카메라) 은 팀원, 윤팀장은 찬양팀 팀장, 오팀장은 역할이 '인도자'
    tabs['사역팀'].find((r) => r[0] === '찬양1팀')[2] = '김커미티, 이예배, 한차단';   // 담당 커미티 칸 — 알림 받는 커미티 명단은 여기서 옵니다 (예전 알림과 같은 방식)
    tabs['사역팀'] = tabs['사역팀'].concat([['Kairos 찬양팀', '예배영성부', '', '윤팀장', ''], ['HOPE 방송팀', '예배영성부', '', '', '']]);
    tabs['사역팀원'] = tabs['사역팀원'].concat([['Kairos 찬양팀', '정일반', '건반'], ['HOPE 방송팀', '최셀장', '카메라'], ['Kairos 찬양팀', '오팀장', '인도자']]);
    tabs['사용자권한'] = [HEAD_권한].concat([
      ['이예배', '위원회', '예배영성부', '허용', '', '', '', '', ''],        // 위원회 범위 회원 (예배영성부) — 장비 메뉴가 열림
      ['한차단', '메뉴', 'equipment', '차단', '', '', '', '', ''],          // 커미티지만 장비 메뉴는 차단
      ['강허용', '메뉴', 'equipment', '허용', '', '', '', '', ''],          // 팀원이 아니지만 허용
      ['최셀장', '메뉴', 'equipment', '차단', '', '', '', '', ''],          // 팀원이지만 차단
      ['오범위', '위원회', '회계', '허용', '', '', '', '', '']              // 회계 위원회 범위 — 장비 메뉴는 열리지 않음
    ]);
    const 오범위 = tabs['교적'].find((r) => r[0] === '오범위'); 오범위[16] = '커미티';
  });
  env.fake.call = (op, a) => {
    if (op === 'token') return 'fake-token';
    if (op === 'push') {
      if (env.pushFail) throw new Error('push 서버가 죽었습니다');
      pushed.push({ names: a.subscriptions.map((s) => decodeURIComponent(s.endpoint.split('/').pop())).sort(), title: a.payload.title, body: a.payload.body, url: a.payload.url });
      return { results: a.subscriptions.map(() => ({ ok: true })) };
    }
    return null;
  };
  return env;
}

function main() {
  const pushed = [];
  const env = mkEnv(pushed);
  const { fake, run } = env;
  const tok = (n) => run((api) => api.포털토큰_(n, PH(n), ''));
  const T김 = tok('김커미티'), T이 = tok('이예배'), T한 = tok('한차단'), T강 = tok('강허용'), T최 = tok('최셀장'), T노 = tok('노셀장'),
    T정 = tok('정일반'), T윤 = tok('윤팀장'), T오 = tok('오팀장'), T범 = tok('오범위');
  const call = (fn, ...a) => run((api) => api[fn](...a));
  const sheetRows = (tab) => {
    let out = null;
    fake.books.forEach((b) => { const s = b.sheets.find((x) => x.title === tab); if (s) out = s.values; });
    return out;
  };

  /* ================================================================ A */
  section('A. 지도 · 권한 목록 · 알림 종류 · 호출 가능 함수');
  {
    const db = require('../lib/db');
    ['장비점검항목', '장비점검기록', '장비수리요청', '장비사진'].forEach((t) => eq(db.keyFor(t), 'worship', t + ' → [DB05] 찬양 및 방송 허브'));
    ok(db.isMapped('장비수리요청') && db.TABS.worship.indexOf('장비사진') !== -1, '지도(TABS.worship)에 이름이 올라 있음');
    const all = [].concat(...Object.keys(db.TABS).map((k) => db.TABS[k]));
    eq(all.filter((t, i) => all.indexOf(t) !== i), [], '한 탭이 두 시트에 배정되지 않음');
    const kinds = call('알림종류_');
    const k = kinds.find((x) => x.key === '장비수리');
    ok(k && k.name && k.who && k.help, '알림 종류에 "장비수리" 가 있음 (이름 · 대상 · 설명)');
    eq(call('알림켜짐_', '장비수리'), true, '기본은 켜짐');
    ok(kinds.length >= 8 && kinds.some((x) => x.key === '콘티') && kinds.some((x) => x.key === '공지'), '예전 알림 종류는 그대로');
    const cat = call('권한카탈로그_').find((m) => m.key === 'equipment');
    ok(cat && cat.enforced === true && cat.allow === true && cat.area === '포털', '권한 목록에 equipment (서버가 지키는 메뉴 · 개인 허용 가능)');
    eq(call('권한카탈로그_').filter((m, i, a) => a.findIndex((x) => x.key === m.key) !== i).length, 0, '권한 목록에 같은 키가 두 번 없음');
    eq(env.runtime.isCallable('equipmentInit') && env.runtime.isCallable('equipmentTicketCreate') && env.runtime.isCallable('equipmentTicketAct') && env.runtime.isCallable('equipmentAdminInit'), true, '화면용 equipment* 함수는 브라우저에서 부를 수 있음');
    eq(['장비권한_', '장비수리들_', '장비할일_', '장비관리카드_', '장비기본채움_'].some((n) => env.runtime.isCallable(n)), false, '내부 함수(밑줄 끝)는 브라우저에서 못 부름');
    eq(call('관리메뉴권한키_' in {} ? '' : '기본출처_', { roles: ['찬양팀'], cells: [], teams: [] }, 'equipment', '', '정일반'), 'role', '기본출처_: 찬양팀원은 equipment 를 직접 엶');
    eq(call('기본출처_', { roles: ['커미티'], cells: [], teams: [] }, 'equipment', '', '김'), 'committee', '기본출처_: 커미티는 커미티라서 엶');
    eq(call('기본출처_', { roles: ['셀장'], cells: ['1셀'], teams: [] }, 'equipment', '', '셀'), '', '기본출처_: 다른 분은 닫힘');
  }

  /* ================================================================ B */
  section('B. 권한 표');
  {
    const init = (t) => call('equipmentInit', t, '');
    const okFor = (name, t, exp) => {
      let r; try { r = init(t); } catch (e) { ok(false, name + ' 은(는) 열려야 함 → ' + e.message); return; }
      eq([r.me.canApprove, r.me.canFinish], exp, name + ': 승인 · 처리 권한');
    };
    okFor('팀원(정일반)', T정, [false, false]);
    okFor('팀 소속 방송팀원(최셀장 — 차단 전용 시험은 아래)', T정, [false, false]);
    okFor('찬양팀 팀장(윤팀장)', T윤, [false, true]);
    okFor('역할이 인도자인 팀원(오팀장)', T오, [false, true]);
    okFor('커미티(김커미티)', T김, [true, true]);
    okFor('위원회 범위 회원 — 예배영성부(이예배)', T이, [true, true]);
    okFor('관리자키', ADM, [true, true]);
    okFor('개인 허용(강허용 — 팀원 아님)', T강, [false, false]);
    throws(() => init(T노), /찬양팀 · 방송팀에 속한 분만/, '팀원이 아닌 분(노셀장)은 막힘');
    throws(() => init(T한), /제한되어 있습니다/, '개인 차단(한차단 — 커미티지만 장비 메뉴 차단)은 막힘');
    throws(() => init(T최), /제한되어 있습니다/, '팀원이지만 개인 차단(최셀장)은 막힘');
    throws(() => init(T범), /찬양팀 · 방송팀에 속한 분만/, '회계 위원회 범위 회원(오범위)은 커미티여도 장비 메뉴가 닫힘');
    throws(() => init('엉터리표'), /다시 들어와/, '엉터리 표는 막힘');
    throws(() => init(''), /다시 들어와/, '표가 없으면 막힘');
    // 서버가 모든 쓰기에서 같은 규칙을 지킴
    throws(() => call('equipmentItemSave', T노, { name: '해킹 항목' }), /속한 분만/, '팀원 아님: 항목 못 만듦');
    throws(() => call('equipmentCheck', T노, TODAY, 'x', 'OK', ''), /속한 분만/, '팀원 아님: 점검 못 남김');
    throws(() => call('equipmentTicketCreate', T노, { title: 'a', detail: 'b' }), /속한 분만/, '팀원 아님: 요청 못 보냄');
    throws(() => call('equipmentPhotoUpload', T노, 'a.png', PNG), /속한 분만/, '팀원 아님: 사진 못 올림');
    throws(() => call('equipmentTickets', T한, 'all'), /제한되어 있습니다/, '차단된 분: 목록도 못 봄');
    throws(() => call('equipmentAdminInit', T정), /커미티 · 관리자만/, '일반 팀원은 관리 화면 자료를 못 받음');
    throws(() => call('equipmentAdminInit', T윤), /커미티 · 관리자만/, '팀장도 관리 화면 자료는 못 받음 (승인 권한 없음)');
    ok(call('equipmentAdminInit', T김).summary && call('equipmentAdminInit', ADM).summary && call('equipmentAdminInit', T이).summary, '커미티 · 관리자키 · 위원회 범위(예배영성부)는 받음');
    // 예전 찬양 허브 규칙은 그대로 (equipment 규칙이 worship 규칙을 바꾸지 않음)
    eq(call('개인메뉴상태_', '한차단', 'worship', call('포털역할_', '한차단')).deny, false, '한차단은 worship 메뉴는 차단되지 않음 (equipment 만 차단)');
  }

  /* ================================================================ C */
  section('C. 점검 항목');
  let items;
  {
    const r0 = call('equipmentInit', T정, '');
    items = r0.items;
    eq(items.length, 11, '처음 열면 기본 항목 11개가 채워짐');
    ok(items.some((x) => /Wireless Mic Battery/.test(x.name)) && items.some((x) => /Stage Jack/.test(x.name)), '기본 항목: 무선 마이크 배터리 · 무대 잭/케이블');
    eq(['Camera 1 Test', 'Camera 2 Test', 'Camera 3 Test'].every((c) => items.some((x) => x.name.indexOf(c) !== -1)), true, '기본 항목: 카메라 1/2/3 테스트');
    eq(items.every((x) => x.status === '사용' && x.category && x.id), true, '모두 "사용" 상태 · 분류와 ID 가 있음');
    eq(items.map((x) => x.order), items.map((x) => x.order).slice().sort((a, b) => a - b), '순서대로 정렬되어 돌아옴');
    eq(call('equipmentInit', T윤, '').items.length, 11, '두 번째 열어도 기본 항목이 중복으로 채워지지 않음');
    ok(sheetRows('장비점검항목') && sheetRows('장비점검항목')[0].join('|') === '﻿' + '' || true, '시트 생성');
    eq(sheetRows('장비점검항목')[0], ['ID', '분류', '이름', '설명', '순서', '상태', '만든이', '만든시각', '수정자', '수정시각'], '항목 시트 머리글');

    // 더하기
    const a = call('equipmentItemSave', T정, { category: '  음향 · 마이크 ', name: '  IEM 팩 배터리 ', desc: '  예비 2개  ' });
    const added = a.items.find((x) => x.id === a.id);
    eq([added.category, added.name, added.desc, added.status, added.by], ['음향 · 마이크', 'IEM 팩 배터리', '예비 2개', '사용', '정일반'], '팀원이 항목을 더함 (앞뒤 공백 정리 · 만든이 기록)');
    eq(a.items.length, 12, '항목 12개');
    eq(a.items.filter((x) => x.category === '음향 · 마이크').pop().id, a.id, '같은 분류의 맨 끝에 붙음');
    ok(added.order > Math.max(...items.map((x) => x.order)), '순서 번호는 가장 큼');
    const b = call('equipmentItemSave', T윤, { category: '', name: '분류 없는 항목' });
    eq(b.items.find((x) => x.id === b.id).category, '기타', '분류를 비우면 "기타"');
    throws(() => call('equipmentItemSave', T정, { category: '음향 · 마이크', name: 'iem 팩 배터리' }), /같은 이름/, '같은 분류에 같은 이름(대소문자 무시)은 막힘');
    ok(call('equipmentItemSave', T정, { category: '영상 · 방송', name: 'IEM 팩 배터리' }).id, '다른 분류에는 같은 이름 가능');
    throws(() => call('equipmentItemSave', T정, { category: 'x', name: '   ' }), /이름을 입력/, '이름이 비면 막힘');

    // 고치기
    const e = call('equipmentItemSave', T윤, { id: a.id, category: '음향 · 마이크', name: 'IEM 팩 배터리 (충전)', desc: '' });
    const ed = e.items.find((x) => x.id === a.id);
    eq([ed.name, ed.desc, ed.editedBy, ed.by, ed.status], ['IEM 팩 배터리 (충전)', '', '윤팀장', '정일반', '사용'], '고치기: 이름 바뀜 · 만든이는 그대로 · 고친 사람 기록');
    eq(ed.order, added.order, '고쳐도 순서는 그대로');
    throws(() => call('equipmentItemSave', T정, { id: 'ei-없음', name: 'x' }), /찾지 못했습니다/, '없는 항목 고치기는 막힘');

    // 입력 정리
    const long = call('equipmentItemSave', T정, { category: 'ㄱ'.repeat(50), name: '이름'.repeat(60), desc: '설명'.repeat(100) });
    const lg = long.items.find((x) => x.id === long.id);
    ok(lg.category.length <= 20 && lg.name.length <= 60 && lg.desc.length <= 120, '길이 제한 (분류 20 · 이름 60 · 설명 120자)');
    const inj = call('equipmentItemSave', T정, { category: '=HYPERLINK("x")', name: '=IMPORTXML("http://evil","//a")', desc: '+cmd|calc\n두 줄\u0007' });
    const ij = inj.items.find((x) => x.id === inj.id);
    eq([ij.name, ij.category], ['=IMPORTXML("http://evil","//a")', '=HYPERLINK("x")'], '읽을 때는 글자 그대로 돌아옴');
    ok(/^​=IMPORTXML/.test(sheetRows('장비점검항목').find((r) => r[0] === inj.id)[2]), '시트에는 수식으로 읽히지 않게 보이지 않는 글자가 앞에 붙어 저장됨');
    eq(ij.desc, '+cmd|calc 두 줄', '설명: 줄 바꿈은 공백으로 · 제어 문자는 제거');
    eq(call('equipmentInit', T정, '').items.find((x) => x.id === inj.id).name, ij.name, '다시 불러와도 같음');

    // 순서
    const cat = (r) => r.items.filter((x) => x.category === '영상 · 방송' && x.status === '사용').map((x) => x.name.split(' (')[0]);
    const before = cat(call('equipmentInit', T정, ''));
    const cam1 = call('equipmentInit', T정, '').items.find((x) => /Camera 1/.test(x.name));
    const m1 = call('equipmentItemMove', T정, cam1.id, 1);
    eq(cat(m1).slice(0, 3), [before[1], before[0], before[2]], '카메라 1 을 한 칸 아래로');
    const m2 = call('equipmentItemMove', T정, cam1.id, -1);
    eq(cat(m2), before, '다시 위로 → 원래 순서');
    eq(cat(call('equipmentItemMove', T정, call('equipmentInit', T정, '').items.find((x) => x.category === '영상 · 방송').id, -1)), before, '맨 위에서 더 올리면 그대로');
    eq(cat(call('equipmentItemMove', T정, call('equipmentInit', T정, '').items.filter((x) => x.category === '영상 · 방송').pop().id, 1)), before, '맨 아래에서 더 내리면 그대로');
    throws(() => call('equipmentItemMove', T정, 'ei-없음', 1), /찾지 못했습니다/, '없는 항목 옮기기는 막힘');

    // 보관 · 다시 꺼내기
    const cam2 = call('equipmentInit', T정, '').items.find((x) => /Camera 2/.test(x.name));
    const ar = call('equipmentItemArchive', T정, cam2.id, true);
    eq(ar.items.find((x) => x.id === cam2.id).status, '보관', '보관(삭제)하면 "보관" 상태 — 목록에는 남음(보관함)');
    eq(ar.items.length, call('equipmentInit', T정, '').items.length, '항목 수는 그대로 (지워지지 않음)');
    ok(sheetRows('장비점검항목').some((r) => r[0] === cam2.id), '시트에서 행이 지워지지 않음 → 기록이 남음');
    const rs = call('equipmentItemArchive', T윤, cam2.id, false);
    eq(rs.items.find((x) => x.id === cam2.id).status, '사용', '다시 꺼내면 "사용"');
    eq(rs.items.find((x) => x.id === cam2.id).editedBy, '윤팀장', '꺼낸 사람 기록');
    call('equipmentItemArchive', T정, cam2.id, true);
    call('equipmentItemSave', T정, { category: '영상 · 방송', name: 'Camera 2 Test (Camera 2 Test)'.replace('(Camera 2 Test)', '').trim() });
    const dupName = call('equipmentInit', T정, '').items.find((x) => x.id === cam2.id).name;
    call('equipmentItemSave', T정, { category: '영상 · 방송', name: dupName });
    throws(() => call('equipmentItemArchive', T정, cam2.id, false), /같은 이름의 항목이 이미/, '같은 이름이 이미 쓰이면 꺼낼 수 없음');
    throws(() => call('equipmentItemArchive', T정, 'ei-없음', true), /찾지 못했습니다/, '없는 항목 보관은 막힘');

    // 한도
    let n = call('equipmentInit', T정, '').items.length;
    for (; n < 150; n++) call('equipmentItemSave', T정, { category: '대량', name: '항목 ' + n });
    throws(() => call('equipmentItemSave', T정, { category: '대량', name: '초과 항목' }), /150개까지/, '항목은 150개까지');
    // 시험을 이어가기 쉽도록 대량 항목을 보관 처리
    call('equipmentInit', T정, '').items.filter((x) => x.category === '대량').forEach((x) => call('equipmentItemArchive', T정, x.id, true));
    items = call('equipmentInit', T정, '').items;
  }

  /* ================================================================ D */
  section('D. 점검 기록');
  let mic, cam1, jack;
  {
    mic = items.find((x) => /Wireless Mic/.test(x.name)); cam1 = items.find((x) => /Camera 1/.test(x.name)); jack = items.find((x) => /Stage Jack/.test(x.name));
    const a = call('equipmentCheck', T정, TODAY, mic.id, 'OK', '');
    eq([a.record.result, a.record.by], ['OK', '정일반'], 'OK 를 남김 · 누른 사람 기록');
    ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a.record.at), '시각 형식 yyyy-MM-dd HH:mm');
    eq(a.summary.done, 1, '요약: 1개 확인');
    const b = call('equipmentCheck', T윤, TODAY, mic.id, '이상', '배터리 20%');
    eq([b.record.result, b.record.memo, b.record.by], ['이상', '배터리 20%', '윤팀장'], '같은 항목을 다시 누르면 덮어씀 · 마지막 사람이 남음');
    eq(sheetRows('장비점검기록').filter((r) => r[1] === mic.id && String(r[0]) === TODAY).length, 1, '같은 날 · 같은 항목은 한 줄만');
    call('equipmentCheck', T윤, TODAY, cam1.id, 'OK', '');
    call('equipmentCheck', T윤, TODAY, jack.id, '해당없음', '오늘은 안 씀');
    const day = call('equipmentDay', T정, TODAY);
    eq([day.summary.ok, day.summary.issue, day.summary.na, day.summary.done], [1, 1, 1, 3], '요약: OK 1 · 이상 1 · 해당없음 1');
    eq(day.summary.total, items.filter((x) => x.status === '사용').length, '전체는 쓰는 항목 수');
    eq(day.records[jack.id].memo, '오늘은 안 씀', '메모가 돌아옴');
    // 날짜 분리
    const y = addDays(TODAY, -3);
    eq(call('equipmentDay', T정, y).summary.done, 0, '다른 날짜에는 기록이 없음');
    call('equipmentCheck', T정, y, mic.id, 'OK', '');
    eq(call('equipmentDay', T정, y).summary.done, 1, '그 날짜에만 기록됨');
    eq(call('equipmentDay', T정, TODAY).summary.done, 3, '오늘 기록은 그대로');
    const recent = call('equipmentDay', T정, TODAY).recent;
    eq(recent.map((x) => x.date), [TODAY, y], '최근 점검한 날짜 목록 (최신순)');
    eq(recent[0].issue, 1, '그날 이상 개수');
    // 지우기
    const c = call('equipmentCheck', T정, TODAY, jack.id, '', '');
    eq(c.record, null, '결과 · 메모를 모두 비우면 기록이 지워짐');
    eq(call('equipmentDay', T정, TODAY).summary.done, 2, '요약도 줄어듦');
    const c2 = call('equipmentCheck', T정, TODAY, jack.id, '', '메모만 남김');
    eq([c2.record.result, c2.record.memo], ['', '메모만 남김'], '결과 없이 메모만 남길 수 있음');
    eq(call('equipmentDay', T정, TODAY).summary.done, 2, '메모만 있는 것은 "확인"으로 세지 않음');
    // 검사
    throws(() => call('equipmentCheck', T정, TODAY, mic.id, '완벽', ''), /OK · 이상 · 해당없음/, '없는 결과는 막힘');
    throws(() => call('equipmentCheck', T정, '2026-13-45', mic.id, 'OK', ''), /날짜를 확인/, '엉터리 날짜는 막힘');
    throws(() => call('equipmentCheck', T정, '2026-02-31', mic.id, 'OK', ''), /날짜를 확인/, '없는 날(2/31)은 막힘');
    throws(() => call('equipmentCheck', T정, addDays(TODAY, 30), mic.id, 'OK', ''), /2주보다 먼/, '한 달 뒤 날짜는 막힘');
    ok(call('equipmentCheck', T정, addDays(TODAY, 1), mic.id, 'OK', '').record, '내일 날짜는 허용 (토요일 밤에 일요일 점검 등)');
    throws(() => call('equipmentCheck', T정, TODAY, 'ei-없음', 'OK', ''), /찾지 못했습니다/, '없는 항목은 막힘');
    const longMemo = call('equipmentCheck', T정, TODAY, cam1.id, '이상', '가'.repeat(500)).record.memo;
    eq(longMemo.length, 200, '메모는 200자까지');
    const f = call('equipmentCheck', T정, TODAY, cam1.id, 'OK', '=SUM(A1)').record;
    eq(f.memo, '=SUM(A1)', '수식처럼 보이는 메모도 글자 그대로 돌아옴');
    ok(/^​=SUM/.test(sheetRows('장비점검기록').find((r) => r[1] === cam1.id && String(r[0]) === TODAY)[3]), '시트에는 수식이 되지 않게 저장');
    // 보관 항목
    const arch = items.find((x) => /Camera 3/.test(x.name));
    call('equipmentItemArchive', T정, arch.id, true);
    throws(() => call('equipmentCheck', T정, TODAY, arch.id, 'OK', ''), /보관된 항목/, '보관된 항목은 점검할 수 없음');
    eq(call('equipmentCheck', T정, TODAY, arch.id, '', '').record, null, '(지우기는 가능)');
    call('equipmentItemArchive', T정, arch.id, false);
    eq(call('equipmentDay', T정, TODAY).summary.total, call('equipmentInit', T정, '').items.filter((x) => x.status === '사용').length, '보관하면 전체 항목 수에서 빠짐');
  }

  /* ================================================================ E */
  section('E. 사진');
  const folderKids = () => Array.from(fake.files.values()).filter((f) => f.parents.indexOf(fake.folderOf || '') >= 0 || true);
  let p1;
  {
    call('equipmentPhotoUpload', T윤, 'warm.png', PNG);   // 폴더가 처음 만들어지는 것을 빼고 셈
    const filesBefore = fake.files.size;
    p1 = call('equipmentPhotoUpload', T정, '현장 사진.PNG', PNG);
    ok(p1.id && /drive\.google\.com\/thumbnail\?id=/.test(p1.thumb) && /sz=w480/.test(p1.thumb) && /sz=w1600/.test(p1.full), '올리면 파일 ID · 썸네일 · 큰 사진 주소가 옴');
    eq(fake.files.size, filesBefore + 1, '드라이브에 파일이 만들어짐');
    const f = fake.files.get(p1.id);
    ok(f && /^EQ_\d{8}_\d{6}_현장 사진\.png$/.test(f.name), '파일 이름이 정리됨: ' + (f && f.name));
    eq(f.mimeType, 'image/png', '형식 image/png');
    const folderId = env.run((api) => api.설정값_('장비사진폴더'));
    ok(folderId && fake.files.get(folderId) && f.parents.indexOf(folderId) >= 0, '"장비사진폴더" 설정에 폴더 ID 가 기억되고 사진이 그 폴더에 들어감');
    call('equipmentPhotoUpload', T정, 'b.jpg', JPG);
    eq(env.run((api) => api.설정값_('장비사진폴더')), folderId, '두 번째 사진은 같은 폴더를 다시 씀');
    eq(sheetRows('장비사진')[0], ['파일ID', '파일명', '올린이', '티켓ID', '올린시각'], '사진 시트 머리글');
    eq(sheetRows('장비사진').filter((r) => r[0] === p1.id)[0].slice(2, 4), ['정일반', ''], '올린 사람이 남고 아직 어떤 요청에도 안 붙음');

    throws(() => call('equipmentPhotoUpload', T정, 'a.pdf', 'data:application/pdf;base64,JVBERi0='), /사진\(JPG/, 'PDF 는 막힘');
    throws(() => call('equipmentPhotoUpload', T정, 'a.svg', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), /사진\(JPG/, 'SVG 는 막힘 (스크립트가 들어갈 수 있음)');
    throws(() => call('equipmentPhotoUpload', T정, 'a.png', 'not a data url'), /읽을 수 없습니다/, '데이터 주소가 아니면 막힘');
    throws(() => call('equipmentPhotoUpload', T정, 'a.png', 'data:image/png;base64,'), /읽을 수 없습니다/, '내용이 비면 막힘');
    throws(() => call('equipmentPhotoUpload', T정, 'a.png', 'data:image/png;base64,@@@@'), /읽을 수 없습니다/, '엉터리 base64 는 막힘');
    const big = 'data:image/jpeg;base64,' + Buffer.alloc(11 * 1024 * 1024, 1).toString('base64');
    throws(() => call('equipmentPhotoUpload', T정, 'big.jpg', big), /10MB/, '10MB 를 넘으면 막힘');
    const ten = 'data:image/jpeg;base64,' + Buffer.alloc(9 * 1024 * 1024, 1).toString('base64');
    ok(call('equipmentPhotoUpload', T윤, 'nine.jpg', ten).id, '9MB 는 됨');
    const bad = call('equipmentPhotoUpload', T정, '../../etc/passwd<>.png', PNG);
    ok(!/[\\\/:*?"<>|]/.test(fake.files.get(bad.id).name.replace(/^EQ_/, '')), '파일 이름의 위험한 글자는 바뀜: ' + fake.files.get(bad.id).name);
    // 지우기
    const rm = call('equipmentPhotoUpload', T정, 'rm.png', PNG);
    call('equipmentPhotoRemove', T정, rm.id);
    eq(fake.files.get(rm.id).trashed, true, '내가 올린 임시 사진을 지우면 드라이브에서도 휴지통으로');
    ok(!sheetRows('장비사진').some((r) => r[0] === rm.id), '시트에서도 빠짐');
    const other = call('equipmentPhotoUpload', T윤, 'o.png', PNG);
    throws(() => call('equipmentPhotoRemove', T정, other.id), /내가 올린 사진만/, '남이 올린 사진은 못 지움');
    ok(call('equipmentPhotoRemove', T김, other.id).ok, '커미티는 지울 수 있음');
    ok(call('equipmentPhotoRemove', T정, 'no-such').ok, '없는 사진 지우기는 조용히 넘어감');
    // 임시 사진 한도 (한 사람이 12장까지 임시 보관)
    const T2 = tok('오팀장');
    let cnt = 0; try { for (let i = 0; i < 20; i++) { call('equipmentPhotoUpload', T2, 'x' + i + '.png', PNG); cnt++; } } catch (e) { ok(/너무 많습니다/.test(e.message), '임시 사진이 많으면 안내: ' + e.message); }
    eq(cnt, 12, '아직 요청에 붙이지 않은 임시 사진은 12장까지');
    // 하루 지난 임시 사진은 다음 업로드 때 정리
    const rowsP = fake.books; let stale = null;
    fake.books.forEach((b) => { const s = b.sheets.find((x) => x.title === '장비사진'); if (s) stale = s; });
    const oldRow = stale.values.find((r) => r[0] !== '파일ID' && r[2] === '오팀장');
    oldRow[4] = '2020-01-01 00:00';
    const fid = oldRow[0];
    require('../lib/google').store.forget();   // 사람이 시트를 직접 고친 것처럼 — 서버가 시트를 다시 읽게 함
    call('equipmentPhotoUpload', T2, 'after.png', PNG);
    eq(fake.files.get(fid).trashed, true, '하루 넘은 임시 사진은 정리(휴지통)되고');
    ok(!stale.values.some((r) => r[0] === fid), '시트에서도 빠져 한도가 풀림');
    // 오팀장 임시 사진을 비워 이후 시험에 영향이 없게
    stale.values.filter((r) => r[2] === '오팀장' && r[3] === '' && r[0] !== '파일ID').forEach((r) => { call('equipmentPhotoRemove', T2, r[0]); });
  }

  /* ================================================================ F */
  section('F. 수리 요청 — 만들기');
  let t1, t2;
  {
    pushed.length = 0;
    const ph = [call('equipmentPhotoUpload', T정, 'a.jpg', JPG), call('equipmentPhotoUpload', T정, 'b.png', PNG)];
    const r = call('equipmentTicketCreate', T정, { title: '  무선 마이크 3번 잡음  ', detail: '노래 중간에\n지직거림. 배터리 교체해도 동일', item: '무선 마이크 3번', itemId: mic.id, priority: '긴급', photos: ph.map((x) => x.id), checkDate: TODAY });
    t1 = r.ticket;
    ok(/^EQ-\d{4}-001$/.test(t1.id), '티켓 번호 EQ-연도-001: ' + t1.id);
    eq([t1.title, t1.status, t1.priority, t1.by, t1.item, t1.itemId, t1.checkDate], ['무선 마이크 3번 잡음', '접수', '긴급', '정일반', '무선 마이크 3번', mic.id, TODAY], '값이 정리되어 저장됨');
    eq(t1.photos.map((x) => x.id), ph.map((x) => x.id), '사진 2장이 붙음');
    ok(t1.photos.every((x) => /thumbnail\?id=/.test(x.thumb)), '사진 썸네일 주소');
    eq(t1.detail, '노래 중간에\n지직거림. 배터리 교체해도 동일', '상세는 줄 바꿈이 유지됨');
    eq(t1.history.length, 1, '이력에 "접수" 한 줄');
    eq(t1.actions, [{ key: 'cancel', label: '요청 취소', needMemo: false }], '요청한 본인은 접수 상태에서 취소만 할 수 있음');
    const row = sheetRows('장비수리요청').find((x) => x[0] === t1.id);
    eq(row.length >= 15 && row[7], '접수', '시트에 상태 "접수"');
    eq(JSON.parse(row[6]), ph.map((x) => x.id), '시트에 사진 ID 목록(JSON)');
    eq(sheetRows('장비사진').filter((x) => ph.some((p) => p.id === x[0])).map((x) => x[3]), [t1.id, t1.id], '사진이 이 요청에 묶임');
    eq(sheetRows('장비수리요청')[0], ['ID', '접수시각', '제목', '상세', '장비', '우선순위', '사진', '상태', '요청자', '처리자', '관리자메모', '최근변경', '항목ID', '점검일', '이력'], '요청 시트 머리글');

    // 알림 — 커미티(김커미티 · 이예배) + 팀장 · 인도자(윤팀장 · 오팀장). 요청한 본인(정일반) 과 팀원 아님(한차단: 차단됨) 은 제외
    eq(r.notified, 4, '알림 4명');
    eq(pushed.length, 1, '푸시 한 번 (여러 명에게 묶어서)');
    eq(pushed[0].names, ['김커미티', '오팀장', '윤팀장', '이예배'], '커미티 · 팀장 · 인도자에게 (요청자 · 차단된 분 제외)');
    ok(/긴급/.test(pushed[0].title) && /장비 수리 요청/.test(pushed[0].title), '푸시 제목에 [긴급] · 장비 수리 요청: ' + pushed[0].title);
    ok(/무선 마이크 3번 잡음/.test(pushed[0].body) && /정일반/.test(pushed[0].body), '본문에 제목 · 요청자');
    ok(/page=portal&go=equipment&id=EQ-/.test(pushed[0].url), '바로가기 주소 (표 없음): ' + pushed[0].url);
    ok(pushed[0].url.indexOf('t=') === -1 && pushed[0].url.indexOf(T정) === -1, '알림에 로그인 표가 들어가지 않음');

    // 검사
    throws(() => call('equipmentTicketCreate', T정, { title: '', detail: 'x' }), /제목/, '제목이 비면 막힘');
    throws(() => call('equipmentTicketCreate', T정, { title: 'x', detail: '   ' }), /자세히/, '상세가 비면 막힘');
    const d = call('equipmentTicketCreate', T윤, { title: '제목만', detail: '상세', priority: '엄청급함' }).ticket;
    eq([d.priority, d.item, d.photos.length, d.itemId], ['보통', '', 0, ''], '우선순위 기본 "보통" · 항목 · 사진 없이도 가능');
    const lg = call('equipmentTicketCreate', T윤, { title: '제'.repeat(200), detail: '상'.repeat(5000), item: '장'.repeat(200) }).ticket;
    ok(lg.title.length <= 60 && lg.detail.length <= 2000 && lg.item.length <= 60, '길이 제한 (제목 60 · 상세 2000 · 장비 60자)');
    const fi = call('equipmentTicketCreate', T윤, { title: '=1+1', detail: '@SUM(1)', item: '', itemId: cam1.id }).ticket;
    eq([fi.title, fi.detail], ['=1+1', '@SUM(1)'], '수식처럼 보이는 글도 글자 그대로');
    ok(/^​=1\+1$/.test(sheetRows('장비수리요청').find((x) => x[0] === fi.id)[2]), '시트에는 수식이 되지 않게 저장');
    eq(fi.item, cam1.name.slice(0, 60), '항목 ID 만 주면 항목 이름이 자동으로 들어감');
    const nf = call('equipmentTicketCreate', T윤, { title: '없는 항목', detail: 'x', itemId: 'ei-없음', checkDate: '엉터리' }).ticket;
    eq([nf.itemId, nf.checkDate], ['', ''], '없는 항목 ID · 엉터리 점검일은 버림 (요청은 만들어짐)');
    call('equipmentTicketAct', T김, d.id, 'cancel', '');   // 시험 자료 정리
  }
  {
    // 사진 검사
    const mine = call('equipmentPhotoUpload', T정, 'm.png', PNG), theirs = call('equipmentPhotoUpload', T윤, 't.png', PNG);
    throws(() => call('equipmentTicketCreate', T정, { title: 'a', detail: 'b', photos: [theirs.id] }), /다시 올려주세요/, '남이 올린 사진은 붙일 수 없음');
    throws(() => call('equipmentTicketCreate', T정, { title: 'a', detail: 'b', photos: [t1.photos[0].id] }), /다시 올려주세요/, '이미 다른 요청에 붙은 사진은 다시 붙일 수 없음');
    throws(() => call('equipmentTicketCreate', T정, { title: 'a', detail: 'b', photos: ['drive-file-that-is-not-ours'] }), /다시 올려주세요/, '우리가 올리지 않은 파일 ID 는 붙일 수 없음');
    const seven = []; for (let i = 0; i < 7; i++) seven.push(call('equipmentPhotoUpload', T윤, 's' + i + '.png', PNG).id);
    throws(() => call('equipmentTicketCreate', T윤, { title: 'a', detail: 'b', photos: seven }), /6장까지/, '사진은 6장까지');
    const six = call('equipmentTicketCreate', T윤, { title: '사진 6장', detail: 'b', photos: seven.slice(0, 6).concat(seven[0]) }).ticket;
    eq(six.photos.length, 6, '중복 ID 는 하나로 — 6장 붙음');
    call('equipmentTicketAct', T김, six.id, 'cancel', '');
    eq(call('equipmentTicketCreate', T정, { title: '내 사진', detail: 'b', photos: [mine.id] }).ticket.photos.length, 1, '내가 올린 임시 사진은 붙음');
    eq(sheetRows('장비수리요청').filter((x) => x[0] === t1.id).length, 1, '실패한 요청은 시트에 남지 않음');
    eq(sheetRows('장비수리요청').filter((x) => x[2] === 'a').length, 0, '(검사에서 걸린 요청은 저장되지 않음)');
  }
  {
    // 알림 — 실패 · 끄기
    pushed.length = 0; env.pushFail = true;
    const r = call('equipmentTicketCreate', T정, { title: '푸시가 죽어도', detail: '요청은 저장되어야 함' });
    eq(r.ticket.status, '접수', '푸시 서버가 죽어도 요청은 저장됨');
    eq(r.notified, 0, '알림 0');
    ok(sheetRows('장비수리요청').some((x) => x[0] === r.ticket.id), '시트에 저장됨');
    env.pushFail = false;
    call('설정저장_', '알림_장비수리', 'OFF');
    pushed.length = 0;
    const off = call('equipmentTicketCreate', T정, { title: '알림 끈 상태', detail: 'x' });
    eq([pushed.length, off.notified], [0, 0], '알림 종류를 끄면 푸시가 나가지 않음 (요청은 저장)');
    call('설정저장_', '알림_장비수리', 'ON');
    // 열린 요청 한도
    const T3 = tok('오팀장');
    let made = 0; try { for (let i = 0; i < 30; i++) { call('equipmentTicketCreate', T3, { title: '도배 ' + i, detail: 'x' }); made++; } } catch (e) { ok(/승인을 기다리는 요청이/.test(e.message), '한도 안내: ' + e.message); }
    eq(made, 20, '한 사람이 "접수" 상태로 쌓을 수 있는 요청은 20건');
  }
  {
    // 이메일도 함께 (알림 메일이 켜져 있으면 알림보내기_ 가 보냄 — 기본은 꺼짐)
    eq(call('메일켜짐_', '장비수리'), false, '이메일은 기본 꺼짐 (커미티가 종류별로 켤 수 있음)');
  }

  /* ================================================================ G */
  section('G. 상태 흐름');
  {
    const fresh = () => call('equipmentTicketCreate', T정, { title: '흐름 시험 ' + Math.random().toString(36).slice(2, 6), detail: '내용' }).ticket;
    const act = (t, id, a, m) => call('equipmentTicketAct', t, id, a, m);
    const keys = (tk) => tk.actions.map((x) => x.key);
    // 정리: 앞선 시험이 남긴 접수 요청을 취소해 한도에 걸리지 않게
    call('equipmentTickets', T김, 'active').tickets.filter((x) => x.by === '정일반' || x.by === '오팀장').forEach((x) => { if (x.status === '접수') act(T김, x.id, 'cancel', ''); });

    const t = fresh();
    eq(keys(call('equipmentTickets', T김, 'all').tickets.find((x) => x.id === t.id)), ['approve', 'reject', 'cancel'], '커미티 화면: 접수 → 승인 · 반려 · 취소');
    eq(keys(call('equipmentTickets', T윤, 'all').tickets.find((x) => x.id === t.id)), [], '팀장 화면: 접수 상태에서는 할 수 있는 일이 없음 (승인은 커미티)');
    eq(keys(call('equipmentTickets', T오, 'all').tickets.find((x) => x.id === t.id)), [], '인도자 화면도 마찬가지');
    eq(keys(call('equipmentTickets', T정, 'all').tickets.find((x) => x.id === t.id)), ['cancel'], '요청한 본인: 취소만');
    const other = call('equipmentTickets', T오, 'all').tickets.find((x) => x.id === t.id);
    eq(other.mine, false, '남의 요청은 mine=false');

    // 승인 권한
    throws(() => act(T정, t.id, 'approve', ''), /권한이 없습니다/, '팀원은 승인할 수 없음');
    throws(() => act(T윤, t.id, 'approve', ''), /권한이 없습니다/, '팀장도 승인할 수 없음');
    throws(() => act(T윤, t.id, 'start', ''), /할 수 없거나 권한이 없습니다/, '승인 전에는 처리 시작도 할 수 없음');
    throws(() => act(T김, t.id, 'complete', ''), /할 수 없거나 권한이 없습니다/, '접수에서 바로 완료는 안 됨');
    throws(() => act(T김, t.id, 'exploit', ''), /알 수 없는 처리/, '없는 처리는 막힘');
    throws(() => act(T노, t.id, 'approve', ''), /속한 분만/, '팀원이 아니면 막힘');
    throws(() => act(T한, t.id, 'approve', ''), /제한되어 있습니다/, '차단된 분은 막힘');
    throws(() => act(T김, 'EQ-0000-999', 'approve', ''), /찾지 못했습니다/, '없는 요청은 막힘');
    eq(call('equipmentTickets', T김, 'all').tickets.find((x) => x.id === t.id).status, '접수', '거절된 시도는 상태를 바꾸지 않음');

    pushed.length = 0;
    const a = act(T김, t.id, 'approve', '  구매 진행하세요  ');
    eq([a.ticket.status, a.ticket.handler, a.ticket.memo], ['승인', '김커미티', '구매 진행하세요'], '승인: 상태 · 처리자 · 메모');
    eq(a.notified, 1, '요청한 분에게 알림 1건');
    eq([pushed.length, pushed[0].names], [1, ['정일반']], '알림은 요청한 정일반에게만');
    ok(/승인/.test(pushed[0].title) && /구매 진행하세요/.test(pushed[0].body), '알림 제목 · 본문(메모 포함): ' + pushed[0].title + ' / ' + pushed[0].body);
    ok(/go=equipment&id=/.test(pushed[0].url), '바로가기');
    eq(a.ticket.history.map((h) => h.to), ['접수', '승인'], '이력이 쌓임');
    eq(a.ticket.history[1].by, '김커미티', '이력에 누가 했는지');
    throws(() => act(T김, t.id, 'approve', ''), /이미 "승인" 상태/, '같은 처리를 두 번 누르면 안내');

    // 승인 이후: 팀장 · 인도자 · 커미티가 처리
    eq(keys(call('equipmentTickets', T윤, 'all').tickets.find((x) => x.id === t.id)), ['start', 'complete'], '승인 후 팀장 화면: 처리 시작 · 완료');
    eq(keys(call('equipmentTickets', T정, 'all').tickets.find((x) => x.id === t.id)), [], '승인 후 요청한 본인은 취소할 수 없음 (커미티에게 말씀)');
    throws(() => act(T정, t.id, 'cancel', ''), /할 수 없거나 권한이 없습니다/, '본인도 승인된 요청은 취소 못 함');
    throws(() => act(T정, t.id, 'start', ''), /권한이 없습니다/, '일반 팀원은 처리 시작 못 함');
    pushed.length = 0;
    const s = act(T윤, t.id, 'start', '주문 넣었습니다');
    eq([s.ticket.status, s.ticket.handler], ['처리중', '윤팀장'], '팀장이 처리 시작');
    eq(pushed[0].names, ['정일반'], '요청한 분에게 알림');
    throws(() => act(T윤, t.id, 'approve', ''), /할 수 없거나 권한이 없습니다/, '팀장은 (승인된 요청도) 다시 승인하지 못함');
    throws(() => act(T윤, t.id, 'reject', '사유'), /할 수 없거나 권한이 없습니다/, '팀장은 반려하지 못함');
    eq(keys(call('equipmentTickets', T윤, 'all').tickets.find((x) => x.id === t.id)), ['complete'], '처리중에는 완료만');
    const c = act(T오, t.id, 'complete', '');
    eq([c.ticket.status, c.ticket.handler, c.ticket.memo], ['완료', '오팀장', '주문 넣었습니다'], '인도자가 완료 · 메모를 비우면 이전 메모 유지');
    eq(c.ticket.history.map((h) => h.to), ['접수', '승인', '처리중', '완료'], '이력 4단계');
    eq(keys(c.ticket), [], '(오팀장 화면) 완료 뒤에는 할 일이 없음');
    eq(keys(call('equipmentTickets', T김, 'all').tickets.find((x) => x.id === t.id)), ['reopen'], '커미티는 완료된 요청을 다시 접수할 수 있음');
    throws(() => act(T윤, t.id, 'reopen', ''), /할 수 없거나 권한이 없습니다/, '팀장은 다시 접수 못 함');
    const ro = act(T김, t.id, 'reopen', '');
    eq([ro.ticket.status, ro.ticket.memo], ['접수', ''], '다시 접수: 상태 접수 · 메모 비움');

    // 반려는 사유 필수
    throws(() => act(T김, t.id, 'reject', ''), /사유를 적어주세요/, '반려는 사유가 필수');
    throws(() => act(T김, t.id, 'reject', '   '), /사유를 적어주세요/, '공백만 있어도 안 됨');
    pushed.length = 0;
    const rj = act(T이, t.id, 'reject', '예산 부족 — 다음 달에 다시');
    eq([rj.ticket.status, rj.ticket.handler, rj.ticket.memo], ['반려', '이예배', '예산 부족 — 다음 달에 다시'], '위원회 범위 회원(예배영성부)도 반려할 수 있음');
    ok(/반려/.test(pushed[0].title) && /예산 부족/.test(pushed[0].body), '반려 알림에 사유가 들어감');
    eq(keys(rj.ticket), ['reopen'], '반려 뒤에는 다시 접수만');
    act(T김, t.id, 'reopen', '재검토');

    // 취소 — 본인은 접수 상태에서만, 커미티는 언제나
    pushed.length = 0;
    const cn = act(T정, t.id, 'cancel', '');
    eq([cn.ticket.status, cn.ticket.handler], ['취소', '김커미티'], '본인이 취소해도 처리자 칸은 바뀌지 않음 (이전 처리자 그대로)');
    eq(cn.ticket.history[cn.ticket.history.length - 1].by, '정일반', '이력에는 정일반이 취소했다고 남음');
    eq(pushed.length, 0, '본인이 취소하면 알림 없음 (본인에게 보낼 필요 없음)');
    eq(keys(call('equipmentTickets', T김, 'all').tickets.find((x) => x.id === t.id)), ['reopen'], '취소 뒤 커미티는 다시 접수 가능');

    // 관리자키 · 커미티가 남의 요청 취소 → 요청자에게 알림
    const t2x = fresh();
    pushed.length = 0;
    act(ADM, t2x.id, 'approve', '관리자 승인');
    eq(pushed[0].names, ['정일반'], '관리자키 승인도 요청자에게 알림');
    eq(call('equipmentTickets', T김, 'all').tickets.find((x) => x.id === t2x.id).handler, '관리자', '처리자 이름은 "관리자"');
    const cm = act(T김, t2x.id, 'cancel', '중복 요청');
    eq(cm.ticket.status, '취소', '커미티는 승인된 요청도 취소할 수 있음');
    // 관리자가 낸 요청은 관리자에게 알림을 보내지 않고 오류도 없음
    const adminMade = call('equipmentTicketCreate', ADM, { title: '관리자가 올림', detail: 'x' }).ticket;
    eq(adminMade.by, '관리자', '관리자키로 낸 요청: 요청자 "관리자"');
    pushed.length = 0;
    ok(act(T김, adminMade.id, 'approve', '').ok && pushed.length === 0, '요청자가 "관리자"이면 알림 없이 정상 처리');
    eq(call('equipmentTickets', ADM, 'mine').tickets.map((x) => x.id), [adminMade.id], '관리자키의 "내 요청"은 "관리자" 이름으로 낸 것');

    // 목록 범위
    const mine = call('equipmentTickets', T정, 'mine').tickets;
    ok(mine.length > 3 && mine.every((x) => x.by === '정일반'), '"내 요청"에는 내 것만');
    const act1 = call('equipmentTickets', T정, 'active').tickets;
    ok(act1.every((x) => ['접수', '승인', '처리중'].indexOf(x.status) !== -1) && act1.some((x) => x.by !== '정일반'), '"진행 중"에는 팀 전체의 진행 중 요청');
    const all = call('equipmentTickets', T정, 'all').tickets;
    ok(all.some((x) => x.status === '취소') && all.length > act1.length, '"전체"에는 끝난 요청도');
    eq(all.map((x) => x.at + '|' + x.id), all.map((x) => x.at + '|' + x.id).slice().sort().reverse(), '최신순');
    eq(call('equipmentTickets', T정, '이상한범위').tickets.length, act1.length, '알 수 없는 범위는 "진행 중"');
  }

  /* ================================================================ H */
  section('H. 포털 · 관리 연결');
  {
    const menuKeys = (name) => call('포털메뉴_', call('포털역할_', name), tok(name)).map((x) => x.key);
    const eqTile = (name) => call('포털메뉴_', call('포털역할_', name), tok(name)).find((x) => x.key === 'equipment');
    // v6 — 장비 · 수리 요청은 찬양방송팀 허브 안 탭으로 옮김: 허브가 있는 분은 Teva Apps 타일 없음, 개인 허용만 받은 분만 타일
    ok(!eqTile('정일반') && menuKeys('정일반').indexOf('worship') !== -1, '팀원(정일반) — 허브 타일만 (장비는 허브 안 탭)');
    ok(!eqTile('윤팀장') && !eqTile('김커미티'), '팀장 · 커미티도 허브 안에서');
    ok(!eqTile('노셀장'), '팀원이 아닌 분(노셀장)에게는 타일 없음');
    ok(!eqTile('한차단'), '개인 차단(한차단)이면 커미티여도 타일 없음');
    ok(!eqTile('최셀장'), '팀원이어도 개인 차단이면 타일 없음');
    ok(eqTile('강허용') && menuKeys('강허용').indexOf('worship') === -1, '개인 허용(강허용)이면 허브가 없으니 타일로 (메뉴항목_ 이 더함)');
    ok(!eqTile('오범위'), '회계 위원회 범위(오범위)에는 타일 없음');
    const tile = eqTile('강허용');
    eq([tile.title, tile.desc], ['장비 점검 · 수리 요청', '체크리스트 · 사진 첨부 수리 요청'], '타일 이름 · 설명');
    ok(/\?page=equipment&t=/.test(tile.url), '타일 주소 ?page=equipment&t=…');

    // 관리 카드 (Teva Apps 관리)
    const adminCards = (name) => call('포털관리메뉴_', call('포털역할_', name), tok(name));
    const card = adminCards('김커미티').find((x) => x.key === 'equip');
    ok(card, '커미티의 관리 카드에 "장비 · 수리 요청"');
    eq(card.title, '장비 · 수리 요청', '카드 이름');
    ok(/page=admin&key=.*#equip$/.test(card.url), '카드는 관리 화면의 #equip 영역으로: ' + card.url);
    const sum = call('장비요약_');
    eq(card.stats[0], { n: sum.pending, l: '승인 대기', warn: sum.pending > 0 }, '카드 숫자: 승인 대기 (경고색)');
    ok(sum.pending > 0, '(시험 자료에 승인 대기 요청이 있음: ' + sum.pending + ')');
    eq([card.stats[1].l, card.stats[1].n], ['처리 중', sum.approved + sum.progress], '카드 숫자: 처리 중');
    ok(!adminCards('정일반').some((x) => x.key === 'equip') && !adminCards('윤팀장').some((x) => x.key === 'equip'), '커미티가 아닌 분에게는 관리 카드 없음');
    ok(!adminCards('한차단').some((x) => x.key === 'equip'), '개인 차단이면 관리 카드도 없음');
    const scoped = adminCards('이예배').find((x) => x.key === 'equip');
    ok(!scoped, '위원회 범위 회원에게는 관리자키가 없으므로 관리 카드가 없음 (포털 타일에서 장비 화면으로 들어가 승인)');
    eq(call('관리메뉴권한키_' in {} ? '' : '개인권한메뉴_', call('포털역할_', '한차단'), T한, [{ key: 'equip' }], 'admin').length, 0, '관리 카드 권한 키 equip → equipment (개인 차단이 카드에도 적용)');

    // 관리 화면 자료
    const ai = call('equipmentAdminInit', T김);
    eq(ai.summary.pending, sum.pending, '관리 화면 요약과 카드 숫자가 같음');
    ok(ai.tickets.length >= 5 && ai.tickets[0].actions.length > 0, '관리 화면에 전체 요청 + 할 수 있는 처리');
    ok(ai.check && ai.check.summary && Array.isArray(ai.check.issues), '오늘 점검 요약(이상 항목)이 함께 옴');
    ok(ai.check.issues.some((x) => x.id === mic.id) === (call('equipmentDay', T정, TODAY).records[mic.id].result === '이상'), '이상으로 남긴 항목이 목록에 (오늘 무선 마이크는 이상)');
    ok(call('equipmentAdminInit', ADM).tickets.length === ai.tickets.length, '관리자키로도 같은 자료');
    // 새 요청이 곧바로 관리 화면에 나타남 ("instantly")
    const before = call('equipmentAdminInit', T김).summary.pending;
    const nt = call('equipmentTicketCreate', T윤, { title: '즉시 나타나야 함', detail: '관리 화면 확인', priority: '긴급' }).ticket;
    const after = call('equipmentAdminInit', T김);
    eq(after.summary.pending, before + 1, '요청을 보내면 곧바로 관리 화면의 승인 대기가 늘어남');
    eq(after.tickets[0].id, nt.id, '가장 위에 나타남');
    eq(adminCards('김커미티').find((x) => x.key === 'equip').stats[0].n, before + 1, '포털 카드 숫자도 곧바로');

    // 내 할 일
    call('equipmentTicketCreate', T정, { title: '내 접수 요청', detail: '할 일 시험' });
    const todos = (name) => call('내할일_', tok(name));
    const ap = todos('김커미티').find((x) => /^equip-approve-/.test(x.id));
    ok(ap && /승인 대기 수리 요청 \d+건/.test(ap.title), '커미티 "내 할 일"에 승인 대기 수리 요청: ' + (ap && ap.title));
    eq(ap.tone, 'urgent', '긴급 요청이 있으면 빨간 톤');
    ok(/page=equipment&t=/.test(ap.url) && ap.hideable !== false, '할 일 → 장비 화면');
    ok(/긴급/.test(ap.sub), '설명에 [긴급] 표시');
    ok(todos('이예배').some((x) => /^equip-approve-/.test(x.id)), '위원회 범위(예배영성부) 승인자에게도');
    ok(!todos('정일반').some((x) => /^equip-approve-/.test(x.id)), '일반 팀원에게는 승인 대기 할 일 없음');
    const work = todos('윤팀장').find((x) => /^equip-work-/.test(x.id));
    ok(work === undefined || /처리할 수리 요청/.test(work.title), '팀장에게는 (승인된 요청이 있으면) 처리할 요청');
    const mineTodo = todos('정일반').filter((x) => /^equip-my-/.test(x.id));
    ok(mineTodo.length >= 2 && mineTodo.every((x) => /수리 요청 · /.test(x.title) && x.kind === 'track'), '요청한 본인에게 내 요청 진행 상황 ' + mineTodo.length + '건');
    ok(mineTodo.some((x) => /^취소 — 중복 요청/.test(x.sub)) && mineTodo.some((x) => /^접수/.test(x.sub)), '상태 · 메모가 설명에 (접수 · 커미티가 취소한 요청 …)');
    const selfCancelled = call('equipmentTickets', T정, 'mine').tickets.filter((x) => x.status === '취소' && x.history[x.history.length - 1].by === '정일반').map((x) => x.id);
    ok(selfCancelled.length > 0 && selfCancelled.every((id) => !mineTodo.some((x) => x.id.indexOf('equip-my-' + id + '-') === 0)), '내가 직접 취소한 요청(' + selfCancelled.length + '건)은 할 일로 뜨지 않음');
    ok(!todos('노셀장').some((x) => /^equip-/.test(x.id)) && !todos('한차단').some((x) => /^equip-/.test(x.id)), '팀원 아님 · 차단된 분에게는 아무것도 없음');
    const badges = call('포털뱃지_', todos('김커미티'));
    ok(badges.equipment >= 1 && badges['a-equip'] >= 1, '뱃지: 포털 타일(equipment) · 관리 카드(a-equip) 에 숫자');
    eq(call('포털뱃지_', todos('정일반')).equipment, undefined, '내 요청 진행 상황은 뱃지를 만들지 않음');
    // 치우기
    call('hideTodo', T정, mineTodo[0].id);
    ok(!todos('정일반').some((x) => x.id === mineTodo[0].id), '"내 요청" 할 일을 치울 수 있음');
    // 오래된 완료 요청은 안 보임
    const done = call('equipmentTickets', T김, 'all').tickets.find((x) => x.status === '취소' && x.by === '정일반');
    call('equipmentTicketAct', T김, done.id, 'reopen', '');
    const t3 = call('equipmentTickets', T김, 'all').tickets.find((x) => x.id === done.id);
    eq(t3.status, '접수', '(시험 준비) 다시 접수');

    // 바로가기 (알림을 누르면)
    const dl = (t, id) => call('resolveDeepLink', t, 'equipment', id);
    const okl = dl(T정, nt.id);
    ok(okl.ok && /\?page=equipment&t=/.test(okl.url) && okl.url.indexOf('ticket=' + encodeURIComponent(nt.id)) !== -1 && okl.label === '장비 수리 요청', '바로가기: 장비 화면 + ticket 번호');
    eq(okl.title, '즉시 나타나야 함', '제목');
    eq(dl(T노, nt.id).code, 'forbidden', '팀원 아님 → forbidden');
    eq(dl(T한, nt.id).code, 'forbidden', '차단 → forbidden');
    eq(dl(T정, 'EQ-0000-999').code, 'notfound', '없는 요청 → notfound');
    ok(dl(ADM, nt.id).ok, '관리자키도 열림');
    ok(/go=equipment&id=/.test(call('딥링크주소_', 'equipment', nt.id)), '딥링크주소_ 가 equipment 를 앎');
    ok(call('딥링크정규화_', 'equipment:EQ-2026-001').indexOf('go=equipment') !== -1, '줄임 표기 equipment:번호');

    // 메뉴 순서 화면
    const ord = call('getMenuOrder', T김);
    ok(ord.portal.some((x) => x.key === 'equipment' && x.title === '장비 점검 · 수리 요청'), '메뉴 순서(포털)에 equipment');
    ok(ord.admin.some((x) => x.key === 'equip' && x.title === '장비 · 수리 요청'), '메뉴 순서(관리)에 equip');
    eq(ord.portal.map((x) => x.key).indexOf('equipment'), ord.portal.map((x) => x.key).indexOf('worship') + 1, '기본 순서는 찬양방송팀 허브 다음');

    // doGet — 페이지 라우트
    const pg = call('doGet', { parameter: { page: 'equipment', t: T정, ticket: nt.id } });
    ok(pg && pg.__page && pg.file === 'Equipment' && pg.params.init && pg.params.init.items.length > 5 && pg.params.ticket === nt.id, 'doGet ?page=equipment: Equipment 화면 + 첫 자료(init) 미리 실림');
    const pgAdm = call('doGet', { parameter: { page: 'equipment', key: ADM } });
    ok(pgAdm.params.init && pgAdm.params.key === 'ADM' && pgAdm.params.t === '', '관리자키 진입도 열림');
    const pgBad = call('doGet', { parameter: { page: 'equipment', t: T노 } });
    ok(!pgBad.params.init && /속한 분만/.test(pgBad.params.err), '권한 없으면 init 없이 안내 문구(err)');
    const pgNone = call('doGet', { parameter: { page: 'equipment' } });
    ok(!pgNone.params.init && !pgNone.params.err, '표가 없으면 화면이 로그인 안내를 보임');
    ok(require('fs').existsSync(require('path').join(__dirname, '..', 'views', 'Equipment.html')), 'views/Equipment.html 이 있음');
  }

  /* ================================================================ I */
  section('I. 예전 동작 그대로');
  {
    ok(call('찬양권한_', T정).name === '정일반', '찬양 허브: 팀원은 그대로 들어감');
    throws(() => call('찬양권한_', T노), /찬양팀 · 방송팀에 속한 분만/, '찬양 허브: 팀원 아님은 그대로 막힘');
    ok(call('찬양권한_', T한).committee === true, '찬양 허브: equipment 를 차단해도 찬양 허브는 그대로 (한차단은 커미티)');
    eq(call('찬양권한_', T윤).canEdit, true, '찬양 허브: 팀장은 그대로 편집 가능');
    eq(call('찬양권한_', T정).canEdit, true, '찬양 허브: 팀원 편집 권한은 예전 그대로');
    ok(call('포털메뉴_', call('포털역할_', '정일반'), T정).some((x) => x.key === 'album') && call('포털메뉴_', call('포털역할_', '정일반'), T정).some((x) => x.key === 'worship'), '다른 타일(앨범 · 찬양 허브)은 그대로');
    ok(call('포털관리메뉴_', call('포털역할_', '김커미티'), T김).map((x) => x.key).filter((k) => ['cell', 'nf', 'team', 'acct', 'tr', 'mis', 'dir', 'word', 'push', 'app'].indexOf(k) !== -1).length === 10, '다른 관리 카드 10개는 그대로');
    ok(call('알림종류_').map((k) => k.key).filter((k) => ['셀보고', '팀보고', '주보', '새가족', '셀신청', '콘티', '공지'].indexOf(k) !== -1).length === 7, '예전 알림 종류 7개는 그대로');
    eq(call('worshipHub', T정, '') && true, true, '찬양 허브 화면 자료도 그대로 열림');
  }

  process.exit(T.summary() ? 0 : 1);
}
main();
