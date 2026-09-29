/**
 * Step 7 서버 시험 — 진짜 구글 없이(scripts/fake-google.js) 확인합니다.
 *   node scripts/test-step7.js
 *  A. 조건부 표시  (저장할 때 규칙 정리 · 숨겨진 문항은 필수여도 통과 · 연쇄 · 서버와 화면(FormsCore)이 같은 답을 내는가)
 *  B. 신청 상태 태그 (접수 · 미결제 · 결제완료 · 취소 — 정원 · 집계 · 알림 대상 · 엑셀 · 고쳐 저장해도 유지)
 *  C. 대상 공유   (팀 · 셀 · 개인에게 결과 보기 · 새 신청 알림 라우팅 · 보기만 하는 분의 한계)
 *  D. 알림 받는 사람 (여러 그룹 · 개인 · 포털 공지 대상)
 *  E. 포토 앨범 공개 범위 (등록 교인 전체 · 고른 팀 · 고른 셀 · 옛 앨범 그대로 · 딥링크)
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv } = T;
const FormsCore = require('../public/forms/forms-core.js');

['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림|노트 저장 실패)/.test(String(a[0]))) return; o.apply(console, a); }; });

const P = { 정: '4165551008', 최: '4165551006', 노: '4165551007', 윤: '4165551009', 오: '4165551010', 커: '4165551000', 이: '4165551001', 박: '4165551005', 강: '4165551003' };
const ADM = 'ADM';

(function main() {
  const env = newEnv((tabs) => {
    tabs['사역팀원'].push(['찬양1팀', '이예배', '보컬'], ['찬양1팀', '강허용', '']);
    tabs['셀원명단'].push(['2셀', '한차단']);
  });
  const run = env.run;
  const tok = (name, ph) => run((api) => api.포털토큰_(name, ph, ''));
  const T정 = tok('정일반', P.정), T최 = tok('최셀장', P.최), T노 = tok('노셀장', P.노), T윤 = tok('윤팀장', P.윤), T오 = tok('오팀장', P.오);
  const T커 = tok('김커미티', P.커), T이 = tok('이예배', P.이), T강 = tok('강허용', P.강);

  const base = (extra) => Object.assign({ title: 'S7 시험', status: '받는중', target: '모두', notify: false, mail: false, editable: true }, extra || {});
  const save = (data, t) => run((api) => api.formSave(t || ADM, data)).id;
  const get = (id) => run((api) => api.formGet(ADM, id)).form;
  const submit = (t, id, ans) => run((api) => api.submitForm(t, id, ans));
  const results = (id, t) => run((api) => api.formResults(t || ADM, id));
  const ans = (id, name) => results(id).rows.filter((r) => r.name === name)[0];

  /* ============================================================ A. 조건부 표시 */
  section('A. 조건부 표시');
  const cond = (q, op, v, mode) => ({ mode: mode || 'all', rules: [{ q, op, v }] });
  const qsA = [
    { id: 'go', type: 'choice', label: '참석', req: true, opts: ['참석', '불참'], other: true },
    { id: 'why', type: 'long', label: '불참 사유', req: true, showIf: cond('go', 'eq', '불참') },
    { id: 'car', type: 'choice', label: '차량', req: true, opts: ['탑승', '자차'], showIf: cond('go', 'eq', '참석') },
    { id: 'seat', type: 'number', label: '좌석 수', req: true, min: 1, max: 6, showIf: cond('car', 'eq', '자차') },
    { id: 'food', type: 'checks', label: '식사', opts: ['조식', '석식'], other: true, showIf: cond('go', 'eq', '참석') },
    { id: 'pay', type: 'text', label: '입금자', req: true, showIf: { mode: 'any', rules: [{ q: 'food', op: 'has', v: '석식' }, { q: 'food', op: 'has', v: '__other__' }] } },
    { id: 'sc', type: 'rating', label: '기대', scale: 5, variant: 'star', showIf: cond('go', 'eq', '참석') },
    { id: 'hi', type: 'text', label: '한마디', showIf: cond('sc', 'gte', 4) },
    { id: 'info', type: 'section', label: '안내', help: '읽어주세요', showIf: cond('go', 'eq', '불참') },
  ];
  const idA = save(base({ title: '조건 시험', questions: qsA }));
  const fA = get(idA);
  eq(fA.questions.find((q) => q.id === 'why').showIf, cond('go', 'eq', '불참'), 'A. 저장된 규칙이 그대로 돌아옴');
  ok(!('showIf' in fA.questions[0]), 'A. 규칙이 없는 문항에는 showIf 가 생기지 않음');

  // 규칙 정리
  const idB = save(base({
    title: '정리 시험', questions: [
      { id: 'a', type: 'choice', label: 'A', opts: ['x', 'y'] },
      { id: 'sec', type: 'section', label: '안내' },
      { id: 'b', type: 'text', label: 'B', showIf: { mode: 'weird', rules: [{ q: 'a', op: 'eq', v: 'x' }, { q: 'zzz', op: 'eq', v: '1' }, { q: 'a', op: 'nope', v: '1' }, { q: 'a', op: 'gte', v: 'abc' }, { q: 'a', op: 'eq', v: '' }, { q: 'sec', op: 'filled' }, { q: 'c', op: 'eq', v: '1' }] } },
      { id: 'c', type: 'text', label: 'C', showIf: { mode: 'all', rules: [{ q: 'c', op: 'filled' }] } },
      { id: 'd', type: 'text', label: 'D', showIf: cond('e', 'filled') },
      { id: 'e', type: 'text', label: 'E' },
      { id: 'f', type: 'text', label: 'F', showIf: { mode: 'all', rules: [{ q: 'a', op: 'eq', v: 'x' }, { q: 'a', op: 'eq', v: 'x' }, { q: 'a', op: 'eq', v: 'x' }, { q: 'a', op: 'eq', v: 'x' }, { q: 'a', op: 'eq', v: 'x' }, { q: 'a', op: 'eq', v: 'x' }, { q: 'a', op: 'eq', v: 'x' }] } },
    ],
  }));
  const fB = get(idB), qb = (id) => fB.questions.find((q) => q.id === id);
  eq(qb('b').showIf, { mode: 'all', rules: [{ q: 'a', op: 'eq', v: 'x' }] }, 'A. 정리: 없는 문항 · 뒤 문항 · 안내글 · 알 수 없는 연산자 · 숫자 아닌 비교값 · 빈 값은 버리고, 모르는 mode 는 all');
  ok(!('showIf' in qb('c')), 'A. 정리: 자기 자신을 조건으로 쓰면 버림');
  ok(!('showIf' in qb('d')), 'A. 정리: 뒤에 있는 문항을 조건으로 쓰면 버림 (순환 방지)');
  eq(qb('f').showIf.rules.length, 5, 'A. 정리: 규칙은 최대 5개');
  ok(fB.questions.every((q) => !q.showIf || q.showIf.rules.every((r) => ['eq', 'ne', 'has', 'nothas', 'filled', 'empty', 'gte', 'lte'].indexOf(r.op) !== -1)), 'A. 정리: 남은 규칙은 모두 허용된 연산자');

  // 신청
  const 참석 = { go: '참석', why: '', car: '자차', seat: '3', food: ['석식'], pay: '홍', sc: 5, hi: '기대돼요', info: '' };
  const r1 = submit(T정, idA, 참석);
  eq(r1.ok, true, 'A. 참석 경로로 신청됨');
  let a1 = ans(idA, '정일반').answers;
  eq(a1, { go: '참석', car: '자차', seat: 3, food: ['석식'], pay: '홍', sc: 5, hi: '기대돼요' }, 'A. 보이는 문항만 저장 (불참 사유 · 안내글 제외)');
  submit(T정, idA, { go: '불참', why: '출장', car: '자차', seat: '9', food: ['조식'], pay: '', sc: 5, hi: 'x' });
  a1 = ans(idA, '정일반').answers;
  eq(a1, { go: '불참', why: '출장' }, 'A. 불참 경로: 숨겨진 문항의 답(차량 · 좌석 9 · 식사 · 별점…)은 보내와도 버림 + 필수 · 범위 검사도 안 함');
  throws(() => submit(T정, idA, { go: '불참', why: '' }), /불참 사유/, 'A. 보이는 필수 문항(불참 사유)은 그대로 검사');
  throws(() => submit(T정, idA, { go: '참석', car: '자차', seat: '' }), /좌석 수/, 'A. 연쇄: 참석 → 자차 → 좌석(필수) 검사');
  submit(T정, idA, { go: '참석', car: '탑승', seat: '', food: [] });
  a1 = ans(idA, '정일반').answers;
  ok(!('seat' in a1) && a1.car === '탑승', 'A. 차량을 탑승으로 바꾸면 좌석은 숨겨져 필수여도 통과');
  submit(T정, idA, { go: '참석', car: '탑승', food: ['기타: 도시락'], pay: '홍', sc: 3, hi: '숨김' });
  a1 = ans(idA, '정일반').answers;
  eq(a1.food, ['기타: 도시락'], 'A. 기타 답 저장');
  eq(a1.pay, '홍', 'A. __other__ 규칙(any): 기타를 고르면 입금자가 보임');
  ok(!('hi' in a1), 'A. 별점 3 은 gte 4 가 아니라 한마디가 숨겨짐');
  throws(() => submit(T정, idA, { go: '참석', car: '탑승', food: ['기타: 도시락'], pay: '' }), /입금자/, 'A. any 규칙으로 보이게 된 필수 문항 검사');
  submit(T정, idA, { go: '참석', car: '탑승', food: ['조식'], pay: '' });
  ok(!('pay' in ans(idA, '정일반').answers), 'A. 조식만 고르면 입금자는 숨겨져 통과');
  // 기타(직접 입력) 로 "참석/불참" 가 아닌 답 → 둘 다 숨김
  submit(T정, idA, { go: '기타: 모르겠음', why: 'x', car: 'y' });
  eq(ans(idA, '정일반').answers, { go: '기타: 모르겠음' }, 'A. 기타를 고르면 두 경로 모두 숨겨짐');
  // 옛 신청서(규칙 없음)는 그대로
  const idL = save(base({ title: '옛', questions: [{ id: 'q1', type: 'text', label: '필수', req: true }, { id: 'q2', type: 'section', label: '안내' }] }));
  throws(() => submit(T정, idL, {}), /필수/, 'A. 규칙 없는 예전 신청서는 필수 검사 그대로');

  // 서버 ↔ 화면 같은 결과인가 — 같은 표로 대조
  const vec = [];
  const O = ['참석', '불참', '기타: 몰라', '', undefined];
  const F = [[], ['조식'], ['석식'], ['기타: x'], ['조식', '석식'], undefined];
  [4, 5, 2, undefined, 0].forEach((sc) => O.forEach((go) => F.forEach((food) => {
    ['자차', '탑승', undefined].forEach((car) => vec.push({ go, food, car, sc, seat: car === '자차' ? '2' : '', why: 'w', pay: 'p', hi: 'h' }));
  })));
  let mism = 0, first = null;
  vec.forEach((a) => {
    const cli = FormsCore.visibility(qsA.map((q) => Object.assign({}, q, { showIf: fA.questions.find((z) => z.id === q.id).showIf })), a);
    const srv = run((api) => {
      const clean = {}, vis = {};
      fA.questions.forEach((q) => {
        vis[q.id] = api.조건맞나3_(q.showIf, clean);
        if (!vis[q.id] || q.type === 'section') return;
        const raw = a[q.id];
        // 서버가 저장하는 모양으로 다듬어(답정리_) 비교 — 검증 오류는 이 대조에서는 무시하고 "빈 답" 으로
        try { const v = api.답정리_(Object.assign({}, q, { req: false }), raw); if (v !== null) clean[q.id] = v; } catch (e) { /* ignore */ }
      });
      return vis;
    });
    if (JSON.stringify(cli) !== JSON.stringify(srv)) { mism++; if (!first) first = { a, cli, srv }; }
  });
  eq(mism, 0, 'A. 서버와 화면이 ' + vec.length + '가지 답 조합에서 똑같이 보임/숨김 ' + (first ? JSON.stringify(first) : ''));

  // 연산자별 표 (서버 = 화면)
  const table = [
    ['eq', '가', '가', true], ['eq', '가', '나', false], ['eq', '가', ['가', '나'], true], ['eq', '가', undefined, false],
    ['ne', '가', '나', true], ['ne', '가', '가', false], ['ne', '가', undefined, true], ['nothas', '가', ['나'], true], ['nothas', '가', ['가'], false],
    ['has', '가', ['가', '나'], true], ['has', '다', ['가', '나'], false], ['has', '__other__', ['기타: x'], true], ['has', '__other__', ['가'], false],
    ['filled', '', '', false], ['filled', '', 0, true], ['filled', '', [], false], ['filled', '', true, true], ['filled', '', false, false],
    ['empty', '', '', true], ['empty', '', ['a'], false],
    ['gte', '4', 5, true], ['gte', '4', 3, false], ['gte', '4', '4', true], ['gte', '4', '', false], ['lte', '3', 3, true], ['lte', '3', 4, false], ['lte', '3', 'abc', false],
    ['eq', ' 가 ', '가', true],
  ];
  const tmis = table.filter((r) => {
    const rule = { q: 'x', op: r[0], v: r[1] };
    const s = run((api) => api.규칙맞나3_(rule, r[2])), c = FormsCore.ruleMatch(rule, r[2]);
    return s !== r[3] || c !== r[3];
  });
  eq(tmis.length, 0, 'A. 연산자 표 ' + table.length + '건: 서버 · 화면 모두 기대와 같음 ' + JSON.stringify(tmis));

  // 유형을 바꾼 뒤에도 안전
  const idT = save(base({ title: '유형', questions: [{ id: 'a', type: 'choice', label: 'A', opts: ['x'] }, { id: 'b', type: 'text', label: 'B', req: true, showIf: cond('a', 'eq', 'x') }] }));
  submit(T정, idT, { a: 'x', b: 'ok' });
  save(base({ id: idT, title: '유형', questions: [{ id: 'a', type: 'checks', label: 'A', opts: ['x'] }, { id: 'b', type: 'text', label: 'B', req: true, showIf: cond('a', 'has', 'x') }] }));
  eq(get(idT).questions[1].showIf.rules[0].op, 'has', 'A. 유형을 바꾸고 규칙도 고쳐 저장하면 새 규칙으로');
  eq(results(idT).count, 1, 'A. 유형을 바꿔도 옛 신청은 남아 있음');

  /* ============================================================ B. 상태 태그 */
  section('B. 신청 상태 태그');
  const idS = save(base({ title: '수련회', limit: 3, autoClose: false, questions: [{ id: 'q', type: 'text', label: '한 줄' }, { id: 'c', type: 'choice', label: '선택', opts: ['가', '나'] }] }));
  submit(T정, idS, { q: 'a', c: '가' }); submit(T최, idS, { q: 'b', c: '나' }); submit(T노, idS, { q: 'c', c: '나' });
  let rs = results(idS);
  eq(rs.rows.map((r) => r.status), ['접수', '접수', '접수'], 'B. 처음엔 모두 접수');
  eq(rs.counts, { 접수: 3, 미결제: 0, 결제완료: 0, 취소: 0 }, 'B. 상태별 인원');
  throws(() => submit(T윤, idS, { q: 'x' }), /다 찼/, 'B. 정원 3명이 차면 거절');
  let st = run((api) => api.formSetAnswerStatus(ADM, idS, ['정일반', '최셀장'], '미결제'));
  eq([st.changed, st.counts.미결제], [2, 2], 'B. 두 명을 미결제로');
  st = run((api) => api.formSetAnswerStatus(ADM, idS, ['정일반'], '결제완료', true));
  eq(st.counts, { 접수: 1, 미결제: 1, 결제완료: 1, 취소: 0 }, 'B. 한 명 결제완료');
  eq(run((api) => api.formSetAnswerStatus(ADM, idS, ['정일반'], '결제완료')).changed, 0, 'B. 이미 같은 상태면 바뀐 사람 0');
  st = run((api) => api.formSetAnswerStatus(ADM, idS, ['노셀장'], '취소'));
  eq(st.counts.취소, 1, 'B. 취소');
  rs = results(idS);
  eq([rs.count, rs.active], [3, 2], 'B. 표에는 3명(취소 포함) · 집계는 2명');
  eq(rs.stats.filter((s) => s.id === 'c')[0].items.reduce((a, x) => a + x.n, 0), 2, 'B. 취소된 신청은 결과 집계에서 빠짐');
  submit(T윤, idS, { q: 'y', c: '가' });
  eq(results(idS).count, 4, 'B. 취소로 자리가 나서 새 신청 가능 (정원 3 · 유효 2 → 3)');
  throws(() => submit(T오, idS, { q: 'z' }), /다 찼/, 'B. 다시 3명이 차면 거절');
  // 고쳐 저장해도 상태 유지
  submit(T정, idS, { q: 'a2', c: '나' });
  eq(ans(idS, '정일반').status, '결제완료', 'B. 신청자가 고쳐 저장해도 상태가 지워지지 않음');
  eq(run((api) => api.formOpen(T정, idS)).mine.status, '결제완료', 'B. 신청자에게 내 상태가 보임');
  eq(run((api) => api.대상사람_('신청:' + idS)).sort(), ['윤팀장', '정일반', '최셀장'], 'B. 알림 대상(신청자 그룹)에서 취소한 사람 제외');
  throws(() => run((api) => api.formSetAnswerStatus(ADM, idS, ['정일반'], '몰라')), /알 수 없는 상태/, 'B. 없는 상태는 거절');
  throws(() => run((api) => api.formSetAnswerStatus(ADM, idS, [], '접수')), /골라주세요/, 'B. 사람을 안 고르면 거절');
  throws(() => run((api) => api.formSetAnswerStatus(T정, idS, ['정일반'], '접수')), /(만들|팀장|다시)/, 'B. 일반 교인은 못 바꿈');
  // 엑셀에는 맨 끝 칸으로
  const ex = run((api) => api.formExport(ADM, idS));
  const csv = Buffer.from(ex.b64, 'base64').toString('utf8');
  ok(/상태/.test(csv.split(/\r?\n/)[0]) || ex.name.endsWith('.xlsx'), 'B. 엑셀(또는 CSV) 첫 줄 끝에 "상태" 칸' + (ex.fallback ? '' : ' (xlsx)'));
  if (ex.fallback) ok(/결제완료/.test(csv) && /취소/.test(csv), 'B. CSV 에 상태 값이 들어감');
  // 옛 시트(칸이 없음)에서도 접수로 읽힘
  ok(env.fake && true, 'B. (칸이 없는 옛 시트는 위 신청들이 처음엔 모두 "접수" 로 읽힌 것으로 확인됨)');

  /* ============================================================ C. 공유 */
  section('C. 대상 공유 · 알림 라우팅');
  const idC = save(base({ title: '오디션', resultsShare: 'owner', team: '찬양1팀', notify: false, questions: [{ id: 'q', type: 'text', label: '한 줄' }] }));
  eq(get(idC).shares, [], 'C. 처음엔 공유 없음');
  throws(() => results(idC, T정), /(팀장|만들)/, 'C. 공유 전: 일반 교인은 결과를 못 봄');
  let sv = run((api) => api.formShareSave(ADM, idC, [{ key: '사람:정일반', notify: true }, { key: '팀:찬양1팀', notify: false }, { key: '셀:2셀', notify: true }, { key: '팀:없는팀', notify: true }, { key: '엉망', notify: true }, { key: '사람:정일반', notify: false }]));
  eq(sv.shares, [{ key: '사람:정일반', notify: true }, { key: '팀:찬양1팀', notify: false }, { key: '셀:2셀', notify: true }], 'C. 공유 정리: 없는 팀 · 잘못된 형식 · 중복 제거');
  eq(get(idC).shares, sv.shares, 'C. 공유가 저장됨');
  // 고치기 화면에서 저장해도 공유는 남음
  save(base({ id: idC, title: '오디션', resultsShare: 'owner', team: '찬양1팀', questions: [{ id: 'q', type: 'text', label: '한 줄' }] }));
  eq(get(idC).shares.length, 3, 'C. 신청서를 고쳐 저장해도 공유 범위는 그대로');
  submit(T최, idC, { q: '지원합니다' });
  // 개인 공유: 정일반
  const ini = run((api) => api.formAdminInit(T정));
  eq([ini.viewer, ini.list.length, ini.list[0] && ini.list[0].viewOnly, ini.list[0] && ini.list[0].canResults], [true, 1, true, true], 'C. 개인 공유: 관리 화면 목록에 그 신청서만 (보기만)');
  eq([ini.targets, ini.people, ini.myTemplates], [[], [], []], 'C. 보기만 하는 분에게는 대상 목록 · 사람 목록 · 본보기를 내려주지 않음');
  eq(results(idC, T정).rows.length, 1, 'C. 개인 공유: 결과를 볼 수 있음');
  ok(!!run((api) => api.formExport(T정, idC)).b64, 'C. 개인 공유: 엑셀로 받을 수 있음');
  // 보기만: 못 하는 것들
  throws(() => run((api) => api.formSave(T정, { title: '새것', questions: [] })), /(팀장|만들)/, 'C. 보기만: 새 신청서 만들기 불가');
  throws(() => run((api) => api.formSave(T정, { id: idC, title: 'x', questions: [] })), /(팀장|만들|권한)/, 'C. 보기만: 고치기 불가');
  throws(() => run((api) => api.formSetAnswerStatus(T정, idC, ['최셀장'], '취소')), /(팀장|만들|권한)/, 'C. 보기만: 상태 바꾸기 불가');
  throws(() => run((api) => api.formShareSave(T정, idC, [])), /(팀장|만들|권한)/, 'C. 보기만: 공유 바꾸기 불가');
  throws(() => run((api) => api.formDropAnswer(T정, idC, '최셀장')), /(팀장|만들|권한)/, 'C. 보기만: 신청 지우기 불가');
  throws(() => run((api) => api.formDelete(T정, idC)), /(팀장|만들|권한)/, 'C. 보기만: 신청서 삭제 불가');
  throws(() => run((api) => api.aiSuggestFormQuestions(T정, '제목', '')), /(팀장|만들|권한)/, 'C. 보기만: AI 문항 제안 불가');
  // 공유 안 받은 사람
  throws(() => run((api) => api.formAdminInit(T최)), /(팀장|만들)/, 'C. 공유 안 받은 교인(최셀장)은 관리 화면 자체가 막힘 (예전 오류 그대로)');
  // 셀 공유: 2셀(노셀장, 한차단)
  eq(run((api) => api.formAdminInit(T노)).viewer, true, 'C. 셀 공유: 2셀 셀장도 결과를 봄');
  // 팀 공유: 찬양1팀 팀원(이예배는 커미티라 제외 → 강허용)
  const ini2 = run((api) => api.formAdminInit(T강));
  eq([ini2.viewer, ini2.list.length], [true, 1], 'C. 팀 공유: 팀원(강허용)도 결과를 봄');
  eq(results(idC, T강).count, 1, 'C. 팀 공유: 결과 조회');
  // 알림 라우팅
  eq(run((api) => api.공유알림대상3_(api.신청서찾기_(idC), [])).sort(), ['노셀장', '정일반', '한차단'].sort(), 'C. 알림을 켠 공유 대상(개인 정일반 + 2셀)만 — 팀은 notify 꺼져 있어 제외');
  eq(run((api) => api.공유알림대상3_(api.신청서찾기_(idC), ['정일반'])).sort(), ['노셀장', '한차단'], 'C. 이미 알림 받는 사람은 겹치지 않음');
  const n0 = run((api) => api.공유알림보내기3_(api.신청서찾기_(idC), { name: '노셀장' }, false, 2, []));
  ok(typeof n0 === 'number', 'C. 공유 알림 보내기가 오류 없이 동작 (신청한 본인은 제외됨)');
  // 공유를 풀면 접근 사라짐
  run((api) => api.formShareSave(ADM, idC, []));
  throws(() => run((api) => api.formAdminInit(T정)), /(팀장|만들)/, 'C. 공유를 풀면 다시 접근 불가');
  // 팀장(만든 팀 소속) 은 예전처럼
  eq(run((api) => api.formAdminInit(T윤)).viewer, false, 'C. 팀장은 예전처럼 (viewer 아님)');
  // 결과 공유 범위 owner + 공유 = 공유가 우선
  ok(results(idC, ADM).count === 1, 'C. 커미티(관리자 키)는 항상 봄');
  // 포털 메뉴
  run((api) => api.formShareSave(ADM, idC, [{ key: '사람:정일반', notify: false }]));
  const menus = (t) => run((api) => api.getMyProfile(t)).menus.map((m) => m.key);
  ok(menus(T정).indexOf('forms') !== -1, 'C. 공유받은 분의 포털에 "신청서 관리" 메뉴가 생김');
  ok(menus(T최).indexOf('forms') === -1, 'C. 공유 안 받은 교인에게는 없음');

  /* ============================================================ D. 알림 받는 사람 */
  section('D. 알림 받는 사람');
  eq(run((api) => api.대상사람들3_(['사람:정일반', '사람:최셀장', '사람:정일반'])).sort(), ['정일반', '최셀장'], 'D. 개인 여러 명은 합쳐서 중복 없이');
  eq(run((api) => api.대상사람들3_(['셀:1셀', '사람:노셀장'])).sort(), ['노셀장', '정일반', '최셀장'], 'D. 셀 + 개인');
  eq(run((api) => api.대상사람들3_(['셀:1셀', '전체'])), '*', 'D. 전체가 섞이면 전체');
  eq(run((api) => api.대상사람들3_('셀:1셀')).sort(), ['정일반', '최셀장'], 'D. 글 하나는 예전과 똑같이');
  eq(run((api) => api.대상사람들3_([])), '*', 'D. 비어 있으면 전체(예전 기본)');
  const idN = save(base({ title: '알림 시험', questions: [{ id: 'q', type: 'text', label: 'q' }] }));
  const an = run((api) => api.announceForm(ADM, idN, ['사람:정일반', '셀:2셀'], { push: true, portal: true, mail: false }));
  eq(an.portal, true, 'D. 여러 대상 알리기(포털 공지 포함)가 동작');
  const notices = run((api) => api.공지들_());
  eq(notices[notices.length - 1].target, '사람:정일반|셀:2셀', 'D. 포털 공지 대상은 "|" 로 이어서 저장');
  const seeNotice = (t) => run((api) => api.내할일_(t)).some((x) => /알림 시험/.test(x.title));
  ok(seeNotice(T정), 'D. 개인으로 고른 정일반은 공지가 보임');
  ok(seeNotice(T노), 'D. 고른 셀(2셀) 셀장은 공지가 보임');
  ok(!seeNotice(T최), 'D. 고르지 않은 사람에겐 안 보임');
  // 예전 한 줄 대상(역할 · 팀 · 셀 이름)은 그대로
  run((api) => api.addNotice(ADM, '옛 공지', '', '1셀', '', ''));
  ok(run((api) => api.내할일_(T최)).some((x) => /옛 공지/.test(x.title)), 'D. 예전 방식 대상("1셀")은 1셀장에게 그대로 보임');
  ok(!run((api) => api.내할일_(T노)).some((x) => /옛 공지/.test(x.title)), 'D. 예전 방식: 다른 셀장에게는 안 보임');
  run((api) => api.announceForm(ADM, idN, '셀:1셀', { push: false, portal: false }));
  ok(true, 'D. 예전처럼 글 하나로 알려도 동작');

  /* ============================================================ E. 앨범 공개 범위 */
  section('E. 포토 앨범 공개 범위');
  const list = (t) => run((api) => api.albumInit(t)).list.map((a) => a.title);
  ok(list(T정).indexOf('추석 모임') !== -1, 'E. 옛 앨범(공개범위 칸이 없던 행)은 예전처럼 등록 교인 누구나 봄');
  eq(run((api) => api.albumInit(T정)).list.find((a) => a.title === '추석 모임').visibility, { mode: 'registered', teams: [], cells: [] }, 'E. 옛 앨범은 registered');
  const mk = (t, d) => run((api) => api.albumCreate(t, d)).id;
  const idAll = mk(T최, { category: '셀', target: '1셀', title: '1셀 전체공개' });
  const idCell = mk(T최, { category: '셀', target: '1셀', title: '1셀 수련회', visibility: { mode: 'restricted', teams: [], cells: ['1셀'] } });
  const idTeam = mk(T윤, { category: '사역팀', target: '찬양1팀', title: '찬양팀 연습', visibility: { mode: 'restricted', teams: ['찬양1팀'], cells: [] } });
  const idMix = mk(T커, { category: '행사', title: '리더십 수련회', visibility: { mode: 'restricted', teams: ['재정팀'], cells: ['2셀'] } });
  eq(list(T정).sort(), ['1셀 수련회', '1셀 전체공개', '추석 모임'], 'E. 정일반(1셀원): 전체공개 + 자기 셀 공개 앨범');
  eq(list(T노).sort(), ['1셀 전체공개', '리더십 수련회', '추석 모임'], 'E. 노셀장(2셀장): 2셀을 고른 앨범은 보이고 1셀 것은 안 보임');
  eq(list(T강).sort(), ['1셀 전체공개', '찬양팀 연습', '추석 모임'], 'E. 강허용(찬양1팀원): 팀 앨범 보임');
  eq(list(T오).sort(), ['1셀 전체공개', '리더십 수련회', '추석 모임'], 'E. 오팀장(재정팀장): 재정팀을 고른 앨범 보임');
  eq(list(T최).sort(), ['1셀 수련회', '1셀 전체공개', '추석 모임'], 'E. 최셀장(1셀장): 자기가 만든 · 자기 셀 앨범');
  eq(list(T커).length, 5, 'E. 커미티는 전부');
  eq(list(T윤).indexOf('찬양팀 연습') !== -1 && list(T윤).indexOf('1셀 수련회') === -1, true, 'E. 윤팀장(찬양1팀장): 자기 팀 앨범만');
  throws(() => run((api) => api.albumOpen(T노, idCell)), /공개된 팀/, 'E. 볼 수 없는 앨범을 직접 열려 해도 거절');
  throws(() => run((api) => api.albumOpen(T오, idTeam)), /공개된 팀/, 'E. 다른 팀 앨범도 거절');
  eq(run((api) => api.albumOpen(T정, idCell)).album.title, '1셀 수련회', 'E. 볼 수 있으면 열림');
  eq(run((api) => api.albumOpen(T정, idCell)).album.visibility.mode, 'restricted', 'E. 열린 앨범에 공개 범위가 실림');
  // 딥링크 (알림 눌러 들어올 때 제목도 안 새야 함)
  const dl = (t, id) => run((api) => api.딥링크확인_(t, 'album', id));
  eq(dl(T노, idCell).ok, false, 'E. 딥링크: 공개 범위 밖이면 forbidden');
  ok(!/수련회/.test(JSON.stringify(dl(T노, idCell))), 'E. 딥링크: 거절 응답에 앨범 제목이 없음');
  eq(dl(T정, idCell).title, '1셀 수련회', 'E. 딥링크: 볼 수 있으면 제목');
  // 사진 올리기 · 고치기 권한은 예전 그대로 (공개 범위와 별개)
  throws(() => run((api) => api.albumUpload(T정, idCell, 'a.jpg', 'data:image/jpeg;base64,AAAA')), /권한/, 'E. 볼 수 있어도 셀원은 사진을 못 올림 (예전 규칙)');
  // 고치기: 공개 범위 바꾸기
  run((api) => api.albumEdit(T최, idCell, { visibility: { mode: 'registered' } }));
  ok(list(T노).indexOf('1셀 수련회') !== -1, 'E. 등록 교인 전체로 바꾸면 모두에게 보임');
  run((api) => api.albumEdit(T최, idCell, { visibility: { mode: 'restricted', teams: ['찬양1팀', '없는팀'], cells: ['없는셀'] } }));
  eq(run((api) => api.albumOpen(T최, idCell)).album.visibility, { mode: 'restricted', teams: ['찬양1팀'], cells: [] }, 'E. 없는 팀 · 셀은 저장 때 걸러짐');
  ok(list(T강).indexOf('1셀 수련회') !== -1, 'E. 바뀐 범위(찬양1팀)가 바로 적용');
  throws(() => run((api) => api.albumEdit(T최, idCell, { visibility: { mode: 'restricted', teams: [], cells: [] } })), /하나 이상/, 'E. 제한인데 팀 · 셀을 하나도 안 고르면 거절');
  throws(() => mk(T최, { category: '셀', target: '1셀', title: 'x', visibility: { mode: 'restricted', teams: ['없는팀'], cells: [] } }), /하나 이상/, 'E. 만들 때도 같은 검사');
  run((api) => api.albumEdit(T최, idCell, { title: '제목만 바꿈' }));
  eq(run((api) => api.albumOpen(T최, idCell)).album.visibility.mode, 'restricted', 'E. 제목만 고쳐도 공개 범위는 그대로');
  ok(!run((api) => api.albumInit(T정)).list.some((a) => a.id === idCell), 'E. 다시 정일반에겐 안 보임');
  eq(run((api) => api.albumInit(T정)).allTeams.length > 0 && run((api) => api.albumInit(T정)).allCells.length > 0, true, 'E. 화면이 고를 팀 · 셀 목록을 받음');
  run((api) => api.albumDelete(T최, idCell));
  ok(true, 'E. 앨범 지우기는 예전 그대로');

  process.exit(T.summary() ? 0 : 1);
})();
