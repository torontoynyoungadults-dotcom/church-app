/**
 * Step 2.9 시험 (서버 · 순수 로직) — 진짜 구글 없이(scripts/fake-google.js) 확인합니다.
 *   node scripts/test-step29.js
 *  A. 글꼴      : 화면(anno.js)과 실시간 서버(realtime.js)의 글꼴 목록이 같음 · 손글씨 글꼴이 필기에 저장됨
 *  B. 음성 큐   : 새 반복 · 콜아웃 6개 · 남성 음성 고르기 · 남성 음성이 없을 때 낮은 음높이
 *  C. 설정 공유 : worshipCfgSave / Load (팀 · 나만) · 값 정리 · 권한 · bcast
 *  D. 곡 정보   : worshipSongPatch (BPM · 송폼 · 링크만 고침, 나머지 칸 보존) · worshipSongsOf
 *  E. 실시간    : rt.broadcast 가 같은 방에만 · 허용된 이벤트만
 */
const http = require('http');
const { io: connect } = require('socket.io-client');
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });
const realtime = require('../lib/realtime');
const A = require('../public/worship/anno.js');
const M = require('../public/worship/metro.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

section('A. 글꼴 — 화면과 서버가 같은 목록');
{
  eq(A.FONT_KEYS, ['sans', 'serif', 'hand', 'pen', 'dodum'], '화면 글꼴 5가지');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'realtime.js'), 'utf8');
  const m = /const FONT_KEYS = \[([^\]]*)\]/.exec(src);
  eq(m && m[1].split(',').map((x) => x.trim().replace(/'/g, '')), A.FONT_KEYS, '서버(realtime.js) FONT_KEYS 가 화면과 같음');
  ok(/Nanum Pen Script/.test(A.FONTS.pen) && /Gowun Dodum/.test(A.FONTS.dodum), '나눔 펜 · 고운돋움 글꼴 이름이 들어 있음');
  ok(A.FONT_NAMES.pen && A.FONT_NAMES.dodum, '글꼴 이름표');
  const U = { name: 'Alice', canEdit: true };
  for (const f of ['pen', 'dodum']) {
    const t = realtime.cleanItem({ id: 'abc12345', t: 'text', pg: 1, c: '#e53935', x: .3, y: .3, sz: .03, s: '안녕 G/B', f }, U, 1);
    ok(t && t.f === f, '글자 글꼴 ' + f + ' 저장됨');
    const c = realtime.cleanItem({ id: 'abc12346', t: 'text', pg: 1, c: '#e53935', x: .3, y: .3, sz: .03, s: 'Am', chord: 1, f }, U, 1);
    ok(c && c.f === f && c.chord === 1, '코드 글꼴 ' + f + ' 저장됨');
  }
  const bad = realtime.cleanItem({ id: 'abc12347', t: 'text', pg: 1, c: '#e53935', x: .3, y: .3, sz: .03, s: 'x', f: 'comic' }, U, 1);
  ok(bad && bad.f === undefined, '모르는 글꼴은 저장하지 않음');
}

section('B. 음성 큐 — 반복 · 콜아웃 · 남성 음성');
{
  const rep = M.CUES.filter((c) => c.g === 'rep');
  eq(rep.map((c) => c.en), ['Repeat Chorus', 'Half Chorus', 'Tag the last line', 'Last line again', 'One more time', 'One more bar'], '요청한 6개 콜아웃(영어)');
  ok(rep.every((c) => c.ko), '한국어 이름도 있음');
  eq(new Set(M.CUES.map((c) => c.id)).size, M.CUES.length, '큐 id 중복 없음');
  const V = (name, lang, local) => ({ name, lang, localService: !!local });
  const voices = [V('Samantha', 'en-US', 1), V('Daniel', 'en-GB', 1), V('Google UK English Male', 'en-GB'), V('Yuna', 'ko-KR', 1), V('Google 한국어', 'ko-KR'), V('Microsoft InJoon Online (Natural) - Korean (Korea)', 'ko-KR')];
  eq(M.pickVoiceFrom(voices, 'en', 'male').name, 'Daniel', '영어 남성 음성 (기기 안 음성 우선)');
  eq(M.pickVoiceFrom(voices, 'ko', 'male').name, 'Microsoft InJoon Online (Natural) - Korean (Korea)', '한국어 남성 음성');
  eq(M.pickVoiceFrom(voices, 'en', 'female').name, 'Samantha', '여성 선택');
  ok(M.pickVoiceFrom(voices, 'en', 'any'), '기기 기본');
  eq(M.pickVoiceFrom(voices.filter((v) => v.lang === 'en-US'), 'en', 'male').name, 'Samantha', '남성이 하나도 없으면 있는 음성이라도 (낮은 음높이로 대신)');
  eq(M.pickVoiceFrom([], 'en', 'male'), null, '음성이 없으면 null');
  ok(M.isMaleVoice(V('Microsoft David', 'en-US')) && !M.isMaleVoice(V('Microsoft Zira', 'en-US')) && !M.isMaleVoice(V('Google 한국어', 'ko-KR')), '이름으로 남 · 여 구분');
  ok(M.MALE_FALLBACK_PITCH < 1 && M.MALE_FALLBACK_PITCH >= 0.5, '대체 음높이는 낮게');

  /* 실제로 말하는 자리 — 가짜 speechSynthesis */
  const spoken = [];
  global.window = { speechSynthesis: { getVoices: () => cur, speak: (u) => spoken.push(u), cancel() {}, addEventListener() {}, removeEventListener() {} }, addEventListener() {} };
  global.SpeechSynthesisUtterance = function (t) { this.text = t; };
  global.performance = global.performance || { now: () => Date.now() };
  let cur = voices;
  let m = M.create({});
  ok(m.state().cfg.gender === 'male', '기본 음성은 남성');
  let r = m.cue('repc'); ok(r.ok && r.text === 'Repeat Chorus', 'Repeat Chorus 가 말해짐: ' + JSON.stringify(r));
  eq(spoken.length, 1, 'speechSynthesis.speak 호출'); eq(spoken[0] && spoken[0].voice && spoken[0].voice.name, 'Daniel', '남성 음성(Daniel)으로 말함'); eq(spoken[0].pitch, 1, '남성 음성이면 음높이 그대로');
  for (const id of ['halfc', 'tag', 'lastl', 'once', 'onebar']) { r = m.cue(id); ok(r.ok, id + ' 큐'); }
  eq(spoken.map((u) => u.text).slice(1), ['Half Chorus', 'Tag the last line', 'Last line again', 'One more time', 'One more bar'], '나머지 5개도 그 문장 그대로');
  m.setLang('ko'); m.cue('repc'); eq(spoken[spoken.length - 1].text, '후렴 반복', '한국어 큐'); eq(spoken[spoken.length - 1].voice.name.indexOf('InJoon') >= 0, true, '한국어도 남성 음성');
  m.destroy();
  cur = voices.filter((v) => /Samantha|Yuna/.test(v.name));
  m = M.create({}); spoken.length = 0; m.cue('once');
  ok(spoken[0].pitch === M.MALE_FALLBACK_PITCH, '남성 음성이 없으면 낮은 음높이(' + M.MALE_FALLBACK_PITCH + ')로 대신: ' + spoken[0].pitch);
  m.setGender('female'); spoken.length = 0; m.cue('once'); eq(spoken[0].pitch, 1, '여성 선택이면 음높이 그대로');
  eq(m.voiceInfo('en').name, 'Samantha', 'voiceInfo');
  m.destroy();
  delete global.window; delete global.SpeechSynthesisUtterance;
}

async function main() {
  const env = newEnv();
  const { run } = env;
  const KEY = 'ADM', DATE = '2026-09-27', EV = 'ev-abc123';
  const 토 = (name, i) => run((api) => api.포털토큰_(name, String(4165551000 + i).slice(-10), ''));
  const KIM = 토('김커미티', 0), LEE = 토('이예배', 1);
  run((api) => api.saveWorshipSongs(KEY, DATE, '콘티', [
    { title: 'Amazing Grace', team: '테스트', key: 'G', bpm: '120', form: 'V1-C', link: '', note: '메모A', solo: [] },
    { title: 'Second Song', team: '', key: 'Bb', bpm: '90', form: 'Int-V-C', link: '', note: '', solo: [] }]));
  run((api) => api.saveWorshipSongs(KEY, DATE, '결단', [{ title: '결단곡', team: '', key: 'D', bpm: '60', form: '', link: '', note: '', solo: [] }]));
  const songs = () => run((api) => api.worshipSongsOf(KEY, DATE)).songs;

  section('C. 설정 공유 — 팀 · 나만 · 값 정리 · 권한');
  {
    const L0 = run((api) => api.worshipCfgLoad(KEY, DATE));
    eq(L0.team, [], '처음에는 팀 설정 없음'); eq(L0.mine, [], '내 설정 없음'); ok(L0.canEdit === true && L0.me, '내 이름 · 권한 돌려줌'); eq(L0.songs.length, 3, '곡 목록도 함께 (콘티 2 + 결단 1)');
    const FID = 'FILEID_AAAAAAA1';
    let r = run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'map', FID, { 3: 1, 1: 0, 999: 1, 2: -5, x: 1, 4: '2' }, 'cidA'));
    ok(r.ok && r.layer === 'team', '팀 쪽↔곡 저장'); eq(r.value, { 1: 0, 3: 1, 4: 2 }, '이상한 쪽 · 곡 번호는 버림');
    ok(r.bcast && r.bcast.room === DATE && r.bcast.event === 'cfg' && r.bcast.payload.kind === 'map' && r.bcast.payload.cid === 'cidA' && r.bcast.payload.layer === 'team', '팀 설정은 실시간 전달 대상(bcast)');
    r = run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'metro', 'Amazing Grace', { num: 6, den: 8, marks: [2, 0, 0, 1, 0, 0], count: 2, bpm: 68, junk: 1 }, 'cidA'));
    eq(r.value, { num: 6, den: 8, marks: [2, 0, 0, 1, 0, 0], count: 2, bpm: 68 }, '메트로놈 설정 정리');
    r = run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'metro', 'X', { num: 99, den: 3, marks: [9, -1, 1], count: 9, bpm: 999 }));
    eq(r.value, { num: 16, den: 4, marks: [2, 0, 1], count: 4, bpm: 300 }, '범위 밖 값은 한계로 (박자 16 · 분모 4 · 강세 0~2 · 시작 전 4마디 · BPM 300)');
    run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'metro', 'X', null));
    let L = run((api) => api.worshipCfgLoad(KEY, DATE));
    eq(L.team.map((e) => e.kind + '|' + e.key).sort(), ['map|' + FID, 'metro|Amazing Grace'], '불러오기: 저장한 팀 설정만 (X 는 지움)');
    eq(L.team.filter((e) => e.kind === 'map')[0].value, { 1: 0, 3: 1, 4: 2 }, '쪽↔곡 값');
    run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'map', FID, { 3: 0 }));
    eq(run((api) => api.worshipCfgLoad(KEY, DATE)).team.filter((e) => e.kind === 'map').length, 1, '같은 열쇠는 덮어씀(중복 줄 없음)');
    // 나만
    r = run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'metro', 'Amazing Grace', { bpm: 55 }));
    ok(r.ok && r.layer === 'mine' && !r.bcast, '나만 보기 설정은 실시간 전달하지 않음 (bcast 없음)');
    eq(run((api) => api.worshipCfgLoad(KEY, DATE)).mine.map((e) => e.value), [{ bpm: 55 }], '내 설정으로 저장');
    eq(run((api) => api.worshipCfgLoad(KIM, DATE)).mine, [], '다른 사람에게는 내 설정이 안 보임');
    eq(run((api) => api.worshipCfgLoad(KIM, DATE)).team.length, 2, '팀 설정은 다른 사람에게도 보임');
    r = run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'song', 'Amazing Grace', { bpm: '77x', form: ' V C ', link: 'https://youtu.be/abc' }));
    eq(r.value, { bpm: '77', form: 'V C', link: 'https://youtu.be/abc' }, '나만 곡 정보 값 정리');
    eq(songs()[0].bpm, '120', '나만 저장은 곡 원본(콘티)을 바꾸지 않음');
    // 방 · 종류 · 권한 · 오류
    throws(() => run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'song', 'Amazing Grace', { bpm: 70 })), /곡 정보/, '팀 곡 정보는 이 함수로 못 바꿈 (worshipSongPatch 로)');
    throws(() => run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'weird', 'k', { a: 1 })), /종류/, '모르는 종류');
    throws(() => run((api) => api.worshipCfgSave(KEY, 'not-a-date', 'team', 'metro', 'k', { num: 4 })), /예배|날짜/, '이상한 방');
    throws(() => run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'map', 'short', { 1: 0 })), /악보/, '악보 파일 ID 형식');
    throws(() => run((api) => api.worshipCfgSave(KEY, DATE, 'team', 'metro', 'x'.repeat(81), { num: 4 })), /곡 이름/, '곡 이름 길이');
    throws(() => run((api) => api.worshipCfgSave('nobody', DATE, 'team', 'metro', 'k', { num: 4 })), /포털|권한|찬양/, '권한 없는 사람은 거절');
    throws(() => run((api) => api.worshipCfgLoad('nobody', DATE)), /포털|권한|찬양/, '권한 없는 사람은 불러오기도 거절');
    // 행사 방
    r = run((api) => api.worshipCfgSave(KEY, EV, 'team', 'metro', 'Song', { num: 3, den: 4 }));
    ok(r.ok && r.bcast.room === EV, '행사(ev-…) 방도 가능');
    eq(run((api) => api.worshipCfgLoad(KEY, DATE)).team.length, 2, '방마다 따로 저장 (날짜 방에는 행사 설정이 안 보임)');
    // 지우기
    run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'song', 'Amazing Grace', null)); run((api) => api.worshipCfgSave(KEY, DATE, 'mine', 'metro', 'Amazing Grace', null));
    eq(run((api) => api.worshipCfgLoad(KEY, DATE)).mine, [], '내 설정 지우기');
    // 화면에 나가는 함수인지 (bcast 를 server.js 가 떼어냄)
    const rtm = require('../lib/runtime');
    ['worshipCfgLoad', 'worshipCfgSave', 'worshipSongPatch', 'worshipSongsOf'].forEach((n) => ok(rtm.isCallable(n), n + ' 는 화면에서 부를 수 있음'));
    ['연습설정저장_', '연습설정읽기_', '연습설정값정리_'].forEach((n) => ok(!rtm.isCallable(n), n + ' 는 화면에서 못 부름'));
  }

  section('D. 곡 정보 — BPM · 송폼 · 유튜브 링크만 고침');
  {
    const before = songs();
    ok(before[0].seq === 1 && before[0].kind === '콘티' && before[2].kind === '결단', '곡 목록에 seq · kind 가 있음');
    let r = run((api) => api.worshipSongPatch(KEY, DATE, '콘티', 1, { bpm: '84', form: 'Int V C B C', link: 'https://youtu.be/dQw4w9WgXcQ' }, 'cidB'));
    eq(r.song, { seq: 1, kind: '콘티', title: 'Amazing Grace', bpm: '84', form: 'Int V C B C', link: 'https://youtu.be/dQw4w9WgXcQ' }, '고친 곡');
    ok(r.bcast && r.bcast.event === 'song' && r.bcast.room === DATE && r.bcast.payload.seq === 1 && r.bcast.payload.kind === '콘티' && r.bcast.payload.cid === 'cidB' && r.bcast.payload.patch.bpm === '84', '팀에 실시간 전달(bcast)');
    const after = songs();
    const full = run((api) => api.콘티목록_(DATE, '콘티'))[0];
    eq([full.title, full.team, full.key, full.note], ['Amazing Grace', '테스트', 'G', '메모A'], '제목 · 팀 · Key · 설명은 그대로');
    eq([after[0].bpm, after[0].form, after[0].link], ['84', 'Int V C B C', 'https://youtu.be/dQw4w9WgXcQ'], 'BPM · 송폼 · 링크가 콘티에 저장됨 (허브와 같은 값)');
    eq(after[1], before[1], '다른 곡은 그대로'); eq(after[2], before[2], '결단 곡도 그대로');
    r = run((api) => api.worshipSongPatch(KEY, DATE, '콘티', 1, { bpm: '' }));
    eq(songs()[0].bpm, '', 'BPM 비우기'); eq(songs()[0].form, 'Int V C B C', '비운 것 말고는 그대로');
    r = run((api) => api.worshipSongPatch(KEY, DATE, '결단', 1, { form: 'V C' }));
    eq(songs()[2].form, 'V C', '결단 구분도 고침');
    ok(run((api) => api.worshipSongPatch(KEY, DATE, '콘티', 2, { bpm: '100' })).ok, '2번 곡도 고침'); eq(songs()[1].bpm, '100', '2번 곡 BPM');
    throws(() => run((api) => api.worshipSongPatch(KEY, DATE, '콘티', 1, { bpm: '20' })), /BPM/, 'BPM 30 미만');
    throws(() => run((api) => api.worshipSongPatch(KEY, DATE, '콘티', 1, { bpm: '400' })), /BPM/, 'BPM 300 초과');
    throws(() => run((api) => api.worshipSongPatch(KEY, DATE, '콘티', 1, { link: 'javascript:alert(1)' })), /http/, '링크는 http(s) 만');
    throws(() => run((api) => api.worshipSongPatch(KEY, DATE, '콘티', 1, {})), /내용/, '바꿀 내용 없음');
    throws(() => run((api) => api.worshipSongPatch(KEY, DATE, '콘티', 99, { bpm: '80' })), /찾지/, '없는 곡');
    throws(() => run((api) => api.worshipSongPatch('nobody', DATE, '콘티', 1, { bpm: '80' })), /포털|권한|찬양/, '권한 없는 사람은 거절');
    throws(() => run((api) => api.worshipSongsOf('nobody', DATE)), /포털|권한|찬양/, '곡 목록도 권한 필요');
    // 허브의 곡 저장과 서로 충돌하지 않음
    run((api) => api.saveWorshipSong(KEY, DATE, { seq: 1, title: 'Amazing Grace', team: '테스트', key: 'A', bpm: '90', form: 'V C', link: '', note: '메모B', kind: '콘티' }));
    eq(songs()[0].key, 'A', '허브에서 고친 Key 가 보임 (같은 줄)'); eq(songs()[0].bpm, '90', '허브 BPM 도 같은 줄');
  }

  section('E. 실시간 — 같은 방에만 · 허용된 이벤트만');
  {
    const server = http.createServer();
    const rt = realtime.attach(server, { auth: (t) => ({ name: t, canEdit: true, canLead: true }), loadAnno: () => [], saveAnno: () => {}, log: () => {} });
    await new Promise((r) => server.listen(0, r)); const url = 'http://127.0.0.1:' + server.address().port;
    const mk = (tok, room) => new Promise((res) => { const c = connect(url, { transports: ['websocket'] }); c.on('connect', () => c.emit('join', { token: tok, room }, () => res(c))); });
    const a = await mk('A', DATE), b = await mk('B', DATE), other = await mk('C', '2026-10-04');
    const got = { a: [], b: [], o: [] };
    ['cfg', 'song', 'songs:changed', 'anno:add'].forEach((n) => { a.on(n, (p) => got.a.push([n, p])); b.on(n, (p) => got.b.push([n, p])); other.on(n, (p) => got.o.push([n, p])); });
    ok(rt.broadcast(DATE, 'cfg', { kind: 'map', key: 'K', value: { 1: 0 } }), 'cfg 전달');
    ok(rt.broadcast(DATE, 'song', { seq: 1, kind: '콘티', patch: { bpm: '80' } }), 'song 전달');
    ok(rt.broadcast(DATE, 'songs:changed', { t: 1 }), 'songs:changed 전달');
    ok(!rt.broadcast(DATE, 'anno:add', { item: {} }), '필기 이벤트는 이 통로로 보낼 수 없음');
    ok(!rt.broadcast('아무거나', 'cfg', {}), '이상한 방 이름은 거절');
    await sleep(300);
    eq(got.a.map((x) => x[0]), ['cfg', 'song', 'songs:changed'], '방 사람 A 가 3개를 받음'); eq(got.b.map((x) => x[0]), ['cfg', 'song', 'songs:changed'], '방 사람 B 도');
    eq(got.o, [], '다른 방 사람은 아무것도 못 받음');
    eq(got.a[0][1].value, { 1: 0 }, '내용이 그대로 도착');
    [a, b, other].forEach((c) => c.close()); await rt.close(); server.close();
  }
  process.exit(T.summary() ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
