/**
 * 업무 로직(logic/app.js) 실행기
 * ------------------------------------------------------------
 * 요청이 올 때마다 로직을 "새로" 준비해서 한 번 실행합니다.
 * (전역 변수에 남은 값이 다음 요청으로 새지 않게 — 예전 방식과 같습니다)
 * 요청은 한 번에 하나씩 처리되므로 동시에 시트를 고치다 꼬이는 일이 없습니다.
 */
const fs = require('fs');
const path = require('path');
const { makeServices, store } = require('./google');
const bridge = require('./bridge');
const notesBuffer = require('./notes-buffer');      // Step 4 — 설교 노트 쓰기 버퍼 (logic/notes.js 가 HOST.notes 로 씁니다)

const FILE = path.join(__dirname, '..', 'logic', 'app.js');
const SERVICE_NAMES = ['SpreadsheetApp', 'DriveApp', 'CalendarApp', 'MailApp', 'GmailApp', 'UrlFetchApp',
  'Utilities', 'Session', 'CacheService', 'LockService', 'MimeType', 'Logger', 'HOST'];

/**
 * logic/app.js 뒤에 이어 붙여 같은 범위에서 함께 실행하는 확장 파일들.
 * app.js 의 함수 · 변수를 그대로 쓰므로 app.js 를 더 키우지 않고 새 기능을 나누어 둘 수 있습니다.
 * (없는 파일은 건너뜁니다. app.js 가 앞에 오므로 app.js 의 줄 번호는 그대로입니다)
 */
const EXTRA_FILES = ['permissions.js', 'deeplink.js', 'worship2.js', 'worship3.js', 'worship4.js', 'training.js', 'eventbudget.js', 'eventbudget-io.js', 'eventbudget-flow.js', 'eventbudget-actuals.js', 'notes.js', 'forms2.js', 'forms3.js', 'step10.js', 'step11.js', 'worship5.js', 'equipment.js'];
const code = [FILE]
  .concat(EXTRA_FILES.map((f) => path.join(__dirname, '..', 'logic', f)).filter((p) => fs.existsSync(p)))
  .map((p) => fs.readFileSync(p, 'utf8'))
  .join('\n;\n');
const ALL_NAMES = Array.from(code.matchAll(/^function\s+([^\s(]+)\s*\(/gm), (m) => m[1]);
const NAMES = Array.from(new Set(ALL_NAMES));
// 같은 이름의 함수가 두 번 있으면 뒤의 것이 앞의 것을 덮어써 엉뚱하게 동작합니다 — 시작할 때 알려줍니다
const DUP = ALL_NAMES.filter((n, i) => ALL_NAMES.indexOf(n) !== i);
if (DUP.length) console.error('[경고] logic/app.js 에 같은 이름의 함수가 있습니다:', DUP.join(', '));
// eslint-disable-next-line no-new-func
const factory = new Function(...SERVICE_NAMES,
  code + '\n;return {' + NAMES.map((n) => JSON.stringify(n) + ': ' + n).join(',\n') + '};');

/** 화면에서 부를 수 없는 함수 — 관리 작업(/tasks)이나 자동 발송에서만 씁니다 */
const NOT_FROM_BROWSER = new Set([
  'doGet', '최초설정', '설정확인', '새가족시트정리', '교적생년월일정리',
  '미제출리마인더', '주일독려', '마감알림', '설교요약돌기', '지출번역돌기', '리마인더트리거설치', '주일독려트리거설치',
  '리마인더미리보기', '지출신청미리보기', '주일독려미리보기',
]);

function isCallable(name) {
  return NAMES.indexOf(name) !== -1 && !/_$/.test(name) && name.indexOf('원래') === -1 && !NOT_FROM_BROWSER.has(name);
}

let scheduleNames = () => [];
function setScheduleSource(fn) { scheduleNames = fn; }

function baseUrl() {
  const b = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || ('http://localhost:' + (process.env.PORT || 3000));
  return b.replace(/\/+$/, '') + '/';
}

/**
 * 로직을 한 번 실행합니다. work(api, exec) 안에서 api.함수이름(...) 으로 부릅니다.
 * 끝나면(오류가 나도) 모아 둔 시트 쓰기를 모두 보냅니다 — 예전과 똑같이 오류 전까지 쓴 내용은 남습니다.
 */
function run(work) {
  const exec = { books: new Set(), alerts: [] };
  const HOST = {
    baseUrl,
    alert: (msg) => { exec.alerts.push(String(msg)); },
    schedules: () => scheduleNames(),
    accessToken: () => bridge.call('token'),
    vapid: () => bridge.call('vapid'),
    gemini: (o) => bridge.call('gemini', o),
    geminiModels: () => bridge.call('geminiModels'),
    hasGemini: () => !!process.env.GEMINI_API_KEY,
    /** Step 13 — 유튜브 · 악보 이미지 검색 열쇠 (서버 로직에서만 씁니다 — 화면으로는 절대 내보내지 않음). CSE 열쇠를 따로 안 두면 유튜브 열쇠로 대신합니다 */
    searchKeys: () => ({ yt: process.env.YOUTUBE_API_KEY || '', cse: process.env.GOOGLE_CSE_API_KEY || process.env.YOUTUBE_API_KEY || '', cx: process.env.GOOGLE_CSE_CX || '', brave: process.env.BRAVE_SEARCH_API_KEY || '' }),
    fetchImage: (o) => bridge.call('fetchImage', o),
    notes: notesBuffer,
    push: (o) => bridge.call('push', o),
    /** 지금 당장 시트를 다시 읽게 합니다 (화면의 "새로고침" 버튼) */
    forget: () => { store.forget(); },
    page: (file, title, params, favicon) => ({ __page: true, file, title, params, favicon }),
  };
  const services = Object.assign(makeServices(exec), { HOST });
  let result, failure = null;
  try {
    store.checkExternal();
    const api = factory(...SERVICE_NAMES.map((n) => services[n]));
    result = work(api, exec);
  } catch (e) {
    failure = e;
  }
  const wrote = [];
  for (const book of exec.books) {
    try {
      book.flush();
    } catch (e) {
      console.error('[시트 쓰기 실패]', e.message);
      if (!failure) failure = new Error('시트에 저장하지 못했습니다: ' + e.message);
    }
    if (book.wrote && store.owns(book)) wrote.push(book);
    book.wrote = false;
  }
  if (wrote.length) store.afterWrite(wrote);
  if (failure) throw failure;
  return { result, alerts: exec.alerts };
}

module.exports = { run, isCallable, NAMES, setScheduleSource, baseUrl };
