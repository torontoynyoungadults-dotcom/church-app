/**
 * 연습 모드 — 찬양 악보를 크게 열어 필기 · 송폼 · 메트로놈 · 음정 · 가사를 한 화면에서 쓰는 전체 화면 뷰어
 * ------------------------------------------------------------
 *  YNPractice.open({ token, room, sheets:[{id,name}], songs:[{title,key,bpm,form}], start:악보ID, canEdit, callServer })
 *
 *  · 레이아웃: 📱 태블릿(큰 버튼 · 펜 우선 · 화면 가장자리 탭으로 넘김 · 도구 막대 떠 있음)  /  💻 컴퓨터(위 도구줄 · 오른쪽 패널 · 단축키)
 *  · 리더-팔로워: 리더가 넘기는 악보 · 쪽 · 확대를 모두가 따라감. "따라가기" 스위치로 사람마다 끌 수 있음 (끄면 내 화면은 그대로)
 *  · 필기: anno.js (펜 · 형광펜 · 글자/코드 · 기호). 팀 공유는 rt.js(Socket.io)로 실시간, 나만 보기는 서버(구글 시트)에 저장
 *  · 패널(송폼 · 메트로놈 · 음정 · 가사 · 함께)은 practice-panels.js 에 있습니다
 * 실시간 연결이 없어도(오프라인 · 서버 문제) 혼자 보기 · 나만 보기 필기는 그대로 동작합니다.
 */
(function (root) {
  'use strict';
  var doc = root.document;

  /* ------------------------------------------------------------ 작은 도구 */
  function ls(k, v) { try { if (v === undefined) return root.localStorage.getItem('yn.pv.' + k); root.localStorage.setItem('yn.pv.' + k, v); } catch (e) { /* 저장이 막힌 브라우저 */ } return null; }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var scripts = {};
  function loadScript(src, ready) {
    if (ready && ready()) return Promise.resolve();
    if (scripts[src]) return scripts[src];
    return (scripts[src] = new Promise(function (res, rej) {
      var s = doc.createElement('script'); s.src = src; s.async = true;
      s.onload = function () { res(); }; s.onerror = function () { delete scripts[src]; rej(new Error('필요한 도구를 불러오지 못했습니다 (' + src + ')')); };
      doc.head.appendChild(s);
    }));
  }
  function detectLayout() {
    var saved = ls('layout');
    if (saved === 'tablet' || saved === 'computer') return saved;
    var coarse = false; try { coarse = root.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    return (coarse && root.innerWidth < 1400) || root.innerWidth < 900 ? 'tablet' : 'computer';
  }
  /** 송폼 칸(V1, C2 …)에서 메트로놈 큐 이름으로 */
  var CUE_MAP = { V: 'v1', V1: 'v1', V2: 'v2', V3: 'v3', C: 'c', C2: 'c', C3: 'c', PC: 'pc', PC2: 'pc', B: 'b', B1: 'b', B2: 'b', Intro: 'intro',
    Itld: 'itld', Inst: 'itld', Out: 'end', End: 'end', Coda: 'end', Vamp: 'vamp', Solo: 'solo', Break: 'break' };
  function cueIdFor(k) { return CUE_MAP[k] || null; }
  function normName(s) { return String(s || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\s_\-\.\(\)\[\]·,]/g, ''); }
  /** 악보 파일 이름에서 어느 곡인지 짐작 (제목이 파일 이름에 들어 있으면) */
  function guessSong(name, songs) {
    var n = normName(name), best = -1, bl = 0;
    (songs || []).forEach(function (s, i) { var t = normName(s.title); if (t.length >= 2 && n.indexOf(t) >= 0 && t.length > bl) { best = i; bl = t.length; } });
    return best;
  }

  var TOOLS = [
    { t: 'none', ic: '✋', n: '이동' }, { t: 'pen', ic: '✏️', n: '펜' }, { t: 'hl', ic: '🖍', n: '형광펜' }, { t: 'text', ic: 'T', n: '글자' },
    { t: 'chord', ic: 'Am', n: '코드' }, { t: 'sym', ic: '♯', n: '기호' }, { t: 'eraser', ic: '⌫', n: '지우개' }
  ];
  var current = null;

  function open(opts) {
    opts = opts || {};
    if (current) { try { current.close(); } catch (e) {} }
    if (!doc || !doc.body) return null;
    var sheets = (opts.sheets || []).filter(function (s) { return s && s.id; });
    var songs = opts.songs || [];
    if (!sheets.length) { try { root.alert('열 수 있는 악보가 없습니다. 먼저 악보(PDF · 사진)를 올려주세요.'); } catch (e) {} return null; }

    var S = {
      layout: detectLayout(), hand: ls('hand') === 'left' ? 'left' : 'right', fit: null, zoom: 1, sheetIdx: 0, page: 1, pages: 1, songIdx: -1,
      doc: null, rid: 0, task: null, tab: '', layer: 'team', scope: 'song', follow: true, pendingNav: null, applying: false, navT: 0, dead: false,
      scopeOf: {}, unsent: {}, localMine: {}, delMine: {}, mineLoaded: {}, teamFrom: {}, annoId: 0, mineDirty: {}, mineT: 0, minePend: 0, savedAt: 0, msgT: 0, lang: ls('lang') === 'ko' ? 'ko' : 'en',
      recvCue: ls('recvcue') !== '0', sendCue: ls('sendcue') !== '0', wake: null, loadId: 0, cache: {}, cacheOrder: []
    };
    S.fit = S.layout === 'tablet' ? 'page' : 'width';
    var startIdx = 0; sheets.forEach(function (s, i) { if (s.id === opts.start) startIdx = i; }); S.sheetIdx = startIdx;

    /* ------------------------------------------------------------ 화면 뼈대 */
    var el = doc.createElement('div');
    el.className = 'pv';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '연습 모드');
    el.innerHTML =
      '<header class="pv-top">' +
        '<button class="pv-b" data-a="close" title="닫기 (Esc)">✕</button>' +
        '<div class="pv-title"><select class="pv-sel pv-sheetsel" aria-label="악보 선택"></select><span class="pv-songinfo"></span></div>' +
        '<div class="pv-grp pv-pager"><button class="pv-b" data-a="prev" title="이전 쪽 (←)">‹</button><span class="pv-pg">1 / 1</span><button class="pv-b" data-a="next" title="다음 쪽 (→)">›</button></div>' +
        '<div class="pv-grp pv-zoom"><button class="pv-b" data-a="zout" title="줄이기 (-)">−</button><button class="pv-b" data-a="zfit" title="화면에 맞춤">맞춤</button><button class="pv-b" data-a="zin" title="키우기 (+)">＋</button></div>' +
        '<div class="pv-grp pv-seg pv-layoutseg" role="group" aria-label="화면 배치"><button data-layout="tablet" title="태블릿 화면">📱 태블릿</button><button data-layout="computer" title="컴퓨터 화면">💻 컴퓨터</button></div>' +
        '<div class="pv-grp pv-chips"><span class="pv-chip pv-conn" title="실시간 연결">…</span><button class="pv-chip pv-lead" data-a="tab:together" title="리더 · 함께 보기"></button><button class="pv-chip pv-follow" data-a="follow" title="리더 화면 따라가기 켜기/끄기"></button></div>' +
        '<button class="pv-b pv-panelbtn" data-a="panel" title="패널 열기/닫기">☰</button>' +
      '</header>' +
      '<div class="pv-main">' +
        '<div class="pv-tools" role="toolbar" aria-label="필기 도구"></div>' +
        '<div class="pv-stage"><div class="pv-pagebox"><canvas class="pv-pdf"></canvas><canvas class="pv-anno"></canvas></div>' +
          '<div class="pv-loading">악보를 불러오는 중…</div><div class="pv-toast" role="status" aria-live="polite"></div><div class="pv-sympop"></div></div>' +
        '<aside class="pv-side"><nav class="pv-tabs" role="tablist"></nav><div class="pv-panes"></div></aside>' +
        '<button type="button" class="pv-toolsbtn" aria-pressed="true" aria-label="필기 도구 숨기기" title="필기 도구 숨기기 / 보이기"><span class="ic">▴</span><span class="nm">도구</span></button>' +
      '</div>';
    doc.body.appendChild(el); doc.body.classList.add('pv-lock');
    function $(sel) { return el.querySelector(sel); }
    var stage = $('.pv-stage'), box = $('.pv-pagebox'), pdfCv = $('.pv-pdf'), annoCv = $('.pv-anno'), loading = $('.pv-loading'), toastEl = $('.pv-toast');
    var toolsEl = $('.pv-tools'), sideEl = $('.pv-side'), tabsEl = $('.pv-tabs'), panesEl = $('.pv-panes'), sheetSel = $('.pv-sheetsel');

    function toast(t, bad, ms) {
      toastEl.textContent = t || ''; toastEl.className = 'pv-toast' + (t ? ' show' : '') + (bad ? ' bad' : '');
      clearTimeout(S.msgT); if (t) S.msgT = setTimeout(function () { toastEl.className = 'pv-toast'; }, ms || (bad ? 5000 : 2200));
    }

    sheetSel.innerHTML = sheets.map(function (s, i) { return '<option value="' + i + '">' + h(s.name || ('악보 ' + (i + 1))) + '</option>'; }).join('');
    sheetSel.onchange = function () { loadSheet(+sheetSel.value, 1, true); };

    /* ------------------------------------------------------------ 레이아웃 */
    function applyLayout(l, save) {
      S.layout = l === 'tablet' ? 'tablet' : 'computer';
      if (save) { ls('layout', S.layout); S.fit = S.layout === 'tablet' ? 'page' : 'width'; S.zoom = 1; }
      el.classList.toggle('pv-tablet', S.layout === 'tablet'); el.classList.toggle('pv-computer', S.layout === 'computer');
      el.classList.toggle('pv-lefty', S.hand === 'left');
      el.classList.toggle('pv-sideopen', S.layout === 'computer' ? ls('side') !== '0' : false);
      Array.prototype.forEach.call(el.querySelectorAll('[data-layout]'), function (b) { b.classList.toggle('on', b.getAttribute('data-layout') === S.layout); b.setAttribute('aria-pressed', b.getAttribute('data-layout') === S.layout ? 'true' : 'false'); });
      an && an.setPenMode(S.layout === 'tablet' ? 'auto' : 'off');
      if (S.doc) setTimeout(function () { renderPage(); }, 30);
    }
    /* 필기 도구 막대 접기/펴기 — 접으면 악보가 화면 전체 폭을 씁니다. 도구 막대는 그대로 두고 숨기기만 해서 필기 · 실시간 동기화에 영향이 없습니다 */
    var toolsBtn = $('.pv-toolsbtn');
    function setTools(show, save) {
      el.classList.toggle('pv-toolshide', !show);
      toolsBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
      toolsBtn.setAttribute('aria-label', show ? '필기 도구 숨기기' : '필기 도구 보이기');
      toolsBtn.querySelector('.ic').textContent = show ? '▴' : '✏️';
      toolsBtn.querySelector('.nm').textContent = show ? '도구' : '도구 열기';
      if (save) ls('tools', show ? '1' : '0');
      setTimeout(function () { S.doc && renderPage(); }, 60);            // 넓어진(좁아진) 칸에 맞춰 악보를 다시 그림
    }
    toolsBtn.onclick = function () { setTools(el.classList.contains('pv-toolshide'), true); };
    if (ls('tools') === '0') setTools(false, false);
    function toggleSide(force) {
      var on = force != null ? force : !el.classList.contains('pv-sideopen');
      el.classList.toggle('pv-sideopen', on);
      if (S.layout === 'computer') ls('side', on ? '1' : '0');
      if (on && !S.tab && P.tabs.length) showTab(P.tabs[0].id);
      setTimeout(function () { S.doc && renderPage(); }, 260);
    }

    /* ------------------------------------------------------------ 악보 불러오기 · 그리기 */
    function ensurePdfjs() {
      return loadScript('/vendor/pdfjs/pdf.min.js', function () { return !!root.pdfjsLib; }).then(function () {
        try { root.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; } catch (e) {}
      });
    }
    function fetchDoc(f) {
      var c = S.cache[f.id]; if (c) return Promise.resolve(c);
      return fetch('/sheet/' + encodeURIComponent(f.id), { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error(r.status === 404 ? '이 악보를 찾을 수 없습니다 (삭제되었거나 권한이 없습니다).' : '악보를 불러오지 못했습니다 (오류 ' + r.status + ')');
        return r.arrayBuffer();
      }, function () { throw new Error('악보를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'); }).then(function (buf) {
        var u8 = new Uint8Array(buf), isPdf = u8.length > 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46;
        if (isPdf) {
          return ensurePdfjs().then(function () { return root.pdfjsLib.getDocument({ data: u8 }).promise; }).then(function (pdf) { return { pdf: pdf, n: pdf.numPages }; },
            function (e) { throw new Error(e && e.name === 'PasswordException' ? '암호가 걸린 PDF 는 열 수 없습니다.' : 'PDF 를 읽지 못했습니다 (파일이 손상되었을 수 있습니다).'); });
        }
        var type = /^\x89PNG/.test(String.fromCharCode.apply(null, u8.slice(0, 4))) ? 'image/png' : 'image/jpeg';
        var blob = new Blob([u8], { type: type });
        if (root.createImageBitmap) return root.createImageBitmap(blob).then(function (bm) { return { img: bm, n: 1 }; }, function () { throw new Error('사진 악보를 읽지 못했습니다.'); });
        return new Promise(function (res, rej) { var im = new root.Image(); im.onload = function () { res({ img: im, n: 1 }); }; im.onerror = function () { rej(new Error('사진 악보를 읽지 못했습니다.')); }; im.src = root.URL.createObjectURL(blob); });
      }).then(function (d) {
        S.cache[f.id] = d; S.cacheOrder.push(f.id);
        while (S.cacheOrder.length > 5) { var old = S.cacheOrder.shift(); if (S.cache[old] && S.cache[old].pdf && old !== f.id) { try { S.cache[old].pdf.destroy(); } catch (e) {} } delete S.cache[old]; }
        return d;
      });
    }
    function pageInfo(d, pg) {
      if (d.img) return Promise.resolve({ w: d.img.width || d.img.naturalWidth, h: d.img.height || d.img.naturalHeight, draw: function (cv, scale) { var c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(d.img, 0, 0, cv.width, cv.height); return { promise: Promise.resolve(), cancel: function () {} }; } });
      return d.pdf.getPage(pg).then(function (p) {
        var v1 = p.getViewport({ scale: 1 });
        return { w: v1.width, h: v1.height, draw: function (cv, scale) { var v = p.getViewport({ scale: scale }); var t = p.render({ canvasContext: cv.getContext('2d'), viewport: v }); return t; } };
      });
    }
    /** 어떤 쪽이든 canvas 에 그려 줍니다 (화면 · 내보내기 공용). scale = 원본 1 기준 배율 */
    function renderTo(cv, d, pg, scale) {
      return pageInfo(d, pg).then(function (info) {
        cv.width = Math.max(1, Math.round(info.w * scale)); cv.height = Math.max(1, Math.round(info.h * scale));
        var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
        var t = info.draw(cv, scale); return t.promise.then(function () { return info; });
      });
    }
    function fitScale(info) {
      var aw = Math.max(200, stage.clientWidth - (S.layout === 'computer' ? 24 : 8)), ah = Math.max(200, stage.clientHeight - 8);
      var fw = aw / info.w, fh = ah / info.h; return S.fit === 'page' ? Math.min(fw, fh) : fw;
    }
    function renderPage() {
      if (!S.doc || S.dead) return Promise.resolve();
      var id = ++S.rid, pg = S.page, d = S.doc;
      if (S.task) { try { S.task.cancel(); } catch (e) {} S.task = null; }
      return pageInfo(d, pg).then(function (info) {
        if (id !== S.rid) return;
        var base = fitScale(info) * S.zoom, cssW = Math.max(50, Math.floor(info.w * base)), cssH = Math.max(50, Math.floor(info.h * base));
        var dpr = Math.min(2, root.devicePixelRatio || 1); while (cssW * cssH * dpr * dpr > 14e6 && dpr > 1) dpr -= 0.25;
        box.style.width = cssW + 'px'; box.style.height = cssH + 'px';
        pdfCv.style.width = cssW + 'px'; pdfCv.style.height = cssH + 'px';
        pdfCv.width = Math.round(cssW * dpr); pdfCv.height = Math.round(cssH * dpr);
        var c = pdfCv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, pdfCv.width, pdfCv.height);
        an.resize(cssW, cssH); an.setPage(pg);
        var t = info.draw(pdfCv, base * dpr); S.task = t;
        return t.promise.then(function () { if (id === S.rid) { S.task = null; loading.style.display = 'none'; } }, function (e) {
          if (e && e.name === 'RenderingCancelledException') return; loading.style.display = 'none'; toast('이 쪽을 그리지 못했습니다.', true);
        });
      }, function () { loading.style.display = 'none'; toast('이 쪽을 읽지 못했습니다.', true); });
    }
    function pgLabel() { $('.pv-pg').textContent = S.page + ' / ' + S.pages; }

    function loadSheet(idx, page, fromUser) {
      idx = clamp(idx | 0, 0, sheets.length - 1);
      var f = sheets[idx], lid = ++S.loadId;
      flushMine(); an.closeEditor();
      S.sheetIdx = idx; sheetSel.value = String(idx); loading.style.display = 'flex'; loading.textContent = '악보를 불러오는 중…';
      var g = guessSong(f.name, songs); if (g >= 0 && S.songIdx !== g && !S.applying) setSong(g, true);
      return fetchDoc(f).then(function (d) {
        if (lid !== S.loadId || S.dead) return;
        S.doc = d; S.pages = d.n; S.page = clamp(page || 1, 1, d.n); pgLabel();
        loadAnno(); P.emit('sheet', { file: f, doc: d });
        return renderPage().then(function () { if (fromUser) sendNav(); });
      }).catch(function (e) {
        if (lid !== S.loadId) return;
        S.doc = null; loading.style.display = 'flex'; loading.textContent = (e && e.message) || '악보를 불러오지 못했습니다.'; toast(loading.textContent, true, 7000);
      });
    }
    function goPage(n, fromUser) {
      if (!S.doc) return; n = clamp(n | 0, 1, S.pages); if (n === S.page) return;
      S.page = n; pgLabel(); stage.scrollTop = 0; an.closeEditor(); renderPage(); P.emit('page', n);
      if (fromUser) sendNav();
    }
    function nextPage(user) {
      if (S.page < S.pages) goPage(S.page + 1, user);
      else if (S.sheetIdx < sheets.length - 1) loadSheet(S.sheetIdx + 1, 1, user);
    }
    function prevPage(user) {
      if (S.page > 1) goPage(S.page - 1, user);
      else if (S.sheetIdx > 0) { var pi = S.sheetIdx - 1; loadSheet(pi, 9999, user); }
    }
    function setZoom(z, user) { S.zoom = clamp(z, 0.4, 4); renderPage(); if (user) sendNav(); }
    function scrollFrac() { var sh = stage.scrollHeight - stage.clientHeight; return sh > 4 ? clamp(stage.scrollTop / sh, 0, 1) : 0; }

    function setSong(i, silent) {
      S.songIdx = i >= 0 && i < songs.length ? i : -1;
      var s = songs[S.songIdx], t = $('.pv-songinfo');
      t.textContent = s ? [s.title, s.key ? 'Key ' + s.key : '', s.bpm ? s.bpm + ' BPM' : ''].filter(Boolean).join(' · ') : '';
      P.emit('song', s || null, S.songIdx);
      if (!silent) sendNav();
    }

    /* ------------------------------------------------------------ 패널과 주고받는 통로 */
    var handlers = {};
    var P = {
      el: el, opts: opts, songs: songs, sheets: sheets, tabs: [], toast: toast,
      on: function (n, fn) { (handlers[n] = handlers[n] || []).push(fn); return P; },
      emit: function (n, a, b) { (handlers[n] || []).slice().forEach(function (fn) { try { fn(a, b); } catch (e) { if (root.console) root.console.error('[practice:' + n + ']', e); } }); },
      song: function () { return songs[S.songIdx] || null; }, songIdx: function () { return S.songIdx; }, setSong: function (i) { setSong(i); },
      file: function () { return sheets[S.sheetIdx]; }, page: function () { return S.page; },
      pdf: function () { return S.doc && S.doc.pdf || null; }, canvas: function () { return pdfCv; },
      lang: function () { return S.lang; }, setLang: function (l) { S.lang = l === 'ko' ? 'ko' : 'en'; ls('lang', S.lang); },
      layout: function () { return S.layout; }, setLayout: function (l) { applyLayout(l, true); }, hand: function () { return S.hand; },
      setHand: function (hd) { S.hand = hd === 'left' ? 'left' : 'right'; ls('hand', S.hand); applyLayout(S.layout, false); },
      anno: function () { return an; }, rt: function () { return rt; }, canEdit: !!opts.canEdit, canLead: function () { return !!(rt && rt.me && rt.me.canLead); },
      isLeader: function () { return !!(rt && rt.isLeader); }, showTab: function (id) { showTab(id); },
      getLayer: function () { return S.layer; }, getScope: function () { return S.scope; }, setLayer: function (l) { setLayer(l); }, setScope: function (s) { setScope(s); },
      recvCue: function (v) { if (v !== undefined) { S.recvCue = !!v; ls('recvcue', v ? '1' : '0'); } return S.recvCue; },
      sendCueOn: function (v) { if (v !== undefined) { S.sendCue = !!v; ls('sendcue', v ? '1' : '0'); } return S.sendCue; },
      cueIdFor: cueIdFor,
      /** 리더면 팀 모두에게 큐를 보냅니다 (스위치가 켜져 있을 때) */
      broadcastCue: function (id) {
        if (!rt || !rt.isLeader || !S.sendCue || !rt.online) return Promise.resolve(false);
        return rt.call('cue', { label: id, kind: 'cue' }).then(function () { return true; }, function (e) { toast('큐를 팀에 보내지 못했습니다: ' + e.message, true); return false; });
      },
      follow: function () { return S.follow; }, setFollow: function (b) { setFollow(b); }, followNow: function () { followNow(); },
      claim: function (force) { return claim(force); }, release: function () { return release(); },
      exportPng: function () { return exportPng(); }, exportPdf: function (print) { return exportPdf(print); },
      callServer: opts.callServer, saveNow: function () { flushMine(true); if (rt && rt.online) rt.call('anno:save', { file: sheets[S.sheetIdx].id, scope: 'song' }).catch(function () {}); if (rt && rt.online && S.room) rt.call('anno:save', { file: sheets[S.sheetIdx].id, scope: S.room }).catch(function () {}); },
      status: function () { return { conn: rt ? rt.state : 'unavailable', minePending: S.minePend, savedAt: S.savedAt, unsent: Object.keys(S.unsent).length }; }
    };
    S.room = opts.room || '';
    var rt = null, an = null;

    /* ------------------------------------------------------------ 필기 엔진 연결 */
    var YA = root.YNAnno;
    if (!YA) { toast('필기 도구를 불러오지 못했습니다. 새로고침해 주세요.', true); }
    an = YA ? YA.create({
      host: box, canvas: annoCv, me: opts.me || '', canEdit: !!opts.canEdit,
      onAdd: function (layer, it) { annoSend(layer, it, 'add'); }, onDel: function (layer, id) { annoSend(layer, { id: id }, 'del'); },
      onClear: function (layer, ids, pg, all) { annoClear(layer, ids, pg, all); },
      onLive: function (m) { if (rt && rt.online) rt.fire('anno:live', Object.assign({ file: sheets[S.sheetIdx].id }, m)); },
      onChange: function () { P.emit('annochange'); },
      onMessage: function (t, bad) { toast(t, bad); },
      teamBlocked: function () { return !rt || rt.state === 'unavailable' || rt.state === 'denied' ? '팀 공유에 연결되어 있지 않습니다. "나만 보기"로 바꿔서 쓰거나 새로고침해 주세요.' : ''; }
    }) : { setPenMode: function () {}, resize: function () {}, setPage: function () {}, closeEditor: function () {}, setItems: function () {}, items: function () { return []; }, setTool: function () {}, setLayer: function () {}, count: function () { return 0; }, drawPage: function () {}, remoteAdd: function () {}, remoteDel: function () {}, remoteClear: function () {}, remoteLive: function () {}, undo: function () {}, redo: function () {}, state: function () { return {}; }, destroy: function () {}, setVisible: function () {}, setPerms: function () {}, setColor: function () {}, setWidth: function () {}, setSymbol: function () {}, setSymSize: function () {}, setTextSize: function () {}, clearPage: function () { return 0; }, setHlColor: function () {}, setStraight: function () {} };

    function fileId() { return sheets[S.sheetIdx].id; }
    function scopeOfItem(it) { return S.scopeOf[it.id] || S.scopeKey; }
    function annoSend(layer, it, op) {
      var sc = op === 'add' ? (S.scopeOf[it.id] || S.scopeKey) : (S.scopeOf[it.id] || S.scopeKey);
      if (op === 'add') S.scopeOf[it.id] = sc;
      if (layer === 'mine') { if (op === 'add') { S.localMine[it.id] = 1; delete S.delMine[it.id]; } else { S.delMine[it.id] = 1; delete S.localMine[it.id]; } markMine(sc); if (op === 'del') delete S.scopeOf[it.id]; return; }
      if (!rt || rt.state === 'unavailable' || rt.state === 'denied') return;
      var payload = op === 'add' ? { file: fileId(), scope: sc, item: it } : { file: fileId(), scope: sc, id: it.id };
      if (op === 'add') S.unsent[it.id] = 1;
      rt.call(op === 'add' ? 'anno:add' : 'anno:del', payload, { queue: true }).then(function (r) {
        if (op === 'add' && r && !r.queued) delete S.unsent[it.id];
        if (op === 'del') delete S.scopeOf[it.id];
        P.emit('sync');
      }, function (e) {
        if (op === 'add') delete S.unsent[it.id];
        toast(e.code === 'perm' ? e.message : '팀 필기를 보내지 못했습니다: ' + e.message, true);
        if (op === 'add' && e.code) { an.remoteDel('team', it.id); }            // 서버가 거절한 항목은 화면에서도 뺍니다
      });
    }
    function annoClear(layer, ids, pg, all) {
      var scs = {}; ids.forEach(function (id) { scs[S.scopeOf[id] || S.scopeKey] = 1; });
      if (layer === 'mine') { Object.keys(scs).forEach(markMine); return; }
      if (!rt || rt.state === 'unavailable') return;
      Object.keys(scs).forEach(function (sc) { rt.call('anno:clear', { file: fileId(), scope: sc, pg: pg, own: !all }, { queue: true }).catch(function (e) { toast('지우기를 팀에 보내지 못했습니다: ' + e.message, true); }); });
    }
    /* 나만 보기 필기 — 1.5초 모아서 서버(시트)에 저장 */
    function markMine(sc) { S.mineDirty[fileId() + '|' + sc] = 1; S.minePend = Object.keys(S.mineDirty).length; clearTimeout(S.mineT); S.mineT = setTimeout(function () { flushMine(); }, 1500); P.emit('sync'); }
    function flushMine(now) {
      clearTimeout(S.mineT); S.mineT = 0;
      var keys = Object.keys(S.mineDirty); if (!keys.length || !opts.callServer) { S.mineDirty = {}; S.minePend = 0; return; }
      var snapshot = an.items('mine');
      keys.forEach(function (k) {
        var parts = k.split('|'), file = parts[0], sc = parts[1];
        if (file !== fileId()) return;                       // 다른 악보로 이미 넘어갔다면 (loadSheet 가 먼저 저장하므로 드묾)
        if (!S.mineLoaded[k]) { S.mineT = setTimeout(function () { flushMine(); }, 3000); return; }   // 저장된 필기를 다 불러온 뒤에만 저장 (덮어쓰기 방지)
        var items = snapshot.filter(function (i) { return (S.scopeOf[i.id] || S.scopeKey) === sc; });
        delete S.mineDirty[k];
        opts.callServer('worshipAnnoSaveMine', [opts.token, file, sc, items], function () { S.savedAt = Date.now(); S.minePend = Object.keys(S.mineDirty).length; P.emit('sync'); },
          function (e) { S.mineDirty[k] = 1; S.minePend = Object.keys(S.mineDirty).length; toast('내 필기를 저장하지 못했습니다 (자동으로 다시 시도합니다): ' + ((e && e.message) || ''), true); clearTimeout(S.mineT); S.mineT = setTimeout(function () { flushMine(); }, 15000); P.emit('sync'); });
      });
      S.minePend = Object.keys(S.mineDirty).length;
    }
    function scopes() { return S.room ? ['song', S.room] : ['song']; }
    /** 한 범위(scope)의 항목으로 통째로 바꿈 — 아직 서버에 못 보낸 내 항목은 남깁니다 */
    function replaceScope(layer, sc, items) {
      var mineL = layer === 'mine';
      var keep = an.items(layer).filter(function (i) { return (S.scopeOf[i.id] || S.scopeKey) !== sc || (mineL ? S.localMine[i.id] : S.unsent[i.id]); });
      if (mineL) items = (items || []).filter(function (i) { return !S.delMine[i.id]; });
      (items || []).forEach(function (i) { S.scopeOf[i.id] = sc; });
      var ids = {}; keep.forEach(function (i) { ids[i.id] = 1; });
      an.setItems(layer, keep.concat((items || []).filter(function (i) { return !ids[i.id]; })));
    }
    function loadAnno() {
      var id = ++S.annoId, file = fileId(); S.teamFrom = {}; S.scopeOf = {}; S.unsent = {}; S.localMine = {}; S.delMine = {};
      scopes().forEach(function (sc) { delete S.mineLoaded[file + '|' + sc]; });
      an.setItems('team', []); an.setItems('mine', []);
      if (opts.callServer) scopes().forEach(function (sc) { loadOne(id, file, sc, 0); });
      loadTeam(id, file);
    }
    function loadOne(id, file, sc, tries) {
      {
        opts.callServer('worshipAnnoLoad', [opts.token, file, sc], function (r) {
          if (id !== S.annoId || !r) return;
          S.mineLoaded[file + '|' + sc] = true;
          replaceScope('mine', sc, r.mine || []);
          if (S.teamFrom[sc] !== 'rt') { replaceScope('team', sc, r.team || []); S.teamFrom[sc] = 'http'; }
          if (r.me) an.setPerms(String(r.me), !!r.canEdit);
        }, function (e) {
          if (id !== S.annoId) return;
          if (tries < 3) { setTimeout(function () { if (id === S.annoId) loadOne(id, file, sc, tries + 1); }, 4000 * (tries + 1)); return; }
          toast('저장된 필기를 불러오지 못했습니다. 새로 쓴 "나만 보기" 필기는 불러오기가 끝난 뒤에 저장됩니다: ' + ((e && e.message) || ''), true);
        });
      }
    }
    function loadTeam(id, file) {
      if (!rt || !rt.online) return;
      scopes().forEach(function (sc) {
        rt.call('anno:load', { file: file, scope: sc }).then(function (r) { if (id !== S.annoId || file !== fileId()) return; S.teamFrom[sc] = 'rt'; replaceScope('team', sc, r.items || []); }, function (e) { if (id === S.annoId) toast('팀 필기를 불러오지 못했습니다: ' + e.message, true); });
      });
    }
    function setLayer(l) { S.layer = l === 'mine' ? 'mine' : 'team'; ls('layer', S.layer); an.setLayer(S.layer); P.emit('layer', S.layer); renderTools(); }
    function setScope(s) { S.scope = s === 'date' ? 'date' : 'song'; ls('scope', S.scope); P.emit('scope', S.scope); renderTools(); }
    /* scope 를 서버에 보낼 때: 'song' 그대로 / 'date' = 방(날짜) 키 */
    Object.defineProperty(S, 'scopeKey', { get: function () { return S.scope === 'date' && S.room ? S.room : 'song'; } });

    /* ------------------------------------------------------------ 실시간 · 리더-팔로워 */
    function sendNav() {
      if (S.applying || !rt || !rt.isLeader) return;
      clearTimeout(S.navT);
      S.navT = setTimeout(function () {
        if (!rt || !rt.isLeader) return;
        rt.call('nav', { file: fileId(), page: S.page, song: S.songIdx, zoom: S.zoom, sy: scrollFrac() }).catch(function (e) { if (e.code !== 'perm') toast('리더 화면을 보내지 못했습니다: ' + e.message, true); });
      }, 120);
    }
    function applyNav(nav, force) {
      if (!nav || S.dead) return;
      if (rt && rt.isLeader) return;                                  // 리더 자신은 따라갈 대상이 없음
      if (!S.follow && !force) { S.pendingNav = nav; renderChips(); return; }
      S.pendingNav = null; S.applying = true;
      var done = function () { S.applying = false; renderChips(); };
      try {
        var idx = nav.file ? sheets.findIndex(function (s) { return s.id === nav.file; }) : S.sheetIdx;
        if (nav.file && idx < 0) { toast('리더가 연 악보가 내 목록에 없습니다. (악보 목록을 새로고침해 보세요)', true); return done(); }
        if (nav.song != null && nav.song >= 0 && nav.song !== S.songIdx) setSong(nav.song, true);
        var z = nav.zoom > 0 ? nav.zoom : 1;
        var after = function () { if (Math.abs(z - S.zoom) > 0.01) { S.zoom = clamp(z, 0.4, 4); return renderPage(); } };
        var scrollTo = function () { if (nav.sy != null) setTimeout(function () { var sh = stage.scrollHeight - stage.clientHeight; if (sh > 0) stage.scrollTop = sh * nav.sy; }, 60); };
        if (idx !== S.sheetIdx || !S.doc) { loadSheet(idx, nav.page, false).then(function () { return after(); }).then(function () { scrollTo(); done(); }, done); }
        else { var same = nav.page === S.page; if (!same) goPage(nav.page, false); Promise.resolve(after()).then(function () { scrollTo(); done(); }, done); }
      } catch (e) { done(); }
    }
    function setFollow(b) {
      S.follow = !!b;
      if (S.follow && S.pendingNav) applyNav(S.pendingNav, true);
      else if (S.follow && rt && rt.nav && !rt.isLeader) applyNav(rt.nav, true);
      renderChips(); P.emit('follow', S.follow);
      toast(S.follow ? '리더 화면을 따라갑니다.' : '따라가기를 껐습니다. 내 화면은 그대로 유지됩니다.');
    }
    function followNow() { var n = S.pendingNav || (rt && rt.nav); if (n) applyNav(n, true); else toast('리더가 아직 화면을 넘기지 않았습니다.'); }
    function claim(force) {
      if (!rt) return Promise.reject(new Error('실시간 연결이 없습니다.'));
      return rt.claim(force).then(function () { toast('리더가 되었습니다. 지금부터 넘기는 화면을 팀이 따라옵니다.'); sendNav(); renderChips(); }, function (e) {
        toast(e.code === 'taken' ? e.message + ' 넘겨받으려면 "넘겨받기"를 누르세요.' : e.message, true); throw e;
      });
    }
    function release() { return rt ? rt.release().then(function () { toast('리더를 내려놓았습니다.'); renderChips(); }, function (e) { toast(e.message, true); }) : Promise.resolve(); }

    function renderChips() {
      var conn = $('.pv-conn'), lead = $('.pv-lead'), fol = $('.pv-follow');
      var st = rt ? rt.state : 'unavailable';
      var label = { idle: '연결 전', connecting: '연결 중…', online: '실시간 연결됨', offline: '연결 끊김 — 다시 연결 중', unavailable: '혼자 보기 (실시간 없음)', denied: '연결 거부됨' }[st] || st;
      conn.textContent = { online: '● 실시간', connecting: '○ 연결 중', offline: '○ 끊김', unavailable: '○ 혼자', denied: '✕ 거부', idle: '○' }[st] || '○';
      conn.className = 'pv-chip pv-conn ' + st; conn.title = label + (rt && rt.error && st !== 'online' ? ' — ' + rt.error : '');
      var pend = rt ? rt.pending() : 0; if (pend) conn.textContent += ' · 대기 ' + pend;
      var peers = rt ? rt.peers.length : 0;
      if (st === 'online') {
        lead.style.display = ''; var ln = rt.leader;
        lead.textContent = rt.isLeader ? '👑 내가 리더' : ln ? '👑 ' + ln : '리더 없음'; lead.className = 'pv-chip pv-lead' + (rt.isLeader ? ' me' : ln ? ' has' : '');
        lead.title = peers + '명 접속 중 — 눌러서 리더 · 함께 보기 열기';
      } else lead.style.display = 'none';
      if (st === 'online' && rt.leader && !rt.isLeader) {
        fol.style.display = ''; fol.className = 'pv-chip pv-follow ' + (S.follow ? 'on' : 'off');
        var behind = !S.follow && S.pendingNav && (S.pendingNav.page !== S.page || S.pendingNav.file !== fileId());
        fol.textContent = S.follow ? '따라가는 중' : (behind ? '따라가기 꺼짐 · 리더 ' + S.pendingNav.page + '쪽' : '따라가기 꺼짐');
        fol.setAttribute('aria-pressed', S.follow ? 'true' : 'false');
      } else fol.style.display = 'none';
      P.emit('conn', st);
    }
    function connect() {
      S.follow = true;                                                  // 따라가기는 접속할 때마다 켜진 채로 시작 (끄는 것은 그 순간만)
      if (opts.realtime === false || !root.YNRT || !S.room) { renderChips(); return; }
      rt = root.YNRT.create({ token: opts.token, room: S.room, io: opts.io });
      ['state', 'peers', 'leader', 'outbox'].forEach(function (n) { rt.on(n, function () { renderChips(); P.emit(n); }); });
      rt.on('joined', function (r) {
        renderChips(); P.emit('joined', r);
        if (r.you) an.setPerms(r.you.name, r.you.canEdit);
        if (S.doc) loadTeam(++S.annoId, fileId());
        if (r.nav && !rt.isLeader) applyNav(r.nav, false);
      });
      rt.on('nav', function (n) { applyNav(n, false); });
      rt.on('leader', function (m) {
        if (rt.isLeader) sendNav();
        else if (m && m.name && m.reason === 'takeover') toast(m.name + ' 님이 리더를 넘겨받았습니다.');
        else if (m && !m.name && m.reason === 'left') toast('리더가 나갔습니다.');
        renderChips();
      });
      rt.on('sent', function (m) { if (m.name === 'anno:add' && m.payload && m.payload.item) { delete S.unsent[m.payload.item.id]; P.emit('sync'); } });
      rt.on('rejected', function (r) {
        var m = r.msg; if (m.name === 'anno:add' && m.payload && m.payload.item) { delete S.unsent[m.payload.item.id]; an.remoteDel('team', m.payload.item.id); }
        toast('보내지 못한 필기가 있습니다: ' + r.error.message, true); P.emit('sync');
      });
      rt.on('cue', function (c) { P.emit('cue', c); });
      rt.on('anno:add', function (m) { if (m.file !== fileId() || scopes().indexOf(m.scope) < 0) return; S.scopeOf[m.item.id] = m.scope; an.remoteAdd('team', m.item); });
      rt.on('anno:del', function (m) { if (m.file === fileId()) an.remoteDel('team', m.id); });
      rt.on('anno:clear', function (m) { if (m.file === fileId()) an.remoteClear('team', m.ids); });
      rt.on('anno:live', function (m) { if (m.file === fileId()) an.remoteLive(m); });
      rt.on('anno:saved', function (m) { if (m.ok) S.savedAt = m.at; else toast('팀 필기 자동 저장에 실패했습니다. 잠시 후 다시 시도합니다.', true); P.emit('sync'); });
      rt.connect(); renderChips();
    }

    /* ------------------------------------------------------------ 도구 막대 */
    var SIZES = { pen: [0.0018, 0.003, 0.0055], hl: [0.012, 0.02, 0.032], text: [0.018, 0.024, 0.034], sym: [0.022, 0.032, 0.05] };
    S.tool = 'none'; S.sizeIdx = 1; S.symOpen = false;
    function sizeKey() { return S.tool === 'hl' ? 'hl' : S.tool === 'text' || S.tool === 'chord' ? 'text' : S.tool === 'sym' ? 'sym' : 'pen'; }
    function applySize() {
      var v = SIZES[sizeKey()][S.sizeIdx];
      if (S.tool === 'pen' || S.tool === 'hl') an.setWidth(v); else if (S.tool === 'text' || S.tool === 'chord') an.setTextSize(v); else if (S.tool === 'sym') an.setSymSize(v);
    }
    function setTool(t) {
      S.tool = t; an.setTool(t);
      if (t === 'pen') an.setWidth(SIZES.pen[S.sizeIdx]); else if (t === 'hl') an.setWidth(SIZES.hl[S.sizeIdx]);
      applySize(); S.symOpen = t === 'sym'; renderTools(); renderSymPop(); P.emit('tool', t);
      var hint = { pen: '펜: 손가락 · 펜 · 마우스로 그립니다.', hl: '형광펜: 문지르면 반투명하게 칠해집니다.', text: '글자: 악보를 눌러 글을 씁니다. 쓴 글자를 다시 누르면 고칠 수 있습니다.', chord: '코드: 악보를 눌러 코드를 씁니다. 아래 버튼으로 빠르게 입력하세요.', sym: '기호: 고른 기호를 악보에 눌러 찍습니다. (이음줄 · 크레센도는 끌어서 길이 조절)', eraser: '지우개: 지울 필기를 문지르세요. (내가 쓴 것만 지워집니다)' }[t];
      if (hint) toast(hint, false, 2600);
    }
    function renderTools() {
      var st = an.state ? an.state() : {}, hl = S.tool === 'hl', cols = hl ? YA.HL_COLORS : YA.PALETTE;
      var cur = hl ? (an.hlColor || cols[0]) : (S.color || cols[0]);
      toolsEl.innerHTML =
        '<div class="pv-tg">' + TOOLS.map(function (t) { return '<button class="pv-tool' + (S.tool === t.t ? ' on' : '') + '" data-tool="' + t.t + '" title="' + t.n + '" aria-pressed="' + (S.tool === t.t) + '"><span class="ic">' + t.ic + '</span><span class="nm">' + t.n + '</span></button>'; }).join('') + '</div>' +
        '<div class="pv-tg pv-colors">' + cols.map(function (c) { return '<button class="pv-col' + (c === S.curColor ? ' on' : '') + '" data-color="' + c + '" style="--c:' + c + '" title="색 ' + c + '" aria-label="색"></button>'; }).join('') + '</div>' +
        '<div class="pv-tg pv-sizes">' + [0, 1, 2].map(function (i) { return '<button class="pv-size' + (S.sizeIdx === i ? ' on' : '') + '" data-size="' + i + '" title="굵기 ' + (i + 1) + '"><i style="--s:' + (4 + i * 4) + 'px"></i></button>'; }).join('') + '</div>' +
        '<div class="pv-tg"><button class="pv-tool sm" data-a="undo" title="되돌리기 (Ctrl+Z)"' + (st.canUndo ? '' : ' disabled') + '><span class="ic">↶</span><span class="nm">취소</span></button>' +
          '<button class="pv-tool sm" data-a="redo" title="다시 (Ctrl+Shift+Z)"' + (st.canRedo ? '' : ' disabled') + '><span class="ic">↷</span><span class="nm">다시</span></button>' +
          '<button class="pv-tool sm" data-a="clearpg" title="이 쪽에 내가 쓴 필기 지우기"><span class="ic">🗑</span><span class="nm">이 쪽</span></button></div>' +
        '<div class="pv-tg pv-pills"><button class="pv-pill ' + S.layer + '" data-a="layer" title="누가 볼 수 있나요? (눌러서 바꾸기)">' + (S.layer === 'team' ? '👥 팀 공유' : '🔒 나만 보기') + '</button>' +
          '<button class="pv-pill scope" data-a="scope" title="필기가 어디에 붙나요? (눌러서 바꾸기)">' + (S.scope === 'date' && S.room ? '📅 이 날짜만' : '📌 곡에 계속') + '</button></div>';
    }
    toolsEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b || b.disabled) return;
      if (b.dataset.tool) { setTool(b.dataset.tool === S.tool && b.dataset.tool !== 'none' ? 'none' : b.dataset.tool); return; }
      if (b.dataset.color) { S.curColor = b.dataset.color; if (S.tool === 'hl') { an.setHlColor(S.curColor); S.hlSel = S.curColor; } else { an.setColor(S.curColor); S.penSel = S.curColor; } renderTools(); return; }
      if (b.dataset.size != null) { S.sizeIdx = +b.dataset.size; applySize(); renderTools(); return; }
      var a = b.dataset.a;
      if (a === 'undo') { an.undo(); renderTools(); } else if (a === 'redo') { an.redo(); renderTools(); }
      else if (a === 'clearpg') { var n = an.clearPage(S.layer, false); if (n) toast(n + '개를 지웠습니다. ↶ 로 되돌릴 수 있어요.'); renderTools(); }
      else if (a === 'layer') setLayer(S.layer === 'team' ? 'mine' : 'team');
      else if (a === 'scope') { if (!S.room) toast('이 곡에만 붙일 수 있습니다.'); else setScope(S.scope === 'song' ? 'date' : 'song'); }
    });
    P.on('annochange', function () { clearTimeout(S.toolT); S.toolT = setTimeout(renderTools, 60); });
    /* 색은 도구마다 기억 (펜/글자는 같은 색, 형광펜은 따로) */
    S.curColor = YA ? YA.PALETTE[0] : '#ff5a1f';
    var origSetTool = setTool;
    setTool = function (t) { origSetTool(t); S.curColor = t === 'hl' ? (S.hlSel || YA.HL_COLORS[0]) : (S.penSel || YA.PALETTE[0]); if (t === 'hl') an.setHlColor(S.curColor); else if (t !== 'none') an.setColor(S.curColor); renderTools(); };

    function renderSymPop() {
      var pop = $('.pv-sympop'); pop.style.display = S.symOpen ? 'block' : 'none';
      if (!S.symOpen) return;
      if (!pop.firstChild) {
        pop.innerHTML = '<div class="pv-symgrid">' + YA.SYMBOLS.map(function (s) { return '<button class="pv-sym" data-k="' + s.k + '" title="' + h(s.n) + '"><canvas width="44" height="44"></canvas><span>' + h(s.n) + '</span></button>'; }).join('') + '</div>';
        Array.prototype.forEach.call(pop.querySelectorAll('.pv-sym'), function (b) {
          var c = b.querySelector('canvas').getContext('2d'), k = b.dataset.k;
          YA.drawItem(c, { t: 'sym', k: k, c: '#ffb066', x: YA.STRETCH[k] ? 0.15 : 0.5, y: 0.5, sz: 0.42, w2: 0.7 }, 44, 44);
        });
        pop.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('.pv-sym') : null; if (!b) return; an.setSymbol(b.dataset.k); S.sym = b.dataset.k; Array.prototype.forEach.call(pop.querySelectorAll('.pv-sym'), function (x) { x.classList.toggle('on', x === b); }); toast(b.title + ' — 악보를 눌러 찍으세요.', false, 1800); });
      }
    }

    /* ------------------------------------------------------------ 패널(탭) */
    function showTab(id) {
      var t = P.tabs.filter(function (x) { return x.id === id; })[0]; if (!t) return;
      S.tab = id; el.classList.add('pv-sideopen'); if (S.layout === 'computer') ls('side', '1');
      Array.prototype.forEach.call(tabsEl.children, function (b) { b.classList.toggle('on', b.dataset.tab === id); b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'); });
      Array.prototype.forEach.call(panesEl.children, function (p) { p.style.display = p.dataset.pane === id ? '' : 'none'; });
      var pane = panesEl.querySelector('[data-pane="' + id + '"]');
      if (!t.built) {
        t.built = true;
        try { t.api = t.build(pane) || {}; } catch (e) { pane.innerHTML = '<p class="pv-err">이 패널을 열지 못했습니다: ' + h(e.message) + '</p>'; if (root.console) root.console.error(e); }
      }
      try { if (t.api && t.api.onShow) t.api.onShow(); } catch (e) {}
      paintRanges();
      setTimeout(function () { S.doc && renderPage(); }, 260);
    }
    /* 슬라이더의 주황 채움 폭(--fill) — 값이 바뀔 때마다 갱신 (손잡이를 움직이거나 패널이 값을 넣을 때) */
    function paintRanges() {
      Array.prototype.forEach.call(el.querySelectorAll('input[type=range]'), function (r) {
        var mn = parseFloat(r.min || 0), mx = parseFloat(r.max || 100), v = parseFloat(r.value);
        r.style.setProperty('--fill', (mx > mn ? Math.max(0, Math.min(100, (v - mn) / (mx - mn) * 100)) : 0) + '%');
      });
    }
    el.addEventListener('input', function (e) { if (e.target && e.target.type === 'range') paintRanges(); }, true);
    el.addEventListener('change', function (e) { if (e.target && e.target.type === 'range') paintRanges(); }, true);
    function buildTabs() {
      try { P.tabs = root.YNPanels ? root.YNPanels.build(P) : []; } catch (e) { P.tabs = []; toast('패널을 불러오지 못했습니다: ' + e.message, true); }
      tabsEl.innerHTML = P.tabs.map(function (t) { return '<button class="pv-tabbtn" role="tab" data-tab="' + t.id + '"><span>' + t.icon + '</span>' + h(t.label) + '</button>'; }).join('');
      panesEl.innerHTML = P.tabs.map(function (t) { return '<div class="pv-pane" data-pane="' + t.id + '" style="display:none"></div>'; }).join('');
    }
    tabsEl.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('.pv-tabbtn') : null; if (b) showTab(b.dataset.tab); });

    /* ------------------------------------------------------------ 내보내기 · 인쇄 */
    function fname(ext, suffix) { var n = String((sheets[S.sheetIdx].name || '악보')).replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\\/:*?"<>|]/g, '_'); return n + (suffix || '') + '.' + ext; }
    function saveBlob(blob, name) { var a = doc.createElement('a'); a.href = root.URL.createObjectURL(blob); a.download = name; doc.body.appendChild(a); a.click(); setTimeout(function () { root.URL.revokeObjectURL(a.href); a.remove(); }, 800); }
    function composite(d, pg, scale) {
      var cv = doc.createElement('canvas');
      return renderTo(cv, d, pg, scale).then(function (info) { try { an.drawPage(cv.getContext('2d'), cv.width, cv.height, pg); } catch (e) {} return { cv: cv, info: info }; });
    }
    function exportPng() {
      if (!S.doc) { toast('악보가 열려 있어야 합니다.', true); return Promise.resolve(); }
      toast('그림 파일을 만드는 중…');
      return composite(S.doc, S.page, 2).then(function (r) { return new Promise(function (res, rej) { r.cv.toBlob(function (b) { b ? res(b) : rej(new Error('그림을 만들지 못했습니다')); }, 'image/png'); }); })
        .then(function (b) { saveBlob(b, fname('png', '-' + S.page + '쪽')); toast('필기가 들어간 그림을 저장했습니다.'); }, function (e) { toast('저장하지 못했습니다: ' + e.message, true); });
    }
    function exportPdf(printIt) {
      if (!S.doc) { toast('악보가 열려 있어야 합니다.', true); return Promise.resolve(); }
      var d = S.doc, n = d.n, scale = n > 8 ? 1.3 : n > 4 ? 1.6 : 2;
      return loadScript('/vendor/jspdf.umd.min.js', function () { return !!(root.jspdf && root.jspdf.jsPDF); }).then(function () {
        var pdf = null, i = 1;
        function step() {
          if (i > n) return pdf;
          toast((printIt ? '인쇄 준비' : 'PDF 만드는 중') + '… ' + i + ' / ' + n, false, 8000);
          return composite(d, i, scale).then(function (r) {
            var w = r.info.w, hh = r.info.h, o = w > hh ? 'l' : 'p';
            if (!pdf) pdf = new root.jspdf.jsPDF({ orientation: o, unit: 'pt', format: [w, hh], compress: true }); else pdf.addPage([w, hh], o);
            pdf.addImage(r.cv.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, w, hh); r.cv.width = r.cv.height = 1; i++;
            return new Promise(function (res) { setTimeout(res, 0); }).then(step);
          });
        }
        return step();
      }).then(function (pdf) {
        if (!printIt) { pdf.save(fname('pdf', '-필기')); toast('필기가 들어간 PDF 를 저장했습니다.'); return; }
        var url = root.URL.createObjectURL(pdf.output('blob')), fr = doc.createElement('iframe');
        fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0'; fr.src = url; doc.body.appendChild(fr);
        fr.onload = function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); toast('인쇄 창을 열었습니다.'); } catch (e) { pdf.save(fname('pdf', '-필기')); toast('바로 인쇄할 수 없어 PDF 로 저장했습니다. 저장한 파일을 인쇄해 주세요.', true); } setTimeout(function () { fr.remove(); root.URL.revokeObjectURL(url); }, 60000); };
      }).catch(function (e) { toast('만들지 못했습니다: ' + ((e && e.message) || e), true); });
    }

    /* ------------------------------------------------------------ 입력: 클릭 · 스와이프 · 키보드 */
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-a],[data-layout]') : null; if (!b || toolsEl.contains(b)) return;
      if (b.dataset.layout) { applyLayout(b.dataset.layout, true); return; }
      var a = b.dataset.a;
      if (a === 'close') api.close(); else if (a === 'prev') prevPage(true); else if (a === 'next') nextPage(true);
      else if (a === 'zin') setZoom(S.zoom * 1.2, true); else if (a === 'zout') setZoom(S.zoom / 1.2, true);
      else if (a === 'zfit') { S.zoom = 1; S.fit = S.fit === 'page' ? 'width' : 'page'; renderPage(); sendNav(); toast(S.fit === 'page' ? '한 쪽이 다 보이게 맞춤' : '가로 폭에 맞춤'); }
      else if (a === 'panel') toggleSide(); else if (a === 'follow') setFollow(!S.follow); else if (a && a.indexOf('tab:') === 0) showTab(a.slice(4));
    });
    stage.addEventListener('click', function (e) {
      if (S.layout !== 'tablet' || S.tool !== 'none' || !box.contains(e.target) || S.zoom > 1.05 || e.target.closest('.pv-toast')) return;
      var r = box.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
      if (fx < 0.18) prevPage(true); else if (fx > 0.82) nextPage(true);
    });
    var sw = null;
    stage.addEventListener('pointerdown', function (e) { sw = (e.pointerType === 'touch' && S.tool === 'none') ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; });
    stage.addEventListener('pointerup', function (e) {
      if (!sw) return; var dx = e.clientX - sw.x, dy = e.clientY - sw.y, dt = Date.now() - sw.t; sw = null;
      if (S.zoom <= 1.05 && Math.abs(dx) > 90 && Math.abs(dy) < 60 && dt < 600) { dx < 0 ? nextPage(true) : prevPage(true); }
    });
    var scT = 0; stage.addEventListener('scroll', function () { clearTimeout(scT); scT = setTimeout(sendNav, 250); });
    stage.addEventListener('wheel', function (e) { if (e.ctrlKey) { e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), true); } }, { passive: false });
    function onKey(e) {
      var t = e.target, tag = t && t.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      var k = e.key, mod = e.ctrlKey || e.metaKey;
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? an.redo() : an.undo(); renderTools(); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); an.redo(); renderTools(); return; }
      if (mod || e.altKey) return;
      var map = { ArrowRight: 'n', PageDown: 'n', ArrowLeft: 'p', PageUp: 'p', '+': 'zi', '=': 'zi', '-': 'zo', '0': 'zf', Escape: 'esc', v: 'none', p: 'pen', h: 'hl', t: 'text', c: 'chord', s: 'sym', e: 'eraser' };
      var m = map[k]; if (!m) return; e.preventDefault();
      if (m === 'n') nextPage(true); else if (m === 'p') prevPage(true); else if (m === 'zi') setZoom(S.zoom * 1.2, true); else if (m === 'zo') setZoom(S.zoom / 1.2, true);
      else if (m === 'zf') { S.zoom = 1; renderPage(); sendNav(); }
      else if (m === 'esc') { if (S.tool !== 'none') setTool('none'); else api.close(); } else setTool(m);
    }
    doc.addEventListener('keydown', onKey);
    var rz = 0, ro = null;
    function onResize() { clearTimeout(rz); rz = setTimeout(function () { S.doc && renderPage(); }, 150); }
    if (root.ResizeObserver) { ro = new root.ResizeObserver(onResize); ro.observe(stage); } else root.addEventListener('resize', onResize);
    function onVis() { if (doc.visibilityState === 'visible') { requestWake(); } }
    function requestWake() { try { if (root.navigator.wakeLock && !S.wake) root.navigator.wakeLock.request('screen').then(function (l) { S.wake = l; l.addEventListener('release', function () { S.wake = null; }); }, function () {}); } catch (e) {} }
    doc.addEventListener('visibilitychange', onVis);
    function onBeforeUnload() { flushMine(); try { rt && rt.close(); } catch (e) {} }
    root.addEventListener('pagehide', onBeforeUnload);

    /* ------------------------------------------------------------ 시작 · 닫기 */
    var api = {
      el: el, P: P, goPage: function (n) { goPage(n, true); }, loadSheet: function (i, pg) { return loadSheet(i, pg, true); },
      close: function () {
        if (S.dead) return; S.dead = true; flushMine(); P.emit('close');
        try { an.closeEditor(); } catch (e) {}
        P.tabs.forEach(function (t) { try { t.api && t.api.destroy && t.api.destroy(); } catch (e) {} });
        try { rt && rt.close(); } catch (e) {} try { an.destroy(); } catch (e) {}
        doc.removeEventListener('keydown', onKey); doc.removeEventListener('visibilitychange', onVis); root.removeEventListener('pagehide', onBeforeUnload);
        if (ro) ro.disconnect(); else root.removeEventListener('resize', onResize);
        try { S.wake && S.wake.release(); } catch (e) {}
        Object.keys(S.cache).forEach(function (k) { try { S.cache[k].pdf && S.cache[k].pdf.destroy(); } catch (e) {} });
        el.remove(); doc.body.classList.remove('pv-lock'); current = null;
        try { opts.onClose && opts.onClose(); } catch (e) {}
      }
    };
    current = api;
    S.layer = ls('layer') === 'team' ? 'team' : 'mine'; S.scope = ls('scope') === 'date' && S.room ? 'date' : 'song'; an.setLayer(S.layer);
    applyLayout(S.layout, false); renderTools(); buildTabs(); connect(); requestWake();
    var g0 = typeof opts.song === 'number' ? opts.song : guessSong(sheets[S.sheetIdx].name, songs); if (g0 >= 0) setSong(g0, true);
    loadSheet(S.sheetIdx, 1, false);
    if (S.layout === 'computer' && ls('side') !== '0' && P.tabs.length) showTab(P.tabs[0].id);
    return api;
  }

  root.YNPractice = { open: open, current: function () { return current; }, close: function () { if (current) current.close(); }, isOpen: function () { return !!current; }, guessSong: guessSong, cueIdFor: cueIdFor, detectLayout: detectLayout, CUE_MAP: CUE_MAP };
}(typeof self !== 'undefined' ? self : this));
