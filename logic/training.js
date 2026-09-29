/**
 * 제자훈련 — 단일 원천(Single Source of Truth) 조회 · 이전 도구
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 *
 * ▣ 원칙
 *    제자훈련에 관한 모든 것(명단 · 출석 · 진행 상태 · 수료 여부 · 출석률)은
 *      · 제자훈련명단  (누가 어느 기수에 있는가)
 *      · 제자훈련출결  (누가 어느 날 출석했는가)
 *      · 제자훈련기수  (기수별 시작일 · 주차 수 · 수료 기준)
 *    세 시트에만 있습니다. 교적의 '제자훈련' · '제자훈련출석' 칸에는 더 이상 쓰지 않습니다.
 *    프로필 · 셀원 목록 · 메일 같은 곳은 사람 이름을 열쇠로 이 시트들을 "찾아서" 보여줍니다.
 *
 * ▣ 열쇠 = 이름
 *    교적에는 회원번호 칸이 없고, 셀원명단 · 사역팀원 · 제자훈련명단이 모두 이름으로 이어져 있습니다.
 *    그 약속을 그대로 따르되, 열쇠를 만드는 자리를 훈련키_() 한 곳으로 모아 두었습니다.
 *    나중에 회원번호가 생기면 이 함수와 교적맵_ 의 키만 바꾸면 됩니다.
 *
 * ▣ 빠르게 — O(사람 + 출석 줄)
 *    시트를 한 번씩만 읽어 이름 → 훈련현황 해시 맵을 만들고 (훈련현황맵_),
 *    그 뒤 몇 명을 찾아도 맵 조회 한 번(O(1))입니다. 요청 안에서 캐시되고, 시트를 고치면(캐시비움_) 사라집니다.
 *
 * ▣ 옛 기록
 *    앱을 쓰기 전에 수료한 분처럼 "명단에 없는데 교적에만 수료라고 적힌" 분은
 *    옮기기 전까지는 교적 값을 예비로 읽습니다. discipleshipMigrate() 로 제자훈련명단(기수=LEGACY)으로 옮기면
 *    그 뒤로는 시트 하나만 봅니다.
 */

var 훈련_이전상태 = 7, 훈련_이전출석 = 8;          // 제자훈련명단 뒤쪽 칸 — 앱 도입 전 기록 (기수 = LEGACY 인 줄만 씁니다)
var 훈련이전기수_ = 'LEGACY';
var HEAD_제자훈련명단_ = ['이름', '등록일', '메모', '회비', '회비일', '회비메모', '기수', '이전상태', '이전출석'];
var _훈련현황캐시 = null;

/** 사람을 찾는 열쇠 (지금은 이름) */
function 훈련키_(name) { return String(name || '').trim(); }

/**
 * 이름 → { name, cohorts:[{id, name, start, status, finished, present, weeks, rate, soFar}], legacy:{status, rate}|null,
 *          status, rate }  — status / rate 는 프로필에 그대로 보여줄 요약값
 * 제자훈련명단에 한 번도 나오지 않는 사람은 들어 있지 않습니다.
 */
function 훈련현황맵_() {
  if (_훈련현황캐시) return _훈련현황캐시;
  var out = {};
  var 명단 = rows_(SHEET_제자훈련);
  if (!명단.length) { _훈련현황캐시 = out; return out; }          // 명단이 없으면 다른 시트는 읽지 않습니다

  var 기수들 = 훈련기수들_();
  var 첫기수 = 기수들[기수들.length - 1].id;                     // 기수 칸이 빈 옛 줄은 가장 오래된 기수
  var 기수맵 = {};
  기수들.forEach(function (c) { 기수맵[c.id] = { cfg: c, dates: 훈련일정_(c) }; });
  var 출결 = 훈련출결맵_(), today = ymd_(new Date());

  명단.forEach(function (r) {
    var key = 훈련키_(r[훈련_이름]);
    if (!key) return;
    var e = out[key] || (out[key] = { name: key, cohorts: [], legacy: null, status: '', rate: '' });
    var cid = String(r[훈련_기수] || '').trim() || 첫기수;

    if (cid === 훈련이전기수_) {
      e.legacy = { status: String(r[훈련_이전상태] || '').trim(), rate: String(r[훈련_이전출석] || '').trim() };
      return;
    }
    var c = 기수맵[cid];
    if (!c) return;                                              // 지워진 기수의 찌꺼기 줄은 무시
    var s = 훈련집계_(key, 출결, c.dates, c.cfg, today);
    e.cohorts.push({ id: c.cfg.id, name: c.cfg.name, start: c.cfg.start,
      status: s.finished ? s.status : '진행중', finished: s.finished,
      present: s.present, weeks: c.cfg.weeks, rate: s.rate, soFar: s.soFar });
  });

  Object.keys(out).forEach(function (k) { 훈련요약채우기_(out[k]); });
  _훈련현황캐시 = out;
  return out;
}

function 훈련비율글_(c) { return c.rate + '% (' + c.present + '/' + c.weeks + ')'; }

/** 프로필에 보여줄 한 줄 요약 — 수료 > 진행중 > 미이수 순으로 대표 기수를 고릅니다 */
function 훈련요약채우기_(e) {
  e.cohorts.sort(function (a, b) { return (b.start || '').localeCompare(a.start || ''); });   // 최근 기수 먼저
  var 수료 = e.cohorts.filter(function (c) { return c.status === '수료'; })[0];
  var 진행 = e.cohorts.filter(function (c) { return !c.finished; })[0];
  var 미이수 = e.cohorts.filter(function (c) { return c.status === '미이수'; })[0];
  var 이전수료 = e.legacy && e.legacy.status === '수료';

  if (수료 || 이전수료) {
    e.status = '수료';
    e.rate = 수료 ? 훈련비율글_(수료) : e.legacy.rate;
  } else if (진행) {
    e.status = '진행중'; e.rate = 훈련비율글_(진행);
  } else if (미이수) {
    e.status = '미이수'; e.rate = 훈련비율글_(미이수);
  } else if (e.legacy) {
    e.status = e.legacy.status; e.rate = e.legacy.rate;
  }
}

/** 이 사람의 훈련 현황 (없으면 null) */
function 훈련찾기_(name) {
  return 훈련현황맵_()[훈련키_(name)] || null;
}

/**
 * 교적 한 줄(맵의 한 사람)에 제자훈련 값을 "찾아서" 붙입니다.
 * 교적맵_ 은 거의 모든 요청에서 만들어지므로, 훈련 시트는 이 값을 처음 읽는 순간에만 읽습니다 (게으른 조회).
 * 제자훈련 시트에 없는 사람은 교적의 옛 값을 예비로 씁니다 (discipleshipMigrate 로 옮기기 전까지).
 */
function 훈련값붙이기_(entry, 옛상태, 옛출석) {
  var cache = null;
  function look() {
    if (!cache) {
      var t = 훈련찾기_(entry.name);
      cache = t && t.status ? { d: t.status, r: t.rate } : { d: 옛상태 || '', r: 옛출석 || '' };
    }
    return cache;
  }
  function lazy(prop, pick) {
    Object.defineProperty(entry, prop, {
      enumerable: true, configurable: true,
      get: function () { return pick(look()); },
      set: function (v) { Object.defineProperty(entry, prop, { value: v, enumerable: true, writable: true, configurable: true }); }
    });
  }
  lazy('discipleship', function (x) { return x.d; });
  lazy('trainingRate', function (x) { return x.r; });
  return entry;
}

/** 프로필 화면용 — 기수별 기록까지 (내정보_ 가 이어 붙입니다) */
function 훈련상세_(name) {
  var t = 훈련찾기_(name);
  if (!t) return null;
  return {
    status: t.status, rate: t.rate,
    cohorts: t.cohorts.map(function (c) {
      return { id: c.id, name: c.name, status: c.status, present: c.present, weeks: c.weeks, rate: c.rate };
    }),
    legacy: t.legacy
  };
}

/* ---------------------------------------------------------------- 이전 도구 (커미티) */

/**
 * 교적에 '제자훈련' / '제자훈련출석' 값이 있는데 제자훈련명단에는 한 번도 없는 사람 목록
 * → 이 사람들이 discipleshipMigrate 로 옮길 대상입니다.
 */
function 훈련이전대상_() {
  var 있음 = {};
  rows_(SHEET_제자훈련).forEach(function (r) { 있음[훈련키_(r[훈련_이름])] = 1; });
  var out = [];
  rows_(SHEET_교적).forEach(function (r) {
    var name = 훈련키_(r[D_이름]);
    if (!name || 있음[name]) return;
    var st = String(r[D_제자훈련] || '').trim(), rate = String(r[D_훈련출석] || '').trim();
    if (st || rate) out.push({ name: name, status: st, rate: rate });
  });
  return out;
}

function discipleshipMigrationStatus(key) {
  requireAdmin_(key);
  var t = 훈련이전대상_();
  return { pending: t.length, sample: t.slice(0, 20),
    note: t.length ? '교적에만 적힌 제자훈련 기록입니다. 옮기면 제자훈련명단(기수=LEGACY)으로 들어갑니다.' : '옮길 기록이 없습니다.' };
}

/**
 * 교적에만 있는 제자훈련 기록을 제자훈련명단으로 옮깁니다.
 * clearRegistry = true 이면 옮긴 사람의 교적 '제자훈련' · '제자훈련출석' 칸을 비웁니다 (한 곳에만 남도록).
 * 몇 번을 눌러도 같은 사람이 두 번 들어가지 않습니다.
 */
function discipleshipMigrate(key, clearRegistry) {
  requireAdmin_(key);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var todo = 훈련이전대상_();
    if (!todo.length) return { moved: 0, cleared: 0 };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    for (var c = 1; c <= HEAD_제자훈련명단_.length; c++) {
      if (c > 6) ensureColumn_(ss, SHEET_제자훈련, c, HEAD_제자훈련명단_[c - 1]);
    }
    var sh = sheet_(SHEET_제자훈련);
    var rows = todo.map(function (t) {
      var row = [t.name, '', '이전 기록(교적에서 옮김)', '', '', '', 훈련이전기수_, t.status, t.rate];
      return row;
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    var cleared = 0;
    if (clearRegistry) {
      var 이름들 = {};
      todo.forEach(function (t) { 이름들[t.name] = 1; });
      var es = sheet_(SHEET_교적), v = es.getDataRange().getValues();
      for (var i = 1; i < v.length; i++) {
        if (!이름들[훈련키_(v[i][D_이름])]) continue;
        es.getRange(i + 1, D_제자훈련 + 1).setValue('');
        es.getRange(i + 1, D_훈련출석 + 1).setValue('');
        cleared++;
      }
    }
    캐시비움_();
    return { moved: todo.length, cleared: cleared };
  } finally {
    lock.releaseLock();
  }
}
