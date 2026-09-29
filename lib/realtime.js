/**
 * 실시간 서버 (Socket.io) — 찬양방송팀 허브
 * ------------------------------------------------------------
 * 구글 드라이브를 다시 읽어 오는 방식(수 초 지연)이 아니라 웹소켓으로 곧바로 나눕니다.
 *
 *   · 방 (room)      예배 하나 = 방 하나 ("w:2026-09-27" · "w:ev-abc123")  — 같은 날짜 콘티를 여는 사람끼리
 *   · 리더/팔로워    리더가 넘기는 악보 · 쪽 · 곡을 따라가는 사람들. 따라가기는 사람마다 끄고 켤 수 있음 (클라이언트 쪽 선택)
 *   · 필기           팀 필기는 서버 메모리에서 실시간으로 나누고, 멈춘 뒤 몇 초 만에 한 번 묶어서 시트에 저장
 *                    (구글 시트 쓰기 제한 때문에 그리는 동안에는 시트에 쓰지 않습니다)
 *   · 큐(cue)        리더가 누른 토크백 큐를 팀에게 그대로 전달
 *   · 역할 두 가지   "페이지 컨트롤"(leader: 악보 · 쪽 · 큐)과 "클릭 컨트롤"(clicker: 메트로놈 BPM · 박자 · 시작/멈춤)은
 *                    서로 독립입니다 — 한 사람이 둘 다 맡아도 되고 다른 사람이 나눠 맡아도 됩니다.
 *   · 메트로놈       소리는 보내지 않습니다. 클릭 컨트롤이 보낸 "상태"(BPM · 박자 · 강세 · 시작/멈춤)만 방 전체에 나누고,
 *                    시작 시각(startAt)은 서버 시계로 정해 각 기기가 자기 오디오로 같은 박에 맞춰 냅니다.
 *
 * 서버는 시트를 직접 모릅니다 — deps 로 받은 세 함수만 부릅니다 (server.js 가 연결, 시험에서는 가짜로 대체):
 *   auth(token)                       → { name, canEdit, canLead, committee, admin }   (틀리면 Error)
 *   loadAnno(file, scope)             → 필기 목록 (팀 층)
 *   saveAnno(file, scope, items, by)  → 저장
 */
const { Server } = require('socket.io');

const ROOM_RE = /^(\d{4}-\d{2}-\d{2}|ev-[0-9a-z]{6,}(~[0-9a-z]{1,10})?)$/i;
const FILE_RE = /^[A-Za-z0-9_-]{10,}$/;
const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TYPES = ['pen', 'hl', 'text', 'sym', 'fbox'];
const FBOX_TAG_RE = /^[A-Za-z0-9\u3131-\uD7A3]{1,8}$/;      // 송폼 박스 이름표 — Int · V · V1 · P · C · B … (anno.js FBOX_TAGS 와 같은 모양, 직접 적은 이름도 8자까지)
const SYMBOLS = ['sharp', 'flat', 'natural', 'fermata', 'segno', 'coda', 'repeatStart', 'repeatEnd', 'breath', 'cresc', 'decresc',
  'accent', 'staccato', 'tenuto', 'tie', 'arrowDown', 'arrowUp', 'star', 'check', 'circle', 'box',
  'dyn:pp', 'dyn:p', 'dyn:mp', 'dyn:mf', 'dyn:f', 'dyn:ff', 'dyn:dc', 'dyn:ds', 'dyn:tocoda', 'dyn:fine',
  'g:quarter', 'g:eighth', 'g:sharp', 'g:flat'];
const FONT_KEYS = ['sans', 'serif', 'hand', 'pen', 'dodum'];                  // 글자 · 코드 · 글자 모양 기호의 글꼴 (anno.js FONT_KEYS 와 같아야 함)

const LIMITS = {
  maxRooms: 200, maxLayers: 60, maxItems: 4000, maxPoints: 1500, maxText: 200, maxItemBytes: 24000,
  saveDelayMs: 8000, saveGapMs: 2500, retryMs: 30000, burst: 240, perSec: 120, abuseKill: 6,
};

const METRO_LEAD_MS = 450;                                    // 시작 명령 후 이만큼 뒤에 모든 기기가 첫 박을 냅니다 (네트워크 지연 흡수)

const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const r4 = (v) => Math.round(v * 10000) / 10000;

/** 브라우저가 보낸 필기 하나를 검사 · 정리합니다. 이상하면 null (서버가 소유자 · 시각을 직접 채웁니다) */
function cleanItem(raw, user, now) {
  if (!raw || typeof raw !== 'object') return null;
  const t = String(raw.t || '');
  if (TYPES.indexOf(t) === -1) return null;
  const id = String(raw.id || '');
  if (!ID_RE.test(id)) return null;
  const it = { id, t, pg: Math.round(num(raw.pg, 1, 500, 1)), c: COLOR_RE.test(String(raw.c || '')) ? String(raw.c).toLowerCase() : '#ff5a1f',
    by: user.name, ts: now };
  if (t === 'pen' || t === 'hl') {
    if (!Array.isArray(raw.p) || raw.p.length < 2 || raw.p.length > LIMITS.maxPoints * 2) return null;
    const p = [];
    for (let i = 0; i + 1 < raw.p.length; i += 2) p.push(r4(num(raw.p[i], 0, 1, 0)), r4(num(raw.p[i + 1], 0, 1, 0)));
    it.p = p;
    it.w = r4(num(raw.w, 0.0005, 0.06, t === 'hl' ? 0.02 : 0.003));
    if (raw.line) it.line = 1;                                    // 형광펜 직선
  } else if (t === 'fbox') {                                      // 송폼 박스 — 악보 위 투명한 네모 테두리 + 이름표
    const k = String(raw.k || '');
    if (!FBOX_TAG_RE.test(k)) return null;
    it.k = k;
    it.x = r4(num(raw.x, 0, 1, 0)); it.y = r4(num(raw.y, 0, 1, 0));
    it.w = r4(num(raw.w, 0.004, 1, 0.1)); it.h = r4(num(raw.h, 0.004, 1, 0.05));
    if (it.x + it.w > 1) it.w = r4(1 - it.x);
    if (it.y + it.h > 1) it.h = r4(1 - it.y);
    if (it.w < 0.004 || it.h < 0.004) return null;
    it.sz = r4(num(raw.sz, 0.008, 0.06, 0.02));
  } else {
    it.x = r4(num(raw.x, 0, 1, 0)); it.y = r4(num(raw.y, 0, 1, 0));
    it.sz = r4(num(raw.sz, 0.004, 0.25, 0.02));
    if (raw.rot != null) it.rot = Math.round(num(raw.rot, -180, 180, 0));
    if (t === 'text') {
      const s = String(raw.s == null ? '' : raw.s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, LIMITS.maxText);
      if (!s.trim()) return null;
      it.s = s;
      if (raw.chord) it.chord = 1;                                 // 코드 표기 (굵게 · 색 강조)
      if (FONT_KEYS.indexOf(raw.f) > 0) it.f = raw.f;              // 명조 · 손글씨 (고딕은 기본이라 저장하지 않음)
    } else {
      const k = String(raw.k || '');
      if (SYMBOLS.indexOf(k) === -1) return null;
      it.k = k;
      if (raw.w2 != null) it.w2 = r4(num(raw.w2, 0.005, 0.6, 0.05));   // 늘어나는 기호(크레센도 · 붙임줄)의 길이
      if (FONT_KEYS.indexOf(raw.f) > 0 && (k.indexOf('g:') === 0 || k.indexOf('dyn:') === 0)) it.f = raw.f;   // 글자 모양 기호의 글꼴
    }
  }
  if (JSON.stringify(it).length > LIMITS.maxItemBytes) return null;
  return it;
}

/** 클릭 컨트롤이 보낸 메트로놈 상태를 검사 · 정리 (이상한 값은 안전한 범위로) */
function cleanMetro(p) {
  p = p && typeof p === 'object' ? p : {};
  const n = Math.round(num(p.num, 1, 16, 4));
  const marks = [];
  for (let i = 0; i < n; i++) marks.push(Array.isArray(p.marks) && p.marks[i] ? 1 : 0);
  return { playing: !!p.playing, bpm: Math.round(num(p.bpm, 30, 300, 72) * 10) / 10, num: n, den: Number(p.den) === 8 ? 8 : 4, marks,
    count: Math.round(num(p.count, 0, 4, 0)), keep: !!p.keep };
}

function attach(httpServer, deps, opt) {
  opt = opt || {};
  const L = Object.assign({}, LIMITS, opt.limits || {});
  const log = deps.log || (() => {});
  const now = deps.now || (() => Date.now());
  const io = new Server(httpServer, {
    path: opt.path || '/socket.io', maxHttpBufferSize: 200 * 1024, cors: false, serveClient: true,
    pingInterval: 20000, pingTimeout: 25000, connectTimeout: 15000,
  });

  const rooms = new Map();        // roomId → room
  const saveQueue = [];           // [layer]
  let saving = false, lastSaveAt = 0, saveTimer = null;

  function roomOf(id) {
    let r = rooms.get(id);
    if (!r) {
      if (rooms.size >= L.maxRooms) return null;
      r = { id, leader: null, clicker: null, nav: null, metro: null, metroSeq: 0, layers: new Map(), members: new Map() };
      rooms.set(id, r);
    }
    return r;
  }
  const peers = (room) => Array.from(room.members.values()).map((m) => ({ name: m.name, lead: !!(room.leader && room.leader.sid === m.sid), click: !!(room.clicker && room.clicker.sid === m.sid), canLead: !!m.canLead, follow: m.follow || null }));
  const sendPeers = (room) => io.to(room.id).emit('peers', peers(room));

  /* ---------------------------------------------------------- 저장 (묶어서 · 천천히) */
  function layerKey(file, scope) { return file + '|' + scope; }
  function markDirty(room, layer) {
    layer.dirty = true;
    if (layer.timer) return;
    layer.timer = setTimeout(() => { layer.timer = null; enqueue(room, layer); }, L.saveDelayMs);
    if (layer.timer.unref) layer.timer.unref();
  }
  function enqueue(room, layer) {
    if (layer.queued) return;
    layer.queued = true; saveQueue.push({ room, layer }); pump();
  }
  function pump() {
    if (saving || !saveQueue.length || saveTimer) return;
    const wait = Math.max(0, lastSaveAt + L.saveGapMs - now());
    saveTimer = setTimeout(() => { saveTimer = null; runOne(); }, wait);
    if (saveTimer.unref) saveTimer.unref();
  }
  function runOne() {
    const job = saveQueue.shift();
    if (!job) return;
    saving = true;
    const { room, layer } = job;
    layer.queued = false; layer.dirty = false;
    let ok = false, msg = '';
    try {
      deps.saveAnno(layer.file, layer.scope, Array.from(layer.items.values()), 'team');
      ok = true;
    } catch (e) { msg = (e && e.message) || String(e); layer.dirty = true; log('[필기 저장 실패]', layer.file, msg); }
    lastSaveAt = now(); saving = false;
    io.to(room.id).emit('anno:saved', { file: layer.file, scope: layer.scope, ok, at: lastSaveAt, error: ok ? '' : msg });
    if (!ok) { layer.retry = setTimeout(() => { layer.retry = null; if (layer.dirty) enqueue(room, layer); }, L.retryMs); if (layer.retry.unref) layer.retry.unref(); }
    if (!room.members.size && !layer.dirty) dropIfIdle(room);
    pump();
  }
  /** 사람이 모두 나간 방 — 저장할 것이 남았으면 저장하고 정리 */
  function dropIfIdle(room) {
    if (room.members.size) return;
    const pending = Array.from(room.layers.values()).some((l) => l.dirty || l.queued);
    if (!pending) rooms.delete(room.id);
  }
  /** 서버가 꺼지기 전 — 남은 필기를 모두 저장합니다 (동기) */
  function flushAll() {
    let n = 0;
    rooms.forEach((room) => room.layers.forEach((layer) => {
      if (!layer.dirty && !layer.queued) return;
      try { deps.saveAnno(layer.file, layer.scope, Array.from(layer.items.values()), 'team'); layer.dirty = false; n++; } catch (e) { log('[종료 저장 실패]', e && e.message); }
    }));
    return n;
  }

  function getLayer(room, file, scope) {
    const k = layerKey(file, scope);
    let layer = room.layers.get(k);
    if (layer) return layer;
    if (room.layers.size >= L.maxLayers) return null;
    layer = { file, scope, items: new Map(), dirty: false, queued: false, timer: null, retry: null };
    let list = [];
    try { list = deps.loadAnno(file, scope) || []; } catch (e) { throw new Error('저장된 필기를 불러오지 못했습니다: ' + ((e && e.message) || e)); }
    (Array.isArray(list) ? list : []).slice(0, L.maxItems).forEach((it) => {
      const c = cleanItem(it, { name: String((it && it.by) || '') }, Number(it && it.ts) || now());
      if (c) { c.by = String((it && it.by) || ''); c.ts = Number(it && it.ts) || c.ts; layer.items.set(c.id, c); }
    });
    room.layers.set(k, layer);
    return layer;
  }

  /* ---------------------------------------------------------- 접속 */
  io.on('connection', (socket) => {
    let bucket = L.burst, lastFill = now(), strikes = 0, strikeAt = 0;
    const authTimer = setTimeout(() => { if (!socket.data.user) socket.disconnect(true); }, 10000);
    if (authTimer.unref) authTimer.unref();

    /** 너무 자주 보내면 막습니다 — 계속 어기면 연결을 끊습니다 */
    function allow() {
      const t = now();
      bucket = Math.min(L.burst, bucket + (t - lastFill) / 1000 * L.perSec); lastFill = t;
      if (bucket >= 1) { bucket -= 1; return true; }
      if (t - strikeAt > 10000) strikes = 0;
      strikeAt = t;
      if (++strikes >= L.abuseKill) socket.disconnect(true);
      return false;
    }
    /** 이벤트 처리기 — 인증 · 속도 · 오류를 한곳에서 */
    function on(name, needAuth, fn) {
      socket.on(name, (payload, ack) => {
        if (typeof payload === 'function') { ack = payload; payload = {}; }
        const done = typeof ack === 'function' ? ack : () => {};
        try {
          if (!allow()) return done({ ok: false, code: 'rate', error: '너무 빠르게 보내고 있습니다. 잠시 후 다시 해주세요.' });
          const u = socket.data.user, room = socket.data.room ? rooms.get(socket.data.room) : null;
          if (needAuth && (!u || !room)) return done({ ok: false, code: 'auth', error: '먼저 방에 들어와야 합니다.' });
          const out = fn(payload && typeof payload === 'object' ? payload : {}, u, room, done);
          if (out !== undefined) done(out);
        } catch (e) {
          log('[realtime]', name, e && e.message);
          done({ ok: false, code: 'error', error: (e && e.message) || '처리하지 못했습니다.' });
        }
      });
    }

    on('join', false, (p) => {
      const roomKey = String(p.room || '');
      if (!ROOM_RE.test(roomKey)) return { ok: false, code: 'room', error: '예배(날짜)를 확인해주세요.' };
      let user;
      try { user = deps.auth(String(p.token || '')); } catch (e) { return { ok: false, code: 'auth', error: (e && e.message) || '접근할 수 없습니다.' }; }
      if (!user || !user.name) return { ok: false, code: 'auth', error: '접근할 수 없습니다.' };
      if (socket.data.room) leave();
      const room = roomOf('w:' + roomKey);
      if (!room) return { ok: false, code: 'busy', error: '지금은 새 방을 열 수 없습니다. 잠시 후 다시 해주세요.' };
      socket.data.user = user; socket.data.room = room.id;
      room.members.set(socket.id, { sid: socket.id, name: user.name, canLead: !!user.canLead });
      socket.join(room.id);
      sendPeers(room);
      return { ok: true, you: { name: user.name, canEdit: !!user.canEdit, canLead: !!user.canLead, committee: !!user.committee },
        leader: room.leader ? room.leader.name : null, clicker: room.clicker ? room.clicker.name : null, nav: room.nav, metro: room.metro, peers: peers(room), serverTime: now() };
    });

    function leave() {
      const room = socket.data.room ? rooms.get(socket.data.room) : null;
      socket.data.room = null;
      if (!room) return;
      socket.leave(room.id);
      room.members.delete(socket.id);
      if (room.leader && room.leader.sid === socket.id) { room.leader = null; io.to(room.id).emit('leader', { name: null, reason: 'left' }); }
      if (room.clicker && room.clicker.sid === socket.id) { room.clicker = null; io.to(room.id).emit('clicker', { name: null, reason: 'left' }); }
      sendPeers(room);
      // 남은 필기는 저장한 뒤에 방을 정리합니다
      room.layers.forEach((layer) => { if (layer.dirty && !layer.queued) { if (layer.timer) { clearTimeout(layer.timer); layer.timer = null; } enqueue(room, layer); } });
      dropIfIdle(room);
    }
    socket.on('disconnect', () => { clearTimeout(authTimer); leave(); });
    on('leave', true, () => { leave(); return { ok: true }; });
    on('ping', false, () => ({ ok: true, t: now() }));

    /* ---- 리더 · 팔로워 ---- */
    on('leader:claim', true, (p, u, room) => {
      if (!u.canLead) return { ok: false, code: 'perm', error: '팀장 · 인도자만 리더가 될 수 있습니다.' };
      if (room.leader && room.leader.sid !== socket.id && !p.force) return { ok: false, code: 'taken', leader: room.leader.name, error: room.leader.name + ' 님이 리더입니다.' };
      room.leader = { sid: socket.id, name: u.name };
      io.to(room.id).emit('leader', { name: u.name, reason: p.force ? 'takeover' : 'claim' });
      sendPeers(room);
      return { ok: true };
    });
    on('leader:release', true, (p, u, room) => {
      if (room.leader && room.leader.sid === socket.id) { room.leader = null; io.to(room.id).emit('leader', { name: null, reason: 'release' }); sendPeers(room); }
      return { ok: true };
    });
    on('nav', true, (p, u, room) => {
      if (!room.leader || room.leader.sid !== socket.id) return { ok: false, code: 'perm', error: '페이지 컨트롤만 넘길 수 있습니다.' };
      const nav = { file: FILE_RE.test(String(p.file || '')) ? String(p.file) : '', page: Math.round(num(p.page, 1, 500, 1)),
        song: Math.round(num(p.song, -1, 200, -1)), zoom: r4(num(p.zoom, 0.3, 6, 1)), sy: r4(num(p.sy, 0, 1, 0)), t: now() };
      room.nav = nav;
      socket.to(room.id).emit('nav', nav);
      return { ok: true };
    });
    /* 내 따라가기 상태 { page, metro } — 접속자 목록에 표시 (컨트롤이 누가 따로 보는지 알 수 있게). 방 전체에 peers 로 다시 알림 */
    on('prefs', true, (p, u, room) => {
      const m = room.members.get(socket.id); if (!m) return { ok: false, code: 'auth', error: '먼저 방에 들어와야 합니다.' };
      m.follow = { page: p.page !== false, metro: p.metro !== false };
      sendPeers(room);
      return { ok: true };
    });
    on('cue', true, (p, u, room) => {
      const isCtl = (room.leader && room.leader.sid === socket.id) || (room.clicker && room.clicker.sid === socket.id);
      if (!isCtl) return { ok: false, code: 'perm', error: '페이지 컨트롤 · 클릭 컨트롤만 큐를 보낼 수 있습니다.' };
      const cue = { label: String(p.label || '').slice(0, 40), kind: String(p.kind || '').slice(0, 20), by: u.name, t: now() };
      if (!cue.label) return { ok: false, code: 'bad', error: '큐 이름이 비어 있습니다.' };
      socket.to(room.id).emit('cue', cue);
      return { ok: true };
    });

    /* ---- 클릭 컨트롤 (메트로놈) — 페이지 컨트롤(리더)과 독립 ---- */
    on('click:claim', true, (p, u, room) => {
      if (!u.canLead) return { ok: false, code: 'perm', error: '팀장 · 인도자만 클릭 컨트롤을 맡을 수 있습니다.' };
      if (room.clicker && room.clicker.sid !== socket.id && !p.force) return { ok: false, code: 'taken', clicker: room.clicker.name, error: room.clicker.name + ' 님이 클릭 컨트롤입니다.' };
      room.clicker = { sid: socket.id, name: u.name };
      io.to(room.id).emit('clicker', { name: u.name, reason: p.force ? 'takeover' : 'claim' });
      sendPeers(room);
      return { ok: true };
    });
    on('click:release', true, (p, u, room) => {
      if (room.clicker && room.clicker.sid === socket.id) { room.clicker = null; io.to(room.id).emit('clicker', { name: null, reason: 'release' }); sendPeers(room); }
      return { ok: true };
    });
    /**
     * 메트로놈 상태 — 클릭 컨트롤만. 방 전체(보낸 사람 포함)에 같은 상태를 보내 모두가 같은 시각(startAt)에 시작합니다.
     *   · 시작 · BPM · 박자가 바뀌면 startAt = 서버 지금 + METRO_LEAD_MS (모두 첫 박부터 다시 맞춤)
     *   · 강세(marks)만 바뀐 경우(keep)에는 기존 startAt 을 그대로 두어 박이 끊기지 않게 합니다
     *   · 멈춤이면 startAt = null
     */
    on('metro', true, (p, u, room) => {
      if (!room.clicker || room.clicker.sid !== socket.id) return { ok: false, code: 'perm', error: '클릭 컨트롤만 메트로놈을 조절할 수 있습니다.' };
      const c = cleanMetro(p), prev = room.metro;
      const same = prev && prev.playing && prev.startAt && prev.bpm === c.bpm && prev.num === c.num && prev.den === c.den;
      const st = { playing: c.playing, bpm: c.bpm, num: c.num, den: c.den, marks: c.marks, count: c.count,
        startAt: !c.playing ? null : (c.keep && same ? prev.startAt : now() + METRO_LEAD_MS), seq: ++room.metroSeq, by: u.name, t: now() };
      room.metro = st;
      io.to(room.id).emit('metro', st);
      return { ok: true, metro: st };
    });

    /* ---- 필기 ---- */
    const scopeOf = (s) => { s = String(s || 'song'); return s === 'song' || ROOM_RE.test(s) ? s : null; };
    const fileOf = (f) => (FILE_RE.test(String(f || '')) ? String(f) : null);
    function layerFor(p, room) {
      const file = fileOf(p.file), scope = scopeOf(p.scope);
      if (!file || !scope) throw new Error('악보 파일을 확인해주세요.');
      const layer = getLayer(room, file, scope);
      if (!layer) throw new Error('한 번에 열 수 있는 악보 수를 넘었습니다.');
      return layer;
    }
    on('anno:load', true, (p, u, room) => {
      const layer = layerFor(p, room);
      return { ok: true, file: layer.file, scope: layer.scope, items: Array.from(layer.items.values()) };
    });
    on('anno:add', true, (p, u, room) => {
      const layer = layerFor(p, room);
      const it = cleanItem(p.item, u, now());
      if (!it) return { ok: false, code: 'bad', error: '필기 형식이 올바르지 않습니다.' };
      if (!layer.items.has(it.id) && layer.items.size >= L.maxItems) return { ok: false, code: 'full', error: '이 악보에 필기가 너무 많습니다. 일부를 지워주세요.' };
      const old = layer.items.get(it.id);
      if (old && old.by !== u.name && !u.canEdit) return { ok: false, code: 'perm', error: '다른 사람의 필기는 고칠 수 없습니다.' };
      if (old) it.by = old.by;
      layer.items.set(it.id, it);
      markDirty(room, layer);
      socket.to(room.id).emit('anno:add', { file: layer.file, scope: layer.scope, item: it });
      return { ok: true, item: it };
    });
    on('anno:del', true, (p, u, room) => {
      const layer = layerFor(p, room);
      const id = String(p.id || ''), it = layer.items.get(id);
      if (!it) return { ok: true, gone: true };
      if (it.by !== u.name && !u.canEdit) return { ok: false, code: 'perm', error: '다른 사람의 필기는 지울 수 없습니다.' };
      layer.items.delete(id);
      markDirty(room, layer);
      socket.to(room.id).emit('anno:del', { file: layer.file, scope: layer.scope, id, by: u.name });
      return { ok: true };
    });
    on('anno:clear', true, (p, u, room) => {
      const layer = layerFor(p, room);
      const pg = p.pg == null ? null : Math.round(num(p.pg, 1, 500, 1));
      const mineOnly = !u.canEdit || !!p.own;                    // 팀장 · 인도자만 남의 필기까지 지웁니다
      const gone = [];
      layer.items.forEach((it, id) => {
        if (pg != null && it.pg !== pg) return;
        if (mineOnly && it.by !== u.name) return;
        gone.push(id);
      });
      gone.forEach((id) => layer.items.delete(id));
      if (gone.length) { markDirty(room, layer); socket.to(room.id).emit('anno:clear', { file: layer.file, scope: layer.scope, ids: gone, by: u.name }); }
      return { ok: true, n: gone.length, ids: gone };
    });
    /** 그리는 중인 선 — 저장하지 않고 다른 사람 화면에만 보여줍니다 */
    on('anno:live', true, (p, u, room) => {
      const file = fileOf(p.file), id = String(p.id || '');
      if (!file || !ID_RE.test(id) || !Array.isArray(p.p) || p.p.length > 400) return { ok: false, code: 'bad' };
      const pts = [];
      for (let i = 0; i + 1 < p.p.length; i += 2) pts.push(r4(num(p.p[i], 0, 1, 0)), r4(num(p.p[i + 1], 0, 1, 0)));
      socket.to(room.id).volatile.emit('anno:live', { file, id, t: p.t === 'hl' ? 'hl' : 'pen', pg: Math.round(num(p.pg, 1, 500, 1)),
        c: COLOR_RE.test(String(p.c || '')) ? p.c : '#ff5a1f', w: r4(num(p.w, 0.0005, 0.06, 0.003)), p: pts, by: u.name, fresh: p.fresh ? 1 : 0 });
      return { ok: true };
    });
    on('anno:save', true, (p, u, room) => {                     // "지금 저장" 버튼
      const layer = layerFor(p, room);
      if (layer.timer) { clearTimeout(layer.timer); layer.timer = null; }
      if (layer.dirty || p.force) { layer.dirty = true; enqueue(room, layer); }
      return { ok: true, pending: layer.dirty };
    });
  });

  /** 서버 쪽에서 방 사람들에게 알림 (HTTP 로 저장된 설정 · 곡 정보가 바뀌었을 때) — 허용된 이벤트만 */
  const BCAST_OK = { cfg: 1, song: 1, 'songs:changed': 1 };
  function broadcast(roomKey, event, payload) {
    if (!BCAST_OK[event] || !ROOM_RE.test(String(roomKey || ''))) return false;
    io.to('w:' + roomKey).emit(event, payload || {});
    return true;
  }
  return { io, rooms, flushAll, broadcast, cleanItem, limits: L, close: () => { flushAll(); return new Promise((res) => io.close(res)); } };
}

module.exports = { attach, cleanItem, cleanMetro, LIMITS, SYMBOLS, ROOM_RE, METRO_LEAD_MS };
