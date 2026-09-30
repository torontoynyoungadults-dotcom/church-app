/**
 * Step 3.1 · 3.2 시험 (Node) — 펜 ↔ 지우개 전환 · 오프라인 연결
 *   node scripts/test-step31.js
 * (두 손가락 확대 · 실제 오프라인 화면은 브라우저 시험이 필요합니다)
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); };
const section = (t) => console.log('\n■ ' + t);
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 펜 더블탭 (anno.js) ---------- */
function makeAnno(extra) {
  const A = require('../public/worship/anno.js');
  const L = {};
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const cv = { width: 900, height: 1200, style: {}, addEventListener: (n, f) => { L[n] = f; }, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 1200 }), setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    classList: { add() {}, remove() {}, toggle() {} }, parentNode: null };
  const host = { appendChild() {}, addEventListener() {}, style: {}, getBoundingClientRect: cv.getBoundingClientRect, classList: cv.classList };
  const swaps = [];
  const api = A.create(Object.assign({ host, canvas: cv, me: 'me', canEdit: true, onToolSwap: (to, from, via) => { swaps.push([to, from, via]); api.setTool(to); } }, extra || {}));
  const pe = (x, y, o) => Object.assign({ pointerId: 1, pointerType: 'pen', clientX: x, clientY: y, button: 0, buttons: 1, pressure: 0.5, preventDefault() {}, stopPropagation() {}, cancelable: true, target: cv }, o || {});
  const tap = (x, y, o) => { L.pointerdown(pe(x, y, Object.assign({ type: 'pointerdown' }, o || {}))); L.pointerup(pe(x, y, Object.assign({ buttons: 0, type: 'pointerup' }, o || {}))); };
  return { api, L, pe, tap, swaps, cv };
}
async function testPen() {
  section('펜 ↔ 지우개 전환 (anno.js)');
  let h;
  try { h = makeAnno(); } catch (e) { ok(false, '가짜 캔버스로 필기 도구를 만들지 못함: ' + e.message); return; }
  const { api, L, pe, tap, swaps } = h;
  ok(typeof api.setPenTap === 'function' && typeof api.swapPenEraser === 'function', '새 API 가 있음');
  api.setLayer && api.setLayer('mine'); api.setTool('pen');
  tap(100, 100); await sleep(60); tap(102, 101);
  eq(swaps.length, 1, '같은 자리를 빠르게 두 번 톡 → 전환 1번');
  eq(swaps[0] && swaps[0][0], 'eraser', '펜 → 지우개');
  ok(api.items('mine').length === 0, '첫 번째 톡이 남긴 점은 되돌려 없앰');
  await sleep(500); tap(300, 300); await sleep(60); tap(302, 301);
  eq(swaps.length, 2, '한 번 더 → 전환');
  eq(swaps[1] && swaps[1][0], 'pen', '지우개 → 펜');
  await sleep(500);
  const n0 = swaps.length; tap(100, 100); await sleep(60); tap(400, 400);
  eq(swaps.length, n0, '멀리 떨어진 두 번의 톡은 전환하지 않음');
  await sleep(500); tap(100, 100); await sleep(450); tap(101, 100);
  eq(swaps.length, n0, '간격이 길면 전환하지 않음');
  await sleep(500);
  L.pointerdown(pe(50, 50, { buttons: 2, button: 2, type: 'pointerdown' })); L.pointerup(pe(50, 50, { buttons: 0, type: 'pointerup' }));
  eq(swaps.length, n0 + 1, '펜 옆 버튼 → 전환');
  api.setPenTap(false); await sleep(500); const n1 = swaps.length;
  tap(100, 100); await sleep(60); tap(101, 101);
  eq(swaps.length, n1, '설정에서 끄면 전환하지 않음');
  eq(api.penTap(), false, 'penTap() 이 꺼짐을 알림');
}

/* ---------- 오프라인: callServer ↔ YNOff ---------- */
function loadCallServer(fetchImpl, O, online) {
  const win = { isSecureContext: false, YNOff: O, addEventListener() {}, document: {} };
  const ctx = { window: win, navigator: { onLine: online }, fetch: fetchImpl, console, setTimeout, Uint8Array, JSON, Error, Promise, TypeError, location: { origin: 'http://x' }, document: {}, atob: (s) => Buffer.from(s, 'base64').toString('binary') };
  win.navigator = ctx.navigator; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(src('public/app.js'), ctx);
  return { callServer: win.callServer, win, ctx };
}
const netFail = () => Promise.reject(new TypeError('Failed to fetch'));
const okRes = (result) => Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, result })) });
function fakeO() {
  const mem = {}, queue = {}, o = {
    stored: [], cleared: [],
    before: (n) => (n === 'worshipAnnoLoad' ? (o.flushed = (o.flushed || 0) + 1, Promise.resolve(0)) : null),
    store: (n, a, r) => { mem[n + JSON.stringify(a)] = r; o.stored.push(n); },
    fallback: (n, a) => Promise.resolve(mem[n + JSON.stringify(a)] ? { result: mem[n + JSON.stringify(a)], at: 1 } : null),
    queueSave: (n, a) => { queue[a[1] + '|' + a[2]] = a; return Promise.resolve(true); },
    clearSave: (a) => { o.cleared.push(a[1]); return Promise.resolve(); },
    isNetworkError: (e) => !!(e && e.name === 'TypeError'), mem, queue
  };
  return o;
}
async function testCallServer() {
  section('오프라인 연결 (app.js callServer)');
  const O = fakeO();
  let up = true;
  const f = (url, opt) => { if (!up) return netFail(); const b = JSON.parse(opt.body); if (/Hub/.test(url)) return okRes({ week: { date: '2026-10-04' } }); if (/Save/.test(url)) return okRes({ saved: 1 }); if (/Bad/.test(url)) return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ ok: false, error: '권한이 없습니다.' })) }); return okRes({ mine: [{ id: 'a' }], team: [], args: b.args }); };
  const { callServer } = loadCallServer(f, O, true);
  const call = (n, a) => new Promise((res) => callServer(n, a, (r) => res({ ok: true, r }), (e) => res({ ok: false, e })));
  let r = await call('worshipHub', ['T', '']);
  ok(r.ok && O.stored.includes('worshipHub'), '온라인 성공 → 답을 기기에 보관');
  up = false;
  r = await call('worshipHub', ['T', '']);
  ok(r.ok && r.r.week.date === '2026-10-04', '인터넷이 끊기면 보관한 콘티를 대신 돌려줌');
  r = await call('getWorshipWeek', ['T', '2030-01-06']);
  ok(!r.ok, '보관한 적 없는 것은 오류');
  r = await call('worshipAnnoSaveMine', ['T', 'f1', 'song', [{ id: 'x' }]]);
  ok(r.ok && r.r.offline === true && O.queue['f1|song'], '내 필기 저장은 기기에 보관하고 "저장됨" 처리');
  up = true;
  r = await call('worshipAnnoLoad', ['T', 'f1', 'song', false]);
  ok(O.flushed === 1, '필기를 불러오기 전에 밀린 저장을 먼저 보냄');
  r = await call('worshipAnnoSaveMine', ['T', 'f1', 'song', []]);
  ok(r.ok && O.cleared.includes('f1'), '온라인 저장 성공 → 기기 보관분 정리');
  r = await call('somethingBad', ['T']);
  ok(!r.ok && /권한/.test(r.e.message), '서버가 거절한 오류는 보관본으로 덮지 않고 그대로 오류');
  // 오프라인 저장소가 없어도 예전처럼 동작
  const p = loadCallServer(f, undefined, true);
  r = await new Promise((res) => p.callServer('worshipHub', ['T', ''], (x) => res({ ok: true, x }), (e) => res({ ok: false, e })));
  ok(r.ok, 'YNOff 가 없어도 정상 동작');
  up = false;
  r = await new Promise((res) => p.callServer('worshipHub', ['T', ''], (x) => res({ ok: true, x }), (e) => res({ ok: false, e })));
  ok(!r.ok, 'YNOff 가 없으면 끊겼을 때 예전처럼 오류');
}

/* ---------- 서비스워커 · 페이지 연결 (정적 확인) ---------- */
async function testStatic() {
  section('서비스워커 · 페이지 연결');
  const sw = src('public/sw.js');
  ok(/addEventListener\('push'/.test(sw) && /notificationclick/.test(sw), '푸시 알림 처리는 그대로');
  ok(/\/sheet\//.test(sw) && /yn-sheets-v1/.test(sw), '악보(/sheet/)를 기기에 보관');
  ok(/p\.indexOf\('\/api\/'\) === 0/.test(sw), '/api 호출은 서비스워커가 건드리지 않음');
  ok(/rangeFrom/.test(sw), 'Range 요청 처리');
  new vm.Script(sw); new vm.Script(src('public/offline.js'));
  ok(/offline\.js/.test(src('lib/pages.js')) && src('lib/pages.js').indexOf('/offline.js') < src('lib/pages.js').indexOf('/app.js'), 'offline.js 가 app.js 보다 먼저 실림');
  ok(fs.existsSync(path.join(ROOT, 'public/offline.js')), 'public/offline.js 있음');
  // sw.js 의 rangeFrom 을 뽑아 시험
  const m = /function rangeFrom[\s\S]*?\n}\n/.exec(sw);
  ok(!!m, 'rangeFrom 추출');
  if (m) {
    const c = { Response: class { constructor(b, i) { this.body = b; this.status = (i && i.status) || 200; this.headers = { get: (k) => (i && i.headers || {})[k] || null, h: (i && i.headers) || {} }; } } };
    vm.createContext(c); vm.runInContext(m[0], c);
    const buf = Buffer.from('0123456789'); const hit = { headers: { get: () => 'application/pdf' }, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) };
    let r = await c.rangeFrom(hit, 'bytes=2-4'); eq([r.status, r.headers.h['Content-Range'], Buffer.from(r.body).toString()], [206, 'bytes 2-4/10', '234'], 'Range 2-4');
    r = await c.rangeFrom(hit, 'bytes=7-'); eq([r.status, Buffer.from(r.body).toString()], [206, '789'], 'Range 7-');
    r = await c.rangeFrom(hit, 'bytes=-3'); eq(Buffer.from(r.body).toString(), '789', 'Range 끝에서 3');
    r = await c.rangeFrom(hit, 'bytes=50-60'); eq(r.status, 416, '범위 밖 416');
  }
  const wh = src('views/Worship.html');
  ok(/function offlineInit/.test(wh) && /function offlineWarm/.test(wh) && /offBanner/.test(wh), '워십 화면에 오프라인 표시줄 · 미리 받기');
  ok(/data-o="pentap"/.test(src('public/worship/practice-panels.js')), '필기 탭에 펜 더블탭 설정');
  ok(/scale\(' \+ pvScale/.test(src('public/worship/practice.js')), '핀치 미리보기 변환 (기존 형식 유지)');
}

(async () => {
  await testPen(); await testCallServer(); await testStatic();
  console.log('\n' + (fail ? '✗ 실패 ' + fail + ' (통과 ' + pass + ')' : '✓ 모두 통과 (통과 ' + pass + ')'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
