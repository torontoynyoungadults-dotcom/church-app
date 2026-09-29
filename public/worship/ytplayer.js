/**
 * 유튜브 참고 영상 — 공식 YouTube IFrame Player API
 * ------------------------------------------------------------
 *  · 재생 속도 0.5 / 0.75 / 1 / 1.25 배, A-B 구간 반복 (어려운 부분만 반복해서 듣기)
 *  · API 스크립트(https://www.youtube.com/iframe_api)를 처음 열 때 한 번만 불러옵니다.
 *    불러오지 못하는 환경(오프라인 · 차단)에서는 속도/반복 없이 일반 임베드로 대신 재생하고 그 사실을 알려 줍니다.
 *  · 순수 함수(fmtTime · loopStep · normLoop · RATES)는 Node 시험에서도 씁니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YNYt = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RATES = [0.5, 0.75, 1, 1.25];
  var MIN_LOOP = 0.5;                       // A-B 구간은 최소 0.5초
  var API_URL = 'https://www.youtube.com/iframe_api';

  function fmtTime(sec) {
    sec = Math.max(0, +sec || 0); var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  /** A-B 구간 확인 — 바르면 {a,b} (b 는 없을 수 있음), 안 되면 null. b 가 a 보다 MIN_LOOP 이상 커야 함 */
  function normLoop(a, b) {
    if (a == null || !isFinite(a) || a < 0) return null;
    if (b == null) return { a: a, b: null };
    if (!isFinite(b) || b - a < MIN_LOOP) return null;
    return { a: a, b: b };
  }
  /** 지금 재생 위치가 B 에 닿았으면 되돌아갈 위치(A), 아니면 null. 영상이 A 보다 앞이면(사용자가 직접 앞으로 감음) 건드리지 않음 */
  function loopStep(t, a, b, lead) {
    if (a == null || b == null || t == null) return null;
    lead = lead == null ? 0.12 : lead;
    if (t >= b - lead && t < b + 3) return a;                         // B 를 방금 지남 → A 로
    return null;
  }

  var apiP = null;
  /** API 를 불러와 YT 객체를 돌려줍니다 (이미 있으면 바로). 실패하면 거절 */
  function loadApi(timeoutMs) {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (apiP) return apiP;
    apiP = new Promise(function (res, rej) {
      var done = false, prev = window.onYouTubeIframeAPIReady;
      var t = setTimeout(function () { if (!done) { done = true; apiP = null; rej(new Error('timeout')); } }, timeoutMs || 9000);
      window.onYouTubeIframeAPIReady = function () { try { if (typeof prev === 'function') prev(); } catch (e) {} if (!done) { done = true; clearTimeout(t); res(window.YT); } };
      var s = document.createElement('script'); s.src = API_URL; s.async = true;
      s.onerror = function () { if (!done) { done = true; clearTimeout(t); apiP = null; rej(new Error('load')); } };
      document.head.appendChild(s);
    });
    return apiP;
  }

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /**
   * open(host, { id, title, onClose, ytApi? })  → { destroy, setRate, markA, markB, clearLoop, state }
   * host 안에 플레이어 + 컨트롤을 그립니다.
   */
  function open(host, opt) {
    opt = opt || {};
    var id = opt.id, st = { rate: 1, a: null, b: null, player: null, ready: false, dead: false, timer: null, rates: RATES.slice(), fallback: false };
    host.innerHTML = '';
    var stage = el('div', 'yt-stage'), holder = el('div', 'yt-holder'); stage.appendChild(holder);
    var ctl = el('div', 'yt-ctl');
    ctl.innerHTML =
      '<div class="yt-row yt-rates" role="group" aria-label="재생 속도"><span class="yt-lb">속도</span>' + RATES.map(function (r) { return '<button type="button" class="yt-b" data-rate="' + r + '" aria-pressed="' + (r === 1) + '">' + r + 'x</button>'; }).join('') + '</div>' +
      '<div class="yt-row yt-ab" role="group" aria-label="구간 반복"><span class="yt-lb">구간 반복</span>' +
        '<button type="button" class="yt-b" data-a="a">A 지정</button><button type="button" class="yt-b" data-a="b">B 지정</button><button type="button" class="yt-b ghost" data-a="clear">해제</button>' +
        '<span class="yt-abinfo" aria-live="polite">A–B 를 정하면 그 구간만 계속 반복합니다</span></div>' +
      '<div class="yt-msg" role="status"></div>';
    host.appendChild(stage); host.appendChild(ctl);
    var msg = ctl.querySelector('.yt-msg'), abinfo = ctl.querySelector('.yt-abinfo');
    function say(t, bad) { msg.textContent = t || ''; msg.className = 'yt-msg' + (bad ? ' bad' : ''); }
    function paintRates() {
      [].forEach.call(ctl.querySelectorAll('[data-rate]'), function (b) {
        var r = +b.getAttribute('data-rate'), on = Math.abs(r - st.rate) < 1e-6;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.disabled = st.fallback || !st.ready || st.rates.indexOf(r) < 0;
      });
      [].forEach.call(ctl.querySelectorAll('[data-a]'), function (b) { b.disabled = st.fallback || !st.ready; });
    }
    function paintAB() {
      var t = st.a == null ? 'A–B 를 정하면 그 구간만 계속 반복합니다' : st.b == null ? 'A ' + fmtTime(st.a) + ' — 이제 B 를 지정하세요' : '🔁 ' + fmtTime(st.a) + ' → ' + fmtTime(st.b) + ' 반복 중';
      abinfo.textContent = t; ctl.classList.toggle('looping', st.a != null && st.b != null);
      ctl.querySelector('[data-a="a"]').classList.toggle('on', st.a != null); ctl.querySelector('[data-a="b"]').classList.toggle('on', st.b != null);
    }
    function now() { try { return +st.player.getCurrentTime(); } catch (e) { return null; } }
    function tick() {
      if (st.dead || !st.player || st.a == null || st.b == null) return;
      var back = loopStep(now(), st.a, st.b);
      if (back != null) { try { st.player.seekTo(back, true); } catch (e) {} }
    }
    function startTimer() { if (!st.timer) st.timer = setInterval(tick, 100); }
    function stopTimer() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }

    function setRate(r) {
      r = +r; if (!st.player || !st.ready || st.rates.indexOf(r) < 0) return false;
      try { st.player.setPlaybackRate(r); st.rate = r; paintRates(); say(r === 1 ? '' : '재생 속도 ' + r + '배'); return true; } catch (e) { say('속도를 바꾸지 못했습니다', true); return false; }
    }
    function markA() { var t = now(); if (t == null) return; st.a = t; if (st.b != null && !normLoop(st.a, st.b)) st.b = null; paintAB(); if (st.b == null) say('A 지점 ' + fmtTime(t) + ' — 반복이 끝날 곳에서 B 를 누르세요'); }
    function markB() {
      var t = now(); if (t == null) return;
      if (st.a == null) { say('먼저 A(반복 시작 위치)를 지정하세요', true); return; }
      var n = normLoop(st.a, t); if (!n) { say('B 는 A 보다 ' + MIN_LOOP + '초 이상 뒤여야 합니다', true); return; }
      st.b = n.b; paintAB(); startTimer(); say(''); try { st.player.seekTo(st.a, true); st.player.playVideo(); } catch (e) {}
    }
    function clearLoop() { st.a = st.b = null; paintAB(); say(''); }
    ctl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b || b.disabled) return;
      if (b.hasAttribute('data-rate')) setRate(b.getAttribute('data-rate'));
      else { var a = b.getAttribute('data-a'); if (a === 'a') markA(); else if (a === 'b') markB(); else if (a === 'clear') clearLoop(); }
    });

    function fallbackFrame(why) {
      st.fallback = true; holder.innerHTML = '';
      var f = document.createElement('iframe'); f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?rel=0&playsinline=1&autoplay=1'; f.title = '유튜브 참고 영상';
      f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture'); f.setAttribute('allowfullscreen', ''); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); holder.appendChild(f);
      paintRates(); say(why || '속도 · 구간 반복 기능을 불러오지 못해 기본 플레이어로 재생합니다 (인터넷 연결을 확인하세요).', true);
    }

    paintRates(); paintAB(); say('플레이어를 불러오는 중…');
    var api = opt.ytApi ? Promise.resolve(opt.ytApi) : loadApi();
    api.then(function (YT) {
      if (st.dead) return;
      var box = document.createElement('div'); holder.appendChild(box);
      st.player = new YT.Player(box, {
        videoId: id, host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
        playerVars: { rel: 0, playsinline: 1, autoplay: 1, modestbranding: 1, origin: typeof location !== 'undefined' ? location.origin : undefined },
        events: {
          onReady: function () {
            if (st.dead) return; st.ready = true;
            try { var av = st.player.getAvailablePlaybackRates && st.player.getAvailablePlaybackRates(); if (av && av.length) st.rates = RATES.filter(function (r) { return av.indexOf(r) >= 0; }); } catch (e) {}
            paintRates(); say('');
          },
          onStateChange: function (ev) {
            var S = ev && ev.data;
            if (S === 1) { if (st.a != null && st.b != null) startTimer(); }              // 재생 시작 → 반복 감시
            else if (S === 0 && st.a != null && st.b != null) { try { st.player.seekTo(st.a, true); st.player.playVideo(); } catch (e) {} }   // 영상 끝에 닿아도 A 로
          },
          onError: function (ev) { var c = ev && ev.data; say(c === 101 || c === 150 ? '이 영상은 앱 안에서 재생할 수 없게 설정되어 있습니다. ↗ 를 눌러 유튜브에서 여세요.' : c === 100 ? '영상을 찾을 수 없습니다 (삭제되었거나 비공개).' : '영상을 재생하지 못했습니다.', true); },
          onPlaybackRateChange: function (ev) { if (ev && ev.data) { st.rate = +ev.data; paintRates(); } }
        }
      });
    }, function () { if (!st.dead) fallbackFrame(); });

    return {
      setRate: setRate, markA: markA, markB: markB, clearLoop: clearLoop,
      state: function () { return { rate: st.rate, a: st.a, b: st.b, ready: st.ready, fallback: st.fallback }; },
      destroy: function () { st.dead = true; stopTimer(); try { st.player && st.player.destroy && st.player.destroy(); } catch (e) {} host.innerHTML = ''; }
    };
  }

  return { RATES: RATES, MIN_LOOP: MIN_LOOP, fmtTime: fmtTime, normLoop: normLoop, loopStep: loopStep, loadApi: loadApi, open: open };
}));
