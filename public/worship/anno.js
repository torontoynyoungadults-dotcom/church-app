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

  var PALETTE = ['#ff5a1f', '#e11d48', '#2563eb', '#059669', '#111111', '#7c3aed', '#f59e0b'];
  var HL_COLORS = ['#ffe14d', '#7dff8a', '#ff9ad5', '#7fd4ff', '#ffb066'];
  var STRETCH = { tie: 1, cresc: 1, decresc: 1 };

  /** 기호 목록 (서버 SYMBOLS 와 동일해야 함 — 시험에서 비교) */
  var SYMBOLS = [
    { k: 'sharp', n: '샵 ♯' }, { k: 'flat', n: '플랫 ♭' }, { k: 'natural', n: '제자리 ♮' }, { k: 'fermata', n: '늘임표' },
    { k: 'segno', n: '세뇨' }, { k: 'coda', n: '코다' }, { k: 'repeatStart', n: '도돌이 시작' }, { k: 'repeatEnd', n: '도돌이 끝' },
    { k: 'breath', n: '숨표' }, { k: 'cresc', n: '크레센도' }, { k: 'decresc', n: '데크레센도' }, { k: 'accent', n: '악센트' },
    { k: 'staccato', n: '스타카토' }, { k: 'tenuto', n: '테누토' }, { k: 'tie', n: '이음줄' }, { k: 'arrowDown', n: '↓ 화살표' },
    { k: 'arrowUp', n: '↑ 화살표' }, { k: 'star', n: '별' }, { k: 'check', n: '체크' }, { k: 'circle', n: '동그라미' }, { k: 'box', n: '네모' },
    { k: 'dyn:pp', n: 'pp' }, { k: 'dyn:p', n: 'p' }, { k: 'dyn:mp', n: 'mp' }, { k: 'dyn:mf', n: 'mf' }, { k: 'dyn:f', n: 'f' }, { k: 'dyn:ff', n: 'ff' },
    { k: 'dyn:dc', n: 'D.C.' }, { k: 'dyn:ds', n: 'D.S.' }, { k: 'dyn:tocoda', n: 'To Coda' }, { k: 'dyn:fine', n: 'Fine' }
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
    var half = k.indexOf('dyn:') === 0 ? { w: s * (DYN_TEXT[k.slice(4)].length * .3 + .2), h: s * .5 } : { w: s * .62, h: s * .55 };
    return { x1: x - half.w, y1: y - half.h, x2: x + half.w, y2: y + half.h };
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
        c.font = (it.chord ? '800 ' : '600 ') + px + 'px "Segoe UI","Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif'; c.textBaseline = 'alphabetic';
        c.lineWidth = Math.max(2, px * 0.2); c.strokeStyle = 'rgba(255,255,255,.9)'; c.strokeText(it.s || '', 0, 0);
        c.fillStyle = it.c || '#ff5a1f'; c.fillText(it.s || '', 0, 0);
      } else if (it.t === 'sym') {
        var k = it.k, s = Math.max(8, (it.sz || 0.03) * W);
        c.translate(it.x * W, it.y * H); if (it.rot) c.rotate(it.rot * Math.PI / 180);
        if (k.indexOf('dyn:') === 0) {
          c.font = 'italic 700 ' + s * 0.85 + 'px "Times New Roman",Georgia,serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
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
      if (typeof document !== 'undefined') { _meas = _meas || document.createElement('canvas').getContext('2d'); _meas.font = (it.chord ? '800 ' : '600 ') + px + 'px sans-serif'; return _meas.measureText(s).width; }
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
      pw: 0.003, hw: 0.02, sym: 'sharp', symSize: 0.032, textSize: 0.024, layer: 'team', W: 1, H: 1, dpr: 1, cur: null, live: new Map(), hist: [], redo: [],
      sawPen: false, penMode: 'auto', straight: false, me: o.me || '', canEdit: !!o.canEdit, editor: null, raf: 0, dead: false, liveTimer: 0 };
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
      } else if (S.cur && S.cur.kind === 'sym') {
        drawItem(ctx, S.cur.item, S.W, S.H, { alpha: 0.7 });
      }
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
      cv.style.touchAction = !drawing() ? 'auto' : lockTouch ? 'pan-x pan-y pinch-zoom' : 'none';
      cv.style.cursor = !drawing() ? '' : S.tool === 'eraser' ? 'cell' : S.tool === 'text' || S.tool === 'chord' ? 'text' : 'crosshair';
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
      if (S.tool === 'pen' || S.tool === 'hl') {
        S.cur = { kind: S.tool, id: newId(), ptr: e.pointerId, p: [p.x, p.y], color: activeColor(), w: S.tool === 'hl' ? S.hw : S.pw, sent: 0, fresh: true, straight: S.tool === 'hl' && S.straight, touch: touch };
        invalidate();
      } else if (S.tool === 'eraser') { S.cur = { kind: 'erase', ptr: e.pointerId, touch: touch }; eraseAt(p.x * S.W, p.y * S.H); }
      else if (S.tool === 'sym') {
        var stretch = !!STRETCH[S.sym];
        S.cur = { kind: 'sym', ptr: e.pointerId, x0: p.x, y0: p.y, stretch: stretch, item: { id: newId(), t: 'sym', pg: S.page, c: S.color, x: r4(p.x), y: r4(p.y), sz: S.symSize, k: S.sym, w2: stretch ? 0.08 : undefined } };
        invalidate();
      } else if (S.tool === 'text' || S.tool === 'chord') { S.cur = { kind: 'textpos', ptr: e.pointerId, x: p.x, y: p.y }; }
    }
    function onMove(e) {
      var c = S.cur; if (!c || e.pointerId !== c.ptr) return;
      var list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e]; if (!list.length) list = [e];
      if (c.kind === 'pen' || c.kind === 'hl') {
        for (var i = 0; i < list.length; i++) {
          var q = norm(list[i]), n = c.p.length;
          if (n >= 6000) break;
          if (Math.abs(q.x - c.p[n - 2]) + Math.abs(q.y - c.p[n - 1]) < 0.0004) continue;
          c.p.push(q.x, q.y);
        }
        sendLive(c); invalidate();
      } else if (c.kind === 'erase') { list.forEach(function (ev) { var q = norm(ev); eraseAt(q.x * S.W, q.y * S.H); }); }
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
      if (e.type === 'pointercancel') { invalidate(); return; }
      if (c.kind === 'pen' || c.kind === 'hl') {
        var p = c.p; if (p.length < 4) p = [p[0], p[1], p[0] + 0.0005, p[1]];
        if (c.straight && p.length > 4) p = p.slice(0, 2).concat(p.slice(-2));
        p = limitPoints(p, 1400);
        var it = { id: c.id, t: c.kind, pg: S.page, c: c.color, w: r4(clamp(c.w, 0.0005, 0.06)), p: p };
        if (c.straight) it.line = 1;
        addLocal(S.layer, it);
      } else if (c.kind === 'sym') { var s = c.item; if (s.w2 == null) delete s.w2; addLocal(S.layer, s); }
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
      inp.style.fontSize = px + 'px'; inp.style.color = existing ? existing.c : S.color; inp.value = existing ? existing.s : '';
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
      S.editor = { box: box, inp: inp, x: x, y: y, chord: !!chord, existing: existing || null, layer: layerOf || S.layer, done: false };
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); closeEditor(true); } else if (ev.key === 'Escape') { ev.preventDefault(); closeEditor(false); } ev.stopPropagation(); });
      inp.addEventListener('blur', function () { setTimeout(function () { if (S.editor && S.editor.inp === inp) closeEditor(true); }, 120); });
      try { inp.focus(); } catch (e) {}
      setTimeout(function () { try { if (S.editor && S.editor.inp === inp && doc0().activeElement !== inp) inp.focus(); } catch (e) {} }, 0);
    }
    function closeEditor(commit) {
      var ed = S.editor; if (!ed || ed.done) return; ed.done = true; S.editor = null;
      var txt = ed.inp.value.replace(/\s+$/, ''); try { ed.box.remove(); } catch (e) {}
      if (!commit || !txt.trim()) { if (commit && ed.existing && !txt.trim()) { var t = take(ed.layer, ed.existing.id); if (t) record({ op: 'del', layer: ed.layer, item: t }); } return; }
      if (ed.existing) {
        if (ed.existing.s === txt) return;
        var before = ed.existing, after = Object.assign({}, before, { s: txt.slice(0, 200), ts: Date.now() });
        put(ed.layer, after); record({ op: 'edit', layer: ed.layer, before: before, after: after });
      } else {
        addLocal(ed.layer, { id: newId(), t: 'text', pg: S.page, c: S.color, x: r4(ed.x), y: r4(ed.y), sz: S.textSize, s: txt.slice(0, 200), chord: ed.chord ? 1 : undefined });
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
    refreshTouch();

    /* ---- 바깥에서 부르는 함수 ---- */
    var api = {
      resize: function (cssW, cssH) {
        S.dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
        S.W = Math.max(1, Math.round(cssW)); S.H = Math.max(1, Math.round(cssH));
        cv.width = Math.round(S.W * S.dpr); cv.height = Math.round(S.H * S.dpr); cv.style.width = S.W + 'px'; cv.style.height = S.H + 'px'; invalidate();
      },
      setPage: function (n) { n = Math.max(1, n | 0); if (n === S.page) { invalidate(); return; } closeEditor(true); S.page = n; S.cur = null; invalidate(); },      // 같은 쪽을 다시 그릴 때(확대·창 크기)는 쓰던 획을 끊지 않음
      setTool: function (t) { closeEditor(true); S.tool = ['none', 'pen', 'hl', 'text', 'chord', 'sym', 'eraser'].indexOf(t) >= 0 ? t : 'none'; S.cur = null; refreshTouch(); invalidate(); },
      setColor: function (c) { if (/^#[0-9a-f]{6}$/i.test(c)) { if (S.tool === 'hl') S.hlColor = c; else S.color = c; } },
      setHlColor: function (c) { if (/^#[0-9a-f]{6}$/i.test(c)) S.hlColor = c; },
      setWidth: function (w) { w = +w; if (w > 0) { if (S.tool === 'hl') S.hw = clamp(w, 0.005, 0.06); else S.pw = clamp(w, 0.0008, 0.02); } },
      setSymbol: function (k) { if (SYMBOLS.some(function (s) { return s.k === k; })) S.sym = k; },
      setSymSize: function (s) { S.symSize = clamp(+s || 0.032, 0.012, 0.12); }, setTextSize: function (s) { S.textSize = clamp(+s || 0.024, 0.012, 0.08); },
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
      clearPage: function (ly, all) {
        var ids = [], gone = [];
        pageItems(ly, S.page).forEach(function (it) { if (mine(it) || ly === 'mine' || (all && S.canEdit)) { ids.push(it.id); gone.push(it); } });
        if (!gone.length) { say('이 쪽에 지울 필기가 없습니다.'); return 0; }
        gone.forEach(function (it) { S.layers[ly].delete(it.id); });
        record({ op: 'clear', layer: ly, items: gone }); invalidate(); changed();
        try { o.onClear && o.onClear(ly, ids, S.page, !!all); } catch (e) {}
        return gone.length;
      },
      items: function (ly) { return Array.from(S.layers[ly].values()); },
      count: function (pg) { var n = 0; ['team', 'mine'].forEach(function (ly) { S.layers[ly].forEach(function (i) { if (pg == null || i.pg === pg) n++; }); }); return n; },
      drawPage: drawPage,
      state: function () { return { cur: S.cur ? S.cur.kind : null, ed: !!S.editor, tool: S.tool, layer: S.layer, page: S.page, color: S.color, sawPen: S.sawPen, canUndo: S.hist.length > 0, canRedo: S.redo.length > 0, vis: Object.assign({}, S.vis), penMode: S.penMode }; },
      redraw: redraw, closeEditor: function () { closeEditor(true); },
      destroy: function () { S.dead = true; closeEditor(false); try { cv.remove(); } catch (e) {} }
    };
    return api;
  }

  return { create: create, newId: newId, simplify: simplify, limitPoints: limitPoints, drawItem: drawItem, hit: hit, symBox: symBox,
    SYMBOLS: SYMBOLS, PALETTE: PALETTE, HL_COLORS: HL_COLORS, STRETCH: STRETCH, CHORD_KEYS: CHORD_KEYS };
}));
