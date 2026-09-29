/**
 * getMyProfile(포털 첫 화면) 속도 측정기 — 진짜 구글에 연결하지 않고 가짜 구글 + 실제 크기의 자료로 잽니다.
 *   node scripts/profile-portal.js            (요약)
 *   node scripts/profile-portal.js --calls    (API 호출 목록)
 * 구글 API 왕복 시간을 흉내 냅니다: 호출 1번 = 250ms + 셀 1만 개당 20ms (환경 변수 LAT_MS / CELL_MS 로 바꿈)
 */
const fs = require('fs'), path = require('path');
const { FakeGoogle } = require('./fake-google');
const { baseTabs } = require('./browser/fixture');
const ROOT = path.join(__dirname, '..'), LIB = path.join(ROOT, 'lib') + path.sep, BRIDGE = require.resolve('../lib/bridge');
process.env.TZ = 'America/Toronto';
const LAT = Number(process.env.LAT_MS || 250), CELL = Number(process.env.CELL_MS || 20);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const src = fs.readFileSync(path.join(ROOT, 'logic', 'app.js'), 'utf8');
const TABS = Array.from(src.matchAll(/^var SHEET_\S+ = '([^']+)'/gm), (m) => m[1]);
const SIZE = { 출결기록: 40000, 응답원본: 2500, 명단변경기록: 4000, 리마인더기록: 3000, 주일독려기록: 3000, 교적: 700, 새가족: 300, 새가족추적: 1200, 새가족연락: 1500,
  사역보고서: 1500, 지출신청: 900, 지출항목: 2500, 지출처리이력: 3000, 찬양콘티: 3500, 찬양편성: 2500, 찬양악보: 1500, 찬양댓글: 1200, 묵상기록: 12000,
  알림기기: 1500, 제자훈련출결: 6000, 제자훈련명단: 200, 셀원명단: 450, 포토앨범사진: 2500, 신청내역: 1500, 할일숨김: 800, 회의록: 400, 회의할일: 900, 찬양녹음: 800 };

function filler(tab, rows, cols, base) {
  const out = [base && base[0] ? base[0].slice() : Array.from({ length: cols }, (_, i) => '열' + (i + 1))];
  const head = out[0];
  for (let i = 0; i < rows; i++) out.push(head.map((h, c) => (c === 0 ? tab + i : c === 1 ? '이름' + (i % 700) : c === 2 ? '2026-0' + (1 + i % 9) + '-' + String(1 + i % 28).padStart(2, '0') : '값' + ((i * 7 + c) % 50))));
  return out;
}
function world() {
  const fake = new FakeGoogle();
  const tabs = baseTabs([]);
  const nm = Object.keys(tabs);
  TABS.forEach((t) => { if (!tabs[t]) tabs[t] = filler(t, SIZE[t] || 150, t === '출결기록' ? 8 : t === '제자훈련출결' ? 4 : t === '제자훈련명단' ? 7 : 14); });
  // 교적은 700명으로 늘림 (앞 12명은 시험용 이름 그대로)
  const cj = tabs['교적']; for (let i = 0; i < 700; i++) { const r = new Array(20).fill(''); r[0] = '성도' + i; r[1] = '416-555-' + String(2000 + i); r[3] = 'm' + i + '@x.com'; r[10] = '90'; cj.push(r); }
  const legacy = fake.addBook('옛 통합 시트', tabs);
  return { fake, legacy, tabs };
}
function boot(fake, env) {
  ['DB_FOLDER_ID', 'DB_IDS', 'SPREADSHEET_ID', 'DB_LEGACY_FALLBACK'].forEach((k) => delete process.env[k]);
  Object.assign(process.env, { PUBLIC_URL: 'https://app.test' }, env);
  Object.keys(require.cache).forEach((k) => { if (k.indexOf(LIB) === 0) delete require.cache[k]; });
  const calls = [];
  const wrap = (svc) => (m, p) => {
    p = p || {}; const t0 = process.hrtime.bigint();
    const r = fake[svc](m, p);
    let cells = 0; if (r && r.valueRanges) r.valueRanges.forEach((v) => (v.values || []).forEach((row) => { cells += row.length; }));
    wait(LAT + cells / 10000 * CELL);                                   // 구글 왕복 시간 흉내
    calls.push({ m, ranges: (p.ranges || []).length, titles: (p.ranges || []).map((x) => x.replace(/^'|'$/g, '')), cells, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6) });
    return r;
  };
  const stub = { sheets: wrap('sheets'), drive: wrap('drive'), calendar: (m, p) => fake.calendar(m, p), call: (op, a) => fake.call(op, a) };
  require.cache[BRIDGE] = { id: BRIDGE, filename: BRIDGE, loaded: true, exports: stub };
  const runtime = require('../lib/runtime');
  return { runtime, calls, google: require('../lib/google') };
}
function timed(env, name, fn) {
  const n0 = env.calls.length, t0 = process.hrtime.bigint();
  let out; try { out = fn(); } catch (e) { out = { error: e.message }; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const mine = env.calls.slice(n0), net = mine.reduce((s, c) => s + c.ms, 0);
  return { name, total: Math.round(ms), apiCalls: mine.length, apiMs: net, cpuMs: Math.round(ms - net), cells: mine.reduce((s, c) => s + c.cells, 0), out };
}
module.exports = { world, boot, timed, PHONE: (n) => String(4165551000 + n) };

if (require.main === module) {
  const { fake, legacy } = world();
  let env = boot(fake, { SPREADSHEET_ID: legacy.id });
  let run = (f) => env.runtime.run((api) => f(api)).result;
  const tok = run((api) => api.포털토큰_('정일반', '4165551008', ''));      // 로그인 때 받은 토큰 (브라우저가 들고 있음)
  env = boot(fake, { SPREADSHEET_ID: legacy.id });                         // 서버를 새로 켠 것처럼 (메모리 비움)
  run = (f) => env.runtime.run((api) => f(api)).result;
  console.log('탭 ' + TABS.length + '개, 큰 탭: 출결기록 ' + SIZE.출결기록 + '행 · 묵상기록 ' + SIZE.묵상기록 + '행 · 응답원본 ' + SIZE.응답원본 + '행');
  console.log('구글 왕복 흉내: 1회 ' + LAT + 'ms + 셀 1만 개당 ' + CELL + 'ms');
  const cold = timed(env, '① 서버를 막 켠 뒤 첫 getMyProfile (저장된 토큰)', () => run((api) => api.getMyProfile(tok)));
  const rows = [];
  rows.push(cold);
  rows.push(timed(env, '② 바로 다음 getMyProfile (같은 서버)', () => run((api) => api.getMyProfile(tok))));
  rows.push(timed(env, '③ 또 한 번', () => run((api) => api.getMyProfile(tok))));
  // 누가 시트를 한 번 고친 뒤 (캐시비움)
  rows.push(timed(env, '④ 저장(캐시비움) 직후 getMyProfile', () => run((api) => { api.캐시비움_(); return api.getMyProfile(tok); })));
  fake.editByHand(legacy.id, '교적', 5, 4, 'edit@x.com');
  env.google.store.lastCheck = 0;
  rows.push(timed(env, '⑤ 누가 시트를 직접 고친 뒤 첫 getMyProfile', () => run((api) => api.getMyProfile(tok))));
  console.log('\n' + '단계'.padEnd(46) + '합계ms  API호출  API대기ms  계산ms  셀수');
  rows.forEach((r) => console.log(r.name.padEnd(46) + String(r.total).padStart(6) + String(r.apiCalls).padStart(8) + String(r.apiMs).padStart(10) + String(r.cpuMs).padStart(8) + String(r.cells).padStart(9) + (r.out && r.out.error ? '  ← 오류: ' + r.out.error : '')));
  if (process.argv.includes('--calls')) env.calls.forEach((c, i) => console.log(i, c.m, c.ranges + '탭', c.cells + '셀', c.ms + 'ms', c.titles.length ? '[' + c.titles.slice(0, 80).join(',') + ']' : ''));
}
