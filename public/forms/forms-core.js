/* =====================================================================
   forms-core.js — 신청서 공용 부품 (Step 6)
   ---------------------------------------------------------------------
   · 관리자 화면(views/Forms.html)과 신청자 화면(views/Portal.html)이 같이 씁니다.
   · 전역 하나만 만듭니다: window.FormsCore  (Node 에서는 module.exports)
   · 서버(logic/forms2.js)와 약속이 같습니다:
       - "기타" 답은 문자열 "기타: 내용" 으로 저장됩니다 (예전 결과 · 엑셀 화면이 그대로 읽음)
       - 별점은 1..scale 의 정수
       - 안내글 서식은 <b> · <mark class="hl"> · <br> 만 남깁니다
   · 성능: 여러 노드를 한 번에 붙일 때는 DocumentFragment 로 만들어 한 번만 꽂습니다.
   ===================================================================== */
(function (root) {
  'use strict';

  var OTHER_PREFIX = '기타: ';
  var OTHER_DEFAULT = '기타 (직접 입력)';
  var FACES = ['😡', '🙁', '😐', '🙂', '😍'];
  var FACE_WORDS = ['매우 불만족', '불만족', '보통', '만족', '매우 만족'];

  /* ---------------------------------------------------------- 작은 도구 */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isOtherValue(v) { return typeof v === 'string' && v.indexOf('기타:') === 0; }
  function otherText(v) { return isOtherValue(v) ? v.slice(3).replace(/^\s+/, '') : ''; }
  function otherValue(text) { return OTHER_PREFIX + String(text == null ? '' : text); }
  function hasOther(q) { return !!(q && q.other && (q.type === 'choice' || q.type === 'checks')); }
  function otherLabel(q) { return (q && q.otherLabel) || OTHER_DEFAULT; }

  /* ---------------------------------------------------------- 별점 설정 (서버 별점설정2_ 와 같은 규칙) */
  function ratingConfig(q) {
    var scale = Math.round(Number(q && q.scale));
    if (!isFinite(scale) || scale < 3) scale = (q && q.scale) ? 3 : 5;
    if (scale > 10) scale = 10;
    var variant = q && q.variant;
    if (variant !== 'star' && variant !== 'number' && variant !== 'face') variant = 'star';
    if (variant === 'face' && scale !== 5) variant = 'number';
    return { scale: scale, variant: variant, low: (q && q.lowLabel) || '', high: (q && q.highLabel) || '' };
  }

  /* ---------------------------------------------------------- 안내글 정리 (굵게 · 주황 강조 · 줄바꿈만) */
  /* 서버가 이미 한 번 걸러서 저장하지만, 화면에 꽂기 직전에 한 번 더 걸러 냅니다 (이중 안전장치).
     DOMParser 로 읽으면 스크립트가 실행되지 않고 이미지도 불러오지 않습니다. */
  var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, MATH: 1, TITLE: 1, HEAD: 1, LINK: 1, META: 1, TEXTAREA: 1, SELECT: 1, BUTTON: 1 };
  var BLOCK = { DIV: 1, P: 1, LI: 1, UL: 1, OL: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, PRE: 1, TR: 1, SECTION: 1, ARTICLE: 1 };

  function tokensFromHtml(html) {
    var src = html == null ? '' : String(html);
    var doc = null;
    if (typeof DOMParser !== 'undefined') {
      try { doc = new DOMParser().parseFromString('<!doctype html><body>' + src, 'text/html'); } catch (e) { doc = null; }
    }
    if (!doc || !doc.body) return null;
    var toks = [];
    function newline() { if (toks.length && toks[toks.length - 1].k !== 'br') toks.push({ k: 'br' }); }
    function walk(node, b, h) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          var s = n.nodeValue.replace(/ /g, ' ');
          if (s) toks.push({ k: 't', s: s, b: b, h: h });
        } else if (n.nodeType === 1) {
          var tag = n.nodeName.toUpperCase();
          if (DROP[tag]) continue;
          if (tag === 'BR') { toks.push({ k: 'br' }); continue; }
          var nb = b, nh = h;
          if (tag === 'B' || tag === 'STRONG') nb = true;
          else if (tag === 'MARK') { if (/(^|\s)hl(\s|$)/.test(n.getAttribute('class') || '')) nh = true; }
          else if (tag === 'SPAN') {
            var st = (n.getAttribute('style') || '').toLowerCase();
            var fw = /font-weight\s*:\s*(bold|[6-9]00)/.test(st);
            if (fw) nb = true;
          }
          var blk = !!BLOCK[tag];
          if (blk) newline();
          walk(n, nb, nh);
          if (blk) newline();
        }
      }
    }
    walk(doc.body, false, false);
    /* 앞뒤 줄바꿈 떼고, 세 줄 이상 연속 빈 줄은 두 줄로 */
    while (toks.length && toks[0].k === 'br') toks.shift();
    while (toks.length && toks[toks.length - 1].k === 'br') toks.pop();
    var out = [], run = 0;
    toks.forEach(function (t) {
      if (t.k === 'br') { run++; if (run <= 2) out.push(t); } else { run = 0; out.push(t); }
    });
    return out;
  }

  function tokensToHtml(toks) {
    var out = '', i = 0;
    while (i < toks.length) {
      var t = toks[i];
      if (t.k === 'br') { out += '<br>'; i++; continue; }
      var s = t.s, b = t.b, h = t.h;
      i++;
      while (i < toks.length && toks[i].k === 't' && toks[i].b === b && toks[i].h === h) { s += toks[i].s; i++; }
      var seg = esc(s);
      if (b) seg = '<b>' + seg + '</b>';
      if (h) seg = '<mark class="hl">' + seg + '</mark>';
      out += seg;
    }
    return out;
  }
  function tokensToText(toks) {
    return toks.map(function (t) { return t.k === 'br' ? '\n' : t.s; }).join('');
  }

  /* 글만 있는 옛 안내글(desc)도 같은 길로: 줄바꿈 → <br> */
  function plainToHtml(text) {
    return esc(String(text == null ? '' : text).replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');
  }

  /** 안전한 안내글 HTML 로 정리 (허용: b · mark.hl · br) */
  function safeHtml(html) {
    var toks = tokensFromHtml(html);
    if (!toks) return plainToHtml(String(html || '').replace(/<[^>]*>/g, ''));   // DOMParser 가 없는 환경: 태그를 모두 글로 취급
    return tokensToHtml(toks);
  }
  /** 서식을 뺀 글 */
  function htmlToText(html) {
    var toks = tokensFromHtml(html);
    if (!toks) return String(html || '').replace(/<[^>]*>/g, '');
    return tokensToText(toks);
  }
  /** 서식이 하나라도 있는가 */
  function hasFormat(html) {
    var toks = tokensFromHtml(html);
    return !!(toks && toks.some(function (t) { return t.k === 't' && (t.b || t.h); }));
  }

  /* ---------------------------------------------------------- 답 다듬기 (예전 답 · 유형을 바꾼 뒤의 답을 견디게) */
  function coerceAnswer(q, v) {
    var t = q && q.type;
    if (t === 'checks') {
      var arr = Array.isArray(v) ? v.slice() : (v == null || v === '' ? [] : [v]);
      return arr.map(function (x) { return String(x); }).filter(function (x) { return x !== ''; });
    }
    if (t === 'rating') {
      var cfg = ratingConfig(q), n = Math.round(Number(v));
      return (v === '' || v == null || !isFinite(n) || n < 1 || n > cfg.scale) ? '' : n;
    }
    if (t === 'agree') return !!v;
    if (t === 'file') return Array.isArray(v) ? v.slice() : [];
    if (v == null) return '';
    if (Array.isArray(v)) return v.length ? String(v[0]) : '';    // 여러 개 → 한 개 유형으로 바뀐 경우 첫 값만
    return (t === 'number') ? String(v) : String(v);
  }

  /* ---------------------------------------------------------- 조건부 표시 (Step 7)
     서버(logic/forms3.js 의 조건맞나3_ · 문항보임3_)와 똑같은 규칙입니다. scripts/test-step7.js 가 같은 표로 두 쪽을 대조합니다.
       showIf = { mode: 'all' | 'any', rules: [ { q, op, v } ] }
       op: eq ne has nothas filled empty gte lte   ·   v === '__other__' 는 "기타(직접 입력)" 를 고른 모든 답
     숨겨진 문항은 답이 없는 것으로 보고, 그 문항을 조건으로 쓰는 뒤 문항도 연쇄로 계산합니다. */
  var RULE_OPS = ['eq', 'ne', 'has', 'nothas', 'filled', 'empty', 'gte', 'lte'];
  var OTHER_ANY = '__other__';

  function condVals(a) {
    if (a == null || a === '' || a === false) return [];
    if (Array.isArray(a)) {
      return a.map(function (x) { return (x && typeof x === 'object') ? String(x.name || x.id || '') : String(x == null ? '' : x); })
        .filter(function (x) { return x !== ''; });
    }
    if (a === true) return ['true'];
    if (typeof a === 'object') return [String(a.name || a.id || '')].filter(function (x) { return x !== ''; });
    var s = String(a);
    return s === '' ? [] : [s];
  }
  function condSame(x, v) {
    if (v === OTHER_ANY) return String(x).indexOf('기타:') === 0;
    return String(x).trim() === String(v).trim();
  }
  function ruleMatch(rule, a) {
    var vals = condVals(a), op = rule.op, v = rule.v, i;
    if (op === 'filled') return vals.length > 0;
    if (op === 'empty') return vals.length === 0;
    if (op === 'eq' || op === 'has') { for (i = 0; i < vals.length; i++) if (condSame(vals[i], v)) return true; return false; }
    if (op === 'ne' || op === 'nothas') { for (i = 0; i < vals.length; i++) if (condSame(vals[i], v)) return false; return true; }
    if (op === 'gte' || op === 'lte') {
      if (!vals.length) return false;
      var n = Number(vals[0]), t = Number(v);
      if (!isFinite(n) || !isFinite(t)) return false;
      return op === 'gte' ? n >= t : n <= t;
    }
    return true;
  }
  function condMatch(cond, answers) {
    if (!cond || !cond.rules || !cond.rules.length) return true;
    var any = cond.mode === 'any', hit;
    for (var i = 0; i < cond.rules.length; i++) {
      hit = ruleMatch(cond.rules[i], answers[cond.rules[i].q]);
      if (any && hit) return true;
      if (!any && !hit) return false;
    }
    return !any;
  }
  /** 서버가 저장할 때 다듬는 모양(글은 앞뒤 공백 없이, 숫자는 숫자 글로, 별점은 정수)으로 맞춘 "비교용 답" */
  function effAnswer(q, v) {
    var t = q.type;
    if (t === 'checks') return coerceAnswer(q, v).map(function (x) { return String(x).trim(); }).filter(function (x) { return x !== ''; });
    if (t === 'rating') return coerceAnswer(q, v);
    if (t === 'agree') return !!v;
    if (t === 'file') return Array.isArray(v) ? v : [];
    if (t === 'number') { var s = String(v == null ? '' : v).trim(); return (s !== '' && isFinite(Number(s))) ? String(Number(s)) : ''; }
    return v == null ? '' : String(v).trim();
  }
  /** 문항 순서대로 보이는지 계산 → { 문항id: true|false } (안내글 · 답 없는 문항도 포함) */
  function visibility(questions, answers) {
    var eff = {}, map = {};
    (questions || []).forEach(function (q) {
      var vis = condMatch(q.showIf, eff);
      map[q.id] = vis;
      if (vis && q.type !== 'section') eff[q.id] = effAnswer(q, answers ? answers[q.id] : undefined);
    });
    return map;
  }

  /* ---------------------------------------------------------- 검사 (서버가 최종 판단, 여기는 즉시 안내용) */
  function validate(q, v) {
    if (!q || q.type === 'section') return '';
    var t = q.type, label = '"' + (q.label || '') + '"';
    if (t === 'choice') {
      if (q.req && !v) return label + ' 을(를) 골라주세요.';
      if (isOtherValue(v) && !otherText(v).trim()) return label + ' 의 \'기타\' 내용을 입력해주세요.';
      return '';
    }
    if (t === 'checks') {
      var a = Array.isArray(v) ? v : [];
      if (q.req && !a.length) return label + ' 을(를) 골라주세요.';
      for (var i = 0; i < a.length; i++) if (isOtherValue(a[i]) && !otherText(a[i]).trim()) return label + ' 의 \'기타\' 내용을 입력해주세요.';
      if (q.min && a.length < Number(q.min)) return label + ' 은 ' + q.min + '개 이상 골라주세요.';
      if (q.max && a.length > Number(q.max)) return label + ' 은 ' + q.max + '개까지 고를 수 있습니다.';
      return '';
    }
    if (t === 'rating') {
      if (q.req && !v) return label + ' 에 점수를 매겨주세요.';
      return '';
    }
    return '';
  }

  /* ---------------------------------------------------------- 신청자 화면 부품 */
  var UID = 0;

  function h(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }

  /**
   * 한 문항을 host 안에 그립니다. (choice · checks · rating)
   *   ctx = { value, onChange(v), disabled, onInvalid }
   * 진짜 <input type=radio|checkbox> 를 쓰므로 키보드 · 스크린리더가 그대로 동작합니다.
   * 돌려주는 값: { get(), set(v), destroy() }
   */
  function mountQuestion(host, q, ctx) {
    ctx = ctx || {};
    var uid = 'fx' + (++UID);
    var state = coerceAnswer(q, ctx.value);
    var disabled = !!ctx.disabled;
    var otherInput = null, otherWrap = null, otherBox = null;

    function emit() { if (typeof ctx.onChange === 'function') ctx.onChange(state); }

    var frag = document.createDocumentFragment();
    var head = h('div', 'fx-head');
    var lab = h('div', 'fx-q', { id: uid + '_l' });
    lab.textContent = q.label || '';
    if (q.req) { var star = h('span', 'req'); star.textContent = ' *'; lab.appendChild(star); }
    head.appendChild(lab);
    if (q.help) { var hp = h('p', 'fx-help'); hp.textContent = q.help; head.appendChild(hp); }
    frag.appendChild(head);

    var group;
    if (q.type === 'rating') group = buildRating();
    else group = buildChoices(q.type === 'checks');
    frag.appendChild(group);
    var err = h('p', 'fx-err', { role: 'alert' });
    err.hidden = true;
    frag.appendChild(err);

    host.textContent = '';
    host.appendChild(frag);

    /* ---------- 고르기 / 여러 개 고르기 ---------- */
    function buildChoices(multi) {
      var box = h('div', 'fx-group' + (multi ? ' multi' : ''), {
        role: multi ? 'group' : 'radiogroup', 'aria-labelledby': uid + '_l'
      });
      var list = h('div', 'fx-list');
      var f = document.createDocumentFragment();
      var opts = (q.opts || []).filter(function (o) { return String(o).trim() !== ''; });
      opts.forEach(function (o, j) { f.appendChild(optRow(o, j, false)); });
      if (hasOther(q)) f.appendChild(optRow(otherLabel(q), opts.length, true));
      list.appendChild(f);
      box.appendChild(list);

      if (hasOther(q)) {
        otherWrap = h('div', 'fx-other');
        otherInput = h('input', 'fx-otext', { type: 'text', maxlength: '100', placeholder: '직접 입력해주세요', 'aria-label': otherLabel(q) + ' 내용' });
        otherWrap.appendChild(otherInput);
        box.appendChild(otherWrap);
        otherInput.addEventListener('input', function () {
          var val = otherValue(otherInput.value);
          if (multi) {
            state = state.filter(function (x) { return !isOtherValue(x); });
            state.push(val);
          } else state = val;
          clearErr(); emit();
        });
        otherInput.disabled = disabled;
      }
      return box;
    }

    function optRow(text, j, isOther) {
      var lb = h('label', 'fx-opt' + (isOther ? ' is-other' : ''));
      var inp = h('input', '', { type: q.type === 'checks' ? 'checkbox' : 'radio', name: uid, value: isOther ? '__other__' : text });
      inp.disabled = disabled;
      var mark = h('span', 'fx-mark', { 'aria-hidden': 'true' });
      var tx = h('span', 'fx-txt'); tx.textContent = text;
      lb.appendChild(inp); lb.appendChild(mark); lb.appendChild(tx);
      var multi = q.type === 'checks';

      if (multi) {
        inp.addEventListener('change', function () {
          if (isOther) {
            state = state.filter(function (x) { return !isOtherValue(x); });
            if (inp.checked) state.push(otherValue(otherInput ? otherInput.value : ''));
            paintOther(inp.checked, true);
          } else {
            var i = state.indexOf(text);
            if (inp.checked && i === -1) state.push(text);
            if (!inp.checked && i !== -1) state.splice(i, 1);
          }
          clearErr(); emit();
        });
      } else {
        inp.addEventListener('change', function () {
          if (!inp.checked) return;
          state = isOther ? otherValue(otherInput ? otherInput.value : '') : text;
          paintOther(isOther, isOther);
          clearErr(); emit();
        });
        /* 이미 고른 것을 다시 누르면 해제 (예전 버튼 방식과 같은 동작) */
        inp.addEventListener('click', function () {
          var was = isOther ? isOtherValue(state) : state === text;
          if (!was || disabled) return;
          /* change 는 이미 골라진 라디오에는 안 뜨므로 여기서 직접 해제 */
          setTimeout(function () {
            inp.checked = false; state = ''; paintOther(false, false); clearErr(); emit();
          }, 0);
        });
      }
      return lb;
    }

    function paintOther(show, focus) {
      if (!otherWrap) return;
      otherWrap.classList.toggle('open', !!show);
      if (show && focus && otherInput) { try { otherInput.focus({ preventScroll: true }); } catch (e) { otherInput.focus(); } }
    }

    /* ---------- 별점 · 만족도 ---------- */
    function buildRating() {
      var cfg = ratingConfig(q);
      var box = h('div', 'fx-group fx-rating v-' + cfg.variant, { role: 'radiogroup', 'aria-labelledby': uid + '_l' });
      var row = h('div', 'fx-rrow');
      var f = document.createDocumentFragment();
      for (var n = 1; n <= cfg.scale; n++) f.appendChild(rateItem(n, cfg));
      row.appendChild(f);
      box.appendChild(row);
      if (cfg.low || cfg.high) {
        var ends = h('div', 'fx-rends');
        var a = h('span'); a.textContent = cfg.low; var b = h('span'); b.textContent = cfg.high;
        ends.appendChild(a); ends.appendChild(b);
        box.appendChild(ends);
      }
      return box;
    }
    function rateItem(n, cfg) {
      var lb = h('label', 'fx-r');
      var inp = h('input', '', { type: 'radio', name: uid, value: String(n) });
      inp.disabled = disabled;
      var g = h('span', 'fx-rg', { 'aria-hidden': 'true' });
      var label;
      if (cfg.variant === 'star') { g.textContent = '★'; label = n + '점'; }
      else if (cfg.variant === 'face') { g.textContent = FACES[n - 1]; label = FACE_WORDS[n - 1]; }
      else { g.textContent = String(n); label = n + '점'; }
      inp.setAttribute('aria-label', label);
      lb.title = label;
      lb.appendChild(inp); lb.appendChild(g);
      inp.addEventListener('change', function () {
        if (!inp.checked) return;
        state = n; paintRating(); clearErr(); emit();
      });
      inp.addEventListener('click', function () {
        if (state !== n || disabled) return;
        setTimeout(function () { inp.checked = false; state = ''; paintRating(); clearErr(); emit(); }, 0);
      });
      return lb;
    }
    function paintRating() {
      var items = host.querySelectorAll('.fx-r');
      for (var i = 0; i < items.length; i++) {
        var n = i + 1;
        var on = state !== '' && (ratingConfig(q).variant === 'star' ? n <= state : n === state);
        items[i].classList.toggle('on', !!on);
        var inp = items[i].firstChild;
        inp.checked = (state === n);
      }
    }

    /* ---------- 값 → 화면 ---------- */
    function paintAll() {
      if (q.type === 'rating') { paintRating(); return; }
      var inputs = host.querySelectorAll('.fx-opt > input');
      var multi = q.type === 'checks';
      var showOther = false;
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i], isOther = inp.value === '__other__', on;
        if (isOther) {
          on = multi ? state.some(isOtherValue) : isOtherValue(state);
          showOther = on;
        } else on = multi ? state.indexOf(inp.value) !== -1 : state === inp.value;
        inp.checked = !!on;
        inp.parentNode.classList.toggle('on', !!on);
      }
      if (otherInput) {
        var cur = multi ? state.filter(isOtherValue)[0] : (isOtherValue(state) ? state : '');
        if (cur != null && otherInput !== document.activeElement) otherInput.value = otherText(cur);
        paintOther(showOther, false);
      }
    }
    /* 클릭한 줄의 .on 표시는 change 때 CSS(:checked) 로 처리하고, 여기서는 라디오 그룹 전체를 다시 맞춥니다 */
    host.addEventListener('change', function () { syncOn(); });
    function syncOn() {
      var rows = host.querySelectorAll('.fx-opt');
      for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('on', rows[i].firstChild.checked);
    }
    function clearErr() { err.hidden = true; err.textContent = ''; host.classList.remove('bad'); }
    function showErr(msg) { err.textContent = msg; err.hidden = false; host.classList.add('bad'); }

    /* "기타" 를 고른 채 내용이 비어 있으면 저장된 값은 "기타: " 뿐 → 화면에서도 켜진 채로 보이게 */
    paintAll(); syncOn();

    return {
      get: function () { return state; },
      set: function (v) { state = coerceAnswer(q, v); paintAll(); syncOn(); },
      validate: function () { var m = validate(q, state); if (m) showErr(m); else clearErr(); return m; },
      destroy: function () { host.textContent = ''; }
    };
  }

  /* ---------------------------------------------------------- 글쓰기 (굵게 · 주황 강조) */
  /**
   * RichEditor(host, opts)
   *   opts: { html, text, placeholder, maxText(=3000), onChange(html, text), minHeight }
   * 돌려주는 값: { getHtml(), getText(), setHtml(h), setText(t), focus(), destroy() }
   * getHtml() 은 항상 safeHtml 로 걸러진 값이고, 서식이 없으면 '' 입니다.
   */
  function RichEditor(host, opts) {
    opts = opts || {};
    var maxText = opts.maxText || 3000;
    var uid = 'rte' + (++UID);
    host.textContent = '';
    var wrap = h('div', 'fx-rte');
    var bar = h('div', 'fx-tb', { role: 'toolbar', 'aria-label': '글 서식' });
    var bBold = h('button', 'fx-tbtn fx-bold', { type: 'button', 'aria-pressed': 'false', title: '굵게 (Ctrl+B)' });
    bBold.innerHTML = '<b>B</b><span>굵게</span>';
    var bHl = h('button', 'fx-tbtn fx-hl', { type: 'button', 'aria-pressed': 'false', title: '주황색 강조' });
    bHl.innerHTML = '<i class="sw" aria-hidden="true"></i><span>주황 강조</span>';
    var bClr = h('button', 'fx-tbtn fx-clr', { type: 'button', title: '서식 지우기' });
    bClr.innerHTML = '<span>서식 지우기</span>';
    bar.appendChild(bBold); bar.appendChild(bHl); bar.appendChild(bClr);
    var ed = h('div', 'fx-ed', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', id: uid, spellcheck: 'true' });
    if (opts.placeholder) ed.setAttribute('data-ph', opts.placeholder);
    if (opts.minHeight) ed.style.minHeight = opts.minHeight;
    var cnt = h('div', 'fx-cnt');
    wrap.appendChild(bar); wrap.appendChild(ed); wrap.appendChild(cnt);
    host.appendChild(wrap);

    function setHtmlRaw(html) { ed.innerHTML = safeHtml(html); }
    function current() {
      var toks = tokensFromHtml(ed.innerHTML) || [];
      return { toks: toks, html: tokensToHtml(toks), text: tokensToText(toks) };
    }
    function fire() {
      var c = current();
      cnt.textContent = c.text.length + ' / ' + maxText;
      cnt.classList.toggle('over', c.text.length > maxText);
      if (typeof opts.onChange === 'function') opts.onChange(hasFormatToks(c.toks) ? c.html : '', c.text);
    }
    function hasFormatToks(toks) { return toks.some(function (t) { return t.k === 't' && (t.b || t.h); }); }

    /* 선택 영역 안에서 현재 서식 상태 */
    function inside(tagTest) {
      var sel = window.getSelection && window.getSelection();
      if (!sel || !sel.rangeCount) return false;
      var n = sel.anchorNode;
      while (n && n !== ed) { if (n.nodeType === 1 && tagTest(n)) return true; n = n.parentNode; }
      return false;
    }
    function isBold(n) { var t = n.nodeName; return t === 'B' || t === 'STRONG'; }
    function isHl(n) { return n.nodeName === 'MARK'; }
    function paintButtons() {
      var focusIn = document.activeElement === ed;
      var b = focusIn && (inside(isBold) || (document.queryCommandState && safeState('bold')));
      var m = focusIn && inside(isHl);
      bBold.classList.toggle('on', !!b); bBold.setAttribute('aria-pressed', b ? 'true' : 'false');
      bHl.classList.toggle('on', !!m); bHl.setAttribute('aria-pressed', m ? 'true' : 'false');
    }
    function safeState(cmd) { try { return document.queryCommandState(cmd); } catch (e) { return false; } }

    function selectionInEditor() {
      var sel = window.getSelection && window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      var r = sel.getRangeAt(0);
      return ed.contains(r.commonAncestorContainer) ? { sel: sel, range: r } : null;
    }
    /* 툴바 버튼을 눌러도 편집 영역의 선택이 풀리지 않게 */
    [bBold, bHl, bClr].forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); });

    function toggleBold() {
      ed.focus();
      try { document.execCommand('styleWithCSS', false, false); } catch (e) { }
      document.execCommand('bold', false, null);
      afterEdit();
    }
    /* 주황 강조는 execCommand 의 색 명령이 <span style> 을 만들어서 <mark class="hl"> 로 직접 감쌉니다 */
    function toggleHl() {
      ed.focus();
      var s = selectionInEditor();
      if (!s) return;
      var range = s.range;
      if (range.collapsed) {
        /* 커서만 있으면 커서가 놓인 강조 덩어리를 켜고 끕니다 */
        var n = s.sel.anchorNode;
        while (n && n !== ed && !(n.nodeType === 1 && isHl(n))) n = n.parentNode;
        if (n && n !== ed) unwrap(n);
        afterEdit(); return;
      }
      /* 선택 안에 이미 강조가 전부 있으면 걷어내고, 아니면 감쌉니다 */
      var marks = marksIn(range);
      var allCovered = marks.length && coveredByMarks(range, marks);
      if (allCovered) { marks.forEach(unwrap); afterEdit(); return; }
      marks.forEach(unwrap);
      var frag = range.extractContents();
      var m = document.createElement('mark'); m.className = 'hl';
      m.appendChild(frag);
      range.insertNode(m);
      /* 빈 <b></b> 같은 잔여물 정리는 current() 의 정리 단계에서 사라집니다 */
      s.sel.removeAllRanges();
      var nr = document.createRange(); nr.selectNodeContents(m); s.sel.addRange(nr);
      afterEdit();
    }
    function marksIn(range) {
      var res = [], all = ed.querySelectorAll('mark');
      for (var i = 0; i < all.length; i++) {
        try { if (range.intersectsNode(all[i])) res.push(all[i]); } catch (e) { }
      }
      return res;
    }
    function coveredByMarks(range, marks) {
      /* 선택한 글자가 모두 mark 안에 있는가 */
      var w = document.createTreeWalker(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      var node, any = false;
      while ((node = w.nextNode())) {
        if (!range.intersectsNode(node)) continue;
        if (!node.nodeValue.trim()) continue;
        any = true;
        var p = node.parentNode, ok = false;
        while (p && p !== ed) { if (p.nodeType === 1 && isHl(p)) { ok = true; break; } p = p.parentNode; }
        if (!ok) return false;
      }
      return any;
    }
    function unwrap(n) {
      var p = n.parentNode; if (!p) return;
      while (n.firstChild) p.insertBefore(n.firstChild, n);
      p.removeChild(n);
    }
    function clearFormat() {
      var c = current();
      var plain = c.toks.map(function (t) { return { k: t.k, s: t.s, b: false, h: false }; });
      ed.innerHTML = tokensToHtml(plain);
      afterEdit();
    }
    function afterEdit() { paintButtons(); fire(); }

    bBold.addEventListener('click', toggleBold);
    bHl.addEventListener('click', toggleHl);
    bClr.addEventListener('click', clearFormat);
    ed.addEventListener('input', afterEdit);
    ed.addEventListener('keyup', paintButtons);
    ed.addEventListener('mouseup', paintButtons);
    ed.addEventListener('focus', paintButtons);
    ed.addEventListener('blur', function () { bBold.classList.remove('on'); bHl.classList.remove('on'); });
    ed.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        var k = (e.key || '').toLowerCase();
        if (k === 'b') { e.preventDefault(); toggleBold(); }
      }
    });
    /* 붙여넣기는 글자만 (다른 곳의 글꼴 · 색 · 스크립트가 딸려 오지 않게) */
    ed.addEventListener('paste', function (e) {
      var cd = e.clipboardData || window.clipboardData;
      if (!cd) return;
      e.preventDefault();
      var txt = cd.getData('text/plain') || '';
      document.execCommand('insertText', false, txt.replace(/\r\n?/g, '\n'));
    });
    ed.addEventListener('drop', function (e) { e.preventDefault(); });

    setHtmlRaw(opts.html || (opts.text ? plainToHtml(opts.text) : ''));
    fire();

    return {
      el: ed,
      getHtml: function () { var c = current(); return hasFormatToks(c.toks) ? c.html : ''; },
      getText: function () { return current().text; },
      setHtml: function (html) { setHtmlRaw(html); fire(); },
      setText: function (t) { ed.innerHTML = plainToHtml(t); fire(); },
      focus: function () { ed.focus(); },
      destroy: function () { host.textContent = ''; }
    };
  }

  /* ---------------------------------------------------------- 안내글 그리기 (신청자 화면) */
  /** descHtml 이 있으면 서식으로, 없으면 옛 desc 글 그대로 (줄바꿈 유지) */
  function descToHtml(desc, descHtml) {
    if (descHtml && String(descHtml).trim()) return safeHtml(descHtml);
    return plainToHtml(desc);
  }

  var api = {
    OTHER_PREFIX: OTHER_PREFIX, OTHER_DEFAULT: OTHER_DEFAULT, FACES: FACES, FACE_WORDS: FACE_WORDS,
    esc: esc, isOtherValue: isOtherValue, otherText: otherText, otherValue: otherValue,
    hasOther: hasOther, otherLabel: otherLabel, ratingConfig: ratingConfig,
    safeHtml: safeHtml, htmlToText: htmlToText, hasFormat: hasFormat, plainToHtml: plainToHtml, descToHtml: descToHtml,
    coerceAnswer: coerceAnswer, validate: validate,
    RULE_OPS: RULE_OPS, OTHER_ANY: OTHER_ANY, ruleMatch: ruleMatch, condMatch: condMatch, visibility: visibility,
    mountQuestion: mountQuestion, RichEditor: RichEditor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FormsCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
