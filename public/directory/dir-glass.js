/* =========================================================
   교적 관리 — 검색 결과 카드 (Dark Glassmorphism) + 빠른 그리기 · Step 5
   ---------------------------------------------------------
   Admin.html 의 renderDirectory 를 대신합니다. 예전 함수는 ORIG 로 보관하고,
   여기서 오류가 나면 그 즉시 예전 함수로 돌아갑니다 (화면이 비지 않도록).

   빠르게 하는 방법
   1) 검색 색인   — 사람마다 '검색용 글자'를 한 번만 만들어 두고(WeakMap) 키를 칠 때는 indexOf 만 함
   2) 조각 그리기 — 처음 24명만 DocumentFragment 로 만들어 replaceChildren 한 번으로 교체,
                    나머지는 스크롤이 가까워지면(IntersectionObserver) 40명씩 이어 붙임
   3) 복제 그리기 — <template> 한 장을 cloneNode 로 복제하고 textContent 로 채움 (HTML 파싱 없음)
   4) 화면 밖은 건너뜀 — CSS content-visibility:auto (화면 밖 카드는 배치 · 그리기 생략)
   5) 한 번에 한 번 — 키 입력은 requestAnimationFrame 으로 묶어 프레임당 최대 1번 그림
   6) 이벤트 위임 — 카드마다 onclick 을 달지 않고 목록에 하나만 달음
   ========================================================= */
(function () {
  'use strict';
  var G = window;
  if (typeof G.renderDirectory !== 'function' || !document.getElementById('dirList')) return;   // 예전 화면이 아니면 손대지 않음

  var ORIG = G.renderDirectory;
  var FIRST = 24, MORE = 40;
  var st = { sig: null, shown: FIRST, rendered: 0, list: [], q: '', io: null, raf: 0 };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 1) 검색 색인 ---------- */
  var IDX = new WeakMap();
  function entry(p) {
    var e = IDX.get(p);
    if (e) return e;
    e = {
      hay: [p.name, p.engName, p.email, p.kakao, p.address].map(function (s) { return String(s == null ? '' : s); }).join('\u0001').toLowerCase(),
      phone: String(p.phone || '').replace(/[^0-9]/g, ''),
      env: String(p.envelopeNo || '').replace(/[^0-9]/g, '')
    };
    IDX.set(p, e);
    return e;
  }
  /** 예전 matchPerson 과 같은 규칙 (이름 · 영문 · 이메일 · 카톡 · 주소 부분 일치 / 헌금번호 일치 / 전화 3자리 이상) — 색인만 사용 */
  G.matchPerson = function (p, q) {
    q = q.toLowerCase();
    var qd = q.replace(/[^0-9]/g, ''), e = entry(p);
    if (e.hay.indexOf(q) !== -1) return true;
    if (qd && e.env === qd) return true;
    if (qd.length >= 3 && e.phone.indexOf(qd) !== -1) return true;
    return false;
  };

  /* ---------- 3) 카드 뼈대 (한 번만 파싱) ---------- */
  var SKEL = null;
  function skeleton() {
    if (SKEL) return SKEL;
    var t = document.createElement('template');
    t.innerHTML =
      '<article class="dg-card"><div class="dg-head" role="button" tabindex="0" aria-expanded="false">' +
        '<span class="dg-av"></span>' +
        '<div class="dg-main"><div class="dg-name"><span class="dg-n"></span><span class="dg-en"></span></div><div class="dg-meta"></div></div>' +
        '<div class="dg-side"></div><span class="dg-caret" aria-hidden="true"></span>' +
      '</div><div class="detail"></div></article>';
    SKEL = t.content.firstElementChild;
    return SKEL;
  }

  function span(cls, text) {
    var s = document.createElement('span');
    s.className = cls; s.textContent = text;
    return s;
  }

  function highlight(node, text, q) {
    var i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) { node.textContent = text; return; }
    node.appendChild(document.createTextNode(text.slice(0, i)));
    var m = document.createElement('mark');
    m.textContent = text.slice(i, i + q.length);
    node.appendChild(m);
    node.appendChild(document.createTextNode(text.slice(i + q.length)));
  }

  function avatar(box, p) {
    var ph = (G.PHOTOFB && !p.photo && G.PHOTOFB[p.name]) || null;      // 교적에 사진이 없을 때 제자훈련 등에서 받은 사진
    var url = p.photo || (ph && ph.photo) || '';
    var big = p.photoLarge || (ph && ph.photoLarge) || url;
    if (url) {
      var img = document.createElement('img');
      img.className = 'dg-img'; img.alt = '';
      img.loading = 'lazy'; img.decoding = 'async';
      img.src = url; img.setAttribute('data-big', big);
      box.appendChild(img);
    } else {
      box.appendChild(span('dg-ph', (p.name || '?').charAt(0)));
    }
  }

  function card(p, q) {
    var art = skeleton().cloneNode(true);
    var head = art.firstChild, detail = art.lastChild;
    var main = head.children[1], nameRow = main.firstChild, meta = main.lastChild, side = head.children[2];
    art.setAttribute('data-name', p.name);

    avatar(head.firstChild, p);
    highlight(nameRow.firstChild, p.name || '', q);
    if (p.engName) highlight(nameRow.lastChild, p.engName, q);

    if (p.notFound) meta.appendChild(span('dg-tag miss', '교적 미등록'));
    var cells = p.cells || [], teams = p.teams || [], mis = p.missions || [];
    if (cells.length) {
      meta.appendChild(span('dg-chip cell', cells.join(', ')));
    } else {
      meta.appendChild(span('dg-chip none', '소속 셀 없음'));
      var s = p.cellStatus || '';
      meta.appendChild(span('dg-chip ' + (s === '셀 배정 대기' ? 'wait' : 'none'), s || '미분류'));
    }
    for (var i = 0; i < teams.length; i++) meta.appendChild(span('dg-chip team', teams[i].team));
    for (var j = 0; j < mis.length; j++) meta.appendChild(span('dg-chip mis', mis[j].team));

    if (p.rate !== null && p.rate !== undefined) {
      var lv = p.rate >= 80 ? 'hi' : p.rate >= 60 ? 'mid' : 'low';
      side.appendChild(span('dg-rate ' + lv, p.rate + '% · ' + p.present + '/' + p.totalMeetings));
    }

    if (G.OPEN && G.OPEN.dir === '|' + p.name) {                     // 저장 뒤 다시 그릴 때 펼침 유지
      head.classList.add('open');
      head.setAttribute('aria-expanded', 'true');
      detail.innerHTML = G.personDetail(p, G.slotFor('dir', p.name));
    }
    return art;
  }

  /* ---------- 펼치기 / 접기 (이벤트 위임) ---------- */
  function toggle(art) {
    var box = $('dirList'), head = art.firstChild, detail = art.lastChild, name = art.getAttribute('data-name');
    var opening = !head.classList.contains('open');
    var prev = box.querySelector('.dg-head.open');
    if (prev && prev !== head) {                                     // 한 번에 한 명만 펼침 (예전과 같음)
      prev.classList.remove('open'); prev.setAttribute('aria-expanded', 'false');
      prev.nextElementSibling.textContent = '';
    }
    if (!opening) {
      head.classList.remove('open'); head.setAttribute('aria-expanded', 'false');
      detail.textContent = ''; G.OPEN.dir = '';
      return;
    }
    head.classList.add('open'); head.setAttribute('aria-expanded', 'true');
    G.OPEN.dir = '|' + name;
    detail.innerHTML = G.personDetail(G.personOf(name), G.slotFor('dir', name));
    var r = art.getBoundingClientRect();                             // 위로 잘리면 살짝 내려서 보여줌
    if (r.top < 8) art.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function bindList(box) {
    box.addEventListener('click', function (e) {
      var img = e.target.closest && e.target.closest('.dg-img');
      if (img) { e.stopPropagation(); if (G.openPhoto) G.openPhoto(img.getAttribute('data-big')); return; }
      var head = e.target.closest && e.target.closest('.dg-head');
      if (head) toggle(head.parentNode);
    });
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var head = e.target.classList && e.target.classList.contains('dg-head') ? e.target : null;
      if (!head) return;
      e.preventDefault(); toggle(head.parentNode);
    });
  }

  /* ---------- 2) 이어 붙이기 ---------- */
  function moreBox(box) {
    var more = box.querySelector('.dg-more');
    if (!more) {
      more = document.createElement('div'); more.className = 'dg-more';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn'; b.addEventListener('click', loadMore);
      more.appendChild(b); box.appendChild(more);
    }
    more.firstChild.textContent = '더 보기 (' + (st.list.length - st.rendered) + '명 남음)';
    return more;
  }

  function loadMore() {
    var box = $('dirList'), more = box.querySelector('.dg-more');
    if (!more || st.rendered >= st.list.length) return;
    var end = Math.min(st.list.length, st.rendered + MORE), frag = document.createDocumentFragment();
    for (var i = st.rendered; i < end; i++) frag.appendChild(card(st.list[i], st.q));
    box.insertBefore(frag, more);
    st.rendered = st.shown = end;
    if (end >= st.list.length) {
      if (st.io) { st.io.disconnect(); st.io = null; }
      more.remove();
    } else {
      moreBox(box);
      if (st.io) { st.io.unobserve(more); st.io.observe(more); }      // 아직 보이면 다시 알림 받음
    }
  }

  function watchMore(box) {
    if (st.io) { st.io.disconnect(); st.io = null; }
    if (st.rendered >= st.list.length) return;
    var more = moreBox(box);
    if ('IntersectionObserver' in G) {
      st.io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) loadMore(); }, { rootMargin: '700px 0px' });
      st.io.observe(more);
    }
  }

  /* ---------- 그리기 ---------- */
  function draw() {
    if (!G.DIR) return;
    var box = $('dirList'), qEl = $('dirQuery');
    var q = qEl.value.trim();
    var list = G.dirFiltered();                                      // 필터 규칙은 예전 그대로 (셀 소속 · 사역팀 · 분류 · 소속별)

    $('dirCount').textContent = (q || G.dirFilter !== 'all' || $('dirGroup').value)
      ? list.length + '명 찾음 · 전체 ' + G.DIR.total + '명'
      : '전체 ' + G.DIR.total + '명 · 가나다순';

    if (st.io) { st.io.disconnect(); st.io = null; }
    if (!list.length) {
      st.list = []; st.rendered = 0;
      var p = document.createElement('p');
      p.className = 'empty dg-empty';
      p.appendChild(document.createTextNode('해당하는 분이 없습니다.'));
      if (q) {
        p.appendChild(document.createElement('br'));
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn mini orange'; b.style.marginTop = '10px';
        b.textContent = q + ' 님을 교적에 추가';
        b.addEventListener('click', function () { G.openDirForm(q); });
        p.appendChild(b);
      }
      box.replaceChildren(p);
      return;
    }

    if (q && list.length === 1) G.OPEN.dir = '|' + list[0].name;     // 한 명이면 바로 펼침 (예전과 같음)

    var sig = [q, G.dirFilter, G.ncFilter || '', $('dirGroup').value].join('\u0001');
    var want = sig === st.sig ? Math.max(st.shown, FIRST) : FIRST;   // 조건이 그대로면(저장 뒤 등) 보던 만큼 유지
    if (G.OPEN.dir) {                                                // 펼쳐 둔 사람이 목록 뒤쪽이어도 반드시 그림
      var on = G.OPEN.dir.slice(1);
      for (var k = want; k < list.length; k++) if (list[k].name === on) { want = k + 1; break; }
    }
    want = Math.min(want, list.length);

    var frag = document.createDocumentFragment();
    for (var i = 0; i < want; i++) frag.appendChild(card(list[i], q));
    box.replaceChildren(frag);                                       // DOM 교체는 이 한 번

    st.sig = sig; st.list = list; st.q = q; st.rendered = st.shown = want;
    watchMore(box);
  }

  function render() {
    if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
    if (G.__dirGlassOff) return ORIG();
    try { draw(); }
    catch (err) {                                                    // 안전장치 — 예전 화면으로 복귀
      G.__dirGlassOff = true;
      if (G.console) console.error('[dir-glass] 예전 목록으로 돌아갑니다:', err);
      ORIG();
    }
  }
  G.renderDirectory = render;
  G.__dirGlass = { render: render, orig: ORIG, matchNew: G.matchPerson, stats: function () { return { rendered: st.rendered, total: st.list.length }; } };

  /* ---------- 5) 입력은 프레임당 한 번 ---------- */
  function init() {
    var box = $('dirList'), q = $('dirQuery'), cnt = $('dirCount');
    bindList(box);
    if (q) {
      q.removeAttribute('oninput');
      q.setAttribute('autocomplete', 'off'); q.setAttribute('enterkeyhint', 'search'); q.setAttribute('aria-label', '교적 검색');
      q.addEventListener('input', function () {
        if (st.raf) return;
        st.raf = requestAnimationFrame(function () { st.raf = 0; render(); });
      });
    }
    if (cnt) { cnt.setAttribute('role', 'status'); cnt.setAttribute('aria-live', 'polite'); }
    if (G.DIR) render();                                             // 스크립트가 늦게 도착해도 이미 받은 자료로 그림
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
