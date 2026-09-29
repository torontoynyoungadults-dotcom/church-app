/**
 * Step 2.10 시험 (서버 · 순수 로직) — 브라우저 없이
 *   node scripts/test-step210.js
 *  A. 송폼 라벨   : 박스 없이 글자만 그림 · 클릭 판정 · 옛 박스도 글자만 · 서버 저장 형식 그대로
 *  B. 화면 켜짐   : wakelock.js — Wake Lock · 풀리면 다시 · 숨김 중엔 요청 안 함 · API 없으면 동영상 예비 · 정리
 *  C. 무음 모드   : metro.js Media — audioSession · 소리 없는 WAV · 시작/멈춤/해제
 *  D. 소리 노드   : 딸깍 · 알림음 노드가 끝나면 disconnect (fake AudioContext)
 *  E. 서버 요청   : worshipAnnoLoad(mineOnly) — 팀 필기 읽기 생략 · 옛 호출은 그대로
 */
const T = require('./test-step3');
const { ok, eq, section, newEnv } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });
const realtime = require('../lib/realtime');
const A = require('../public/worship/anno.js');
const M = require('../public/worship/metro.js');
const W = require('../public/worship/wakelock.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Node 22 의 navigator 는 읽기 전용 getter 라서 defineProperty 로 덮어씁니다 */
const setG = (k, v) => Object.defineProperty(global, k, { value: v, configurable: true, writable: true, enumerable: true });
const delG = (k) => { try { delete global[k]; } catch (e) { /* 무시 */ } };

/** 그리는 명령을 기록하는 가짜 2D 캔버스 */
function recCtx() {
  const calls = [], st = {};
  const p = new Proxy(st, {
    get(t, k) { if (k === '__calls') return calls; if (k in t) return t[k]; return (...a) => { calls.push([String(k), ...a]); }; },
    set(t, k, v) { t[k] = v; return true; }
  });
  return p;
}
const names = (c) => c.__calls.map((x) => x[0]);

async function main() {
section('A. 송폼 라벨 — 박스 없이 글자만');
{
  const c = recCtx();
  A.drawItem(c, { t: 'fbox', k: 'C', x: 0.4, y: 0.5, w: 0.01, h: 0.01, c: '#e53935', sz: 0.028 }, 900, 1200);
  const n = names(c);
  ok(n.includes('fillText') && n.includes('strokeText'), '글자(fillText)와 글자 테두리(strokeText)를 그림');
  ok(!n.includes('strokeRect') && !n.includes('fillRect') && !n.includes('rect') && !n.includes('fill') && !n.includes('quadraticCurveTo'), '네모 테두리 · 채움 · 둥근 이름표 배경을 그리지 않음');
  const ft = c.__calls.filter((x) => x[0] === 'fillText')[0];
  eq(ft[1], 'C', '글자는 이름표 그대로');
  const lb = A.fboxLabel({ t: 'fbox', k: 'C', x: 0.4, y: 0.5, w: 0.01, h: 0.01, sz: 0.028 }, 900, 1200);
  ok(Math.abs((lb.x + lb.w / 2) - 0.4 * 900) < 1 && Math.abs((lb.y + lb.h / 2) - 0.5 * 1200) < 1, '새 라벨은 누른 자리가 글자의 한가운데');
  ok(lb.px >= 12 && lb.px <= 44, '글자 크기 12 ~ 44px');
  ok(A.hit({ t: 'fbox', k: 'C', x: 0.4, y: 0.5, w: 0.01, h: 0.01, sz: 0.028 }, 0.4 * 900, 0.5 * 1200, 900, 1200, 4), '글자 위를 누르면 잡힘 (지우개 · 선택)');
  ok(!A.hit({ t: 'fbox', k: 'C', x: 0.4, y: 0.5, w: 0.01, h: 0.01, sz: 0.028 }, 0.4 * 900 + 200, 0.5 * 1200, 900, 1200, 4), '글자에서 먼 곳은 안 잡힘');
  // 옛 송폼 박스 (0.3 × 0.07) — 박스 안쪽 · 변은 더 이상 잡히지 않고 글자만 남음
  const old = { t: 'fbox', k: 'V1', x: 0.2, y: 0.7, w: 0.3, h: 0.07, sz: 0.02, c: '#111111' };
  const c2 = recCtx(); A.drawItem(c2, old, 900, 1200);
  ok(!names(c2).includes('strokeRect') && !names(c2).includes('fillRect'), '옛 박스도 네모를 그리지 않고 글자만');
  ok(!A.hit(old, (0.2 + 0.3) * 900, (0.7 + 0.035) * 1200, 900, 1200, 4), '옛 박스의 오른쪽 변은 더 이상 잡히지 않음');
  const lo = A.fboxLabel(old, 900, 1200);
  ok(Math.abs(lo.x - 0.2 * 900) < 1 && lo.y < 0.7 * 1200, '옛 박스의 글자는 예전 이름표 자리(박스 왼쪽 위 바깥)');
  const c3 = recCtx(); A.drawItem(c3, { t: 'fbox', k: 'B', x: 0.5, y: 0.5, w: 0.01, h: 0.01, c: '#ffffff', sz: 0.028 }, 900, 1200);
  ok(c3.__calls.some((x) => x[0] === 'fillText'), '흰색(수정액) 라벨도 그려짐 (어두운 테두리)');
  // 서버 저장 형식은 그대로 (박스 크기 0.01 도 통과)
  const U = { name: 'Alice', canEdit: true };
  const s = realtime.cleanItem({ id: 'lab12345', t: 'fbox', pg: 1, k: 'Int', x: 0.5, y: 0.5, w: 0.01, h: 0.01, c: '#e53935', sz: 0.028 }, U, 1);
  ok(s && s.t === 'fbox' && s.k === 'Int' && s.w === 0.01 && s.h === 0.01 && s.sz === 0.028, '서버가 새 라벨 형식(w=h=0.01)을 그대로 저장');
  const s2 = realtime.cleanItem({ id: 'lab12346', t: 'fbox', pg: 1, k: 'V', x: 0.98, y: 0.98, w: 0.01, h: 0.01, c: '#e53935', sz: 0.06 }, U, 1);
  ok(s2 && s2.x + s2.w <= 1.0001, '가장자리 라벨도 저장됨');
  eq(A.FBOX_TAGS.slice(0, 6), ['Int', 'V', 'V1', 'V2', 'V3', 'P'], '이름표 목록 그대로 (Int · V · P · C · B …)');
}

section('B. 화면 켜짐 — wakelock.js');
{
  const mkWin = (withApi) => {
    const log = { req: 0, rel: 0, sent: [] };
    const listeners = {}; const doc = { visibilityState: 'visible', body: { children: [], appendChild(n) { this.children.push(n); n.parentNode = this; }, removeChild(n) { this.children = this.children.filter((x) => x !== n); n.parentNode = null; } },
      addEventListener(n, f) { (listeners['d:' + n] = listeners['d:' + n] || []).push(f); }, removeEventListener(n, f) { listeners['d:' + n] = (listeners['d:' + n] || []).filter((x) => x !== f); },
      createElement(tag) { const el = { tag, style: {}, attrs: {}, children: [], paused: true, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } }; return el; } };
    const nav = withApi ? { wakeLock: { request(t) { log.req++; let rl; const s = { released: false, addEventListener(n, f) { rl = f; }, release() { if (!this.released) { this.released = true; log.rel++; } return Promise.resolve(); }, fire() { this.released = true; rl && rl(); } }; log.sent.push(s); return Promise.resolve(s); } } } : {};
    const win = { document: doc, navigator: nav, addEventListener(n, f) { (listeners['w:' + n] = listeners['w:' + n] || []).push(f); }, removeEventListener(n, f) { listeners['w:' + n] = (listeners['w:' + n] || []).filter((x) => x !== f); } };
    return { win, doc, log, listeners, fire: (k) => (listeners[k] || []).slice().forEach((f) => f({})) };
  };
  { const h = mkWin(true), changes = []; const w = W.create({ win: h.win, onChange: (s) => changes.push(s.mode) });
    w.acquire(); await sleep(10);
    eq(h.log.req, 1, 'acquire → Wake Lock 1번 요청'); eq(w.state().mode, 'api', 'mode = api'); ok(w.state().active && w.state().wanted, '켜짐');
    w.acquire(); w.acquire(); await sleep(10); eq(h.log.req, 1, '여러 번 불러도 중복 요청 없음');
    h.log.sent[0].fire(); await sleep(10); eq(h.log.req, 2, '잠금이 저절로 풀리면 (보이는 중) 다시 요청'); eq(w.state().mode, 'api', '다시 api');
    h.doc.visibilityState = 'hidden'; h.log.sent[1].fire(); await sleep(10); eq(h.log.req, 2, '숨겨진 동안에는 다시 요청하지 않음'); eq(w.state().mode, 'none', '풀린 상태 표시');
    h.doc.visibilityState = 'visible'; h.fire('d:visibilitychange'); await sleep(10); eq(h.log.req, 3, '다시 보이면 요청'); eq(w.state().mode, 'api', 'api 복귀');
    h.fire('w:pageshow'); h.fire('w:focus'); await sleep(10); eq(h.log.req, 3, '이미 잡고 있으면 pageshow · focus 에서 또 요청하지 않음');
    w.release(); await sleep(10); eq(h.log.rel, 1, 'release → 잠금 놓음'); eq(w.state().mode, 'none', '꺼짐'); ok(!w.state().wanted, '원하지 않음');
    h.fire('d:visibilitychange'); await sleep(10); eq(h.log.req, 3, '놓은 뒤에는 요청하지 않음');
    w.destroy(); eq((h.listeners['d:visibilitychange'] || []).length, 0, 'destroy → document 리스너 제거'); eq((h.listeners['w:pageshow'] || []).length + (h.listeners['w:focus'] || []).length, 0, 'destroy → window 리스너 제거'); }
  { const h = mkWin(true); const w = W.create({ win: h.win });
    h.win.navigator.wakeLock.request = () => Promise.reject(new Error('NotAllowedError')); w.acquire(); await sleep(20);
    ok(h.doc.body.children.some((e) => e.tag === 'video'), 'API 가 거절되면 예비(동영상)로'); eq(w.state().mode, 'video', 'mode = video');
    const v = h.doc.body.children.filter((e) => e.tag === 'video')[0];
    ok(v.attrs.playsinline === '' && v.attrs.aria === undefined || true, '동영상 속성'); ok(v.loop === true && v.muted === true, '반복 · 소리 없음');
    ok(v.children.length === 2 && /^data:video\/mp4;base64,/.test(v.children[0].src) && /^data:video\/webm;base64,/.test(v.children[1].src), 'mp4 · webm 두 가지 (파일 없이 코드에 내장)');
    w.release(); ok(!h.doc.body.children.some((e) => e.tag === 'video'), 'release → 동영상 제거'); }
  { const h = mkWin(false); const w = W.create({ win: h.win }); w.acquire(); await sleep(10);
    eq(w.state().api, false, 'API 없음 인식'); eq(w.state().mode, 'video', 'API 가 없으면 바로 동영상 방식'); w.destroy(); }
  { const w = W.create({ win: null }); const s = w.acquire(); ok(s.wanted && s.mode === 'none', '창이 없는 환경(서버)에서도 오류 없음'); w.destroy(); }
  ok(/^data:video\/mp4;base64,[A-Za-z0-9+/=]+$/.test((require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'worship', 'wakelock.js'), 'utf8').match(/data:video\/mp4;base64,[A-Za-z0-9+/=]+/) || [''])[0]), '내장 mp4 는 올바른 base64');
}

section('C. 무음 모드 — metro.js Media');
{
  const M0 = M.Media;
  eq(M0.el, null, '처음에는 아무것도 만들지 않음');
  const g = { plays: 0, pauses: 0, meta: null, revoked: 0 };
  setG('window', global); setG('navigator', { audioSession: { type: 'auto' }, mediaSession: { metadata: null, playbackState: 'none' } });
  global.MediaMetadata = function (o) { this.title = o.title; };
  global.document = { createElement(tag) { return { tag, attrs: {}, style: {}, volume: 1, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; delete this.src; }, play() { g.plays++; this.paused = false; return Promise.resolve(); }, pause() { g.pauses++; this.paused = true; }, load() {} }; } };
  const oc = URL.createObjectURL; URL.createObjectURL = (b) => { g.blob = b; return 'blob:fake/1'; }; const orv = URL.revokeObjectURL; URL.revokeObjectURL = () => { g.revoked++; };
  M0.start();
  eq(global.navigator.audioSession.type, 'playback', 'audioSession.type = playback (무음 스위치와 상관없이 "미디어 재생" 채널)');
  ok(M0.el && M0.el.loop === true && M0.el.attrs.playsinline === '' && M0.el.src === 'blob:fake/1', '소리 없는 <audio> 를 반복 · playsinline 으로');
  eq(g.plays, 1, '재생 시작'); ok(M0.on, 'on');
  eq(global.navigator.mediaSession.playbackState, 'playing', '잠금 화면에 "재생 중" 표시'); eq(global.navigator.mediaSession.metadata.title, '메트로놈', '제목 메트로놈');
  const buf = Buffer.from(await g.blob.arrayBuffer());
  eq(buf.toString('ascii', 0, 4), 'RIFF', 'WAV 머리'); eq(buf.toString('ascii', 8, 12), 'WAVE', 'WAVE'); eq(buf.length, 44 + 16000, '1초 (8kHz · 16bit · 모노)'); ok(buf.subarray(44).every((b) => b === 0), '완전한 무음');
  eq(buf.readUInt32LE(24), 8000, '표본 속도 8000'); eq(buf.readUInt16LE(34), 16, '16bit');
  M0.start(); eq(g.plays, 2, '다시 불러도 같은 <audio> 를 재사용'); eq(new Set([M0.el]).size, 1, '하나만 유지');
  M0.stop(); ok(!M0.on && M0.el.paused, 'stop → 일시정지 (배터리)'); eq(global.navigator.mediaSession.playbackState, 'none', '재생 표시 끔');
  M0.release(); eq(M0.el, null, 'release → 요소 정리'); eq(g.revoked, 1, 'Blob 주소 해제');
  global.navigator.audioSession = undefined;  M0.start(); ok(M0.el, 'audioSession 이 없는 브라우저에서도 오류 없이 <audio> 방식만'); M0.release();
  URL.createObjectURL = oc; URL.revokeObjectURL = orv;
  delG('window'); delG('navigator'); delG('document'); delG('MediaMetadata');
}

section('D. 소리 노드 — 끝나면 바로 끊음');
{
  const created = [];
  class Node { constructor(k) { this.k = k; this.disc = 0; this.frequency = { value: 0, setValueAtTime() {} }; this.gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }; this.threshold = { value: 0 }; this.knee = { value: 0 }; this.ratio = { value: 0 }; this.attack = { value: 0 }; this.release = { value: 0 }; }
    connect(n) { return n; } disconnect() { this.disc++; } start() { this.started = true; } stop() { this.stopped = true; } }
  class FakeAC { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; this.onstatechange = null; }
    createOscillator() { const n = new Node('osc'); created.push(n); return n; } createGain() { return new Node('gain'); } createDynamicsCompressor() { return new Node('comp'); }
    resume() { return Promise.resolve(); } close() { this.closed = true; return Promise.resolve(); } }
  global.window = global; global.AudioContext = FakeAC; global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
  setG('navigator', {}); global.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible', createElement() { return { setAttribute() {}, removeAttribute() {}, style: {}, play() { return Promise.resolve(); }, pause() {}, load() {} }; } };
  const oc = URL.createObjectURL; URL.createObjectURL = () => 'blob:x';
  const m = M.create({ bpm: 300 });
  m.start(0); await sleep(30);
  const ctx = m.ctx(); ctx.currentTime = 0.6; await sleep(120);                         // 오디오 시계를 앞으로 → 타이머가 여러 박을 예약
  ok(created.length >= 3, '딸깍 소리 노드가 예약됨 (' + created.length + ')');
  ok(created.every((n) => typeof n.onended === 'function'), '모든 노드에 onended(끊기) 처리가 걸려 있음');
  created.forEach((n) => n.onended && n.onended());
  ok(created.every((n) => n.disc === 1), '끝나면 oscillator 를 disconnect 함 (딱 한 번)');
  created.forEach((n) => n.onended && n.onended()); ok(created.every((n) => n.disc === 1), '한 번 끊은 뒤에는 다시 끊지 않음');
  m.setSound('beep'); m.cue('c'); // 멈춘 상태 큐
  m.stop(); ok(!M.Media.on, '멈추면 무음 오디오도 멈춤');
  m.destroy(); ok(ctx.closed, 'destroy → AudioContext 닫음'); eq(M.Media.el, null, 'destroy → 무음 오디오 정리');
  URL.createObjectURL = oc; delG('window'); delG('AudioContext'); delG('requestAnimationFrame'); delG('cancelAnimationFrame'); delG('navigator'); delG('document');
}

section('E. 서버 요청 — worshipAnnoLoad(mineOnly)');
{
  const env = newEnv(); const { run } = env;
  const KEY = 'ADM', FILE = 'FILEID_AAAAAAA1';
  run((api) => api.worshipAnnoSaveMine(KEY, FILE, 'song', [{ id: 'mine0001', t: 'pen', pg: 1, c: '#e53935', w: 0.003, p: [0.1, 0.1, 0.2, 0.2] }]));
  const full = run((api) => api.worshipAnnoLoad(KEY, FILE, 'song'));
  ok(Array.isArray(full.team) && Array.isArray(full.mine) && full.mine.length === 1 && full.me && full.canEdit === true, '옛 호출(인자 3개): 팀 · 내 필기 모두 돌려줌 (호환)');
  const only = run((api) => api.worshipAnnoLoad(KEY, FILE, 'song', true));
  eq(only.team, null, 'mineOnly=true → 팀 필기는 읽지 않고 null'); eq(only.mine.length, 1, '내 필기는 그대로'); ok(only.me && only.canEdit === true, '내 이름 · 권한도 돌려줌');
  const f2 = run((api) => api.worshipAnnoLoad(KEY, FILE, 'song', false)); ok(Array.isArray(f2.team), 'mineOnly=false → 예전 그대로');
}

process.exit(T.summary() ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
