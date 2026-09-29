/**
 * 악보 필기 엔진 — PDF 위에 펜 · 형광펜 · 글자/코드 · 음악 기호를 얹고, 팀과 실시간으로 나눕니다
 * ------------------------------------------------------------
 *  · 모든 좌표는 "쪽 크기에 대한 비율(0~1)"로 저장 → 화면 크기 · 확대 · 다른 기기에서도 같은 자리에 그려짐
 *  · 필기 항목 형식은 서버(lib/realtime.js cleanItem)와 같습니다 — { id, t:'pen'|'hl'|'text'|'sym', pg, c, w, p[], x, y, sz, s, chord, k, w2 … }
 *  · 층(layer): 'team' = 모두에게 보임(실시간 공유) / 'mine' = 나만 보임
 *  · 이 파일은 (1) 순수 함수(좌표 · 판정 · 기호 그리기) (2) create() 엔진(포인터 입력 · 되돌리기 · 그리기)으로 되어 있습니다
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YNAnno = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 펜 · 글자 · 코드 · 기호 색: 빨강 · 파랑 · 초록 · 보라 · 검정 · 흰색(흰색은 틀린 곳을 덮는 "수정액"). 예전에 쓴 다른 색(주황 등)의 필기도 그대로 그려집니다 */
  var PALETTE = ['#e53935', '#2563eb', '#16a34a', '#7c3aed', '#111111', '#ffffff'];
  var COLOR_NAMES = { '#e53935': '빨강', '#2563eb': '파랑', '#16a34a': '초록', '#7c3aed': '보라', '#111111': '검정', '#ffffff': '흰색 (수정액)' };
  var HL_COLORS = ['#ffe14d', '#7dff8a', '#ff9ad5', '#7fd4ff', '#ffb066'];
  var STRETCH = { tie: 1, cresc: 1, decresc: 1 };
  /** 송폼 박스 이름표 — 서버(lib/realtime.js FBOX_TAG_RE)는 이 글자들과 같은 모양(영문 · 숫자 · 한글 8자 이내)만 받습니다. Int=인트로 V=절 P=프리코러스 C=후렴 B=브릿지 */
  var FBOX_TAGS = ['Int', 'V', 'V1', 'V2', 'V3', 'P', 'C', 'C2', 'B', 'Inst', 'Itld', 'Solo', 'Tag', 'Turn', 'Out', 'Coda', 'End'];
  var FBOX_NAMES = { Int: '인트로', V: '절', V1: '1절', V2: '2절', V3: '3절', P: '프리코러스', C: '후렴', C2: '후렴 2', B: '브릿지', Inst: '연주', Itld: '간주', Solo: '솔로', Tag: '태그', Turn: '턴어라운드', Out: '아웃트로', Coda: '코다', End: '끝' };
  /** 글꼴 — 글자 · 코드 · 글자 모양 기호(음표 도장 · 다이내믹)에 씁니다. 서버는 이 키(sans · serif · hand)만 받습니다 */
  var FONT_KEYS = ['sans', 'serif', 'hand', 'pen', 'dodum'];
  var FONT_NAMES = { sans: '고딕 (Sans-serif)', serif: '명조 (Serif)', hand: '손글씨 (기기 글꼴)', pen: '나눔 펜 손글씨', dodum: '고운돋움 (손글씨체)' };
  /** 한글 손글씨 웹폰트 (구글 폰트) — 화면 글자 · 코드에 고를 수 있고, 못 받으면 아래 대체 글꼴로 보입니다 */
  var WEBFONT_URL = 'https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&family=Gowun+Dodum&display=swap';
  var WEBFONT_FACES = ['Nanum Pen Script', 'Gowun Dodum'];
  var FONTS = {
    pen: '"Nanum Pen Script","Segoe Print","Bradley Hand","Noteworthy","Apple SD Gothic Neo",cursive',
    dodum: '"Gowun Dodum","Nanum Gothic","Apple SD Gothic Neo","Malgun Gothic",sans-serif',
    sans: '"Segoe UI","Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif',
    serif: '"Times New Roman","Noto Serif KR","Apple Myungjo","Batang",Georgia,serif',
    hand: '"Segoe Print","Bradley Hand","Noteworthy","Nanum Pen Script","Comic Sans MS","Apple SD Gothic Neo",cursive'
  };
  var GLYPH_FALLBACK = ',"Segoe UI Symbol","Apple Symbols","Noto Music","DejaVu Sans"';
  var GLYPHS = { quarter: '\u2669', eighth: '\u266a', sharp: '\u266f', flat: '\u266d' };     // ♩ ♪ ♯ ♭
  /** 웹폰트를 한 번만 불러오고, 다 받으면 바로 다시 그리도록 알려 줍니다 (캔버스는 글꼴이 늦게 오면 예전 모양 그대로라서) */
  var _fontsAsked = false;
  function ensureWebFonts(done) {
    if (typeof document === 'undefined') return;
    try {
      if (!_fontsAsked) {
        _fontsAsked = true;
        if (!document.getElementById('yn-anno-fonts')) {
          var pc = document.createElement('link'); pc.rel = 'preconnect'; pc.href = 'https://fonts.gstatic.com'; pc.crossOrigin = 'anonymous'; document.head.appendChild(pc);
          var lk = document.createElement('link'); lk.id = 'yn-anno-fonts'; lk.rel = 'stylesheet'; lk.href = WEBFONT_URL; document.head.appendChild(lk);
          lk.onload = function () { if (done) done(); };
        }
      }
      if (document.fonts && document.fonts.load) {
        Promise.all(WEBFONT_FACES.map(function (f) { return document.fonts.load('24px "' + f + '"', '\uAC00\uB098\uB2E4'); })).then(function () { if (done) done(); }, function () {});
      }
    } catch (e) { /* 글꼴을 못 받아도 대체 글꼴로 계속 동작 */ }
  }
  function textLike(k) { return k.indexOf('dyn:') === 0 || k.indexOf('g:') === 0; }
  function fontOf(it) { return FONTS[it && it.f] ? it.f : 'sans'; }

  /** 기호 목록 (서버 SYMBOLS 와 동일해야 함 — 시험에서 비교) */
  var SYMBOLS = [
    { k: 'sharp', n: '샵 ♯' }, { k: 'flat', n: '플랫 ♭' }, { k: 'natural', n: '제자리 ♮' }, { k: 'fermata', n: '늘임표' },
    { k: 'segno', n: '세뇨' }, { k: 'coda', n: '코다' }, { k: 'repeatStart', n: '도돌이 시작' }, { k: 'repeatEnd', n: '도돌이 끝' },
    { k: 'breath', n: '숨표' }, { k: 'cresc', n: '크레센도' }, { k: 'decresc', n: '데크레센도' }, { k: 'accent', n: '악센트' },
    { k: 'staccato', n: '스타카토' }, { k: 'tenuto', n: '테누토' }, { k: 'tie', n: '이음줄' }, { k: 'arrowDown', n: '↓ 화살표' },
    { k: 'arrowUp', n: '↑ 화살표' }, { k: 'star', n: '별' }, { k: 'check', n: '체크' }, { k: 'circle', n: '동그라미' }, { k: 'box', n: '네모' },
    { k: 'dyn:pp', n: 'pp' }, { k: 'dyn:p', n: 'p' }, { k: 'dyn:mp', n: 'mp' }, { k: 'dyn:mf', n: 'mf' }, { k: 'dyn:f', n: 'f' }, { k: 'dyn:ff', n: 'ff' },
    { k: 'dyn:dc', n: 'D.C.' }, { k: 'dyn:ds', n: 'D.S.' }, { k: 'dyn:tocoda', n: 'To Coda' }, { k: 'dyn:fine', n: 'Fine' },
    { k: 'g:quarter', n: '♩ 4분음표' }, { k: 'g:eighth', n: '♪ 8분음표' }, { k: 'g:sharp', n: '♯ 샵 (글자)' }, { k: 'g:flat', n: '♭ 플랫 (글자)' }
  ];
  var DYN_TEXT = { pp: 'pp', p: 'p', mp: 'mp', mf: 'mf', f: 'f', ff: 'ff', dc: 'D.C.', ds: 'D.S.', tocoda: 'To Coda', fine: 'Fine' };

  var _seq = 0;
  function newId() {
    var r = ''; for (var i = 0; i < 5; i++) r += Math.floor(Math.random() * 36).toString(36);
    return 'a' + Date.now().toString(36) + (++_seq).toString(36) + r;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function doc0() { return typeof document !== 'undefined' ? document : { activeElement: null }; }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  /** 점 줄이기 (Douglas–Peucker) — 손떨림 · 불필요한 점을 없애 전송량과 저장량을 줄입니다. p = [x,y,x,y…] (0~1), eps = 비율 */
  function simplify(p, eps) {
    var n = p.length / 2; if (n <= 2) return p.slice();
    var keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    var stack = [[0, n - 1]];
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1], ax = p[a * 2], ay = p[a * 2 + 1], bx = p[b * 2], by = p[b * 2 + 1], dmax = 0, idx = -1;
      var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      for (var i = a + 1; i < b; i++) {
        var px = p[i * 2], py = p[i * 2 + 1], d;
        if (len2 === 0) d = Math.hypot(px - ax, py - ay);
        else { var t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1); d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
        if (d > dmax) { dmax = d; idx = i; }
      }
      if (dmax > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    var out = []; for (var j = 0; j < n; j++) if (keep[j]) out.push(r4(p[j * 2]), r4(p[j * 2 + 1]));
    return out;
  }
  /** 점이 maxPts 개를 넘으면 eps 를 키워가며 줄입니다 */
  function limitPoints(p, maxPts) {
    var eps = 0.0006, out = simplify(p, eps), guard = 0;
    while (out.length / 2 > maxPts && guard++ < 20) { eps *= 1.6; out = simplify(p, eps); }
    return out;
  }

  /* ------------------------------------------------------------ 기호 그리기 (중심 (0,0), s = 기호 크기(px)) */
  function ln(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  var SYM = {
    sharp: function (c, s) { c.lineWidth = Math.max(1.4, s * 0.06); ln(c, -.17 * s, -.5 * s, -.17 * s, .44 * s); ln(c, .17 * s, -.44 * s, .17 * s, .5 * s); c.lineWidth = Math.max(2.2, s * 0.13); ln(c, -.38 * s, .12 * s, .38 * s, -.04 * s); ln(c, -.38 * s, .34 * s, .38 * s, .18 * s); },
    flat: function (c, s) { c.lineWidth = Math.max(1.5, s * 0.07); ln(c, -.15 * s, -.55 * s, -.15 * s, .42 * s); c.beginPath(); c.moveTo(-.15 * s, .42 * s); c.bezierCurveTo(.5 * s, .2 * s, .5 * s, -.28 * s, -.15 * s, -.06 * s); c.stroke(); },
    natural: function (c, s) { c.lineWidth = Math.max(1.4, s * 0.06); ln(c, -.16 * s, -.5 * s, -.16 * s, .22 * s); ln(c, .16 * s, -.22 * s, .16 * s, .5 * s); c.lineWidth = Math.max(2.2, s * 0.12); ln(c, -.16 * s, .12 * s, .16 * s, .05 * s); ln(c, -.16 * s, -.06 * s, .16 * s, -.13 * s); },
    fermata: function (c, s) { c.lineWidth = Math.max(1.6, s * 0.08); c.beginPath(); c.arc(0, .2 * s, .42 * s, Math.PI, 0); c.stroke(); c.beginPath(); c.arc(0, .1 * s, .07 * s, 0, 7); c.fill(); },
    segno: function (c, s) { c.lineWidth = Math.max(1.6, s * 0.08); c.beginPath(); c.moveTo(.25 * s, -.3 * s); c.bezierCurveTo(-.3 * s, -.6 * s, -.4 * s, -.05 * s, 0, 0); c.bezierCurveTo(.4 * s, .05 * s, .3 * s, .6 * s, -.25 * s, .3 * s); c.stroke(); ln(c, -.32 * s, .42 * s, .32 * s, -.42 * s); c.beginPath(); c.arc(-.3 * s, -.04 * s, .05 * s, 0, 7); c.arc(.3 * s, .04 * s, .05 * s, 0, 7); c.fill(); },
    coda: function (c, s) { c.lineWidth = Math.max(1.6, s * 0.07); c.beginPath(); c.arc(0, 0, .3 * s, 0, 7); c.stroke(); ln(c, 0, -.5 * s, 0, .5 * s); ln(c, -.5 * s, 0, .5 * s, 0); },
    repeatStart: function (c, s) { c.fillRect(-.32 * s, -.5 * s, .12 * s, s); c.lineWidth = Math.max(1.2, s * 0.04); ln(c, -.1 * s, -.5 * s, -.1 * s, .5 * s); c.beginPath(); c.arc(.12 * s, -.14 * s, .055 * s, 0, 7); c.arc(.12 * s, .14 * s, .055 * s, 0, 7); c.fill(); },
    repeatEnd: function (c, s) { c.fillRect(.2 * s, -.5 * s, .12 * s, s); c.lineWidth = Math.max(1.2, s * 0.04); ln(c, .1 * s, -.5 * s, .1 * s, .5 * s); c.beginPath(); c.arc(-.12 * s, -.14 * s, .055 * s, 0, 7); c.arc(-.12 * s, .14 * s, .055 * s, 0, 7); c.fill(); },
    breath: function (c, s) { c.lineWidth = Math.max(2, s * 0.1); c.lineCap = 'round'; c.beginPath(); c.moveTo(-.05 * s, -.3 * s); c.quadraticCurveTo(.3 * s, -.25 * s, 0, .3 * s); c.stroke(); },
    cresc: function (c, s, len) { c.lineWidth = Math.max(1.6, s * 0.07); c.beginPath(); c.moveTo(len, -.22 * s); c.lineTo(0, 0); c.lineTo(len, .22 * s); c.stroke(); },
    decresc: function (c, s, len) { c.lineWidth = Math.max(1.6, s * 0.07); c.beginPath(); c.moveTo(0, -.22 * s); c.lineTo(len, 0); c.lineTo(0, .22 * s); c.stroke(); },
    accent: function (c, s) { c.lineWidth = Math.max(1.8, s * 0.09); c.beginPath(); c.moveTo(-.38 * s, -.24 * s); c.lineTo(.38 * s, 0); c.lineTo(-.38 * s, .24 * s); c.stroke(); },
    staccato: function (c, s) { c.beginPath(); c.arc(0, 0, Math.max(2, .11 * s), 0, 7); c.fill(); },
    tenuto: function (c, s) { c.lineWidth = Math.max(2, s * 0.1); ln(c, -.38 * s, 0, .38 * s, 0); },
    tie: function (c, s, len) { c.lineWidth = Math.max(1.6, s * 0.07); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len / 2, s * .55, len, 0); c.stroke(); },
    arrowDown: function (c, s) { c.lineWidth = Math.max(1.8, s * 0.08); ln(c, 0, -.5 * s, 0, .5 * s); c.beginPath(); c.moveTo(-.25 * s, .22 * s); c.lineTo(0, .5 * s); c.lineTo(.25 * s, .22 * s); c.stroke(); },
    arrowUp: function (c, s) { c.lineWidth = Math.max(1.8, s * 0.08); ln(c, 0, -.5 * s, 0, .5 * s); c.beginPath(); c.moveTo(-.25 * s, -.22 * s); c.lineTo(0, -.5 * s); c.lineTo(.25 * s, -.22 * s); c.stroke(); },
    star: function (c, s) { c.beginPath(); for (var i = 0; i < 10; i++) { var r = i % 2 ? .22 * s : .5 * s, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); },
    check: function (c, s) { c.lineWidth = Math.max(2, s * 0.1); c.lineJoin = 'round'; c.beginPath(); c.moveTo(-.4 * s, 0); c.lineTo(-.1 * s, .34 * s); c.lineTo(.4 * s, -.4 * s); c.stroke(); },
    circle: function (c, s) { c.lineWidth = Math.max(1.8, s * 0.07); c.beginPath(); c.ellipse(0, 0, .55 * s, .42 * s, 0, 0, 7); c.stroke(); },
    box: function (c, s) { c.lineWidth = Math.max(1.8, s * 0.07); c.strokeRect(-.6 * s, -.4 * s, 1.2 * s, .8 * s); }
  };
  function symBox(k, it, W, H) {              // 기호가 차지하는 사각형(px) — 판정 · 지우개용
    var s = (it.sz || 0.03) * W, x = it.x * W, y = it.y * H;
    if (STRETCH[k]) { var len = (it.w2 || 0.08) * W; return { x1: x - 4, y1: y - s * .5, x2: x + len + 4, y2: y + s * .6 }; }
    if (k.indexOf('g:') === 0) return { x1: x - s * .38, y1: y - s * .55, x2: x + s * .38, y2: y + s * .55 };
    var half = k.indexOf('dyn:') === 0 ? { w: s * (DYN_TEXT[k.slice(4)].length * .3 + .2), h: s * .5 } : { w: s * .62, h: s * .55 };
    return { x1: x - half.w, y1: y - half.h, x2: x + half.w, y2: y + half.h };
  }

  /** 선택 표시 · 잡기용 — 글자 · 기호 · 송폼 박스가 차지하는 사각형(px) */
  function itemBox(it, W, H) {
    if (it.t === 'text') { var px = Math.max(8, (it.sz || 0.025) * W), w = textWidth(it, W); return { x: it.x * W - 3, y: it.y * H - px - 1, w: w + 6, h: px * 1.3 + 4 }; }
    if (it.t === 'sym') { var b = symBox(it.k, it, W, H); return { x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 }; }
    if (it.t === 'fbox') { var lb = fboxLabel(it, W, H), x0 = Math.min(it.x * W, lb.x), y0 = Math.min(it.y * H, lb.y); return { x: x0, y: y0, w: Math.max(it.x * W + it.w * W, lb.x + lb.w) - x0, h: Math.max(it.y * H + it.h * H, lb.y + lb.h) - y0 }; }
    return null;
  }
  function movable(it) { return !!it && (it.t === 'text' || it.t === 'sym' || it.t === 'fbox'); }
  var SZ_RANGE = { text: [0.012, 0.08], sym: [0.012, 0.12], fbox: [0.008, 0.06] };

  /* ------------------------------------------------------------ 송폼 박스 도우미 */
  function isLightColor(c) { var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); return !!m && (parseInt(m[1], 16) * 0.3 + parseInt(m[2], 16) * 0.59 + parseInt(m[3], 16) * 0.11) > 170; }
  function rrect(c, x, y, w, h, r) { c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
  var _fm = null;
  /** 이름표(라벨) 칸 — 박스 왼쪽 위 바깥에 붙고, 위가 쪽 밖이면 안쪽으로 들어옵니다 (px) */
  function fboxLabel(it, W, H) {
    var px = Math.max(11, Math.min(26, (it.sz || 0.02) * W)), pad = Math.max(4, px * 0.4), tw = 0, s = String(it.k || '');
    try { if (typeof document !== 'undefined') { _fm = _fm || document.createElement('canvas').getContext('2d'); _fm.font = '800 ' + px + 'px ' + FONTS.sans; tw = _fm.measureText(s).width; } } catch (e) {}
    if (!tw) tw = s.length * px * 0.62;
    var h = px + pad, x = it.x * W, y = it.y * H - h;
    if (y < 0) y = it.y * H;
    return { x: x, y: y, w: tw + pad * 2, h: h, px: px, pad: pad };
  }

  /* ------------------------------------------------------------ 항목 그리기 */
  function strokePath(c, p, W, H) {
    var n = p.length / 2; if (!n) return;
    c.beginPath(); c.moveTo(p[0] * W, p[1] * H);
    if (n === 1) { c.lineTo(p[0] * W + 0.01, p[1] * H); return; }
    for (var i = 1; i < n - 1; i++) { var mx = (p[i * 2] + p[i * 2 + 2]) / 2 * W, my = (p[i * 2 + 1] + p[i * 2 + 3]) / 2 * H; c.quadraticCurveTo(p[i * 2] * W, p[i * 2 + 1] * H, mx, my); }
    c.lineTo(p[n * 2 - 2] * W, p[n * 2 - 1] * H);
  }
  /** 항목 하나를 ctx 에 그림. W,H = 그릴 쪽의 픽셀 크기. o.alpha = 전체 투명도 */
  function drawItem(c, it, W, H, o) {
    o = o || {};
    c.save();
    try {
      c.strokeStyle = c.fillStyle = it.c || '#ff5a1f'; c.lineCap = 'round'; c.lineJoin = 'round';
      if (o.alpha != null) c.globalAlpha = o.alpha;
      if (it.t === 'pen') { c.lineWidth = Math.max(0.8, (it.w || 0.003) * W); strokePath(c, it.p || [], W, H); c.stroke(); }
      else if (it.t === 'hl') { c.globalAlpha = (o.alpha == null ? 1 : o.alpha) * 0.38; c.lineCap = it.line ? 'butt' : 'round'; c.lineWidth = Math.max(4, (it.w || 0.02) * W); strokePath(c, it.p || [], W, H); c.stroke(); }
      else if (it.t === 'text') {
        var px = Math.max(8, (it.sz || 0.025) * W);
        c.translate(it.x * W, it.y * H); if (it.rot) c.rotate(it.rot * Math.PI / 180);
        c.font = (it.chord ? '800 ' : '600 ') + px + 'px ' + FONTS[fontOf(it)]; c.textBaseline = 'alphabetic';
        c.lineWidth = Math.max(2, px * 0.2); c.strokeStyle = 'rgba(255,255,255,.9)'; c.strokeText(it.s || '', 0, 0);
        c.fillStyle = it.c || '#ff5a1f'; c.fillText(it.s || '', 0, 0);
      } else if (it.t === 'fbox') {
        var bx = it.x * W, by = it.y * H, bw = Math.max(4, (it.w || 0.1) * W), bh = Math.max(4, (it.h || 0.05) * H), a0 = o.alpha == null ? 1 : o.alpha;
        c.lineWidth = Math.max(2, 0.0035 * W); c.lineJoin = 'miter';
        c.globalAlpha = a0 * 0.07; c.fillRect(bx, by, bw, bh);                                          // 거의 투명한 색 (악보가 그대로 보임)
        c.globalAlpha = a0; c.strokeRect(bx, by, bw, bh);
        var lb = fboxLabel(it, W, H); c.fillStyle = it.c || '#ff5a1f'; c.beginPath(); rrect(c, lb.x, lb.y, lb.w, lb.h, Math.min(5, lb.h / 3)); c.fill();
        c.font = '800 ' + lb.px + 'px ' + FONTS.sans; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = isLightColor(it.c) ? '#111111' : '#ffffff'; c.fillText(String(it.k || ''), lb.x + lb.pad, lb.y + lb.h / 2 + 0.5);
      } else if (it.t === 'sym') {
        var k = it.k, s = Math.max(8, (it.sz || 0.03) * W);
        c.translate(it.x * W, it.y * H); if (it.rot) c.rotate(it.rot * Math.PI / 180);
        if (k.indexOf('g:') === 0) {                                                       // 음표 도장 ♩ ♪ ♯ ♭ — 글꼴 설정을 따름
          c.font = '700 ' + s * 1.05 + 'px ' + FONTS[it.f && FONTS[it.f] ? it.f : 'serif'] + GLYPH_FALLBACK; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = Math.max(2, s * 0.14); c.strokeStyle = 'rgba(255,255,255,.9)'; c.strokeText(GLYPHS[k.slice(2)] || '', 0, 0); c.fillText(GLYPHS[k.slice(2)] || '', 0, 0);
        } else if (k.indexOf('dyn:') === 0) {
          c.font = it.f && FONTS[it.f] ? 'italic 700 ' + s * 0.85 + 'px ' + FONTS[it.f] : 'italic 700 ' + s * 0.85 + 'px "Times New Roman",Georgia,serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = Math.max(2, s * 0.16); c.strokeStyle = 'rgba(255,255,255,.9)'; c.strokeText(DYN_TEXT[k.slice(4)] || '', 0, 0); c.fillText(DYN_TEXT[k.slice(4)] || '', 0, 0);
        } else if (SYM[k]) { c.strokeStyle = 'rgba(255,255,255,.0)'; c.strokeStyle = it.c || '#ff5a1f'; SYM[k](c, s, (it.w2 || 0.08) * W); }
      }
    } catch (e) { /* 항목 하나가 이상해도 나머지는 그립니다 */ }
    c.restore();
  }

  /* ------------------------------------------------------------ 판정 (지우개) */
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - ax, py - ay);
    var t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  var _meas = null;
  function textWidth(it, W) {
    var px = Math.max(8, (it.sz || 0.025) * W), s = String(it.s || '');
    try {
      if (typeof document !== 'undefined') { _meas = _meas || document.createElement('canvas').getContext('2d'); _meas.font = (it.chord ? '800 ' : '600 ') + px + 'px ' + FONTS[fontOf(it)]; return _meas.measureText(s).width; }
    } catch (e) {}
    var w = 0; for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e80 ? px : px * 0.58;
    return w;
  }
  /** (x,y 픽셀)이 항목 위인가? tol = 허용 오차(px) */
  function hit(it, x, y, W, H, tol) {
    tol = tol == null ? 8 : tol;
    if (it.t === 'pen' || it.t === 'hl') {
      var p = it.p || [], r = Math.max(tol, ((it.w || 0.003) * W) / 2 + tol * 0.4);
      if (p.length === 2) return Math.hypot(x - p[0] * W, y - p[1] * H) <= r;
      for (var i = 0; i + 3 < p.length; i += 2) if (segDist(x, y, p[i] * W, p[i + 1] * H, p[i + 2] * W, p[i + 3] * H) <= r) return true;
      return false;
    }
    if (it.t === 'text') { var px = Math.max(8, (it.sz || 0.025) * W), w = textWidth(it, W); return x >= it.x * W - tol && x <= it.x * W + w + tol && y >= it.y * H - px - tol && y <= it.y * H + px * 0.3 + tol; }
    if (it.t === 'fbox') {                                                              // 테두리 · 이름표만 (안쪽은 비어 있어 그 밑의 필기를 가리지 않음)
      var bx = it.x * W, by = it.y * H, bw = (it.w || 0.1) * W, bh = (it.h || 0.05) * H, t2 = Math.max(tol, 6);
      var lb = fboxLabel(it, W, H);
      if (x >= lb.x - 2 && x <= lb.x + lb.w + 2 && y >= lb.y - 2 && y <= lb.y + lb.h + 2) return true;
      var out = x >= bx - t2 && x <= bx + bw + t2 && y >= by - t2 && y <= by + bh + t2, inn = x > bx + t2 && x < bx + bw - t2 && y > by + t2 && y < by + bh - t2;
      return out && !inn;
    }
    if (it.t === 'sym') { var b = symBox(it.k, it, W, H); return x >= b.x1 - tol && x <= b.x2 + tol && y >= b.y1 - tol && y <= b.y2 + tol; }
    return false;
  }

  /* ============================================================ 엔진 */
  var CHORD_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', '#', 'b', 'm', '7', 'maj7', 'sus4', 'add9', '/', '(', ')'];

  /**
   * create({ host, canvas, me, canEdit, onAdd(layer,item), onDel(layer,id), onClear(layer,ids,pg,all), onLive(msg), onChange(), onMessage(text,isError) })
   *  host   = 캔버스를 감싼 position:relative 요소 (글자 입력칸을 이 안에 띄움)
   *  canvas = PDF 화면 위에 겹쳐진 투명 canvas (크기는 resize() 로 맞춤)
   */
  function create(o) {
    var cv = o.canvas, host = o.host, ctx = cv.getContext('2d');
    var S = { layers: { team: new Map(), mine: new Map() }, vis: { team: true, mine: true }, page: 1, tool: 'none', color: PALETTE[0], hlColor: HL_COLORS[0],
      pw: 0.003, hw: 0.02, sym: 'sharp', fboxTag: 'V',  symSize: 0.032, textSize: 0.024, font: 'sans', layer: 'team', W: 1, H: 1, dpr: 1, cur: null, live: new Map(), hist: [], redo: [],
      sawPen: false, sel: null, fboxSize: 0.02, penMode: 'auto', straight: false, me: o.me || '', canEdit: !!o.canEdit, editor: null, raf: 0, dead: false, liveTimer: 0 };
    function say(t, bad) { try { if (o.onMessage) o.onMessage(t, !!bad); } catch (e) {} }
    function changed() { try { if (o.onChange) o.onChange(); } catch (e) {} }

    /* ---- 그리기 ---- */
    function invalidate() { if (S.raf || S.dead) return; S.raf = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (f) { return setTimeout(f, 16); })(function () { S.raf = 0; redraw(); }); }
    function pageItems(layer, pg) { var out = []; S.layers[layer].forEach(function (it) { if (it.pg === pg) out.push(it); }); return out; }
    function drawPage(c, W, H, pg, vis) {
      vis = vis || S.vis;
      ['team', 'mine'].forEach(function (ly) {
        if (!vis[ly]) return;
        var list = pageItems(ly, pg);
        list.filter(function (i) { return i.t === 'hl'; }).forEach(function (i) { drawItem(c, i, W, H); });
        list.filter(function (i) { return i.t !== 'hl'; }).forEach(function (i) { drawItem(c, i, W, H); });
      });
    }
    function redraw() {
      if (S.dead) return;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, S.W, S.H);
      drawPage(ctx, S.W, S.H, S.page);
      var now = Date.now(), keep = false;
      S.live.forEach(function (l, id) {
        if (now - l.at > 4000) { S.live.delete(id); return; }
        keep = true;
        if (l.pg !== S.page || !l.p || l.p.length < 2) return;
        drawItem(ctx, { t: l.t, c: l.c, w: l.w, p: l.p }, S.W, S.H, { alpha: 0.85 });
        var lx = l.p[l.p.length - 2] * S.W, ly = l.p[l.p.length - 1] * S.H;
        ctx.save(); ctx.font = '600 11px sans-serif'; ctx.fillStyle = 'rgba(20,20,26,.85)'; var tw = ctx.measureText(l.by || '').width; ctx.fillRect(lx + 6, ly - 20, tw + 8, 15); ctx.fillStyle = '#fff'; ctx.fillText(l.by || '', lx + 10, ly - 9); ctx.restore();
      });
      if (keep && !S.liveTimer) S.liveTimer = setTimeout(function () { S.liveTimer = 0; invalidate(); }, 1200);
      if (S.cur && (S.cur.kind === 'pen' || S.cur.kind === 'hl')) {
        var cc = S.cur; drawItem(ctx, { t: cc.kind, c: cc.color, w: cc.w, p: cc.straight ? cc.p.slice(0, 2).concat(cc.p.slice(-2)) : cc.p, line: cc.straight }, S.W, S.H);
      } else if (S.cur && (S.cur.kind === 'sym' || S.cur.kind === 'fbox')) {
        drawItem(ctx, S.cur.item, S.W, S.H, { alpha: 0.75 });
      }
      var si = selItem();
      if (si && si.pg === S.page && S.vis[S.sel.layer]) drawSel(ctx, si);
    }
    /** 선택한 항목 둘레의 점선 테두리 + 모서리 점 (끌어서 옮길 수 있다는 표시) */
    function selItem() { return S.sel && S.layers[S.sel.layer] ? (S.layers[S.sel.layer].get(S.sel.id) || null) : null; }
    function drawSel(c, it) {
      var b = itemBox(it, S.W, S.H); if (!b) return;
      var pad = 4, x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2;
      c.save(); c.setLineDash([6, 4]); c.lineWidth = 2; c.strokeStyle = '#ff8a2a'; c.strokeRect(x, y, w, h); c.setLineDash([]);
      c.fillStyle = '#ff8a2a'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(function (q) { c.beginPath(); c.rect(q[0] - 4, q[1] - 4, 8, 8); c.fill(); c.stroke(); });
      c.restore();
    }

    /* ---- 항목 추가 · 삭제 (되돌리기 기록 포함) ---- */
    function mine(it) { return it.by === S.me; }
    function canModify(layer, it) { return layer === 'mine' || mine(it) || S.canEdit; }
    function put(layer, it, notify) { S.layers[layer].set(it.id, it); if (notify !== false) { try { o.onAdd && o.onAdd(layer, it); } catch (e) {} } invalidate(); changed(); }
    function take(layer, id, notify) { var it = S.layers[layer].get(id); if (!it) return null; S.layers[layer].delete(id); if (notify !== false) { try { o.onDel && o.onDel(layer, id); } catch (e) {} } invalidate(); changed(); return it; }
    function record(op) { S.hist.push(op); if (S.hist.length > 200) S.hist.shift(); S.redo = []; }
    function addLocal(layer, it) { it.by = S.me; it.ts = Date.now(); put(layer, it); record({ op: 'add', layer: layer, item: it }); return it; }

    function undo() {
      var h = S.hist.pop(); if (!h) { say('되돌릴 것이 없습니다.'); return false; }
      if (h.op === 'add') take(h.layer, h.item.id);
      else if (h.op === 'del') put(h.layer, h.item);
      else if (h.op === 'edit') put(h.layer, h.before);
      else if (h.op === 'clear') h.items.forEach(function (i) { put(h.layer, i); });
      S.redo.push(h); return true;
    }
    function redo() {
      var h = S.redo.pop(); if (!h) return false;
      if (h.op === 'add') put(h.layer, h.item);
      else if (h.op === 'del') take(h.layer, h.item.id);
      else if (h.op === 'edit') put(h.layer, h.after);
      else if (h.op === 'clear') h.items.forEach(function (i) { take(h.layer, i.id); });
      S.hist.push(h); return true;
    }

    /* ---- 입력 ---- */
    function norm(e) { var r = cv.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1), y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1) }; }
    function drawing() { return S.tool !== 'none'; }
    function refreshTouch() {
      cv.style.pointerEvents = drawing() ? 'auto' : 'none';
      var lockTouch = S.penMode === 'always' || (S.penMode === 'auto' && S.sawPen);
      // 그리는 캔버스는 손가락이든 애플 펜슬이든 브라우저가 스크롤 · 확대로 가로채지 못하게 항상 none (필기가 끊기는 문제).
      // 손가락을 "펜만 그림" 으로 막아 둔 경우의 스크롤 · 스와이프 · 핀치는 화면 쪽 터치 처리(practice.js)가 직접 합니다.
      void lockTouch;
      cv.style.touchAction = 'none'; cv.style.webkitUserSelect = 'none'; cv.style.userSelect = 'none'; cv.style.webkitTouchCallout = 'none';
      cv.style.cursor = !drawing() ? '' : S.tool === 'select' ? 'move' : S.tool === 'eraser' ? 'cell' : S.tool === 'fbox' ? 'crosshair' : S.tool === 'text' || S.tool === 'chord' ? 'text' : 'crosshair';
    }
    function activeColor() { return S.tool === 'hl' ? S.hlColor : S.color; }

    function eraseAt(px, py) {
      var tol = (S.cur && S.cur.touch) ? 14 : 9, gone = 0, denied = false;
      ['mine', 'team'].forEach(function (ly) {
        if (!S.vis[ly]) return;
        pageItems(ly, S.page).slice().reverse().forEach(function (it) {
          if (!hit(it, px, py, S.W, S.H, tol)) return;
          if (!canModify(ly, it)) { denied = true; return; }
          var t = take(ly, it.id); if (t) { record({ op: 'del', layer: ly, item: t }); gone++; }
        });
      });
      if (denied && !gone && S.cur && !S.cur.warned) { S.cur.warned = 1; say('다른 사람이 쓴 필기는 지울 수 없습니다. (팀장 · 인도자만 가능)', true); }
      return gone;
    }

    /** 누른 자리의 옮길 수 있는 항목 (글자 · 코드 · 기호 · 송폼 박스) — 위에 그려진 것부터 */
    function pickMovable(px, py, touch) {
      var tol = touch ? 14 : 7, found = null;
      ['team', 'mine'].forEach(function (ly) {
        if (!S.vis[ly]) return;
        pageItems(ly, S.page).forEach(function (it) {
          if (!movable(it)) return;
          var b = itemBox(it, S.W, S.H);
          var inBox = it.t !== 'fbox' && b && px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol;
          if (inBox || hit(it, px, py, S.W, S.H, tol)) found = { layer: ly, item: it };
        });
      });
      return found;
    }
    function startMove(e, g, p, editOnTap) {
      var was = !!(S.sel && S.sel.id === g.item.id && S.sel.layer === g.layer);
      S.sel = { layer: g.layer, id: g.item.id };
      S.cur = { kind: 'move', ptr: e.pointerId, layer: g.layer, orig: g.item, item: Object.assign({}, g.item), x0: p.x, y0: p.y, px0: e.clientX, py0: e.clientY,
        moved: false, editOnTap: !!editOnTap, wasSel: was, locked: !canModify(g.layer, g.item), warned: false };
      invalidate(); changed();
    }
    function onDown(e) {
      if (!drawing() || S.dead) return;
      if (e.pointerType === 'pen') { if (!S.sawPen) { S.sawPen = true; refreshTouch(); } }
      else if (e.pointerType === 'touch' && (S.penMode === 'always' || (S.penMode === 'auto' && S.sawPen))) return;      // 손바닥 · 손가락은 무시 (펜만 그림)
      else if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (S.cur) { S.cur = null; invalidate(); return; }                                                                // 두 번째 손가락 = 그리기 취소 (확대 동작)
      if (S.editor) { closeEditor(true); }
      if (S.layer === 'team' && o.teamBlocked && o.teamBlocked()) { say(o.teamBlocked(), true); return; }
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      var p = norm(e), touch = e.pointerType === 'touch';
      if (S.tool !== 'select' && S.tool !== 'text' && S.tool !== 'chord' && S.sel) { S.sel = null; changed(); }
      if (S.tool === 'select') {
        var g = pickMovable(p.x * S.W, p.y * S.H, touch);
        if (g) startMove(e, g, p, false); else if (S.sel) { S.sel = null; invalidate(); changed(); }
      } else if (S.tool === 'pen' || S.tool === 'hl') {
        S.cur = { kind: S.tool, id: newId(), ptr: e.pointerId, p: [p.x, p.y], color: activeColor(), w: S.tool === 'hl' ? S.hw : S.pw, sent: 0, fresh: true, straight: S.tool === 'hl' && S.straight, touch: touch };
        invalidate();
      } else if (S.tool === 'eraser') { S.cur = { kind: 'erase', ptr: e.pointerId, touch: touch }; eraseAt(p.x * S.W, p.y * S.H); }
      else if (S.tool === 'sym') {
        var stretch = !!STRETCH[S.sym];
        S.cur = { kind: 'sym', ptr: e.pointerId, x0: p.x, y0: p.y, stretch: stretch, item: { id: newId(), t: 'sym', pg: S.page, c: S.color, x: r4(p.x), y: r4(p.y), sz: S.symSize, k: S.sym, f: textLike(S.sym) && S.font !== 'sans' ? S.font : undefined, w2: stretch ? 0.08 : undefined } };
        invalidate();
      } else if (S.tool === 'fbox') {
        S.cur = { kind: 'fbox', ptr: e.pointerId, x0: p.x, y0: p.y, moved: false, item: { id: newId(), t: 'fbox', pg: S.page, c: S.color, x: r4(p.x), y: r4(p.y), w: 0.001, h: 0.001, sz: S.fboxSize, k: S.fboxTag } };
        invalidate();
      } else if (S.tool === 'text' || S.tool === 'chord') {
        var g2 = pickMovable(p.x * S.W, p.y * S.H, touch);
        if (g2 && g2.item.t === 'text' && canModify(g2.layer, g2.item)) startMove(e, g2, p, true);              // 글자를 누르면: 그냥 떼면 고치기 · 끌면 옮기기
        else S.cur = { kind: 'textpos', ptr: e.pointerId, x: p.x, y: p.y };
      }
    }
    function onMove(e) {
      var c = S.cur; if (!c || e.pointerId !== c.ptr) return;
      var list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e]; if (!list.length) list = [e];
      if (c.kind === 'move') {
        if (!c.moved && Math.hypot(e.clientX - c.px0, e.clientY - c.py0) < 5) return;                           // 살짝 흔들린 것은 "누름"으로
        if (c.locked) { if (!c.warned) { c.warned = true; say('다른 사람이 쓴 필기는 옮길 수 없습니다. (팀장 · 인도자만 가능)', true); } return; }
        c.moved = true;
        var qm = norm(e), o0 = c.orig, it0 = c.item, dx = qm.x - c.x0, dy = qm.y - c.y0;
        if (o0.t === 'fbox') { it0.x = r4(clamp(o0.x + dx, 0, 1 - (o0.w || 0))); it0.y = r4(clamp(o0.y + dy, 0, 1 - (o0.h || 0))); }
        else { it0.x = r4(clamp(o0.x + dx, 0, 1)); it0.y = r4(clamp(o0.y + dy, 0, 1)); }
        S.layers[c.layer].set(it0.id, it0); invalidate();                                                       // 미리보기: 옮기는 동안은 새 자리에 그려짐
      } else if (c.kind === 'pen' || c.kind === 'hl') {
        for (var i = 0; i < list.length; i++) {
          var q = norm(list[i]), n = c.p.length;
          if (n >= 6000) break;
          if (Math.abs(q.x - c.p[n - 2]) + Math.abs(q.y - c.p[n - 1]) < 0.0004) continue;
          c.p.push(q.x, q.y);
        }
        sendLive(c); invalidate();
      } else if (c.kind === 'erase') { list.forEach(function (ev) { var q = norm(ev); eraseAt(q.x * S.W, q.y * S.H); }); }
      else if (c.kind === 'fbox') {
        var q3 = norm(e), it3 = c.item, x1 = Math.min(c.x0, q3.x), y1 = Math.min(c.y0, q3.y);
        it3.x = r4(x1); it3.y = r4(y1); it3.w = r4(Math.abs(q3.x - c.x0)); it3.h = r4(Math.abs(q3.y - c.y0));
        if (it3.w > 0.008 || it3.h > 0.008) c.moved = true; invalidate();
      }
      else if (c.kind === 'sym' && c.stretch) { var q2 = norm(e); c.item.w2 = r4(clamp(Math.abs(q2.x - c.x0), 0.02, 0.5)); invalidate(); }
    }
    function sendLive(c, final) {
      if (S.layer !== 'team' || !o.onLive) return;
      var now = Date.now(); if (!final && now - c.sent < 70) return; c.sent = now;
      var p = c.p, n = p.length / 2; if (n > 200) p = limitPoints(p, 200);
      try { o.onLive({ id: c.id, t: c.kind, pg: S.page, c: c.color, w: r4(clamp(c.w, 0.0005, 0.06)), p: p, fresh: c.fresh ? 1 : 0 }); } catch (e) {} c.fresh = false;
    }
    function onUp(e) {
      var c = S.cur; if (!c || e.pointerId !== c.ptr) return;
      S.cur = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
      if (e.type === 'pointercancel') { if (c.kind === 'move') S.layers[c.layer].set(c.orig.id, c.orig); invalidate(); return; }
      if (c.kind === 'move') {
        if (!c.moved) {
          S.layers[c.layer].set(c.orig.id, c.orig);
          if (c.editOnTap) { S.sel = null; openEditor(c.orig.x, c.orig.y, c.orig, c.layer); }
          else if (c.wasSel && c.orig.t === 'text' && !c.locked) openEditor(c.orig.x, c.orig.y, c.orig, c.layer);       // 선택된 글자를 한 번 더 누르면 고치기
          changed();
        } else {
          var after = Object.assign({}, c.item, { ts: Date.now() });
          put(c.layer, after); record({ op: 'edit', layer: c.layer, before: c.orig, after: after });
        }
      } else if (c.kind === 'pen' || c.kind === 'hl') {
        var p = c.p; if (p.length < 4) p = [p[0], p[1], p[0] + 0.0005, p[1]];
        if (c.straight && p.length > 4) p = p.slice(0, 2).concat(p.slice(-2));
        p = limitPoints(p, 1400);
        var it = { id: c.id, t: c.kind, pg: S.page, c: c.color, w: r4(clamp(c.w, 0.0005, 0.06)), p: p };
        if (c.straight) it.line = 1;
        addLocal(S.layer, it);
      } else if (c.kind === 'fbox') {
        var fb = c.item;
        if (!c.moved || fb.w < 0.012 || fb.h < 0.008) {                                                  // 그냥 눌렀다 뗐으면 기본 크기 박스
          fb.x = r4(clamp(c.x0, 0, 0.7)); fb.y = r4(clamp(c.y0, 0.02, 0.93)); fb.w = 0.3; fb.h = 0.07;
        }
        fb.w = r4(Math.min(fb.w, 1 - fb.x)); fb.h = r4(Math.min(fb.h, 1 - fb.y));
        addLocal(S.layer, fb);
      } else if (c.kind === 'sym') { var s = c.item; if (s.w2 == null) delete s.w2; if (s.f == null) delete s.f; addLocal(S.layer, s); }
      else if (c.kind === 'textpos') { openEditor(c.x, c.y); }
      invalidate();
    }

    /* ---- 글자 · 코드 입력칸 ---- */
    function openEditor(x, y, existing, layerOf) {
      closeEditor(false);
      var r = cv.getBoundingClientRect(), hr = host.getBoundingClientRect(), chord = S.tool === 'chord' || (existing && existing.chord);
      var px = Math.max(12, (existing ? existing.sz : S.textSize) * S.W);
      var box = document.createElement('div'); box.className = 'an-editor';
      box.style.left = (r.left - hr.left + x * r.width) + 'px'; box.style.top = (r.top - hr.top + y * r.height - px) + 'px';
      var inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 200; inp.className = 'an-input' + (chord ? ' chord' : '');
      inp.value = existing ? existing.s : '';
      inp.placeholder = chord ? '코드 (예: G/B)' : '글자'; inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('spellcheck', 'false');
      box.appendChild(inp);
      if (chord) {
        var bar = document.createElement('div'); bar.className = 'an-chordbar';
        CHORD_KEYS.forEach(function (k) { var b = document.createElement('button'); b.type = 'button'; b.textContent = k; b.className = 'an-ck';
          b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); var s = inp.selectionStart == null ? inp.value.length : inp.selectionStart; inp.value = inp.value.slice(0, s) + k + inp.value.slice(inp.selectionEnd == null ? s : inp.selectionEnd); inp.focus(); try { inp.setSelectionRange(s + k.length, s + k.length); } catch (e) {} });
          bar.appendChild(b); });
        box.appendChild(bar);
      }
      host.appendChild(box);
      S.editor = { box: box, inp: inp, x: x, y: y, chord: !!chord, existing: existing || null, layer: layerOf || S.layer, done: false,
        color: existing ? existing.c : S.color, font: existing ? fontOf(existing) : S.font, sz: existing ? existing.sz : S.textSize, colorSet: false, fontSet: false, szSet: false };
      paintEditor();
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); closeEditor(true); } else if (ev.key === 'Escape') { ev.preventDefault(); closeEditor(false); } ev.stopPropagation(); });
      inp.addEventListener('blur', function () {
        setTimeout(function () {
          if (!(S.editor && S.editor.inp === inp)) return;
          var a = doc0().activeElement;
          if (a === inp) return;                                                       // 다시 입력칸으로 돌아왔음
          if (o.keepEditor && a && o.keepEditor(a)) return;            // 색 · 글꼴 · 크기 조절 칸을 만지는 중이면 입력을 끝내지 않음
          closeEditor(true);
        }, 120);
      });
      try { inp.focus(); } catch (e) {}
      setTimeout(function () { try { if (S.editor && S.editor.inp === inp && doc0().activeElement !== inp) inp.focus(); } catch (e) {} }, 0);
    }
    /** 입력칸 미리보기 — 지금 고른 색 · 글꼴 · 크기 그대로 (확정된 글자와 같은 모양). 흰색은 흰 바탕에서 안 보이므로 칸 배경을 어둡게 */
    function isLight(c) { var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); return !!m && (parseInt(m[1], 16) * 0.3 + parseInt(m[2], 16) * 0.59 + parseInt(m[3], 16) * 0.11) > 200; }
    function paintEditor() {
      var ed = S.editor; if (!ed) return; var st = ed.inp.style, px = Math.max(12, ed.sz * S.W);
      st.setProperty('color', ed.color, 'important'); st.setProperty('-webkit-text-fill-color', ed.color, 'important'); st.setProperty('caret-color', ed.color, 'important');
      st.fontFamily = FONTS[ed.font] || FONTS.sans; st.fontSize = px + 'px'; st.background = isLight(ed.color) ? 'rgba(40,40,48,.94)' : 'rgba(255,255,255,.96)';
      ed.box.style.top = (parseFloat(ed.box.style.top) || 0) + 'px';
    }
    function closeEditor(commit) {
      var ed = S.editor; if (!ed || ed.done) return; ed.done = true; S.editor = null;
      var txt = ed.inp.value.replace(/\s+$/, ''); try { ed.box.remove(); } catch (e) {}
      if (!commit || !txt.trim()) { if (commit && ed.existing && !txt.trim()) { var t = take(ed.layer, ed.existing.id); if (t) record({ op: 'del', layer: ed.layer, item: t }); } return; }
      if (ed.existing) {
        if (ed.existing.s === txt && !ed.colorSet && !ed.fontSet && !ed.szSet) return;
        var before = ed.existing, after = Object.assign({}, before, { s: txt.slice(0, 200), ts: Date.now() });
        if (ed.colorSet) after.c = ed.color;
        if (ed.fontSet) { if (ed.font === 'sans') delete after.f; else after.f = ed.font; }
        if (ed.szSet) after.sz = ed.sz;
        put(ed.layer, after); record({ op: 'edit', layer: ed.layer, before: before, after: after });
      } else {
        addLocal(ed.layer, { id: newId(), t: 'text', pg: S.page, c: ed.color, x: r4(ed.x), y: r4(ed.y), sz: ed.sz, s: txt.slice(0, 200), chord: ed.chord ? 1 : undefined, f: ed.font !== 'sans' ? ed.font : undefined });
      }
    }
    /** 글자 도구로 기존 글자를 누르면 고치기 */
    var origUp = onUp;
    onUp = function (e) {
      var c = S.cur;
      if (c && c.kind === 'textpos' && e.type !== 'pointercancel') {
        var px = c.x * S.W, py = c.y * S.H, found = null, fl = null;
        ['mine', 'team'].forEach(function (ly) { if (!S.vis[ly]) return; pageItems(ly, S.page).forEach(function (it) { if (it.t === 'text' && hit(it, px, py, S.W, S.H, 4)) { found = it; fl = ly; } }); });
        if (found) { S.cur = null; try { cv.releasePointerCapture(e.pointerId); } catch (x) {} if (canModify(fl, found)) openEditor(found.x, found.y, found, fl); else say('다른 사람이 쓴 글자는 고칠 수 없습니다.', true); return; }
      }
      origUp(e);
    };
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', function (e) { onUp(e); }); cv.addEventListener('pointercancel', function (e) { onUp(e); });
    cv.addEventListener('contextmenu', function (e) { if (drawing()) e.preventDefault(); });
    /* 아이패드 · 폰: 그리는 동안 글자 선택 · 스크롤 · 확대가 끼어들어 필기가 끊기는 것을 막습니다 (그리는 캔버스에만 적용) */
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (n) {
      cv.addEventListener(n, function (e) { if (drawing() && e.cancelable) e.preventDefault(); }, { passive: false });
    });
    cv.addEventListener('selectstart', function (e) { if (drawing()) e.preventDefault(); });
    cv.addEventListener('dragstart', function (e) { e.preventDefault(); });
    ensureWebFonts(function () { invalidate(); });
    refreshTouch();

    /* ---- 바깥에서 부르는 함수 ---- */
    var api = {
      resize: function (cssW, cssH) {
        S.dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
        S.W = Math.max(1, Math.round(cssW)); S.H = Math.max(1, Math.round(cssH));
        cv.width = Math.round(S.W * S.dpr); cv.height = Math.round(S.H * S.dpr); cv.style.width = S.W + 'px'; cv.style.height = S.H + 'px'; invalidate();
      },
      setPage: function (n) { n = Math.max(1, n | 0); if (n === S.page) { invalidate(); return; } closeEditor(true); S.page = n; S.cur = null; S.sel = null; invalidate(); },      // 같은 쪽을 다시 그릴 때(확대·창 크기)는 쓰던 획을 끊지 않음
      setTool: function (t) { closeEditor(true); S.tool = ['none', 'pen', 'hl', 'select', 'text', 'chord', 'sym', 'fbox', 'eraser'].indexOf(t) >= 0 ? t : 'none'; S.cur = null; if (S.tool !== 'select' && S.tool !== 'text' && S.tool !== 'chord') S.sel = null; changed(); refreshTouch(); invalidate(); },
      setColor: function (c) {
        if (!/^#[0-9a-f]{6}$/i.test(c)) return;
        if (S.tool === 'hl') S.hlColor = c; else S.color = c;
        if (S.editor && S.tool !== 'hl') { S.editor.color = c; S.editor.colorSet = true; paintEditor(); }          // 글자를 치는 도중에 색을 바꿔도 입력칸이 바로 그 색으로
      },
      setFont: function (f) { if (!FONTS[f]) return; S.font = f; if (S.editor) { S.editor.font = f; S.editor.fontSet = true; paintEditor(); } },
      focusEditor: function () { try { if (S.editor) S.editor.inp.focus(); } catch (e) {} },
      setHlColor: function (c) { if (/^#[0-9a-f]{6}$/i.test(c)) S.hlColor = c; },
      setWidth: function (w) { w = +w; if (w > 0) { if (S.tool === 'hl') S.hw = clamp(w, 0.005, 0.06); else S.pw = clamp(w, 0.0008, 0.02); } },
      setSymbol: function (k) { if (SYMBOLS.some(function (s) { return s.k === k; })) S.sym = k; },
      setFboxTag: function (k) { k = String(k || '').slice(0, 8); if (/^[A-Za-z0-9\u3131-\uD7A3]{1,8}$/.test(k)) S.fboxTag = k; }, setFboxSize: function (v) { S.fboxSize = clamp(+v || 0.02, 0.012, 0.04); },
      setSymSize: function (s) { S.symSize = clamp(+s || 0.032, 0.012, 0.12); }, setTextSize: function (s) { S.textSize = clamp(+s || 0.024, 0.012, 0.08); if (S.editor) { S.editor.sz = S.textSize; S.editor.szSet = true; paintEditor(); } },
      setLayer: function (ly) { if (ly === 'team' || ly === 'mine') S.layer = ly; },
      setVisible: function (ly, on) { S.vis[ly] = !!on; invalidate(); },
      setPenMode: function (m) { S.penMode = m === 'always' || m === 'off' ? m : 'auto'; refreshTouch(); },
      setStraight: function (b) { S.straight = !!b; },
      setPerms: function (me, canEdit) { S.me = me || S.me; S.canEdit = !!canEdit; },
      setItems: function (ly, items) { var m = new Map(); (items || []).forEach(function (i) { if (i && i.id) m.set(i.id, i); }); S.layers[ly] = m; S.hist = S.hist.filter(function (h) { return h.layer !== ly; }); invalidate(); changed(); },
      remoteAdd: function (ly, it) { S.layers[ly].set(it.id, it); S.live.delete(it.id); invalidate(); changed(); },
      remoteDel: function (ly, id) { S.layers[ly].delete(id); invalidate(); changed(); },
      remoteClear: function (ly, ids) { (ids || []).forEach(function (id) { S.layers[ly].delete(id); }); invalidate(); changed(); },
      remoteLive: function (m) { if (!m || !m.id) return; var old = S.live.get(m.id); S.live.set(m.id, { id: m.id, t: m.t, pg: m.pg, c: m.c, w: m.w, p: m.p, by: m.by, at: Date.now() }); invalidate(); },
      undo: undo, redo: redo,
      /** 그리던 획 · 옮기던 항목을 저장하지 않고 버림 (손가락 두 개로 확대를 시작할 때) */
      cancelCurrent: function () { var c = S.cur; if (!c) return false; S.cur = null; if (c.kind === 'move' && S.layers[c.layer]) S.layers[c.layer].set(c.orig.id, c.orig); invalidate(); return true; },
      /** 선택한 항목 (없으면 null) — 화면 도구줄이 크기 · 글꼴 칸을 맞추는 데 씁니다 */
      selected: function () { var it = selItem(); return it ? { layer: S.sel.layer, id: it.id, t: it.t, sz: it.sz, f: it.f, c: it.c, s: it.s, chord: it.chord, canModify: canModify(S.sel.layer, it) } : null; },
      select: function (layer, id) { if (S.layers[layer] && S.layers[layer].get(id)) { S.sel = { layer: layer, id: id }; invalidate(); changed(); return true; } return false; },
      deselect: function () { if (S.sel) { S.sel = null; invalidate(); changed(); } },
      deleteSelected: function () {
        var it = selItem(); if (!it) return false;
        if (!canModify(S.sel.layer, it)) { say('다른 사람이 쓴 필기는 지울 수 없습니다.', true); return false; }
        var ly = S.sel.layer, t = take(ly, it.id); S.sel = null; if (t) record({ op: 'del', layer: ly, item: t }); return !!t;
      },
      /** 선택 항목 고치기 — patch: { sz, f, c } 중 필요한 것만. 되돌리기 가능 · 같은 자리에서 실시간 전파 */
      editSelected: function (patch) {
        var it = selItem(); if (!it || !patch) return false;
        var ly = S.sel.layer; if (!canModify(ly, it)) { say('다른 사람이 쓴 필기는 고칠 수 없습니다.', true); return false; }
        var after = Object.assign({}, it, { ts: Date.now() }), rng = SZ_RANGE[it.t] || SZ_RANGE.text, ch = false;
        if (patch.sz != null && isFinite(+patch.sz)) { var nz = r4(clamp(+patch.sz, rng[0], rng[1])); if (nz !== it.sz) { after.sz = nz; ch = true; } }
        if (patch.f != null && it.t === 'text' && FONTS[patch.f]) { if (patch.f === 'sans') { if (after.f != null) { delete after.f; ch = true; } } else if (after.f !== patch.f) { after.f = patch.f; ch = true; } }
        if (patch.c != null && /^#[0-9a-f]{6}$/i.test(patch.c) && after.c !== patch.c) { after.c = patch.c; ch = true; }
        if (!ch) return false;
        put(ly, after); record({ op: 'edit', layer: ly, before: it, after: after }); return true;
      },
      /** 손가락으로 그려지는 상태인가 (펜만 그림 모드에서는 손가락이 화면 밀기 · 넘기기 · 확대에 쓰임) */
      fingerDraws: function () { return !(S.penMode === 'always' || (S.penMode === 'auto' && S.sawPen)); },
      clearPage: function (ly, all) {
        var ids = [], gone = [];
        pageItems(ly, S.page).forEach(function (it) { if (mine(it) || ly === 'mine' || (all && S.canEdit)) { ids.push(it.id); gone.push(it); } });
        if (!gone.length) { say('현재 페이지에 지울 필기가 없습니다.'); return 0; }
        gone.forEach(function (it) { S.layers[ly].delete(it.id); });
        record({ op: 'clear', layer: ly, items: gone }); invalidate(); changed();
        try { o.onClear && o.onClear(ly, ids, S.page, !!all); } catch (e) {}
        return gone.length;
      },
      items: function (ly) { return Array.from(S.layers[ly].values()); },
      count: function (pg) { var n = 0; ['team', 'mine'].forEach(function (ly) { S.layers[ly].forEach(function (i) { if (pg == null || i.pg === pg) n++; }); }); return n; },
      drawPage: drawPage,
      state: function () { return { fboxTag: S.fboxTag, cur: S.cur ? S.cur.kind : null, ed: !!S.editor, tool: S.tool, sel: S.sel ? { layer: S.sel.layer, id: S.sel.id } : null, layer: S.layer, page: S.page, color: S.color, font: S.font, textSize: S.textSize, symSize: S.symSize, edColor: S.editor ? S.editor.color : null, sawPen: S.sawPen, canUndo: S.hist.length > 0, canRedo: S.redo.length > 0, vis: Object.assign({}, S.vis), penMode: S.penMode }; },
      redraw: redraw, closeEditor: function () { closeEditor(true); },
      destroy: function () { S.dead = true; closeEditor(false); try { cv.remove(); } catch (e) {} }
    };
    return api;
  }

  return { create: create, newId: newId, simplify: simplify, limitPoints: limitPoints, drawItem: drawItem, hit: hit, symBox: symBox,
    SYMBOLS: SYMBOLS, FBOX_TAGS: FBOX_TAGS, FBOX_NAMES: FBOX_NAMES, fboxLabel: fboxLabel, PALETTE: PALETTE, COLOR_NAMES: COLOR_NAMES, FONTS: FONTS, FONT_KEYS: FONT_KEYS, FONT_NAMES: FONT_NAMES, GLYPHS: GLYPHS, HL_COLORS: HL_COLORS, STRETCH: STRETCH, CHORD_KEYS: CHORD_KEYS };
}));
