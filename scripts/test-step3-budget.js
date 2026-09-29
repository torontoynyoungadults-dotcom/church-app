/** C. 행사 예산 · 실적 · 정산 · 엑셀 왕복 · 개인별 회계 권한 */
module.exports = function (T) {
  const { ok, eq, section, throws, newEnv, TODAY, addDays } = T;
  section('C. 행사 예산 · 정산 · 엑셀 · 권한');
  const P = (n) => String(4165551000 + n);
  const env = newEnv((t) => {
    t['사용자권한'] = t['사용자권한'].concat([
      ['이예배', '회계', 'EV-2026-001', '허용', '입력', '', '', '', ''],          // 이 행사만 입력
      ['강허용', '회계', '*', '허용', '조회', '', '', '', ''],                    // 모든 행사 조회
      ['한차단', '회계', 'EV-2026-001', '차단', '', '', '', '', ''],              // 커미티지만 이 행사는 차단
    ]);
  });
  const run = env.run;
  const tok = (name, n) => run((api) => api.포털토큰_(name, P(n), ''));
  const T이예배 = tok('이예배', 1), T강허용 = tok('강허용', 3), T한차단 = tok('한차단', 2), T정일반 = tok('정일반', 8), T김커미티 = tok('김커미티', 0);
  const d1 = addDays(TODAY, -5), d2 = addDays(TODAY, -2);

  // C1. 행사 만들기 · 예산 항목
  const ev = run((api) => api.budgetSaveEvent('ADM', { name: '2026 가을 수련회', year: '2026', dept: '청년부', owner: '정일반', start: addDays(TODAY, -7), end: addDays(TODAY, -1), memo: '' }));
  eq(ev.event.id, 'EV-2026-001', '행사 번호는 연도별 1번부터');
  eq(ev.event.status, '예산작성', '처음 상태는 예산작성');
  throws(() => run((api) => api.budgetSaveEvent('ADM', { name: '2026 가을 수련회', year: '2026' })), /같은 이름/, '같은 해 같은 이름 행사는 거절');
  throws(() => run((api) => api.budgetSaveEvent('ADM', { name: '', year: '2026' })), /행사 이름/, '이름 필수');
  throws(() => run((api) => api.budgetSaveEvent('ADM', { name: 'X', year: '2026', owner: '없는사람' })), /교적/, '담당자는 교적에 있어야');
  const id = ev.event.id;
  const line = (o) => run((api) => api.budgetSaveLine('ADM', id, o));
  line({ kind: '지출', category: '식비', name: '식사', amount: 1000 });
  line({ kind: '지출', category: '숙박', name: '숙소', amount: 2000 });
  line({ kind: '수입', category: '참가비', name: '등록비', amount: 3500 });
  const g0 = run((api) => api.budgetGetEvent('ADM', id));
  eq(g0.lines.map((l) => l.id + ':' + l.budget), ['B001:1000', 'B002:2000', 'B003:3500'], '항목 ID 는 B001 부터');
  eq([g0.totals.budgetExpense, g0.totals.budgetIncome, g0.totals.plannedNet], [3000, 3500, 500], '예산 합계 · 예상 순손익');
  throws(() => line({ kind: '지출', name: '식사', amount: 5 }), /같은 이름/, '같은 이름 항목 거절');
  throws(() => line({ kind: '지출', name: '음수', amount: -1 }), /0 이상/, '음수 예산 거절');
  throws(() => line({ kind: '기타', name: 'x', amount: 1 }), /구분/, '구분은 지출/수입만');

  // C2. 거래 기록
  const tx = (o, k) => run((api) => api.budgetSaveTx(k || 'ADM', id, o));
  tx({ date: d1, kind: '지출', lineId: 'B001', detail: '점심 도시락', amount: 420.5, method: '카드' });
  tx({ date: d2, kind: '지출', lineId: 'B001', detail: '저녁', amount: 700 });
  tx({ date: d2, kind: '지출', lineId: 'B002', detail: '숙소 계약금', amount: 1500 });
  tx({ date: d2, kind: '수입', lineId: 'B003', detail: '등록비 입금', amount: 3000 });
  const g1 = run((api) => api.budgetGetEvent('ADM', id));
  eq(g1.event.status, '진행중', '첫 거래를 기록하면 상태가 진행중으로');
  const byName = {}; g1.lines.forEach((l) => { byName[l.name] = l; });
  eq([byName['식사'].actual, byName['식사'].diff, byName['식사'].over], [1120.5, -120.5, true], '식사: 예산 초과 감지 (실적 1120.5 / 예산 1000)');
  eq([byName['숙소'].actual, byName['숙소'].diff], [1500, 500], '숙소: 남은 예산');
  eq([byName['등록비'].actual, byName['등록비'].diff], [3000, -500], '수입: 실적 − 예산');
  eq([g1.totals.actualExpense, g1.totals.actualIncome, g1.totals.actualNet, g1.totals.expenseRemaining], [2620.5, 3000, 379.5, 379.5], '실적 합계');
  throws(() => tx({ date: addDays(TODAY, 3), kind: '지출', detail: 'x', amount: 1 }), /오늘보다 뒤/, '미래 날짜 거절');
  throws(() => tx({ date: d1, kind: '지출', lineId: 'B003', detail: 'x', amount: 1 }), /구분/, '항목과 구분이 다른 거래 거절');
  throws(() => tx({ date: d1, kind: '지출', lineId: 'B999', detail: 'x', amount: 1 }), /찾을 수 없습니다/, '없는 항목 거절');
  throws(() => tx({ date: d1, kind: '지출', detail: 'x', amount: 0 }), /0보다/, '0원 거래 거절');
  const g2 = tx({ date: d1, kind: '지출', detail: '미분류 잡비', amount: 30 });
  eq([g2.unassigned.count, g2.unassigned.expense, g2.totals.actualExpense], [1, 30, 2650.5], '항목이 없는 거래는 미분류로 잡히고 합계에는 들어감');

  // C3. 권한 — 서버가 매번 확인
  eq(run((api) => api.acctAccessMine(T이예배)).perEvent[id], 2, '이예배: 이 행사 "입력"');
  eq(run((api) => api.acctAccessMine(T강허용)).perEvent[id], 1, '강허용: 모든 행사 "조회"');
  eq(run((api) => api.acctAccessMine(T한차단)).perEvent[id], 0, '한차단: 차단');
  eq(run((api) => api.acctAccessMine(T정일반)).perEvent[id], 0, '아무 권한 없는 일반 교인: 0');
  eq(run((api) => api.acctAccessMine(T김커미티)).perEvent[id], 1, '커미티 역할은 기본 "조회"만');
  eq(run((api) => api.budgetInit(T이예배)).events.map((e) => e.id), [id], '입력자 목록에 그 행사가 보임');
  eq(run((api) => api.budgetInit(T한차단)).events.length, 0, '차단된 사람 목록에는 행사가 없음');
  eq(run((api) => api.budgetInit(T정일반)).events.length, 0, '권한 없는 사람 목록은 비어 있음');
  throws(() => run((api) => api.budgetInit('엉터리키')), /회계 권한/, '엉터리 열쇠는 거절');

  // 서버가 등급별로 막는다 (버튼 숨김에 기대지 않음)
  throws(() => tx({ date: d1, kind: '지출', detail: 'x', amount: 5 }, T강허용), /"입력" 권한/, '조회 등급은 거래를 쓸 수 없다');
  throws(() => tx({ date: d1, kind: '지출', detail: 'x', amount: 5 }, T정일반), /"입력" 권한/, '권한 없는 교인은 거래를 쓸 수 없다');
  throws(() => tx({ date: d1, kind: '지출', detail: 'x', amount: 5 }, T한차단), /차단/, '차단된 사람은 이유와 함께 거절');
  ok(tx({ date: d1, kind: '지출', lineId: 'B001', detail: '이예배가 입력', amount: 10 }, T이예배).transactions.some((t) => t.by === '이예배'), '입력 등급은 거래를 쓸 수 있고 입력자가 기록됨');
  throws(() => run((api) => api.budgetSaveLine(T이예배, id, { kind: '지출', name: '새', amount: 1 })), /"관리" 권한/, '입력 등급은 예산 항목을 못 고친다');
  throws(() => run((api) => api.budgetSaveEvent(T이예배, { name: '몰래 행사' })), /"관리" 권한/, '행사 만들기는 관리 권한');
  throws(() => run((api) => api.budgetSettle(T이예배, id, '')), /"정산" 권한/, '입력 등급은 정산할 수 없다');
  throws(() => run((api) => api.budgetDeleteEvent(T이예배, id)), /"관리" 권한/, '입력 등급은 행사를 지울 수 없다');
  ok(run((api) => api.budgetGetEvent(T강허용, id)).level === 1, '조회 등급은 볼 수 있다');
  throws(() => run((api) => api.budgetGetEvent(T한차단, id)), /차단/, '차단된 사람은 볼 수 없다');
  throws(() => run((api) => api.budgetReportPdf(T정일반, id, 'budget')), /"조회" 권한/, '권한 없는 사람은 PDF 도 못 만든다');
  throws(() => run((api) => api.acctAccessList(T이예배, id)), /"관리" 권한/, '접근 권한 목록은 관리자만');
  throws(() => run((api) => api.acctAccessSave(T이예배, '정일반', id, '관리')), /"관리" 권한/, '입력 등급이 남에게 권한을 줄 수 없다');

  // C4. 접근 관리
  let acc = run((api) => api.acctAccessSave('ADM', '정일반', id, '정산', addDays(TODAY, 30), '총무'));
  ok(acc.rows.some((r) => r.name === '정일반' && r.level === '정산' && !r.global), '정일반에게 이 행사 "정산" 등급을 줌');
  eq(run((api) => api.acctAccessMine(T정일반)).perEvent[id], 3, '바로 적용됨 (정산)');
  const 정산자행 = env.fake.values(env.legacy.id, '사용자권한').find((r) => r[0] === '정일반' && r[1] === '회계');
  eq(정산자행.slice(0, 5), ['정일반', '회계', id, '허용', '정산'], '사용자권한 탭에 구분=회계 줄로 저장');
  acc = run((api) => api.acctAccessSave('ADM', '정일반', id, '입력'));
  eq(acc.rows.filter((r) => r.name === '정일반').length, 1, '같은 사람 · 행사는 한 줄만 (고쳐 씀)');
  eq(run((api) => api.acctAccessMine(T정일반)).perEvent[id], 2, '등급이 입력으로 바뀜');
  run((api) => api.acctAccessSave('ADM', '정일반', id, '관리'));
  acc = run((api) => api.acctAccessSave(T정일반, '오팀장', id, '조회', '', '재정팀장'));
  ok(acc.rows.some((r) => r.name === '오팀장'), '"관리" 등급자는 이 행사의 접근을 줄 수 있다');
  throws(() => run((api) => api.acctAccessSave(T정일반, '오범위', '*', '조회')), /관리자|회계팀 키|관리/, '"모든 행사" 권한은 키 가진 쪽만');
  throws(() => run((api) => api.acctAccessSave(T정일반, '정일반', id, '조회')), /스스로 낮출/, '자기 관리 권한은 스스로 못 낮춤');
  throws(() => run((api) => api.acctAccessSave('ADM', '없는사람', id, '조회')), /교적/, '교적에 없는 이름 거절');
  throws(() => run((api) => api.acctAccessSave('ADM', '오팀장', id, '슈퍼')), /등급은/, '알 수 없는 등급 거절');
  run((api) => api.acctAccessSave('ADM', '오팀장', id, '차단'));
  eq(run((api) => api.acctAccessMine(tok('오팀장', 10))).perEvent[id], 0, '차단으로 바꾸면 접근 불가');
  run((api) => api.acctAccessDelete('ADM', '오팀장', id));
  eq(env.fake.values(env.legacy.id, '사용자권한').filter((r) => r[0] === '오팀장' && r[1] === '회계').length, 0, '접근 줄 삭제');
  run((api) => api.acctAccessSave('ADM', '오범위', id, '입력', '2000-01-01'));
  eq(run((api) => api.acctAccessMine(tok('오범위', 11))).perEvent[id], 0, '만료일이 지난 권한은 저절로 빠짐');
  // 기존 메뉴 권한 판정은 영향 없음
  eq(run((api) => api.이름권한_('이예배', 'leader', '').by) !== undefined, true, '회계 줄이 있어도 기존 메뉴 판정은 동작');
  eq(run((api) => api.개인권한_('이예배').n), 0, '회계 줄은 메뉴 규칙 개수(n)에 세지 않는다 → 기존 메뉴 판정이 그대로');

  // C5. 환급신청서 → 거래
  const tk = run((api) => api.포털토큰_('정일반', P(8), ''));
  const sub = run((api) => api.submitExpense({ agreed: true, approved: 'Yes', dept: '청년부', payableTo: 'X', token: tk, draftId: 'draft-77777777',
    items: [{ date: d1, detail: 'Cups', beforeTax: 10, tax: 1.3, receipts: [{ id: 'f1', name: 'a.jpg', mime: 'image/jpeg' }] },
            { date: d2, detail: 'Water', beforeTax: 20, tax: 0, receipts: [{ id: 'f2', name: 'b.jpg', mime: 'image/jpeg' }] }] }));
  run((api) => api.updateExpense('ADM', sub.no, { status: 'Approved', budget: '2026 가을 수련회' }));
  const dry = run((api) => api.budgetPullReimbursements('ADM', id, true));
  eq([dry.count, dry.total], [2, 31.3], '가져올 환급 항목 2건 (항목별 지출일 사용)');
  eq(dry.items.map((x) => x.date), [d1, d2], '거래 날짜는 항목의 지출일');
  const pulled = run((api) => api.budgetPullReimbursements('ADM', id, false, 'B001'));
  eq(pulled.count, 2, '2건 가져옴');
  eq(run((api) => api.budgetPullReimbursements('ADM', id, false)).count, 0, '다시 가져와도 중복 없음');
  const gp = run((api) => api.budgetGetEvent('ADM', id));
  ok(gp.transactions.some((t) => t.expNo === sub.no + '#1' && t.lineId === 'B001' && t.date === d1), '거래에 지출신청번호#순번 · 항목이 들어감');
  throws(() => run((api) => api.budgetPullReimbursements(T강허용, id, true)), /"입력" 권한/, '조회 등급은 가져오기 불가');

  // C6. 엑셀 왕복 — 내려받기 → 고치기 → 올리기
  const tpl = run((api) => api.budgetTemplateData(T강허용, id));
  eq([tpl.format, tpl.event.id, tpl.event.version > 0, tpl.lines.length], ['YNN-BUDGET-1', id, true, 3], '템플릿 자료: 형식 · 행사 · 버전 · 예산 줄');
  ok(tpl.txs.every((t) => 'lineName' in t), '거래 줄에 항목명이 함께 실림 (사람이 읽기 쉽게)');
  const payloadOf = (t) => ({ format: t.format, eventId: t.event.id, version: t.event.version,
    lines: t.lines.map((l, i) => ({ row: i + 2, id: l.id, kind: l.kind, category: l.category, name: l.name, amount: l.amount, memo: l.memo })),
    txs: t.txs.map((x, i) => ({ row: i + 2, id: x.id, date: x.date, kind: x.kind, line: x.lineId, detail: x.detail, amount: x.amount, method: x.method, note: x.note })) });
  // (a) 고치지 않은 채 그대로 올리면 바뀐 것 없음
  const same = run((api) => api.budgetImportPreview('ADM', id, payloadOf(tpl), {}));
  eq([same.ok, same.lines.add + same.lines.update + same.lines.remove, same.txs.add + same.txs.update + same.txs.remove], [true, 0, 0], '고치지 않고 올리면 바뀐 것 없음');
  eq([same.lines.same, same.txs.same], [3, tpl.txs.length], '모두 "그대로"로 셈');
  // (b) 고친 파일: 예산 수정 · 새 항목 · 거래 수정 · 새 거래(이름으로 항목 지정)
  const edited = payloadOf(tpl);
  edited.lines[0].amount = 1200;                                                              // 식사 1000 → 1200
  edited.lines.push({ row: 5, id: '', kind: '지출', category: '교통', name: '버스', amount: 800, memo: '' });   // 새 항목
  edited.txs[0].amount = 400;                                                                  // 거래 금액 수정
  edited.txs.push({ row: 9, id: '', date: d2, kind: '지출', line: '버스', detail: '버스 대절', amount: 750, method: '이체', note: '' });   // 새 항목을 이름으로 가리킴
  edited.txs.push({ row: 10, id: '', date: d2, kind: '지출', line: '식사', detail: '간식', amount: 25, method: '', note: '' });         // 기존 항목을 이름으로
  const pv = run((api) => api.budgetImportPreview('ADM', id, edited, {}));
  eq([pv.ok, pv.lines.add, pv.lines.update, pv.txs.add, pv.txs.update], [true, 1, 1, 2, 1], '미리보기: 항목 +1 ~1, 거래 +2 ~1');
  eq(pv.lines.updateSample[0], { row: 2, id: 'B001', name: '식사', from: 1000, to: 1200 }, '미리보기가 무엇이 어떻게 바뀌는지 보여줌');
  const before = env.fake.values(env.legacy.id, '행사거래').length;
  eq(env.fake.values(env.legacy.id, '행사거래').length, before, '미리보기는 아무것도 저장하지 않음');
  throws(() => run((api) => api.budgetImportApply(T이예배, id, edited, {})), /"관리" 권한/, '입력 등급이 예산 항목을 바꾸는 파일은 거절');
  const ap = run((api) => api.budgetImportApply('ADM', id, edited, {}));
  ok(ap.applied && ap.version > tpl.event.version, '적용됨 · 버전이 올라감');
  const gi = run((api) => api.budgetGetEvent('ADM', id));
  const nm = {}; gi.lines.forEach((l) => { nm[l.name] = l; });
  eq([nm['식사'].budget, nm['버스'].id, nm['버스'].actual], [1200, 'B004', 750], '고친 예산 · 새 항목 ID · 이름으로 가리킨 거래가 새 항목에 연결됨');
  ok(gi.transactions.some((t) => t.detail === '간식' && t.lineId === 'B001' && t.by === '관리자'), '새 거래 입력자 기록 · 기존 항목 연결 (관리자 키로 입력 → "관리자")');
  eq(gi.transactions.find((t) => t.id === 'T001').amount, 400, '거래 수정 반영');
  eq(gi.transactions.length, tpl.txs.length + 2, '기존 거래는 그대로 + 새 2건');
  // (c) 낡은 파일
  const stale = run((api) => api.budgetImportPreview('ADM', id, payloadOf(tpl), {}));
  ok(stale.stale === true && stale.warnings.some((w) => /다른 사람이 이 행사를 고쳤/.test(w)), '내려받은 뒤 바뀌었으면 낡은 파일 경고');
  throws(() => run((api) => api.budgetImportApply('ADM', id, Object.assign(payloadOf(tpl), { lines: null, txs: [{ row: 2, id: '', date: d1, kind: '지출', line: '', detail: '낡은파일 거래', amount: 1 }] }), {})), /다른 사람이 이 행사를 고쳤/, '낡은 파일은 확인 없이는 저장 안 함');
  const ok2 = run((api) => api.budgetImportApply('ADM', id, { format: tpl.format, eventId: id, version: tpl.event.version, txs: [{ row: 2, id: '', date: d1, kind: '지출', line: '', detail: '낡은파일 거래', amount: 1 }] }, { acceptStale: true }));
  ok(ok2.applied, '확인(acceptStale)하면 저장');
  // (d) 오류: 하나라도 있으면 전부 저장 안 함
  const cntBefore = run((api) => api.budgetGetEvent('ADM', id)).transactions.length;
  const bad = { format: tpl.format, eventId: id, version: run((api) => api.budgetGetEvent('ADM', id)).event.version, lines: null, txs: [
    { row: 2, id: '', date: d1, kind: '지출', line: '', detail: '정상 거래', amount: 5 },
    { row: 3, id: '', date: '2026/1/1', kind: '지출', line: '', detail: '날짜 오류', amount: 5 },
    { row: 4, id: '', date: d1, kind: '지출', line: '없는항목', detail: '항목 오류', amount: 5 },
    { row: 5, id: 'T999', date: d1, kind: '지출', line: '', detail: '없는 ID', amount: 5 },
    { row: 6, id: '', date: d1, kind: '지출', line: '', detail: '금액 오류', amount: 'abc' },
    { row: 7, id: '', date: d1, kind: '기타', line: '', detail: '구분 오류', amount: 5 }] };
  const bp = run((api) => api.budgetImportPreview('ADM', id, bad, {}));
  eq([bp.ok, bp.errorCount], [false, 5], '오류 5건이 행 번호와 함께 나옴');
  eq(bp.errors.map((e) => e.row), [3, 4, 5, 6, 7], '오류 행 번호');
  throws(() => run((api) => api.budgetImportApply('ADM', id, bad, {})), /오류가 5건/, '오류가 있으면 적용 거절');
  eq(run((api) => api.budgetGetEvent('ADM', id)).transactions.length, cntBefore, '오류가 있으면 정상 줄도 저장하지 않음 (부분 저장 없음)');
  // (e) 바꾸기(replace): 파일에 없는 줄은 삭제
  const cur = run((api) => api.budgetTemplateData('ADM', id));
  const rp = payloadOf(cur); rp.txs = rp.txs.slice(0, 2);
  const rpv = run((api) => api.budgetImportPreview('ADM', id, rp, { mode: 'replace' }));
  eq(rpv.txs.remove, cur.txs.length - 2, '바꾸기 모드: 파일에 없는 거래는 삭제 대상으로 미리 보여줌');
  const mpv = run((api) => api.budgetImportPreview('ADM', id, rp, { mode: 'merge' }));
  eq(mpv.txs.remove, 0, '합치기 모드: 삭제 없음');
  const rp2 = payloadOf(cur); rp2.lines = rp2.lines.filter((l) => l.id !== 'B001');       // 거래가 있는 항목을 빼면
  const rpv2 = run((api) => api.budgetImportPreview('ADM', id, rp2, { mode: 'replace' }));
  ok(!rpv2.ok && rpv2.errors.some((e) => /삭제하려는 예산 항목 B001/.test(e.message)), '거래가 가리키는 항목을 삭제하는 파일은 오류');
  // (f) 엑셀의 잘못된 파일 / 다른 행사
  ok(!run((api) => api.budgetImportPreview('ADM', id, { format: 'other' }, {})).ok, '다른 프로그램 파일 거절');
  ok(!run((api) => api.budgetImportPreview('ADM', id, Object.assign({}, payloadOf(cur), { eventId: 'EV-2026-999' }), {})).ok, '다른 행사 파일 거절');
  ok(!run((api) => api.budgetImportPreview('ADM', id, {}, {})).ok, '빈 파일 거절');
  const ch = payloadOf(cur); ch.lines[0].amount = 999;
  const lvl = run((api) => api.budgetImportPreview(T강허용, id, ch, {}));
  ok(!lvl.ok && lvl.errors.some((e) => /권한/.test(e.message)), '조회 등급은 미리보기는 되지만 바뀌는 것이 있으면 권한 오류로 표시');

  // C7. 정산
  throws(() => run((api) => api.budgetSettle('ADM', id, '')), /연결되지 않은 거래/, '미분류 거래가 있으면 그냥은 정산 못 함');
  const settled = run((api) => api.budgetSettle('ADM', id, '수련회 정산', true));
  eq(settled.event.status, '정산완료', '정산 확정 → 상태 정산완료');
  eq(settled.settlements.length, 1, '정산 기록 1건');
  ok(settled.settlements[0].no === 'S001' && settled.settlements[0].by === '관리자', '정산번호 S001 · 확정자 기록');
  const snapRow = env.fake.values(env.legacy.id, '행사정산')[1];
  const snap = JSON.parse(snapRow[10]);
  eq(snap.totals.actualExpense, settled.totals.actualExpense, '스냅샷에 그때의 합계가 저장됨');
  eq(snap.lines.length, 4, '스냅샷에 항목별 예산/실적이 들어감');
  throws(() => tx({ date: d1, kind: '지출', detail: 'x', amount: 5 }), /정산이 끝난 행사/, '정산 뒤에는 거래 기록 불가');
  throws(() => line({ kind: '지출', name: 'y', amount: 5 }), /정산이 끝난 행사/, '정산 뒤에는 예산 항목 수정 불가');
  throws(() => run((api) => api.budgetImportApply('ADM', id, edited, {})), /정산이 끝난 행사/, '정산 뒤에는 엑셀 올리기 불가');
  ok(!run((api) => api.budgetImportPreview('ADM', id, edited, {})).ok, '정산 뒤 미리보기는 오류로 표시');
  throws(() => run((api) => api.budgetDeleteEvent('ADM', id)), /정산이 끝난 행사/, '정산 끝난 행사는 지울 수 없음');
  throws(() => run((api) => api.budgetReopen(T이예배, id, '실수')), /"정산" 권한/, '입력 등급은 다시 열 수 없음');
  throws(() => run((api) => api.budgetReopen('ADM', id, '')), /이유/, '다시 열려면 이유 필수');
  const re = run((api) => api.budgetReopen('ADM', id, '영수증 추가 발견'));
  eq(re.event.status, '진행중', '다시 열면 진행중');
  ok(tx({ date: d1, kind: '지출', lineId: 'B001', detail: '추가 영수증', amount: 12 }).transactions.some((t) => t.detail === '추가 영수증'), '다시 열린 뒤에는 기록 가능');
  const s2 = run((api) => api.budgetSettle('ADM', id, '재정산', true));
  eq(s2.settlements.map((x) => x.no), ['S001', 'S002'], '재정산은 S002 로 쌓임 (이전 기록 보존)');
  const hist = run((api) => api.budgetHistory('ADM', id)).map((h) => h.action);
  ok(['정산 확정', '정산 다시 열기', '엑셀 올리기', '거래 기록', '행사 만들기'].every((a) => hist.indexOf(a) !== -1), '변경 이력이 남음 (' + hist.length + '건)');

  // C8. 보고서 (PDF 의 원본 HTML)
  ['budget', 'transactions', 'settlement'].forEach((k) => {
    const r = run((api) => api.budgetReportHtml('ADM', id, k));
    ok(r.html.indexOf('2026 가을 수련회') !== -1 && r.html.indexOf('토론토영락교회') !== -1, k + ' 보고서 HTML 생성');
  });
  const stl = run((api) => api.budgetReportHtml(T강허용, id, 'settlement')).html;
  ok(/정산 확정/.test(stl) && /재정산/.test(stl) && /담당 목사 확인/.test(stl), '정산서: 확정 표시 · 메모 · 서명란 (조회 등급도 내려받기 가능)');
  const tr = run((api) => api.budgetReportHtml('ADM', id, 'transactions')).html;
  ok(tr.indexOf('버스 대절') !== -1 && /누계/.test(tr), '거래 내역서: 거래 · 누계');
  throws(() => run((api) => api.budgetReportHtml('ADM', id, 'nope')), /보고서 종류/, '알 수 없는 종류 거절');
  const ex = run((api) => { try { return api.budgetReportPdf('ADM', id, 'budget'); } catch (e) { return { err: String(e.message) }; } });
  ok(ex.b64 || ex.err, 'PDF 요청이 (가짜 구글에서는 변환 오류라도) 예외 없이 응답 형태로 돌아옴');

  // C9. 지우기 · 다른 행사 영향 없음
  const ev2 = run((api) => api.budgetSaveEvent('ADM', { name: '겨울 캠프', year: '2026' }));
  eq(ev2.event.id, 'EV-2026-002', '두 번째 행사 번호');
  run((api) => api.budgetSaveLine('ADM', ev2.event.id, { kind: '지출', name: '식비', amount: 100 }));
  run((api) => api.budgetSaveTx('ADM', ev2.event.id, { date: d1, kind: '지출', lineId: 'B001', detail: '장보기', amount: 40 }));
  const first = run((api) => api.budgetGetEvent('ADM', id)).transactions.length;
  run((api) => api.budgetDeleteEvent('ADM', ev2.event.id));
  eq(run((api) => api.budgetGetEvent('ADM', id)).transactions.length, first, '다른 행사를 지워도 이 행사 자료는 그대로');
  eq(env.fake.values(env.legacy.id, '행사예산').filter((r) => r[0] === ev2.event.id).length, 0, '지운 행사 줄이 사라짐');
  eq(run((api) => api.budgetInit('ADM')).events.length, 1, '목록에서도 사라짐');
  const dl = run((api) => api.budgetSaveEvent('ADM', { name: '삭제 시험', year: '2027' }));
  run((api) => api.budgetSaveLine('ADM', dl.event.id, { kind: '지출', name: 'a', amount: 1 }));
  throws(() => run((api) => api.budgetDeleteLine('ADM', dl.event.id, 'B999')), /찾을 수 없습니다/, '없는 항목 삭제 거절');
  run((api) => api.budgetSaveTx('ADM', dl.event.id, { date: d1, kind: '지출', lineId: 'B001', detail: 'z', amount: 1 }));
  throws(() => run((api) => api.budgetDeleteLine('ADM', dl.event.id, 'B001')), /거래가 1건/, '거래가 있는 항목은 못 지움');
  run((api) => api.budgetDeleteTx('ADM', dl.event.id, 'T001'));
  eq(run((api) => api.budgetDeleteLine('ADM', dl.event.id, 'B001')).lines.length, 0, '거래를 지운 뒤에는 항목도 지울 수 있음');

  // C10. DB 배치 — 새 탭은 모두 재정 시트(DB03)로
  const fs = require('fs'), path = require('path'), db = require('../lib/db');
  const 탭들 = [];
  ['eventbudget.js', 'eventbudget-io.js', 'training.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'logic', f), 'utf8');
    Array.from(src.matchAll(/^var SHEET_\S+ = '([^']+)'/gm), (m) => m[1]).forEach((t) => 탭들.push(t));
  });
  eq(탭들.sort(), ['행사거래', '행사예산', '행사예산항목', '행사이력', '행사정산'], '새 파일이 쓰는 탭 목록');
  탭들.forEach((t) => eq(db.keyFor(t), 'finance', '"' + t + '" 은 재정 시트(DB03)에 배정'));

  // C11. 엑셀 파일 왕복 (실제 .xlsx 만들기 → 사용자가 엑셀에서 고침 → 읽기 → 서버 검증 · 적용)
  const XLSX = require('../public/vendor/xlsx.mini.min.js'), IO = require('../public/budget/xlsx-io.js');
  const ev3 = run((api) => api.budgetSaveEvent('ADM', { name: '엑셀 왕복 행사', year: '2026' })).event.id;
  run((api) => api.budgetSaveLine('ADM', ev3, { kind: '지출', category: '식비', name: '간식', amount: 100 }));
  run((api) => api.budgetSaveLine('ADM', ev3, { kind: '수입', name: '후원', amount: 50 }));
  run((api) => api.budgetSaveTx('ADM', ev3, { date: d1, kind: '지출', lineId: 'B001', detail: '과자', amount: 20, method: '카드' }));
  const t3 = run((api) => api.budgetTemplateData('ADM', ev3));
  const built = IO.build(XLSX, t3);
  ok(/^행사예산_엑셀 왕복 행사_v\d+\.xlsx$/.test(built.filename), '파일 이름 ' + built.filename);
  const bytes = XLSX.write(built.wb, { type: 'array', bookType: 'xlsx' });
  const wb2 = XLSX.read(bytes, { type: 'array' });
  eq(wb2.SheetNames, ['안내', '예산', '거래', '_meta'], '시트 구성: 안내 · 예산 · 거래 · _meta');
  const parsed = IO.parse(XLSX, bytes);
  eq([parsed.format, parsed.eventId, parsed.version, parsed.problems.length], ['YNN-BUDGET-1', ev3, t3.event.version, 0], '읽어 낸 형식 · 행사 · 버전');
  eq(parsed.lines.map((l) => [l.id, l.kind, l.name, l.amount]), [['B001', '지출', '간식', 100], ['B002', '수입', '후원', 50]], '예산 시트 왕복');
  eq(parsed.txs.map((t) => [t.id, t.date, t.line, t.detail, t.amount]), [['T001', d1, '간식', '과자', 20]], '거래 시트 왕복 (항목명 · 날짜 그대로)');
  eq(run((api) => api.budgetImportPreview('ADM', ev3, parsed, {})).lines.same, 2, '고치지 않은 파일은 서버가 "그대로"로 인식');
  // 사용자가 엑셀에서 고친 것을 흉내: 셀 직접 수정 (금액 문자열 · 날짜 일련번호 · 빈 줄 · 새 줄)
  const wsL = wb2.Sheets['예산'], wsT = wb2.Sheets['거래'];
  wsL['E2'] = { t: 's', v: '$1,250.50' };                                       // 예산액을 글자로 ($ · 쉼표)
  XLSX.utils.sheet_add_aoa(wsL, [['', '지출', '교통', '버스', 300, '']], { origin: 'A4' });   // 새 줄 (ID 비움)
  const serial = Math.round((Date.parse(d2 + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000);
  XLSX.utils.sheet_add_aoa(wsT, [['', serial, '지출', '버스', '버스 대절', '300', '이체', '', '']], { origin: 'A3' });   // 날짜를 엑셀 일련번호로
  XLSX.utils.sheet_add_aoa(wsT, [['', '', '', '', '', '', '', '', '']], { origin: 'A4' });                                     // 빈 줄은 무시
  wsT['F2'] = { t: 'n', v: 22.5 };
  const bytes2 = XLSX.write(wb2, { type: 'array', bookType: 'xlsx' });
  const p2 = IO.parse(XLSX, bytes2);
  eq(p2.txs[1].date, d2, '엑셀 날짜 일련번호가 2026-MM-DD 로 바뀜');
  const pv3 = run((api) => api.budgetImportPreview('ADM', ev3, p2, {}));
  eq([pv3.ok, pv3.lines.add, pv3.lines.update, pv3.txs.add, pv3.txs.update], [true, 1, 1, 1, 1], '고친 파일 미리보기: 항목 +1 ~1 · 거래 +1 ~1 (빈 줄 무시)');
  run((api) => api.budgetImportApply('ADM', ev3, p2, {}));
  const r3 = run((api) => api.budgetGetEvent('ADM', ev3));
  eq(r3.lines.map((l) => [l.id, l.budget, l.actual]), [['B001', 1250.5, 22.5], ['B002', 50, 0], ['B003', 300, 300]], '엑셀에서 고친 값이 그대로 저장 · 새 항목 ID 부여 · 새 거래가 새 항목에 연결');
  // 잘못된 파일
  const wbBad = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wbBad, XLSX.utils.aoa_to_sheet([['아무거나'], [1]]), 'Sheet1');
  ok(IO.parse(XLSX, XLSX.write(wbBad, { type: 'array', bookType: 'xlsx' })).problems.length > 0, '다른 엑셀 파일은 읽기 단계에서 문제로 표시');
  const wbHead = XLSX.read(bytes, { type: 'array' }); wbHead.Sheets['거래']['A1'] = { t: 's', v: '뭔가' };
  ok(IO.parse(XLSX, XLSX.write(wbHead, { type: 'array', bookType: 'xlsx' })).problems.some((x) => /머리글/.test(x)), '머리글이 바뀌면 알려줌');
};
