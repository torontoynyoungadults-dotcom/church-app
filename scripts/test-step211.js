/**
 * Step 2.11 시험 (서버 · 순수 로직)
 *   node scripts/test-step211.js
 *  A. 큐          : 키 업 · 기도 추가, 요청한 콜아웃 한국어 이름
 *  B. 음성        : 자연스러운 남성 음성 우선 (기계음 · 여성 제외), 점수 규칙
 *  C. 따라가기 저장 : worshipCfgSave kind='follow' (나만 · 값 정리 · 팀 거절) + Load
 *  D. 실시간      : prefs → 접속자 목록(peers)에 내 따라가기 상태
 */
const http = require('http');
const { io: connect } = require('socket.io-client');
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });
const realtime = require('../lib/realtime');
const M = require('../public/worship/metro.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  section('A. 큐 — 키 업 · 기도 + 요청한 콜아웃');
  {
    const by = (id) => M.CUE_BY[id];
    ok(by('keyup') && by('keyup').en === 'Key Up' && by('keyup').ko === '키 업', '"Key Up / 키 업"');
    ok(by('prayer') && by('prayer').en === 'Prayer' && by('prayer').ko === '기도', '"Prayer / 기도"');
    eq(by('repc').ko, '코러스 반복', '코러스 반복'); eq(by('halfc').ko, '코러스 반', '코러스 반'); eq(by('lastl').ko, '마지막 줄 한 번 더', '마지막 줄 한 번 더');
    eq(by('once').ko, '한 번 더', '한 번 더'); eq(by('onebar').ko, '한마디 더', '한마디 더'); eq(by('tag').en, 'Tag the last line', 'Tag the last line'); eq(by('lastl').en, 'Last line again', 'Last line again');
    ok(by('keyup').g === 'rep' && by('prayer').g === 'rep', '반복 · 콜아웃 묶음에 버튼이 생김');
    eq(new Set(M.CUES.map((c) => c.id)).size, M.CUES.length, '큐 id 중복 없음');
    eq(M.CUES.slice(0, 24).map((c) => c.id).join(','), 'v1,v2,v3,c,pc,b,intro,itld,vamp,end,voice,break,die,ferm,solo,repc,halfc,tag,lastl,once,onebar,sess,alto,tenor', '기존 큐 24개의 순서(=효과음 번호)는 그대로');
  }

  section('B. 음성 — 자연스러운 남성 음성 우선');
  {
    const V = (name, lang, local, def) => ({ name, lang, localService: !!local, default: !!def });
    const en = [V('Fred', 'en-US', 1), V('Daniel', 'en-GB', 1), V('Daniel (Enhanced)', 'en-GB', 1), V('Microsoft Guy Online (Natural) - English (United States)', 'en-US'), V('Samantha', 'en-US', 1)];
    eq(M.pickVoiceFrom(en, 'en', 'male').name, 'Microsoft Guy Online (Natural) - English (United States)', '신경망(Natural) 남성 음성이 1순위');
    eq(M.pickVoiceFrom(en.filter((v) => !/Guy/.test(v.name)), 'en', 'male').name, 'Daniel (Enhanced)', '고음질(Enhanced) 남성이 다음');
    eq(M.pickVoiceFrom([V('Fred', 'en-US', 1), V('Daniel', 'en-GB', 1)], 'en', 'male').name, 'Daniel', '옛 기계음(Fred)보다 Daniel');
    eq(M.pickVoiceFrom([V('Fred', 'en-US', 1), V('Samantha', 'en-US', 1)], 'en', 'male').name, 'Fred', '남성 후보가 그것뿐이면 그래도 사용 (낮은 음높이 대신 쓰는 것보다 남성 이름 우선)');
    ok(M.voiceScore(V('Zarvox', 'en-US', 1)) < M.voiceScore(V('Daniel', 'en-GB', 1)), '효과음 음성(Zarvox)은 점수가 낮음');
    ok(M.voiceScore(V('Google UK English Male', 'en-GB')) >= 0, '일반 음성은 감점 없음');
    eq(M.pickVoiceFrom([V('Yuna', 'ko-KR', 1), V('Microsoft InJoon Online (Natural) - Korean (Korea)', 'ko-KR')], 'ko', 'male').name, 'Microsoft InJoon Online (Natural) - Korean (Korea)', '한국어 남성(InJoon)');
    eq(M.pickVoiceFrom(en, 'en', 'female').name, 'Samantha', '여성 선택은 그대로');
    eq(M.pickVoiceFrom([], 'en', 'male'), null, '음성이 없으면 null');
    ok(M.MALE_FALLBACK_PITCH >= 0.75 && M.MALE_FALLBACK_PITCH < 1, '남성 음성이 없을 때 음높이를 너무 낮추지 않음 (기계음 방지)');
  }

  section('C. 따라가기 저장 — 나만 · 값 정리 · 팀 거절');
  {
    const env = newEnv(); const { run } = env;
    const KEY = 'ADM', DATE = '2026-09-27';
    run((api) => api.saveWorshipSongs(KEY, DATE, '콘티', [{ title: 'Amazing Grace', team: '', key: 'G', bpm: '120', form: 'V1-C', link: '', note: '', solo: [] }]));
    let r = run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'follow', 'sync', { page: false, metro: true }, 'cid1'));
    ok(r.ok && r.layer === 'mine' && !r.bcast, '나만 저장 (팀에 전달하지 않음)'); eq(r.value, { page: false, metro: true }, '페이지 끔 · 메트로놈 켬');
    let L = run((api) => api.worshipCfgLoad(KEY, DATE));
    eq(L.mine.filter((e) => e.kind === 'follow').map((e) => [e.key, e.value]), [['sync', { page: false, metro: true }]], '다시 불러오면 그대로');
    r = run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'follow', 'sync', { page: 0, metro: '0', junk: 1 }, 'cid1')); eq(r.value, { page: false, metro: false }, '값 정리 (0 · "0" = 끔, 나머지는 버림)');
    r = run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'follow', 'sync', {}, 'cid1')); eq(r.value, { page: true, metro: true }, '비어 있으면 둘 다 켜짐(기본)');
    throws(() => run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'follow', 'sync', { page: false }, 'c')), /나만/, '팀 전체 설정으로는 저장 불가');
    throws(() => run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'follow', 'other', { page: false }, 'c')), /이름/, '알 수 없는 이름은 거절');
    run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'follow', 'sync', null, 'cid1'));
    L = run((api) => api.worshipCfgLoad(KEY, DATE)); eq(L.mine.filter((e) => e.kind === 'follow').length, 0, '지우면 사라짐');
    r = run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'metro', 'Amazing Grace', { bpm: 70 }, 'c')); ok(r.ok && r.bcast, '기존 팀 설정(metro)은 그대로 동작');
  }

  section('D. 실시간 — 접속자 목록에 따라가기 상태');
  {
    const server = http.createServer(); const DATE = '2026-09-27';
    const rt = realtime.attach(server, { auth: (t) => ({ name: t, canEdit: true, canLead: true }), loadAnno: () => [], saveAnno: () => {}, log: () => {} });
    await new Promise((r) => server.listen(0, r)); const url = 'http://127.0.0.1:' + server.address().port;
    const mk = (tok, room) => new Promise((res) => { const c = connect(url, { transports: ['websocket'] }); c.on('connect', () => c.emit('join', { token: tok, room }, (r) => res({ c, r }))); });
    const A = await mk('A', DATE), B = await mk('B', DATE), O = await mk('C', '2026-10-04');
    let last = null; A.c.on('peers', (p) => { last = p; });
    const ack = await new Promise((res) => B.c.emit('prefs', { page: false, metro: true }, res));
    ok(ack && ack.ok, 'prefs 저장됨'); await sleep(200);
    const pb = last && last.find((x) => x.name === 'B'); eq(pb && pb.follow, { page: false, metro: true }, 'A 가 받는 접속자 목록에 B 의 상태');
    ok(last.find((x) => x.name === 'A').follow == null, '알리지 않은 사람은 상태 없음(=기본 켜짐)');
    const ack2 = await new Promise((res) => B.c.emit('prefs', { metro: false }, res)); ok(ack2.ok, '일부만 보내도 됨'); await sleep(150);
    eq(last.find((x) => x.name === 'B').follow, { page: true, metro: false }, '빠진 값은 켜짐으로 정리');
    const other = await new Promise((res) => O.c.emit('prefs', { page: false }, res)); ok(other.ok, '다른 방 사람도 자기 방에서만'); await sleep(100);
    eq(last.find((x) => x.name === 'B').follow, { page: true, metro: false }, '다른 방의 변경은 이 방에 영향 없음');
    const stranger = await new Promise((res) => { const c = connect(url, { transports: ['websocket'] }); c.on('connect', () => c.emit('prefs', { page: false }, (r) => { c.close(); res(r); })); });
    ok(stranger && stranger.ok === false, '방에 들어오지 않은 연결은 거절');
    [A.c, B.c, O.c].forEach((c) => c.close()); await rt.close(); server.close();
  }
  process.exit(T.summary() ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
