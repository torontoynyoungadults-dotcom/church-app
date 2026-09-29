/** 진짜 server.js + 가짜 구글 — Worship 화면부터 시트 저장까지 처음부터 끝까지 시험 */
const path = require('path'), fs = require('fs');
process.env.TZ = 'America/Toronto';
const ROOT = path.join(__dirname, '..', '..');
const { FakeGoogle } = require('./fake-google');
const { baseTabs } = require('./fixture');
const { mkpdf, SAMPLE } = require('./mkpdf');
const BRIDGE = require.resolve('../../lib/bridge');
const fake = new FakeGoogle();
const HEAD_주보 = ['날짜', '상태', '제목', '수정자', '시각', '내용'];
const HEAD_묵상 = ['날짜', '구절표기', '본문텍스트', '작성시각', '작성자', '해설', '질문', '적용', '기도'];
const ymdL = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const TODAY = new Date(); TODAY.setHours(12, 0, 0, 0);
const SUN = addD(TODAY, -TODAY.getDay());
const bul = (date, title, ref, preacher, status) => [date, status || '게시', '', '관리자', '', "'" + JSON.stringify({
  date, occasion: '', order: [{ key: 'creed', label: '신앙의 고백', value: '사도신경' }, { key: 'sermon', label: '설교말씀', value: title + '\n' + preacher }],
  bible: { title, ref, text: '', textEn: '' }, news: {}, servants: {} })];
const tabs = baseTabs([]);
tabs['주보'] = [HEAD_주보, bul(ymdL(SUN), '베드로 (1) 부르시는 주님', '누가복음 5:1-11', '강산 목사'), bul(ymdL(addD(SUN, -7)), '지난주 말씀', '요한복음 1:1-5', '전대혁 목사'),
  bul(ymdL(addD(SUN, 7)), '다음 주일 말씀', '마태복음 1:1', '강산 목사'), bul('2026-10-04', '주일 아침 말씀', '시편 23:1-6', '강산 목사')];
tabs['오늘묵상확정'] = [HEAD_묵상, [ymdL(TODAY), '요한복음 3:16', '하나님이 세상을 이처럼 사랑하사…', '', '', '', '', '', '']];
global.__E2E = { SUN: ymdL(SUN), PREV: ymdL(addD(SUN, -7)), TODAY: ymdL(TODAY) };
const legacy = fake.addBook('옛 통합 시트', tabs);
process.env.GEMINI_API_KEY = 'test-key';
Object.assign(process.env, { PUBLIC_URL: 'http://127.0.0.1', SPREADSHEET_ID: legacy.id, DISABLE_SCHEDULER: '1', PORT: process.env.PORT || '0' });
delete process.env.DB_FOLDER_ID;
const stub = { sheets: (m, p) => fake.sheets(m, p), drive: (m, p, x) => (/permissions\.create/.test(m) ? {} : fake.drive(m, p, x)), calendar: (m, p) => fake.calendar(m, p), call: (op, a) => (op === 'token' ? 'fake-token' : fake.call(op, a)) };
require.cache[BRIDGE] = { id: BRIDGE, filename: BRIDGE, loaded: true, exports: stub };
const PDF = mkpdf(SAMPLE);
const realFetch = global.fetch;
global.__AI = { delay: 0, fail: 0, calls: 0, last: '' };
global.fetch = async (url, opt) => {                                  // 드라이브 파일 내려받기 · 제미나이만 가짜로
  const u = String(url);
  if (/generativelanguage\.googleapis\.com/.test(u)) {
    global.__AI.calls++; (global.__AI.times = global.__AI.times || []).push(Date.now());
    if (global.__AI.delay) await new Promise((r) => setTimeout(r, global.__AI.delay));
    if (global.__AI.fail) return new Response(JSON.stringify({ error: { message: 'RESOURCE_EXHAUSTED quota' } }), { status: 429 });
    const body = JSON.parse(opt.body); const prompt = body.contents[0].parts[0].text;
    global.__AI.last = prompt;
    const m = /<노트>\n([\s\S]*?)\n<\/노트>/.exec(prompt); const txt = m ? m[1] : '';
    const out = /구조화/.test(prompt) ? '## 핵심 요점\n' + txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => '- ' + l.replace(/^-\s*/, '')).join('\n')
      : txt.split('\n').map((l) => l.replace(/\s+$/, '').replace(/ㅇㅇ/g, '아멘')).join('\n');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: out }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
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
