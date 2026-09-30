/** Step 2.15 · 3.2 — 콘티 화면 정리 · 날짜 이동 · 오프라인 열기 (진짜 server.js + 가짜 구글 + 진짜 크롬)
 *   NODE_PATH=... node scripts/browser/e2e-step31b.js */
process.env.PORT = '4197';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:4197';
(async () => {
  await sleep(1200);
  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 1100, height: 900 }, timezoneId: 'America/Toronto', locale: 'ko-KR' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g|WebSocket|ERR_INTERNET_DISCONNECTED|Failed to fetch/i.test(m.text())) errs.push('console: ' + m.text()); });
  const URL = BASE + '/?page=worship&key=ADM';
  await page.goto(URL);
  check('허브가 열림', await L.waitTrue(page, () => window.W && window.D && window.D.positions && window.D.positions.length > 0, null, 10000));
  await sleep(600);

  console.log('1. 콘티 정리');
  await page.evaluate(() => { window.W.sheets = [{ id: 'FILE_S1', name: '곡1.pdf', url: '#' }, { id: 'FILE_S2', name: '곡2.pdf', url: '#' }]; window.W.finalSheets = [{ id: 'FILE_F1', name: '결단.pdf', url: '#' }]; window.render(); });
  check('"불가" 안내(offbar) 가 예배콘티 화면에 없음', await page.evaluate(() => !document.querySelector('#body .offbar')));
  check('멤버 줄에 불가 표시(.pe.off)가 없음', await page.evaluate(() => !document.querySelector('#body .pe.off')));
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('#body .panel > .chip')).map((x) => x.textContent.trim()));
  console.log('   패널 순서:', JSON.stringify(order));
  check('유튜브 재생목록 상자가 없음', !order.some((t) => /유튜브|재생목록/.test(t)) && await page.evaluate(() => !/재생목록 주소/.test(document.getElementById('body').textContent)));
  const iC = order.indexOf('콘티'), iR = order.findIndex((t) => /^결단찬양/.test(t)), iS = order.indexOf('악보');
  check('결단찬양이 콘티 바로 아래 · 악보 위에 있음', iC >= 0 && iR > iC && iS > iR, order);
  const iL = order.findIndex((t) => /가사/.test(t));
  check('가사 시트가 맨 아래', iL === order.length - 1 || iL === -1 || order.slice(iL + 1).every((t) => /댓글|의견|코멘트/.test(t)) , order);
  check('세션 시작 버튼은 맨 위 한 곳뿐 (악보 옆 작은 버튼 · 아래 큰 버튼 없음)', await page.evaluate(() => document.querySelectorAll('#body .pvstartbtn').length === 1 && !document.querySelector('#body .pvgo.mini') && document.querySelectorAll('#body .pvgo').length === 1));
  check('시작 막대가 첫 번째이고 (위에 떠 있는) sticky', await page.evaluate(() => { const s = document.querySelector('#body .pvstart'); return !!s && getComputedStyle(s).position === 'sticky' && document.getElementById('body').firstElementChild === s; }));
  check('시작 막대가 스크롤해도 화면 위에 붙어 있음', await (async () => { await page.evaluate(() => window.scrollTo(0, 400)); await sleep(200); const t = await page.evaluate(() => { const s = document.querySelector('#body .pvstart'); return s ? Math.round(s.getBoundingClientRect().top) : -999; }); await page.evaluate(() => window.scrollTo(0, 0)); return t >= 0 && t <= 20; })());
  check('자동 녹음 확인란이 기본으로 켜져 있음', await page.evaluate(() => { const c = document.getElementById('autoRecChk'); return !!c && c.checked; }));
  await page.evaluate(() => document.getElementById('autoRecChk').click());
  check('끄면 기억됨', await page.evaluate(() => localStorage.getItem('yn.wh.autorec') === '0'));
  await page.evaluate(() => document.getElementById('autoRecChk').click());

  console.log('2. 날짜 이동');
  check('"다음 주일" 버튼이 있음', await page.evaluate(() => !!document.getElementById('wkToday')));
  const up = await page.evaluate(() => window.upcomingKey());
  const cur = await page.evaluate(() => window.DATE);
  console.log('   다음 주일', up, '현재', cur);
  check('처음엔 다음 주일에 있어서 버튼이 "here" 표시', await page.evaluate(() => document.getElementById('wkToday').classList.contains('here')) === (cur === up));
  const far = await page.evaluate(() => { const d = new Date(window.upcomingKey() + 'T12:00:00'); d.setDate(d.getDate() - 7 * 30); return d.toISOString().slice(0, 10); });
  await page.evaluate((f) => window.goWeek(f), far);
  check('멀리 지난 날짜로도 이동됨 (목록에 없던 날짜도)', await L.waitTrue(page, (f) => window.DATE === f, far, 6000), await page.evaluate(() => window.DATE));
  check('그 날짜가 주 목록에 나타남', await page.evaluate((f) => !!document.querySelector('#weeks .wk.on') && window.D.weeks.some((w) => w.date === f), far));
  check('멀리 있을 땐 버튼이 "here" 가 아님', await page.evaluate(() => !document.getElementById('wkToday').classList.contains('here')));
  await page.click('#wkToday');
  check('버튼으로 다음 주일에 돌아옴', await L.waitTrue(page, (u) => window.DATE === u, up, 6000), await page.evaluate(() => window.DATE));
  check('돌아오면 "here" 표시', await page.evaluate(() => document.getElementById('wkToday').classList.contains('here')));

  console.log('3. 아카이브 기본 필터');
  await page.evaluate(() => window.tab('archive'));
  await L.waitTrue(page, () => window.AR && window.AR.data, null, 8000);
  check('기본 범위가 "최근 3개월 + 다음 주일"', await page.evaluate(() => window.AR.range === 'now' && /최근 3개월 \+ 다음 주일/.test(document.getElementById('body').textContent)));
  await page.evaluate(() => window.tab('plan'));

  console.log('4. 오프라인으로 열기');
  const sw = await page.evaluate(async () => { try { const r = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; await new Promise((res) => { if (navigator.serviceWorker.controller) return res(); navigator.serviceWorker.addEventListener('controllerchange', res); setTimeout(res, 3000); }); return !!navigator.serviceWorker.controller; } catch (e) { return String(e); } });
  check('서비스워커가 페이지를 제어함', sw === true, sw);
  await page.goto(URL); await L.waitTrue(page, () => window.W && window.D, null, 10000); await sleep(3800);        // 두 번째 방문 (보관) + 미리 받기
  const keys = await page.evaluate(async () => (await caches.keys()).join(','));
  check('페이지 보관함이 생김', /yn-pages-v1/.test(keys) && /yn-shell-/.test(keys), keys);
  const idb = await page.evaluate(() => new Promise((res) => { YNOff.list('r|').then((a) => res(a.map((x) => x.key.split('|').slice(0, 2).join('|')))); }));
  check('IndexedDB 에 콘티(허브 · 주간)가 보관됨', idb.some((k) => /worshipHub/.test(k)) , idb);
  await ctx.setOffline(true); await sleep(200);
  const r = await page.goto(URL).then((x) => x && x.status(), (e) => 'ERR ' + e.message);
  check('인터넷이 끊겨도 허브 페이지가 열림', r === 200, r);
  check('오프라인에서도 콘티 화면이 그려짐 (주 목록 · 탭)', await L.waitTrue(page, () => window.W && window.D && document.querySelectorAll('#weeks .wk').length > 0 && !!document.getElementById('tabs').children.length, null, 10000));
  check('오프라인 표시줄이 보임', await L.waitTrue(page, () => { const b = document.getElementById('offBanner'); return !!b && b.classList.contains('on') && /오프라인/.test(b.textContent); }, null, 4000));
  await ctx.setOffline(false);
  check('연결이 돌아오면 표시줄이 사라짐', await L.waitTrue(page, () => { const b = document.getElementById('offBanner'); return !b || !b.classList.contains('on'); }, null, 5000));

  console.log('5. 오류');
  check('화면 오류 없음', errs.length === 0, errs.slice(0, 5));
  await br.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e.message); process.exit(1); });
