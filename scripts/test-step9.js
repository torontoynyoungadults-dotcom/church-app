/**
 * Step 9 시험 — 행사 예산 · 정산의 실적 (다중 통화 · 영수증 · 예산 대비 차이 설명 · Executive Summary / 비고)
 *   node scripts/test-step9.js          (test-step3 의 가짜 구글 · 서버 부팅을 그대로 씀)
 *  E. 통화 환산 · 영수증 · 차이 설명 · 요약/비고 · 승인 절차와의 연결 · 옛 행사 호환
 */
module.exports = function (T) {
  const { ok, eq, section, throws, newEnv, TODAY, addDays } = T;
  section('E. 실적 — 통화 · 영수증 · 차이 설명 (Step 9)');
  const P = (n) => String(4165551000 + n);
  const env = newEnv((t) => {
    t['사용자권한'] = t['사용자권한'].concat([
      ['정일반', '회계', '*', '허용', '입력', '', '', '', ''],        // 입력
      ['이예배', '회계', '*', '허용', '정산', '', '', '', ''],        // 정산(회계 담당)
      ['강허용', '회계', '*', '허용', '조회', '', '', '', ''],        // 보기만
    ]);
  });
  const run = env.run;
  const tok = (name, n) => run((api) => api.포털토큰_(name, P(n), ''));
  const T정일반 = tok('정일반', 8), T이예배 = tok('이예배', 1), T강허용 = tok('강허용', 3);
  const d1 = addDays(TODAY, -3), d2 = addDays(TODAY, -2);

  const mkEvent = (name, workflow) => run((api) => api.budgetSaveEvent('ADM', { name, year: '2026', dept: '청년부', workflow: !!workflow })).event.id;
  const line = (id, o) => run((api) => api.budgetSaveLine('ADM', id, o));
  const tx = (k, id, o) => run((api) => api.budgetSaveTx(k, id, o));
  const get = (k, id) => run((api) => api.budgetGetEvent(k || 'ADM', id));
  const notes = (k, id, patch) => run((api) => api.budgetSaveNotes(k, id, patch));
  const rows = (tab) => { try { return env.fake.values(env.legacy.id, tab).slice(1).filter((r) => r.some((c) => c !== '' && c != null)); } catch (e) { return []; } };   // 머리줄 뺀 자료 줄 (시트가 아직 없으면 [])
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const up = (k, id, name, data) => run((api) => api.budgetUploadReceipt(k, id, name, data || PNG));

  // ---- E1. 옛 방식 행사 — 통화 · 영수증 없이 예전 그대로
  const id = mkEvent('2026 캠프', false);
  line(id, { kind: '지출', category: '식비', name: '식사', amount: 1000 });
  line(id, { kind: '지출', category: '숙박', name: '숙소', amount: 2000 });
  line(id, { kind: '수입', category: '참가비', name: '등록비', amount: 1500 });
  line(id, { kind: '지출', category: '기타', name: '예비비', amount: 0 });
  const g1 = tx('ADM', id, { date: d1, kind: '지출', lineId: 'B001', detail: '점심', amount: 100, method: '카드' });
  const t1 = g1.transactions[0];
  eq([t1.currency, t1.foreign, t1.rate, t1.receipts, t1.amount], ['CAD', null, null, [], 100], '통화를 안 보내는 거래는 CAD · 영수증 없음 (예전 그대로)');
  eq(rows('행사거래상세'), [], 'CAD 거래는 상세 줄을 만들지 않음');
  ok(Array.isArray(g1.actuals.currencies) && g1.actuals.currencies.join() === 'CAD,USD,JPY', '화면에 통화 목록을 내려줌');
  eq(g1.actuals.byCurrency, [], 'CAD 만 있으면 통화별 합계는 비어 있음');

  // ---- E2. 통화 환산
  const g2 = tx('ADM', id, { date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.37, amount: 9999 });
  const u = g2.transactions.find((t) => t.detail === '미국 기념품');
  eq([u.currency, u.foreign, u.rate, u.amount], ['USD', 100, 1.37, 137], '원금액 × 환율 = CAD (환율을 주면 함께 보낸 amount 는 무시)');
  eq(g2.totals.actualExpense, 237, '집계에는 CAD 환산액이 들어감');
  const g3 = tx('ADM', id, { date: d1, kind: '지출', lineId: 'B001', detail: '일본 간식', currency: 'JPY', foreignAmount: 10000.4, rate: 0.0092 });
  const j = g3.transactions.find((t) => t.detail === '일본 간식');
  eq([j.foreign, j.rate, j.amount], [10000, 0.0092, 92], 'JPY 는 소수 없이 반올림 · 환율은 소수 6자리까지');
  const g4 = tx('ADM', id, { date: d1, kind: '지출', lineId: 'B001', detail: '카드 명세 기준', currency: 'USD', foreignAmount: 50, amount: 68 });
  const c4 = g4.transactions.find((t) => t.detail === '카드 명세 기준');
  eq([c4.amount, c4.rate], [68, 1.36], 'CAD 환산액만 적어도 환율을 역산');
  throws(() => tx('ADM', id, { date: d1, kind: '지출', detail: 'x', currency: 'EUR', foreignAmount: 1, rate: 1.5 }), /통화는/, '모르는 통화 거절');
  throws(() => tx('ADM', id, { date: d1, kind: '지출', detail: 'x', currency: 'USD', foreignAmount: 10 }), /환율/, '환율도 CAD 금액도 없으면 거절');
  throws(() => tx('ADM', id, { date: d1, kind: '지출', detail: 'x', currency: 'USD', foreignAmount: 0, rate: 1.3 }), /0/, '원금액 0 거절');
  throws(() => tx('ADM', id, { date: d1, kind: '지출', detail: 'x', currency: 'USD', foreignAmount: 10, rate: 20000 }), /환율이 너무/, '말도 안 되는 환율 거절');
  throws(() => tx('ADM', id, { date: d1, kind: '지출', detail: 'x', currency: 'JPY', foreignAmount: 1, rate: 0.001 }), /0입니다/, '환산액이 0원이면 거절');
  const fxs = get('ADM', id).actuals.byCurrency;
  eq(fxs.map((x) => [x.currency, x.count, x.expenseForeign, x.expenseCad]), [['CAD', 1, 100, 100], ['USD', 2, 150, 205], ['JPY', 1, 10000, 92]], '통화별 합계 (원금액 · CAD)');
  eq(rows('행사거래상세').length, 3, '외화 거래 3건만 상세 줄이 생김');

  // 고치기
  const g5 = tx('ADM', id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.4 });
  eq(g5.transactions.find((t) => t.id === u.id).amount, 140, '환율을 고치면 CAD 도 다시 계산');
  const g6 = tx('ADM', id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품(메모 수정)', amount: 140 });
  eq([g6.transactions.find((t) => t.id === u.id).currency, g6.transactions.find((t) => t.id === u.id).foreign], ['USD', 100], '통화를 모르는 옛 화면이 같은 금액으로 저장하면 외화 정보 유지');
  const g7 = tx('ADM', id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품(금액 수정)', amount: 150 });
  const u7 = g7.transactions.find((t) => t.id === u.id);
  eq([u7.currency, u7.foreign, u7.amount], ['CAD', null, 150], '옛 화면이 금액을 바꾸면 CAD 거래로 돌림 (원금액 × 환율 ≠ CAD 방지)');
  tx('ADM', id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.37 });

  // ---- E3. 영수증
  throws(() => up(T강허용, id, 'a.png'), /"입력" 권한/, '조회 등급은 영수증을 못 올림');
  throws(() => up(T정일반, id, 'a.zip', 'data:application/zip;base64,AAAA'), /JPG/, '사진 · PDF 가 아니면 거절');
  throws(() => up(T정일반, id, 'a.png', 'nonsense'), /읽을 수/, '깨진 자료 거절');
  const f1 = up(T정일반, id, '영수증1'), f2 = up(T정일반, id, '영수증2.png');
  eq([f1.name, f1.mime, f2.name], ['영수증1.png', 'image/png', '영수증2.png'], '올린 파일 정보 (확장자 보정)');
  const fileOf = (fid) => env.fake.files.get(fid);
  ok(fileOf(f1.id) && !fileOf(f1.id).trashed, '드라이브에 저장됨');
  throws(() => tx(T정일반, id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.37, receipts: [{ id: 'nope', name: 'x.png' }] }), /찾을 수 없습니다/, '없는 파일은 못 붙임');
  const 남의 = run((api) => api.uploadExpenseReceipt('draft-12345678', 'x.png', PNG));
  throws(() => tx(T정일반, id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.37, receipts: [{ id: 남의.id, name: 'x.png' }] }), /이 행사에 올린/, '다른 곳(환급신청서 임시 폴더) 파일은 못 붙임');
  const withR = tx(T정일반, id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.37, receipts: [f1, f2] });
  const tr = withR.transactions.find((t) => t.id === u.id);
  eq([tr.receipts.length, tr.receipts[0].isImage, /drive\.google\.com/.test(tr.receipts[0].url)], [2, true, true], '거래에 영수증 2장 (보기 주소 포함)');
  throws(() => tx(T정일반, id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.37, receipts: new Array(9).fill(0).map((_, i) => ({ id: 'x' + i })) }), /8개/, '한 거래에 8개까지');
  const keep = tx(T정일반, id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.37 });
  eq(keep.transactions.find((t) => t.id === u.id).receipts.length, 2, 'receipts 를 안 보내면(옛 화면) 영수증은 그대로');
  const cut = tx(T정일반, id, { id: u.id, date: d1, kind: '지출', lineId: 'B001', detail: '미국 기념품', currency: 'USD', foreignAmount: 100, rate: 1.37, receipts: [f1] });
  eq(cut.transactions.find((t) => t.id === u.id).receipts.length, 1, '영수증 한 장 빼기');
  ok(fileOf(f2.id).trashed && !fileOf(f1.id).trashed, '뺀 영수증만 휴지통으로');
  const f3 = up(T정일반, id, '안붙임.png');
  run((api) => api.budgetDiscardReceipt(T정일반, id, f3.id));
  ok(fileOf(f3.id).trashed, '붙이지 않은 영수증은 버릴 수 있음');
  run((api) => api.budgetDiscardReceipt(T정일반, id, f1.id));
  ok(!fileOf(f1.id).trashed, '거래에 붙어 있는 영수증은 "버리기"로 지워지지 않음');
  run((api) => api.budgetDeleteTx(T정일반, id, u.id));
  ok(fileOf(f1.id).trashed, '거래를 지우면 그 영수증도 휴지통으로');
  eq(rows('행사거래상세').filter((r) => r[1] === u.id).length, 0, '거래를 지우면 상세 줄도 지움 (같은 번호 재사용 시 남은 줄이 붙지 않음)');
  const again = tx('ADM', id, { date: d1, kind: '지출', lineId: 'B001', detail: '새 거래', amount: 5 });
  const nid = again.transactions.find((t) => t.detail === '새 거래');
  eq([nid.currency, nid.receipts.length], ['CAD', 0], '새 거래는 CAD · 영수증 없음으로 시작 (번호가 다시 쓰여도 남은 상세가 붙지 않음)');

  // ---- E4. 환급신청서를 가져오면 그 영수증이 연결됨 (원본은 지우지 않음)
  const tk = run((api) => api.포털토큰_('정일반', P(8), ''));
  const sub = run((api) => api.submitExpense({ agreed: true, approved: 'Yes', dept: '청년부', payableTo: 'X', token: tk, draftId: 'draft-77777777',
    items: [{ date: d1, detail: 'Cups', beforeTax: 10, tax: 1.3, receipts: [{ id: 'f1', name: 'a.jpg', mime: 'image/jpeg' }] }] }));
  run((api) => api.updateExpense('ADM', sub.no, { status: 'Approved', budget: '2026 캠프' }));
  run((api) => api.budgetPullReimbursements('ADM', id, false, 'B001'));
  const pl = get('ADM', id).transactions.find((t) => t.expNo === sub.no + '#1');
  eq([pl.receipts.length, pl.receipts[0].id, pl.currency], [1, 'f1', 'CAD'], '가져온 거래에 신청서 영수증이 연결됨');
  run((api) => api.budgetDeleteTx('ADM', id, pl.id));
  eq(rows('행사거래상세').filter((r) => r[1] === pl.id).length, 0, '연결된 거래를 지워도 오류 없음 (원본 파일은 건드리지 않음)');

  // ---- E5. 예산 대비 차이 · 설명
  const v0 = get('ADM', id).actuals.variance;
  eq(v0.rule, { pct: 10, amount: 50 }, '설명 기준: 예산의 10% 이상이면서 CAD 50 이상');
  const vr = (name) => get('ADM', id).actuals.variance.rows.find((r) => r.name === name);
  // 식사: 예산 1000, 실적 = 100 + 137(USD 다시 저장) + 92 + 68 + 5 = 402 → 차이 -598
  const meal = vr('식사');
  eq([meal.budget, meal.variance, meal.needs, meal.bad], [1000, meal.actual - 1000, true, false], '식사: 큰 차이(예산보다 적게 씀)는 설명 필요 · 지출이 예산보다 적으면 "나쁨" 아님');
  eq([vr('숙소').variance, vr('숙소').needs], [-2000, true], '실적 0 도 큰 차이면 설명 필요');
  eq([vr('예비비').needs, vr('예비비').pct], [false, null], '예산 0 · 실적 0 은 설명 불필요 (퍼센트 없음)');
  tx('ADM', id, { date: d2, kind: '지출', lineId: 'B004', detail: '급한 지출', amount: 49.99 });
  eq(vr('예비비').needs, false, '예산 0 이라도 CAD 50 미만이면 설명 불필요');
  tx('ADM', id, { date: d2, kind: '지출', lineId: 'B004', detail: '급한 지출 2', amount: 0.01 });
  const 예비 = vr('예비비');
  eq([예비.needs, 예비.bad], [true, true], '예산 0 에 CAD 50 이상 쓰면 설명 필요 · 초과는 "나쁨"');
  ok(v0.missing.length >= 2 && get('ADM', id).actuals.variance.missing.indexOf('B004') !== -1, 'missing 에 설명이 비어 있는 항목이 나옴');

  throws(() => notes(T강허용, id, { summary: 'x' }), /"입력" 권한/, '조회 등급은 노트를 못 씀');
  throws(() => notes(T정일반, id, {}), /저장할 내용/, '빈 요청 거절');
  throws(() => notes(T정일반, id, { variance: { B999: 'x' } }), /찾을 수 없습니다/, '없는 항목 거절');
  throws(() => notes(T정일반, id, { summary: 'x'.repeat(2001) }), /2000자/, 'Executive Summary 는 2000자까지');
  throws(() => notes(T정일반, id, { variance: { B001: 'x'.repeat(301) } }), /300자/, '차이 설명은 300자까지');
  const n1 = notes(T정일반, id, { summary: '캠프는 계획대로 진행했다.\n참가 인원이 늘었다.', remarks: '숙소 잔금은 다음 달 지급', variance: { B001: '예상보다 적게 모여 식사 인원이 줄었습니다', B002: '숙소 잔금 미지급' } });
  eq([n1.actuals.notes.summary.text, n1.actuals.notes.summary.by, n1.actuals.notes.remarks.text], ['캠프는 계획대로 진행했다.\n참가 인원이 늘었다.', '정일반', '숙소 잔금은 다음 달 지급'], '요약 · 비고 저장 (작성자 기록)');
  eq(n1.actuals.variance.rows.find((r) => r.id === 'B001').note, '예상보다 적게 모여 식사 인원이 줄었습니다', '항목별 설명이 차이표에 붙음');
  eq(n1.actuals.variance.missing, ['B003', 'B004'], '설명이 없는 항목만 missing (등록비는 실적 0 이라 설명 필요 · 식사 · 숙소는 적음)');
  const n2 = notes(T정일반, id, { remarks: '', variance: { B002: '' } });
  eq([n2.actuals.notes.remarks, n2.actuals.variance.rows.find((r) => r.id === 'B002').note], [null, ''], '빈 글로 저장하면 지움');
  eq(rows('행사실적노트').length, 2, '노트 시트: 요약 + 항목 설명 1 (지운 글은 줄도 없음)');
  ok(run((api) => api.budgetHistory('ADM', id)).some((h) => h.action === '실적 노트 고침'), '이력에 남음');
  eq([n2.actuals.can.notes, n2.actuals.can.explain, get(T강허용, id).actuals.can.notes], [true, true, false], '화면 값: 입력 등급은 쓸 수 있고 조회 등급은 못 씀');

  // 옛 방식 행사는 설명이 없어도 정산 확정 가능 (예전 동작 유지)
  const st = run((api) => api.budgetSettle('ADM', id, '옛 방식 정산', true));
  eq(st.event.status, '정산완료', '승인 절차를 쓰지 않는 행사는 설명 없이도 정산 확정 (예전과 같음)');
  throws(() => notes('ADM', id, { summary: '고침' }), /정산이 끝난/, '정산이 끝나면 노트도 잠김');
  eq(rows('행사정산').length, 1, '정산 기록 1건');
  const stored = JSON.parse(rows('행사정산')[0][10]);
  eq([stored.notes.summary.text.slice(0, 6), stored.lines.find((l) => l.id === 'B001').explain, stored.fx.map((x) => x.currency)], ['캠프는 계획', '예상보다 적게 모여 식사 인원이 줄었습니다', ['CAD', 'USD', 'JPY']], '정산 스냅샷에 요약 · 항목 설명 · 통화 합계가 남음');
  const rep = run((api) => api.budgetReportHtml('ADM', id, 'settlement')).html;
  ok(/Executive Summary/.test(rep) && /예산 대비 차이 설명/.test(rep) && /식사 인원이 줄었습니다/.test(rep) && /설명 없음/.test(rep) && /통화별 합계/.test(rep), '정산서에 요약 · 차이 설명 표(설명 없는 항목 표시) · 통화별 합계');
  const rep2 = run((api) => api.budgetReportHtml('ADM', id, 'transactions')).html;
  ok(/USD 50 × 1\.36/.test(rep2) && /JPY 10000 × 0\.0092/.test(rep2), '거래 내역서에 원금액 × 환율이 보임');

  // ---- E6. 승인 절차를 쓰는 행사 — 차이 설명이 정산 제출의 조건
  const m = mkEvent('2026 워크숍', true);
  line(m, { kind: '지출', category: '식비', name: '식사', amount: 1000 });
  line(m, { kind: '수입', category: '참가비', name: '등록비', amount: 500 });
  throws(() => notes(T정일반, m, { variance: { B001: 'x' } }), /예산이 승인된 뒤/, 'Draft 에서는 차이 설명을 쓸 수 없음 (거래가 아직 없음)');
  ok(notes(T정일반, m, { summary: '계획 요약' }).actuals.notes.summary, 'Draft 에서도 Executive Summary 는 쓸 수 있음');
  const act = (k, action, note, eid) => run((api) => api.budgetFlowAct(k, eid || m, action, note || ''));
  act(T정일반, 'submitBudget');
  throws(() => notes(T정일반, m, { variance: { B001: 'x' } }), /예산이 승인된 뒤/, '예산 검토 중에도 차이 설명은 잠김');
  act(T이예배, 'approveBudget');
  tx(T정일반, m, { date: d1, kind: '지출', lineId: 'B001', detail: '점심', amount: 300, currency: 'USD', foreignAmount: 200, rate: 1.5 });
  tx(T정일반, m, { date: d1, kind: '수입', lineId: 'B002', detail: '등록비', amount: 480 });
  const gm = get(T정일반, m);
  eq(gm.actuals.variance.missing, ['B001'], '식사(-700)는 설명 필요 · 등록비(-20)는 기준 미만이라 불필요');
  ok(gm.actuals.can.explain && gm.actuals.can.receipts, 'Budget Approved 에서 설명 · 영수증 가능');
  throws(() => act(T정일반, 'submitSettlement'), /차이가 큰 항목의 설명이 필요합니다: 식사 \(-700\)/, '설명이 없으면 정산 제출이 막힘 (항목 이름과 차이를 알려줌)');
  eq(get('ADM', m).flow.stage, 'Budget Approved', '막혀도 단계는 그대로');
  notes(T정일반, m, { variance: { B001: '참가자 감소' } });
  act(T정일반, 'submitSettlement');
  eq(get('ADM', m).flow.stage, 'Settlement Submitted', '설명을 적으면 제출됨');
  throws(() => notes(T정일반, m, { summary: '고침' }), /회계 검토 중/, '정산 제출 뒤에는 노트도 잠김');
  const gs = get(T정일반, m);
  eq([gs.actuals.can.notes, gs.actuals.can.explain, gs.actuals.can.receipts], [false, false, false], '화면 값: 잠김');
  throws(() => up(T정일반, m, 'x.png'), /정산이 회계 검토 중/, '영수증도 잠금 중에는 못 올림');
  act(T이예배, 'requestSettlementRevision', '요약 보강');
  ok(notes(T정일반, m, { summary: '보강한 요약' }).actuals.can.explain, '수정 요청으로 돌아오면 다시 쓸 수 있음');
  act(T정일반, 'submitSettlement');
  act('ADM', 'approveSettlement', '끝');
  eq(get('ADM', m).event.status, '정산완료', '승인 절차를 끝까지 통과');
  const sm = JSON.parse(rows('행사정산').filter((r) => r[0] === m)[0][10]);
  eq([sm.notes.summary.text, sm.lines[0].explain, sm.fx.map((x) => x.currency)], ['보강한 요약', '참가자 감소', ['CAD', 'USD']], '승인 시점의 요약 · 설명이 정산 기록에 남음');

  // ---- E7. 엑셀 올리기와의 관계 — 외화 거래는 CAD 금액만 오가므로, 금액이 바뀐 줄만 CAD 로 돌아감
  const id2 = mkEvent('2026 수련회', false);
  line(id2, { kind: '지출', category: '식비', name: '식사', amount: 1000 });
  tx('ADM', id2, { date: d1, kind: '지출', lineId: 'B001', detail: '달러 지출', currency: 'USD', foreignAmount: 100, rate: 1.37 });
  tx('ADM', id2, { date: d1, kind: '지출', lineId: 'B001', detail: '엔 지출', currency: 'JPY', foreignAmount: 10000, rate: 0.0092 });
  const tpl = run((api) => api.budgetTemplateData('ADM', id2));
  const payloadOf = (t) => ({ format: t.format, eventId: t.event.id, version: t.event.version,
    lines: t.lines.map((l, i) => ({ row: i + 2, id: l.id, kind: l.kind, category: l.category, name: l.name, amount: l.amount, memo: l.memo })),
    txs: t.txs.map((x, i) => ({ row: i + 2, id: x.id, date: x.date, kind: x.kind, line: x.lineId, detail: x.detail, amount: x.amount, method: x.method, note: x.note })) });
  const same = payloadOf(tpl);
  run((api) => api.budgetImportApply('ADM', id2, same, {}));
  eq(get('ADM', id2).transactions.map((t) => t.currency), ['USD', 'JPY'], '같은 금액으로 다시 올리면 외화 정보 그대로');
  const edited = payloadOf(run((api) => api.budgetTemplateData('ADM', id2)));
  edited.txs[0].amount = 200;
  run((api) => api.budgetImportApply('ADM', id2, edited, {}));
  eq(get('ADM', id2).transactions.map((t) => [t.currency, t.amount]), [['CAD', 200], ['JPY', 92]], '엑셀에서 금액을 바꾼 외화 거래만 CAD 로 돌아감');

  // ---- E8. 행사를 지우면 상세 · 노트도 함께 지워짐
  notes('ADM', id2, { summary: '지울 요약' });
  run((api) => api.budgetDeleteEvent('ADM', id2));
  eq([rows('행사거래상세').filter((r) => r[0] === id2).length, rows('행사실적노트').filter((r) => r[0] === id2).length], [0, 0], '행사를 지우면 통화 · 영수증 상세와 노트도 지움');

  // ---- E9. 기존 시트는 열 하나도 안 바뀜
  const ph = (tab) => env.fake.values(env.legacy.id, tab)[0].length;
  eq([ph('행사예산'), ph('행사예산항목'), ph('행사거래'), ph('행사정산'), ph('행사이력'), ph('행사승인')], [16, 8, 13, 11, 5, 15], '기존 6개 시트의 열 수는 그대로');
  eq([ph('행사거래상세'), ph('행사실적노트')], [9, 6], '새 시트: 상세 9열 · 노트 6열');
  eq(rows('행사거래').filter((r) => r[1] && r[2]).every((r) => typeof r[6] === 'number' || !isNaN(Number(r[6]))), true, '행사거래.금액은 언제나 숫자(CAD)');
};

if (require.main === module) {
  const T = require('./test-step3');
  ['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });
  module.exports(T);
  process.exit(T.summary() ? 0 : 1);
}
