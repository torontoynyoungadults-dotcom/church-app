/**
 * 오프라인 저장소 (Step 3.2) — 인터넷이 끊겨도 콘티 · 악보 · 내 필기를 보고 쓸 수 있게 합니다.
 *
 *   · IndexedDB('yn-offline') 의 kv 창고
 *       r|…  마지막으로 받은 서버 답 (콘티 허브 · 주간 콘티 · 저장된 필기)
 *       o|…  아직 서버에 못 보낸 "내 필기" 저장 (연결되면 자동으로 보냄 — 같은 악보는 최신 것 하나만)
 *   · Cache Storage('yn-sheets-v1') — 악보 PDF · 사진 (서비스워커가 /sheet/<id> 를 여기서 바로 돌려줌)
 *   · 화면 파일과 페이지는 서비스워커(sw.js)가 보관
 *
 * app.js 의 callServer 가 이 파일을 쓰며, 이 파일이 없거나 IndexedDB 가 막혀도 앱은 예전처럼 동작합니다.
 */
(function () {
  var DB = 'yn-offline', SHEETS = 'yn-sheets-v1', SHEET_MAX = 120, KEEP_MS = 90 * 86400000;
  var dbp = null, listeners = [], pending = 0, flushing = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      try {
        if (!window.indexedDB) return rej(new Error('no-idb'));
        var r = indexedDB.open(DB, 1);
        r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error || new Error('idb')); };
        r.onblocked = function () { rej(new Error('idb-blocked')); };
      } catch (e) { rej(e); }
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction('kv', mode), st = t.objectStore('kv'), out = fn(st);
        t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('idb-tx')); };
      });
    });
  }
  function get(k) { return run('readonly', function (s) { return s.get(k); }); }
  function put(k, v) { return run('readwrite', function (s) { return s.put(v, k); }); }
  function del(k) { return run('readwrite', function (s) { return s.delete(k); }); }
  function list(prefix) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var out = [], t = db.transaction('kv', 'readonly'), c = t.objectStore('kv').openCursor(IDBKeyRange.bound(prefix, prefix + '￿'));
        c.onsuccess = function () { var x = c.result; if (x) { out.push({ key: x.key, value: x.value }); x.continue(); } };
        t.oncomplete = function () { res(out); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('idb-list')); };
      });
    });
  }

  /* ---------- 어떤 호출을 기억하나 ---------- */
  function readKey(name, args) {
    if (name === 'worshipHub' || name === 'getWorshipWeek') return 'r|' + name + '|' + JSON.stringify(args || []);
    if (name === 'worshipAnnoLoad') return 'r|anno|' + (args && args[0]) + '|' + (args && args[1]) + '|' + (args && args[2]);
    return '';
  }
  function saveKey(args) { return 'o|' + (args && args[1]) + '|' + (args && args[2]); }

  function notify() { var s = state(); listeners.slice().forEach(function (f) { try { f(s); } catch (e) {} }); }
  function state() { return { online: typeof navigator === 'undefined' || navigator.onLine !== false, pending: pending }; }
  function recount() { return list('o|').then(function (a) { pending = a.length; notify(); return pending; }, function () { return 0; }); }

  /* ---------- callServer 가 부르는 손잡이 ---------- */
  /** 성공한 읽기 답을 기억 */
  function store(name, args, result) {
    var k = readKey(name, args); if (!k || result == null) return;
    var rec = { at: Date.now(), v: result };
    if (name === 'worshipAnnoLoad' && result && !Array.isArray(result.team)) {          // 내 필기만 받은 답 — 예전에 받은 팀 필기는 남겨 둠
      get(k).then(function (old) { if (old && old.v && Array.isArray(old.v.team)) { rec.v = Object.assign({}, result, { team: old.v.team }); } return put(k, rec); }).catch(function () {});
      return;
    }
    put(k, rec).catch(function () {});
  }
  /** 인터넷이 끊겼을 때 기억해 둔 답 (없으면 null). 아직 못 보낸 내 필기가 있으면 그것으로 덮어 보여 줌 */
  function fallback(name, args) {
    var k = readKey(name, args); if (!k) return Promise.resolve(null);
    return get(k).then(function (rec) {
      if (!rec || rec.v == null) return null;
      var v = rec.v;
      if (name === 'worshipAnnoLoad') {
        return get(saveKey(args)).then(function (o) {
          if (o && o.args && Array.isArray(o.args[3])) v = Object.assign({}, v, { mine: o.args[3] });
          return { result: v, at: rec.at };
        });
      }
      return { result: v, at: rec.at };
    }).catch(function () { return null; });
  }
  /** 내 필기 저장이 인터넷 문제로 실패했을 때 — 기기에 보관하고 "저장됨" 으로 처리 */
  function queueSave(name, args) {
    return put(saveKey(args), { name: name, args: args, at: Date.now(), fails: 0 }).then(function () { return recount(); }).then(function () { return true; }, function () { return false; });
  }
  function clearSave(args) { return del(saveKey(args)).then(recount, function () {}); }

  /** 보관해 둔 저장을 서버로 보냄 (연결되면 자동 · 필기를 불러오기 직전에도) */
  function flush() {
    if (flushing) return flushing;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(0);
    flushing = list('o|').then(function (rows) {
      var sent = 0;
      return rows.reduce(function (p, row) {
        return p.then(function (stop) {
          if (stop) return true;
          var o = row.value || {};
          return fetch('/api/' + encodeURIComponent(o.name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ args: o.args || [] }) })
            .then(function (r) { return r.text(); })
            .then(function (t) {
              var d = null; try { d = JSON.parse(t); } catch (e) {}
              if (!d) return true;                                                       // 서버가 아직 준비 안 됨 — 다음에 다시
              return get(row.key).then(function (cur) {
                if (cur && cur.at !== o.at) return false;                                // 보내는 사이 더 새 필기가 저장됨 — 그것은 다음 차례에
                if (d.ok) { sent++; return del(row.key).then(function () { return false; }); }
                o.fails = (o.fails || 0) + 1;                                            // 서버가 거절 (권한 등) — 5번까지 다시 해 보고 버림
                return (o.fails >= 5 ? del(row.key) : put(row.key, o)).then(function () { return false; });
              });
            }, function () { return true; });                                            // 인터넷 없음 — 멈춤
        });
      }, Promise.resolve(false)).then(function () { return sent; });
    }).then(function (n) { flushing = null; return recount().then(function () { return n; }); }, function () { flushing = null; return 0; });
    return flushing;
  }

  /* ---------- 악보 파일 미리 받아 두기 ---------- */
  function precacheSheets(ids) {
    if (!ids || !ids.length || !window.caches || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(0);
    try { if (navigator.connection && navigator.connection.saveData) return Promise.resolve(0); } catch (e) {}
    var n = 0;
    return caches.open(SHEETS).then(function (c) {
      return ids.reduce(function (p, id) {
        return p.then(function () {
          var url = '/sheet/' + encodeURIComponent(id);
          return c.match(url).then(function (hit) {
            if (hit) return;
            return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (r.ok && r.status === 200) { n++; return c.put(url, r); } }, function () {});
          });
        });
      }, Promise.resolve()).then(function () { return c.keys(); }).then(function (keys) {
        var over = keys.length - SHEET_MAX;                                              // 너무 쌓이면 오래된 것부터 지움
        return over > 0 ? Promise.all(keys.slice(0, over).map(function (k) { return c.delete(k); })) : null;
      });
    }).then(function () { return n; }, function () { return n; });
  }
  /** 오프라인 악보 뷰어에 필요한 PDF 엔진도 한 번 받아 둠 */
  function warmAssets() {
    if (!window.caches || (navigator.onLine === false)) return;
    ['/vendor/pdfjs/pdf.min.js', '/vendor/pdfjs/pdf.worker.min.js'].forEach(function (u) { fetch(u, { credentials: 'same-origin' }).catch(function () {}); });   // 서비스워커가 받으면서 보관
  }

  /* ---------- 오래된 기억 청소 ---------- */
  function prune() {
    open().then(function (db) {
      var t = db.transaction('kv', 'readwrite'), c = t.objectStore('kv').openCursor(IDBKeyRange.bound('r|', 'r|￿'));
      c.onsuccess = function () { var x = c.result; if (x) { if (x.value && x.value.at && Date.now() - x.value.at > KEEP_MS) x.delete(); x.continue(); } };
    }).catch(function () {});
  }

  /* ---------- 처음 한 번: 이 페이지도 보관 (서비스워커가 아직 없던 첫 방문) ---------- */
  function cacheThisPage() {
    try {
      if (!('serviceWorker' in navigator) || !window.caches || navigator.serviceWorker.controller || !window.isSecureContext) return;
      navigator.serviceWorker.ready.then(function () {
        return fetch(location.href, { credentials: 'same-origin' }).then(function (r) { if (r.ok) return caches.open('yn-pages-v1').then(function (c) { return c.put(location.href, r); }); });
      }).catch(function () {});
    } catch (e) {}
  }

  window.addEventListener('online', function () { notify(); flush(); });
  window.addEventListener('offline', notify);
  window.addEventListener('pagehide', function () { /* 남은 저장은 다음 접속 때 자동으로 보냄 */ });
  window.addEventListener('load', function () { setTimeout(function () { recount().then(function (n) { if (n) flush(); }); prune(); cacheThisPage(); }, 1200); });

  window.YNOff = {
    get: get, put: put, del: del, list: list,
    store: store, fallback: fallback, queueSave: queueSave, clearSave: clearSave, flush: flush,
    precacheSheets: precacheSheets, warmAssets: warmAssets,
    state: state, on: function (f) { listeners.push(f); }, recount: recount,
    isNetworkError: function (e) { return (typeof navigator !== 'undefined' && navigator.onLine === false) || !!(e && e.name === 'TypeError'); },
    /** 필기를 불러오기 직전에 밀린 저장이 있으면 먼저 보냄 (서버 것이 내 최신 필기를 덮어쓰지 않게) */
    before: function (name) { return name === 'worshipAnnoLoad' ? flush() : null; }
  };
})();
