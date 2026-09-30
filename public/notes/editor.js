/**
 * 설교 노트 에디터 (Step 4) — 내 설교 노트 페이지와 주보 화면의 필기 창이 같이 씁니다.
 *
 *   NotesEditor.create({ root, token, note, base, mode, ... })  → 에디터
 *   NotesEditor.load({ token, id | date, store, ... }, cb)      → 서버 것과 이 기기 임시본을 맞춰서 열 노트를 정함
 *   NotesEditor.trackViewport()                                  → 키보드가 올라와도 서식 막대가 가려지지 않게
 *
 * 성능 · 안전 (글이 늦게 써지거나 사라지지 않게)
 *   · 글자를 칠 때마다 하는 일은 "글 저장(메모리) + 타이머 다시 걸기 + 글자 수" 뿐입니다. 서버 호출은 입력을 멈추고
 *     1000ms 뒤 한 번 (계속 써도 12초마다는 한 번). 저장하는 동안에도 글쓰기는 막히지 않습니다.
 *   · 이 기기에도 0.3초 안에 임시 보관 → 인터넷이 끊기거나 창이 닫히거나 서버가 잠깐 잃어도 남습니다.
 *   · 한글 조합 중(IME)에는 글을 건드리지 않습니다. 목록 이어쓰기는 조합이 끝난 Enter 에만 동작합니다.
 *   · 글 삽입은 execCommand('insertText') 로 해서 브라우저의 실행 취소(⌘Z)가 그대로 됩니다.
 */
(function (root) {
  'use strict';
  var C = root.NotesCore;
  var doc = root.document;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function n2(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm() { var d = new Date(); return n2(d.getHours()) + ':' + n2(d.getMinutes()); }
  function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var IC = {
    h: '<svg viewBox="0 0 24 24"><path d="M6 4v16M18 4v16M6 12h12"/></svg>',
    ul: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
    q: '<svg viewBox="0 0 24 24"><path d="M5 5v14M10 8h9M10 12h9M10 16h6"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15v4M17 17h4"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M5 19c0-8 4-13 14-14 0 10-5 14-13 14"/><path d="M5 19c2-4 5-7 9-9"/></svg>'
  };

  /* ---------- 키보드가 올라와도 가려지지 않게: 실제 보이는 높이를 CSS 변수로 ---------- */
  var vpOn = false;
  function trackViewport() {
    if (vpOn || !doc) return; vpOn = true;
    var vv = root.visualViewport, st = doc.documentElement.style, raf = 0;
    function up() {
      raf = 0;
      var h = vv ? vv.height : root.innerHeight, t = vv ? vv.offsetTop : 0;
      st.setProperty('--yn-vh', Math.round(h) + 'px');
      st.setProperty('--yn-vt', Math.round(t) + 'px');
    }
    function soon() { if (!raf) raf = (root.requestAnimationFrame || setTimeout)(up); }
    if (vv) { vv.addEventListener('resize', soon); vv.addEventListener('scroll', soon); }
    root.addEventListener('resize', soon); root.addEventListener('orientationchange', soon);
    up();
  }

  /* ---------- textarea 에 글 넣기 — 브라우저 실행 취소가 되도록 execCommand 를 먼저 씁니다 ---------- */
  function insertText(ta, from, to, text) {
    ta.focus();
    var before = ta.value, expect = before.slice(0, from) + text + before.slice(to), done = false;
    try {
      ta.setSelectionRange(from, to);
      done = text === '' ? doc.execCommand('delete') : doc.execCommand('insertText', false, text);
    } catch (e) { done = false; }
    if (!done || ta.value !== expect) {
      if (ta.value !== before) { ta.value = before; }       // 반쯤 들어간 것이 있으면 되돌리고
      ta.setRangeText(text, from, to, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ---------- 서버에 보내기 ---------- */
  function rpc(fn, args, ok, fail) {
    if (!root.callServer) { fail(new Error('서버에 연결하지 못했습니다.')); return; }
    root.callServer(fn, args, ok, fail);
  }

  /* =========================================================
     노트 열기 — 서버 것 ↔ 이 기기 임시본 맞추기
     o: { token, id, date(주보 필기), store, tag }
     cb(err, { note, base, push, conflict:{local,server}, offline, id })
     ========================================================= */
  function load(o, cb) {
    var byDate = !o.id && !!o.date;
    var id = o.id;
    if (byDate) {
      var k = 'ynNLive:' + o.date;
      try { id = root.localStorage.getItem(k); } catch (e) {}
      if (!C.validId(id)) { id = C.newId(); try { root.localStorage.setItem(k, id); } catch (e) {} }
    }
    var d = o.store.get(id);
    var local = d && d.note ? { note: d.note, ack: d.ack || 0, dirty: !!d.dirty } : null;

    function finish(server) {
      // 주보 필기: 다른 기기가 만든 노트(번호가 다름)가 있으면 그것을 이어 씁니다
      if (byDate && server && server.id !== id) {
        var mergeLocal = local && local.dirty && (local.note.body || local.note.reflection) ? local.note : null;
        var n = clone(server), push = false;
        if (mergeLocal) {
          if (mergeLocal.body && mergeLocal.body !== n.body) { n.body = (n.body ? n.body + '\n\n' : '') + mergeLocal.body; push = true; }
          if (mergeLocal.reflection && mergeLocal.reflection !== n.reflection) { n.reflection = (n.reflection ? n.reflection + '\n\n' : '') + mergeLocal.reflection; push = true; }
        }
        if (local) o.store.remove(id);
        try { root.localStorage.setItem('ynNLive:' + o.date, server.id); } catch (e) {}
        return cb(null, { note: n, base: server.version, push: push, id: server.id });
      }
      var r = C.reconcile(local, server);
      if (r.action === 'server') return cb(null, { note: clone(r.note), base: r.base, push: false, id: id });
      if (r.action === 'local') return cb(null, { note: clone(r.note), base: r.base, push: !!r.push, id: id });
      if (r.action === 'conflict') return cb(null, { note: clone(r.local), base: local.ack, conflict: { local: r.local, server: r.server }, id: id });
      cb(null, { note: null, base: 0, push: false, id: id });    // 새 노트
    }

    if (!o.token) return finish(null);
    var fn = byDate ? 'sermonNoteByDate' : 'sermonNoteGet';
    var arg = byDate ? [o.token, o.date] : [o.token, id];
    rpc(fn, arg, function (server) { finish(server || null); }, function (err) {
      var m = String((err && err.message) || '');
      if (/찾을 수 없/.test(m) && !byDate) return finish(null);            // 서버에 없음 (지웠거나 잃음)
      if (C.isTransientError(err) && local) return cb(null, { note: clone(local.note), base: local.ack, push: local.dirty, offline: true, id: id });
      cb(err);
    });
  }

  /* =========================================================
     에디터
     opts: root(요소), token, note, base, push, mode('page'|'dock'), store, tag,
           aiOn, limits, meta(dock 머리글), getMeta(date, cb), devotion({date,verse}),
           linkOnFirstSave(묵상 날짜), conflict({local,server}), tab, autofocus,
           onState(s), onSaved(res, note), onIdChange(id), onLink(devDate), onRemote(note), onToast
     ========================================================= */
  function create(opts) {
    var dock = opts.mode === 'dock';
    var token = opts.token || '';
    var store = opts.store;
    var L = opts.limits || C.LIMITS;
    var aiMax = (opts.limits && opts.limits.aiText) || 12000;
    var rootEl = opts.root;
    var dead = false, composing = false, aiBusy = false, selfEdit = false;
    var tab = opts.tab === 'reflection' ? 'reflection' : 'body';
    var autofilled = {};      // 주보에서 채운 값 (그대로면 날짜를 바꿀 때 다시 채워도 됨)
    var pendingLink = opts.linkOnFirstSave || '';
    var lastAt = 0;

    var note = Object.assign({ id: C.newId(), date: '', title: '', ref: '', preacher: '', body: '', reflection: '', source: dock ? 'live' : (opts.kind === 'qt' ? 'qt' : 'note'), version: 0, devDate: '', devVerse: '' }, opts.note || {});
    if (!C.validId(note.id)) note.id = C.newId();
    var qt = !dock && note.source === 'qt';      // QT · 묵상 노트 — 설교 정보(설교자 · 주보 불러오기) 없이 본문 · 묵상을 직접 적습니다
    var BOOKS = ['창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기', '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더', '욥기', '시편', '잠언', '전도서', '아가', '이사야', '예레미야', '예레미야애가', '에스겔', '다니엘', '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기',
      '마태복음', '마가복음', '누가복음', '요한복음', '사도행전', '로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서', '빌립보서', '골로새서', '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서', '디도서', '빌레몬서', '히브리서', '야고보서', '베드로전서', '베드로후서', '요한1서', '요한2서', '요한3서', '유다서', '요한계시록'];
    function bookOf(ref) {                      // 긴 이름부터 맞춰 "요한1서" 가 "요한복음" 으로 잘못 잡히지 않게
      var r = String(ref || ''), best = '';
      BOOKS.forEach(function (b) { if (r.indexOf(b) === 0 && b.length > best.length) best = b; });
      return best;
    }

    /* ----- 화면 만들기 ----- */
    var metaHtml;
    if (dock) {
      var m = opts.meta || {};
      metaHtml = '<div class="yn-fixedmeta">' + (m.title ? '<b>' + esc(m.title) + '</b>' : '<b>' + esc(C.fmtDate(note.date)) + ' 설교</b>') +
        (m.ref ? '<span>' + esc(m.ref) + '</span>' : '') + (m.preacher ? '<span>' + esc(m.preacher) + '</span>' : '') + '</div>';
    } else {
      metaHtml =
        '<input class="yn-title" id="ynTitle" type="text" maxlength="' + L.title + '" placeholder="' + (qt ? '묵상 제목 (예: 오늘의 QT)' : '설교 제목') + '" autocomplete="off" enterkeyhint="next" aria-label="' + (qt ? '묵상 제목' : '설교 제목') + '">' +
        '<div class="yn-metarow">' +
        '<label class="yn-chipin date"><span>날짜</span><input id="ynDate" type="date" aria-label="날짜"></label>' +
        (qt
          ? '<label class="yn-chipin book"><span>성경</span><select id="ynBook" aria-label="성경 책 고르기"><option value="">책 고르기</option>' +
            BOOKS.map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('') + '</select></label>'
          : '') +
        '<label class="yn-chipin ref"><span>' + (qt ? '본문' : '본문') + '</span><input id="ynRef" type="text" maxlength="' + L.ref + '" placeholder="' + (qt ? '책을 고른 뒤 장:절 (예: 3:16-21)' : '예) 요한복음 3:16') + '" autocomplete="off" aria-label="성경 본문"></label>' +
        '<label class="yn-chipin pr"' + (qt ? ' style="display:none"' : '') + '><span>설교자</span><input id="ynPre" type="text" maxlength="' + L.preacher + '" placeholder="설교자" autocomplete="off" aria-label="설교자"></label>' +
        (!qt && opts.getMeta ? '<button type="button" class="yn-mini" id="ynFill" title="그 날짜의 주보에서 제목 · 본문 · 설교자를 불러옵니다">📋 주보에서 불러오기</button>' : '') +
        (token ? '<button type="button" class="yn-mini" id="ynLink" aria-haspopup="true"></button>' : '') +
        '</div>';
    }
    rootEl.innerHTML =
      '<div class="yn-ed' + (qt ? ' yn-qt' : '') + '" role="group" aria-label="' + (qt ? 'QT · 묵상 노트' : '설교 노트') + '">' +
      '<div class="yn-ed-head">' + metaHtml + '</div>' +
      '<div class="yn-tabrow"><div class="yn-tabs" role="tablist" aria-label="노트 종류">' +
      '<button class="yn-tab" role="tab" id="ynTabBody" data-t="body" aria-selected="true">' + (qt ? '본문 · 관찰' : '필기') + '</button>' +
      '<button class="yn-tab" role="tab" id="ynTabRef" data-t="reflection" aria-selected="false">묵상 · 적용</button></div>' +
      '<span class="yn-count" id="ynCount" aria-hidden="true"></span>' +
      '<span id="ynPillWrap"></span></div>' +
      '<div class="yn-area">' +
      '<textarea class="yn-ta" id="ynTaBody" aria-labelledby="ynTabBody" spellcheck="false" autocapitalize="sentences" autocomplete="off" autocorrect="off" enterkeyhint="enter" ' +
      'placeholder="' + (qt ? '본문을 읽으며 눈에 들어온 것을 적어보세요.&#10;&#10;· 누가 · 무엇을 · 왜 — 반복되는 말, 하나님에 대해 알게 된 것&#10;· “- ” 로 시작하면 목록이 이어져요' : '설교를 들으며 자유롭게 적어보세요.&#10;&#10;· “- ” 로 시작하면 줄을 바꿀 때 목록이 이어져요&#10;· 나중에 ✨ AI 정리로 깔끔하게 다듬을 수 있어요') + '"></textarea>' +
      '<textarea class="yn-ta" id="ynTaRef" aria-labelledby="ynTabRef" hidden spellcheck="false" autocomplete="off" autocorrect="off" ' +
      'placeholder="' + (qt ? '이 말씀이 오늘 나에게 하시는 말씀은? 나의 묵상 · 적용 · 결단 · 기도를 적어보세요.' : '오늘 말씀에서 마음에 남은 것, 나의 적용과 결단, 기도 제목을 적어보세요.') + '"></textarea>' +
      '<div class="yn-bar" role="toolbar" aria-label="서식">' +
      '<button type="button" class="yn-tb" data-a="h" aria-label="제목" title="제목 (##)">' + IC.h + '</button>' +
      '<button type="button" class="yn-tb" data-a="ul" aria-label="목록" title="목록 (-)">' + IC.ul + '</button>' +
      '<button type="button" class="yn-tb" data-a="q" aria-label="성경 구절 · 인용" title="성경 구절 · 인용 (>)">' + IC.q + '</button>' +
      '<span class="sep"></span>' +
      '<button type="button" class="yn-tb" data-a="undo" aria-label="실행 취소" title="실행 취소">' + IC.undo + '</button>' +
      '<button type="button" class="yn-tb" data-a="redo" aria-label="다시 실행" title="다시 실행">' + IC.redo + '</button>' +
      '<span class="sep"></span>' +
      '<button type="button" class="yn-tb ai" data-a="ai" aria-haspopup="true" aria-label="AI 문장 정제">' + IC.spark + '<span>AI 정리</span></button>' +
      '</div></div></div>';

    var $ = function (id) { return rootEl.querySelector('#' + id); };
    var edEl = rootEl.querySelector('.yn-ed'), areaEl = rootEl.querySelector('.yn-area');
    var tas = { body: $('ynTaBody'), reflection: $('ynTaRef') };
    var titleIn = $('ynTitle'), dateIn = $('ynDate'), refIn = $('ynRef'), preIn = $('ynPre'), bookIn = $('ynBook');
    var countEl = $('ynCount'), pillWrap = $('ynPillWrap'), barEl = rootEl.querySelector('.yn-bar');
    var aiBtn = barEl.querySelector('[data-a=ai]');
    tas.body.value = note.body; tas.reflection.value = note.reflection;
    if (titleIn) { titleIn.value = note.title; dateIn.value = note.date; refIn.value = note.ref; preIn.value = note.preacher; if (bookIn) bookIn.value = bookOf(note.ref); }
    if (!opts.aiOn || !token) {
      aiBtn.disabled = true;
      aiBtn.title = !token ? '로그인하면 AI 정리를 쓸 수 있습니다' : 'AI 기능이 아직 켜져 있지 않습니다';
    }

    /* ----- 저장 상태 알약 ----- */
    var pill = doc.createElement('span');
    pillWrap.appendChild(pill);
    var pillState = '', pillTimer = 0, lastInfo = {};
    function paintPill(s, info) {
      info = info || lastInfo || {};
      var txt = '', tag = 'span', act = '';
      if (!token) { s = 'local'; }
      switch (s) {
        case 'saving': txt = '저장 중...'; break;
        case 'saved': txt = !lastAt ? '저장됨' : (Date.now() - lastAt < 2500 ? '저장 완료' : '저장됨 · ' + hhmm()); break;
        case 'dirty': txt = '수정됨'; break;
        case 'error': txt = '저장 실패 · 이 기기에 보관 중 · 다시 시도합니다'; tag = 'button'; act = 'retry'; break;
        case 'offline': txt = '오프라인 · 이 기기에 보관 중'; tag = 'button'; act = 'retry'; break;
        case 'fatal': txt = (info.message || '저장하지 못했습니다') + ' · 눌러서 다시'; tag = 'button'; act = 'retry'; break;
        case 'conflict': txt = '충돌 · 눌러서 해결'; tag = 'button'; act = 'conflict'; break;
        case 'toolong': txt = '글이 너무 깁니다 · 저장되지 않음'; break;
        case 'local': txt = '이 기기에만 저장됨'; break;
        default: txt = token ? (note.version ? '저장됨' : '자동 저장') : '이 기기에만 저장됨';
      }
      if (pill.tagName.toLowerCase() !== tag) {
        var np = doc.createElement(tag); pillWrap.replaceChild(np, pill); pill = np;
        if (tag === 'button') pill.type = 'button';
      }
      pill.className = 'yn-pill'; pill.setAttribute('data-s', s === 'idle' ? 'idle' : s);
      pill.setAttribute('role', 'status'); pill.setAttribute('aria-live', 'polite'); pill.setAttribute('data-act', act);
      pill.innerHTML = '<i></i>' + esc(txt);
      pillState = s;
    }
    pillWrap.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button.yn-pill'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'retry') { saver.request(); } else if (a === 'conflict' && conflictInfo) showConflict(conflictInfo);
    });

    /* ----- 저장기 ----- */
    var conflictInfo = null;
    var saver = C.createSaver({
      base: opts.base || 0,
      getSnapshot: snapshot,
      isTransient: C.isTransientError,
      checkSavable: function (snap, ever) {
        if (ever) return C.checkSavable(snap, true);
        // 주보에서 채운 제목만 있는 노트는 서버에 만들지 않습니다 (직접 쓴 글이 있어야)
        var chk = C.checkSavable(snap, false);
        if (chk.ok && !String(snap.body || '').trim() && !String(snap.reflection || '').trim() && autofilled.title === snap.title) return { ok: false, reason: 'empty' };
        return chk;
      },
      isOffline: function () { return root.navigator && root.navigator.onLine === false; },
      send: function (snap, base, cb) {
        if (!token) { cb(null, { ok: true, version: base }); return; }
        rpc('sermonNoteSave', [token, snap, base], function (r) { cb(null, r); }, function (e) { cb(e); });
      },
      onState: function (s, info) {
        lastInfo = info || {};
        if (s === 'saved') { lastAt = Date.now(); clearTimeout(pillTimer); pillTimer = setTimeout(function () { if (!dead && pillState === 'saved') paintPill('saved'); }, 2600); }
        paintPill(s, info);
        if (s === 'saved' || s === 'error' || s === 'offline' || s === 'fatal' || s === 'conflict' || s === 'toolong') persistNow();
        if (opts.onState) opts.onState(s);
      },
      onAck: function (res) {
        note.version = res.version || note.version;
        if (res.devDate != null) { note.devDate = res.devDate; note.devVerse = res.devVerse || ''; paintLink(); }
        if (opts.onSaved) opts.onSaved(res, snapshot(), note);
        if (pendingLink) { var pl = pendingLink; pendingLink = ''; doLink(pl, '', true); }
      },
      onConflict: function (res) { conflictInfo = res; showConflict(res); }
    });
    var deb = C.createDebouncer(function () { saver.request(); }, C.DEBOUNCE_MS, { maxWait: C.MAX_WAIT_MS });
    var persistDeb = C.createDebouncer(persistNow, 300, { maxWait: 2000 });

    function snapshot() {
      return { id: note.id, date: note.date, title: note.title, ref: note.ref, preacher: note.preacher, body: note.body, reflection: note.reflection, source: note.source };
    }
    function persistNow() {
      if (dead) return;
      var dirty = !token || !saver.isClean() || deb.pending();     // 로그인 없이 쓴 글은 늘 "아직 못 보낸 것"
      store.put(note.id, { note: snapshot(), ack: saver.base(), dirty: dirty, owner: opts.tag || '' });
    }

    /* ----- 글이 바뀔 때 (글자 하나마다 불리므로 가볍게) ----- */
    function touched() {
      saver.edit();
      deb.call();
      persistDeb.call();
      paintCount();
    }
    function onTa(field) {
      return function () { if (dead) return; note[field] = tas[field].value; touched(); };
    }
    tas.body.addEventListener('input', onTa('body'));
    tas.reflection.addEventListener('input', onTa('reflection'));
    ['body', 'reflection'].forEach(function (f) {
      var ta = tas[f];
      ta.addEventListener('compositionstart', function () { composing = true; });
      ta.addEventListener('compositionend', function () { composing = false; });
      // Enter 로 목록 이어쓰기 — 한글 조합 중에는 하지 않습니다 (조합이 끝난 뒤의 Enter 만)
      ta.addEventListener('beforeinput', function (e) {
        if (selfEdit || composing || e.isComposing) return;
        if (e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph') return;
        if (ta.selectionStart !== ta.selectionEnd) return;
        var r = C.continueList(ta.value, ta.selectionStart);
        if (!r) return;
        e.preventDefault();
        selfEdit = true; try { insertText(ta, r.from, r.to, r.insert); } finally { selfEdit = false; }
        keepCaretVisible(ta);
      });
      ta.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); flush(); }
      });
    });
    function metaHandler(field, el) {
      if (!el) return;
      el.addEventListener('input', function () {
        if (dead) return;
        note[field] = el.value;
        if (autofilled[field] !== undefined && el.value !== autofilled[field]) delete autofilled[field];
        touched();
      });
    }
    metaHandler('title', titleIn); metaHandler('ref', refIn); metaHandler('preacher', preIn);
    if (bookIn) {
      // 성경 책 고르기 → 본문 칸이 "요한복음 " 로 시작 (장:절은 직접). 본문을 직접 고쳐 쓰면 책 칸도 따라갑니다.
      bookIn.addEventListener('change', function () {
        var b = bookIn.value, cur = refIn.value, old = bookOf(cur);
        var rest = old ? cur.slice(old.length).replace(/^\s+/, '') : '';
        refIn.value = b ? (b + ' ' + rest).replace(/\s+$/, b && !rest ? ' ' : '') : rest;
        refIn.dispatchEvent(new Event('input', { bubbles: true }));
        // 선택창이 닫히며 포커스를 되가져가는 브라우저가 있어, 한 박자 뒤에 본문 칸으로 옮깁니다
        setTimeout(function () { if (dead) return; refIn.focus(); try { var l = refIn.value.length; refIn.setSelectionRange(l, l); } catch (e) {} }, 40);
      });
      refIn.addEventListener('input', function () { var b = bookOf(refIn.value); if (bookIn.value !== b) bookIn.value = b; });
    }
    if (titleIn) {
      titleIn.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); tas[tab].focus(); } });
      dateIn.addEventListener('change', function () {
        var v = dateIn.value; if (!v) { dateIn.value = note.date; return; }
        note.date = v; touched();
        maybeAutofill(v);
      });
    }

    function keepCaretVisible(ta) {
      // 브라우저가 알아서 캐럿을 보이게 하지만, 값을 코드로 바꾼 뒤에는 한 번 더 확인
      try { var c = ta.selectionStart; ta.setSelectionRange(c, c); } catch (e) {}
    }

    function paintCount() {
      var len = tas[tab].value.length, max = tab === 'body' ? L.body : L.reflection;
      var cls = len > max ? 'bad' : (len > max * 0.9 ? 'warn' : '');
      countEl.className = 'yn-count' + (cls ? ' ' + cls : '');
      countEl.textContent = (len > max * 0.7 ? fmtN(len) + ' / ' + fmtN(max) : fmtN(len)) + '자';
    }

    /* ----- 탭 ----- */
    function setTab(t, focus) {
      tab = t === 'reflection' ? 'reflection' : 'body';
      tas.body.hidden = tab !== 'body'; tas.reflection.hidden = tab !== 'reflection';
      $('ynTabBody').setAttribute('aria-selected', String(tab === 'body'));
      $('ynTabRef').setAttribute('aria-selected', String(tab === 'reflection'));
      paintCount();
      if (focus) tas[tab].focus();
    }
    rootEl.querySelector('.yn-tabs').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.yn-tab'); if (b) setTab(b.getAttribute('data-t'), true);
    });

    /* ----- 서식 막대 ----- */
    // 버튼을 눌러도 글쓰던 칸이 포커스를 잃지 않게 (키보드가 내려가지 않게)
    barEl.addEventListener('mousedown', function (e) { if (e.target.closest('.yn-tb')) e.preventDefault(); });
    barEl.addEventListener('pointerdown', function (e) { if (e.target.closest('.yn-tb') && e.pointerType !== 'mouse') e.preventDefault(); });
    barEl.addEventListener('click', function (e) {
      var b = e.target.closest('.yn-tb'); if (!b || b.disabled) return;
      var a = b.getAttribute('data-a'), ta = tas[tab];
      if (composing) return;
      if (a === 'undo' || a === 'redo') { ta.focus(); try { doc.execCommand(a); } catch (x) {} return; }
      if (a === 'ai') { toggleAiMenu(); return; }
      var pre = a === 'h' ? '## ' : (a === 'ul' ? '- ' : '> ');
      var r = C.toggleLinePrefix(ta.value, ta.selectionStart, ta.selectionEnd, pre);
      selfEdit = true; try { insertText(ta, r.from, r.to, r.text); } finally { selfEdit = false; }
    });

    /* ----- 알림 · 시트 ----- */
    var toastEl = null, toastTimer = 0;
    function toast(msg, label, fn, ms) {
      if (toastEl) { toastEl.remove(); toastEl = null; }
      clearTimeout(toastTimer);
      var t = doc.createElement('div'); t.className = 'yn-toast'; t.setAttribute('role', 'status');
      t.innerHTML = '<span>' + esc(msg) + '</span>' + (label ? '<button type="button">' + esc(label) + '</button>' : '');
      if (label) t.querySelector('button').addEventListener('click', function () { t.remove(); toastEl = null; fn && fn(); });
      edEl.appendChild(t); toastEl = t;
      toastTimer = setTimeout(function () { if (toastEl === t) { t.remove(); toastEl = null; } }, ms || (label ? 9000 : 3500));
    }
    var sheetEl = null;
    function openSheet(html) {
      closeSheet();
      var s = doc.createElement('div'); s.className = 'yn-scrim';
      s.innerHTML = '<div class="yn-sheet" role="dialog" aria-modal="true">' + html + '</div>';
      edEl.appendChild(s); sheetEl = s;
      var first = s.querySelector('.yn-btn.pri') || s.querySelector('.yn-btn'); if (first) first.focus();
      return s;
    }
    function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
    function closePop() { var p = edEl.querySelector('.yn-pop'); if (p) p.remove(); }

    /* ----- 글 채우기 (서버 것으로 바꾸기 등) ----- */
    function paintFields() {
      tas.body.value = note.body; tas.reflection.value = note.reflection;
      if (titleIn) { titleIn.value = note.title; dateIn.value = note.date; refIn.value = note.ref; preIn.value = note.preacher; }
      paintCount(); paintLink();
    }
    function applyServerNote(sv) {
      note.date = sv.date; note.title = sv.title; note.ref = sv.ref; note.preacher = sv.preacher; note.body = sv.body; note.reflection = sv.reflection;
      note.version = sv.version; note.devDate = sv.devDate || ''; note.devVerse = sv.devVerse || '';
      if (sv.id) note.id = sv.id;
      paintFields();
      conflictInfo = null;
      saver.reset(sv.version);
      persistNow();
      if (opts.onRemote) opts.onRemote(clone(note));
    }

    /* ----- 충돌 ----- */
    function showConflict(res) {
      var sv = res.server || {}, reason = res.reason, h, s;
      if (reason === 'deleted') {
        s = openSheet('<h3>다른 기기에서 지운 노트예요</h3><p class="sub">이 노트는 다른 기기에서 삭제되었습니다. 지금 화면의 글은 그대로 남아 있어요. 어떻게 할까요?</p>' +
          '<div class="yn-acts"><button class="yn-btn pri" data-c="restore">되살려서 계속 쓰기</button><button class="yn-btn" data-c="copy">새 노트로 저장</button></div>');
      } else if (reason === 'exists') {
        s = openSheet('<h3>이 주일의 노트가 이미 있어요</h3><p class="sub">다른 기기에서 같은 주일의 필기를 먼저 만들었습니다. 그 노트에 지금 쓴 글을 <b>이어 붙일까요?</b></p>' +
          '<div class="yn-acts"><button class="yn-btn pri" data-c="merge">이어 붙이기</button><button class="yn-btn" data-c="server">그 노트만 열기</button></div>');
      } else {
        s = openSheet('<h3>다른 기기에서 이 노트가 바뀌었어요</h3><p class="sub">같은 노트를 다른 기기에서도 고쳤습니다. 어느 쪽을 쓸까요? (둘 다 보관하면 지금 화면의 글은 “충돌 사본” 새 노트로 남습니다)</p>' +
          '<div class="yn-acts"><button class="yn-btn pri" data-c="both">둘 다 보관</button><button class="yn-btn" data-c="mine">이 화면 글로 덮어쓰기</button><button class="yn-btn" data-c="server">다른 기기 글 쓰기</button></div>');
      }
      s.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-c]'); if (!b) return;
        var c = b.getAttribute('data-c');
        if (c === 'mine') { closeSheet(); conflictInfo = null; saver.resume(sv.version); toast('이 화면의 글로 저장합니다'); }
        else if (c === 'server') { closeSheet(); applyServerNote(sv); toast('다른 기기의 글을 불러왔습니다'); }
        else if (c === 'restore') {
          b.disabled = true;
          rpc('sermonNoteDelete', [token, note.id, true], function (r) { closeSheet(); conflictInfo = null; saver.resume(r.version); toast('되살렸습니다'); },
            function (er) { b.disabled = false; toast(er.message || '되살리지 못했습니다'); });
        } else if (c === 'copy') {
          closeSheet(); conflictInfo = null;
          var old = note.id; note.id = C.newId(); note.source = 'note'; note.version = 0; note.devDate = ''; note.devVerse = '';
          store.remove(old); if (opts.onIdChange) opts.onIdChange(note.id);
          saver.reset(0); saver.resume(0); toast('새 노트로 저장합니다');
        } else if (c === 'merge') {
          closeSheet(); conflictInfo = null;
          var mineBody = note.body, mineRef = note.reflection, oldId = note.id;
          note.id = sv.id; note.title = sv.title || note.title; note.ref = sv.ref || note.ref; note.preacher = sv.preacher || note.preacher;
          note.body = sv.body ? (mineBody && mineBody !== sv.body ? sv.body + '\n\n' + mineBody : sv.body) : mineBody;
          note.reflection = sv.reflection ? (mineRef && mineRef !== sv.reflection ? sv.reflection + '\n\n' + mineRef : sv.reflection) : mineRef;
          note.version = sv.version; note.devDate = sv.devDate || ''; note.devVerse = sv.devVerse || '';
          store.remove(oldId);
          try { root.localStorage.setItem('ynNLive:' + note.date, note.id); } catch (e) {}
          paintFields(); if (opts.onIdChange) opts.onIdChange(note.id);
          saver.resume(sv.version); toast('이어 붙였습니다');
        } else if (c === 'both') {
          b.disabled = true;
          var cp = snapshot(); cp.id = C.newId(); cp.source = 'note'; cp.title = ('(충돌 사본) ' + (cp.title || '')).slice(0, L.title);
          rpc('sermonNoteSave', [token, cp, 0], function (r) {
            if (r && r.conflict) { b.disabled = false; toast('사본을 만들지 못했습니다. 다시 눌러주세요.'); return; }
            closeSheet(); applyServerNote(sv);
            toast('내 글은 “충돌 사본” 노트로 보관했습니다');
            if (opts.onCopy) opts.onCopy(cp.id);
          }, function (er) { b.disabled = false; toast(er.message || '사본을 만들지 못했습니다'); });
        }
      });
    }

    /* ----- 주보에서 불러오기 · 날짜 바꾸면 자동 채움 ----- */
    function fillMeta(meta, force, silent) {
      var n = 0;
      [['title', titleIn], ['ref', refIn], ['preacher', preIn]].forEach(function (p) {
        var f = p[0], el = p[1], v = meta && meta[f];
        if (!el || !v) return;
        var cur = note[f];
        if (force || !cur || autofilled[f] === cur) { if (cur !== v) n++; note[f] = v; el.value = v; autofilled[f] = v; }
      });
      if (n && !silent) touched();
      return n;
    }
    function maybeAutofill(date) {
      if (qt || !opts.getMeta || note.body.trim() || note.reflection.trim()) return;
      opts.getMeta(date, function (meta) { if (meta && !dead && note.date === date) fillMeta(meta, false); });
    }
    var fillBtn = $('ynFill');
    if (fillBtn) fillBtn.addEventListener('click', function () {
      fillBtn.disabled = true;
      opts.getMeta(note.date, function (meta) {
        fillBtn.disabled = false;
        if (!meta) { toast('그 날짜에 게시된 주보가 없습니다'); return; }
        var prev = { title: note.title, ref: note.ref, preacher: note.preacher };
        var n = fillMeta(meta, true);
        if (!n) { toast('이미 주보와 같습니다'); return; }
        toast('주보에서 불러왔습니다', '되돌리기', function () {
          note.title = prev.title; note.ref = prev.ref; note.preacher = prev.preacher;
          titleIn.value = prev.title; refIn.value = prev.ref; preIn.value = prev.preacher; touched();
        });
      });
    });
    if (!qt && opts.autofill && titleIn) {           // 새 노트를 만들 때 주보 정보로 미리 채움 (사용자가 고칠 수 있음)
      fillMeta(opts.autofill, false, true);
    }
    if (dock) autofilled = { title: note.title, ref: note.ref, preacher: note.preacher };

    /* ----- 오늘의 묵상 연결 ----- */
    var linkBtn = $('ynLink');
    function paintLink() {
      if (!linkBtn) return;
      var on = !!note.devDate;
      linkBtn.className = 'yn-mini' + (on ? ' on' : '');
      linkBtn.innerHTML = IC.leaf + (on ? ' 묵상 연결됨 · ' + esc(note.devDate.slice(5).replace('-', '.')) : ' 오늘의 묵상에 연결');
    }
    function ensureSaved(cb) {
      if (!token) return toast('로그인하면 묵상에 연결할 수 있습니다');
      deb.flush(); if (!saver.isBusy()) saver.request();
      saver.whenSettled(function (s) {
        if (saver.hasSaved() && (s === 'saved' || s === 'idle')) cb();
        else if (s === 'conflict') toast('먼저 다른 기기와 달라진 부분을 정리해주세요');
        else if (!saver.hasSaved()) toast('내용을 조금 적으면 연결할 수 있어요');
        else toast('저장이 끝나면 다시 눌러주세요');
      });
    }
    function doLink(date, verse, quiet) {
      rpc('sermonNoteLink', [token, note.id, date, verse || ''], function (r) {
        note.devDate = r.devDate || ''; note.devVerse = r.devVerse || ''; paintLink(); persistNow();
        if (opts.onLink) opts.onLink(note.devDate, note.devVerse);
        if (!quiet) toast(note.devDate ? '오늘의 묵상에 연결했습니다' : '연결을 해제했습니다');
      }, function (e) { toast(e.message || '연결하지 못했습니다'); });
    }
    if (linkBtn) {
      paintLink();
      linkBtn.addEventListener('click', function () {
        if (edEl.querySelector('.yn-pop[data-k=link]')) { closePop(); return; }
        closePop();
        var dv = opts.devotion, h = '<div class="hd">오늘의 묵상에 연결</div>';
        if (dv && dv.date) h += '<button type="button" data-l="today"><b>오늘의 묵상 · ' + esc(dv.date.slice(5).replace('-', '.')) + '</b><span>' + esc(dv.verse || '오늘의 말씀') + '</span></button>';
        h += '<button type="button" data-l="pick"><b>다른 날짜의 묵상…</b><span>날짜를 골라 연결합니다</span></button>';
        if (note.devDate) h += '<button type="button" data-l="off"><b>연결 해제</b><span>지금: ' + esc(note.devDate) + (note.devVerse ? ' · ' + esc(note.devVerse) : '') + '</span></button>';
        h += '<button type="button" data-l="open"><b>묵상 페이지 열기 ↗</b><span>오늘의 성경 묵상으로 이동</span></button>';
        var p = doc.createElement('div'); p.className = 'yn-pop'; p.setAttribute('data-k', 'link'); p.style.bottom = 'auto'; p.style.top = '112px'; p.innerHTML = h;
        edEl.appendChild(p);
        p.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-l]'); if (!b) return;
          var k = b.getAttribute('data-l');
          if (k === 'today') { closePop(); ensureSaved(function () { doLink(dv.date, dv.verse); }); }
          else if (k === 'off') { closePop(); ensureSaved(function () { doLink('', ''); }); }
          else if (k === 'open') { root.location.href = '?page=devotion&t=' + encodeURIComponent(token); }
          else if (k === 'pick') {
            p.innerHTML = '<div class="hd">연결할 묵상 날짜</div><div style="padding:6px 10px 10px"><label class="yn-chipin" style="width:100%"><span>날짜</span><input type="date" id="ynLinkDate" value="' + esc(note.devDate || (dv && dv.date) || note.date) + '"></label>' +
              '<div class="yn-acts" style="margin-top:10px"><button type="button" class="yn-btn pri" data-l="go" style="text-align:center">연결</button></div></div>';
            var gi = p.querySelector('#ynLinkDate'); if (gi) gi.focus();
          } else if (k === 'go') {
            var v = p.querySelector('#ynLinkDate').value; closePop();
            if (!v) return toast('날짜를 골라주세요');
            ensureSaved(function () { doLink(v, ''); });
          }
        });
      });
    }
    doc.addEventListener('pointerdown', outsidePop, true);
    function outsidePop(e) { var p = edEl.querySelector('.yn-pop'); if (p && !p.contains(e.target) && !(e.target.closest && (e.target.closest('#ynLink') || e.target.closest('[data-a=ai]')))) p.remove(); }

    /* ----- AI 문장 정제 ----- */
    function toggleAiMenu() {
      if (aiBusy) return toast('AI 가 정리하는 중입니다. 잠시만요…');
      if (edEl.querySelector('.yn-pop[data-k=ai]')) return closePop();
      closePop();
      var ta = tas[tab], sel = ta.selectionEnd - ta.selectionStart >= 8;
      var p = doc.createElement('div'); p.className = 'yn-pop'; p.setAttribute('data-k', 'ai');
      p.innerHTML = '<div class="hd">✨ AI 문장 정제' + (sel ? ' · 선택한 부분만' : '') + '</div>' +
        '<button type="button" data-m="polish"><b>문장 다듬기</b><span>오탈자 · 띄어쓰기 · 끊어진 문장을 자연스럽게. 줄 구성은 그대로.</span></button>' +
        '<button type="button" data-m="structure"><b>구조화하기</b><span>제목(##)과 목록(-)으로 큰 흐름이 보이게 정리. 없는 내용은 만들지 않습니다.</span></button>';
      edEl.appendChild(p);
      p.addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (b) { closePop(); refine(b.getAttribute('data-m')); } });
    }
    function refine(mode) {
      var field = tab, ta = tas[field], s = ta.selectionStart, e = ta.selectionEnd;
      var useSel = e - s >= 8, text = useSel ? ta.value.slice(s, e) : ta.value;
      if (!text.trim()) return toast('먼저 필기를 적어주세요');
      if (text.trim().length < 8) return toast('내용이 너무 짧아 정리할 것이 없어요');
      if (text.length > aiMax) return toast('한 번에 ' + fmtN(aiMax) + '자까지 정리할 수 있어요. 일부를 선택한 뒤 눌러주세요.', '', null, 5000);
      aiBusy = true; aiBtn.classList.add('busy'); aiBtn.querySelector('span').textContent = '정리 중…';
      toast('AI 가 정리하는 중… 계속 써도 괜찮아요', '', null, 12000);
      var orig = { field: field, s: s, e: e, useSel: useSel, text: text };
      rpc('sermonNoteRefine', [token, text, mode, { title: note.title, ref: note.ref, preacher: note.preacher, section: field }], function (r) {
        aiDone(); showRefine(r, orig);
      }, function (er) { aiDone(); toast(er.message || 'AI 정리에 실패했습니다', '', null, 6000); });
    }
    function aiDone() { aiBusy = false; aiBtn.classList.remove('busy'); aiBtn.querySelector('span').textContent = 'AI 정리'; if (toastEl) { toastEl.remove(); toastEl = null; } }
    function showRefine(r, orig) {
      var warn = r.warn === 'short' ? '결과가 원문보다 많이 짧아졌어요. 내용이 빠지지 않았는지 확인해주세요.' : (r.warn === 'long' ? '결과가 원문보다 많이 길어졌어요. 없는 내용이 들어가지 않았는지 확인해주세요.' : '');
      var s = openSheet('<h3>✨ ' + (r.mode === 'structure' ? '구조화한 결과' : '다듬은 결과') + '</h3>' +
        '<p class="sub">' + (orig.useSel ? '선택한 부분' : (orig.field === 'body' ? '필기 전체' : '묵상 · 적용 전체')) + ' · 원문 ' + fmtN(r.inLen) + '자 → ' + fmtN(r.outLen) + '자. 마음에 들면 적용하세요.</p>' +
        (warn ? '<div class="warn">' + esc(warn) + '</div>' : '') +
        '<div class="yn-result" id="ynRes" tabindex="0"></div>' +
        '<div class="yn-acts"><button class="yn-btn pri" data-r="rep">바꾸기</button><button class="yn-btn" data-r="add">아래에 붙이기</button><button class="yn-btn" data-r="no">버리기</button></div>');
      s.querySelector('#ynRes').textContent = r.text;
      s.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-r]'); if (!b) return;
        var k = b.getAttribute('data-r'); closeSheet();
        if (k === 'no') return;
        setTab(orig.field);
        var ta = tas[orig.field];
        var unchanged = orig.useSel ? ta.value.slice(orig.s, orig.e) === orig.text : ta.value === orig.text;
        if (k === 'rep' && unchanged) {
          var from = orig.useSel ? orig.s : 0, to = orig.useSel ? orig.e : ta.value.length;
          selfEdit = true; try { insertText(ta, from, to, r.text); } finally { selfEdit = false; }
          toast('바꿨습니다', '되돌리기', function () {
            if (ta.value.slice(from, from + r.text.length) === r.text) { selfEdit = true; try { insertText(ta, from, from + r.text.length, orig.text); } finally { selfEdit = false; } }
            else toast('그 사이 글이 바뀌어 되돌릴 수 없어요. ⌘Z(실행 취소)를 써보세요.', '', null, 5000);
          });
        } else {
          var at = orig.useSel && unchanged ? orig.e : ta.value.length;
          var ins = (at > 0 && ta.value.charAt(at - 1) !== '\n' ? '\n\n' : (at > 0 ? '\n' : '')) + r.text;
          selfEdit = true; try { insertText(ta, at, at, ins); } finally { selfEdit = false; }
          toast(k === 'rep' ? '그 사이 글이 바뀌어 아래에 붙였어요' : '아래에 붙였습니다', '되돌리기', function () {
            if (ta.value.slice(at, at + ins.length) === ins) { selfEdit = true; try { insertText(ta, at, at + ins.length, ''); } finally { selfEdit = false; } }
          });
        }
      });
    }

    /* ----- 지금 저장 · 닫을 때 ----- */
    function flush(cb) {
      persistDeb.flush(); persistNow();
      if (!token) { cb && cb(true); return; }
      var pend = deb.flush();
      if (!pend && !saver.isBusy() && !saver.isClean()) saver.request();
      if (cb) saver.whenSettled(function (s) { cb(s === 'saved' || s === 'idle'); });
    }
    function beacon() {
      // 창이 닫히는 순간 — 임시본은 이미 이 기기에 있고, 서버에도 한 번 더 밀어 봅니다 (작은 글만: keepalive 한도)
      if (!token || saver.isClean() && !deb.pending()) return;
      if (saver.stats().halted) return;
      var body = JSON.stringify({ args: [token, snapshot(), saver.base()] });
      if (body.length > 60000 || !root.fetch) return;
      try { root.fetch('/api/sermonNoteSave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true, credentials: 'same-origin' }).catch(function () {}); } catch (e) {}
    }
    function onHide() { persistDeb.cancel(); persistNow(); beacon(); }
    function onVis() { if (doc.visibilityState === 'hidden') onHide(); else if (token && !dead) { if (!saver.isClean() && !saver.isBusy()) saver.request(); } }
    function onOnline() { if (!dead && !saver.isClean() && !saver.isBusy()) saver.request(); paintPill(saver.state()); }
    function onOffline() { if (!dead) paintPill(saver.state() === 'saved' || saver.state() === 'idle' ? 'offline' : saver.state()); }
    root.addEventListener('pagehide', onHide);
    doc.addEventListener('visibilitychange', onVis);
    root.addEventListener('online', onOnline);
    root.addEventListener('offline', onOffline);
    // 화면 밖을 누르면 메뉴 닫기 / Esc
    edEl.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePop(); if (sheetEl && !conflictInfo) closeSheet(); } });

    function destroy() {
      if (dead) return;
      persistDeb.cancel(); persistNow();
      if (token && (!saver.isClean() || deb.pending()) && !saver.stats().halted) { deb.cancel(); saver.request(); }
      dead = true; deb.cancel(); saver.destroy();
      clearTimeout(pillTimer); clearTimeout(toastTimer);
      root.removeEventListener('pagehide', onHide); doc.removeEventListener('visibilitychange', onVis);
      root.removeEventListener('online', onOnline); root.removeEventListener('offline', onOffline);
      doc.removeEventListener('pointerdown', outsidePop, true);
    }

    /* ----- 시작 ----- */
    setTab(tab);
    paintPill(opts.push ? 'dirty' : (note.version ? 'saved' : 'idle'));
    if (note.version && !opts.push) { pillState = 'saved'; lastAt = 0; paintPill('saved'); }
    if (opts.conflict) {
      conflictInfo = { conflict: true, reason: 'version', server: opts.conflict.server };
      saver.halt(conflictInfo);
      showConflict(conflictInfo);
    } else if (opts.push && token) {
      saver.edit(); saver.request();
    }
    if (opts.offline) toast('인터넷 연결이 없어 이 기기에 저장된 글을 열었어요', '', null, 5000);
    if (opts.autofocus) setTimeout(function () { if (!dead) tas[tab].focus({ preventScroll: true }); }, 60);

    return {
      note: function () { return snapshot(); },
      full: function () { return clone(note); },
      id: function () { return note.id; },
      version: function () { return note.version; },
      state: function () { return saver.state(); },
      isClean: function () { return saver.isClean() && !deb.pending(); },
      flush: flush, destroy: destroy, toast: toast, setTab: setTab,
      focus: function () { tas[tab].focus(); },
      setDevLink: function (d, v) { note.devDate = d || ''; note.devVerse = v || ''; paintLink(); },
      applyServerNote: applyServerNote,
      /** 주보 정보로 빈 칸을 채웁니다 (글을 쓰기 전에만, 저장을 일으키지 않음) */
      autofillMeta: function (m) { if (!note.body.trim() && !note.reflection.trim()) fillMeta(m, false, true); },
      el: edEl
    };
  }

  root.NotesEditor = { create: create, load: load, trackViewport: trackViewport, insertText: insertText };
})(typeof window !== 'undefined' ? window : this);
