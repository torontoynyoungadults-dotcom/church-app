/**
 * 주보 화면의 "설교 필기" 창 (Step 4)
 * ------------------------------------------------------------
 * 주보를 보면서 바로 필기합니다. 폰에서는 아래에서 올라오는 시트, 태블릿·PC 에서는 오른쪽 아래 카드.
 * 주보를 다시 그려도(지난 주보 고르기 등) 이 창은 #root 밖(body)에 있어서 글이 그대로입니다.
 * 필기는 그 주보의 주일 날짜에 "주일마다 하나" 이어서 씁니다 (같은 노트를 내 설교 노트에서도 열 수 있음).
 *
 *   NotesDock.update(bulletin)   주보를 그릴 때마다 (없으면 null)
 */
(function (root) {
  'use strict';
  var C = root.NotesCore, E = root.NotesEditor, doc = root.document;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ls() { try { return root.localStorage; } catch (e) { return null; } }
  function keptToken() {
    try { var s = root.sessionStorage.getItem('ynPortalToken'); if (s) return s; } catch (e) {}
    try { var k = JSON.parse(root.localStorage.getItem('ynPortalKeep') || 'null'); if (k && k.t && k.until > Date.now()) return k.t; } catch (e) {}
    return '';
  }
  function tokenTag(t) { var h = 5381, i; for (i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return 't' + (h >>> 0).toString(36); }

  var S = { b: null, meta: null, date: '', ed: null, edDate: '', fab: null, dock: null, host: null, open: false, token: '', busy: 0 };
  var store = C.createDraftStore(ls());
  var PEN = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

  function ensureDom() {
    if (S.fab) return;
    E.trackViewport();
    var f = doc.createElement('button'); f.type = 'button'; f.className = 'yn yn-dockfab'; f.hidden = true;
    f.setAttribute('aria-label', '설교 필기 열기');
    f.innerHTML = PEN + '<span>설교 필기</span><i class="dot" hidden></i>';
    f.addEventListener('click', openDock);
    var d = doc.createElement('div'); d.className = 'yn yn-dock'; d.hidden = true; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', '설교 필기');
    d.innerHTML = '<div class="yn-dockhead"><span class="grab"></span><h2 id="ynDockT">✍ 설교 필기</h2><span class="sp"></span>' +
      '<a class="yn-mini" id="ynDockOpen" href="?page=notes" target="_self" style="text-decoration:none" hidden>내 노트 ↗</a>' +
      '<button type="button" class="yn-icon" id="ynDockX" aria-label="필기 창 닫기" style="width:38px;height:38px"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="yn-dockbody" id="ynDockBody"></div>';
    doc.body.appendChild(f); doc.body.appendChild(d);
    S.fab = f; S.dock = d; S.host = d.querySelector('#ynDockBody');
    d.querySelector('#ynDockX').addEventListener('click', closeDock);
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDock(); });
  }

  function fmt(b) { return b.date.slice(5).replace('-', '.'); }

  function mountFor(b, fallbackMsg) {
    var token = fallbackMsg ? '' : S.token, meta = S.meta || {};
    if (S.ed) { S.ed.destroy(); S.ed = null; }
    S.edDate = b.date;
    S.host.innerHTML = '<div class="yn-empty" style="padding:30px 10px">불러오는 중…</div>';
    var want = b.date, seq = ++S.busy;
    E.load({ token: token, date: b.date, store: store }, function (err, r) {
      if (seq !== S.busy || S.date !== want) return;
      if (err) {
        // 로그인이 만료되었거나 서버가 거절해도 필기는 막지 않습니다 — 이 기기에 저장해 두고, 로그인하면 계정으로 보냅니다
        if (!fallbackMsg) return mountFor(b, err.message || '서버에서 필기를 불러오지 못했어요.');
        return;
      }
      var note = r.note || { id: r.id, date: b.date, title: meta.title || '', ref: meta.ref || '', preacher: meta.preacher || '', body: '', reflection: '', source: 'live', version: 0 };
      var pre = '';
      if (!token) pre = '<div class="yn-docknote">' + (fallbackMsg ? esc(fallbackMsg) + ' ' : '') + '로그인하지 않아 이 기기에만 저장돼요. <a href="' + esc((root.HOME) || '/?page=portal') + '">포털에서 로그인</a>하면 내 계정에 저장되고 AI 정리도 쓸 수 있어요.</div>';
      S.host.innerHTML = pre + '<div id="ynDockEd" style="flex:1;min-height:0"></div>';
      S.ed = E.create({
        root: S.host.querySelector('#ynDockEd'), token: token, tag: token ? tokenTag(token) : '', store: store, mode: 'dock',
        note: note, base: r.base || 0, push: !!r.push, conflict: r.conflict, offline: r.offline,
        meta: { title: note.title || meta.title, ref: note.ref || meta.ref, preacher: note.preacher || meta.preacher },
        aiOn: true, limits: { title: 120, ref: 80, preacher: 60, body: 30000, reflection: 12000, aiText: 12000 },
        tab: 'body', autofocus: S.open && !!r.note === false,
        onState: function (s) { var dot = S.fab.querySelector('.dot'); if (dot) dot.hidden = !(s === 'saved' && (S.ed && S.ed.note().body)); },
        onSaved: function () { paintOpenLink(); },
        onIdChange: function () { paintOpenLink(); }
      });
      paintOpenLink();
    });
  }
  function paintOpenLink() {
    var a = S.dock.querySelector('#ynDockOpen'); if (!a) return;
    if (!S.token || !S.ed) { a.hidden = true; return; }
    a.hidden = false; a.href = '?page=notes&id=' + encodeURIComponent(S.ed.id());
  }

  function openDock() {
    if (!S.b) return;
    ensureDom();
    S.token = keptToken();
    S.open = true; S.dock.hidden = false; S.fab.classList.add('hide');
    S.dock.querySelector('#ynDockT').textContent = '✍ ' + fmt(S.b) + ' 필기';
    if (!S.ed || S.edDate !== S.b.date) mountFor(S.b); else if (S.ed) S.ed.focus();
    try { history.replaceState(null, '', location.pathname + location.search + '#note'); } catch (e) {}
  }
  function closeDock() {
    if (!S.dock) return;
    S.open = false; S.dock.hidden = true; S.fab.classList.remove('hide');
    if (S.ed) S.ed.flush();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  /** 주보를 그릴 때마다 — 필기 단추를 보이고, 주보 정보(제목 · 본문 · 설교자)를 이 기기에 저장해 둡니다 */
  function update(b) {
    ensureDom();
    S.b = b || null;
    if (!b) { S.fab.hidden = true; if (S.open) closeDock(); return; }
    S.meta = C.metaFromBulletin(b); S.date = b.date;
    var s = ls(); if (s && S.meta) { var o = {}; o[b.date] = S.meta; C.writeMetaCache(s, o); }
    S.fab.hidden = false;
    if (S.open) {
      S.dock.querySelector('#ynDockT').textContent = '✍ ' + fmt(b) + ' 필기';
      if (S.edDate !== b.date) { if (S.ed) S.ed.flush(); mountFor(b); }
    }
    if (!S.opened && root.location.hash === '#note') { S.opened = true; openDock(); }
  }

  root.NotesDock = { update: update, open: openDock, close: closeDock, _state: S };
})(window);
