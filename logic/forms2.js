/* =========================================================
   신청서 문항 확장 (Step 6) — 별점 · 기타(직접 입력) · 서식 안내글 · 유형 전환 안전 처리
   ---------------------------------------------------------
   lib/runtime.js 의 EXTRA_FILES 로 logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다.
   · 이름이 _ 로 끝나는 함수는 화면에서 부를 수 없습니다(내부 전용). 이 파일에는 화면에서 바로 부르는 함수가 없습니다.
   · app.js 의 신청서 코드(문항종류 · 신청서풀기_ · formOpen · formSave · 답정리_ · formResults · formExport ·
     saveFormTemplate)가 아래 함수를 "끼워 넣은 자리"에서 부릅니다. 끼운 자리는 app.js 에서 "Step 6" 로 검색하세요.
   · 함수 안에 함수를 둘 때는 반드시 들여쓰기(맨 앞 칸에 function 을 쓰지 않기) — runtime.js 가 맨 앞 칸의 function 만 이름표로 모읍니다.
   ========================================================= */

/** "기타(직접 입력)" 를 고른 답의 앞머리 — 답은 "기타: 자전거" 처럼 저장됩니다 (옛 결과 화면 · 엑셀에서도 그대로 읽힘) */
var 기타접두2_ = '기타: ';
var 기타기본이름2_ = '기타 (직접 입력)';
var 별점종류2_ = ['star', 'number', 'face'];

/* ---------------------------------------------------------
   별점 · 만족도
   --------------------------------------------------------- */

/** 문항의 별점 설정을 안전한 값으로 (3~10점 · 얼굴 모양은 5점일 때만) */
function 별점설정2_(q) {
  q = q || {};
  var n = Math.floor(Number(q.scale));
  if (!isFinite(n) || n < 3) n = (isFinite(n) && n > 0 && n < 3) ? 3 : 5;
  if (n > 10) n = 10;
  var v = 별점종류2_.indexOf(String(q.variant)) !== -1 ? String(q.variant) : 'star';
  if (v === 'face' && n !== 5) v = 'number';
  return {
    scale: n, variant: v,
    low: String(q.lowLabel || '').trim().slice(0, 20),
    high: String(q.highLabel || '').trim().slice(0, 20)
  };
}

/** 별점 답 하나 — 1 ~ scale 사이의 정수 (안 골랐으면 ''), 필수인데 비었으면 오류 */
function 별점답정리2_(q, v) {
  var cfg = 별점설정2_(q);
  var s = String(v == null ? '' : v).trim();
  if (!s) {
    if (q.req) throw new Error('"' + q.label + '" 점수를 골라주세요.');
    return '';
  }
  var n = Number(s);
  if (!isFinite(n) || Math.floor(n) !== n || n < 1 || n > cfg.scale) {
    throw new Error('"' + q.label + '" 은 1점부터 ' + cfg.scale + '점 사이로 골라주세요.');
  }
  return n;
}

/* ---------------------------------------------------------
   기타(직접 입력)
   --------------------------------------------------------- */

/**
 * 객관식 · 복수선택 답 목록에서 "기타: …" 를 다듬습니다.
 * q.other 가 꺼져 있으면 아무것도 바꾸지 않습니다 (옛 신청서 그대로).
 * "기타" 를 골랐는데 내용이 비었으면 오류. 한 사람이 "기타" 를 두 번 넣을 수는 없습니다(첫 번째만).
 */
function 기타값정리2_(q, list) {
  if (!q || !q.other) return list;
  var seen = false, out = [];
  for (var i = 0; i < list.length; i++) {
    var s = String(list[i] == null ? '' : list[i]);
    if (s.indexOf('기타:') !== 0) { out.push(s); continue; }
    var text = s.slice(3).replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!text) throw new Error('"' + q.label + '" 의 \'기타\' 내용을 입력해주세요.');
    if (seen) continue;
    seen = true;
    out.push(기타접두2_ + text);
  }
  return out;
}

/** 저장된 답이 "기타: …" 인지 → 그 내용 (아니면 null) */
function 기타내용2_(s) {
  s = String(s == null ? '' : s);
  return s.indexOf('기타:') === 0 ? s.slice(3).trim() : null;
}

/* ---------------------------------------------------------
   서식 있는 안내글 (굵게 · 주황 강조) — 저장 전에 반드시 이 함수를 지납니다
   ---------------------------------------------------------
   허용: 굵게(<b>) · 주황 강조(<mark class="hl">) · 줄바꿈(<br>). 그 밖의 모든 태그 · 속성 · 스크립트는 버립니다.
   돌려주는 값: { html, text }
     text = 서식을 뺀 글 — 예전 화면 · 푸시 알림 · 엑셀이 그대로 읽는 desc 로 저장됩니다.
     html = 서식이 하나라도 있을 때만 채워집니다 (없으면 '' → 예전처럼 글만 보여줌).
   --------------------------------------------------------- */
function 서식정리2_(html, plain, maxText, maxHtml) {
  maxText = maxText || 3000;
  maxHtml = maxHtml || 9000;
  var src = html == null ? '' : String(html);
  if (!src.trim()) return { html: '', text: String(plain == null ? '' : plain).trim().slice(0, maxText) };
  if (src.length > 40000) src = src.slice(0, 40000);

  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var DROP = { script: 1, style: 1, iframe: 1, object: 1, textarea: 1, noscript: 1, template: 1, svg: 1, math: 1, title: 1 };
  var BLOCK = { div: 1, p: 1, li: 1, ul: 1, ol: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, tr: 1, blockquote: 1, pre: 1, section: 1, article: 1 };
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  var decode = function (s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        var n = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return (n > 8 && n < 0x110000 && !(n >= 0xD800 && n <= 0xDFFF)) ? String.fromCodePoint(n) : '';
      }
      return Object.prototype.hasOwnProperty.call(ENT, e) ? ENT[e] : m;
    });
  };
  var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var TAG = { b: '<b>', hl: '<mark class="hl">' }, END = { b: '</b>', hl: '</mark>' };

  var tokens = src.match(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+|</g) || [];
  var out = [], text = [], stack = [], blocks = [];
  var fmt = { b: 0, hl: 0 };          // 지금 켜져 있어야 하는 서식
  var open = [];                      // 실제로 출력에 열려 있는 서식 (안쪽부터 바깥쪽 순서)
  var newlines = 0, needBreak = 0, used = false, len = 0, tlen = 0, stopped = false, skip = '', last = '';

  var closeKind = function (k) {      // 서식 k 를 닫습니다 (겹침이 꼬이지 않게 안쪽 것을 먼저 닫았다가 다시 열도록 남겨 둡니다)
    var at = open.lastIndexOf(k);
    if (at === -1) return;
    while (open.length > at) { out.push(END[open.pop()]); len += 8; }
  };
  var flushBreaks = function () {
    if (out.length) {
      var n = Math.min(2, newlines + needBreak);
      for (var i = 0; i < n; i++) { out.push('<br>'); text.push('\n'); len += 4; tlen++; }
    }
    newlines = 0; needBreak = 0;
  };
  var emitText = function (s) {
    var room = maxText - tlen;                                  // 글자 수 한도가 차면 거기서 멈춥니다 (서식이 잘려 나가지 않게)
    if (room <= 0) { stopped = true; return; }
    if (s.length > room) { s = s.slice(0, room); stopped = true; }
    flushBreaks();
    ['b', 'hl'].forEach(function (k) {
      if (fmt[k] > 0 && open.indexOf(k) === -1) { out.push(TAG[k]); open.push(k); used = true; len += 17; }
    });
    out.push(esc(s)); text.push(s); len += s.length; tlen += s.length;
    if (blocks.length) blocks[blocks.length - 1] = true;
  };

  for (var i = 0; i < tokens.length && len <= maxHtml && !stopped; i++) {
    var tk = tokens[i];
    if (tk.indexOf('<!--') === 0) continue;
    var m = /^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(tk);

    if (!m) {                                                   // 글 조각
      if (skip) continue;
      var t = decode(tk).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n');
      if (!t) continue;
      if (/^[ \t\u00A0\n]*$/.test(t)) {                         // 공백뿐인 조각 — 줄 맨 앞 · 줄바꿈 뒤 · 태그 사이 들여쓰기 줄은 버리고, 나머지는 띄어쓰기 하나
        if (!out.length || newlines + needBreak > 0 || t.indexOf('\n') !== -1) continue;
        t = ' ';
      }
      var parts = t.split('\n');
      for (var p = 0; p < parts.length; p++) {
        if (p > 0) { newlines++; last = 'br'; }
        if (parts[p]) { emitText(parts[p]); last = 'text'; }
      }
      continue;
    }
    var closing = !!m[1], name = m[2].toLowerCase();

    if (skip) {                                                 // <script> … </script> 안은 통째로 버립니다
      if (closing && name === skip) skip = '';
      continue;
    }
    if (!closing && DROP[name]) { skip = name; continue; }
    if (name === 'br') { if (!closing) { newlines++; last = 'br'; } continue; }
    if (VOID[name]) continue;

    if (!closing) {
      if (/\/\s*>$/.test(tk)) { if (BLOCK[name]) { needBreak = 1; last = 'block'; } continue; }   // <div/> 같은 자기닫힘
      var kind = null, attrs = tk.slice(m[0].length);
      if (name === 'b' || name === 'strong') kind = 'b';
      else if (name === 'mark') kind = 'hl';
      else if (name === 'span' || name === 'font' || name === 'u' || name === 'em' || name === 'i') {
        if (/(class\s*=\s*["'][^"']*\bhl\b|data-hl)/i.test(attrs)) kind = 'hl';
        else if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(attrs)) kind = 'b';
      }
      if (kind && fmt[kind] > 0) kind = null;                   // 이미 켜져 있으면 겹치지 않게
      if (kind) fmt[kind]++;
      var isBlock = !!BLOCK[name];
      if (isBlock) { needBreak = 1; blocks.push(false); last = 'block'; }
      stack.push({ tag: name, kind: kind, block: isBlock });
    } else {
      var at = -1;
      for (var s = stack.length - 1; s >= 0; s--) if (stack[s].tag === name) { at = s; break; }
      if (at === -1) { if (BLOCK[name]) { needBreak = 1; last = 'block'; } continue; }
      while (stack.length > at) {
        var top = stack.pop();
        if (top.kind) { fmt[top.kind]--; closeKind(top.kind); }
        if (top.block) {
          var had = blocks.pop();
          if (last === 'br' && had && newlines > 0) newlines--;  // 줄 끝의 <br> 는 브라우저가 넣는 자리표시라 빼 줍니다
          if (had && blocks.length) blocks[blocks.length - 1] = true;
          needBreak = 1; last = 'block';
        }
      }
    }
  }
  while (open.length) out.push(END[open.pop()]);                // 안 닫힌 것은 닫습니다

  var plainText = text.join('').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxText);
  if (!plainText) return { html: '', text: '' };
  var result = out.join('');
  if (!used || result.length > maxHtml) return { html: '', text: plainText };   // 서식이 없으면(또는 너무 길면) 예전처럼 글만
  return { html: result, text: plainText };
}

/* ---------------------------------------------------------
   문항 저장 — 새 칸 (formSave 가 이미 다듬은 out 에 덧붙입니다)
   ---------------------------------------------------------
   유형을 바꿔도 선택지 · 범위 · 별점 설정이 지워지지 않게 "안 쓰는 유형의 값도 그대로" 둡니다.
   (예: 객관식 → 주관식 → 객관식 으로 돌아오면 선택지가 그대로)
   --------------------------------------------------------- */
function 문항정리2_(src, out) {
  src = src || {};
  var other = String(src.otherLabel || '').trim().slice(0, 30);
  if (other) out.otherLabel = other;
  if (out.type === 'rating' || src.scale != null || src.variant != null || src.lowLabel || src.highLabel) {
    var c = 별점설정2_(src);
    out.scale = c.scale; out.variant = c.variant; out.lowLabel = c.low; out.highLabel = c.high;
  }
  if (src.helpHtml || out.type === 'section') {
    var r = 서식정리2_(src.helpHtml, out.help, 500, 3000);
    out.help = r.text;
    if (r.html) out.helpHtml = r.html;
  }
  return out;
}

/* ---------------------------------------------------------
   결과 보기 · 엑셀 — 어떤 모양으로 저장된 답이든 깨지지 않게
   --------------------------------------------------------- */

/** 답 하나를 사람이 읽을 글로 (엑셀 칸) — 옛 답 모양과 결과가 똑같고, 유형을 바꾼 뒤의 다른 모양도 견딥니다 */
function 답표시2_(q, v) {
  if (v == null) return '';
  if (Array.isArray(v)) {
    return v.map(function (x) {
      if (x && typeof x === 'object') return String(x.name || x.id || '');
      return String(x == null ? '' : x);
    }).join(', ');
  }
  if (q && q.type === 'agree') return v ? '동의' : '';
  if (typeof v === 'object') return String(v.name || v.id || '');
  if (v === true) return '동의';
  if (v === false) return '';
  return String(v);
}

/** 저장된 답 → 고른 것들의 배열 (문자열이든 배열이든 — 유형을 바꾼 뒤에도 셀 수 있게) */
function 고른것들2_(v) {
  if (v == null || v === '') return [];
  var arr = Array.isArray(v) ? v : [v];
  var out = [];
  arr.forEach(function (x) {
    var s = (x && typeof x === 'object') ? String(x.name || '') : String(x);
    s = s.trim();
    if (s) out.push(s);
  });
  return out;
}

/**
 * 결과 화면의 "한눈에 보기" 집계.
 * 순서와 모양은 예전과 같습니다: 객관식 · 복수선택(문항 순서) → 숫자 → (새) 별점.
 * 새로 생긴 것: 기타(직접 입력) 는 한 줄로 묶고 내용 목록(others)을 따로 · 별점은 평균 + 점수별 인원.
 */
function 결과집계2_(f, rows) {
  var qs = (f && f.questions) || [];
  var stats = [];

  qs.forEach(function (q) {
    if (q.type !== 'choice' && q.type !== 'checks') return;
    var cnt = {}, none = 0, others = [], otherName = String(q.otherLabel || '').trim() || 기타기본이름2_;
    (q.opts || []).forEach(function (o) { cnt[o] = 0; });
    if (q.other) cnt[otherName] = 0;
    rows.forEach(function (a) {
      var picks = 고른것들2_(a.answers[q.id]);
      if (!picks.length) { none++; return; }
      picks.forEach(function (x) {
        var etc = q.other ? 기타내용2_(x) : null;
        if (etc !== null) { cnt[otherName] = (cnt[otherName] || 0) + 1; if (etc && others.length < 200) others.push({ name: a.name, text: etc }); return; }
        cnt[x] = (cnt[x] || 0) + 1;
      });
    });
    var st = { id: q.id, label: q.label, type: q.type, none: none,
      items: Object.keys(cnt).map(function (k) { return { name: k, n: cnt[k] }; }) };
    if (q.other) st.others = others;
    stats.push(st);
  });

  // 숫자 문항은 합계도 (티셔츠 몇 장, 인원 몇 명 등)
  qs.forEach(function (q) {
    if (q.type !== 'number') return;
    var sum = 0, n = 0;
    rows.forEach(function (a) {
      var v = Number(a.answers[q.id]);
      if (isFinite(v) && a.answers[q.id] !== '' && a.answers[q.id] != null) { sum += v; n++; }
    });
    stats.push({ id: q.id, label: q.label, type: 'number', sum: sum, n: n, unit: q.unit || '' });
  });

  // 별점 · 만족도 — 평균과 점수별 인원
  qs.forEach(function (q) {
    if (q.type !== 'rating') return;
    var cfg = 별점설정2_(q), dist = [], total = 0, n = 0, none = 0, i;
    for (i = 1; i <= cfg.scale; i++) dist.push({ name: String(i), n: 0 });
    rows.forEach(function (a) {
      var v = Number(a.answers[q.id]);
      if (a.answers[q.id] === '' || a.answers[q.id] == null || !isFinite(v) || Math.floor(v) !== v || v < 1 || v > cfg.scale) { none++; return; }
      dist[v - 1].n++; total += v; n++;
    });
    stats.push({ id: q.id, label: q.label, type: 'rating', scale: cfg.scale, n: n, none: none,
      avg: n ? Math.round(total / n * 100) / 100 : 0, items: dist });
  });
  return stats;
}
