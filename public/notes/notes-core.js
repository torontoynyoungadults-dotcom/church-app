/**
 * 설교 노트 — 화면 핵심 로직 (Step 4)
 * ------------------------------------------------------------
 * 화면(DOM)을 전혀 모르는 순수 로직입니다. 브라우저에서는 window.NotesCore, Node 에서는 require() 로 씁니다
 * (그래서 시계·타이머를 바꿔 끼워 시험할 수 있습니다: scripts/test-step4-client.js).
 *
 *   createDebouncer  입력을 멈춘 뒤 1000ms 에 한 번만 저장 요청 (계속 쓰고 있어도 maxWait 마다는 저장)
 *   createSaver      저장을 한 번에 하나씩만, 실패하면 점점 길게 재시도, 충돌은 멈추고 알림
 *   createDraftStore 이 기기(localStorage)에 임시 보관 — 인터넷이 끊기거나 서버가 잠깐 잃어도 글이 남습니다
 *   reconcile        노트를 열 때 "이 기기 임시본" 과 "서버 것" 중 무엇을 쓸지
 *   metaFromBulletin 주보 → 제목 · 본문 · 설교자 (서버 logic/notes.js 의 설교정보_ 와 같은 규칙)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NotesCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITS = { title: 120, ref: 80, preacher: 60, body: 30000, reflection: 12000 };
  var DEBOUNCE_MS = 1000;
  var MAX_WAIT_MS = 12000;

  function timers(o) {
    o = o || {};
    return {
      setT: o.setT || function (f, ms) { return setTimeout(f, ms); },
      clearT: o.clearT || function (t) { clearTimeout(t); },
      now: o.now || function () { return Date.now(); }
    };
  }

  /* ---------------------------------------------------------
     1. 디바운스 — "입력을 멈추고 wait ms 뒤에 한 번"
        maxWait: 멈추지 않고 계속 써도 이 시간마다는 한 번 (오래 쓰다 갑자기 닫혀도 잃는 양을 제한)
     --------------------------------------------------------- */
  function createDebouncer(fn, wait, opts) {
    opts = opts || {};
    var T = timers(opts);
    var maxWait = opts.maxWait || 0;
    var t = null, first = 0;

    function clear() { if (t !== null) { T.clearT(t); t = null; } first = 0; }
    function fire() { clear(); fn(); }

    return {
      call: function () {
        var n = T.now();
        if (!first) first = n;
        if (t !== null) T.clearT(t);
        var left = wait;
        if (maxWait) left = Math.min(wait, Math.max(0, first + maxWait - n));
        t = T.setT(fire, left);
      },
      /** 기다리던 것이 있으면 지금 바로 실행 (true) */
      flush: function () { if (t !== null) { fire(); return true; } return false; },
      cancel: clear,
      pending: function () { return t !== null; }
    };
  }

  /* ---------------------------------------------------------
     2. 글 정리 — 서버(logic/notes.js 노트글다듬기_)와 같은 규칙
        (화면이 "이미 저장한 것과 같은가" 를 서버와 똑같이 판단하려면 필요합니다)
     --------------------------------------------------------- */
  var CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F￾￿]/g;
  function cleanText(v, multiline) {
    v = String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(CTRL, '');
    if (!multiline) v = v.replace(/\s*\n+\s*/g, ' ');
    return v;
  }
  function cleanNote(n) {
    n = n || {};
    return {
      date: String(n.date || ''),
      title: cleanText(n.title, false),
      ref: cleanText(n.ref, false),
      preacher: cleanText(n.preacher, false),
      body: cleanText(n.body, true),
      reflection: cleanText(n.reflection, true)
    };
  }
  function sameContent(a, b) {
    var x = cleanNote(a), y = cleanNote(b);
    return x.date === y.date && x.title === y.title && x.ref === y.ref && x.preacher === y.preacher &&
      x.body === y.body && x.reflection === y.reflection;
  }
  /** 저장할 만한 내용이 있는가 — 날짜 · 주보에서 채운 정보만 있는 빈 노트는 서버에 만들지 않습니다 */
  function hasContent(n) {
    n = n || {};
    return !!(String(n.body || '').trim() || String(n.reflection || '').trim() || String(n.title || '').trim());
  }
  /** 저장 가능 여부 → {ok} 또는 {ok:false, reason:'empty'|'toolong', field} */
  function checkSavable(n, hasSavedBefore) {
    n = n || {};
    if (String(n.body || '').length > LIMITS.body) return { ok: false, reason: 'toolong', field: 'body', max: LIMITS.body };
    if (String(n.reflection || '').length > LIMITS.reflection) return { ok: false, reason: 'toolong', field: 'reflection', max: LIMITS.reflection };
    // 이미 서버에 있는 노트를 모두 비운 경우는 "빈 내용으로 저장" 이 맞습니다 (지운 글이 되살아나지 않게)
    if (!hasSavedBefore && !hasContent(n)) return { ok: false, reason: 'empty' };
    return { ok: true };
  }

  /* ---------------------------------------------------------
     3. 저장기 — 한 번에 하나, 실패하면 재시도, 충돌은 멈춤
        상태: idle · dirty · saving · saved · error(재시도 예약) · offline · fatal(자동 재시도 안 함)
              · conflict · toolong
     --------------------------------------------------------- */
  function createSaver(o) {
    var T = timers(o);
    var st = {
      base: Number(o.base) || 0,   // 서버가 확인해 준 마지막 버전
      rev: 0, savedRev: 0,         // 편집 횟수 / 서버에 실린 편집
      inflight: false, queued: false, fails: 0,
      state: 'idle', retryT: null, halted: false, everSaved: !!(Number(o.base) > 0)
    };
    var waiters = [];

    function setState(s, info) {
      st.state = s;
      if (o.onState) { try { o.onState(s, info || {}); } catch (e) {} }
      if (s === 'saved' || s === 'idle' || s === 'error' || s === 'offline' || s === 'fatal' || s === 'conflict' || s === 'toolong') {
        var w = waiters; waiters = [];
        w.forEach(function (f) { try { f(s); } catch (e) {} });
      }
    }
    function clearRetry() { if (st.retryT !== null) { T.clearT(st.retryT); st.retryT = null; } }

    function go() {
      var snap = o.getSnapshot();
      var chk = (o.checkSavable || checkSavable)(snap, st.everSaved);
      if (!chk.ok) {
        st.savedRev = st.rev;
        if (chk.reason === 'toolong') { setState('toolong', chk); return; }
        setState('idle'); return;
      }
      st.inflight = true;
      var sent = st.rev;
      setState('saving');
      o.send(snap, st.base, function (err, res) {
        st.inflight = false;
        if (err) {
          st.fails++;
          var transient = o.isTransient ? o.isTransient(err) : true;
          if (!transient) { setState('fatal', { message: err && err.message }); return; }
          var wait = Math.min(30000, 2000 * Math.pow(2, Math.min(st.fails - 1, 4)));
          var off = o.isOffline && o.isOffline();
          setState(off ? 'offline' : 'error', { retryIn: wait, message: err && err.message, fails: st.fails });
          clearRetry();
          st.retryT = T.setT(function () { st.retryT = null; api.request(); }, wait);
          return;
        }
        st.fails = 0;
        if (res && res.conflict) {
          st.halted = true; st.queued = false;
          setState('conflict', { res: res });
          if (o.onConflict) o.onConflict(res, snap);
          return;
        }
        st.base = Number(res && res.version) || st.base;
        st.everSaved = true;
        st.savedRev = sent;
        if (o.onAck) { try { o.onAck(res, snap, sent); } catch (e) {} }
        if (st.queued) { st.queued = false; go(); return; }
        setState(st.rev > st.savedRev ? 'dirty' : 'saved', { at: T.now() });
      });
    }

    var api = {
      /** 글이 바뀔 때마다 (저장은 디바운서가 request 를 부를 때) */
      edit: function () {
        st.rev++;
        if (st.halted) return;
        if (!st.inflight && st.state !== 'error' && st.state !== 'offline' && st.state !== 'dirty') setState('dirty');
      },
      /** 저장 요청 — 진행 중이면 끝난 뒤 한 번 더 */
      request: function () {
        if (st.halted) return;
        clearRetry();
        if (st.inflight) { st.queued = true; return; }
        go();
      },
      /** 충돌을 정리한 뒤 이어서 — newBase 는 서버 버전 */
      resume: function (newBase) {
        st.halted = false; st.queued = false; st.fails = 0;
        if (newBase != null) { st.base = Number(newBase) || 0; if (st.base > 0) st.everSaved = true; }
        st.rev++;                       // 다시 저장해야 함
        setState('dirty');
        api.request();
      },
      /** 서버 내용으로 통째로 바꾼 뒤 (저장할 것이 없는 상태로) */
      reset: function (newBase) {
        clearRetry();
        st.halted = false; st.queued = false; st.fails = 0;
        st.base = Number(newBase) || 0; st.everSaved = st.base > 0;
        st.savedRev = st.rev;
        setState(st.base > 0 ? 'saved' : 'idle');
      },
      /** 충돌 상태로 멈춥니다 (노트를 열 때 이미 충돌을 알아챈 경우) */
      halt: function (info) { st.halted = true; st.queued = false; clearRetry(); setState('conflict', info || {}); },
      hasSaved: function () { return st.everSaved; },
      isClean: function () { return !st.inflight && !st.halted && st.rev === st.savedRev; },
      isBusy: function () { return st.inflight; },
      /** 저장이 정리될 때(저장됨 · 실패 · 충돌) 한 번 알려줍니다 */
      whenSettled: function (f) {
        if (api.isClean() && !st.inflight) { f(st.state); return; }
        waiters.push(f);
      },
      base: function () { return st.base; },
      state: function () { return st.state; },
      stats: function () { return { rev: st.rev, savedRev: st.savedRev, fails: st.fails, inflight: st.inflight, halted: st.halted, base: st.base }; },
      destroy: function () { clearRetry(); waiters = []; }
    };
    return api;
  }

  /* ---------------------------------------------------------
     4. 이 기기 임시 보관 (localStorage) — 못 쓰는 환경이면 메모리로
     --------------------------------------------------------- */
  function createDraftStore(storage, opts) {
    opts = opts || {};
    var T = timers(opts);
    var mem = {};
    var PREFIX = 'ynN:';
    var ok = true;
    if (!storage) ok = false;
    else { try { storage.setItem('ynN:_t', '1'); storage.removeItem('ynN:_t'); } catch (e) { ok = false; } }

    function rd(k) {
      try { var s = ok ? storage.getItem(k) : mem[k]; return s ? JSON.parse(s) : null; } catch (e) { return null; }
    }
    function wr(k, v) {
      var s = JSON.stringify(v);
      if (!ok) { mem[k] = s; return true; }
      try { storage.setItem(k, s); return true; } catch (e) {
        // 공간이 모자라면 오래된 임시본부터 비우고 한 번 더
        try { prune(0, true); storage.setItem(k, s); return true; } catch (e2) { mem[k] = s; return false; }
      }
    }
    function keys() {
      var out = [], i, k;
      if (!ok) { for (k in mem) if (k.indexOf(PREFIX) === 0) out.push(k); return out; }
      try { for (i = 0; i < storage.length; i++) { k = storage.key(i); if (k && k.indexOf(PREFIX) === 0 && k !== 'ynN:_t') out.push(k); } } catch (e) {}
      return out;
    }
    /** 서버에 실린(깨끗한) 오래된 임시본을 치웁니다. 아직 못 보낸 것(dirty)은 절대 지우지 않습니다 */
    function prune(maxAgeMs, aggressive) {
      var now = T.now(), age = maxAgeMs == null ? 3 * 86400000 : maxAgeMs;
      keys().forEach(function (k) {
        var d = rd(k);
        if (!d) { try { ok ? storage.removeItem(k) : delete mem[k]; } catch (e) {} return; }
        if (d.dirty) return;
        if (aggressive || now - (d.at || 0) > age) { try { ok ? storage.removeItem(k) : delete mem[k]; } catch (e) {} }
      });
    }
    return {
      persistent: function () { return ok; },
      get: function (id) { return rd(PREFIX + id); },
      /** d = { note, ack, dirty, owner } */
      put: function (id, d) { d = d || {}; d.at = T.now(); d.v = 1; return wr(PREFIX + id, d); },
      remove: function (id) { try { ok ? storage.removeItem(PREFIX + id) : delete mem[PREFIX + id]; } catch (e) {} },
      /** 이 사용자의 아직 못 보낸 임시본 [{id, note, ack, at}] */
      dirtyOf: function (owner) {
        var out = [];
        keys().forEach(function (k) {
          var d = rd(k);
          if (d && d.dirty && d.note && (!d.owner || d.owner === owner)) out.push({ id: k.slice(PREFIX.length), note: d.note, ack: d.ack || 0, at: d.at || 0 });
        });
        return out.sort(function (a, b) { return b.at - a.at; });
      },
      prune: function (age) { prune(age, false); }
    };
  }

  /* ---------------------------------------------------------
     5. 노트를 열 때 — 이 기기 임시본과 서버 것 중 무엇을 쓸지
        local  = { note, ack, dirty } | null   (ack: 서버가 마지막으로 확인해 준 버전)
        server = 서버의 노트(version 포함) | null
        → { action, note, base, push }
          action 'server'   서버 것을 씁니다
                 'local'    이 기기 것을 씁니다 (push=true 면 서버에 다시 실어야 함)
                 'conflict' 둘 다 바뀌었습니다 — 사용자가 고릅니다
                 'none'     아무것도 없음
     --------------------------------------------------------- */
  function reconcile(local, server) {
    if (!local || !local.note) {
      return server ? { action: 'server', note: server, base: server.version, push: false } : { action: 'none' };
    }
    var ack = Number(local.ack) || 0;
    if (!server) {
      // 서버에 없음: 서버가 잃었거나(ack>0) 아직 못 보낸 새 노트
      if (ack > 0 || local.dirty) return { action: 'local', note: local.note, base: ack, push: true };
      return { action: 'none' };
    }
    var same = sameContent(local.note, server);
    if (!local.dirty) {
      if (server.version >= ack) return { action: 'server', note: server, base: server.version, push: false };
      // 서버 버전이 이 기기가 받은 확인보다 낮다 = 서버가 최근 저장을 잃었다
      if (same) return { action: 'server', note: server, base: server.version, push: false };
      return { action: 'local', note: local.note, base: ack, push: true };
    }
    if (same) return { action: 'server', note: server, base: server.version, push: false };
    if (server.version <= ack) return { action: 'local', note: local.note, base: ack, push: true };
    return { action: 'conflict', local: local.note, server: server, base: server.version };
  }

  /* ---------------------------------------------------------
     6. 주보 → 설교 정보 (서버 설교정보_ 와 같은 규칙)
     --------------------------------------------------------- */
  function metaFromBulletin(b) {
    if (!b) return null;
    var o = (b.order || []).filter(function (x) { return x && x.key === 'sermon'; })[0];
    var ls = o ? String(o.value || '').split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x; }) : [];
    var bible = b.bible || {};
    return {
      date: String(b.date || ''),
      title: String(bible.title || '').trim() || ls[0] || '',
      ref: String(bible.ref || '').trim(),
      preacher: ls.slice(1).join(' ').trim(),
      occasion: String(b.occasion || '').trim()
    };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  /** 오늘이 주일이면 오늘, 아니면 바로 지난 주일 (이 기기의 시간대 기준) */
  function currentSunday(now) {
    var d = new Date(now == null ? Date.now() : now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return ymd(d);
  }
  /** 그 주일의 주보 정보 — 같은 날짜가 없으면 그 이전 가장 가까운 것 (서버와 같은 규칙) */
  function pickMeta(metas, sunday) {
    if (!metas) return null;
    if (metas[sunday]) return metas[sunday];
    var best = '';
    Object.keys(metas).forEach(function (d) { if (d <= sunday && d > best) best = d; });
    return best ? metas[best] : null;
  }

  /* 주보 정보 캐시 — 주보 화면을 볼 때, 또는 노트 첫 화면을 열 때 저장해 두고 다음에 바로 씁니다 */
  var META_KEY = 'ynBulMeta';
  function readMetaCache(storage) {
    try {
      var c = JSON.parse(storage.getItem(META_KEY) || 'null');
      if (c && c.metas && typeof c.metas === 'object') return c.metas;
    } catch (e) {}
    return {};
  }
  function writeMetaCache(storage, add) {
    try {
      var metas = readMetaCache(storage);
      Object.keys(add || {}).forEach(function (d) { if (add[d] && add[d].date) metas[add[d].date || d] = add[d]; });
      var ds = Object.keys(metas).sort().reverse().slice(0, 16);
      var out = {};
      ds.forEach(function (d) { out[d] = metas[d]; });
      storage.setItem(META_KEY, JSON.stringify({ at: Date.now(), metas: out }));
    } catch (e) {}
  }

  /* ---------------------------------------------------------
     7. 작은 도구들
     --------------------------------------------------------- */
  function newId() {
    var abc = 'abcdefghijklmnopqrstuvwxyz0123456789', s = 'N', i;
    var c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (c) {
      var a = new Uint8Array(12); c.getRandomValues(a);
      for (i = 0; i < 12; i++) s += abc[a[i] % 36];
    } else {
      for (i = 0; i < 12; i++) s += abc[Math.floor(Math.random() * 36)];
    }
    return s;
  }
  function validId(id) { return /^N[a-z0-9]{8,24}$/.test(String(id || '')); }

  /**
   * Enter 를 눌렀을 때 목록 이어쓰기.
   *   "- 항목" 에서 Enter → 다음 줄에 "- ", 빈 "- " 줄에서 Enter → 목록 끝내기, "1. " 은 번호 이어서.
   * value, pos(커서) → { from, to, insert } (value.slice(from,to) 를 insert 로 바꿈) 또는 null(기본 동작)
   */
  function continueList(value, pos) {
    var start = value.lastIndexOf('\n', pos - 1) + 1;
    var line = value.slice(start, pos);
    var m = /^(\s*)([-*•]|\d{1,3}[.)]|>)\s(.*)$/.exec(line);
    if (!m) return null;
    var indent = m[1], mark = m[2], rest = m[3];
    if (!rest.trim()) return { from: start, to: pos, insert: '' };            // 빈 항목 → 목록 끝
    var next = mark;
    var num = /^(\d{1,3})([.)])$/.exec(mark);
    if (num) next = (Number(num[1]) + 1) + num[2];
    return { from: pos, to: pos, insert: '\n' + indent + next + ' ' };
  }

  /** 선택한 줄들의 접두어를 넣거나 뺍니다 (토글). → { from, to, text } value.slice(from,to) 를 text 로 바꿈 */
  function toggleLinePrefix(value, selStart, selEnd, prefix) {
    var from = value.lastIndexOf('\n', selStart - 1) + 1;
    var endNl = value.indexOf('\n', selEnd > selStart && value.charAt(selEnd - 1) === '\n' ? selEnd - 1 : selEnd);
    var to = endNl === -1 ? value.length : endNl;
    var lines = value.slice(from, to).split('\n');
    var all = lines.every(function (l) { return !l.trim() || l.indexOf(prefix) === 0; }) && lines.some(function (l) { return l.trim(); });
    var n = 0;
    var out = lines.map(function (l) {
      if (!l.trim() && lines.length > 1) return l;
      if (all) return l.indexOf(prefix) === 0 ? l.slice(prefix.length) : l;
      // 다른 종류의 목록/제목 기호가 이미 있으면 바꿉니다
      var stripped = l.replace(/^(#{1,3}\s|[-*•]\s|\d{1,3}[.)]\s|>\s)/, '');
      n++;
      return prefix + stripped;
    });
    return { from: from, to: to, text: out.join('\n') };
  }

  function savedAgo(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 5) return '방금';
    if (s < 60) return s + '초 전';
    var m = Math.round(s / 60);
    if (m < 60) return m + '분 전';
    return Math.round(m / 60) + '시간 전';
  }

  function fmtDate(ymdStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymdStr || '');
    if (!m) return ymdStr || '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return m[1] + '.' + m[2] + '.' + m[3] + ' (' + '일월화수목금토'.charAt(d.getDay()) + ')';
  }

  /** 서버 오류 중 "잠시 후 다시" 로 해결될 것인가 (연결 · 서버 바쁨) — 아니면 자동 재시도하지 않습니다 */
  function isTransientError(err) {
    var m = String((err && err.message) || err || '');
    return /연결|응답하지|잠시 바쁩|Failed to fetch|NetworkError|Load failed|network|timeout|\(5\d\d\)/i.test(m);
  }

  return {
    LIMITS: LIMITS, DEBOUNCE_MS: DEBOUNCE_MS, MAX_WAIT_MS: MAX_WAIT_MS,
    createDebouncer: createDebouncer, createSaver: createSaver, createDraftStore: createDraftStore,
    reconcile: reconcile, sameContent: sameContent, cleanNote: cleanNote, cleanText: cleanText,
    hasContent: hasContent, checkSavable: checkSavable,
    metaFromBulletin: metaFromBulletin, currentSunday: currentSunday, pickMeta: pickMeta,
    readMetaCache: readMetaCache, writeMetaCache: writeMetaCache,
    newId: newId, validId: validId, continueList: continueList, toggleLinePrefix: toggleLinePrefix,
    savedAgo: savedAgo, fmtDate: fmtDate, isTransientError: isTransientError
  };
});
