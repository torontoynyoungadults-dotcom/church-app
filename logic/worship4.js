/**
 * 찬양방송팀 허브 Step 2.9 — 연습 화면 "설정" 팀 실시간 공유 (서버 쪽)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 *
 * ▣ 무엇을 저장하나
 *    필기는 lib/realtime.js 가 맡고 (Step 2), 여기서는 필기가 아닌 "설정" 을 맡습니다.
 *    · 쪽 ↔ 곡 연결 (map)         악보 파일 한 개에서 몇 쪽부터 어느 곡인지          — 열쇠: 악보 파일 ID
 *    · 곡별 메트로놈 설정 (metro)   박자 · 강세 · 시작 전 마디 · BPM                 — 열쇠: 곡 이름
 *    · 나만 보는 곡 정보 (song)     BPM · 송폼 · 유튜브 링크를 "나에게만" 바꿔 둔 것    — 열쇠: 곡 이름 (mine 층에만 있음)
 *    · 곡 정보 자체(BPM · 송폼 · 유튜브 링크)의 팀 공유는 원래 있던 '찬양콘티' 줄을 그대로 고칩니다 (worshipSongPatch)
 *      → 허브의 곡 편집 화면과 연습 화면이 항상 같은 값을 봅니다 (원본은 하나).
 *
 * ▣ 층 (layer) — 필기와 같은 규칙
 *    team : 팀 모두에게 보임 · 실시간으로 전달 · 팀장 · 인도자(canEdit)만 바꿈. 소유 = '*'
 *    mine : "나만 보기" — 내 것으로만 저장, 전달하지 않음. 누구나.
 *
 * ▣ 실시간 전달
 *    이 함수들은 결과에 bcast: { room, event, payload } 를 달아 돌려줍니다. server.js 가 그것을 떼어내
 *    같은 방(웹소켓) 사람들에게 뿌립니다 (화면에는 bcast 없이 나갑니다). 그래서 시트 저장과 실시간 전달이 한 번에 됩니다.
 */

var SHEET_연습설정 = '연습설정';
var HEAD_연습설정 = ['방', '종류', '열쇠', '소유', '내용', '수정시각', '수정자'];
var XC_방 = 0, XC_종류 = 1, XC_열쇠 = 2, XC_소유 = 3, XC_내용 = 4, XC_시각 = 5, XC_수정 = 6;
var 연습설정값한도_ = 6000;        // 한 설정 값의 글자 수 (시트 한 칸은 5만 글자까지)
var 연습설정개수한도_ = 800;       // 한 방에 둘 수 있는 설정 수

function 연습설정시트_() {
  return 주보시트_(SHEET_연습설정, HEAD_연습설정);
}

function 연습설정방_(room) {
  room = String(room || '').trim();
  if (!/^(\d{4}-\d{2}-\d{2}|ev-[0-9a-z]{6,}(~[0-9a-z]{1,10})?)$/i.test(room)) throw new Error('예배(날짜)를 확인해주세요.');
  return room;
}

function 연습설정열쇠_(kind, key) {
  key = String(key == null ? '' : key).replace(/[\u0000-\u001f]/g, '').trim();
  if (kind === 'map') {
    if (!/^[A-Za-z0-9_-]{10,}$/.test(key)) throw new Error('악보 파일을 확인해주세요.');
  } else if (kind === 'follow') {
    if (key !== 'sync') throw new Error('설정 이름을 확인해주세요.');
  } else if (!key || key.length > 80) {
    throw new Error('곡 이름을 확인해주세요.');
  }
  return key;
}

function 연습정수_(v, lo, hi, fallback) {
  v = Math.round(Number(v));
  return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

/** 값 정리 — 형식에 맞지 않는 것은 버립니다. 비어 있으면 null (= 설정 지우기) */
function 연습설정값정리_(kind, value) {
  if (value == null) return null;
  if (kind === 'map') {                                    // { "쪽": 곡번호 }  (곡번호 = 이 방 곡 목록의 순번, 0부터)
    var m = {}, n = 0;
    Object.keys(value || {}).forEach(function (k) {
      var pg = Math.round(Number(k));
      if (!(pg >= 1 && pg <= 500) || n >= 300) return;
      var v = Math.round(Number(value[k]));
      if (!isFinite(v) || v < 0 || v > 199) return;
      m[pg] = v; n++;
    });
    return n ? m : null;
  }
  if (kind === 'metro') {
    var o = {}, any = false;
    if (value.num != null) { o.num = 연습정수_(value.num, 1, 16, 4); any = true; }
    if (value.den != null) { var d = 연습정수_(value.den, 2, 16, 4); o.den = [2, 4, 8, 16].indexOf(d) >= 0 ? d : 4; any = true; }
    if (Array.isArray(value.marks)) { o.marks = value.marks.slice(0, 16).map(function (x) { return 연습정수_(x, 0, 2, 0); }); any = true; }
    if (value.count != null) { o.count = 연습정수_(value.count, 0, 4, 0); any = true; }
    if (value.bpm != null && String(value.bpm) !== '') { o.bpm = 연습정수_(value.bpm, 30, 300, 72); any = true; }
    return any ? o : null;
  }
  if (kind === 'follow') {                                 // 내 따라가기 스위치 { page, metro } — 나만 (팀 공유 안 함)
    return { page: value.page !== false && value.page !== 0 && value.page !== '0', metro: value.metro !== false && value.metro !== 0 && value.metro !== '0' };
  }
  if (kind === 'song') {                                   // 나에게만 바꿔 둔 곡 정보
    var s = {}, has = false;
    if (value.bpm != null) { s.bpm = String(value.bpm).replace(/[^0-9]/g, '').slice(0, 3); has = true; }
    if (value.form != null) { s.form = String(value.form).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120); has = true; }
    if (value.link != null) { s.link = String(value.link).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 300); has = true; }
    return has ? s : null;
  }
  throw new Error('설정 종류를 확인해주세요.');
}

/** 한 방 · 한 층의 설정 목록 → [{ kind, key, value, by, ts }] */
function 연습설정읽기_(room, owner) {
  room = 연습설정방_(room); owner = String(owner || '*');
  var out = [];
  rows_(SHEET_연습설정).forEach(function (r) {
    if (String(r[XC_방]).trim() !== room || String(r[XC_소유]).trim() !== owner) return;
    var v = null;
    try { v = JSON.parse(String(r[XC_내용] || 'null')); } catch (e) { v = null; }
    if (v == null) return;
    out.push({ kind: String(r[XC_종류]).trim(), key: String(r[XC_열쇠]).trim(), value: v, by: String(r[XC_수정] || ''), ts: String(r[XC_시각] || '') });
  });
  return out;
}

/** 설정 하나를 넣거나 (value 있음) 지웁니다 (value 없음) — 같은 방 · 층 · 종류 · 열쇠의 줄만 바꿉니다 */
function 연습설정저장_(room, owner, kind, key, value, by) {
  room = 연습설정방_(room); owner = String(owner || '*');
  if (['map', 'metro', 'song', 'follow'].indexOf(kind) < 0) throw new Error('설정 종류를 확인해주세요.');
  key = 연습설정열쇠_(kind, key);
  var clean = 연습설정값정리_(kind, value);
  var json = clean == null ? '' : JSON.stringify(clean);
  if (json.length > 연습설정값한도_) throw new Error('설정이 너무 큽니다.');
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    연습설정시트_();
    if (clean != null) {
      var count = rows_(SHEET_연습설정).filter(function (r) { return String(r[XC_방]).trim() === room; }).length;
      var exists = rows_(SHEET_연습설정).some(function (r) {
        return String(r[XC_방]).trim() === room && String(r[XC_종류]).trim() === kind && String(r[XC_열쇠]).trim() === key && String(r[XC_소유]).trim() === owner;
      });
      if (!exists && count >= 연습설정개수한도_) throw new Error('이 예배에 저장된 설정이 너무 많습니다.');
    }
    시트치환_(SHEET_연습설정, HEAD_연습설정, function (r) {
      return String(r[XC_방]).trim() === room && String(r[XC_종류]).trim() === kind && String(r[XC_열쇠]).trim() === key && String(r[XC_소유]).trim() === owner;
    }, clean == null ? [] : [[room, kind, key, owner, json, now, String(by || '')]], [{ col: XC_방 }, { col: XC_열쇠 }, { col: XC_소유 }]);
  } finally { lock.releaseLock(); }
  return clean;
}

function 연습나_(w) { return String(w.name || '').trim() || '커미티'; }

/** 이 방의 곡 목록 (콘티 + 결단) — 순번(seq) · 구분(kind) 포함. 연습 화면이 곡을 "다시 불러올 때" 씁니다 */
function 연습곡목록_(room) {
  var date = 날짜문자열_(room), out = [];
  ['콘티', '결단'].forEach(function (kind) {
    콘티목록_(date, kind).forEach(function (s) {
      out.push({ title: s.title, key: s.key, bpm: s.bpm, form: s.form, team: s.team, link: s.link || '', seq: s.seq, kind: kind });
    });
  });
  return out;
}

/* =========================================================
   화면에서 부르는 함수
   ========================================================= */

/** 연습 화면을 열 때 — 팀 설정 · 내 설정 · 최신 곡 목록 */
function worshipCfgLoad(token, room) {
  var w = 찬양권한_(token), me = 연습나_(w);
  room = 연습설정방_(room);
  return { team: 연습설정읽기_(room, '*'), mine: 연습설정읽기_(room, me), songs: 연습곡목록_(room), me: me, canEdit: !!w.canEdit };
}

/**
 * 설정 하나 저장.
 *   layer 'team' → 팀장 · 인도자만 · 팀 모두에게 실시간 전달 (map · metro)
 *   layer 'mine' → 나만 (map · metro · song) — 전달하지 않음
 *   value 가 비어 있으면 그 설정을 지웁니다.  cid = 이 화면의 식별자 (내가 보낸 것이 되돌아와도 무시하기 위해)
 */
function worshipCfgSave(token, room, layer, kind, key, value, cid) {
  var w = 찬양권한_(token), me = 연습나_(w);
  room = 연습설정방_(room);
  kind = String(kind || '');
  layer = layer === 'mine' ? 'mine' : 'team';
  if (layer === 'team') {
    if (!w.canEdit) throw new Error('팀 전체에 공유되는 설정은 팀장 · 인도자만 바꿀 수 있습니다. ("나만 보기" 를 켜면 내 설정으로 저장됩니다)');
    if (kind === 'song') throw new Error('곡 정보는 "곡 정보 저장" 으로 바꿔주세요.');
    if (kind === 'follow') throw new Error('따라가기 설정은 나만 저장할 수 있습니다.');
  }
  var clean = 연습설정저장_(room, layer === 'team' ? '*' : me, kind, key, value, me);
  key = 연습설정열쇠_(kind, key);
  var out = { ok: true, layer: layer, kind: kind, key: key, value: clean, by: me };
  if (layer === 'team') out.bcast = { room: room, event: 'cfg', payload: { kind: kind, key: key, value: clean, by: me, cid: String(cid || '').slice(0, 40), layer: 'team' } };
  return out;
}

/**
 * 곡 정보(BPM · 송폼 · 유튜브 링크) 일부만 고치기 — '찬양콘티' 의 그 줄만 바뀌고 나머지 칸(제목 · 팀 · Key · 설명 · 솔로)은 그대로.
 * 허브의 곡 편집 화면과 같은 자리를 고치므로 어디서 고쳐도 같은 값이 보입니다. 팀 모두에게 실시간 전달.
 */
function worshipSongPatch(token, room, kind, seq, patch, cid) {
  var w = requireWorshipEdit_(token);
  var me = 연습나_(w);
  room = 연습설정방_(room);
  var date = 날짜문자열_(room);
  kind = 구분정리_(kind);
  seq = Number(seq) || 0;
  patch = patch || {};
  var clean = {};
  if (patch.bpm != null) {
    var b = String(patch.bpm).replace(/[^0-9]/g, '').slice(0, 3);
    if (b && (Number(b) < 30 || Number(b) > 300)) throw new Error('BPM 은 30 ~ 300 사이로 넣어주세요.');
    clean.bpm = b;
  }
  if (patch.form != null) clean.form = String(patch.form).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (patch.link != null) {
    var l = String(patch.link).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 300);
    if (l && !/^https?:\/\//i.test(l)) throw new Error('링크는 http 로 시작하는 주소여야 합니다.');
    clean.link = l;
  }
  if (!Object.keys(clean).length) throw new Error('바꿀 내용이 없습니다.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var found = null;
  try {
    var sh = 찬양시트_(SHEET_찬양콘티, HEAD_찬양콘티), last = sh.getLastRow(), all = last > 1 ? sh.getRange(2, 1, last - 1, HEAD_찬양콘티.length).getValues() : [];
    var idx = -1;
    all.forEach(function (r, i) {
      if (idx < 0 && 날짜문자열_(r[WS_날짜]) === date && Number(r[WS_순서]) === seq && 구분정리_(r[WS_구분]) === kind) idx = i;
    });
    if (idx < 0) throw new Error('곡을 찾지 못했습니다. 화면을 새로 열어주세요.');
    var row = all[idx].slice();
    if (clean.bpm != null) row[WS_BPM] = clean.bpm;
    if (clean.form != null) row[WS_송폼] = clean.form;
    if (clean.link != null) row[WS_링크] = clean.link;
    시트치환_(SHEET_찬양콘티, HEAD_찬양콘티, function (r) {
      return 날짜문자열_(r[WS_날짜]) === date && Number(r[WS_순서]) === seq && 구분정리_(r[WS_구분]) === kind;
    }, [row]);
    found = { seq: seq, kind: kind, title: String(row[WS_제목] || '').trim(), bpm: String(row[WS_BPM] || '').trim(), form: String(row[WS_송폼] || '').trim(), link: String(row[WS_링크] || '').trim() };
  } finally { lock.releaseLock(); }
  return { ok: true, song: found, patch: clean, by: me,
    bcast: { room: room, event: 'song', payload: { kind: kind, seq: seq, patch: clean, by: me, cid: String(cid || '').slice(0, 40) } } };
}

/** 곡 목록 다시 불러오기 (허브에서 콘티가 바뀌었을 때 열려 있는 연습 화면이 부릅니다) */
function worshipSongsOf(token, room) {
  찬양권한_(token);
  return { songs: 연습곡목록_(연습설정방_(room)) };
}
