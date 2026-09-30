/**
 * Hub v5 시험 (서버 · 순수 로직) — 진짜 구글 · 유튜브 · 제미나이 없이
 *   node scripts/test-hub5.js
 *  A. 설교 자막      : 안드로이드 클라이언트 자막(자동 생성 포함) · 자막이 없으면 "영상으로" 준비 · 요약 저장 · 형식 다시 시키기
 *  B. 매주 자동 요약  : 자막이 없는 영상은 needVideo 로 넘김 · 영상 요약 저장
 *  C. 오늘의 묵상     : 구절 풀이(영어 · 한국어) · 개역한글 본문 · 온라인 읽기표 → 자동 가이드 · 관리자 것 우선 · 끄기
 *  D. 새가족 알림     : 읽지 않은 분만 · 치우면 다음 날에도 안 뜸 · 새 분이 오면 새 알림 · 담당자가 정해지면 사라짐 · 고치기는 푸시 안 함
 *  E. 다른 분 화면    : 그분 로그인 응답과 같은 값(표 · 사람 목록 제외)
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv, TODAY, addDays } = T;
['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });
const BRIDGE = require.resolve('../lib/bridge');
const PHONE = (n) => String(4165551000 + n);
const json = (o, status) => ({ status: status || 200, headers: { 'content-type': 'application/json' }, bytes: Buffer.from(JSON.stringify(o)) });
const text = (t, status) => ({ status: status || 200, headers: { 'content-type': 'text/plain' }, bytes: Buffer.from(String(t)) });
const RSS = '<feed><entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>주일예배 설교 — 부르시는 주님</title><published>2026-09-27T12:00:00Z</published></entry>' +
  '<entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>주일 설교 — 자막 없는 영상</title><published>2026-09-20T12:00:00Z</published></entry></feed>';
const LONG = '오늘 말씀은 누가복음 5장입니다. 베드로는 밤새 수고했지만 아무것도 잡지 못했습니다. '.repeat(12);
const SUMMARY_JSON = JSON.stringify({ title: '부르시는 주님', preacher: '강산 목사', passage: '누가복음 5:1-11', points: ['하나', '둘', '셋'], messages: ['메시지 1', '메시지 2', '메시지 3'], apply: ['적용 1', '적용 2'], short3: ['줄 1', '줄 2', '줄 3'] });
const SUMMARY_TEXT = '설교자: 강산 목사\n본문 구절: 누가복음 5:1-11\n핵심 대지 3가지:\n1. 하나\n2. 둘\n3. 셋\n주요 메시지:\n- 가\n- 나\n- 다';

async function main() {
  const env = newEnv((tabs) => {
    tabs['설정'].push(['유튜브채널ID', 'UCtestchannel0000000000', '']);
    tabs['새가족'][0].push('');                      // 머리글 길이 맞춤 (그대로)
  }, { GEMINI_API_KEY: 'test-key' });
  const run = env.run;
  const stub = require.cache[BRIDGE].exports, baseCall = stub.call;
  const calls = []; const ai = [];
  let net = () => { throw new Error('예상하지 못한 외부 호출'); };
  let gem = () => ({ text: SUMMARY_JSON, model: 'gemini-2.5-flash' });
  stub.call = (op, a) => {
    if (op === 'fetch') { calls.push(a.url); return net(a); }
    if (op === 'gemini') { ai.push(a); return gem(a); }
    return baseCall(op, a);
  };
  const tok = (n, i) => run((api) => api.포털토큰_(n, PHONE(i), ''));
  const T커 = tok('김커미티', 0), T정 = tok('정일반', 8);

  /* ---------------------------------------------------------------- A */
  section('A. 설교 자막 → 없으면 영상으로');
  {
    const android = (a) => /youtubei\/v1\/player/.test(a.url) && /"clientName":"ANDROID"/.test(String(a.body || ''));
    net = (a) => {
      if (/feeds\/videos\.xml/.test(a.url)) return text(RSS);
      if (/youtubei\/v1\/player/.test(a.url)) {
        if (android(a) && /AAAAAAAAAAA/.test(String(a.body))) return json({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=ko&kind=asr', languageCode: 'ko', kind: 'asr' }] } } });
        return json({});                                              // 자막 목록 없음
      }
      if (/api\/timedtext\?v=AAAAAAAAAAA/.test(a.url) && /fmt=json3/.test(a.url)) return json({ events: [{ segs: [{ utf8: LONG }] }] });
      if (/timedtext|watch\?v=/.test(a.url)) return text('');
      throw new Error('예상 못한 주소 ' + a.url);
    };
    const ua = () => calls.filter((u) => /youtubei/.test(u)).length;
    const prep = run((api) => api.sermonMakePrep_(T커, 'AAAAAAAAAAA', ''));
    eq([prep.source, !!prep.video, /자막 시작/.test(prep.prompt), prep.json], ['유튜브 자막', false, true, true], '안드로이드 클라이언트가 준 자동 생성(asr) 자막으로 준비');
    ok(ua() >= 1, '내부 API(youtubei)를 먼저 부름');
    ok(!calls.some((u) => /api\/timedtext.*&fmt=json3&fmt/.test(u)), '자막 주소에 fmt 가 두 번 붙지 않음');

    calls.length = 0;
    const p2 = run((api) => api.sermonMakePrep_(T커, 'BBBBBBBBBBB', ''));
    eq([p2.video, /영상/.test(p2.source), /첨부한 유튜브 영상/.test(p2.prompt), p2.timeoutMs >= 180000], ['https://www.youtube.com/watch?v=BBBBBBBBBBB', true, true, true], '자막이 전혀 없으면 영상 주소를 넘겨 AI 가 직접 보게 준비');
    ok(calls.some((u) => /api\/timedtext\?v=BBBBBBBBBBB&lang=ko&kind=asr/.test(u)), '마지막으로 자동 생성 자막 주소도 직접 시도함');
    ok(/설교 부분만/.test(p2.system), '영상 요약 지침(찬양 · 광고 빼고 설교만)이 붙음');

    ai.length = 0;
    const made = run((api) => api.sermonMake(T커, 'BBBBBBBBBBB', ''));
    eq([ai.length, ai[0].video, ai[0].json], [1, 'https://www.youtube.com/watch?v=BBBBBBBBBBB', true], '예전 이름(sermonMake)도 영상을 붙여 AI 를 부름');
    eq([made.item.title, made.item.points.length, made.item.short3.length, /영상/.test(made.source)], ['부르시는 주님', 3, 3, true], '영상 요약이 저장됨');
    const list = run((api) => api.sermonList ? api.sermonList(T정) : null);
    ok(!list || JSON.stringify(list).indexOf('BBBBBBBBBBB') !== -1, '설교 목록에 들어감');

    throws(() => run((api) => api.sermonMakePrep_(T정, 'AAAAAAAAAAA', '')), /커미티/, '커미티가 아니면 거절');
    gem = () => ({ text: '{"title":"x","points":[],"messages":[]}' });
    throws(() => run((api) => api.sermonMake(T커, 'BBBBBBBBBBB', '')), /설교 내용을 찾지 못했습니다/, '영상에서 설교를 못 찾으면 원고를 붙여 달라고 안내');
    gem = () => ({ text: SUMMARY_JSON });

    // 관리 화면 요약 — 형식이 어긋나면 한 번 더
    let n = 0; gem = () => ({ text: ++n === 1 ? '엉뚱한 답' : SUMMARY_TEXT });
    const r = run((api) => api.sermonGeminiSummary('ADM', 'https://youtu.be/BBBBBBBBBBB', ''));
    eq([n, r.formatWarning || false, /핵심 대지/.test(r.text), /영상/.test(r.source)], [2, false, true, true], '관리 화면 요약: 형식이 어긋나면 한 번 더 시켜 바로잡음 (영상 요약)');
    const d0 = run((api) => api.sermonGeminiSummaryDone_({ prompt: 'P', videoId: 'x', source: 's' }, '엉뚱', 0));
    ok(!!d0.retryPrompt && d0.formatWarning, '비동기 길: 형식이 어긋나면 다시 시킬 프롬프트를 돌려줌');
    const d1 = run((api) => api.sermonGeminiSummaryDone_({ prompt: 'P', videoId: 'x', source: 's' }, '엉뚱', 1));
    ok(!d1.retryPrompt && d1.formatWarning, '두 번째에는 더 시키지 않고 경고만');
    gem = () => ({ text: SUMMARY_JSON });
  }

  /* ---------------------------------------------------------------- B */
  section('B. 매주 자동 요약 — 자막이 없으면 영상으로 이어서');
  {
    const env2 = newEnv((tabs) => { tabs['설정'].push(['유튜브채널ID', 'UCtestchannel0000000000', '']); }, { GEMINI_API_KEY: 'test-key' });
    const s2 = require.cache[BRIDGE].exports, b2 = s2.call; const gcalls = [];
    s2.call = (op, a) => {
      if (op === 'fetch') { if (/feeds\/videos\.xml/.test(a.url)) return text(RSS); if (/youtubei/.test(a.url)) return json({}); return text(''); }
      if (op === 'gemini') { gcalls.push(a); return { text: SUMMARY_JSON }; }
      return b2(op, a);
    };
    const r = env2.run((api) => api.설교요약돌기());
    eq([r.made, (r.needVideo || []).length, r.needVideo && r.needVideo[0].id], [0, 1, 'AAAAAAAAAAA'], '자막이 없으면 만들지 않고 영상으로 요약할 한 편을 넘김');
    const prep = env2.run((api) => api.설교영상준비_(r.needVideo[0]));
    ok(prep && prep.video === 'https://www.youtube.com/watch?v=AAAAAAAAAAA' && prep.json, '영상 요약 준비');
    const saved = env2.run((api) => api.설교영상저장_(prep, SUMMARY_JSON));
    eq(saved.item.id, 'AAAAAAAAAAA', '영상 요약이 저장됨');
    eq(env2.run((api) => api.설교영상준비_(r.needVideo[0])), null, '이미 만든 영상은 다시 준비하지 않음');
  }

  /* ---------------------------------------------------------------- C */
  section('C. 오늘의 묵상 — 온라인 본문 + AI 가이드 자동');
  {
    const P = (x) => run((api) => api.구절풀기_(x));
    eq(P('Matthew 21:23-end'), { no: 40, ko: '마태복음', ch: 21, v1: 23, v2: 'end' }, '영어 · "end" 까지');
    eq(P('Psalm (80:1-6); 80:7-19'), { no: 19, ko: '시편', ch: 80, v1: 1, v2: 6 }, '괄호 · 여러 구간은 첫 구간');
    eq(P('James 4'), { no: 59, ko: '야고보서', ch: 4, v1: 0, v2: 0 }, '장만');
    eq(P('1 Samuel 3:1-10'), { no: 9, ko: '사무엘상', ch: 3, v1: 1, v2: 10 }, '숫자로 시작하는 책');
    eq(P('요한복음 3:16'), { no: 43, ko: '요한복음', ch: 3, v1: 16, v2: 16 }, '한국어 구절');
    eq(P('시편 23편'), { no: 19, ko: '시편', ch: 23, v1: 0, v2: 0 }, '"편"');
    eq(P('Song of Songs 2:1-4').no, 22, '여러 낱말 책 이름');
    eq(P('없는책 3:1'), null, '모르는 책은 null');

    const chapter = (n) => ({ verses: Array.from({ length: n }, (_, i) => ({ chapter: 1, verse: i + 1, text: (i + 1) + '절 본문' })) });
    const lect = { daily: { readings: { morning: { first: '2 Chronicles 16', second: 'James 4' }, evening: { first: 'Zechariah 10', second: 'Matthew 21:23-end' } } } };
    let lectFail = false, bibleCalls = [];
    net = (a) => {
      if (/lectserve\.com\/date\//.test(a.url)) return lectFail ? text('x', 503) : json(lect);
      if (/api\.getbible\.net\/v2\/korean\/(\d+)\/(\d+)\.json/.test(a.url)) { bibleCalls.push(a.url); return json(chapter(a.url.indexOf('/59/4') !== -1 ? 17 : 30)); }
      throw new Error('예상 못한 주소 ' + a.url);
    };
    gem = () => ({ text: JSON.stringify({ explain: ['해설1', '해설2'], questions: ['질문1', '질문2'], apply: ['적용1', '적용2'], prayer: '기도' }) });
    const b = run((api) => api.개역한글본문_(api.구절풀기_('Matthew 21:23-end')));
    eq([b.verse, b.text.split('\n').length, b.text.split('\n')[0], b.translation], ['마태복음 21:23-30', 8, '23 23절 본문', '개역한글'], '개역한글 본문: 필요한 절만 · "end" = 장 끝');
    const DATE = addDays(TODAY, 1);
    const r = run((api) => api.오늘묵상자동돌기(DATE));
    eq([r.ok, r.verse, /읽기표/.test(r.from)], [true, '야고보서 4장', true], '온라인 읽기표의 신약(야고보서 4장) → 본문 · 가이드 저장');
    ok(/lectserve\.com\/date\/\d{4}-\d{2}-\d{2}/.test(calls.filter((u) => /lectserve/.test(u)).pop() || ''), '그 날짜의 읽기표를 부름');
    const fixed = run((api) => api.오늘묵상확정_(DATE));
    eq([fixed.verse, fixed.explain, fixed.questions, fixed.apply, fixed.prayer, /^자동/.test(fixed.by)], ['야고보서 4장', ['해설1', '해설2'], ['질문1', '질문2'], ['적용1', '적용2'], '기도', true], '확정 시트에 해설 · 질문 · 적용 · 기도까지');
    ok(/^1 1절 본문/.test(fixed.text) && fixed.text.split('\n').length === 17, '장 전체(17절) 본문');
    eq(run((api) => api.오늘묵상자동돌기(DATE)).skipped, 'exists', '이미 있는 날은 건드리지 않음 (관리자 것 우선)');
    run((api) => api.saveTodayVerse('ADM', addDays(TODAY, 2), '시편 23:1', '관리자가 적은 본문', [], [], [], ''));
    eq(run((api) => api.오늘묵상자동돌기(addDays(TODAY, 2))).skipped, 'exists', '관리자가 먼저 확정한 날은 그대로');
    lectFail = true;
    const r3 = run((api) => api.오늘묵상자동돌기(addDays(TODAY, 3)));
    eq([r3.ok, /^추천 구절/.test(r3.from)], [true, true], '읽기표가 안 되면 추천 구절 (v6: 개역개정 + NIV, 못 받으면 개역한글)');
    lectFail = false;
    const pv = run((api) => api.adminFetchOnlineQT('ADM', addDays(TODAY, 4)));
    eq([pv.verse, pv.explain.length, !!pv.text], ['야고보서 4장', 2, true], '관리 화면 "온라인에서 가져오기" 미리 보기');
    eq(run((api) => api.오늘묵상확정_(addDays(TODAY, 4))), null, '미리 보기는 저장하지 않음');
    throws(() => run((api) => api.adminFetchOnlineQT(T정, TODAY)), /커미티/, '일반 교인은 못 부름');
    eq(run((api) => api.setDevotionAuto('ADM', false)).setting, '끄기', '자동 묵상 끄기');
    eq(run((api) => api.오늘묵상자동돌기(addDays(TODAY, 5))).off, true, '끄면 만들지 않음');
    eq(run((api) => api.getDevotionAuto('ADM')).on, false, '설정 읽기');
    run((api) => api.setDevotionAuto('ADM', true));
    const jobs = require('../lib/scheduler').JOBS.map((j) => j.fn);
    ok(jobs.indexOf('오늘묵상자동돌기') !== -1, '매일 새벽 자동 발송 목록에 있음');
    const rt = require('../lib/runtime');
    ok(!rt.isCallable('오늘묵상자동돌기') && rt.isCallable('adminFetchOnlineQT') && !rt.isCallable('sermonMakePrep_'), '화면에서는 자동 작업 · 준비 함수를 부를 수 없음');
  }

  /* ---------------------------------------------------------------- D */
  section('D. 새가족 알림 — 읽지 않은 분만');
  {
    const env3 = newEnv((tabs) => {
      const row = (name, joined, owner) => { const r = new Array(18).fill(''); r[0] = name; r[10] = joined; r[11] = '진행중'; r[9] = owner || ''; return r; };
      tabs['새가족'] = [tabs['새가족'][0]].concat([row('김민솔', addDays(TODAY, -3)), row('이오래', addDays(TODAY, -30)), row('박담당', addDays(TODAY, -2), '박새가족')]);
    });
    const r3 = env3.run;
    const s3 = require.cache[BRIDGE].exports, b3 = s3.call, push = [];
    s3.call = (op, a) => (op === 'fetch' ? text('') : b3(op, a));
    const TK = r3((api) => api.포털토큰_('김커미티', PHONE(0), ''));
    const nfItems = () => r3((api) => api.myTodos(TK)).list.filter((x) => /^nf-new-/.test(x.id));
    let it = nfItems();
    eq([it.length, it[0] && it[0].sub.split(' — ')[0], it[0] && it[0].hideable], [1, '김민솔', true], '등록 14일 이내 · 담당자 없음 · 교육 전인 분만 (김민솔) — 치울 수 있음');
    const id1 = it[0].id;
    eq(nfItems()[0].id, id1, '같은 분들이면 같은 알림 ID (날짜와 무관)');
    r3((api) => api.hideTodo(TK, id1));
    eq(nfItems().length, 0, '치우면 사라짐');
    // 다음 날이 되어도 다시 뜨지 않아야 함 — 예전에는 nf-new-<날짜> 라서 다음 날 다시 떴습니다
    const later = r3((api) => api.새가족안읽음_(api.새가족전체_(), api.숨긴것_('김커미티'), api.ymd_(new Date(Date.now() + 86400000))));
    eq(later.length, 0, '다음 날에도 김민솔 알림이 다시 뜨지 않음');
    r3((api) => { const sh = api.sheet_('새가족'); const r = new Array(18).fill(''); r[0] = '최새로'; r[10] = api.ymd_(new Date()); r[11] = '진행중'; sh.appendRow(r); api.캐시비움_(); });
    it = nfItems();
    eq([it.length, it[0] && it[0].sub.split(' — ')[0], it[0] && it[0].id !== id1], [1, '최새로', true], '새 분이 등록하면 그분만 새 알림으로');
    const TK2 = r3((api) => api.포털토큰_('박새가족', PHONE(5), ''));
    eq(r3((api) => api.myTodos(TK2)).list.filter((x) => /^nf-new-/.test(x.id))[0].sub.split(' — ')[0], '김민솔, 최새로', '확인 기록은 사람마다 따로 (새가족팀 박새가족은 아직 둘 다 봄)');
    r3((api) => { const sh = api.sheet_('새가족'); const v = sh.getDataRange().getValues(); for (let i = 1; i < v.length; i++) if (v[i][0] === '최새로') sh.getRange(i + 1, 10).setValue('김커미티'); api.캐시비움_(); });
    eq(nfItems().length, 0, '담당자가 정해지면 알림이 사라짐');
    ok(/^function 새가족확인키_/m.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'logic', 'app.js'), 'utf8')), '확인 기록 열쇠 함수');
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'logic', 'app.js'), 'utf8');
    const block = src.slice(src.indexOf('새가족팀 · 커미티 휴대폰으로도 알려줍니다'), src.indexOf('return { ok: true, isNew: isNew'));
    ok(/if \(isNew\)/.test(block) && !/keep: true/.test(block) && /tag: '새가족-' \+ finalName/.test(block), '고치기는 푸시하지 않고 · 붙어 있는(keep) 알림을 쓰지 않고 · 사람마다 꼬리표');
  }

  /* ---------------------------------------------------------------- E */
  section('E. 다른 분 화면 — 그분 로그인 응답과 같음');
  {
    const real = run((api) => api.포털자료_(T정));
    const view = run((api) => api.portalViewAs(T커, '정일반'));
    const k1 = Object.keys(real).filter((k) => k !== 'token' && k !== 'people').sort(), k2 = Object.keys(view).filter((k) => k !== 'viewAs' && k !== 'noLink' && k !== 'token').sort();
    eq(k2, k1, '같은 항목들 (표 · 다른 사람 목록 제외)');
    ['me', 'todos', 'forms', 'badges', 'roles', 'hasCalendar', 'googleReady', 'sermon', 'cellApp', 'myCell'].forEach((k) => eq(view[k], real[k], '같은 값: ' + k));
    eq(view.menus.map((m) => m.key), real.menus.map((m) => m.key), '같은 메뉴 (주소에는 as= 표시만 더함)');
    ok(!view.people && view.token === '', '표와 사람 목록은 보내지 않음');
  }
  /* ---------------------------------------------------------------- F */
  section('F. 서버 파일 문법 — 워커(별도 스레드)까지 (Render 시작 실패 방지)');
  {
    const cp = require('child_process'), fsx = require('fs'), pth = require('path');
    const root = pth.join(__dirname, '..');
    const files = ['server.js'].concat(fsx.readdirSync(pth.join(root, 'lib')).filter((f) => /\.js$/.test(f)).map((f) => 'lib/' + f), fsx.readdirSync(pth.join(root, 'logic')).filter((f) => /\.js$/.test(f)).map((f) => 'logic/' + f));
    const bad = files.filter((f) => cp.spawnSync(process.execPath, ['--check', pth.join(root, f)]).status !== 0);
    eq(bad, [], '모든 서버 파일이 문법 오류 없이 읽힘 (' + files.length + '개)');
  }
  process.exit(T.summary() ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
