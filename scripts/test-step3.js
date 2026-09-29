/**
 * Step 3 시험 — 진짜 구글 없이(scripts/fake-google.js) 확인합니다.
 *   node scripts/test-step3.js
 *  A. 지출환급신청서 : 교적 자동 입력 · 항목별 지출일 · Payable To · 옛 시트 호환
 *  B. 제자훈련       : 단일 원천(제자훈련 시트) · 프로필 조회 · 교적 중복 제거
 *  C. 행사 예산 · 정산 : 예산 → 거래 → 정산 · 엑셀 왕복 · 권한
 */
const path = require('path');
const { FakeGoogle } = require('./fake-google');
const { baseTabs } = require('./browser/fixture');
const ROOT = path.join(__dirname, '..'), LIB = path.join(ROOT, 'lib') + path.sep, BRIDGE = require.resolve('../lib/bridge');
process.env.TZ = 'America/Toronto';

let pass = 0, fail = 0; const failures = [];
function ok(c, m) { if (c) { pass++; return; } fail++; failures.push(m); console.log('  ✗ ' + m); }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : '  → 실제 ' + A + ' / 기대 ' + B)); }
function section(t) { console.log('\n■ ' + t); }
function throws(fn, re, m) { try { fn(); } catch (e) { ok(re.test(String(e.message)), m + ' (오류: ' + e.message + ')'); return; } ok(false, m + ' (오류가 나야 함)'); }

/** 새 가짜 구글 세계를 만들고 서버 코드를 부팅합니다. mutate(tabs) 로 시트 내용을 바꿀 수 있습니다. */
function newEnv(mutate, env) {
  const fake = new FakeGoogle();
  const tabs = baseTabs([]);
  // 정일반(8번째) 에게 이메일 · 영문이름을 채워 둡니다
  const 정 = tabs['교적'].find((r) => r[0] === '정일반'); 정[3] = 'jung@example.com'; 정[11] = 'Il Ban Jung';
  if (mutate) mutate(tabs);
  const legacy = fake.addBook('옛 통합 시트', tabs);
  ['DB_FOLDER_ID', 'DB_IDS', 'SPREADSHEET_ID', 'DB_LEGACY_FALLBACK'].forEach((k) => delete process.env[k]);
  Object.assign(process.env, { PUBLIC_URL: 'https://app.test', SPREADSHEET_ID: legacy.id, DISABLE_SCHEDULER: '1' }, env || {});
  Object.keys(require.cache).forEach((k) => { if (k.indexOf(LIB) === 0) delete require.cache[k]; });
  const stub = { sheets: (m, p) => fake.sheets(m, p), drive: (m, p, x) => fake.drive(m, p, x), calendar: (m, p) => fake.calendar(m, p), call: (op, a) => fake.call(op, a) };
  require.cache[BRIDGE] = { id: BRIDGE, filename: BRIDGE, loaded: true, exports: stub };
  const runtime = require('../lib/runtime');
  return { fake, legacy, runtime, run: (fn) => runtime.run((api) => fn(api)).result, tabs };
}
const dump = (env, tab) => env.fake.books ? null : null;
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toLocaleDateString('en-CA'); };

module.exports = { ok, eq, section, throws, newEnv, TODAY, addDays, run: null, summary: () => { console.log(`\n${fail ? '✗ 실패 ' + fail + '건: ' + failures.join(' | ') : '✓ 모두 통과 (통과 ' + pass + ')'}`); return fail === 0; } };

if (require.main === module) {
  const T = module.exports;
  ['log', 'warn', 'error', 'info'].forEach((k) => { const o = console[k]; console[k] = (...a) => { if (/^\[(메일|푸시|알림)/.test(String(a[0]))) return; o.apply(console, a); }; });   // 서버의 "메일 건너뜀" 안내는 숨김
  require('./test-step3-expense')(T);
  try { require('./test-step3-disciple')(T); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  try { require('./test-step3-budget')(T); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  process.exit(T.summary() ? 0 : 1);
}
