/**
 * v6 시험 (서버 · 순수 로직) — 진짜 구글 · 제미나이 · 성경 사이트 없이
 *   node scripts/test-v6.js
 *  A. 제미나이 과부하 : 같은 모델 한 번 더 → 다른 모델로 넘어가기 · 없는 모델 건너뛰기 · 끝까지 안 되면 알기 쉬운 안내
 *  B. 성경 본문      : 개역개정(대한성서공회 화면) · NIV(BibleGateway 화면) 뽑기 · 각주/소제목 빼기 · 못 받으면 개역한글 · 주보/묵상 연결
 *  C. 메뉴 · 주보    : 장비 타일은 허브 안으로 · 각종 Form 관리 이름 · 셀 신청 타일
 *  D. 설문 · 투표    : 대상(팀 · 역할 · 셀 · 사람) · 팀장 권한 · 익명 · 결과 공개 · 항목 추가 · 다시 알림 · 옛 신청서 그대로
 */
const T = require('./test-step3');
const { ok, eq, section, throws, newEnv, TODAY, addDays } = T;
const BRIDGE = require.resolve('../lib/bridge');
const PHONE = (n) => String(4165551000 + n);
const html = (s, ct) => ({ status: 200, headers: { 'content-type': ct || 'text/html; charset=utf-8' }, bytes: Buffer.from(s) });
const jsonR = (o) => ({ status: 200, headers: { 'content-type': 'application/json' }, bytes: Buffer.from(JSON.stringify(o)) });

/* 대한성서공회 성경 읽기 화면 모양 (메뉴 숫자 · 숨긴 각주 · 소제목 포함) */
const GAE = '<html><head><meta charset="utf-8"></head><body><ul class="menu"><li>1 성경읽기</li><li>2 성경검색</li></ul>' +
  '<div id="tdBible1" class="bible_read"><font class="smallTitle">시몬 베드로를 부르시다</font><br>' +
  '<span><span class="number">1&nbsp;&nbsp;&nbsp;</span>무리가 몰려와서 하나님의 말씀을 들을새 예수는 게네사렛 호숫가에 서서</span><br>' +
  '<span><span class="number">2&nbsp;&nbsp;&nbsp;</span>호숫가에 배 두 척이 있는 것을 보시니 어부들은 배에서 나와서 그물을 씻는지라</span><br>' +
  '<span><span class="number">3&nbsp;&nbsp;&nbsp;</span>예수께서 한 배에 오르시니 그 배는 시몬의 배라<font class="comment">1)</font><div class="D2" style="display:none">1) 또는 각주 설명</div> 육지에서 조금 떼기를 청하시고</span><br>' +
  '<span><span class="number">4&nbsp;&nbsp;&nbsp;</span>말씀을 마치시고 시몬에게 이르시되 깊은 데로 가서 그물을 내려 고기를 잡으라</span><br>' +
  '<span><span class="number">5&nbsp;&nbsp;&nbsp;</span>시몬이 대답하여 이르되 선생님 우리들이 밤이 새도록 수고하였으되</span><br>' +
  '</div><div class="footer">2 저작권 안내 3 개인정보</div></body></html>';
/* BibleGateway 본문 화면 모양 (소제목 · 장 번호 · 각주 · 관주 · 두 줄로 나뉜 절) */
const NIV = '<div class="passage-text"><div class="passage-content"><div class="version-NIV result-text-style-normal text-html">' +
  '<h3><span id="en-NIV-25101" class="text Luke-5-1">Jesus Calls Her First Disciples</span></h3>' +
  '<p class="chapter-1"><span id="en-NIV-25101" class="text Luke-5-1"><span class="chapternum">5 </span>One day as Jesus was standing by the Lake of Gennesaret,<sup data-fn="#fen-NIV-25101a" class="footnote">[<a href="#fen-NIV-25101a">a</a>]</sup> the people were crowding around him</span> ' +
  '<span id="en-NIV-25102" class="text Luke-5-2"><sup class="versenum">2 </sup>He saw at the water&#8217;s edge two boats,<sup class="crossreference" data-cr="#cen-NIV-25102A">(<a href="#cen-NIV-25102A">A</a>)</sup> left there by the fishermen.</span> ' +
  '<span id="en-NIV-25103" class="text Luke-5-3"><sup class="versenum">3 </sup>He got into one of the boats,</span></p><p class="line"><span class="text Luke-5-3">the one belonging to Simon.</span> ' +
  '<span class="text Luke-5-4"><sup class="versenum">4 </sup>When he had finished speaking, he said to Simon, <span class="woj">&#8220;Put out into deep water.&#8221;</span></span> ' +
  '<span class="text Luke-5-5"><sup class="versenum">5 </sup>Simon answered, &#8220;Master, we&#8217;ve worked hard all night.&#8221;</span></p>' +
  '<div class="footnotes"><h4>Footnotes</h4><ol><li>Luke 5:1 That is, the Sea of Galilee</li></ol></div></div></div></div>';
['log', 'warn', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });

async function main() {
  /* ---------------------------------------------------------------- A */
  section('A. 제미나이 과부하 — 자동 재시도 · 다른 모델');
  {
    process.env.GEMINI_API_KEY = 'k';
    const ai = require('../lib/notes-ai');
    const realFetch = global.fetch;
    let seen = [];
    const reply = (status, body) => ({ ok: status === 200, status, text: async () => JSON.stringify(body) });
    const good = (t) => reply(200, { candidates: [{ content: { parts: [{ text: t }] } }] });
    const busy = () => reply(503, { error: { code: 503, message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.', status: 'UNAVAILABLE' } });
    const gone = () => reply(404, { error: { code: 404, message: 'models/x is not found for API version v1beta', status: 'NOT_FOUND' } });
    const bad = () => reply(400, { error: { code: 400, message: 'Invalid JSON payload', status: 'INVALID_ARGUMENT' } });
    const model = (url) => decodeURIComponent(url.split('/models/')[1].split(':')[0]);
    let plan = {};
    global.fetch = async (url) => { const m = model(url); seen.push(m); const f = plan[m] || busy; return typeof f === 'function' ? f(seen.filter((x) => x === m).length) : f; };

    seen = []; plan = { 'gemini-flash-lite-latest': (n) => (n === 1 ? busy() : good('두 번째에 됨')) };
    let r = await ai.gemini({ model: 'gemini-flash-lite-latest', prompt: 'x', _retryWaitMs: 1 });
    eq([r.text, r.model, seen], ['두 번째에 됨', 'gemini-flash-lite-latest', ['gemini-flash-lite-latest', 'gemini-flash-lite-latest']], '과부하면 같은 모델로 잠깐 뒤 한 번 더');

    seen = []; plan = { 'gemini-2.5-flash': good('다른 모델로 됨') };
    r = await ai.gemini({ model: 'gemini-flash-lite-latest', prompt: 'x', _retryWaitMs: 1 });
    eq([r.text, r.model, r.fallback], ['다른 모델로 됨', 'gemini-2.5-flash', 'gemini-flash-lite-latest'], '두 번 다 붐비면 다른 모델(2.5 flash)로 자동으로');
    eq(seen, ['gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash'], '순서: 고른 모델 두 번 → 안정판');

    seen = []; plan = { 'my-old-model': gone, 'gemini-2.5-flash': good('됨') };
    r = await ai.gemini({ model: 'my-old-model', prompt: 'x', _retryWaitMs: 1 });
    eq([r.model, seen.length], ['gemini-2.5-flash', 2], '없는 모델은 다시 하지 않고 바로 다음 모델');

    seen = []; plan = { 'gemini-2.5-flash': bad };
    let err = '';
    try { await ai.gemini({ model: 'gemini-2.5-flash', prompt: 'x', _retryWaitMs: 1 }); } catch (e) { err = e.message; }
    eq([err, seen.length], ['Invalid JSON payload', 1], '요청이 잘못된 오류는 모델을 바꿔도 같으므로 바로 알림');

    seen = []; plan = {};
    try { await ai.gemini({ model: 'gemini-flash-lite-latest', prompt: 'x', _retryWaitMs: 1 }); } catch (e) { err = e.message; }
    ok(/붐빕니다/.test(err) && !/high demand/.test(err), '모두 붐비면 한국어로 안내: ' + err);
    ok(new Set(seen).size >= 4, '여러 모델을 차례로 시도 (' + Array.from(new Set(seen)).join(', ') + ')');

    process.env.GEMINI_FALLBACK_MODELS = 'a-model, b-model';
    eq(ai.modelChain('gemini-flash-lite-latest'), ['gemini-flash-lite-latest', 'a-model', 'b-model'], 'Render 환경변수 GEMINI_FALLBACK_MODELS 로 순서 바꾸기');
    delete process.env.GEMINI_FALLBACK_MODELS;
    ok(/require\('\.\/notes-ai'\)\.gemini/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'worker.js'), 'utf8')), '다른 AI 기능(워커)도 같은 호출을 씀');
    global.fetch = realFetch;
  }

  /* ---------------------------------------------------------------- B */
  section('B. 성경 본문 — 개역개정 + NIV');
  const env = newEnv(() => {}, { GEMINI_API_KEY: 'test-key' });
  const run = env.run;
  const stub = require.cache[BRIDGE].exports, baseCall = stub.call;
  const calls = [];
  let net = () => { throw new Error('예상하지 못한 외부 호출'); };
  let gem = () => ({ text: JSON.stringify({ explain: ['해설'], questions: ['질문'], apply: ['적용'], prayer: '기도' }), model: 'm' });
  stub.call = (op, a) => {
    if (op === 'fetch') { calls.push(a.url); return net(a); }
    if (op === 'gemini') return gem(a);
    return baseCall(op, a);
  };
  const tok = (n, i) => run((api) => api.포털토큰_(n, PHONE(i), ''));
  {
    let gaeOk = true, nivOk = true;
    net = (a) => {
      if (/bskorea\.or\.kr/.test(a.url)) { if (!gaeOk) return { status: 503, headers: {}, bytes: Buffer.from('x') }; return html(GAE); }
      if (/biblegateway\.com/.test(a.url)) { if (!nivOk) return { status: 403, headers: {}, bytes: Buffer.from('x') }; return html(NIV); }
      if (/getbible\.net/.test(a.url)) return jsonR({ verses: Array.from({ length: 11 }, (_, i) => ({ verse: i + 1, text: '개역한글 ' + (i + 1) })) });
      throw new Error('예상 못한 주소 ' + a.url);
    };
    const v = run((api) => api.성경본문가져오기_('누가복음 5:1-4'));
    const ko = v.ko.text.split('\n'), en = v.en.text.split('\n');
    eq(ko.length, 4, '개역개정: 1-4절만');
    eq(ko[0], '1 무리가 몰려와서 하나님의 말씀을 들을새 예수는 게네사렛 호숫가에 서서', '개역개정 1절 (메뉴 숫자 · 소제목 제외)');
    eq(ko[2], '3 예수께서 한 배에 오르시니 그 배는 시몬의 배라 육지에서 조금 떼기를 청하시고', '숨긴 각주 · 각주 표시 "1)" 빼기');
    ok(/version=GAE&book=luk&chap=5/.test(calls.find((u) => /bskorea/.test(u))), '대한성서공회 주소 (누가복음 = luk, 5장)');
    eq(en.length, 4, 'NIV: 1-4절만');
    eq(en[0], '1 One day as Jesus was standing by the Lake of Gennesaret, the people were crowding around him', 'NIV 1절 (소제목 · 장 번호 · 각주 빼기)');
    eq(en[1], '2 He saw at the water’s edge two boats, left there by the fishermen.', '관주 빼기 · 따옴표 풀기');
    eq(en[2], '3 He got into one of the boats, the one belonging to Simon.', '두 줄로 나뉜 절은 한 줄로');
    eq(en[3], '4 When he had finished speaking, he said to Simon, “Put out into deep water.”', '예수님 말씀(붉은 글씨) 안쪽 글자도');
    ok(/search=Luke%205%3A1-4&version=NIV/.test(calls.find((u) => /biblegateway/.test(u))), 'BibleGateway 주소 (Luke 5:1-4)');
    eq([v.ref, v.refEn, v.ko.translation, v.en.translation, v.warn], ['누가복음 5:1-4', 'Luke 5:1-4', '개역개정', 'NIV', ''], '구절 표기 · 번역 이름');
    const n0 = calls.length;
    run((api) => api.성경본문가져오기_('누가복음 5:1-4'));
    eq(calls.length, n0, '같은 구절은 다시 받지 않음 (기억)');
    const w = run((api) => api.성경본문가져오기_('누가복음 5:2-5'));
    eq([w.ko.text.split('\n')[0].slice(0, 3), w.en.text.split('\n').pop().slice(0, 16)], ['2 호', '5 Simon answered'], '다른 구간');
    const one = run((api) => api.성경본문가져오기_('Luke 5:3'));
    eq([one.ko.text.split('\n').length, one.en.text.split('\n').length, one.ref], [1, 1, '누가복음 5:3'], '한 절 · 영어 구절도');

    gaeOk = false;
    const f = run((api) => api.성경본문가져오기_('누가복음 5:6-8'));
    eq([f.ko.translation, f.ko.text.split('\n')[0], /개역한글로/.test(f.warn)], ['개역한글', '6 개역한글 6', true], '개역개정을 못 받으면 개역한글로 채우고 알림');
    gaeOk = true; nivOk = false;
    const g = run((api) => api.성경본문가져오기_('누가복음 5:1-2'));
    eq([!!g.ko, g.en, /NIV/.test(g.warn)], [true, null, true], 'NIV 를 못 받아도 개역개정은 채움');
    nivOk = true;
    throws(() => run((api) => api.성경본문가져오기_('없는책 1:1')), /구절을 알아보지/, '모르는 구절은 알기 쉬운 오류');

    // 주보 편집
    const T커 = tok('김커미티', 0), T정 = tok('정일반', 8);
    const b = run((api) => api.bulletinFetchBible(T커, '누가복음 5:1-3'));
    eq([b.ko.text.split('\n').length, b.en.text.split('\n').length], [3, 3], '주보 편집: 본문 자동 채우기');
    throws(() => run((api) => api.bulletinFetchBible(T정, '누가복음 5:1-3')), /./, '주보 편집 권한이 없으면 못 부름');
    const rt = require('../lib/runtime');
    ok(rt.isCallable('bulletinFetchBible') && rt.isCallable('adminFetchBible') && !rt.isCallable('성경본문가져오기_'), '화면에서 부를 수 있는 것은 주보 · 관리 함수뿐');

    // 오늘의 묵상 (자동 · 관리 화면)
    const ad = run((api) => api.adminFetchBible('ADM', '누가복음 5:1-2'));
    eq([ad.ref, ad.tr, ad.text.split('\n')], ['누가복음 5:1-2', '개역개정 + NIV', ['1 무리가 몰려와서 하나님의 말씀을 들을새 예수는 게네사렛 호숫가에 서서', '2 호숫가에 배 두 척이 있는 것을 보시니 어부들은 배에서 나와서 그물을 씻는지라', '', '[NIV]',
      '1 One day as Jesus was standing by the Lake of Gennesaret, the people were crowding around him', '2 He saw at the water’s edge two boats, left there by the fishermen.']], '관리 화면: 한글 → [NIV] → 영어 한 칸에');
    net = ((prev) => (a) => (/lectserve/.test(a.url) ? jsonR({ daily: { readings: { morning: { second: 'Luke 5:1-5' } } } }) : prev(a)))(net);
    const D = addDays(TODAY, 9);
    const r = run((api) => api.오늘묵상자동돌기(D));
    const fx = run((api) => api.오늘묵상확정_(D));
    eq([r.ok, fx.verse, /개역개정 · NIV/.test(r.from), fx.text.indexOf('[NIV]') > 0, fx.text.split('\n')[0].slice(0, 5)], [true, '누가복음 5:1-5', true, true, '1 무리가'], '매일 자동 묵상: 개역개정 + NIV 로 저장');
    ok(/\[NIV\]/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'views', 'Devotion.html'), 'utf8')), '묵상 화면은 [NIV] 를 짝지어 보여 줌');
  }

  /* ---------------------------------------------------------------- C */
  section('C. 메뉴 · 이름');
  {
    const T정 = tok('정일반', 8), T커 = tok('김커미티', 0);
    const keys = (T) => run((api) => api.getMyProfile(T)).menus.map((m) => m.key);
    ok(keys(T커).indexOf('worship') !== -1 && keys(T커).indexOf('equipment') === -1, '허브가 있으면 장비 타일 없음 (허브 안 탭)');
    const fm = run((api) => api.getMyProfile(T커)).menus.find((m) => m.key === 'forms');
    ok(!fm || fm.title === '각종 Form 관리', '"일반 신청서 관리" → "각종 Form 관리": ' + (fm && fm.title));
    const src = (f) => require('fs').readFileSync(require('path').join(__dirname, '..', f), 'utf8');
    ok(!/일반 신청서 관리/.test(src('views/Forms.html') + src('logic/step11.js') + src('logic/permissions.js') + src('logic/app.js')), '옛 이름이 남아 있지 않음');
    ok(/\['equip', '장비 · 수리'\]/.test(src('views/Worship.html')) && /\['archive', '아카이브'\], \['equip'/.test(src('views/Worship.html')), '허브 탭: 아카이브 다음 "장비 · 수리"');
    ok(/라이브 악보 시작/.test(src('views/Worship.html')) && !/세션 \/ 연습 시작 <small>/.test(src('views/Worship.html')), '"세션 / 연습 시작" → "라이브 악보 시작"');
  }

  /* ---------------------------------------------------------------- D */
  section('D. 설문 · 투표');
  {
    const P6 = { 정: '4165551008', 최: '4165551006', 노: '4165551007', 윤: '4165551009', 오: '4165551010', 커: '4165551000' };
    const env2 = newEnv((tabs) => { tabs['사역팀원'].push(['찬양1팀', '정일반', '보컬'], ['찬양1팀', '최셀장', '']); }, { GEMINI_API_KEY: 'k' });
    const r2 = env2.run;
    const tk = (n, ph) => r2((api) => api.포털토큰_(n, ph, ''));
    const T정 = tk('정일반', P6.정), T최 = tk('최셀장', P6.최), T노 = tk('노셀장', P6.노), T윤 = tk('윤팀장', P6.윤), T오 = tk('오팀장', P6.오), T커 = tk('김커미티', P6.커);
    const save = (t, d) => r2((api) => api.formSave(t, Object.assign({ status: '받는중', target: '모두', notify: false, editable: true }, d))).id;
    const listOf = (t) => r2((api) => api.myForms(t)).list.map((f) => f.title);
    const Q = [{ id: 'q1', type: 'choice', label: '어디로 갈까요', req: true, opts: ['산', '바다'] }];

    // 옛 신청서 — 그대로
    const idOld = save('ADM', { title: '옛 신청서', questions: Q });
    const fo = r2((api) => api.신청서찾기_(idOld));
    eq([fo.kind, fo.audience, fo.survey], ['form', [], null], '옛 신청서: 종류 form · 대상 없음(모두) · 설문 설정 없음');
    ok(listOf(T정).indexOf('옛 신청서') !== -1 && listOf(T노).indexOf('옛 신청서') !== -1, '옛 신청서는 예전처럼 모두에게');

    // 커미티: 팀장들 대상 익명 투표
    const idLead = save(T커, { title: '팀장 투표', kind: 'survey', audience: ['팀장'], survey: { anonymous: true, results: 'after' }, questions: Q });
    ok(listOf(T윤).indexOf('팀장 투표') !== -1 && listOf(T오).indexOf('팀장 투표') !== -1, '커미티 → "팀장" 대상: 팀장들에게 보임');
    ok(listOf(T정).indexOf('팀장 투표') === -1 && listOf(T노).indexOf('팀장 투표') === -1, '팀장이 아닌 분에게는 안 보임');
    throws(() => r2((api) => api.formOpen(T정, idLead)), /대상이 아닙니다/, '대상이 아니면 열 수도 없음');
    throws(() => r2((api) => api.submitForm(T정, idLead, { q1: '산' })), /대상이 아닙니다/, '대상이 아니면 낼 수도 없음');
    const it = r2((api) => api.myForms(T윤)).list.find((f) => f.title === '팀장 투표');
    eq([it.kind, it.anonymous], ['survey', true], '목록에 투표 · 익명 표시');
    throws(() => r2((api) => api.surveyResults(T윤, idLead)), /참여한 뒤/, '결과: 참여하기 전에는 못 봄 (after)');
    r2((api) => api.submitForm(T윤, idLead, { q1: '산' }));
    r2((api) => api.submitForm(T오, idLead, { q1: '바다' }));
    const pr = r2((api) => api.surveyResults(T윤, idLead));
    const st = pr.stats.find((s) => s.id === 'q1');
    eq([pr.count, st.items.map((x) => x.name + x.n).join(','), pr.anonymous, JSON.stringify(pr.voters)], [2, '산1,바다1', true, '{}'], '참여 뒤 결과: 막대 집계 · 익명이라 누가 골랐는지 없음');
    const ar = r2((api) => api.formResults(T커, idLead));
    ok(ar.anonymous && ar.rows.every((a) => /^익명 \d+$/.test(a.name) && !a.phone && !a.email), '익명: 관리 화면 결과에도 이름 · 연락처 없음');
    eq([ar.participation.total, ar.participation.done, ar.participation.pending.length, ar.participation.pendingN], [2, 2, 0, 0], '참여 현황: 대상 2명 중 2명 (익명이라 이름 목록 없음)');
    throws(() => r2((api) => api.submitForm(T윤, idLead, { q1: '호수' })), /없는 항목/, '항목 추가를 허용하지 않은 투표는 없는 선택지를 받지 않음');

    // 팀장: 우리 팀 설문 — 다른 대상은 거절, 비우면 우리 팀
    throws(() => save(T윤, { title: '월권', kind: 'survey', audience: ['팀:재정팀'], questions: Q }), /우리 팀/, '팀장은 다른 팀을 대상으로 못 고름');
    throws(() => save(T윤, { title: '월권2', kind: 'survey', audience: ['팀장'], questions: Q }), /우리 팀/, '팀장은 "팀장들" 대상도 못 고름 (커미티만)');
    const idTeam = save(T윤, { title: '찬양1팀 연습 시간', kind: 'survey', audience: [], survey: { anonymous: false, results: 'always', allowAdd: true }, questions: [{ id: 'q1', type: 'checks', label: '가능한 시간', req: true, opts: ['토 오전', '토 오후'] }] });
    eq(r2((api) => api.신청서찾기_(idTeam)).audience, ['팀:찬양1팀'], '팀장이 대상을 비우면 우리 팀으로');
    ok(listOf(T정).indexOf('찬양1팀 연습 시간') !== -1 && listOf(T노).indexOf('찬양1팀 연습 시간') === -1, '우리 팀(정일반)에게만 보이고 다른 분(노셀장)에게는 안 보임');
    const pre = r2((api) => api.surveyResults(T정, idTeam));
    eq(pre.count, 0, '결과 "언제나 공개": 참여 전에도 볼 수 있음');
    r2((api) => api.submitForm(T정, idTeam, { q1: ['토 오전', '주일 저녁'] }));
    const fq = r2((api) => api.신청서찾기_(idTeam)).questions[0];
    eq([fq.opts, fq.added.map((a) => a.t + '/' + a.by)], [['토 오전', '토 오후', '주일 저녁'], ['주일 저녁/정일반']], '항목 추가: 참여자가 적은 "주일 저녁"이 선택지로 저장 (누가 더했는지도)');
    const pr2 = r2((api) => api.surveyResults(T윤, idTeam));
    eq([pr2.voters.q1['토 오전'], pr2.voters.q1['주일 저녁'], pr2.total], [['정일반'], ['정일반'], 3], '익명이 아니면 항목마다 고른 사람 · 대상 인원 3명');
    const rr = r2((api) => api.formResults(T윤, idTeam));
    eq([rr.participation.done, rr.participation.pending.sort()], [1, ['윤팀장', '최셀장']], '관리 화면: 아직 안 한 분 목록');
    const sent = r2((api) => api.surveyRemind(T윤, idTeam));
    eq(sent.pending, 2, '"아직 안 한 분께 다시 알림" — 2명에게');
    throws(() => r2((api) => api.surveyRemind(T정, idTeam)), /(팀장|만들|권한)/, '팀원은 다시 알림을 못 보냄');
    throws(() => r2((api) => api.surveyRemind(T커, idOld)), /대상을 정한/, '대상이 없는 옛 신청서는 "아직 안 한 분"을 알 수 없음');
    // 결과 숨김
    const idHid = save(T커, { title: '만족도', kind: 'survey', survey: { anonymous: true, results: 'hidden' }, questions: [{ id: 'r', type: 'rating', label: '만족', scale: 5 }] });
    r2((api) => api.submitForm(T노, idHid, { r: 4 }));
    throws(() => r2((api) => api.surveyResults(T노, idHid)), /만든 사람만/, '"결과는 만든 사람만" — 참여자는 못 봄');
    // 고쳐 저장해도 설정 유지 · 엑셀 익명
    save(T커, { id: idLead, title: '팀장 투표', questions: Q });
    const fl = r2((api) => api.신청서찾기_(idLead));
    eq([fl.kind, fl.audience, fl.survey.anonymous], ['survey', ['팀장'], true], '설정 없이 고쳐 저장해도 종류 · 대상 · 익명 유지');
    const aud = r2((api) => api.surveyAudience(T커, ['팀:찬양1팀', '사람:노셀장']));
    eq(aud.n, 4, '대상 인원 미리 보기 (찬양1팀 3명 + 노셀장)');
    const tpl = r2((api) => api.formTemplatesAll(T커));
    ok(tpl.surveys.length >= 5 && tpl.surveys.every((s) => s.form.kind === 'survey'), '설문 · 투표 본보기 ' + tpl.surveys.length + '개');
    const rt = require('../lib/runtime');
    ok(rt.isCallable('surveyResults') && rt.isCallable('surveyRemind') && !rt.isCallable('폼대상인가6_'), '화면에서 부를 수 있는 것은 결과 · 다시 알림 · 대상 미리 보기뿐');
  }

  /* ---------------------------------------------------------------- E */
  section('E. 다른 분 화면 보기 — 알림 · 신청서까지 똑같이 (전화 없는 교인 · 이메일 없는 새가족)');
  {
    const env3 = newEnv((tabs) => { const r = tabs['교적'].find((x) => x[0] === '노셀장'); r[1] = ''; }, { GEMINI_API_KEY: 'k' });
    const r3 = env3.run;
    const T커 = r3((api) => api.포털토큰_('김커미티', PHONE(0), ''));
    const T정 = r3((api) => api.포털토큰_('정일반', PHONE(8), ''));
    const save = (d) => r3((api) => api.formSave('ADM', Object.assign({ status: '받는중', target: '모두', notify: false, editable: true }, d))).id;
    const Q = [{ id: 'q1', type: 'choice', label: '어디로', req: true, opts: ['산', '바다'] }];
    const idAll = save({ title: '모두 신청서', questions: Q });
    const idNew = save({ title: '새가족 신청서', target: '새가족', questions: Q });
    const idNoh = save({ title: '노셀장 투표', kind: 'survey', audience: ['사람:노셀장'], questions: Q });

    // 전화번호 없는 교인 — 예전에는 알림 · 신청서가 비었음
    const v = r3((api) => api.portalViewAs(T커, '노셀장'));
    const vt = (v.forms && v.forms.list || []).map((f) => f.title);
    ok(vt.indexOf('모두 신청서') !== -1 && vt.indexOf('노셀장 투표') !== -1 && vt.indexOf('새가족 신청서') === -1, '전화 없는 교인: 그분의 신청서 · 투표가 그대로 보임: ' + vt.join(','));
    ok(Array.isArray(v.todos), '알림 목록이 있음 (' + (v.todos || []).length + '개)');
    ok(!/VIEW6|\\u0000/.test(JSON.stringify(v)), '보기용 표는 응답에 남지 않음');
    // 같은 사람이 직접 로그인했을 때와 똑같은 목록 (정일반 — 전화 있음)
    const direct = r3((api) => api.myForms(T정)).list.map((f) => f.title).sort();
    const asView = r3((api) => api.portalViewAs(T커, '정일반')).forms.list.map((f) => f.title).sort();
    eq(asView, direct, '다른 분 화면의 신청서 목록 = 그분이 직접 보는 목록');

    // 이메일 없는 새가족
    const n = r3((api) => api.portalViewAsNewcomer(T커, '홍길동'));
    const nt = (n.home.forms && n.home.forms.list || []).map((f) => f.title);
    ok(nt.indexOf('새가족 신청서') !== -1 && nt.indexOf('노셀장 투표') === -1, '이메일 없는 새가족: 새가족 신청서가 보임: ' + nt.join(','));
    ok(Array.isArray(n.home.todos), '새가족 알림 목록이 있음');
    ok(!/token=|&t=/.test(JSON.stringify(n)), '새가족 화면에도 로그인 표 없음');

    // 눌러서 열어 보기 — 그분에게 보이는 그대로, 보기 전용
    const fo = r3((api) => api.formOpenAs(T커, '노셀장', 'member', idNoh));
    eq([fo.form.title, fo.viewOnly, fo.viewAs], ['노셀장 투표', true, '노셀장'], '커미티가 그분 화면에서 투표를 열어 봄 (보기 전용)');
    const fn = r3((api) => api.formOpenAs(T커, '홍길동', 'newcomer', idNew));
    eq(fn.form.title, '새가족 신청서', '새가족 화면에서 새가족 신청서 열어 보기');
    throws(() => r3((api) => api.formOpenAs(T커, '정일반', 'member', idNoh)), /대상이 아닙니다/, '그분이 대상이 아니면 열리지 않음 (그분과 똑같이)');
    throws(() => r3((api) => api.formOpenAs(T정, '노셀장', 'member', idNoh)), /커미티/, '커미티가 아니면 거절');
    const rt = require('../lib/runtime');
    ok(rt.isCallable('formOpenAs') && !rt.isCallable('보기자료채우기6_'), '화면에서 부를 수 있는 것은 formOpenAs 뿐');
    // 보기가 끝나면 원래대로 (다음 계산에 영향 없음)
    eq(r3((api) => api.myForms(T정)).list.map((f) => f.title).sort(), direct, '보기 뒤에도 본인 목록은 그대로');
  }

  /* ---------------------------------------------------------------- F */
  section('F. v6.1 — TEVA 이름 · 홈 화면 이름 · Finance · 행사 예산 탭 · 밝은 화면 색');
  {
    const fs = require('fs'), path = require('path'); const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const man = JSON.parse(src('public/site.webmanifest'));
    eq([man.name, man.short_name], ['Teva', 'Teva'], '홈 화면에 추가할 때 기본 이름 = Teva (manifest)');
    ok(/apple-mobile-web-app-title" content="Teva"/.test(src('lib/pages.js')), '아이폰 · 아이패드 홈 화면 이름도 Teva');
    ok(/<h1 class="homelink-h1 teva"[^>]*>TEVA<small class="teva-ko">토론토영락교회 청년1부<\/small><\/h1>/.test(src('views/Portal.html')) && /YoungNak Church of Toronto &middot; Youngadults Group/.test(src('views/Portal.html')), '포털 제목: TEVA + 작은 한국어 이름 + 영어 줄 그대로');
    ok(/--lt-or: #46BDC6/.test(src('views/Theme.html')) && /--accent: #46BDC6 !important/.test(src('views/Theme.html')), '밝은 화면 메인 색 #46BDC6');
    ok(/html\[data-theme="light"\] \.bd \{/.test(src('public/budget/budget.css')), '행사 예산 · 정산 화면에도 밝은 화면');
    const env4 = newEnv(() => {}, {}); const r4 = env4.run;
    const T커 = r4((api) => api.포털토큰_('김커미티', PHONE(0), ''));
    const prof = r4((api) => api.getMyProfile(T커));
    const acct = (prof.admin || []).find((m) => m.key === 'acct');
    eq(acct && acct.title, 'Finance', '"회계 관리" → Finance');
    ok(!(prof.menus || []).some((m) => m.key === 'budget'), '커미티는 따로 "행사 예산" 타일 없이 Finance 안의 탭으로');
    const adm = src('views/Admin.html');
    ok(/acct: \['expense', 'entry', 'budget', 'events', 'envelope', 'summary'\]/.test(adm) && /id="st_acct_events"[^>]*>행사 예산 · 정산</.test(adm) && /page=budget&embed=1/.test(adm), 'Finance 안에 "행사 예산 · 정산" 탭 (예산 화면을 그대로 띄움)');
    ok(/render_\('Portal', 'TEVA · 토론토영락교회 청년1부'/.test(src('logic/app.js')), '브라우저 탭 제목도 TEVA');
  }

  process.exit(T.summary() ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
