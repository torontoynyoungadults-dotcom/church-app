/**
 * 개인별 메뉴 · 위원회 권한 (Step 1)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * 그래서 app.js 의 함수(포털역할_, rows_ …)를 그대로 쓰고, 이름이 겹치지 않게 새 이름만 씁니다.
 *
 * ▣ 예전 방식 — 역할만으로 정합니다
 *    포털역할_(이름) 이 셀장 · 팀장 · 커미티 · 새가족팀 … 역할을 정하고, 커미티는 모든 메뉴를 봅니다.
 *
 * ▣ 이 파일이 더하는 것 — 사람마다 따로 정하는 권한 ('사용자권한' 탭 = [DB11] 기타 시스템 자료)
 *    · 메뉴 허용/차단   : "김OO 님은 새가족 관리를 쓸 수 있다 / 없다"
 *    · 위원회 소속      : "이OO 님은 회계 위원회 — 커미티 전체가 아니라 그 위원회 메뉴만"
 *    · 범위             : 셀모임 보고서 · 사역 보고서는 셀 · 팀 이름으로 좁힐 수 있음
 *    · 만료일           : 임시 권한은 날짜가 지나면 저절로 빠집니다
 *
 * ▣ 판정 순서 (한 사람 · 한 메뉴)
 *    1. 관리자키 · 마스터 비밀번호  → 통과 (이 파일이 건드리지 않습니다)
 *    2. 개인 '차단'                 → 막음 (허용보다 항상 우선)
 *    3. 예전 방식(역할)으로 열려 있음 → 열림. 단, "커미티라서 열린 것"이고 그 사람이 위원회 범위 회원이면
 *                                     자기 위원회 메뉴만 열림
 *    4. 개인 '허용'                 → 열림 (범위가 있으면 그 셀 · 팀만)
 *    5. 그 밖에는 막음
 *
 * ▣ 되돌아가기 : '사용자권한' 탭에 행이 하나도 없는 사람은 판정이 예전과 완전히 같습니다.
 */

var SHEET_사용자권한 = '사용자권한';
var HEAD_사용자권한 = ['이름', '구분', '대상', '효과', '범위', '만료일', '메모', '만든이', '만든시각'];
var UP_이름 = 0, UP_구분 = 1, UP_대상 = 2, UP_효과 = 3, UP_범위 = 4, UP_만료 = 5, UP_메모 = 6, UP_만든이 = 7, UP_시각 = 8;

/**
 * 권한을 정할 수 있는 메뉴.
 *  enforced : 서버가 요청마다 이 규칙을 지킵니다 (true) / 지금은 메뉴 표시에만 반영됩니다 (false)
 *  scope    : 범위(셀 · 팀 이름)로 좁힐 수 있는 메뉴
 *  allow    : 개인 '허용'을 받을 수 있는지 (서버가 지키는 메뉴만 허용을 받습니다)
 */
function 권한카탈로그_() {
  return [
    { key: 'leader',       area: '포털',        title: '셀모임 보고서',   enforced: true,  allow: true,  scope: '셀', help: '범위에 셀 이름(쉼표로 여러 개)을 적으면 그 셀만' },
    { key: 'team',         area: '포털',        title: '사역 보고서',     enforced: true,  allow: true,  scope: '팀', help: '범위에 사역팀 이름(쉼표로 여러 개)을 적으면 그 팀만' },
    { key: 'newfamily',    area: '포털',        title: '새가족 관리',     enforced: true,  allow: true,  scope: '',   help: '새가족 조회 · 배정 · 정착 추적' },
    { key: 'worship',      area: '포털',        title: '찬양방송팀 허브', enforced: true,  allow: true,  scope: '',   help: '콘티 · 악보 · 편성 (허용하면 고칠 수도 있습니다)' },
    { key: 'bulletinEdit', area: '포털',        title: '주보 편집',       enforced: true,  allow: true,  scope: '',   help: '임시저장까지 — 게시는 주보 게시자만' },
    { key: 'album',        area: '포털',        title: '포토 앨범',       enforced: false, allow: false, scope: '',   help: '교인은 기본으로 열려 있습니다' },
    { key: 'expense',      area: '포털',        title: '지출환급신청서',  enforced: false, allow: false, scope: '',   help: '' },
    { key: 'mission',      area: '포털',        title: '선교팀 관리',     enforced: false, allow: false, scope: '',   help: '' },
    { key: 'forms',        area: '포털',        title: '신청서 관리',     enforced: false, allow: false, scope: '',   help: '' },
    { key: 'minutes',      area: '포털',        title: '회의록 · 할 일',  enforced: false, allow: false, scope: '',   help: '' },
    { key: 'acct',         area: '포털',        title: '회계 관리',       enforced: false, allow: false, scope: '',   help: '' },
    { key: 'admin.cell',   area: '커미티 관리', title: '셀 관리',         enforced: false, allow: false, scope: '',   help: '' },
    { key: 'admin.team',   area: '커미티 관리', title: '사역팀 관리',     enforced: false, allow: false, scope: '',   help: '' },
    { key: 'admin.tr',     area: '커미티 관리', title: '제자훈련 관리',   enforced: false, allow: false, scope: '',   help: '' },
    { key: 'admin.dir',    area: '커미티 관리', title: '교적 관리',       enforced: false, allow: false, scope: '',   help: '' },
    { key: 'admin.app',    area: '커미티 관리', title: '앱 기능 관리',    enforced: true,  allow: false, scope: '',   help: '권한 · 알림 · 메뉴 순서를 바꿉니다' }
  ];
}

/** 커미티 관리 화면의 칸 이름(포털관리메뉴_ 의 key) → 권한 메뉴 */
var 관리메뉴권한키_ = { cell: 'admin.cell', nf: 'newfamily', team: 'admin.team', acct: 'acct', tr: 'admin.tr', mis: 'mission', dir: 'admin.dir', app: 'admin.app' };

/** 예전 이름 · 별칭을 하나로 */
function 권한키정리_(key) {
  key = String(key || '').trim();
  var alias = { 'admin.acct': 'acct', 'admin.nf': 'newfamily', 'admin.mis': 'mission', nf: 'newfamily', mis: 'mission' };
  return alias[key] || key;
}
function 권한카탈로그찾기_(key) {
  key = 권한키정리_(key);
  return 권한카탈로그_().filter(function (m) { return m.key === key; })[0] || null;
}

/* =========================================================
   위원회 — 사역팀 시트의 '부서' 가 곧 위원회 이름입니다 (예배영성부 · 선교행정부 · 양육부 · 회계 …)
   위원회마다 열어 줄 메뉴 묶음이 있습니다. 설정 시트의 '위원회메뉴_<이름>' (쉼표로 메뉴 key)으로 바꿀 수 있고,
   없으면 아래 기본값을 씁니다. (※ 기본값은 이름을 보고 정한 제안입니다 — 필요하면 설정 시트에서 고쳐주세요)
   ========================================================= */

var 위원회기본메뉴_ = {
  '예배영성부': ['worship', 'bulletinEdit', 'team'],
  '선교행정부': ['team'],
  '양육부': ['newfamily', 'leader', 'team'],
  '회계': ['acct', 'expense']
};
/** 위원회 범위 회원에게 늘 열어 두는 메뉴 (설정 '위원회공통메뉴' 로 바꿈) */
var 위원회공통기본_ = ['album', 'minutes', 'expense'];

function 쉼표목록_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

/** 알려진 위원회 이름들 (사역팀의 부서 + 기본 묶음) */
function 위원회목록_() {
  var out = [];
  Object.keys(위원회기본메뉴_).forEach(function (n) { out.push(n); });
  try {
    사역팀목록_().forEach(function (t) { if (t.dept && out.indexOf(t.dept) === -1) out.push(t.dept); });
  } catch (e) {}
  return out;
}

/** 위원회 하나가 여는 메뉴 */
function 위원회메뉴_(name) {
  var set = String(설정값_('위원회메뉴_' + name) || '').trim();
  return set ? 쉼표목록_(set).map(권한키정리_) : (위원회기본메뉴_[name] || []);
}
function 위원회공통메뉴_() {
  var set = String(설정값_('위원회공통메뉴') || '').trim();
  return set ? 쉼표목록_(set).map(권한키정리_) : 위원회공통기본_;
}
/** 위원회들이 함께 여는 메뉴 (공통 포함) */
function 위원회메뉴합_(names) {
  var out = 위원회공통메뉴_().slice();
  (names || []).forEach(function (n) {
    위원회메뉴_(n).forEach(function (k) { if (out.indexOf(k) === -1) out.push(k); });
  });
  return out;
}

/* =========================================================
   개인 권한 읽기
   ========================================================= */

var _권한캐시 = {};
function 권한캐시비움_() { _권한캐시 = {}; }

/** 한 사람의 개인 권한(기간이 안 지난 것만) → { n, deny, allow, committees, committeeAll, rows } */
function 개인권한_(name) {
  name = String(name || '').trim();
  if (_권한캐시[name]) return _권한캐시[name];
  var today = ymd_(new Date());
  var p = { n: 0, deny: {}, allow: {}, committees: [], committeeAll: false, rows: [], acct: [] };
  rows_(SHEET_사용자권한).forEach(function (r) {
    if (String(r[UP_이름] || '').trim() !== name) return;
    var until = 날짜문자열_(r[UP_만료]);
    if (until && until < today) return;                     // 기간이 지난 권한은 저절로 빠집니다
    var kind = String(r[UP_구분] || '').trim(), target = String(r[UP_대상] || '').trim(),
        effect = String(r[UP_효과] || '').trim(), scope = String(r[UP_범위] || '').trim();
    if (!name || !kind || !target || (effect !== '허용' && effect !== '차단')) return;
    // 회계 모듈(행사 예산) 권한 — logic/eventbudget.js 가 읽습니다. 메뉴 판정에는 영향이 없으므로 n 에 세지 않습니다.
    if (kind === '회계') { p.acct.push({ target: target, effect: effect, scope: scope, until: until }); return; }
    p.n++;
    p.rows.push({ kind: kind, target: target, effect: effect, scope: scope, until: until, memo: String(r[UP_메모] || '').trim() });
    if (kind === '메뉴') {
      var k = 권한키정리_(target);
      if (effect === '차단') p.deny[k] = 1;
      else {
        var list = (p.allow[k] = p.allow[k] || []);
        if (scope) 쉼표목록_(scope).forEach(function (s) { list.push(s); }); else list.push('*');
      }
    } else if (kind === '위원회' && effect === '허용') {
      if (target === '*') p.committeeAll = true;
      else if (p.committees.indexOf(target) === -1) p.committees.push(target);
    }
  });
  return (_권한캐시[name] = p);
}

/** 위원회 범위 회원 — '위원회 허용' 행이 있고 '전체(*)' 는 아닌 사람. (행이 없으면 예전처럼 커미티 전체 권한) */
function 위원회범위인가_(name) {
  var p = 개인권한_(name);
  return p.committees.length > 0 && !p.committeeAll;
}

/** 위원회 범위 회원이 다룰 수 있는 사역팀 (부서가 자기 위원회인 팀) */
function 위원회팀들_(name) {
  var p = 개인권한_(name), out = [];
  try {
    사역팀목록_().forEach(function (t) { if (p.committees.indexOf(t.dept) !== -1) out.push(t.name); });
  } catch (e) {}
  return out;
}

/* =========================================================
   예전 방식(역할)이 지금 이 메뉴를 열어 주는지 — 'role' | 'committee' | ''
   ※ 포털메뉴_ · 포털권한_ 이 역할로 정하던 규칙을 표로 옮긴 것입니다.
   ========================================================= */
function 기본출처_(r, key, target, name) {
  key = 권한키정리_(key);
  var has = function (x) { return r.roles.indexOf(x) !== -1; };
  var 위 = has('커미티');
  target = String(target || '').trim();
  var 직접 = false;
  switch (key) {
    case 'album': return 'role';                                   // 교인이면 누구나
    case 'leader': 직접 = target ? r.cells.indexOf(target) !== -1 : (has('셀장') || r.cells.length > 0); break;
    case 'team':   직접 = target ? r.teams.indexOf(target) !== -1 : (has('팀장') || r.teams.length > 0); break;
    case 'expense': 직접 = has('팀장') || 지출공개_(); break;
    case 'forms': 직접 = has('팀장'); break;
    case 'newfamily': 직접 = has('새가족팀'); break;
    case 'worship': 직접 = has('찬양팀'); break;
    case 'mission': 직접 = has('선교팀'); break;
    case 'acct': 직접 = has('회계팀'); break;
    case 'minutes': break;
    case 'bulletinEdit':
      직접 = has('주보팀') || 주보명단_('주보게시자').indexOf(name) !== -1 || 주보명단_('주보편집자').indexOf(name) !== -1;
      break;
    default: break;                                                // admin.* — 커미티만
  }
  if (직접) return 'role';
  return 위 ? 'committee' : '';
}

/**
 * 한 사람 · 한 메뉴 판정. base 는 기본출처_ 의 값.
 * 반환: { ok, by }  by = deny | role | committee | committee-scope | allow | allow-out-of-scope | none
 * 판정 순서는 이 파일 맨 위 설명을 보세요.
 */
function 메뉴판정_(name, key, base, target) {
  key = 권한키정리_(key);
  var p = 개인권한_(name);
  if (p.deny['*'] || p.deny[key]) return { ok: false, by: 'deny' };

  var baseOk = !!base, by = base || 'none';
  if (base === 'committee' && p.committees.length && !p.committeeAll) {
    var 열림 = 위원회메뉴합_(p.committees).indexOf(key) !== -1;
    // 관리 화면(admin.*)은 관리자키를 통해서만 열리므로 위원회 범위 회원에게는 열지 않습니다 (Step 2 에서 토큰 방식으로 바꿉니다)
    if (key.indexOf('admin.') === 0) 열림 = false;
    // 사역 보고서는 자기 위원회 부서의 팀만
    if (열림 && key === 'team' && target) 열림 = 위원회팀들_(name).indexOf(String(target).trim()) !== -1;
    baseOk = 열림;
    by = 열림 ? 'committee' : 'committee-scope';
  }
  if (baseOk) return { ok: true, by: by };

  var list = p.allow[key];
  if (list) {
    var t = String(target || '').trim();
    if (!t || list.indexOf('*') !== -1 || list.indexOf(t) !== -1) return { ok: true, by: 'allow' };
    return { ok: false, by: 'allow-out-of-scope' };
  }
  return { ok: false, by: by === 'committee-scope' ? by : 'none' };
}

/** 한 사람이 이 메뉴를 쓸 수 있는지 — 포털 토큰 없이 이름으로 (관리 화면의 "확인" 용) */
function 이름권한_(name, key, target) {
  var r = 포털역할_(name);
  return 메뉴판정_(name, key, 기본출처_(r, key, target, name), target);
}

/* =========================================================
   기존 판정 자리에 끼우는 함수들 (app.js 의 아래 함수들이 부릅니다)
   ========================================================= */

/** 포털권한_ 용 — 예전 계산 결과(legacyOk)를 개인 권한으로 보정합니다 */
function 개인권한적용_(name, key, target, legacyOk, r) {
  var p = 개인권한_(name);
  if (!p.n) return legacyOk;                                       // 개인 권한이 없으면 예전 그대로
  var base = legacyOk ? (기본출처_(r, key, target, name) || 'role') : '';
  return 메뉴판정_(name, key, base, target).ok;
}

/** 찬양권한_ · 주보등급_ 용 — 이 사람의 이 메뉴에 대한 개인 권한 상태 */
function 개인메뉴상태_(name, key, r) {
  var p = 개인권한_(name);
  if (!p.n) return { deny: false, allow: false, scopedOut: false };
  var d = 메뉴판정_(name, key, 기본출처_(r, key, '', name) || '', '');
  return { deny: d.by === 'deny', allow: d.by === 'allow', scopedOut: d.by === 'committee-scope' };
}

/** 커미티토큰_ 용 — 위원회 범위 회원은 "커미티 전체"가 아니므로 커미티 전용 기능을 쓰지 못합니다 */
function 전체커미티인가_(name) { return !위원회범위인가_(name); }

/** 포털에서 관리자키를 URL 에 실어 보내도 되는 사람 (위원회 범위 회원에게는 실어 보내지 않습니다) */
function 관리자키줘도되나_(name) { return !위원회범위인가_(name) && !개인권한_(name).deny['admin.app']; }

/* ---------- 메뉴 목록 보정 ---------- */

/** 개인 허용으로 새로 열어 주는 포털 메뉴 한 칸 (포털메뉴_ 가 역할로 만드는 칸과 같은 모양) */
function 메뉴항목_(key, r, token) {
  var base = 앱주소_() || '', t = encodeURIComponent(token || '');
  var E = {
    leader: ['셀모임 보고서', '주일 셀모임 출결 · 기도제목 제출', base + '?page=leader&t=' + t],
    team: ['사역 보고서', '팀 현황 · 팀원 상태 보고', base + '?page=team&t=' + t],
    newfamily: ['새가족 관리', '4주 과정 · 셀 배정 · 정착 추적', base + '?page=newfamily&t=' + t],
    worship: ['찬양방송팀 허브', '주차별 편성 · 콘티 · 악보', base + '?page=worship&t=' + t],
    bulletinEdit: ['주보 편집', '예배 순서 · 광고 · 스케줄', base + '?page=bulletin&edit=1&t=' + t]
  };
  var e = E[key];
  return e ? { key: key, title: e[0], desc: e[1], url: e[2], note: '' } : null;
}

/**
 * 메뉴 목록(포털메뉴_ · 포털관리메뉴_ 가 만든 것)에 개인 권한을 적용합니다.
 *  · 차단된 칸, 위원회 범위 밖의 칸을 뺍니다
 *  · (포털 메뉴만) 개인 '허용'으로 열어 준 칸을 더합니다
 * 개인 권한이 없는 사람은 목록을 그대로 돌려줍니다.
 */
function 개인권한메뉴_(r, token, out, kind) {
  var name = r.name, p = 개인권한_(name);
  if (!p.n) return out;
  var keep = out.filter(function (it) {
    var k = kind === 'admin' ? (관리메뉴권한키_[it.key] || ('admin.' + it.key)) : it.key;
    var base = 기본출처_(r, k, '', name) || 'role';               // 이미 목록에 있으니 기본으로는 열려 있는 칸
    return 메뉴판정_(name, k, base, '').ok;
  });
  if (kind !== 'admin') {
    Object.keys(p.allow).forEach(function (k) {
      if (p.deny[k] || keep.some(function (it) { return it.key === k; })) return;
      var it = 메뉴항목_(k, r, token);
      if (it) keep.push(it);
    });
  }
  return keep;
}

/* =========================================================
   화면 · 관리용 서버 함수 (브라우저에서 부를 수 있습니다)
   ========================================================= */

/** 권한을 바꿀 수 있는 사람 — 관리자키, 또는 (위원회 범위가 아닌) 커미티 */
function 권한관리자_(token) {
  if (!커미티토큰_(token)) throw new Error('권한은 커미티만 바꿀 수 있습니다.');
  if (!isAdmin_(token) && !마스터_(token)) {
    var me = 포털본인_(token);
    if (me && 개인권한_(me.name).deny['admin.app']) throw new Error('권한 관리가 제한되어 있습니다. 커미티에 문의해주세요.');
  }
}

function 권한시트_() {
  var sh = 주보시트_(SHEET_사용자권한, HEAD_사용자권한);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, HEAD_사용자권한.length).setValues([HEAD_사용자권한]); 캐시비움_(); } } catch (e) {}
  return sh;
}

function 권한행목록_() {
  return rows_(SHEET_사용자권한).filter(function (r) { return String(r[UP_이름] || '').trim(); }).map(function (r) {
    return { name: String(r[UP_이름]).trim(), kind: String(r[UP_구분] || '').trim(), target: String(r[UP_대상] || '').trim(),
      effect: String(r[UP_효과] || '').trim(), scope: String(r[UP_범위] || '').trim(), until: 날짜문자열_(r[UP_만료]),
      memo: String(r[UP_메모] || '').trim(), by: String(r[UP_만든이] || '').trim(), at: String(r[UP_시각] || '').trim() };
  });
}

/** 권한 화면 첫 자료 */
function permissionAdminInit(token) {
  권한관리자_(token);
  var 부서 = {};
  try { 사역팀목록_().forEach(function (t) { if (t.dept) (부서[t.dept] = 부서[t.dept] || []).push(t.name); }); } catch (e) {}
  return {
    catalog: 권한카탈로그_(),
    committees: 위원회목록_().map(function (n) { return { name: n, menus: 위원회메뉴_(n), teams: 부서[n] || [] }; }),
    common: 위원회공통메뉴_(),
    rows: 권한행목록_(),
    people: Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
  };
}

/**
 * 권한 한 줄 저장 (같은 이름 · 구분 · 대상 · 효과가 있으면 고칩니다)
 *   kind '메뉴' | '위원회', effect '허용' | '차단', scope 는 셀모임 보고서 · 사역 보고서만
 */
function savePermission(token, name, kind, target, effect, scope, until, memo) {
  권한관리자_(token);
  name = String(name || '').trim(); kind = String(kind || '').trim(); target = String(target || '').trim();
  effect = String(effect || '').trim(); scope = String(scope || '').trim(); until = String(until || '').trim();
  memo = String(memo || '').trim().slice(0, 200);
  if (!name || !교적맵_()[name]) throw new Error('교적에 없는 이름입니다: ' + name);
  if (kind !== '메뉴' && kind !== '위원회') throw new Error('구분은 메뉴 또는 위원회입니다.');
  if (effect !== '허용' && effect !== '차단') throw new Error('효과는 허용 또는 차단입니다.');
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error('만료일은 2026-12-31 같은 형식으로 적어주세요.');

  var warning = '';
  if (kind === '메뉴') {
    if (target === '*') {
      if (effect !== '차단') throw new Error('모든 메뉴 허용은 만들 수 없습니다. 위원회 소속(전체 *)을 쓰거나 메뉴를 하나씩 정해주세요.');
    } else {
      var m = 권한카탈로그찾기_(target);
      if (!m) throw new Error('정할 수 없는 메뉴입니다: ' + target);
      target = m.key;
      if (effect === '허용' && !m.allow) {
        throw new Error('"' + m.title + '" 은(는) 아직 개인 허용을 서버가 지키지 않습니다 (다음 단계에서 열립니다). 지금은 차단과 위원회 범위만 가능합니다.');
      }
      if (effect === '차단' && !m.enforced) warning = '"' + m.title + '" 은(는) 지금은 메뉴에서만 숨겨집니다 — 주소를 직접 열면 서버가 막지 못합니다 (다음 단계에서 서버 차단).';
      if (scope && !m.scope) throw new Error('범위는 셀모임 보고서 · 사역 보고서에만 쓸 수 있습니다.');
    }
  } else {
    if (effect !== '허용') throw new Error('위원회는 소속(허용)만 정할 수 있습니다.');
    if (scope) throw new Error('위원회에는 범위를 쓰지 않습니다.');
    if (target !== '*' && 위원회목록_().indexOf(target) === -1) throw new Error('알 수 없는 위원회입니다: ' + target);
  }

  var who = 커미티이름_(token), now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 권한시트_(), v = sh.getDataRange().getValues(), at = 0;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][UP_이름]).trim() === name && String(v[i][UP_구분]).trim() === kind &&
          권한키정리_(v[i][UP_대상]) === 권한키정리_(target) && String(v[i][UP_효과]).trim() === effect) { at = i + 1; break; }
    }
    var row = [name, kind, target, effect, scope, until, memo, who, now];
    if (at) sh.getRange(at, 1, 1, row.length).setValues([row]);
    else { sh.appendRow(row); at = sh.getLastRow(); }
    sh.getRange(at, UP_만료 + 1, 1, 1).setNumberFormat('@').setValue(until);
    sh.getRange(at, UP_시각 + 1, 1, 1).setNumberFormat('@').setValue(now);
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { ok: true, warning: warning, rows: 권한행목록_() };
}

function deletePermission(token, name, kind, target, effect) {
  권한관리자_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 권한시트_(), v = sh.getDataRange().getValues();
    for (var i = v.length - 1; i >= 1; i--) {
      if (String(v[i][UP_이름]).trim() === String(name || '').trim() && String(v[i][UP_구분]).trim() === String(kind || '').trim() &&
          권한키정리_(v[i][UP_대상]) === 권한키정리_(target) && String(v[i][UP_효과]).trim() === String(effect || '').trim()) sh.deleteRow(i + 1);
    }
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { ok: true, rows: 권한행목록_() };
}

/** 한 사람이 지금 무엇을 쓸 수 있는지 한눈에 — 권한을 정한 뒤 "확인"하는 용도입니다 */
function explainPermission(token, name) {
  권한관리자_(token);
  name = String(name || '').trim();
  if (!교적맵_()[name]) throw new Error('교적에 없는 이름입니다: ' + name);
  var r = 포털역할_(name), p = 개인권한_(name);
  return {
    name: name, roles: r.roles, cells: r.cells, teams: r.teams,
    committees: p.committees, committeeAll: p.committeeAll, committeeScoped: 위원회범위인가_(name),
    scopedTeams: 위원회범위인가_(name) ? 위원회팀들_(name) : [],
    rows: p.rows,
    menus: 권한카탈로그_().map(function (m) {
      var base = 기본출처_(r, m.key, '', name), d = 메뉴판정_(name, m.key, base, '');
      return { key: m.key, title: m.title, area: m.area, enforced: m.enforced, ok: d.ok, by: d.by, base: base };
    })
  };
}

/** 내 권한 (로그인한 본인) — 화면이 버튼 · 메뉴를 숨길 때 씁니다 */
function myPermissions(token) {
  if (isAdmin_(token) || 마스터_(token)) {
    return { admin: true, menus: 권한카탈로그_().map(function (m) { return { key: m.key, ok: true, by: 'admin' }; }) };
  }
  var ta = 팀계정찾기_(token);
  if (ta) {
    return { teamAccount: ta.name, menus: 권한카탈로그_().map(function (m) {
      var on = ta.menus.indexOf(m.key) !== -1;
      return { key: m.key, ok: on, by: on ? 'team-account' : 'none' };
    }) };
  }
  var me = requirePortal_(token), r = 포털역할_(me.name);
  return {
    name: me.name, committeeScoped: 위원회범위인가_(me.name), committees: 개인권한_(me.name).committees,
    menus: 권한카탈로그_().map(function (m) {
      var d = 메뉴판정_(me.name, m.key, 기본출처_(r, m.key, '', me.name), '');
      return { key: m.key, ok: d.ok, by: d.by };
    })
  };
}
