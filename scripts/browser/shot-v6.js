/**
 * v6 — 화면 사진 찍기 (디자인 확인용 · 시험 아님)
 *   NODE_PATH=$(npm root -g) PORT=4196 SHOT_DIR=/tmp/shots THEME=light node scripts/browser/shot-v6.js
 */
process.env.PORT = process.env.PORT || '4196';
const L = require('./e2e-lib'); const { sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:' + process.env.PORT, KEY = 'ADM';
const SHOT = process.env.SHOT_DIR || '/tmp/shots';
const THEME = process.env.THEME || 'light';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
require('fs').mkdirSync(SHOT, { recursive: true });

(async () => {
  await sleep(1200);
  const 커 = run((api) => api.포털토큰_('김커미티', '4165551000', ''));
  run((api) => api.addTeamMember(커, '찬양1팀', '정일반', '베이스'));
  const d = '2026-10-04';
  run((api) => api.saveWorshipSongs(KEY, d, '콘티', [1, 2, 3].map((n) => ({ title: '곡 ' + n, team: '팀', key: 'G', bpm: '72', form: 'V1-C', link: '', note: '', solo: [] }))));
  const br = await L.launch();
  const pages = (process.env.PAGES || 'portal,worship,team,admin,bulletin,forms').split(',');
  for (const vp of [{ width: 390, height: 900, n: 'phone' }, { width: 1280, height: 860, n: 'desk' }]) {
    const ctx = await br.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'ko-KR', timezoneId: 'America/Toronto' });
    await ctx.addInitScript(([t, th]) => { try { sessionStorage.setItem('ynPortalToken', t); localStorage.setItem('ynTheme', th); } catch (e) {} }, [커, THEME]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    const go = async (name, url, wait) => {
      if (pages.indexOf(name) === -1) return;
      await page.goto(BASE + url); await sleep(wait || 2500);
      await page.screenshot({ path: SHOT + '/' + THEME + '-' + vp.n + '-' + name + '.png', fullPage: vp.n === 'phone' ? false : false });
    };
    await go('portal', '/?page=portal');
    await go('worship', '/?page=worship&key=' + KEY);
    await go('team', '/?page=team&t=' + encodeURIComponent(커));
    await go('admin', '/?page=admin&key=' + KEY + '#app');
    await go('bulletin', '/?page=bulletin&edit=1&t=' + encodeURIComponent(커));
    await go('forms', '/?page=forms&t=' + encodeURIComponent(커));
    await ctx.close();
  }
  await br.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
