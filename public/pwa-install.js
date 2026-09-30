/**
 * 홈 화면 설치 안내 + 알림 허용 요청 (PWA)
 *
 *  1) 안드로이드/크롬 : beforeinstallprompt 를 붙잡아 두었다가 아래쪽에 "앱 설치" 배너를 보여줍니다.
 *                       설치가 끝나면(appinstalled) 바로 알림 허용 창을 띄웁니다.
 *  2) 아이폰/아이패드 : Safari 에서 열었고 아직 홈 화면에 추가하지 않았다면
 *                       "공유 버튼 → 홈 화면에 추가" 안내 창과 공유 버튼 위치 말풍선을 보여줍니다.
 *  3) 홈 화면 앱으로 처음 열렸을 때(standalone) : 알림 허용 창을 띄웁니다.
 *                       (iOS 는 '사용자가 직접 누른 순간' 에만 허용 창을 열 수 있어서, 한 번 누르는 안내 카드를 거칩니다)
 *
 * 알림을 실제로 받도록 등록하는 일은 app.js 의 YNPush 가 그대로 합니다 (이 파일은 그 앞의 "안내 · 요청" 만 맡습니다).
 * 이 파일을 지우고 pages.js 의 <script> 한 줄만 지우면 예전 상태로 돌아갑니다.
 */
(function () {
  'use strict';
  if (window.YNPWA) return;

  /* ---------- 작은 도구 ---------- */
  var K_SNOOZE = 'ynPwaSnooze';   // 설치 안내를 닫은 시각 (7일 동안 다시 안 띄움)
  var K_ASKED = 'ynPwaAsked';     // 알림 허용 창을 이미 한 번 띄웠는지
  var K_WANT = 'ynPwaWantSub';    // 허용을 받았으니 로그인되면 이 기기를 등록해야 함
  var SNOOZE_DAYS = 7;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var UA = navigator.userAgent || '';

  function isIOS() {
    return /iPad|iPhone|iPod/.test(UA) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS 는 맥으로 보입니다
  }
  function isIPad() {
    return /iPad/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  /** 홈 화면에서 앱처럼 열렸는지 */
  function isStandalone() {
    return !!(window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  }
  /** iOS 의 진짜 Safari (크롬·엣지·파이어폭스·카카오톡 같은 앱 안 브라우저는 제외) */
  function isIOSSafari() {
    return isIOS() && /Safari\//.test(UA) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|KAKAOTALK|NAVER|Line\/|FBAN|FBAV|Instagram|DaumApps/i.test(UA);
  }
  function snoozed() {
    var t = Number(lsGet(K_SNOOZE) || 0);
    return t && Date.now() - t < SNOOZE_DAYS * 864e5;
  }
  function snooze() { lsSet(K_SNOOZE, String(Date.now())); }
  function notifySupported() { return 'Notification' in window; }

  /** 화면에 로그인된 토큰 (Portal.html 의 keptToken 과 같은 자리를 읽습니다) */
  function token() {
    try { var s = sessionStorage.getItem('ynPortalToken'); if (s) return s; } catch (e) {}
    try {
      var k = JSON.parse(lsGet('ynPortalKeep') || 'null');
      if (k && k.t && k.until > Date.now()) return k.t;
    } catch (e) {}
    return '';
  }

  /* ---------- 모양 (다크 글래스 + 오렌지) ---------- */
  var CSS =
    '.ynpwa-bar,.ynpwa-modal,.ynpwa-tip,.ynpwa-ask{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif;-webkit-font-smoothing:antialiased;box-sizing:border-box;}' +
    '.ynpwa-bar *,.ynpwa-modal *,.ynpwa-tip *,.ynpwa-ask *{box-sizing:border-box;}' +
    '.ynpwa-bar,.ynpwa-modal,.ynpwa-ask{word-break:keep-all;overflow-wrap:break-word;}' +
    '.ynpwa-glass{background:linear-gradient(160deg,rgba(48,40,34,.93) 0%,rgba(24,21,19,.95) 100%);' +
      '-webkit-backdrop-filter:blur(26px) saturate(170%);backdrop-filter:blur(26px) saturate(170%);' +
      'border:1px solid rgba(242,107,33,.42);color:#fff;' +
      'box-shadow:0 0 0 1px rgba(255,255,255,.05) inset,0 0 22px rgba(242,107,33,.22),0 12px 28px rgba(0,0,0,.45),0 28px 60px rgba(0,0,0,.35);}' +
    '.ynpwa-btn{appearance:none;-webkit-appearance:none;border:0;cursor:pointer;font:inherit;font-weight:700;font-size:15px;line-height:1;' +
      'padding:12px 18px;border-radius:12px;color:#fff;background:linear-gradient(180deg,#F58A4B 0%,#F26B21 100%);' +
      'box-shadow:0 6px 16px rgba(242,107,33,.38);min-height:44px;}' +
    '.ynpwa-btn:active{transform:translateY(1px);}' +
    '.ynpwa-btn.ghost{background:rgba(255,255,255,.08);box-shadow:none;color:#D2CCC4;border:1px solid rgba(255,255,255,.16);font-weight:600;}' +
    '.ynpwa-btn:focus-visible,.ynpwa-x:focus-visible{outline:2px solid #fff;outline-offset:2px;}' +

    /* 안드로이드 설치 배너 */
    '.ynpwa-bar{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2200;' +
      'max-width:520px;margin:0 auto;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:18px;' +
      'animation:ynpwaUp .28s ease-out both;}' +
    '.ynpwa-bar img{width:44px;height:44px;border-radius:11px;flex:none;background:#1C1C1C;}' +
    '.ynpwa-bar .t{flex:1;min-width:0;}' +
    '.ynpwa-bar .t b{display:block;font-size:15px;line-height:1.25;}' +
    '.ynpwa-bar .t small{display:block;font-size:12.5px;line-height:1.35;color:#D2CCC4;margin-top:2px;}' +
    '.ynpwa-x{appearance:none;-webkit-appearance:none;border:0;background:transparent;color:#BDB8B1;font-size:24px;line-height:1;' +
      'width:36px;height:44px;cursor:pointer;flex:none;border-radius:10px;}' +

    /* iOS 안내 창 */
    '.ynpwa-modal{position:fixed;inset:0;z-index:2300;display:flex;align-items:center;justify-content:center;padding:20px 20px 96px;' +
      'background:rgba(8,8,8,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:ynpwaFade .2s ease-out both;}' +
    '.ynpwa-card{width:100%;max-width:380px;border-radius:22px;padding:22px 20px 18px;max-height:100%;overflow-y:auto;}' +
    '.ynpwa-card h2{margin:0 0 6px;font-size:19px;line-height:1.3;}' +
    '.ynpwa-card p.sub{margin:0 0 16px;font-size:13.5px;line-height:1.5;color:#D2CCC4;}' +
    '.ynpwa-steps{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:10px;}' +
    '.ynpwa-steps li{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);font-size:14.5px;line-height:1.4;}' +
    '.ynpwa-steps .n{flex:none;width:26px;height:26px;border-radius:50%;background:#F26B21;color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;}' +
    '.ynpwa-steps .ic{flex:none;width:34px;height:34px;border-radius:10px;background:rgba(242,107,33,.16);color:#FFB27F;display:flex;align-items:center;justify-content:center;}' +
    '.ynpwa-steps b{color:#FFB27F;}' +
    '.ynpwa-note{margin:-6px 0 16px;font-size:12.5px;line-height:1.5;color:#BDB8B1;}' +
    '.ynpwa-row{display:flex;gap:10px;}' +
    '.ynpwa-row .ynpwa-btn{flex:1;}' +

    /* 공유 버튼을 가리키는 말풍선 */
    '.ynpwa-tip{position:fixed;z-index:2400;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:0;}' +
    '.ynpwa-tip.phone{left:50%;bottom:calc(6px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);}' +
    '.ynpwa-tip.pad{top:8px;right:14px;flex-direction:column-reverse;align-items:flex-end;}' +
    '.ynpwa-tip .bub{background:#F26B21;color:#fff;font-weight:700;font-size:13.5px;line-height:1.3;padding:9px 14px;border-radius:12px;box-shadow:0 8px 22px rgba(242,107,33,.5);white-space:nowrap;}' +
    '.ynpwa-tip .arr{width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;}' +
    '.ynpwa-tip.phone .arr{border-top:11px solid #F26B21;animation:ynpwaDown 1s ease-in-out infinite;}' +
    '.ynpwa-tip.pad .arr{border-bottom:11px solid #F26B21;margin-right:30px;animation:ynpwaUpArrow 1s ease-in-out infinite;}' +

    /* 알림 허용 안내 카드 (iOS 첫 실행) */
    '.ynpwa-ask{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2300;max-width:520px;margin:0 auto;' +
      'border-radius:20px;padding:16px;animation:ynpwaUp .28s ease-out both;}' +
    '.ynpwa-ask h3{margin:0 0 4px;font-size:16px;line-height:1.3;}' +
    '.ynpwa-ask p{margin:0 0 12px;font-size:13.5px;line-height:1.5;color:#D2CCC4;}' +
    '.ynpwa-ask .st{margin:10px 0 0;font-size:13px;color:#FFB27F;min-height:1em;}' +

    '@keyframes ynpwaUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}' +
    '@keyframes ynpwaFade{from{opacity:0;}to{opacity:1;}}' +
    '@keyframes ynpwaDown{0%,100%{transform:translateY(0);}50%{transform:translateY(6px);}}' +
    '@keyframes ynpwaUpArrow{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}' +
    '@media (prefers-reduced-motion:reduce){.ynpwa-bar,.ynpwa-modal,.ynpwa-ask,.ynpwa-tip .arr{animation:none!important;}}';

  var SVG_OPEN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICON_SHARE = SVG_OPEN + '<path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  var ICON_ADD = SVG_OPEN + '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
  var ICON_BELL = SVG_OPEN + '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

  var cssDone = false;
  function ensureCss() {
    if (cssDone) return;
    cssDone = true;
    var s = document.createElement('style');
    s.setAttribute('data-ynpwa', '1');
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }
  function whenBody(fn) {
    if (document.body) return fn();
    document.addEventListener('DOMContentLoaded', function () { fn(); }, { once: true });
  }
  function make(cls, html) {
    var d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    return d;
  }
  function remove(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }

  /* =========================================================
     알림 — 허용 요청 · (로그인되어 있으면) 이 기기 등록
     ========================================================= */
  var syncing = false;

  /** 허용을 받아 둔 기기를 서버에 등록합니다 — 사용자가 벨에서 직접 끈 기기는 건드리지 않습니다 (K_WANT 가 있을 때만) */
  function syncPush() {
    var P = window.YNPush, t = token();
    if (lsGet(K_WANT) !== '1' || syncing || !P || !t) return;
    if (!notifySupported() || Notification.permission !== 'granted') return;
    if (!P.can() || P.needsHome()) return;
    syncing = true;
    P.subscribed(function (on) {
      if (on) { syncing = false; lsDel(K_WANT); return; }
      P.enable(t, function () { syncing = false; lsDel(K_WANT); }, function () { syncing = false; });
    });
  }

  function onPermission(p) {
    if (p === 'granted') { lsSet(K_WANT, '1'); syncPush(); }
    return p;
  }

  /** 허용 창을 바로 띄웁니다 (안드로이드 설치 직후 · 크롬 계열) */
  function requestNow() {
    if (!notifySupported() || Notification.permission !== 'default') return;
    lsSet(K_ASKED, '1');
    try {
      var r = Notification.requestPermission();
      if (r && typeof r.then === 'function') r.then(onPermission, function () {});
    } catch (e) {}
  }

  var askEl = null;
  function closeAsk() { remove(askEl); askEl = null; }

  /** iOS: 사용자가 누른 순간에만 허용 창을 열 수 있으므로, 한 번 누르는 안내 카드를 보여줍니다 */
  function showAskCard() {
    if (askEl) return;
    ensureCss();
    whenBody(function () {
      askEl = make('ynpwa-ask ynpwa-glass',
        '<h3>알림을 켜시겠어요?</h3>' +
        '<p>셀보고 독려, 새 주보, 공지를 휴대폰 알림으로 받아보실 수 있어요.</p>' +
        '<div class="ynpwa-row"><button type="button" class="ynpwa-btn ghost" data-a="later">나중에</button>' +
        '<button type="button" class="ynpwa-btn" data-a="go">알림 켜기</button></div>' +
        '<p class="st" role="status"></p>');
      askEl.setAttribute('role', 'dialog');
      askEl.setAttribute('aria-label', '알림 허용');
      var st = askEl.querySelector('.st');
      askEl.querySelector('[data-a="later"]').addEventListener('click', closeAsk);
      askEl.querySelector('[data-a="go"]').addEventListener('click', function () {
        // 반드시 '누른 바로 그 순간' 에 요청해야 iOS 가 허용 창을 엽니다
        var r;
        try { r = Notification.requestPermission(); } catch (e) { r = null; }
        if (!r || typeof r.then !== 'function') { closeAsk(); return; }
        r.then(function (p) {
          onPermission(p);
          if (!askEl) return;
          st.textContent = p === 'granted'
            ? (token() ? '알림을 켰습니다.' : '허용되었습니다. 로그인하시면 이 기기로 알림이 옵니다.')
            : '알림이 허용되지 않았습니다. 나중에 화면 위쪽 벨 아이콘에서 켤 수 있어요.';
          setTimeout(closeAsk, 2200);
        }, closeAsk);
      });
      document.body.appendChild(askEl);
    });
  }

  /** 홈 화면 앱으로 처음 열렸을 때 (그리고 아직 물어본 적이 없을 때) */
  function askOnFirstLaunch() {
    if (!notifySupported() || Notification.permission !== 'default' || lsGet(K_ASKED)) return;
    lsSet(K_ASKED, '1');
    var gesture = !!(navigator.userActivation && navigator.userActivation.isActive);
    if (isIOS() && !gesture) { showAskCard(); return; }
    // 안드로이드 · 데스크톱은 바로, iOS 도 방금 화면을 누른 상태라면 바로
    lsDel(K_ASKED);
    requestNow();
  }

  /* =========================================================
     1) 안드로이드 / 크롬 — 설치 배너
     ========================================================= */
  var deferred = null;
  var barEl = null;

  function hideBar() { remove(barEl); barEl = null; }

  function showBar() {
    if (barEl || !deferred || isStandalone() || snoozed()) return;
    ensureCss();
    whenBody(function () {
      if (barEl || !deferred) return;
      barEl = make('ynpwa-bar ynpwa-glass',
        '<img src="/icon-192.png" alt="" width="44" height="44">' +
        '<div class="t"><b>청년1부 앱 설치</b><small>홈 화면에 추가하고 알림도 받아보세요</small></div>' +
        '<button type="button" class="ynpwa-btn" data-a="install">설치</button>' +
        '<button type="button" class="ynpwa-x" data-a="close" aria-label="닫기">&times;</button>');
      barEl.setAttribute('role', 'region');
      barEl.setAttribute('aria-label', '앱 설치');
      barEl.querySelector('[data-a="install"]').addEventListener('click', promptInstall);
      barEl.querySelector('[data-a="close"]').addEventListener('click', function () { snooze(); hideBar(); });
      document.body.appendChild(barEl);
    });
  }

  function promptInstall() {
    var d = deferred;
    if (!d) return;
    deferred = null;          // 한 번만 쓸 수 있는 이벤트입니다
    hideBar();
    try {
      d.prompt();
      if (d.userChoice && d.userChoice.then) {
        d.userChoice.then(function (c) { if (c && c.outcome === 'dismissed') snooze(); }, function () {});
      }
    } catch (e) {}
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();       // 브라우저 기본 안내 대신 우리 배너를 씁니다
    deferred = e;
    showBar();
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    hideBar();
    lsDel(K_SNOOZE);
    requestNow();             // 설치가 끝나면 바로 알림 허용 창
  });

  /* =========================================================
     2) 아이폰 / 아이패드 — 홈 화면에 추가 안내
     ========================================================= */
  var modalEl = null, tipEl = null, lastFocus = null;

  function closeIOSGuide(remember) {
    if (remember) snooze();
    remove(modalEl); remove(tipEl);
    modalEl = tipEl = null;
    document.removeEventListener('keydown', onKey, true);
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {}
  }
  function onKey(e) { if (e.key === 'Escape') closeIOSGuide(true); }

  function showIOSGuide() {
    if (modalEl || isStandalone()) return;
    ensureCss();
    whenBody(function () {
      if (modalEl) return;
      var safari = isIOSSafari();
      var pad = isIPad();
      var html;
      if (safari) {
        html =
          '<h2>홈 화면에 추가하고 앱처럼 쓰세요</h2>' +
          '<p class="sub">알림을 받으려면 먼저 홈 화면에 추가해야 해요.</p>' +
          '<ol class="ynpwa-steps">' +
            '<li><span class="n">1</span><span class="ic">' + ICON_SHARE + '</span><span>' + (pad ? '화면 <b>위쪽</b>' : '화면 <b>아래쪽</b>') + '의 <b>공유 버튼</b>을 누르세요</span></li>' +
            '<li><span class="n">2</span><span class="ic">' + ICON_ADD + '</span><span>메뉴를 올려서 <b>“홈 화면에 추가”</b>를 선택하세요</span></li>' +
            '<li><span class="n">3</span><span class="ic">' + ICON_BELL + '</span><span>홈 화면의 <b>청년1부</b> 아이콘으로 열면 알림을 켤 수 있어요</span></li>' +
          '</ol>' +
          '<p class="ynpwa-note">공유 버튼이 보이지 않으면 주소창 옆이나 <b>⋯</b> 메뉴 안에서 찾아보세요.</p>' +
          '<button type="button" class="ynpwa-btn" style="width:100%" data-a="ok">확인했어요</button>';
      } else {
        html =
          '<h2>Safari에서 열어주세요</h2>' +
          '<p class="sub">지금 보고 계신 브라우저(카카오톡 · 앱 안 브라우저 등)에서는 홈 화면에 추가할 수 없어요.</p>' +
          '<ol class="ynpwa-steps">' +
            '<li><span class="n">1</span><span>오른쪽 아래(또는 <b>⋯</b>) 메뉴에서 <b>“Safari로 열기”</b>를 선택하세요</span></li>' +
            '<li><span class="n">2</span><span>Safari에서 <b>공유 버튼 ➔ “홈 화면에 추가”</b></span></li>' +
          '</ol>' +
          '<div class="ynpwa-row"><button type="button" class="ynpwa-btn ghost" data-a="copy">주소 복사</button>' +
          '<button type="button" class="ynpwa-btn" data-a="ok">확인했어요</button></div>' +
          '<p class="ynpwa-note" role="status" data-s="1" style="margin:10px 0 0"></p>';
      }

      lastFocus = document.activeElement;
      modalEl = make('ynpwa-modal', '<div class="ynpwa-card ynpwa-glass" role="dialog" aria-modal="true" aria-label="홈 화면에 추가 안내">' + html + '</div>');
      modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeIOSGuide(true); });
      var ok = modalEl.querySelector('[data-a="ok"]');
      ok.addEventListener('click', function () { closeIOSGuide(true); });
      var copy = modalEl.querySelector('[data-a="copy"]');
      if (copy) copy.addEventListener('click', function () {
        var s = modalEl && modalEl.querySelector('[data-s]');
        var done = function (m) { if (s) s.textContent = m; };
        try {
          navigator.clipboard.writeText(location.href).then(function () { done('주소를 복사했어요. Safari 주소창에 붙여넣어 주세요.'); },
            function () { done('복사하지 못했어요. 주소창의 주소를 길게 눌러 복사해주세요.'); });
        } catch (e) { done('복사하지 못했어요. 주소창의 주소를 길게 눌러 복사해주세요.'); }
      });
      document.body.appendChild(modalEl);
      document.addEventListener('keydown', onKey, true);

      if (safari) {   // 공유 버튼 쪽을 가리키는 말풍선 (Safari 도구 막대는 화면 밖이라 가장자리에 붙입니다)
        tipEl = make('ynpwa-tip ' + (pad ? 'pad' : 'phone'),
          '<div class="bub">' + (pad ? '여기 공유 버튼 ↑' : '여기 공유 버튼 ↓') + '</div><div class="arr"></div>');
        tipEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(tipEl);
      }
      try { ok.focus(); } catch (e) {}
    });
  }

  /* =========================================================
     시작 — 환경에 따라 알맞은 안내만 띄웁니다
     ========================================================= */
  function start() {
    if (isStandalone()) {
      // 3) 홈 화면 앱으로 열림 — 첫 실행이면 알림 허용, 이미 허용받은 기기는 등록만 마무리
      setTimeout(askOnFirstLaunch, 1200);
      setTimeout(syncPush, 2500);
      return;
    }
    // 2) iOS Safari(또는 홈 화면 추가가 불가능한 iOS 브라우저) — 설치 안내
    if (isIOS() && window.navigator.standalone === false && !snoozed()) {
      setTimeout(showIOSGuide, 1500);
    }
    // (안드로이드 배너는 beforeinstallprompt 가 오면 위에서 알아서 뜹니다)
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden) syncPush(); });

  window.YNPWA = {
    isIOS: isIOS,
    isStandalone: isStandalone,
    /** 설치 가능한 상태인지 (안드로이드/크롬) */
    installable: function () { return !!deferred; },
    /** 설치 창 열기 — 예: 메뉴의 "앱 설치" 단추에서 */
    promptInstall: promptInstall,
    /** iOS 홈 화면 추가 안내를 다시 보여주기 — 예: 벨 팝오버의 안내 링크에서 */
    showIOSGuide: function () { lsDel(K_SNOOZE); showIOSGuide(); },
    /** 로그인되었을 때 Portal.html 이 알려줍니다 — 허용은 받아 두었지만 아직 등록 못 한 기기를 마무리 */
    onLogin: function () { setTimeout(syncPush, 300); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
