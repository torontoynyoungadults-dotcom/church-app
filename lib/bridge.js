/**
 * 본 스레드 → 작업자(lib/worker.js) 다리.
 * 작업자가 구글 API 를 부르는 동안 기다렸다가 결과를 그대로 돌려줍니다.
 */
const path = require('path');
const { createSyncFn } = require('synckit');

const run = createSyncFn(path.join(__dirname, 'worker.js'), { timeout: 90000 });

/** 구글 API 를 몇 번, 얼마나 기다렸는지 — 느린 요청의 원인을 로그에서 바로 보려고 셉니다 */
const stats = { calls: 0, ms: 0 };

function call(op, args) {
  const t0 = Date.now();
  let r;
  try { r = run(op, args || {}); } finally { stats.calls++; stats.ms += Date.now() - t0; }
  if (r && typeof r === 'object' && r.__error !== undefined) {
    const e = new Error(r.__error);
    e.code = r.code;
    throw e;
  }
  return r;
}

/** 구글 API 한 번 — 예: google('sheets', 'v4', 'spreadsheets.get', { spreadsheetId }) */
function google(svc, version, method, params, extra) {
  return call('call', Object.assign({ svc, version, method, params: params || {} }, extra || {}));
}

const sheets = (method, params, extra) => google('sheets', 'v4', method, params, extra);
const drive = (method, params, extra) => google('drive', 'v3', method, params, extra);
const calendar = (method, params, extra) => google('calendar', 'v3', method, params, extra);

module.exports = { call, sheets, drive, calendar, stats };
