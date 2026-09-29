/**
 * 찬양방송팀 허브 Step 2 — 연습 모드 · 실시간 악보 필기 · 리더/팔로워 (서버 쪽)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * app.js 의 찬양권한_ · 시트 도구를 그대로 쓰고, 새 이름만 더합니다.
 *
 * ▣ 실시간(웹소켓)은 lib/realtime.js 가 맡고, 이 파일은 그 서버가 시트와 만나는 자리입니다.
 *    · 찬양소켓인증_        웹소켓 접속 때 "이 사람이 누구이고 무엇을 할 수 있나" (찬양권한_ 과 같은 기준)
 *    · 찬양악보파일허용_     /sheet/<id> 로 악보 파일을 흘려보내도 되는지
 *    · 찬양주석읽기_ · 저장_  필기를 '찬양주석' 탭 (= [DB05] 찬양 · 방송 허브) 에 보관
 *
 * ▣ 필기는 시트에 곧바로 쓰지 않습니다 — 구글 시트는 쓰기 횟수 제한이 낮아서, 그리는 동안에는 서버 메모리에서
 *    실시간으로 나누고 (lib/realtime.js), 멈춘 뒤 몇 초 만에 한 번 묶어서 저장합니다.
 *
 * ▣ 필기 층 (layer)
 *    team : 팀 전체에게 보이는 필기 — 실시간으로 함께 보임. 소유 = '*'
 *    mine : 나만 보는 필기 — 웹소켓을 타지 않고 내 것으로만 저장. 소유 = 내 이름
 *
 * ▣ 범위 (scope) — 이 필기가 어디까지 붙어 있나
 *    'song'       : 그 악보 파일에 계속 (다른 날짜 콘티에 다시 써도 남음)
 *    '<예배키>'    : 그 날짜(또는 행사) 콘티에서만
 */

var SHEET_찬양주석 = '찬양주석';
var HEAD_찬양주석 = ['파일ID', '범위', '소유', '순번', '내용', '수정시각', '수정자'];
var WN_파일 = 0, WN_범위 = 1, WN_소유 = 2, WN_순번 = 3, WN_내용 = 4, WN_시각 = 5, WN_수정 = 6;
var 주석칸한도_ = 40000;          // 시트 한 칸은 5만 글자까지 — 넘으면 여러 줄(순번)로 나눕니다
var 주석항목한도_ = 4000;         // 한 필기 층에 둘 수 있는 필기 수

/** 웹소켓 접속 — 찬양권한_ 과 같은 기준으로 이 사람이 누구인지 확인합니다 (화면에서는 부를 수 없음) */
function 찬양소켓인증_(token) {
  var w = 찬양권한_(token);
  var name = String(w.name || '').trim() || (w.admin ? '커미티' : '팀 계정');
  return { name: name, canEdit: !!w.canEdit, admin: !!w.admin, committee: !!w.committee, canLead: !!w.canEdit };
}

/** /sheet/<id> 로 흘려보내도 되는 파일인지 — 찬양 악보에 올라온 파일만 */
function 찬양악보파일허용_(id) {
  id = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return false;
  return rows_(SHEET_찬양악보).some(function (r) { return String(r[WF_파일] || '').trim() === id; }) || 저장소파일냐_(id);   // 콘티 악보 + 악보 저장소(Step 2.8)
}

function 찬양주석파일_(id) {
  id = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error('악보 파일을 확인해주세요.');
  return id;
}

/** 범위 — 'song' 또는 예배키(날짜 · 행사) */
function 찬양주석범위_(scope) {
  scope = String(scope || 'song').trim();
  if (scope === 'song') return scope;
  return 예배키_(scope);
}

function 찬양주석시트_() {
  return 주보시트_(SHEET_찬양주석, HEAD_찬양주석);
}

/** 한 층(파일 · 범위 · 소유)의 필기 목록 */
function 찬양주석읽기_(file, scope, owner) {
  file = 찬양주석파일_(file); scope = 찬양주석범위_(scope); owner = String(owner || '*');
  var parts = [];
  rows_(SHEET_찬양주석).forEach(function (r) {
    if (String(r[WN_파일]).trim() !== file || String(r[WN_범위]).trim() !== scope || String(r[WN_소유]).trim() !== owner) return;
    parts.push({ n: Number(r[WN_순번]) || 0, s: String(r[WN_내용] || '') });
  });
  if (!parts.length) return [];
  parts.sort(function (a, b) { return a.n - b.n; });
  var list = [];
  try { list = JSON.parse(parts.map(function (p) { return p.s; }).join('') || '[]'); } catch (e) { list = []; }
  return Array.isArray(list) ? list.slice(0, 주석항목한도_) : [];
}

/** 한 층을 통째로 바꿔 저장 (없으면 지움) */
function 찬양주석저장_(file, scope, owner, items, by) {
  file = 찬양주석파일_(file); scope = 찬양주석범위_(scope); owner = String(owner || '*');
  items = (Array.isArray(items) ? items : []).slice(0, 주석항목한도_);
  var json = items.length ? JSON.stringify(items) : '';
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var rows = [];
  for (var i = 0; i * 주석칸한도_ < json.length; i++) {
    rows.push([file, scope, owner, i, json.slice(i * 주석칸한도_, (i + 1) * 주석칸한도_), now, String(by || '')]);
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    찬양주석시트_();
    시트치환_(SHEET_찬양주석, HEAD_찬양주석, function (r) {
      return String(r[WN_파일]).trim() === file && String(r[WN_범위]).trim() === scope && String(r[WN_소유]).trim() === owner;
    }, rows, [{ col: WN_범위 }, { col: WN_소유 }]);
  } finally { lock.releaseLock(); }
  return rows.length;
}

/* =========================================================
   화면에서 부르는 함수 — 웹소켓이 끊겨도 내 필기 · 팀 필기를 읽고 저장할 수 있게
   ========================================================= */

/** 필기 읽기 → { team: [...], mine: [...] } (팀 필기는 시트에 저장된 것 — 접속 중이면 실시간 서버가 최신을 줍니다) */
function worshipAnnoLoad(token, file, scope) {
  var w = 찬양권한_(token);
  var me = String(w.name || '').trim() || '커미티';
  return { team: 찬양주석읽기_(file, scope, '*'), mine: 찬양주석읽기_(file, scope, me), me: me, canEdit: !!w.canEdit };
}

/** 내 필기 저장 — 나만 보는 층입니다 (팀 필기는 실시간 서버가 저장합니다) */
function worshipAnnoSaveMine(token, file, scope, items) {
  var w = 찬양권한_(token);
  var me = String(w.name || '').trim() || '커미티';
  if (!Array.isArray(items)) throw new Error('필기 형식이 올바르지 않습니다.');
  if (JSON.stringify(items).length > 주석칸한도_ * 4) throw new Error('필기가 너무 많습니다. 일부를 지운 뒤 저장해주세요.');
  찬양주석저장_(file, scope, me, items, me);
  return { ok: true, n: items.length };
}
