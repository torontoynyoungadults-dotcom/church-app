/** 음정 피아노롤 · 내보내기(PNG/PDF) · 태블릿/컴퓨터 화면 — 진짜 브라우저 시험 */
const L = require('./e2e-lib'); const { check, sleep } = L; const fs = require('fs');
const S = require('./e2e-server');
const INIT = `(() => { window.__osc = []; window.__ctxs = []; const AC0 = window.AudioContext; window.AudioContext = function (...a) { const c = new AC0(...a); window.__ctxs.push(c); return c; }; window.AudioContext.prototype = AC0.prototype; const AC = window.AudioContext; const co = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { const o = co.call(this); const st = o.start.bind(o); const sf = o.frequency.setValueAtTime.bind(o.frequency); let f = 0;
    o.frequency.setValueAtTime = (v, t) => { if (!f) f = v; return sf(v, t); }; o.start = (t) => { window.__osc.push({ f: f || o.frequency.value }); return st(t); }; return o; };
})();`;
(async () => {
  const port = await S.start(0), base = 'http://127.0.0.1:' + port;
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=/tmp/c4.wav', '--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, permissions: ['microphone'] }); await ctx.addInitScript(INIT);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(base + '/h.html?t=tokA'); await page.click('#go');
  await L.waitTrue(page, () => document.querySelector('.pv-pg') && /1 \//.test(document.querySelector('.pv-pg').textContent), null, 8000); await sleep(600);
  const inkOf = (sel, test) => page.evaluate(([s, t]) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]; if (t === 'orange' && a > 200 && r > 230 && g > 120 && g < 160 && b < 80) n++; else if (t === 'green' && a > 200 && g > 230 && r < 120) n++; else if (t === 'red' && a > 200 && r > 230 && g < 120 && b < 120) n++; else if (t === 'blue' && a > 200 && b > 240 && r < 170 && g > 180 && g < 220) n++; } return n; }, [sel, test]);

  console.log('· 시작음 피아노 건반');
  await page.click('.pv-tabbtn[data-tab="pitch"]');
  check('가로 건반이 그려짐 (흰 15 + 검은 10)', await L.waitTrue(page, () => document.querySelectorAll('.pk-w').length === 15 && document.querySelectorAll('.pk-b').length === 10));
  check('옛 음정 그리드 · 마이크 · 재생 UI 는 없음', await page.evaluate(() => !document.querySelector('.pr-grid') && !document.querySelector('.pr-keys')));
  const key0 = await page.evaluate(() => document.querySelector('.pk-startname').textContent);
  check('시작음 버튼에 곡 Key 의 시작음이 표시됨', /^[A-G]#?\d$/.test(key0), key0);
  const n0 = await page.evaluate(() => window.__osc.length);
  await page.click('.pk-btn[data-a="start"]'); await sleep(2100);
  const osc = await page.evaluate((n) => window.__osc.slice(n), n0);
  check('시작음 듣기 → 배음이 겹친 소리가 남 (오실레이터 6개)', osc.length === 6 && osc[0].f > 100 && osc[0].f < 700, osc);
  const kb = await page.locator('.pk-w').first().boundingBox();
  const n1 = await page.evaluate(() => window.__osc.length);
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height - 12); await page.mouse.down(); await sleep(150);
  check('누르는 동안 건반이 눌린 모양', await page.evaluate(() => !!document.querySelector('.pk-w.on')));
  await page.mouse.up(); await sleep(150);
  check('손을 떼면 건반이 원래대로', await page.evaluate(() => !document.querySelector('.pk-w.on, .pk-b.on')));
  const osc1 = await page.evaluate((n) => window.__osc.slice(n), n1);
  check('건반을 누르면 도(C3=130.8Hz) 소리', osc1.length >= 6 && Math.abs(osc1[0].f - 130.81) < 1, osc1.slice(0, 2));
  await page.click('.pk-btn[data-a="oct+"]'); await sleep(100);
  check('옥타브 올리기', await page.evaluate(() => /옥타브 4/.test(document.querySelector('.pk-octl').textContent)));
  check('오류 표시 없음', !(await page.evaluate(() => document.querySelector('.pk-info').classList.contains('bad'))));
  await page.locator('.pk-root').screenshot({ path: '/tmp/shot-pitch.png' });

  console.log('· 가사 도구는 허브 화면으로 이동 (Step 2.8)');
  check('연습 화면에는 "가사" 탭이 없음', await page.evaluate(() => !document.querySelector('.pv-tabbtn[data-tab="lyrics"]') && !/가사/.test(document.querySelector('.pv-tabs').textContent)));

  console.log('· 내보내기 (필기 포함)');
  await page.click('.pv-tabbtn[data-tab="anno"]');
  await L.ensureTool(page, 'pen'); await L.drag(page, [[.2, .3], [.5, .36], [.8, .3]]);
  const [d1] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('button[data-a="png"]')]);
  let ok1 = false, pngInk = 0;
  if (d1) { const p = await d1.path(); const buf = fs.readFileSync(p); ok1 = buf.slice(1, 4).toString() === 'PNG'; }
  check('PNG 저장', ok1, d1 && d1.suggestedFilename());
  const [d2] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('button[data-a="pdf"]')]);
  let pdfOk = false, pages = 0;
  if (d2) { const buf = fs.readFileSync(await d2.path()); pdfOk = buf.slice(0, 4).toString() === '%PDF'; pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; }
  check('PDF 저장 (%PDF)', pdfOk, d2 && d2.suggestedFilename());
  check('PDF 3쪽', pages === 3, pages);

  console.log('· 화면 모양 (스크린샷)');
  await page.click('.pv-tabbtn[data-tab="metro"]'); await sleep(300);
  await page.screenshot({ path: '/tmp/shot-computer.png' });
  await page.click('.pv-tabbtn[data-tab="anno"]'); await page.click('[data-layout="tablet"]'); await sleep(500);
  await page.screenshot({ path: '/tmp/shot-tablet-a.png' });
  await page.setViewportSize({ width: 1024, height: 768 }); await sleep(600);
  check('1024px 태블릿: 도구 메뉴 버튼이 보이고 도구 막대는 서랍 안', await page.evaluate(() => getComputedStyle(document.querySelector('.pv-menubtn')).display !== 'none' && !!document.querySelector('.pv-drawer .pv-tools')));
  await page.click('.pv-menubtn'); await sleep(450); await page.screenshot({ path: '/tmp/shot-tablet-drawer.png' });
  check('서랍이 열리고 필기 도구가 보임', await page.evaluate(() => { const r = document.querySelector('.pv-drawer .pv-tool').getBoundingClientRect(); return document.querySelector('.pv').classList.contains('pv-drawopen') && r.width > 0 && r.right <= innerWidth; }));
  await page.click('[data-a="drawer-panel"]'); await sleep(500); await page.screenshot({ path: '/tmp/shot-tablet-b.png' });
  check('패널 시트가 열리고 서랍은 닫힘', await page.evaluate(() => document.querySelector('.pv').classList.contains('pv-sideopen') && !document.querySelector('.pv').classList.contains('pv-drawopen')));
  check('오류 없음', errs.length === 0, errs.slice(0, 5));
  await br.close(); S.server.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e); process.exit(2); });
