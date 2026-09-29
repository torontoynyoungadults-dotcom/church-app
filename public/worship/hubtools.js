/**
 * 찬양 허브 도구 (Step 2.8) — 악보 저장소 · 악보 자르기 · 가사 도구 · 방송 화면
 * ------------------------------------------------------------
 *  YNHubTools.init({ call, token, date, week, who, canEdit, apply })      허브 화면(Worship.html)이 한 번 부릅니다
 *  YNHubTools.openRepo(kind)     "🗂 악보 저장소" — 검색 · 미리보기 · 골라서 이 콘티에 넣기
 *  YNHubTools.openClip(opts)     "✂ 악보 잘라 저장" — 쪽 범위(예: 2-3)를 골라 PDF 로 잘라 저장소에 영구 보관
 *  YNHubTools.mountLyrics(host)  "📝 가사 도구" — 악보에서 뽑기 · 붙여넣어 정리 · 웹에서 찾기(검색 링크) · 보관 · 방송 화면
 *
 *  · PDF 를 쪽 단위로 자르는 일은 브라우저(pdf-lib)가 하고, 서버(logic/worship3.js)는 잘린 PDF 를 받아 보관만 합니다.
 *  · 가사는 저작권이 있어 앱이 가사 사이트에서 대신 가져오지 않습니다. 악보 PDF 의 글자를 뽑거나, 사람이 찾아 붙여넣은 글을
 *    코드 · 잡글을 지워 절 · 후렴으로 정리해 줍니다 (lyrics.js 의 분류기 + 아래 cleanLyrics).
 *  · 순수 함수(parseRanges · formatRanges · slidesFrom · cleanLyrics · b64)는 Node 에서도 시험합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var ly = null; try { ly = require('./lyrics.js'); } catch (e) {}
    module.exports = factory(root, ly);
  } else root.YNHubTools = factory(root, null);
}(typeof self !== 'undefined' ? self : this, function (root, lyMod) {
  'use strict';

  /* ================================================================ 순수 함수 */

  /** "2-3, 5" → { pages:[2,3,5], bad:[] }  (범위 밖 · 이상한 글은 bad 로 알려줌 · "전체" / "all" · "3-" = 3쪽부터 끝까지) */
  function parseRanges(str, max) {
    max = Math.max(0, Math.floor(max) || 0);
    var out = {}, bad = [];
    var s = String(str == null ? '' : str).replace(/[–—~∼～]/g, '-').replace(/쪽|페이지|p\.?/gi, '').trim();
    if (!s) return { pages: [], bad: [] };
    if (/^(전체|all|\*)$/i.test(s)) { for (var a = 1; a <= max; a++) out[a] = 1; return { pages: Object.keys(out).map(Number), bad: [] }; }
    s.split(/[,;\s]+/).forEach(function (tok) {
      if (!tok) return;
      var m = /^(\d+)(?:-(\d*))?$/.exec(tok);
      if (!m) { bad.push(tok); return; }
      var lo = +m[1], hi = m[2] === undefined ? lo : (m[2] === '' ? max : +m[2]);
      if (lo > hi) { var t = lo; lo = hi; hi = t; }
      if (lo < 1 || hi > max) { bad.push(tok); if (lo > max) return; lo = Math.max(1, lo); hi = Math.min(max, hi); if (hi < lo) return; }
      for (var p = lo; p <= hi; p++) out[p] = 1;
    });
    return { pages: Object.keys(out).map(Number).sort(function (x, y) { return x - y; }), bad: bad };
  }
  /** [1,2,3,5] → "1-3, 5" */
  function formatRanges(pages) {
    var p = (pages || []).slice().sort(function (x, y) { return x - y; }), out = [], i = 0;
    while (i < p.length) { var j = i; while (j + 1 < p.length && p[j + 1] === p[j] + 1) j++; out.push(j > i ? p[i] + '-' + p[j] : String(p[i])); i = j + 1; }
    return out.join(', ');
  }
  /** Uint8Array → base64 (큰 파일도 스택이 넘치지 않게 나누어) */
  function b64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray ? u8.subarray(i, i + 0x8000) : u8.slice(i, i + 0x8000));
    return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'));
  }

  var JUNK = [
    /^https?:\/\/\S+$/i, /^www\.\S+$/i, /^(lyrics|가사|가사\s*더\s*보기|더보기|접기|펼치기|translate|번역|embed|share|공유|복사|좋아요|like|read more|show more)$/i,
    /^\d+\s*(embed|contributors?|명)$/i, /^(작사|작곡|편곡|글|곡|words?|music|lyrics by|written by|arranged? by)\s*[:：]/i,
    /^[©ⓒ]|^copyright\b|^all rights reserved|^ccli\b|^used by permission|^\(c\)\s/i, /^[-_=*·•~]{3,}$/, /^(page|쪽)\s*\d+$/i
  ];
  function normTitle(t) { return String(t || '').toLowerCase().replace(/[\s_\-.()\[\]{}·,'"!?~]/g, ''); }
  function isJunk(t) { for (var i = 0; i < JUNK.length; i++) if (JUNK[i].test(t)) return true; return false; }

  /**
   * 붙여넣은 글(웹에서 복사한 가사 · 악보 글) → 깔끔한 가사.
   * 코드 줄 · [G] 같은 코드 표시 · 저작권 줄 · 웹 잡글을 지우고, 절 · 후렴 표시를 [Verse 1] 꼴로 맞춥니다.
   * opt: { keepChords, labels(기본 true), dedupe, title(곡 제목 — 맨 위에 붙어 온 제목 줄은 지움) }
   */
  function cleanLyrics(text, opt) {
    opt = opt || {};
    var LY = lyMod || root.YNLyrics;
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/[\u00a0\u200b\u2028\u2029\ufeff]/g, ' ').split('\n').map(function (x) { return x.replace(/\t/g, ' ').replace(/\s+$/g, ''); });
    var raw = [], y = 0, nt = normTitle(opt.title), seenLyric = 0;
    lines.forEach(function (l) {
      var t = l.trim();
      if (!t) { raw.push({ text: '', y: --y, h: 10, brk: true }); return; }
      if (isJunk(t)) return;
      if (nt && seenLyric < 2 && !raw.some(function (r) { return r.text; }) === true && normTitle(t) === nt) { seenLyric++; return; }   // 맨 위 곡 제목 줄은 가사가 아님
      raw.push({ text: t, y: --y, h: 10, brk: false });
    });
    if (LY && LY.build) return LY.build(raw, { keepChords: !!opt.keepChords, labels: opt.labels !== false, dedupe: !!opt.dedupe }).text;
    return raw.map(function (r) { return r.text; }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * 가사 → 방송 화면 슬라이드. [절] 표시가 나오거나 빈 줄이 있으면 새 덩어리, 덩어리는 maxLines 줄씩 나눕니다.
   * → [{ label, lines:[…], text }]
   */
  function slidesFrom(text, opt) {
    opt = opt || {};
    var max = Math.max(1, Math.min(12, Math.round(opt.maxLines) || 4));
    var out = [], label = '', block = [];
    function flush() {
      if (!block.length) return;
      var n = Math.ceil(block.length / max), size = Math.ceil(block.length / n);       // 고르게 나누기 (4 + 1 대신 3 + 2)
      for (var i = 0; i < block.length; i += size) { var ls = block.slice(i, i + size); out.push({ label: i === 0 ? label : '', lines: ls, text: ls.join('\n') }); }
      block = []; label = '';
    }
    String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').forEach(function (l) {
      var t = l.trim(), m = /^\[([^\]]{1,40})\]$/.exec(t);
      if (m) { flush(); label = m[1]; return; }
      if (!t) { flush(); return; }
      block.push(t);
    });
    flush();
    return out;
  }

  /** 곡 제목 → 검색 주소 (앱이 가사를 대신 가져오지 않고, 사람이 찾아 붙여넣도록 검색창만 엽니다) */
  function searchLinks(title) {
    var q = encodeURIComponent(String(title || '').trim() + ' 가사');
    return [{ name: 'Google', url: 'https://www.google.com/search?q=' + q }, { name: 'Naver', url: 'https://search.naver.com/search.naver?query=' + q }];
  }

  var PURE = { parseRanges: parseRanges, formatRanges: formatRanges, b64: b64, cleanLyrics: cleanLyrics, slidesFrom: slidesFrom, searchLinks: searchLinks, isJunk: isJunk };
  if (typeof document === 'undefined') return PURE;

  /* ================================================================ 화면 도구 (브라우저) */
  var doc = document, CTX = null;
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, r) { return (r || doc).querySelector(sel); }
  function ctx() { if (!CTX) throw new Error('허브 도구가 준비되지 않았습니다.'); return CTX; }
  function call(fn, args) { return new Promise(function (res, rej) { ctx().call(fn, args, res, function (e) { rej(e instanceof Error ? e : new Error((e && e.message) || '처리하지 못했습니다.')); }); }); }
  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  var scripts = {};
  function loadScript(src, test) {
    if (test && test()) return Promise.resolve();
    if (scripts[src]) return scripts[src];
    return (scripts[src] = new Promise(function (res, rej) {
      var s = doc.createElement('script'); s.src = src; s.async = true;
      s.onload = function () { res(); }; s.onerror = function () { delete scripts[src]; rej(new Error('도구를 불러오지 못했습니다 (' + src + '). 인터넷 연결을 확인해주세요.')); };
      doc.head.appendChild(s);
    }));
  }
  function ensurePdfjs() {
    return loadScript('/vendor/pdfjs/pdf.min.js', function () { return !!root.pdfjsLib; }).then(function () {
      try { root.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; } catch (e) {}
    });
  }
  function ensurePdfLib() { return loadScript('/vendor/pdf-lib.min.js', function () { return !!root.PDFLib; }); }

  function isPdf(u8) { return u8.length > 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46; }
  var docCache = {}, docOrder = [];
  /** /sheet/<id> 의 PDF 를 읽어 { bytes, pdf(pdf.js), n } — 사진이면 { bytes, img:true, n:1 } */
  function loadSheetDoc(id) {
    if (docCache[id]) return Promise.resolve(docCache[id]);
    return fetch('/sheet/' + encodeURIComponent(id), { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 404 ? '이 악보를 찾을 수 없습니다 (삭제되었거나 권한이 없습니다).' : '악보를 불러오지 못했습니다 (오류 ' + r.status + ')');
      return r.arrayBuffer();
    }, function () { throw new Error('악보를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'); }).then(function (buf) { return openBytes(new Uint8Array(buf)); }).then(function (d) {
      docCache[id] = d; docOrder.push(id);
      while (docOrder.length > 4) { var old = docOrder.shift(); if (docCache[old] && docCache[old].pdf) { try { docCache[old].pdf.destroy(); } catch (e) {} } delete docCache[old]; }
      return d;
    });
  }
  function openBytes(u8) {
    if (!isPdf(u8)) return Promise.resolve({ bytes: u8, img: true, n: 1, mime: u8[0] === 0x89 ? 'image/png' : 'image/jpeg' });
    return ensurePdfjs().then(function () { return root.pdfjsLib.getDocument({ data: u8.slice(0) }).promise; }).then(function (pdf) { return { bytes: u8, pdf: pdf, n: pdf.numPages }; },
      function (e) { throw new Error(e && e.name === 'PasswordException' ? '암호가 걸린 PDF 는 열 수 없습니다.' : 'PDF 를 읽지 못했습니다 (파일이 손상되었을 수 있습니다).'); });
  }
  /** 한 쪽을 canvas 에 그립니다 (너비 w px) */
  function drawPage(d, pg, cv, w) {
    if (d.img) {
      return new Promise(function (res, rej) {
        var im = new root.Image(), url = root.URL.createObjectURL(new root.Blob([d.bytes], { type: d.mime }));
        im.onload = function () { var sc = w / im.width; cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); root.URL.revokeObjectURL(url); res(); };
        im.onerror = function () { rej(new Error('사진을 읽지 못했습니다.')); }; im.src = url;
      });
    }
    return d.pdf.getPage(pg).then(function (p) {
      var v1 = p.getViewport({ scale: 1 }), sc = w / v1.width, vp = p.getViewport({ scale: sc });
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      return p.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    });
  }

  /* ---------------------------------------------------------------- 모달 */
  var openModals = [];
  function modal(title, cls) {
    var back = el('div', 'ht ht-back'), box = el('div', 'ht-modal ' + (cls || ''));
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
    box.innerHTML = '<div class="ht-mh"><b>' + h(title) + '</b><button type="button" class="ht-x" aria-label="닫기" title="닫기 (Esc)">✕</button></div><div class="ht-mb"></div>';
    back.appendChild(box); doc.body.appendChild(back); doc.body.classList.add('ht-lock');
    var api = { back: back, box: box, body: $('.ht-mb', box), onClose: null };
    function key(e) { if (e.key === 'Escape' && openModals[openModals.length - 1] === api) { e.stopPropagation(); api.close(); } }
    api.close = function () {
      doc.removeEventListener('keydown', key, true);
      var i = openModals.indexOf(api); if (i >= 0) openModals.splice(i, 1);
      back.remove(); if (!openModals.length) doc.body.classList.remove('ht-lock');
      if (api.onClose) { try { api.onClose(); } catch (e) {} }
    };
    $('.ht-x', box).onclick = api.close;
    back.addEventListener('mousedown', function (e) { if (e.target === back) api.close(); });
    doc.addEventListener('keydown', key, true);
    openModals.push(api);
    return api;
  }
  function msgBox(host) { var m = el('div', 'ht-msg'); m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); host.appendChild(m); return function (t, k) { m.textContent = t || ''; m.className = 'ht-msg' + (k ? ' ' + k : ''); }; }

  /* ---------------------------------------------------------------- ✂ 악보 잘라 저장 */
  var clipOpen = null;
  function songOptions() {
    var w = ctx().week() || {}; return (w.songs || []).concat(w.finals || []);
  }
  function sheetOptions() { var w = ctx().week() || {}; return (w.sheets || []).concat(w.finalSheets || []); }
  function todayYmd() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function openClip(o) {
    o = o || {};
    if (clipOpen) { try { clipOpen.close(); } catch (e) {} }
    var C = ctx();
    if (!C.canEdit()) { root.alert('악보를 저장소에 저장하는 일은 팀장 · 인도자만 할 수 있습니다.'); return null; }
    var m = modal('✂ 악보 잘라 저장소에 저장', 'ht-clip'); clipOpen = m; m.onClose = function () { if (clipOpen === m) clipOpen = null; killDoc(); };
    var sheets = sheetOptions(), songs = songOptions(), w = C.week() || {};
    var day = /^\d{4}-\d{2}-\d{2}$/.test(String(C.date())) ? C.date() : (w.day || todayYmd());
    m.body.innerHTML =
      '<p class="ht-help">악보 PDF 에서 이 곡에 해당하는 쪽만 골라 새 PDF 로 잘라 저장합니다. 저장한 악보는 <b>악보 저장소</b>에 영구 보관되어, 다음에 콘티를 만들 때 검색해서 바로 넣을 수 있어요.</p>' +
      '<div class="ht-row"><label class="ht-f grow"><span>어떤 악보에서?</span><select data-r="src"><option value="">— 악보를 고르세요 —</option>' +
        sheets.map(function (s, i) { return '<option value="' + h(s.id) + '">' + h(s.name) + '</option>'; }).join('') + '<option value="__file">💻 내 컴퓨터에서 PDF · 사진 고르기…</option></select></label>' +
        '<input type="file" data-r="file" accept="application/pdf,.pdf,image/*" hidden></div>' +
      '<div class="ht-thumbs" data-r="thumbs" aria-label="쪽 미리보기 (눌러서 고르기)"><p class="ht-empty">악보를 고르면 쪽 미리보기가 나옵니다.</p></div>' +
      '<div class="ht-row"><label class="ht-f grow"><span>쪽 범위 <em>예: 2-3 · 1, 4 · 3-</em></span><input type="text" data-r="range" inputmode="text" autocomplete="off" placeholder="예: 2-3" aria-label="쪽 범위"></label>' +
        '<button type="button" class="ht-b" data-r="all">전체 선택</button><button type="button" class="ht-b ghost" data-r="none">선택 지우기</button></div>' +
      '<div class="ht-sel" data-r="selinfo" aria-live="polite"></div>' +
      '<div class="ht-row"><label class="ht-f grow"><span>곡 제목 <b class="req">*</b></span><input type="text" data-r="title" maxlength="80" list="htSongs" autocomplete="off" placeholder="예: 주님은 나의 목자"></label>' +
        '<datalist id="htSongs">' + songs.map(function (s) { return '<option value="' + h(s.title) + '">'; }).join('') + '</datalist></div>' +
      '<div class="ht-row"><label class="ht-f"><span>날짜</span><input type="date" data-r="date" value="' + h(day) + '"></label>' +
        '<label class="ht-f grow"><span>인도자</span><input type="text" data-r="leader" maxlength="30" list="htLeaders" value="' + h(C.who() || '') + '" autocomplete="off"></label>' +
        '<datalist id="htLeaders">' + (C.people ? C.people() : []).map(function (n) { return '<option value="' + h(n) + '">'; }).join('') + '</datalist>' +
        '<label class="ht-f sm"><span>Key</span><input type="text" data-r="key" maxlength="8"></label><label class="ht-f sm"><span>BPM</span><input type="number" data-r="bpm" min="30" max="300" inputmode="numeric"></label></div>' +
      '<label class="ht-f"><span>메모 (선택)</span><input type="text" data-r="note" maxlength="200" placeholder="예: 2절까지 · 결단 버전"></label>' +
      '<div class="ht-foot"><button type="button" class="ht-b primary" data-r="save" disabled>저장소에 저장</button><button type="button" class="ht-b ghost" data-r="cancel">닫기</button></div>';
    var say = msgBox(m.body);
    var Q = function (k) { return $('[data-r="' + k + '"]', m.body); };
    var st = { d: null, sel: {}, name: '', thumbsToken: 0 };
    function killDoc() { if (st.d && st.d.pdf && !st.fromCache) { try { st.d.pdf.destroy(); } catch (e) {} } st.d = null; }

    function selPages() { return Object.keys(st.sel).map(Number).sort(function (a, b) { return a - b; }); }
    function paintSel(fromRange) {
      var p = selPages();
      Array.prototype.forEach.call(m.body.querySelectorAll('.ht-th'), function (b) { var on = !!st.sel[+b.dataset.p]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      if (!fromRange) Q('range').value = formatRanges(p);
      Q('selinfo').textContent = p.length ? '선택한 쪽: ' + formatRanges(p) + ' (' + p.length + '쪽)' : (st.d ? '저장할 쪽을 눌러 고르거나 범위를 적어주세요.' : '');
      Q('save').disabled = !(p.length && st.d);
    }
    Q('range').addEventListener('input', function () {
      if (!st.d) return;
      var r = parseRanges(Q('range').value, st.d.n);
      st.sel = {}; r.pages.forEach(function (x) { st.sel[x] = 1; });
      paintSel(true);
      if (r.bad.length) say('전체 ' + st.d.n + '쪽 안에서 골라주세요. (알 수 없는 값: ' + r.bad.join(', ') + ')', 'bad'); else say('');
    });
    Q('all').onclick = function () { if (!st.d) return; st.sel = {}; for (var i = 1; i <= st.d.n; i++) st.sel[i] = 1; paintSel(); say(''); };
    Q('none').onclick = function () { st.sel = {}; paintSel(); say(''); };
    Q('cancel').onclick = m.close;

    function showThumbs() {
      var host = Q('thumbs'), token = ++st.thumbsToken; host.innerHTML = '';
      var n = st.d.n, btns = [];
      for (var i = 1; i <= n; i++) {
        var b = el('button', 'ht-th', '<canvas width="120" height="160"></canvas><i>' + i + '</i>'); b.type = 'button'; b.dataset.p = String(i);
        b.setAttribute('aria-label', i + '쪽'); b.setAttribute('aria-pressed', 'false');
        b.onclick = function () { var p = +this.dataset.p; if (st.sel[p]) delete st.sel[p]; else st.sel[p] = 1; paintSel(); say(''); };
        host.appendChild(b); btns.push(b);
      }
      var k = 0;
      (function next() {                                              // 한 쪽씩 순서대로 (한꺼번에 그리면 큰 악보에서 멈춘 것처럼 보임)
        if (token !== st.thumbsToken || k >= btns.length) return;
        var cv = btns[k].querySelector('canvas'); k++;
        drawPage(st.d, k, cv, 120).then(function () { setTimeout(next, 0); }, function () { setTimeout(next, 0); });
      })();
    }
    function useDoc(d, name, cached) {
      killDoc(); st.d = d; st.fromCache = !!cached; st.sel = {}; st.name = name || '';
      var t = Q('title'); if (!t.value) t.value = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').trim();
      showThumbs(); paintSel(); say(d.n + '쪽짜리 악보입니다. 저장할 쪽을 눌러 고르세요.');
      try { Q('range').focus(); } catch (e) {}
    }
    function fromSheet(id) {
      if (!id) { st.thumbsToken++; killDoc(); Q('thumbs').innerHTML = '<p class="ht-empty">악보를 고르면 쪽 미리보기가 나옵니다.</p>'; paintSel(); return; }
      var meta = sheets.filter(function (s) { return s.id === id; })[0];
      say('악보를 불러오는 중…'); Q('thumbs').innerHTML = '<p class="ht-empty">불러오는 중…</p>';
      loadSheetDoc(id).then(function (d) { if (Q('src').value !== id) return; useDoc(d, meta && meta.name, true); }, function (e) { say(e.message, 'bad'); Q('thumbs').innerHTML = ''; });
    }
    Q('src').onchange = function () { if (this.value === '__file') { Q('file').click(); this.value = ''; } else fromSheet(this.value); };
    Q('file').onchange = function () {
      var f = this.files && this.files[0]; this.value = ''; if (!f) return;
      if (f.size > 40 * 1024 * 1024) { say('40MB 가 넘는 파일입니다. 더 작은 파일을 골라주세요.', 'bad'); return; }
      say('파일을 읽는 중…');
      var rd = new root.FileReader();
      rd.onerror = function () { say('파일을 읽지 못했습니다.', 'bad'); };
      rd.onload = function () { openBytes(new Uint8Array(rd.result)).then(function (d) { Q('src').value = ''; useDoc(d, f.name, false); }, function (e) { say(e.message, 'bad'); }); };
      rd.readAsArrayBuffer(f);
    };
    // 곡 제목을 콘티의 곡에서 고르면 Key · BPM 을 채워 줍니다
    Q('title').addEventListener('change', function () {
      var s = songs.filter(function (x) { return x.title === Q('title').value; })[0];
      if (s) { if (!Q('key').value && s.key) Q('key').value = s.key; if (!Q('bpm').value && s.bpm) Q('bpm').value = s.bpm; }
    });

    /** 고른 쪽만 새 PDF 로 (pdf-lib) — 사진은 한 쪽짜리 PDF 로 감쌉니다 */
    function buildPdf() {
      var pages = selPages();
      return ensurePdfLib().then(function () {
        var PL = root.PDFLib;
        if (st.d.img) {
          return PL.PDFDocument.create().then(function (out) {
            return (st.d.mime === 'image/png' ? out.embedPng(st.d.bytes) : out.embedJpg(st.d.bytes)).then(function (im) {
              var pg = out.addPage([im.width, im.height]); pg.drawImage(im, { x: 0, y: 0, width: im.width, height: im.height }); return out.save();
            });
          });
        }
        return PL.PDFDocument.load(st.d.bytes, { ignoreEncryption: true, updateMetadata: false }).then(function (src) {
          return PL.PDFDocument.create().then(function (out) {
            return out.copyPages(src, pages.map(function (p) { return p - 1; })).then(function (cp) { cp.forEach(function (pg) { out.addPage(pg); }); return out.save(); });
          });
        });
      });
    }
    Q('save').onclick = function () {
      var pages = selPages(), title = Q('title').value.trim();
      if (!st.d || !pages.length) { say('저장할 쪽을 골라주세요.', 'bad'); return; }
      if (!title) { say('곡 제목을 적어주세요.', 'bad'); Q('title').focus(); return; }
      var btn = Q('save'); btn.disabled = true; say('잘라서 만드는 중…');
      buildPdf().then(function (u8) {
        if (u8.length > 19 * 1024 * 1024) throw new Error('잘라낸 PDF 가 너무 큽니다 (20MB 이하로 줄여주세요).');
        say('저장소에 올리는 중… (' + (u8.length / 1048576).toFixed(1) + 'MB)');
        return call('worshipRepoSave', [C.token(), { title: title, date: Q('date').value, leader: Q('leader').value.trim(), pages: st.d.img ? 1 : pages.length, source: st.name,
          note: Q('note').value.trim(), key: Q('key').value.trim(), bpm: Q('bpm').value }, 'data:application/pdf;base64,' + b64(u8)]);
      }).then(function (r) {
        say('저장했습니다 — "' + title + '" (' + (st.d.img ? 1 : pages.length) + '쪽). 저장소에서 검색해 콘티에 넣을 수 있습니다.', 'ok');
        if (repoOpen && repoOpen.reload) repoOpen.reload(r && r.list);
        if (o.onSaved) { try { o.onSaved(r); } catch (e) {} }
        st.sel = {}; paintSel(); Q('title').value = ''; Q('note').value = '';
        btn.disabled = true;
      }).catch(function (e) { say(e.message || '저장하지 못했습니다.', 'bad'); btn.disabled = !(selPages().length && st.d); });
    };
    if (o.sheetId) { Q('src').value = o.sheetId; if (Q('src').value === o.sheetId) fromSheet(o.sheetId); }
    return m;
  }

  /* ---------------------------------------------------------------- 🗂 악보 저장소 (검색 · 미리보기 · 콘티에 넣기) */
  var repoOpen = null;
  function openRepo(kind) {
    if (repoOpen) { try { repoOpen.close(); } catch (e) {} }
    var C = ctx(); kind = kind === '결단' ? '결단' : '콘티';
    var m = modal('🗂 악보 저장소', 'ht-repo'); repoOpen = m; m.onClose = function () { if (repoOpen === m) repoOpen = null; if (pv.d && pv.tmp) { try { pv.d.pdf.destroy(); } catch (e) {} } };
    m.body.innerHTML =
      '<div class="ht-row"><label class="ht-f grow"><span class="sr">검색</span><input type="search" data-r="q" placeholder="곡 제목 · 인도자 · 날짜로 찾기 (예: 목자, 박인도, 2026-09)" autocomplete="off" aria-label="저장소 검색"></label>' +
        (C.canEdit() ? '<button type="button" class="ht-b" data-r="clip">✂ 새로 자르기</button>' : '') + '</div>' +
      '<div class="ht-split"><div class="ht-list" data-r="list" role="listbox" aria-multiselectable="true"><p class="ht-empty">불러오는 중…</p></div>' +
        '<div class="ht-prev" data-r="prev"><div class="ht-pvhead" data-r="pvhead"><span class="ht-empty">왼쪽에서 악보를 누르면 미리 볼 수 있어요.</span></div>' +
          '<div class="ht-pvpager" data-r="pager" hidden><button type="button" class="ht-b sq" data-r="pp" aria-label="이전 쪽">‹</button><span data-r="pn"></span><button type="button" class="ht-b sq" data-r="pnx" aria-label="다음 쪽">›</button></div>' +
          '<div class="ht-pvbox"><canvas data-r="cv" width="10" height="10"></canvas></div></div></div>' +
      '<div class="ht-foot"><span class="ht-cnt" data-r="cnt" aria-live="polite">선택한 악보 0개</span><span class="grow"></span>' +
        '<button type="button" class="ht-b primary" data-r="add" disabled>이 ' + (kind === '결단' ? '결단찬양 악보' : '콘티') + '에 넣기</button><button type="button" class="ht-b ghost" data-r="close">닫기</button></div>';
    var say = msgBox(m.body);
    var Q = function (k) { return $('[data-r="' + k + '"]', m.body); };
    var st = { items: [], picked: {}, cur: '', total: 0 }, pv = { d: null, pg: 1, tmp: false, id: '' }, qT = 0, seq = 0;

    function cnt() { var n = Object.keys(st.picked).length; Q('cnt').textContent = '선택한 악보 ' + n + '개'; Q('add').disabled = !n; }
    function paintList() {
      var host = Q('list');
      if (!st.items.length) { host.innerHTML = '<p class="ht-empty">' + (st.q ? '"' + h(st.q) + '" 에 맞는 악보가 없습니다.' : '저장소가 비어 있습니다.' + (C.canEdit() ? ' "✂ 새로 자르기" 로 첫 악보를 저장해 보세요.' : '')) + '</p>'; return; }
      host.innerHTML = st.items.map(function (x) {
        var on = !!st.picked[x.id];
        return '<div class="ht-item' + (x.id === st.cur ? ' cur' : '') + '" role="option" aria-selected="' + on + '" data-id="' + h(x.id) + '">' +
          '<label class="ht-ck"><input type="checkbox" data-pick="' + h(x.id) + '"' + (on ? ' checked' : '') + ' aria-label="' + h(x.title) + ' 고르기"></label>' +
          '<button type="button" class="ht-it" data-view="' + h(x.id) + '"><b>' + h(x.title) + '</b><span>' + [x.date, x.leader, x.pages ? x.pages + '쪽' : '', x.key ? 'Key ' + x.key : ''].filter(Boolean).map(h).join(' · ') + '</span>' +
          (x.note ? '<em>' + h(x.note) + '</em>' : '') + '</button></div>';
      }).join('') + (st.total > st.items.length ? '<p class="ht-empty">검색어를 더 적어 좁혀 보세요. (' + st.total + '개 중 ' + st.items.length + '개 표시)</p>' : '');
    }
    function load(q) {
      var my = ++seq; st.q = q || '';
      call('worshipRepoList', [C.token(), st.q]).then(function (r) { if (my !== seq) return; st.items = r.items || []; st.total = r.total || st.items.length; paintList(); cnt(); }, function (e) { if (my === seq) { Q('list').innerHTML = '<p class="ht-empty bad">' + h(e.message || '불러오지 못했습니다.') + '</p>'; } });
    }
    m.reload = function (list) { if (Array.isArray(list) && !Q('q').value.trim()) { st.items = list.slice(0, 300); st.total = list.length; paintList(); cnt(); } else load(Q('q').value.trim()); };
    Q('q').addEventListener('input', function () { clearTimeout(qT); qT = setTimeout(function () { load(Q('q').value.trim()); }, 220); });
    Q('close').onclick = m.close;
    var clipB = Q('clip'); if (clipB) clipB.onclick = function () { openClip({ onSaved: function () { } }); };

    function showPage() {
      if (!pv.d) return;
      Q('pn').textContent = pv.pg + ' / ' + pv.d.n; Q('pager').hidden = pv.d.n < 2;
      var cv = Q('cv'), w = Math.min(560, Math.max(240, Q('prev').clientWidth - 24));
      drawPage(pv.d, pv.pg, cv, w).catch(function (e) { say(e.message, 'bad'); });
    }
    function view(id) {
      var it = st.items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
      st.cur = id; paintList(); pv.id = id;
      Q('pvhead').innerHTML = '<b>' + h(it.title) + '</b><span>' + [it.date, it.leader ? '인도자 ' + it.leader : '', it.bpm ? it.bpm + ' BPM' : '', it.note].filter(Boolean).map(h).join(' · ') + '</span>';
      say('미리보기를 불러오는 중…');
      loadSheetDoc(it.fileId).then(function (d) { if (pv.id !== id) return; pv.d = d; pv.tmp = false; pv.pg = 1; say(''); showPage(); }, function (e) { if (pv.id === id) say(e.message, 'bad'); });
    }
    Q('pp').onclick = function () { if (pv.d && pv.pg > 1) { pv.pg--; showPage(); } };
    Q('pnx').onclick = function () { if (pv.d && pv.pg < pv.d.n) { pv.pg++; showPage(); } };
    Q('list').addEventListener('click', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.pick) { if (t.checked) st.picked[t.dataset.pick] = 1; else delete st.picked[t.dataset.pick]; cnt(); var row = t.closest('.ht-item'); if (row) row.setAttribute('aria-selected', t.checked ? 'true' : 'false'); return; }
      var b = t.closest ? t.closest('[data-view]') : null; if (b) view(b.dataset.view);
    });
    Q('list').addEventListener('dblclick', function (e) {           // 두 번 누르면 바로 고르기
      var b = e.target.closest ? e.target.closest('[data-view]') : null; if (!b) return;
      var id = b.dataset.view; if (st.picked[id]) delete st.picked[id]; else st.picked[id] = 1; paintList(); cnt();
    });
    Q('add').onclick = function () {
      var ids = Object.keys(st.picked); if (!ids.length) return;
      Q('add').disabled = true; say('콘티에 넣는 중…');
      call('worshipRepoAddToSetlist', [C.token(), C.date(), ids, kind]).then(function (r) {
        C.apply(r.week);
        say((r.added ? r.added + '개를 넣었습니다.' : '새로 넣은 악보가 없습니다.') + (r.duplicate ? ' (이미 걸려 있던 ' + r.duplicate + '개는 건너뜀)' : '') + (r.missing ? ' (없어진 ' + r.missing + '개 무시)' : ''), r.added ? 'ok' : '');
        if (r.added) setTimeout(m.close, 900); else Q('add').disabled = false;
      }, function (e) { say(e.message || '넣지 못했습니다.', 'bad'); Q('add').disabled = false; });
    };
    load('');
    setTimeout(function () { try { Q('q').focus(); } catch (e) {} }, 30);
    return m;
  }

  /* ---------------------------------------------------------------- 📝 가사 도구 */
  var LYS = { songIdx: '', title: '', text: '', src: 'pdf', saved: null, savedLoading: false, max: 4 };

  function songList() { return songOptions(); }
  function keyOf(title) { return String(title || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\s_\-.()\[\]{}·,'"!?~]/g, '').slice(0, 60); }

  function mountLyrics(host) {
    if (!host) return null;
    var C = ctx(), songs = songList(), sheets = sheetOptions();
    var st = LYS;
    if (st.songIdx !== '' && !songs[+st.songIdx]) st.songIdx = '';
    host.classList.add('ht');
    host.innerHTML =
      '<div class="ht-lyh"><b>📝 가사 도구</b><span class="ht-tag">방송 화면용</span></div>' +
      '<p class="ht-help">곡별 가사를 악보에서 뽑거나, 찾은 가사를 붙여넣어 코드 · 잡글을 지우고 절 · 후렴으로 정리합니다. 저장해 두면 <b>방송 화면</b>(큰 글씨 슬라이드)으로 바로 쓸 수 있어요.</p>' +
      '<div class="ht-row"><label class="ht-f grow"><span>곡</span><select data-l="song"><option value="">— 곡 고르기 —</option>' +
        songs.map(function (s, i) { return '<option value="' + i + '">' + h((i + 1) + '. ' + s.title) + '</option>'; }).join('') + '</select></label>' +
        '<label class="ht-f grow"><span>제목 (직접 적기)</span><input type="text" data-l="title" maxlength="80" placeholder="곡 제목" autocomplete="off"></label></div>' +
      '<div class="ht-seg" role="tablist" aria-label="가사를 가져오는 방법">' + [['pdf', '📄 악보에서 뽑기'], ['paste', '📋 붙여넣어 정리'], ['web', '🔎 웹에서 찾기']].map(function (x) { return '<button type="button" role="tab" data-src="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="ht-src" data-l="srcbox"></div>' +
      '<label class="ht-f"><span>가사 <em data-l="stat"></em></span><textarea data-l="text" rows="10" spellcheck="false" placeholder="여기에 가사가 나옵니다. 직접 고칠 수도 있어요.&#10;[Verse 1] / [Chorus] 처럼 대괄호로 절을 표시하면 방송 화면에서 절 이름이 함께 나옵니다."></textarea></label>' +
      '<div class="ht-row wrap"><button type="button" class="ht-b primary" data-l="save">💾 저장 (보관)</button><button type="button" class="ht-b" data-l="show">📺 방송 화면</button><button type="button" class="ht-b" data-l="showall">📺 전체 곡 연속</button>' +
        '<button type="button" class="ht-b ghost" data-l="copy">복사</button><button type="button" class="ht-b ghost" data-l="txt">.txt 저장</button><button type="button" class="ht-b ghost warn" data-l="del">보관본 삭제</button></div>';
    var say = msgBox(host);
    var Q = function (k) { return $('[data-l="' + k + '"]', host); };

    function title() { return Q('title').value.trim(); }
    function savedFor(t) { return st.saved && st.saved[keyOf(t)] || null; }
    function updStat() {
      var t = Q('text').value, n = t ? t.split(/\n/).filter(function (x) { return x.trim() && !/^\[.*\]$/.test(x.trim()); }).length : 0, sv = savedFor(title());
      Q('stat').textContent = (n ? n + '줄' : '비어 있음') + (sv ? (sv.text === t ? ' · ✓ 저장됨' + (sv.by ? ' (' + sv.by + ')' : '') : ' · 저장된 것과 다름') : '');
    }
    st._upd = updStat;
    function setText(t) { st.text = t; Q('text').value = t; updStat(); }
    function chooseSong(idx) {
      st.songIdx = idx;
      if (idx !== '' && songs[+idx]) { Q('title').value = st.title = songs[+idx].title; }
      Q('song').value = String(idx);
      var sv = savedFor(title());
      if (sv) { setText(sv.text); say('저장된 가사를 불러왔습니다.', 'ok'); } else { setText(''); say(''); }
      paintSrc();
    }

    /* ---- 방법별 입력 */
    function paintSrc() {
      Array.prototype.forEach.call(host.querySelectorAll('[data-src]'), function (b) { var on = b.dataset.src === st.src; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      var box = Q('srcbox');
      if (st.src === 'pdf') {
        var pick = st.songIdx !== '' ? sheetFor(songs[+st.songIdx]) : null;
        box.innerHTML = sheets.length
          ? '<div class="ht-row"><label class="ht-f grow"><span>어떤 악보에서?</span><select data-l="sheet">' + sheets.map(function (s) { return '<option value="' + h(s.id) + '"' + (pick && pick.id === s.id ? ' selected' : '') + '>' + h(s.name) + '</option>'; }).join('') + '</select></label>' +
            '<label class="ht-f sm"><span>쪽 범위</span><input type="text" data-l="range" placeholder="전체" autocomplete="off" aria-label="쪽 범위 (비우면 전체)"></label></div>' +
            '<div class="ht-row wrap"><button type="button" class="ht-b" data-l="extract">글자 뽑기</button><button type="button" class="ht-b ghost" data-l="ocr">글자가 안 나오면 (OCR)</button>' +
            '<label class="ht-chk"><input type="checkbox" data-l="chords"> 코드 포함</label><label class="ht-chk"><input type="checkbox" data-l="labels" checked> [절] 표시</label></div>' +
            '<p class="ht-help">악보 PDF 안의 글자에서 코드 줄을 빼고 가사만 남깁니다. 그림으로 된 악보는 OCR 로 읽습니다 (처음 한 번은 언어 자료를 내려받아 1분쯤 걸려요).</p>'
          : '<p class="ht-help">이 콘티에 올라온 악보가 없습니다. 악보를 올리거나 "붙여넣어 정리"를 써 보세요.</p>';
      } else if (st.src === 'paste') {
        box.innerHTML = '<label class="ht-f"><span>복사한 글을 여기에 붙여넣기</span><textarea data-l="paste" rows="6" spellcheck="false" placeholder="인터넷 · 문서 · 카톡에서 복사한 가사를 붙여넣으세요."></textarea></label>' +
          '<div class="ht-row wrap"><button type="button" class="ht-b" data-l="clean">✨ 정리하기</button><label class="ht-chk"><input type="checkbox" data-l="chords"> 코드 포함</label><label class="ht-chk"><input type="checkbox" data-l="labels" checked> [절] 표시</label></div>' +
          '<p class="ht-help">코드 줄 · [G] 같은 코드 표시 · 저작권 · 웹 잡글(공유 · 더보기 …)을 지우고, 1절 · 후렴 표시를 [Verse 1] · [Chorus] 로 맞춥니다.</p>';
      } else {
        var lk = searchLinks(title() || (songs[+st.songIdx] || {}).title || '');
        box.innerHTML = '<p class="ht-help">가사에는 저작권이 있어 앱이 사이트에서 대신 가져오지 않습니다. 아래 검색 링크로 가사를 찾아 <b>복사</b>한 뒤, "📋 붙여넣어 정리"에서 붙여넣으면 깔끔하게 정리해 드립니다.</p>' +
          '<div class="ht-row wrap" data-l="links">' + lk.map(function (x) { return '<a class="ht-b" target="_blank" rel="noopener noreferrer" href="' + h(x.url) + '">🔎 ' + h(x.name) + '에서 "' + h(title() || '곡 제목') + ' 가사" 찾기</a>'; }).join('') + '</div>' +
          '<div class="ht-row"><button type="button" class="ht-b" data-l="gopaste">복사했어요 → 붙여넣기로</button></div>';
      }
    }
    function sheetFor(song) {
      if (!song) return null; var k = keyOf(song.title); if (k.length < 2) return null;
      return sheets.filter(function (s) { return keyOf(s.name).indexOf(k) >= 0; })[0] || null;
    }
    function opts() { var c = $('[data-l="chords"]', host), l = $('[data-l="labels"]', host); return { keepChords: !!(c && c.checked), labels: !l || l.checked, title: title() }; }

    function extract(ocr) {
      var sel = Q('sheet'); if (!sel || !sel.value) { say('악보를 골라주세요.', 'bad'); return; }
      var LY = root.YNLyrics; if (!LY) { say('가사 추출 도구를 불러오지 못했습니다. 페이지를 새로고침해 주세요.', 'bad'); return; }
      say('악보를 불러오는 중…');
      loadSheetDoc(sel.value).then(function (d) {
        var rg = parseRanges(Q('range').value, d.n), pages = rg.pages.length ? rg.pages : null;
        if (rg.bad.length) { say('전체 ' + d.n + '쪽 안에서 골라주세요. (알 수 없는 값: ' + rg.bad.join(', ') + ')', 'bad'); return; }
        if (d.img || ocr) return ocrPages(d, pages || [1], LY);
        return LY.extractPdf(d.pdf, { pages: pages, onProgress: function (n, t) { say('글자를 읽는 중… ' + n + '/' + t); } }).then(function (r) {
          if (!r.hasText) { say('이 악보에는 글자 정보가 없습니다 (그림 악보). "글자가 안 나오면 (OCR)" 을 눌러 주세요.', 'bad'); return; }
          setText(LY.build(r.lines, opts()).text); say('뽑았습니다 — 틀린 곳은 직접 고쳐 주세요.', 'ok');
        });
      }).catch(function (e) { say('추출 실패: ' + ((e && e.message) || e), 'bad'); });
    }
    function ocrPages(d, pages, LY) {
      var all = [], p = Promise.resolve();
      pages.slice(0, 6).forEach(function (pg) {
        p = p.then(function () { var cv = doc.createElement('canvas'); return drawPage(d, pg, cv, 1400).then(function () { say('OCR 준비 중… (처음에는 1분쯤 걸릴 수 있어요)'); return LY.ocrCanvas(cv, function (x) { say('OCR 읽는 중… ' + pg + '쪽 ' + x + '%'); }); }).then(function (ls) { all = all.concat(ls); }); });
      });
      return p.then(function () { setText(LY.build(all, opts()).text); say(all.length ? 'OCR 로 읽었습니다 — 틀린 글자가 있을 수 있으니 확인해 주세요.' : '읽은 글자가 없습니다.', all.length ? 'ok' : 'bad'); });
    }

    /* ---- 이벤트 */
    host.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-src],button[data-l]') : null; if (!b) return;
      if (b.dataset.src) { st.src = b.dataset.src; paintSrc(); return; }
      var a = b.dataset.l;
      if (a === 'extract') extract(false); else if (a === 'ocr') extract(true);
      else if (a === 'clean') { var raw = $('[data-l="paste"]', host).value; if (!raw.trim()) { say('붙여넣은 글이 없습니다.', 'bad'); return; } var out = cleanLyrics(raw, opts()); setText(out); say(out ? '정리했습니다 — 틀린 곳은 직접 고쳐 주세요.' : '가사로 볼 만한 글이 없습니다.', out ? 'ok' : 'bad'); }
      else if (a === 'gopaste') { st.src = 'paste'; paintSrc(); }
      else if (a === 'save') save();
      else if (a === 'show') showBroadcast(false);
      else if (a === 'showall') showBroadcast(true);
      else if (a === 'copy') copy();
      else if (a === 'txt') txt();
      else if (a === 'del') del();
    });
    Q('song').onchange = function () { chooseSong(this.value); };
    Q('title').addEventListener('input', function () { st.title = this.value; st.songIdx = ''; Q('song').value = ''; updStat(); if (st.src === 'web') paintSrc(); });
    Q('title').addEventListener('change', function () { var sv = savedFor(title()); if (sv && !Q('text').value.trim()) { setText(sv.text); say('저장된 가사를 불러왔습니다.', 'ok'); } });
    Q('text').addEventListener('input', function () { st.text = this.value; updStat(); });

    function need() { var t = title(), tx = Q('text').value; if (!t) { say('곡 제목을 골라주세요.', 'bad'); return null; } return { t: t, x: tx }; }
    function save() {
      var n = need(); if (!n) return; if (!n.x.trim()) { say('저장할 가사가 없습니다.', 'bad'); return; }
      say('저장하는 중…');
      call('worshipLyricsSave', [C.token(), n.t, n.x]).then(function (r) { st.saved = r.lyrics || st.saved; updStat(); say('저장했습니다 — 방송 화면에서 바로 쓸 수 있어요.', 'ok'); }, function (e) { say(e.message || '저장하지 못했습니다.', 'bad'); });
    }
    function del() {
      var n = need(); if (!n) return; if (!savedFor(n.t)) { say('저장된 가사가 없습니다.', 'bad'); return; }
      if (!root.confirm('"' + n.t + '" 의 저장된 가사를 지울까요?')) return;
      call('worshipLyricsRemove', [C.token(), n.t]).then(function (r) { st.saved = r.lyrics || {}; updStat(); say('보관본을 지웠습니다.', 'ok'); }, function (e) { say(e.message || '지우지 못했습니다.', 'bad'); });
    }
    function copy() {
      var t = Q('text').value; if (!t) { say('복사할 내용이 없습니다.', 'bad'); return; }
      (root.navigator && navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { say('복사했습니다.', 'ok'); }).catch(function () { try { Q('text').select(); doc.execCommand('copy'); say('복사했습니다.', 'ok'); } catch (e) { say('복사하지 못했습니다. 글을 선택해서 직접 복사해 주세요.', 'bad'); } });
    }
    function download(name, text) {
      var b = new root.Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' }), a = doc.createElement('a');
      a.href = root.URL.createObjectURL(b); a.download = name; doc.body.appendChild(a); a.click(); setTimeout(function () { root.URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function txt() { var n = need(); if (!n) return; if (!n.x) { say('저장할 내용이 없습니다.', 'bad'); return; } download(n.t.replace(/[\\/:*?"<>|]/g, '_') + '.txt', n.x); }

    /** 방송 화면 — 이 곡만, 또는 콘티 순서대로 가사가 있는 모든 곡 */
    function showBroadcast(all) {
      var list = [];
      if (all) {
        songs.forEach(function (s) {
          var t = (keyOf(s.title) === keyOf(title()) ? Q('text').value : '') || (savedFor(s.title) || {}).text || '';
          if (t.trim()) list.push({ title: s.title, text: t });
        });
        if (!list.length) { say('저장된 가사가 있는 곡이 없습니다. 곡마다 가사를 저장해 주세요.', 'bad'); return; }
      } else {
        var n = need(); if (!n) return; if (!n.x.trim()) { say('보여줄 가사가 없습니다.', 'bad'); return; }
        list.push({ title: n.t, text: n.x });
      }
      openBroadcast(list, st.max, function (mx) { st.max = mx; });
    }

    /* ---- 시작 */
    if (!st.saved && !st.savedLoading) {
      st.savedLoading = true;
      call('worshipLyricsList', [C.token()]).then(function (r) { st.saved = r || {}; st.savedLoading = false; if (host.isConnected) { updStat(); if (!Q('text').value.trim() && title() && savedFor(title())) { setText(savedFor(title()).text); } } },
        function () { st.saved = {}; st.savedLoading = false; });
    }
    if (st.songIdx !== '') Q('song').value = String(st.songIdx);
    Q('title').value = st.title || ''; Q('text').value = st.text || '';
    paintSrc(); updStat();
    return { host: host };
  }

  /* ---------------------------------------------------------------- 📺 방송 화면 */
  function openBroadcast(list, maxLines, onMax) {
    var max = maxLines || 4, fs = 0, idx = 0, black = false, slides = [];
    var back = el('div', 'ht ht-bc');
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', '방송 가사 화면'); back.tabIndex = -1;
    back.innerHTML = '<div class="ht-bcbar"><b class="ht-bct"></b><span class="grow"></span><label class="ht-bcl">줄 수 <select data-b="max">' + [2, 3, 4, 5, 6, 8].map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('') + '</select></label>' +
      '<button type="button" data-b="fm" title="글씨 작게 (−)">A−</button><button type="button" data-b="fp" title="글씨 크게 (+)">A＋</button><button type="button" data-b="blk" title="검은 화면 (B)">■</button>' +
      '<button type="button" data-b="full" title="전체 화면 (F)">⛶</button><button type="button" data-b="x" title="닫기 (Esc)">✕</button></div>' +
      '<div class="ht-bcstage" data-b="stage"><div class="ht-bclabel" data-b="label"></div><div class="ht-bctext" data-b="text"></div></div>' +
      '<div class="ht-bcnav"><button type="button" data-b="prev" aria-label="이전 (←)">‹</button><span data-b="pos"></span><button type="button" data-b="next" aria-label="다음 (→)">›</button></div>' +
      '<div class="ht-bchint">← → 넘기기 · Space 다음 · B 검은 화면 · F 전체 화면 · Esc 닫기</div>';
    doc.body.appendChild(back); doc.body.classList.add('ht-lock');
    var Q = function (k) { return $('[data-b="' + k + '"]', back); };
    function build() {
      slides = [];
      list.forEach(function (s) {
        var sl = slidesFrom(s.text, { maxLines: max });
        sl.forEach(function (x, i) { slides.push({ song: s.title, first: i === 0, label: x.label, text: x.text, lines: x.lines.length, n: i + 1, of: sl.length }); });
      });
      if (idx >= slides.length) idx = Math.max(0, slides.length - 1);
    }
    function fit() {
      var s = slides[idx], stage = Q('stage'), t = Q('text'); if (!s) return;
      var auto = fs ? fs : Math.max(20, Math.min(stage.clientHeight / (s.lines * 1.5 + 0.5), stage.clientWidth / 14, 140));
      t.style.fontSize = auto + 'px';
      if (!fs) {                                                              // 긴 줄이 화면을 넘으면 글씨를 더 줄입니다
        var g = 0; while ((t.scrollWidth > stage.clientWidth - 8 || t.scrollHeight > stage.clientHeight - 8) && auto > 16 && g++ < 40) { auto -= 3; t.style.fontSize = auto + 'px'; }
      }
    }
    function paint() {
      var s = slides[idx];
      back.classList.toggle('black', black);
      $('.ht-bct', back).textContent = s ? s.song : '';
      Q('label').textContent = s && s.label ? s.label + (s.of > 1 ? ' (' + s.n + '/' + s.of + ')' : '') : '';
      Q('text').textContent = s ? s.text : '';
      Q('pos').textContent = slides.length ? (idx + 1) + ' / ' + slides.length : '';
      Q('prev').disabled = idx <= 0; Q('next').disabled = idx >= slides.length - 1;
      fit();
    }
    function go(n) { if (n < 0 || n >= slides.length) return; idx = n; black = false; paint(); }
    function close() { doc.removeEventListener('keydown', key, true); root.removeEventListener('resize', fit); try { if (doc.fullscreenElement) doc.exitFullscreen(); } catch (e) {} back.remove(); if (!openModals.length) doc.body.classList.remove('ht-lock'); }
    function key(e) {
      if (!back.isConnected) return;
      var k = e.key, tg = e.target && e.target.tagName;
      if (tg === 'SELECT' && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown')) return;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); e.stopPropagation(); go(idx + 1); }
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); go(idx - 1); }
      else if (k === 'Home') { e.preventDefault(); go(0); } else if (k === 'End') { e.preventDefault(); go(slides.length - 1); }
      else if (k === 'b' || k === 'B' || k === '.') { black = !black; paint(); }
      else if (k === 'f' || k === 'F') full();
      else if (k === '+' || k === '=') { fs = Math.min(200, (fs || parseFloat(Q('text').style.fontSize) || 60) + 6); fit(); }
      else if (k === '-' || k === '_') { fs = Math.max(16, (fs || parseFloat(Q('text').style.fontSize) || 60) - 6); fit(); }
    }
    function full() { try { if (doc.fullscreenElement) doc.exitFullscreen(); else if (back.requestFullscreen) back.requestFullscreen(); } catch (e) {} }
    back.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-b]') : null;
      if (b) {
        var a = b.dataset.b;
        if (a === 'x') close(); else if (a === 'prev') go(idx - 1); else if (a === 'next') go(idx + 1); else if (a === 'full') full();
        else if (a === 'blk') { black = !black; paint(); }
        else if (a === 'fp') { fs = Math.min(200, (fs || parseFloat(Q('text').style.fontSize) || 60) + 6); fit(); }
        else if (a === 'fm') { fs = Math.max(16, (fs || parseFloat(Q('text').style.fontSize) || 60) - 6); fit(); }
        return;
      }
      if (e.target.closest && e.target.closest('.ht-bcbar')) return;
      if (e.target.closest && e.target.closest('.ht-bcnav')) return;
      var r = back.getBoundingClientRect(); if (e.clientX - r.left < r.width / 3) go(idx - 1); else go(idx + 1);       // 화면 왼쪽 1/3 = 이전, 나머지 = 다음
    });
    Q('max').value = String(max);
    Q('max').onchange = function () { max = +this.value; if (onMax) onMax(max); fs = 0; build(); paint(); };
    doc.addEventListener('keydown', key, true); root.addEventListener('resize', fit);
    build(); paint(); back.focus();
    return { close: close, go: go, el: back };
  }

  function init(c) { CTX = c; }

  return Object.assign({ init: init, openRepo: openRepo, openClip: openClip, mountLyrics: mountLyrics, openBroadcast: openBroadcast, loadSheetDoc: loadSheetDoc, state: LYS }, PURE);
}));
