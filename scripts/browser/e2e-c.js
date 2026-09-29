/** 음정 피아노롤 · 가사 추출 · 내보내기(PNG/PDF) · 태블릿/컴퓨터 화면 — 진짜 브라우저 시험 */
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

  console.log('· 음정 피아노롤');
  await page.click('.pv-tabbtn[data-tab="pitch"]');
  check('피아노롤이 그려짐 (건반 + 칸)', await L.waitTrue(page, () => document.querySelector('.pr-keys') && document.querySelector('.pr-grid')));
  const before = await inkOf('.pr-grid', 'orange');
  const gb = await page.locator('.pr-grid').boundingBox();
  await page.mouse.click(gb.x + gb.width * 0.30, gb.y + 14 * 12 + 7);
  await sleep(200);
  const after = await inkOf('.pr-grid', 'orange');
  check('칸을 누르면 목표 음이 찍힘', after > before + 100, { before, after });
  await page.mouse.click(gb.x + gb.width * 0.30, gb.y + 14 * 12 + 7); await sleep(150);
  check('다시 누르면 지워짐', (await inkOf('.pr-grid', 'orange')) <= before + 5);
  await page.mouse.click(gb.x + gb.width * 0.30, gb.y + 14 * 12 + 7); await sleep(150);
  const n0 = await page.evaluate(() => window.__osc.length);
  const kb = await page.locator('.pr-keys').boundingBox();
  await page.mouse.click(kb.x + 10, kb.y + 14 * 12 + 7); await sleep(300);
  const osc = await page.evaluate((n) => window.__osc.slice(n), n0);
  check('건반을 누르면 기준음이 남', osc.length >= 1 && osc[0].f > 100 && osc[0].f < 2000, osc);
  await page.click('.pr-btn:has-text("목표 음")'); await sleep(1500);
  check('목표 음 듣기가 오류 없이 동작', !(await page.evaluate(() => document.querySelector('.pr-info').classList.contains('bad'))));
  // 마이크 — 도(C4, 261.63Hz) 순음을 마이크 입력으로 흉내
  await page.click('.pr-btn:has-text("모두 지우기")'); await sleep(100);
  await page.selectOption('.pr-sel', '4');
  const yC4 = gb.y + (84 - 60) * 14 + 7, yE4 = gb.y + (84 - 64) * 14 + 7;
  await page.mouse.click(gb.x + gb.width * (0.5 / 16), yC4);           // 0~4박: 도 (맞음)
  await page.mouse.click(gb.x + gb.width * (4.5 / 16), yE4);           // 4~8박: 미 (일부러 틀린 목표)
  await sleep(150);
  await page.click('.pr-btn:has-text("마이크")');
  await sleep(4800);
  await page.locator('.pr-root').screenshot({ path: '/tmp/shot-pitch.png' });
  const info = await page.evaluate(() => document.querySelector('.pr-info').textContent + '|' + document.querySelector('.pr-info').className);
  const gr = await inkOf('.pr-grid', 'green'), rd = await inkOf('.pr-grid', 'red');
  check('마이크가 켜지고 오류 없음', !/bad/.test(info.split('|')[1]), info);
  check('맞는 음(도)은 초록 선', gr > 10, { gr, rd });
  check('틀린 목표 구간(미)은 빨강 선', rd > 30, { gr, rd });
  await page.click('.pr-btn:has-text("마이크"), .pr-btn:has-text("멈춤")').catch(() => {}); await sleep(300);
  await page.click('.pr-btn:has-text("점수")').catch(() => {}); await sleep(300);
  check('점수 보기 후에도 화면 유지', await page.evaluate(() => !!document.querySelector('.pr-grid')));

  console.log('· 가사 추출');
  await page.click('.pv-tabbtn[data-tab="lyrics"]');
  await page.click('.ly-btn:has-text("이 쪽에서 추출")');
  check('가사가 나옴', await L.waitTrue(page, () => /Amazing grace how sweet the sound/.test(document.querySelector('.ly-out').value), null, 5000), await page.evaluate(() => document.querySelector('.ly-out').value));
  const txt = await page.evaluate(() => document.querySelector('.ly-out').value);
  check('[Verse 1] · [Chorus] 표시', /\[Verse 1\]/.test(txt) && /\[Chorus\]/.test(txt), txt);
  check('코드 줄은 빠짐', !/D\/F#/.test(txt) && !/Em7/.test(txt), txt);
  await page.evaluate(() => { const c = document.querySelectorAll('.ly-chk input')[0]; c.click(); });
  await page.click('.ly-btn:has-text("이 쪽에서 추출")'); await sleep(700);
  const txt2 = await page.evaluate(() => document.querySelector('.ly-out').value);
  check('"코드 포함"을 켜면 코드 줄이 들어감', /D\/F#/.test(txt2) && /Em7/.test(txt2), txt2);
  await page.click('.ly-btn:has-text("전체 쪽")'); await sleep(1200);
  const txt3 = await page.evaluate(() => document.querySelector('.ly-out').value);
  check('전체 쪽 추출에 2·3쪽 가사도 포함', /Twas grace/.test(txt3) && /Praise the Lord/.test(txt3), txt3);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }).catch(() => null), page.click('.ly-btn:has-text(".txt")')]);
  check('.txt 저장 (다운로드)', !!dl && /\.txt$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());

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
  await page.click('.pv-panelbtn'); await sleep(500); await page.screenshot({ path: '/tmp/shot-tablet-b.png' });
  check('오류 없음', errs.length === 0, errs.slice(0, 5));
  await br.close(); S.server.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e); process.exit(2); });
