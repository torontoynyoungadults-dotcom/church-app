/**
 * Hub v5 화면 시험 ① 찬양 허브 (진짜 크롬 + 진짜 server.js + 가짜 구글)
 *   NODE_PATH=$(npm root -g) PORT=4191 node scripts/browser/e2e-hub5.js
 *  · 날짜 바꾸기: 뼈대 즉시 · 같은 주 요청 하나 · 앞뒤 주 미리 받기 · 기억 개수 제한(LRU)
 *  · 세션/연습 시작: PDF 도구 · 첫 악보 미리 받기 · 뒤 허브 그리기 건너뜀 · 흐림 없음 · 큰 사진 줄이기
 *  · 가독성 지킴이: 연습 화면 안의 변화로 화면 전체를 다시 훑지 않음
 *  · 밝은/어두운 화면 전환 · 기기별 배치(폰 · 태블릿 세로/가로 · 컴퓨터) · 태블릿 가로 두 쪽 보기
 */
process.env.PORT = process.env.PORT || '4191';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const { mkpdf, SAMPLE } = require('./mkpdf');
const { mkpng } = require('./mkpng');
const BASE = 'http://127.0.0.1:' + process.env.PORT, KEY = 'ADM';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const DATES = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'];

(async () => {
  await sleep(1200);
  const pdfUrl = 'data:application/pdf;base64,' + mkpdf(SAMPLE).toString('base64');
  const bigPng = 'data:image/png;base64,' + mkpng(3200, 4200).toString('base64');
  DATES.forEach((d, i) => {
    run((api) => api.saveWorshipSongs(KEY, d, '콘티', [1, 2, 3].map((n) => ({ title: '곡 ' + n + '-' + i, team: '팀', key: 'G', bpm: '72', form: 'V1-C', link: '', note: '', solo: [] }))));
    run((api) => api.uploadWorshipSheet(KEY, d, '곡 1-' + i + '.pdf', pdfUrl, '콘티'));
  });
  run((api) => api.uploadWorshipSheet(KEY, DATES[0], '큰 사진 악보.png', bigPng, '콘티'));

  const br = await L.launch();
  const mk = async (vp, extra) => {
    const ctx = await br.newContext(Object.assign({ viewport: vp }, extra || {}));
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
    return { ctx, page, errs };
  };
  const open = async (page) => { await page.goto(BASE + '/?page=worship&key=' + KEY); return L.waitTrue(page, () => window.W && window.D && document.querySelectorAll('.song.card').length >= 3, null, 15000); };

  /* ================= 날짜 바꾸기 ================= */
  console.log('· 날짜 바꾸기 — 뼈대 · 미리 받기 · LRU');
  let { ctx, page, errs } = await mk({ width: 1440, height: 900 });
  check('허브가 열림', await open(page));
  await page.evaluate((d) => goWeek(d), DATES[0]); await sleep(300);
  // 서버 요청 세기
  await page.evaluate(() => { window.__calls = []; const o = window.callServer; window.callServer = function (fn, args) { window.__calls.push(fn + ':' + (args && args[1])); return o.apply(this, arguments); }; });
  const far = '2027-03-07';
  const sk = await page.evaluate((d) => { goWeek(d); return !!document.querySelector('#body .wh-skel .skel') && document.querySelector('#body .wh-skel').getAttribute('aria-busy') === 'true'; }, far);
  check('받아 두지 않은 주: 누르는 즉시 화면 모양의 뼈대(스켈레톤)', sk);
  check('…곧 내용으로 바뀜', await L.waitTrue(page, (d) => window.W && W.date === d && !document.querySelector('.wh-skel'), far, 6000));
  const dup = await page.evaluate(() => { const a = loadWeek('2027-05-02'), b = loadWeek('2027-05-02'); return a === b; });
  check('같은 주를 동시에 두 번 불러도 요청은 하나', dup);
  await page.evaluate((d) => goWeek(d), DATES[2]);
  check('한 주를 보면 앞 · 뒤 주를 한가할 때 미리 받아 둠', await L.waitTrue(page, (ds) => !!CACHE[ds[1]] && !!CACHE[ds[3]], DATES, 6000), await page.evaluate(() => Object.keys(CACHE)));
  await page.evaluate(() => { window.__calls.length = 0; });
  const t0 = Date.now();
  await page.evaluate((d) => goWeek(d), DATES[3]);
  check('미리 받은 주로 넘기면 서버를 부르지 않고 바로 그림', await L.waitTrue(page, (d) => W.date === d && document.querySelectorAll('.song.card').length >= 3 && !document.querySelector('.wh-skel'), DATES[3], 3000) && (await page.evaluate(() => window.__calls.filter((c) => /^getWorshipWeek:2026-10-25/.test(c)).length)) === 0);
  console.log('    (캐시 주 전환 ' + (Date.now() - t0) + 'ms)');
  const lru = await page.evaluate(async () => {
    const ds = []; const d = new Date(2027, 5, 6); for (let i = 0; i < 22; i++) { ds.push(d.toLocaleDateString('en-CA')); d.setDate(d.getDate() + 7); }
    for (const x of ds) { try { await loadWeek(x); } catch (e) {} }
    return { n: Object.keys(CACHE).length, max: WEEK_MAX, cur: !!CACHE[DATE] };
  });
  check('기억해 두는 주는 최대 WEEK_MAX 개 (오래 켜 둬도 메모리가 늘지 않음) · 지금 주는 남김', lru.n <= lru.max + 1 && lru.cur, lru);
  await page.evaluate((d) => goWeek(d), DATES[0]);
  await L.waitTrue(page, (d) => W.date === d && document.querySelectorAll('.song.card').length >= 3, DATES[0], 5000);

  /* ================= 기기별 배치 — 컴퓨터 ================= */
  const lay = await page.evaluate(() => { const s = document.querySelector('.whside').getBoundingClientRect(), b = document.getElementById('body').getBoundingClientRect(), wk = document.getElementById('weeks'); return { side: s.width, sx: s.left, bx: b.left, bw: b.width, sticky: getComputedStyle(document.querySelector('.whside')).position, col: getComputedStyle(wk).flexDirection }; });
  check('컴퓨터: 왼쪽 옆 막대(붙어 다님) + 오른쪽 넓은 내용', lay.side >= 260 && lay.side <= 320 && lay.bx > lay.sx + lay.side - 2 && lay.bw >= 700 && lay.sticky === 'sticky' && lay.col === 'column', lay);

  /* ================= 세션/연습 시작 ================= */
  console.log('· 세션/연습 시작 — 미리 받기 · 뒤 화면 건너뜀 · 흐림 없음');
  check('허브가 한가할 때 PDF 도구를 미리 불러 둠', await L.waitTrue(page, () => !!window.pdfjsLib, null, 8000));
  await page.evaluate(() => openPractice(''));
  check('연습 화면이 열리고 악보가 그려짐', await L.waitTrue(page, () => { const l = document.querySelector('.pv-loading'); return !!document.querySelector('.pv') && l && l.style.display === 'none'; }, null, 10000));
  const pv = await page.evaluate(() => ({ cv: getComputedStyle(document.querySelector('body > .shell')).contentVisibility, lock: document.body.classList.contains('pv-lock'), bf: getComputedStyle(document.querySelector('.pv-top')).backdropFilter, bf2: getComputedStyle(document.querySelector('.pv-side')).backdropFilter }));
  check('연습 중에는 뒤 허브 화면을 그리지 않음(content-visibility: hidden)', pv.cv === 'hidden' && pv.lock, pv);
  check('연습 화면의 막대 · 패널은 흐림(backdrop-filter) 없이 (필기 · 스크롤 끊김 방지)', pv.bf === 'none' && pv.bf2 === 'none', pv);
  // 가독성 지킴이가 연습 화면 변화로 전체를 훑지 않는지 — getComputedStyle 부른 횟수를 셈
  const gcs = await page.evaluate(async () => {
    let n = 0; const o = window.getComputedStyle; window.getComputedStyle = function () { n++; return o.apply(window, arguments); };
    const t = document.querySelector('.pv-toast');
    for (let i = 0; i < 40; i++) { t.classList.toggle('show'); t.style.opacity = String(i % 2); await new Promise((r) => setTimeout(r, 10)); }
    await new Promise((r) => setTimeout(r, 900));
    window.getComputedStyle = o; return n;
  });
  check('연습 화면 안에서 1초에 여러 번 바뀌어도 가독성 지킴이가 화면 전체를 다시 훑지 않음', gcs < 20, gcs);
  // 큰 사진 악보 — 줄여서 풂
  await page.evaluate(() => { const s = document.querySelector('.pv-sheetsel'); const i = Array.from(s.options).findIndex((o) => /큰 사진/.test(o.textContent)); s.value = String(i); s.onchange(); });
  check('큰 사진 악보(3200×4200)도 열림', await L.waitTrue(page, () => { const l = document.querySelector('.pv-loading'); return l && l.style.display === 'none' && /큰 사진/.test(document.querySelector('.pv-sheetsel').selectedOptions[0].textContent); }, null, 10000));
  const ps = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const r = YNPractice.prescale(c); const s = document.createElement('canvas'); s.width = 800; s.height = 600; return { w: r.width, h: r.height, small: YNPractice.prescale(s) === s, max: YNPractice.IMG_MAX }; });
  check('큰 그림은 긴 변 ' + ps.max + 'px 로 한 번만 줄이고, 작은 그림은 그대로', ps.w === ps.max && ps.h === Math.round(3000 * ps.max / 4000) && ps.small, ps);
  await page.evaluate(() => YNPractice.close());
  const back = await page.evaluate(() => ({ cv: getComputedStyle(document.querySelector('body > .shell')).contentVisibility, cards: document.querySelectorAll('.song.card').length, h: document.querySelector('.song.card').getBoundingClientRect().height }));
  check('닫으면 허브 화면이 그대로 돌아옴', back.cv !== 'hidden' && back.cards >= 3 && back.h > 20, back);

  /* ================= 밝은 / 어두운 화면 ================= */
  console.log('· ☀️ / 🌙 전환');
  const tb = await page.evaluate(() => { const b = document.querySelector('header .yntheme'), r = b.getBoundingClientRect(), f = document.querySelector('header .ynrefresh').getBoundingClientRect(); return { label: b.getAttribute('aria-label'), top: Math.abs(r.top - f.top), left: r.left < f.left }; });
  check('머리말 위에 전환 단추(☀️) — 새로고침 단추와 같은 줄', /밝은 화면/.test(tb.label) && tb.top < 2 && tb.left, tb);
  const darkBg = await page.evaluate(() => getComputedStyle(document.querySelector('#body .panel:not(.pvstart)')).backgroundColor);
  await page.click('header .yntheme'); await sleep(900);
  const lt = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), saved: localStorage.getItem('ynTheme'), bg: getComputedStyle(document.querySelector('#body .panel:not(.pvstart)')).backgroundColor, body: getComputedStyle(document.body).backgroundColor, label: document.querySelector('header .yntheme').getAttribute('aria-label'), meta: document.querySelector('meta[name="theme-color"]').content }));
  check('누르면 밝은 유리 화면으로 · 이 기기에 기억 · 단추는 🌙', lt.attr === 'light' && lt.saved === 'light' && /어두운 화면/.test(lt.label) && lt.bg !== darkBg && /255, 255, 255/.test(lt.bg) && lt.meta === '#EFEBE5', lt);
  const ink = await page.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const bad = [];
    document.querySelectorAll('#body .song.card .stitle, #body .song.card b, #body .panel .chip, #body .when .wv, .whside .wk:not(.on) .dy').forEach((e) => {
      const fg = parse(getComputedStyle(e).color); if (lum(fg) > 0.6) bad.push(e.className + ':' + e.textContent.slice(0, 10));
    });
    return bad;
  });
  check('밝은 화면에서 흰 글씨가 남지 않음(가독성 지킴이가 진한 글씨로)', ink.length === 0, ink);
  await page.reload(); await L.waitTrue(page, () => window.W && document.querySelectorAll('.song.card').length >= 3, null, 10000);
  check('새로고침해도 밝은 화면 유지 (그리기 전에 입혀 깜빡임 없음)', await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light'));
  await page.evaluate(() => openPractice(''));
  await L.waitTrue(page, () => { const l = document.querySelector('.pv-loading'); return l && l.style.display === 'none'; }, null, 10000);
  const pvBg = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.pv-top')).backgroundColor.match(/[\d.]+/g).map(Number); return c; });
  check('밝은 화면이어도 세션/연습(악보) 화면은 어두운 유리 그대로', pvBg[0] < 60 && pvBg[1] < 60, pvBg);
  await page.evaluate(() => YNPractice.close());
  await page.click('header .yntheme'); await sleep(500);
  check('다시 누르면 어두운 화면', await page.evaluate(() => !document.documentElement.getAttribute('data-theme') && localStorage.getItem('ynTheme') === 'dark'));
  check('허브 · 연습 화면 오류 없음', errs.length === 0, errs);
  await ctx.close();

  /* ================= 폰 · 태블릿 세로 · 태블릿 가로 ================= */
  console.log('· 기기별 배치');
  ({ ctx, page, errs } = await mk({ width: 390, height: 844 }, { isMobile: true, hasTouch: true }));
  await open(page);
  const ph = await page.evaluate(() => ({ over: document.scrollingElement.scrollWidth - innerWidth, side: getComputedStyle(document.querySelector('.whside')).display, row: getComputedStyle(document.getElementById('weeks')).flexDirection, pw: document.querySelector('#body .panel:not(.pvstart)').getBoundingClientRect().width }));
  check('폰: 한 단 카드 · 가로로 넘치지 않음 · 주차 줄은 옆으로', ph.over <= 0 && ph.side === 'contents' && ph.row === 'row' && ph.pw >= 360, ph);
  await ctx.close();
  ({ ctx, page, errs } = await mk({ width: 820, height: 1180 }, { hasTouch: true }));
  await open(page);
  const tp = await page.evaluate(() => ({ over: document.scrollingElement.scrollWidth - innerWidth, shell: document.querySelector('.shell').getBoundingClientRect().width, side: getComputedStyle(document.querySelector('.whside')).display }));
  check('태블릿 세로: 가운데 넓은 한 단(위아래로 쌓임)', tp.over <= 0 && tp.shell >= 760 && tp.side === 'contents', tp);
  await ctx.close();
  ({ ctx, page, errs } = await mk({ width: 1180, height: 820 }, { hasTouch: true }));
  await page.addInitScript(() => { try { localStorage.setItem('yn.pv.layout', 'tablet'); } catch (e) {} });
  await open(page);
  const tl = await page.evaluate(() => ({ grid: getComputedStyle(document.getElementById('app')).display, side: document.querySelector('.whside').getBoundingClientRect().width }));
  check('태블릿 가로: 옆 막대 + 내용 두 칸', tl.grid === 'grid' && tl.side >= 260, tl);
  await page.evaluate(() => openPractice(''));
  check('태블릿 가로 연습 화면: 처음부터 두 쪽 나란히(라이브 모드)', await L.waitTrue(page, () => { const p = document.querySelector('.pv'); const b2 = document.querySelector('.pv-pagebox2'); return p && p.classList.contains('pv-tablet') && p.classList.contains('pv-spread') && b2 && b2.style.display !== 'none' && b2.getBoundingClientRect().width > 100; }, null, 10000),
    await page.evaluate(() => { const p = document.querySelector('.pv'); return p && p.className; }));
  const dock = await page.evaluate(() => { const t = document.querySelector('.pv-tools'); return { pos: getComputedStyle(t).position, sb: document.querySelector('.pv-spreadbtn').style.display }; });
  check('…떠 있는 도구 도크 · 두 쪽 단추가 보임', dock.pos === 'absolute' && dock.sb !== 'none', dock);
  await page.click('.pv-spreadbtn');
  check('두 쪽 단추로 끄면 한 쪽 (기억)', await L.waitTrue(page, () => !document.querySelector('.pv').classList.contains('pv-spread') && localStorage.getItem('yn.pv.spread') === '0', null, 3000));
  check('태블릿 가로 오류 없음', errs.length === 0, errs);
  await ctx.close();
  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
