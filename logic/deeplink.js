/**
 * 알림 바로가기 (딥링크) — 알림을 누르면 "새가족 메뉴"가 아니라 "그 새가족" 화면으로 갑니다 (Step 1)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 *
 * ▣ 예전 방식
 *    알림(푸시 · 이메일 · 포털 공지)이 페이지 주소만 담았습니다 — 예: ?page=newfamily
 *    → 누르면 새가족 "목록"이 열려서 누구 알림인지 다시 찾아야 했고,
 *      회의록 · 앨범 · 선교 화면은 주소에 로그인 표(t)가 없으면 "포털로 들어와 주세요" 만 보였습니다.
 *
 * ▣ 새 방식 — 포털이 길잡이
 *    알림에는 로그인 표 없이 "종류 + 번호" 만 담습니다:   ?page=portal&go=newcomer&id=홍길동
 *    포털이 로그인(저장된 구글 로그인)을 확인한 뒤 서버에 묻습니다:  resolveDeepLink(표, 종류, 번호)
 *    서버는 ① 그런 항목이 아직 있는지 ② 이 사람이 볼 권한이 있는지 를 확인하고
 *    그 항목을 여는 완성된 주소(표 포함)를 돌려줍니다 → 포털이 그 주소로 이동.
 *    · 알림 내용(푸시 메시지)에는 로그인 표가 들어가지 않습니다
 *    · 권한이 없거나 지워진 항목이면 이유를 알려 주고 포털에 머뭅니다
 *    · 로그인이 안 되어 있으면 로그인을 마친 뒤(구글에 다녀와도) 그 항목으로 이어집니다
 *
 * 새 종류를 더할 때는 딥링크경로_ 에 한 줄 + 아래 딥링크확인_ 에 한 갈래를 더하면 됩니다.
 */

/**
 * 바로가기 종류 → 실제 화면.
 *  page   : ?page= 값
 *  params : (번호, 덤) → 그 화면이 이미 읽는 주소 값들
 *  label  : 안내 문구에 쓰는 이름
 */
var 딥링크경로_ = {
  newcomer: { page: 'newfamily', label: '새가족', params: function (id) { return { open: id }; } },
  minutes:  { page: 'minutes',   label: '회의록', params: function (id) { return { id: id }; } },
  album:    { page: 'album',     label: '포토 앨범', params: function (id) { return { id: id }; } },
  mission:  { page: 'mission',   label: '선교팀', params: function (id) { return { team: id }; } },
  cell:     { page: 'leader',    label: '셀모임 보고서', params: function (id, x) { return x ? { cell: id, date: x } : { cell: id }; } }
};

function 딥링크종류인가_(type) {
  return Object.prototype.hasOwnProperty.call(딥링크경로_, String(type || ''));
}

/**
 * 알림에 넣을 바로가기 주소 (로그인 표 없음). 종류를 모르거나 번호가 비면 포털 첫 화면입니다.
 *   딥링크주소_('newcomer', '홍길동')  →  https://…/?page=portal&go=newcomer&id=%ED%99%8D…
 */
function 딥링크주소_(type, id, x) {
  var base = (앱주소_() || '') + '?page=portal';
  id = String(id == null ? '' : id).trim();
  if (!딥링크종류인가_(type) || !id) return base;
  return base + '&go=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id.slice(0, 120)) +
    (x ? '&x=' + encodeURIComponent(String(x).slice(0, 60)) : '');
}

/**
 * 손으로 적는 링크 칸(공지 · 알림 직접 보내기)에서 "newcomer:홍길동", "cell:1셀@2026-09-27" 같은 줄임 표기를
 * 바로가기 주소로 바꿉니다. 다른 글자는 그대로 돌려줍니다.
 */
function 딥링크정규화_(input) {
  var s = String(input == null ? '' : input).trim();
  var m = /^([a-z]+)\s*[:：]\s*([^@]+?)\s*(?:@\s*(.+))?$/.exec(s);
  if (m && 딥링크종류인가_(m[1])) return 딥링크주소_(m[1], m[2], m[3] || '');
  return s;
}

/** 이 사람(표)이 이 항목을 볼 수 있는지 · 항목이 아직 있는지 → { ok, title } 또는 { ok:false, code, message } */
function 딥링크확인_(token, type, id, x) {
  var ro = function (code, message) { return { ok: false, code: code, message: message }; };
  var admin = isAdmin_(token) || 마스터_(token);
  var me = admin ? null : 포털본인_(token);
  if (!admin && !me) return ro('login', '다시 로그인해주세요.');
  var name = me ? me.name : '';

  if (type === 'newcomer') {
    var nf = 새가족하나_(id);
    if (!nf) return ro('notfound', '새가족 "' + id + '" 님을 찾지 못했습니다. 이미 정리되었거나 이름이 바뀌었을 수 있습니다.');
    if (!admin && !포털권한_(token, '새가족')) return ro('forbidden', '새가족 관리 권한이 없습니다. 커미티에 문의해주세요.');
    return { ok: true, title: nf.name };
  }

  if (type === 'minutes') {
    var m = 회의하나_(id);
    if (!m) return ro('notfound', '회의록을 찾지 못했습니다. 지워졌을 수 있습니다.');
    if (!admin) {
      try { 회의록접근확인_(token, m); } catch (e) { return ro('forbidden', e.message || '이 회의록을 볼 권한이 없습니다.'); }
    }
    return { ok: true, title: m.title || '회의록' };
  }

  if (type === 'album') {
    var al = 앨범하나_(id);
    if (!al) return ro('notfound', '앨범을 찾지 못했습니다. 지워졌을 수 있습니다.');
    if (!admin && !앨범볼수있나3_(name, al)) return ro('forbidden', '이 앨범은 공개된 팀 · 셀만 볼 수 있습니다.');   // Step 7 — 제목도 알려주지 않음
    return { ok: true, title: al.title };
  }

  if (type === 'mission') {
    var 팀 = 선교팀목록_().filter(function (t) { return t.name === String(id).trim(); })[0];
    if (!팀) return ro('notfound', '선교팀을 찾지 못했습니다.');
    if (!admin && !(전체커미티인가_(name) && 포털역할_(name).roles.indexOf('커미티') !== -1) &&
        선교속한팀_(name).indexOf(팀.name) === -1) {
      return ro('forbidden', '이 선교팀에 속해 있지 않습니다. 커미티에 문의해주세요.');
    }
    return { ok: true, title: 팀.name };
  }

  if (type === 'cell') {
    var cell = getCells().filter(function (c) { return c.name === String(id).trim(); })[0];
    if (!cell) return ro('notfound', '셀을 찾지 못했습니다.');
    if (!admin && !포털권한_(token, '셀', cell.name)) return ro('forbidden', '이 셀의 보고서를 볼 권한이 없습니다.');
    return { ok: true, title: cell.name };
  }

  return ro('unknown', '알 수 없는 바로가기입니다.');
}

/**
 * 포털이 부릅니다 — 알림에서 들어온 바로가기를 확인하고, 그 항목을 여는 완성된 주소를 돌려줍니다.
 *   성공: { ok:true, url, label, title }
 *   실패: { ok:false, code:'login'|'notfound'|'forbidden'|'unknown', message }   (오류를 던지지 않습니다 — 화면이 안내만 하고 포털에 머뭅니다)
 */
function resolveDeepLink(token, type, id, x) {
  type = String(type || '').trim();
  id = String(id == null ? '' : id).trim().slice(0, 120);
  x = String(x == null ? '' : x).trim().slice(0, 60);
  if (!딥링크종류인가_(type) || !id) return { ok: false, code: 'unknown', message: '알 수 없는 바로가기입니다.' };
  var route = 딥링크경로_[type];
  var chk = 딥링크확인_(token, type, id, x);
  if (!chk.ok) return chk;
  var q = '?page=' + route.page + '&t=' + encodeURIComponent(String(token || '').trim());
  var params = route.params(id, x);
  Object.keys(params).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(params[k]); });
  return { ok: true, url: (앱주소_() || '') + q, label: route.label, title: chk.title };
}
