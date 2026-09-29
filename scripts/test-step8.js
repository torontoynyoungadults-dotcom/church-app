/**
 * Step 8 시험 — 행사 예산 · 정산의 2단계 회계 승인 흐름 (진짜 구글 없이 scripts/fake-google.js 로)
 *   node scripts/test-step8.js
 *  D. 승인 흐름 : 단계 이동 · 권한 · 단계별 잠금 · 본인 승인 금지 · 알림 받는 사람 · 옛 행사 호환 · 딥링크
 */
const HEAD_푸시 = ['이름', '이메일', '기기', '구독', '등록일', '마지막알림', '상태'];

module.exports = function (T) {
  const { ok, eq, section, throws, newEnv, TODAY, addDays } = T;
  section('D. 2단계 회계 승인 흐름 (Step 8)');
  const P = (n) => String(4165551000 + n);
  const 기기있는사람 = ['윤팀장', '정일반', '이예배', '김커미티', '오팀장', '강허용', '한차단'];
  const pushed = [];
  const env = newEnv((t) => {
    t['사용자권한'] = t['사용자권한'].concat([
      ['정일반', '회계', 'EV-2026-001', '허용', '입력', '', '', '', ''],     // 행사 팀원 — 제출 담당
      ['이예배', '회계', 'EV-2026-001', '허용', '정산', '', '', '', ''],     // 회계 담당 A
      ['김커미티', '회계', 'EV-2026-001', '허용', '정산', '', '', '', ''],   // 회계 담당 B
      ['강허용', '회계', 'EV-2026-001', '허용', '조회', '', '', '', ''],     // 보기만
      ['한차단', '회계', 'EV-2026-001', '차단', '', '', '', '', ''],         // 차단
      ['이예배', '회계', 'EV-2026-003', '허용', '정산', '', '', '', ''],
      ['김커미티', '회계', 'EV-2026-003', '허용', '정산', '', '', '', ''],
      ['정일반', '회계', 'EV-2026-002', '허용', '입력', '', '', '', ''],
    ]);
    t['설정'] = t['설정'].concat([['푸시공개키', 'pub', ''], ['푸시비밀키', 'pri', '']]);
    t['알림기기'] = [HEAD_푸시].concat(기기있는사람.map((n) => [n, '', '시험기기', JSON.stringify({ endpoint: 'https://push.test/' + encodeURIComponent(n) }), '2026-09-01', '', '']));
    t['교적'].find((r) => r[0] === '오팀장')[16] = '회계팀';                   // 역할 = 회계팀 (기본 "조회")
  });
  const run = env.run;
  const setPush = (mode) => {
    env.fake.call = (op, a) => {
      if (op === 'token') return 'fake-token';
      if (op === 'push') {
        if (mode === 'fail') throw new Error('푸시 서버 오류');
        pushed.push({ names: a.subscriptions.map((s) => decodeURIComponent(s.endpoint.split('/').pop())).sort(), title: a.payload.title, body: a.payload.body, url: a.payload.url });
        return { results: a.subscriptions.map(() => ({ ok: true })) };
      }
      return null;
    };
  };
  setPush();
  const last = () => pushed[pushed.length - 1];
  const tok = (name, n) => run((api) => api.포털토큰_(name, P(n), ''));
  const T김커미티 = tok('김커미티', 0), T이예배 = tok('이예배', 1), T한차단 = tok('한차단', 2), T강허용 = tok('강허용', 3), T정일반 = tok('정일반', 8);
  const d1 = addDays(TODAY, -3);

  // D1. 행사 만들기 — 절차를 켠 행사(001) · 옛 방식 행사(002)
  const ev1 = run((api) => api.budgetSaveEvent('ADM', { name: '2026 워크숍', year: '2026', dept: '찬양1팀', owner: '정일반', workflow: true }));
  const id = ev1.event.id;
  eq([id, ev1.flow.managed, ev1.flow.stage], ['EV-2026-001', true, 'Draft'], '"회계 승인 절차 사용"으로 만들면 Draft 로 시작');
  const ev2 = run((api) => api.budgetSaveEvent('ADM', { name: '2026 옛 방식 행사', year: '2026', dept: '청년부', owner: '정일반' }));
  eq([ev2.event.id, ev2.flow.managed, ev2.flow.stage], ['EV-2026-002', false, ''], '옵션을 안 주면 예전처럼 승인 절차 없이 만들어짐');
  const ev3 = run((api) => api.budgetSaveEvent('ADM', { name: '2026 본인승인 시험', year: '2026', dept: '청년부', workflow: 'true' }));
  eq([ev3.event.id, ev3.flow.managed], ['EV-2026-003', true], 'workflow 에 "true" 글자도 켜짐으로 인정');
  const ev4 = run((api) => api.budgetSaveEvent('ADM', { name: '2026 옛 정산 끝난 행사', year: '2026' }));
  eq(ev4.event.id, 'EV-2026-004', '네 번째 행사');
  eq([ev1.can.lines, ev1.can.edit], [true, false], 'Draft: 예산은 고칠 수 있고 거래는 아직 못 씀');

  const act = (k, action, note, exp, opt, eid) => run((api) => api.budgetFlowAct(k, eid || id, action, note, exp, opt));
  const line = (k, o, eid) => run((api) => api.budgetSaveLine(k, eid || id, o));
  const tx = (k, o, eid) => run((api) => api.budgetSaveTx(k, eid || id, o));
  const get = (k, eid) => run((api) => api.budgetGetEvent(k || 'ADM', eid || id));

  // D2. Draft — 제출 전 검사와 권한
  throws(() => act(T정일반, 'submitBudget'), /예산 항목을 하나 이상/, '예산 항목이 하나도 없으면 제출 못 함');
  line('ADM', { kind: '지출', category: '식비', name: '식사', amount: 1000 });
  line('ADM', { kind: '수입', category: '참가비', name: '등록비', amount: 1500 });
  throws(() => tx(T정일반, { date: d1, kind: '지출', lineId: 'B001', detail: '점심', amount: 10 }), /예산이 승인된 뒤/, 'Draft 에서는 거래를 쓸 수 없다 (서버가 막음)');
  throws(() => act(T강허용, 'submitBudget'), /"입력" 권한/, '조회 등급은 제출 못 함');
  throws(() => act(T한차단, 'submitBudget'), /차단/, '차단된 사람은 제출 못 함');
  eq(get(T정일반).flow.actions.map((a) => a.action), ['submitBudget'], '입력 등급이 Draft 에서 할 수 있는 동작은 예산 제출뿐');
  eq(get(T강허용).flow.actions, [], '조회 등급은 동작 없음');
  throws(() => act(T정일반, 'approveBudget'), /"정산" 권한/, '입력 등급은 승인 못 함 (서버가 확인)');
  throws(() => act(T정일반, '엉터리'), /알 수 없는 동작/, '모르는 동작은 거절');

  // D3. 예산 제출 → 회계 담당에게 알림
  const v0 = get().event.version;
  const s1 = act(T정일반, 'submitBudget', '', 'Draft');
  eq([s1.flow.stage, s1.flow.info.budgetSubmittedBy], ['Budget Submitted', '정일반'], '제출하면 Budget Submitted · 제출자 기록');
  ok(s1.event.version > v0, '단계가 바뀌면 행사 버전이 올라감 (내려받은 엑셀이 낡았음을 알림)');
  eq(last().names, ['김커미티', '오팀장', '이예배'].sort(), '제출 알림: 회계 담당(정산 권한 2명 + 회계팀 역할)에게만 — 조회 등급 · 차단 · 제출한 본인 제외');
  eq(last().title, '행사 예산 검토 요청', '알림 제목');
  ok(last().body.indexOf('2026 워크숍') !== -1 && last().url.indexOf('go=budget&id=' + id) !== -1, '알림 내용에 행사 이름 · 누르면 그 행사가 열리는 바로가기');
  eq([s1.notify.to, s1.notify.sent], [3, 3], '결과에 알림 대상 · 발송 수가 함께 나옴');

  // D4. Budget Submitted — 검토 중에는 잠김
  throws(() => line('ADM', { kind: '지출', name: '간식', amount: 5 }), /회계 검토 중/, '검토 중에는 관리자도 예산 항목을 못 고침');
  throws(() => run((api) => api.budgetDeleteLine('ADM', id, 'B001')), /회계 검토 중/, '검토 중에는 예산 항목을 못 지움');
  throws(() => tx(T정일반, { date: d1, kind: '지출', lineId: 'B001', detail: '점심', amount: 10 }), /예산이 승인된 뒤/, '검토 중에는 거래도 아직 못 씀');
  throws(() => run((api) => api.budgetPullReimbursements(T정일반, id, true)), /예산이 승인된 뒤/, '환급신청서 가져오기도 승인 뒤에만');
  const g4 = get(T정일반);
  eq([g4.can.lines, g4.can.edit, g4.flow.actions.length, /기다리는 중/.test(g4.flow.hint)], [false, false, 0, true], '화면 값: 잠김 · 동작 없음 · "검토를 기다리는 중"');
  eq(get(T이예배).flow.actions.map((a) => a.action), ['approveBudget', 'requestBudgetRevision'], '회계 담당의 동작: 승인 · 수정 요청');
  throws(() => act(T이예배, 'approveBudget', '', 'Draft'), /먼저 상태를 바꿨/, '화면이 보던 단계와 다르면 거절 (동시에 두 명이 누르는 것 방지)');
  throws(() => act(T이예배, 'requestBudgetRevision', ''), /사유/, '수정 요청은 사유가 필수');
  throws(() => act(T정일반, 'submitSettlement'), /Budget Approved 단계에서만/, '단계가 맞지 않는 동작은 거절');
  // 엑셀 올리기도 같은 잠금 (바뀌는 줄이 있을 때만)
  const tpl = run((api) => api.budgetTemplateData('ADM', id));
  const payloadOf = (t) => ({ format: t.format, eventId: t.event.id, version: t.event.version,
    lines: t.lines.map((l, i) => ({ row: i + 2, id: l.id, kind: l.kind, category: l.category, name: l.name, amount: l.amount, memo: l.memo })),
    txs: t.txs.map((x, i) => ({ row: i + 2, id: x.id, date: x.date, kind: x.kind, line: x.lineId, detail: x.detail, amount: x.amount, method: x.method, note: x.note })) });
  const same = run((api) => api.budgetImportPreview('ADM', id, payloadOf(tpl), {}));
  eq(same.ok, true, '바뀐 것이 없는 엑셀은 검토 중에도 미리보기 통과');
  const edited = payloadOf(tpl); edited.lines[0].amount = 1300;
  const pv = run((api) => api.budgetImportPreview('ADM', id, edited, {}));
  ok(pv.ok === false && pv.errors.some((e) => /회계 검토 중/.test(e.message)), '예산을 바꾸는 엑셀은 미리보기에서 이유와 함께 막힘');
  throws(() => run((api) => api.budgetImportApply('ADM', id, edited, {})), /회계 검토 중/, '적용도 서버가 거절');

  // D5. 수정 요청 → 팀 쪽에 알림 → 고쳐서 다시 제출
  const r1 = act(T이예배, 'requestBudgetRevision', '식사 항목 근거를 적어주세요', 'Budget Submitted');
  eq([r1.flow.stage, r1.flow.info.budgetReviewResult, r1.flow.info.budgetReviewBy, r1.flow.info.budgetReviewNote], ['Draft', '수정요청', '이예배', '식사 항목 근거를 적어주세요'], '수정 요청: Draft 로 돌아가고 검토 결과 · 사유 기록');
  eq(last().names, ['윤팀장', '정일반'], '수정 요청 알림: 행사 담당자 · 제출자 · 부서(=사역팀 이름)의 팀장 — 누른 본인은 제외');
  ok(last().body.indexOf('식사 항목 근거를 적어주세요') !== -1, '알림에 사유가 들어감');
  line('ADM', { id: 'B001', kind: '지출', category: '식비', name: '식사', amount: 1100 });
  const s2 = act(T정일반, 'submitBudget', '', 'Draft');
  eq([s2.flow.stage, s2.flow.info.budgetReviewResult, s2.flow.info.budgetReviewNote], ['Budget Submitted', '', ''], '다시 제출하면 지난 검토 결과가 비워짐 (이력에는 남음)');

  // D6. 승인 → 거래 기록 가능
  const a1 = act(T김커미티, 'approveBudget', '', 'Budget Submitted');
  eq([a1.flow.stage, a1.flow.info.budgetReviewResult, a1.flow.info.budgetReviewBy], ['Budget Approved', '승인', '김커미티'], '승인: Budget Approved');
  eq(last().names, ['윤팀장', '정일반'], '승인 알림도 팀 쪽으로');
  const t1 = tx(T정일반, { date: d1, kind: '지출', lineId: 'B001', detail: '점심 도시락', amount: 900 });
  eq(t1.event.status, '진행중', '승인 뒤 첫 거래를 쓰면 상태가 진행중으로 (예전 동작 그대로)');
  tx(T정일반, { date: d1, kind: '지출', detail: '잡비', amount: 30 });
  throws(() => line('ADM', { kind: '지출', name: '간식', amount: 5 }), /승인된 예산/, '승인된 예산은 고칠 수 없다');
  const g6 = get(T정일반);
  eq([g6.can.lines, g6.can.edit, g6.flow.actions.map((a) => a.action)], [false, true, ['submitSettlement']], '화면 값: 거래 입력 가능 · 정산 제출 가능');

  // D7. 승인된 예산 다시 열기 (회계, 사유 필수)
  throws(() => act(T정일반, 'reopenBudget', '추가 필요'), /"정산" 권한/, '다시 열기는 회계 담당만');
  throws(() => act(T이예배, 'reopenBudget', ''), /사유/, '다시 열기는 사유 필수');
  const o1 = act(T이예배, 'reopenBudget', '숙박 항목이 빠졌습니다', 'Budget Approved');
  eq([o1.flow.stage, o1.flow.info.budgetReviewResult], ['Draft', '다시열기'], '예산 다시 열기: Draft');
  throws(() => tx(T정일반, { date: d1, kind: '지출', lineId: 'B001', detail: 'x', amount: 1 }), /예산이 승인된 뒤/, '다시 열리면 거래는 다시 잠김');
  line('ADM', { kind: '지출', category: '숙박', name: '숙소', amount: 500 });
  act(T정일반, 'submitBudget', '', 'Draft');
  act(T김커미티, 'approveBudget', '', 'Budget Submitted');
  eq(get().flow.stage, 'Budget Approved', '다시 제출 · 승인으로 원래 자리로');

  // D8. 정산 제출 → 검토 → 수정 요청 → 최종 승인
  throws(() => run((api) => api.budgetSettle(T김커미티, id, '', true)), /정산 제출/, '승인 절차를 쓰는 행사는 정산 제출 없이 바로 확정 못 함');
  const ss1 = act(T정일반, 'submitSettlement', '', 'Budget Approved');
  eq([ss1.flow.stage, ss1.flow.info.settlementSubmittedBy], ['Settlement Submitted', '정일반'], '정산 제출');
  eq(last().names, ['김커미티', '오팀장', '이예배'].sort(), '정산 제출 알림도 회계 담당에게');
  eq(last().title, '행사 정산 검토 요청', '정산 알림 제목');
  throws(() => tx(T정일반, { date: d1, kind: '지출', lineId: 'B001', detail: 'x', amount: 1 }), /정산이 회계 검토 중/, '정산 검토 중에는 거래 잠김');
  throws(() => run((api) => api.budgetDeleteTx(T정일반, id, 'T001')), /정산이 회계 검토 중/, '거래 삭제도 잠김');
  throws(() => act(T이예배, 'requestSettlementRevision', ''), /사유/, '정산 수정 요청도 사유 필수');
  const rs = act(T이예배, 'requestSettlementRevision', '잡비 30 영수증이 없습니다', 'Settlement Submitted');
  eq([rs.flow.stage, rs.flow.info.settlementReviewResult], ['Budget Approved', '수정요청'], '정산 수정 요청: Budget Approved 로 (거래 다시 열림)');
  eq(last().names, ['윤팀장', '정일반'], '정산 수정 요청 알림은 팀 쪽');
  tx(T정일반, { date: d1, kind: '지출', lineId: 'B003', detail: '숙소 계약금', amount: 400 });
  act(T정일반, 'submitSettlement', '', 'Budget Approved');
  throws(() => act(T김커미티, 'approveSettlement', '', 'Settlement Submitted'), /연결되지 않은/, '항목 없는 거래가 있으면 그냥은 최종 승인 안 됨');
  eq(get().flow.stage, 'Settlement Submitted', '실패하면 단계가 바뀌지 않음');
  const fin = act(T김커미티, 'approveSettlement', '잔액 이월', 'Settlement Submitted', { allowUnassigned: true });
  eq([fin.flow.stage, fin.event.status, fin.event.settledBy, fin.settlements.length], ['Settlement Approved', '정산완료', '김커미티', 1], '최종 승인 = 정산 확정 · 스냅샷 · Settlement Approved');
  eq([fin.flow.info.settlementReviewResult, fin.flow.info.settlementReviewNote], ['승인', '잔액 이월'], '정산 검토 결과 · 메모');
  eq(last().names, ['윤팀장', '정일반'], '최종 승인 알림은 팀 쪽');
  eq([fin.notify.to, fin.notify.sent], [2, 2], '정산 승인 결과에도 알림 수');
  throws(() => tx(T정일반, { date: d1, kind: '지출', lineId: 'B001', detail: 'x', amount: 1 }), /정산이 끝난/, '정산 끝나면 거래 잠김 (예전 문구 그대로)');
  throws(() => act(T이예배, 'reopenBudget', '되돌리기'), /Budget Approved 단계에서만/, 'Settlement Approved 에서 예산 다시 열기는 안 됨 (정산 다시 열기를 먼저)');
  const ro = run((api) => api.budgetReopen(T김커미티, id, '영수증 추가 필요'));
  eq([ro.event.status, ro.flow.stage, ro.flow.info.settlementReviewResult], ['진행중', 'Budget Approved', '다시열기'], '정산 다시 열기: 진행중 · Budget Approved');
  eq(last().title, '행사 정산 다시 열림', '정산 다시 열림 알림');
  eq(last().names, ['윤팀장', '정일반'], '다시 열림 알림은 팀 쪽');

  // D9. 본인이 제출한 것은 본인이 승인 못 함 (행사 003)
  const id3 = ev3.event.id;
  line('ADM', { kind: '지출', name: '식비', amount: 100 }, id3);
  setPush('fail');
  const sub3 = act(T이예배, 'submitBudget', '', 'Draft', null, id3);
  eq([sub3.flow.stage, sub3.notify.sent], ['Budget Submitted', 0], '알림 발송이 실패해도 단계 변경은 그대로 저장됨');
  setPush();
  throws(() => act(T이예배, 'approveBudget', '', 'Budget Submitted', null, id3), /본인이 제출한 예산/, '제출자 본인은 예산 승인 못 함');
  const g9 = get(T이예배, id3);
  eq([g9.flow.actions.map((a) => a.action), /본인이 제출/.test(g9.flow.hint)], [['requestBudgetRevision'], true], '화면에는 승인 버튼이 안 나오고 이유가 나옴');
  const ap3 = act('ADM', 'approveBudget', '', 'Budget Submitted', null, id3);
  eq(ap3.flow.stage, 'Budget Approved', '관리자키는 예외로 승인 가능');
  tx(T이예배, { date: d1, kind: '지출', lineId: 'B001', detail: '식비', amount: 50 }, id3);
  act(T이예배, 'submitSettlement', '', 'Budget Approved', null, id3);
  throws(() => act(T이예배, 'approveSettlement', '', 'Settlement Submitted', null, id3), /본인이 제출한 정산/, '제출자 본인은 정산 최종 승인 못 함');
  throws(() => run((api) => api.budgetSettle(T이예배, id3, '', false)), /본인이 제출한 정산/, '옛 "정산 확정" 함수로도 우회 못 함');
  const fin3 = act(T김커미티, 'approveSettlement', '', 'Settlement Submitted', null, id3);
  eq([fin3.flow.stage, fin3.event.status], ['Settlement Approved', '정산완료'], '다른 회계 담당은 승인 가능');

  // D10. 옛 행사 호환 · 승인 절차 켜기
  const id2 = ev2.event.id, id4 = ev4.event.id;
  eq(get('ADM', id2).flow.actions.map((a) => a.action), ['enableFlow'], '옛 행사에서 관리 등급이 할 수 있는 동작: 승인 절차 켜기');
  const t2 = tx('ADM', { date: d1, kind: '지출', detail: '옛 방식 거래', amount: 5 }, id2);
  eq(t2.event.status, '진행중', '옛 행사는 승인 없이 바로 거래를 쓸 수 있음 (예전 그대로)');
  line('ADM', { kind: '지출', name: '옛 항목', amount: 10 }, id2);
  throws(() => act(T정일반, 'enableFlow', '', '', null, id2), /"관리" 권한/, '입력 등급은 절차를 켤 수 없음');
  const en = act('ADM', 'enableFlow', '', '', null, id2);
  eq([en.flow.managed, en.flow.stage], [true, 'Budget Approved'], '진행중 옛 행사는 Budget Approved 로 시작');
  throws(() => act('ADM', 'enableFlow', '', '', null, id2), /이미 승인 절차/, '두 번 켜지 못함');
  line('ADM', { kind: '지출', name: '옛 항목', amount: 10 }, id4);
  tx('ADM', { date: d1, kind: '지출', lineId: 'B001', detail: '거래', amount: 3 }, id4);
  const old = run((api) => api.budgetSettle('ADM', id4, '', false));
  eq([old.event.status, old.flow.managed], ['정산완료', false], '절차 없는 옛 행사의 정산 확정은 예전 그대로 동작');
  const en4 = act('ADM', 'enableFlow', '', '', null, id4);
  eq(en4.flow.stage, 'Settlement Approved', '정산완료 옛 행사는 Settlement Approved 로 시작');
  eq(run((api) => api.budgetInit('ADM')).events.filter((e) => e.id === id2 || e.id === id).map((e) => e.id + ':' + e.managed + ':' + e.stage).sort(),
    ['EV-2026-001:true:Budget Approved', 'EV-2026-002:true:Budget Approved'], '목록 요약에 managed · stage 가 실림');

  // D11. 행사 지우면 승인 줄도 지워짐 (번호가 다시 쓰여도 남은 줄이 붙지 않음)
  const ev5 = run((api) => api.budgetSaveEvent('ADM', { name: '지울 행사', year: '2026', workflow: true }));
  line('ADM', { kind: '지출', name: '항목', amount: 1 }, ev5.event.id);
  act('ADM', 'submitBudget', '', 'Draft', null, ev5.event.id);
  run((api) => api.budgetDeleteEvent('ADM', ev5.event.id));
  const ev5b = run((api) => api.budgetSaveEvent('ADM', { name: '지울 행사', year: '2026', workflow: true }));
  eq([ev5b.event.id, ev5b.flow.stage, ev5b.flow.info.budgetSubmittedBy], [ev5.event.id, 'Draft', ''], '같은 번호로 다시 만들어도 예전 제출 기록이 붙지 않음');
  eq(env.fake.values(env.legacy.id, '행사승인').filter((r) => r[0] === ev5.event.id).length, 1, '승인 줄은 행사당 하나');

  // D12. 알림 바로가기 (딥링크)
  const dl = run((api) => api.resolveDeepLink(T정일반, 'budget', id));
  ok(dl.ok && dl.url.indexOf('page=budget') !== -1 && dl.url.indexOf('ev=' + id) !== -1 && dl.title === '2026 워크숍', '알림을 누르면 그 행사를 여는 주소');
  eq(run((api) => api.resolveDeepLink(T한차단, 'budget', id)).code, 'forbidden', '차단된 사람은 열 수 없음');
  eq(run((api) => api.resolveDeepLink(T정일반, 'budget', id4)).code, 'forbidden', '권한 없는 행사는 열 수 없음');
  eq(run((api) => api.resolveDeepLink(T정일반, 'budget', 'EV-2026-999')).code, 'notfound', '없는 행사는 안내');

  // D13. 이력 · 기존 시트는 열 하나도 안 바뀜
  const hist = run((api) => api.budgetHistory('ADM', id)).map((h) => h.action);
  ['행사 만들기', '예산 제출', '예산 수정 요청', '예산 승인', '예산 다시 열기', '정산 제출', '정산 수정 요청', '단계 변경', '정산 확정', '정산 다시 열기']
    .forEach((a) => ok(hist.indexOf(a) !== -1, '이력에 "' + a + '" 이 남음'));
  const ph = (tab) => env.fake.values(env.legacy.id, tab)[0].length;
  eq([ph('행사예산'), ph('행사예산항목'), ph('행사거래'), ph('행사정산'), ph('행사이력'), ph('행사승인')], [16, 8, 13, 11, 5, 15], '기존 5개 시트의 열 수는 그대로 · 새 시트 15열');
};

if (require.main === module) {
  const T = require('./test-step3');
  ['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });
  module.exports(T);
  process.exit(T.summary() ? 0 : 1);
}
