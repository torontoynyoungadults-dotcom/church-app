/* ============================================================
   허브 v5 — 설교 요약(자막이 없을 때 영상으로) · 오늘의 묵상 자동 가이드 · 새가족 알림 정리
   (logic/app.js 뒤에 이어 붙어 같은 범위에서 실행됩니다 — app.js 의 함수 · 변수를 그대로 씁니다)
   ============================================================ */

/* ------------------------------------------------------------
   1) 설교 요약 — 자막 → (없으면) 제미나이가 유튜브 영상을 직접 보고 요약
   ------------------------------------------------------------
   · 자막을 찾으면 예전과 똑같이 자막 글로 요약합니다.
   · 자막이 없거나(자동 생성 자막까지 막힌 경우) 너무 짧으면, 공개 영상 주소를 제미나이에게 그대로 넘겨
     영상의 소리 · 화면을 직접 보고 요약하게 합니다 (Gemini 의 유튜브 영상 이해 기능 — 공개 영상만 됩니다).
   · 화면에서 부를 때는 서버가 멈추지 않도록 준비(…Prep_) → 비동기 AI 호출(server.js) → 마무리(…Done_) 로 나눕니다.
     예전 이름(sermonMake · sermonGeminiSummary)을 그대로 부르면 한 번에 끝까지 합니다 (시험 · 관리 작업용). */

var 설교영상_지침보탬 =
  '\n· 자막 대신 첨부된 유튜브 영상(소리)을 직접 듣고 요약합니다. 찬양 · 광고 · 기도 부분은 빼고 설교 부분만 요약하세요.' +
  '\n· 영상에서 들리지 않은 내용은 지어내지 마세요. 설교가 아니면(찬양만 있는 영상 등) 모든 항목을 "확인 필요"로 쓰세요.';

function 설교영상주소_(videoId) { return 'https://www.youtube.com/watch?v=' + encodeURIComponent(String(videoId || '').trim()); }

/** 자막을 먼저 찾아보고, 없으면 영상 주소를 돌려줍니다 → { text } 또는 { video } */
function 설교재료_(videoId) {
  var 본문 = '';
  try { 본문 = 자막가져오기_(videoId); } catch (e) { 본문 = ''; }
  본문 = String(본문 || '').trim();
  if (본문.length >= 200) return { text: 본문.length > 60000 ? 본문.slice(0, 60000) : 본문, source: '유튜브 자막' };
  if (!/^[\w-]{11}$/.test(String(videoId || ''))) return { text: '', source: '' };
  return { video: 설교영상주소_(videoId), source: '유튜브 영상 (AI가 직접 시청)' };
}

var 설교JSON_형식 =
  '아래 JSON 으로만 답하세요.\n' +
  '{\n' +
  '  "title": "설교 제목 (없으면 내용을 보고 지어 주세요)",\n' +
  '  "preacher": "설교자 이름 (모르면 빈 문자열)",\n' +
  '  "passage": "설교 본문 성경 구절 (모르면 빈 문자열)",\n' +
  '  "points": ["핵심 대지 3가지", "...", "..."],\n' +
  '  "messages": ["주요 메시지 3~5줄. 한 줄에 한 문장씩", "..."],\n' +
  '  "apply": ["삶에 적용할 점 2~3가지. 한 줄에 한 문장씩", "..."],\n' +
  '  "short3": ["오늘 설교를 3줄로 요약. 정확히 3줄", "...", "..."]\n' +
  '}\n\n' +
  '· points 는 정확히 3개로, 설교자가 나눈 흐름을 따라 짧은 문장으로 적어 주세요.\n' +
  '· messages 는 3개에서 5개 사이로, 청년들이 삶에 새길 만한 문장으로 적어 주세요.\n' +
  '· apply 는 2개에서 3개로, "이번 주 나는 ~합니다" 처럼 구체적인 행동으로 적어 주세요.\n' +
  '· short3 은 정확히 3줄로, 설교를 못 본 사람도 핵심을 알 수 있게 압축해 주세요.\n' +
  '· 잘못 받아 적힌 부분은 문맥으로 바로잡아 읽되, 설교에 없는 내용을 지어내지 마세요.';

/** 화면의 "요약" 버튼 — 준비 (로그인 · 자막 찾기 · 프롬프트). AI 호출은 server.js 가 비동기로 합니다 */
function sermonMakePrep_(token, videoId, manualText) {
  if (!커미티토큰_(token)) throw new Error('커미티만 만들 수 있습니다.');
  AI확인_();
  videoId = String(videoId || '').trim();
  if (!videoId) throw new Error('영상을 골라주세요.');
  var 정보 = null;
  try { 유튜브영상들_().forEach(function (v) { if (v.id === videoId) 정보 = v; }); } catch (e) {}
  if (!정보) 정보 = { id: videoId, title: '', date: '', url: 설교영상주소_(videoId) };

  var 재료 = String(manualText || '').trim() ? { text: String(manualText).trim().slice(0, 60000), source: '붙여넣은 글' } : 설교재료_(videoId);
  if (!재료.text && !재료.video) throw new Error('이 영상에서 자막을 가져오지 못했습니다. 설교 원고나 자막 글을 아래 칸에 붙여 넣고 다시 눌러주세요.');
  if (재료.text && 재료.text.length < 200) throw new Error('붙여넣은 글이 너무 짧습니다. 200자 이상 붙여넣어 주세요.');

  var prompt = 재료.video
    ? '첨부한 유튜브 영상은 한인 교회 청년부 주일 설교입니다. 설교를 듣지 못한 청년이 읽고 은혜를 나눌 수 있도록 정리해 주세요.\n\n' +
      '영상 제목: ' + (정보.title || '(없음)') + '\n\n' + 설교JSON_형식
    : '아래는 한인 교회 청년부 주일 설교의 자막입니다. 설교를 듣지 못한 청년이 읽고 은혜를 나눌 수 있도록 정리해 주세요.\n\n' +
      '영상 제목: ' + (정보.title || '(없음)') + '\n\n' +
      '--- 자막 시작 ---\n' + 재료.text + '\n--- 자막 끝 ---\n\n' + 설교JSON_형식;
  return {
    kind: 'make', v: { id: 정보.id || videoId, title: 정보.title || '', date: 정보.date || '' },
    model: AI모델_(), prompt: prompt, video: 재료.video || '', source: 재료.source,
    system: 묵상_지침 + (재료.video ? 설교영상_지침보탬 : ''), temperature: 0.4, maxTokens: 2400, json: true,
    timeoutMs: 재료.video ? 240000 : 60000
  };
}

/** AI 답(JSON 글)을 읽어 설교 요약으로 저장합니다 */
function sermonMakeDone_(prep, out) {
  var t = String(out || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim(), d = null;
  try { d = JSON.parse(t); } catch (e) {
    var i = t.indexOf('{'), j = t.lastIndexOf('}');
    if (i >= 0 && j > i) { try { d = JSON.parse(t.slice(i, j + 1)); } catch (e2) {} }
  }
  if (!d) throw new Error('AI 응답을 읽지 못했습니다. 다시 한 번 눌러주세요.');
  var v = prep.v || {};
  var 줄 = function (a, n) { return (a || []).map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, n); };
  var item = {
    id: v.id,
    title: String(d.title || v.title || '설교').trim().slice(0, 150),
    date: v.date || ymd_(new Date()),
    preacher: String(d.preacher || '').trim().slice(0, 40),
    passage: String(d.passage || '').trim().slice(0, 80),
    points: 줄(d.points, 4), messages: 줄(d.messages, 6), apply: 줄(d.apply, 4), short3: 줄(d.short3, 3),
    at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
  };
  if (!item.points.length && !item.messages.length) throw new Error('AI가 이 영상에서 설교 내용을 찾지 못했습니다. 설교 원고를 붙여 넣고 다시 눌러주세요.');
  설교저장_(item);
  return { ok: true, item: item, source: prep.source || '' };
}

/** 관리 화면 "Gemini 자동 요약" — 준비 */
function sermonGeminiSummaryPrep_(key, link, text) {
  if (!isAdmin_(key)) throw new Error('관리자만 사용할 수 있습니다.');
  AI확인_();
  var 본문 = String(text || '').trim();
  var videoId = 유튜브영상ID추출_(link);
  var 제목 = '', 재료;
  if (!본문) {
    if (!String(link || '').trim()) throw new Error('유튜브 주소를 넣거나 설교 원고를 붙여넣어 주세요.');
    if (!videoId) throw new Error('유튜브 주소나 영상 ID를 정확히 넣어주세요.');
    재료 = 설교재료_(videoId);
  } else {
    if (본문.length < 200) throw new Error('붙여넣은 글이 너무 짧습니다. 200자 이상 붙여넣어 주세요.');
    재료 = { text: 본문.slice(0, 60000), source: '붙여넣은 글' };
  }
  if (!재료.text && !재료.video) throw new Error('이 영상에서 자막을 가져오지 못했습니다. 설교 원고나 자막 글(200자 이상)을 붙여넣고 다시 눌러주세요.');
  if (videoId) { try { 유튜브영상들_().forEach(function (v) { if (v.id === videoId) 제목 = v.title; }); } catch (e) {} }
  var prompt = 재료.video
    ? '첨부한 유튜브 영상은 한인 교회 청년부 주일 설교입니다. 정해진 형식으로 요약해 주세요.\n\n' + (제목 ? '영상 제목: ' + 제목 + '\n' : '')
    : '아래는 한인 교회 청년부 주일 설교의 ' + (재료.source === '유튜브 자막' ? '자막' : '원고(또는 녹취)') + '입니다. 정해진 형식으로 요약해 주세요.\n\n' +
      (제목 ? '영상 제목: ' + 제목 + '\n\n' : '') + '--- 시작 ---\n' + 재료.text + '\n--- 끝 ---';
  return {
    kind: 'summary', videoId: videoId, model: AI모델_(), prompt: prompt, video: 재료.video || '', source: 재료.source,
    system: 설교요약_지침 + (재료.video ? 설교영상_지침보탬 : ''), temperature: 0.3, maxTokens: 3000, json: false,
    timeoutMs: 재료.video ? 240000 : 60000
  };
}

/** 관리 화면 "Gemini 자동 요약" — 마무리 (형식이 어긋나면 다시 시킬 프롬프트를 함께 돌려줍니다) */
function sermonGeminiSummaryDone_(prep, out, tries) {
  out = String(out || '').replace(/^\s*```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').replace(/\*\*/g, '').trim();
  if (!out) throw new Error('Gemini가 응답하지 않았습니다. 다시 눌러주세요.');
  var res = { ok: true, text: out, videoId: prep.videoId, source: prep.source };
  if (설교요약형식맞나_(out)) return res;
  if (!tries) res.retryPrompt = prep.prompt + '\n\n※ 이전 답이 형식에 맞지 않았습니다. 핵심 대지는 정확히 3개, 주요 메시지는 3~5줄로, 지정한 항목 이름 그대로 다시 써 주세요.';
  res.formatWarning = true;
  return res;
}

/** 준비된 요청을 그 자리에서(기다리며) AI 에 보냅니다 — 예전 이름으로 부를 때 · 시험용 */
function 설교AI바로_(prep) {
  try {
    var r = HOST.gemini({ model: prep.model, prompt: prep.prompt, system: prep.system, temperature: prep.temperature, maxTokens: prep.maxTokens, json: !!prep.json, video: prep.video || '' });
    return (r && r.text) || '';
  } catch (e) {
    var msg = String((e && e.message) || e || '');
    if (/429|quota|RESOURCE_EXHAUSTED|rate/i.test(msg)) throw new Error('Gemini 사용량이 잠시 많습니다. 1분쯤 뒤에 다시 눌러주세요.');
    if (/[가-힣]/.test(msg)) throw e;
    throw new Error('Gemini 요약에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}

/* ------------------------------------------------------------
   2) 매주 자동 요약 — 자막이 없던 영상은 server.js 가 비동기로 "영상 요약"을 이어서 합니다
   ------------------------------------------------------------ */
/** 설교요약돌기 가 자막을 못 찾은 영상 — 영상으로 요약할 준비 */
function 설교영상준비_(v) {
  if (!AI켜짐_()) return null;
  var 있는것 = {};
  rows_(SHEET_설교).forEach(function (r) { var id = String(r[SM_ID] || '').trim(); if (id) 있는것[id] = 1; });
  if (!v || !v.id || 있는것[v.id]) return null;
  return {
    kind: 'make', v: { id: v.id, title: v.title || '', date: v.date || '' }, model: AI모델_(), video: 설교영상주소_(v.id), source: '유튜브 영상 (AI가 직접 시청)',
    prompt: '첨부한 유튜브 영상은 한인 교회 청년부 주일 설교입니다. 설교를 듣지 못한 청년이 읽고 은혜를 나눌 수 있도록 정리해 주세요.\n\n' +
      '영상 제목: ' + (v.title || '(없음)') + '\n\n' + 설교JSON_형식,
    system: 묵상_지침 + 설교영상_지침보탬, temperature: 0.4, maxTokens: 2400, json: true, timeoutMs: 240000
  };
}
/** 영상 요약을 저장하고 알림 */
function 설교영상저장_(prep, out) {
  var r = sermonMakeDone_(prep, out);
  try { 알림_('공지', '*', { title: '지난 주일 설교 요약이 올라왔습니다', body: r.item.title, url: (앱주소_() || '') + '?page=sermons' }); } catch (e) {}
  return r;
}

/* ------------------------------------------------------------
   3) 오늘의 묵상 — 날마다 자동으로 본문을 정하고 AI 가이드까지 만들어 둡니다
   ------------------------------------------------------------
   본문 고르는 순서 (앞에서 찾으면 멈춤)
     ① 관리자가 이미 그날 말씀을 확정해 두었으면 → 아무것도 하지 않음 (관리자 것이 우선)
     ② 연결해 둔 QT 구글 시트에 그 날짜 줄이 있으면 → 그 본문
     ③ 온라인 성구 일과표(LectServe — 매일 성경 읽기표, JSON) 의 그날 신약 · 구약 읽기 → 개역한글 본문(getBible, 저작권 만료 · 공개)
     ④ 그래도 없으면 → 날짜별 추천 구절(오늘의구절_) + 개역한글 본문
   본문 텍스트는 개역한글(공개 번역)만 가져옵니다 — 개역개정은 저작권이 있어 가져오지 않습니다.
   AI 는 해설 · 질문 · 적용 · 기도만 만들고, 본문을 베껴 쓰지 않습니다(묵상_지침). */

var 성경책_ = [
  // [번호, 한국어, 영어 이름들(소문자, 앞부분)]
  [1, '창세기', ['genesis', 'gen']], [2, '출애굽기', ['exodus', 'exod', 'ex']], [3, '레위기', ['leviticus', 'lev']], [4, '민수기', ['numbers', 'num']],
  [5, '신명기', ['deuteronomy', 'deut']], [6, '여호수아', ['joshua', 'josh']], [7, '사사기', ['judges', 'judg']], [8, '룻기', ['ruth']],
  [9, '사무엘상', ['1 samuel', '1samuel', 'i samuel', '1 sam']], [10, '사무엘하', ['2 samuel', '2samuel', 'ii samuel', '2 sam']],
  [11, '열왕기상', ['1 kings', '1kings', 'i kings', '1 kgs']], [12, '열왕기하', ['2 kings', '2kings', 'ii kings', '2 kgs']],
  [13, '역대상', ['1 chronicles', '1chronicles', 'i chronicles', '1 chr']], [14, '역대하', ['2 chronicles', '2chronicles', 'ii chronicles', '2 chr']],
  [15, '에스라', ['ezra']], [16, '느헤미야', ['nehemiah', 'neh']], [17, '에스더', ['esther', 'esth']], [18, '욥기', ['job']],
  [19, '시편', ['psalms', 'psalm', 'ps']], [20, '잠언', ['proverbs', 'prov']], [21, '전도서', ['ecclesiastes', 'eccl']], [22, '아가', ['song of songs', 'song of solomon', 'song']],
  [23, '이사야', ['isaiah', 'isa']], [24, '예레미야', ['jeremiah', 'jer']], [25, '예레미야애가', ['lamentations', 'lam']], [26, '에스겔', ['ezekiel', 'ezek']],
  [27, '다니엘', ['daniel', 'dan']], [28, '호세아', ['hosea', 'hos']], [29, '요엘', ['joel']], [30, '아모스', ['amos']], [31, '오바댜', ['obadiah', 'obad']],
  [32, '요나', ['jonah']], [33, '미가', ['micah', 'mic']], [34, '나훔', ['nahum', 'nah']], [35, '하박국', ['habakkuk', 'hab']], [36, '스바냐', ['zephaniah', 'zeph']],
  [37, '학개', ['haggai', 'hag']], [38, '스가랴', ['zechariah', 'zech']], [39, '말라기', ['malachi', 'mal']],
  [40, '마태복음', ['matthew', 'matt']], [41, '마가복음', ['mark']], [42, '누가복음', ['luke']], [43, '요한복음', ['john']], [44, '사도행전', ['acts']],
  [45, '로마서', ['romans', 'rom']], [46, '고린도전서', ['1 corinthians', '1corinthians', 'i corinthians', '1 cor']], [47, '고린도후서', ['2 corinthians', '2corinthians', 'ii corinthians', '2 cor']],
  [48, '갈라디아서', ['galatians', 'gal']], [49, '에베소서', ['ephesians', 'eph']], [50, '빌립보서', ['philippians', 'phil']], [51, '골로새서', ['colossians', 'col']],
  [52, '데살로니가전서', ['1 thessalonians', '1thessalonians', 'i thessalonians', '1 thess']], [53, '데살로니가후서', ['2 thessalonians', '2thessalonians', 'ii thessalonians', '2 thess']],
  [54, '디모데전서', ['1 timothy', '1timothy', 'i timothy', '1 tim']], [55, '디모데후서', ['2 timothy', '2timothy', 'ii timothy', '2 tim']], [56, '디도서', ['titus']],
  [57, '빌레몬서', ['philemon', 'phlm']], [58, '히브리서', ['hebrews', 'heb']], [59, '야고보서', ['james', 'jas']],
  [60, '베드로전서', ['1 peter', '1peter', 'i peter', '1 pet']], [61, '베드로후서', ['2 peter', '2peter', 'ii peter', '2 pet']],
  [62, '요한일서', ['1 john', '1john', 'i john']], [63, '요한이서', ['2 john', '2john', 'ii john']], [64, '요한삼서', ['3 john', '3john', 'iii john']],
  [65, '유다서', ['jude']], [66, '요한계시록', ['revelation', 'rev']]
];

/** "Matthew 21:23-end" · "James 4" · "Psalm (80:1-6); 80:7-19" · "요한복음 3:16-21" · "시편 23편" → { no, ko, ch, v1, v2 } (v2 = 'end' 가능) */
function 구절풀기_(ref) {
  ref = String(ref || '').replace(/[()\[\]]/g, '').split(';')[0].trim();
  if (!ref) return null;
  var m = /^(.+?)\s*(\d+)\s*(?:편|장)?\s*(?:[:：.]\s*(\d+)\s*(?:절)?\s*(?:[-–~]\s*(\d+|end)\s*절?)?)?\s*$/i.exec(ref);
  if (!m) return null;
  var name = m[1].trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  var hit = null;
  성경책_.forEach(function (b) {
    if (hit) return;
    if (b[1] === m[1].trim() || b[1].replace(/복음$|서$|기$/, '') === m[1].trim()) { hit = b; return; }
    b[2].forEach(function (en) { if (!hit && (name === en || name === en.replace(/ /g, ''))) hit = b; });
  });
  if (!hit) return null;
  return { no: hit[0], ko: hit[1], ch: Number(m[2]), v1: m[3] ? Number(m[3]) : 0, v2: m[4] ? (/end/i.test(m[4]) ? 'end' : Number(m[4])) : (m[3] ? Number(m[3]) : 0) };
}

/** 개역한글 본문 (getBible v2 — 공개 번역). 한 장을 받아 필요한 절만 "16 …" 줄로 이어 붙입니다 */
function 개역한글본문_(p) {
  if (!p || !p.no || !p.ch) return null;
  var url = 'https://api.getbible.net/v2/korean/' + p.no + '/' + p.ch + '.json';
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'Accept': 'application/json' } });
  if (r.getResponseCode() >= 300) throw new Error('성경 본문을 받지 못했습니다 (' + r.getResponseCode() + ').');
  var d = JSON.parse(r.getContentText() || '{}');
  var vs = (d && d.verses) || [];
  if (!vs.length) return null;
  var last = vs[vs.length - 1].verse;
  var a = p.v1 || 1, b = p.v2 === 'end' ? last : (p.v2 || (p.v1 ? p.v1 : Math.min(last, 20)));   // 장 전체면 앞 20절까지 (묵상 분량)
  if (b < a) b = a;
  var lines = vs.filter(function (x) { return x.verse >= a && x.verse <= b; }).map(function (x) { return x.verse + ' ' + String(x.text || '').replace(/\s+/g, ' ').trim(); });
  if (!lines.length) return null;
  var 표기 = p.ko + ' ' + p.ch + (a === 1 && b === last ? '장' : ':' + a + (b !== a ? '-' + b : ''));
  return { verse: 표기, text: lines.join('\n'), translation: '개역한글' };
}

/** 온라인 성구 일과표(LectServe)에서 그날 읽을 본문 표기 몇 개 (영어) */
function 일과표본문들_(date) {
  var r = UrlFetchApp.fetch('https://www.lectserve.com/date/' + date + '?dailyLect=acna-sec', { muteHttpExceptions: true, followRedirects: true, headers: { 'Accept': 'application/json' } });
  if (r.getResponseCode() >= 300) return [];
  var d = {};
  try { d = JSON.parse(r.getContentText() || '{}'); } catch (e) { return []; }
  var rd = (d.daily && d.daily.readings) || {};
  // 청년 묵상에는 신약(두 번째 읽기)을 먼저, 그다음 구약
  return [rd.morning && rd.morning.second, rd.evening && rd.evening.second, rd.morning && rd.morning.first, rd.evening && rd.evening.first].filter(Boolean);
}

/** 그날 묵상 본문을 정합니다 → { verse, text, from } (못 찾으면 null) */
function 오늘묵상본문찾기_(date) {
  try { var qt = 시트QT가져오기_(date); if (qt && qt.verse && qt.text) return { verse: qt.verse, text: qt.text, from: 'QT 시트' }; } catch (e) { /* 시트가 없거나 그 날짜 줄이 없음 */ }
  var refs = [];
  try { refs = 일과표본문들_(date); } catch (e) { refs = []; }
  for (var i = 0; i < refs.length; i++) {
    try { var b = 개역한글본문_(구절풀기_(refs[i])); if (b) return { verse: b.verse, text: b.text, from: '온라인 성경 읽기표 (' + refs[i] + ')' }; } catch (e) {}
  }
  try { var c = 개역한글본문_(구절풀기_(오늘의구절_())); if (c) return { verse: c.verse, text: c.text, from: '추천 구절' }; } catch (e) {}
  return null;
}

function 묵상자동켜짐_() { return AI켜짐_() && String(설정값_('묵상자동') || '켜기').trim() !== '끄기'; }

/** 매일 새벽 (lib/scheduler.js) — 그날 확정된 말씀이 없으면 본문을 찾아 AI 가이드까지 만들어 저장합니다 */
function 오늘묵상자동돌기(date) {
  date = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : ymd_(new Date());
  if (!묵상자동켜짐_()) return { ok: true, off: true };
  if (오늘묵상확정_(date)) return { ok: true, skipped: 'exists' };
  var qt = 오늘묵상본문찾기_(date);
  if (!qt) return { ok: false, error: '오늘 본문을 찾지 못했습니다.' };
  var ai = 오늘묵상AI만들기_(qt.verse, qt.text);
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var row = [date, qt.verse, qt.text, now, '자동 (AI · ' + qt.from + ')', ai.explain.join('\n'), ai.questions.join('\n'), ai.apply.join('\n'), ai.prayer];
  if (오늘묵상확정_(date)) return { ok: true, skipped: 'exists' };                 // 그 사이 관리자가 저장했으면 그대로
  오늘묵상확정시트_().appendRow(row);
  캐시비움_();
  return { ok: true, date: date, verse: qt.verse, from: qt.from };
}

/** 관리 화면 "온라인에서 오늘 본문 가져오기" — 미리 보기만 (저장은 기존 saveTodayVerse) */
function adminFetchOnlineQT(key, date) {
  if (!isAdmin_(key) && !커미티토큰_(key)) throw new Error('커미티 · 관리자만 할 수 있습니다.');
  date = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : ymd_(new Date());
  var qt = 오늘묵상본문찾기_(date);
  if (!qt) throw new Error('온라인에서 ' + date + ' 본문을 찾지 못했습니다. 구절을 직접 적어주세요.');
  var ai = { explain: [], questions: [], apply: [], prayer: '' }, aiError = '';
  try { ai = 오늘묵상AI만들기_(qt.verse, qt.text); } catch (e) { aiError = e.message || String(e); }
  return Object.assign({ date: date, verse: qt.verse, text: qt.text, from: qt.from }, ai, { aiError: aiError });
}

/** 관리 화면 — 자동 묵상 켜기/끄기 */
function setDevotionAuto(key, on) {
  if (!isAdmin_(key) && !커미티토큰_(key)) throw new Error('커미티 · 관리자만 할 수 있습니다.');
  설정저장_('묵상자동', on ? '켜기' : '끄기');
  return { on: 묵상자동켜짐_(), setting: on ? '켜기' : '끄기' };
}
function getDevotionAuto(key) {
  if (!isAdmin_(key) && !커미티토큰_(key)) throw new Error('커미티 · 관리자만 볼 수 있습니다.');
  return { on: String(설정값_('묵상자동') || '켜기').trim() !== '끄기', ai: AI켜짐_() };
}
