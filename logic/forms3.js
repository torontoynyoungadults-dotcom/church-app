/* =====================================================================
   forms3.js — Step 7 (신청서 조건부 표시 · 신청 상태 태그 · 대상 공유 · 앨범 공개 범위)
   ---------------------------------------------------------------------
   · lib/runtime.js 의 EXTRA_FILES 로 logic/app.js 뒤에 이어 붙습니다 (app.js 의 줄 번호는 그대로).
   · 끝에 _ 가 없는 함수(formSetAnswerStatus · formShareSave 등)만 화면에서 부를 수 있고,
     나머지(_ 로 끝나는 것)는 서버 안에서만 씁니다.
   · logic/app.js 에는 "Step 7" 이라고 적힌 작은 연결만 들어갑니다.
   ===================================================================== */

/* ---------------------------------------------------------------
   A. 조건부 표시 — "이 문항은 앞 문항의 답이 ○○일 때만 보입니다"
   ---------------------------------------------------------------
   문항에 showIf = { mode: 'all' | 'any', rules: [ { q, op, v } ] } 가 있으면 규칙에 따라 보이거나 숨깁니다.
   · 규칙에 쓰는 문항 q 는 "앞에 있는" 문항이어야 합니다 (뒤 문항을 쓰면 순환이 생겨서 저장할 때 걸러냅니다)
   · 숨겨진 문항은 답이 없는 것으로 봅니다: 필수여도 검사하지 않고, 답을 보내와도 저장하지 않습니다
   · 숨겨진 문항을 조건으로 쓰는 뒤 문항도 "답 없음" 으로 계산됩니다 (연쇄)
   · 화면(public/forms/forms-core.js 의 FormsCore.visibility)과 똑같은 규칙입니다 — 시험에서 같은 표로 대조합니다
   --------------------------------------------------------------- */
var 조건연산자3_ = ['eq', 'ne', 'has', 'nothas', 'filled', 'empty', 'gte', 'lte'];
var 조건기타값3_ = '__other__';         // "기타(직접 입력)" 를 고른 모든 답과 맞는 특수 값

/** 답 하나 → 비교할 글 목록 (배열 · 숫자 · 글 · 동의 모두 견딤) */
function 조건값들3_(a) {
  if (a == null || a === '' || a === false) return [];
  if (Array.isArray(a)) {
    return a.map(function (x) { return (x && typeof x === 'object') ? String(x.name || x.id || '') : String(x == null ? '' : x); })
      .filter(function (x) { return x !== ''; });
  }
  if (a === true) return ['true'];
  if (typeof a === 'object') return [String(a.name || a.id || '')].filter(function (x) { return x !== ''; });
  var s = String(a);
  return s === '' ? [] : [s];
}

function 조건같은가3_(x, v) {
  if (v === 조건기타값3_) return String(x).indexOf('기타:') === 0;
  return String(x).trim() === String(v).trim();
}

/** 규칙 하나가 맞는가 (a = 그 문항의 답, 숨겨졌거나 안 냈으면 undefined) */
function 규칙맞나3_(rule, a) {
  var vals = 조건값들3_(a), op = rule.op, v = rule.v, i;
  if (op === 'filled') return vals.length > 0;
  if (op === 'empty') return vals.length === 0;
  if (op === 'eq' || op === 'has') { for (i = 0; i < vals.length; i++) if (조건같은가3_(vals[i], v)) return true; return false; }
  if (op === 'ne' || op === 'nothas') { for (i = 0; i < vals.length; i++) if (조건같은가3_(vals[i], v)) return false; return true; }
  if (op === 'gte' || op === 'lte') {
    if (!vals.length) return false;
    var n = Number(vals[0]), t = Number(v);
    if (!isFinite(n) || !isFinite(t)) return false;
    return op === 'gte' ? n >= t : n <= t;
  }
  return true;
}

function 조건맞나3_(cond, answers) {
  if (!cond || !cond.rules || !cond.rules.length) return true;
  var any = cond.mode === 'any', hit;
  for (var i = 0; i < cond.rules.length; i++) {
    hit = 규칙맞나3_(cond.rules[i], answers[cond.rules[i].q]);
    if (any && hit) return true;
    if (!any && !hit) return false;
  }
  return !any;
}

/** 저장할 때: 규칙을 깨끗하게 (없는 문항 · 뒤 문항 · 알 수 없는 연산자 · 비교값 없음은 버림) */
function 조건정리3_(cond, prior) {
  if (!cond || typeof cond !== 'object') return null;
  var rules = (Array.isArray(cond.rules) ? cond.rules : []).slice(0, 5).map(function (r) {
    r = r || {};
    var qid = String(r.q == null ? '' : r.q).trim();
    if (!Object.prototype.hasOwnProperty.call(prior, qid)) return null;
    var op = String(r.op || 'eq');
    if (조건연산자3_.indexOf(op) === -1) return null;
    var v = '';
    if (op !== 'filled' && op !== 'empty') {
      v = String(r.v == null ? '' : r.v).trim().slice(0, 120);
      if (v === '') return null;
      if ((op === 'gte' || op === 'lte') && !isFinite(Number(v))) return null;
    }
    return { q: qid, op: op, v: v };
  }).filter(function (x) { return x; });
  if (!rules.length) return null;
  return { mode: cond.mode === 'any' ? 'any' : 'all', rules: rules };
}

/** 문항 목록 전체의 showIf 를 정리 (formSave 가 저장 직전에 한 번 부름) */
function 문항조건정리3_(qs) {
  var prior = {};
  (qs || []).forEach(function (q) {
    var c = 조건정리3_(q.showIf, prior);
    if (c) q.showIf = c; else delete q.showIf;
    if (q.type !== 'section') prior[q.id] = q.type;      // 안내글(section)은 답이 없어서 조건 대상이 못 됩니다
  });
  return qs;
}

/** 지금까지의 (다듬은) 답으로 이 문항이 보이는가 — 신청 저장 · 시험에서 씁니다 */
function 문항보임3_(q, clean) {
  return 조건맞나3_(q && q.showIf, clean || {});
}

/* ---------------------------------------------------------------
   B-1. 신청 상태 태그 (접수 · 미결제 · 결제완료 · 취소)
   ---------------------------------------------------------------
   신청내역 시트 맨 끝에 '상태' 칸(10번째)을 더합니다. 비어 있으면 '접수' 입니다.
   → 신청자가 고치기 위해 저장할 때 (앞의 9칸만 다시 씀) 상태가 지워지지 않습니다.
   '취소' 는 정원에 세지 않고, 결과 집계 · 알림 대상에서 뺍니다 (기록은 남음).
   --------------------------------------------------------------- */
var 신청상태3_ = ['접수', '미결제', '결제완료', '취소'];
var FA_상태3 = 9;
var 신청상태칸준비3_ = false;

function 상태정리3_(s) {
  s = String(s == null ? '' : s).trim();
  return 신청상태3_.indexOf(s) !== -1 ? s : '접수';
}
function 신청상태시트3_() {
  var sh = 신청답시트_();
  if (!신청상태칸준비3_) {
    try { ensureColumn_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_신청답, FA_상태3 + 1, '상태'); } catch (e) {}
    신청상태칸준비3_ = true;
  }
  return sh;
}

/** 정원 · 알림 대상에 세는 신청 (취소 제외) */
function 유효답행들3_(formId) {
  return 답행들_(formId).filter(function (a) { return a.status !== '취소'; });
}

function 상태집계3_(rows) {
  var c = {};
  신청상태3_.forEach(function (s) { c[s] = 0; });
  (rows || []).forEach(function (a) { c[상태정리3_(a.status)]++; });
  return c;
}

/**
 * 신청자의 상태를 바꿉니다 (여러 명을 한 번에).
 *   names  — 바꿀 사람 이름들 (최대 300명)
 *   status — 접수 · 미결제 · 결제완료 · 취소
 *   notify — true 면 바뀐 분들께 휴대폰 알림 (기본 끔)
 * 고칠 권한(커미티 · 만든 사람 · 담당 팀장)이 있어야 합니다. 공유로 "보기만" 하는 분은 못 바꿉니다.
 */
function formSetAnswerStatus(token, id, names, status, notify) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('신청 상태는 만든 사람 · 담당 팀장 · 커미티만 바꿀 수 있습니다.');
  if (신청상태3_.indexOf(String(status)) === -1) throw new Error('알 수 없는 상태입니다.');
  var list = (Array.isArray(names) ? names : [names]).map(function (x) { return String(x || '').trim(); })
    .filter(function (x) { return x; }).slice(0, 300);
  if (!list.length) throw new Error('바꿀 신청자를 골라주세요.');
  var want = {};
  list.forEach(function (n) { want[n] = 1; });

  var changed = [], lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = 신청상태시트3_(), v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][FA_폼]).trim() !== f.id) continue;
      var nm = String(v[i][FA_이름]).trim();
      if (!want[nm]) continue;
      if (상태정리3_(v[i][FA_상태3]) !== status) {
        sh.getRange(i + 1, FA_상태3 + 1).setValue(status);
        changed.push(nm);
      }
    }
  } finally { lock.releaseLock(); }
  캐시비움_();

  var pushed = 0;
  if (notify && changed.length) {
    try {
      var p = 알림_('공지', changed, { title: f.title + ' 신청 상태가 바뀌었습니다', body: '현재 상태: ' + status,
        url: 앱주소_() + '?page=portal', tag: 'form-status-' + f.id });
      pushed = (p && p.sent) || 0;
    } catch (e) {}
  }
  var rows = 답행들_(f.id);
  return { ok: true, changed: changed.length, pushed: pushed, counts: 상태집계3_(rows), count: rows.length };
}

/* ---------------------------------------------------------------
   B-2. 대상 공유 — 팀 · 셀 · 개인에게 "결과 보기" 를 열어주고, 새 신청 알림을 보낼지 고릅니다
   ---------------------------------------------------------------
   f.shares = [ { key: '팀:음악' | '셀:은혜셀' | '사람:홍길동', notify: true|false } ]  (최대 30)
   · 공유받은 사람은 그 신청서의 "신청 결과" 를 보고 엑셀로 받을 수 있습니다 (고치기 · 지우기 · 상태 바꾸기는 안 됩니다)
   · notify 를 켜 두면 새 신청이 들어올 때 그 사람(들)께 알림이 갑니다 (신청서의 "알림 받기" 와 따로)
   --------------------------------------------------------------- */
function 공유키정리3_(shares) {
  var seen = {}, cellNames = null, teamNames = null, out = [];
  (Array.isArray(shares) ? shares : []).slice(0, 60).forEach(function (s) {
    s = s || {};
    var key = String(s.key || '').trim().slice(0, 60);
    var m = /^(팀|셀|사람):(.+)$/.exec(key);
    if (!m) return;
    var name = m[2].trim();
    if (!name) return;
    key = m[1] + ':' + name;
    if (seen[key]) return;
    if (m[1] === '팀') { teamNames = teamNames || 사역팀목록_().map(function (t) { return t.name; }); if (teamNames.indexOf(name) === -1) return; }
    if (m[1] === '셀') { cellNames = cellNames || getCells().map(function (c) { return c.name; }); if (cellNames.indexOf(name) === -1) return; }
    seen[key] = 1;
    out.push({ key: key, notify: !!s.notify });
  });
  return out.slice(0, 30);
}

/** 공유 키 하나에 속한 사람 이름들 */
function 공유이름들3_(key) {
  var m = /^(팀|셀|사람):(.+)$/.exec(String(key || ''));
  if (!m) return [];
  var name = m[2].trim(), out = [];
  if (m[1] === '사람') return [name];
  if (m[1] === '팀') {
    사역팀목록_().forEach(function (t) {
      if (t.name !== name) return;
      if (t.leader) out.push(t.leader);
      (t.members || []).forEach(function (x) { out.push(x.name || x); });
    });
  } else {
    getCells().forEach(function (c) {
      if (c.name !== name) return;
      if (c.leader) out.push(c.leader);
      (c.members || []).forEach(function (x) { out.push(x); });
    });
  }
  var seen = {};
  return out.filter(function (n) { n = String(n || '').trim(); if (!n || seen[n]) return false; seen[n] = 1; return true; });
}

/** 이 사람이 이 신청서의 공유 대상인가 */
function 공유대상인가3_(name, f) {
  name = String(name || '').trim();
  if (!name || !f || !f.shares || !f.shares.length) return false;
  for (var i = 0; i < f.shares.length; i++) {
    if (공유이름들3_(f.shares[i].key).indexOf(name) !== -1) return true;
  }
  return false;
}

/** 어떤 신청서든 공유받은 적이 있는 사람인가 (포털 메뉴 · 열람 권한 확인용) */
function 공유받은사람3_(name) {
  try {
    return 신청서들_().some(function (f) { return f.status !== '보관' && 공유대상인가3_(name, f); });
  } catch (e) { return false; }
}

/**
 * 신청서 관리 화면에 들어올 수 있는 사람 — 커미티 · 팀장(예전 그대로) + 결과를 공유받은 분(보기만: who.viewer)
 * 공유받은 분이 아니면 예전과 똑같은 오류가 그대로 납니다.
 */
function 열람자3_(token) {
  try { return 신청서관리자_(token); } catch (e) {
    var me = null;
    try { me = 포털본인_(token); } catch (e2) { me = null; }
    if (me && 공유받은사람3_(me.name)) return { name: me.name, committee: false, teams: [], viewer: true };
    throw e;
  }
}

/** 새 신청이 들어올 때 알림을 받을 공유 대상 (notify 를 켠 것만, 신청한 본인은 제외) */
function 공유알림대상3_(f, exclude) {
  var seen = {}, out = [];
  (exclude || []).forEach(function (n) { seen[String(n)] = 1; });
  (f.shares || []).forEach(function (s) {
    if (!s.notify) return;
    공유이름들3_(s.key).forEach(function (n) { if (!seen[n]) { seen[n] = 1; out.push(n); } });
  });
  return out;
}

/** 신청이 들어왔을 때, 신청서의 기본 알림(f.notify)과 별개로 공유 대상에게 알림 (submitForm 이 부름) */
function 공유알림보내기3_(f, who, mine, count, alreadyTo) {
  var to = 공유알림대상3_(f, (alreadyTo || []).concat([who.name]));
  if (!to.length) return 0;
  var r = 알림_('공지', to, { title: f.title + ' 신청이 들어왔습니다',
    body: who.name + '님' + (mine ? ' (고침)' : '') + ' · 모두 ' + count + '명',
    url: 앱주소_() + '?page=forms', tag: 'form-' + f.id });
  return (r && r.sent) || 0;
}

/**
 * 공유 범위 저장 — 신청서를 고칠 수 있는 사람만.
 *   shares: [{ key: '팀:이름' | '셀:이름' | '사람:이름', notify: bool }]
 */
function formShareSave(token, id, shares) {
  var who = 신청서관리자_(token);
  var f = 신청서찾기_(id);
  if (!f) throw new Error('없는 신청서입니다.');
  if (!신청서만질수있나_(who, f)) throw new Error('공유 범위는 만든 사람 · 담당 팀장 · 커미티만 바꿀 수 있습니다.');
  var clean = 공유키정리3_(shares);
  신청서본문바꾸기3_(f, function (body) { body.shares = clean; });
  return { ok: true, shares: clean };
}

/** 신청서 본문(JSON)의 일부만 바꿔 다시 저장 — formSave 의 조각 나누기와 같은 방식 */
function 신청서본문바꾸기3_(f, mutate) {
  var sh = 신청서시트_(), v = sh.getDataRange().getValues(), at = 0;
  for (var r = 1; r < v.length; r++) if (String(v[r][FM_ID]).trim() === f.id) { at = r + 1; break; }
  if (!at) throw new Error('없는 신청서입니다.');
  var row = v[at - 1], parts = [];
  for (var i = FM_내용; i < row.length; i++) {
    var s = String(row[i] == null ? '' : row[i]);
    if (s.charAt(0) === "'") s = s.slice(1);
    parts.push(s);
  }
  var body = {};
  try { body = JSON.parse(parts.join('')) || {}; } catch (e) { body = {}; }
  mutate(body);
  var json = JSON.stringify(body);
  if (json.length > 신청서조각 * 6) throw new Error('신청서 내용이 너무 깁니다.');
  var chunks = [];
  for (var k = 0; k < json.length; k += 신청서조각) chunks.push("'" + json.slice(k, k + 신청서조각));
  var width = Math.max(sh.getLastColumn(), FM_내용 + chunks.length);
  var vals = [];
  for (var c = 0; c < width - FM_내용; c++) vals.push(c < chunks.length ? chunks[c] : '');
  sh.getRange(at, FM_내용 + 1, 1, vals.length).setValues([vals]);
  캐시비움_();
}

/** 신청서 관리 화면에서 사람을 고를 후보 (커미티는 전체, 팀장은 자기 팀 사람만) — 이름만 내려줍니다 */
function 공유후보사람3_(who) {
  var names = [];
  if (who.committee) {
    try { var map = 교적맵_(); names = Object.keys(map); } catch (e) { names = []; }
  } else {
    사역팀목록_().forEach(function (t) {
      if (who.teams.indexOf(t.name) === -1) return;
      if (t.leader) names.push(t.leader);
      (t.members || []).forEach(function (m) { names.push(m.name); });
    });
  }
  var seen = {};
  return names.map(function (n) { return String(n || '').trim(); })
    .filter(function (n) { if (!n || seen[n]) return false; seen[n] = 1; return true; })
    .sort(function (a, b) { return a.localeCompare(b, 'ko'); }).slice(0, 1500);
}

/** "신청 받는다고 알리기" 의 받는 사람 — 여러 그룹 · 개인을 합칩니다 (하나면 예전과 똑같이 동작) */
function 대상사람들3_(targets) {
  if (!Array.isArray(targets)) return 대상사람_(targets);
  var list = targets.map(function (x) { return String(x || '').trim(); }).filter(function (x) { return x; });
  if (!list.length) return 대상사람_('전체');
  if (list.indexOf('전체') !== -1) return '*';
  var seen = {}, out = [];
  list.forEach(function (k) {
    var r = 대상사람_(k);
    if (r === '*') { out = '*'; return; }
    if (out === '*') return;
    (r || []).forEach(function (n) { n = String(n || '').trim(); if (n && !seen[n]) { seen[n] = 1; out.push(n); } });
  });
  return out;
}

/** 포털 공지의 받는 사람 — 예전 한 줄(역할 · 팀 · 셀 이름)과 새 형식("팀:음악|사람:홍길동")을 모두 이해합니다 */
function 공지대상맞나3_(target, who, roles) {
  target = String(target || '').trim();
  if (!target || target === '전체') return true;
  var parts = target.split('|'), i, p;
  for (i = 0; i < parts.length; i++) {
    p = parts[i].trim();
    if (!p) continue;
    if (p === '전체') return true;
    if (p.indexOf(':') === -1 && p !== '셀장' && p !== '팀장') {
      if (roles && (roles.roles.indexOf(p) !== -1 || roles.teams.indexOf(p) !== -1 || roles.cells.indexOf(p) !== -1)) return true;
      continue;
    }
    if ((p === '셀장' || p === '팀장') && roles && roles.roles.indexOf(p) !== -1) return true;
    var names = 대상사람_(p);
    if (names === '*' || (names || []).indexOf(who.name) !== -1) return true;
  }
  return false;
}

/* ---------------------------------------------------------------
   C. 포토 앨범 공개 범위
   ---------------------------------------------------------------
   포토앨범 시트 맨 끝에 '공개범위' 칸(10번째)을 더합니다 (JSON). 비어 있으면 예전처럼 "등록된 교인 누구나".
     { mode: 'registered' }                               — 등록 교인 전체 (기본 · 예전과 같음)
     { mode: 'restricted', teams: ['음악'], cells: ['은혜셀'] } — 고른 사역팀 · 셀의 사람만
   restricted 일 때 볼 수 있는 사람: 커미티 · 앨범 만든 사람 · 그 앨범을 고칠 수 있는 사람(셀장 · 팀장)
                                    · 고른 팀 · 셀의 팀장 · 팀원 · 셀장 · 셀원
   --------------------------------------------------------------- */
function 앨범공개파싱3_(v) {
  var o = null;
  try { o = typeof v === 'string' ? JSON.parse(v || 'null') : v; } catch (e) { o = null; }
  if (!o || o.mode !== 'restricted') return { mode: 'registered', teams: [], cells: [] };
  var arr = function (x) { return (Array.isArray(x) ? x : []).map(function (s) { return String(s || '').trim().slice(0, 40); }).filter(function (s) { return s; }).slice(0, 40); };
  return { mode: 'restricted', teams: arr(o.teams), cells: arr(o.cells) };
}

/** 저장할 때: 실제로 있는 팀 · 셀만 남기고, 고른 것이 하나도 없으면 오류 */
function 앨범공개정리3_(d) {
  if (!d || d.mode !== 'restricted') return { mode: 'registered', teams: [], cells: [] };
  var teamNames = 사역팀목록_().map(function (t) { return t.name; });
  var cellNames = getCells().map(function (c) { return c.name; });
  var v = 앨범공개파싱3_(d);
  v.teams = v.teams.filter(function (t) { return teamNames.indexOf(t) !== -1; });
  v.cells = v.cells.filter(function (c) { return cellNames.indexOf(c) !== -1; });
  if (!v.teams.length && !v.cells.length) throw new Error('공개할 사역팀이나 셀을 하나 이상 골라주세요. (모두에게 보이려면 "등록 교인 전체" 로 바꾸세요.)');
  return v;
}

/** 이 사람(이름)이 이 앨범을 볼 수 있는가 — a 는 앨범하나_ 결과이거나 앨범요약_ 결과({category,target,by,vis}) */
function 앨범볼수있나3_(name, a, token) {
  var vis = a && (a.visibility || a.vis);
  if (!vis || vis.mode !== 'restricted') return true;
  name = String(name || '').trim();
  if (!name) return false;
  var r = 포털역할_(name);
  if (r.roles.indexOf('커미티') !== -1) return true;
  if (a.by && a.by === name) return true;
  if (a.category === '셀' && r.cells.indexOf(a.target) !== -1) return true;         // 그 앨범의 셀장
  if (a.category === '사역팀' && r.teams.indexOf(a.target) !== -1) return true;     // 그 앨범의 팀장
  var i, t, c;
  var teams = 사역팀목록_();
  for (i = 0; i < teams.length; i++) {
    t = teams[i];
    if (vis.teams.indexOf(t.name) === -1) continue;
    if (t.leader === name) return true;
    if ((t.members || []).some(function (m) { return (m.name || m) === name; })) return true;
  }
  var cells = getCells();
  for (i = 0; i < cells.length; i++) {
    c = cells[i];
    if (vis.cells.indexOf(c.name) === -1) continue;
    if (c.leader === name) return true;
    if ((c.members || []).indexOf(name) !== -1) return true;
  }
  return false;
}
