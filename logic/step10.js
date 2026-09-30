/**
 * Step 10 — 찬양 객원(교적 검색) · 주보 사용자 페이지 · 커미티 "다른 분 화면 보기"에 새가족 · 포털 검색에 새가족
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * app.js 의 함수를 지우거나 바꾸지 않고 새 함수만 더합니다 — 예전 화면이 부르던 함수는 그대로 남아 있습니다.
 *
 *  ▣ 새로 생긴 화면용 함수 (화면에서 부를 수 있음)
 *    worshipGuestSearch(token, q)        찬양 편성 칸에서 "객원"을 교적에서 찾기 (팀장 · 인도자만)
 *    quickSearchAll(token, q)            포털 빠른 검색 — 교인 + 새가족 (커미티만)
 *    portalViewTargets(token)            "다른 분 화면 보기" 목록 — 교인 + 새가족 (커미티만)
 *    portalViewAsNewcomer(token, name)   새가족 한 분의 화면 (보기 전용)
 *
 *  ▣ app.js 가 부르는 도우미 (밑줄 끝 — 화면에서는 못 부름)
 *    주보페이지정리_(pages)              saveBulletin 이 저장 전에 사용자 페이지를 검사 · 정리
 *    주보페이지이어받기_(pages)          새 주보를 만들 때 지난 주 페이지 뼈대(내용은 비움)를 이어받기
 */

/* ============================================================
   공통 도우미
   ============================================================ */

/** 전화번호에서 숫자만 */
function 숫자만9_(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

/** 이름 → 첫 번째 셀 (셀원명단: [셀, 이름]) */
function 셀이름맵9_() {
  var out = {};
  rows_(SHEET_셀원명단).forEach(function (r) {
    var n = String(r[1] || '').trim(), c = String(r[0] || '').trim();
    if (n && c && !out[n]) out[n] = c;
  });
  return out;
}

/** 검색어와 이름이 얼마나 맞는지 (클수록 위) */
function 이름점수9_(name, q) {
  name = String(name || ''); q = String(q || '');
  if (!q || !name) return 0;
  if (name === q) return 100;
  if (name.indexOf(q) === 0) return 80;
  if (name.indexOf(q) !== -1) return 60;
  return 0;
}

function 커미티만9_(token, 문구) {
  requirePortal_(token);
  if (!커미티토큰_(token)) throw new Error(문구 || '교인 검색은 커미티만 사용할 수 있습니다.');
}

/* ============================================================
   1. 찬양 · 방송 허브 — 객원 멤버를 교적에서 찾기
   ------------------------------------------------------------
   있던 것: 편성 칸 아래 "객원 직접 입력" 한 줄 (이름을 손으로 적음 → 철자 · 동명이인 실수)
   바뀐 것: 교적(주 명단)을 이름 · 영문이름 · 전화번호 · 셀로 찾아 눌러서 고름. 직접 입력은 그대로 남김
   저장: 편성은 예전처럼 "이름"만 저장합니다 (찬양편성 시트 · setWorshipSlot 변경 없음)
   ============================================================ */

/**
 * 교적에서 객원 후보 찾기.
 *  - 이미 찬양 · 방송팀 명단에 있는 분은 목록에서 빼고(팀원 칸에 이미 보임) 이름만 hint 로 알려 줍니다
 *  - 전화번호는 뒤 4자리만 돌려줍니다 (동명이인 구분용). 전체 번호는 나가지 않습니다
 *  - 편성을 바꿀 수 있는 분(팀장 · 인도자 · 커미티)만 부를 수 있습니다
 */
function worshipGuestSearch(token, q) {
  var w = 찬양권한_(token);
  if (!w.canEdit) throw new Error('찬양팀 팀장 · 인도자만 객원을 고를 수 있습니다.');
  q = String(q == null ? '' : q).trim().slice(0, 30);
  if (!q) return { q: q, list: [], hint: [], total: 0 };

  var 교적 = 교적맵_(), 팀 = 찬양명단_(), 셀 = 셀이름맵9_();
  var lower = q.toLowerCase(), qd = 숫자만9_(q);
  var found = [], hint = [];

  Object.keys(교적).forEach(function (name) {
    var p = 교적[name];
    var score = 이름점수9_(name, q);
    if (!score && p.engName && String(p.engName).toLowerCase().indexOf(lower) !== -1) score = 40;
    if (!score && qd.length >= 3 && 숫자만9_(p.phone).indexOf(qd) !== -1) score = 30;
    if (!score && 셀[name] && 셀[name].indexOf(q) !== -1) score = 20;
    if (!score) return;
    if (팀[name]) { if (hint.length < 5) hint.push(name); return; }
    var digits = 숫자만9_(p.phone);
    found.push({
      score: score, name: name, cell: 셀[name] || '', engName: p.engName || '',
      gender: p.gender || '', photo: p.photo || '', tail: digits.length >= 4 ? digits.slice(-4) : ''
    });
  });

  found.sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name, 'ko'); });
  var total = found.length;
  var list = found.slice(0, 12).map(function (x) {
    return { name: x.name, cell: x.cell, engName: x.engName, gender: x.gender, photo: x.photo, tail: x.tail };
  });
  return { q: q, list: list, hint: hint, total: total };
}

/* ============================================================
   2. 포털 빠른 검색 — 새가족까지
   ------------------------------------------------------------
   있던 것: quickMemberSearch (교적 · 이름 / 전화 / 셀 / 사역팀) — 그대로 둡니다
   바뀐 것: quickSearchAll = 그 결과 + 새가족(이름 / 전화 / 배정 셀 / 담당자 / 단계). 화면은 새 함수를 씁니다
   ============================================================ */

/** 새가족 한 분 → 검색 결과 카드 */
function 새가족카드9_(nf) {
  var digits = 숫자만9_(nf.contact || nf.phone);
  return {
    kind: 'newcomer', name: nf.name, stage: nf.stage || '', status: nf.status || '',
    cell: nf.cell || '', owner: nf.owner || '', joinedAt: nf.joinedAt || '',
    photo: nf.photo || '', tail: digits.length >= 4 ? digits.slice(-4) : ''
  };
}

/** 이 검색어에 새가족 한 분이 맞는지 (이름 · 전화 · 배정 셀 · 담당자 · 단계 · "새가족" 낱말) */
function 새가족맞음9_(nf, q, qd) {
  if (nf.name && nf.name.indexOf(q) !== -1) return true;
  if (qd && qd.length >= 3 && 숫자만9_(nf.contact || nf.phone).indexOf(qd) !== -1) return true;
  if (nf.cell && nf.cell.indexOf(q) !== -1) return true;
  if (nf.owner && nf.owner.indexOf(q) !== -1) return true;
  if (nf.stage && nf.stage.indexOf(q) !== -1) return true;
  if (q === '새가족' || q === '새 가족') return true;
  return false;
}

function quickSearchAll(token, q) {
  커미티만9_(token);
  q = String(q == null ? '' : q).trim().slice(0, 40);
  if (!q) return { q: q, list: [], counts: { member: 0, newcomer: 0 } };
  var qd = 숫자만9_(q);

  // 교인 — 예전 검색을 그대로 씁니다 (이름 · 전화 3자리 이상 · 셀 · 사역팀, 최대 20명)
  var members = quickMemberSearch(token, q).list.map(function (m) {
    m.kind = 'member';
    return m;
  });

  // 새가족 — 과정 · 추적 시트는 한 번만 읽습니다
  var idx = 새가족인덱스_();
  var nfs = 새가족목록_().map(function (nf) { return 새가족합치기_(nf, idx); })
    .filter(function (nf) { return 새가족맞음9_(nf, q, qd); })
    .sort(function (a, b) { return 이름점수9_(b.name, q) - 이름점수9_(a.name, q) || a.name.localeCompare(b.name, 'ko'); });
  var newcomers = nfs.slice(0, 12).map(새가족카드9_);

  return {
    q: q, list: members.concat(newcomers),
    counts: { member: members.length, newcomer: nfs.length }
  };
}

/* ============================================================
   3. 커미티 "다른 분 화면 보기" — 새가족까지
   ------------------------------------------------------------
   있던 것: portalViewAs(token, name) — 교적에 있는 분만. 명단은 로그인 응답의 people(이름 배열)
   바뀐 것: 목록은 화면을 펼칠 때 portalViewTargets 로 따로 받습니다(로그인 응답은 그대로 · 가볍게).
            새가족은 portalViewAsNewcomer 로 봅니다 (새가족은 포털에 로그인하지 않으므로 항상 보기 전용)
   ============================================================ */

function portalViewTargets(token) {
  var me = requirePortal_(token);
  if (포털역할_(me.name).roles.indexOf('커미티') === -1) throw new Error('커미티만 볼 수 있습니다.');
  var 셀 = 셀이름맵9_();
  var members = Object.keys(교적맵_()).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
    .map(function (n) { return { name: n, cell: 셀[n] || '' }; });
  var newcomers = 새가족전체_().sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); })
    .map(function (nf) { return { name: nf.name, stage: nf.stage || '', status: nf.status || '', cell: nf.cell || '' }; });
  return { members: members, newcomers: newcomers };
}

/** 새가족 한 분이 보는(=보여줄) 포털 화면. 모양은 portalViewAs 와 같아 화면이 그대로 그립니다 */
function portalViewAsNewcomer(token, name) {
  var me = requirePortal_(token);
  if (포털역할_(me.name).roles.indexOf('커미티') === -1) throw new Error('커미티만 볼 수 있습니다.');
  name = String(name == null ? '' : name).trim();
  var nf = name ? 새가족하나_(name) : null;
  if (!nf) throw new Error(name + ' — 새가족 명단에서 찾지 못했습니다.');

  var r = { name: name, roles: [], cells: [], teams: [], delegate: {}, delegateFrom: {} };
  var menus = [];
  try { menus = 포털메뉴_(r, ''); } catch (e) { menus = []; }
  menus.forEach(function (m) { m.url = ''; });                  // 새가족은 포털에 들어오지 않으므로 열리는 링크는 없습니다

  var phone = nf.phone || String(nf.contact || '');
  // Step 11 — 새가족이 실제로 보는 첫 화면(newcomerHome)을 그대로 실어 보냅니다. 표(token)는 화면에 보내지 않습니다.
  var home = null;
  try { if (nf.email) home = newcomerHome(새가족토큰_(nf.email)); } catch (e) { home = null; }
  if (!home) home = 새가족홈대체11_(nf);
  home.token = '';
  return {
    token: '', viewAs: name, viewKind: 'newcomer', noLink: true, home: home,
    me: {
      name: nf.name, engName: '', phone: phone, email: nf.email || '', kakao: nf.kakao || '',
      address: '', envelopeNo: '', joinedAt: nf.joinedAt || '', memberSince: '',
      birthdayDisplay: nf.birthdayDisplay || '', gender: nf.gender || '', baptized: nf.baptized || '',
      photo: nf.photo || '', photoLarge: nf.photoLarge || '',
      cell: nf.cell || '', cells: nf.cell ? [nf.cell] : [], teams: [], missions: [],
      discipleship: '', trainingRate: '', training: null
    },
    newcomer: {
      name: nf.name, stage: nf.stage || '', status: nf.status || '', owner: nf.owner || '',
      progress: nf.progress || '', completedWeeks: nf.completedWeeks || 0, nextWeek: nf.nextWeek || 0,
      joinedAt: nf.joinedAt || '', cell: nf.cell || ''
    },
    roles: ['새가족'],
    menus: menus,
    admin: [],
    committee: false,
    leader: false,
    hasCalendar: 달력있나_([])
  };
}

/* ============================================================
   4. 온라인 주보 — 사용자 페이지 (셀모임 교제 · 목회칼럼 · 직접 만들기)
   ------------------------------------------------------------
   있던 것: 주보는 고정 5구역(예배 순서 · 성경 본문 · 셀모임 나눔 · 소식 · 섬김이)
   바뀐 것: 주보 JSON 에 pages 배열을 덧붙임. 편집자가 페이지를 더하고 빼고 순서를 바꿈.
            예전 주보(pages 없음)는 그대로 읽히고 그대로 그려집니다
   저장 모양: pages: [{ id, kind, title, eyebrow, subtitle, author, ref, body, link, linkLabel, keep }]
   ============================================================ */

var 주보페이지종류9_ = { fellowship: 1, column: 1, custom: 1 };
var 주보페이지최대9_ = 12;

/** 글자를 정해진 길이로 (앞뒤 공백 정리) */
function 짧게9_(v, n) { return String(v == null ? '' : v).replace(/\s+$/, '').replace(/^\s+/, '').slice(0, n); }

/** http(s) 주소만 허용 (그 밖은 비움) */
function 안전주소9_(v) {
  v = 짧게9_(v, 400);
  return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : '';
}

/**
 * 저장 전 검사 · 정리.
 *  - 최대 12페이지, 종류는 fellowship / column / custom 중 하나 (모르면 custom)
 *  - 제목도 내용도 없는 페이지는 버립니다
 *  - id 는 영문 소문자 · 숫자만(최대 12자). 없거나 겹치면 새로 만듭니다 (주소 #sec-pg_<id> 에 쓰임)
 */
function 주보페이지정리_(pages) {
  var out = [], seen = {};
  (Object.prototype.toString.call(pages) === '[object Array]' ? pages : []).forEach(function (p) {
    if (out.length >= 주보페이지최대9_ || !p || typeof p !== 'object') return;
    var title = 짧게9_(p.title, 40);
    var body = String(p.body == null ? '' : p.body).replace(/\s+$/, '').slice(0, 8000);
    if (!title && !body.replace(/\s/g, '')) return;

    var id = String(p.id == null ? '' : p.id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    var n = 0;
    while (!id || seen[id]) {
      id = 'p' + (out.length + 1) + Math.floor(Math.random() * 46656 + 46656).toString(36);
      if (++n > 20) { id = 'p' + (out.length + 1) + n; break; }
    }
    seen[id] = 1;

    out.push({
      id: id,
      kind: 주보페이지종류9_[p.kind] ? p.kind : 'custom',
      title: title,
      eyebrow: 짧게9_(p.eyebrow, 40),
      subtitle: 짧게9_(p.subtitle, 80),
      author: 짧게9_(p.author, 40),
      ref: 짧게9_(p.ref, 60),
      body: body,
      link: 안전주소9_(p.link),
      linkLabel: 짧게9_(p.linkLabel, 30),
      keep: p.keep === undefined ? true : !!p.keep
    });
  });
  return out;
}

/**
 * 새 주보 뼈대에 지난 주 페이지를 이어받습니다 — 제목 · 종류 · 꾸밈은 남기고 내용(본문 · 본문 구절)은 비웁니다.
 * "이어받기" 를 끈(keep:false) 페이지는 가져오지 않습니다.
 */
function 주보페이지이어받기_(pages) {
  var list = Object.prototype.toString.call(pages) === '[object Array]' ? pages : [];
  return 주보페이지정리_(list.filter(function (p) { return p && p.keep !== false; }).map(function (p) {
    return {
      id: p.id, kind: p.kind, title: p.title, eyebrow: p.eyebrow, subtitle: p.subtitle,
      author: p.kind === 'column' ? p.author : '', ref: '', body: '', link: '', linkLabel: p.linkLabel, keep: true
    };
  }));   // 내용이 비어도 제목이 있으면 살아남고, 제목까지 없으면 정리 단계에서 버려집니다
}
