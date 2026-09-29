/**
 * DB 배치 — 구글 시트 11개(통합문서)의 지도와 찾기
 * ------------------------------------------------------------
 * 예전에는 시트 한 개(SPREADSHEET_ID)에 탭이 60여 개 들어 있었습니다.
 * 이제 드라이브 폴더(DB_FOLDER_ID) 안의 11개 시트에 나누어 담습니다.
 * 업무 로직(logic/app.js)은 예전처럼 탭 이름('새가족', '지출신청' …)만 부르고,
 * 어느 시트에 있는 탭인지는 여기 표와 lib/google.js 가 알아서 찾아 줍니다.
 *
 * 환경 변수
 *   DB_FOLDER_ID         11개 시트가 들어 있는 드라이브 폴더 (있으면 새 방식, 없으면 예전 방식 그대로)
 *   DB_IDS               (선택) 이름으로 못 찾을 때 직접 지정 — {"cell":"시트ID","system":"시트ID", …}
 *   SPREADSHEET_ID      예전 시트. 새 방식에서는 "아직 옮기지 않은 탭"을 잠시 읽어 주는 예비로만 씁니다
 *   DB_LEGACY_FALLBACK   off 로 하면 예비 읽기를 끕니다 (옮기기를 모두 끝낸 뒤)
 */
const bridge = require('./bridge');

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/** 11개 시트 — code 는 시트 이름 앞의 [DB01] 표식입니다 */
const WORKBOOKS = [
  { key: 'cell',      code: 'DB01', title: '셀 사역 및 관리',       en: 'Cell Ministry & Management' },
  { key: 'ministry',  code: 'DB02', title: '사역 보고 및 관리',     en: 'Ministry Reports & Management' },
  { key: 'finance',   code: 'DB03', title: '재정 자료',             en: 'Finance Data' },
  { key: 'newcomers', code: 'DB04', title: '새가족',                en: 'Newcomers' },
  { key: 'worship',   code: 'DB05', title: '찬양 및 방송 허브',     en: 'Praise & Broadcast Hub' },
  { key: 'missions',  code: 'DB06', title: '선교',                  en: 'Missions' },
  { key: 'album',     code: 'DB07', title: '포토 앨범',             en: 'Photo Album' },
  { key: 'minutes',   code: 'DB08', title: '회의록',                en: 'Meeting Minutes' },
  { key: 'forms',     code: 'DB09', title: '신청서',                en: 'Forms' },
  { key: 'bulletin',  code: 'DB10', title: '주보',                  en: 'Bulletins' },
  { key: 'system',    code: 'DB11', title: '기타 시스템 자료',      en: 'Misc System Data' },
];
const BY_KEY = {};
WORKBOOKS.forEach((w) => { BY_KEY[w.key] = w; });

/** 실제로 만드는 시트 이름 — 예: "[DB04] 새가족 · Newcomers" */
function fileTitle(w) { return '[' + w.code + '] ' + w.title + ' · ' + w.en; }

/**
 * 탭 → 시트. 여기가 "어느 탭이 어느 시트로 가는지"의 유일한 기준입니다.
 * 표에 없는 탭은 'system' 으로 갑니다 (새 탭을 만들어도 로직이 멈추지 않게).
 */
const TABS = {
  // (1) 셀 사역 및 관리
  cell: ['셀목록', '셀원명단', '응답원본', '출결기록', '명단변경기록', '리마인더기록', '주일독려기록',
    '셀대리작성자', '셀신청', '셀편성', '셀요주인물', '셀명단보관'],
  // (2) 사역 보고 및 관리
  ministry: ['사역팀', '사역팀원', '사역보고서', '사역팀원상태', '제자훈련명단', '제자훈련출결', '제자훈련기수'],
  // (3) 재정 자료
  finance: ['지출신청', '지출항목', '지출처리이력', '예산', '헌금번호신청', '지출영문',
    // 행사 예산 · 실적 · 정산 (Step 3)
    '행사예산', '행사예산항목', '행사거래', '행사정산', '행사이력'],
  // (4) 새가족
  newcomers: ['새가족', '새가족과정', '새가족추적', '새가족팀원', '새가족연락', '배정알림기록'],
  // (5) 찬양 · 방송 허브
  worship: ['찬양편성', '찬양불가', '찬양콘티', '찬양악보', '찬양주보', '찬양댓글', '찬양행사', '찬양공지', '찬양녹음', '찬양주석', '연습설정', '악보저장소', '찬양가사'],
  // (6) 선교
  missions: ['선교팀', '선교팀원', '선교팀일정', '선교팀자료'],
  // (7) 포토 앨범
  album: ['포토앨범', '포토앨범사진'],
  // (8) 회의록
  minutes: ['회의록', '회의할일'],
  // (9) 신청서
  forms: ['신청서', '신청내역', '신청서본보기'],
  // (10) 주보
  bulletin: ['주보', '대표기도스케줄', '뒷정리스케줄'],
  // (11) 기타 시스템 자료 — 설정 · 교적 · 알림 · 권한 · 묵상 · 설교 …
  system: ['설정', '교적', '알림기기', '포털공지', '팀계정', '할일숨김', '마감일', '묵상기록', '오늘묵상확정', '설교요약',
    '사용자권한', '알림기록'],
};
/** 이름이 정해진 앞머리로 시작하는 탭 (셀마다 하나씩 생기는 '[셀] 1셀' 등) */
const PREFIXES = [['[셀] ', 'cell']];

const TAB_KEY = {};
Object.keys(TABS).forEach((k) => TABS[k].forEach((t) => { TAB_KEY[t] = k; }));

/** 탭 이름 → 시트 key (표에 없으면 'system') */
function keyFor(tab) {
  tab = String(tab == null ? '' : tab);
  if (Object.prototype.hasOwnProperty.call(TAB_KEY, tab)) return TAB_KEY[tab];
  for (const [pre, k] of PREFIXES) if (tab.indexOf(pre) === 0) return k;
  return 'system';
}
/** 표에 이름이 올라 있는 탭인지 (점검용) */
function isMapped(tab) {
  tab = String(tab == null ? '' : tab);
  return Object.prototype.hasOwnProperty.call(TAB_KEY, tab) || PREFIXES.some((p) => tab.indexOf(p[0]) === 0);
}

/* ---------------- 켜기 · 끄기 ---------------- */

const folderId = () => String(process.env.DB_FOLDER_ID || '').trim();
/** 새 방식(11개 시트)을 쓰는지 — DB_FOLDER_ID 가 있을 때만 */
const enabled = () => !!folderId();
const legacyFallback = () => String(process.env.DB_LEGACY_FALLBACK || 'on').toLowerCase() !== 'off';

function overrides() {
  const raw = String(process.env.DB_IDS || '').trim();
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch (e) { throw new Error('DB_IDS 가 올바른 JSON 이 아닙니다: ' + e.message); }
}

/* ---------------- 폴더 안의 시트 찾기 ---------------- */

/** 폴더 안의 스프레드시트 목록 [{id, name, modifiedTime}] — 드라이브 호출 한 번 */
function listFolder() {
  const id = folderId();
  if (!id) throw new Error('DB_FOLDER_ID 환경 변수가 없습니다.');
  const q = "'" + id.replace(/['\\]/g, '\\$&') + "' in parents and mimeType = '" + SHEET_MIME + "' and trashed = false";
  const out = [];
  let pageToken;
  do {
    const d = bridge.drive('files.list', {
      q, fields: 'nextPageToken,files(id,name,modifiedTime)', pageSize: 100, orderBy: 'name', pageToken,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    out.push(...(d.files || []));
    pageToken = d.nextPageToken;
  } while (pageToken);
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s·・&.,()\[\]_\-]+/g, '');

/**
 * 폴더의 파일들을 11개 자리에 맞춥니다.
 *   1) DB_IDS 로 직접 지정한 것
 *   2) 이름에 [DB01] 같은 표식이 있는 것
 *   3) 이름에 한글/영문 시트 이름이 들어 있는 것 (예: "셀 사역 및 관리")
 * 반환: { byKey: {key: {id,name,modifiedTime}}, missing: [key], duplicates: {key:[파일]}, extra: [파일] }
 */
function resolve(files) {
  files = files || [];
  const byKey = {}, duplicates = {}, used = new Set();
  const over = overrides();
  const stamp = (id) => (files.find((f) => f.id === id) || {}).modifiedTime || '';

  WORKBOOKS.forEach((w) => {
    if (over[w.key]) {
      byKey[w.key] = { id: String(over[w.key]), name: '(DB_IDS)', modifiedTime: stamp(over[w.key]) };
      used.add(String(over[w.key]));
    }
  });
  const take = (w, hits) => {
    if (!hits.length) return;
    byKey[w.key] = hits[0];
    used.add(hits[0].id);
    if (hits.length > 1) duplicates[w.key] = hits;
  };
  // 표식이 먼저 — 이름이 비슷한 시트끼리 헷갈리지 않게
  WORKBOOKS.forEach((w) => {
    if (byKey[w.key]) return;
    const re = new RegExp('\\[\\s*' + w.code + '\\s*\\]', 'i');
    take(w, files.filter((f) => !used.has(f.id) && re.test(f.name || '')));
  });
  WORKBOOKS.forEach((w) => {
    if (byKey[w.key]) return;
    const a = norm(w.title), b = norm(w.en);
    take(w, files.filter((f) => {
      if (used.has(f.id)) return false;
      const n = norm(f.name);
      return n.indexOf(a) !== -1 || n.indexOf(b) !== -1;
    }));
  });

  return {
    byKey,
    missing: WORKBOOKS.filter((w) => !byKey[w.key]).map((w) => w.key),
    duplicates,
    extra: files.filter((f) => !used.has(f.id)),
  };
}

module.exports = {
  WORKBOOKS, BY_KEY, TABS, PREFIXES, SHEET_MIME,
  keyFor, isMapped, fileTitle, folderId, enabled, legacyFallback, overrides, listFolder, resolve,
};
