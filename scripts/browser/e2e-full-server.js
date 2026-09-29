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
const stub = { sheets: (m, p) => fake.sheets(m, p), drive: (m, p) => (/permissions\.create/.test(m) ? {} : fake.drive(m, p)), calendar: (m, p) => fake.calendar(m, p), call: (op, a) => (op === 'token' ? 'fake-token' : fake.call(op, a)) };
require.cache[BRIDGE] = { id: BRIDGE, filename: BRIDGE, loaded: true, exports: stub };
const PDF = mkpdf(SAMPLE);
const realFetch = global.fetch;
global.fetch = async (url, opt) => {                                  // 드라이브 파일 내려받기만 가짜로
  const u = String(url);
  if (/googleapis\.com\/drive\/v3\/files\/[^?]+\?alt=media/.test(u)) return new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': String(PDF.length) } });
  return realFetch(url, opt);
};
global.__fake = fake;
const runtime = require('../../lib/runtime');
global.__runtime = runtime;
require('../../server.js');
