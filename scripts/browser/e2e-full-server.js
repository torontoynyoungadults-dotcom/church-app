/** 진짜 server.js + 가짜 구글 — Worship 화면부터 시트 저장까지 처음부터 끝까지 시험 */
const path = require('path'), fs = require('fs');
process.env.TZ = 'America/Toronto';
const ROOT = path.join(__dirname, '..', '..');
const { FakeGoogle } = require('./fake-google');
const { baseTabs } = require('./fixture');
const { mkpdf, SAMPLE } = require('./mkpdf');
const BRIDGE = require.resolve('../../lib/bridge');
const fake = new FakeGoogle();
const legacy = fake.addBook('옛 통합 시트', baseTabs([]));
Object.assign(process.env, { PUBLIC_URL: 'http://127.0.0.1', SPREADSHEET_ID: legacy.id, DISABLE_SCHEDULER: '1', PORT: process.env.PORT || '0' });
delete process.env.DB_FOLDER_ID;
const stub = { sheets: (m, p) => fake.sheets(m, p), drive: (m, p, x) => (/permissions\.create/.test(m) ? {} : fake.drive(m, p, x)), calendar: (m, p) => fake.calendar(m, p), call: (op, a) => (op === 'token' ? 'fake-token' : fake.call(op, a)) };
require.cache[BRIDGE] = { id: BRIDGE, filename: BRIDGE, loaded: true, exports: stub };
const PDF = mkpdf(SAMPLE);
const realFetch = global.fetch;
global.fetch = async (url, opt) => {                                  // 드라이브 파일 내려받기만 가짜로
  const u = String(url);
  const mm = /googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media/.exec(u);
  if (mm) {
    const f = fake.files.get(decodeURIComponent(mm[1]));                     // 앱이 저장한 파일(예: 악보 저장소의 잘린 PDF)은 그 내용 그대로
    const body = f && f.bytes && f.bytes.length ? f.bytes : PDF;
    return new Response(body, { status: 200, headers: { 'content-type': f && f.mimeType ? f.mimeType : 'application/pdf', 'content-length': String(body.length) } });
  }
  return realFetch(url, opt);
};
global.__fake = fake;
const runtime = require('../../lib/runtime');
global.__runtime = runtime;
require('../../server.js');
