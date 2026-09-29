/**
 * Step 2 서버 시험 — lib/realtime.js (Socket.io) 를 진짜 웹소켓으로 돌려 봅니다 (시트는 가짜).
 *   node scripts/test-step2-server.js
 */
const http = require('http');
const { io: connect } = require('socket.io-client');
const { attach, cleanItem } = require('../lib/realtime');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : ' → 실제 ' + A + ' / 기대 ' + B)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (t) => console.log('\n■ ' + t);

const USERS = {
  lead: { name: '리더', canEdit: true, canLead: true, committee: false },
  lead2: { name: '팀장', canEdit: true, canLead: true, committee: true },
  memb: { name: '팀원', canEdit: false, canLead: false, committee: false },
  memb2: { name: '팀원2', canEdit: false, canLead: false, committee: false },
};
const FILE = 'F1234567890abcdef';
const stroke = (id, extra) => Object.assign({ id, t: 'pen', pg: 1, c: '#ff5a1f', w: 0.003, p: [0.1, 0.1, 0.2, 0.2, 0.3, 0.25] }, extra || {});

async function main() {
  const saved = [];
  let failSave = 0;
  const store = { [FILE + '|song']: [Object.assign(stroke('old00001'), { by: '옛사람', ts: 1 })] };
  const deps = {
    auth: (token) => { if (!USERS[token]) throw new Error('포털에서 다시 들어와 주세요.'); return USERS[token]; },
    loadAnno: (file, scope) => store[file + '|' + scope] || [],
    saveAnno: (file, scope, items) => { if (failSave > 0) { failSave--; throw new Error('quota'); } saved.push({ file, scope, n: items.length, ids: items.map((i) => i.id) }); store[file + '|' + scope] = items; },
    now: Date.now,
  };
  const server = http.createServer();
  const rt = attach(server, deps, { limits: { saveDelayMs: 60, saveGapMs: 20, retryMs: 120, burst: 40, perSec: 20, abuseKill: 3 } });
  await new Promise((r) => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port;

  const clients = [];
  function client() {
    const s = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    s.log = {};
    ['peers', 'leader', 'nav', 'cue', 'anno:add', 'anno:del', 'anno:clear', 'anno:live', 'anno:saved'].forEach((ev) => { s.log[ev] = []; s.on(ev, (d) => s.log[ev].push(d)); });
    clients.push(s);
    return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
  }
  const call = (s, ev, p) => new Promise((res) => { const t = setTimeout(() => res({ ok: false, code: 'timeout' }), 800); s.emit(ev, p, (x) => { clearTimeout(t); res(x); }); });
  const join = (s, token, room) => call(s, 'join', { token, room: room || '2026-09-27' });

  section('접속 · 인증');
  const A = await client(), B = await client(), C = await client();
  eq((await call(A, 'anno:load', { file: FILE })).code, 'auth', '방에 들어오기 전에는 필기를 못 함');
  eq((await join(A, 'nobody')).code, 'auth', '틀린 토큰은 거절');
  eq((await join(A, 'lead', '../../etc')).code, 'room', '이상한 방 이름은 거절');
  let r = await join(A, 'lead');
  ok(r.ok && r.you.name === '리더' && r.you.canLead && r.leader === null && r.peers.length === 1, '리더 후보 입장');
  r = await join(B, 'memb');
  ok(r.ok && !r.you.canLead, '팀원 입장');
  await join(C, 'memb2', '2026-10-04');                               // 다른 방
  await sleep(40);
  eq(A.log.peers.pop().map((p) => p.name).sort(), ['리더', '팀원'], '같은 방 사람 목록이 실시간으로 갱신됨');
  eq(C.log.peers.length, 1, '다른 방은 섞이지 않음 (자기 입장 알림만)');
  ok(typeof (await call(A, 'ping', {})).t === 'number', 'ping(시계 맞추기)');

  section('리더 · 팔로워');
  eq((await call(B, 'leader:claim', {})).code, 'perm', '팀원은 리더가 될 수 없음');
  ok((await call(A, 'leader:claim', {})).ok, '팀장이 리더가 됨');
  await sleep(30);
  eq(B.log.leader.pop(), { name: '리더', reason: 'claim' }, '모두에게 리더가 알려짐');
  eq((await call(B, 'nav', { file: FILE, page: 2 })).code, 'perm', '리더가 아니면 쪽을 넘길 수 없음');
  ok((await call(A, 'nav', { file: FILE, page: 3, song: 1, zoom: 1.2, sy: 0.5 })).ok, '리더가 쪽을 넘김');
  await sleep(30);
  const nav1 = B.log.nav.pop();
  ok(nav1 && nav1.page === 3 && nav1.song === 1 && nav1.zoom === 1.2 && nav1.file === FILE, '팔로워가 리더가 넘긴 쪽 · 곡 · 확대를 받음');
  const late = await client();
  r = await join(late, 'memb2');
  eq(r.nav && r.nav.page, 3, '늦게 들어온 사람도 리더의 현재 쪽을 받음');
  eq(r.leader, '리더', '…그리고 리더가 누구인지 앎');
  ok(A.log.nav.length === 0, '리더 자신에게는 되돌려 보내지 않음');
  eq((await call(A, 'nav', { file: 'bad', page: 9999, zoom: 99 })).ok, true, '이상한 값은 범위 안으로 정리해서 처리');
  await sleep(30);
  const nv = late.log.nav.pop(); ok(nv.page === 500 && nv.zoom === 6 && nv.file === '', '쪽 · 확대 값이 범위로 잘림');
  const cl = await call(A, 'cue', { label: 'Chorus', kind: 'voice' }); ok(cl.ok, '리더가 큐를 보냄');
  await sleep(30);
  eq(B.log.cue.pop().label, 'Chorus', '팔로워가 큐를 받음');
  eq((await call(B, 'cue', { label: 'x' })).code, 'perm', '리더가 아니면 큐 못 보냄');
  const t2 = await client(); await join(t2, 'lead2');
  eq((await call(t2, 'leader:claim', {})).code, 'taken', '이미 리더가 있으면 거절 (누구인지 알려줌)');
  ok((await call(t2, 'leader:claim', { force: true })).ok, '다른 팀장이 넘겨받기');
  await sleep(30);
  eq(B.log.leader.pop(), { name: '팀장', reason: 'takeover' }, '넘겨받았다고 알림');
  eq((await call(A, 'nav', { page: 1 })).code, 'perm', '이전 리더는 더 이상 못 넘김');
  t2.disconnect(); await sleep(60);
  eq(B.log.leader.pop(), { name: null, reason: 'left' }, '리더가 나가면 리더 없음으로 알림');

  section('필기 — 불러오기 · 실시간 · 권한');
  r = await call(A, 'anno:load', { file: FILE, scope: 'song' });
  ok(r.ok && r.items.length === 1 && r.items[0].by === '옛사람', '저장돼 있던 필기를 시트에서 불러옴');
  await call(B, 'anno:load', { file: FILE, scope: 'song' });
  r = await call(B, 'anno:add', { file: FILE, scope: 'song', item: stroke('b0000001', { by: '가짜이름', ts: 5 }) });
  ok(r.ok && r.item.by === '팀원' && r.item.ts > 1000, '소유자 · 시각은 서버가 직접 채움 (가짜 이름 무시)');
  await sleep(30);
  eq(A.log['anno:add'].pop().item.id, 'b0000001', '다른 사람에게 실시간으로 도착');
  ok(B.log['anno:add'].length === 0, '내가 그린 것은 나에게 되돌려 보내지 않음');
  eq((await call(B, 'anno:add', { file: FILE, scope: 'song', item: { id: 'x', t: 'pen' } })).code, 'bad', '형식이 틀린 필기는 거절');
  eq((await call(B, 'anno:add', { file: FILE, scope: 'song', item: stroke('b0000002', { t: 'evil' }) })).code, 'bad', '모르는 종류는 거절');
  eq((await call(B, 'anno:add', { file: 'zz', scope: 'song', item: stroke('b0000003') })).ok, false, '이상한 파일 ID 는 거절');
  eq((await call(B, 'anno:add', { file: FILE, scope: '../x', item: stroke('b0000004') })).ok, false, '이상한 범위는 거절');
  r = await call(B, 'anno:add', { file: FILE, scope: 'song', item: { id: 'txt00001', t: 'text', pg: 2, x: 0.5, y: 0.5, sz: 0.02, s: '<img src=x onerror=alert(1)> G', chord: 1 } });
  ok(r.ok && r.item.s.indexOf('<img') === 0, '글자는 그대로 저장 (화면에서 안전하게 그림)');
  r = await call(B, 'anno:add', { file: FILE, scope: 'song', item: { id: 'sym00001', t: 'sym', pg: 1, x: 2, y: -1, k: 'fermata' } });
  ok(r.ok && r.item.x === 1 && r.item.y === 0, '좌표는 0~1 로 잘림');
  eq((await call(B, 'anno:add', { file: FILE, scope: 'song', item: { id: 'sym00002', t: 'sym', pg: 1, x: .5, y: .5, k: 'nope' } })).code, 'bad', '모르는 기호는 거절');
  eq((await call(B, 'anno:add', { file: FILE, scope: 'song', item: { id: 'txt00002', t: 'text', pg: 1, x: .5, y: .5, s: '   ' } })).code, 'bad', '빈 글자는 거절');
  const other = await call(late, 'anno:load', { file: FILE, scope: 'song' });
  ok(other.items.some((i) => i.id === 'b0000001'), '같은 방(늦게 온 사람)도 같은 필기를 봄');
  r = await call(late, 'anno:del', { file: FILE, scope: 'song', id: 'b0000001' });
  eq(r.code, 'perm', '남의 필기는 팀원이 지울 수 없음');
  ok((await call(A, 'anno:del', { file: FILE, scope: 'song', id: 'b0000001' })).ok, '팀장 · 인도자는 남의 필기도 지움');
  await sleep(30);
  eq(B.log['anno:del'].pop().id, 'b0000001', '지운 것이 실시간으로 반영됨');
  ok((await call(B, 'anno:del', { file: FILE, scope: 'song', id: 'zzzzzzzz' })).ok, '이미 없는 필기를 지워도 오류가 아님');
  // 고쳐 쓰기 — 남의 것은 못 덮어씀
  await call(B, 'anno:add', { file: FILE, scope: 'song', item: stroke('b0000010') });
  eq((await call(late, 'anno:add', { file: FILE, scope: 'song', item: stroke('b0000010', { c: '#000000' }) })).code, 'perm', '남의 필기를 같은 ID 로 덮어쓸 수 없음');
  // 지우기 (한 쪽 · 전체)
  await call(late, 'anno:add', { file: FILE, scope: 'song', item: stroke('l0000001', { pg: 2 }) });
  r = await call(late, 'anno:clear', { file: FILE, scope: 'song' });
  ok(r.ok && r.n === 1 && r.ids[0] === 'l0000001', '팀원의 "전체 지우기"는 내 것만 지움');
  r = await call(A, 'anno:clear', { file: FILE, scope: 'song', pg: 2 });
  ok(r.ok && r.ids.indexOf('txt00001') !== -1, '팀장은 그 쪽의 모든 필기를 지움');

  section('그리는 중인 선 (live)');
  await call(B, 'anno:live', { file: FILE, id: 'live0001', t: 'pen', pg: 1, c: '#00ff00', w: 0.004, p: [0.1, 0.1, 0.12, 0.13] });
  await sleep(40);
  const lv = A.log['anno:live'].pop();
  ok(lv && lv.by === '팀원' && lv.p.length === 4 && lv.c === '#00ff00', '그리는 중인 선이 다른 사람에게 실시간으로 보임');
  ok(!(await call(B, 'anno:live', { file: FILE, id: 'live0002', p: new Array(1000).fill(0.5) })).ok, '너무 긴 조각은 거절');

  section('저장 (묶어서 · 실패해도 다시)');
  await sleep(300);
  ok(saved.length >= 1, '멈춘 뒤 시트에 저장됨 (' + saved.length + '번)');
  ok(saved.length <= 2, '그리는 동안 매 획마다 저장하지 않음 — 묶어서 저장 (' + saved.length + '번)');
  const lastSave = saved[saved.length - 1];
  ok(lastSave.ids.indexOf('old00001') !== -1 && lastSave.ids.indexOf('txt00001') === -1, '저장 내용이 최신 상태 (옛 필기 유지, 지운 것 제외)');
  ok(A.log['anno:saved'].some((x) => x.ok), '저장됐다고 방 사람들에게 알림');
  failSave = 1; const before = saved.length;
  await call(B, 'anno:add', { file: FILE, scope: 'song', item: stroke('b0000020') });
  await sleep(450);
  ok(A.log['anno:saved'].some((x) => !x.ok && /quota/.test(x.error)), '저장 실패를 알림');
  ok(saved.length > before, '실패한 뒤 자동으로 다시 시도해 저장됨');
  await call(B, 'anno:add', { file: FILE, scope: 'song', item: stroke('b0000021') });
  const n0 = saved.length;
  ok(rt.flushAll() >= 1 && saved.length > n0, '서버가 꺼지기 전 flushAll 로 남은 필기를 저장');

  section('보호 (속도 제한 · 큰 자료)');
  const S = await client(); await join(S, 'memb2', '2026-11-01');
  let rate = 0;
  for (let i = 0; i < 120; i++) { const x = await call(S, 'ping', {}); if (x.code === 'rate') rate++; if (S.disconnected) break; }
  ok(rate > 0 || S.disconnected, '너무 빠른 요청은 막힘 (' + rate + '번)');
  await sleep(50);
  ok(S.disconnected, '계속 어기면 연결을 끊음');
  const big = await client();
  const gone = new Promise((res) => big.on('disconnect', res));
  big.emit('join', { token: 'memb', room: '2026-09-27', pad: 'x'.repeat(400 * 1024) }, () => {});
  await Promise.race([gone, sleep(1500)]);
  ok(big.disconnected, '너무 큰 자료를 보내면 연결이 끊김');

  section('입력 검사기 (cleanItem)');
  const U = { name: '테스트' };
  ok(cleanItem(stroke('abcdef12'), U, 1), '정상 선');
  eq(cleanItem(stroke('abcdef12', { p: [0.1] }), U, 1), null, '점이 모자라면 거절');
  eq(cleanItem(stroke('abcdef12', { p: new Array(4000).fill(0.5) }), U, 1), null, '점이 너무 많으면 거절');
  eq(cleanItem(stroke('a b'), U, 1), null, '이상한 ID 거절');
  eq(cleanItem(stroke('abcdef12', { c: 'red' }), U, 1).c, '#ff5a1f', '이상한 색은 기본색으로');
  eq(cleanItem(stroke('abcdef12', { p: [NaN, 'x', 0.5, 0.5] }), U, 1).p, [0, 0, 0.5, 0.5], '숫자가 아닌 좌표는 0 으로');
  eq(cleanItem(null, U, 1), null, 'null 거절');

  section('방 정리');
  clients.forEach((c) => c.disconnect());
  await sleep(600);
  ok(rt.rooms.size === 0, '모두 나가고 저장이 끝나면 방이 정리됨 (남은 방 ' + rt.rooms.size + ')');
  await rt.close();
  console.log('\n' + (fail ? '✗ 실패 ' + fail + '건' : '✓ 모두 통과') + ' (통과 ' + pass + ')');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('시험 중 오류', e); process.exit(1); });
