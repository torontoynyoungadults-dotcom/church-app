/**
 * 찬양방송팀 허브 Step 2.8 — 녹음 자동 링크 · 악보 저장소 · 가사 보관 (서버 쪽)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * app.js 의 찬양권한_ · rows_ · 시트치환_ · 한주_ 를 그대로 쓰고, 새 이름만 더합니다.
 * 기존 함수는 바꾸지 않습니다 — 예외로, 악보 파일을 지우는 세 곳(removeWorshipSheet · 행사 삭제 · 주일 삭제)이
 * "저장소에 보관된 악보는 드라이브에서 지우지 않는다" 한 줄만 더 확인합니다 (악보치우기_ 를 부름).
 *
 * ▣ 1. 녹음 자동 링크  worshipAutoLinkRecordings(token, date)
 *      · 드라이브의 녹음 폴더(아래 상수 또는 설정 '찬양음원폴더') 밑을 하위 폴더까지 뒤져 mp3 · wav · m4a 를 찾고,
 *      · 파일이 "만들어진 날"의 요일로 분류합니다 — 토요일 → 토요일 연습(Saturday Practice), 주일 → 주일 예배(Sunday Worship)
 *      · 고른 주의 토요일 · 주일에 만들어진 파일만 링크합니다 (다른 요일 · 다른 주는 건너뜀)
 *      · 링크는 '찬양녹음' 탭의 링크 칸에만 넣습니다 — 파일ID 칸은 비워 둡니다. (그래야 녹음을 지울 때 드라이브 원본이 지워지지 않습니다)
 *      · 이미 링크된 파일은 다시 넣지 않고, 시간이 오래 걸리면 (기본 25초) 지금까지 찾은 것만 링크하고 "시간 초과" 로 알립니다.
 *
 * ▣ 2. 악보 저장소  worshipRepoSave / List / Remove / AddToSetlist
 *      · 인도자가 곡의 쪽 범위(예: 2~3쪽)만 잘라 만든 PDF 를 드라이브 '악보 저장소' 폴더에 영구 보관하고,
 *        '악보저장소' 탭 ([DB05] 찬양 · 방송 허브) 에 제목 · 날짜 · 인도자 를 함께 적어 둡니다.
 *      · 콘티를 새로 만들 때 저장소를 검색해 골라 넣으면 그 콘티의 악보 목록('찬양악보' 탭)에 같은 파일이 걸립니다.
 *      · PDF 를 쪽 단위로 자르는 일은 화면(브라우저, pdf-lib)이 하고, 서버는 잘린 PDF 를 받아 보관만 합니다.
 *
 * ▣ 3. 가사 보관  worshipLyricsList / Save / Remove
 *      · 화면의 "가사 도구" 가 뽑거나 붙여넣어 다듬은 가사를 곡 제목별로 보관 → 방송 화면 · 다음 주에 다시 씁니다.
 *      · 가사 사이트를 서버가 긁어오지 않습니다 (저작권 · 약관). 악보 PDF 글자 · 붙여넣기만 다룹니다.
 */

/* ---------------------------------------------------------------- 상수 · 시트 */

var 음원폴더기본ID_ = '10bz4qq7GL6WPlh51ld3wTIrwDzOi17PD';   // 녹음 파일이 올라오는 드라이브 폴더 (설정 '찬양음원폴더' 로 바꿀 수 있음)
var 자동링크제한시간_ = 25000;                                // ms — 넘으면 지금까지 찾은 것만 링크
var 자동링크폴더한도_ = 400;                                  // 훑어볼 폴더 수 상한
var 자동링크파일한도_ = 5000;                                 // 훑어볼 파일 수 상한
var 자동링크깊이_ = 8;                                        // 하위 폴더 깊이 상한
var 자동링크추가한도_ = 80;                                   // 한 번에 링크할 파일 수 상한

var SHEET_악보저장소 = '악보저장소';
var HEAD_악보저장소 = ['ID', '제목', '날짜', '인도자', '파일ID', '파일명', '쪽수', '원본', '올린이', '등록시각', '메모', 'Key', 'BPM'];
var WP_ID = 0, WP_제목 = 1, WP_날짜 = 2, WP_인도자 = 3, WP_파일 = 4, WP_파일명 = 5, WP_쪽수 = 6, WP_원본 = 7, WP_올린이 = 8, WP_시각 = 9, WP_메모 = 10, WP_KEY = 11, WP_BPM = 12;

var SHEET_찬양가사 = '찬양가사';
var HEAD_찬양가사 = ['키', '제목', '가사', '수정자', '수정시각'];
var WL_키 = 0, WL_제목 = 1, WL_가사 = 2, WL_수정자 = 3, WL_시각 = 4;
var 가사칸한도_ = 45000;                                      // 시트 한 칸은 5만 글자까지

/* ---------------------------------------------------------------- 1. 녹음 자동 링크 */

/** 이 파일이 녹음(mp3 · wav · m4a)인가 — 확장자 · 대소문자 · 뒤 공백 · 이중 확장자가 어수선해도 알아봅니다 */
function 소리파일인가_(name, mime) {
  var n = String(name || '').replace(/[\s\u00a0\u200b]+$/g, '').toLowerCase();
  var m = String(mime || '').toLowerCase();
  if (/\.(mp3|wav|wave|m4a)(\s*\(\d+\))?$/.test(n)) return true;          // "녹음 1.MP3", "곡.m4a (1)"
  if (/\.(mp3|wav|wave|m4a)\./.test(n)) return true;                      // "곡.mp3.download" 같은 이중 확장자
  return /^audio\/(mpeg|mp3|x-mp3|mpeg3|x-mpeg-3|wav|x-wav|wave|vnd\.wave|mp4|x-m4a|m4a|aac)$/.test(m);   // 확장자가 없어도 형식이 소리면
}

/** 어수선한 파일 이름 → 사람이 읽기 좋은 제목  ("20260927_주님은_나의목자(1).MP3" → "주님은 나의목자") */
function 녹음이름정리_(name) {
  var s = String(name || '').replace(/[\s\u00a0\u200b]+$/g, '');
  s = s.replace(/\.(mp3|wav|wave|m4a)(\.[a-z0-9]{1,8})?\s*(\(\d+\))?$/i, '');     // 확장자 (이중 확장자 포함)
  s = s.replace(/\s*\(\d+\)\s*$/, '');                                            // 끝의 복사본 번호 "(1)"
  s = s.replace(/^\s*(\d{4}[-._]?\d{2}[-._]?\d{2}|\d{6,8})[\s_\-.]*/, '');        // 앞의 날짜 20260927_ / 2026-09-27
  s = s.replace(/^\s*(IMG|REC|AUD|VOICE|Recording|녹음|음성\s*녹음)[\s_\-]*\d{3,}[\s_\-.]*/i, '');   // 기기 기본 이름 REC_0012
  s = s.replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s || String(name || '').replace(/\.[a-z0-9]{2,4}\s*$/i, '').trim() || '녹음';
}

/** 날짜(yyyy-MM-dd) 의 요일 0=일 … 6=토 — 시간대에 상관없이 문자열로 계산합니다 */
function 요일번호_(ymd) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return -1;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
}

/**
 * 드라이브 파일이 "이 주" 의 어느 녹음인가 → { kind:'연습'|'예배', en:'Saturday Practice'|'Sunday Worship', ko:'토요일 연습'|'주일 예배' } 또는 null
 *  created : 파일이 만들어진 날 (yyyy-MM-dd, 교회 시간대)
 *  sat · sun : 이 주 토요일 · 주일 날짜 (행사면 연습 날짜 · 행사 날짜)
 */
function 녹음분류_(created, sat, sun) {
  if (!created || (created !== sat && created !== sun)) return null;          // 이 주의 토요일 · 주일에 만든 파일만
  var wd = 요일번호_(created);
  var 연습 = { kind: '연습', en: 'Saturday Practice', ko: '토요일 연습' };
  var 예배 = { kind: '예배', en: 'Sunday Worship', ko: '주일 예배' };
  if (wd === 6) return 연습;                                                  // 토요일
  if (wd === 0) return 예배;                                                  // 주일
  return created === sat && created !== sun ? 연습 : 예배;                     // 행사 (평일 행사도 연습 날짜 = 연습, 행사 날짜 = 예배)
}

/**
 * 폴더 밑을 하위 폴더까지 뒤져 소리 파일을 모읍니다 (너비 우선 · 시간 · 개수 · 깊이 제한).
 * → { files:[{id,name,mime,created(Date),url}], folders, scanned, timedOut, limited, errors }
 */
function 음원찾기_(rootFolder, deadline) {
  var out = { files: [], folders: 0, scanned: 0, timedOut: false, limited: false, errors: 0 };
  var queue = [{ f: rootFolder, d: 0 }];
  while (queue.length) {
    if (Date.now() > deadline) { out.timedOut = true; break; }
    if (out.folders >= 자동링크폴더한도_ || out.scanned >= 자동링크파일한도_) { out.limited = true; break; }
    var cur = queue.shift();
    out.folders++;
    try {
      var fit = cur.f.getFiles();
      while (fit.hasNext()) {
        var file = fit.next();
        out.scanned++;
        var nm = file.getName(), mt = file.getMimeType();
        if (!소리파일인가_(nm, mt)) continue;
        var cd = file.getDateCreated();
        if (!cd) { out.errors++; continue; }
        out.files.push({ id: file.getId(), name: nm, mime: mt, created: cd, url: file.getUrl() });
        if (out.scanned >= 자동링크파일한도_) { out.limited = true; break; }
        if (Date.now() > deadline) { out.timedOut = true; break; }
      }
      if (out.timedOut) break;
      if (cur.d < 자동링크깊이_) {
        var dit = cur.f.getFolders();
        while (dit.hasNext()) queue.push({ f: dit.next(), d: cur.d + 1 });
      }
    } catch (e) { out.errors++; }            // 한 폴더가 안 열려도 나머지는 계속
  }
  return out;
}

/** 이미 링크된 녹음 파일 ID 모음 */
function 링크된음원ID_() {
  var seen = {};
  rows_(SHEET_찬양녹음).forEach(function (r) {
    var f = String(r[WR_파일] || '').trim(); if (f) seen[f] = 1;
    var d = 드라이브파일ID_(String(r[WR_링크] || '')); if (d) seen[d] = 1;
  });
  return seen;
}

/**
 * "링크 자동걸기" — 이 예배(주)의 토요일 연습 · 주일 예배 녹음을 드라이브에서 찾아 링크합니다.
 * → { week: 한주_(date), report: { added:[…], skipped:{…}, folders, scanned, timedOut, limited, errors, ms, message } }
 */
function worshipAutoLinkRecordings(token, date) {
  var w = 찬양권한_(token);
  date = 예배키_(날짜문자열_(date));
  var t0 = Date.now();
  var wk = 한주_(date);
  var sun = 날짜문자열_(wk.day || date), sat = 날짜문자열_(wk.saturday || 전날_(date));

  var folderId = String(설정값_('찬양음원폴더') || 음원폴더기본ID_).trim();
  var root;
  try { root = DriveApp.getFolderById(folderId); }
  catch (e) { throw new Error('녹음 폴더를 열 수 없습니다. 폴더가 지워졌거나 이 앱의 구글 계정에 공유되지 않았을 수 있습니다. (폴더 ID: ' + folderId + ')'); }

  var found;
  try { found = 음원찾기_(root, t0 + 자동링크제한시간_); }
  catch (e2) { throw new Error('녹음 폴더를 읽는 중 오류가 났습니다: ' + ((e2 && e2.message) || e2)); }

  var seen = 링크된음원ID_();
  var skipped = { duplicate: 0, otherDay: 0 };
  var picks = [];
  found.files.sort(function (a, b) { return a.created.getTime() - b.created.getTime(); });
  found.files.forEach(function (f) {
    var day = ymd_(f.created);
    var cat = 녹음분류_(day, sat, sun);
    if (!cat) { skipped.otherDay++; return; }
    if (seen[f.id]) { skipped.duplicate++; return; }
    seen[f.id] = 1;
    picks.push({ f: f, cat: cat, day: day });
  });
  var over = Math.max(0, picks.length - 자동링크추가한도_);
  picks = picks.slice(0, 자동링크추가한도_);

  var added = [];
  if (picks.length) {
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var sh = 찬양시트_(SHEET_찬양녹음, HEAD_찬양녹음);
      picks.forEach(function (p) {
        var id = 'rc-' + Utilities.getUuid().replace(/[^0-9a-z]/gi, '').slice(0, 10).toLowerCase();
        var title = '[' + p.cat.ko + '] ' + 녹음이름정리_(p.f.name);
        sh.appendRow([date, id, title.slice(0, 80), '', p.f.url, w.name || '자동 링크', new Date(), p.cat.kind]);
        sh.getRange(sh.getLastRow(), WR_날짜 + 1).setNumberFormat('@').setValue(date);
        added.push({ id: id, title: title, kind: p.cat.kind, category: p.cat.en, label: p.cat.ko, day: p.day, name: p.f.name, url: p.f.url });
      });
    } finally { lock.releaseLock(); }
    캐시비움_();
  }

  var msg;
  if (added.length) msg = added.length + '개 녹음을 링크했습니다.';
  else if (found.timedOut) msg = '시간이 너무 오래 걸려 중단했습니다. 새로 링크된 녹음이 없습니다. 잠시 후 다시 눌러 주세요.';
  else if (!found.files.length) msg = '녹음 폴더에서 mp3 · wav · m4a 파일을 찾지 못했습니다.';
  else if (skipped.duplicate && !skipped.otherDay) msg = '새로 링크할 녹음이 없습니다. (이미 모두 링크되어 있습니다)';
  else if (skipped.duplicate) msg = '새로 링크할 녹음이 없습니다. (이미 링크된 녹음 ' + skipped.duplicate + '개)';
  else msg = '이 주(' + sat.slice(5) + ' 토 · ' + sun.slice(5) + ' 주일)에 만들어진 새 녹음이 없습니다.';
  if (found.timedOut && added.length) msg += ' (시간이 걸려 폴더 일부는 훑지 못했습니다 — 한 번 더 누르면 이어서 찾습니다.)';
  if (over) msg += ' (한 번에 ' + 자동링크추가한도_ + '개까지 링크합니다 — 남은 ' + over + '개는 다시 눌러 주세요.)';

  return {
    week: added.length ? 한주_(date) : wk,
    report: { added: added, skipped: skipped, folders: found.folders, scanned: found.scanned, timedOut: found.timedOut, limited: found.limited,
      errors: found.errors, ms: Date.now() - t0, over: over, saturday: sat, sunday: sun, message: msg }
  };
}

/* ---------------------------------------------------------------- 2. 악보 저장소 */

function 저장소시트_() { return 주보시트_(SHEET_악보저장소, HEAD_악보저장소); }

/** 저장소 폴더 — 악보 폴더 밑 '악보 저장소' (없으면 만들고 설정에 기억) */
function 저장소폴더_() {
  var id = 설정값_('찬양악보저장소폴더');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var root = 찬양악보폴더_();
  var it = root.getFoldersByName('악보 저장소');
  var folder = it.hasNext() ? it.next() : root.createFolder('악보 저장소');
  설정저장_('찬양악보저장소폴더', folder.getId());
  return folder;
}

/** 이 파일이 저장소에 보관된 악보인가 (콘티에서 빼거나 주일을 지울 때 원본 PDF 를 지우지 않으려고) */
function 저장소파일냐_(fileId) {
  fileId = String(fileId || '').trim();
  if (!fileId) return false;
  return rows_(SHEET_악보저장소).some(function (r) { return String(r[WP_파일] || '').trim() === fileId; });
}

/** 콘티 악보를 드라이브에서 지울 때 부르는 곳 — 저장소에 보관된 파일은 그대로 둡니다 */
function 악보치우기_(fileId) {
  fileId = String(fileId || '').trim();
  if (!fileId || 저장소파일냐_(fileId)) return false;
  try { DriveApp.getFileById(fileId).setTrashed(true); return true; } catch (e) { return false; }
}

function 저장소항목_(r) {
  var fid = String(r[WP_파일] || '').trim();
  return {
    id: String(r[WP_ID] || '').trim(), title: String(r[WP_제목] || '').trim(), date: 날짜문자열_(r[WP_날짜]),
    leader: String(r[WP_인도자] || '').trim(), fileId: fid, name: String(r[WP_파일명] || '').trim(),
    pages: Number(r[WP_쪽수]) || 0, source: String(r[WP_원본] || '').trim(), by: String(r[WP_올린이] || '').trim(),
    at: r[WP_시각] instanceof Date ? ymd_(r[WP_시각]) : String(r[WP_시각] || '').slice(0, 10),
    note: String(r[WP_메모] || '').trim(), key: String(r[WP_KEY] || '').trim(), bpm: Number(r[WP_BPM]) || 0,
    url: fid ? '/sheet/' + fid : ''
  };
}

/** 저장소 목록 — q 는 제목 · 인도자 · 날짜 · 메모에서 찾습니다 (공백으로 나눈 낱말이 모두 들어 있으면 일치) */
function worshipRepoList(token, q) {
  찬양권한_(token);
  var words = String(q || '').toLowerCase().split(/\s+/).filter(function (x) { return x; });
  var list = rows_(SHEET_악보저장소).filter(function (r) { return String(r[WP_ID] || '').trim() && String(r[WP_파일] || '').trim(); }).map(저장소항목_);
  if (words.length) {
    list = list.filter(function (x) {
      var hay = (x.title + ' ' + x.leader + ' ' + x.date + ' ' + x.note + ' ' + x.key + ' ' + x.name).toLowerCase();
      return words.every(function (wd) { return hay.indexOf(wd) !== -1; });
    });
  }
  list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.at < b.at ? 1 : -1); });
  return { items: list.slice(0, 300), total: list.length };
}

/**
 * 자른 악보 저장 — 인도자(팀장)만. dataUrl 은 화면이 pdf-lib 로 쪽을 골라 만든 PDF (data:application/pdf;base64,…)
 * meta: { title, date, leader, pages, source, note, key, bpm }
 */
function worshipRepoSave(token, meta, dataUrl) {
  var w = requireWorshipEdit_(token);
  meta = meta || {};
  var title = String(meta.title || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  if (!title) throw new Error('곡 제목을 적어주세요.');
  var date = 날짜문자열_(meta.date) || ymd_(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜를 확인해주세요.');
  var leader = String(meta.leader || w.name || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 30);

  var m = /^data:application\/pdf;base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('PDF 파일을 읽을 수 없습니다.');
  var bytes = Utilities.base64Decode(m[1]);
  if (bytes.length < 100 || bytes.length > 20 * 1024 * 1024) throw new Error('PDF 는 20MB 까지 저장할 수 있습니다.');
  var head = '';
  for (var hi = 0; hi < 5 && hi < bytes.length; hi++) head += String.fromCharCode(bytes[hi] < 0 ? bytes[hi] + 256 : bytes[hi]);
  if (head.indexOf('%PDF') !== 0) throw new Error('PDF 파일이 아닙니다.');

  var safe = (title + '_' + date).replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80) + '.pdf';
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var item;
  try {
    저장소시트_();
    var file = 저장소폴더_().createFile(Utilities.newBlob(bytes, 'application/pdf', safe));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    var id = 'rp-' + Utilities.getUuid().replace(/[^0-9a-z]/gi, '').slice(0, 10).toLowerCase();
    var pages = Math.max(0, Math.min(500, Math.round(Number(meta.pages) || 0)));
    var bpm = Math.round(Number(meta.bpm) || 0); if (bpm < 30 || bpm > 300) bpm = '';
    var sh = 찬양시트_(SHEET_악보저장소, HEAD_악보저장소);
    sh.appendRow([id, title, date, leader, file.getId(), safe, pages || '', String(meta.source || '').slice(0, 80), w.name || '커미티', new Date(),
      String(meta.note || '').replace(/[\r\n\t]+/g, ' ').slice(0, 200), String(meta.key || '').slice(0, 8), bpm]);
    sh.getRange(sh.getLastRow(), WP_날짜 + 1).setNumberFormat('@').setValue(date);
    item = { id: id, title: title, date: date, leader: leader, fileId: file.getId(), name: safe, pages: pages, url: '/sheet/' + file.getId() };
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { item: item, list: worshipRepoList(token, '').items };
}

/** 저장소에서 지우기 — 등록한 사람이나 팀장 · 인도자. 콘티에 걸려 있으면 목록에서만 빼고 파일은 남깁니다. */
function worshipRepoRemove(token, id) {
  var w = 찬양권한_(token);
  id = String(id || '').trim();
  var row = rows_(SHEET_악보저장소).filter(function (r) { return String(r[WP_ID]).trim() === id; })[0];
  if (!row) throw new Error('악보를 찾지 못했습니다. 이미 지워졌을 수 있습니다.');
  if (!w.canEdit && String(row[WP_올린이]).trim() !== w.name) throw new Error('올린 분이나 팀장 · 인도자만 지울 수 있습니다.');
  var fid = String(row[WP_파일] || '').trim();
  시트치환_(SHEET_악보저장소, HEAD_악보저장소, function (r) { return String(r[WP_ID]).trim() === id; }, []);
  var inUse = rows_(SHEET_찬양악보).some(function (r) { return String(r[WF_파일] || '').trim() === fid; });
  if (fid && !inUse) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) {} }
  캐시비움_();
  return { list: worshipRepoList(token, '').items, kept: !!inUse };
}

/** 저장소 악보를 이 콘티(날짜)의 악보로 걸기 — 여러 개 한꺼번에. kind: '콘티' | '결단' */
function worshipRepoAddToSetlist(token, date, ids, kind) {
  var w = requireWorshipEdit_(token);
  date = 예배키_(날짜문자열_(date));
  kind = 구분정리_(kind);
  ids = (Array.isArray(ids) ? ids : [ids]).map(function (x) { return String(x || '').trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 30);
  if (!ids.length) throw new Error('걸 악보를 골라주세요.');
  var repo = {};
  rows_(SHEET_악보저장소).forEach(function (r) { repo[String(r[WP_ID]).trim()] = r; });
  var have = {};
  악보목록_(date, kind).forEach(function (f) { have[f.id] = 1; });
  var sh = 찬양시트_(SHEET_찬양악보, HEAD_찬양악보);
  var added = 0, dup = 0, missing = 0;
  ids.forEach(function (id) {
    var r = repo[id];
    if (!r) { missing++; return; }
    var fid = String(r[WP_파일] || '').trim();
    if (have[fid]) { dup++; return; }
    have[fid] = 1;
    var name = String(r[WP_제목] || '악보').trim() + '.pdf';       // 파일 이름에 곡 제목이 들어 있어야 연습 화면이 곡을 알아봅니다
    sh.appendRow([date, fid, name, w.name || '커미티', new Date(), kind]);
    sh.getRange(sh.getLastRow(), WF_날짜 + 1).setNumberFormat('@').setValue(date);
    added++;
  });
  캐시비움_();
  return { week: 한주_(date), added: added, duplicate: dup, missing: missing };
}

/* ---------------------------------------------------------------- 3. 가사 보관 */

/** 곡 제목 → 찾기용 키 (공백 · 기호 · 대소문자 무시) */
function 가사키_(title) {
  return String(title || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\s_\-.()\[\]{}·,'"!?~]/g, '').slice(0, 60);
}

function 가사시트_() { return 주보시트_(SHEET_찬양가사, HEAD_찬양가사); }

/** 보관된 가사 전체 → { key: { title, text, by, at } }  (팀원 누구나 읽음) */
function worshipLyricsList(token) {
  찬양권한_(token);
  var out = {};
  var parts = {};
  rows_(SHEET_찬양가사).forEach(function (r) {
    var k = String(r[WL_키] || '').trim(); if (!k) return;
    var o = parts[k] = parts[k] || { title: String(r[WL_제목] || '').trim(), rows: [], by: String(r[WL_수정자] || '').trim(), at: r[WL_시각] instanceof Date ? ymd_(r[WL_시각]) : String(r[WL_시각] || '').slice(0, 10) };
    o.rows.push(String(r[WL_가사] || ''));
  });
  Object.keys(parts).forEach(function (k) { out[k] = { title: parts[k].title, text: parts[k].rows.join(''), by: parts[k].by, at: parts[k].at }; });
  return out;
}

/** 가사 저장 — 팀원 누구나 (방송에 바로 쓰이므로 이름이 남습니다). 빈 글이면 지웁니다. */
function worshipLyricsSave(token, title, text) {
  var w = 찬양권한_(token);
  title = String(title || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  var key = 가사키_(title);
  if (!key) throw new Error('곡 제목을 적어주세요.');
  text = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (text.length > 가사칸한도_ * 4) throw new Error('가사가 너무 깁니다.');
  var by = String(w.name || '').trim() || '커미티';
  var now = new Date();
  var rows = [];
  for (var i = 0; i * 가사칸한도_ < text.length; i++) rows.push([key, title, text.slice(i * 가사칸한도_, (i + 1) * 가사칸한도_), by, now]);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    가사시트_();
    시트치환_(SHEET_찬양가사, HEAD_찬양가사, function (r) { return String(r[WL_키]).trim() === key; }, rows, [{ col: WL_키 }]);
  } finally { lock.releaseLock(); }
  캐시비움_();
  return { key: key, saved: rows.length > 0, lyrics: worshipLyricsList(token) };
}

function worshipLyricsRemove(token, title) {
  return worshipLyricsSave(token, title, '');
}
