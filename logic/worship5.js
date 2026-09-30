/**
 * 찬양방송팀 허브 Hub v4 — 콘티 검색(유튜브 · 악보 이미지) · @세션 멘션 (서버 쪽)
 * ============================================================
 * 이 파일은 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * 새 시트 · 새 열 · 새 탭은 없습니다 — 기존 '찬양콘티' 의 링크(유튜브) · 팀 · 설명 칸과 '찬양악보' 를 그대로 씁니다.
 *
 * ▣ 화면에서 부르는 함수
 *    worshipYoutubeSearch(token, query, pageToken)      유튜브 검색 (여러 버전 · 아티스트) — 열쇠: 서버 환경변수 YOUTUBE_API_KEY
 *    worshipScoreImageSearch(token, query, start)       구글 이미지 검색(악보) — 열쇠: GOOGLE_CSE_API_KEY(없으면 YOUTUBE_API_KEY) + GOOGLE_CSE_CX
 *    worshipImportScoreImage(token, date, kind, url, title, pageUrl)   고른 그림을 서버가 받아 악보로 저장 (uploadWorshipSheet 와 같은 길)
 *
 * ▣ @멘션 (설명 칸의 @일렉 · @피아노 · @홍길동)
 *    멘션분석_(text, ctx)          글 → [{ tag, kind, keys, names, label, line }]  (화면 public/worship/conti.js 의 규칙과 같음 — 시험에서 비교)
 *    콘티멘션할일_(name, ...)      포털 "내 할 일" 에 붙는 항목 (logic/app.js 내할일_ 이 부름) — 읽을 때마다 계산하므로 편성이 바뀌어도 맞음
 *    콘티멘션알림_(w, date)        "콘티 알림 보내기" 버튼을 눌렀을 때 태그된 사람에게 개인 알림 (기존 알림 종류 '콘티' 를 따름)
 *
 * ▣ 열쇠는 서버에서만 읽습니다 (HOST.searchKeys) — 화면으로는 나가지 않고, 오류 글에도 넣지 않습니다.
 */

/* ============================================================ 유튜브 검색 */

function 검색열쇠_() {
  try { return HOST.searchKeys() || {}; } catch (e) { return {}; }
}

function 검색글정리_(q, max) {
  return String(q == null ? '' : q).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 100);
}

/** 유튜브 제목의 HTML 글자(&amp; &#39; …)를 원래대로 */
function 유튜브글자풀기_(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(Number(d)); })
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** PT4M13S → 253 (초) */
function 유튜브길이초_(iso) {
  var m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ''));
  if (!m) return 0;
  return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0);
}

/** 구글 API 오류 → 화면에 보여 줄 말 (열쇠 · 주소는 넣지 않습니다) */
function 검색오류_(status, body, what) {
  var reason = '';
  try { var j = JSON.parse(body); var e0 = j && j.error && j.error.errors && j.error.errors[0]; reason = (e0 && e0.reason) || (j.error && j.error.status) || ''; } catch (e) {}
  if (status === 429 || /quota|ratelimit|dailylimit|resource_exhausted/i.test(reason)) {
    return { ok: false, reason: 'quota', msg: what + ' 하루 사용량을 다 썼습니다. 내일 다시 되거나, 아래 링크로 직접 찾아주세요.' };
  }
  if (status === 400 || /keyinvalid|api_key/i.test(reason)) {
    return { ok: false, reason: 'denied', msg: what + ' 열쇠가 올바르지 않습니다 (서버 환경변수를 확인해주세요).' };
  }
  if (status === 403) {
    return { ok: false, reason: 'denied', msg: what + ' 사용 권한이 없습니다 (구글 클라우드에서 해당 API 를 켰는지 확인해주세요).' };
  }
  return { ok: false, reason: 'error', msg: what + '을 불러오지 못했습니다 (' + status + ').' };
}

function worshipYoutubeSearch(token, query, pageToken) {
  requireWorshipEdit_(token);
  var q = 검색글정리_(query, 100);
  if (!q) throw new Error('검색어를 입력해주세요.');
  var openUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  var key = String(검색열쇠_().yt || '').trim();
  if (!key) return { ok: false, reason: 'nokey', msg: '유튜브 검색 열쇠(YOUTUBE_API_KEY)가 서버에 아직 설정되지 않았습니다. 아래 링크로 유튜브에서 찾은 뒤 주소를 붙여 넣어 주세요.', openUrl: openUrl };
  var pt = String(pageToken || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);

  var ck = null, cached = null;
  try {
    ck = 'yts13:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, q + '|' + pt)).slice(0, 40);
    cached = CacheService.getScriptCache().get(ck);
  } catch (e) { ck = null; }
  if (cached) { try { var c = JSON.parse(cached); c.openUrl = openUrl; c.cached = true; return c; } catch (e) {} }

  var url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&videoEmbeddable=true&safeSearch=moderate&relevanceLanguage=ko' +
    '&q=' + encodeURIComponent(q) + (pt ? '&pageToken=' + pt : '') + '&key=' + encodeURIComponent(key);
  var res;
  try { res = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); }
  catch (e) { return { ok: false, reason: 'error', msg: '유튜브에 연결하지 못했습니다. 잠시 뒤 다시 시도해주세요.', openUrl: openUrl }; }
  if (res.getResponseCode() !== 200) { var er = 검색오류_(res.getResponseCode(), res.getContentText(), '유튜브 검색'); er.openUrl = openUrl; return er; }

  var data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) { return { ok: false, reason: 'error', msg: '유튜브 응답을 읽지 못했습니다.', openUrl: openUrl }; }
  var items = (data.items || []).filter(function (it) { return it && it.id && it.id.videoId; }).map(function (it) {
    var sn = it.snippet || {}, th = sn.thumbnails || {};
    return { id: String(it.id.videoId), title: 유튜브글자풀기_(sn.title), channel: 유튜브글자풀기_(sn.channelTitle), at: String(sn.publishedAt || '').slice(0, 10),
      thumb: String((th.medium || th.default || {}).url || ''), dur: 0, views: 0 };
  });
  // 길이 · 조회수 (라이브 · 풀버전 · 짧은 영상을 가려내는 데 도움) — 실패해도 검색 결과는 그대로
  if (items.length) {
    try {
      var vr = UrlFetchApp.fetch('https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=' +
        items.map(function (x) { return x.id; }).join(',') + '&key=' + encodeURIComponent(key), { muteHttpExceptions: true });
      if (vr.getResponseCode() === 200) {
        var by = {};
        (JSON.parse(vr.getContentText()).items || []).forEach(function (v) { by[v.id] = v; });
        items.forEach(function (x) {
          var v = by[x.id]; if (!v) return;
          x.dur = 유튜브길이초_(v.contentDetails && v.contentDetails.duration);
          x.views = Number(v.statistics && v.statistics.viewCount) || 0;
        });
      }
    } catch (e) { /* 길이 · 조회수는 덤입니다 */ }
  }
  var out = { ok: true, items: items, next: String(data.nextPageToken || ''), q: q, openUrl: openUrl };
  if (ck) { try { CacheService.getScriptCache().put(ck, JSON.stringify(out), 6 * 3600); } catch (e) {} }   // 같은 검색은 6시간 동안 다시 부르지 않음 (하루 사용량 절약)
  return out;
}

/* ============================================================ 악보 이미지 검색 · 가져오기 */

function worshipScoreImageSearch(token, query, start) {
  requireWorshipEdit_(token);
  var q = 검색글정리_(query, 100);
  if (!q) throw new Error('검색어를 입력해주세요.');
  var openUrl = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q);
  var k = 검색열쇠_(), key = String(k.cse || '').trim(), cx = String(k.cx || '').trim();
  if (!key || !cx) return { ok: false, reason: 'nokey', msg: '악보 이미지 검색 열쇠(GOOGLE_CSE_CX · GOOGLE_CSE_API_KEY)가 서버에 아직 설정되지 않았습니다. 아래 링크로 찾은 뒤 그림을 저장해 "직접 올리기"로 올려주세요.', openUrl: openUrl };
  var st = Math.max(1, Math.min(91, Math.round(Number(start)) || 1));      // 구글 CSE 는 1 ~ 91 (한 번에 10장)
  var url = 'https://www.googleapis.com/customsearch/v1?searchType=image&num=10&safe=active&start=' + st +
    '&cx=' + encodeURIComponent(cx) + '&q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(key);
  var res;
  try { res = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); }
  catch (e) { return { ok: false, reason: 'error', msg: '구글에 연결하지 못했습니다. 잠시 뒤 다시 시도해주세요.', openUrl: openUrl }; }
  if (res.getResponseCode() !== 200) { var er = 검색오류_(res.getResponseCode(), res.getContentText(), '이미지 검색'); er.openUrl = openUrl; return er; }
  var data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) { return { ok: false, reason: 'error', msg: '구글 응답을 읽지 못했습니다.', openUrl: openUrl }; }
  var items = (data.items || []).filter(function (it) { return it && /^https:\/\//i.test(String(it.link || '')); }).map(function (it) {
    var im = it.image || {};
    return { url: String(it.link), thumb: String(im.thumbnailLink || ''), w: Number(im.width) || 0, h: Number(im.height) || 0, bytes: Number(im.byteSize) || 0,
      title: 유튜브글자풀기_(it.title || ''), page: String(im.contextLink || ''), mime: String(it.mime || '') };
  });
  var nx = data.queries && data.queries.nextPage && data.queries.nextPage[0];
  return { ok: true, items: items, next: nx && nx.startIndex ? Number(nx.startIndex) : 0, q: q, openUrl: openUrl };
}

/**
 * 고른 그림을 서버가 받아(안전 검사 포함) 이 콘티의 악보로 저장합니다 — 저장 길은 손으로 올리는 것(uploadWorshipSheet)과 같습니다.
 * 그림을 못 받으면 { ok:false, reason:'network' } — 화면이 "직접 올리기"로 안내합니다.
 */
function worshipImportScoreImage(token, date, kind, imageUrl, title, pageUrl) {
  requireWorshipEdit_(token);
  date = 예배키_(date);
  kind = 구분정리_(kind);
  var got;
  try { got = HOST.fetchImage({ url: String(imageUrl || ''), referer: String(pageUrl || '') }); }
  catch (e) { return { ok: false, reason: 'network', msg: ((e && e.message) || '그림을 가져오지 못했습니다.') + ' — "직접 올리기"로 올려주세요.' }; }
  if (!got || !got.bytes || !got.bytes.length) return { ok: false, reason: 'network', msg: '그림을 가져오지 못했습니다. — "직접 올리기"로 올려주세요.' };
  var ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[got.type] || '.jpg';
  var base = String(title || '악보').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '악보';
  var fileName = base + ' 악보' + ext;
  var dataUrl = 'data:' + got.type + ';base64,' + Utilities.base64Encode(got.bytes);
  var week = uploadWorshipSheet(token, date, fileName, dataUrl, kind);           // 콘티 · 결단 폴더 · 시트 등록 · 캐시 비움까지 그대로
  var list = (kind === '결단' ? week.finalSheets : week.sheets) || [], hit = null;
  list.forEach(function (f) { if (f.name === fileName.replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80)) hit = f; });
  return { ok: true, week: week, fileId: hit ? hit.id : '', name: fileName };
}

/* ============================================================ @멘션 */

/**
 * 태그 이름표 — 화면(public/worship/conti.js MENTION_ALIASES)과 같은 표. 바꾸면 양쪽을 함께 고치세요 (시험이 비교합니다).
 * keys 는 편성의 자리 키(찬양포지션()의 key), all 은 그 주 편성에 든 모든 사람.
 */
var 멘션별칭_ = [
  { keys: ['lead'], names: ['인도자', '인도', '리드', '리더'] },
  { keys: ['piano'], names: ['메인건반', '피아노'] },
  { keys: ['synth'], names: ['세컨건반', '세컨', '신디', '신스', '신디사이저'] },
  { keys: ['piano', 'synth'], names: ['건반', '키보드'] },
  { keys: ['drum'], names: ['드럼', '드럼머'] },
  { keys: ['bass'], names: ['베이스'] },
  { keys: ['egt'], names: ['일렉', '일렉기타', '전기기타'] },
  { keys: ['agt'], names: ['어쿠', '어쿠기타', '어쿠스틱', '통기타'] },
  { keys: ['egt', 'agt'], names: ['기타'] },
  { keys: ['mvocal'], names: ['남싱', '남성싱어', '남자싱어', '남보컬'] },
  { keys: ['fvocal'], names: ['여싱', '여성싱어', '여자싱어', '여보컬'] },
  { keys: ['mvocal', 'fvocal'], names: ['싱어', '싱어팀', '보컬', '코러스'] },
  { keys: ['media'], names: ['음향', '사운드', '엔지니어'] },
  { keys: ['ppt'], names: ['ppt', '피피티', '자막'] },
  { keys: ['codi'], names: ['코디'] },
  { keys: ['lead', 'piano', 'synth', 'drum', 'bass', 'egt', 'agt', 'mvocal', 'fvocal'], names: ['찬양팀', '밴드'] },
  { keys: ['media', 'ppt', 'codi'], names: ['방송팀', '방송'] },
  { all: true, names: ['전체', '모두', 'all'] }
];

/** 글 속의 @태그 조각 — @ 앞은 글머리 · 공백 · 문장부호여야 함(이메일 주소는 태그가 아님) */
function 멘션조각_(text) {
  var out = [], re = /(^|[^A-Za-z0-9_])@([A-Za-z0-9가-힣_]+)/g, m;
  text = String(text || '');
  while ((m = re.exec(text))) out.push({ raw: m[2], index: m.index + m[1].length });
  return out;
}

/**
 * 태그 뒤에 조사가 붙어도("@일렉은") 알아봅니다 — 알려진 이름 중 태그 앞부분과 겹치는 가장 긴 것을 고릅니다.
 * 같은 길이면 사람 이름이 이름표보다 먼저. 한 글자 이름은 오해가 많아 쓰지 않습니다.
 */
function 멘션풀이_(raw, roster) {
  var low = String(raw || '').toLowerCase(), best = null;
  (roster || []).forEach(function (n) {
    var nl = String(n).toLowerCase();
    if (nl.length >= 2 && low.indexOf(nl) === 0 && (!best || nl.length >= best.len)) best = { len: nl.length, kind: 'name', name: n };
  });
  멘션별칭_.forEach(function (a) {
    a.names.forEach(function (nm) {
      var nl = nm.toLowerCase();
      if (nl.length >= 2 && low.indexOf(nl) === 0 && (!best || nl.length > best.len)) best = { len: nl.length, kind: a.all ? 'all' : 'pos', keys: a.keys || [], label: nm };
    });
  });
  return best;
}

/**
 * 글 → 태그 목록. ctx = { slots: { 자리키: [이름…] }, roster: [이름…] }
 * 각 항목: { tag: '@일렉', kind: 'pos'|'name'|'all'|'none', keys, names(그 주에 맡은 사람), label, line(태그가 든 줄) }
 */
function 멘션분석_(text, ctx) {
  ctx = ctx || {};
  var slots = ctx.slots || {}, roster = ctx.roster || [], lines = String(text || '').split(/\r?\n/), out = [];
  멘션조각_(text).forEach(function (p) {
    var f = 멘션풀이_(p.raw, roster), tag, names = [], kind = 'none', keys = [], label = '';
    if (!f) tag = '@' + p.raw;
    else {
      tag = '@' + p.raw.slice(0, f.len); kind = f.kind; label = f.kind === 'name' ? f.name : f.label;
      if (f.kind === 'name') names = [f.name];
      else {
        var ks = f.kind === 'all' ? Object.keys(slots) : f.keys; keys = ks.slice();
        ks.forEach(function (k) { (slots[k] || []).forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); }); });
      }
    }
    // 태그가 든 줄 — 글머리 기호 · 앞뒤 공백은 떼고 200자까지
    var acc = 0, line = '';
    for (var i = 0; i < lines.length; i++) { if (p.index >= acc && p.index <= acc + lines[i].length) { line = lines[i]; break; } acc += lines[i].length + 1; }
    out.push({ tag: tag, kind: kind, keys: keys, names: names, label: label, line: line.replace(/^\s*[-•·*]\s*/, '').trim().slice(0, 200) });
  });
  return out;
}

/** 이 주(예배 키)의 편성 { 자리키: [이름…] } */
function 멘션편성_(key) {
  return 편성맵_([key])[key] || {};
}

/** 오늘 이후(fromYmd) 콘티 중 설명에 @ 가 있는 곡 — 예배 키가 행사면 그 행사의 날짜로 바꿔 줍니다 */
function 콘티멘션곡들_(fromYmd, pred) {
  var evDay = null;
  function 날로_(k) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return { day: k, label: '' };
    if (!evDay) {
      evDay = {};
      행사목록_().forEach(function (e) {
        evDay[e.key] = { day: e.date, label: e.name };
        (e.sessions || []).forEach(function (s) { evDay[s.key] = { day: s.date || e.date, label: e.name + ' · ' + s.label }; });
      });
    }
    return evDay[k] || null;
  }
  var out = [];
  rows_(SHEET_찬양콘티).forEach(function (r) {
    var note = String(r[WS_설명] || '');
    if (note.indexOf('@') === -1) return;
    var title = String(r[WS_제목] || '').trim();
    if (!title) return;
    var k = 날짜문자열_(r[WS_날짜]);
    if (pred && !pred(k)) return;
    var d = 날로_(k);
    if (!d || (fromYmd && d.day < fromYmd)) return;
    out.push({ key: k, day: d.day, label: d.label, kind: 구분정리_(r[WS_구분]), seq: Number(r[WS_순서]) || 0, title: title, note: note });
  });
  return out;
}

function 멘션짧은해시_(s) {
  var h = 5381; s = String(s || '');
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 5);
}

/** 사람 → [{ song, tags, lines }] — 곡 목록을 한 번 풀어서 사람별로 모읍니다 */
function 콘티멘션사람별_(songs) {
  var roster = Object.keys(찬양명단_()), slotCache = {}, by = {};
  songs.forEach(function (s) {
    var slots = slotCache[s.key] || (slotCache[s.key] = 멘션편성_(s.key));
    var mine = {};
    멘션분석_(s.note, { slots: slots, roster: roster }).forEach(function (m) {
      m.names.forEach(function (n) {
        var e = mine[n] || (mine[n] = { song: s, tags: [], lines: [], first: m.keys[0] || (m.kind === 'name' ? '' : '') });
        if (e.tags.indexOf(m.tag) === -1) e.tags.push(m.tag);
        if (m.line && e.lines.indexOf(m.line) === -1) e.lines.push(m.line);
        if (!e.first && m.keys[0]) e.first = m.keys[0];
      });
    });
    Object.keys(mine).forEach(function (n) { (by[n] = by[n] || []).push(mine[n]); });
  });
  return by;
}

var 멘션아이콘_ = { lead: '🎤', piano: '🎹', synth: '🎹', drum: '🥁', bass: '🎸', egt: '🎸', agt: '🎸', mvocal: '🎙️', fvocal: '🎙️', media: '🔊', ppt: '🖥️', codi: '📣' };

/**
 * 포털 "내 할 일" — 앞으로 4주 안의 콘티에서 나를 부른 태그. 읽을 때마다 계산하므로 편성이 나중에 바뀌어도 맞습니다.
 * 치우면(hideTodo) 그 지시 글이 바뀌기 전까지는 다시 안 뜹니다 (id 에 지시 글의 짧은 지문이 들어 있음).
 */
function 콘티멘션할일_(name, token, hidden, today) {
  name = String(name || '').trim();
  if (!name) return [];
  var base = 앱주소_() || '';
  var limit = ymd_(new Date(parseYmd_(today).getTime() + 28 * 86400000));
  var songs = 콘티멘션곡들_(today).filter(function (s) { return s.day <= limit; });
  if (!songs.length) return [];
  var mine = 콘티멘션사람별_(songs)[name] || [], out = [];
  mine.forEach(function (e) {
    var s = e.song, text = e.lines.join(' / ').slice(0, 140) || s.title;
    var id = ('conti-' + s.key + '-' + (s.kind === '결단' ? 'r' : 'c') + s.seq + '-' + 멘션짧은해시_(e.lines.join('|'))).slice(0, 80);
    if (hidden && hidden[id]) return;
    var days = Math.round((parseYmd_(s.day) - parseYmd_(today)) / 86400000);
    out.push(할일하나_({ id: id, kind: 'do', icon: 멘션아이콘_[e.first] || '🎵',
      title: e.tags.join(' ') + ' · ' + s.title + (s.kind === '결단' ? ' (결단찬양)' : ' (#' + s.seq + ')'),
      sub: (s.label || 월일_(s.day)) + (days === 0 ? ' · 오늘' : days > 0 ? ' · ' + days + '일 남음' : '') + ' — ' + text,
      url: base + '?page=worship&t=' + encodeURIComponent(token), tone: days <= 1 ? 'warn' : 'info' }));
  });
  return out;
}

/**
 * "콘티 알림 보내기" 버튼을 눌렀을 때 — 그 예배 콘티에서 태그된 사람에게 "회원님을 불렀어요" 개인 알림.
 * (콘티를 저장할 때마다 보내지 않습니다 — 인도자가 고치는 중에 알림이 쏟아지지 않게, 기존 버튼과 같은 규칙)
 */
function 콘티멘션알림_(w, date, token) {
  date = String(date || '');
  var songs = 콘티멘션곡들_('', function (k) { return k === date; });
  if (!songs.length) return { people: 0, sent: 0 };
  var by = 콘티멘션사람별_(songs), names = Object.keys(by).slice(0, 40), sent = 0;
  names.forEach(function (n) {
    var list = by[n], first = list[0], s = first.song;
    var more = list.length > 1 ? ' 외 ' + (list.length - 1) + '곡' : '';
    try {
      var r = 알림보내기_('콘티', [n], {
        title: first.tags.join(' ') + ' — 콘티에서 회원님을 불렀어요',
        body: 월일_(s.day) + ' · ' + s.title + more + ' — ' + (first.lines[0] || ''),
        url: 앱주소_() + '?page=worship&t=' + encodeURIComponent(token), tag: '콘티멘션-' + date + '-' + n, keep: true });
      sent += (r && r.sent) || 0;
    } catch (e) { /* 한 사람 실패가 나머지를 막지 않음 */ }
  });
  return { people: names.length, sent: sent };
}
