/**
 * Step 3.2 · Feature 1 시험 — 예배 타이머 (순수 계산 + lib/realtime.js 진짜 웹소켓 + HTTP 대체 통로 + 연결 도우미)
 *   node scripts/test-step32.js        (서버는 PORT 4321 — 다른 시험 서버와 겹치지 않게 순서대로 실행)
 * 화면(막대 · 방송 모드) · 진짜 server.js 는 scripts/browser/e2e-step32.js
 */
const http = require('http');
const { io: connect } = require('socket.io-client');
const RT = require('../lib/realtime');
const YT = require('../public/worship/timer.js');
const YNRT = require('../public/worship/rt.js');
const PORT = Number(process.env.PORT) || 4321;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (t) => console.log('\n■ ' + t);
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' → ' + a + ' vs ' + b);

/* ============================================================ 1. 순수 계산 */
function testPure() {
  section('글자 · 시간 계산 (timer.js)');
  eq(YT.fmtElapsed(0), '0:00', '0 → 0:00');
  eq(YT.fmtElapsed(65000), '1:05', '65초 → 1:05');
  eq(YT.fmtElapsed(3599999), '59:59', '59분 59.9초 → 59:59 (올리지 않음)');
  eq(YT.fmtElapsed(3600000), '1:00:00', '1시간 → 1:00:00');
  eq(YT.fmtElapsed(-5000), '0:00', '음수는 0');
  eq(YT.fmtCountdown(61000), { text: '1:01', over: false }, '남은 61초');
  eq(YT.fmtCountdown(500), { text: '0:01', over: false }, '0.5초 남음 → 0:01 (올림)');
  eq(YT.fmtCountdown(0), { text: '0:00', over: false }, '딱 0');
  eq(YT.fmtCountdown(-23500), { text: '+0:23', over: true }, '23.5초 초과 → +0:23');
  eq(YT.fmtCountdown(null), { text: '--:--', over: false }, 'null');
  const t0 = new Date(2026, 8, 27, 11, 5).getTime();
  eq(YT.fmtClock(t0), '오전 11:05', '오전 표기'); eq(YT.fmtClock(new Date(2026, 8, 27, 12, 0).getTime()), '오후 12:00', '낮 12시 = 오후 12:00'); eq(YT.fmtClock(new Date(2026, 8, 27, 0, 9).getTime()), '오전 12:09', '자정 = 오전 12:09');

  section('조작 검사 · 정리 (cleanCmd)');
  const now = 1_800_000_000_000;
  eq(YT.cleanCmd(null, now), null, 'null 거절'); eq(YT.cleanCmd({ action: 'rm -rf' }, now), null, '모르는 동작 거절'); eq(YT.cleanCmd('start', now), null, '문자열 거절');
  eq(YT.cleanCmd({ action: 'segGoto', idx: 5000, label: '  긴  \n 이름 ' + 'ㅋ'.repeat(100) }, now).idx, 99, 'idx 는 99 까지');
  ok(YT.cleanCmd({ action: 'segGoto', idx: -50 }, now).idx === -1, 'idx 는 -1 부터');
  const lab = YT.cleanCmd({ action: 'segGoto', idx: 1, label: '  긴  \n 이름 ' + 'ㅋ'.repeat(100) }, now).label;
  ok(lab.length === 40 && lab.indexOf('\n') < 0 && /^긴 이름/.test(lab), '이름은 다듬고 40자까지: ' + lab);
  eq(YT.cleanCmd({ action: 'segTarget', targetSec: 999999 }, now).targetSec, 7200, '목표 시간 최대 2시간');
  eq(YT.cleanCmd({ action: 'segTarget', targetSec: -3 }, now).targetSec, 0, '음수 목표 = 없음'); eq(YT.cleanCmd({ action: 'segTarget', targetSec: 'abc' }, now).targetSec, 0, '글자 목표 = 없음'); eq(YT.cleanCmd({ action: 'segTarget' }, now).targetSec, 0, '없으면 없음');
  const sm = YT.cleanCmd({ action: 'setSermon', mode: 'x', perSongSec: 1, extraSec: 1e9, at: 1e15, inMin: 99999 }, now);
  eq([sm.mode, sm.perSongSec, sm.extraSec, sm.at, sm.inMin], [undefined, 30, 7200, now + 12 * 3600e3, 720], '설교 설정 값이 안전한 범위로');
  eq(Object.keys(YT.cleanCmd({ action: 'setSermon', perSongSec: 'x', extraSec: null }, now)).sort(), ['action'], '숫자가 아닌 값은 아예 뺌');
  const pl = YT.cleanCmd({ action: 'setPlan', songs: Array.from({ length: 100 }, (_, i) => ({ t: '곡' + i + '\u0000', sec: i === 0 ? 99999 : 'x' })).concat([null, 5, 'A']) }, now).songs;
  eq([pl.length, pl[0].sec, pl[1].sec, pl[0].t], [40, 3600, 0, '곡0'], '곡 목록 40곡까지 · 시간 3600초까지 · 제어문자 제거');
  eq(YT.cleanSongs(['A', { title: 'B', sec: 200 }]), [{ t: 'A', sec: 0 }, { t: 'B', sec: 200 }], '문자열 · title 도 받음');
  eq(YT.cleanCmd({ action: 'restore', state: { total: 1 } }, now), null, '잘못된 복구 거절 (seg 없음)');
  const rs = YT.cleanCmd({ action: 'restore', state: { total: { running: true, startedAt: 1, accMs: -5 }, seg: { idx: 999, running: false, targetMs: 5 }, sermon: { mode: 'manual', atMs: 5 }, plan: { songs: [{ t: 'a' }] } } }, now).state;
  eq([rs.total.running, rs.total.startedAt >= now - 24 * 3600e3, rs.total.accMs, rs.seg.idx, rs.seg.targetMs, rs.sermon.atMs >= now - 3600e3], [true, true, 0, 99, 1000, true], '복구 값도 범위 안으로');

  section('상태 바뀜 (applyCmd)');
  const T0 = now;
  const ap = (s, c, t, by) => YT.applyCmd(s, YT.cleanCmd(c, t), t, by || '인도자');
  let s = YT.newState(T0);
  eq([s.seq, s.total.running, s.seg.idx, s.sermon.mode], [0, false, -1, 'auto'], '처음 상태');
  let r = ap(s, { action: 'start' }, T0 + 1000);
  ok(r.changed && r.state.seq === 1 && r.state.total.running && r.state.total.startedAt === T0 + 1000 && r.state.by === '인도자', '시작');
  ok(s.seq === 0 && !s.total.running, '원래 상태 객체는 바뀌지 않음 (복사본)');
  s = r.state;
  eq(YT.elapsed(s.total, T0 + 61000), 60000, '시작 60초 뒤 = 60000ms');
  r = ap(s, { action: 'start' }, T0 + 2000); ok(!r.changed && r.state === s, '이미 시작한 것을 또 시작해도 바뀌지 않음 (seq 그대로)');
  r = ap(s, { action: 'pause' }, T0 + 31000); s = r.state;
  ok(!s.total.running && s.total.accMs === 30000 && s.seq === 2, '일시정지 → 30초 저장');
  eq(YT.elapsed(s.total, T0 + 999999), 30000, '멈춘 뒤에는 시간이 가지 않음');
  r = ap(s, { action: 'pause' }, T0 + 32000); ok(!r.changed, '멈춘 걸 또 멈춰도 그대로');
  s = ap(s, { action: 'resume' }, T0 + 40000).state;
  eq(YT.elapsed(s.total, T0 + 50000), 40000, '다시 시작 → 30초 + 10초 = 40초');
  s = ap(s, { action: 'reset' }, T0 + 60000).state; eq([s.total.running, s.total.accMs], [false, 0], '처음부터(예배 시계만)');

  // 구간
  s = YT.newState(T0);
  s = ap(s, { action: 'setPlan', songs: [{ t: '주 은혜', sec: 0 }, { t: '내 영혼', sec: 240 }, { t: '결단', sec: 0 }] }, T0).state;
  eq(s.plan.songs.length, 3, '곡 목록 저장');
  s = ap(s, { action: 'segNext' }, T0 + 1000).state;
  ok(s.seg.idx === 0 && s.seg.running && s.seg.startedAt === T0 + 1000 && s.seg.targetMs === null, '다음 곡 → 0번 곡 시작 · 목표 없음');
  eq(YT.view(s, T0 + 11000).seg.label, '주 은혜', '이름은 곡 목록에서');
  s = ap(s, { action: 'segTarget', targetSec: 300 }, T0 + 2000).state; eq(s.seg.targetMs, 300000, '목표 5분');
  let v = YT.view(s, T0 + 101000); eq([v.seg.ms, v.seg.remainingMs, v.seg.over], [100000, 200000, false], '100초 지남 → 200초 남음');
  v = YT.view(s, T0 + 341000); ok(v.seg.over && v.seg.remainingMs === -40000, '340초 → 40초 초과');
  s = ap(s, { action: 'segNext' }, T0 + 400000).state;
  ok(s.seg.idx === 1 && s.seg.accMs === 0 && s.seg.targetMs === 240000, '다음 곡: 구간 0 · 그 곡에 정해 둔 시간(240초)이 목표');
  s = ap(s, { action: 'segNext' }, T0 + 500000).state;
  ok(s.seg.idx === 2 && s.seg.targetMs === 240000, '정해 둔 시간이 없는 곡은 앞의 목표를 이어감');
  s = ap(s, { action: 'segNext' }, T0 + 600000).state;
  ok(s.seg.idx === 3 && !s.seg.running && YT.view(s, T0 + 700000).seg.done && YT.view(s, T0).seg.label === '찬양 종료', '마지막 뒤 → 찬양 종료 (멈춤)');
  r = ap(s, { action: 'segNext' }, T0 + 610000); ok(!r.changed, '더는 넘어가지 않음');
  r = ap(s, { action: 'segStart' }, T0 + 610000); ok(!r.changed, '찬양 종료 뒤 구간 시작은 무시');
  s = ap(s, { action: 'segPrev' }, T0 + 620000).state; eq([s.seg.idx, s.seg.running], [2, true], '이전 곡');
  s = ap(s, { action: 'segPause' }, T0 + 630000).state; ok(!s.seg.running && s.seg.accMs === 10000, '구간 멈춤');
  s = ap(s, { action: 'segStart' }, T0 + 640000).state; ok(s.seg.running, '구간 다시 시작');
  s = ap(s, { action: 'segReset' }, T0 + 650000).state; ok(s.seg.running && YT.elapsed(s.seg, T0 + 651000) === 1000, '구간 0초로 (계속 감)');
  s = ap(s, { action: 'segTarget', targetSec: 0 }, T0 + 651000).state; eq(s.seg.targetMs, null, '목표 없음으로');
  s = ap(s, { action: 'segGoto', idx: 1, label: '특송' }, T0 + 660000).state; eq([s.seg.idx, YT.view(s, T0 + 660000).seg.label], [1, '특송'], '곡 바로 고르기 · 직접 이름');
  s = ap(s, { action: 'setPlan', songs: [{ t: '하나' }] }, T0 + 670000).state; ok(YT.view(s, T0 + 670000).seg.done === true, '목록이 줄어 지금 곡이 목록 밖이면 종료로 봄');
  s = ap(s, { action: 'resetAll' }, T0 + 680000).state; eq([s.seg.idx, s.total.accMs, s.seg.targetMs], [-1, 0, null], '모두 처음으로');
  // 목록이 없을 때
  s = YT.newState(T0); s = ap(s, { action: 'segNext' }, T0).state; s = ap(s, { action: 'segNext' }, T0).state;
  eq([s.seg.idx, YT.view(s, T0).seg.label], [1, '곡 2'], '곡 목록이 없으면 "곡 N" 이름');
  s = ap(s, { action: 'segStart' }, T0 + 1).state; ok(true, 'segStart 는 이미 돌고 있으면 그대로');

  section('설교 시작 예상');
  s = YT.newState(T0); s = ap(s, { action: 'setPlan', songs: [{ t: 'a' }, { t: 'b' }, { t: 'c' }, { t: 'd' }] }, T0).state;
  let e = YT.sermonEstimate(s, T0);
  eq([e.has, e.remainingMs, e.atMs, e.mode], [true, 4 * 300000, T0 + 1200000, 'auto'], '시작 전: 4곡 × 5분 = 20분 뒤');
  s = ap(s, { action: 'segNext' }, T0 + 60000).state;      // 0번 곡 시작
  e = YT.sermonEstimate(s, T0 + 60000 + 100000); eq(e.remainingMs, 200000 + 3 * 300000, '0번 곡 100초 진행: 남은 200초 + 3곡');
  e = YT.sermonEstimate(s, T0 + 60000 + 400000); eq(e.remainingMs, 0 + 3 * 300000, '0번 곡이 예정을 넘기면 그 곡은 0 (뒤 3곡은 그대로)');
  s = ap(s, { action: 'setSermon', perSongSec: 240, extraSec: 120 }, T0 + 60000).state;
  e = YT.sermonEstimate(s, T0 + 60000); eq(e.remainingMs, 240000 + 3 * 240000 + 120000, '곡당 4분 · 추가 2분');
  s = ap(s, { action: 'segTarget', targetSec: 180 }, T0 + 60000).state;
  e = YT.sermonEstimate(s, T0 + 60000); eq(e.remainingMs, 180000 + 3 * 240000 + 120000, '지금 곡 목표(3분)가 있으면 그것으로');
  s = ap(s, { action: 'setPlan', songs: [{ t: 'a', sec: 100 }, { t: 'b', sec: 200 }, { t: 'c' }, { t: 'd' }] }, T0 + 60000).state;
  s = ap(s, { action: 'segTarget', targetSec: 0 }, T0 + 60000).state;
  e = YT.sermonEstimate(s, T0 + 60000); eq(e.remainingMs, 100000 + 200000 + 240000 * 2 + 120000, '곡마다 정한 시간이 있으면 그것');
  for (let i = 0; i < 4; i++) s = ap(s, { action: 'segNext' }, T0 + 100000 + i).state;
  e = YT.sermonEstimate(s, T0 + 200000); eq(e.remainingMs, 120000, '찬양이 다 끝나면 추가 시간만');
  const extraNeg = ap(s, { action: 'setSermon', extraSec: -3600 }, T0).state; eq(YT.sermonEstimate(extraNeg, T0 + 200000).remainingMs, 0, '음수 추가 시간이어도 0 밑으로 안 감');
  // 수동
  let m = ap(s, { action: 'setSermon', inMin: 15 }, T0 + 300000).state;
  eq([m.sermon.mode, m.sermon.atMs], ['manual', T0 + 300000 + 900000], '"15분 뒤" = 수동 시각');
  e = YT.sermonEstimate(m, T0 + 400000); eq([e.mode, e.remainingMs], ['manual', 800000], '수동은 시각 − 지금');
  e = YT.sermonEstimate(m, T0 + 300000 + 905000); ok(e.remainingMs === -5000, '수동: 지나면 음수(초과)');
  m = ap(m, { action: 'setSermon', at: T0 + 2000000 }, T0 + 300000).state; eq(m.sermon.atMs, T0 + 2000000, '시각 직접 지정');
  m = ap(m, { action: 'setSermon', at: T0 + 99e9 }, T0 + 300000).state; eq(m.sermon.atMs, T0 + 300000 + 12 * 3600e3, '너무 먼 시각은 12시간 뒤로');
  m = ap(m, { action: 'setSermon', mode: 'auto' }, T0 + 300000).state; eq([m.sermon.mode, m.sermon.atMs], ['auto', null], '자동으로 돌아옴');
  let mm = ap(YT.newState(T0), { action: 'setPlan', songs: [{ t: 'a' }, { t: 'b' }] }, T0).state;
  mm = ap(mm, { action: 'setSermon', mode: 'manual' }, T0).state; eq(mm.sermon.atMs, T0 + 600000, '시각 없이 수동으로 바꾸면 지금 예상 시각을 붙잡음');
  e = YT.sermonEstimate(YT.newState(T0), T0); eq(e.has, false, '곡 목록이 없으면 자동 예상 없음');
  e = YT.sermonEstimate(YT.newState(T0), T0, [{ t: 'x' }]); eq(e.remainingMs, 300000, '서버 목록이 없으면 화면이 가진 목록으로 (fallback)');

  section('복구 · 받아들이기');
  const fresh = YT.newState(T0), mid = ap(fresh, { action: 'start' }, T0 + 1).state;
  eq(YT.applyCmd(mid, YT.cleanCmd({ action: 'restore', state: mid }, T0), T0, 'x').changed, false, '이미 조작된 서버(seq>0)에는 복구하지 않음');
  const restored = YT.applyCmd(fresh, YT.cleanCmd({ action: 'restore', state: mid }, T0 + 5), T0 + 5, '복구').state;
  ok(restored.seq === 1 && restored.total.running && restored.total.startedAt === mid.total.startedAt, '빈 서버에는 마지막 상태로 복구');
  ok(YT.accept(null, mid) && !YT.accept(mid, mid) && YT.accept(fresh, mid), '처음 받은 것은 받아들임 · 같은 seq 는 안 받음 · 더 새것은 받음');
  ok(!YT.accept(mid, fresh), '더 옛것은 안 받음');
  ok(YT.accept(mid, Object.assign({}, fresh, { sid: 'other' })), '서버가 다시 켜져 sid 가 달라지면 seq 가 작아도 받음');
  ok(!YT.accept(null, { seq: 1 }) && !YT.accept(null, null), '엉터리는 안 받음');
  eq(YT.planHash([{ t: 'a' }, { t: 'b', sec: 3 }]), 'a|0\nb|3', '곡 목록 해시');
}

/* ============================================================ 2. 서버 저장소 (모듈 함수) */
function testStore() {
  section('저장소 · 12시간 정리 (timerApply)');
  RT.timerReset();
  const lead = { name: '인도자', canLead: true }, memb = { name: '팀원', canLead: false };
  const T = 1_800_000_000_000;
  eq(RT.timerApply('2026-09-27', memb, { action: 'start' }, T).code, 'perm', '팀원 조작 거절');
  ok(!RT.timers.has('2026-09-27'), '거절된 조작은 저장하지 않음');
  eq(RT.timerApply('2026-09-27', lead, { action: 'zzz' }, T).code, 'bad', '이상한 동작 거절');
  let r = RT.timerApply('2026-09-27', lead, { action: 'start' }, T);
  ok(r.ok && r.changed && r.state.seq === 1, '팀장 조작 적용');
  const sid = r.state.sid;
  r = RT.timerApply('2026-12-25', lead, { action: 'pause' }, T);
  ok(r.ok && !r.changed && r.state.seq === 0 && r.state.sid === RT.timerGet('2026-12-25', T).sid && !RT.timers.has('2026-12-25'), '바뀐 게 없는 첫 조작은 저장하지 않고 기본 상태(같은 sid)를 돌려줌');
  eq(RT.timerGet('2026-10-04', T).seq, 0, '다른 예배는 빈 상태'); eq(RT.timerGet('2026-10-04', T).sid, RT.timerGet('2026-11-01', T).sid, '빈 상태의 sid 는 서버가 켜져 있는 동안 늘 같음 (화면이 새 상태로 착각하지 않음)'); ok(sid !== RT.timerGet('2026-10-04', T).sid, '조작으로 만들어진 상태는 자기 sid 를 가짐');
  eq(RT.timerGet('2026-10-04', T + 5).sid, RT.timerGet('2026-10-04', T + 9).sid, '기본 상태 sid 가 호출마다 같음');
  r = RT.timerApply('2026-09-27', lead, { action: 'start' }, T + 5); ok(r.ok && !r.changed && r.state.seq === 1, '바뀐 게 없으면 changed=false');
  eq(RT.timerGet('2026-09-27', T + 11 * 3600e3).seq, 1, '11시간 뒤에도 남아 있음');
  eq(RT.timerGet('2026-09-27', T + 13 * 3600e3).seq, 0, '마지막 사용 12시간이 지나면 사라짐 (조회 시)');
  const sid2 = RT.timerApply('2026-09-27', lead, { action: 'start' }, T).state.sid;
  ok(sid2 !== sid, '12시간 뒤 다시 만들어진 상태는 새 sid (오래 열어 둔 화면이 seq 가 작다고 무시하지 않음)');
  RT.timerApply('2026-10-04', lead, { action: 'start' }, T + 10 * 3600e3);
  RT.timerSweep(T + 13 * 3600e3);
  ok(!RT.timers.has('2026-09-27') && RT.timers.has('2026-10-04'), '정리 작업: 오래 안 쓴 것만 지움');
  RT.timerReset();
  for (let i = 0; i < RT.TIMER_MAX + 25; i++) RT.timerApply('ev-abc' + String(100000 + i), lead, { action: 'start' }, T + i);
  ok(RT.timers.size <= RT.TIMER_MAX, '개수 상한: ' + RT.timers.size);
  ok(!RT.timers.has('ev-abc100000') && RT.timers.has('ev-abc' + (100000 + RT.TIMER_MAX + 24)), '넘치면 가장 오래 안 쓴 것부터 지움');
  RT.timerReset();
}

/* ============================================================ 3. 진짜 웹소켓 + HTTP */
async function testRealtime() {
  RT.timerReset();
  const USERS = {
    lead: { name: '리더', canEdit: true, canLead: true, committee: false },
    lead2: { name: '팀장', canEdit: true, canLead: true, committee: true },
    memb: { name: '팀원', canEdit: false, canLead: false, committee: false },
    memb2: { name: '팀원2', canEdit: false, canLead: false, committee: false },
  };
  let authCalls = 0;
  const deps = { auth: (t) => { authCalls++; if (!USERS[t]) throw new Error('포털에서 다시 들어와 주세요.'); return USERS[t]; }, loadAnno: () => [], saveAnno: () => {}, now: Date.now };
  let rt = null;
  const server = http.createServer((req, res) => {            // server.js 의 /api/worshipTimerGet · Cmd 와 같은 연결
    const m = /^\/api\/worshipTimer(Get|Cmd)$/.exec(req.url || '');
    if (req.method !== 'POST' || !m) { res.statusCode = 404; return res.end('nf'); }
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(rt.timerHttp(m[1].toLowerCase(), (JSON.parse(b || '{}')).args))); });
  });
  rt = RT.attach(server, deps, { limits: { burst: 100, perSec: 50 } });
  await new Promise((r) => server.listen(PORT, r));
  const url = 'http://localhost:' + PORT;
  const clients = [];
  function client() {
    const s = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    s.log = { timer: [], peers: [] };
    ['timer', 'peers', 'nav'].forEach((ev) => s.on(ev, (d) => s.log[ev] ? s.log[ev].push(d) : (s.log[ev] = [d])));
    clients.push(s);
    return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
  }
  const call = (s, ev, p) => new Promise((res) => { const t = setTimeout(() => res({ ok: false, code: 'timeout' }), 800); s.emit(ev, p, (x) => { clearTimeout(t); res(x); }); });
  const join = (s, token, room, extra) => call(s, 'join', Object.assign({ token, room: room || '2026-09-27' }, extra || {}));
  const post = (fn, args) => fetch(url + '/api/' + fn, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json());
  const R = '2026-09-27';

  try {
    section('웹소켓 — 입장 · 권한');
    const A = await client(), B = await client(), C = await client(), D = await client();
    eq((await call(A, 'timer:cmd', { action: 'start' })).code, 'auth', '방에 들어오기 전에는 조작 못 함');
    eq((await call(A, 'timer:get', {})).code, 'auth', '들어오기 전에는 조회도 못 함');
    let r = await join(A, 'lead');
    ok(r.ok && r.timer && r.timer.seq === 0 && r.timer.total.running === false && typeof r.timer.sid === 'string', '입장 응답에 타이머(빈 상태)가 들어 있음');
    r = await join(B, 'memb'); ok(r.ok && r.timer && r.timer.seq === 0 && !r.you.canLead, '팀원 입장 응답에도 타이머');
    await join(C, 'memb2', '2026-10-04');
    let x = await call(B, 'timer:cmd', { action: 'start' });
    eq([x.ok, x.code], [false, 'perm'], '팀원의 조작은 거절 (perm)');
    eq((await call(A, 'timer:get', {})).state.seq, 0, '거절된 조작은 상태를 바꾸지 않음');
    await sleep(30); eq(B.log.timer.length, 0, '거절된 조작은 알리지도 않음');

    section('웹소켓 — 조작 · 두 화면이 같은 상태');
    x = await call(A, 'timer:cmd', { action: 'start' });
    ok(x.ok && x.changed && x.state.seq === 1 && x.state.total.running && x.state.by === '리더' && typeof x.serverTime === 'number', '팀장 조작 성공 · 응답에 상태 + 서버 시각');
    await sleep(40);
    eq(B.log.timer.length, 1, '같은 예배의 다른 사람에게 상태가 옴'); eq(B.log.timer[0], x.state, '받은 상태가 응답과 같음');
    eq(A.log.timer.length, 1, '보낸 사람에게도 옴 (seq 로 중복 처리)');
    eq(C.log.timer.length, 0, '다른 예배에는 안 옴');
    x = await call(A, 'timer:cmd', { action: 'setPlan', songs: [{ t: '주 은혜' }, { t: '내 영혼' }, { t: '결단' }] });
    ok(x.ok && x.state.plan.songs.length === 3 && x.state.seq === 2, '곡 목록 저장');
    x = await call(A, 'timer:cmd', { action: 'segNext' }); ok(x.ok && x.state.seg.idx === 0 && x.state.seg.running, '다음 곡');
    await sleep(40);
    const gB = (await call(B, 'timer:get', {})).state, gA = (await call(A, 'timer:get', {})).state;
    eq(gA, gB, '두 화면이 같은 상태'); eq(B.log.timer[B.log.timer.length - 1].seq, 3, '팀원이 마지막 seq 까지 받음');
    const v1 = YT.view(gA, gA.t + 5000), v2 = YT.view(gB, gA.t + 5000);
    eq(v1, v2, '같은 시각에서 계산한 화면 값도 같음');
    x = await call(B, 'timer:cmd', { action: 'segNext' }); eq(x.code, 'perm', '팀원은 다음 곡도 못 넘김');

    section('웹소켓 — 검사 · 범위');
    x = await call(A, 'timer:cmd', { action: 'setSermon', perSongSec: 99999, extraSec: -99999 });
    ok(x.ok && x.state.sermon.perSongSec === 1800 && x.state.sermon.extraSec === -3600, '곡당 시간 · 추가 시간이 범위 안으로');
    x = await call(A, 'timer:cmd', { action: 'segTarget', targetSec: 1e12 }); eq(x.state.seg.targetMs, 7200000, '목표 시간 상한');
    x = await call(A, 'timer:cmd', { action: 'segGoto', idx: 12345 }); ok(x.ok && x.state.seg.idx === 3, 'idx 는 곡 수(3)를 넘지 않음 (3 = 찬양 종료)');
    x = await call(A, 'timer:cmd', { action: 'setPlan', songs: Array.from({ length: 500 }, (_, i) => ({ t: '곡' + i })) }); eq(x.state.plan.songs.length, 40, '곡 목록 40곡까지');
    x = await call(A, 'timer:cmd', { action: 'nope' }); eq(x.code, 'bad', '모르는 동작은 bad');
    x = await call(A, 'timer:cmd', 'oops'); eq(x.code, 'bad', '이상한 값도 bad');
    x = await call(A, 'timer:cmd', { action: 'setSermon', inMin: 'x', at: 'y' }); ok(x.ok && !x.changed, '숫자가 아닌 값은 무시 (바뀐 게 없음)');

    section('웹소켓 — 방이 비어도 상태가 남음 · 늦게 들어온 사람');
    x = await call(A, 'timer:cmd', { action: 'resetAll' });
    x = await call(A, 'timer:cmd', { action: 'start' });
    const seqBefore = x.state.seq, startedAt = x.state.total.startedAt;
    A.disconnect(); B.disconnect();
    await sleep(80);
    ok(!rt.rooms.has('w:' + R), '사람이 모두 나가 방이 사라짐');
    const E = await client(); r = await join(E, 'memb2');
    ok(r.ok && r.timer.seq === seqBefore && r.timer.total.running && r.timer.total.startedAt === startedAt, '방이 사라졌어도 새로 들어온 사람은 같은 타이머를 받음');
    const F = await client(); r = await join(F, 'lead2'); ok(r.ok && r.timer.seq === seqBefore, '두 번째 사람도 동일');

    section('웹소켓 — 가벼운 접속 (light)');
    const peerLogBefore = E.log.peers.length;
    r = await join(D, 'memb', R, { light: true });
    ok(r.ok && r.light && r.timer.seq === seqBefore && !r.leader, 'light 입장 — 타이머만 받음');
    await sleep(40);
    eq(E.log.peers.length, peerLogBefore, 'light 접속은 접속자 목록(peers)에 나타나지 않음');
    eq(Array.from(rt.rooms.get('w:' + R).members.values()).map((m) => m.name).sort(), ['팀원2', '팀장'], '방 멤버는 light 를 세지 않음');
    eq((await call(D, 'nav', { page: 2 })).code, 'auth', 'light 는 화면 넘기기 · 필기 같은 것은 못 함');
    eq((await call(D, 'leader:claim', {})).code, 'auth', 'light 는 리더가 될 수 없음');
    eq((await call(D, 'timer:cmd', { action: 'pause' })).code, 'perm', 'light 팀원도 조작 거절');
    x = await call(F, 'timer:cmd', { action: 'pause' }); ok(x.ok, '다른 팀장이 일시정지');
    await sleep(40);
    ok(D.log.timer.length === 1 && D.log.timer[0].total.running === false, 'light 화면도 타이머를 실시간으로 받음');
    ok(E.log.timer.length >= 1 && E.log.timer[E.log.timer.length - 1].seq === x.state.seq, '정식 접속도 받음');
    const D2 = await client(); r = await join(D2, 'lead', R, { light: true });
    x = await call(D2, 'timer:cmd', { action: 'segNext' }); ok(x.ok && x.state.seg.idx >= 0, 'light 팀장은 조작할 수 있음 (팀장 · 인도자면)');
    await sleep(40); ok(E.log.timer[E.log.timer.length - 1].seq === x.state.seq, 'light 팀장의 조작이 정식 접속자에게 전달');
    r = await call(D2, 'leave', {}); ok(r.ok, 'light 나가기 응답');
    eq((await call(D2, 'timer:cmd', { action: 'start' })).code, 'auth', '나간 뒤에는 조작 못 함');
    D2.disconnect();

    section('웹소켓 — 방 옮기기 · 여러 예배');
    r = await join(E, 'memb2', '2026-10-04'); ok(r.ok && r.timer.seq === 0, '다른 예배로 옮기면 그 예배의 타이머');
    const before = E.log.timer.length;
    await call(F, 'timer:cmd', { action: 'segNext' }); await sleep(40);
    eq(E.log.timer.length, before, '옮긴 뒤에는 이전 예배의 타이머 소식이 오지 않음');
    ok(RT.timerGet('2026-10-04').seq === 0, '두 예배 상태는 서로 독립');

    section('HTTP 대체 통로');
    const authBefore = authCalls;
    let h = await post('worshipTimerGet', ['memb', R, '', -1]);
    ok(h.ok && h.result.state && h.result.state.total.running === false && typeof h.result.serverTime === 'number' && h.result.you.canLead === false, '조회: 상태 + 서버 시각 + 내 권한');
    const cur = h.result.state;
    h = await post('worshipTimerGet', ['memb', R, cur.sid, cur.seq]);
    ok(h.ok && h.result.same === true && !h.result.state, '바뀐 게 없으면 same (상태를 다시 보내지 않음)');
    h = await post('worshipTimerGet', ['memb', R, cur.sid, cur.seq - 1]); ok(h.ok && h.result.state && h.result.state.seq === cur.seq, 'seq 가 다르면 상태를 줌');
    h = await post('worshipTimerGet', ['memb', R, 'other-sid', cur.seq]); ok(h.ok && h.result.state, 'sid 가 다르면 상태를 줌');
    ok(authCalls - authBefore <= 1, '잦은 확인은 로그인 확인을 기억해 씀 (시트를 매번 읽지 않음): ' + (authCalls - authBefore));
    eq((await post('worshipTimerGet', ['nobody', R, '', -1])).code, 'auth', '틀린 토큰은 auth');
    eq((await post('worshipTimerGet', ['memb', '../x', '', -1])).code, 'room', '이상한 방 이름');
    eq((await post('worshipTimerGet', [])).ok, false, '인자 없음');
    h = await post('worshipTimerCmd', ['memb', R, { action: 'start' }]); eq(h.code, 'perm', 'HTTP: 팀원 조작 거절');
    const L = await client(); await join(L, 'memb2', R);
    const seq0 = RT.timerGet(R).seq, running0 = RT.timerGet(R).total.running;
    h = await post('worshipTimerCmd', ['lead', R, { action: running0 ? 'pause' : 'start' }]);
    ok(h.ok && h.result.changed && h.result.state.seq === seq0 + 1 && h.result.you.canLead, 'HTTP: 팀장 조작 적용');
    await sleep(50);
    eq(L.log.timer[L.log.timer.length - 1], h.result.state, 'HTTP 로 한 조작이 소켓 방에도 즉시 전달됨');
    eq((await call(L, 'timer:get', {})).state, h.result.state, '소켓과 HTTP 가 같은 상태');
    h = await post('worshipTimerCmd', ['lead', R, { action: 'bogus' }]); eq(h.code, 'bad', 'HTTP: 이상한 동작');
    h = await post('worshipTimerCmd', ['lead', R, { action: 'segTarget', targetSec: 5e9 }]); eq(h.result.state.seg.targetMs, 7200000, 'HTTP 도 같은 범위 검사');
    let limited = 0; for (let i = 0; i < 90; i++) { const q = await post('worshipTimerGet', ['memb2', R, '', -1]); if (q.code === 'rate') limited++; }
    ok(limited > 0, 'HTTP 과속은 막음 (' + limited + '번 거절)');
    await sleep(1200);
    ok((await post('worshipTimerGet', ['memb2', R, '', -1])).ok, '잠시 뒤에는 다시 됨');

    section('연결 도우미 (createController) — 진짜 서버와');
    await sleep(700);
    RT.timerReset();
    const mk = (token, o) => YT.createController(Object.assign({ token, room: R, io: connect, url, YNRT, fetchFn: fetch, base: url, pollMs: 150 }, o || {}));
    // 1) 웹소켓 정상 — 상태 · 권한
    const cl = mk('lead').start(), cm = mk('memb').start();
    const okWait = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 2500)) { if (fn()) return true; await sleep(30); } return false; };
    ok(await okWait(() => cl.status === 'socket' && cm.status === 'socket' && cl.state && cm.state), '두 화면이 웹소켓으로 연결됨');
    ok(cl.canLead && !cm.canLead, '권한이 화면에 전달됨');
    await cl.send({ action: 'start' });
    ok(await okWait(() => cm.state && cm.state.seq === 1 && cm.state.total.running), '인도자 시작 → 팀원 화면이 곧바로 받음');
    const nowA = cl.view().total.ms, nowB = cm.view().total.ms;
    near(nowA, nowB, 300, '두 화면의 예배 경과 시간이 거의 같음');
    let rej = null; await cm.send({ action: 'pause' }).catch((e) => { rej = e; }); ok(rej && rej.code === 'perm', '팀원 화면의 조작은 거절 (perm)');
    // 2) 곡 목록 자동 맞춤 — 인도자만, 서버가 비어 있을 때 한 번
    let plan = [{ t: 'A' }, { t: 'B' }];
    cl.addPlan(() => ({ room: R, songs: plan })); cm.addPlan(() => ({ room: R, songs: [{ t: '팀원목록' }] }));
    ok(await okWait(() => cl.state.plan.songs.length === 2), '인도자 화면의 곡 목록이 서버에 저장됨');
    await sleep(900);
    eq(cm.state.plan.songs.map((s) => s.t), ['A', 'B'], '팀원 화면은 서버 목록을 씀 (자기 목록으로 덮어쓰지 않음)');
    eq(cm.songs().map((s) => s.t), ['A', 'B'], 'songs() 는 서버 목록');
    plan = [{ t: 'A' }, { t: 'B' }, { t: 'C' }];
    ok(await okWait(() => cl.state.plan.songs.length === 3, 3000), '인도자가 콘티를 고치면 서버 목록도 바뀜');
    // 2b) 지난 주(noPush)를 보는 인도자 화면은 서버에 타이머를 만들지 않음
    const past = YT.createController({ token: 'lead', room: '2026-11-08', io: connect, url, YNRT, fetchFn: fetch, base: url, pollMs: 150 }).start();
    past.addPlan(() => ({ room: '2026-11-08', noPush: true, songs: [{ t: '지난 곡' }] }));
    ok(await okWait(() => past.state && past.canLead), '지난 주 화면 연결'); await sleep(2200);
    eq(RT.timerGet('2026-11-08').seq, 0, '지난 주 화면은 곡 목록을 서버에 보내지 않음 (noPush)');
    eq(past.songs().map((x) => x.t), ['지난 곡'], '하지만 화면의 설교 예상에는 자기 곡 목록을 씀 (fallback)'); past.stop();
    // 3) 웹소켓이 막힌 화면 — HTTP 로 받고 · 보냄
    const blocked = YT.createController({ token: 'memb2', room: R, fetchFn: fetch, base: url, pollMs: 150 }).start();     // io 없음 → 처음부터 대체 통로
    ok(await okWait(() => blocked.state && blocked.status === 'poll'), '웹소켓이 없어도 HTTP 로 상태를 받음 (status = poll)');
    eq(blocked.state.seq, cl.state.seq, '같은 상태');
    await cl.send({ action: 'segNext' });
    ok(await okWait(() => blocked.state.seq === cl.state.seq, 1500), '소켓 화면의 조작이 HTTP 화면에 몇 초 안에 도착');
    near(blocked.view().total.ms, cl.view().total.ms, 400, 'HTTP 화면의 시간도 같음 (서버 시계 보정)');
    const blockedLead = YT.createController({ token: 'lead2', room: R, fetchFn: fetch, base: url, pollMs: 150 }).start();
    ok(await okWait(() => blockedLead.canLead && blockedLead.state), 'HTTP 인도자 화면');
    const rs = await blockedLead.send({ action: 'segNext' });
    ok(rs.ok && rs.state && rs.changed, 'HTTP 로 조작 보내기');
    ok(await okWait(() => cm.state.seq === blockedLead.state.seq && cl.state.seq === blockedLead.state.seq), 'HTTP 조작이 소켓 화면들에 즉시 전달');
    blocked.stop(); blockedLead.stop();
    // 4) 소켓이 끊기면 HTTP 로 넘어가고, 다시 붙으면 HTTP 확인을 멈춤 · 소켓 조작이 실패하면 HTTP 로 보냄
    cl.stop(); cm.stop();
    let polls = 0;
    const counting = (u, o) => { if (/worshipTimerGet/.test(u)) polls++; return fetch(u, o); };
    const fake = { state: 'offline', on() {}, call() { return Promise.reject(new Error('서버 응답이 없습니다')); }, serverNow: Date.now, connect() {}, close() {} };
    const flaky = YT.createController({ token: 'lead', room: R, rt: fake, YNRT, fetchFn: counting, base: url, pollMs: 100 }).start();
    ok(await okWait(() => polls >= 3 && flaky.state && flaky.status === 'poll', 4000), '소켓이 offline 이면 HTTP 로 계속 확인함 (' + polls + '번)');
    const rs2 = await flaky.send({ action: 'segReset' }).catch((e) => e);
    ok(fake.state === 'offline' && rs2.ok, '소켓이 offline 이면 조작도 HTTP 로');
    fake.state = 'online'; const p0 = polls; await sleep(200); const p1 = polls; await sleep(600);
    ok(polls - p1 === 0 && p1 - p0 <= 1, '소켓이 online 이 되면 HTTP 확인을 멈춤 (뒤 0.6초 동안 ' + (polls - p1) + '번)');
    ok(flaky.status === 'socket', '상태 표시: socket');
    const rs3 = await flaky.send({ action: 'segReset' }).catch((e) => e);
    ok(rs3.ok, '소켓 조작이 응답 없이 실패하면(code 없음) HTTP 로 대신 보냄');
    fake.call = () => Promise.reject(Object.assign(new Error('권한'), { code: 'perm' }));
    let e3 = null; await flaky.send({ action: 'start' }).catch((e) => { e3 = e; }); ok(e3 && e3.code === 'perm', '서버가 거절한 것(code 있음)은 HTTP 로 다시 보내지 않고 그대로 오류');
    flaky.stop();
    const denied = YT.createController({ token: 'nobody', room: R, fetchFn: counting, base: url, pollMs: 100 }).start();
    ok(await okWait(() => denied.status === 'denied'), '권한 없는 토큰은 denied 로 표시하고');
    const d0 = polls; await sleep(500); eq(polls, d0, 'denied 이면 더는 묻지 않음'); denied.stop();

    section('연결 도우미 — 서버가 다시 켜진 뒤 복구');
    RT.timerReset();
    const lead1 = mk('lead').start(); ok(await okWait(() => lead1.state && lead1.canLead), '인도자 연결');
    await lead1.send({ action: 'setPlan', songs: [{ t: 'A' }] }); await lead1.send({ action: 'start' }); await lead1.send({ action: 'segNext' });
    const before1 = lead1.state; ok(before1.total.running && before1.seg.idx === 0, '진행 중');
    // 서버 저장소가 사라진 것처럼 (재시작) — sid 도 새로
    RT.timerReset();
    const srvState = RT.timerGet(R); eq(srvState.seq, 0, '재시작 뒤 서버는 빈 상태');
    // 화면이 다시 확인하면 (HTTP) 빈 상태를 받고 → 기억하던 상태로 되살림
    await lead1.poll();
    ok(await okWait(() => RT.timerGet(R).seq >= 1 && RT.timerGet(R).total.running, 2000), '인도자 화면이 마지막 상태를 서버에 되살림 (재시작 복구)');
    eq([RT.timerGet(R).seg.idx, RT.timerGet(R).plan.songs.length], [0, 1], '구간 · 곡 목록도 되살아남');
    lead1.stop();
  } finally {
    clients.forEach((s) => { try { s.disconnect(); } catch (e) {} });
    await rt.close(); await new Promise((r) => server.close(() => r()));
    RT.timerReset();
  }
}

/* ============================================================ 4. rt.js 클라이언트 (가짜 소켓) */
function testRtJs() {
  section('rt.js — timer 이벤트 · light 옵션');
  ok(YNRT.FWD.indexOf('timer') >= 0, "FWD 목록에 'timer'");
  const handlers = {}, emitted = [];
  const sock = { on: (n, f) => { handlers[n] = f; }, emit: (n, p, ack) => { emitted.push({ n, p }); if (n === 'join' && ack) ack({ ok: true, you: { name: 'x', canLead: true }, timer: { sid: 'a', seq: 3 }, serverTime: Date.now() + 5000 }); }, disconnect() {}, connected: true, volatile: { emit() {} } };
  const rt = YNRT.create({ token: 't', room: '2026-09-27', io: () => sock, light: true });
  const seen = []; rt.on('timer', (t) => seen.push(t.seq));
  rt.connect(); handlers.connect();
  eq(emitted[0], { n: 'join', p: { token: 't', room: '2026-09-27', light: true } }, 'light 옵션이 입장 요청에 실림');
  eq([rt.timer && rt.timer.seq, seen], [3, [3]], '입장 응답의 타이머가 S.timer 로 · timer 이벤트로 한 번 전달');
  handlers.timer({ sid: 'a', seq: 2 }); eq(rt.timer.seq, 3, '더 옛 seq 는 무시');
  handlers.timer({ sid: 'a', seq: 4 }); eq([rt.timer.seq, seen], [4, [3, 4]], '더 새 seq 는 받음');
  handlers.timer({ sid: 'b', seq: 1 }); eq(rt.timer.sid, 'b', 'sid 가 달라지면(서버 재시작) 받음');
  ok(typeof rt.sendTimer === 'function', 'sendTimer 있음');
  const rt2 = YNRT.create({ token: 't', room: '2026-09-27', io: () => sock }); const e0 = emitted.length; rt2.connect(); handlers.connect();
  eq(emitted[e0].p, { token: 't', room: '2026-09-27' }, 'light 가 아니면 예전 입장 요청 그대로');
}

(async () => {
  testPure(); testStore(); testRtJs();
  await testRealtime();
  console.log(`\n통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('시험 중단:', e); process.exit(1); });
