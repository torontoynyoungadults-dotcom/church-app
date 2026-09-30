/**
 * Step 3.1 · 3.2 — 펜 ↔ 지우개 전환 · 두 손가락 이동/확대 · 손바닥 무시 · 오프라인 악보 (진짜 크롬)
 *   NODE_PATH=... node scripts/browser/e2e-step31.js
 */
const L = require('./e2e-lib'); const { check, sleep } = L;
const S = require('./e2e-server');
const SONGS = [{ title: 'Amazing Grace', key: 'G', bpm: 120, form: 'V1-C', team: 'T' }];
const MULTI = [{ id: 'FILEID_MULTI0001', name: 'Sunday All Songs.pdf' }];
(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|youtube|fonts\.g|WebSocket connection|ERR_INTERNET_DISCONNECTED/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(base + '/h.html?t=tokA'); await page.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs }); }, [MULTI, SONGS]);
  await L.waitTrue(page, () => document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 4', null, 9000); await sleep(1200);
  const cdp = await ctx.newCDPSession(page);
  const st = () => page.evaluate(() => window.__pv.P.anno().state());
  const items = () => page.evaluate(() => window.__pv.P.anno().items('mine').length + window.__pv.P.anno().items('team').length);
  const cvBox = () => page.evaluate(() => { const r = document.querySelector('.pv-stage').getBoundingClientRect(), b = document.querySelector('.pv-pagebox').getBoundingClientRect(); const x0 = Math.max(r.x, b.x), x1 = Math.min(r.right, b.right), y0 = Math.max(r.y, b.y), y1 = Math.min(r.bottom, b.bottom); return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }; });

  console.log('1. 펜 더블탭 → 펜 ↔ 지우개');
  await page.evaluate(() => { window.__pv.P.setLayer && window.__pv.P.setLayer('mine'); window.__pv.P.anno().setTool('pen'); });
  const c = await cvBox();
  const pen = async (type, x, y, extra) => cdp.send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen' }, extra || {}));
  const tapPen = async (x, y) => { await pen('mousePressed', x, y); await sleep(25); await pen('mouseReleased', x, y); };
  check('시작: 도구는 펜', (await st()).tool === 'pen', await st());
  await tapPen(c.x, c.y); await sleep(70); await tapPen(c.x + 2, c.y + 1); await sleep(100);
  check('같은 자리를 펜 끝으로 두 번 톡 → 지우개', (await st()).tool === 'eraser', await st());
  check('전환 때 첫 번째 톡의 점은 남지 않음', (await items()) === 0, await items());
  check('안내 토스트가 뜸', await page.evaluate(() => /지우개로 전환/.test(document.body.textContent)));
  await sleep(600); await tapPen(c.x + 40, c.y + 40); await sleep(70); await tapPen(c.x + 41, c.y + 40); await sleep(100);
  check('한 번 더 → 펜으로 돌아옴', (await st()).tool === 'pen', await st());
  await sleep(600); await tapPen(c.x, c.y); await sleep(70); await tapPen(c.x + 200, c.y + 200); await sleep(100);
  check('멀리 떨어진 두 번은 전환하지 않음 (점 2개가 그려짐)', (await st()).tool === 'pen' && (await items()) >= 2, [await st(), await items()]);
  await page.evaluate(() => window.__pv.P.setPenTap(false)); await sleep(600);
  const t0 = (await st()).tool; await tapPen(c.x, c.y - 60); await sleep(70); await tapPen(c.x + 1, c.y - 60); await sleep(100);
  check('필기 설정에서 끄면 전환하지 않음 (기억됨)', (await st()).tool === t0 && await page.evaluate(() => localStorage.getItem('yn.pv.pentap') === '0'));
  await page.evaluate(() => window.__pv.P.setPenTap(true));

  console.log('2. 손바닥 · 손가락 무시 (펜을 쓴 뒤)');
  check('펜을 한 번 쓰면 이 기기는 "펜 감지" 로 기억됨', await page.evaluate(() => localStorage.getItem('yn.pv.sawpen') === '1'));
  const n0 = await items();
  const tch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
  await page.evaluate(() => window.__pv.P.setLayout && window.__pv.P.setLayout('tablet'));
  await sleep(300);
  await tch('touchStart', [[c.x - 100, c.y + 100]]); for (let i = 1; i <= 6; i++) await tch('touchMove', [[c.x - 100 + i * 10, c.y + 100 + i * 5]]); await tch('touchEnd', []); await sleep(200);
  check('손가락 한 개로는 그려지지 않음 (팜 리젝션)', (await items()) === n0, [n0, await items()]);

  console.log('3. 두 손가락 — 확대 상태에서 이동');
  await page.evaluate(() => { const z = document.querySelector('[data-a="zin"]'); z.click(); z.click(); z.click(); }); await sleep(900);
  const info = () => page.evaluate(() => { const s = document.querySelector('.pv-stage'), b = document.querySelector('.pv-pagebox').getBoundingClientRect(); return { sl: Math.round(s.scrollLeft), st: Math.round(s.scrollTop), w: Math.round(b.width), maxT: s.scrollHeight - s.clientHeight, maxL: s.scrollWidth - s.clientWidth }; });
  const i0 = await info();
  check('확대되어 스크롤할 여유가 있음', i0.maxT > 50 || i0.maxL > 50, i0);
  const sr = await page.evaluate(() => { const r = document.querySelector('.pv-stage').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await tch('touchStart', [[sr.x - 60, sr.y], [sr.x + 60, sr.y]]);
  for (let i = 1; i <= 8; i++) await tch('touchMove', [[sr.x - 60, sr.y - i * 15], [sr.x + 60, sr.y - i * 15]]);
  await tch('touchEnd', []); await sleep(400);
  const i1 = await info();
  check('두 손가락을 위로 밀면 악보가 아래쪽으로 스크롤됨 (확대는 그대로)', i1.st > i0.st + 40 && Math.abs(i1.w - i0.w) <= 2, [i0, i1]);
  check('두 손가락 이동 중에는 필기가 그려지지 않음', (await items()) === n0, [n0, await items()]);

  console.log('4. 두 손가락 — 벌려서 확대 · 모아서 축소');
  await page.evaluate(() => document.querySelector('[data-a="zfit"]').click()); await sleep(800);
  const j0 = await info();
  await tch('touchStart', [[sr.x - 40, sr.y], [sr.x + 40, sr.y]]);
  for (let i = 1; i <= 10; i++) await tch('touchMove', [[sr.x - 40 - i * 12, sr.y], [sr.x + 40 + i * 12, sr.y]]);
  await tch('touchEnd', []); await sleep(1000);
  const j1 = await info();
  check('벌리면 확대됨 (쪽 너비가 커짐)', j1.w > j0.w * 1.4, [j0, j1]);
  check('확대 후 미리보기 변환이 남지 않음', await page.evaluate(() => !document.querySelector('.pv-pagebox').style.transform));
  await tch('touchStart', [[sr.x - 160, sr.y], [sr.x + 160, sr.y]]);
  for (let i = 1; i <= 10; i++) await tch('touchMove', [[sr.x - 160 + i * 12, sr.y], [sr.x + 160 - i * 12, sr.y]]);
  await tch('touchEnd', []); await sleep(1000);
  const j2 = await info();
  check('모으면 축소됨', j2.w < j1.w * 0.8, [j1, j2]);
  check('두 손가락 확대 · 축소 중에도 필기가 그려지지 않음', (await items()) === n0, [n0, await items()]);

  console.log('5. 필기 탭 설정 UI');
  await page.evaluate(() => window.__pv.P.showTab('anno') || window.__pv.P.showTab('draw')); await sleep(300);
  check('필기 탭에 "펜 끝으로 두 번 톡" 설정이 있음', await page.evaluate(() => !!document.querySelector('[data-o="pentap"]')));
  check('하드웨어 더블탭 한계 안내 문구가 있음', await page.evaluate(() => /하드웨어 더블탭/.test(document.body.textContent)));
  await page.evaluate(() => { const s = document.querySelector('[data-o="pen"]'); s.value = 'always'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  check('"항상 펜만" 선택이 기억됨', await page.evaluate(() => localStorage.getItem('yn.pv.penmode') === 'always' && window.__pv.P.penMode() === 'always'));

  console.log('6. 오프라인 — 서비스워커 · 악보 보관');
  const reg = await page.evaluate(async () => { try { const r = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; await new Promise((res) => { if (navigator.serviceWorker.controller) return res(); navigator.serviceWorker.addEventListener('controllerchange', res); setTimeout(res, 3000); }); return !!navigator.serviceWorker.controller; } catch (e) { return String(e); } });
  check('서비스워커가 등록되어 페이지를 제어함', reg === true, reg);
  await page.evaluate(async () => { await fetch('/sheet/FILEID_AAAAAAA1'); });                              // 서비스워커를 거치며 보관
  await sleep(400);
  await page.goto(base + '/h.html?t=tokA'); await sleep(600);                                                 // 페이지도 한 번 더 열어 보관
  const cached = await page.evaluate(async () => (await caches.keys()).join(','));
  check('악보 · 페이지 보관함이 생김', /yn-sheets-v1/.test(cached) && /yn-pages-v1/.test(cached), cached);
  await ctx.setOffline(true); await sleep(200);
  const off = await page.evaluate(async () => {
    const r1 = await fetch('/sheet/FILEID_AAAAAAA1'); const b = new Uint8Array(await r1.arrayBuffer());
    const r2 = await fetch('/sheet/FILEID_AAAAAAA1', { headers: { Range: 'bytes=0-9' } }); const b2 = new Uint8Array(await r2.arrayBuffer());
    return { s1: r1.status, pdf: String.fromCharCode(b[0], b[1], b[2], b[3]), len: b.length, s2: r2.status, len2: b2.length, cr: r2.headers.get('Content-Range') };
  });
  check('인터넷이 끊겨도 악보 PDF 가 열림', off.s1 === 200 && off.pdf === '%PDF' && off.len > 100, off);
  check('Range 요청도 보관본에서 응답 (206)', off.s2 === 206 && off.len2 === 10 && /^bytes 0-9\//.test(off.cr || ''), off);
  const nav = await page.goto(base + '/h.html?t=tokA').then((r) => r && r.status(), (e) => 'ERR ' + e.message);
  check('인터넷이 끊겨도 한 번 열어 본 페이지가 열림', nav === 200 && await page.evaluate(() => typeof window.OPEN === 'function'), nav);
  await page.evaluate(([sheets, songs]) => { window.__pv = OPEN({ sheets, songs }); }, [[{ id: 'FILEID_AAAAAAA1', name: 'Amazing Grace.pdf' }], SONGS]);
  check('오프라인에서 보관한 악보로 뷰어가 그려짐', await L.waitTrue(page, () => document.querySelector('.pv-pg') && /1 \/ \d/.test(document.querySelector('.pv-pg').textContent), null, 9000));
  await ctx.setOffline(false);

  console.log('7. 콘솔 오류');
  check('페이지 오류 · 콘솔 오류 없음', errs.length === 0, errs.slice(0, 5));
  await br.close(); S.server.close();
  L.summary ? L.summary() : console.log('\n통과 / 실패 위를 확인하세요');
  process.exit(0);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
