/**
 * Hub v4 시험 (서버 · 순수 로직)
 *   node scripts/test-hub4.js
 *  A. @태그        : 풀이(조사 · 긴 이름 우선 · 이메일 제외) · 조각 나누기 · HTML 안전
 *  B. 카카오톡 글   : 요청서의 한국어 템플릿과 글자 하나까지 같은지
 *  C. 유튜브 버전   : 팀 · 버전 이름 · 길이 · 조회수 글
 *  D. 안전 다운로드 : 내부망 주소 차단 · https 만 · 그림 파일만 (lib/safe-fetch.js)
 *  E. 서버 · 태그   : 서버 풀이 = 화면 풀이 · 포털 "내 할 일" · 치우기/다시 뜨기 · 알림 버튼
 *  F. 검색         : 유튜브 · 악보 이미지 (구글 응답은 흉내) · 열쇠가 화면으로 새지 않는지 · 권한 · 캐시
 *  G. 이미지 가져오기: 악보로 저장(드라이브 + 시트) · 실패하면 "직접 올리기" 안내
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv, TODAY } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });
const BRIDGE = require.resolve('../lib/bridge');
const C = require('../public/worship/conti.js');
const SF = require('../lib/safe-fetch');
const PHONE = (n) => String(4165551000 + n);          // fixture 의 PEOPLE 순서: 최셀장 6 · 노셀장 7 · 정일반 8 · 윤팀장 9

const CTX = { slots: { lead: ['윤팀장'], egt: ['최셀장'], piano: ['노셀장'], synth: [], drum: ['정일반'], mvocal: ['이예배', '강허용'] }, roster: ['윤팀장', '최셀장', '노셀장', '정일반', '이예배', '강허용'] };

function nextSunday(plus) { const d = new Date(TODAY + 'T12:00:00'); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + (plus || 0)); return d.toLocaleDateString('en-CA'); }
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');

async function main() {
  section('A. @태그 풀이');
  {
    const A = (t) => C.analyze(t, CTX);
    let a = A('@일렉 솔로 구간 있음');
    eq([a.length, a[0].tag, a[0].kind, a[0].names, a[0].line], [1, '@일렉', 'pos', ['최셀장'], '@일렉 솔로 구간 있음'], '@일렉 → 이 주 일렉 담당');
    eq(A('@일렉은 조용히')[0].tag, '@일렉', '조사가 붙어도("@일렉은") 알아봄');
    eq(A('@일렉기타 클린톤')[0].tag, '@일렉기타', '더 긴 이름("일렉기타")이 우선');
    eq(A('@건반 코드만')[0].names, ['노셀장'], '@건반 = 피아노 + 신디 (신디는 비어 있음)');
    eq(A('@기타')[0].keys, ['egt', 'agt'], '@기타 = 일렉 + 어쿠');
    eq(A('@싱어 화음')[0].names, ['이예배', '강허용'], '@싱어 = 남싱 + 여싱');
    a = A('@노셀장님 부탁드려요'); eq([a[0].kind, a[0].tag, a[0].names], ['name', '@노셀장', ['노셀장']], '@이름 (뒤의 "님"은 글로 남음)');
    eq(A('문의 abc@def.com').length, 0, '이메일 주소는 태그가 아님');
    eq(A('@없는태그 확인')[0].kind, 'none', '모르는 태그는 none (배지는 흐리게)');
    eq(A('@전체 주목')[0].names.sort(), ['강허용', '노셀장', '윤팀장', '이예배', '정일반', '최셀장'], '@전체 = 이 주 편성 모두');
    eq(A('@찬양팀 모여요')[0].names.sort(), ['강허용', '노셀장', '윤팀장', '이예배', '정일반', '최셀장'], '@찬양팀 = 연주 · 싱어 자리 모두');
    eq(A('@방송팀 확인')[0].names, [], '@방송팀 = 방송 자리 (이 주는 배정 없음)');
    eq(A('전조 후\n  - @드럼 빌드업\n끝')[0].line, '@드럼 빌드업', '태그가 든 줄만 · 글머리 기호는 뗌');
    eq(A('@ppt 가사 크게').map((x) => x.keys), [['ppt']], '@ppt 대소문자 무시');
    eq(A('@일렉 @드럼 같이').map((x) => x.tag), ['@일렉', '@드럼'], '한 줄에 두 개');
    ['@일렉 솔로', '앞 @피아노는 뒤', '@ 홀로', '메일 a@b.com @베이스', '@김 @노셀장님', '', null].forEach((t, i) => eq(C.segments(t, CTX).map((s) => s.s).join(''), String(t || ''), '조각을 이어 붙이면 원문 그대로 #' + i));
    const html = C.noteHtml('<img src=x onerror=alert(1)> @일렉 & "따옴표"', CTX);
    ok(html.indexOf('<img') === -1 && html.indexOf('&lt;img') >= 0, 'HTML 은 무조건 이스케이프 (XSS 없음)');
    ok(/class="cn-mt cn-mt-g"[^>]*>@일렉/.test(html), '@일렉 배지 (기타 계열 색)');
    ok(html.indexOf('최셀장') >= 0, '배지에 이 주 담당자 이름');
    ok(/cn-mt-none/.test(C.noteHtml('@없는태그', CTX)), '모르는 태그는 흐린 배지');
    ok(/cn-mt-empty/.test(C.noteHtml('@베이스 확인', CTX)), '담당자가 없는 자리는 점선 배지');
  }

  section('B. 카카오톡 콘티 글 — 요청서 템플릿 그대로');
  {
    const W = { date: '2026-10-04', day: '2026-10-04', event: null, session: null, slots: CTX.slots,
      songs: [{ title: '주님의 사랑', team: '마커스', key: 'G', form: 'V1-C-V2-B-C-O', note: '@일렉 솔로 구간 있음', link: 'https://youtu.be/abc12345678' },
        { title: '예수 나의 힘', team: '', key: '', form: '', note: '', link: '' },
        { title: '여호와 이레', team: '어노인팅', key: 'A', form: 'V-C', note: '첫 줄\n\n@피아노 인트로 길게\n  ', link: '' }],
      finals: [{ title: '결단 곡', key: 'D', link: 'https://youtu.be/zzz98765432' }, { title: '두 번째 결단', key: '', link: '' }] };
    const expect = [
      '[2026년 10월 04일] 주일예배 콘티', '',
      '인도자: 윤팀장 | 남싱: 이예배, 강허용 | 메인건반: 노셀장 | 세컨건반: - | 일렉: 최셀장 | 베이스: - | 드럼: 정일반', '',
      '#1. 주님의 사랑 - 마커스 (Key: G)', '- 송폼: V1-C-V2-B-C-O', '- 곡 설명: @일렉 솔로 구간 있음', '- YouTube: https://youtu.be/abc12345678', '',
      '#2. 예수 나의 힘', '',
      '#3. 여호와 이레 - 어노인팅 (Key: A)', '- 송폼: V-C', '- 곡 설명: 첫 줄\n  \n  @피아노 인트로 길게',
      '', '[결단찬양]', '# 결단 곡 (Key: D)', '- YouTube: https://youtu.be/zzz98765432', '', '# 두 번째 결단'].join('\n');
    eq(C.kakaoText(W), expect, '카톡 글이 템플릿과 정확히 같음 (빈 줄 · 빈 항목 생략 · "-" 자리)');
    ok(!/[가-힣]/.test('YYYY') && /^\[\d{4}년 \d{2}월 \d{2}일\] 주일예배 콘티\n\n인도자: /.test(C.kakaoText(W)), '머리글 모양: [YYYY년 MM월 DD일] 주일예배 콘티 + 빈 줄 + 인도자 줄');
    ok(!/English|Leader|Song form|Description/.test(C.kakaoText(W)), '한국어로만 (영어 머리글 없음)');
    eq(C.kakaoText(Object.assign({}, W, { event: { name: '겨울 수련회' }, session: { label: '금요 집회' } })).split('\n')[0], '[2026년 10월 04일] 겨울 수련회 · 금요 집회 콘티', '행사는 행사 이름으로');
    eq(C.kakaoText({ date: '2026-10-04', slots: {}, songs: [], finals: [] }).split('\n').slice(0, 3).join('|'), '[2026년 10월 04일] 주일예배 콘티||인도자: - | 남싱: - | 메인건반: - | 세컨건반: - | 일렉: - | 베이스: - | 드럼: -', '곡이 없어도 깨지지 않음');
    eq(C.ytLink('abcdefghijk'), 'https://youtu.be/abcdefghijk', '영상 번호만 있으면 주소로');
    eq(C.ytLink('https://www.youtube.com/watch?v=abc12345678&t=5'), 'https://www.youtube.com/watch?v=abc12345678&t=5', '주소는 저장된 그대로');
  }

  section('C. 유튜브 버전 이름');
  {
    eq(C.versionLabel({ channel: 'Markers Worship - Topic', title: '주님의 사랑 (Live)', at: '2019-05-02' }), 'Markers Worship · Live · 2019', '채널 · 버전 · 연도');
    eq(C.versionLabel({ channel: '어노인팅VEVO', title: '주님의 사랑 어쿠스틱', at: '2021-01-01' }), '어노인팅 · Acoustic · 2021', 'VEVO 떼기 · 어쿠스틱');
    eq(C.versionLabel({ channel: '개인채널', title: '그냥 영상', at: '' }), '개인채널', '특징 글이 없으면 채널만');
    ok(C.versionLabel({ channel: 'x'.repeat(80), title: '', at: '' }).length <= 40, '40자 이내');
    eq([C.fmtDur(253), C.fmtDur(3725), C.fmtDur(0)], ['4:13', '1:02:05', ''], '길이 글');
    eq([C.fmtViews(1234), C.fmtViews(123456), C.fmtViews(0)], ['1234회', '12.3만 회', ''], '조회수 글');
  }

  section('D. 안전 다운로드 (lib/safe-fetch.js)');
  {
    ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '224.0.0.1', '::'].forEach((ip) => ok(SF.privateIp(ip), ip + ' 는 내부 주소로 막힘'));
    ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2607:f8b0:4004:c07::71'].forEach((ip) => ok(!SF.privateIp(ip), ip + ' 는 바깥 주소로 허용'));
    ['http://example.com/a.png', 'ftp://example.com/a.png', 'https://127.0.0.1/a.png', 'https://[::1]/a.png', 'https://u:p@example.com/a.png', 'https://example.com:8443/a.png', 'javascript:alert(1)', '', 'not a url', 'file:///etc/passwd']
      .forEach((u) => throws(() => SF.checkImageUrl(u), /그림 주소|https/, '주소 거절: ' + (u || '(빈 값)')));
    eq(SF.checkImageUrl('https://img.example.com/a.png?x=1').hostname, 'img.example.com', '정상 https 주소는 통과');
    eq([SF.imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), SF.imageKind(PNG), SF.imageKind(Buffer.from('GIF89a......')), SF.imageKind(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), SF.imageKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), SF.imageKind(Buffer.from('<html>'))],
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp', '', ''], '파일 앞부분으로 그림 종류 확인 (svg · html 은 거절)');
    let err = ''; try { await SF.fetchImageSafe('https://localhost/x.png'); } catch (e) { err = e.message; }
    ok(/허용되지 않는 주소/.test(err), 'localhost 는 이름을 풀어 보니 내부 주소 → 연결 전에 거절 (' + err + ')');
    err = ''; try { await SF.fetchImageSafe('http://example.com/x.png'); } catch (e) { err = e.message; }
    ok(/https/.test(err), 'http 는 거절');
  }

  section('E. 서버 · @태그 → 포털 "내 할 일"');
  const DATE = nextSunday(7), PAST = '2026-01-04';
  const env = newEnv((tabs) => {
    tabs['사역팀'].push(['Kairos 찬양팀', '예배영성부', '', '윤팀장', '']);
    ['최셀장:Electric Guitar', '노셀장:Piano', '정일반:Drums', '이예배:Vocal'].forEach((x) => tabs['사역팀원'].push(['Kairos 찬양팀', x.split(':')[0], x.split(':')[1]]));
    tabs['찬양편성'] = [['날짜', '포지션', '이름'], [DATE, 'lead', '윤팀장'], [DATE, 'egt', '최셀장'], [DATE, 'piano', '노셀장'], [DATE, 'drum', '정일반'], [DATE, 'mvocal', '이예배']];
  });
  const run = env.run, ADM = 'ADM';
  const stub = require.cache[BRIDGE].exports, baseCall = stub.call, calls = [];
  let net = () => { throw new Error('시험에서 예상하지 못한 외부 호출'); };
  stub.call = (op, a) => (op === 'fetch' || op === 'fetchImage') ? (calls.push({ op, a }), net(op, a)) : baseCall(op, a);
  const tok = (n, i) => run((api) => api.포털토큰_(n, PHONE(i), ''));
  const T최 = tok('최셀장', 6), T노 = tok('노셀장', 7), T정 = tok('정일반', 8), T윤 = tok('윤팀장', 9), T외 = tok('오팀장', 10);   // T외: 찬양팀 밖 사람 (찬양팀 멤버는 원래 편집 가능)
  {
    run((api) => api.saveWorshipSongs(ADM, DATE, '콘티', [
      { title: '주님의 사랑', team: '마커스', key: 'G', bpm: '72', form: 'V1-C', link: '', note: '@일렉 솔로 구간 있음\n간주 길게', solo: [] },
      { title: '예수 나의 힘', team: '', key: 'A', bpm: '', form: '', link: '', note: '@피아노 인트로 @정일반 스틱 카운트', solo: [] }]));
    run((api) => api.saveWorshipSong(ADM, DATE, { kind: '결단', title: '결단 곡', key: 'D', note: '@드럼 브릿지에서 빌드업' }));
    run((api) => api.saveWorshipSong(ADM, PAST, { kind: '콘티', title: '지난 곡', key: 'D', note: '@일렉 지난 주 메모' }));

    // 서버 풀이 = 화면 풀이
    const corpus = ['@일렉 솔로', '@일렉은 조용히', '@일렉기타 클린', '@건반', '@기타', '@싱어', '@노셀장님', '@정일반 스틱', '@없는태그', '@전체', '@찬양팀', '@방송팀', '@ppt 가사', '- @드럼 빌드업', '문의 a@b.com', '@피아노 인트로\n@베이스 루트', '@남싱 @여싱', '@인도 멘트', '@신디 패드', '@어쿠 스트럼', '@음향 리버브', '@코디 진행', '@김 @윤팀장'];
    const roster = Object.keys(run((api) => api.찬양명단_()));
    const slots = run((api) => api.멘션편성_(DATE));
    eq(slots.egt, ['최셀장'], '편성을 서버가 읽음');
    corpus.forEach((t) => { const S = run((api) => api.멘션분석_(t, { slots, roster })), Cc = C.analyze(t, { slots, roster }); eq(S, Cc, '서버 풀이 = 화면 풀이: ' + JSON.stringify(t)); });

    // 포털 내 할 일
    const items = (t) => run((api) => api.myTodos(t)).list.filter((x) => /^conti-/.test(x.id));
    let i최 = items(T최);
    eq(i최.length, 1, '최셀장(일렉): 할 일 1개');
    ok(/@일렉/.test(i최[0].title) && /주님의 사랑/.test(i최[0].title) && /#1/.test(i최[0].title), '제목에 태그 · 곡 이름 · 순서: ' + i최[0].title);
    ok(/솔로 구간 있음/.test(i최[0].sub) && !/간주 길게/.test(i최[0].sub), '부제는 태그가 든 줄만: ' + i최[0].sub);
    eq(i최[0].icon, '🎸', '일렉 아이콘');
    ok(/page=worship/.test(i최[0].url), '눌러서 찬양 허브로');
    const i노 = items(T노), i정 = items(T정), i윤 = items(T윤);
    eq(i노.map((x) => x.title.replace(/ \(.*/, '')), ['@피아노 · 예수 나의 힘'], '노셀장(피아노): 2번 곡');
    eq(i정.map((x) => x.title.replace(/ \(.*/, '')).sort(), ['@드럼 · 결단 곡', '@정일반 · 예수 나의 힘'].sort(), '정일반: @드럼(결단찬양) + @이름 두 개');
    ok(i정.some((x) => /결단찬양/.test(x.title)), '결단찬양 표시');
    eq(i윤.length, 0, '태그 안 된 사람(윤팀장)에게는 없음');
    ok(!items(T최).some((x) => /지난 곡/.test(x.title)), '지난 날짜 콘티는 안 뜸');

    // 치우기 → 다시 안 뜸 → 지시 글을 고치면 다시 뜸
    run((api) => api.hideTodo(T최, i최[0].id));
    eq(items(T최).length, 0, '치우면 사라짐');
    // saveWorshipSongs 는 뒤에 이어 붙이는 함수라, 같은 곡의 글을 고칠 때는 saveWorshipSong(seq) 로 바꿉니다
    run((api) => api.saveWorshipSong(ADM, DATE, { kind: '콘티', seq: 1, title: '주님의 사랑', team: '마커스', key: 'G', bpm: '72', form: 'V1-C', note: '@일렉 솔로 두 번!\n간주 길게' }));
    i최 = items(T최);
    eq(i최.length, 1, '지시 글이 바뀌면 치운 것도 다시 뜸');
    run((api) => api.showAllTodos(T최));

    // 편성이 나중에 바뀌어도 맞음 (읽을 때 계산)
    run((api) => api.saveWorshipSong(ADM, DATE, { kind: '콘티', seq: 1, title: '주님의 사랑', key: 'G', note: '@베이스 루트로' }));
    eq(items(T최).length, 0, '노트가 바뀌면 일렉 할 일은 없어짐');

    // 알림 버튼 — 팀 알림 + @태그로 부른 사람 수
    const r = run((api) => api.sendWorshipNotify(ADM, DATE, 'setlist', true));
    ok(r.people >= 4, '팀 알림 대상: ' + r.people + '명');
    eq(r.mention, 2, '개인 알림 대상 = 실제 배정된 사람만, 중복 없이 (노셀장 · 정일반. @베이스는 배정 없음)');
    const r2 = run((api) => api.sendWorshipNotify(ADM, DATE, 'sheet', true));
    ok(r2.mention === undefined, '악보 알림에는 개인 태그 알림이 붙지 않음');
    run((api) => api.saveWorshipSong(ADM, DATE, { kind: '콘티', seq: 1, title: '주님의 사랑', key: 'G', note: '@일렉 솔로 구간 있음' }));
  }

  section('F. 검색 — 유튜브 · 악보 이미지');
  {
    const KEYS = ['YOUTUBE_API_KEY', 'GOOGLE_CSE_API_KEY', 'GOOGLE_CSE_CX', 'BRAVE_SEARCH_API_KEY'];
    KEYS.forEach((k) => delete process.env[k]);
    let r = run((api) => api.worshipYoutubeSearch(ADM, '주님의 사랑 마커스'));
    ok(r.ok === false && r.reason === 'nokey' && /youtube\.com\/results\?search_query=/.test(r.openUrl), '열쇠가 없으면 안내 + 유튜브 검색 링크');
    ok(calls.length === 0, '열쇠가 없으면 바깥에 요청하지 않음');
    r = run((api) => api.worshipScoreImageSearch(ADM, '주님의 사랑 악보'));
    ok(r.ok === false && r.reason === 'nokey' && /google\.com\/search\?tbm=isch/.test(r.openUrl), '이미지 열쇠가 없으면 안내 + 구글 이미지 링크');
    throws(() => run((api) => api.worshipYoutubeSearch(ADM, '   ')), /검색어/, '빈 검색어는 거절');
    throws(() => run((api) => api.worshipYoutubeSearch(T외, '주님의 사랑')), /팀장|속한|다시/, '편집 권한이 없으면 거절 (검색 사용량 보호)');
    throws(() => run((api) => api.worshipScoreImageSearch(T외, '악보')), /팀장|속한|다시/, '이미지 검색도 편집 권한만');

    process.env.YOUTUBE_API_KEY = 'SECRETKEY-yt-123';
    const json = (o, status) => ({ status: status || 200, headers: { 'content-type': 'application/json' }, bytes: Buffer.from(JSON.stringify(o)) });
    net = (op, a) => {
      if (/youtube\/v3\/search/.test(a.url)) return json({ nextPageToken: 'NEXT1', items: [
        { id: { videoId: 'aaaaaaaaaaa' }, snippet: { title: '주님의 사랑 &amp; 은혜 (Live) &#39;2019&#39;', channelTitle: '마커스워십', publishedAt: '2019-05-02T00:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg' } } } },
        { id: { videoId: 'bbbbbbbbbbb' }, snippet: { title: '주님의 사랑 어쿠스틱', channelTitle: '어노인팅 - Topic', publishedAt: '2021-01-01T00:00:00Z', thumbnails: {} } },
        { id: { kind: 'youtube#channel' }, snippet: { title: '채널' } }] });
      if (/youtube\/v3\/videos/.test(a.url)) return json({ items: [{ id: 'aaaaaaaaaaa', contentDetails: { duration: 'PT4M13S' }, statistics: { viewCount: '123456' } }, { id: 'bbbbbbbbbbb', contentDetails: { duration: 'PT1H2M5S' }, statistics: {} }] });
      throw new Error('예상 못한 주소 ' + a.url);
    };
    r = run((api) => api.worshipYoutubeSearch(ADM, '  주님의   사랑 마커스 '));
    ok(r.ok && r.items.length === 2 && r.next === 'NEXT1', '검색 결과 2개 (영상만) + 다음 쪽 번호');
    eq(r.items[0], { id: 'aaaaaaaaaaa', title: "주님의 사랑 & 은혜 (Live) '2019'", channel: '마커스워십', at: '2019-05-02', thumb: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg', dur: 253, views: 123456 }, '제목의 HTML 글자를 풀고 · 길이 · 조회수 붙임');
    eq([r.items[1].dur, r.items[1].views, r.items[1].thumb], [3725, 0, ''], '조회수가 없어도 깨지지 않음');
    ok(/search_query=%EC%A3%BC%EB%8B%98%EC%9D%98%20%EC%82%AC%EB%9E%91%20%EB%A7%88%EC%BB%A4%EC%8A%A4$/.test(r.openUrl), '검색어의 공백을 정리해서 링크에 넣음');
    ok(JSON.stringify(r).indexOf('SECRETKEY') === -1, '응답 어디에도 열쇠가 없음');
    ok(/relevanceLanguage=ko/.test(calls[0].a.url) && /videoEmbeddable=true/.test(calls[0].a.url) && /maxResults=10/.test(calls[0].a.url), '한국어 우선 · 재생 가능한 영상만 · 10개');
    const before = calls.length;
    const r2 = run((api) => api.worshipYoutubeSearch(ADM, '주님의 사랑 마커스'));
    ok(r2.ok && r2.items.length === 2, '같은 검색을 다시 하면 결과가 같음');
    console.log('    (캐시: 두 번째 검색의 바깥 요청 ' + (calls.length - before) + '번 — 0 이면 캐시 사용)');
    r = run((api) => api.worshipYoutubeSearch(ADM, '다른 곡', 'PAGE 2!<>'));
    ok(/pageToken=PAGE2&/.test(calls[calls.length - 2].a.url), '쪽 번호는 안전한 글자만 남김');

    net = () => json({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }], message: 'quota SECRETKEY-yt-123' } }, 403);
    r = run((api) => api.worshipYoutubeSearch(ADM, '한도 시험 곡'));
    ok(r.ok === false && r.reason === 'quota' && /사용량/.test(r.msg) && r.openUrl, '하루 사용량 초과 → 안내 + 직접 찾기 링크');
    ok(JSON.stringify(r).indexOf('SECRETKEY') === -1, '오류 글에도 열쇠가 없음');
    net = () => json({ error: { code: 400, errors: [{ reason: 'keyInvalid' }] } }, 400);
    r = run((api) => api.worshipYoutubeSearch(ADM, '열쇠 시험 곡')); eq([r.ok, r.reason], [false, 'denied'], '열쇠가 잘못됨');
    net = () => { throw new Error('연결 실패 https://x?key=SECRETKEY-yt-123'); };
    r = run((api) => api.worshipYoutubeSearch(ADM, '연결 시험 곡')); ok(r.ok === false && JSON.stringify(r).indexOf('SECRETKEY') === -1, '연결이 안 돼도 열쇠가 새지 않음');

    process.env.GOOGLE_CSE_CX = 'cx-test-1';
    net = (op, a) => {
      if (/customsearch\/v1/.test(a.url)) return json({ queries: { nextPage: [{ startIndex: 11 }] }, items: [
        { link: 'https://img.example.com/a.png', title: '악보 &amp; 코드', mime: 'image/png', image: { thumbnailLink: 'https://t.example.com/a.jpg', width: 1200, height: 1600, byteSize: 300000, contextLink: 'https://page.example.com/x' } },
        { link: 'http://insecure.example.com/b.png', title: 'http 는 뺌', image: {} },
        { link: 'https://img.example.com/c.jpg', title: 'c', image: { width: 800, height: 600 } }] });
      throw new Error('예상 못한 주소 ' + a.url);
    };
    r = run((api) => api.worshipScoreImageSearch(ADM, '주님의 사랑 악보', 1));
    ok(r.ok && r.items.length === 2 && r.next === 11, '이미지 결과: https 만 · 다음 쪽 시작 번호 11');
    eq(r.items[0], { url: 'https://img.example.com/a.png', thumb: 'https://t.example.com/a.jpg', w: 1200, h: 1600, bytes: 300000, title: '악보 & 코드', page: 'https://page.example.com/x', mime: 'image/png' }, '이미지 항목 모양');
    ok(/searchType=image/.test(calls[calls.length - 1].a.url) && /safe=active/.test(calls[calls.length - 1].a.url) && /cx=cx-test-1/.test(calls[calls.length - 1].a.url), '구글 이미지 검색 · 안전 검색');
    ok(/key=SECRETKEY-yt-123/.test(calls[calls.length - 1].a.url) && JSON.stringify(r).indexOf('SECRETKEY') === -1, 'CSE 열쇠가 없으면 유튜브 열쇠로 대신 — 화면으로는 안 나감');
    r = run((api) => api.worshipScoreImageSearch(ADM, '악보', 500)); ok(/start=91/.test(calls[calls.length - 1].a.url), '시작 번호는 91 까지로 제한');

    // ---- 구글 프로젝트가 막힌 경우 → 안내 문구, 그리고 브레이브로 대체
    net = () => json({ error: { code: 403, message: 'This project does not have the access to Custom Search JSON API.', errors: [{ reason: 'forbidden' }], status: 'PERMISSION_DENIED' } }, 403);
    r = run((api) => api.worshipScoreImageSearch(ADM, '막힌 프로젝트 시험', 1));
    ok(r.ok === false && r.reason === 'denied' && /BRAVE_SEARCH_API_KEY/.test(r.msg) && r.openUrl, '프로젝트가 막혔으면 → 브레이브로 바꾸라는 안내');
    ok(JSON.stringify(r).indexOf('SECRETKEY') === -1, '안내에도 열쇠가 없음');

    process.env.BRAVE_SEARCH_API_KEY = 'SECRETKEY-brave-9';
    const many = Array.from({ length: 25 }, (_, i) => ({ title: '악보 &amp; ' + i, url: 'https://page.example.com/' + i,
      thumbnail: { src: 'https://t.example.com/' + i + '.jpg' }, properties: { url: i === 3 ? 'http://insecure.example.com/x.png' : 'https://img.example.com/' + i + '.png', width: 1000 + i, height: 1400 } }));
    let bn = 0;
    net = (op, a) => {
      if (/api\.search\.brave\.com\/res\/v1\/images\/search/.test(a.url)) { bn++; return json({ results: many }); }
      throw new Error('예상 못한 주소 ' + a.url);
    };
    r = run((api) => api.worshipScoreImageSearch(ADM, '브레이브 시험 곡 악보', 1));
    const bc = calls[calls.length - 1].a;
    ok(r.ok && r.items.length === 10 && r.next === 11, '브레이브: 10장씩 · 다음 쪽 시작 11 (https 아닌 그림은 뺌 → 24장)');
    eq(r.items[0], { url: 'https://img.example.com/0.png', thumb: 'https://t.example.com/0.jpg', w: 1000, h: 1400, bytes: 0, title: '악보 & 0', page: 'https://page.example.com/0', mime: '' }, '브레이브 항목이 구글과 같은 모양');
    ok(/safesearch=strict/.test(bc.url) && /count=60/.test(bc.url) && !/SECRETKEY/.test(bc.url), '안전 검색 · 열쇠는 주소가 아니라 머리글로');
    eq([bc.headers && bc.headers['X-Subscription-Token'], bc.headers && bc.headers.Accept], ['SECRETKEY-brave-9', 'application/json'], '머리글에 열쇠 (서버 안에서만)');
    ok(JSON.stringify(r).indexOf('SECRETKEY') === -1, '응답 어디에도 열쇠가 없음');
    r = run((api) => api.worshipScoreImageSearch(ADM, '브레이브 시험 곡 악보', 11));
    ok(r.ok && r.items.length === 10 && r.next === 21 && r.items[0].url === 'https://img.example.com/11.png', '둘째 쪽: 11번째부터');
    r = run((api) => api.worshipScoreImageSearch(ADM, '브레이브 시험 곡 악보', 21));
    ok(r.ok && r.items.length === 4 && r.next === 0, '마지막 쪽: 남은 4장 · 더 보기 없음');
    eq(bn, 1, '같은 검색의 더 보기는 캐시로 — 바깥 요청 1번');
    process.env.GOOGLE_CSE_CX = 'cx-test-1';
    r = run((api) => api.worshipScoreImageSearch(ADM, '브레이브 우선 시험', 1));
    ok(r.ok && /api\.search\.brave\.com/.test(calls[calls.length - 1].a.url), '구글 열쇠가 있어도 브레이브 열쇠가 있으면 브레이브 우선');
    net = () => json({ message: 'bad token SECRETKEY-brave-9' }, 401);
    r = run((api) => api.worshipScoreImageSearch(ADM, '브레이브 열쇠 오류 시험', 1));
    ok(r.ok === false && r.reason === 'denied' && /열쇠/.test(r.msg) && JSON.stringify(r).indexOf('SECRETKEY') === -1, '브레이브 열쇠 오류(401) → 열쇠 안내, 열쇠 노출 없음');
    net = () => json({}, 429);
    r = run((api) => api.worshipScoreImageSearch(ADM, '브레이브 한도 시험', 1)); eq(r.reason, 'quota', '브레이브 사용량 초과(429) → 한도 안내');
    delete process.env.BRAVE_SEARCH_API_KEY;
  }

  section('G. 이미지 가져오기 → 악보로 저장');
  {
    let hit = null;
    net = (op, a) => { hit = a; return { bytes: new Uint8Array(PNG), type: 'image/png' }; };
    let r = run((api) => api.worshipImportScoreImage(ADM, DATE, '콘티', 'https://img.example.com/a.png', '주님의 사랑', 'https://page.example.com/x'));
    ok(r.ok && r.fileId && r.name === '주님의 사랑 악보.png', '가져오기 성공: ' + JSON.stringify({ ok: r.ok, name: r.name }));
    eq(hit, { url: 'https://img.example.com/a.png', referer: 'https://page.example.com/x' }, '서버가 그림 주소 · 출처 페이지를 넘김');
    ok((r.week.sheets || []).some((f) => f.id === r.fileId && f.name === '주님의 사랑 악보.png'), '악보 목록에 올라감');
    const file = Array.from(env.fake.files.values()).find((f) => f.name === '주님의 사랑 악보.png');
    ok(file && Buffer.compare(Buffer.from(file.bytes), PNG) === 0 && /^image\/png/.test(file.mimeType), '드라이브에 그림 그대로 저장');
    r = run((api) => api.worshipImportScoreImage(ADM, DATE, '결단', 'https://img.example.com/a.png', '결단 곡 / 악보:*?', ''));
    ok(r.ok && r.week.finalSheets.some((f) => f.id === r.fileId), '결단찬양 악보로도 저장 (파일 이름의 금지 글자는 정리: ' + r.name + ')');
    ok(!/[\\/:*?"<>|]/.test(r.name), '파일 이름에 금지 글자 없음');
    net = () => { throw new Error('그림을 받지 못했습니다 (403)'); };
    r = run((api) => api.worshipImportScoreImage(ADM, DATE, '콘티', 'https://img.example.com/blocked.png', '곡', ''));
    ok(r.ok === false && r.reason === 'network' && /직접 올리기/.test(r.msg) && /403/.test(r.msg), '네트워크 실패 → "직접 올리기" 안내 (' + r.msg + ')');
    net = () => ({ bytes: new Uint8Array(0), type: 'image/png' });
    r = run((api) => api.worshipImportScoreImage(ADM, DATE, '콘티', 'https://img.example.com/empty.png', '곡', '')); eq(r.ok, false, '빈 그림도 실패로');
    throws(() => run((api) => api.worshipImportScoreImage(ADM, 'not-a-date', '콘티', 'https://a.example.com/a.png', '곡', '')), /날짜/, '날짜가 이상하면 거절');
    throws(() => run((api) => api.worshipImportScoreImage(T외, DATE, '콘티', 'https://a.example.com/a.png', '곡', '')), /팀장|속한|다시/, '편집 권한이 없으면 거절');
    net = () => { throw new Error('호출되면 안 됨'); };
    const n0 = calls.length;
    try { run((api) => api.worshipImportScoreImage(T외, DATE, '콘티', 'https://a.example.com/a.png', '곡', '')); } catch (e) { /* 권한 오류 */ }
    eq(calls.length, n0, '권한이 없으면 그림을 받으러 나가지도 않음');
  }
  process.exit(T.summary() ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
