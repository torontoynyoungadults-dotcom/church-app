/**
 * 행사 예산 · 정산 — 실적 (Step 9 = 회계 승인 흐름 2단계)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * logic/eventbudget.js · eventbudget-flow.js 의 도구를 그대로 쓰고 새 이름만 더합니다.
 *
 * ▣ 기존 시트(행사예산 16 · 항목 8 · 거래 13 · 정산 11 · 이력 5 · 승인 15)는 열 하나도 바꾸지 않습니다.
 *    새 시트 2개에만 씁니다.
 *      행사거래상세   거래 한 건의 통화 · 원금액 · 환율 · CAD 환산 · 영수증  (행 없음 = CAD · 영수증 없음 = 옛 거래 그대로)
 *      행사실적노트   Executive Summary · 비고 · 항목별 차이 설명
 *
 * ▣ 금액 규칙 — 행사거래.금액은 언제나 CAD 입니다. 집계 · 정산 · 엑셀 · PDF 는 이 값을 그대로 쓰므로 바뀌는 것이 없습니다.
 *    USD · JPY 거래는 원금액 × 환율 = CAD 환산액 (또는 CAD 환산액을 적으면 환율을 역산). 환율은 거래마다 적습니다
 *    (카드 명세서의 환율이 건마다 다르기 때문).
 *
 * ▣ 차이 설명 — 항목별 |실적 − 예산| 이 기준액(CAD 50) 이상이고 예산의 10% 이상(예산 0이면 금액만)이면 설명이 필요합니다.
 *    승인 절차를 쓰는 행사는 "정산 제출" 때 설명이 비어 있으면 막습니다. 옛 행사는 표시만 하고 막지 않습니다(예전 동작 유지).
 *
 * ▣ 잠금 — 거래 · 차이 설명은 거래가 열린 때(승인 절차: Budget Approved / 옛 행사: 정산완료 전)만, 요약 · 비고는
 *    정산 제출 · 승인 단계와 정산완료를 뺀 때 고칠 수 있습니다.
 */

var SHEET_행사거래상세 = '행사거래상세';
var HEAD_행사거래상세 = ['행사ID', '거래ID', '통화', '원금액', '환율', 'CAD환산', '영수증', '수정자', '수정시각'];
var EVD_행사 = 0, EVD_거래 = 1, EVD_통화 = 2, EVD_원금액 = 3, EVD_환율 = 4, EVD_CAD = 5, EVD_영수증 = 6, EVD_수정자 = 7, EVD_수정 = 8;

var SHEET_행사실적노트 = '행사실적노트';
var HEAD_행사실적노트 = ['행사ID', '종류', '대상', '내용', '작성자', '작성시각'];
var EVN_행사 = 0, EVN_종류 = 1, EVN_대상 = 2, EVN_내용 = 3, EVN_작성자 = 4, EVN_작성 = 5;

var 행사통화들_ = ['CAD', 'USD', 'JPY'];
var 행사통화소수_ = { CAD: 2, USD: 2, JPY: 0 };
var 차이설명기준율_ = 10;      // % (예산 대비)
var 차이설명기준액_ = 50;      // CAD
var 행사영수증최대_ = 8;       // 거래 한 건당
var 실적노트길이_ = { summary: 2000, remarks: 1000, variance: 300 };

/* ---------------------------------------------------------------- 읽기 */

function 실적영수증파싱_(raw) {
  var t = String(raw == null ? '' : raw).trim();
  if (!t) return [];
  try {
    var a = JSON.parse(t);
    return (a instanceof Array) ? a.filter(function (f) { return f && f.id; }).map(function (f) {
      return { id: String(f.id), name: String(f.name || '첨부파일'), mime: String(f.mime || ''), linked: !!f.linked };
    }) : [];
  } catch (e) { return []; }
}

function 실적상세변환_(r) {
  var cur = String(r[EVD_통화] || 'CAD').trim().toUpperCase();
  if (행사통화들_.indexOf(cur) === -1) cur = 'CAD';
  return { eventId: String(r[EVD_행사]).trim(), txId: String(r[EVD_거래]).trim(), currency: cur,
    foreign: cur === 'CAD' ? null : 돈_(r[EVD_원금액]), rate: cur === 'CAD' ? null : (Number(r[EVD_환율]) || 0),
    cad: 돈_(r[EVD_CAD]), receipts: 실적영수증파싱_(r[EVD_영수증]), by: String(r[EVD_수정자] || '').trim(), at: String(r[EVD_수정] || '').trim() };
}

/** 이 행사의 거래 상세 — 거래ID → 상세 (행이 없는 거래 = CAD · 영수증 없음) */
function 실적상세맵_(eventId) {
  var m = {};
  행사표_(SHEET_행사거래상세).forEach(function (r) {
    if (String(r[EVD_행사]).trim() !== eventId || !String(r[EVD_거래]).trim()) return;
    var d = 실적상세변환_(r); m[d.txId] = d;
  });
  return m;
}

function 실적노트맵_(eventId) {
  var out = { summary: null, remarks: null, variance: {} };
  행사표_(SHEET_행사실적노트).forEach(function (r) {
    if (String(r[EVN_행사]).trim() !== eventId) return;
    var kind = String(r[EVN_종류] || '').trim(), text = String(r[EVN_내용] || '');
    if (!text.trim()) return;
    var n = { text: text, by: String(r[EVN_작성자] || '').trim(), at: String(r[EVN_작성] || '').trim() };
    if (kind === 'summary' || kind === 'remarks') out[kind] = n;
    else if (kind === 'variance') out.variance[String(r[EVN_대상] || '').trim()] = n;
  });
  return out;
}

/* ---------------------------------------------------------------- 환산 · 검사 */

function 실적반올림_(n, digits) { var p = Math.pow(10, digits); return Math.round(n * p) / p; }

/**
 * 거래 입력 → 통화 · 원금액 · 환율 · CAD 금액.
 * tx.currency 가 없으면(옛 화면) CAD 로 봅니다. 단, 이미 외화로 기록된 거래를 옛 화면이 금액 그대로 다시 저장하면 외화 정보를 유지하고,
 * 금액을 바꿨다면 CAD 거래로 돌립니다 (원금액 × 환율 ≠ CAD 가 되는 것을 막습니다).
 */
function 실적환산_(eventId, tx, existing) {
  var raw = tx.currency;
  if (raw == null || String(raw).trim() === '') {
    if (existing && existing.currency !== 'CAD') {
      var same = 돈_(tx.amount) === existing.cad;
      if (same) return { currency: existing.currency, foreign: existing.foreign, rate: existing.rate, amount: existing.cad };
    }
    return { currency: 'CAD', foreign: null, rate: null, amount: 행사금액검사_(tx.amount, '금액') };
  }
  var cur = String(raw).trim().toUpperCase();
  if (행사통화들_.indexOf(cur) === -1) throw new Error('통화는 ' + 행사통화들_.join(' · ') + ' 중에서 골라주세요.');
  if (cur === 'CAD') return { currency: 'CAD', foreign: null, rate: null, amount: 행사금액검사_(tx.amount, '금액') };
  var foreign = 행사금액검사_(tx.foreignAmount, cur + ' 금액');
  foreign = 실적반올림_(foreign, 행사통화소수_[cur]);
  if (foreign <= 0) throw new Error(cur + ' 금액은 0보다 커야 합니다.');
  var rate = Number(tx.rate), hasRate = isFinite(rate) && rate > 0;
  var cad = 돈_(tx.amount), hasCad = String(tx.amount == null ? '' : tx.amount).trim() !== '' && cad > 0;
  if (hasRate) {
    if (rate > 10000) throw new Error('환율이 너무 큽니다. (1 ' + cur + '이 몇 CAD인지 적어주세요. 예: 1.37)');
    rate = 실적반올림_(rate, 6);
    cad = 실적반올림_(foreign * rate, 2);
  } else if (hasCad) {
    rate = 실적반올림_(cad / foreign, 6);
  } else {
    throw new Error('환율(1 ' + cur + ' = ? CAD) 또는 CAD 환산 금액을 적어주세요.');
  }
  if (cad <= 0) throw new Error('CAD 환산 금액이 0입니다. 환율을 확인해주세요.');
  if (cad > 100000000) throw new Error('CAD 환산 금액이 너무 큽니다.');
  return { currency: cur, foreign: foreign, rate: rate, amount: cad };
}

/** 영수증 목록 정리 — 새로 붙는 파일은 이 행사 폴더에 올린 것만 받습니다. 돌려주는 값: { list, removed } */
function 실적영수증정리_(ev, tx, existing) {
  var old = existing ? existing.receipts : [];
  if (tx.receipts == null) return { list: old, removed: [], changed: false };     // 옛 화면 — 그대로 둠
  if (!(tx.receipts instanceof Array)) throw new Error('영수증 목록 형식이 올바르지 않습니다.');
  if (tx.receipts.length > 행사영수증최대_) throw new Error('영수증은 한 거래에 ' + 행사영수증최대_ + '개까지 붙일 수 있습니다.');
  var byOld = {}; old.forEach(function (f) { byOld[f.id] = f; });
  var seen = {}, list = [];
  tx.receipts.forEach(function (f) {
    var id = String((f && f.id) || '').trim();
    if (!id || seen[id]) return;
    seen[id] = 1;
    if (byOld[id]) { list.push(byOld[id]); return; }                             // 이미 붙어 있던 것 (연결된 환급 영수증 포함)
    var 이름 = String(f.name || '영수증').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80), mime = String(f.mime || '').toLowerCase();
    var file;
    try { file = DriveApp.getFileById(id); } catch (e) { throw new Error('영수증 파일을 찾을 수 없습니다: ' + 이름); }
    if (!실적행사폴더파일인가_(file, ev.id)) throw new Error('이 행사에 올린 영수증만 붙일 수 있습니다: ' + 이름);
    try { mime = String(file.getMimeType() || mime).toLowerCase(); } catch (e) {}
    list.push({ id: id, name: 이름, mime: mime, linked: false });
  });
  if (list.length > 행사영수증최대_) throw new Error('영수증은 한 거래에 ' + 행사영수증최대_ + '개까지 붙일 수 있습니다.');
  var removed = old.filter(function (f) { return !seen[f.id]; });
  return { list: list, removed: removed, changed: true };
}

/** 이 행사의 영수증 폴더(행사 영수증 보관함 아래 행사번호 폴더)에 있는 파일인가 — 부모 폴더의 번호(id)로 비교합니다 */
function 실적행사폴더파일인가_(file, eventId) {
  try {
    var rootId = 설정값_('행사영수증폴더');
    if (!rootId) return false;
    var ok = {}, it = DriveApp.getFolderById(rootId).getFoldersByName(eventId);
    while (it.hasNext()) ok[it.next().getId()] = 1;
    var ps = file.getParents();
    while (ps.hasNext()) { if (ok[ps.next().getId()]) return true; }
  } catch (e) {}
  return false;
}

/** 지운 영수증 파일을 휴지통으로 (환급신청서에서 가져온 것 · 다른 거래가 쓰는 것은 그대로) */
function 실적파일버리기_(eventId, files) {
  if (!files || !files.length) return;
  var 쓰는것 = {};
  행사표_(SHEET_행사거래상세).forEach(function (r) { 실적영수증파싱_(r[EVD_영수증]).forEach(function (f) { 쓰는것[f.id] = 1; }); });
  files.forEach(function (f) {
    if (f.linked || 쓰는것[f.id]) return;
    try { var file = DriveApp.getFileById(f.id); if (실적행사폴더파일인가_(file, eventId)) file.setTrashed(true); } catch (e) {}
  });
}

/* ---------------------------------------------------------------- 쓰기 (모두 잠금 안에서 부릅니다) */

/** 한 거래의 상세를 저장 — 통화가 CAD 이고 영수증이 없으면 줄을 만들지 않습니다(있던 줄은 지웁니다) */
function 실적상세저장_(eventId, txId, fx, receipts, who) {
  var all = 행사표_(SHEET_행사거래상세);
  var keep = all.filter(function (r) { return !(String(r[EVD_행사]).trim() === eventId && String(r[EVD_거래]).trim() === txId); });
  var 기본 = fx.currency === 'CAD' && !receipts.length;
  if (기본 && keep.length === all.length) return;
  if (!기본) {
    keep.push([eventId, txId, fx.currency, fx.currency === 'CAD' ? '' : fx.foreign, fx.currency === 'CAD' ? '' : fx.rate, fx.amount,
      receipts.length ? JSON.stringify(receipts) : '', who, 행사시각_()]);
  }
  행사표쓰기_(SHEET_행사거래상세, HEAD_행사거래상세, keep, [EVD_수정]);
}

/** 거래를 지울 때 · 행사를 지울 때 — txIds 가 null 이면 행사 전체. 지운 줄의 영수증 목록을 돌려줍니다 */
function 실적상세지우기_(eventId, txIds) {
  var all = 행사표_(SHEET_행사거래상세), gone = [];
  if (!all.length) return gone;
  var set = null;
  if (txIds) { set = {}; txIds.forEach(function (id) { set[id] = 1; }); }
  var keep = all.filter(function (r) {
    var hit = String(r[EVD_행사]).trim() === eventId && (!set || set[String(r[EVD_거래]).trim()]);
    if (hit) gone = gone.concat(실적영수증파싱_(r[EVD_영수증]));
    return !hit;
  });
  if (keep.length !== all.length) 행사표쓰기_(SHEET_행사거래상세, HEAD_행사거래상세, keep, [EVD_수정]);
  return gone;
}

function 실적노트지우기_(eventId) {
  var all = 행사표_(SHEET_행사실적노트);
  var keep = all.filter(function (r) { return String(r[EVN_행사]).trim() !== eventId; });
  if (keep.length !== all.length) 행사표쓰기_(SHEET_행사실적노트, HEAD_행사실적노트, keep, [EVN_작성]);
}

/** 엑셀 올리기 뒤 — 지운 거래의 상세를 지우고, 금액이 바뀐 외화 거래는 CAD 로 돌립니다 (영수증은 유지) */
function 실적가져오기정리_(eventId, removeIds, updates) {
  var gone = removeIds && removeIds.length ? 실적상세지우기_(eventId, removeIds) : [];
  if (updates && updates.length) {
    var m = 실적상세맵_(eventId);
    updates.forEach(function (u) {
      var d = m[u.id];
      if (d && d.currency !== 'CAD' && 돈_(u.amount) !== d.cad) 실적상세저장_(eventId, u.id, { currency: 'CAD', foreign: null, rate: null, amount: 돈_(u.amount) }, d.receipts, d.by);
    });
  }
  return gone;
}

/** 환급신청서를 거래로 가져온 뒤 — 신청서의 영수증을 그대로 연결(파일은 복사하지 않고, 지울 때도 건드리지 않음) */
function 실적영수증연결_(eventId, txIds, amounts, receiptLists, who) {
  txIds.forEach(function (id, i) {
    var rs = (receiptLists[i] || []).slice(0, 행사영수증최대_).map(function (f) { return { id: f.id, name: f.name, mime: f.mime || '', linked: true }; });
    if (rs.length) 실적상세저장_(eventId, id, { currency: 'CAD', foreign: null, rate: null, amount: amounts[i] }, rs, who);
  });
}

/* ---------------------------------------------------------------- 차이 · 통화 집계 */

/**
 * 항목별 예산 대 실적 차이 — variance = 실적 − 예산 (지출이면 +가 초과, 수입이면 −가 부족).
 * needs = 설명이 필요한 항목, missing = 그중 설명이 비어 있는 항목
 */
function 실적차이_(gLines, notes) {
  var rows = gLines.map(function (l) {
    var v = 실적반올림_(l.actual - l.budget, 2), abs = Math.abs(v);
    var pct = l.budget ? 실적반올림_(v / l.budget * 100, 1) : null;
    var needs = abs >= 차이설명기준액_ && (!l.budget || Math.abs(pct) >= 차이설명기준율_);
    var n = notes.variance[l.id] || null;
    return { id: l.id, kind: l.kind, category: l.category, name: l.name, budget: l.budget, actual: l.actual, variance: v, pct: pct,
      bad: l.kind === '지출' ? v > 0 : v < 0, needs: needs, note: n ? n.text : '', noteBy: n ? n.by : '', noteAt: n ? n.at : '' };
  });
  return { rule: { pct: 차이설명기준율_, amount: 차이설명기준액_ }, rows: rows,
    missing: rows.filter(function (r) { return r.needs && !r.note.trim(); }).map(function (r) { return r.id; }) };
}

/** 정산 제출 때 — 승인 절차를 쓰는 행사만 (budgetFlowAct 가 부릅니다) */
function 실적차이설명확인_(ev) {
  var g = 행사집계_(행사항목들_(ev.id), 행사거래들_(ev.id));
  var d = 실적차이_(g.lines, 실적노트맵_(ev.id));
  if (!d.missing.length) return;
  var names = d.rows.filter(function (r) { return d.missing.indexOf(r.id) !== -1; }).map(function (r) {
    return r.name + ' (' + (r.variance > 0 ? '+' : '') + r.variance + ')';
  });
  throw new Error('예산과 실적 차이가 큰 항목의 설명이 필요합니다: ' + names.slice(0, 5).join(', ') + (names.length > 5 ? ' 외 ' + (names.length - 5) + '건' : '') +
    '. [실적] 탭의 "차이 설명"에 적은 뒤 다시 제출해주세요.');
}

/** 통화별 합계 — 외화 거래가 있을 때만 값이 있습니다 */
function 실적통화집계_(txs, details) {
  var by = {};
  txs.forEach(function (t) {
    var d = details[t.id], cur = d ? d.currency : 'CAD';
    var x = by[cur] = by[cur] || { currency: cur, count: 0, expenseForeign: 0, expenseCad: 0, incomeForeign: 0, incomeCad: 0 };
    x.count++;
    var k = t.kind === '지출' ? 'expense' : 'income';
    x[k + 'Cad'] += t.amount;
    x[k + 'Foreign'] += (d && d.foreign != null) ? d.foreign : t.amount;
  });
  var out = 행사통화들_.filter(function (c) { return by[c]; }).map(function (c) {
    var x = by[c];
    ['expenseForeign', 'expenseCad', 'incomeForeign', 'incomeCad'].forEach(function (k) { x[k] = 실적반올림_(x[k], 2); });
    return x;
  });
  return out.length === 1 && out[0].currency === 'CAD' ? [] : out;
}

function 실적거래합치기_(t, d) {
  var o = {};
  Object.keys(t).forEach(function (k) { o[k] = t[k]; });
  o.currency = d ? d.currency : 'CAD';
  o.foreign = d ? d.foreign : null;
  o.rate = d ? d.rate : null;
  o.receipts = d ? 영수증보기_(d.receipts) : [];
  return o;
}

/* ---------------------------------------------------------------- 잠금 규칙 */

function 실적노트잠금_(ev, f) {
  if (ev.status === '정산완료') return '정산이 끝난 행사입니다. 고치려면 정산 권한자가 "정산 다시 열기"를 먼저 해주세요.';
  if (f && (f.stage === 'Settlement Submitted' || f.stage === 'Settlement Approved')) return '정산이 회계 검토 중이라 지금은 고칠 수 없습니다. 고치려면 회계 담당자에게 "수정 요청"을 부탁하세요.';
  return '';
}

function 실적설명잠금_(ev, f) {
  var m = 실적노트잠금_(ev, f);
  if (m) return m;
  if (!거래열림_(f)) return '차이 설명은 예산이 승인된 뒤(거래를 기록하는 단계)에 적을 수 있습니다. (지금 단계: ' + f.stage + ')';
  return '';
}

/** budgetGetEvent 가 붙이는 "실적" 묶음 (transactions 에도 통화 · 영수증을 합쳐 줍니다) */
function 실적자료_(ev, level, f, g, txs) {
  var details = 실적상세맵_(ev.id), notes = 실적노트맵_(ev.id);
  var v = 실적차이_(g.lines, notes);
  var 열림 = 실적노트잠금_(ev, f) === '', 설명열림 = 실적설명잠금_(ev, f) === '';
  return {
    transactions: txs.map(function (t) { return 실적거래합치기_(t, details[t.id]); }),
    actuals: {
      currencies: 행사통화들_, byCurrency: 실적통화집계_(txs, details),
      notes: { summary: notes.summary, remarks: notes.remarks }, variance: v,
      receiptMax: 행사영수증최대_, limits: 실적노트길이_,
      can: { notes: level >= 2 && 열림, explain: level >= 2 && 설명열림, receipts: level >= 2 && ev.status !== '정산완료' && 거래열림_(f) }
    }
  };
}

/** 정산 스냅샷에 요약 · 비고 · 항목별 설명 · 통화 합계를 함께 남깁니다 (budgetSettle 이 부릅니다) */
function 실적스냅샷붙이기_(snap, eventId, g, txs) {
  var notes = 실적노트맵_(eventId);
  var trim = function (n, len) { return n ? { text: n.text.slice(0, len), by: n.by, at: n.at } : null; };
  snap.notes = { summary: trim(notes.summary, 1500), remarks: trim(notes.remarks, 800) };
  snap.lines.forEach(function (l) { var n = notes.variance[l.id]; if (n) l.explain = n.text.slice(0, 200); });
  var fx = 실적통화집계_(txs, 실적상세맵_(eventId));
  if (fx.length) snap.fx = fx;
}

/* ---------------------------------------------------------------- 화면에서 부르는 서버 함수 */

/** 요약 · 비고 · 항목별 차이 설명 저장 — patch: { summary?, remarks?, variance?: { 항목ID: 글 } }. 빈 글이면 지웁니다 */
function budgetSaveNotes(key, eventId, patch) {
  var c = 회계필수_(key, eventId, 2, '실적 노트 쓰기');
  patch = patch || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var changed = [];
  try {
    var ev = 행사필수_(eventId), f = 승인행_(ev.id);
    var lines = 행사항목들_(ev.id), lineIds = {};
    lines.forEach(function (l) { lineIds[l.id] = l; });
    var ups = [];                                             // [종류, 대상, 글]
    ['summary', 'remarks'].forEach(function (k) {
      if (patch[k] === undefined) return;
      var t = String(patch[k] == null ? '' : patch[k]).trim();
      if (t.length > 실적노트길이_[k]) throw new Error((k === 'summary' ? 'Executive Summary' : '비고') + '는 ' + 실적노트길이_[k] + '자까지 적을 수 있습니다.');
      ups.push([k, '', t]);
    });
    if (patch.variance && typeof patch.variance === 'object') {
      Object.keys(patch.variance).forEach(function (lid) {
        if (!lineIds[lid]) throw new Error('예산 항목을 찾을 수 없습니다: ' + lid);
        var t = String(patch.variance[lid] == null ? '' : patch.variance[lid]).trim();
        if (t.length > 실적노트길이_.variance) throw new Error('차이 설명은 ' + 실적노트길이_.variance + '자까지 적을 수 있습니다: ' + lineIds[lid].name);
        ups.push(['variance', lid, t]);
      });
    }
    if (!ups.length) throw new Error('저장할 내용이 없습니다.');
    var 노트잠금 = 실적노트잠금_(ev, f), 설명잠금 = 실적설명잠금_(ev, f);
    ups.forEach(function (u) { var m = u[0] === 'variance' ? 설명잠금 : 노트잠금; if (m) throw new Error(m); });

    var all = 행사표_(SHEET_행사실적노트), now = 행사시각_();
    var rows = all.map(function (r) { return r.slice(0, HEAD_행사실적노트.length); });
    ups.forEach(function (u) {
      var at = -1;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][EVN_행사]).trim() === ev.id && String(rows[i][EVN_종류]).trim() === u[0] && String(rows[i][EVN_대상] || '').trim() === u[1]) { at = i; break; }
      }
      var before = at >= 0 ? String(rows[at][EVN_내용] || '') : '';
      if (before === u[2]) return;
      if (!u[2]) { if (at >= 0) rows.splice(at, 1); }
      else if (at >= 0) rows[at] = [ev.id, u[0], u[1], u[2], c.subject.name, now];
      else rows.push([ev.id, u[0], u[1], u[2], c.subject.name, now]);
      changed.push(u[0] === 'variance' ? '차이 설명 ' + (lineIds[u[1]] ? lineIds[u[1]].name : u[1]) : (u[0] === 'summary' ? 'Executive Summary' : '비고'));
    });
    if (changed.length) {
      행사표쓰기_(SHEET_행사실적노트, HEAD_행사실적노트, rows, [EVN_작성]);
      행사올림_(ev.id, c.subject.name);
      행사이력_(ev.id, c.subject.name, '실적 노트 고침', changed.join(', '));
      캐시비움_();
    }
  } finally { lock.releaseLock(); }
  return budgetGetEvent(key, eventId);
}

function 실적영수증폴더_() {
  var id = 설정값_('행사영수증폴더');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var folder = DriveApp.createFolder('청년부 행사 영수증');
  설정저장_('행사영수증폴더', folder.getId());
  return folder;
}

function 실적행사폴더_(eventId) {
  var root = 실적영수증폴더_(), it = root.getFoldersByName(eventId);
  return it.hasNext() ? it.next() : root.createFolder(eventId);
}

/** 영수증 한 장 올리기 — 거래를 저장할 때 receipts 에 이 결과를 실어 보냅니다 (사진 · PDF, 10MB) */
function budgetUploadReceipt(key, eventId, fileName, dataUrl) {
  회계필수_(key, eventId, 2, '영수증 올리기');
  var ev = 행사필수_(eventId); 행사열려있어야_(ev); 거래잠금확인_(ev);
  var m = /^data:([a-zA-Z0-9.+\/-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('파일을 읽을 수 없습니다. 다른 파일로 시도해주세요.');
  var mime = m[1].toLowerCase(), ext = 지출허용형식[mime];
  if (!ext) throw new Error('사진(JPG · PNG) 또는 PDF 파일만 올릴 수 있습니다.');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 10 * 1024 * 1024) throw new Error('파일 한 개는 10MB까지 올릴 수 있습니다.');
  var safe = String(fileName || '영수증').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
  if (safe.toLowerCase().indexOf('.' + ext) === -1) safe += '.' + ext;
  var file = 실적행사폴더_(ev.id).createFile(Utilities.newBlob(bytes, mime, safe));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), name: safe, mime: mime, size: bytes.length };
}

/** 올렸다가 거래에 붙이지 않고 뺀 영수증 정리 — 어떤 거래에도 붙지 않은 이 행사 폴더의 파일만 휴지통으로 */
function budgetDiscardReceipt(key, eventId, fileId) {
  회계필수_(key, eventId, 2, '영수증 지우기');
  var ev = 행사필수_(eventId); 행사열려있어야_(ev); 거래잠금확인_(ev);
  fileId = String(fileId || '').trim();
  if (!fileId) return { ok: true };
  var 쓰는중 = false;
  행사표_(SHEET_행사거래상세).forEach(function (r) { 실적영수증파싱_(r[EVD_영수증]).forEach(function (f) { if (f.id === fileId) 쓰는중 = true; }); });
  if (!쓰는중) {
    try { var file = DriveApp.getFileById(fileId); if (실적행사폴더파일인가_(file, ev.id)) file.setTrashed(true); } catch (e) {}
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- PDF 보고서에 들어가는 조각 (행사보고서_ 가 부릅니다) */

/** 확정된 정산이 있으면 그 스냅샷의 값, 아니면 지금 값 */
function 실적보고자료_(ev, g, txs, snap) {
  var details = 실적상세맵_(ev.id);
  if (snap && snap.lines) {
    var nv = {};
    snap.lines.forEach(function (l) { if (l.explain) nv[l.id] = { text: l.explain, by: '', at: '' }; });
    var n = snap.notes || {};
    return { details: details, summary: n.summary ? n.summary.text : '', remarks: n.remarks ? n.remarks.text : '',
      variance: 실적차이_(snap.lines, { variance: nv }), fx: snap.fx || [] };
  }
  var notes = 실적노트맵_(ev.id);
  return { details: details, summary: notes.summary ? notes.summary.text : '', remarks: notes.remarks ? notes.remarks.text : '',
    variance: 실적차이_(g.lines, notes), fx: 실적통화집계_(txs, details) };
}

function 실적거래보조글_(d) {
  if (!d) return '';
  var bits = [];
  if (d.currency !== 'CAD') bits.push(esc_(d.currency) + ' ' + d.foreign + ' × ' + d.rate);
  if (d.receipts.length) bits.push('영수증 ' + d.receipts.length + '건');
  return bits.length ? '<br><span style="color:#8B857C;font-size:9pt;">' + bits.join(' · ') + '</span>' : '';
}

function 실적통화표_(fx) {
  if (!fx || !fx.length) return '';
  return '<h2>통화별 합계</h2><table class="grid"><tr><th>통화</th><th>거래</th><th style="text-align:right;">지출 (원금액)</th><th style="text-align:right;">지출 (CAD)</th><th style="text-align:right;">수입 (원금액)</th><th style="text-align:right;">수입 (CAD)</th></tr>' +
    fx.map(function (x) {
      return '<tr><td>' + esc_(x.currency) + '</td><td>' + x.count + '건</td><td style="text-align:right;">' + x.expenseForeign + '</td><td style="text-align:right;">' + 돈표시_(x.expenseCad) +
        '</td><td style="text-align:right;">' + x.incomeForeign + '</td><td style="text-align:right;">' + 돈표시_(x.incomeCad) + '</td></tr>';
    }).join('') + '</table>';
}

function 실적요약글_(X) {
  return X.summary ? '<h2>Executive Summary</h2><div class="box" style="white-space:pre-wrap;">' + esc_(X.summary) + '</div>' : '';
}

function 실적비고글_(X) {
  return X.remarks ? '<h2>비고</h2><div class="box" style="white-space:pre-wrap;">' + esc_(X.remarks) + '</div>' : '';
}

/** 차이가 큰 항목 · 설명이 적힌 항목만 */
function 실적차이표_(X) {
  var rows = X.variance.rows.filter(function (r) { return r.needs || r.note; });
  if (!rows.length) return '';
  var R = 'text-align:right;';
  return '<h2>예산 대비 차이 설명</h2><table class="grid"><tr><th>항목</th><th style="' + R + '">예산</th><th style="' + R + '">실적</th><th style="' + R + '">차이</th><th>설명</th></tr>' +
    rows.map(function (r) {
      return '<tr><td style="font-weight:600;">' + esc_(r.name) + '</td><td style="' + R + '">' + 돈표시_(r.budget) + '</td><td style="' + R + '">' + 돈표시_(r.actual) + '</td><td style="' + R +
        (r.bad ? 'color:#A3261F;font-weight:700;' : '') + '">' + 행사금액글_(r.variance, true) + (r.pct != null ? ' (' + r.pct + '%)' : '') + '</td><td>' +
        (r.note ? esc_(r.note) : '<span style="color:#A3261F;">(설명 없음)</span>') + '</td></tr>';
    }).join('') + '</table>';
}
