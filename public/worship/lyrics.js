/**
 * 가사 추출기 — 악보 PDF 의 글자층(text layer)에서 가사만 뽑아 절 · 후렴별로 정리합니다
 * ------------------------------------------------------------
 *  · pdf.js 의 getTextContent() 결과를 줄 단위로 묶고, 각 줄을 "코드줄 / 절 표시 / 가사 / 기타" 로 분류
 *  · 코드줄(G  D/F#  Em7 …)은 기본으로 빼고, [G] 처럼 가사 속에 끼어 있는 코드도 지웁니다
 *  · 글자층이 없는 그림(스캔) 악보는 OCR(tesseract.js, 필요할 때만 CDN 에서 내려받음)로 대신합니다
 * 분류 · 조립 함수는 순수 함수라 Node 에서도 시험합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YNLyrics = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CHORD = /^[A-G][#b♯♭]?(?:maj|min|m|M|dim|aug|sus|add|\+|°|ø)?\d{0,2}(?:(?:sus|add|maj|b|#)\d{1,2})*(?:\/[A-G][#b♯♭]?)?$/;
  var SECTION = /^[\[\(\{<]?\s*(?:(?:verse|vs?|chorus|ch|c|pre[- ]?chorus|pc|bridge|br|b|intro|outro|interlude|tag|ending|vamp|coda|refrain|instrumental)\s*\.?\s*\d*|\d+\s*절|후렴|후렴구|브릿지|브리지|전주|간주|후주|인트로|엔딩|아웃트로|[1-9]\s*[\.\)])\s*[\]\)\}>]?\s*:?$/i;
  var SECTION_LEAD = /^[\[\(\{<]?\s*(verse|chorus|pre[- ]?chorus|bridge|intro|outro|interlude|tag|ending|vamp|후렴|브릿지|브리지|전주|간주|후주|인트로|엔딩)\s*\.?\s*(\d*)\s*[\]\)\}>]?\s*[:：]?\s*(.*)$/i;

  var CANON = [
    [/^pre[- ]?chorus|^pc/i, 'Pre-chorus'], [/^chorus|^ch\b|^c\d*$|^후렴|^refrain/i, 'Chorus'], [/^verse|^v\d*$|^vs|^\d+\s*절/i, 'Verse'],
    [/^bridge|^br\b|^b\d*$|^브릿지|^브리지/i, 'Bridge'], [/^intro|^인트로|^전주/i, 'Intro'], [/^outro|^ending|^후주|^엔딩|^아웃트로|^coda/i, 'Ending'],
    [/^interlude|^간주/i, 'Interlude'], [/^tag/i, 'Tag'], [/^vamp/i, 'Vamp'], [/^instrumental/i, 'Interlude']
  ];
  function canonSection(raw) {
    var s = String(raw || '').replace(/[\[\]\(\)\{\}<>:：.]/g, '').trim(), num = (/\d+/.exec(s) || [''])[0];
    if (/^\d+$/.test(s)) return 'Verse ' + s;
    for (var i = 0; i < CANON.length; i++) if (CANON[i][0].test(s)) return CANON[i][1] + (num ? ' ' + num : '');
    return s;
  }

  function tokens(text) { return String(text || '').replace(/[|｜]/g, ' ').replace(/[()（）]/g, ' ').split(/\s+/).filter(Boolean); }

  /** 코드줄인가? — "G  D/F#  Em7  C" 처럼 모든 토큰이 코드이고, 한 글자 A 같은 애매한 경우는 제외 */
  function isChordLine(text) {
    var t = tokens(text).filter(function (x) { return !/^[-–—%.·xX×0-9]+$/.test(x) && x !== '/'; });
    if (!t.length) return false;
    for (var i = 0; i < t.length; i++) if (!CHORD.test(t[i])) return false;
    if (t.length === 1 && /^[A-G]$/.test(t[0])) return false;     // "A" 한 글자 = 영어 단어일 수 있음
    return true;
  }
  function isSectionLine(text) { return SECTION.test(String(text || '').trim()) && String(text).trim().length <= 20; }

  /** 가사 속 코드 표시 제거: [G] (Am7) {D} */
  function stripInlineChords(s) {
    return String(s || '').replace(/[\[\{]\s*[A-G][^\]\}]{0,10}[\]\}]/g, '').replace(/\(\s*[A-G][#b♯♭]?(?:m|maj|min|dim|aug|sus|add)?\d{0,2}(?:\/[A-G][#b♯♭]?)?\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  function classify(text) {
    var t = String(text || '').replace(/ /g, ' ').trim();
    if (!t) return { kind: 'blank', text: '' };
    if (/^\d+$/.test(t) && +t < 400 && t.length <= 3) return { kind: 'meta', text: t };   // 쪽 번호
    if (isSectionLine(t)) return { kind: 'section', text: canonSection(t) };
    var m = SECTION_LEAD.exec(t);
    if (m && m[3] && m[3].length > 1 && /^[\[\(\{<]|[:：]/.test(t)) return { kind: 'section', text: canonSection(m[1] + ' ' + m[2]), rest: m[3] };
    if (isChordLine(t)) return { kind: 'chord', text: t };
    if (/^(?:key|bpm|tempo|capo|©|copyright|ccli|words? (?:and|&)|music by|arr\.?|작사|작곡|편곡)\b/i.test(t) || /^(?:key|bpm|tempo)\s*[:=]/i.test(t) || /^\W*[A-G][#b]?m?\s*key\b/i.test(t)) return { kind: 'meta', text: t };
    return { kind: 'lyric', text: t };
  }

  /**
   * pdf.js textContent.items → 줄 목록. 같은 줄(y 가 비슷)끼리 x 순서로 이어 붙이고, 간격이 크면 공백을 넣습니다.
   * items: [{str, transform:[a,b,c,d,x,y], width, height}]
   */
  function linesFromItems(items) {
    var it = (items || []).filter(function (i) { return i && typeof i.str === 'string' && i.str.length && i.transform; }).map(function (i) {
      return { s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.height || i.transform[3] || 10) };
    });
    it.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var rows = [];
    it.forEach(function (i) {
      var r = rows[rows.length - 1];
      if (r && Math.abs(r.y - i.y) <= Math.max(2, Math.min(r.h, i.h) * 0.45)) { r.parts.push(i); }
      else rows.push({ y: i.y, h: i.h, parts: [i] });
    });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var out = '', end = null;
      r.parts.forEach(function (p) {
        if (end != null) { var gap = p.x - end, sp = Math.max(1.5, r.h * 0.25); if (gap > sp * 3) out += '   '; else if (gap > sp && !/\s$/.test(out) && !/^\s/.test(p.s)) out += ' '; }
        out += p.s; end = p.x + p.w;
      });
      return { y: r.y, h: r.h, text: out.replace(/\s+$/, '') };
    });
  }

  /** 줄에서 큰 세로 간격 = 단락 나눔 */
  function withBreaks(lines) {
    var gaps = []; for (var i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
    var sorted = gaps.slice().sort(function (a, b) { return a - b; }), med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    var out = [];
    lines.forEach(function (l, i) { if (i > 0 && med > 0 && (lines[i - 1].y - l.y) > med * 1.6) out.push({ text: '', y: l.y, h: l.h, brk: true }); out.push(l); });
    return out;
  }

  /**
   * 조립: 분류된 줄 → { sections:[{label, lines:[..]}], text }
   * opt.keepChords: 코드줄 남기기 (기본 false) / opt.keepMeta / opt.labels (절 표시 넣기 기본 true) / opt.dedupe (연속 같은 줄 합치기)
   */
  function build(rawLines, opt) {
    opt = opt || {};
    var labels = opt.labels !== false;
    var secs = [], cur = { label: '', lines: [] };
    function push() { while (cur.lines.length && cur.lines[cur.lines.length - 1] === '') cur.lines.pop(); if (cur.label || cur.lines.length) secs.push(cur); }
    rawLines.forEach(function (l) {
      var c = classify(l.text);
      if (c.kind === 'section') { push(); cur = { label: c.text, lines: [] }; if (c.rest) cur.lines.push(stripInlineChords(c.rest)); return; }
      if (c.kind === 'blank' || l.brk) { if (cur.lines.length && cur.lines[cur.lines.length - 1] !== '') cur.lines.push(''); return; }
      if (c.kind === 'chord') { if (opt.keepChords) cur.lines.push(c.text); return; }
      if (c.kind === 'meta') { if (opt.keepMeta) cur.lines.push(c.text); return; }
      var t = opt.keepChords ? c.text : stripInlineChords(c.text);
      if (t) cur.lines.push(t);
    });
    push();
    if (opt.dedupe) {
      var seen = {};
      secs = secs.filter(function (s) { var k = s.label.replace(/\s*\d+$/, '') + '|' + s.lines.join('\n'); if (s.label && /chorus|후렴/i.test(s.label) && seen[k]) return false; seen[k] = 1; return true; });
    }
    var text = secs.map(function (s) { return (labels && s.label ? '[' + s.label + ']\n' : '') + s.lines.join('\n'); }).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    return { sections: secs, text: text };
  }

  /* ---------- pdf.js 연결 ---------- */
  function extractPdf(pdf, o) {
    o = o || {};
    var pages = o.pages && o.pages.length ? o.pages : Array.apply(null, Array(pdf.numPages)).map(function (_, i) { return i + 1; });
    var all = [], chars = 0;
    return pages.reduce(function (p, n) {
      return p.then(function () {
        if (o.onProgress) o.onProgress(n, pages.length);
        return pdf.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var ls = withBreaks(linesFromItems(tc.items)); ls.forEach(function (l) { chars += l.text.length; });
          all = all.concat(ls); all.push({ text: '', y: 0, h: 0, brk: true });
        });
      });
    }, Promise.resolve()).then(function () { return { lines: all, chars: chars, hasText: chars > 15 }; });
  }

  /* ---------- OCR (필요할 때만) ---------- */
  var OCR_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  function loadOcr() {
    return new Promise(function (res, rej) {
      if (typeof Tesseract !== 'undefined') return res(Tesseract);
      var s = document.createElement('script'); s.src = OCR_URL; s.async = true;
      s.onload = function () { typeof Tesseract !== 'undefined' ? res(Tesseract) : rej(new Error('OCR 도구를 불러오지 못했습니다')); };
      s.onerror = function () { rej(new Error('OCR 도구를 내려받지 못했습니다 (인터넷 연결을 확인해 주세요)')); };
      document.head.appendChild(s);
    });
  }
  function ocrCanvas(canvas, onProgress) {
    return loadOcr().then(function (T) {
      return T.recognize(canvas, 'kor+eng', { logger: function (m) { if (onProgress && m && m.status === 'recognizing text') onProgress(Math.round((m.progress || 0) * 100)); } });
    }).then(function (r) {
      var t = (r && r.data && r.data.text) || '';
      return t.split(/\r?\n/).map(function (x, i) { return { text: x.trim(), y: -i * 10, h: 10, brk: !x.trim() }; });
    });
  }

  /* ---------- UI ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function download(name, text) {
    var b = new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /**
   * mount(host, { getPdf:()=>pdfDoc|null, getPage:()=>현재쪽번호, getCanvas:()=>화면 canvas, title, onError })
   */
  function mount(host, opt) {
    opt = opt || {};
    host.innerHTML = ''; host.classList.add('ly-root');
    var bar = el('div', 'ly-bar'), out = el('textarea', 'ly-out'), info = el('div', 'ly-info');
    var bPage = el('button', 'ly-btn', '이 쪽에서 추출'), bAll = el('button', 'ly-btn', '전체 쪽에서 추출'), bOcr = el('button', 'ly-btn ghost', '글자가 안 나오면 (OCR)');
    var cChords = document.createElement('input'); cChords.type = 'checkbox';
    var lC = el('label', 'ly-chk'); lC.appendChild(cChords); lC.appendChild(document.createTextNode(' 코드 포함'));
    var cLab = document.createElement('input'); cLab.type = 'checkbox'; cLab.checked = true;
    var lL = el('label', 'ly-chk'); lL.appendChild(cLab); lL.appendChild(document.createTextNode(' [절] 표시'));
    var bCopy = el('button', 'ly-btn ghost', '복사'), bDl = el('button', 'ly-btn ghost', '.txt 저장');
    [bPage, bAll, bOcr, lC, lL, bCopy, bDl].forEach(function (x) { bar.appendChild(x); });
    out.placeholder = '여기에 가사가 나옵니다. 직접 고칠 수도 있습니다.'; out.spellcheck = false;
    host.appendChild(bar); host.appendChild(out); host.appendChild(info);
    var last = null, busy = false;
    function say(t, bad) { info.textContent = t || ''; info.className = 'ly-info' + (bad ? ' bad' : ''); }
    function fail(m) { say(m, true); try { if (opt.onError) opt.onError(m); } catch (e) {} }
    function render() { if (!last) return; out.value = build(last, { keepChords: cChords.checked, labels: cLab.checked }).text; say(out.value ? '추출 완료 — 틀린 곳은 직접 고쳐 주세요.' : '가사로 볼 만한 글자가 없습니다. (스캔한 그림이라면 OCR 을 눌러 보세요)', !out.value); }
    function run(all) {
      if (busy) return;
      var pdf = opt.getPdf && opt.getPdf();
      if (!pdf) { fail('PDF 악보가 열려 있어야 합니다. (사진 악보는 OCR 을 눌러 주세요)'); return; }
      busy = true; say('글자를 읽는 중…');
      extractPdf(pdf, { pages: all ? null : [Math.max(1, (opt.getPage && opt.getPage()) || 1)], onProgress: function (n, t) { say('글자를 읽는 중… ' + n + '/' + t); } })
        .then(function (r) { busy = false; if (!r.hasText) { last = null; out.value = ''; fail('이 악보에는 글자 정보가 없습니다 (그림 악보). 아래 OCR 버튼을 눌러 주세요.'); return; } last = r.lines; render(); })
        .catch(function (e) { busy = false; fail('추출 실패: ' + (e && e.message || e)); });
    }
    bPage.onclick = function () { run(false); }; bAll.onclick = function () { run(true); };
    bOcr.onclick = function () {
      if (busy) return; var cv = opt.getCanvas && opt.getCanvas();
      if (!cv) { fail('악보가 화면에 있어야 OCR 을 할 수 있습니다.'); return; }
      busy = true; say('OCR 준비 중… (처음에는 언어 자료를 내려받느라 1분 정도 걸릴 수 있습니다)');
      ocrCanvas(cv, function (p) { say('OCR 읽는 중… ' + p + '%'); }).then(function (ls) { busy = false; last = ls; render(); })
        .catch(function (e) { busy = false; fail('OCR 실패: ' + (e && e.message || e)); });
    };
    cChords.onchange = render; cLab.onchange = render;
    bCopy.onclick = function () {
      var t = out.value; if (!t) { say('복사할 내용이 없습니다.', true); return; }
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { say('복사했습니다.'); }).catch(function () { try { out.select(); document.execCommand('copy'); say('복사했습니다.'); } catch (e) { say('복사할 수 없습니다. 직접 선택해서 복사해 주세요.', true); } });
    };
    bDl.onclick = function () { if (!out.value) { say('저장할 내용이 없습니다.', true); return; } try { download(((opt.title || '가사') + '').replace(/[\\/:*?"<>|]/g, '_') + '.txt', out.value); } catch (e) { fail('저장 실패: ' + e.message); } };
    return { destroy: function () { host.innerHTML = ''; }, getText: function () { return out.value; } };
  }

  return { isChordLine: isChordLine, isSectionLine: isSectionLine, classify: classify, canonSection: canonSection, stripInlineChords: stripInlineChords,
    linesFromItems: linesFromItems, withBreaks: withBreaks, build: build, extractPdf: extractPdf, ocrCanvas: ocrCanvas, mount: mount };
}));
