/**
 * 행사 예산 · 실적 · 정산 (Step 3) — 회계 모듈
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * app.js 의 도구(rows_ · sheet_ · 돈_ · 문서틀_ · PDF응답_ · 지출목록_ …)를 그대로 쓰고, 새 이름만 더합니다.
 *
 * ▣ 흐름
 *    ① 예산 만들기   행사를 만들고 항목별 예산(지출/수입)을 적습니다            → 행사예산 · 행사예산항목
 *    ② 거래 기록      쓴 돈 · 들어온 돈을 날짜 · 항목과 함께 적습니다 (엑셀 · 환급신청서에서 가져오기도 가능) → 행사거래
 *    ③ 정산          예산 대 실적을 확정해 "그 순간의 사진(스냅샷)"을 남기고 행사를 닫습니다 → 행사정산
 *    (모든 변경은 행사이력에 남습니다)
 *
 * ▣ 사람별 접근 — '사용자권한' 탭에 구분='회계' 줄로 저장 (logic/permissions.js 의 같은 표)
 *    이름 | 회계 | 행사ID 또는 * | 허용/차단 | 등급 | 만료일 | 메모
 *    등급  조회(1) < 입력(2) < 정산(3) < 관리(4)      * = 모든 행사
 *      조회  보기 · 엑셀/PDF 내려받기
 *      입력  거래 기록 · 수정 · 삭제 · 엑셀 올리기(거래) · 환급신청서 가져오기
 *      정산  정산 확정 · 정산 다시 열기
 *      관리  행사 만들기 · 예산 항목 · 접근 권한 주기
 *    차단은 언제나 허용보다 우선합니다. 관리자키 · 회계팀 키 · 회계 권한이 있는 팀 계정은 모든 행사의 "관리"입니다.
 *    기본으로 커미티 · 회계팀 역할은 "조회"만 됩니다 (더 큰 권한은 위 표에 적어야 함).
 *    ※ 모든 서버 함수는 맨 앞 인자 key 로 이 사람의 등급을 다시 확인합니다 — 화면에서 버튼을 숨기는 것에 기대지 않습니다.
 *
 * ▣ 엑셀 왕복 — 내려받기(현재 값 + 버전) → 고치기 → 올리기(미리보기 → 적용).
 *    같은 ID 는 고치고, ID 가 없는 줄은 새로 만들고, 내려받은 뒤 누가 고쳤으면(버전이 다르면) 경고합니다.
 *    엑셀 파일을 만들고 읽는 일은 브라우저(public/budget/xlsx-io.js)가 하고, 서버는 JSON 만 받아 검증 · 저장합니다.
 */

var SHEET_행사예산 = '행사예산';
var SHEET_행사항목 = '행사예산항목';
var SHEET_행사거래 = '행사거래';
var SHEET_행사정산 = '행사정산';
var SHEET_행사이력 = '행사이력';

var HEAD_행사예산 = ['행사ID', '행사명', '연도', '부서/팀', '담당자', '상태', '시작일', '종료일', '메모', '버전',
                     '등록자', '등록시각', '수정시각', '정산시각', '정산자', '정산메모'];
var EVB_ID = 0, EVB_이름 = 1, EVB_연도 = 2, EVB_부서 = 3, EVB_담당 = 4, EVB_상태 = 5, EVB_시작 = 6, EVB_종료 = 7,
    EVB_메모 = 8, EVB_버전 = 9, EVB_등록자 = 10, EVB_등록 = 11, EVB_수정 = 12, EVB_정산시각 = 13, EVB_정산자 = 14, EVB_정산메모 = 15;

var HEAD_행사항목 = ['행사ID', '항목ID', '구분', '분류', '항목명', '예산액', '메모', '순번'];
var EVL_행사 = 0, EVL_ID = 1, EVL_구분 = 2, EVL_분류 = 3, EVL_이름 = 4, EVL_금액 = 5, EVL_메모 = 6, EVL_순번 = 7;

var HEAD_행사거래 = ['행사ID', '거래ID', '날짜', '구분', '항목ID', '내용', '금액', '결제수단', '증빙메모', '지출신청번호',
                     '입력자', '입력시각', '수정시각'];
var EVT_행사 = 0, EVT_ID = 1, EVT_날짜 = 2, EVT_구분 = 3, EVT_항목 = 4, EVT_내용 = 5, EVT_금액 = 6, EVT_수단 = 7,
    EVT_증빙 = 8, EVT_신청 = 9, EVT_입력자 = 10, EVT_입력 = 11, EVT_수정 = 12;

var HEAD_행사정산 = ['행사ID', '정산번호', '확정시각', '확정자', '메모', '예산지출', '실지출', '예산수입', '실수입', '순손익', '스냅샷'];
var EVS_행사 = 0, EVS_번호 = 1, EVS_시각 = 2, EVS_확정자 = 3, EVS_메모 = 4, EVS_예산지출 = 5, EVS_실지출 = 6,
    EVS_예산수입 = 7, EVS_실수입 = 8, EVS_순손익 = 9, EVS_스냅샷 = 10;

var HEAD_행사이력 = ['행사ID', '시각', '사람', '동작', '내용'];

var 행사상태들_ = ['예산작성', '진행중', '정산완료'];
var 행사구분들_ = ['지출', '수입'];
var 회계등급값_ = { '조회': 1, '입력': 2, '정산': 3, '관리': 4 };
var 회계등급이름_ = ['', '조회', '입력', '정산', '관리'];
var 행사결제수단_ = ['카드', '현금', '체크(수표)', '이체', '환급(수표)', '기타'];
var 행사미분류_ = '(미분류)';

/* ---------------------------------------------------------------- 시트 준비 · 읽기 */

function 행사시트_(name, head) {
  var sh = sheet_(name);
  if (!sh) {
    createSheet_(SpreadsheetApp.getActiveSpreadsheet(), name, head);
    캐시비움_();
    sh = sheet_(name);
  }
  return sh;
}

function 행사표_(name) { return rows_(name); }

function 행사시각_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }

/** 헤더 행사ID · 행사명이 있는 줄만 → 객체 */
function 예산행사목록_() {
  return 행사표_(SHEET_행사예산).filter(function (r) { return String(r[EVB_ID] || '').trim(); }).map(행사변환_);
}

function 행사변환_(r) {
  var 상태 = String(r[EVB_상태] || '').trim();
  return {
    id: String(r[EVB_ID]).trim(), name: String(r[EVB_이름] || '').trim(), year: String(r[EVB_연도] || '').trim(),
    dept: String(r[EVB_부서] || '').trim(), owner: String(r[EVB_담당] || '').trim(),
    status: 행사상태들_.indexOf(상태) !== -1 ? 상태 : '예산작성',
    start: 날짜문자열_(r[EVB_시작]), end: 날짜문자열_(r[EVB_종료]), memo: String(r[EVB_메모] || '').trim(),
    version: parseInt(r[EVB_버전], 10) || 1,
    createdBy: String(r[EVB_등록자] || '').trim(), createdAt: String(r[EVB_등록] || '').trim(),
    updatedAt: String(r[EVB_수정] || '').trim(),
    settledAt: String(r[EVB_정산시각] || '').trim(), settledBy: String(r[EVB_정산자] || '').trim(),
    settleMemo: String(r[EVB_정산메모] || '').trim()
  };
}

function 예산행사찾기_(id) {
  id = String(id || '').trim();
  if (!id) return null;
  return 예산행사목록_().filter(function (e) { return e.id === id; })[0] || null;
}

function 행사항목들_(eventId) {
  return 행사표_(SHEET_행사항목).filter(function (r) { return String(r[EVL_행사]).trim() === eventId && String(r[EVL_ID]).trim(); })
    .map(function (r) {
      return { id: String(r[EVL_ID]).trim(), kind: String(r[EVL_구분] || '지출').trim() === '수입' ? '수입' : '지출',
        category: String(r[EVL_분류] || '').trim(), name: String(r[EVL_이름] || '').trim(), amount: 돈_(r[EVL_금액]),
        memo: String(r[EVL_메모] || '').trim(), order: parseInt(r[EVL_순번], 10) || 0 };
    })
    .sort(function (a, b) { return a.order - b.order || (a.id < b.id ? -1 : 1); });
}

function 행사거래들_(eventId) {
  return 행사표_(SHEET_행사거래).filter(function (r) { return String(r[EVT_행사]).trim() === eventId && String(r[EVT_ID]).trim(); })
    .map(function (r) {
      return { id: String(r[EVT_ID]).trim(), date: 날짜문자열_(r[EVT_날짜]),
        kind: String(r[EVT_구분] || '지출').trim() === '수입' ? '수입' : '지출',
        lineId: String(r[EVT_항목] || '').trim(), detail: String(r[EVT_내용] || '').trim(), amount: 돈_(r[EVT_금액]),
        method: String(r[EVT_수단] || '').trim(), note: String(r[EVT_증빙] || '').trim(),
        expNo: String(r[EVT_신청] || '').trim(), by: String(r[EVT_입력자] || '').trim(),
        at: String(r[EVT_입력] || '').trim(), updatedAt: String(r[EVT_수정] || '').trim() };
    })
    .sort(function (a, b) { return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.id < b.id ? -1 : 1); });
}

function 행사정산들_(eventId) {
  return 행사표_(SHEET_행사정산).filter(function (r) { return String(r[EVS_행사]).trim() === eventId; }).map(function (r) {
    var snap = null;
    try { snap = JSON.parse(String(r[EVS_스냅샷] || '') || 'null'); } catch (e) { snap = null; }
    return { no: String(r[EVS_번호] || '').trim(), at: String(r[EVS_시각] || '').trim(), by: String(r[EVS_확정자] || '').trim(),
      memo: String(r[EVS_메모] || '').trim(), budgetExpense: 돈_(r[EVS_예산지출]), actualExpense: 돈_(r[EVS_실지출]),
      budgetIncome: 돈_(r[EVS_예산수입]), actualIncome: 돈_(r[EVS_실수입]), net: 돈_(r[EVS_순손익]), snapshot: snap };
  });
}

/* ---------------------------------------------------------------- 접근 권한 (사람별 · 행사별) */

/** key → 이 요청을 한 주체. 관리자키 · 회계팀 키 · 회계 팀 계정은 full, 포털 로그인 사람은 개인 회계 줄로 판정 */
function 회계주체_(key) {
  key = String(key || '').trim();
  if (!key) return null;
  if (마스터_(key)) return { full: true, name: '마스터', kind: 'master' };
  if (isAdmin_(key)) return { full: true, name: '관리자', kind: 'admin' };
  var ta = 팀계정찾기_(key);
  if (ta && ta.menus.indexOf('acct') !== -1) return { full: true, name: ta.name, kind: 'team-account' };
  var k = 설정값_('회계팀키');
  if (k && key === k) return { full: true, name: '회계팀', kind: 'acct-key' };
  var me = null;
  try { me = 포털본인_(key); } catch (e) { me = null; }
  if (!me) return null;
  return { full: false, name: me.name, kind: 'person' };
}

function 회계주체필수_(key) {
  var s = 회계주체_(key);
  if (!s) throw new Error('회계 권한이 없습니다. 다시 로그인해주세요.');
  return s;
}

/**
 * 이 주체가 이 행사(또는 '*')에서 갖는 등급 → { level, by }
 *  차단(행사 또는 *) → 0 / 개인 줄의 가장 높은 등급 / 기본(커미티 · 회계팀 역할) 조회
 */
function 회계등급_(s, eventId) {
  if (!s) return { level: 0, by: 'none' };
  if (s.full) return { level: 4, by: s.kind };
  eventId = String(eventId || '*').trim() || '*';
  var rows = 개인권한_(s.name).acct || [], best = 0, by = 'none';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.target !== '*' && r.target !== eventId) continue;
    if (r.effect === '차단') return { level: 0, by: 'deny' };
    var lv = 회계등급값_[r.scope] || 0;
    if (lv > best) { best = lv; by = r.target === '*' ? 'allow-all' : 'allow'; }
  }
  if (best < 1) {
    var 역할 = 포털역할_(s.name).roles;
    if (역할.indexOf('회계팀') !== -1 || (역할.indexOf('커미티') !== -1 && 전체커미티인가_(s.name))) { best = 1; by = 'role'; }
  }
  return { level: best, by: by };
}

/** 최소 등급을 못 채우면 이유와 함께 막습니다. 통과하면 { subject, level } */
function 회계필수_(key, eventId, min, 하는일) {
  var s = 회계주체필수_(key);
  var g = 회계등급_(s, eventId);
  if (g.level < min) {
    throw new Error((하는일 || '이 작업') + '은(는) 회계 "' + 회계등급이름_[min] + '" 권한이 필요합니다' +
      (g.level ? ' (지금 등급: ' + 회계등급이름_[g.level] + ')' : (g.by === 'deny' ? ' (이 행사는 접근이 차단되어 있습니다)' : '')) + '.');
  }
  return { subject: s, level: g.level };
}

function 행사필수_(id) {
  var ev = 예산행사찾기_(id);
  if (!ev) throw new Error('행사를 찾을 수 없습니다.');
  return ev;
}

function 행사열려있어야_(ev) {
  if (ev.status === '정산완료') {
    throw new Error('정산이 끝난 행사입니다. 고치려면 정산 권한자가 "정산 다시 열기"를 먼저 해주세요.');
  }
}

/* ---------------------------------------------------------------- 쓰기 도구 */

function 행사이력_(eventId, who, action, text) {
  try {
    var sh = 행사시트_(SHEET_행사이력, HEAD_행사이력);
    sh.appendRow([eventId, 행사시각_(), who, action, String(text || '').slice(0, 500)]);
    sh.getRange(sh.getLastRow(), 2).setNumberFormat('@').setValue(행사시각_());
  } catch (e) {}
}

/** 한 시트의 자료 줄(머리 제외)을 통째로 바꿔 씁니다 — 잠금 안에서만 부릅니다 */
function 행사표쓰기_(name, head, rows, textCols) {
  var sh = 행사시트_(name, head);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
  if (rows.length) {
    var rg = sh.getRange(2, 1, rows.length, head.length);
    (textCols || []).forEach(function (c) { sh.getRange(2, c + 1, rows.length, 1).setNumberFormat('@'); });
    rg.setValues(rows);
  }
  캐시비움_();
}

function 행사올림_(eventId, who) {
  // 버전을 1 올려 "내려받은 엑셀이 낡았는지" 알아볼 수 있게 합니다
  var sh = 행사시트_(SHEET_행사예산, HEAD_행사예산), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][EVB_ID]).trim() !== eventId) continue;
    var ver = (parseInt(v[i][EVB_버전], 10) || 1) + 1;
    sh.getRange(i + 1, EVB_버전 + 1).setValue(ver);
    sh.getRange(i + 1, EVB_수정 + 1).setNumberFormat('@').setValue(행사시각_());
    return ver;
  }
  return 0;
}

function 행사날짜검사_(s, 이름, 미래허용) {
  s = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T00:00:00').getTime())) throw new Error(이름 + '을(를) 날짜(2026-09-30)로 적어주세요.');
  if (!미래허용 && s > ymd_(new Date())) throw new Error(이름 + '이(가) 오늘보다 뒤입니다.');
  return s;
}

function 행사금액검사_(v, 이름, 음수허용) {
  var n = 돈_(v);
  if (String(v == null ? '' : v).trim() === '' ) throw new Error(이름 + '을(를) 적어주세요.');
  if (!음수허용 && n < 0) throw new Error(이름 + '은(는) 0 이상이어야 합니다.');
  if (n > 100000000) throw new Error(이름 + '이(가) 너무 큽니다.');
  return n;
}

function 다음번호_(ids, prefix) {
  var max = 0;
  ids.forEach(function (id) {
    var m = String(id).match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  var n = String(max + 1);
  while (n.length < 3) n = '0' + n;
  return prefix + n;
}

/* ---------------------------------------------------------------- 집계 (예산 대 실적) */

/**
 * 한 행사의 예산 · 실적 · 차이. 항목 → 실적은 해시 맵으로 한 번에 모읍니다 (O(항목 + 거래)).
 * 지출 항목: diff = 예산 − 실적 (양수면 남음)   /   수입 항목: diff = 실적 − 예산 (양수면 목표 초과)
 */
function 행사집계_(lines, txs) {
  var sum = {};
  var 미분류 = { 지출: 0, 수입: 0, count: 0 };
  var lineById = {};
  lines.forEach(function (l) { lineById[l.id] = l; sum[l.id] = { n: 0, sum: 0 }; });
  txs.forEach(function (t) {
    var l = lineById[t.lineId];
    if (l && l.kind === t.kind) { sum[l.id].sum += t.amount; sum[l.id].n++; }
    else { 미분류[t.kind] += t.amount; 미분류.count++; }
  });
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var out = lines.map(function (l) {
    var a = r2(sum[l.id].sum);
    return { id: l.id, kind: l.kind, category: l.category, name: l.name, budget: l.amount, actual: a, count: sum[l.id].n,
      diff: l.kind === '지출' ? r2(l.amount - a) : r2(a - l.amount),
      rate: l.amount ? Math.round((a / l.amount) * 100) : null,
      over: l.kind === '지출' ? a > l.amount : false, memo: l.memo, order: l.order };
  });
  var tot = { budgetExpense: 0, actualExpense: 0, budgetIncome: 0, actualIncome: 0 };
  out.forEach(function (x) {
    if (x.kind === '지출') { tot.budgetExpense += x.budget; tot.actualExpense += x.actual; }
    else { tot.budgetIncome += x.budget; tot.actualIncome += x.actual; }
  });
  tot.actualExpense += 미분류.지출; tot.actualIncome += 미분류.수입;
  Object.keys(tot).forEach(function (k) { tot[k] = r2(tot[k]); });
  tot.plannedNet = r2(tot.budgetIncome - tot.budgetExpense);
  tot.actualNet = r2(tot.actualIncome - tot.actualExpense);
  tot.expenseRemaining = r2(tot.budgetExpense - tot.actualExpense);
  tot.expenseRate = tot.budgetExpense ? Math.round((tot.actualExpense / tot.budgetExpense) * 100) : null;
  tot.overBudget = tot.budgetExpense > 0 && tot.actualExpense > tot.budgetExpense;
  return { lines: out, unassigned: { expense: r2(미분류.지출), income: r2(미분류.수입), count: 미분류.count }, totals: tot };
}

function 행사요약_(ev, lines, txs, level) {
  var g = 행사집계_(lines, txs);
  var f0 = 승인행_(ev.id);          // Step 8 — 승인 절차를 쓰는 행사면 단계 (없으면 옛 행사)
  return { id: ev.id, name: ev.name, year: ev.year, dept: ev.dept, owner: ev.owner, status: ev.status, start: ev.start, end: ev.end,
    version: ev.version, level: level, levelName: 회계등급이름_[level], totals: g.totals, unassignedCount: g.unassigned.count,
    txCount: txs.length, lineCount: lines.length, managed: !!f0, stage: f0 ? f0.stage : '' };
}

/* ---------------------------------------------------------------- 화면용 서버 함수 */

/** 회계 화면 첫 자료 — 내가 볼 수 있는 행사만 */
function budgetInit(key) {
  var s = 회계주체필수_(key);
  var 전체 = 회계등급_(s, '*');
  var 항목표 = 행사표_(SHEET_행사항목), 거래표 = 행사표_(SHEET_행사거래);
  // 행사별로 묶어 두고 한 번만 훑습니다
  var linesBy = {}, txBy = {};
  항목표.forEach(function (r) { var id = String(r[EVL_행사]).trim(); if (id && String(r[EVL_ID]).trim()) (linesBy[id] = linesBy[id] || []).push(r); });
  거래표.forEach(function (r) { var id = String(r[EVT_행사]).trim(); if (id && String(r[EVT_ID]).trim()) (txBy[id] = txBy[id] || []).push(r); });
  var events = [];
  예산행사목록_().forEach(function (ev) {
    var g = 회계등급_(s, ev.id);
    if (g.level < 1) return;
    var lines = (linesBy[ev.id] || []).map(행사항목변환_), txs = (txBy[ev.id] || []).map(행사거래변환_);
    events.push(행사요약_(ev, lines, txs, g.level));
  });
  events.sort(function (a, b) { return (b.year || '').localeCompare(a.year || '') || (a.name < b.name ? -1 : 1); });
  return {
    me: { name: s.name, full: !!s.full, kind: s.kind, canCreate: 전체.level >= 4, globalLevel: 전체.level },
    events: events, depts: 지출부서목록(), statuses: 행사상태들_, stages: 승인단계들_.map(function (s) { return { key: s, name: 승인단계이름_[s] }; }), methods: 행사결제수단_, today: ymd_(new Date()),
    pdfKinds: [{ key: 'budget', title: '예산서' }, { key: 'transactions', title: '거래 내역' }, { key: 'settlement', title: '정산서' }]
  };
}

function 행사항목변환_(r) {
  return { id: String(r[EVL_ID]).trim(), kind: String(r[EVL_구분] || '지출').trim() === '수입' ? '수입' : '지출',
    category: String(r[EVL_분류] || '').trim(), name: String(r[EVL_이름] || '').trim(), amount: 돈_(r[EVL_금액]),
    memo: String(r[EVL_메모] || '').trim(), order: parseInt(r[EVL_순번], 10) || 0 };
}
function 행사거래변환_(r) {
  return { id: String(r[EVT_ID]).trim(), date: 날짜문자열_(r[EVT_날짜]), kind: String(r[EVT_구분] || '지출').trim() === '수입' ? '수입' : '지출',
    lineId: String(r[EVT_항목] || '').trim(), detail: String(r[EVT_내용] || '').trim(), amount: 돈_(r[EVT_금액]) };
}

/** 한 행사의 전체 — 헤더 · 항목 · 거래 · 집계 · 정산 기록 */
function budgetGetEvent(key, eventId) {
  var c = 회계필수_(key, eventId, 1, '행사 보기');
  var ev = 행사필수_(eventId);
  var lines = 행사항목들_(ev.id), txs = 행사거래들_(ev.id);
  var g = 행사집계_(lines, txs);
  var f = 승인행_(ev.id);           // Step 8 — 없으면 승인 절차를 쓰지 않는 옛 행사 (아래 can 은 예전 그대로)
  return { event: ev, level: c.level, levelName: 회계등급이름_[c.level], lines: g.lines, transactions: txs, unassigned: g.unassigned,
    totals: g.totals, settlements: 행사정산들_(ev.id).map(function (s) { return { no: s.no, at: s.at, by: s.by, memo: s.memo, net: s.net,
      budgetExpense: s.budgetExpense, actualExpense: s.actualExpense, budgetIncome: s.budgetIncome, actualIncome: s.actualIncome }; }),
    can: { edit: c.level >= 2 && ev.status !== '정산완료' && 거래열림_(f), manage: c.level >= 4 && ev.status !== '정산완료',
      lines: c.level >= 4 && ev.status !== '정산완료' && 예산열림_(f), settle: c.level >= 3,
      reopen: c.level >= 3 && ev.status === '정산완료', access: c.level >= 4 },
    flow: 흐름정보_(ev, f, c.level, c.subject) };
}

/** 행사 만들기 · 고치기 (관리) */
function budgetSaveEvent(key, data) {
  data = data || {};
  var id = String(data.id || '').trim();
  var c = 회계필수_(key, id || '*', 4, id ? '행사 정보 고치기' : '행사 만들기');
  var name = String(data.name || '').trim().slice(0, 80);
  if (!name) throw new Error('행사 이름을 적어주세요.');
  var year = String(data.year || '').trim() || String(new Date().getFullYear());
  if (!/^\d{4}$/.test(year)) throw new Error('연도는 2026 같은 4자리 숫자로 적어주세요.');
  var start = String(data.start || '').trim(), end = String(data.end || '').trim();
  if (start) 행사날짜검사_(start, '시작일', true);
  if (end) 행사날짜검사_(end, '종료일', true);
  if (start && end && end < start) throw new Error('종료일이 시작일보다 앞입니다.');
  var dept = String(data.dept || '').trim().slice(0, 60), owner = String(data.owner || '').trim().slice(0, 40);
  var memo = String(data.memo || '').trim().slice(0, 500);
  if (owner && !교적맵_()[owner]) throw new Error('담당자는 교적에 있는 이름이어야 합니다: ' + owner);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 행사시트_(SHEET_행사예산, HEAD_행사예산), v = sh.getDataRange().getValues(), now = 행사시각_();
    var dup = 예산행사목록_().some(function (e) { return e.name === name && e.year === year && e.id !== id; });
    if (dup) throw new Error(year + '년에 같은 이름의 행사가 이미 있습니다.');
    if (!id) {
      // 행사 번호는 연도별로 1번부터 (EV-2026-001)
      var max = 0;
      v.slice(1).forEach(function (r) {
        var m = String(r[EVB_ID]).match(/^EV-(\d{4})-(\d+)$/);
        if (m && m[1] === year) max = Math.max(max, parseInt(m[2], 10));
      });
      var n = String(max + 1); while (n.length < 3) n = '0' + n;
      id = 'EV-' + year + '-' + n;
      var row = [id, name, year, dept, owner, '예산작성', start, end, memo, 1, c.subject.name, now, now, '', '', ''];
      sh.appendRow(row);
      var at = sh.getLastRow();
      [EVB_시작, EVB_종료, EVB_등록, EVB_수정].forEach(function (col) { sh.getRange(at, col + 1).setNumberFormat('@'); });
      sh.getRange(at, 1, 1, row.length).setValues([row]);
      행사이력_(id, c.subject.name, '행사 만들기', name);
      if (흐름켜기요청_(data.workflow)) 흐름시작_(id, c.subject.name, 'Draft');   // Step 8 — 회계 승인 절차 사용
    } else {
      var i;
      for (i = 1; i < v.length; i++) if (String(v[i][EVB_ID]).trim() === id) break;
      if (i >= v.length) throw new Error('행사를 찾을 수 없습니다.');
      if (String(v[i][EVB_상태]).trim() === '정산완료') 행사열려있어야_({ status: '정산완료' });
      var st = String(data.status || v[i][EVB_상태] || '예산작성').trim();
      if (행사상태들_.indexOf(st) === -1 || st === '정산완료') st = String(v[i][EVB_상태] || '예산작성').trim();   // 정산완료는 정산 확정으로만
      var ver = (parseInt(v[i][EVB_버전], 10) || 1) + 1;
      var upd = [id, name, year, dept, owner, st, start, end, memo, ver, v[i][EVB_등록자], v[i][EVB_등록], now, v[i][EVB_정산시각], v[i][EVB_정산자], v[i][EVB_정산메모]];
      [EVB_시작, EVB_종료, EVB_등록, EVB_수정].forEach(function (col) { sh.getRange(i + 1, col + 1).setNumberFormat('@'); });
      sh.getRange(i + 1, 1, 1, upd.length).setValues([upd]);
      행사이력_(id, c.subject.name, '행사 정보 고침', name);
    }
    캐시비움_();
  } finally { lock.releaseLock(); }
  return budgetGetEvent(key, id);
}

function budgetDeleteEvent(key, eventId) {
  var c = 회계필수_(key, eventId, 4, '행사 지우기');
  var ev = 행사필수_(eventId);
  if (ev.status === '정산완료') throw new Error('정산이 끝난 행사는 지울 수 없습니다. (정산 다시 열기 후 지우세요)');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var pick = function (name, head, col) {
      return 행사표_(name).filter(function (r) { return String(r[col]).trim() !== ev.id; });
    };
    행사표쓰기_(SHEET_행사예산, HEAD_행사예산, pick(SHEET_행사예산, HEAD_행사예산, EVB_ID), [EVB_시작, EVB_종료, EVB_등록, EVB_수정]);
    행사표쓰기_(SHEET_행사항목, HEAD_행사항목, pick(SHEET_행사항목, HEAD_행사항목, EVL_행사));
    행사표쓰기_(SHEET_행사거래, HEAD_행사거래, pick(SHEET_행사거래, HEAD_행사거래, EVT_행사), [EVT_날짜, EVT_입력, EVT_수정]);
    승인행지우기_(ev.id);
    행사이력_(ev.id, c.subject.name, '행사 지움', ev.name);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/** 예산 항목 한 줄 저장 (관리) */
function budgetSaveLine(key, eventId, line) {
  var c = 회계필수_(key, eventId, 4, '예산 항목 고치기');
  var ev = 행사필수_(eventId); 행사열려있어야_(ev); 예산잠금확인_(ev);
  line = line || {};
  var kind = String(line.kind || '지출').trim();
  if (행사구분들_.indexOf(kind) === -1) throw new Error('구분은 지출 또는 수입입니다.');
  var name = String(line.name || '').trim().slice(0, 80);
  if (!name) throw new Error('항목 이름을 적어주세요.');
  var amount = 행사금액검사_(line.amount, '예산액');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 행사시트_(SHEET_행사항목, HEAD_행사항목), v = sh.getDataRange().getValues();
    var mine = [], at = 0, id = String(line.id || '').trim();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][EVL_행사]).trim() !== ev.id) continue;
      mine.push(v[i]);
      if (id && String(v[i][EVL_ID]).trim() === id) at = i + 1;
      if (String(v[i][EVL_이름]).trim() === name && String(v[i][EVL_구분]).trim() === kind && String(v[i][EVL_ID]).trim() !== id) {
        throw new Error('같은 이름의 ' + kind + ' 항목이 이미 있습니다: ' + name);
      }
    }
    if (id && !at) throw new Error('예산 항목을 찾을 수 없습니다.');
    var row;
    if (at) {
      row = [ev.id, id, kind, String(line.category || '').trim().slice(0, 40), name, amount, String(line.memo || '').trim().slice(0, 200), v[at - 1][EVL_순번]];
      sh.getRange(at, 1, 1, row.length).setValues([row]);
    } else {
      id = 다음번호_(mine.map(function (r) { return r[EVL_ID]; }), 'B');
      var order = mine.reduce(function (m, r) { return Math.max(m, parseInt(r[EVL_순번], 10) || 0); }, 0) + 1;
      row = [ev.id, id, kind, String(line.category || '').trim().slice(0, 40), name, amount, String(line.memo || '').trim().slice(0, 200), order];
      sh.appendRow(row);
    }
    캐시비움_();
    행사올림_(ev.id, c.subject.name);
    행사이력_(ev.id, c.subject.name, at ? '예산 항목 고침' : '예산 항목 추가', kind + ' · ' + name + ' · ' + amount);
    캐시비움_();
  } finally { lock.releaseLock(); }
  return budgetGetEvent(key, eventId);
}

function budgetDeleteLine(key, eventId, lineId) {
  var c = 회계필수_(key, eventId, 4, '예산 항목 지우기');
  var ev = 행사필수_(eventId); 행사열려있어야_(ev); 예산잠금확인_(ev);
  lineId = String(lineId || '').trim();
  var used = 행사거래들_(ev.id).filter(function (t) { return t.lineId === lineId; }).length;
  if (used) throw new Error('이 항목에 거래가 ' + used + '건 있습니다. 거래의 항목을 바꾸거나 지운 뒤 지워주세요.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var all = 행사표_(SHEET_행사항목);
    var keep = all.filter(function (r) { return !(String(r[EVL_행사]).trim() === ev.id && String(r[EVL_ID]).trim() === lineId); });
    if (keep.length === all.length) throw new Error('예산 항목을 찾을 수 없습니다.');
    행사표쓰기_(SHEET_행사항목, HEAD_행사항목, keep);
    행사올림_(ev.id, c.subject.name);
    행사이력_(ev.id, c.subject.name, '예산 항목 지움', lineId);
    캐시비움_();
  } finally { lock.releaseLock(); }
  return budgetGetEvent(key, eventId);
}

/** 거래 한 건 저장 (입력) */
function budgetSaveTx(key, eventId, tx) {
  var c = 회계필수_(key, eventId, 2, '거래 기록');
  var ev = 행사필수_(eventId); 행사열려있어야_(ev); 거래잠금확인_(ev);
  tx = tx || {};
  var kind = String(tx.kind || '지출').trim();
  if (행사구분들_.indexOf(kind) === -1) throw new Error('구분은 지출 또는 수입입니다.');
  var date = 행사날짜검사_(tx.date, '거래 날짜');
  var amount = 행사금액검사_(tx.amount, '금액');
  if (amount <= 0) throw new Error('금액은 0보다 커야 합니다.');
  var detail = String(tx.detail || '').trim().slice(0, 200);
  if (!detail) throw new Error('거래 내용을 적어주세요.');
  var lineId = String(tx.lineId || '').trim();
  if (lineId) {
    var ln = 행사항목들_(ev.id).filter(function (l) { return l.id === lineId; })[0];
    if (!ln) throw new Error('예산 항목을 찾을 수 없습니다: ' + lineId);
    if (ln.kind !== kind) throw new Error('예산 항목(' + ln.name + ')의 구분(' + ln.kind + ')과 거래 구분(' + kind + ')이 다릅니다.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 행사시트_(SHEET_행사거래, HEAD_행사거래), v = sh.getDataRange().getValues(), now = 행사시각_();
    var id = String(tx.id || '').trim(), at = 0, mine = [];
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][EVT_행사]).trim() !== ev.id) continue;
      mine.push(v[i]);
      if (id && String(v[i][EVT_ID]).trim() === id) at = i + 1;
    }
    if (id && !at) throw new Error('거래를 찾을 수 없습니다.');
    var row;
    if (at) {
      var old = v[at - 1];
      row = [ev.id, id, date, kind, lineId, detail, amount, String(tx.method || '').trim().slice(0, 30), String(tx.note || '').trim().slice(0, 200),
        String(old[EVT_신청] || ''), old[EVT_입력자], old[EVT_입력], now];
      sh.getRange(at, EVT_날짜 + 1).setNumberFormat('@');
      sh.getRange(at, 1, 1, row.length).setValues([row]);
    } else {
      id = 다음번호_(mine.map(function (r) { return r[EVT_ID]; }), 'T');
      row = [ev.id, id, date, kind, lineId, detail, amount, String(tx.method || '').trim().slice(0, 30), String(tx.note || '').trim().slice(0, 200),
        String(tx.expNo || '').trim(), c.subject.name, now, now];
      sh.appendRow(row);
      var last = sh.getLastRow();
      sh.getRange(last, EVT_날짜 + 1).setNumberFormat('@').setValue(date);
      sh.getRange(last, EVT_입력 + 1, 1, 2).setNumberFormat('@').setValues([[now, now]]);
    }
    캐시비움_();
    행사올림_(ev.id, c.subject.name);
    if (ev.status === '예산작성') 행사상태바꿈_(ev.id, '진행중');
    행사이력_(ev.id, c.subject.name, at ? '거래 고침' : '거래 기록', id + ' · ' + kind + ' · ' + amount + ' · ' + detail);
    캐시비움_();
  } finally { lock.releaseLock(); }
  return budgetGetEvent(key, eventId);
}

function 행사상태바꿈_(eventId, status) {
  var sh = 행사시트_(SHEET_행사예산, HEAD_행사예산), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][EVB_ID]).trim() === eventId) { sh.getRange(i + 1, EVB_상태 + 1).setValue(status); return; }
}

function budgetDeleteTx(key, eventId, txId) {
  var c = 회계필수_(key, eventId, 2, '거래 지우기');
  var ev = 행사필수_(eventId); 행사열려있어야_(ev); 거래잠금확인_(ev);
  txId = String(txId || '').trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var all = 행사표_(SHEET_행사거래);
    var keep = all.filter(function (r) { return !(String(r[EVT_행사]).trim() === ev.id && String(r[EVT_ID]).trim() === txId); });
    if (keep.length === all.length) throw new Error('거래를 찾을 수 없습니다.');
    행사표쓰기_(SHEET_행사거래, HEAD_행사거래, keep, [EVT_날짜, EVT_입력, EVT_수정]);
    행사올림_(ev.id, c.subject.name);
    행사이력_(ev.id, c.subject.name, '거래 지움', txId);
    캐시비움_();
  } finally { lock.releaseLock(); }
  return budgetGetEvent(key, eventId);
}

/* ---------------------------------------------------------------- 지출환급신청서 → 거래로 가져오기 */

/**
 * 회계팀이 지출신청의 '예산' 칸에 이 행사 이름을 배정해 둔 건(승인 · 지급 · 종결)을 거래로 가져옵니다.
 * 신청서의 항목(영수증) 한 줄이 거래 한 건이 되고, 날짜는 그 항목의 지출일입니다.
 * 이미 가져온 항목(지출신청번호 'EXP-2026-005#2')은 다시 가져오지 않습니다.
 */
function budgetPullReimbursements(key, eventId, dryRun, lineId) {
  var c = 회계필수_(key, eventId, 2, '환급신청서 가져오기');
  var ev = 행사필수_(eventId); 행사열려있어야_(ev); 거래잠금확인_(ev);
  lineId = String(lineId || '').trim();
  if (lineId && !행사항목들_(ev.id).some(function (l) { return l.id === lineId && l.kind === '지출'; })) throw new Error('지출 예산 항목을 골라주세요.');
  var 이미 = {};
  행사거래들_(ev.id).forEach(function (t) { if (t.expNo) 이미[t.expNo] = 1; });
  var 가져올 = [];
  지출목록_().forEach(function (e) {
    if (e.budget !== ev.name && e.budget !== ev.id) return;
    if (['Approved', 'Paid', 'Closed'].indexOf(e.status) === -1) return;
    e.items.forEach(function (it) {
      var ref = e.no + '#' + it.seq;
      if (이미[ref]) return;
      가져올.push({ expNo: ref, date: it.date || e.spentAt, detail: it.detail, amount: it.total, applicant: e.name, status: e.status });
    });
  });
  var total = Math.round(가져올.reduce(function (s, x) { return s + x.amount; }, 0) * 100) / 100;
  if (dryRun || !가져올.length) return { dryRun: !!dryRun, count: 가져올.length, total: total, items: 가져올 };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 행사시트_(SHEET_행사거래, HEAD_행사거래), v = sh.getDataRange().getValues(), now = 행사시각_();
    var mine = v.slice(1).filter(function (r) { return String(r[EVT_행사]).trim() === ev.id; }).map(function (r) { return r[EVT_ID]; });
    var 새 = 가져올.map(function (x) {
      var id = 다음번호_(mine, 'T'); mine.push(id);
      return [ev.id, id, x.date, '지출', lineId, x.detail, x.amount, '환급(수표)', '환급신청 ' + x.applicant, x.expNo, c.subject.name, now, now];
    });
    var first = sh.getLastRow() + 1;
    sh.getRange(first, EVT_날짜 + 1, 새.length, 1).setNumberFormat('@');
    sh.getRange(first, EVT_입력 + 1, 새.length, 2).setNumberFormat('@');
    sh.getRange(first, 1, 새.length, HEAD_행사거래.length).setValues(새);
    캐시비움_();
    행사올림_(ev.id, c.subject.name);
    if (ev.status === '예산작성') 행사상태바꿈_(ev.id, '진행중');
    행사이력_(ev.id, c.subject.name, '환급신청서 가져오기', 새.length + '건 · ' + total);
    캐시비움_();
  } finally { lock.releaseLock(); }
  return { dryRun: false, count: 가져올.length, total: total, items: 가져올 };
}

/* ---------------------------------------------------------------- 정산 */

/** 정산 확정 — 그 순간의 예산 · 실적을 스냅샷으로 남기고 행사를 닫습니다 (정산) */
function budgetSettle(key, eventId, memo, allowUnassigned) {
  var c = 회계필수_(key, eventId, 3, '정산 확정');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ev = 행사필수_(eventId); 행사열려있어야_(ev);
    흐름정산승인준비_(ev, c.subject);   // Step 8 — 승인 절차를 쓰는 행사는 "정산 제출" 뒤 · 제출자 본인 아님
    var lines = 행사항목들_(ev.id), txs = 행사거래들_(ev.id);
    if (!lines.length && !txs.length) throw new Error('예산 항목도 거래도 없어 정산할 것이 없습니다.');
    var g = 행사집계_(lines, txs);
    if (g.unassigned.count && !allowUnassigned) {
      throw new Error('예산 항목에 연결되지 않은 거래가 ' + g.unassigned.count + '건 있습니다. 항목을 연결하거나, "미분류로 그대로 정산"을 선택해주세요.');
    }
    var now = 행사시각_();
    var snap = { event: { id: ev.id, name: ev.name, year: ev.year, dept: ev.dept, owner: ev.owner, start: ev.start, end: ev.end },
      lines: g.lines.map(function (l) { return { id: l.id, kind: l.kind, category: l.category, name: l.name, budget: l.budget, actual: l.actual, diff: l.diff, count: l.count }; }),
      unassigned: g.unassigned, totals: g.totals, txCount: txs.length, settledAt: now, settledBy: c.subject.name };
    var json = JSON.stringify(snap);
    if (json.length > 45000) snap.lines = snap.lines.map(function (l) { return { id: l.id, kind: l.kind, name: l.name, budget: l.budget, actual: l.actual }; });
    json = JSON.stringify(snap).slice(0, 49000);
    var sh = 행사시트_(SHEET_행사정산, HEAD_행사정산), v = sh.getDataRange().getValues();
    var no = 다음번호_(v.slice(1).filter(function (r) { return String(r[EVS_행사]).trim() === ev.id; }).map(function (r) { return r[EVS_번호]; }), 'S');
    var row = [ev.id, no, now, c.subject.name, String(memo || '').trim().slice(0, 300), g.totals.budgetExpense, g.totals.actualExpense,
      g.totals.budgetIncome, g.totals.actualIncome, g.totals.actualNet, json];
    sh.appendRow(row);
    var last = sh.getLastRow();
    sh.getRange(last, EVS_시각 + 1).setNumberFormat('@').setValue(now);
    // 헤더: 상태 · 정산 정보
    var hs = 행사시트_(SHEET_행사예산, HEAD_행사예산), hv = hs.getDataRange().getValues();
    for (var i = 1; i < hv.length; i++) {
      if (String(hv[i][EVB_ID]).trim() !== ev.id) continue;
      hs.getRange(i + 1, EVB_상태 + 1).setValue('정산완료');
      hs.getRange(i + 1, EVB_정산시각 + 1).setNumberFormat('@').setValue(now);
      hs.getRange(i + 1, EVB_정산자 + 1).setValue(c.subject.name);
      hs.getRange(i + 1, EVB_정산메모 + 1).setValue(String(memo || '').trim().slice(0, 300));
      break;
    }
    캐시비움_();
    행사올림_(ev.id, c.subject.name);
    행사이력_(ev.id, c.subject.name, '정산 확정', no + ' · 실지출 ' + g.totals.actualExpense + ' / 예산 ' + g.totals.budgetExpense);
    흐름정산승인기록_(ev, c.subject, memo);   // Step 8
    캐시비움_();
  } finally { lock.releaseLock(); }
  흐름알림비우기_();                            // Step 8 — 잠금을 푼 뒤 알림
  return budgetGetEvent(key, eventId);
}

function budgetReopen(key, eventId, reason) {
  var c = 회계필수_(key, eventId, 3, '정산 다시 열기');
  var ev = 행사필수_(eventId);
  if (ev.status !== '정산완료') throw new Error('정산이 끝난 행사가 아닙니다.');
  reason = String(reason || '').trim();
  if (!reason) throw new Error('다시 여는 이유를 적어주세요. (기록에 남습니다)');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    행사상태바꿈_(ev.id, '진행중');
    캐시비움_();
    행사올림_(ev.id, c.subject.name);
    행사이력_(ev.id, c.subject.name, '정산 다시 열기', reason);
    흐름재개기록_(ev, c.subject, reason);   // Step 8
    캐시비움_();
  } finally { lock.releaseLock(); }
  흐름알림비우기_();                          // Step 8
  return budgetGetEvent(key, eventId);
}

function budgetHistory(key, eventId) {
  회계필수_(key, eventId, 1, '변경 기록 보기');
  return 행사표_(SHEET_행사이력).filter(function (r) { return String(r[0]).trim() === eventId; }).slice(-200).reverse().map(function (r) {
    return { at: String(r[1] || ''), by: String(r[2] || ''), action: String(r[3] || ''), text: String(r[4] || '') };
  });
}

/* ---------------------------------------------------------------- 사람별 접근 관리 */

function 회계줄목록_(eventId) {
  return 권한행목록_().filter(function (r) { return r.kind === '회계' && (r.target === eventId || r.target === '*'); });
}

/** 이 행사에 대한 접근 목록 (관리) — 행사 줄 + 모든 행사(*) 줄 */
function acctAccessList(key, eventId) {
  eventId = String(eventId || '').trim() || '*';
  var c = 회계필수_(key, eventId, 4, '접근 권한 보기');
  var rows = 회계줄목록_(eventId).map(function (r) {
    return { name: r.name, eventId: r.target, level: r.effect === '차단' ? '차단' : r.scope, until: r.until, memo: r.memo, by: r.by, at: r.at,
      global: r.target === '*' };
  });
  return { eventId: eventId, rows: rows, levels: ['조회', '입력', '정산', '관리'], meLevel: c.level,
    people: Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); }) };
}

/**
 * 접근 한 줄 저장 (관리) — level: 조회 | 입력 | 정산 | 관리 | 차단
 * 행사ID 대신 '*'(모든 행사)는 관리자 · 회계팀 키를 가진 쪽만 정할 수 있습니다.
 */
function acctAccessSave(key, name, eventId, level, until, memo) {
  eventId = String(eventId || '').trim();
  if (!eventId) throw new Error('행사를 정해주세요.');
  var c = 회계필수_(key, eventId, 4, '접근 권한 주기');
  if (eventId === '*' && !c.subject.full) throw new Error('"모든 행사" 권한은 관리자 · 회계팀 키로만 정할 수 있습니다.');
  if (eventId !== '*') 행사필수_(eventId);
  name = String(name || '').trim();
  if (!name || !교적맵_()[name]) throw new Error('교적에 없는 이름입니다: ' + name);
  level = String(level || '').trim();
  var deny = level === '차단';
  if (!deny && !회계등급값_[level]) throw new Error('등급은 조회 · 입력 · 정산 · 관리 · 차단 중에서 골라주세요.');
  until = String(until || '').trim();
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error('만료일은 2026-12-31 같은 형식으로 적어주세요.');
  memo = String(memo || '').trim().slice(0, 200);
  if (!c.subject.full && c.subject.name === name && (deny || 회계등급값_[level] < 4) && eventId !== '*') {
    throw new Error('자기 자신의 관리 권한은 스스로 낮출 수 없습니다.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 권한시트_(), v = sh.getDataRange().getValues(), at = 0, now = 행사시각_();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][UP_이름]).trim() === name && String(v[i][UP_구분]).trim() === '회계' && String(v[i][UP_대상]).trim() === eventId) { at = i + 1; break; }
    }
    var row = [name, '회계', eventId, deny ? '차단' : '허용', deny ? '' : level, until, memo, c.subject.name, now];
    if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
    else { sh.appendRow(row); at = sh.getLastRow(); }
    sh.getRange(at, UP_만료 + 1, 1, 1).setNumberFormat('@').setValue(until);
    sh.getRange(at, UP_시각 + 1, 1, 1).setNumberFormat('@').setValue(now);
    캐시비움_();
    행사이력_(eventId, c.subject.name, '접근 권한', name + ' → ' + (deny ? '차단' : level) + (until ? ' (~' + until + ')' : ''));
  } finally { lock.releaseLock(); }
  return acctAccessList(key, eventId);
}

function acctAccessDelete(key, name, eventId) {
  eventId = String(eventId || '').trim();
  var c = 회계필수_(key, eventId, 4, '접근 권한 빼기');
  if (eventId === '*' && !c.subject.full) throw new Error('"모든 행사" 권한은 관리자 · 회계팀 키로만 바꿀 수 있습니다.');
  name = String(name || '').trim();
  if (!c.subject.full && c.subject.name === name && eventId !== '*') throw new Error('자기 자신의 권한은 스스로 뺄 수 없습니다.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 권한시트_(), v = sh.getDataRange().getValues();
    for (var i = v.length - 1; i >= 1; i--) {
      if (String(v[i][UP_이름]).trim() === name && String(v[i][UP_구분]).trim() === '회계' && String(v[i][UP_대상]).trim() === eventId) sh.deleteRow(i + 1);
    }
    캐시비움_();
    행사이력_(eventId, c.subject.name, '접근 권한 뺌', name);
  } finally { lock.releaseLock(); }
  return acctAccessList(key, eventId);
}

/** 나의 회계 등급 (화면 버튼 · 메뉴용) */
function acctAccessMine(key) {
  var s = 회계주체_(key);
  if (!s) return { any: false };
  var 전체 = 회계등급_(s, '*');
  var per = {};
  예산행사목록_().forEach(function (e) { per[e.id] = 회계등급_(s, e.id).level; });
  return { any: true, name: s.name, full: !!s.full, global: 전체.level, perEvent: per };
}

/** 이 사람이 회계 모듈을 볼 수 있는지 (포털 메뉴용 — 빠른 판정) */
function 회계모듈있나_(name) {
  var p = 개인권한_(name);
  if ((p.acct || []).some(function (r) { return r.effect === '허용'; })) return true;
  var 역할 = 포털역할_(name).roles;
  return !!(역할.indexOf('회계팀') !== -1 || (역할.indexOf('커미티') !== -1 && 전체커미티인가_(name)));
}
