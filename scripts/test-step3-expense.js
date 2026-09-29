/** A. 지출환급신청서 — 교적 자동 입력 · 항목별 지출일 · Payable To · 옛 시트 호환 */
module.exports = function (T) {
  const { ok, eq, section, throws, newEnv, TODAY, addDays } = T;
  const PHONE = '4165551008';

  section('A. 지출환급신청서');
  const env = newEnv();
  const tok = env.run((api) => api.포털토큰_('정일반', PHONE, ''));
  ok(!!tok, '로그인 표(토큰)가 만들어진다');

  // A1. 교적 자동 입력
  const a = env.run((api) => api.getExpenseApplicant(tok));
  ok(a.ok === true, '표가 맞으면 신청자 정보를 돌려준다');
  eq([a.name, a.email, a.phone, a.engName], ['정일반', 'jung@example.com', '416-555-1008', 'Il Ban Jung'], '이름 · 이메일 · 연락처 · 영문이름은 교적 값');
  eq(env.run((api) => api.getExpenseApplicant('엉터리')).ok, false, '엉터리 표는 정보를 주지 않는다');
  eq(env.run((api) => api.getExpenseApplicant('')).ok, false, '표가 없으면 정보를 주지 않는다');
  ok(!('dept' in a), '부서/팀은 교적에서 채우지 않는다 (직접 선택)');

  // A2. 항목마다 지출일 — 머리 지출일은 가장 늦은 항목 날짜
  const d1 = addDays(TODAY, -10), d2 = addDays(TODAY, -3);
  const base = { agreed: true, approved: 'Yes', dept: '청년부', payableTo: 'Il Ban Jung', token: tok, draftId: 'draft-0001-aaaa',
    items: [
      { date: d1, detail: 'Snacks', beforeTax: 20, tax: 2.6, receipts: [{ id: 'r1', name: 'a.jpg', mime: 'image/jpeg' }] },
      { date: d2, detail: 'Drinks', beforeTax: 10, tax: 1.3, receipts: [{ id: 'r2', name: 'b.jpg', mime: 'image/jpeg' }] },
    ] };
  const r = env.run((api) => api.submitExpense(JSON.parse(JSON.stringify(base))));
  ok(r.ok && /^EXP-\d{4}-\d{3}$/.test(r.no), '신청이 접수된다 ' + r.no);
  eq(r.total, 33.9, '총액은 항목 합계');
  const 지출 = env.fake.values(env.legacy.id, '지출신청'), 항목 = env.fake.values(env.legacy.id, '지출항목');
  eq(지출[0][7], '지출일', '헤더 칸(지출일)은 그대로 남아 있다 — 기존 화면 호환');
  eq(지출[1][7], d2, '헤더 지출일 = 항목 날짜 중 가장 늦은 날');
  eq(항목[0].length >= 8 && 항목[0][7], '지출일', '지출항목 시트 맨 뒤에 지출일 칸이 생긴다');
  eq([항목[1][7], 항목[2][7]], [d1, d2], '항목별 지출일이 각 줄에 저장된다');
  eq([지출[1][3], 지출[1][4], 지출[1][5]], ['jung@example.com', '정일반', '416-555-1008'], '이메일 · 이름 · 연락처가 저장된다');
  eq(지출[1][12], 'Il Ban Jung', 'Payable To 저장');

  // A3. 교적 값이 우선 (브라우저가 보낸 이름은 무시), 직접 수정하면 입력값 존중
  const tampered = JSON.parse(JSON.stringify(base)); tampered.name = '남의이름'; tampered.email = 'evil@x.com'; tampered.phone = '000';
  const r3 = env.run((api) => api.submitExpense(tampered));
  const row3 = env.fake.values(env.legacy.id, '지출신청').find((x) => x[0] === r3.no);
  eq([row3[4], row3[3], row3[5]], ['정일반', 'jung@example.com', '416-555-1008'], '표가 있고 직접수정이 아니면 교적 값으로 덮어쓴다');
  const manual = JSON.parse(JSON.stringify(base)); manual.name = '홍대리'; manual.email = 'h@x.com'; manual.phone = '416-555-9999'; manual.applicantManual = true;
  const r4 = env.run((api) => api.submitExpense(manual));
  const row4 = env.fake.values(env.legacy.id, '지출신청').find((x) => x[0] === r4.no);
  eq([row4[4], row4[3]], ['홍대리', 'h@x.com'], '직접 수정한 경우 입력값을 쓴다');
  const anon = JSON.parse(JSON.stringify(base)); delete anon.token; anon.name = '손님'; anon.email = 'g@x.com'; anon.phone = '416-000-0000'; anon.payableTo = 'Guest Kim';
  const r5 = env.run((api) => api.submitExpense(anon));
  ok(r5.ok, '표 없이(공개 신청서) 예전처럼 직접 입력으로도 접수된다');
  const 수정본 = JSON.parse(JSON.stringify(base)); 수정본.payableTo = 'Patrick I. Jung';
  const r6 = env.run((api) => api.submitExpense(수정본));
  eq(env.fake.values(env.legacy.id, '지출신청').find((x) => x[0] === r6.no)[12], 'Patrick I. Jung', 'Payable To 는 교적 값과 달라도 그대로 저장');

  // A4. 검증
  const noDate = JSON.parse(JSON.stringify(base)); delete noDate.items[1].date;
  throws(() => env.run((api) => api.submitExpense(noDate)), /항목 2의 지출일/, '항목에 날짜가 없으면 그 항목 번호와 함께 거절');
  const future = JSON.parse(JSON.stringify(base)); future.items[0].date = addDays(TODAY, 2);
  throws(() => env.run((api) => api.submitExpense(future)), /항목 1의 지출일이 오늘보다 뒤/, '미래 날짜 거절');
  const badFmt = JSON.parse(JSON.stringify(base)); badFmt.items[0].date = '2026/09/01';
  throws(() => env.run((api) => api.submitExpense(badFmt)), /지출일/, '형식이 틀린 날짜 거절');
  const noPay = JSON.parse(JSON.stringify(base)); noPay.payableTo = '';
  throws(() => env.run((api) => api.submitExpense(noPay)), /Payable/, 'Payable To 는 여전히 필수');

  // A5. 옛 신청서 화면(머리 지출일만 보냄)과의 호환
  const old = JSON.parse(JSON.stringify(base)); old.spentAt = d1; old.items.forEach((it) => delete it.date);
  const r7 = env.run((api) => api.submitExpense(old));
  ok(r7.ok, '옛 화면(머리 지출일만)도 접수된다');
  const one = env.run((api) => api.getExpenses('ADM')).list.find((e) => e.no === r7.no);
  eq(one.items.map((i) => i.date), [d1, d1], '옛 방식은 그 날짜가 모든 항목에 들어간다');

  // A6. 조회 · 내보내기 · 메일
  const list = env.run((api) => api.getExpenses('ADM')).list;
  const mine = list.find((e) => e.no === r.no);
  eq(mine.items.map((i) => i.date), [d1, d2], '조회 결과 항목에 date 가 실린다');
  eq(mine.spentAt, d2, '조회 결과 spentAt 은 가장 늦은 날짜');
  const ex = env.run((api) => api.exportExpenses('ADM', [r.no]));
  ok(ex && ex.b64, '엑셀(또는 CSV) 내보내기 동작');

  // A7. 회계팀 직접 입력
  const ce = env.run((api) => api.createExpense('ADM', { name: '오팀장', dept: '청년부', payableTo: 'Team Oh', status: 'In Review',
    items: [{ date: d1, detail: 'Cash', beforeTax: 5, tax: 0, receipts: [] }] }));
  ok(ce.ok, '회계팀 직접 입력도 항목별 날짜로 저장');
  throws(() => env.run((api) => api.createExpense('WRONG', {})), /회계|권한|로그인/, '회계 열쇠가 틀리면 거절');

  // A8. 옛 시트(지출항목에 지출일 칸 없음, 옛 데이터 포함) 호환
  const legacyEnv = newEnv((tabs) => {
    tabs['지출신청'] = [['신청번호', '제출시각', '상태', '이메일', '신청자', '연락처', '부서/팀', '지출일', '지출내역', '세전금액', 'HST/GST', '총액', 'Payable To', '식사인원', '식사참석자', '지출사유', '영수증파일', '영수증폴더', '코멘트', '체크번호', '체크발행일', '회계메모', '처리자', '최종수정', '예산', '입력경로'],
      ['EXP-2025-001', '', 'Paid', 'o@x.com', '옛신청', '416', '청년부', '2025-11-02', 'Old', 10, 1.3, 11.3, 'Old Person', '', '', '', '', '', '', '', '', '', '', '', '', '신청서']];
    tabs['지출항목'] = [['신청번호', '순번', '지출내역', '세전금액', 'HST/GST', '합계', '영수증파일'], ['EXP-2025-001', 1, 'Old', 10, 1.3, 11.3, '']];
  });
  const oldList = legacyEnv.run((api) => api.getExpenses('ADM')).list;
  eq(oldList[0].items[0].date, '2025-11-02', '옛 항목(날짜 칸 없음)은 신청 머리의 지출일을 보여준다');
  const tok2 = legacyEnv.run((api) => api.포털토큰_('정일반', PHONE, ''));
  const r8 = legacyEnv.run((api) => api.submitExpense(Object.assign(JSON.parse(JSON.stringify(base)), { token: tok2 })));
  ok(r8.ok, '옛 시트에도 새 신청이 접수된다');
  const hd = legacyEnv.fake.values(legacyEnv.legacy.id, '지출항목');
  eq(hd[0][7], '지출일', '옛 시트에 지출일 칸이 자동으로 붙는다');
  eq(hd[1][7] === '' || hd[1][7] === undefined, true, '옛 줄은 건드리지 않는다');
};
