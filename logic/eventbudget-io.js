/**
 * 행사 예산 — 엑셀 왕복 · PDF 보고서 (Step 3)
 * ============================================================
 * logic/eventbudget.js 뒤에 이어 붙는 파일입니다 (lib/runtime.js 의 EXTRA_FILES).
 *
 * ▣ 엑셀 왕복  내려받기 → 고치기 → 올리기
 *    1) budgetTemplateData   현재 예산 · 거래 + "버전"을 돌려줍니다. 브라우저(public/budget/xlsx-io.js)가 이것으로 .xlsx 를 만듭니다.
 *    2) (엑셀에서 고칩니다 — 새 줄은 ID 칸을 비워 두면 됩니다)
 *    3) budgetImportPreview  올린 파일(브라우저가 읽어 JSON 으로 보냄)을 검사해 "추가 · 수정 · 그대로 · 삭제" 를 미리 보여줍니다. 아무것도 저장하지 않습니다.
 *    4) budgetImportApply    같은 검사를 잠금 안에서 다시 하고, 오류가 없을 때만 한 번에 저장합니다 (부분 저장 없음).
 *    · 같은 ID = 수정 / ID 비어 있음 = 새로 만듦 / 파일에 없는 기존 줄 = 그대로 (합치기) 또는 삭제 (바꾸기)
 *    · 내려받은 뒤 다른 사람이 고쳤으면 (버전이 다름) 경고하고, 확인을 받아야 저장합니다.
 *    · 예산 항목을 바꾸려면 "관리", 거래를 바꾸려면 "입력" 등급이 필요합니다 (바뀐 것이 있을 때만 확인).
 *
 * ▣ PDF  예산서 · 거래 내역 · 정산서 — 기존 보고서 PDF 와 같은 방식(문서틀_ + PDF응답_)으로 서버에서 만듭니다.
 *    한글이 그대로 나오고 글자가 선택됩니다. 서버 변환이 막히면 화면이 같은 HTML 을 인쇄(PDF로 저장)로 대신합니다.
 */

var 엑셀형식_ = 'YNN-BUDGET-1';
var 가져오기줄한도_ = 3000;

function budgetTemplateData(key, eventId) {
  var c = 회계필수_(key, eventId, 1, '엑셀 내려받기');
  var ev = 행사필수_(eventId);
  var lines = 행사항목들_(ev.id), txs = 행사거래들_(ev.id);
  var nameOf = {};
  lines.forEach(function (l) { nameOf[l.id] = l.name; });
  return {
    format: 엑셀형식_, level: c.level, generatedAt: 행사시각_(),
    event: { id: ev.id, name: ev.name, year: ev.year, dept: ev.dept, owner: ev.owner, status: ev.status, version: ev.version, start: ev.start, end: ev.end },
    lines: lines.map(function (l) { return { id: l.id, kind: l.kind, category: l.category, name: l.name, amount: l.amount, memo: l.memo }; }),
    txs: txs.map(function (t) {
      return { id: t.id, date: t.date, kind: t.kind, lineId: t.lineId, lineName: nameOf[t.lineId] || '', detail: t.detail, amount: t.amount,
        method: t.method, note: t.note, expNo: t.expNo };
    }),
    methods: 행사결제수단_
  };
}

function 같은줄인가_(a, b, keys) {
  for (var i = 0; i < keys.length; i++) {
    var x = a[keys[i]], y = b[keys[i]];
    if (typeof x === 'number' || typeof y === 'number') { if (돈_(x) !== 돈_(y)) return false; }
    else if (String(x == null ? '' : x).trim() !== String(y == null ? '' : y).trim()) return false;
  }
  return true;
}

/** 올린 자료를 지금 시트와 견주어 계획을 세웁니다 (저장하지 않음) */
function 행사가져오기계획_(ev, payload, opts, level) {
  opts = opts || {};
  var mode = opts.mode === 'replace' ? 'replace' : 'merge';
  var errors = [], warnings = [];
  var err = function (sheet, row, msg) { errors.push({ sheet: sheet, row: row || 0, message: msg }); };
  payload = payload || {};
  if (payload.format && payload.format !== 엑셀형식_) err('', 0, '이 프로그램에서 내려받은 엑셀 파일이 아닙니다.');
  if (payload.eventId && String(payload.eventId).trim() !== ev.id) err('', 0, '이 파일은 다른 행사(' + payload.eventId + ')에서 내려받은 것입니다.');
  var stale = payload.version != null && String(payload.version) !== '' && parseInt(payload.version, 10) !== ev.version;
  if (stale) warnings.push('파일을 내려받은 뒤 다른 사람이 이 행사를 고쳤습니다 (파일 버전 ' + payload.version + ' → 지금 ' + ev.version + '). 저장하면 그 변경 위에 덮어씁니다.');

  var 지금항목 = 행사항목들_(ev.id), 지금거래 = 행사거래들_(ev.id);
  var lineById = {}; 지금항목.forEach(function (l) { lineById[l.id] = l; });
  var txById = {}; 지금거래.forEach(function (t) { txById[t.id] = t; });

  var inLines = Array.isArray(payload.lines) ? payload.lines : null;
  var inTxs = Array.isArray(payload.txs) ? payload.txs : null;
  if ((inLines && inLines.length > 가져오기줄한도_) || (inTxs && inTxs.length > 가져오기줄한도_)) err('', 0, '한 번에 ' + 가져오기줄한도_ + '줄까지만 올릴 수 있습니다.');
  if (!inLines && !inTxs) err('', 0, '올릴 내용이 없습니다. (예산 시트 · 거래 시트를 찾지 못했습니다)');

  /* ---- 예산 항목 ---- */
  var L = { add: [], update: [], same: 0, remove: [] }, finalLines = null;
  if (inLines) {
    var seen = {}, seenName = {}, keep = {};
    inLines.forEach(function (raw) {
      var row = raw.row || 0, id = String(raw.id || '').trim(), kind = String(raw.kind || '').trim();
      var name = String(raw.name || '').trim(), category = String(raw.category || '').trim(), memo = String(raw.memo || '').trim();
      var blank = !id && !kind && !name && !category && (raw.amount === '' || raw.amount == null) && !memo;
      if (blank) return;
      if (행사구분들_.indexOf(kind) === -1) return err('예산', row, '구분은 지출 또는 수입이어야 합니다 (지금: "' + kind + '").');
      if (!name) return err('예산', row, '항목명이 비어 있습니다.');
      if (raw.amount === '' || raw.amount == null || !isFinite(Number(String(raw.amount).replace(/,/g, '')))) return err('예산', row, '예산액이 숫자가 아닙니다 ("' + raw.amount + '").');
      var amount = 돈_(raw.amount);
      if (amount < 0) return err('예산', row, '예산액은 0 이상이어야 합니다.');
      var nk = kind + '|' + name;
      if (seenName[nk]) return err('예산', row, '같은 이름의 ' + kind + ' 항목이 파일에 두 번 있습니다: ' + name + ' (' + seenName[nk] + '행과 중복)');
      seenName[nk] = row;
      var item = { id: id, kind: kind, category: category, name: name, amount: amount, memo: memo, row: row };
      if (id) {
        if (seen[id]) return err('예산', row, '항목ID ' + id + ' 가 파일에 두 번 있습니다.');
        seen[id] = 1;
        var cur = lineById[id];
        if (!cur) return err('예산', row, '항목ID ' + id + ' 는 이 행사에 없습니다. (새 항목은 ID 칸을 비워 두세요)');
        keep[id] = 1;
        if (같은줄인가_(item, cur, ['kind', 'category', 'name', 'amount', 'memo'])) L.same++;
        else L.update.push({ id: id, row: row, before: cur, after: item });
      } else {
        var clash = 지금항목.filter(function (l) { return l.kind === kind && l.name === name; })[0];
        if (clash) return err('예산', row, '이미 있는 ' + kind + ' 항목입니다: ' + name + ' (' + clash.id + '). 고치려면 항목ID를 그대로 두세요.');
        L.add.push(item);
      }
    });
    if (mode === 'replace') 지금항목.forEach(function (l) { if (!keep[l.id]) L.remove.push({ id: l.id, before: l }); });
  }

  /* ---- 최종 예산 항목 (거래가 가리킬 수 있는 것) ---- */
  var finalById = {}, finalByName = {};
  var removedIds = {}; L.remove.forEach(function (r) { removedIds[r.id] = 1; });
  지금항목.forEach(function (l) { if (!removedIds[l.id]) finalById[l.id] = l; });
  L.update.forEach(function (u) { finalById[u.id] = { id: u.id, kind: u.after.kind, name: u.after.name }; });
  Object.keys(finalById).forEach(function (id) { finalByName[finalById[id].kind + '|' + finalById[id].name] = finalById[id]; });
  L.add.forEach(function (a) { finalByName[a.kind + '|' + a.name] = { id: '', kind: a.kind, name: a.name, isNew: true }; });

  /* ---- 거래 ---- */
  var T = { add: [], update: [], same: 0, remove: [] }, unassigned = 0;
  if (inTxs) {
    var seenT = {}, keepT = {}, today = ymd_(new Date());
    inTxs.forEach(function (raw) {
      var row = raw.row || 0, id = String(raw.id || '').trim(), kind = String(raw.kind || '').trim(), ref = String(raw.line || '').trim();
      var detail = String(raw.detail || '').trim(), method = String(raw.method || '').trim(), note = String(raw.note || '').trim();
      var date = String(raw.date || '').trim();
      var blank = !id && !date && !kind && !ref && !detail && (raw.amount === '' || raw.amount == null);
      if (blank) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00').getTime())) return err('거래', row, '날짜는 2026-09-30 형식이어야 합니다 (지금: "' + date + '").');
      if (date > today) return err('거래', row, '날짜가 오늘보다 뒤입니다: ' + date);
      if (행사구분들_.indexOf(kind) === -1) return err('거래', row, '구분은 지출 또는 수입이어야 합니다 (지금: "' + kind + '").');
      if (!detail) return err('거래', row, '내용이 비어 있습니다.');
      if (raw.amount === '' || raw.amount == null || !isFinite(Number(String(raw.amount).replace(/,/g, '')))) return err('거래', row, '금액이 숫자가 아닙니다 ("' + raw.amount + '").');
      var amount = 돈_(raw.amount);
      if (amount <= 0) return err('거래', row, '금액은 0보다 커야 합니다.');
      var lineId = '', lineIsNewName = '';
      if (ref) {
        if (removedIds[ref]) return err('거래', row, '삭제하려는 예산 항목 ' + ref + ' 를 이 거래가 가리킵니다. 거래의 항목을 바꾸거나 함께 지워주세요.');
        var byId = finalById[ref];
        if (byId) lineId = byId.id;
        else {
          var byName = finalByName[kind + '|' + ref];
          if (byName) { lineId = byName.id; if (byName.isNew) lineIsNewName = ref; }
          else return err('거래', row, '예산항목 "' + ref + '" 을(를) 찾을 수 없습니다 (항목ID 또는 ' + kind + ' 항목명). 비워 두면 미분류로 들어갑니다.');
        }
        if (lineId && finalById[lineId] && finalById[lineId].kind !== kind) return err('거래', row, '예산항목(' + finalById[lineId].name + ')의 구분(' + finalById[lineId].kind + ')과 거래 구분(' + kind + ')이 다릅니다.');
      } else unassigned++;
      var item = { id: id, date: date, kind: kind, lineId: lineId, lineNew: lineIsNewName, detail: detail, amount: amount, method: method, note: note, row: row };
      if (id) {
        if (seenT[id]) return err('거래', row, '거래ID ' + id + ' 가 파일에 두 번 있습니다.');
        seenT[id] = 1;
        var cur = txById[id];
        if (!cur) return err('거래', row, '거래ID ' + id + ' 는 이 행사에 없습니다. (새 거래는 ID 칸을 비워 두세요)');
        keepT[id] = 1;
        if (!lineIsNewName && 같은줄인가_(item, cur, ['date', 'kind', 'lineId', 'detail', 'amount', 'method', 'note'])) T.same++;
        else T.update.push({ id: id, row: row, before: cur, after: item });
      } else T.add.push(item);
    });
    if (mode === 'replace') 지금거래.forEach(function (t) { if (!keepT[t.id]) T.remove.push({ id: t.id, before: t }); });
  }
  if (unassigned) warnings.push('예산항목이 비어 있는 거래 ' + unassigned + '건은 "미분류"로 들어갑니다 (정산 전에 항목을 연결하세요).');

  /* ---- 삭제되는 예산 항목을 가리키는 거래 ---- */
  if (L.remove.length) {
    var 남는거래 = {};
    지금거래.forEach(function (t) { 남는거래[t.id] = t; });
    T.remove.forEach(function (r) { delete 남는거래[r.id]; });
    T.update.forEach(function (u) { 남는거래[u.id] = u.after; });
    if (!inTxs) Object.keys(남는거래).forEach(function (id) { if (removedIds[남는거래[id].lineId]) err('예산', 0, '삭제하려는 예산 항목 ' + 남는거래[id].lineId + ' 에 거래(' + id + ')가 있습니다.'); });
    else Object.keys(남는거래).forEach(function (id) {
      var t = 남는거래[id];
      if (t.lineId && removedIds[t.lineId]) err('예산', 0, '삭제하려는 예산 항목 ' + t.lineId + ' 를 거래(' + id + ')가 아직 가리킵니다.');
    });
  }

  var lineChanges = L.add.length + L.update.length + L.remove.length, txChanges = T.add.length + T.update.length + T.remove.length;
  var needLevel = lineChanges ? 4 : (txChanges ? 2 : 1);
  if (!errors.length) {
    if (lineChanges && level < 4) err('예산', 0, '예산 항목을 바꾸려면 회계 "관리" 권한이 필요합니다 (지금 ' + 회계등급이름_[level] + ').');
    if (txChanges && level < 2) err('거래', 0, '거래를 바꾸려면 회계 "입력" 권한이 필요합니다 (지금 ' + (회계등급이름_[level] || '없음') + ').');
  }
  if (!errors.length && !lineChanges && !txChanges) warnings.push('바뀐 내용이 없습니다.');
  return { mode: mode, stale: stale, errors: errors, warnings: warnings, lines: L, txs: T, needLevel: needLevel,
    hasLines: !!inLines, hasTxs: !!inTxs };
}

function 계획요약_(plan) {
  var brief = function (arr, f) { return arr.slice(0, 50).map(f); };
  return {
    ok: plan.errors.length === 0, stale: plan.stale, mode: plan.mode, errors: plan.errors.slice(0, 100), errorCount: plan.errors.length, warnings: plan.warnings,
    lines: { add: plan.lines.add.length, update: plan.lines.update.length, same: plan.lines.same, remove: plan.lines.remove.length,
      addSample: brief(plan.lines.add, function (x) { return { row: x.row, kind: x.kind, name: x.name, amount: x.amount }; }),
      updateSample: brief(plan.lines.update, function (u) { return { row: u.row, id: u.id, name: u.after.name, from: u.before.amount, to: u.after.amount }; }),
      removeSample: brief(plan.lines.remove, function (r) { return { id: r.id, name: r.before.name, amount: r.before.amount }; }) },
    txs: { add: plan.txs.add.length, update: plan.txs.update.length, same: plan.txs.same, remove: plan.txs.remove.length,
      addSample: brief(plan.txs.add, function (x) { return { row: x.row, date: x.date, kind: x.kind, detail: x.detail, amount: x.amount }; }),
      updateSample: brief(plan.txs.update, function (u) { return { row: u.row, id: u.id, detail: u.after.detail, from: u.before.amount, to: u.after.amount }; }),
      removeSample: brief(plan.txs.remove, function (r) { return { id: r.id, detail: r.before.detail, amount: r.before.amount }; }) }
  };
}

/** 미리보기 — 아무것도 저장하지 않습니다. opts { mode: 'merge' | 'replace' } */
function budgetImportPreview(key, eventId, payload, opts) {
  var c = 회계필수_(key, eventId, 1, '엑셀 올리기 미리보기');
  var ev = 행사필수_(eventId);
  var plan = 행사가져오기계획_(ev, payload, opts, c.level);
  var out = 계획요약_(plan);
  if (ev.status === '정산완료') { out.ok = false; out.errors.unshift({ sheet: '', row: 0, message: '정산이 끝난 행사입니다. 정산을 다시 연 뒤 올려주세요.' }); out.errorCount++; }
  흐름잠금메시지_(ev, plan).forEach(function (m) { out.ok = false; out.errors.unshift({ sheet: '', row: 0, message: m }); out.errorCount++; });   // Step 8 — 승인 단계 잠금
  out.currentVersion = ev.version;
  return out;
}

/** 적용 — opts { mode, acceptStale }. 오류가 하나라도 있으면 아무것도 저장하지 않습니다 */
function budgetImportApply(key, eventId, payload, opts) {
  opts = opts || {};
  var c = 회계필수_(key, eventId, 2, '엑셀 올리기');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ev = 행사필수_(eventId); 행사열려있어야_(ev);
    var plan = 행사가져오기계획_(ev, payload, opts, c.level);
    if (plan.errors.length) {
      var e = new Error('엑셀 내용에 오류가 ' + plan.errors.length + '건 있어 저장하지 않았습니다. 첫 오류: ' +
        (plan.errors[0].sheet ? plan.errors[0].sheet + ' ' + plan.errors[0].row + '행 — ' : '') + plan.errors[0].message);
      throw e;
    }
    var 잠금 = 흐름잠금메시지_(ev, plan);                 // Step 8 — 승인 단계 잠금 (바뀌는 줄이 있을 때만)
    if (잠금.length) throw new Error(잠금[0]);
    if (plan.stale && !opts.acceptStale) throw new Error('내려받은 뒤 다른 사람이 이 행사를 고쳤습니다. 미리보기를 다시 하거나 "그래도 저장"을 선택해주세요.');
    var now = 행사시각_(), name = c.subject.name;

    /* 예산 항목 — 이 행사 줄만 다시 만들어 다른 행사 줄과 합칩니다 */
    var 새항목ID = {};                                   // 항목명(구분|이름) → 새로 받은 ID (거래가 이름으로 가리킨 경우)
    if (plan.hasLines) {
      var 전체 = 행사표_(SHEET_행사항목), 다른 = 전체.filter(function (r) { return String(r[EVL_행사]).trim() !== ev.id; });
      var 지금 = 행사항목들_(ev.id), byId = {};
      지금.forEach(function (l) { byId[l.id] = l; });
      plan.lines.update.forEach(function (u) { byId[u.id] = { id: u.id, kind: u.after.kind, category: u.after.category, name: u.after.name, amount: u.after.amount, memo: u.after.memo, order: byId[u.id].order }; });
      plan.lines.remove.forEach(function (r) { delete byId[r.id]; });
      var ids = Object.keys(byId), order = ids.reduce(function (m, id) { return Math.max(m, byId[id].order || 0); }, 0);
      plan.lines.add.forEach(function (a) {
        var nid = 다음번호_(ids, 'B'); ids.push(nid); order++;
        byId[nid] = { id: nid, kind: a.kind, category: a.category, name: a.name, amount: a.amount, memo: a.memo, order: order };
        새항목ID[a.kind + '|' + a.name] = nid;
      });
      var mine = Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) { return a.order - b.order; });
      var rows = 다른.concat(mine.map(function (l) { return [ev.id, l.id, l.kind, l.category, l.name, l.amount, l.memo, l.order]; }));
      행사표쓰기_(SHEET_행사항목, HEAD_행사항목, rows);
    }
    /* 거래 */
    if (plan.hasTxs) {
      var 거래전체 = 행사표_(SHEET_행사거래), 다른거래 = 거래전체.filter(function (r) { return String(r[EVT_행사]).trim() !== ev.id; });
      var 지금거래 = 행사거래들_(ev.id), tById = {};
      지금거래.forEach(function (t) { tById[t.id] = t; });
      var resolve = function (x) { return x.lineId || (x.lineNew ? 새항목ID[x.kind + '|' + x.lineNew] || '' : ''); };
      plan.txs.update.forEach(function (u) {
        var o = tById[u.id];
        tById[u.id] = { id: u.id, date: u.after.date, kind: u.after.kind, lineId: resolve(u.after), detail: u.after.detail, amount: u.after.amount, method: u.after.method,
          note: u.after.note, expNo: o.expNo, by: o.by, at: o.at, updatedAt: now };
      });
      plan.txs.remove.forEach(function (r) { delete tById[r.id]; });
      var tids = Object.keys(tById);
      plan.txs.add.forEach(function (a) {
        var nid = 다음번호_(tids, 'T'); tids.push(nid);
        tById[nid] = { id: nid, date: a.date, kind: a.kind, lineId: resolve(a), detail: a.detail, amount: a.amount, method: a.method, note: a.note, expNo: '', by: name, at: now, updatedAt: now };
      });
      var 내거래 = Object.keys(tById).map(function (id) { return tById[id]; }).sort(function (a, b) { return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.id < b.id ? -1 : 1); });
      var 행 = 다른거래.concat(내거래.map(function (t) { return [ev.id, t.id, t.date, t.kind, t.lineId, t.detail, t.amount, t.method, t.note, t.expNo, t.by, t.at, t.updatedAt]; }));
      행사표쓰기_(SHEET_행사거래, HEAD_행사거래, 행, [EVT_날짜, EVT_입력, EVT_수정]);
      var 버릴영수증 = 실적가져오기정리_(ev.id, plan.txs.remove.map(function (r) { return r.id; }),     // Step 9 — 지운 · 금액이 바뀐 거래의 통화 · 영수증 상세
        plan.txs.update.map(function (u) { return { id: u.id, amount: u.after.amount }; }));
    }
    var ver = 행사올림_(ev.id, name);
    if (ev.status === '예산작성' && (plan.txs.add.length || plan.txs.update.length)) 행사상태바꿈_(ev.id, '진행중');
    행사이력_(ev.id, name, '엑셀 올리기', '예산 +' + plan.lines.add.length + ' ~' + plan.lines.update.length + ' -' + plan.lines.remove.length +
      ' / 거래 +' + plan.txs.add.length + ' ~' + plan.txs.update.length + ' -' + plan.txs.remove.length + ' (' + plan.mode + (plan.stale ? ', 낡은 파일 허용' : '') + ')');
    캐시비움_();
    var res = 계획요약_(plan); res.applied = true; res.version = ver;
    if (typeof 버릴영수증 !== 'undefined' && 버릴영수증.length) 실적파일버리기_(ev.id, 버릴영수증);
    return res;
  } finally { lock.releaseLock(); }
}

/* ---------------------------------------------------------------- PDF 보고서 */

function 행사금액글_(n, sign) {
  n = 돈_(n);
  var s = 돈표시_(Math.abs(n));
  return (n < 0 ? '-' : (sign && n > 0 ? '+' : '')) + s;
}

function 행사보고서_(ev, lines, txs, kind, settlement) {
  var g = 행사집계_(lines, txs), T = g.totals;
  var snap = settlement && settlement.snapshot ? settlement.snapshot : null;
  var X = 실적보고자료_(ev, g, txs, snap);     // Step 9 — 통화 · 영수증 · 요약 · 비고 · 차이 설명
  var lineName = {};
  lines.forEach(function (l) { lineName[l.id] = l.name; });
  var meta = esc_(ev.id) + ' &nbsp;·&nbsp; ' + esc_(ev.year) + '년' + (ev.dept ? ' &nbsp;·&nbsp; ' + esc_(ev.dept) : '') +
    (ev.start ? ' &nbsp;·&nbsp; ' + esc_(ev.start) + (ev.end && ev.end !== ev.start ? ' ~ ' + esc_(ev.end) : '') : '');
  var th = function (cells) { return '<tr>' + cells.map(function (c) { return '<th style="' + (c[1] || '') + '">' + c[0] + '</th>'; }).join('') + '</tr>'; };
  var td = function (cells) { return '<tr>' + cells.map(function (c) { return '<td style="' + (c[1] || '') + '">' + c[0] + '</td>'; }).join('') + '</tr>'; };
  var R = 'text-align:right;', W = 'width:auto;';
  var body = '';

  if (kind === 'budget') {
    var part = function (title, k) {
      var ls = g.lines.filter(function (l) { return l.kind === k; });
      if (!ls.length) return '<h2>' + title + '</h2><div class="box">등록된 항목이 없습니다.</div>';
      var sum = ls.reduce(function (s, l) { return s + l.budget; }, 0);
      return '<h2>' + title + '</h2><table class="grid">' + th([['분류', W], ['항목', W], ['예산액', W + R], ['메모', W]]) +
        ls.map(function (l) { return td([[esc_(l.category), ''], [esc_(l.name), 'font-weight:600;'], [돈표시_(l.budget), R], [esc_(l.memo), 'color:#6E6962;font-size:9.5pt;']]); }).join('') +
        td([['', ''], ['<b>합계</b>', ''], ['<b>' + 돈표시_(sum) + '</b>', R], ['', '']]) + '</table>';
    };
    body = '<table><tr><th>담당</th><td>' + esc_(ev.owner || '—') + '</td><th>상태</th><td>' + esc_(ev.status) + '</td></tr></table>' +
      part('지출 예산', '지출') + part('수입 예산', '수입') +
      '<h2>예산 요약</h2><table class="grid">' +
        td([['총 지출 예산', W], [돈표시_(T.budgetExpense), R]]) + td([['총 수입 예산', W], [돈표시_(T.budgetIncome), R]]) +
        td([['<b>예상 순손익 (수입 − 지출)</b>', W], ['<b>' + 행사금액글_(T.plannedNet) + '</b>', R]]) + '</table>' +
      (ev.memo ? '<h2>메모</h2><div class="box">' + esc_(ev.memo) + '</div>' : '');
    return { title: '행사 예산서', html: 문서틀_('행사 예산서', esc_(ev.name) + ' &nbsp;·&nbsp; ' + meta, body), filename: '행사예산서_' + ev.name };
  }

  if (kind === 'transactions') {
    var run = 0;
    var rowsHtml = txs.map(function (t) {
      run += t.kind === '지출' ? -t.amount : t.amount;
      return td([[esc_(t.date), 'white-space:nowrap;'], [esc_(t.kind), t.kind === '수입' ? 'color:#1D7A56;' : ''], [esc_(lineName[t.lineId] || 행사미분류_), ''],
        [esc_(t.detail) + (t.method ? '<br><span style="color:#8B857C;font-size:9pt;">' + esc_(t.method) + (t.expNo ? ' · ' + esc_(t.expNo) : '') + '</span>' : '') + 실적거래보조글_(X.details[t.id]), ''],
        [(t.kind === '수입' ? '+' : '-') + 돈표시_(t.amount), R], [행사금액글_(Math.round(run * 100) / 100), R + 'color:#6E6962;']]);
    }).join('');
    var perLine = g.lines.map(function (l) {
      return td([[esc_(l.name), ''], [esc_(l.kind), ''], [돈표시_(l.budget), R], [돈표시_(l.actual), R], [행사금액글_(l.diff, true), R + (l.over ? 'color:#A3261F;font-weight:700;' : '')]]);
    }).join('');
    if (g.unassigned.count) perLine += td([[행사미분류_, ''], ['', ''], ['', ''], [돈표시_(g.unassigned.expense + g.unassigned.income), R], ['', '']]);
    body = '<h2>거래 내역 · ' + txs.length + '건</h2><table class="grid">' +
        th([['날짜', W], ['구분', W], ['예산 항목', W], ['내용', W], ['금액', W + R], ['누계(수입−지출)', W + R]]) +
        (rowsHtml || td([['거래가 없습니다.', '']])) + '</table>' +
      '<h2>항목별 실적</h2><table class="grid">' + th([['항목', W], ['구분', W], ['예산', W + R], ['실적', W + R], ['차이', W + R]]) + perLine + '</table>' +
      '<h2>합계 (CAD)</h2><table class="grid">' + td([['실지출', W], [돈표시_(T.actualExpense), R]]) + td([['실수입', W], [돈표시_(T.actualIncome), R]]) +
        td([['<b>순손익</b>', W], ['<b>' + 행사금액글_(T.actualNet) + '</b>', R]]) + '</table>' + 실적통화표_(X.fx);
    return { title: '거래 내역', html: 문서틀_('거래 내역', esc_(ev.name) + ' &nbsp;·&nbsp; ' + meta, body), filename: '거래내역_' + ev.name };
  }

  // settlement — 확정된 정산이 있으면 그 스냅샷, 없으면 지금 값 (가정산)
  var S = snap ? snap : { lines: g.lines, totals: T, unassigned: g.unassigned, settledAt: '', settledBy: '' };
  var ST = S.totals || T;
  var 확정 = !!snap;
  var lrows = (S.lines || []).map(function (l) {
    var diff = l.diff != null ? l.diff : (l.kind === '지출' ? 돈_(l.budget - l.actual) : 돈_(l.actual - l.budget));
    var over = l.kind === '지출' && l.actual > l.budget;
    return td([[esc_(l.kind), ''], [esc_(l.name), 'font-weight:600;'], [돈표시_(l.budget), R], [돈표시_(l.actual), R],
      [행사금액글_(diff, true), R + (over ? 'color:#A3261F;font-weight:700;' : '')], [l.budget ? Math.round(l.actual / l.budget * 100) + '%' : '—', R]]);
  }).join('');
  var un = S.unassigned && S.unassigned.count ? td([[' ', ''], [행사미분류_ + ' (' + S.unassigned.count + '건)', ''], ['', ''], [돈표시_((S.unassigned.expense || 0) + (S.unassigned.income || 0)), R], ['', ''], ['', '']]) : '';
  body = '<table><tr><th>상태</th><td>' + (확정 ? '<b>정산 확정</b> · ' + esc_(S.settledAt) + ' · ' + esc_(S.settledBy) : '<b style="color:#A8420F;">가정산 (아직 확정되지 않음)</b>') + '</td></tr>' +
      (settlement && settlement.memo ? '<tr><th>정산 메모</th><td>' + esc_(settlement.memo) + '</td></tr>' : '') + '</table>' +
    '<h2>예산 대 실적</h2><table class="grid">' + th([['구분', W], ['항목', W], ['예산', W + R], ['실적', W + R], ['차이', W + R], ['집행률', W + R]]) + lrows + un + '</table>' +
    실적요약글_(X) + 실적차이표_(X) +
    '<h2>정산 결과</h2><table class="grid">' +
      td([['지출 예산', W], [돈표시_(ST.budgetExpense), R]]) + td([['실지출', W], [돈표시_(ST.actualExpense), R]]) +
      td([['<b>지출 잔액 (예산 − 실지출)</b>', W], ['<b>' + 행사금액글_(ST.expenseRemaining != null ? ST.expenseRemaining : ST.budgetExpense - ST.actualExpense, true) + '</b>', R]]) +
      td([['수입 예산', W], [돈표시_(ST.budgetIncome), R]]) + td([['실수입', W], [돈표시_(ST.actualIncome), R]]) +
      td([['<b>최종 순손익 (실수입 − 실지출)</b>', W], ['<b>' + 행사금액글_(ST.actualNet) + '</b>', R]]) + '</table>' + 실적통화표_(X.fx) + 실적비고글_(X) +
    '<table class="sign" style="margin-top:34px;"><tr><th style="text-align:center;">담당자 확인</th><th style="text-align:center;">회계팀 확인</th><th style="text-align:center;">담당 목사 확인</th></tr>' +
      '<tr><td style="height:56px;"></td><td></td><td></td></tr></table>';
  return { title: '행사 정산서', html: 문서틀_('행사 정산서', esc_(ev.name) + ' &nbsp;·&nbsp; ' + meta, body), filename: '행사정산서_' + ev.name };
}

function 행사보고서준비_(key, eventId, kind) {
  회계필수_(key, eventId, 1, '보고서 만들기');
  var ev = 행사필수_(eventId);
  kind = String(kind || '').trim();
  if (['budget', 'transactions', 'settlement'].indexOf(kind) === -1) throw new Error('보고서 종류는 budget · transactions · settlement 입니다.');
  var st = 행사정산들_(ev.id);
  var last = st.length ? st[st.length - 1] : null;
  // 정산서는 "현재 확정 상태" 일 때만 확정본을 씁니다 (다시 열린 뒤에는 가정산)
  return 행사보고서_(ev, 행사항목들_(ev.id), 행사거래들_(ev.id), kind, ev.status === '정산완료' ? last : null);
}

/** 화면 인쇄용 HTML (서버 PDF 변환이 막혔을 때의 대체 경로이기도 합니다) */
function budgetReportHtml(key, eventId, kind) {
  var r = 행사보고서준비_(key, eventId, kind);
  return { title: r.title, filename: r.filename, html: r.html };
}

function budgetReportPdf(key, eventId, kind) {
  var r = 행사보고서준비_(key, eventId, kind);
  return PDF응답_(r.html, r.filename.replace(/[\\\/:*?"<>|]/g, '_') + '_' + ymd_(new Date()));
}
