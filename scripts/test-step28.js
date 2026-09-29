/**
 * Step 2.8 시험 (서버) — 진짜 구글 없이(scripts/fake-google.js) 확인합니다.
 *   node scripts/test-step28.js
 *  A. 녹음 자동 링크 : 요일 분류 · 어수선한 파일 이름 · 하위 폴더 · 중복 · 시간 초과 · 폴더 오류 · 원본 보호
 *  B. 악보 저장소   : 저장 · 검색 · 콘티에 걸기 · 지울 때 원본 보호 · 권한
 *  C. 가사 보관     : 저장 · 읽기 · 지우기
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });

const FOLDER = 'application/vnd.google-apps.folder';
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n' + '1 0 obj<<>>endobj\n'.repeat(12) + '%%EOF').toString('base64');
const SUN = '2026-09-27', SAT = '2026-09-26';

function main() {
  const env = newEnv();
  const { fake, run } = env;
  const ADM = 'ADM';

  section('A0. 순수 함수 — 파일 판별 · 이름 정리 · 요일 분류');
  const f = (fn, ...a) => run((api) => api[fn](...a));
  ['a.mp3', 'B.MP3', 'c.m4a', 'd.wav', 'e.WAV ', '녹음 1.Mp3\u00a0', 'x.mp3 (1)', 'y.mp3.download'].forEach((n) => ok(f('소리파일인가_', n, ''), '녹음으로 인식: ' + JSON.stringify(n)));
  ok(f('소리파일인가_', '이름만', 'audio/mpeg'), '확장자가 없어도 형식이 audio/mpeg 면 녹음');
  ok(f('소리파일인가_', '이름', 'audio/x-m4a'), 'audio/x-m4a 도 녹음');
  ['악보.pdf', 'a.mp4', 'a.txt', 'mp3', 'a.mp3x'].forEach((n) => ok(!f('소리파일인가_', n, 'application/pdf'), '녹음 아님: ' + n));
  eq(f('녹음이름정리_', '20260927_주님은_나의목자(1).MP3'), '주님은 나의목자', '날짜 · 밑줄 · 복사본 번호 · 확장자 정리');
  eq(f('녹음이름정리_', '2026-09-27 예배 실황.m4a'), '예배 실황', '2026-09-27 날짜 머리 제거');
  eq(f('녹음이름정리_', 'REC_00123.wav'), 'REC_00123', '이름이 기기 번호뿐이면 원래 이름을 지키지 않고 확장자만 뗌');
  eq(f('녹음이름정리_', '   .mp3'), '녹음', '이름이 비면 "녹음"');
  eq(f('요일번호_', SUN), 0, '2026-09-27 = 주일'); eq(f('요일번호_', SAT), 6, '2026-09-26 = 토요일'); eq(f('요일번호_', 'x'), -1, '이상한 날짜는 -1');
  eq(f('녹음분류_', SAT, SAT, SUN).en, 'Saturday Practice', '토요일 → Saturday Practice');
  eq(f('녹음분류_', SUN, SAT, SUN).ko, '주일 예배', '주일 → 주일 예배');
  eq(f('녹음분류_', '2026-09-23', SAT, SUN), null, '수요일 파일은 제외');
  eq(f('녹음분류_', '2026-09-19', SAT, SUN), null, '지난 주 토요일은 제외');

  section('A1. 자동 링크 — 하위 폴더까지 찾고 요일로 나눔');
  const root = fake.addFolder('녹음', '');
  const sub1 = fake.addFolder('9월 27일', root.id), sub2 = fake.addFolder('연습', sub1.id), other = fake.addFolder('보관', root.id);
  const mk = (name, parent, created, mime) => fake.addFile({ name, parent, created, mimeType: mime || 'audio/mpeg', bytes: 'xx' });
  const satNight = mk('20260926_토요일밤(1).MP3 ', sub2.id, '2026-09-27T02:00:00Z');       // 토요일 밤 10시(토론토) — UTC 로는 일요일
  const satDay = mk('찬양 연습.m4a', root.id, '2026-09-26T15:00:00Z', 'audio/x-m4a');
  const sunA = mk('주일예배_전체.wav', sub1.id, '2026-09-27T15:30:00Z', 'audio/wav');
  const noExt = mk('이름만있음', other.id, '2026-09-27T16:00:00Z', 'audio/mpeg');
  mk('가사.pdf', root.id, '2026-09-26T15:00:00Z', 'application/pdf');
  mk('수요기도.mp3', root.id, '2026-09-23T15:00:00Z');
  mk('지난주.mp3', sub1.id, '2026-09-20T15:00:00Z');
  const trash = mk('버림.mp3', root.id, '2026-09-26T16:00:00Z'); fake.files.get(trash.id).trashed = true;
  run((api) => api.설정저장_('찬양음원폴더', root.id));

  const r1 = run((api) => api.worshipAutoLinkRecordings(ADM, SUN));
  eq(r1.report.added.length, 4, '이 주 토 · 일 녹음 4개를 링크 (밤 10시 파일 포함)');
  eq(r1.report.added.map((a) => a.category).sort(), ['Saturday Practice', 'Saturday Practice', 'Sunday Worship', 'Sunday Worship'], '토요일 연습 2 · 주일 예배 2');
  ok(r1.report.added.some((a) => a.title === '[토요일 연습] 토요일밤'), '이름이 정리되고 분류 이름이 붙음: ' + r1.report.added.map((a) => a.title).join(' / '));
  ok(r1.report.added.some((a) => a.title === '[주일 예배] 이름만있음'), '확장자 없는 파일도 형식으로 링크');
  eq(r1.report.skipped.otherDay, 2, '수요일 · 지난 주 파일은 제외');
  eq(r1.report.timedOut, false, '시간 초과 아님');
  ok(r1.report.folders >= 4, '하위 폴더까지 훑음 (폴더 ' + r1.report.folders + ')');
  const recs = r1.week.recs;
  eq(recs.length, 4, '이 주 녹음 목록에 4개');
  eq(recs.filter((x) => x.kind === '연습').length, 2, '연습 2');
  ok(recs.every((x) => /^\/audio\/[A-Za-z0-9_-]{10,}$/.test(x.play)), '재생 주소는 /audio/<파일ID>');
  ok(recs.every((x) => x.url.indexOf('https://drive.google.com/file/d/') === 0), '드라이브 링크(getUrl)가 그대로 들어감');
  ok(run((api) => api.녹음파일허용_(satDay.id)), '서버가 그 파일을 흘려보내도록 허용됨');
  const tab = fake.values(env.legacy.id, '찬양녹음');
  ok(tab.slice(1).every((row) => row[3] === '' && /drive\.google\.com/.test(row[4])), '파일ID 칸은 비우고 링크 칸에만 넣음 (원본 보호)');

  section('A2. 다시 누르면 중복 없이 · 새 파일만');
  const r2 = run((api) => api.worshipAutoLinkRecordings(ADM, SUN));
  eq(r2.report.added.length, 0, '두 번째는 새로 넣는 것 없음'); eq(r2.report.skipped.duplicate, 4, '4개는 이미 링크됨');
  ok(/이미 링크된 녹음 4개/.test(r2.report.message), '메시지: ' + r2.report.message);
  mk('늦게올린.mp3', sub1.id, '2026-09-27T20:00:00Z');
  const r3 = run((api) => api.worshipAutoLinkRecordings(ADM, SUN));
  eq(r3.report.added.map((a) => a.title), ['[주일 예배] 늦게올린'], '새로 올라온 파일만 추가');
  eq(r3.week.recs.length, 5, '목록 5개');

  section('A3. 자동 링크된 녹음을 지워도 드라이브 원본은 남음');
  const rid = r3.week.recs[0].id;
  run((api) => api.removeWorshipRecording(ADM, SUN, rid));
  ok(![satNight, satDay, sunA, noExt].some((x) => fake.files.get(x.id).trashed), '원본 파일은 휴지통으로 가지 않음');

  section('A4. 시간 초과 · 폴더 오류 · 권한');
  const rt = fake.addFolder('큰폴더', ''); for (let i = 0; i < 6; i++) fake.addFolder('하위' + i, rt.id);
  run((api) => api.설정저장_('찬양음원폴더', rt.id));
  const realNow = Date.now; let shift = 0;
  Date.now = () => realNow() + shift;
  fake.fail = (svc, m) => { if (m === 'files.list') shift += 10000; return false; };       // 폴더를 열 때마다 10초가 걸리는 셈
  let r4; try { r4 = run((api) => api.worshipAutoLinkRecordings(ADM, '2026-10-04')); } finally { Date.now = realNow; fake.fail = null; }
  eq(r4.report.timedOut, true, '시간이 넘으면 timedOut 표시'); ok(/시간/.test(r4.report.message), '시간 초과 안내: ' + r4.report.message);
  run((api) => api.설정저장_('찬양음원폴더', 'notafolder123456'));
  throws(() => run((api) => api.worshipAutoLinkRecordings(ADM, SUN)), /녹음 폴더를 열 수 없습니다/, '폴더를 못 열면 알아듣기 쉬운 오류');
  throws(() => run((api) => api.worshipAutoLinkRecordings('nobody', SUN)), /포털|권한|찬양/, '권한 없는 사람은 거절');
  throws(() => run((api) => api.worshipAutoLinkRecordings(ADM, 'x')), /날짜/, '이상한 날짜는 거절');
  run((api) => api.설정저장_('찬양음원폴더', root.id));

  section('B. 악보 저장소');
  const save = (o, d) => run((api) => api.worshipRepoSave(ADM, o, d === undefined ? PDF : d));
  const s1 = save({ title: '주님은 나의 목자', date: '2026-09-20', leader: '김인도', pages: 2, source: '전체악보.pdf', key: 'G', bpm: 72, note: '2~3쪽' });
  ok(s1.item.id && /^\/sheet\//.test(s1.item.url), '저장되면 ID · /sheet 주소');
  const s2 = save({ title: 'Way Maker', date: '2026-09-27', leader: '박인도', pages: 3 });
  eq(run((api) => api.worshipRepoList(ADM, '')).total, 2, '목록 2개');
  eq(run((api) => api.worshipRepoList(ADM, '목자')).items.map((x) => x.title), ['주님은 나의 목자'], '제목으로 검색');
  eq(run((api) => api.worshipRepoList(ADM, '박인도 way')).items.map((x) => x.title), ['Way Maker'], '인도자 + 제목 낱말로 검색');
  eq(run((api) => api.worshipRepoList(ADM, '2026-09-20')).items.length, 1, '날짜로 검색');
  eq(run((api) => api.worshipRepoList(ADM, '')).items[0].title, 'Way Maker', '최근 날짜가 먼저');
  const rowsB = fake.values(env.legacy.id, '악보저장소');
  eq(rowsB[0].slice(0, 4), ['ID', '제목', '날짜', '인도자'], '탭이 만들어지고 머리글이 있음');
  eq([require('../lib/db').keyFor('악보저장소'), require('../lib/db').keyFor('찬양가사')], ['worship', 'worship'], '두 탭 모두 [DB05] 찬양 · 방송 허브로 배정');
  throws(() => save({ title: '' }), /제목/, '제목 필수');
  throws(() => save({ title: 'x' }, 'data:text/plain;base64,QUJD'), /PDF/, 'PDF 가 아니면 거절');
  throws(() => save({ title: 'x' }, 'data:application/pdf;base64,' + Buffer.from('not a pdf at all, just some text that is long enough to pass the size check........................................................................').toString('base64')), /PDF 파일이 아닙니다/, '내용이 PDF 가 아니면 거절');
  ok(run((api) => api.찬양악보파일허용_(s1.item.fileId)), '저장소 파일도 /sheet 로 열 수 있음');

  const add = run((api) => api.worshipRepoAddToSetlist(ADM, SUN, [s1.item.id, s2.item.id, 'rp-없음'], '콘티'));
  eq([add.added, add.missing], [2, 1], '2개 걸림 · 없는 것 1개 무시');
  eq(add.week.sheets.map((x) => x.name), ['주님은 나의 목자.pdf', 'Way Maker.pdf'], '콘티 악보에 곡 제목 이름으로 걸림');
  eq(run((api) => api.worshipRepoAddToSetlist(ADM, SUN, [s1.item.id], '콘티')).duplicate, 1, '같은 악보를 두 번 걸지 않음');
  run((api) => api.removeWorshipSheet(ADM, SUN, s1.item.fileId));
  ok(!fake.files.get(s1.item.fileId).trashed, '콘티에서 빼도 저장소의 PDF 는 지워지지 않음');
  const rm = run((api) => api.worshipRepoRemove(ADM, s2.item.id));
  eq(rm.kept, true, '콘티에 걸려 있는 악보는 저장소에서만 빠지고 파일은 남음');
  ok(!fake.files.get(s2.item.fileId).trashed, '…파일 그대로');
  run((api) => api.removeWorshipSheet(ADM, SUN, s2.item.fileId));
  ok(fake.files.get(s2.item.fileId).trashed, '저장소에서 빠진 뒤 콘티에서도 빼면 그때 지워짐');
  const rm2 = run((api) => api.worshipRepoRemove(ADM, s1.item.id));
  eq(rm2.list.length, 0, '저장소 비움'); ok(fake.files.get(s1.item.fileId).trashed, '아무 데도 안 쓰이면 파일도 지움');
  throws(() => run((api) => api.worshipRepoSave('nobody', { title: 'x' }, PDF)), /포털|권한|찬양/, '권한 없는 사람은 저장 못 함');

  section('C. 가사 보관');
  const l1 = run((api) => api.worshipLyricsSave(ADM, 'Way Maker', '[Verse 1]\nYou are here\nMoving in our midst\n\n[Chorus]\nWay maker'));
  ok(l1.lyrics['waymaker'] && /Moving in our midst/.test(l1.lyrics['waymaker'].text), '제목 키(공백 · 대소문자 무시)로 보관');
  run((api) => api.worshipLyricsSave(ADM, ' way  MAKER ', '고친 가사'));
  eq(run((api) => api.worshipLyricsList(ADM)).waymaker.text, '고친 가사', '같은 곡은 덮어씀 (한 곡 = 한 벌)');
  const long = 'ㄱ'.repeat(100000);
  eq(run((api) => api.worshipLyricsSave(ADM, '긴 곡', long)).lyrics['긴곡'].text.length, 100000, '5만 자 넘는 긴 가사도 여러 칸에 나눠 저장하고 그대로 읽음');
  run((api) => api.worshipLyricsRemove(ADM, 'Way Maker'));
  ok(!run((api) => api.worshipLyricsList(ADM)).waymaker, '지우기');
  throws(() => run((api) => api.worshipLyricsSave(ADM, '  ', 'x')), /제목/, '제목 필수');
  T.summary();
  process.exit(T.summary && 0);
}
main();
