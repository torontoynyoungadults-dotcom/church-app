/**
 * 세션 / 연습 — 찬양 악보를 크게 열어 필기 · 송폼 · 메트로놈 · 음정을 한 화면에서 쓰는 전체 화면 뷰어 (가사 도구는 허브 화면으로 옮김)
 * ------------------------------------------------------------
 *  YNPractice.open({ token, room, sheets:[{id,name}], songs:[{title,key,bpm,form}], start:악보ID, canEdit, callServer })
 *
 *  · 레이아웃: 📱 태블릿(큰 버튼 · 펜 우선 · 화면 가장자리 탭으로 넘김 · 도구 막대 떠 있음)  /  💻 컴퓨터(위 도구줄 · 오른쪽 패널 · 단축키)
 *  · 페이지 컨트롤(구 리더) - 팔로워: 페이지 컨트롤이 넘기는 악보 · 쪽 · 확대를 모두가 따라감. "따라가기" 스위치로 사람마다 끌 수 있음 (끄면 내 화면은 그대로)
 *  · 필기: anno.js (펜 · 형광펜 · 글자/코드 · 기호). 팀 공유는 rt.js(Socket.io)로 실시간, 나만 보기는 서버(구글 시트)에 저장
 *  · 패널(송폼 · 메트로놈 · 음정 · 함께)은 practice-panels.js 에 있습니다
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
    Itld: 'itld', Inst: 'itld', Out: 'end', End: 'end', Coda: 'end', Vamp: 'vamp', Solo: 'solo', Break: 'break', Prayer: 'prayer', KeyUp: 'keyup' };
  function cueIdFor(k) { return CUE_MAP[k] || null; }
  function normName(s) { return String(s || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\s_\-\.\(\)\[\]·,]/g, ''); }
  /** 악보 파일 이름에서 어느 곡인지 짐작 (제목이 파일 이름에 들어 있으면) */
  function guessSong(name, songs) {
    var n = normName(name), best = -1, bl = 0;
    (songs || []).forEach(function (s, i) { var t = normName(s.title); if (t.length >= 2 && n.indexOf(t) >= 0 && t.length > bl) { best = i; bl = t.length; } });
    return best;
  }

  var TOOLS = [
    { t: 'none', ic: '✋', n: '이동' }, { t: 'pen', ic: '✏️', n: '펜' }, { t: 'hl', ic: '🖍', n: '형광펜' }, { t: 'select', ic: '⤧', n: '선택·이동' }, { t: 'text', ic: 'T', n: '글자' },
    { t: 'chord', ic: 'Am', n: '코드' }, { t: 'sym', ic: '♯', n: '기호' }, { t: 'fbox', ic: 'V·C', n: '송폼 라벨' }, { t: 'eraser', ic: '⌫', n: '지우개' }
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
      doc: null, rid: 0, task: null, tab: '', layer: 'team', scope: 'song', follow: ls('fpage') !== '0', followM: ls('fmetro') !== '0', prefTouched: false, prefT: 0, pendingNav: null, applying: false, navT: 0, dead: false,
      scopeOf: {}, unsent: {}, localMine: {}, delMine: {}, mineLoaded: {}, teamFrom: {}, annoId: 0, mineDirty: {}, mineT: 0, minePend: 0, savedAt: 0, msgT: 0, lang: ls('lang') === 'ko' ? 'ko' : 'en',
      recvCue: ls('recvcue') !== '0', sendCue: ls('sendcue') !== '0', loadId: 0, cache: {}, cacheOrder: []
    };
    S.fit = S.layout === 'tablet' ? 'page' : 'width';
    var startIdx = 0; sheets.forEach(function (s, i) { if (s.id === opts.start) startIdx = i; }); S.sheetIdx = startIdx;

    /* ------------------------------------------------------------ 화면 뼈대 */
    var el = doc.createElement('div');
    el.className = 'pv';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '세션 / 연습');
    el.innerHTML =
      '<header class="pv-top">' +
        '<button class="pv-b" data-a="close" title="닫기 (Esc)">✕</button>' +
        '<div class="pv-title"><select class="pv-sel pv-sheetsel" aria-label="악보 선택"></select><select class="pv-sel pv-songsel" style="display:none" aria-label="이 쪽의 곡 (자동으로 찾은 곡을 바꿀 수 있습니다)" title="이 쪽이 어느 곡인지 — 자동으로 찾은 곡이 틀리면 여기서 바꾸세요. 곡이 여러 쪽이면 다음 곡이 나올 때까지 같은 곡으로 봅니다."></select><span class="pv-songinfo"></span><button type="button" class="pv-ytbtn" style="display:none" title="이 곡의 유튜브 참고 영상 (앱 안에서 재생)" aria-label="유튜브 참고 영상 재생">▶ YouTube</button></div>' +
        '<div class="pv-grp pv-pager"><button class="pv-b" data-a="prev" title="이전 쪽 (←)">‹</button><span class="pv-pg">1 / 1</span><button class="pv-b" data-a="next" title="다음 쪽 (→)">›</button></div>' +
        '<div class="pv-grp pv-zoom"><button class="pv-b" data-a="zout" title="줄이기 (-)">−</button><button class="pv-b" data-a="zfit" title="화면에 맞춤">맞춤</button><button class="pv-b" data-a="zin" title="키우기 (+)">＋</button><button class="pv-b pv-cropbtn" data-a="crop" aria-pressed="true" title="여백 자동 맞춤 — 글자 · 음표가 있는 부분만 화면에 꽉 차게 키웁니다 (끄면 종이 전체)">✂ 여백</button><button class="pv-b pv-spreadbtn" data-a="spread" aria-pressed="false" title="두 쪽 나란히 보기 (컴퓨터 화면)">📖 두 쪽</button></div>' +
        '<div class="pv-grp pv-seg pv-layoutseg" role="group" aria-label="화면 배치"><button data-layout="tablet" title="태블릿 화면">📱 태블릿</button><button data-layout="computer" title="컴퓨터 화면">💻 컴퓨터</button></div>' +
        '<div class="pv-grp pv-chips"><span class="pv-chip pv-conn" title="실시간 연결">…</span><button class="pv-chip pv-lead" data-a="tab:together" title="페이지 컨트롤 · 함께 보기"></button><button class="pv-chip pv-click" data-a="tab:together" title="클릭 컨트롤(메트로놈) · 함께 보기"></button><button class="pv-chip pv-follow" data-a="follow" title="동기화 · 따라가기 켜기/끄기"></button><button class="pv-chip pv-followm" data-a="followm" title="메트로놈 따라가기 켜기/끄기" style="display:none"></button></div>' +
        '<button class="pv-b pv-fsbtn" data-a="fs" title="전체 화면 (악보만 크게)" aria-pressed="false">⛶</button><button class="pv-b pv-panelbtn" data-a="panel" title="패널 열기/닫기">☰</button>' +
        '<button type="button" class="pv-b pv-menubtn" aria-expanded="false" aria-controls="pvDrawer" aria-label="도구 메뉴 열기" title="도구 메뉴 열기 / 닫기"><span class="ic">🛠</span><span class="nm">메뉴</span></button>' +
      '</header>' +
      '<div class="pv-main">' +
        '<div class="pv-tools" role="toolbar" aria-label="필기 도구"></div>' +
        '<div class="pv-stage"><div class="pv-pagebox"><canvas class="pv-pdf"></canvas><canvas class="pv-anno"></canvas></div>' +
          '<div class="pv-pagebox pv-pagebox2" style="display:none" title="오른쪽 쪽 (보기 전용) — 눌러서 왼쪽으로 가져오면 필기할 수 있습니다"><canvas class="pv-pdf2"></canvas></div>' +
          '<div class="pv-loading">악보를 불러오는 중…</div><div class="pv-toast" role="status" aria-live="polite"></div><div class="pv-sympop"></div></div>' +
        '<aside class="pv-side"><nav class="pv-tabs" role="tablist"></nav><div class="pv-panes"></div></aside>' +
        '<button type="button" class="pv-toolsbtn" aria-pressed="true" aria-label="필기 도구 숨기기" title="필기 도구 숨기기 / 보이기"><span class="ic">▴</span><span class="nm">도구</span></button>' +
      '</div>' +
      '<div class="pv-fsbar" role="toolbar" aria-label="전체 화면 메뉴"><button class="pv-b" data-a="fs" title="전체 화면 나가기 (Esc)">✕ 나가기</button><button class="pv-b" data-a="prev" title="이전 쪽">‹</button><span class="pv-fspg">1 / 1</span><button class="pv-b" data-a="next" title="다음 쪽">›</button><button class="pv-b" data-a="zfit" title="화면에 맞춤">맞춤</button><button class="pv-b" data-a="fs-tools" title="필기 도구 보이기/숨기기">✏️ 도구</button><button class="pv-b" data-a="fs-panel" title="메트로놈 · 송폼 패널">☰ 패널</button></div><button type="button" class="pv-fshandle" data-a="fs-bar" aria-label="메뉴 보이기" title="메뉴 보이기"><span></span></button>' +
      '<div class="pv-dback" data-a="drawer-close"></div>' +
      '<aside class="pv-drawer" id="pvDrawer" role="dialog" aria-label="도구 메뉴" aria-hidden="true">' +
        '<div class="pv-dh"><b>🛠 도구 메뉴</b><button type="button" class="pv-dclose" data-a="drawer-close" aria-label="메뉴 닫기">✕</button></div>' +
        '<section class="pv-ds"><h5>보기</h5><div class="pv-dslot" data-slot="view"></div></section>' +
        '<section class="pv-ds"><h5>필기 도구</h5><div class="pv-dslot" data-slot="tools"></div></section>' +
        '<section class="pv-ds"><h5>패널</h5><div class="pv-dslot"><button type="button" class="pv-btn2 primary" data-a="drawer-panel">🎛 메트로놈 · 시작음 · 함께 (패널 열기)</button></div></section>' +
      '</aside>';
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
      el.classList.toggle('pv-sideopen', S.layout === 'computer' && !S.compact ? ls('side') !== '0' : false);
      Array.prototype.forEach.call(el.querySelectorAll('[data-layout]'), function (b) { b.classList.toggle('on', b.getAttribute('data-layout') === S.layout); b.setAttribute('aria-pressed', b.getAttribute('data-layout') === S.layout ? 'true' : 'false'); });
      an && an.setPenMode(S.layout === 'tablet' ? (ls('penmode') || 'auto') : 'off');
      if (S.compact !== calcCompact()) setCompact(calcCompact());
      if (S.doc) renderSoon(30);
    }
    /* ------------------------------------------------------------ 좁은 화면 (아이폰 · 아이패드 세로 · 좁은 창)
       모든 도구(보기 · 필기 도구)를 "🛠 메뉴" 서랍 하나에 모읍니다. 서랍은 닫혀 있는 것이 기본이라 악보를 가리지 않고, 버튼 하나로 열고 닫습니다.
       화면 위 버튼을 서랍으로 "옮기기만" 하므로 (새로 만들지 않음) 필기 · 확대 · 화면 배치 · 실시간 동작은 그대로입니다. */
    var drawerEl = $('.pv-drawer'), menuBtn = $('.pv-menubtn'), holders = [];
    function calcCompact() { var w = root.innerWidth || 1200, hh = root.innerHeight || 800; return w < (S.layout === 'tablet' ? 1100 : 900) || hh < 500; }
    function hold(node, slot) {                                       // 원래 자리를 표시해 두고 서랍으로 옮김
      var ph = doc.createComment('pv'); node.parentNode.insertBefore(ph, node); holders.push({ node: node, ph: ph }); slot.appendChild(node);
    }
    function setDrawer(open) {
      open = !!open && S.compact;
      el.classList.toggle('pv-drawopen', open); drawerEl.setAttribute('aria-hidden', open ? 'false' : 'true');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); menuBtn.setAttribute('aria-label', open ? '도구 메뉴 닫기' : '도구 메뉴 열기');
      menuBtn.querySelector('.ic').textContent = open ? '✕' : '🛠'; menuBtn.querySelector('.nm').textContent = open ? '닫기' : '메뉴';
      if (open) { el.classList.remove('pv-sideopen'); try { drawerEl.querySelector('.pv-dclose').focus({ preventScroll: true }); } catch (e) {} }
    }
    function setCompact(on) {
      on = !!on; if (on === !!S.compact && holders.length === (on ? 4 : 0)) return;
      S.compact = on; el.classList.toggle('pv-compact', on);
      if (on) {
        var v = drawerEl.querySelector('[data-slot="view"]'), t = drawerEl.querySelector('[data-slot="tools"]');
        [$('.pv-zoom'), $('.pv-layoutseg'), $('.pv-chips')].forEach(function (n) { if (n) hold(n, v); });
        hold(toolsEl, t);
        el.classList.remove('pv-sideopen');
      } else {
        setDrawer(false);
        holders.splice(0).forEach(function (x) { if (x.ph.parentNode) { x.ph.parentNode.insertBefore(x.node, x.ph); x.ph.remove(); } });
        if (S.layout === 'computer' && ls('side') !== '0') el.classList.add('pv-sideopen');
      }
    }
    function autoFit() {                                              // 폰을 옆으로 눕히면 한 쪽이 너무 작아지므로 가로 폭에 맞춤. 사용자가 맞춤을 직접 바꿨다면 존중
      if (S.fitUser) return; var f = (S.compact && (root.innerWidth || 0) > (root.innerHeight || 0) && (root.innerHeight || 0) < 500) ? 'width' : 'page';   // 기본은 "한 쪽 맞춤" (Step 2.11) — 폰을 눕힌 낮은 화면만 가로 폭 맞춤
      if (f !== S.fit) { S.fit = f; S.zoom = 1; if (S.doc) renderPage(); }
    }
    function checkCompact() { var c = calcCompact(); if (c !== !!S.compact) { setCompact(c); if (S.doc) renderSoon(40); } autoFit(); }
    menuBtn.onclick = function () { setDrawer(!el.classList.contains('pv-drawopen')); };
    var orT = 0; function onOrient() { clearTimeout(orT); orT = setTimeout(function () { if (!S.dead) checkCompact(); }, 200); }
    root.addEventListener('orientationchange', onOrient);

    /* 필기 도구 막대 접기/펴기 — 접으면 악보가 화면 전체 폭을 씁니다. 도구 막대는 그대로 두고 숨기기만 해서 필기 · 실시간 동기화에 영향이 없습니다 */
    var toolsBtn = $('.pv-toolsbtn');
    function setTools(show, save) {
      el.classList.toggle('pv-toolshide', !show);
      toolsBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
      toolsBtn.setAttribute('aria-label', show ? '필기 도구 숨기기' : '필기 도구 보이기');
      toolsBtn.querySelector('.ic').textContent = show ? '▴' : '✏️';
      toolsBtn.querySelector('.nm').textContent = show ? '도구' : '도구 열기';
      if (save) ls('tools', show ? '1' : '0');
      renderSoon(60);            // 넓어진(좁아진) 칸에 맞춰 악보를 다시 그림
    }
    toolsBtn.onclick = function () { setTools(el.classList.contains('pv-toolshide'), true); };
    /* 태블릿 위 캡슐 도크 — 기본은 "도구 아이콘 + 되돌리기 + ⋯"만. ⋯ 를 누르면 색 · 굵기 · 글꼴 · 나만 보기가 펼쳐지고, ▴ 를 누르면 도크 전체가 작은 알약(✏️ 도구 열기)으로 접힙니다 */
    S.dockMore = ls('dockmore') === '1'; el.classList.toggle('pv-dockmore', S.dockMore);
    S.fbadge = ls('fbadge') !== '0';                                   // 악보 맨 위 송폼 배지 (기본 켬) — Step 2.15
    function setDockMore(on, save) {
      S.dockMore = !!on; el.classList.toggle('pv-dockmore', S.dockMore); if (save) ls('dockmore', S.dockMore ? '1' : '0');
      var b = toolsEl.querySelector('[data-a="dockmore"]'); if (b) { b.setAttribute('aria-pressed', S.dockMore ? 'true' : 'false'); b.setAttribute('aria-expanded', S.dockMore ? 'true' : 'false'); }
    }
    if (ls('tools') === '0') setTools(false, false);
    /* ------------------------------------------------------------ 전체 화면 (악보만 크게) — Step 2.11
       ⛶ 를 누르면 위 메뉴 · 필기 도구 · 패널이 모두 사라지고 악보가 화면을 꽉 채웁니다(브라우저 주소창도 가능한 곳에서는 숨김).
       악보를 한 번 톡 누르면 위쪽에 얇은 메뉴(나가기 · 쪽 · 맞춤 · 도구 · 패널)가 나타났다 5초 뒤 사라지고, 필기 중에는 위 가운데 작은 손잡이로 부릅니다. */
    S.fs = false; S.fsT = 0; S.fsSide = false; S.fsTools = true;
    function fsBar(on) {
      clearTimeout(S.fsT); el.classList.toggle('pv-fsbar-on', !!on);
      if (on) S.fsT = setTimeout(function () { if (!el.classList.contains('pv-sideopen') && !S.dead) el.classList.remove('pv-fsbar-on'); }, 5000);
    }
    function fsNative(on) {
      try {
        var d = root.document;
        if (on) { var de = d.documentElement; if (!d.fullscreenElement && de.requestFullscreen) { var r = de.requestFullscreen({ navigationUI: 'hide' }); if (r && r.catch) r.catch(function () { /* 아이폰 등: 브라우저 전체 화면이 없으면 화면 안에서만 */ }); } }
        else if (d.fullscreenElement && d.exitFullscreen) { var r2 = d.exitFullscreen(); if (r2 && r2.catch) r2.catch(function () {}); }
      } catch (e) { /* 전체 화면을 못 써도 화면 안 전체 보기는 동작 */ }
    }
    function setFs(on) {
      on = !!on; if (S.fs === on) return; S.fs = on;
      el.classList.toggle('pv-fs', on); el.querySelector('.pv-fsbtn').setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) { S.fsSide = el.classList.contains('pv-sideopen'); S.fsTools = !el.classList.contains('pv-toolshide'); toggleSide(false); setDrawer(false); setTools(false, false); fsBar(true); }
      else { clearTimeout(S.fsT); el.classList.remove('pv-fsbar-on'); setTools(S.fsTools, false); if (S.fsSide) toggleSide(true); }
      fsNative(on); renderSoon(120); P.emit('fs', on);
    }
    function onFsChange() { if (S.fs && !root.document.fullscreenElement && S.fsNativeOn) setFs(false); S.fsNativeOn = !!root.document.fullscreenElement; }   // 브라우저 Esc 로 나가면 화면 안 전체 보기도 함께 끝냄
    doc.addEventListener('fullscreenchange', onFsChange);
    var fsDown = null;
    function fsPointerDown(e) { fsDown = S.fs && S.tool === 'none' && e.pointerType !== 'pen' && !(e.target.closest && e.target.closest('button,select,input,a,.pv-fsbar,.pv-mq,.pv-side')) ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; }
    function fsPointerUp(e) {
      var d = fsDown; fsDown = null; if (!d || !S.fs) return;
      if (Math.abs(e.clientX - d.x) < 8 && Math.abs(e.clientY - d.y) < 8 && Date.now() - d.t < 450) fsBar(!el.classList.contains('pv-fsbar-on'));      // 톡 = 메뉴 켜기/끄기 (끌거나 확대하는 손짓은 제외)
    }
    stage.addEventListener('pointerdown', fsPointerDown); stage.addEventListener('pointerup', fsPointerUp);

    function toggleSide(force) {
      var on = force != null ? force : !el.classList.contains('pv-sideopen');
      if (on && S.compact) setDrawer(false);
      el.classList.toggle('pv-sideopen', on);
      if (S.layout === 'computer' && !S.compact) ls('side', on ? '1' : '0');
      if (on && !S.tab && P.tabs.length) showTab(P.tabs[0].id);
      renderSoon(260);
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
        d.fid = f.id; S.cache[f.id] = d; S.cacheOrder.push(f.id);
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
    /* ------------------------------------------------------------ 자동 여백 맞춤 (악보를 화면에 최대한 크게)
       쪽의 "글자 · 음표가 있는 부분"만 찾아(작은 그림으로 훑어서) 그 부분이 화면을 꽉 채우도록 확대하고, 스크롤 위치를 그 부분 시작점에 맞춥니다.
       여백을 자르지 않고 "확대 + 스크롤 위치"만 쓰기 때문에 필기 좌표(쪽 전체 기준 0~1)와 다른 사람 화면과의 동기화는 그대로입니다. 여백은 스크롤하면 보입니다. */
    S.crop = ls('crop') !== '0';
    var cropBtn = $('.pv-cropbtn');
    function syncCropUi() { cropBtn.classList.toggle('on', !!S.crop); cropBtn.setAttribute('aria-pressed', S.crop ? 'true' : 'false'); }
    syncCropUi();
    var CROP_PAD = 0.025, CROP_MAX_UP = 2.4, CROP_MIN_GAIN = 1.06;
    /** 작은 그림 데이터에서 잉크(어두운 점)가 있는 범위를 0~1 로. 없으면 null — 순수 계산이라 시험에서도 씁니다 */
    function inkBounds(data, w, h) {
      var rows = new Array(h).fill(0), cols = new Array(w).fill(0), i, x, y;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { i = (y * w + x) * 4; if (data[i + 3] > 40 && (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) < 225) { rows[y]++; cols[x]++; } }
      function span(a, n) { var lo = -1, hi = -1; for (var k = 0; k < a.length; k++) if (a[k] >= n) { if (lo < 0) lo = k; hi = k; } return lo < 0 ? null : [lo, hi + 1]; }
      var r = span(rows, 2), c = span(cols, 2); if (!r || !c) return null;
      return { x0: c[0] / w, x1: c[1] / w, y0: r[0] / h, y1: r[1] / h };
    }
    function cropOf(d, pg, info) {
      d.crops = d.crops || {}; if (d.crops[pg] !== undefined) return Promise.resolve(d.crops[pg]);
      var cv = doc.createElement('canvas'), sc = 280 / Math.max(1, info.w); cv.width = Math.max(8, Math.round(info.w * sc)); cv.height = Math.max(8, Math.round(info.h * sc));
      var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
      var t; try { t = info.draw(cv, sc); } catch (e) { d.crops[pg] = null; return Promise.resolve(null); }
      return t.promise.then(function () {
        var b = null; try { b = inkBounds(c.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height); } catch (e) {}
        if (b) { b.x0 = Math.max(0, b.x0 - CROP_PAD); b.y0 = Math.max(0, b.y0 - CROP_PAD); b.x1 = Math.min(1, b.x1 + CROP_PAD); b.y1 = Math.min(1, b.y1 + CROP_PAD);
          if ((b.x1 - b.x0) > 0.94 && (b.y1 - b.y0) > 0.94) b = null; }                // 이미 꽉 찬 쪽은 그대로
        d.crops[pg] = b; return b;
      }, function () { d.crops[pg] = null; return null; });
    }
    /** 태블릿 위 캡슐 도크가 열려 있으면 그 밑에서부터 악보가 시작 (도크가 악보 윗부분을 가리지 않게) */
    function dockPad() { return S.layout === 'tablet' && !S.compact && !S.fs && !el.classList.contains('pv-toolshide') ? DOCK_PAD - 8 : 0; }
    var DOCK_PAD = 54;
    function fitScale(info, cr) {
      var aw = Math.max(200, stage.clientWidth - (S.layout === 'computer' && !S.compact ? 24 : 8)), ah = Math.max(200, stage.clientHeight - 8 - dockPad());
      if (spreadOn()) aw = Math.max(150, (aw - 12) / 2);                 // 두 쪽 : 각 쪽이 가로 절반
      function one(w, h) { var fw = aw / w, fh = ah / h; return S.fit === 'page' ? Math.min(fw, fh) : fw; }
      var full = one(info.w, info.h); if (!cr) return full;
      var up = one(info.w * (cr.x1 - cr.x0), info.h * (cr.y1 - cr.y0));
      return up < full * CROP_MIN_GAIN ? full : Math.min(up, full * CROP_MAX_UP);
    }
    /* ------------------------------------------------------------ 두 쪽 나란히 (컴퓨터 화면)
       왼쪽 = 지금 쪽 (필기 · 실시간 동기화는 이 쪽에만 — 기존 그대로). 오른쪽 = 다음 쪽 (보기 전용, 눌러서 왼쪽으로 가져오면 필기 가능). */
    var box2 = $('.pv-pagebox2'), pdf2 = $('.pv-pdf2'), spreadBtn = $('.pv-spreadbtn');
    function spreadOn() { return !!S.spread && S.layout === 'computer' && stage.clientWidth >= 860; }
    function syncSpreadUi() {
      var on = spreadOn(), can = S.layout === 'computer';
      el.classList.toggle('pv-spread', on); spreadBtn.style.display = can ? '' : 'none';
      spreadBtn.classList.toggle('on', on); spreadBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!on) box2.style.display = 'none';
    }
    function renderRight(id, pg, d, base, dpr) {
      syncSpreadUi();
      if (!spreadOn() || pg >= d.n) { box2.style.display = 'none'; return; }
      pageInfo(d, pg + 1).then(function (info) {
        if (id !== S.rid || !spreadOn()) return;
        var w = Math.max(50, Math.floor(info.w * base)), hh = Math.max(50, Math.floor(info.h * base));
        box2.style.display = ''; box2.style.width = w + 'px'; box2.style.height = hh + 'px';
        pdf2.style.width = w + 'px'; pdf2.style.height = hh + 'px'; pdf2.width = Math.round(w * dpr); pdf2.height = Math.round(hh * dpr);
        var c = pdf2.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, pdf2.width, pdf2.height);
        try { info.draw(pdf2, base * dpr); } catch (e) { box2.style.display = 'none'; }
      }, function () { box2.style.display = 'none'; });
    }
    box2.onclick = function () { if (S.page < S.pages) goPage(S.page + 1, true); toast('필기하려면 이 쪽이 왼쪽에 옵니다. 다음 쪽은 오른쪽에 보입니다.'); };
    S.spread = ls('spread') === '1';
    function toggleSpread() {
      if (S.layout !== 'computer' || stage.clientWidth < 860) { toast('두 쪽 보기는 넓은 컴퓨터 화면에서만 됩니다.', true); return; }
      S.spread = !S.spread; ls('spread', S.spread ? '1' : '0'); S.zoom = 1; renderPage();
    }
    /* ------------------------------------------------------------ 그려 둔 쪽 그림 저장소
       쪽을 넘기거나 앞뒤로 되돌아갈 때, 또는 화면 크기가 그대로인 채 패널만 열고 닫을 때 PDF 를 처음부터 다시 그리지 않도록
       "이미 그려 둔 쪽 그림"을 메모리에 둡니다. 키 = 악보 + 쪽 + 화면 크기 + 화소 배율 (하나라도 다르면 새로 그림).
       · 메모리는 64MB · 10쪽까지만 (오래 안 쓴 것부터 버림) — 아이패드 같은 기기가 느려지지 않게
       · 지금 쪽을 그린 뒤 한가한 때 앞 · 뒤 쪽을 미리 그려 둡니다 (쪽 넘기기가 바로 됨) */
    S.pcache = new Map(); S.pcBytes = 0; S.pcCur = ''; S.drawnSig = null; S.drawnOk = false; S.pending = null;
    /* 폰 · 작은 태블릿은 화면 그림 자체가 메모리를 많이 쓰므로 저장소를 더 작게 (48MB), 컴퓨터는 96MB */
    var PHONE = (root.innerWidth || 1200) < 900 || (root.matchMedia && root.matchMedia('(pointer: coarse)').matches && (root.innerWidth || 1200) < 1100);
    var PC_MAX_BYTES = (PHONE ? 48 : 96) * 1024 * 1024, PC_ONE_MAX = (PHONE ? 22 : 40) * 1024 * 1024, PC_MAX_N = 10;
    function pcSig(d, pg, w, h, dpr) { return d.fid + '|' + pg + '|' + w + 'x' + h + '@' + dpr; }
    function pcGet(sig) { var e = S.pcache.get(sig); if (!e) return null; S.pcache.delete(sig); S.pcache.set(sig, e); return e; }      // 방금 쓴 것을 맨 뒤로 (가장 오래 안 쓴 것이 앞)
    function pcDrop(k) { var e = S.pcache.get(k); if (!e) return; S.pcache.delete(k); S.pcBytes -= e.bytes; try { e.cv.width = e.cv.height = 0; } catch (x) {} }
    function pcClear() { Array.from(S.pcache.keys()).forEach(pcDrop); S.pcBytes = 0; }
    /** bytes 가 들어갈 자리를 만듭니다 — 가장 오래 안 쓴 것부터 버리되 지금 보는 쪽(S.pcCur)은 지키고, 그래도 안 되면 false */
    function pcRoom(bytes) {
      var keys = Array.from(S.pcache.keys()), i = 0;
      while ((S.pcBytes + bytes > PC_MAX_BYTES || S.pcache.size >= PC_MAX_N) && i < keys.length) { var k = keys[i++]; if (k !== S.pcCur) pcDrop(k); }
      return S.pcBytes + bytes <= PC_MAX_BYTES && S.pcache.size < PC_MAX_N;
    }
    function pcAdd(sig, cv) {                                            // cv 를 저장소가 넘겨받습니다 (복사 없음). 자리가 없으면 저장하지 않고 버립니다
      var bytes = cv.width * cv.height * 4;
      if (bytes > PC_ONE_MAX || S.pcache.has(sig) || !pcRoom(bytes)) { try { cv.width = cv.height = 0; } catch (x) {} return; }
      S.pcache.set(sig, { cv: cv, bytes: bytes }); S.pcBytes += bytes;
    }
    function pcCopy(sig, src) {                                          // 화면 canvas 를 복사해 저장 (복사 한 번 — 화면에 그린 직후)
      var bytes = src.width * src.height * 4; if (bytes > PC_ONE_MAX || S.pcache.has(sig) || !pcRoom(bytes)) return;
      var c2 = doc.createElement('canvas'); c2.width = src.width; c2.height = src.height;
      try { c2.getContext('2d').drawImage(src, 0, 0); } catch (e) { return; }
      pcAdd(sig, c2);
    }
    /** 쪽 크기 · 화면 크기 · 배율에서 나오는 그림 크기 (그리기 · 미리 그리기 · 저장소 키가 같은 계산을 쓰도록 한 곳에) */
    function layoutOf(info, cr) {
      var base = fitScale(info, cr) * S.zoom, cssW = Math.max(50, Math.floor(info.w * base)), cssH = Math.max(50, Math.floor(info.h * base));
      var dpr = Math.min(2, root.devicePixelRatio || 1); while (cssW * cssH * dpr * dpr > 14e6 && dpr > 1) dpr -= 0.25;
      return { base: base, cssW: cssW, cssH: cssH, dpr: dpr };
    }
    function cropFor(d, pg, info) { return S.crop && !spreadOn() ? cropOf(d, pg, info) : Promise.resolve(null); }
    /** 지금 쪽 앞 · 뒤 한 쪽을 브라우저가 한가할 때 미리 그려 저장소에 둡니다 (화면 · 필기에는 손대지 않음) */
    function prefetch(d, pg0, id) {
      if (spreadOn() || S.dead) return;
      var run = function () {
        if (id !== S.rid || S.dead || S.doc !== d) return;
        [pg0 + 1, pg0 - 1].filter(function (n) { return n >= 1 && n <= d.n; }).reduce(function (p, n) {
          return p.then(function () {
            if (id !== S.rid || S.doc !== d) return;
            return pageInfo(d, n).then(function (info) {
              return cropFor(d, n, info).then(function (cr) {
                if (id !== S.rid || S.doc !== d) return;
                var L = layoutOf(info, cr), sig = pcSig(d, n, L.cssW, L.cssH, L.dpr);
                var pb = Math.round(L.cssW * L.dpr) * Math.round(L.cssH * L.dpr) * 4;
                if (S.pcache.has(sig) || pb > PC_ONE_MAX || !pcRoom(pb)) return;          // 자리가 없으면 미리 그리지 않음 (지금 쪽 그림은 지킴)
                var off = doc.createElement('canvas'); off.width = Math.round(L.cssW * L.dpr); off.height = Math.round(L.cssH * L.dpr);
                var c = off.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, off.width, off.height);
                var t = info.draw(off, L.base * L.dpr);
                return t.promise.then(function () { if (id === S.rid && S.doc === d && !S.dead) pcAdd(sig, off); else { off.width = off.height = 0; } }, function () { off.width = off.height = 0; });
              });
            });
          });
        }, Promise.resolve()).catch(function () { /* 미리 그리기는 실패해도 화면에 영향 없음 */ });
      };
      if (root.requestIdleCallback) root.requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 250);
    }
    /** 지금 쪽을 화면에 그립니다.
     *   · 같은 쪽 · 같은 크기를 이미 그려 뒀으면 아무것도 하지 않음 (리사이즈 · 패널 열고 닫기 · 도구 막대 접기가 여러 번 불러도 한 번만 그림)
     *   · 같은 그림을 이미 그리는 중이면 그 작업을 그대로 이어받음
     *   · 저장소에 있으면 그림을 붙이기만 함 — 없으면 PDF 를 그리고 저장
     *   force=true 이면 무조건 다시 그림 */
    function renderPage(force) {
      if (!S.doc || S.dead) return Promise.resolve();
      var id = ++S.rid, pg = S.page, d = S.doc;
      return pageInfo(d, pg).then(function (info) {
        if (id !== S.rid) return;
        return cropFor(d, pg, info).then(function (cr) { return [info, cr]; });
      }).then(function (ic) {
        if (!ic || id !== S.rid) return; var info = ic[0], cr = ic[1], L = layoutOf(info, cr), cssW = L.cssW, cssH = L.cssH, dpr = L.dpr, base = L.base;
        var sig = pcSig(d, pg, cssW, cssH, dpr) + (spreadOn() ? '|s' : '');
        if (!force && S.drawnOk && S.drawnSig === sig) { S.anchor = null; S.cropNow = cr || null; loading.style.display = 'none'; S.rid = S.drawnId; syncTouch(); return; }      // (번호를 되돌려, 진행 중인 미리 그리기가 취소되지 않게)
        if (!force && S.pending && S.pending.sig === sig) { S.rid = S.pending.id; return S.pending.p; }              // 같은 그림을 이미 그리는 중
        if (S.task) { try { S.task.cancel(); } catch (e) {} S.task = null; }
        S.drawnOk = false; S.drawnSig = null;
        var pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
        box.style.width = cssW + 'px'; box.style.height = cssH + 'px';
        pdfCv.style.width = cssW + 'px'; pdfCv.style.height = cssH + 'px';
        if (pdfCv.width !== pw || pdfCv.height !== ph) { pdfCv.width = pw; pdfCv.height = ph; }
        var c = pdfCv.getContext('2d');
        an.resize(cssW, cssH); an.setPage(pg);
        S.cropNow = cr || null;
        if (S.zoom === 1) {                                                        // 자동 맞춤: 글자가 있는 부분의 시작점에 스크롤을 맞춤 (여백은 위 · 옆으로 스크롤하면 보임)
          stage.scrollLeft = cr && !spreadOn() ? Math.max(0, box.offsetLeft + cr.x0 * cssW - 4) : 0;
          stage.scrollTop = cr && !spreadOn() ? Math.max(0, box.offsetTop + cr.y0 * cssH - ((dockPad() ? DOCK_PAD : 4) + badgePad())) : 0;      // 글자 시작점이 (도크가 열려 있으면) 도크 바로 밑에 오게
        }
        if (S.anchor) {                                                            // 두 손가락 확대 직후: 손가락 사이 지점이 손가락 자리에 그대로 오도록
          var an0 = S.anchor; S.anchor = null;
          if (Date.now() - an0.t < 3000) {
            var sr = stage.getBoundingClientRect();
            stage.scrollLeft = Math.max(0, box.offsetLeft + an0.fx * cssW - (an0.cx - sr.left));
            stage.scrollTop = Math.max(0, box.offsetTop + an0.fy * cssH - (an0.cy - sr.top));
          }
        }
        var done = function () { if (id === S.rid) { S.task = null; S.pcCur = pcSig(d, pg, cssW, cssH, dpr); S.drawnSig = sig; S.drawnId = id; S.drawnOk = true; S.pending = null; loading.style.display = 'none'; syncTouch(); prefetch(d, pg, id); } };
        var hit = pcGet(pcSig(d, pg, cssW, cssH, dpr));
        if (hit) {                                                                 // 이미 그려 둔 그림 — 붙이기만
          c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(hit.cv, 0, 0); renderRight(id, pg, d, base, dpr); done(); return;
        }
        c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#fff'; c.fillRect(0, 0, pdfCv.width, pdfCv.height);
        var t = info.draw(pdfCv, base * dpr); S.task = t;
        renderRight(id, pg, d, base, dpr);
        var pr = t.promise.then(function () {
          if (id === S.rid) { pcCopy(pcSig(d, pg, cssW, cssH, dpr), pdfCv); done(); }
        }, function (e) {
          if (S.pending && S.pending.id === id) S.pending = null;
          if (e && e.name === 'RenderingCancelledException') return; loading.style.display = 'none'; toast('이 쪽을 그리지 못했습니다.', true);
        });
        S.pending = { sig: sig, id: id, p: pr };
        return pr;
      }, function () { loading.style.display = 'none'; toast('이 쪽을 읽지 못했습니다.', true); });
    }
    /** 여러 곳에서 "다시 그려라"가 몰려 와도 한 번만 (마지막 요청 기준) — 리사이즈 · 패널 · 도구 막대 접기 */
    function renderSoon(ms) {
      clearTimeout(S.rsT);
      S.rsT = setTimeout(function () { S.rsT = 0; if (S.doc && !S.dead) renderPage(); }, ms == null ? 120 : ms);
    }
    function pgLabel() { var t = S.page + ' / ' + S.pages; $('.pv-pg').textContent = t; var f = $('.pv-fspg'); if (f) f.textContent = t; }

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
        syncSongForPage(); scanTitles(d, f);
        return renderPage().then(function () { if (fromUser) sendNav(); });
      }).catch(function (e) {
        if (lid !== S.loadId) return;
        S.doc = null; loading.style.display = 'flex'; loading.textContent = (e && e.message) || '악보를 불러오지 못했습니다.'; toast(loading.textContent, true, 7000);
      });
    }
    function goPage(n, fromUser) {
      if (!S.doc) return; n = clamp(n | 0, 1, S.pages); if (n === S.page) return;
      S.page = n; pgLabel(); stage.scrollTop = 0; an.closeEditor(); syncSongForPage(); renderPage(); P.emit('page', n);
      if (fromUser) sendNav();
    }
    function nextPage(user) {
      if (S.page < S.pages) goPage(S.page + (spreadOn() && S.page + 1 < S.pages ? 2 : 1), user);
      else if (S.sheetIdx < sheets.length - 1) loadSheet(S.sheetIdx + 1, 1, user);
    }
    function prevPage(user) {
      if (S.page > 1) goPage(S.page - (spreadOn() && S.page > 2 ? 2 : 1), user);
      else if (S.sheetIdx > 0) { var pi = S.sheetIdx - 1; loadSheet(pi, 9999, user); }
    }
    function setZoom(z, user) { S.zoom = clamp(z, 0.4, 4); renderPage(); if (user) sendNav(); }
    /** Ctrl+휠 · 트랙패드 핀치처럼 짧은 시간에 여러 번 오는 확대는, 화면은 CSS 로 바로 크기만 미리 보여 주고 실제 다시 그리기는 멈춘 뒤 한 번만 */
    var wz = { z: 0, t: 0 };
    function wheelZoom(factor) {
      var cur = wz.t ? wz.z : S.zoom; wz.z = clamp(cur * factor, 0.4, 4);
      pinchPreview(wz.z / S.zoom);
      clearTimeout(wz.t);
      wz.t = setTimeout(function () { wz.t = 0; if (S.dead) return; pinchPreview(1); if (Math.abs(wz.z - S.zoom) > 0.005) setZoom(wz.z, true); }, 140);
    }
    function scrollFrac() { var sh = stage.scrollHeight - stage.clientHeight; return sh > 4 ? clamp(stage.scrollTop / sh, 0, 1) : 0; }

    /* ------------------------------------------------------------ 쪽 ↔ 곡 연결
       PDF 한 파일에 여러 곡이 들어 있을 수 있으므로 BPM · 송폼은 "파일"이 아니라 "쪽"에 붙습니다.
       ① 쪽 위쪽 글자에서 곡 제목을 찾아 자동 연결 (제목이 없는 쪽은 앞 쪽의 곡이 이어짐)  ② 사진 악보 · 글자가 없는 PDF 는 파일 이름으로 짐작
       ③ 틀리면 위 드롭다운으로 그 쪽의 곡을 직접 고름 (기기에 기억) — 고친 쪽부터 다음 제목이 나올 때까지 이어집니다. */
    /* ------------------------------------------------------------ 설정 팀 공유 (Step 2.9)
       쪽↔곡 연결 · 곡별 메트로놈 · 곡 정보(BPM · 송폼 · 유튜브)를 서버(시트)에 저장하고 같은 방 사람들에게 실시간으로 나눕니다.
       · "나만 보기" 를 켜거나 팀장 · 인도자가 아니면 → 내 설정(mine)으로만 저장, 전달하지 않음
       · 팀 설정(team)은 팀장 · 인도자만 바꿀 수 있고, 저장되는 즉시 웹소켓으로 팀 화면에 반영됩니다
       · 내 설정이 팀 설정보다 우선합니다 (내가 "나만 보기" 로 바꿔 둔 것은 팀 값이 바뀌어도 그대로) */
    /* 따라가기는 두 스위치가 독립 — S.follow(페이지) · S.followM(메트로놈). "동기화 끄기(수동)" = 둘 다 끈 상태의 별칭.
       예전에 저장된 수동(manual=1)은 두 스위치를 모두 끈 것으로 옮겨 줍니다. */
    if (ls('fpage') === null && ls('fmetro') === null && ls('manual') === '1') { S.follow = false; S.followM = false; ls('fpage', '0'); ls('fmetro', '0'); }
    Object.defineProperty(S, 'manual', { get: function () { return !S.follow && !S.followM; }, enumerable: true });
    S.cid = 'c' + Math.random().toString(36).slice(2, 10);
    S.cfg = { team: {}, mine: {} }; S.cfgLoaded = false;
    function ck(kind, key) { return kind + '|' + key; }
    function canTeam() { return !!(opts.canEdit || (rt && rt.me && rt.me.canEdit)); }
    function cfgLayer() { return S.layer === 'mine' || !canTeam() ? 'mine' : 'team'; }
    function cfgGet(kind, key) { var k = ck(kind, key); return S.cfg.mine[k] !== undefined ? S.cfg.mine[k] : S.cfg.team[k]; }
    function cfgSend(layer, kind, key, value, done) {
      if (!opts.callServer || !S.room) { if (done) done(false); return; }
      opts.callServer('worshipCfgSave', [opts.token, S.room, layer, kind, key, value == null ? null : value, S.cid],
        function (r) { if (done) done(true, r); },
        function (e) { toast('설정을 저장하지 못했습니다: ' + ((e && e.message) || ''), true); if (done) done(false, e); });
    }
    function cfgSet(kind, key, value) {
      var layer = cfgLayer(), k = ck(kind, key);
      if (kind === 'song') layer = 'mine';
      if (value == null) delete S.cfg[layer][k]; else S.cfg[layer][k] = value;
      if (layer === 'team' && S.cfg.mine[k] !== undefined) { delete S.cfg.mine[k]; cfgSend('mine', kind, key, null); }     // 팀에 저장하면 내 예전 개인 설정은 정리
      if (layer === 'mine' && !canTeam() && !S.warnedMine) { S.warnedMine = true; toast('팀 공유 설정은 팀장 · 인도자만 바꿀 수 있어서, 이번 설정은 내 기기 · 내 계정에만 저장됩니다.', false, 3200); }
      cfgSend(layer, kind, key, value);
      return layer;
    }
    function fillCfg(list, layer) { S.cfg[layer] = {}; (list || []).forEach(function (e) { if (e && e.kind && e.key != null && e.value != null) S.cfg[layer][ck(e.kind, e.key)] = e.value; }); }
    /** 나만 보기로 바꿔 둔 곡 정보(BPM · 송폼 · 링크)를 곡 목록에 덧씌웁니다 */
    function applySongCfg() { songs.forEach(function (s) { var o = S.cfg.mine[ck('song', s.title)]; if (o) Object.assign(s, o); }); }
    function songIdentity(s) { return s ? (s.kind && s.seq ? s.kind + '|' + s.seq : 't|' + s.title) : ''; }
    function replaceSongs(list) {
      var keep = songIdentity(songs[S.songIdx]);
      songs.length = 0; (list || []).forEach(function (x) { songs.push(x); });
      applySongCfg();
      S.maps = {};                                                       // 곡 순서가 바뀌었을 수 있어 쪽↔곡 연결을 다시 계산
      var ni = -1; songs.forEach(function (x, i) { if (ni < 0 && songIdentity(x) === keep) ni = i; });
      if (ni < 0) ni = S.songIdx >= 0 && S.songIdx < songs.length ? S.songIdx : -1;
      renderSongSel(); if (S.doc) { scanTitles(S.doc, sheets[S.sheetIdx]); var idx = resolveSong(sheets[S.sheetIdx], S.page); if (idx >= 0) ni = idx; }
      setSong(ni, true); P.emit('songs');
    }
    function applyMapCfg(fileIdV, force) {
      var m = S.maps[fileIdV]; if (!m) return;
      var v = cfgGet('map', fileIdV); if (!v && !force) return; m.manual = v ? JSON.parse(JSON.stringify(v)) : {};
      if (S.doc && sheets[S.sheetIdx] && sheets[S.sheetIdx].id === fileIdV) { syncSongForPage(); renderSongSel(); }
    }
    function loadCfg() {
      if (!opts.callServer || !S.room) return;
      opts.callServer('worshipCfgLoad', [opts.token, S.room], function (r) {
        if (S.dead || !r) return;
        fillCfg(r.team, 'team'); fillCfg(r.mine, 'mine'); S.cfgLoaded = true;
        if (Array.isArray(r.songs) && r.songs.length) {                                        // 허브에서 방금 바뀐 곡 정보 · 순번(seq · kind)을 채움
          var titles = songs.map(function (x) { return x.title; }).join('\u0001'), nt = r.songs.map(function (x) { return x.title; }).join('\u0001');
          if (titles === nt) { songs.forEach(function (x, i) { Object.assign(x, r.songs[i]); }); applySongCfg(); }
          else replaceSongs(r.songs);
        }
        applyPrefs(S.cfg.mine[ck('follow', 'sync')]);
        Object.keys(S.maps).forEach(function (id) { applyMapCfg(id, false); });
        if (S.doc) { syncSongForPage(); renderSongSel(); if (S.songIdx >= 0) setSong(S.songIdx, true); }
        P.emit('cfg', { kind: 'all', key: '', remote: false });
      }, function () { /* 연결이 안 되면 이 기기에 기억된 값으로 계속 */ });
    }
    function onRemoteCfg(m) {
      if (!m || m.cid === S.cid || !m.kind) return;
      var k = ck(m.kind, m.key);
      if (m.value == null) delete S.cfg.team[k]; else S.cfg.team[k] = m.value;
      if (m.kind === 'map') { applyMapCfg(m.key, true); if (sheets[S.sheetIdx] && sheets[S.sheetIdx].id === m.key) toast((m.by || '팀') + ' 님이 쪽 ↔ 곡 연결을 바꿨습니다.', false, 2200); }
      P.emit('cfg', { kind: m.kind, key: m.key, remote: true, by: m.by });
    }
    function applySongPatch(kind, seq, patch, by, remote) {
      var i = -1; songs.forEach(function (x, j) { if (i < 0 && x.seq === seq && (x.kind || '콘티') === kind) i = j; });
      if (i < 0 || !patch) return;
      Object.assign(songs[i], patch); applySongCfg();
      if (i === S.songIdx) setSong(i, true);
      renderSongSel(); P.emit('songedit', songs[i], !!remote);
      if (remote) toast((by || '팀') + ' 님이 "' + songs[i].title + '" 곡 정보를 바꿨습니다.', false, 2400);
    }
    function songsSig(list) { return (list || []).map(function (x) { return [x.title, x.key, x.bpm, x.form, x.link, x.team, x.seq, x.kind].join('\u0002'); }).join('\u0001'); }
    var refetchT = 0;
    function refetchSongs() {
      clearTimeout(refetchT);
      refetchT = setTimeout(function () {
        if (!opts.callServer || !S.room || S.dead) return;
        opts.callServer('worshipSongsOf', [opts.token, S.room], function (r) {
          if (S.dead || !r || !Array.isArray(r.songs)) return;
          if (songsSig(r.songs) === songsSig(songs)) return;                        // 실제로 달라진 게 없으면 다시 그리지도, 알림을 띄우지도 않음
          replaceSongs(r.songs); toast('허브에서 곡 목록이 바뀌어 새로 불러왔습니다.', false, 2200);
        }, function () {});
      }, 400);
    }
    /** 곡 정보(BPM · 송폼 · 유튜브 링크) 저장 — 팀 층이면 '찬양콘티' 줄을 고쳐 팀에 실시간 전달, 나만 보기면 내 설정으로 */
    function saveSongInfo(idx, patch, done) {
      var s = songs[idx]; if (!s || !patch) { if (done) done(false); return; }
      var layer = cfgLayer(), fail = function (e) { toast((e && e.message) || '저장하지 못했습니다.', true); if (done) done(false); };
      if (layer === 'team' && s.seq && s.kind && opts.callServer && S.room) {
        opts.callServer('worshipSongPatch', [opts.token, S.room, s.kind, s.seq, patch, S.cid], function (r) {
          var k = ck('song', s.title); if (S.cfg.mine[k] !== undefined) { delete S.cfg.mine[k]; cfgSend('mine', 'song', s.title, null); }
          Object.assign(s, r && r.song ? { bpm: r.song.bpm, form: r.song.form, link: r.song.link } : patch); applySongCfg();
          if (patch.bpm) { var mc0 = cfgGet('metro', s.title); if (mc0 && mc0.bpm) cfgSet('metro', s.title, Object.assign({}, mc0, { bpm: +patch.bpm })); }         // 곡 BPM 을 새로 정하면 예전 메트로놈 BPM 도 맞춤
          if (idx === S.songIdx) setSong(idx, true); renderSongSel(); P.emit('songedit', s, false);
          toast('팀 모두에게 저장했습니다.', false, 1800); if (done) done(true);
        }, fail);
      } else {
        var k2 = ck('song', s.title), cur = Object.assign({}, S.cfg.mine[k2] || {}, patch);
        S.cfg.mine[k2] = cur; Object.assign(s, patch);
        if (patch.bpm) { var mc1 = S.cfg.mine[ck('metro', s.title)]; if (mc1 && mc1.bpm) cfgSet('metro', s.title, Object.assign({}, mc1, { bpm: +patch.bpm })); }
        cfgSend('mine', 'song', s.title, cur, function (ok) { if (ok) toast('나에게만 저장했습니다.', false, 1600); if (done) done(ok); });
        if (idx === S.songIdx) setSong(idx, true); renderSongSel(); P.emit('songedit', s, false);
      }
    }
    S.maps = {};
    function mapOf(f) {
      var m = S.maps[f.id];
      if (!m) {
        var saved = {}, shared = cfgGet('map', f.id);
        if (shared) saved = JSON.parse(JSON.stringify(shared)); else { try { saved = JSON.parse(ls('map.' + (S.room || '') + '.' + f.id) || '{}') || {}; } catch (e) { saved = {}; } }
        m = S.maps[f.id] = { auto: {}, manual: saved, scanned: false, scanning: false, base: guessSong(f.name, songs) };
      }
      return m;
    }
    function saveManual(f) {
      var man = mapOf(f).manual;
      try { ls('map.' + (S.room || '') + '.' + f.id, JSON.stringify(man)); } catch (e) {}                 // 기기 기억은 그대로 (연결이 끊겼을 때 대비)
      cfgSet('map', f.id, Object.keys(man).length ? man : null);                                          // 서버 저장 + 팀에 실시간 전달 (나만 보기면 내 것만)
    }
    function resolveSong(f, pg) {
      var m = mapOf(f), cur = m.base;
      for (var p = 1; p <= pg; p++) { if (m.manual[p] != null) cur = m.manual[p]; else if (m.auto[p] != null) cur = m.auto[p]; }
      return cur;
    }
    function autoSongAt(f, pg) { var m = mapOf(f), cur = m.base; for (var p = 1; p <= pg; p++) if (m.auto[p] != null) cur = m.auto[p]; return cur; }
    function scanTitles(d, f) {
      var m = mapOf(f);
      if (m.scanned || m.scanning || !d.pdf || !songs.length) { m.scanned = true; return Promise.resolve(); }
      m.scanning = true;
      var titles = songs.map(function (x) { return normName(x.title); }), pg = 1, last = Math.min(d.n, 120);
      function step() {
        if (pg > last || S.dead) { m.scanning = false; m.scanned = true; return Promise.resolve(); }
        var p = pg++;
        return d.pdf.getPage(p).then(function (page) {
          var top = page.view ? page.view[3] : 0;
          return page.getTextContent().then(function (tc) {
            var head = tc.items.filter(function (it) { return it.str && (!top || !it.transform || it.transform[5] >= top * 0.6); }).slice(0, 40).map(function (it) { return it.str; }).join('');
            var n = normName(head), best = -1, bl = 0;
            titles.forEach(function (t, i) { if (t.length >= 2 && n.indexOf(t) >= 0 && t.length > bl) { best = i; bl = t.length; } });
            if (best >= 0) m.auto[p] = best;
          });
        }).catch(function () {}).then(step);
      }
      return step().then(function () { if (S.doc === d) syncSongForPage(); });
    }
    function songLabel(i) { return i >= 0 && songs[i] ? (i + 1) + '. ' + songs[i].title : '없음'; }
    function renderSongSel() {
      var sel = $('.pv-songsel'); if (!sel) return;
      if (!songs.length) { sel.style.display = 'none'; return; }
      var f = sheets[S.sheetIdx], m = mapOf(f), man = m.manual[S.page], auto = autoSongAt(f, S.page);
      var html = '<option value="auto">자동 · ' + h(songLabel(auto)) + '</option>' + songs.map(function (x, i) { return '<option value="' + i + '">' + h((i + 1) + '. ' + x.title) + '</option>'; }).join('');
      sel.innerHTML = html; sel.value = man != null ? String(man) : 'auto'; sel.style.display = '';
      sel.classList.toggle('manual', man != null);
    }
    function syncSongForPage() {
      if (S.applying || !S.doc || S.dead) return;
      var idx = resolveSong(sheets[S.sheetIdx], S.page);
      if (idx >= 0 && idx !== S.songIdx) setSong(idx, true);
      renderSongSel(); updateFormBadge();
    }
    /* 송폼 배지 (Step 2.15) — 콘티에 송폼이 정해져 있으면 그 곡 악보의 맨 위에 "V1 – C – V2 – B – C – Out" 을 유리 알약으로 띄웁니다.
       악보 그림(캔버스) 위의 HTML 덮개일 뿐이라 필기 좌표 · 실시간 동기화 · PNG/PDF 내보내기에는 영향이 없습니다. 쪽 안에서 스크롤해도 화면 위에 붙어 따라옵니다(sticky). */
    var fbadge1 = doc.createElement('div'), fbadge2 = doc.createElement('div');
    fbadge1.className = 'pv-formbadge'; fbadge2.className = 'pv-formbadge'; fbadge1.setAttribute('aria-live', 'polite');
    box.insertBefore(fbadge1, box.firstChild);
    var box2El = $('.pv-pagebox2'); if (box2El) box2El.insertBefore(fbadge2, box2El.firstChild);
    function formTokens(s) {
      var f = s && String(s.form || '').trim(); if (!f) return [];
      try { if (root.YNForm && root.YNForm.parse) return root.YNForm.parse(f).filter(function (t) { return t && t.k; }); } catch (e) { /* 아래 간단 나누기로 */ }
      return f.split(/\s*[-–>,\/]\s*|\s+/).filter(Boolean).map(function (k) { return { k: k }; });
    }
    function formBadgeHtml(idx) {
      var s = idx >= 0 ? songs[idx] : null, t = formTokens(s); if (!t.length) return '';
      return '<span class="pv-fb-in" role="img" aria-label="송폼 ' + h(t.map(function (x) { return x.k + (x.rep > 1 ? ' ×' + x.rep : ''); }).join(', ')) + '">' +
        '<svg class="pv-fb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' +
        t.map(function (x, i) { return (i ? '<b class="pv-fb-sep" aria-hidden="true">–</b>' : '') + '<span class="pv-fb-t' + (x.custom ? ' cu' : '') + '">' + h(x.k) + (x.rep > 1 ? '<sub>×' + x.rep + '</sub>' : '') + '</span>'; }).join('') + '</span>';
    }
    function badgeIdx(pg) { return S.fbadge !== false && S.doc && pg >= 1 && pg <= (S.pages || 1) ? resolveSong(sheets[S.sheetIdx], pg) : -1; }
    function updateFormBadge() {
      if (S.dead) return;
      var h1 = formBadgeHtml(badgeIdx(S.page)); if (fbadge1.getAttribute('data-h') !== h1) { fbadge1.innerHTML = h1; fbadge1.setAttribute('data-h', h1); }
      var h2 = spreadOn() ? formBadgeHtml(badgeIdx(S.page + 1)) : ''; if (fbadge2.getAttribute('data-h') !== h2) { fbadge2.innerHTML = h2; fbadge2.setAttribute('data-h', h2); }
    }
    /** 배지가 쪽 맨 위를 가리지 않게, 글자가 시작하는 곳을 배지 아래로 (컴퓨터 화면은 배지가 오른쪽 위 빈 곳에 뜨므로 그대로) */
    function badgePad() { return (S.layout === 'computer' && !S.compact) ? 0 : (fbadge1.getAttribute('data-h') ? 30 : 0); }
    $('.pv-songsel').onchange = function () {
      var f = sheets[S.sheetIdx], m = mapOf(f), v = this.value;
      if (v === 'auto') delete m.manual[S.page]; else m.manual[S.page] = +v;
      saveManual(f); var idx = resolveSong(f, S.page);
      if (idx >= 0) setSong(idx, true); renderSongSel(); sendNav();
      toast(v === 'auto' ? '이 쪽을 자동 연결로 되돌렸습니다.' : '이 쪽부터 "' + ((songs[+v] || {}).title || '') + '" 로 연결했습니다. (BPM · 송폼도 이 곡 기준)');
    };

    function setSong(i, silent) {
      S.songIdx = i >= 0 && i < songs.length ? i : -1;
      var s = songs[S.songIdx], t = $('.pv-songinfo');
      t.textContent = s ? [s.title, s.key ? 'Key ' + s.key : '', s.bpm ? s.bpm + ' BPM' : ''].filter(Boolean).join(' · ') : '';
      setYt(s);
      updateFormBadge();
      P.emit('song', s || null, S.songIdx);
      if (!silent) sendNav();
    }
    /* 유튜브 참고 영상 — 리더가 곡 정보에 넣어 둔 링크를 앱 안의 작은 창으로 재생 (악보 화면을 떠나지 않음, 필기 · 실시간 동기화와 무관) */
    function ytIdOf(url) { var m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/.exec(String(url || '')); return m ? m[1] : ''; }
    var ytBtn = $('.pv-ytbtn'), ytBox = null, ytCtl = null;
    function closeYt() { if (ytCtl) { try { ytCtl.destroy(); } catch (e) {} ytCtl = null; } if (ytBox) { ytBox.remove(); ytBox = null; } }
    function setYt(s) { var id = s ? ytIdOf(s.link) : ''; if (ytBox && ytBtn.getAttribute('data-id') !== id) closeYt(); ytBtn.style.display = id ? '' : 'none'; ytBtn.setAttribute('data-id', id); if (!id) closeYt(); }
    ytBtn.onclick = function () {
      var id = ytBtn.getAttribute('data-id'); if (!id) return;
      if (ytBox) { closeYt(); return; }
      ytBox = doc.createElement('div'); ytBox.className = 'pv-yt'; ytBox.setAttribute('role', 'dialog'); ytBox.setAttribute('aria-label', '유튜브 참고 영상');
      ytBox.innerHTML = '<div class="pv-yth"><b>' + h((songs[S.songIdx] || {}).title || '참고 영상') + '</b><a target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + id + '" title="유튜브에서 열기">↗</a><button type="button" aria-label="닫기">✕</button></div><div class="pv-ytbody"></div>';
      ytBox.querySelector('.pv-yth button').onclick = closeYt;
      el.appendChild(ytBox);
      var body = ytBox.querySelector('.pv-ytbody');
      if (root.YNYt) ytCtl = root.YNYt.open(body, { id: id, title: (songs[S.songIdx] || {}).title, ytApi: opts.ytApi });        // 공식 IFrame API: 속도 · A-B 반복
      else body.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&autoplay=1" title="유튜브 참고 영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    };

    /* ------------------------------------------------------------ 패널과 주고받는 통로 */
    var handlers = {};
    var P = {
      yt: function () { return ytCtl; }, cfgGet: cfgGet, cfgSet: cfgSet, cfgLayer: cfgLayer, canTeam: canTeam, saveSongInfo: saveSongInfo, songIdxOf: function (s) { return songs.indexOf(s); },
      el: el, opts: opts, songs: songs, sheets: sheets, tabs: [], toast: toast,
      on: function (n, fn) { (handlers[n] = handlers[n] || []).push(fn); return P; },
      emit: function (n, a, b) { (handlers[n] || []).slice().forEach(function (fn) { try { fn(a, b); } catch (e) { if (root.console) root.console.error('[practice:' + n + ']', e); } }); },
      song: function () { return songs[S.songIdx] || null; }, pageSong: function (pg) { return resolveSong(sheets[S.sheetIdx], pg == null ? S.page : pg); }, songIdx: function () { return S.songIdx; }, setSong: function (i) { setSong(i); },
      file: function () { return sheets[S.sheetIdx]; }, page: function () { return S.page; },
      pdf: function () { return S.doc && S.doc.pdf || null; }, canvas: function () { return pdfCv; },
      pageBox: function () { return box; }, pages: function () { return S.pages; },
      pageSize: function (pg) { return S.doc ? pageInfo(S.doc, pg).then(function (i) { return { w: i.w, h: i.h }; }) : Promise.reject(new Error('악보가 열려 있지 않습니다.')); },
      renderPageTo: function (cv, pg, scale) { return S.doc ? renderTo(cv, S.doc, pg, scale) : Promise.reject(new Error('악보가 열려 있지 않습니다.')); },
      lang: function () { return S.lang; }, setLang: function (l) { S.lang = l === 'ko' ? 'ko' : 'en'; ls('lang', S.lang); },
      cacheInfo: function () { return { pages: S.pcache.size, bytes: S.pcBytes, mine: Object.keys(S.mineCache).length }; },
      penTap: function () { return ls('pentap') !== '0'; },
      setPenTap: function (on) { ls('pentap', on ? '1' : '0'); if (an.setPenTap) an.setPenTap(!!on); },
      penMode: function () { return (an.state && an.state().penMode) || 'auto'; },
      setPenModePref: function (v) { v = v === 'always' || v === 'off' ? v : 'auto'; ls('penmode', v); an.setPenMode(S.layout === 'tablet' ? v : 'off'); },
      swapPenEraser: function () { return an.swapPenEraser ? an.swapPenEraser() : false; },
      formBadge: function () { return S.fbadge !== false; },
      setFormBadge: function (on) { S.fbadge = !!on; ls('fbadge', on ? '1' : '0'); updateFormBadge(); },
      wake: function () { return wakeCtl ? wakeCtl.state() : { wanted: false, mode: 'none', active: false }; },
      fit: function () { return S.fit; }, fullscreen: function () { return !!S.fs; }, setFullscreen: function (b) { setFs(b); },
      layout: function () { return S.layout; }, setLayout: function (l) { applyLayout(l, true); }, hand: function () { return S.hand; },
      setHand: function (hd) { S.hand = hd === 'left' ? 'left' : 'right'; ls('hand', S.hand); applyLayout(S.layout, false); },
      anno: function () { return an; }, rt: function () { return rt; }, canEdit: !!opts.canEdit, canLead: function () { return !!(rt && rt.me && rt.me.canLead); },
      isLeader: function () { return !!(rt && rt.isLeader); }, isClicker: function () { return !!(rt && rt.isClicker); }, showTab: function (id) { showTab(id); },
      getLayer: function () { return S.layer; }, getScope: function () { return S.scope; }, setLayer: function (l) { setLayer(l, true); }, setScope: function (s) { setScope(s); },
      recvCue: function (v) { if (v !== undefined) { S.recvCue = !!v; ls('recvcue', v ? '1' : '0'); } return S.recvCue; },
      sendCueOn: function (v) { if (v !== undefined) { S.sendCue = !!v; ls('sendcue', v ? '1' : '0'); } return S.sendCue; },
      cueIdFor: cueIdFor,
      /** 페이지 컨트롤 또는 클릭 컨트롤이면 팀 모두에게 큐를 보냅니다 (스위치가 켜져 있을 때 · 동기화를 끈 동안에는 보내지 않음) */
      broadcastCue: function (id) {
        if (!rt || !(rt.isLeader || rt.isClicker) || !S.sendCue || !rt.online || S.manual) return Promise.resolve(false);
        return rt.call('cue', { label: id, kind: 'cue' }).then(function () { return true; }, function (e) { toast('큐를 팀에 보내지 못했습니다: ' + e.message, true); return false; });
      },
      /** 동기화 끄기 (수동) — 켜 두면 남이 넘기는 쪽 · 바꾸는 BPM · 시작/멈춤 · 큐를 모두 무시하고, 내 것도 보내지 않습니다 */
      manual: function () { return S.manual; }, setManual: function (b) { setManual(b); },
      claimClick: function (force) { return claimClick(force); }, releaseClick: function () { return releaseClick(); },
      follow: function () { return S.follow; }, setFollow: function (b) { setFollow(b); }, followMetro: function () { return S.followM; }, setFollowMetro: function (b) { setFollowM(b); }, followNow: function () { followNow(); },
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
      sawPen: ls('sawpen') === '1', onPenSeen: function () { ls('sawpen', '1'); },                    // 이 기기에서 펜슬을 한 번 쓴 적이 있으면 처음부터 손가락 필기를 막음 (손바닥 방지) — 필기 탭의 "펜 입력"에서 바꿀 수 있음
      onToolSwap: function (to, from, via) { swapTool(to, via); },
      onAdd: function (layer, it) { annoSend(layer, it, 'add'); }, onDel: function (layer, id) { annoSend(layer, { id: id }, 'del'); },
      onClear: function (layer, ids, pg, all) { annoClear(layer, ids, pg, all); },
      onLive: function (m) { if (rt && rt.online) rt.fire('anno:live', Object.assign({ file: sheets[S.sheetIdx].id }, m)); },
      onChange: function () { P.emit('annochange'); },
      onMessage: function (t, bad) { toast(t, bad); },
      keepEditor: function (a) { return !!(a && (toolsEl.contains(a) || (drawerEl && drawerEl.contains(a)))); },
      teamBlocked: function () {
        var blocked = !rt || rt.state === 'unavailable' || rt.state === 'denied';
        if (!blocked) return '';
        if (!S.layerUser) { S.layer = 'mine'; an.setLayer('mine'); renderTools(); toast('팀에 연결되어 있지 않아 이번에는 "나만 보기"로 씁니다.'); return ''; }       // 직접 고르지 않았다면 필기가 막히지 않도록 임시로 내 것으로
        return '팀 공유에 연결되어 있지 않습니다. "나만 보기"를 체크해서 쓰거나 새로고침해 주세요.';
      }
    }) : { setPenMode: function () {}, resize: function () {}, setPage: function () {}, closeEditor: function () {}, setItems: function () {}, items: function () { return []; }, setTool: function () {}, setLayer: function () {}, count: function () { return 0; }, drawPage: function () {}, remoteAdd: function () {}, remoteDel: function () {}, remoteClear: function () {}, remoteLive: function () {}, undo: function () {}, redo: function () {}, state: function () { return {}; }, destroy: function () {}, setVisible: function () {}, setPerms: function () {}, setColor: function () {}, setWidth: function () {}, setSymbol: function () {}, setSymSize: function () {}, setTextSize: function () {}, clearPage: function () { return 0; }, setHlColor: function () {}, setStraight: function () {} };

    try { if (an.setPenTap) an.setPenTap(ls('pentap') !== '0'); } catch (e) { /* 필기 도구가 없어도 화면은 계속 */ }
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
    function markMine(sc) { delete S.mineCache[fileId() + '|' + sc]; S.mineDirty[fileId() + '|' + sc] = 1; S.minePend = Object.keys(S.mineDirty).length; clearTimeout(S.mineT); S.mineT = setTimeout(function () { flushMine(); }, 1500); P.emit('sync'); }
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
        opts.callServer('worshipAnnoSaveMine', [opts.token, file, sc, items], function () { if (!S.mineDirty[k]) mineCachePut(file, sc, items); S.savedAt = Date.now(); S.minePend = Object.keys(S.mineDirty).length; P.emit('sync'); },
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
    /* 내 필기(나만 보기)는 나만 바꾸므로 잠깐(2분) 기억해 두고, 같은 악보로 다시 돌아오면 서버에 묻지 않습니다.
       내가 저장할 때마다 이 기억도 함께 최신으로 바꿉니다. 팀 필기는 실시간 서버(메모리)에서 바로 받으므로 기억하지 않습니다. */
    var MINE_TTL = 120000;
    S.mineCache = {};
    function mineCacheGet(file, sc) { var e = S.mineCache[file + '|' + sc]; return e && Date.now() - e.at < MINE_TTL ? e : null; }
    function mineCachePut(file, sc, items) { S.mineCache[file + '|' + sc] = { at: Date.now(), items: (items || []).slice() }; }
    function loadAnno() {
      var id = ++S.annoId, file = fileId(); S.teamFrom = {}; S.scopeOf = {}; S.unsent = {}; S.localMine = {}; S.delMine = {};
      scopes().forEach(function (sc) { delete S.mineLoaded[file + '|' + sc]; });
      an.setItems('team', []); an.setItems('mine', []);
      var rtOn = !!(rt && rt.online);                                                    // 실시간이 연결돼 있으면 팀 필기는 그쪽에서 받으므로 시트 읽기를 아낍니다
      if (opts.callServer) scopes().forEach(function (sc) { loadOne(id, file, sc, 0, rtOn); });
      loadTeam(id, file);
    }
    function loadOne(id, file, sc, tries, mineOnly) {
      var hit = mineOnly ? mineCacheGet(file, sc) : null;
      if (hit) { S.mineLoaded[file + '|' + sc] = true; replaceScope('mine', sc, hit.items); return; }                 // 기억해 둔 내 필기 — 서버에 묻지 않음
      opts.callServer('worshipAnnoLoad', [opts.token, file, sc, !!mineOnly], function (r) {
        if (id !== S.annoId || !r) return;
        S.mineLoaded[file + '|' + sc] = true;
        mineCachePut(file, sc, r.mine || []);
        replaceScope('mine', sc, r.mine || []);
        if (Array.isArray(r.team) && S.teamFrom[sc] !== 'rt') { replaceScope('team', sc, r.team); S.teamFrom[sc] = 'http'; }
        if (r.me) an.setPerms(String(r.me), !!r.canEdit);
      }, function (e) {
        if (id !== S.annoId) return;
        if (tries < 3) { setTimeout(function () { if (id === S.annoId) loadOne(id, file, sc, tries + 1, mineOnly); }, 4000 * (tries + 1)); return; }
        toast('저장된 필기를 불러오지 못했습니다. 새로 쓴 "나만 보기" 필기는 불러오기가 끝난 뒤에 저장됩니다: ' + ((e && e.message) || ''), true);
      });
    }
    function loadTeam(id, file) {
      if (!rt || !rt.online) return;
      scopes().forEach(function (sc) {
        rt.call('anno:load', { file: file, scope: sc }).then(function (r) { if (id !== S.annoId || file !== fileId()) return; S.teamFrom[sc] = 'rt'; replaceScope('team', sc, r.items || []); }, function (e) {
          if (id !== S.annoId) return;
          if (opts.callServer) opts.callServer('worshipAnnoLoad', [opts.token, file, sc, false], function (r) {          // 실시간 응답이 없으면 시트에서 팀 필기를 받아 대신함
            if (id !== S.annoId || !r || !Array.isArray(r.team) || S.teamFrom[sc]) return; replaceScope('team', sc, r.team); S.teamFrom[sc] = 'http';
          }, function () { toast('팀 필기를 불러오지 못했습니다: ' + e.message, true); });
          else toast('팀 필기를 불러오지 못했습니다: ' + e.message, true);
        });
      });
    }
    function setLayer(l, byUser) { S.layer = l === 'mine' ? 'mine' : 'team'; if (byUser) { S.layerUser = true; ls('layer', S.layer); } an.setLayer(S.layer); P.emit('layer', S.layer); renderTools(); }
    function setScope(s) { S.scope = s === 'date' ? 'date' : 'song'; ls('scope', S.scope); P.emit('scope', S.scope); renderTools(); }
    /* scope 를 서버에 보낼 때: 'song' 그대로 / 'date' = 방(날짜) 키 */
    Object.defineProperty(S, 'scopeKey', { get: function () { return S.scope === 'date' && S.room ? S.room : 'song'; } });

    /* ------------------------------------------------------------ 실시간 · 리더-팔로워 */
    function sendNav() {
      if (S.applying || !rt || !rt.isLeader || !S.follow) return;      // 페이지 동기화를 끈 동안에는 내 화면을 보내지 않음
      clearTimeout(S.navT);
      S.navT = setTimeout(function () {
        if (!rt || !rt.isLeader || !S.follow) return;
        rt.call('nav', { file: fileId(), page: S.page, song: S.songIdx, zoom: S.zoom, sy: scrollFrac() }).catch(function (e) { if (e.code !== 'perm') toast('페이지 컨트롤 화면을 보내지 못했습니다: ' + e.message, true); });
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
        if (nav.file && idx < 0) { toast('페이지 컨트롤이 연 악보가 내 목록에 없습니다. (악보 목록을 새로고침해 보세요)', true); return done(); }
        if (nav.song != null && nav.song >= 0 && nav.song !== S.songIdx) setSong(nav.song, true);
        var z = nav.zoom > 0 ? nav.zoom : 1;
        var after = function () { if (Math.abs(z - S.zoom) > 0.01) { S.zoom = clamp(z, 0.4, 4); return renderPage(); } };
        var scrollTo = function () { if (nav.sy != null) setTimeout(function () { var sh = stage.scrollHeight - stage.clientHeight; if (sh > 0) stage.scrollTop = sh * nav.sy; }, 60); };
        if (idx !== S.sheetIdx || !S.doc) { loadSheet(idx, nav.page, false).then(function () { return after(); }).then(function () { scrollTo(); done(); }, done); }
        else { var same = nav.page === S.page; if (!same) goPage(nav.page, false); Promise.resolve(after()).then(function () { scrollTo(); done(); }, done); }
      } catch (e) { done(); }
    }
    /* ---- 따라가기 (페이지 · 메트로놈 독립) — 이 기기에 저장 + 서버(내 설정)에 저장 + 접속자 목록에 표시 ---- */
    function pushPrefs() {
      S.prefTouched = true; clearTimeout(S.prefT);
      S.prefT = setTimeout(function () {
        var v = { page: S.follow, metro: S.followM };
        if (rt && rt.online) rt.call('prefs', v).catch(function () {});
        cfgSend('mine', 'follow', 'sync', v);                          // 계정에 저장 → 다른 기기 · 다음 접속에서도 같은 상태
      }, 400);
    }
    function applyPrefs(v) {                                            // 서버에 저장된 내 상태를 불러올 때 (알림 없이)
      if (!v || S.prefTouched) return;
      var pg = v.page !== false, mt = v.metro !== false;
      if (pg === S.follow && mt === S.followM) return;
      var wasM = S.followM; S.follow = pg; S.followM = mt; ls('fpage', pg ? '1' : '0'); ls('fmetro', mt ? '1' : '0');
      if (pg && rt && rt.nav && !rt.isLeader) applyNav(S.pendingNav || rt.nav, true);
      renderChips(); P.emit('follow', S.follow); if (wasM !== mt) P.emit('followm', mt);
    }
    function setFollow(b, quiet) {
      b = !!b; if (S.follow === b && !quiet) return;
      var wasManual = S.manual;
      S.follow = b; ls('fpage', b ? '1' : '0');
      if (S.follow && S.pendingNav) applyNav(S.pendingNav, true);
      else if (S.follow && rt && rt.nav && !rt.isLeader) applyNav(rt.nav, true);
      else if (S.follow && rt && rt.isLeader) sendNav();
      renderChips(); P.emit('follow', S.follow); if (wasManual !== S.manual) P.emit('manual', S.manual);
      if (!quiet) { pushPrefs(); toast(b ? (rt && rt.isLeader ? '내 페이지 넘김을 팀에 보냅니다.' : '페이지 컨트롤 화면을 따라갑니다.') : (rt && rt.isLeader ? '페이지 동기화를 껐습니다. 내 페이지 넘김은 팀에 보내지 않습니다.' : '페이지 따라가기를 껐습니다. 내 화면은 그대로 유지됩니다.')); }
    }
    function setFollowM(b, quiet) {
      b = !!b; if (S.followM === b && !quiet) return;
      var wasManual = S.manual;
      S.followM = b; ls('fmetro', b ? '1' : '0');
      renderChips(); P.emit('followm', b); if (wasManual !== S.manual) P.emit('manual', S.manual);
      if (!quiet) { pushPrefs(); toast(b ? (rt && rt.isClicker ? '내 메트로놈 조작을 팀에 보냅니다.' : '클릭 컨트롤의 메트로놈을 따라갑니다.') : (rt && rt.isClicker ? '메트로놈 동기화를 껐습니다. 내 조작은 팀에 보내지 않습니다.' : '메트로놈 따라가기를 껐습니다. 내 메트로놈은 내가 직접 조절합니다.')); }
    }
    /** 예전 "동기화 끄기 (수동)" = 두 스위치를 함께 끄기/켜기 */
    function setManual(b) {
      b = !!b; if (S.manual === b) return;
      var m0 = S.followM; S.follow = !b; S.followM = !b; ls('fpage', b ? '0' : '1'); ls('fmetro', b ? '0' : '1');
      if (!b) {                                                           // 다시 켜면 지금 상태로 바로 맞춥니다
        if (rt && !rt.isLeader) { var n = S.pendingNav || rt.nav; if (n) applyNav(n, true); }
        else if (rt && rt.isLeader) sendNav();
      }
      renderChips(); P.emit('follow', S.follow); if (m0 !== S.followM) P.emit('followm', S.followM); P.emit('manual', b); pushPrefs();
      toast(b ? '동기화를 껐습니다. 내 화면 · 메트로놈은 따로 움직이고, 내 조작도 팀에 보내지 않습니다.' : '동기화를 켰습니다. 팀과 같은 화면 · 박자로 맞춥니다.');
    }
    function followNow() { var n = S.pendingNav || (rt && rt.nav); if (n) applyNav(n, true); else toast('페이지 컨트롤이 아직 화면을 넘기지 않았습니다.'); }
    function claim(force) {
      if (!rt) return Promise.reject(new Error('실시간 연결이 없습니다.'));
      return rt.claim(force).then(function () { toast('페이지 컨트롤이 되었습니다. 지금부터 넘기는 화면을 팀이 따라옵니다.'); sendNav(); renderChips(); }, function (e) {
        toast(e.code === 'taken' ? e.message + ' 넘겨받으려면 "넘겨받기"를 누르세요.' : e.message, true); throw e;
      });
    }
    function release() { return rt ? rt.release().then(function () { toast('페이지 컨트롤을 내려놓았습니다.'); renderChips(); }, function (e) { toast(e.message, true); }) : Promise.resolve(); }
    function claimClick(force) {
      if (!rt) return Promise.reject(new Error('실시간 연결이 없습니다.'));
      return rt.claimClick(force).then(function () { toast('클릭 컨트롤이 되었습니다. 지금부터 누르는 시작 · 멈춤 · BPM 을 팀 모두의 메트로놈이 따라옵니다.'); renderChips(); P.emit('clicker'); }, function (e) {
        toast(e.code === 'taken' ? e.message + ' 넘겨받으려면 "넘겨받기"를 누르세요.' : e.message, true); throw e;
      });
    }
    function releaseClick() { return rt ? rt.releaseClick().then(function () { toast('클릭 컨트롤을 내려놓았습니다.'); renderChips(); P.emit('clicker'); }, function (e) { toast(e.message, true); }) : Promise.resolve(); }

    function renderChips() {
      var conn = $('.pv-conn'), lead = $('.pv-lead'), fol = $('.pv-follow'), clk = $('.pv-click'), folm = $('.pv-followm');
      var st = rt ? rt.state : 'unavailable';
      var label = { idle: '연결 전', connecting: '연결 중…', online: '실시간 연결됨', offline: '연결 끊김 — 다시 연결 중', unavailable: '혼자 보기 (실시간 없음)', denied: '연결 거부됨' }[st] || st;
      conn.textContent = { online: '● 실시간', connecting: '○ 연결 중', offline: '○ 끊김', unavailable: '○ 혼자', denied: '✕ 거부', idle: '○' }[st] || '○';
      conn.className = 'pv-chip pv-conn ' + st; conn.title = label + (rt && rt.error && st !== 'online' ? ' — ' + rt.error : '');
      var pend = rt ? rt.pending() : 0; if (pend) conn.textContent += ' · 대기 ' + pend;
      var peers = rt ? rt.peers.length : 0;
      if (st === 'online') {
        lead.style.display = ''; var ln = rt.leader;
        lead.textContent = rt.isLeader ? '📄 내가 페이지 컨트롤' : ln ? '📄 ' + ln : '페이지 컨트롤 없음'; lead.className = 'pv-chip pv-lead' + (rt.isLeader ? ' me' : ln ? ' has' : '');
        lead.title = peers + '명 접속 중 — 눌러서 페이지 컨트롤 · 클릭 컨트롤 · 동기화 설정 열기';
        var cn = rt.clicker;
        clk.style.display = ''; clk.textContent = rt.isClicker ? '🎚 내가 클릭 컨트롤' : cn ? '🎚 ' + cn : '클릭 컨트롤 없음'; clk.className = 'pv-chip pv-click' + (rt.isClicker ? ' me' : cn ? ' has' : '');
        clk.title = '메트로놈(클릭)을 조절하는 사람 — 눌러서 설정 열기';
      } else { lead.style.display = 'none'; clk.style.display = 'none'; }
      if (st === 'online' && S.manual) {
        fol.style.display = ''; fol.className = 'pv-chip pv-follow off manual'; fol.textContent = '⛔ 동기화 꺼짐 (수동)'; fol.setAttribute('aria-pressed', 'false');
        fol.title = '눌러서 동기화 다시 켜기';
      } else if (st === 'online' && rt.leader && !rt.isLeader) {
        fol.style.display = ''; fol.className = 'pv-chip pv-follow ' + (S.follow ? 'on' : 'off'); fol.title = '페이지 컨트롤 화면 따라가기 켜기/끄기';
        var behind = !S.follow && S.pendingNav && (S.pendingNav.page !== S.page || S.pendingNav.file !== fileId());
        fol.textContent = S.follow ? '따라가는 중' : (behind ? '따라가기 꺼짐 · 컨트롤 ' + S.pendingNav.page + '쪽' : '따라가기 꺼짐');
        fol.setAttribute('aria-pressed', S.follow ? 'true' : 'false');
      } else fol.style.display = 'none';
      if (folm) {                                                         // 메트로놈 따라가기 칩 (페이지 칩과 독립)
        if (st === 'online' && !S.manual && rt.clicker && !rt.isClicker) {
          folm.style.display = ''; folm.className = 'pv-chip pv-followm ' + (S.followM ? 'on' : 'off'); folm.textContent = S.followM ? '🎚 메트로놈 따라감' : '🎚 메트로놈 따라가기 꺼짐';
          folm.title = '클릭 컨트롤의 메트로놈 따라가기 켜기/끄기'; folm.setAttribute('aria-pressed', S.followM ? 'true' : 'false');
        } else folm.style.display = 'none';
      }
      P.emit('conn', st);
    }
    function connect() {
      if (opts.realtime === false || !root.YNRT || !S.room) { renderChips(); return; }
      rt = root.YNRT.create({ token: opts.token, room: S.room, io: opts.io });
      ['state', 'peers', 'leader', 'clicker', 'outbox'].forEach(function (n) { rt.on(n, function () { renderChips(); P.emit(n); }); });
      rt.on('joined', function (r) {
        renderChips(); P.emit('joined', r);
        rt.call('prefs', { page: S.follow, metro: S.followM }).catch(function () {});      // 접속자 목록에 내 따라가기 상태 표시
        if (r.you) an.setPerms(r.you.name, r.you.canEdit);
        if (S.doc) loadTeam(++S.annoId, fileId());
        if (r.nav && !rt.isLeader) applyNav(r.nav, false);
        if (r.metro) P.emit('metro', r.metro);
      });
      rt.on('metro', function (m) { P.emit('metro', m); });
      rt.on('nav', function (n) { applyNav(n, false); });
      rt.on('leader', function (m) {
        if (rt.isLeader) sendNav();
        else if (m && m.name && m.reason === 'takeover') toast(m.name + ' 님이 페이지 컨트롤을 넘겨받았습니다.');
        else if (m && !m.name && m.reason === 'left') toast('페이지 컨트롤이 나갔습니다.');
        renderChips();
      });
      rt.on('sent', function (m) { if (m.name === 'anno:add' && m.payload && m.payload.item) { delete S.unsent[m.payload.item.id]; P.emit('sync'); } });
      rt.on('rejected', function (r) {
        var m = r.msg; if (m.name === 'anno:add' && m.payload && m.payload.item) { delete S.unsent[m.payload.item.id]; an.remoteDel('team', m.payload.item.id); }
        toast('보내지 못한 필기가 있습니다: ' + r.error.message, true); P.emit('sync');
      });
      rt.on('clicker', function (m) {
        if (m && m.name && m.reason === 'takeover' && !rt.isClicker) toast(m.name + ' 님이 클릭 컨트롤을 넘겨받았습니다.');
        else if (m && !m.name && m.reason === 'left') toast('클릭 컨트롤이 나갔습니다.');
      });
      rt.on('cue', function (c) { P.emit('cue', c); });
      rt.on('cfg', onRemoteCfg);
      rt.on('song', function (m) { if (m && m.cid !== S.cid) applySongPatch(m.kind, m.seq, m.patch, m.by, true); });
      rt.on('songs:changed', function () { refetchSongs(); });
      rt.on('state', function (st) { if (st === 'online' && S.cfgLoaded && S.wasOffline) loadCfg(); S.wasOffline = st === 'offline'; });
      rt.on('anno:add', function (m) { if (m.file !== fileId() || scopes().indexOf(m.scope) < 0) return; S.scopeOf[m.item.id] = m.scope; an.remoteAdd('team', m.item); });
      rt.on('anno:del', function (m) { if (m.file === fileId()) an.remoteDel('team', m.id); });
      rt.on('anno:clear', function (m) { if (m.file === fileId()) an.remoteClear('team', m.ids); });
      rt.on('anno:live', function (m) { if (m.file === fileId()) an.remoteLive(m); });
      rt.on('anno:saved', function (m) { if (m.ok) S.savedAt = m.at; else toast('팀 필기 자동 저장에 실패했습니다. 잠시 후 다시 시도합니다.', true); P.emit('sync'); });
      rt.connect(); renderChips();
    }

    /* ------------------------------------------------------------ 도구 막대 */
    var SIZES = { pen: [0.0018, 0.003, 0.0055], hl: [0.012, 0.02, 0.032], text: [0.018, 0.024, 0.034], sym: [0.022, 0.032, 0.05], fbox: [0.02, 0.028, 0.04] };
    S.tool = 'none'; S.sizeIdx = 1; S.symOpen = false; S.fboxTag = (YA && ls('fbtag') && /^[A-Za-z0-9]{1,8}$/.test(ls('fbtag'))) ? ls('fbtag') : 'V';
    function sizeKey() { return S.tool === 'fbox' ? 'fbox' : S.tool === 'hl' ? 'hl' : S.tool === 'text' || S.tool === 'chord' ? 'text' : S.tool === 'sym' ? 'sym' : 'pen'; }
    S.fsz = {}; S.font = ls('font') && YA && YA.FONTS[ls('font')] ? ls('font') : 'sans';
    function applySize() {
      var v = S.fsz[sizeKey()] || SIZES[sizeKey()][S.sizeIdx];
      if (S.tool === 'pen' || S.tool === 'hl') an.setWidth(v); else if (S.tool === 'text' || S.tool === 'chord') an.setTextSize(v); else if (S.tool === 'sym') an.setSymSize(v); else if (S.tool === 'fbox') an.setFboxSize(v);
    }
    /** 펜 ↔ 지우개 빠른 전환 (펜 끝으로 같은 자리를 두 번 톡 · 펜 옆 버튼) — 도구 막대의 단추를 누른 것과 똑같이 바꿉니다 */
    function swapTool(to, via) {
      setTool(to);
      toast(to === 'eraser' ? '🧽 지우개로 전환 — 같은 방법으로 다시 톡톡 치면 펜으로 돌아옵니다' : '✏️ 펜으로 돌아왔습니다', false, 1600);
    }
    function setTool(t) {
      S.tool = t; an.setTool(t);
      if (t === 'pen') an.setWidth(SIZES.pen[S.sizeIdx]); else if (t === 'hl') an.setWidth(SIZES.hl[S.sizeIdx]);
      applySize(); S.symOpen = t === 'sym'; renderTools(); renderSymPop(); P.emit('tool', t);
      var hint = { pen: '펜: 손가락 · 펜 · 마우스로 그립니다.', hl: '형광펜: 문지르면 반투명하게 칠해집니다.', text: '글자: 악보를 눌러 글을 씁니다. 쓴 글자를 다시 누르면 고칠 수 있습니다.', chord: '코드: 악보를 눌러 코드를 씁니다. 아래 버튼으로 빠르게 입력하세요.', sym: '기호: 고른 기호를 악보에 눌러 찍습니다. (이음줄 · 크레센도는 끌어서 길이 조절)', select: '선택·이동: 글자 · 코드 · 기호 · 송폼 라벨을 눌러 선택한 뒤, 끌어서 원하는 자리로 옮기세요. 아래에서 크기 · 글꼴을 바꾸거나 지울 수 있습니다.', eraser: '지우개: 지울 필기를 문지르세요. (내가 쓴 것만 지워집니다)', fbox: '송폼 라벨: 위 칸에서 V · C · P · B · Int 같은 이름표를 고른 뒤, 악보의 원하는 자리를 누르면 그 글자가 바로 붙습니다. (누른 채 끌면 자리를 맞출 수 있고, 잘못 붙였으면 선택·이동 도구로 옮기거나 지울 수 있습니다)' }[t];
      if (hint) toast(hint, false, 2600);
    }
    function renderTools() {
      var ae = doc.activeElement;
      if (ae && ae.tagName === 'INPUT' && (ae.type === 'range' || ae.type === 'number') && toolsEl.contains(ae)) { S.toolsDirty = true; return; }          // 숫자칸에 직접 치는 중에는 다시 그리지 않음
      S.toolsDirty = false;
      var st = an.state ? an.state() : {}, hl = S.tool === 'hl', cols = hl ? YA.HL_COLORS : YA.PALETTE;
      var sel = S.tool === 'select' && an.selected ? an.selected() : null;
      var txt = S.tool === 'text' || S.tool === 'chord' || S.tool === 'sym' || !!(sel && (sel.t === 'text' || sel.t === 'sym' || sel.t === 'fbox')), isSym = S.tool === 'sym' || !!(sel && sel.t === 'sym');
      var fsz = sel ? (sel.sz || (sel.t === 'fbox' ? 0.028 : sel.t === 'sym' ? 0.032 : 0.024)) : isSym ? (st.symSize || 0.032) : (st.textSize || 0.024);
      var fontVal = sel ? (sel.f || 'sans') : S.font, showFont = !sel || sel.t === 'text';
      var rng = sel && sel.t === 'fbox' ? [8, 60] : isSym ? [12, 120] : [12, 80];
      var lock = sel && !sel.canModify ? ' disabled' : '';
      /* 글꼴 · 크기 줄 — 크기는 긴 슬라이더 대신 "숫자 + ▲▼" 작은 조절기 */
      var fontRow = !txt ? '' :
        '<div class="pv-tg pv-fontrow">' + (showFont ? '<label class="pv-fl"><span>글꼴</span><select data-font aria-label="글꼴"' + lock + '>' + YA.FONT_KEYS.map(function (k) { return '<option value="' + k + '"' + (fontVal === k ? ' selected' : '') + '>' + h(YA.FONT_NAMES[k]) + '</option>'; }).join('') + '</select></label>' : '') +
        '<div class="pv-fl"><span>크기</span><span class="pv-num" role="group" aria-label="글자 크기">' +
          '<input type="number" inputmode="numeric" pattern="[0-9]*" data-fsz min="' + rng[0] + '" max="' + rng[1] + '" step="1" value="' + Math.round(fsz * 1000) + '" aria-label="크기 숫자"' + lock + '>' +
          '<span class="pv-numbtns"><button type="button" class="pv-nb" data-step="1" aria-label="크기 키우기" title="크기 키우기"' + lock + '>▲</button><button type="button" class="pv-nb" data-step="-1" aria-label="크기 줄이기" title="크기 줄이기"' + lock + '>▼</button></span></span></div>' +
        (sel ? '<button type="button" class="pv-tool sm pv-del" data-a="delsel" title="선택한 것 지우기 (Delete)"' + lock + '><span class="ic">🗑</span><span class="nm">지우기</span></button>' : '') + '</div>';
      if (S.tool === 'select' && !sel) fontRow = '<div class="pv-tg pv-selhint">글자 · 코드 · 기호 · 송폼 라벨을 눌러 선택하세요. 선택한 뒤 끌면 옮겨집니다.</div>';
      var curCol = sel && sel.c ? sel.c : S.curColor;
      var colRow = S.tool === 'select' && !sel ? '' : '<div class="pv-tg pv-colors pv-sec">' + cols.map(function (c) { var nm = (YA.COLOR_NAMES && YA.COLOR_NAMES[c]) || c; return '<button class="pv-col' + (c === curCol ? ' on' : '') + (c === '#ffffff' ? ' white' : '') + '" data-color="' + c + '" style="--c:' + c + '" title="' + nm + '" aria-label="색 ' + nm + '" aria-pressed="' + (c === curCol) + '"' + lock + '></button>'; }).join('') + '</div>';
      var fbRow = S.tool !== 'fbox' ? '' :
        '<div class="pv-tg pv-fbrow" role="group" aria-label="송폼 라벨">' + YA.FBOX_TAGS.map(function (k) { return '<button type="button" class="pv-fbtag' + (S.fboxTag === k ? ' on' : '') + '" data-fbtag="' + h(k) + '" title="' + h(YA.FBOX_NAMES[k] || k) + '" aria-pressed="' + (S.fboxTag === k) + '">' + h(k) + '</button>'; }).join('') + '</div>';
      toolsEl.innerHTML =
        '<button type="button" class="pv-dk" data-a="dockhide" title="도구 접기" aria-label="도구 접기"><span class="ic">▴</span><span class="nm">접기</span></button>' +
        '<div class="pv-tg">' + TOOLS.map(function (t) { return '<button class="pv-tool' + (S.tool === t.t ? ' on' : '') + '" data-tool="' + t.t + '" title="' + t.n + '" aria-pressed="' + (S.tool === t.t) + '"><span class="ic">' + t.ic + '</span><span class="nm">' + t.n + '</span></button>'; }).join('') + '</div>' +
        colRow +
        fontRow +
        fbRow +
        (S.tool === 'select' ? '' : '<div class="pv-tg pv-sizes pv-sec">' + [0, 1, 2].map(function (i) { return '<button class="pv-size' + (S.sizeIdx === i && !S.fsz[sizeKey()] ? ' on' : '') + '" data-size="' + i + '" title="' + (txt ? '크기 ' : '굵기 ') + (i + 1) + '"><i style="--s:' + (4 + i * 4) + 'px"></i></button>'; }).join('') + '</div>') +
        '<div class="pv-tg"><button class="pv-tool sm" data-a="undo" title="되돌리기 (Ctrl+Z)"' + (st.canUndo ? '' : ' disabled') + '><span class="ic">↶</span><span class="nm">취소</span></button>' +
          '<button class="pv-tool sm" data-a="redo" title="다시 (Ctrl+Shift+Z)"' + (st.canRedo ? '' : ' disabled') + '><span class="ic">↷</span><span class="nm">다시</span></button>' +
          '<button class="pv-tool sm pv-sec" data-a="clearpg" title="현재 페이지에 내가 쓴 필기 지우기"><span class="ic">🗑</span><span class="nm">현재 페이지</span></button></div>' +
        '<button type="button" class="pv-dk" data-a="dockmore" aria-pressed="' + (S.dockMore ? 'true' : 'false') + '" aria-expanded="' + (S.dockMore ? 'true' : 'false') + '" title="더 보기 — 색 · 굵기 · 글꼴" aria-label="더 보기"><span class="ic">⋯</span><span class="nm">더 보기</span></button>' +
        '<div class="pv-tg pv-pills pv-sec"><label class="pv-mineonly' + (S.layer === 'mine' ? ' on' : '') + '" title="체크하면 나에게만 보입니다. 체크하지 않으면(기본) 팀 모두의 화면에 실시간으로 나타납니다."><input type="checkbox" data-a="mineonly"' + (S.layer === 'mine' ? ' checked' : '') + '><span>나만 보기</span></label>' +
          '<button class="pv-pill scope" data-a="scope" title="필기가 어디에 붙나요? (눌러서 바꾸기)">' + (S.scope === 'date' && S.room ? '📅 이 날짜만' : '📌 곡에 계속') + '</button></div>';
      try { P.emit('toolsrender', toolsEl); } catch (e) { /* 라이브 컨트롤이 안 붙어도 도구는 그대로 */ }
    }
    toolsEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b || b.disabled) return;
      if (b.dataset.fbtag) { S.fboxTag = b.dataset.fbtag; an.setFboxTag(S.fboxTag); ls('fbtag', S.fboxTag); renderTools(); return; }
      if (b.dataset.tool) { setTool(b.dataset.tool === S.tool && b.dataset.tool !== 'none' ? 'none' : b.dataset.tool); return; }
      if (b.dataset.step != null) { if (e.detail === 0) stepFsz(+b.dataset.step); return; }               // 마우스 · 터치는 pointerdown (꾹 누르면 반복), 키보드(Enter · Space)만 여기서
      if (b.dataset.color && S.tool === 'select') { if (an.editSelected({ c: b.dataset.color })) renderTools(); return; }
      if (b.dataset.color) { S.curColor = b.dataset.color; if (S.tool === 'hl') { an.setHlColor(S.curColor); S.hlSel = S.curColor; } else { an.setColor(S.curColor); S.penSel = S.curColor; } renderTools(); an.focusEditor && an.focusEditor(); return; }
      if (b.dataset.size != null) { S.sizeIdx = +b.dataset.size; delete S.fsz[sizeKey()]; applySize(); renderTools(); an.focusEditor && an.focusEditor(); return; }
      var a = b.dataset.a;
      if (a === 'dockhide') { setTools(false, true); return; }
      if (a === 'dockmore') { setDockMore(!S.dockMore, true); return; }
      if (a === 'undo') { an.undo(); renderTools(); } else if (a === 'redo') { an.redo(); renderTools(); }
      else if (a === 'clearpg') { var n = an.clearPage(S.layer, false); if (n) toast(n + '개를 지웠습니다. ↶ 로 되돌릴 수 있어요.'); renderTools(); }
      else if (a === 'delsel') { if (an.deleteSelected()) { toast('지웠습니다. ↶ 로 되돌릴 수 있어요.', false, 1600); } renderTools(); }
      else if (a === 'scope') { if (!S.room) toast('이 곡에만 붙일 수 있습니다.'); else setScope(S.scope === 'song' ? 'date' : 'song'); }
    });
    /* 나만 보기 체크박스 · 글꼴 · 크기 슬라이더 */
    toolsEl.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.a === 'mineonly') { setLayer(t.checked ? 'mine' : 'team', true); toast(t.checked ? '이제 나만 보이게 씁니다.' : '이제 팀 모두에게 공유됩니다.', false, 1400); }
      else if (t.dataset && t.dataset.font != null) {
        if (S.tool === 'select') { an.editSelected({ f: t.value }); renderTools(); return; }
        S.font = t.value; ls('font', S.font); an.setFont(S.font); renderTools(); an.focusEditor && an.focusEditor();
      }
      else if (t.dataset && t.dataset.fsz != null) { var nv = parseInt(t.value, 10); if (isFinite(nv)) setFsz(nv / 1000); S.toolsDirty = false; renderTools(); an.focusEditor && an.focusEditor(); }
    });
    toolsEl.addEventListener('input', function (e) {
      var t = e.target; if (!(t.dataset && t.dataset.fsz != null)) return;
      var nv = parseInt(t.value, 10); if (isFinite(nv) && nv >= (+t.min || 1) && nv <= (+t.max || 999)) setFsz(nv / 1000, true);      // 숫자를 치는 도중에도 바로 반영
    });
    /* 글자 크기 — 숫자칸 + ▲▼ (1 단위). 선택·이동 도구에서는 선택한 항목에, 나머지는 새로 쓸 글자 · 기호 크기에 적용 */
    function fszRange() { var sel = S.tool === 'select' && an.selected ? an.selected() : null; return sel && sel.t === 'fbox' ? [0.008, 0.06] : (S.tool === 'sym' || (sel && sel.t === 'sym')) ? [0.012, 0.12] : [0.012, 0.08]; }
    function curFsz() {
      var sel = S.tool === 'select' && an.selected ? an.selected() : null, st = an.state();
      return sel ? (sel.sz || (sel.t === 'fbox' ? 0.028 : sel.t === 'sym' ? 0.032 : 0.024)) : S.tool === 'sym' ? (st.symSize || 0.032) : (st.textSize || 0.024);
    }
    function setFsz(v, quiet) {
      var r = fszRange(); v = Math.max(r[0], Math.min(r[1], Math.round(v * 1000) / 1000));
      if (S.tool === 'select') { an.editSelected({ sz: v }); }
      else { var key = sizeKey(); S.fsz[key] = v; if (key === 'sym') an.setSymSize(v); else an.setTextSize(v); }
      var o = toolsEl.querySelector('input[data-fsz]'); if (o && doc.activeElement !== o) o.value = Math.round(v * 1000);
      if (!quiet) { S.toolsDirty = false; }
    }
    function stepFsz(dir) { setFsz(Math.round(curFsz() * 1000 + dir) / 1000); renderTools(); if (S.tool !== 'select') an.focusEditor && an.focusEditor(); }
    /* ▲▼ 꾹 누르면 반복 (포커스를 뺏지 않아 글자를 치던 중에도 그대로 이어집니다) */
    var holdT = 0, holdI = 0;
    function holdStop() { clearTimeout(holdT); clearInterval(holdI); holdT = holdI = 0; }
    toolsEl.addEventListener('pointerdown', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-step]') : null; if (!b || b.disabled) return;
      e.preventDefault(); var dir = +b.dataset.step; stepFsz(dir); holdStop();
      holdT = setTimeout(function () { holdI = setInterval(function () { stepFsz(dir); }, 70); }, 420);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { toolsEl.addEventListener(n, holdStop); });
    doc.addEventListener('pointerup', holdStop);
    P.on('annochange', function () { clearTimeout(S.toolT); S.toolT = setTimeout(renderTools, 60); });
    ['songedit', 'songs', 'page', 'sheet', 'cfg'].forEach(function (n) { P.on(n, function () { updateFormBadge(); }); });
    /* 색은 도구마다 기억 (펜/글자는 같은 색, 형광펜은 따로) */
    S.curColor = YA ? YA.PALETTE[0] : '#ff5a1f';
    var origSetTool = setTool;
    setTool = function (t) { origSetTool(t); S.curColor = t === 'hl' ? (S.hlSel || YA.HL_COLORS[0]) : (S.penSel || YA.PALETTE[0]); if (t === 'hl') an.setHlColor(S.curColor); else if (t !== 'none') an.setColor(S.curColor); renderTools(); if (S.compact && t !== 'none' && (root.innerWidth || 0) < 600) setDrawer(false); };

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
      renderSoon(260);
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
      if (a === 'drawer-close') setDrawer(false); else if (a === 'drawer-panel') { setDrawer(false); toggleSide(true); }
      else if (a === 'close') api.close(); else if (a === 'prev') prevPage(true); else if (a === 'next') nextPage(true);
      else if (a === 'zin') setZoom(S.zoom * 1.2, true); else if (a === 'zout') setZoom(S.zoom / 1.2, true);
      else if (a === 'spread') toggleSpread();
      else if (a === 'crop') { S.crop = !S.crop; ls('crop', S.crop ? '1' : '0'); S.zoom = 1; syncCropUi(); renderPage(); sendNav(); toast(S.crop ? '여백을 줄여 악보를 크게 보여 줍니다' : '종이 전체를 보여 줍니다'); }
      else if (a === 'zfit') { S.fitUser = true; S.zoom = 1; S.fit = S.fit === 'page' ? 'width' : 'page'; renderPage(); sendNav(); toast(S.fit === 'page' ? '한 쪽이 다 보이게 맞춤' : '가로 폭에 맞춤'); }
      else if (a === 'fs') setFs(!S.fs); else if (a === 'fs-bar') fsBar(!el.classList.contains('pv-fsbar-on')); else if (a === 'fs-tools') { setTools(el.classList.contains('pv-toolshide'), false); fsBar(true); } else if (a === 'fs-panel') { toggleSide(); fsBar(true); }
      else if (a === 'panel') toggleSide(); else if (a === 'follow') { if (S.manual) setManual(false); else setFollow(!S.follow); } else if (a === 'followm') setFollowM(!S.followM); else if (a && a.indexOf('tab:') === 0) showTab(a.slice(4));
    });
    stage.addEventListener('click', function (e) {
      if (S.layout !== 'tablet' || S.tool !== 'none' || !box.contains(e.target) || S.zoom > 1.05 || e.target.closest('.pv-toast')) return;
      var r = box.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
      if (fx < 0.18) prevPage(true); else if (fx > 0.82) nextPage(true);
    });
    /* ---- 손가락 제스처 (폰 · 태블릿) — 옆으로 쓸기 = 쪽 넘기기, 두 손가락 벌리기 · 좁히기 = 확대 · 축소 ----
       · 왼쪽으로 쓸면 다음 쪽, 오른쪽으로 쓸면 이전 쪽 (확대해서 보는 중에는 원래대로 화면을 옮김)
       · 필기 도구를 쓰는 중에는 손가락 한 개는 그리기에 쓰이므로 쓸어 넘기기는 꺼집니다 (펜슬 전용 모드에서는 손가락이 넘기기 · 화면 이동)
       · 두 손가락은 언제나 확대 · 축소 (그리던 획은 버림) */
    var T = null;
    var SWIPE_MIN_DX = 60, SWIPE_MAX_SLOPE = 0.5, SWIPE_ZOOM = 1.05;            // 옆으로 60px 넘게, 세로는 가로의 절반 미만일 때만 쪽 넘김
    /** 쪽 넘김 + 부드러운 슬라이드 — 손가락을 따라 악보가 끌려다니지 않고, 넘어간 뒤 새 쪽이 옆에서 미끄러져 들어옵니다 */
    var slideT = 0;
    function slideFlip(dir) {
      var before = S.page + ':' + S.sheetIdx; dir > 0 ? nextPage(true) : prevPage(true);
      if (before === S.page + ':' + S.sheetIdx) return;                                           // 첫 쪽 · 마지막 쪽이라 안 넘어감
      if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      box.classList.remove('pv-slide-n', 'pv-slide-p'); void box.offsetWidth; box.classList.add(dir > 0 ? 'pv-slide-n' : 'pv-slide-p');
      clearTimeout(slideT); slideT = setTimeout(function () { box.classList.remove('pv-slide-n', 'pv-slide-p'); }, 320);
    }
    /** 브라우저가 악보 칸을 스스로 밀지 않게 — 한 쪽이 화면에 다 들어오면(확대 전 · 가로로 넘치지 않음) 터치 스크롤을 아예 끕니다 (아이패드 고무줄 당김 방지) */
    function syncTouch() {
      if (S.dead) return;
      var hx = stage.scrollWidth > stage.clientWidth + 2, vy = stage.scrollHeight > stage.clientHeight + 2, free = S.zoom <= SWIPE_ZOOM && !hx;
      S.noHx = free; stage.classList.toggle('pv-tx-none', free && !vy); stage.classList.toggle('pv-tx-y', free && vy);
    }
    function tdist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    function tmid(a, b) { return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }; }
    function fingerFree() { return S.tool === 'none' || (an.fingerDraws && !an.fingerDraws()); }        // 손가락 한 개를 "쓸기 · 화면 이동"에 써도 되는가
    /** 확대 미리보기 — 손가락이 움직이는 대로 매 이벤트마다 스타일을 바꾸지 않고, 화면 프레임마다 마지막 값 하나만 적용 */
    var pvScale = 1, pvRaf = 0, pvTx = 0, pvTy = 0, pvOrg = '50% 0';
    function applyPreview() { pvRaf = 0; box.style.transformOrigin = pvOrg; box.style.transform = (pvScale === 1 && !pvTx && !pvTy) ? '' : (pvTx || pvTy ? 'translate(' + pvTx + 'px,' + pvTy + 'px) ' : '') + 'scale(' + pvScale + ')'; }
    /** tx · ty · org 는 두 손가락 확대에서 "손가락 사이 지점을 중심으로, 손가락이 움직인 만큼 함께" 미리 보여 주기 위한 값 (없으면 예전처럼 위쪽 가운데 기준 크기만) */
    function pinchPreview(scale, tx, ty, org) {
      pvScale = scale; pvTx = tx || 0; pvTy = ty || 0; pvOrg = org || '50% 0';
      if (scale === 1 && !pvTx && !pvTy) { if (pvRaf) { root.cancelAnimationFrame && root.cancelAnimationFrame(pvRaf); pvRaf = 0; } applyPreview(); return; }
      if (!pvRaf) pvRaf = root.requestAnimationFrame ? root.requestAnimationFrame(applyPreview) : (applyPreview(), 0);
    }
    /* ---- 애플 펜슬 손바닥 무시 (Step 2.12) ----
       펜슬이 화면에 닿아 있거나 위에 떠 있는 동안(끝난 뒤 700ms 까지), 그리고 닿는 면이 넓은 터치(손바닥)는 쪽 넘기기 · 화면 이동 · 확대에 쓰지 않고 브라우저 스크롤도 막습니다.
       그리는 캔버스는 처음부터 touch-action:none 이고, 필기 중에는 악보 칸 전체도 잠깁니다(.pv-penlock). */
    var penT = 0, penLockT = 0;
    function penNear() { return Date.now() - penT < 700; }
    function palmTouch(t) { return !!t && Math.max(t.radiusX || 0, t.radiusY || 0) > 30; }
    function notePenPtr(e) {
      if (e.pointerType !== 'pen') return;
      penT = Date.now(); if (!stage.classList.contains('pv-penlock')) stage.classList.add('pv-penlock');
      clearTimeout(penLockT); penLockT = setTimeout(function () { stage.classList.remove('pv-penlock'); }, 900);
    }
    ['pointerdown', 'pointermove', 'pointerover', 'pointerup'].forEach(function (n) { stage.addEventListener(n, notePenPtr, true); });
    P.on('close', function () { clearTimeout(penLockT); });
    stage.addEventListener('touchstart', function (e) {
      if (S.dead) return;
      var anyPalm = penNear(); for (var pi = 0; pi < e.touches.length && !anyPalm; pi++) anyPalm = palmTouch(e.touches[pi]);
      if (anyPalm && !(T && T.pinch)) { T = { palm: true }; if (e.cancelable) e.preventDefault(); return; }      // 손바닥 · 펜슬 근처의 터치: 아무 동작도 하지 않음
      if (e.touches.length >= 2) {
        if (an.cancelCurrent) an.cancelCurrent();
        var m0 = tmid(e.touches[0], e.touches[1]), br = box.getBoundingClientRect();
        T = { pinch: true, d0: tdist(e.touches[0], e.touches[1]) || 1, z0: S.zoom, scale: 1, mx0: m0.x, my0: m0.y, mx: m0.x, my: m0.y, sl0: stage.scrollLeft, st0: stage.scrollTop,
          fx: clamp((m0.x - br.left) / (br.width || 1), 0, 1), fy: clamp((m0.y - br.top) / (br.height || 1), 0, 1), zoomed: false };
        if (e.cancelable) e.preventDefault(); return;
      }
      if (e.touches.length === 1) { var t = e.touches[0]; T = { x0: t.clientX, y0: t.clientY, lx: t.clientX, ly: t.clientY, t0: Date.now(), free: fingerFree(), moved: false, axis: null }; }
    }, { passive: false });
    stage.addEventListener('touchmove', function (e) {
      if (!T) return;
      if (T.palm) { if (e.cancelable) e.preventDefault(); return; }
      if (T.pinch) {
        if (e.touches.length < 2) return;
        var mm = tmid(e.touches[0], e.touches[1]); T.mx = mm.x; T.my = mm.y;
        T.scale = clamp(tdist(e.touches[0], e.touches[1]) / T.d0, 0.4, 4) ; T.scale = clamp(T.z0 * T.scale, 0.4, 4) / T.z0;
        if (!T.zoomed && Math.abs(T.scale - 1) < 0.05) {                                          // 두 손가락 이동 = 화면 밀기 (스크롤) — 손가락 간격이 거의 그대로일 때
          stage.scrollLeft = T.sl0 - (mm.x - T.mx0); stage.scrollTop = T.st0 - (mm.y - T.my0); pinchPreview(1);
        } else {                                                                                   // 간격이 변하면 확대 · 축소 — 손가락 사이 지점을 중심으로, 손가락이 움직인 만큼 함께 이동
          T.zoomed = true; stage.scrollLeft = T.sl0; stage.scrollTop = T.st0;
          pinchPreview(T.scale, mm.x - T.mx0, mm.y - T.my0, (T.fx * 100) + '% ' + (T.fy * 100) + '%');
        }
        if (e.cancelable) e.preventDefault(); return;
      }
      if (e.touches.length !== 1) return;
      var t = e.touches[0]; T.moved = T.moved || Math.abs(t.clientX - T.x0) > 8 || Math.abs(t.clientY - T.y0) > 8;
      /* 축 고정 (Step 2.14) — 10px 이상 움직인 순간 한 번만 정합니다: 세로 흔들림이 가로의 절반 미만(|dy/dx| < 0.5)이면 "가로 쓸기".
         가로 쓸기로 정해지면 (확대하지 않았고 가로로 밀 자리가 없을 때) 브라우저 스크롤 · 고무줄 당김을 막아 악보 쪽이 제자리에 그대로 있습니다. */
      var adx = Math.abs(t.clientX - T.x0), ady = Math.abs(t.clientY - T.y0);
      if (!T.axis && (adx > 10 || ady > 10)) T.axis = adx > 10 && ady < adx * 0.5 ? 'h' : 'v';
      if (T.free && T.axis === 'h' && S.zoom <= SWIPE_ZOOM && S.noHx) { if (e.cancelable) e.preventDefault(); T.lx = t.clientX; T.ly = t.clientY; return; }
      if (T.free && S.tool !== 'none') {                                                          // 펜슬 전용 모드 — 캔버스가 브라우저의 스크롤을 막고 있으니 화면 이동은 직접
        stage.scrollLeft -= t.clientX - T.lx; stage.scrollTop -= t.clientY - T.ly; if (e.cancelable) e.preventDefault();
      }
      T.lx = t.clientX; T.ly = t.clientY;
    }, { passive: false });
    function touchDone(e) {
      if (!T) return;
      if (T.palm) { if (!e.touches.length) T = null; return; }
      if (T.pinch) {
        if (e.touches.length >= 2) return;
        var sc = T.scale, tt = T; T = null; pinchPreview(1);
        if (tt.zoomed && Math.abs(sc - 1) > 0.02) {
          S.anchor = { fx: tt.fx, fy: tt.fy, cx: tt.mx, cy: tt.my, t: Date.now() };              // 다시 그린 뒤 손가락 사이 지점이 손가락이 놓인 자리에 오도록 스크롤 맞춤
          setZoom(S.zoom * sc, true);
        }
        return;
      }
      var me = T; if (e.touches.length) return; T = null;
      if (e.type === 'touchcancel' || !me.free || !e.changedTouches.length) return;
      var t = e.changedTouches[0], dx = t.clientX - me.x0, dy = t.clientY - me.y0, dt = Date.now() - me.t0;
      if (S.zoom <= SWIPE_ZOOM && Math.abs(dx) > SWIPE_MIN_DX && Math.abs(dy) < Math.abs(dx) * SWIPE_MAX_SLOPE && dt < 800) { slideFlip(dx < 0 ? 1 : -1); }
    }
    stage.addEventListener('touchend', touchDone, { passive: true });
    stage.addEventListener('touchcancel', touchDone, { passive: true });
    stage.classList.add('pv-gest');
    var scT = 0; stage.addEventListener('scroll', function () { clearTimeout(scT); scT = setTimeout(sendNav, 250); });
    stage.addEventListener('wheel', function (e) { if (e.ctrlKey) { e.preventDefault(); wheelZoom(e.deltaY < 0 ? 1.08 : 1 / 1.08); } }, { passive: false });
    /* 글자를 치는 중인지 — 그때는 단축키를 모두 끕니다. (체크박스 · 슬라이더 · 버튼에 초점이 남아 있는 것은 "치는 중"이 아니므로 단축키가 계속 됩니다) */
    var NOTYPE = { checkbox: 1, radio: 1, range: 1, button: 1, submit: 1, reset: 1, color: 1, file: 1, image: 1 };
    function isTyping(t) {
      if (!t || !t.tagName) return false;
      var tag = t.tagName; if (tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return true;
      return tag === 'INPUT' && !NOTYPE[String(t.type || 'text').toLowerCase()];
    }
    var spaceEaten = false;
    function onKey(e) {
      if (S.dead || isTyping(e.target)) return;
      var k = e.key, mod = e.ctrlKey || e.metaKey;
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? an.redo() : an.undo(); renderTools(); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); an.redo(); renderTools(); return; }
      if (mod || e.altKey) return;
      if ((k === 'Delete' || k === 'Backspace') && an.selected && an.selected()) { e.preventDefault(); an.deleteSelected(); renderTools(); return; }
      var map = { ArrowRight: 'n', PageDown: 'n', ArrowLeft: 'p', PageUp: 'p', ArrowUp: 'bu', ArrowDown: 'bd', ' ': 'sp', Spacebar: 'sp', '+': 'zi', '=': 'zi', '-': 'zo', '0': 'zf', Escape: 'esc', v: 'none', p: 'pen', h: 'hl', t: 'text', m: 'select', c: 'chord', s: 'sym', b: 'fbox', e: 'eraser' };
      var m = map[k]; if (!m) return;
      if (m === 'bu' || m === 'bd' || m === 'sp') {                                    // 메트로놈: ↑↓ BPM · Space 시작/멈춤 — 메트로놈을 쓸 수 없으면 원래 동작(스크롤 등) 그대로
        if (!P.metroKey) return;
        var r = m === 'sp' ? (e.repeat ? { ok: true } : P.metroKey('toggle')) : P.metroKey('bpm', (m === 'bu' ? 1 : -1) * (e.shiftKey ? 5 : 1));
        if (!r) return; e.preventDefault(); if (m === 'sp') spaceEaten = true; return;
      }
      e.preventDefault();
      if (m === 'n') nextPage(true); else if (m === 'p') prevPage(true); else if (m === 'zi') setZoom(S.zoom * 1.2, true); else if (m === 'zo') setZoom(S.zoom / 1.2, true);
      else if (m === 'zf') { S.zoom = 1; renderPage(); sendNav(); }
      else if (m === 'esc') { if (S.fs) setFs(false); else if (an.selected && an.selected()) { an.deselect(); renderTools(); } else if (el.classList.contains('pv-drawopen')) setDrawer(false); else if (S.tool !== 'none') setTool('none'); else api.close(); } else setTool(m);
    }
    function onKeyUp(e) { if ((e.key === ' ' || e.key === 'Spacebar') && spaceEaten) { spaceEaten = false; e.preventDefault(); } }   // 버튼에 초점이 있어도 Space 가 그 버튼을 또 누르지 않게
    doc.addEventListener('keyup', onKeyUp);
    el.addEventListener('change', function (e) { var t = e.target; if (t && t.tagName === 'SELECT') { try { t.blur(); } catch (x) {} } });   // 목록을 고른 뒤에도 단축키가 바로 먹도록
    doc.addEventListener('keydown', onKey);
    var rz = 0, ro = null;
    /* 창 크기 · 화면 회전 · 칸 크기 변화는 마지막 변화 뒤 150ms 가 조용할 때 한 번만 처리 (끌어서 창을 늘리는 동안 매 프레임 다시 계산 · 다시 그리지 않음) */
    function onResize() { clearTimeout(rz); rz = setTimeout(function () { rz = 0; if (S.dead) return; checkCompact(); renderSoon(0); }, 150); }
    root.addEventListener('resize', onResize);
    if (root.ResizeObserver) { ro = new root.ResizeObserver(onResize); ro.observe(stage); }
    /* 화면 켜짐 유지 — 세션 / 연습 화면이 열려 있는 동안 (Wake Lock API → 안 되면 작은 동영상 방식). 다시 보이면 알아서 다시 잡습니다 */
    var wakeCtl = root.YNWake ? root.YNWake.create({ win: root }) : null;
    function requestWake() { if (wakeCtl) wakeCtl.acquire(); }
    function onBeforeUnload() { flushMine(); try { rt && rt.close(); } catch (e) {} }
    root.addEventListener('pagehide', onBeforeUnload);

    /* ------------------------------------------------------------ 시작 · 닫기 */
    var api = {
      el: el, P: P, goPage: function (n) { goPage(n, true); }, loadSheet: function (i, pg) { return loadSheet(i, pg, true); },
      close: function () {
        if (S.dead) return; S.dead = true; if (S.fs) setFs(false); closeYt(); flushMine(); P.emit('close');
        try { an.closeEditor(); } catch (e) {}
        P.tabs.forEach(function (t) { try { t.api && t.api.destroy && t.api.destroy(); } catch (e) {} });
        try { rt && rt.close(); } catch (e) {} try { an.destroy(); } catch (e) {}
        doc.removeEventListener('keydown', onKey); doc.removeEventListener('keyup', onKeyUp); root.removeEventListener('pagehide', onBeforeUnload);
        doc.removeEventListener('pointerup', holdStop); root.removeEventListener('orientationchange', onOrient); doc.removeEventListener('fullscreenchange', onFsChange); clearTimeout(S.fsT);
        if (ro) ro.disconnect(); root.removeEventListener('resize', onResize);
        /* 남아 있는 예약(타이머) · 반복 · 그림 저장소를 모두 정리 — 화면을 여닫아도 메모리가 쌓이지 않게 (내 필기 저장 재시도 S.mineT 만 남겨 둡니다) */
        [rz, orT, wz.t, S.rsT, S.navT, S.msgT, S.toolT, refetchT, scT].forEach(function (t) { if (t) clearTimeout(t); });
        holdStop(); if (pvRaf && root.cancelAnimationFrame) { try { root.cancelAnimationFrame(pvRaf); } catch (e) {} pvRaf = 0; }
        if (S.task) { try { S.task.cancel(); } catch (e) {} S.task = null; }
        pcClear(); S.pending = null;
        try { wakeCtl && wakeCtl.destroy(); } catch (e) {}
        Object.keys(S.cache).forEach(function (k) { try { S.cache[k].pdf && S.cache[k].pdf.destroy(); } catch (e) {} });
        el.remove(); doc.body.classList.remove('pv-lock'); current = null;
        try { opts.onClose && opts.onClose(); } catch (e) {}
      }
    };
    current = api;
    S.layer = ls('layer') === 'mine' ? 'mine' : 'team'; S.layerUser = !!ls('layer'); S.scope = ls('scope') === 'date' && S.room ? 'date' : 'song'; an.setLayer(S.layer); if (an.setFont) an.setFont(S.font); if (an.setFboxTag) an.setFboxTag(S.fboxTag);
    setCompact(calcCompact()); autoFit(); applyLayout(S.layout, false); renderTools(); buildTabs(); connect(); loadCfg(); requestWake();
    var g0 = typeof opts.song === 'number' ? opts.song : guessSong(sheets[S.sheetIdx].name, songs); if (g0 >= 0) setSong(g0, true);
    loadSheet(S.sheetIdx, 1, false);
    if (S.layout === 'computer' && ls('side') !== '0' && P.tabs.length) showTab(P.tabs[0].id);
    return api;
  }

  root.YNPractice = { open: open, current: function () { return current; }, close: function () { if (current) current.close(); }, isOpen: function () { return !!current; }, guessSong: guessSong, cueIdFor: cueIdFor, detectLayout: detectLayout, CUE_MAP: CUE_MAP };
}(typeof self !== 'undefined' ? self : this));
