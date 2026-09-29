/**
 * 설교 노트 쓰기 버퍼 (Step 4)
 * ------------------------------------------------------------
 * 왜 필요한가
 *   구글 시트를 부르는 다리(lib/bridge.js)는 동기식이라 시트에 한 번 쓰는 동안 서버 전체가 멈춥니다.
 *   주일 예배 중 여러 명이 동시에 필기하면 (입력을 멈출 때마다 저장) 1초에 여러 번 서버가 멈추게 됩니다.
 *
 * 어떻게
 *   화면의 저장 요청은 먼저 이 메모리 버퍼에 담고 곧바로 "저장됨"을 답합니다 (몇 밀리초).
 *   몇 초에 한 번(기본 4초) 바뀐 노트를 모아 시트에 한꺼번에 씁니다 — 몇 명이 쓰든 시트 쓰기는 한 번입니다.
 *   같은 노트가 여러 번 바뀌어도 마지막 것만 씁니다.
 *
 * 잃어버리지 않게
 *   · 서버가 꺼지기 전(배포 · 재시작, SIGTERM)에 남은 것을 모두 시트에 씁니다 (server.js).
 *   · 시트 쓰기가 실패하면 버퍼에 그대로 남겨 두고 다시 시도합니다 (점점 길게).
 *   · 서버가 갑자기 죽어 몇 초치를 잃더라도, 화면이 받은 "저장됨" 버전을 기억해 두었다가 다음에 노트를 열 때
 *     서버 쪽이 더 오래된 것을 알아채고 화면의 내용으로 다시 저장합니다 (public/notes/notes-core.js reconcile).
 *
 * 이 파일은 시트를 직접 모릅니다 — 쓰는 방법(writer)은 server.js 가 넣어 줍니다.
 */
const state = {
  map: new Map(),       // 'owner\u0001id' → { rec, ver, dirty }
  seq: 0,
  writer: null,
  timer: null,
  failures: 0,
  nextTry: 0,
  log: () => {},
  every: 4000,
  maxBatch: 60,
  maxEntries: 5000,     // 방어용 — 이보다 많이 쌓이면(시트가 오래 안 써질 때) 새 저장을 거절합니다
};

const key = (owner, id) => String(owner) + '\u0001' + String(id);

/** 버퍼에 있는 최신 노트 (없으면 null) — 시트보다 새것입니다 */
function peek(owner, id) {
  const e = state.map.get(key(owner, id));
  return e ? e.rec : null;
}

/** 이 노트 번호를 버퍼에서 가진 사람 (없으면 '') — 남의 번호를 가로채지 못하게 */
function ownerOf(id) {
  for (const e of state.map.values()) if (e.rec.id === id) return e.rec.owner;
  return '';
}

/** 이 사람의 버퍼 안 노트 전부 */
function list(owner) {
  const out = [];
  state.map.forEach((e) => { if (e.rec.owner === owner) out.push(e.rec); });
  return out;
}

/** 저장 요청을 받습니다 — 시트에 쓰는 것은 나중에 */
function put(owner, id, rec) {
  const k = key(owner, id);
  if (!state.map.has(k) && state.map.size >= state.maxEntries) {
    throw new Error('서버가 잠시 바쁩니다. 잠시 후 다시 저장됩니다.');
  }
  state.map.set(k, { rec, ver: ++state.seq, dirty: true });
  return rec;
}

/** 아직 시트에 안 쓴 것들 (스냅샷) */
function pending(max) {
  const out = [];
  for (const [k, e] of state.map) {
    if (!e.dirty) continue;
    out.push({ k, ver: e.ver, rec: e.rec });
    if (out.length >= (max || state.maxBatch)) break;
  }
  return out;
}

/** 시트에 쓴 것을 깨끗하게 — 쓰는 사이 또 바뀐 것(ver 이 다름)은 그대로 둡니다 */
function markClean(items) {
  items.forEach((it) => {
    const e = state.map.get(it.k);
    if (e && e.ver === it.ver) state.map.delete(it.k);     // 시트가 이제 최신 — 메모리에서 뺍니다
  });
}

const size = () => state.map.size;
const dirtyCount = () => { let n = 0; state.map.forEach((e) => { if (e.dirty) n++; }); return n; };

/** 바뀐 것을 시트에 씁니다. 쓴 개수를 돌려줍니다 (실패하면 던지지 않고 -1) */
function flushNow(opts) {
  opts = opts || {};
  if (!state.writer) return 0;
  if (!opts.force && Date.now() < state.nextTry) return 0;
  let total = 0;
  try {
    for (;;) {
      const batch = pending();
      if (!batch.length) break;
      state.writer(batch.map((b) => b.rec));
      markClean(batch);
      total += batch.length;
      if (batch.length < state.maxBatch) break;
    }
    state.failures = 0;
    state.nextTry = 0;
    return total;
  } catch (e) {
    state.failures++;
    const wait = Math.min(60000, 2000 * Math.pow(2, Math.min(state.failures, 5)));
    state.nextTry = Date.now() + wait;
    state.log('[노트 저장 실패 — ' + Math.round(wait / 1000) + '초 뒤 다시]', e && e.message);
    return -1;
  }
}

/** 몇 초에 한 번 바뀐 것을 시트에 씁니다 */
function start(writer, opts) {
  opts = opts || {};
  state.writer = writer;
  if (opts.log) state.log = opts.log;
  if (opts.every) state.every = opts.every;
  if (opts.maxBatch) state.maxBatch = opts.maxBatch;
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => { if (dirtyCount()) flushNow(); }, state.every);
  if (state.timer.unref) state.timer.unref();
}

function stop() { if (state.timer) clearInterval(state.timer); state.timer = null; }

/** 시험용 — 모두 비웁니다 */
function reset() { stop(); state.map.clear(); state.seq = 0; state.writer = null; state.failures = 0; state.nextTry = 0; }

module.exports = { peek, ownerOf, list, put, pending, markClean, flushNow, start, stop, size, dirtyCount, reset };
