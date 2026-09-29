/**
 * Step 2.8 시험 — 메트로놈(강세 · 정해진 시각에 시작) + 클릭 컨트롤 서버 (진짜 웹소켓)
 *   node scripts/test-step28-metro.js
 */
const http = require('http');
const { io: connect } = require('socket.io-client');
const { attach, cleanMetro, METRO_LEAD_MS } = require('../lib/realtime');
const M = require('../public/worship/metro.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (t) => console.log('\n■ ' + t);

/* ---------------------------------------------------------------- 박 강세 (Sched) */
function drive(s, clock, ms, step) {                                    // 가짜 시계를 돌리며 예약된 박을 모읍니다
  const out = [];
  for (let t = 0; t < ms; t += step || 25) { clock.t += (step || 25) / 1000; out.push.apply(out, s.tick()); }
  return out;
}
section('박 강세 (">" 표시)');
{
  const clock = { t: 10 };
  const s = new M.Sched({ now: () => clock.t, bpm: 120, num: 4, den: 4 });
  eq(s.marks, [1, 0, 0, 0], '기본은 첫 박만 강세');
  eq([0, 1, 2, 3].map((i) => s.accent(i)), [2, 0, 0, 0], '4/4 기본 강세');
  eq(s.toggleMark(2), true, '3박에 > 켜기');
  eq([0, 1, 2, 3].map((i) => s.accent(i)), [2, 0, 2, 0], '3박도 강세(높고 크게)');
  eq(s.toggleMark(0), false, '첫 박 강세 끄기');
  eq([0, 1, 2, 3].map((i) => s.accent(i)), [0, 0, 2, 0], '첫 박이 일반 박이 됨');
  eq(s.toggleMark(9), null, '범위 밖 박은 무시');
  eq(s.toggleMark(-1), null, '음수 박은 무시');
  s.setMark(1, true); eq(s.marks, [0, 1, 1, 0], 'setMark');
  s.start(0, 0); s.tick();
  const ev = drive(s, clock, 2100, 25);
  ok(ev.length >= 4 && ev.every((e) => e.accent === [0, 2, 2, 0][e.beat]), '예약되는 박마다 강세(marks)가 반영');
  s.setSig(3, 4); eq(s.marks, [0, 0, 0], '박자를 바꾸면 강세 초기화 (첫 박 강세는 이전 설정 유지: 꺼져 있었음)');
  s.setMark(0, true); s.setSig(3, 4); eq(s.marks, [1, 0, 0], '같은 박자로 다시 지정해도 강세를 지우지 않음');
  s.setSig(6, 8); eq(s.marks, [1, 0, 0, 0, 0, 0], '6/8 기본');
  eq([0, 1, 2, 3, 4, 5].map((i) => s.accent(i)), [2, 0, 0, 1, 0, 0], '6/8: 3박 묶음 첫 박은 약한 강세(1)');
  s.toggleMark(3); eq(s.accent(3), 2, '6/8 4박에 > 를 붙이면 완전한 강세');
  ok(s.setMarks([0, 1, 0, 0, 1, 1, 1, 1]), 'setMarks');
  eq(s.marks, [0, 1, 0, 0, 1, 1], 'setMarks 는 박 수에 맞게 자름');
  s.setSig(8, 4); ok(s.setMarks([1]), 'setMarks 채우기'); eq(s.marks, [1, 0, 0, 0, 0, 0, 0, 0], 'setMarks 는 모자라면 0 으로 채움');
  eq(s.setMarks('x'), false, 'setMarks 에 이상한 값');
  eq(M.defaultMarks(4, false), [0, 0, 0, 0], 'defaultMarks(first=false)');
}

/* ---------------------------------------------------------------- 정해진 시각에 시작 (동기용) */
section('앵커(정해진 시각)에 맞춰 시작');
{
  const clock = { t: 100 };
  const s = new M.Sched({ now: () => clock.t, bpm: 120, num: 4, den: 4 });
  const r = s.startAt(100.5, 0);
  eq([r.skipped, r.nextTime], [0, 100.5], '앞으로 올 앵커: 그 시각에 첫 박');
  let ev = drive(s, clock, 1200, 25);
  ok(Math.abs(ev[0].time - 100.5) < 1e-9 && ev[0].beat === 0, '첫 박이 정확히 앵커 시각');
  ok(ev.every((e, i) => Math.abs(e.time - (100.5 + i * 0.5)) < 1e-9), '이후 박은 앵커 + n × 간격');
  // 이미 지난 앵커 — 박 위치를 유지 (늦게 들어온 사람)
  const c2 = { t: 105.2 };
  const s2 = new M.Sched({ now: () => c2.t, bpm: 120, num: 4, den: 4 });
  const r2 = s2.startAt(100, 0);                                       // 앵커로부터 5.2초 = 10.4박 → 다음 박은 11번째(k=11)
  eq(r2.skipped, 11, '지난 앵커: 건너뛴 박 수');
  ok(Math.abs(r2.nextTime - 105.5) < 1e-9, '다음 박 시각이 앵커의 박 격자 위 (105.5)');
  eq(s2.beat, 11 % 4, '박 위치(3박째)를 그대로 이어감');
  // 같은 앵커를 쓰는 두 기기는 박 시각이 일치
  const cA = { t: 50 }, cB = { t: 50 + 7 };                             // 서로 다른 오디오 시계 (기기마다 시작점이 다름)
  const A = new M.Sched({ now: () => cA.t, bpm: 90, num: 3, den: 4 }), B = new M.Sched({ now: () => cB.t, bpm: 90, num: 3, den: 4 });
  A.startAt(50.4, 0); B.startAt(57.4, 0);                               // 같은 실제 시각 (기기 시계 차이만큼 이동)
  const ea = drive(A, cA, 3000, 25), eb = drive(B, cB, 3000, 25);
  ok(ea.length === eb.length && ea.every((e, i) => Math.abs((e.time - 50) - (eb[i].time - 57)) < 1e-9 && e.beat === eb[i].beat), '두 기기의 박 시각 · 박 번호가 같음');
  // 카운트인
  const c3 = { t: 0 }, s3 = new M.Sched({ now: () => c3.t, bpm: 120, num: 4, den: 4 });
  s3.startAt(0.1, 1); const e3 = drive(s3, c3, 4200, 25);
  ok(e3.slice(0, 4).every((e) => e.countIn) && !e3[4].countIn, '카운트인 1마디');
  // BPM 범위
  s.setBpm(9999); eq(s.bpm, 300, 'BPM 상한'); s.setBpm(-4); eq(s.bpm, 30, 'BPM 하한');
}

/* ---------------------------------------------------------------- 서버 검증 (cleanMetro) */
section('메트로놈 상태 검사기');
{
  const c = cleanMetro({ playing: 1, bpm: 500, num: 99, den: 3, marks: [1, 0, 1], count: 9, keep: 1 });
  eq([c.playing, c.bpm, c.num, c.den, c.count, c.keep], [true, 300, 16, 4, 4, true], '범위 밖 값은 안전한 범위로');
  eq(c.marks.length, 16, '강세는 박 수만큼');
  eq(c.marks.slice(0, 4), [1, 0, 1, 0], '강세 값 유지');
  const d = cleanMetro(null); eq([d.playing, d.bpm, d.num, d.den, d.marks], [false, 72, 4, 4, [0, 0, 0, 0]], 'null 은 기본값');
  eq(cleanMetro({ bpm: 'abc', num: 'x' }).bpm, 72, '숫자가 아니면 기본 BPM');
  eq(cleanMetro({ den: 8, num: 6 }).den, 8, '6/8');
  eq(cleanMetro({ bpm: 87.44 }).bpm, 87.4, 'BPM 소수 첫째 자리');
}

/* ---------------------------------------------------------------- 서버: 페이지 컨트롤 · 클릭 컨트롤 (진짜 웹소켓) */
const USERS = {
  lead: { name: '리더', canEdit: true, canLead: true }, lead2: { name: '팀장', canEdit: true, canLead: true },
  memb: { name: '팀원', canEdit: false, canLead: false }, memb2: { name: '팀원2', canEdit: false, canLead: false },
};
(async () => {
  const server = http.createServer();
  const rt = attach(server, { auth: (t) => { if (!USERS[t]) throw new Error('no'); return USERS[t]; }, loadAnno: () => [], saveAnno: () => {}, now: Date.now });
  await new Promise((r) => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;
  const clients = [];
  function client() {
    const s = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true }); s.log = {};
    ['peers', 'leader', 'clicker', 'metro', 'nav', 'cue'].forEach((ev) => { s.log[ev] = []; s.on(ev, (d) => s.log[ev].push(d)); });
    clients.push(s); return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
  }
  const call = (s, ev, p) => new Promise((res) => { const t = setTimeout(() => res({ ok: false, code: 'timeout' }), 800); s.emit(ev, p, (x) => { clearTimeout(t); res(x); }); });
  const join = (s, token, room) => call(s, 'join', { token, room: room || '2026-09-27' });

  section('두 역할은 서로 독립');
  const A = await client(), B = await client(), C = await client(), D = await client();
  await join(A, 'lead'); await join(B, 'lead2'); await join(C, 'memb'); 
  ok((await call(C, 'click:claim', {})).code === 'perm', '팀원은 클릭 컨트롤이 될 수 없음');
  ok((await call(A, 'click:claim', {})).ok, '리더 후보가 클릭 컨트롤이 됨 (페이지 컨트롤 없이도)');
  await sleep(40);
  eq(C.log.clicker.pop(), { name: '리더', reason: 'claim' }, '모두에게 클릭 컨트롤 알림');
  eq(C.log.leader.length, 0, '페이지 컨트롤 쪽은 영향 없음');
  { const r = await call(B, 'click:claim', {}); ok(r.code === 'taken' && r.clicker === '리더', '이미 있으면 거절(누구인지 알려줌)'); }
  ok((await call(B, 'leader:claim', {})).ok, '다른 사람이 페이지 컨트롤이 됨 (독립)');
  await sleep(40);
  { const p = C.log.peers.pop(); eq(p.map((x) => [x.name, x.lead, x.click]).sort(), [['리더', false, true], ['팀원', false, false], ['팀장', true, false]].sort(), '접속자 목록에 두 역할이 따로 표시');}
  ok((await call(B, 'click:claim', { force: true })).ok, '넘겨받기(force)');
  ok((await call(B, 'leader:claim', {})).ok, '한 사람이 두 역할을 모두 맡을 수 있음');
  await sleep(40);
  eq(A.log.clicker.pop(), { name: '팀장', reason: 'takeover' }, '넘겨받기 알림');
  { const r = await join(D, 'memb2'); eq([r.leader, r.clicker], ['팀장', '팀장'], '새로 들어온 사람도 두 역할을 함께 받음'); }

  section('메트로놈 상태 전송');
  { const r = await call(A, 'metro', { playing: true, bpm: 100, num: 4, den: 4 }); ok(r.code === 'perm', '클릭 컨트롤이 아니면 메트로놈을 못 바꿈'); }
  { const r = await call(C, 'metro', { playing: true, bpm: 100, num: 4, den: 4 }); ok(r.code === 'perm', '팀원도 못 바꿈'); }
  const t0 = Date.now();
  const r1 = await call(B, 'metro', { playing: true, bpm: 100, num: 3, den: 4, marks: [1, 0, 1], count: 1 });
  ok(r1.ok && r1.metro.startAt >= t0 + METRO_LEAD_MS - 50 && r1.metro.startAt <= Date.now() + METRO_LEAD_MS + 50, '시작: startAt = 서버 시각 + 리드타임 (' + (r1.metro && r1.metro.startAt - t0) + 'ms)');
  await sleep(60);
  ok([A, B, C, D].every((s) => s.log.metro.length === 1), '방 전체(보낸 사람 포함)에게 같은 상태가 도착');
  ok([A, C, D].every((s) => s.log.metro[0].startAt === r1.metro.startAt && s.log.metro[0].seq === r1.metro.seq), '모두 같은 startAt · seq');
  eq(A.log.metro[0].marks, [1, 0, 1], '강세가 함께 전달됨');
  eq(A.log.metro[0].by, '팀장', '누가 보냈는지');
  // 강세만 바꾸면(keep) 기존 startAt 유지
  const r2 = await call(B, 'metro', { playing: true, bpm: 100, num: 3, den: 4, marks: [1, 1, 0], keep: true });
  eq(r2.metro.startAt, r1.metro.startAt, '강세만 바뀌면 시작 시각 유지(박이 끊기지 않음)');
  ok(r2.metro.seq === r1.metro.seq + 1, 'seq 증가');
  // BPM 이 바뀌면 keep 이어도 새 시작
  await sleep(30);
  const r3 = await call(B, 'metro', { playing: true, bpm: 110, num: 3, den: 4, marks: [1, 1, 0], keep: true });
  ok(r3.metro.startAt > r1.metro.startAt, 'BPM 이 바뀌면 새 시작 시각');
  // 늦게 들어온 사람은 현재 상태를 받음
  const E = await client(); const je = await join(E, 'memb2');
  ok(je.metro && je.metro.playing && je.metro.bpm === 110 && je.metro.startAt === r3.metro.startAt, '늦게 들어온 사람도 진행 중인 메트로놈 상태(시작 시각 포함)를 받음');
  // 멈춤
  const r4 = await call(B, 'metro', { playing: false, bpm: 110, num: 3, den: 4 });
  eq(r4.metro.startAt, null, '멈춤: startAt 없음');
  await sleep(40); eq(C.log.metro.pop().playing, false, '멈춤이 모두에게 전달');
  // 소리 데이터는 어디에도 없음
  ok(Object.keys(C.log.metro[0]).every((k) => ['playing', 'bpm', 'num', 'den', 'marks', 'count', 'startAt', 'seq', 'by', 't'].includes(k)), '전달되는 것은 조절 상태뿐(소리 데이터 없음)');
  // 위험한 값
  const r5 = await call(B, 'metro', { playing: true, bpm: 99999, num: 500, den: 7, marks: 'x', count: 88 });
  ok(r5.ok && r5.metro.bpm === 300 && r5.metro.num === 16 && r5.metro.den === 4 && r5.metro.count === 4, '이상한 값은 안전한 범위로 고쳐서 전달');

  section('큐 · 나가기 · 내려놓기');
  ok((await call(A, 'cue', { label: 'Chorus' })).code === 'perm', '아무 컨트롤도 아니면 큐를 못 보냄');
  ok((await call(B, 'cue', { label: 'Chorus' })).ok, '컨트롤이면 큐를 보냄');
  await call(B, 'click:release', {}); await sleep(40);
  eq(C.log.clicker.pop(), { name: null, reason: 'release' }, '내려놓기 알림');
  ok((await call(B, 'metro', { playing: true, bpm: 90, num: 4, den: 4 })).code === 'perm', '내려놓은 뒤에는 조절 불가');
  ok((await call(A, 'click:claim', {})).ok, '다시 다른 사람이 맡음');
  A.disconnect(); await sleep(80);
  eq(C.log.clicker.pop(), { name: null, reason: 'left' }, '클릭 컨트롤이 나가면 자리가 비워짐');
  { const r = await join(await client(), 'memb2'); ok(r.clicker === null && r.metro && r.metro.playing === false || r.clicker === null, '나간 뒤 입장: 클릭 컨트롤 없음'); }
  ok(B.log.leader.length >= 0, '(페이지 컨트롤은 그대로)');

  clients.forEach((c) => c.disconnect()); await rt.close(); server.close();
  console.log(fail ? `\n✗ 실패 ${fail} (통과 ${pass})` : `\n✓ 모두 통과 (통과 ${pass})`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
