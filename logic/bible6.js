/**
 * v6 — 성경 본문 자동 가져오기 (개역개정 + NIV)
 * ============================================================
 * 이 파일은 logic/app.js · hub5.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 (lib/runtime.js 의 EXTRA_FILES).
 * 성경책_ · 구절풀기_ · 개역한글본문_ 은 logic/hub5.js 의 것을 그대로 씁니다.
 *
 *  · 개역개정 : 대한성서공회 성경 읽기 화면(bskorea.or.kr)의 그 장을 받아 필요한 절만 "16 …" 줄로.
 *               받지 못하면 개역한글(getBible, 공개 번역)로 대신하고 번역 이름을 그대로 알려 줍니다.
 *  · NIV     : BibleGateway 본문 화면에서 절마다 뽑아 "16 …" 줄로 (각주 · 관주 · 소제목은 뺍니다).
 *  주보 편집의 "본문 자동으로 채우기" 버튼 · 오늘의 묵상 자동(매일 04:30) · 관리 화면 "온라인에서 가져오기" 가 씁니다.
 *  교회 안(주보 · 묵상)에서 본문을 인용하는 용도이며, 붙여 넣던 것과 같은 본문을 서버가 대신 가져옵니다.
 *
 *  화면에서 부를 수 있는 함수: bulletinFetchBible(token, ref) — 주보 편집 권한(주보권한_)이 있어야 합니다.
 */

var 성서공회책_ = ['gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo', 'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal',
  'mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 'php', 'col', '1th', '2th', '1ti', '2ti', 'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud', 'rev'];

/** 영어 책 이름 (BibleGateway 검색용) — 성경책_ 의 첫 영어 이름을 단어마다 대문자로 */
function 영어책이름_(no) {
  var b = 성경책_[no - 1];
  if (!b) return '';
  return b[2][0].replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
}

/** 받은 HTML → 글자 (문자 집합이 EUC-KR 이면 그대로 풀기) */
function 웹글자_(r) {
  var ct = String((r.getHeaders() || {})['content-type'] || '');
  var raw = r.getContentText();
  var cs = (/charset=([\w-]+)/i.exec(ct) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(raw) || [])[1] || '';
  if (/euc-?kr|ks_c_5601|cp949/i.test(cs) && typeof TextDecoder !== 'undefined') {
    try { return new TextDecoder('euc-kr').decode(r.getContent()); } catch (e) { /* 그대로 */ }
  }
  return raw;
}

function html글자_(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, '’').replace(/&lsquo;|&#8216;/g, '‘')
    .replace(/&ldquo;|&#8220;/g, '“').replace(/&rdquo;|&#8221;/g, '”').replace(/&mdash;|&#8212;/g, '—').replace(/&ndash;|&#8211;/g, '–')
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); });
}

/** 줄 목록에서 "절번호 본문" 이 1, 2, 3 … 처럼 이어지는 가장 긴 묶음을 찾습니다 (메뉴 · 머리말 숫자와 섞이지 않게) → { 번호: 본문 } */
function 절묶음찾기_(lines) {
  var best = {}, bestN = 0, cur = {}, curN = 0, last = 0, wait = [];
  lines.forEach(function (ln) {
    var m = /^\s*(\d{1,3})\s*[.)]?\s+(\S.*)$/.exec(ln);
    if (!m) { if (curN && wait.length < 3) wait.push(String(ln).trim()); return; }   // 절이 두 줄로 나뉜 경우 — 다음 절이 이어질 때만 붙입니다
    var n = Number(m[1]);
    if (curN && n === last + 1) {
      if (wait.length) cur[last] += ' ' + wait.join(' ');
      cur[n] = m[2].trim(); curN++; last = n;
    } else {
      if (curN > bestN) { best = cur; bestN = curN; }
      cur = {}; curN = 1; cur[n] = m[2].trim(); last = n;
    }
    wait = [];
  });
  if (curN > bestN) { best = cur; bestN = curN; }
  return bestN >= 1 ? best : {};
}

function 절고르기_(map, p) {
  var nums = Object.keys(map).map(Number).sort(function (a, b) { return a - b; });
  if (!nums.length) return null;
  var last = nums[nums.length - 1];
  var a = p.v1 || nums[0], b = p.v2 === 'end' ? last : (p.v2 || (p.v1 ? p.v1 : last));
  if (b < a) b = a;
  var out = nums.filter(function (n) { return n >= a && n <= b; }).map(function (n) { return n + ' ' + String(map[n]).replace(/\s+/g, ' ').trim(); });
  return out.length ? { lines: out, a: a, b: b, last: last } : null;
}

/** 개역개정 — 대한성서공회 성경 읽기 화면 */
function 개역개정본문_(p) {
  if (!p || !p.no || !p.ch) return null;
  var code = 성서공회책_[p.no - 1];
  var url = 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=GAE&book=' + code + '&chap=' + p.ch + '&sec=1';
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (YNToronto bulletin)', 'Accept-Language': 'ko' } });
  if (r.getResponseCode() >= 300) throw new Error('개역개정 본문을 받지 못했습니다 (' + r.getResponseCode() + ').');
  var h = 웹글자_(r);
  // 본문 칸만 (있으면) · 숨겨 둔 각주 · 스크립트 · 소제목 빼기
  var at = h.search(/id=["']?tdBible1|class=["'][^"']*bible_read/i);
  if (at > 0) h = h.slice(at);
  h = h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<(font|span|a|sup)[^>]*class=["']?(comment|smallTitle|D2|footnote)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/span>\s*(?=[^<\s])/gi, ' ');
  var map = 절묶음찾기_(html글자_(h).split('\n').map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).filter(Boolean));
  Object.keys(map).forEach(function (k) { map[k] = String(map[k]).replace(/\s*\d+\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); });   // 각주 표시 "1)" 빼기
  var got = 절고르기_(map, p);
  if (!got) return null;
  return { lines: got.lines, a: got.a, b: got.b, last: got.last, translation: '개역개정', source: url };
}

/** NIV — BibleGateway 본문 화면 */
function NIV본문_(p) {
  if (!p || !p.no || !p.ch) return null;
  var q = 영어책이름_(p.no) + ' ' + p.ch + (p.v1 ? ':' + p.v1 + (p.v2 && p.v2 !== p.v1 ? '-' + (p.v2 === 'end' ? '' : p.v2) : '') : '');
  q = q.replace(/-$/, '');
  if (p.v2 === 'end') q = 영어책이름_(p.no) + ' ' + p.ch;
  var url = 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(q) + '&version=NIV&interface=print';
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (YNToronto bulletin)', 'Accept-Language': 'en' } });
  if (r.getResponseCode() >= 300) throw new Error('NIV 본문을 받지 못했습니다 (' + r.getResponseCode() + ').');
  var h = 웹글자_(r);
  var s = h.search(/class=["'][^"']*passage-text/i);
  if (s > 0) h = h.slice(s);
  var e = h.search(/class=["'][^"']*(footnotes|crossrefs|passage-other-trans|full-chap-link)/i);
  if (e > 0) h = h.slice(0, e);
  h = h.replace(/<h\d[^>]*>[\s\S]*?<\/h\d>/gi, '')                                   // 소제목
    .replace(/<sup[^>]*class=["'][^"']*(footnote|crossreference)[^"']*["'][^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<sup[^>]*class=["'][^"']*versenum[^"']*["'][^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<span[^>]*class=["'][^"']*chapternum[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '');
  var map = {}, re = /class=["']text\s+[\w]+-(\d+)-(\d+)["'][^>]*>/g, m, marks = [];
  while ((m = re.exec(h))) marks.push({ ch: Number(m[1]), v: Number(m[2]), at: re.lastIndex });
  marks.forEach(function (k, i) {
    if (k.ch !== p.ch) return;
    var end = i + 1 < marks.length ? h.lastIndexOf('<', marks[i + 1].at - 1) : h.length;
    var piece = html글자_(h.slice(k.at, Math.max(k.at, end))).replace(/\s+/g, ' ').trim();
    if (!piece) return;
    map[k.v] = map[k.v] ? map[k.v] + ' ' + piece : piece;
  });
  var got = 절고르기_(map, p.v1 ? p : { v1: 0, v2: 0 });
  if (!got) return null;
  return { lines: got.lines, translation: 'NIV', source: url.replace('&interface=print', '') };
}

/** 구절 → { ref, ko:{text, translation}, en:{text, translation}, warn } — 하나가 안 되어도 다른 하나는 돌려줍니다 */
function 성경본문가져오기_(ref) {
  var p = 구절풀기_(ref);
  if (!p) throw new Error('구절을 알아보지 못했습니다. 예: 누가복음 5:1-11 · 시편 23편 · John 3:16');
  var key = 'bible6:' + [p.no, p.ch, p.v1, p.v2].join('.');
  var cache = null;
  try { cache = CacheService.getScriptCache(); var hit = cache.get(key); if (hit) return JSON.parse(hit); } catch (e) { cache = null; }
  var ko = null, en = null, warn = [];
  try { ko = 개역개정본문_(p); } catch (e) { warn.push(e.message || String(e)); }
  if (!ko) {
    try {
      var old = 개역한글본문_(p);
      if (old) {
        var ls = old.text.split('\n');
        ko = { lines: ls, translation: '개역한글', b: parseInt(ls[ls.length - 1], 10) || 0 };
        warn.push('개역개정을 받지 못해 개역한글로 채웠습니다.');
      }
    } catch (e2) { warn.push(e2.message || String(e2)); }
  }
  try { en = NIV본문_(p); } catch (e3) { warn.push(e3.message || String(e3)); }
  if (!ko && !en) throw new Error('본문을 가져오지 못했습니다. ' + warn.join(' ') + ' 잠시 후 다시 하시거나 붙여 넣어 주세요.');
  var 표기 = p.ko + ' ' + p.ch + (p.v1 ? ':' + p.v1 + (p.v2 && p.v2 !== p.v1 ? '-' + (p.v2 === 'end' ? (ko && ko.b) || '' : p.v2) : '') : '장');
  var v = {
    ref: 표기.replace(/-$/, ''), refEn: 영어책이름_(p.no) + ' ' + p.ch + (p.v1 ? ':' + p.v1 + (p.v2 && p.v2 !== p.v1 && p.v2 !== 'end' ? '-' + p.v2 : '') : ''),
    ko: ko ? { text: ko.lines.join('\n'), translation: ko.translation } : null,
    en: en ? { text: en.lines.join('\n'), translation: 'NIV' } : null,
    warn: warn.join(' ')
  };
  if (!warn.length && cache) { try { cache.put(key, JSON.stringify(v), 6 * 3600); } catch (e) { /* 기억 못 해도 그대로 */ } }   // 둘 다 받았을 때만 6시간 기억
  return v;
}

/** 주보 편집 — "본문 자동으로 채우기" */
function bulletinFetchBible(token, ref) {
  주보권한_(token);
  return 성경본문가져오기_(ref);
}

/** 묵상 본문(한 칸에 저장) — 한글 줄 뒤에 "[NIV]" 줄과 영어 줄을 붙입니다. 화면(Devotion)은 같은 절끼리 짝지어 보여 줍니다 */
function 묵상본문합치기_(v) {
  var t = v.ko ? v.ko.text : '';
  if (v.en && v.en.text) t += (t ? '\n\n' : '') + '[NIV]\n' + v.en.text;
  return t;
}

/** 관리 화면(오늘의 묵상) — 구절 표기로 본문 채우기 */
function adminFetchBible(key, ref) {
  if (!isAdmin_(key) && !커미티토큰_(key)) throw new Error('커미티 · 관리자만 할 수 있습니다.');
  var v = 성경본문가져오기_(ref);
  return { ref: v.ref, text: 묵상본문합치기_(v), tr: [v.ko && v.ko.translation, v.en && 'NIV'].filter(Boolean).join(' + '), warn: v.warn };
}
