/**
 * v6 — 라이브 악보 화면 사진 (디자인 확인용)
 *   NODE_PATH=$(npm root -g) PORT=4197 SHOT_DIR=/tmp/shots node scripts/browser/shot-pv.js
 */
process.env.PORT = process.env.PORT || '4197';
const L = require('./e2e-lib'); const { sleep } = L;
require('./e2e-full-server.js');
const { mkpdf, SAMPLE } = require('./mkpdf');
const BASE = 'http://127.0.0.1:' + process.env.PORT, KEY = 'ADM';
const SHOT = process.env.SHOT_DIR || '/tmp/shots';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
require('fs').mkdirSync(SHOT, { recursive: true });
(async () => {
  await sleep(1200);
  const pdfUrl = 'data:application/pdf;base64,' + mkpdf(SAMPLE).toString('base64');
  const d = run((api) => api.worshipHub(KEY, '')).nextWeek || '2026-10-04';
  run((api) => api.saveWorshipSongs(KEY, d, '콘티', [1, 2, 3].map((n) => ({ title: '주님의 은혜 ' + n, team: '팀', key: 'G', bpm: '72', form: 'I-V1-C-V2-C-B-C-O', link: '', note: '', solo: [] }))));
  run((api) => api.uploadWorshipSheet(KEY, d, '주님의 은혜 1.pdf', pdfUrl, '콘티'));
  run((api) => api.uploadWorshipSheet(KEY, d, '주님의 은혜 2.pdf', pdfUrl, '콘티'));
  const br = await L.launch();
  const vps = (process.env.VPS || 'ipadL,ipadP,phone,desk').split(',');
  const V = { ipadL: { width: 1180, height: 820, isMobile: true, hasTouch: true }, ipadP: { width: 820, height: 1180, isMobile: true, hasTouch: true }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true }, desk: { width: 1440, height: 900 } };
  for (const n of vps) {
    const v = V[n];
    const ctx = await br.newContext({ viewport: { width: v.width, height: v.height }, isMobile: !!v.isMobile, hasTouch: !!v.hasTouch, locale: 'ko-KR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load/.test(m.text())) console.log('console', m.text()); });
    await page.goto(BASE + '/?page=worship&key=' + KEY + '&date=' + d);
    await L.waitTrue(page, () => window.W && document.querySelectorAll('.song.card').length >= 3, null, 15000);
    await page.evaluate((dd) => { if (window.DATE !== dd) goWeek(dd); }, d); await sleep(800);
    await page.screenshot({ path: SHOT + '/hub-' + n + '.png' });
    await page.evaluate(() => openPractice(''));
    await L.waitTrue(page, () => { const l = document.querySelector('.pv-loading'); return !!document.querySelector('.pv') && l && l.style.display === 'none'; }, null, 12000);
    await sleep(1500);
    await page.screenshot({ path: SHOT + '/pv-' + n + '.png' });
    if (process.env.EXTRA) { try { await page.evaluate(new Function(process.env.EXTRA)); await sleep(800); await page.screenshot({ path: SHOT + '/pv-' + n + '-x.png' }); } catch (e) { console.log('extra', e.message); } }
    await ctx.close();
  }
  await br.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
