/**
 * Step 4 화면 로직 시험 — public/notes/notes-core.js (가짜 시계 · 가짜 저장소, 브라우저 없이)
 *   node scripts/test-step4-client.js
 *  A. 디바운서 (1000ms 뒤 한 번 · 계속 쓰면 maxWait 마다 · flush/cancel)
 *  B. 저장기 (한 번에 하나 · 진행 중 편집 · 실패 재시도 · 충돌 · 빈 노트 · 너무 긴 글)
 *  C. 임시 보관 · reconcile
 *  D. 주보 정보 (서버 설교정보_ 와 같은 결과) · 주일 고르기 · 캐시
 *  E. 목록 이어쓰기 · 줄 접두어
 */
const T = require('./test-step3');
const { ok, eq, section, newEnv } = T;
const C = require('../public/notes/notes-core.js');

/* ---- 가짜 시계 ---- */
function clock() {
  let now = 1000, seq = 0; const q = [];
  return {
    setT: (f, ms) => { const id = ++seq; q.push({ id, at: now + ms, f }); return id; },
    clearT: (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); },
    now: () => now,
    tick(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!q.length || q[0].at > end) break;
        const t = q.shift(); now = t.at; t.f();
      }
      now = end;
    },
    pending: () => q.length
  };
}

section('A. 디바운서');
{
  const k = clock(); let n = 0;
  const d = C.createDebouncer(() => n++, 1000, k);
  d.call(); k.tick(999); eq(n, 0, '999ms 에는 아직');
  k.tick(1); eq(n, 1, '1000ms 에 한 번');
  // 타이핑: 300ms 간격 10번 → 마지막 뒤 1000ms 에 한 번만
  n = 0; for (let i = 0; i < 10; i++) { d.call(); k.tick(300); }
  eq(n, 0, '계속 치는 동안(300ms 간격)에는 저장 요청 없음');
  k.tick(700); eq(n, 1, '멈춘 뒤 1000ms 에 딱 한 번');
  // maxWait
  n = 0; const d2 = C.createDebouncer(() => n++, 1000, { ...k, maxWait: 5000 });
  for (let i = 0; i < 30; i++) { d2.call(); k.tick(400); }   // 12초 동안 계속
  ok(n >= 2 && n <= 3, '멈추지 않고 12초 쓰면 maxWait(5초) 마다 저장 → ' + n + '번');
  d2.cancel(); n = 0; d2.call(); ok(d2.pending(), '대기 중'); ok(d2.flush(), 'flush 는 바로 실행'); eq(n, 1, 'flush 실행됨'); ok(!d2.pending(), 'flush 뒤 대기 없음');
  d2.call(); d2.cancel(); k.tick(5000); eq(n, 1, 'cancel 하면 실행 안 함');
}

section('B. 저장기');
function mkSaver(over) {
  const k = clock(); const log = []; const states = [];
  const note = { title: '제목', body: '내용', reflection: '', date: '2026-09-27', ref: '', preacher: '' };
  let pendingCb = null; let mode = 'hold';
  const o = Object.assign({
    ...k, base: 0, getSnapshot: () => JSON.parse(JSON.stringify(note)),
    send: (snap, base, cb) => { log.push({ snap, base }); if (mode === 'auto') cb(null, { ok: true, version: base + 1 }); else pendingCb = cb; },
    onState: (s) => states.push(s), isTransient: C.isTransientError, isOffline: () => false
  }, over || {});
  const s = C.createSaver(o);
  return { s, k, log, states, note, done: (e, r) => { const f = pendingCb; pendingCb = null; f(e, r); }, auto: () => { mode = 'auto'; } };
}
{
  const t = mkSaver();
  t.s.edit(); t.s.request(); eq(t.log.length, 1, '요청 → 보냄'); eq(t.log[0].base, 0, '새 노트 base 0'); eq(t.states.slice(-1)[0], 'saving', '저장 중');
  t.s.edit(); t.s.request(); eq(t.log.length, 1, '진행 중에는 두 번째를 보내지 않음(한 번에 하나)');
  t.done(null, { ok: true, version: 1 });
  eq(t.log.length, 2, '끝나자 밀린 것을 한 번 더'); eq(t.log[1].base, 1, '두 번째 base 는 서버가 준 1');
  t.done(null, { ok: true, version: 2 }); eq(t.states.slice(-1)[0], 'saved', '저장 완료'); ok(t.s.isClean(), '깨끗함');
}
{
  const t = mkSaver();
  t.s.edit(); t.s.request(); t.s.edit();               // 보내는 중에 또 편집 (아직 request 안 옴)
  t.done(null, { ok: true, version: 1 });
  eq(t.states.slice(-1)[0], 'dirty', '보내는 중 편집한 글이 있으면 "저장 완료" 로 표시하지 않음'); ok(!t.s.isClean(), '깨끗하지 않음');
  t.s.request(); t.done(null, { ok: true, version: 2 }); eq(t.states.slice(-1)[0], 'saved', '이어서 저장되면 저장 완료');
}
{
  const t = mkSaver();
  t.s.edit(); t.s.request();
  t.done(new Error('서버에 연결하지 못했습니다.'));
  eq(t.states.slice(-1)[0], 'error', '연결 실패 → error(재시도 예약)');
  t.k.tick(1999); eq(t.log.length, 1, '2초 전에는 재시도 안 함'); t.k.tick(1); eq(t.log.length, 2, '2초 뒤 재시도'); eq(t.log[1].base, 0, '재시도는 같은 base');
  t.done(new Error('인터넷 연결을 확인해주세요.'));
  t.k.tick(3999); eq(t.log.length, 2, '두 번째 실패 뒤엔 4초'); t.k.tick(1); eq(t.log.length, 3, '4초 뒤 재시도');
  t.done(null, { ok: true, version: 1 }); eq(t.states.slice(-1)[0], 'saved', '복구되면 저장 완료');
  // 백오프 상한 30초
  const u = mkSaver(); u.s.edit(); u.s.request();
  for (let i = 0; i < 8; i++) { u.done(new Error('서버에 연결하지 못했습니다.')); u.k.tick(30000); }
  ok(u.log.length >= 9, '최대 30초 간격으로 계속 재시도 (' + u.log.length + '번)');
  // 새 편집은 기다리지 않고 바로 시도
  const w = mkSaver(); w.s.edit(); w.s.request(); w.done(new Error('서버에 연결하지 못했습니다.'));
  w.s.edit(); w.s.request(); eq(w.log.length, 2, '실패 뒤 새로 입력하면 재시도 대기 없이 바로 시도');
}
{
  const t = mkSaver();
  t.s.edit(); t.s.request(); t.done(new Error('노트 번호가 올바르지 않습니다.'));
  eq(t.states.slice(-1)[0], 'fatal', '서버가 거절한 오류는 자동 재시도하지 않음'); t.k.tick(120000); eq(t.log.length, 1, '재시도 없음');
  t.s.edit(); t.s.request(); eq(t.log.length, 2, '다시 입력하면 시도');
}
{
  let conf = null; const t = mkSaver({ onConflict: (r) => { conf = r; } });
  t.s.edit(); t.s.request(); t.done(null, { ok: true, conflict: true, reason: 'version', server: { version: 5, body: '다른 기기' } });
  eq(t.states.slice(-1)[0], 'conflict', '충돌 상태'); ok(conf && conf.reason === 'version', '충돌 알림');
  t.s.edit(); t.s.request(); eq(t.log.length, 1, '충돌 중에는 저장하지 않음(덮어쓰기 방지)');
  t.s.resume(5); eq(t.log.length, 2, '고른 뒤 이어서 저장'); eq(t.log[1].base, 5, '서버 버전을 base 로');
}
{
  const t = mkSaver(); t.note.title = ''; t.note.body = '   ';
  t.s.edit(); t.s.request(); eq(t.log.length, 0, '내용 없는 새 노트는 서버에 만들지 않음'); eq(t.states.slice(-1)[0], 'idle', '빈 노트는 idle');
  const e = mkSaver({ base: 3 }); e.note.title = ''; e.note.body = ''; e.s.edit(); e.s.request();
  eq(e.log.length, 1, '이미 저장된 노트를 전부 지운 경우는 저장(지운 글이 되살아나지 않게)');
  const l = mkSaver(); l.note.body = 'x'.repeat(30001); l.s.edit(); l.s.request();
  eq(l.log.length, 0, '30000자 초과는 보내지 않음'); eq(l.states.slice(-1)[0], 'toolong', 'toolong 상태');
}
{
  const t = mkSaver(); let settled = 0;
  t.s.edit(); t.s.request(); t.s.whenSettled(() => settled++); eq(settled, 0, '진행 중엔 기다림'); t.done(null, { ok: true, version: 1 }); eq(settled, 1, '끝나면 알림');
  t.s.whenSettled(() => settled++); eq(settled, 2, '이미 깨끗하면 바로 알림');
}
{
  // 타이핑 시뮬레이션: 5초 동안 100ms 마다 한 글자 → 저장 요청은 멈춘 뒤 1번
  const k = clock(); const sent = [];
  const s = C.createSaver({ ...k, getSnapshot: () => ({ title: 't', body: 'b' }), send: (sn, b, cb) => { sent.push(b); cb(null, { ok: true, version: b + 1 }); } });
  const d = C.createDebouncer(() => s.request(), C.DEBOUNCE_MS, { ...k, maxWait: C.MAX_WAIT_MS });
  for (let i = 0; i < 50; i++) { s.edit(); d.call(); k.tick(100); }
  eq(sent.length, 0, '5초 동안 쓰는 중에는 서버 호출 0번'); k.tick(1000); eq(sent.length, 1, '멈춘 뒤 1번'); eq(s.state(), 'saved', '저장 완료');
}

section('C. 임시 보관 · reconcile');
{
  const mem = {}; const st = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } };
  const k = clock(); const ds = C.createDraftStore(st, k);
  ds.put('Nabcdefghi1', { note: { body: 'a' }, ack: 2, dirty: true, owner: '정일반' });
  ds.put('Nabcdefghi2', { note: { body: 'b' }, ack: 1, dirty: false, owner: '정일반' });
  ds.put('Nabcdefghi3', { note: { body: 'c' }, ack: 0, dirty: true, owner: '최셀장' });
  eq(ds.get('Nabcdefghi1').note.body, 'a', '읽기'); eq(ds.dirtyOf('정일반').length, 1, '내 못 보낸 것만'); eq(ds.dirtyOf('정일반')[0].id, 'Nabcdefghi1', '아이디');
  k.tick(4 * 86400000); ds.prune();
  ok(ds.get('Nabcdefghi1'), '못 보낸 임시본은 오래돼도 지우지 않음'); ok(!ds.get('Nabcdefghi2'), '깨끗한 오래된 것은 정리');
  const bad = C.createDraftStore({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } }, k);
  ok(!bad.persistent(), 'localStorage 를 못 쓰면 메모리로'); bad.put('Nabcdefghi9', { note: { body: 'm' }, dirty: true }); eq(bad.get('Nabcdefghi9').note.body, 'm', '메모리로도 동작');
}
{
  const N = (o) => Object.assign({ date: '2026-09-27', title: 't', ref: '', preacher: '', body: '', reflection: '' }, o);
  const S = (o, v) => Object.assign(N(o), { version: v });
  eq(C.reconcile(null, S({ body: 'x' }, 3)).action, 'server', '임시본 없음 → 서버');
  eq(C.reconcile(null, null).action, 'none', '둘 다 없음');
  eq(C.reconcile({ note: N({ body: 'x' }), ack: 3, dirty: false }, S({ body: 'y' }, 4)).action, 'server', '깨끗한 임시본 + 서버가 더 새것 → 서버');
  let r = C.reconcile({ note: N({ body: 'mine' }), ack: 5, dirty: false }, S({ body: 'old' }, 3));
  eq(r.action, 'local', '서버가 최근 저장을 잃음(서버 3 < 확인 5) → 이 기기 것'); ok(r.push && r.base === 5, '다시 실어야 함(base 5)');
  r = C.reconcile({ note: N({ body: 'same' }), ack: 5, dirty: false }, S({ body: 'same' }, 3)); eq(r.action, 'server', '서버가 낮아도 내용이 같으면 서버');
  r = C.reconcile({ note: N({ body: 'mine' }), ack: 3, dirty: true }, S({ body: 'old' }, 3)); ok(r.action === 'local' && r.push, '못 보낸 편집 + 서버 그대로 → 이 기기 것을 보냄');
  r = C.reconcile({ note: N({ body: 'mine' }), ack: 3, dirty: true }, S({ body: 'theirs' }, 4)); eq(r.action, 'conflict', '못 보낸 편집 + 서버가 그 사이 바뀜 → 충돌');
  r = C.reconcile({ note: N({ body: 'same' }), ack: 3, dirty: true }, S({ body: 'same' }, 4)); eq(r.action, 'server', '내용이 같으면 충돌 아님');
  r = C.reconcile({ note: N({ body: 'new' }), ack: 0, dirty: true }, null); ok(r.action === 'local' && r.push && r.base === 0, '아직 서버에 없는 새 노트 → 보냄');
  r = C.reconcile({ note: N({ body: 'lost' }), ack: 4, dirty: false }, null); ok(r.action === 'local' && r.push, '서버가 노트를 통째로 잃음 → 다시 실음');
  r = C.reconcile({ note: N({ body: 'x' }), ack: 0, dirty: false }, null); eq(r.action, 'none', '보낼 것 없음');
  ok(C.sameContent(N({ title: 'a\nb' }), N({ title: 'a b' })), '한 줄 칸의 줄바꿈은 서버처럼 공백으로 보고 비교');
  ok(C.sameContent(N({ body: 'a\r\nb' }), N({ body: 'a\nb' })), 'CRLF 는 LF 와 같게');
}

section('D. 주보 정보 · 주일 · 캐시');
{
  const B = (o) => Object.assign({ date: '2026-09-27', occasion: '', order: [{ key: 'sermon', value: '두려움 없는 믿음\n강산 목사' }], bible: { title: '', ref: '' } }, o);
  const cases = [
    B({}), B({ bible: { title: '광야의 노래', ref: '시편 23:1-6' } }), B({ order: [{ key: 'sermon', value: '' }] }),
    B({ order: [{ key: 'sermon', value: '제목만' }] }), B({ order: [{ key: 'sermon', value: '제목\n강산 목사\n객원' }], bible: { title: '  ', ref: ' 요 3:16 ' } }),
    B({ order: [] }), B({ occasion: '부활절', order: [{ key: 'creed', value: 'x' }] }),
  ];
  const env = newEnv(() => {});
  cases.forEach((b, i) => {
    const s = env.run((api) => api.설교정보_(b)), c = C.metaFromBulletin(b);
    eq(JSON.stringify(c), JSON.stringify(s), '서버 설교정보_ 와 같은 결과 #' + i);
  });
  eq(C.metaFromBulletin(null), null, 'null');
  eq(C.currentSunday(new Date(2026, 8, 27, 10).getTime()), '2026-09-27', '주일이면 그날');
  eq(C.currentSunday(new Date(2026, 8, 30, 10).getTime()), '2026-09-27', '수요일이면 지난 주일');
  eq(C.currentSunday(new Date(2026, 8, 26, 23, 59).getTime()), '2026-09-20', '토요일 밤은 지난 주일');
  const metas = { '2026-09-13': { date: '2026-09-13', title: 'a' }, '2026-09-20': { date: '2026-09-20', title: 'b' } };
  eq(C.pickMeta(metas, '2026-09-20').title, 'b', '같은 날짜'); eq(C.pickMeta(metas, '2026-09-27').title, 'b', '없으면 그 이전 가장 가까운 것'); eq(C.pickMeta(metas, '2026-09-06'), null, '이전 것도 없으면 null');
  const mem = {}; const st = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  C.writeMetaCache(st, { '2026-09-20': metas['2026-09-20'] }); C.writeMetaCache(st, { '2026-09-27': { date: '2026-09-27', title: 'c' } });
  const got = C.readMetaCache(st); eq(Object.keys(got).length, 2, '캐시에 두 주 쌓임'); eq(got['2026-09-27'].title, 'c', '캐시 읽기');
  ok(C.readMetaCache({ getItem() { throw new Error('x'); } }) && Object.keys(C.readMetaCache({ getItem() { throw new Error('x'); } })).length === 0, '저장소 오류에도 빈 값');
}

section('E. 이어쓰기 · 줄 접두어');
{
  const ap = (v, r) => v.slice(0, r.from) + r.insert + v.slice(r.to);
  let v = '- 첫째', r = C.continueList(v, v.length); eq(ap(v, r), '- 첫째\n- ', '목록 이어쓰기');
  v = '- 첫째\n- '; r = C.continueList(v, v.length); eq(ap(v, r), '- 첫째\n', '빈 항목에서 Enter → 목록 끝');
  v = '1. 가'; r = C.continueList(v, v.length); eq(ap(v, r), '1. 가\n2. ', '번호 이어서');
  v = '  - 들여쓴'; r = C.continueList(v, v.length); eq(ap(v, r), '  - 들여쓴\n  - ', '들여쓰기 유지');
  eq(C.continueList('그냥 글', 4), null, '목록이 아니면 기본 동작');
  v = '가나다\n- 항목'; r = C.continueList(v, 3); eq(r, null, '앞줄 중간에서는 기본 동작');
  const tp = (v, a, b, p) => { const r = C.toggleLinePrefix(v, a, b, p); return v.slice(0, r.from) + r.text + v.slice(r.to); };
  eq(tp('가\n나', 0, 0, '- '), '- 가\n나', '한 줄에 목록 기호');
  eq(tp('- 가', 2, 2, '- '), '가', '다시 누르면 뺌');
  eq(tp('가\n나', 0, 3, '- '), '- 가\n- 나', '여러 줄');
  eq(tp('## 가', 0, 0, '- '), '- 가', '제목 → 목록으로 바꿈');
  eq(tp('가\n나', 0, 2, '## '), '## 가\n나', '줄 끝까지 선택(개행 포함)해도 다음 줄은 건드리지 않음');
  eq(C.savedAgo(2000), '방금', '방금'); eq(C.savedAgo(90000), '2분 전', '분');
  eq(C.fmtDate('2026-09-27'), '2026.09.27 (일)', '날짜 표기');
  ok(C.validId(C.newId()), '새 번호는 서버 규칙에 맞음');
}

process.exit(T.summary() ? 0 : 1);
