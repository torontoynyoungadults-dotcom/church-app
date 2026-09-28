/**
 * DB 정리 도우미 — 11개 시트를 만들고, 옛 시트(SPREADSHEET_ID)의 탭을 옮깁니다.
 *
 *   npm run db:status                      지금 상태 보기 (아무것도 바꾸지 않습니다)
 *   npm run db:create                      DB_FOLDER_ID 폴더에 빠진 시트를 만듭니다
 *   npm run db:migrate                     옮길 계획만 보여줍니다 (아무것도 바꾸지 않습니다)
 *   npm run db:migrate -- --apply          실제로 복사합니다 — 옛 시트는 지우지 않고 그대로 둡니다
 *   npm run db:migrate -- --apply --overwrite   이미 옮긴 탭도 옛 시트 내용으로 다시 덮어씁니다
 *
 * 필요한 환경 변수: DB_FOLDER_ID, (옮길 때) SPREADSHEET_ID, 구글 인증 (npm run check 와 같음)
 */
process.env.TZ = process.env.TZ || 'America/Toronto';
const bridge = require('../lib/bridge');
const db = require('../lib/db');

const say = (m) => console.log(m);
const ok = (m) => say('  ✓ ' + m);
const bad = (m) => { say('  ✗ ' + m); process.exitCode = 1; };
const warn = (m) => say('  ! ' + m);
const quote = (t) => "'" + String(t).replace(/'/g, "''") + "'";
const DEFAULT_TAB = /^(sheet\s?1|시트\s?1)$/i;

function legacyId() { return String(process.env.SPREADSHEET_ID || '').trim(); }

function bookInfo(id) {
  return bridge.sheets('spreadsheets.get', {
    spreadsheetId: id,
    fields: 'properties(title,timeZone),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))',
  });
}
const tabsOf = (info) => (info.sheets || []).map((s) => s.properties);

/** 여러 탭의 값을 한꺼번에 읽어 { 탭이름: 값 } 으로 */
function readTabs(id, titles, render) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const part = titles.slice(i, i + 40);
    const r = bridge.sheets('spreadsheets.values.batchGet', {
      spreadsheetId: id, ranges: part.map(quote), valueRenderOption: render || 'UNFORMATTED_VALUE',
    });
    part.forEach((t, k) => { out[t] = (r.valueRanges[k] && r.valueRanges[k].values) || []; });
  }
  return out;
}

function registry() {
  if (!db.enabled()) throw new Error('DB_FOLDER_ID 환경 변수가 없습니다. 11개 시트를 넣어 둔 드라이브 폴더의 ID 를 넣어주세요.');
  return db.resolve(db.listFolder());
}

/* ------------------------------------------------------------------ status */
function status() {
  say('\n[환경 변수]');
  db.enabled() ? ok('DB_FOLDER_ID = ' + db.folderId()) : bad('DB_FOLDER_ID 가 없습니다 (없으면 앱은 예전 방식 — 시트 하나 — 으로 동작합니다)');
  legacyId() ? ok('SPREADSHEET_ID = ' + legacyId() + ' (옛 시트 · 예비 읽기 ' + (db.legacyFallback() ? '켜짐' : '꺼짐') + ')')
    : warn('SPREADSHEET_ID 없음 — 옛 시트를 읽는 예비 경로가 없습니다 (옮기기를 모두 끝낸 상태라면 정상)');
  if (!db.enabled()) return;

  say('\n[폴더 안의 11개 시트]');
  const reg = registry();
  db.WORKBOOKS.forEach((w) => {
    const e = reg.byKey[w.key];
    e ? ok('[' + w.code + '] ' + w.title + ' → "' + e.name + '" (' + e.id + ')') : bad('[' + w.code + '] ' + w.title + ' 없음 — npm run db:create');
  });
  Object.keys(reg.duplicates).forEach((k) => warn(k + ' 자리에 후보가 여러 개입니다: ' + reg.duplicates[k].map((f) => f.name).join(' / ') + ' (첫 번째를 씁니다)'));
  if (reg.extra.length) warn('어느 자리에도 안 맞는 시트 ' + reg.extra.length + '개: ' + reg.extra.map((f) => f.name).join(', '));

  if (!legacyId()) return;
  say('\n[옛 시트의 탭 → 옮겨갈 시트]');
  const info = bookInfo(legacyId());
  const tabs = tabsOf(info);
  ok('"' + info.properties.title + '" · 탭 ' + tabs.length + '개');
  const counts = {}, unmapped = [];
  tabs.forEach((t) => {
    const k = db.keyFor(t.title);
    counts[k] = (counts[k] || 0) + 1;
    if (!db.isMapped(t.title)) unmapped.push(t.title);
  });
  db.WORKBOOKS.forEach((w) => { if (counts[w.key]) say('    [' + w.code + '] ' + w.title + ': ' + counts[w.key] + '개'); });
  if (unmapped.length) warn('지도에 없는 탭 ' + unmapped.length + '개는 [DB11] 기타 시스템 자료로 갑니다: ' + unmapped.join(', '));

  say('\n[시트 사이 수식 점검]  (탭을 다른 파일로 옮기면 다른 탭을 가리키는 수식은 깨집니다)');
  const f = readTabs(legacyId(), tabs.map((t) => t.title), 'FORMULA');
  const withFormula = tabs.map((t) => [t.title, (f[t.title] || []).reduce((n, row) => n + row.filter((v) => typeof v === 'string' && v.charAt(0) === '=').length, 0)])
    .filter((x) => x[1] > 0);
  withFormula.length ? withFormula.forEach((x) => warn('"' + x[0] + '" 에 수식 ' + x[1] + '개 — 옮긴 뒤 확인이 필요합니다')) : ok('수식이 든 탭이 없습니다');
}

/* ------------------------------------------------------------------ create */
function create() {
  const reg = registry();
  const tz = legacyId() ? bookInfo(legacyId()).properties.timeZone : process.env.TZ;
  say('\n[빠진 시트 만들기]');
  let made = 0;
  db.WORKBOOKS.forEach((w) => {
    if (reg.byKey[w.key]) return;
    const f = bridge.drive('files.create', {
      requestBody: { name: db.fileTitle(w), mimeType: db.SHEET_MIME, parents: [db.folderId()] },
      fields: 'id,name', supportsAllDrives: true,
    });
    bridge.sheets('spreadsheets.batchUpdate', {
      spreadsheetId: f.id, requestBody: { requests: [{ updateSpreadsheetProperties: { properties: { timeZone: tz }, fields: 'timeZone' } }] },
    });
    ok('만들었습니다: ' + f.name + ' (' + f.id + ')');
    made++;
  });
  if (!made) ok('11개가 모두 이미 있습니다');
  return made;
}

/* ----------------------------------------------------------------- migrate */
function plan(overwrite) {
  if (!legacyId()) throw new Error('옮길 옛 시트가 없습니다 — SPREADSHEET_ID 를 넣어주세요.');
  const reg = registry();
  if (reg.missing.length) {
    throw new Error('폴더에 없는 시트: ' + reg.missing.map((k) => db.BY_KEY[k].title).join(', ') + ' — 먼저 npm run db:create');
  }
  const legacy = tabsOf(bookInfo(legacyId()));
  const targets = {};
  db.WORKBOOKS.forEach((w) => { targets[w.key] = { entry: reg.byKey[w.key], tabs: tabsOf(bookInfo(reg.byKey[w.key].id)) }; });
  const rows = legacy.map((t) => {
    const key = db.keyFor(t.title), tg = targets[key];
    const there = tg.tabs.find((x) => x.title === t.title);
    return { title: t.title, sheetId: t.sheetId, key, targetId: tg.entry.id, existing: there || null,
      action: there ? (overwrite ? 'overwrite' : 'skip') : 'copy' };
  });
  return { rows, targets };
}

function migrate(opt) {
  opt = opt || {};
  const { rows, targets } = plan(!!opt.overwrite);
  say('\n[옮기기 계획]  ' + (opt.apply ? '(실제로 복사합니다)' : '(미리보기 — 아무것도 바꾸지 않습니다)'));
  rows.forEach((r) => say('    ' + r.action.padEnd(10) + ' ' + r.title + '  →  [' + db.BY_KEY[r.key].code + '] ' + db.BY_KEY[r.key].title));
  const todo = rows.filter((r) => r.action !== 'skip');
  const skipped = rows.length - todo.length;
  say('\n  복사 ' + todo.filter((r) => r.action === 'copy').length + ' · 덮어쓰기 ' + todo.filter((r) => r.action === 'overwrite').length + ' · 건너뜀(이미 있음) ' + skipped);
  if (!opt.apply) { say('\n  실제로 하려면: npm run db:migrate -- --apply\n'); return { rows, applied: false }; }

  for (const r of todo) {
    const props = bridge.sheets('spreadsheets.sheets.copyTo', {
      spreadsheetId: legacyId(), sheetId: r.sheetId, requestBody: { destinationSpreadsheetId: r.targetId },
    });
    const requests = [];
    if (r.existing) requests.push({ deleteSheet: { sheetId: r.existing.sheetId } });
    requests.push({ updateSheetProperties: { properties: { sheetId: props.sheetId, title: r.title }, fields: 'title' } });
    bridge.sheets('spreadsheets.batchUpdate', { spreadsheetId: r.targetId, requestBody: { requests } });
    ok(r.title + ' 복사함');
  }

  // 새 시트에 처음부터 있던 빈 "시트1" 은 지웁니다 (다른 탭이 생겼고 비어 있을 때만)
  db.WORKBOOKS.forEach((w) => {
    const t = targets[w.key];
    if (!todo.some((r) => r.key === w.key)) return;
    const tabs = tabsOf(bookInfo(t.entry.id));
    if (tabs.length < 2) return;
    tabs.filter((x) => DEFAULT_TAB.test(x.title)).forEach((x) => {
      const v = readTabs(t.entry.id, [x.title])[x.title];
      if (v.length) return;
      bridge.sheets('spreadsheets.batchUpdate', { spreadsheetId: t.entry.id, requestBody: { requests: [{ deleteSheet: { sheetId: x.sheetId } }] } });
      ok('[' + w.code + '] 빈 기본 탭 "' + x.title + '" 을 지웠습니다');
    });
  });

  // 검증 — 옛 시트와 새 시트의 값이 같은지 탭마다 비교합니다
  say('\n[검증] 옛 시트와 새 시트의 값 비교');
  const legacyVals = readTabs(legacyId(), todo.map((r) => r.title));
  let mismatch = 0;
  db.WORKBOOKS.forEach((w) => {
    const mine = todo.filter((r) => r.key === w.key);
    if (!mine.length) return;
    const got = readTabs(targets[w.key].entry.id, mine.map((r) => r.title));
    mine.forEach((r) => {
      if (JSON.stringify(got[r.title]) === JSON.stringify(legacyVals[r.title])) return;
      mismatch++;
      bad('"' + r.title + '" 값이 옛 시트와 다릅니다 (' + (legacyVals[r.title] || []).length + '행 → ' + (got[r.title] || []).length + '행)');
    });
  });
  if (!mismatch) ok('복사한 ' + todo.length + '개 탭이 모두 옛 시트와 같습니다');
  say('\n  다음: Render 환경 변수에 DB_FOLDER_ID 를 넣고 다시 배포하세요. SPREADSHEET_ID 는 확인이 끝날 때까지 남겨 두세요 (예비로 읽어 줍니다).\n');
  return { rows, applied: true, mismatch };
}

function main(argv) {
  const a = argv || process.argv.slice(2);
  const cmd = a[0] && a[0].indexOf('--') !== 0 ? a[0] : 'status';
  try {
    if (cmd === 'status') status();
    else if (cmd === 'create') create();
    else if (cmd === 'migrate') migrate({ apply: a.includes('--apply'), overwrite: a.includes('--overwrite') });
    else { say('사용법: db-setup.js status | create | migrate [--apply] [--overwrite]'); process.exitCode = 1; }
  } catch (e) { bad(e.message); }
  say('');
}

module.exports = { status, create, migrate, plan, main };
if (require.main === module) main();
