/**
 * 행사 예산 · 정산 — 2단계 회계 승인 흐름 (Step 8)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * logic/eventbudget.js 의 도구(행사표_ · 행사시트_ · 행사이력_ · 행사올림_ · 회계필수_ …)를 그대로 쓰고 새 이름만 더합니다.
 *
 * ▣ 단계 — '행사승인' 시트에 행사마다 한 줄 (기존 5개 시트는 열 하나도 바꾸지 않습니다)
 *      Draft → Budget Submitted → Budget Approved → Settlement Submitted → Settlement Approved
 *    수정 요청 = 사유를 적고 한 단계 되돌림
 *      Budget Submitted → Draft          Settlement Submitted → Budget Approved
 *    승인된 예산을 고쳐야 하면 회계가 "예산 다시 열기"(Budget Approved → Draft, 사유 필수)
 *
 * ▣ 켜는 방법 — 행사마다 선택 (옛 행사와 옛 화면은 예전 그대로 동작합니다)
 *    · 새 행사: budgetSaveEvent 의 data.workflow = true (화면의 "회계 승인 절차 사용" 체크, 기본 켜짐)
 *    · 옛 행사: 회계 "관리" 등급이 budgetFlowAct(…, 'enableFlow') — 지금 상태(예산작성/진행중/정산완료)에 맞는 단계로 시작
 *    행사승인 줄이 없는 행사는 아래 잠금 · 검사 · 알림이 전부 건너뜁니다.
 *
 * ▣ 단계별 잠금 (승인 절차를 켠 행사만)
 *      예산 항목 고치기 · 엑셀로 예산 올리기   Draft 에서만
 *      거래 기록 · 수정 · 삭제 · 환급신청서 가져오기 · 엑셀로 거래 올리기   Budget Approved 에서만
 *      정산 확정(= 최종 승인)   Settlement Submitted 에서만 (budgetSettle 이 확인)
 *
 * ▣ 누가 무엇을 — 회계 등급(logic/eventbudget.js)을 그대로 씁니다. 서버가 요청마다 다시 확인합니다.
 *      제출(예산 · 정산)                      "입력" 이상
 *      승인 · 수정 요청 · 예산 다시 열기      "정산" 이상 (회계 담당)
 *      승인 절차 켜기                         "관리"
 *      본인이 제출한 예산 · 정산은 본인이 승인할 수 없습니다 (관리자키 · 회계팀 키는 예외). 수정 요청은 할 수 있습니다.
 *
 * ▣ 알림 — 단계가 바뀔 때마다 (앱의 알림 '팀보고' 종류를 재사용: 끄면 안 나갑니다, 메일은 그 설정을 따릅니다)
 *      제출됨            → 회계 담당 (이 행사에 "정산" 이상 개인 권한이 있는 사람 + 회계팀 역할)
 *      승인 · 수정 요청 · 다시 열림 → 팀 쪽 (행사 담당자 · 제출한 사람 · 행사 부서와 이름이 같은 사역팀의 팀장)
 *      동작한 본인은 뺍니다. 알림이 실패해도 단계 변경은 그대로 저장됩니다. 알림을 누르면 그 행사가 열립니다(딥링크 budget).
 */

var SHEET_행사승인 = '행사승인';
var HEAD_행사승인 = ['행사ID', '단계', '예산제출시각', '예산제출자', '예산검토시각', '예산검토자', '예산검토결과', '예산검토메모',
                     '정산제출시각', '정산제출자', '정산검토시각', '정산검토자', '정산검토결과', '정산검토메모', '수정시각'];
var EVF_ID = 0, EVF_단계 = 1, EVF_예산제출시각 = 2, EVF_예산제출자 = 3, EVF_예산검토시각 = 4, EVF_예산검토자 = 5, EVF_예산검토결과 = 6,
    EVF_예산검토메모 = 7, EVF_정산제출시각 = 8, EVF_정산제출자 = 9, EVF_정산검토시각 = 10, EVF_정산검토자 = 11, EVF_정산검토결과 = 12,
    EVF_정산검토메모 = 13, EVF_수정 = 14;
var EVF_시각열들_ = [EVF_예산제출시각, EVF_예산검토시각, EVF_정산제출시각, EVF_정산검토시각, EVF_수정];

var 승인단계들_ = ['Draft', 'Budget Submitted', 'Budget Approved', 'Settlement Submitted', 'Settlement Approved'];
var 승인단계이름_ = { 'Draft': '작성 중', 'Budget Submitted': '예산 제출됨', 'Budget Approved': '예산 승인됨',
                      'Settlement Submitted': '정산 제출됨', 'Settlement Approved': '정산 승인됨' };

/** 동작표 — min: 필요한 회계 등급, from: 이 단계에서만, note: 사유 필수 */
var 흐름행동표_ = {
  approveBudget:             { min: 3, from: ['Budget Submitted'],      label: '예산 승인',      history: '예산 승인',      tone: 'pri', note: false },
  requestBudgetRevision:     { min: 3, from: ['Budget Submitted'],      label: '수정 요청',      history: '예산 수정 요청', tone: 'bad', note: true },
  submitBudget:              { min: 2, from: ['Draft'],                 label: '예산 제출',      history: '예산 제출',      tone: 'pri', note: false },
  reopenBudget:              { min: 3, from: ['Budget Approved'],       label: '예산 다시 열기', history: '예산 다시 열기', tone: '',    note: true },
  submitSettlement:          { min: 2, from: ['Budget Approved'],       label: '정산 제출',      history: '정산 제출',      tone: 'pri', note: false },
  approveSettlement:         { min: 3, from: ['Settlement Submitted'],  label: '정산 최종 승인', history: '정산 승인',      tone: 'pri', note: false },
  requestSettlementRevision: { min: 3, from: ['Settlement Submitted'],  label: '정산 수정 요청', history: '정산 수정 요청', tone: 'bad', note: true },
  enableFlow:                { min: 4, from: null,                      label: '승인 절차 켜기', history: '승인 절차 켜기', tone: '',    note: false }
};

/* ---------------------------------------------------------------- 읽기 · 쓰기 */

function 승인행변환_(r) {
  var s = function (i) { return String(r[i] == null ? '' : r[i]).trim(); };
  var stage = s(EVF_단계);
  return {
    id: s(EVF_ID), stage: 승인단계들_.indexOf(stage) !== -1 ? stage : 'Draft',
    budgetSubmittedAt: s(EVF_예산제출시각), budgetSubmittedBy: s(EVF_예산제출자),
    budgetReviewAt: s(EVF_예산검토시각), budgetReviewBy: s(EVF_예산검토자), budgetReviewResult: s(EVF_예산검토결과), budgetReviewNote: s(EVF_예산검토메모),
    settlementSubmittedAt: s(EVF_정산제출시각), settlementSubmittedBy: s(EVF_정산제출자),
    settlementReviewAt: s(EVF_정산검토시각), settlementReviewBy: s(EVF_정산검토자), settlementReviewResult: s(EVF_정산검토결과), settlementReviewNote: s(EVF_정산검토메모),
    updatedAt: s(EVF_수정)
  };
}

/** 이 행사의 승인 줄 — 없으면 null (= 승인 절차를 쓰지 않는 옛 행사) */
function 승인행_(eventId) {
  eventId = String(eventId || '').trim();
  if (!eventId) return null;
  var rows = 행사표_(SHEET_행사승인);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][EVF_ID]).trim() === eventId) return 승인행변환_(rows[i]);
  return null;
}

/** 한 줄 만들거나 고치기 — pairs: [[열번호, 값], …]. 잠금 안에서만 부릅니다 */
function 승인기록_(eventId, pairs) {
  var sh = 행사시트_(SHEET_행사승인, HEAD_행사승인), v = sh.getDataRange().getValues(), at = 0, n = HEAD_행사승인.length;
  for (var i = 1; i < v.length; i++) if (String(v[i][EVF_ID]).trim() === eventId) { at = i + 1; break; }
  var row = at ? v[at - 1].slice(0, n) : [eventId, 'Draft'];
  while (row.length < n) row.push('');
  pairs.forEach(function (p) { row[p[0]] = p[1]; });
  row[EVF_수정] = 행사시각_();
  if (!at) { sh.appendRow(row); at = sh.getLastRow(); }
  EVF_시각열들_.forEach(function (c) { sh.getRange(at, c + 1).setNumberFormat('@'); });
  sh.getRange(at, 1, 1, n).setValues([row]);
  캐시비움_();
}

/** 행사를 지울 때 승인 줄도 함께 지웁니다 (행사 번호가 다시 쓰일 때 남은 줄이 붙는 것을 막습니다) */
function 승인행지우기_(eventId) {
  var all = 행사표_(SHEET_행사승인);
  if (!all.length) return;
  var keep = all.filter(function (r) { return String(r[EVF_ID]).trim() !== eventId; });
  if (keep.length !== all.length) 행사표쓰기_(SHEET_행사승인, HEAD_행사승인, keep, EVF_시각열들_);
}

function 흐름켜기요청_(v) {
  return v === true || /^(true|y|yes|1|on)$/i.test(String(v == null ? '' : v).trim());
}

/** 옛 행사에 절차를 켤 때의 시작 단계 — 지금 상태에 맞춥니다 */
function 승인시작단계_(ev) {
  return ev.status === '정산완료' ? 'Settlement Approved' : (ev.status === '진행중' ? 'Budget Approved' : 'Draft');
}

/** 새 행사 · 켜기에서 씁니다 (잠금 안) */
function 흐름시작_(eventId, who, stage) {
  승인기록_(eventId, [[EVF_단계, stage]]);
  행사이력_(eventId, who, '승인 절차 켜기', '시작 단계 ' + stage);
}

/* ---------------------------------------------------------------- 단계별 잠금 (승인 절차를 켠 행사만) */

function 예산열림_(f) { return !f || f.stage === 'Draft'; }
function 거래열림_(f) { return !f || f.stage === 'Budget Approved'; }

function 예산잠금확인_(ev) {
  var f = 승인행_(ev.id);
  if (예산열림_(f)) return;
  var m = {
    'Budget Submitted': '예산이 회계 검토 중이라 지금은 고칠 수 없습니다. 고치려면 회계 담당자에게 "수정 요청"을 부탁하세요.',
    'Budget Approved': '승인된 예산은 고칠 수 없습니다. 바꿔야 하면 회계 담당자가 "예산 다시 열기"를 해야 합니다.',
    'Settlement Submitted': '정산이 회계 검토 중이라 예산을 고칠 수 없습니다.',
    'Settlement Approved': '정산이 끝난 행사입니다. 고치려면 정산 권한자가 "정산 다시 열기"를 먼저 해주세요.'
  };
  throw new Error(m[f.stage] || '지금 단계(' + f.stage + ')에서는 예산을 고칠 수 없습니다.');
}

function 거래잠금확인_(ev) {
  var f = 승인행_(ev.id);
  if (거래열림_(f)) return;
  var m = {
    'Draft': '예산이 승인된 뒤에 거래를 기록할 수 있습니다. 먼저 예산을 제출해주세요. (지금 단계: Draft)',
    'Budget Submitted': '예산이 승인된 뒤에 거래를 기록할 수 있습니다. (지금 단계: Budget Submitted — 회계 검토 중)',
    'Settlement Submitted': '정산이 회계 검토 중이라 거래를 고칠 수 없습니다. 고치려면 회계 담당자에게 "수정 요청"을 부탁하세요.',
    'Settlement Approved': '정산이 끝난 행사입니다. 고치려면 정산 권한자가 "정산 다시 열기"를 먼저 해주세요.'
  };
  throw new Error(m[f.stage] || '지금 단계(' + f.stage + ')에서는 거래를 고칠 수 없습니다.');
}

/**
 * 엑셀 올리기 계획에서 "실제로 바뀌는 것"이 잠긴 단계와 부딪히면 그 이유들을 돌려줍니다.
 * (바뀐 것이 없는 줄까지 막지는 않습니다 — 파일을 통째로 다시 올려도 같은 값이면 통과)
 */
function 흐름잠금메시지_(ev, plan) {
  var out = [];
  var n = function (o) { return o ? (o.add.length + o.update.length + o.remove.length) : 0; };
  try { if (plan.hasLines && n(plan.lines)) 예산잠금확인_(ev); } catch (e) { out.push(e.message); }
  try { if (plan.hasTxs && n(plan.txs)) 거래잠금확인_(ev); } catch (e) { out.push(e.message); }
  return out;
}

/* ---------------------------------------------------------------- 화면에 보낼 자료 */

function 흐름본인검토불가_(subject, submitter) {
  return !!(subject && subject.kind === 'person' && submitter && subject.name === submitter);
}

/** budgetGetEvent 에 실려 나가는 flow — 이 사람이 지금 할 수 있는 동작 목록까지 서버가 정해서 보냅니다 */
function 흐름정보_(ev, f, level, subject) {
  var out = {
    managed: !!f, stage: f ? f.stage : '', stageName: f ? 승인단계이름_[f.stage] : '',
    stages: 승인단계들_.map(function (s) { return { key: s, name: 승인단계이름_[s] }; }),
    info: f || null, actions: [], hint: ''
  };
  Object.keys(흐름행동표_).forEach(function (k) {
    var d = 흐름행동표_[k];
    if (level < d.min) return;
    if (k === 'enableFlow') {
      if (!f) out.actions.push({ action: k, label: d.label, tone: d.tone, note: false });
      return;
    }
    if (!f || d.from.indexOf(f.stage) === -1) return;
    if ((k === 'approveBudget' && 흐름본인검토불가_(subject, f.budgetSubmittedBy)) ||
        (k === 'approveSettlement' && 흐름본인검토불가_(subject, f.settlementSubmittedBy))) {
      out.hint = '본인이 제출한 건은 다른 회계 담당자가 승인해야 합니다. (수정 요청은 할 수 있습니다)';
      return;
    }
    out.actions.push({ action: k, label: d.label, tone: d.tone, note: d.note });
  });
  if (f && !out.actions.length && !out.hint) {
    if (f.stage === 'Budget Submitted' || f.stage === 'Settlement Submitted') out.hint = '회계 담당자의 검토를 기다리는 중입니다.';
    else if (f.stage === 'Draft' && level < 2) out.hint = '예산 제출은 회계 "입력" 이상 권한이 필요합니다.';
    else if (f.stage === 'Budget Approved' && level < 2) out.hint = '정산 제출은 회계 "입력" 이상 권한이 필요합니다.';
  }
  return out;
}

/* ---------------------------------------------------------------- 알림 (단계가 바뀔 때) */

var 흐름알림대기_ = [];
var 흐름알림결과_ = null;

/** 잠금 안에서는 쌓아 두고, 잠금을 푼 뒤 흐름알림비우기_() 로 한꺼번에 보냅니다 (요청마다 로직을 새로 준비하므로 요청 사이에 섞이지 않습니다) */
function 흐름알림쌓기_(ev, kind, actor, note) {
  흐름알림대기_.push({ ev: { id: ev.id, name: ev.name, owner: ev.owner, dept: ev.dept }, kind: kind, actor: String(actor || ''), note: String(note || '').trim() });
}

function 흐름알림비우기_() {
  var q = 흐름알림대기_;
  흐름알림대기_ = [];
  q.forEach(function (x) { 흐름알림결과_ = 흐름알림보내기_(x); });
  return 흐름알림결과_;
}

function 흐름알림문구_(kind, ev, actor, note) {
  var q = '"' + ev.name + '"';
  var T = {
    submitBudget:              ['accounting', '행사 예산 검토 요청', q + ' 예산이 제출되었습니다. 검토해주세요. (제출: ' + actor + ')'],
    approveBudget:             ['team', '행사 예산 승인', q + ' 예산이 승인되었습니다. 이제 거래를 기록할 수 있습니다. (검토: ' + actor + ')'],
    requestBudgetRevision:     ['team', '행사 예산 수정 요청', q + ' 예산에 수정이 필요합니다. (검토: ' + actor + ')'],
    reopenBudget:              ['team', '행사 예산 다시 열림', q + ' 예산이 다시 열렸습니다. 고친 뒤 다시 제출해주세요. (' + actor + ')'],
    submitSettlement:          ['accounting', '행사 정산 검토 요청', q + ' 정산이 제출되었습니다. 검토해주세요. (제출: ' + actor + ')'],
    approveSettlement:         ['team', '행사 정산 승인', q + ' 정산이 최종 승인되었습니다. (승인: ' + actor + ')'],
    requestSettlementRevision: ['team', '행사 정산 수정 요청', q + ' 정산에 수정이 필요합니다. (검토: ' + actor + ')'],
    reopenSettlement:          ['team', '행사 정산 다시 열림', q + ' 정산이 다시 열렸습니다. (' + actor + ')']
  };
  var t = T[kind];
  if (!t) return null;
  return { side: t[0], title: t[1], body: t[2] + (note ? '\n사유: ' + note : '') };
}

/** 회계 담당 — 이 행사에 "정산" 이상 개인 권한이 있는 사람 + 회계팀 역할. 차단 · 만료된 사람은 뺍니다 */
function 회계받는이_(ev) {
  var need = {};
  try { 회계줄목록_(ev.id).forEach(function (r) { if (r.effect === '허용' && (회계등급값_[r.scope] || 0) >= 3) need[r.name] = 3; }); } catch (e) {}
  try { 역할인사람_('회계팀').forEach(function (n) { if (!need[n]) need[n] = 1; }); } catch (e) {}
  return Object.keys(need).filter(function (n) {
    return 회계등급_({ full: false, name: n, kind: 'person' }, ev.id).level >= need[n];
  });
}

/** 팀 쪽 — 행사 담당자 · 그 단계를 제출한 사람 · 행사 부서와 이름이 같은 사역팀(없으면 부서가 같은 사역팀)의 팀장 */
function 팀받는이_(ev, f, kind) {
  var out = [];
  if (ev.owner) out.push(ev.owner);
  if (f) {
    var by = /Settlement/.test(kind) ? f.settlementSubmittedBy : f.budgetSubmittedBy;
    if (by) out.push(by);
  }
  try {
    var teams = 사역팀목록_();
    var hit = teams.filter(function (t) { return t.name === ev.dept; });
    if (!hit.length) hit = teams.filter(function (t) { return t.dept && t.dept === ev.dept; });
    hit.forEach(function (t) { if (t.leader) out.push(t.leader); });
  } catch (e) {}
  return out;
}

/** 알림 한 건 보내기 → { to, sent } — 무슨 일이 있어도 던지지 않습니다 */
function 흐름알림보내기_(x) {
  var res = { to: 0, sent: 0 };
  try {
    var m = 흐름알림문구_(x.kind, x.ev, x.actor, x.note);
    if (!m) return res;
    var names = m.side === 'accounting' ? 회계받는이_(x.ev) : 팀받는이_(x.ev, 승인행_(x.ev.id), x.kind);
    var seen = {};
    names = names.filter(function (n) {
      n = String(n || '').trim();
      if (!n || n === x.actor || seen[n]) return false;
      seen[n] = 1; return true;
    });
    res.to = names.length;
    if (!names.length) return res;
    var r = 알림보내기_('팀보고', names, { title: m.title, body: m.body, url: 딥링크주소_('budget', x.ev.id), tag: 'evb-' + x.ev.id });
    res.sent = (r && r.sent) || 0;
    if (r && r.off) res.off = true;
  } catch (e) { res.error = String((e && e.message) || e); }
  return res;
}

/* ---------------------------------------------------------------- eventbudget.js 가 부르는 훅 (승인 줄이 없으면 아무 일도 안 합니다) */

/** budgetSettle 맨 앞 — 승인 절차를 쓰는 행사는 "정산 제출" 뒤에만, 제출자 본인이 아닌 사람만 최종 승인 */
function 흐름정산승인준비_(ev, subject) {
  var f = 승인행_(ev.id);
  if (!f) return;
  if (f.stage !== 'Settlement Submitted') {
    throw new Error('이 행사는 승인 절차를 쓰고 있어 정산은 "정산 제출" 뒤에 최종 승인할 수 있습니다. (지금 단계: ' + f.stage + ')');
  }
  if (흐름본인검토불가_(subject, f.settlementSubmittedBy)) throw new Error('본인이 제출한 정산은 다른 회계 담당자가 승인해야 합니다.');
}

/** budgetSettle 끝 — 단계를 Settlement Approved 로 */
function 흐름정산승인기록_(ev, subject, memo) {
  if (!승인행_(ev.id)) return;
  memo = String(memo || '').trim().slice(0, 300);
  승인기록_(ev.id, [[EVF_단계, 'Settlement Approved'], [EVF_정산검토시각, 행사시각_()], [EVF_정산검토자, subject.name],
    [EVF_정산검토결과, '승인'], [EVF_정산검토메모, memo]]);
  행사이력_(ev.id, subject.name, '단계 변경', 'Settlement Submitted → Settlement Approved');
  흐름알림쌓기_(ev, 'approveSettlement', subject.name, memo);
}

/** budgetReopen 끝 — Settlement Approved → Budget Approved */
function 흐름재개기록_(ev, subject, reason) {
  if (!승인행_(ev.id)) return;
  reason = String(reason || '').trim().slice(0, 300);
  승인기록_(ev.id, [[EVF_단계, 'Budget Approved'], [EVF_정산검토시각, 행사시각_()], [EVF_정산검토자, subject.name],
    [EVF_정산검토결과, '다시열기'], [EVF_정산검토메모, reason]]);
  행사이력_(ev.id, subject.name, '단계 변경', 'Settlement Approved → Budget Approved');
  흐름알림쌓기_(ev, 'reopenSettlement', subject.name, reason);
}

/* ---------------------------------------------------------------- 화면에서 부르는 동작 하나 */

function 흐름낡음메시지_(now) {
  return '다른 분이 먼저 상태를 바꿨습니다 (지금: ' + now + '). 화면을 새로 고쳐 다시 확인해주세요.';
}

/**
 * 승인 흐름 동작 — action:
 *   submitBudget · approveBudget · requestBudgetRevision · reopenBudget
 *   submitSettlement · approveSettlement · requestSettlementRevision · enableFlow
 * note            사유 (수정 요청 · 다시 열기는 필수, 승인은 정산 메모로 쓰임)
 * expectedStage   화면이 보고 있던 단계 — 그새 다른 사람이 바꿨으면 거절 (두 사람이 동시에 누르는 것을 막습니다)
 * options         { allowUnassigned } 정산 최종 승인 때 항목 없는 거래를 그대로 두고 확정
 * 돌려주는 값     budgetGetEvent 결과 + notify { to, sent }
 */
function budgetFlowAct(key, eventId, action, note, expectedStage, options) {
  action = String(action || '').trim();
  var def = 흐름행동표_[action];
  if (!def) throw new Error('알 수 없는 동작입니다: ' + action);
  options = options || {};
  eventId = String(eventId || '').trim();
  note = String(note || '').trim().slice(0, 300);
  expectedStage = String(expectedStage || '').trim();
  var c = 회계필수_(key, eventId, def.min, def.label);

  if (action === 'approveSettlement') {
    var ev0 = 행사필수_(eventId), f0 = 승인행_(ev0.id);
    if (!f0) throw new Error('이 행사는 승인 절차를 사용하지 않습니다.');
    if (expectedStage && expectedStage !== f0.stage) throw new Error(흐름낡음메시지_(f0.stage));
    var r = budgetSettle(key, eventId, note, !!options.allowUnassigned);   // 확정 · 스냅샷 · 단계 · 알림은 budgetSettle 의 훅이 처리
    r.notify = 흐름알림결과_;
    return r;
  }

  var name = c.subject.name;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ev = 행사필수_(eventId), f = 승인행_(ev.id), now = 행사시각_();
    if (action === 'enableFlow') {
      if (f) throw new Error('이미 승인 절차를 사용하는 행사입니다.');
      흐름시작_(ev.id, name, 승인시작단계_(ev));
      행사올림_(ev.id, name);
      캐시비움_();
    } else {
      if (!f) throw new Error('이 행사는 승인 절차를 사용하지 않습니다. (회계 "관리" 권한자가 "승인 절차 켜기"를 하면 쓸 수 있습니다)');
      if (expectedStage && expectedStage !== f.stage) throw new Error(흐름낡음메시지_(f.stage));
      if (def.from.indexOf(f.stage) === -1) {
        throw new Error('"' + def.label + '"은(는) ' + def.from.join(' / ') + ' 단계에서만 할 수 있습니다. (지금 단계: ' + f.stage + ')');
      }
      if (def.note && !note) throw new Error(def.label + ' 사유를 적어주세요. (기록과 알림에 남습니다)');
      var to, pairs;
      if (action === 'submitBudget') {
        if (!행사항목들_(ev.id).length) throw new Error('예산 항목을 하나 이상 적은 뒤 제출해주세요.');
        to = 'Budget Submitted';
        pairs = [[EVF_예산제출시각, now], [EVF_예산제출자, name], [EVF_예산검토시각, ''], [EVF_예산검토자, ''], [EVF_예산검토결과, ''], [EVF_예산검토메모, '']];
      } else if (action === 'approveBudget') {
        if (흐름본인검토불가_(c.subject, f.budgetSubmittedBy)) throw new Error('본인이 제출한 예산은 다른 회계 담당자가 승인해야 합니다.');
        to = 'Budget Approved';
        pairs = [[EVF_예산검토시각, now], [EVF_예산검토자, name], [EVF_예산검토결과, '승인'], [EVF_예산검토메모, note]];
      } else if (action === 'requestBudgetRevision') {
        to = 'Draft';
        pairs = [[EVF_예산검토시각, now], [EVF_예산검토자, name], [EVF_예산검토결과, '수정요청'], [EVF_예산검토메모, note]];
      } else if (action === 'reopenBudget') {
        to = 'Draft';
        pairs = [[EVF_예산검토시각, now], [EVF_예산검토자, name], [EVF_예산검토결과, '다시열기'], [EVF_예산검토메모, note]];
      } else if (action === 'submitSettlement') {
        to = 'Settlement Submitted';
        pairs = [[EVF_정산제출시각, now], [EVF_정산제출자, name], [EVF_정산검토시각, ''], [EVF_정산검토자, ''], [EVF_정산검토결과, ''], [EVF_정산검토메모, '']];
      } else {   // requestSettlementRevision
        to = 'Budget Approved';
        pairs = [[EVF_정산검토시각, now], [EVF_정산검토자, name], [EVF_정산검토결과, '수정요청'], [EVF_정산검토메모, note]];
      }
      pairs.unshift([EVF_단계, to]);
      승인기록_(ev.id, pairs);
      행사올림_(ev.id, name);          // 버전을 올려 "내려받은 엑셀이 낡았는지" 알아볼 수 있게 합니다
      행사이력_(ev.id, name, def.history, f.stage + ' → ' + to + (note ? ' · ' + note : ''));
      캐시비움_();
      흐름알림쌓기_(ev, action, name, note);
    }
  } finally { lock.releaseLock(); }
  흐름알림비우기_();
  var out = budgetGetEvent(key, eventId);
  out.notify = 흐름알림결과_;
  return out;
}
