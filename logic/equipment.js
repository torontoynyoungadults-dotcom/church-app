/**
 * Step 34 — 장비 · 악기 점검 체크리스트 + 수리 요청 (Teva Apps)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * app.js 의 함수를 지우거나 바꾸지 않고 새 함수만 더합니다.
 *
 * ▣ 1. 점검 체크리스트  (화면: views/Equipment.html  ?page=equipment&t=<표>)
 *      · 항목(무선 마이크 배터리 · 무대 잭/케이블 · 카메라 1/2/3 …)은 팀원이 화면에서 더하고 · 고치고 · 보관(=삭제)합니다.
 *        보관한 항목도 기록은 남고, 언제든 다시 꺼낼 수 있습니다. 처음(시트가 비었을 때)에는 기본 항목이 채워집니다.
 *      · 날짜마다 항목별로 OK / 이상 / 해당없음 + 메모를 남깁니다. 누가 · 언제 눌렀는지도 함께 저장됩니다.
 *
 * ▣ 2. 수리 · 정비 요청  (사진 첨부 · 상태 흐름)
 *      접수 → 승인 → 처리중 → 완료   (반려 · 취소 · 다시 접수)
 *      · 요청: 찬양 · 방송팀원 누구나 (사진은 화면에서 줄여 올리고, 드라이브 폴더에 보관)
 *      · 승인 · 반려 · 다시 접수: 커미티 · 관리자만
 *      · 처리중 · 완료: 커미티 · 관리자 + 찬양 · 방송 팀장/인도자 (수리를 실제로 하는 분)
 *      · 취소: 요청한 본인(접수 상태일 때) · 커미티
 *      · 요청이 올라오면 커미티 · 팀장에게 알림 · 관리 화면(Teva Apps 관리 › 장비) · 포털 "내 할 일" 에 나타나고,
 *        상태가 바뀌면 요청한 분에게 알림이 갑니다.
 *
 * ▣ 시트 (모두 [DB05] 찬양 및 방송 허브 — lib/db.js) — 처음 쓸 때 저절로 만들어집니다
 *      장비점검항목 · 장비점검기록 · 장비수리요청 · 장비사진
 *
 * ▣ 권한 (서버가 요청마다 확인)
 *      · 찬양권한_ 과 같은 규칙: 찬양 · 방송팀에 속한 분 · 커미티 · 관리자키 · 팀 계정(worship 메뉴) 만 쓸 수 있습니다.
 *        사람마다 정한 권한(logic/permissions.js)은 'equipment' 메뉴로 따로 켜고 끕니다 (차단하면 막힘 · 허용하면 팀원이 아니어도 열림).
 *      · 화면에서 부를 수 있는 함수는 equipment* 이름뿐입니다 (나머지는 밑줄로 끝나 브라우저에서 못 부릅니다).
 */

/* ---------------------------------------------------------------- 시트 · 상수 */

var SHEET_장비항목 = '장비점검항목';
var HEAD_장비항목 = ['ID', '분류', '이름', '설명', '순서', '상태', '만든이', '만든시각', '수정자', '수정시각'];
var EQI_ID = 0, EQI_분류 = 1, EQI_이름 = 2, EQI_설명 = 3, EQI_순서 = 4, EQI_상태 = 5, EQI_만든이 = 6, EQI_만든시각 = 7, EQI_수정자 = 8, EQI_수정시각 = 9;

var SHEET_장비기록 = '장비점검기록';
var HEAD_장비기록 = ['날짜', '항목ID', '결과', '메모', '확인자', '확인시각'];
var EQR_날짜 = 0, EQR_항목 = 1, EQR_결과 = 2, EQR_메모 = 3, EQR_확인자 = 4, EQR_시각 = 5;

var SHEET_장비수리 = '장비수리요청';
var HEAD_장비수리 = ['ID', '접수시각', '제목', '상세', '장비', '우선순위', '사진', '상태', '요청자', '처리자', '관리자메모', '최근변경', '항목ID', '점검일', '이력'];
var EQT_ID = 0, EQT_접수 = 1, EQT_제목 = 2, EQT_상세 = 3, EQT_장비 = 4, EQT_우선 = 5, EQT_사진 = 6, EQT_상태 = 7, EQT_요청자 = 8, EQT_처리자 = 9, EQT_메모 = 10, EQT_변경 = 11, EQT_항목 = 12, EQT_점검일 = 13, EQT_이력 = 14;

var SHEET_장비사진 = '장비사진';
var HEAD_장비사진 = ['파일ID', '파일명', '올린이', '티켓ID', '올린시각'];
var EQP_파일 = 0, EQP_이름 = 1, EQP_올린이 = 2, EQP_티켓 = 3, EQP_시각 = 4;

var 장비결과목록_ = ['OK', '이상', '해당없음'];
var 장비우선순위_ = ['낮음', '보통', '긴급'];
var 장비진행상태_ = ['접수', '승인', '처리중'];                 // 아직 끝나지 않은 요청
var 장비사진한도_ = 6;                                          // 요청 하나에 사진 6장까지
var 장비사진크기_ = 10 * 1024 * 1024;                           // 사진 한 장 10MB (화면에서 줄여 올리므로 보통 1MB 안쪽)
var 장비대기사진_ = 12;                                         // 아직 요청에 붙이지 않은 사진을 한 사람이 동시에 가질 수 있는 수
var 장비항목한도_ = 150;                                        // 항목(보관 포함) 최대 개수
var 장비열린요청한도_ = 20;                                     // 한 사람이 '접수' 상태로 쌓아 둘 수 있는 요청 수
var 장비사진형식_ = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif' };

/** 처음 열 때(항목 시트가 비었을 때) 채우는 기본 항목 — [분류, 이름, 설명] */
var 장비기본항목_ = [
  ['음향 · 마이크', '무선 마이크 배터리 점검 (Wireless Mic Battery)', '마이크 · 인이어 송신기 배터리 잔량 확인, 예비 배터리 준비'],
  ['음향 · 마이크', '무대 잭 · 케이블 상태 (Stage Jack / Cable)', '잭 접촉 · 케이블 꺾임 · 피복 손상 확인'],
  ['음향 · 마이크', '믹서 · 앰프 전원 (Mixer / Amp Power)', '전원 · 채널 노이즈 · 마스터 출력 확인'],
  ['음향 · 마이크', '모니터 · 인이어 (Monitor / In-ear)', '모니터 스피커 · 인이어 소리 확인'],
  ['영상 · 방송', '카메라 1 테스트 (Camera 1 Test)', '전원 · 화면 · 초점 · 배터리 확인'],
  ['영상 · 방송', '카메라 2 테스트 (Camera 2 Test)', '전원 · 화면 · 초점 · 배터리 확인'],
  ['영상 · 방송', '카메라 3 테스트 (Camera 3 Test)', '전원 · 화면 · 초점 · 배터리 확인'],
  ['영상 · 방송', '프로젝터 · 스크린 (Projector / Screen)', '화면 밝기 · 색 · 자막 · 영상 출력 확인'],
  ['영상 · 방송', '라이브 송출 (Live Stream)', '송출 PC · 인터넷 · 스트림 키 확인'],
  ['악기', '건반 · 신디사이저 (Keyboard / Synth)', '전원 · 페달 · 케이블 · 소리 확인'],
  ['악기', '드럼 · 기타 앰프 (Drums / Guitar Amp)', '드럼 세팅 · 앰프 전원 · 기타 케이블 확인']
];

/* ---------------------------------------------------------------- 작은 도우미 */

/** 사람이 적은 글을 정리합니다 — 제어 문자 제거 · 줄 바꿈 통일 · 길이 제한 */
function 장비글_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​﻿]/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  return max ? s.slice(0, max) : s;
}
/** 한 줄짜리 글 (이름 · 제목 등) */
function 장비줄_(v, max) {
  var s = 장비글_(v, 0).replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  return max ? s.slice(0, max).trim() : s;
}
/** 시트에 넣을 글 — = + - @ 로 시작하면 수식으로 읽히지 않도록 보이지 않는 글자를 앞에 붙입니다 (읽을 때 떼어 냅니다) */
function 장비쓰기글_(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? '​' + s : s;
}
function 장비읽기글_(v) { return String(v == null ? '' : v).replace(/^​/, ''); }

function 장비지금_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }
/** 시각 칸 → 'yyyy-MM-dd HH:mm' (시트가 날짜로 바꿔 둔 경우도 안전) */
function 장비시각읽기_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  return String(v == null ? '' : v).trim();
}

/** 날짜(yyyy-MM-dd) 검사 — 비면 오늘. 너무 먼 미래는 막습니다 */
function 장비날짜_(d) {
  var s = 날짜문자열_(d == null ? '' : d);
  var today = ymd_(new Date());
  if (!s) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || ymd_(parseYmd_(s)) !== s) throw new Error('날짜를 확인해주세요.');
  if (s < '2020-01-01') throw new Error('날짜를 확인해주세요.');
  if (s > ymd_(new Date(parseYmd_(today).getTime() + 14 * 86400000))) throw new Error('앞으로 2주보다 먼 날짜는 점검할 수 없습니다.');
  return s;
}

/** 시트에 한 줄 쓰기 — 전체 칸을 '글자' 서식으로 (날짜 · 번호가 다른 값으로 바뀌지 않게) */
function 장비행쓰기_(sh, row, values) {
  var rg = sh.getRange(row, 1, 1, values.length);
  rg.setNumberFormat('@');
  rg.setValues([values]);
}

function 장비시트_(name, head) {
  var sh = 주보시트_(name, head);
  try { if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, head.length).setValues([head]); 캐시비움_(); } } catch (e) {}
  return sh;
}

function 장비아이디_(prefix) {
  return prefix + Date.now().toString(36) + Utilities.getUuid().replace(/[^0-9a-z]/gi, '').slice(0, 4).toLowerCase();
}

/* ---------------------------------------------------------------- 권한 */

/**
 * 이 표(토큰)의 사용자가 장비 점검 · 수리 요청을 쓸 수 있는지 — 못 쓰면 오류를 던집니다.
 * → { name, admin, committee, lead, canApprove, canFinish, teamAccount }
 *   canApprove : 승인 · 반려 · 다시 접수 (커미티 · 관리자)
 *   canFinish  : 처리중 · 완료 (커미티 · 관리자 + 찬양 · 방송 팀장/인도자)
 */
function 장비권한_(token) {
  var key = String(token || '').trim();
  if (!key) throw new Error('포털에서 다시 들어와 주세요.');
  if (isAdmin_(key) || 마스터_(key)) {
    return { name: '관리자', admin: true, committee: true, lead: true, canApprove: true, canFinish: true, teamAccount: false };
  }
  var ta = 팀계정찾기_(key);
  if (ta && ta.menus.indexOf('worship') !== -1) {                      // 방송팀 · 찬양팀이 함께 쓰는 팀 계정 (찬양권한_ 과 같은 기준)
    return { name: ta.name, admin: false, committee: false, lead: true, canApprove: false, canFinish: true, teamAccount: true };
  }
  var me = 포털본인_(key);
  if (!me) throw new Error('포털에서 다시 들어와 주세요.');
  var r = 포털역할_(me.name);
  var 커미티 = r.roles.indexOf('커미티') !== -1;
  var 개인 = 개인메뉴상태_(me.name, 'equipment', r);                     // 사람마다 따로 정한 권한 (없으면 아래는 찬양권한_ 과 같은 규칙)
  if (개인.deny) throw new Error('장비 점검 · 수리 요청 사용이 제한되어 있습니다. 커미티에 문의해주세요.');
  if (개인.scopedOut) 커미티 = false;                                  // 위원회 범위 밖 — 커미티라서 열리던 것은 닫힙니다
  var 팀원 = !!찬양명단_()[me.name] || r.roles.indexOf('찬양팀') !== -1;
  if (!팀원 && !커미티 && !개인.allow) throw new Error('찬양팀 · 방송팀에 속한 분만 쓸 수 있습니다. 커미티에 문의해주세요.');
  var lead = 커미티 || 찬양팀장_(me.name);
  return { name: me.name, admin: false, committee: 커미티, lead: lead, canApprove: 커미티, canFinish: lead, teamAccount: false };
}

function 장비승인자_(token) {
  var w = 장비권한_(token);
  if (!w.canApprove) throw new Error('커미티 · 관리자만 할 수 있습니다.');
  return w;
}

function 장비내용_(w) {
  return { name: w.name, admin: w.admin, committee: w.committee, lead: w.lead, canApprove: w.canApprove, canFinish: w.canFinish };
}

/* ---------------------------------------------------------------- 1. 점검 항목 */

function 장비항목읽기_(r, i) {
  return {
    id: String(r[EQI_ID] || '').trim(), category: 장비읽기글_(r[EQI_분류]).trim() || '기타', name: 장비읽기글_(r[EQI_이름]).trim(),
    desc: 장비읽기글_(r[EQI_설명]).trim(), order: Number(r[EQI_순서]) || 0, seq: i,
    status: String(r[EQI_상태] || '사용').trim() === '보관' ? '보관' : '사용',
    by: String(r[EQI_만든이] || '').trim(), at: 장비시각읽기_(r[EQI_만든시각]),
    editedBy: String(r[EQI_수정자] || '').trim(), editedAt: 장비시각읽기_(r[EQI_수정시각])
  };
}

/** 항목 전체 — 분류는 그 분류의 가장 앞 순서대로, 항목은 순서대로 */
function 장비항목들_() {
  var list = [];
  rows_(SHEET_장비항목).forEach(function (r, i) { if (String(r[EQI_ID] || '').trim() && String(r[EQI_이름] || '').trim()) list.push(장비항목읽기_(r, i)); });
  var first = {};
  list.forEach(function (it) { if (!(it.category in first) || it.order < first[it.category]) first[it.category] = it.order; });
  list.sort(function (a, b) {
    return (first[a.category] - first[b.category]) || a.category.localeCompare(b.category, 'ko') || (a.order - b.order) || (a.seq - b.seq);
  });
  return list;
}

/** 항목 시트가 비어 있으면 기본 항목을 채웁니다 (한 번만) */
function 장비기본채움_(w) {
  if (rows_(SHEET_장비항목).some(function (r) { return String(r[EQI_ID] || '').trim(); })) return false;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 장비시트_(SHEET_장비항목, HEAD_장비항목);
    var v = sh.getDataRange().getValues();
    if (v.length > 1 && v.slice(1).some(function (r) { return String(r[EQI_ID] || '').trim(); })) return false;
    var now = 장비지금_(), at = sh.getLastRow() + 1;
    var rows = 장비기본항목_.map(function (d, i) {
      return ['ei-base' + (i < 9 ? '0' : '') + (i + 1), d[0], d[1], d[2], i + 1, '사용', '기본 항목', now, '', ''];
    });
    var rg = sh.getRange(at, 1, rows.length, HEAD_장비항목.length);
    rg.setNumberFormat('@');
    rg.setValues(rows);
  } finally { lock.releaseLock(); }
  캐시비움_();
  return true;
}

function 장비항목보기_(it) {
  return { id: it.id, category: it.category, name: it.name, desc: it.desc, order: it.order, status: it.status,
    by: it.by, at: it.at, editedBy: it.editedBy, editedAt: it.editedAt };
}

/** 항목을 찾아 그 줄 번호와 함께 (sh 는 이미 열어 둔 시트) */
function 장비줄찾기_(v, col, key) {
  for (var i = 1; i < v.length; i++) if (String(v[i][col] == null ? '' : v[i][col]).trim() === key) return i;
  return -1;
}

function 장비같은이름있나_(v, cat, name, exceptId) {
  var n = name.toLowerCase();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][EQI_ID] || '').trim() === exceptId) continue;
    if (String(v[i][EQI_상태] || '사용').trim() === '보관') continue;
    if (장비읽기글_(v[i][EQI_분류]).trim() === cat && 장비읽기글_(v[i][EQI_이름]).trim().toLowerCase() === n) return true;
  }
  return false;
}

/**
 * 점검 항목 더하기 · 고치기 (팀원 누구나 — 누가 바꿨는지 남습니다).
 *   item = { id?, category, name, desc }   id 가 있으면 고치기, 없으면 새 항목
 */
function equipmentItemSave(token, item) {
  var w = 장비권한_(token);
  item = item || {};
  var cat = 장비줄_(item.category, 20) || '기타';
  var name = 장비줄_(item.name, 60);
  var desc = 장비줄_(item.desc, 120);
  var id = String(item.id || '').trim().slice(0, 40);
  if (!name) throw new Error('점검 항목 이름을 입력해주세요.');
  var out;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 장비시트_(SHEET_장비항목, HEAD_장비항목), v = sh.getDataRange().getValues(), now = 장비지금_();
    if (장비같은이름있나_(v, cat, name, id)) throw new Error('"' + cat + '" 분류에 같은 이름의 항목이 이미 있습니다.');
    if (id) {
      var i = 장비줄찾기_(v, EQI_ID, id);
      if (i < 0) throw new Error('항목을 찾지 못했습니다. 다른 분이 지웠을 수 있으니 새로고침해주세요.');
      var row = v[i].slice();
      while (row.length < HEAD_장비항목.length) row.push('');
      row[EQI_분류] = 장비쓰기글_(cat); row[EQI_이름] = 장비쓰기글_(name); row[EQI_설명] = 장비쓰기글_(desc);
      row[EQI_수정자] = w.name; row[EQI_수정시각] = now;
      장비행쓰기_(sh, i + 1, row.slice(0, HEAD_장비항목.length));
      out = id;
    } else {
      if (v.length - 1 >= 장비항목한도_) throw new Error('점검 항목은 ' + 장비항목한도_ + '개까지 만들 수 있습니다. 안 쓰는 항목은 지워 주세요.');
      var max = 0;
      for (var j = 1; j < v.length; j++) max = Math.max(max, Number(v[j][EQI_순서]) || 0);
      id = 장비아이디_('ei');
      장비행쓰기_(sh, Math.max(sh.getLastRow(), 1) + 1, [id, 장비쓰기글_(cat), 장비쓰기글_(name), 장비쓰기글_(desc), max + 1, '사용', w.name, now, '', '']);
      out = id;
    }
  } finally { lock.releaseLock(); }
  캐시비움_();
  var items = 장비항목들_();
  return { ok: true, id: out, items: items.map(장비항목보기_) };
}

/** 항목 보관(=삭제) · 다시 꺼내기. 기록은 그대로 남습니다 */
function equipmentItemArchive(token, id, archive) {
  var w = 장비권한_(token);
  id = String(id || '').trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 장비시트_(SHEET_장비항목, HEAD_장비항목), v = sh.getDataRange().getValues();
    var i = 장비줄찾기_(v, EQI_ID, id);
    if (i < 0) throw new Error('항목을 찾지 못했습니다. 새로고침해주세요.');
    var row = v[i].slice(0, HEAD_장비항목.length);
    while (row.length < HEAD_장비항목.length) row.push('');
    if (!archive) {
      var cat = 장비읽기글_(row[EQI_분류]).trim(), nm = 장비읽기글_(row[EQI_이름]).trim();
      if (장비같은이름있나_(v, cat, nm, id)) throw new Error('같은 이름의 항목이 이미 쓰이고 있어 다시 꺼낼 수 없습니다. 이름을 바꿔 주세요.');
    }
    row[EQI_상태] = archive ? '보관' : '사용';
    row[EQI_수정자] = w.name; row[EQI_수정시각] = 장비지금_();
    장비행쓰기_(sh, i + 1, row);
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { ok: true, items: 장비항목들_().map(장비항목보기_) };
}

/** 순서 바꾸기 — 같은 분류 안에서 한 칸 위(-1) · 아래(+1) */
function equipmentItemMove(token, id, dir) {
  var w = 장비권한_(token);
  id = String(id || '').trim();
  dir = Number(dir) < 0 ? -1 : 1;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 장비시트_(SHEET_장비항목, HEAD_장비항목), v = sh.getDataRange().getValues();
    var at = 장비줄찾기_(v, EQI_ID, id);
    if (at < 0) throw new Error('항목을 찾지 못했습니다. 새로고침해주세요.');
    var cat = 장비읽기글_(v[at][EQI_분류]).trim();
    var same = [];
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][EQI_상태] || '사용').trim() === '보관') continue;
      if (장비읽기글_(v[i][EQI_분류]).trim() !== cat) continue;
      same.push({ i: i, order: Number(v[i][EQI_순서]) || 0 });
    }
    same.sort(function (a, b) { return (a.order - b.order) || (a.i - b.i); });
    var pos = -1;
    same.forEach(function (x, k) { if (x.i === at) pos = k; });
    var to = pos + dir;
    if (pos < 0 || to < 0 || to >= same.length) return { ok: true, items: 장비항목들_().map(장비항목보기_) };
    var tmp = same[pos]; same[pos] = same[to]; same[to] = tmp;
    var orders = same.map(function (x) { return x.order; }).sort(function (a, b) { return a - b; });
    for (var k = 1; k < orders.length; k++) if (orders[k] <= orders[k - 1]) orders[k] = orders[k - 1] + 1;    // 같은 번호가 있었다면 다시 매깁니다
    var now = 장비지금_();
    same.forEach(function (x, k2) {
      if (Number(v[x.i][EQI_순서]) === orders[k2] && x.i !== at) return;       // 번호가 그대로인 줄은 다시 쓰지 않습니다
      var row = v[x.i].slice(0, HEAD_장비항목.length);
      while (row.length < HEAD_장비항목.length) row.push('');
      row[EQI_순서] = orders[k2];
      if (x.i === at) { row[EQI_수정자] = w.name; row[EQI_수정시각] = now; }
      장비행쓰기_(sh, x.i + 1, row);
    });
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { ok: true, items: 장비항목들_().map(장비항목보기_) };
}

/* ---------------------------------------------------------------- 2. 점검 기록 */

function 장비기록읽기_(r) {
  return { date: 날짜문자열_(r[EQR_날짜]), itemId: String(r[EQR_항목] || '').trim(), result: String(r[EQR_결과] || '').trim(),
    memo: 장비읽기글_(r[EQR_메모]), by: String(r[EQR_확인자] || '').trim(), at: 장비시각읽기_(r[EQR_시각]) };
}

/** 한 날짜의 기록 → { 항목ID: {result, memo, by, at} } */
function 장비하루기록_(date) {
  var out = {};
  rows_(SHEET_장비기록).forEach(function (r) {
    if (날짜문자열_(r[EQR_날짜]) !== date) return;
    var x = 장비기록읽기_(r);
    if (x.itemId) out[x.itemId] = { result: x.result, memo: x.memo, by: x.by, at: x.at };
  });
  return out;
}

/** 진행 요약 (쓰는 항목만 셉니다) */
function 장비요약기록_(items, rec) {
  var s = { total: 0, done: 0, ok: 0, issue: 0, na: 0 };
  items.forEach(function (it) {
    if (it.status !== '사용') return;
    s.total++;
    var x = rec[it.id];
    if (!x || !x.result) return;
    s.done++;
    if (x.result === 'OK') s.ok++; else if (x.result === '이상') s.issue++; else s.na++;
  });
  return s;
}

/** 최근에 점검한 날짜 (날짜 옮기기 · 빠른 이동용) */
function 장비최근날짜_(limit) {
  var by = {};
  rows_(SHEET_장비기록).forEach(function (r) {
    var d = 날짜문자열_(r[EQR_날짜]);
    if (!d || !String(r[EQR_결과] || '').trim()) return;
    var o = by[d] = by[d] || { date: d, n: 0, issue: 0 };
    o.n++;
    if (String(r[EQR_결과]).trim() === '이상') o.issue++;
  });
  return Object.keys(by).sort().reverse().slice(0, limit || 8).map(function (d) { return by[d]; });
}

/** 화면 첫 자료 — 항목 · 그날의 기록 · 요청 목록 · 내 권한 */
function equipmentInit(token, date) {
  var w = 장비권한_(token);
  date = 장비날짜_(date);
  try { 장비기본채움_(w); } catch (e) { /* 기본 항목을 못 채워도 화면은 열립니다 */ }
  var items = 장비항목들_();
  var rec = 장비하루기록_(date);
  return {
    me: 장비내용_(w), date: date, today: ymd_(new Date()),
    items: items.map(장비항목보기_), records: rec, summary: 장비요약기록_(items, rec),
    recent: 장비최근날짜_(8),
    tickets: 장비수리목록_(w, 'active'), ticketSummary: 장비요약_(),
    limits: { photos: 장비사진한도_, maxMb: Math.round(장비사진크기_ / 1048576), items: 장비항목한도_ }
  };
}

/** 다른 날짜의 점검 기록 */
function equipmentDay(token, date) {
  장비권한_(token);
  date = 장비날짜_(date);
  var items = 장비항목들_(), rec = 장비하루기록_(date);
  return { date: date, records: rec, summary: 장비요약기록_(items, rec), recent: 장비최근날짜_(8) };
}

/**
 * 항목 하나를 점검했다고 남기기. result: OK | 이상 | 해당없음 | '' (비우면 기록을 지웁니다)
 * 같은 날짜 · 같은 항목은 한 줄만 — 다시 누르면 덮어쓰고, 마지막에 누른 사람이 남습니다.
 */
function equipmentCheck(token, date, itemId, result, memo) {
  var w = 장비권한_(token);
  date = 장비날짜_(date);
  itemId = String(itemId || '').trim();
  result = String(result == null ? '' : result).trim();
  if (result && 장비결과목록_.indexOf(result) === -1) throw new Error('결과는 OK · 이상 · 해당없음 중에서 골라주세요.');
  memo = 장비글_(memo, 200);
  var it = 장비항목들_().filter(function (x) { return x.id === itemId; })[0];
  if (!it) throw new Error('점검 항목을 찾지 못했습니다. 새로고침해주세요.');
  if (result && it.status !== '사용') throw new Error('보관된 항목은 점검할 수 없습니다. 항목 관리에서 다시 꺼내 주세요.');
  var rec = null;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 장비시트_(SHEET_장비기록, HEAD_장비기록), v = sh.getDataRange().getValues(), at = -1;
    for (var i = 1; i < v.length; i++) {
      if (날짜문자열_(v[i][EQR_날짜]) === date && String(v[i][EQR_항목] || '').trim() === itemId) { at = i; break; }
    }
    if (!result && !memo) {
      if (at >= 0) sh.deleteRow(at + 1);                              // 결과도 메모도 없으면 기록을 지웁니다
    } else {
      var now = 장비지금_();
      var row = [date, itemId, result, 장비쓰기글_(memo), w.name, now];
      if (at >= 0) 장비행쓰기_(sh, at + 1, row); else 장비행쓰기_(sh, Math.max(sh.getLastRow(), 1) + 1, row);
      rec = { result: result, memo: memo, by: w.name, at: now };
    }
  } finally { lock.releaseLock(); }
  캐시비움_();
  var items = 장비항목들_();
  return { ok: true, record: rec, summary: 장비요약기록_(items, 장비하루기록_(date)), recent: 장비최근날짜_(8) };
}

/* ---------------------------------------------------------------- 3. 사진 */

function 장비사진폴더_() {
  var id = 설정값_('장비사진폴더');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var folder = DriveApp.createFolder('청년부 장비 수리 사진');
  설정저장_('장비사진폴더', folder.getId());
  return folder;
}

function 장비사진읽기_(r) {
  return { id: String(r[EQP_파일] || '').trim(), name: String(r[EQP_이름] || '').trim(), by: String(r[EQP_올린이] || '').trim(),
    ticket: String(r[EQP_티켓] || '').trim(), at: 장비시각읽기_(r[EQP_시각]) };
}

function 장비사진보기_(id, name) {
  return { id: id, name: name || '', thumb: 사진주소_(id, 480), full: 사진주소_(id, 1600) };
}

/** 요청에 붙이지 못하고 하루가 지난 사진은 정리합니다 (올릴 때 한 번에 조금씩) */
function 장비사진정리_(sh, v) {
  var limit = Utilities.formatDate(new Date(new Date().getTime() - 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var kill = [];
  for (var i = 1; i < v.length && kill.length < 20; i++) {
    var p = 장비사진읽기_(v[i]);
    if (!p.id || p.ticket) continue;
    if (p.at && p.at < limit) kill.push(i);
  }
  if (!kill.length) return 0;
  kill.forEach(function (i) { try { DriveApp.getFileById(String(v[i][EQP_파일]).trim()).setTrashed(true); } catch (e) {} });
  kill.sort(function (a, b) { return b - a; }).forEach(function (i) { sh.deleteRow(i + 1); v.splice(i, 1); });
  return kill.length;
}

/**
 * 사진 한 장 올리기 — 화면이 줄여서 보낸 사진을 드라이브 폴더에 저장합니다.
 * 요청을 보내기 전에는 "내가 올린 임시 사진"이고, 요청을 보내면 그 요청에 붙습니다.
 */
function equipmentPhotoUpload(token, fileName, dataUrl) {
  var w = 장비권한_(token);
  var m = /^data:([a-zA-Z0-9.+\/-]+);base64,([A-Za-z0-9+\/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('사진을 읽을 수 없습니다. 다른 사진으로 시도해주세요.');
  var mime = m[1].toLowerCase();
  var ext = 장비사진형식_[mime];
  if (!ext) throw new Error('사진(JPG · PNG · WEBP · HEIC) 파일만 올릴 수 있습니다.');
  if (m[2].length > 장비사진크기_ * 1.4) throw new Error('사진 한 장은 ' + Math.round(장비사진크기_ / 1048576) + 'MB까지 올릴 수 있습니다.');
  var bytes = Utilities.base64Decode(m[2].replace(/\s+/g, ''));
  if (!bytes || !bytes.length) throw new Error('사진을 읽을 수 없습니다. 다른 사진으로 시도해주세요.');
  if (bytes.length > 장비사진크기_) throw new Error('사진 한 장은 ' + Math.round(장비사진크기_ / 1048576) + 'MB까지 올릴 수 있습니다.');

  var safe = 장비줄_(String(fileName || '사진').replace(/[\\\/:*?"<>|]/g, '_'), 60) || '사진';
  safe = safe.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  safe = 'EQ_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '_' + safe + '.' + ext;

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var pid, sh;
  try {
    sh = 장비시트_(SHEET_장비사진, HEAD_장비사진);
    var v = sh.getDataRange().getValues();
    장비사진정리_(sh, v);
    var pending = 0;
    for (var i = 1; i < v.length; i++) { var p = 장비사진읽기_(v[i]); if (p.id && !p.ticket && p.by === w.name) pending++; }
    if (pending >= 장비대기사진_) throw new Error('아직 요청에 붙이지 않은 사진이 너무 많습니다. 요청을 보내거나 사진을 지운 뒤 다시 올려주세요.');
    var file = 장비사진폴더_().createFile(Utilities.newBlob(bytes, mime, safe));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    pid = file.getId();
    장비행쓰기_(sh, Math.max(sh.getLastRow(), 1) + 1, [pid, safe, w.name, '', 장비지금_()]);
  } finally { lock.releaseLock(); }
  캐시비움_();
  return 장비사진보기_(pid, safe);
}

/** 아직 요청에 붙이지 않은, 내가 올린 사진을 지웁니다 */
function equipmentPhotoRemove(token, fileId) {
  var w = 장비권한_(token);
  fileId = String(fileId || '').trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 장비시트_(SHEET_장비사진, HEAD_장비사진), v = sh.getDataRange().getValues();
    var i = 장비줄찾기_(v, EQP_파일, fileId);
    if (i < 0) return { ok: true };
    var p = 장비사진읽기_(v[i]);
    if (p.ticket) throw new Error('이미 요청에 붙은 사진은 지울 수 없습니다.');
    if (p.by !== w.name && !w.canApprove) throw new Error('내가 올린 사진만 지울 수 있습니다.');
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    sh.deleteRow(i + 1);
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { ok: true };
}

/* ---------------------------------------------------------------- 4. 수리 요청 */

function 장비수리읽기_(r) {
  var photos = [], hist = [];
  try { var a = JSON.parse(String(r[EQT_사진] || '[]')); if (Array.isArray(a)) photos = a.map(function (x) { return String(x || '').trim(); }).filter(function (x) { return x; }); } catch (e) {}
  try { var h = JSON.parse(String(r[EQT_이력] || '[]')); if (Array.isArray(h)) hist = h; } catch (e2) {}
  var st = String(r[EQT_상태] || '접수').trim();
  return {
    id: String(r[EQT_ID] || '').trim(), at: 장비시각읽기_(r[EQT_접수]), title: 장비읽기글_(r[EQT_제목]), detail: 장비읽기글_(r[EQT_상세]),
    item: 장비읽기글_(r[EQT_장비]), priority: 장비우선순위_.indexOf(String(r[EQT_우선] || '').trim()) !== -1 ? String(r[EQT_우선]).trim() : '보통',
    photos: photos, status: st, by: String(r[EQT_요청자] || '').trim(), handler: String(r[EQT_처리자] || '').trim(),
    memo: 장비읽기글_(r[EQT_메모]), changedAt: 장비시각읽기_(r[EQT_변경]), itemId: String(r[EQT_항목] || '').trim(),
    checkDate: 날짜문자열_(r[EQT_점검일]), history: hist
  };
}

/** 지금 상태에서 이 사람이 할 수 있는 일 → [{ key, label, needMemo }] (서버는 실제로 누를 때 다시 확인합니다) */
function 장비가능행동_(t, w) {
  var mine = !!w.name && t.by === w.name && !w.admin;
  var out = [];
  var add = function (key, label, needMemo) { out.push({ key: key, label: label, needMemo: !!needMemo }); };
  if (t.status === '접수') {
    if (w.canApprove) { add('approve', '승인'); add('reject', '반려', true); }
    if (w.canApprove || mine) add('cancel', '요청 취소');
  } else if (t.status === '승인') {
    if (w.canFinish) { add('start', '처리 시작'); add('complete', '완료 처리'); }
    if (w.canApprove) { add('reject', '반려', true); add('cancel', '요청 취소'); }
  } else if (t.status === '처리중') {
    if (w.canFinish) add('complete', '완료 처리');
    if (w.canApprove) add('cancel', '요청 취소');
  } else if (w.canApprove) {                        // 완료 · 반려 · 취소 — 커미티는 다시 접수로 되돌릴 수 있습니다
    add('reopen', '다시 접수');
  }
  return out;
}

var 장비행동표_ = {
  approve: { to: '승인', short: '승인됨' },
  reject: { to: '반려', short: '반려됨' },
  start: { to: '처리중', short: '처리 시작' },
  complete: { to: '완료', short: '처리 완료' },
  cancel: { to: '취소', short: '취소됨' },
  reopen: { to: '접수', short: '다시 접수됨' }
};

function 장비수리보기_(t, w) {
  return {
    id: t.id, at: t.at, title: t.title, detail: t.detail, item: t.item, priority: t.priority, status: t.status,
    by: t.by, handler: t.handler, memo: t.memo, changedAt: t.changedAt, itemId: t.itemId, checkDate: t.checkDate,
    photos: t.photos.map(function (id) { return 장비사진보기_(id, ''); }),
    history: (t.history || []).map(function (h) { return { at: String(h.at || ''), by: String(h.by || ''), to: String(h.to || ''), memo: String(h.memo || '') }; }),
    mine: !!w.name && t.by === w.name && !w.admin,
    actions: 장비가능행동_(t, w)
  };
}

function 장비수리들_() {
  var list = [];
  rows_(SHEET_장비수리).forEach(function (r) { if (String(r[EQT_ID] || '').trim()) list.push(장비수리읽기_(r)); });
  list.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)) || String(b.id).localeCompare(String(a.id)); });
  return list;
}

/** scope: mine(내 요청) | active(진행 중 — 접수 · 승인 · 처리중) | all(전체 — 최근 200건) */
function 장비수리목록_(w, scope) {
  var list = 장비수리들_();
  if (scope === 'mine') list = list.filter(function (t) { return !!w.name && t.by === w.name; });
  else if (scope === 'active') list = list.filter(function (t) { return 장비진행상태_.indexOf(t.status) !== -1; });
  return list.slice(0, 200).map(function (t) { return 장비수리보기_(t, w); });
}

/** 상태별 개수 — 포털 카드 · 관리 화면 · 할 일이 함께 씁니다 */
function 장비요약_() {
  var s = { total: 0, pending: 0, approved: 0, progress: 0, done: 0, rejected: 0, canceled: 0, urgentPending: 0, open: 0 };
  rows_(SHEET_장비수리).forEach(function (r) {
    if (!String(r[EQT_ID] || '').trim()) return;
    var st = String(r[EQT_상태] || '접수').trim();
    s.total++;
    if (st === '접수') { s.pending++; if (String(r[EQT_우선] || '').trim() === '긴급') s.urgentPending++; }
    else if (st === '승인') s.approved++;
    else if (st === '처리중') s.progress++;
    else if (st === '완료') s.done++;
    else if (st === '반려') s.rejected++;
    else if (st === '취소') s.canceled++;
  });
  s.open = s.pending + s.approved + s.progress;
  return s;
}

function equipmentTickets(token, scope) {
  var w = 장비권한_(token);
  scope = (scope === 'mine' || scope === 'all') ? scope : 'active';
  return { tickets: 장비수리목록_(w, scope), summary: 장비요약_(), me: 장비내용_(w) };
}

/** 티켓 번호 EQ-2026-001 — 연도별로 1번부터 (시트를 잠근 채로 부릅니다) */
function 장비수리번호_(v) {
  var prefix = 'EQ-' + new Date().getFullYear() + '-', max = 0;
  for (var i = 1; i < v.length; i++) {
    var no = String(v[i][EQT_ID] || '').trim();
    if (no.indexOf(prefix) !== 0) continue;
    var n = parseInt(no.slice(prefix.length), 10);
    if (n > max) max = n;
  }
  var next = String(max + 1);
  while (next.length < 3) next = '0' + next;
  return prefix + next;
}

/** 이 요청을 알아야 하는 분들 — 커미티(장비 메뉴 권한이 있는 분) + 찬양 · 방송 팀장 · 인도자 (요청한 본인은 뺍니다) */
function 장비알림받는사람_(exceptName) {
  var out = {};
  try {
    역할인사람_('커미티').forEach(function (n) { try { if (이름권한_(n, 'equipment', '').ok) out[n] = 1; } catch (e) {} });
  } catch (e2) {}
  try {
    var 명단 = 찬양명단_();
    Object.keys(명단).forEach(function (n) { if (찬양팀장_(n)) out[n] = 1; });
  } catch (e3) {}
  delete out[String(exceptName || '')];
  return Object.keys(out).sort();
}

/**
 * 수리 요청 보내기 (팀원 누구나).
 *   data = { title, detail, item, itemId?, priority, photos:[파일ID…], checkDate? }
 * 사진 파일 ID 는 방금 내가 올린(아직 어떤 요청에도 안 붙은) 것만 받습니다.
 */
function equipmentTicketCreate(token, data) {
  var w = 장비권한_(token);
  data = data || {};
  var title = 장비줄_(data.title, 60);
  var detail = 장비글_(data.detail, 2000);
  if (!title) throw new Error('무엇이 문제인지 제목을 적어주세요.');
  if (!detail) throw new Error('증상을 자세히 적어주세요. (언제 · 어떤 소리 · 어디가 안 되는지)');
  var priority = 장비우선순위_.indexOf(String(data.priority || '').trim()) !== -1 ? String(data.priority).trim() : '보통';
  var itemName = 장비줄_(data.item, 60);
  var itemId = String(data.itemId || '').trim().slice(0, 40);
  if (itemId) {
    var found = 장비항목들_().filter(function (x) { return x.id === itemId; })[0];
    if (found) { if (!itemName) itemName = found.name.slice(0, 60); } else itemId = '';
  }
  var checkDate = '';
  if (data.checkDate) { try { checkDate = 장비날짜_(data.checkDate); } catch (e) { checkDate = ''; } }
  var ids = (Array.isArray(data.photos) ? data.photos : []).map(function (x) { return String(x || '').trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  if (ids.length > 장비사진한도_) throw new Error('사진은 ' + 장비사진한도_ + '장까지 붙일 수 있습니다.');

  var ticket;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ps = 장비시트_(SHEET_장비사진, HEAD_장비사진), pv = ps.getDataRange().getValues();
    var rowOf = {};
    ids.forEach(function (id) {
      var i = 장비줄찾기_(pv, EQP_파일, id), p = i < 0 ? null : 장비사진읽기_(pv[i]);
      if (!p || p.ticket || p.by !== w.name) throw new Error('사진을 다시 올려주세요. (올린 지 하루가 지났거나 이미 쓰인 사진입니다)');
      rowOf[id] = i;
    });
    var sh = 장비시트_(SHEET_장비수리, HEAD_장비수리), v = sh.getDataRange().getValues();
    var mineOpen = 0;
    for (var k = 1; k < v.length; k++) if (String(v[k][EQT_요청자] || '').trim() === w.name && String(v[k][EQT_상태] || '').trim() === '접수') mineOpen++;
    if (mineOpen >= 장비열린요청한도_) throw new Error('아직 승인을 기다리는 요청이 ' + mineOpen + '건 있습니다. 처리된 뒤에 새 요청을 보내주세요.');
    var id = 장비수리번호_(v), now = 장비지금_();
    var hist = [{ at: now, by: w.name, to: '접수', memo: '' }];
    장비행쓰기_(sh, Math.max(sh.getLastRow(), 1) + 1, [id, now, 장비쓰기글_(title), 장비쓰기글_(detail), 장비쓰기글_(itemName), priority,
      JSON.stringify(ids), '접수', w.name, '', '', now, itemId, checkDate, JSON.stringify(hist)]);
    ids.forEach(function (fid) {
      var prow = pv[rowOf[fid]].slice(0, HEAD_장비사진.length);
      prow[EQP_티켓] = id;
      장비행쓰기_(ps, rowOf[fid] + 1, prow);
    });
    ticket = { id: id, at: now, title: title, detail: detail, item: itemName, priority: priority, photos: ids, status: '접수', by: w.name, handler: '',
      memo: '', changedAt: now, itemId: itemId, checkDate: checkDate, history: hist };
  } finally { lock.releaseLock(); }
  캐시비움_();

  var notified = 0;
  try {
    var names = 장비알림받는사람_(w.name);
    if (names.length) {
      var r = 알림보내기_('장비수리', names, {
        title: (priority === '긴급' ? '[긴급] ' : '') + '장비 수리 요청 · 승인 대기',
        body: title + '\n' + (itemName ? itemName + ' · ' : '') + w.name + ' 요청',
        url: 딥링크주소_('equipment', ticket.id), tag: '장비수리-' + ticket.id });
      notified = (r && r.sent) || 0;
    }
  } catch (e4) { /* 알림이 실패해도 요청은 이미 저장되었습니다 */ }
  return { ok: true, ticket: 장비수리보기_(ticket, w), notified: notified, summary: 장비요약_() };
}

/**
 * 요청 상태 바꾸기.
 *   action : approve(승인) · reject(반려 — 사유 필수) · start(처리 시작) · complete(완료) · cancel(취소) · reopen(다시 접수)
 *   memo   : 관리자 메모 (요청한 분에게도 보입니다)
 */
function equipmentTicketAct(token, id, action, memo) {
  var w = 장비권한_(token);
  id = String(id || '').trim();
  action = String(action || '').trim();
  var def = 장비행동표_[action];
  if (!def) throw new Error('알 수 없는 처리입니다.');
  memo = 장비글_(memo, 300);

  var result, changed;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = 장비시트_(SHEET_장비수리, HEAD_장비수리), v = sh.getDataRange().getValues();
    var i = 장비줄찾기_(v, EQT_ID, id);
    if (i < 0) throw new Error('요청을 찾지 못했습니다. 새로고침해주세요.');
    var t = 장비수리읽기_(v[i]);
    var allowed = 장비가능행동_(t, w).filter(function (a) { return a.key === action; })[0];
    if (!allowed) {
      if (t.status === def.to) throw new Error('이미 "' + t.status + '" 상태입니다. 새로고침해주세요.');
      throw new Error('지금 상태("' + t.status + '")에서는 이 처리를 할 수 없거나 권한이 없습니다.');
    }
    if (allowed.needMemo && !memo) throw new Error('사유를 적어주세요. 요청한 분에게 그대로 전달됩니다.');
    var now = 장비지금_();
    var row = v[i].slice(0, HEAD_장비수리.length);
    while (row.length < HEAD_장비수리.length) row.push('');
    var hist = t.history.slice(-29);
    hist.push({ at: now, by: w.name, to: def.to, memo: memo });
    row[EQT_상태] = def.to;
    if (!(t.by === w.name && action === 'cancel')) row[EQT_처리자] = w.name;
    if (memo) row[EQT_메모] = 장비쓰기글_(memo);
    if (action === 'reopen') row[EQT_메모] = memo ? 장비쓰기글_(memo) : '';
    row[EQT_변경] = now;
    row[EQT_이력] = JSON.stringify(hist);
    장비행쓰기_(sh, i + 1, row);
    changed = t; result = 장비수리읽기_(row);
  } finally { lock.releaseLock(); }
  캐시비움_();

  var notified = 0;
  if (result.by && result.by !== w.name && result.by !== '관리자') {
    try {
      var r = 알림보내기_('장비수리', [result.by], {
        title: '수리 요청 ' + def.short,
        body: result.title + (memo ? '\n' + w.name + ': ' + memo : ''),
        url: 딥링크주소_('equipment', result.id), tag: '장비수리-' + result.id });
      notified = (r && r.sent) || 0;
    } catch (e) { /* 알림 실패가 상태 변경을 막지 않습니다 */ }
  }
  return { ok: true, ticket: 장비수리보기_(result, w), notified: notified, summary: 장비요약_() };
}

/* ---------------------------------------------------------------- 5. 관리 화면 (Teva Apps 관리 › 장비 · 수리 요청) */

/** 커미티 · 관리자 — 전체 요청 + 상태별 개수 + 점검 현황 */
function equipmentAdminInit(token) {
  var w = 장비승인자_(token);
  var items = 장비항목들_(), today = ymd_(new Date()), rec = 장비하루기록_(today);
  return {
    me: 장비내용_(w), today: today,
    summary: 장비요약_(), tickets: 장비수리목록_(w, 'all'),
    check: { date: today, summary: 장비요약기록_(items, rec), issues: items.filter(function (it) { return it.status === '사용' && rec[it.id] && rec[it.id].result === '이상'; })
      .map(function (it) { return { id: it.id, name: it.name, category: it.category, memo: rec[it.id].memo, by: rec[it.id].by }; }) }
  };
}

/* ---------------------------------------------------------------- 6. 포털 · 관리 카드 · 내 할 일 연결 (app.js 가 부릅니다) */

/** 커미티 관리 카드 (포털관리메뉴_) — 승인 대기 · 처리 중 개수 */
function 장비관리카드_(r, app, akey, token) {
  if (!akey) return null;                    // 관리자키가 없는 위원회 범위 회원은 관리 카드 대신 포털 타일(장비 화면)에서 승인합니다
  var s = 장비요약_();
  var url = app + '?page=admin&key=' + akey + '#equip';
  return { key: 'equip', title: '장비 · 수리 요청', desc: '점검 항목 · 수리 요청 승인', url: url,
    stats: [
      { n: s.pending, l: '승인 대기', warn: s.pending > 0 },
      { n: s.approved + s.progress, l: '처리 중' },
      { n: s.done, l: '완료' }
    ] };
}

/**
 * 포털 "내 할 일" (내할일_ 이 부릅니다)
 *  · 승인할 수 있는 분: "승인 대기 수리 요청 N건"
 *  · 수리를 맡는 팀장 · 인도자: "처리할 수리 요청 N건" (승인됨 · 처리중)
 *  · 요청한 본인: 내 요청의 진행 상황 (끝난 요청은 2주 동안만, 치울 수 있음)
 * 찬양 · 방송팀도 커미티도 아니면 시트를 읽지 않고 바로 돌아갑니다.
 */
function 장비할일_(name, token, hidden, today, r) {
  var out = [];
  var 팀원 = false;
  try { 팀원 = !!찬양명단_()[name] || r.roles.indexOf('찬양팀') !== -1 || r.roles.indexOf('커미티') !== -1; } catch (e) {}
  if (!팀원) return out;
  var w;
  try { w = 장비권한_(token); } catch (e2) { return out; }
  var base = 앱주소_() || '';
  var url = base + '?page=equipment&t=' + encodeURIComponent(token);
  var list = 장비수리들_();
  hidden = hidden || {};

  if (w.canApprove) {
    var wait = list.filter(function (t) { return t.status === '접수'; });
    if (wait.length && !hidden['equip-approve-' + today]) {
      out.push(할일하나_({ id: 'equip-approve-' + today, kind: 'role', icon: '🔧',
        title: '승인 대기 수리 요청 ' + wait.length + '건',
        sub: wait.slice(0, 3).map(function (t) { return (t.priority === '긴급' ? '[긴급] ' : '') + t.title; }).join(' · ') + (wait.length > 3 ? ' 외' : ''),
        url: url, tone: wait.some(function (t) { return t.priority === '긴급'; }) ? 'urgent' : 'warn' }));
    }
  }
  if (w.canFinish) {
    var work = list.filter(function (t) { return t.status === '승인' || t.status === '처리중'; });
    if (work.length && !hidden['equip-work-' + today]) {
      out.push(할일하나_({ id: 'equip-work-' + today, kind: 'role', icon: '🛠️',
        title: '처리할 수리 요청 ' + work.length + '건',
        sub: work.slice(0, 3).map(function (t) { return t.title + ' (' + t.status + ')'; }).join(' · ') + (work.length > 3 ? ' 외' : ''),
        url: url, tone: 'info' }));
    }
  }
  var limit = ymd_(new Date(parseYmd_(today).getTime() - 14 * 86400000));
  list.forEach(function (t) {
    if (!w.name || t.by !== w.name) return;
    var 끝 = 장비진행상태_.indexOf(t.status) === -1;
    if (끝 && String(t.changedAt || '').slice(0, 10) < limit) return;
    var 마지막 = t.history && t.history.length ? t.history[t.history.length - 1] : null;
    if (t.status === '취소' && 마지막 && 마지막.by === t.by) return;              // 내가 직접 취소한 요청은 알려줄 필요가 없음
    var id = ('equip-my-' + t.id + '-' + t.status).slice(0, 80);
    if (hidden[id]) return;
    var tone = t.status === '완료' ? 'ok' : (t.status === '반려' ? 'warn' : 'info');
    out.push(할일하나_({ id: id, kind: 'track', icon: '🔧',
      title: '수리 요청 · ' + t.title, sub: t.status + (t.memo ? ' — ' + t.memo : ''),
      url: base + '?page=equipment&t=' + encodeURIComponent(token) + '&ticket=' + encodeURIComponent(t.id), tone: tone }));
  });
  return out;
}
