/** Step 5 — 교적 검색 결과(글라스 카드) 시험: 진짜 server.js + 가짜 구글 + 진짜 크롬
 *  · 1,500명 자료를 넣고 그리기 속도 · 이어 붙이기 · 검색 규칙 · 펼치기/저장 · 안전장치를 확인합니다.
 *  실행: node scripts/browser/e2e-step5.js   (SHOT=1 이면 화면 사진을 /tmp/step5-*.png 로 저장)
 */
process.env.PORT = '4195';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const BASE = 'http://127.0.0.1:4195';
const N = 1500;

const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임'];
const GIV = ['민준', '서연', '지우', '하준', '서윤', '도윤', '예은', '시우', '수아', '주원', '지민', '현우'];
function makeList() {
  const out = [];
  for (let i = 0; i < N; i++) {
    const name = SUR[i % 10] + GIV[(i * 7) % 12] + (i >= 120 ? String(i) : '');
    const inCell = i % 3 !== 0;
    out.push({
      name, engName: 'Eng ' + i, phone: '416-555-' + String(1000 + i), kakao: 'k' + i, email: 'm' + i + '@ex.com',
      address: i % 5 === 0 ? i + ' Yonge St, Toronto' : '', envelopeNo: String(3000 + i),
      cell: inCell ? (1 + (i % 6)) + '셀' : '', cells: inCell ? [(1 + (i % 6)) + '셀'] : [],
      teams: i % 4 === 0 ? [{ team: '찬양1팀', role: '팀원' }] : [], missions: i % 50 === 0 ? [{ team: '단기선교', role: '' }] : [],
      cellStatus: inCell ? '' : (i % 2 ? '셀 배정 대기' : ''),
      photo: i % 10 === 1 ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' : '', photoLarge: '',
      gender: '', birthdayDisplay: '', baptized: '', discipleship: '', trainingRate: '', joinedAt: '', memberSince: '', roles: [], autoRoles: [],
      rate: inCell ? 40 + (i % 60) : null, present: 3, totalMeetings: 5, notFound: i === 7
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return out;
}

(async () => {
  await sleep(1200);
  const LIST = makeList();
  const D = { list: LIST, total: N, withCell: LIST.filter((p) => p.cells.length).length, noCell: LIST.filter((p) => !p.cells.length).length,
    inTeam: LIST.filter((p) => p.teams.length).length, missing: 1, cells: ['1셀', '2셀', '3셀', '4셀', '5셀', '6셀'], teams: ['찬양1팀'] };
  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[dir-glass\] 예전 목록으로/.test(m.text())) errs.push('console: ' + m.text()); });
  let saved = null;
  await page.route('**/api/getDirectory', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, result: D }) }));
  await page.route('**/api/saveDirectoryEntry', (r) => {
    const a = JSON.parse(r.request().postData()).args; saved = a;
    const p = Object.assign({}, LIST.find((x) => x.name === a[1]), a[2] || {});
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, result: p }) });
  });
  const shot = async (n) => { if (process.env.SHOT) await page.screenshot({ path: '/tmp/step5-' + n + '.png' }); };
  const cards = () => page.evaluate(() => document.querySelectorAll('#dirList .dg-card').length);
  const type = async (q) => { await page.fill('#dirQuery', q); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
  /** 끝까지 스크롤 — 더 붙는 것은 스크롤이 가까워질 때(비동기)라서 실제로 기다리며 반복 */
  const loadAll = async () => { let last = -1, still = 0; for (let i = 0; i < 200; i++) { const n = await page.evaluate(() => { const m = document.querySelector('.dg-more'); if (m) m.scrollIntoView(); return m ? document.querySelectorAll('#dirList .dg-card').length : -2; }); if (n === -2) return; still = n === last ? still + 1 : 0; last = n; if (still >= 4) { await page.evaluate(() => { const b = document.querySelector('.dg-more button'); if (b) b.click(); }); still = 0; } await page.waitForTimeout(120); } };

  console.log('· 열기 · 첫 그리기');
  await page.goto(BASE + '/?page=admin&key=ADM#dir');   // Step 11: 옛 관리 첫 화면이 없어져서 영역(#dir)으로 바로 들어갑니다
  await L.waitTrue(page, () => document.getElementById('main').style.display !== 'none', null, 8000);
  await page.evaluate(() => go('dir'));
  check('결과 카드가 그려짐', await L.waitTrue(page, () => document.querySelectorAll('#dirList .dg-card').length > 0, null, 6000));
  check('새 화면이 켜짐 (안전장치 꺼져 있지 않음)', await page.evaluate(() => !window.__dirGlassOff && typeof window.__dirGlass === 'object'));
  check('처음에는 24명만 그림 (1,500명 아님)', (await cards()) === 24, await cards());
  check('개수 문구', (await page.textContent('#dirCount')).includes('전체 1500명'), await page.textContent('#dirCount'));
  check('카드에 backdrop-filter 적용', await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.dg-card')); return /blur/.test(c.backdropFilter || c.webkitBackdropFilter || ''); }));
  check('카드 바탕이 어두움 (흰색 아님)', await page.evaluate(() => { const b = document.querySelector('.dg-head'); const cs = getComputedStyle(b.parentNode.parentNode); const t = getComputedStyle(document.querySelector('.dg-n')).color; const m = /(\d+), (\d+), (\d+)/.exec(t); return +m[1] > 200; }));
  check('화면 밖 카드는 그리기를 건너뜀 (content-visibility)', await page.evaluate(() => getComputedStyle(document.querySelector('.dg-card')).contentVisibility === 'auto'));
  await shot('list');

  console.log('· 이어 붙이기 (스크롤)');
  await page.evaluate(() => document.querySelector('.dg-more').scrollIntoView());
  check('스크롤하면 더 붙음', await L.waitTrue(page, () => document.querySelectorAll('#dirList .dg-card').length > 24, null, 3000));
  const before = await cards();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  check('계속 스크롤하면 계속 붙음', (await cards()) > before, await cards());
  await loadAll();
  check('끝까지 가면 전체 1,500명이고 더 보기 버튼이 사라짐', (await cards()) === 1500 && await page.evaluate(() => !document.querySelector('.dg-more')), await cards());
  await page.evaluate(() => window.scrollTo(0, 0));

  console.log('· 검색 규칙 (예전과 같음)');
  const names = () => page.evaluate(() => [...document.querySelectorAll('#dirList .dg-card')].map((c) => c.getAttribute('data-name')));
  const expectSame = async (q) => {
    const want = LIST.filter((p) => {
      const ql = q.toLowerCase(), qd = q.replace(/[^0-9]/g, '');
      if (p.name.toLowerCase().includes(ql) || (p.engName || '').toLowerCase().includes(ql) || (p.email || '').toLowerCase().includes(ql) || (p.kakao || '').toLowerCase().includes(ql) || (p.address || '').toLowerCase().includes(ql)) return true;
      if (qd && String(p.envelopeNo || '').replace(/[^0-9]/g, '') === qd) return true;
      return qd.length >= 3 && String(p.phone || '').replace(/[^0-9]/g, '').includes(qd);
    }).map((p) => p.name);
    await type(q);
    await loadAll();
    const got = await names();
    check('"' + q + '" → ' + want.length + '명', JSON.stringify(got) === JSON.stringify(want), { got: got.length, want: want.length });
  };
  await expectSame('김');
  await expectSame('EMAIL');            // 대소문자 무관 (이메일 · 영문)
  await expectSame('m12@');
  await expectSame('yonge');
  await expectSame('555-10');           // 전화 (숫자 3자리 이상 부분 일치)
  await expectSame('3005');             // 헌금번호 정확히 일치
  await expectSame('없는사람zzz');
  check('결과가 없으면 "교적에 추가" 버튼', await page.evaluate(() => /님을 교적에 추가/.test(document.querySelector('.dg-empty').textContent)));

  console.log('· 한 명이면 자동으로 펼침 · 강조 표시');
  await type('m12@');
  check('한 명 → 바로 펼침', await L.waitTrue(page, () => document.querySelectorAll('#dirList .dg-head.open').length === 1 && !!document.querySelector('#dirList .detail .mcard'), null, 3000),
    await page.evaluate(() => ({ n: document.querySelectorAll('#dirList .dg-card').length, off: window.__dirGlassOff, open: window.OPEN.dir, cnt: document.getElementById('dirCount').textContent, q: document.getElementById('dirQuery').value })));
  check('찾은 글자에 <mark>', await type('Eng 12') === undefined && await page.evaluate(() => !!document.querySelector('#dirList .dg-en mark')));
  await shot('detail');

  console.log('· 펼치기 · 접기 · 한 번에 한 명');
  await type('김');
  await page.waitForTimeout(80);
  const first = page.locator('#dirList .dg-head').nth(0), second = page.locator('#dirList .dg-head').nth(1);
  await first.click();
  check('클릭하면 펼침', await page.evaluate(() => document.querySelectorAll('#dirList .dg-head.open').length === 1 && !!document.querySelector('#dirList .dg-head.open + .detail .mcard')));
  check('펼친 칸이 보임', await page.evaluate(() => getComputedStyle(document.querySelector('#dirList .dg-head.open + .detail')).display === 'block'));
  check('펼친 칸도 어두움', await page.evaluate(() => { const m = getComputedStyle(document.querySelector('#dirList .detail .mcard')).backgroundColor; const x = /(\d+), (\d+), (\d+)/.exec(m); return +x[1] < 80; }));
  await shot('open');
  await second.click();
  check('다른 사람을 누르면 앞사람은 접힘', await page.evaluate(() => document.querySelectorAll('#dirList .dg-head.open').length === 1 && document.querySelectorAll('#dirList .dg-head.open')[0] === document.querySelectorAll('#dirList .dg-head')[1]));
  await second.click();
  check('다시 누르면 접힘', await page.evaluate(() => document.querySelectorAll('#dirList .dg-head.open').length === 0 && window.OPEN.dir === ''));
  await first.focus(); await page.keyboard.press('Enter');
  check('키보드(Enter)로도 펼침', await page.evaluate(() => document.querySelectorAll('#dirList .dg-head.open').length === 1));
  check('aria-expanded 갱신', await page.evaluate(() => document.querySelector('#dirList .dg-head.open').getAttribute('aria-expanded') === 'true'));

  console.log('· 저장하면 다시 그려도 펼침 · 스크롤 유지');
  await page.evaluate(() => document.querySelector('.dg-more').scrollIntoView());
  await L.waitTrue(page, () => document.querySelectorAll('#dirList .dg-card').length > 60, null, 3000);
  const nBefore = await cards();
  const openName = await page.evaluate(() => window.OPEN.dir.slice(1));
  await page.evaluate((n) => { window.updatePerson(Object.assign({}, window.personOf(n), { phone: '000-111-2222' })); window.rerenderCtx('dir'); }, openName);
  check('다시 그린 뒤에도 펼쳐진 사람이 그대로', await page.evaluate((n) => { const o = document.querySelector('#dirList .dg-head.open'); return !!o && o.parentNode.getAttribute('data-name') === n; }, openName));
  check('보던 만큼 그대로 유지 (처음 24명으로 되돌아가지 않음)', (await cards()) === nBefore, [await cards(), nBefore]);

  console.log('· 필터 (예전 규칙 그대로)');
  await type('');
  await page.evaluate(() => setDirFilter('nocell'));
  await page.waitForTimeout(120);
  const noCellShown = await page.evaluate(() => [...document.querySelectorAll('#dirList .dg-card')].every((c) => !!c.querySelector('.dg-chip.none')));
  check('"소속 셀 없음" 필터 — 모두 셀 없음 카드', noCellShown);
  check('개수 문구가 필터를 반영', /명 찾음/.test(await page.textContent('#dirCount')));
  await page.evaluate(() => setDirFilter('all'));
  await page.selectOption('#dirGroup', 't:찬양1팀');
  await page.waitForTimeout(100);
  check('소속별 보기(사역팀)', await page.evaluate(() => [...document.querySelectorAll('#dirList .dg-card')].every((c) => !!c.querySelector('.dg-chip.team'))));
  await page.selectOption('#dirGroup', '');

  console.log('· 성능 (1,500명)');
  const perf = await page.evaluate(() => new Promise((res) => {
    const q = document.getElementById('dirQuery'); const times = [];
    const words = ['김', '이', '박', '민', '서연', '지우', '하준', '도윤', 'Eng 1', 'm14', '555-1', '찬'];
    let i = 0;
    (function next() {
      if (i >= words.length) return res(times);
      q.value = words[i++];
      const t0 = performance.now(); window.renderDirectory(); times.push(performance.now() - t0);
      requestAnimationFrame(next);
    })();
  }));
  perf.sort((a, b) => a - b);
  const med = perf[Math.floor(perf.length / 2)], worst = perf[perf.length - 1];
  console.log('  · 검색 한 번 그리기(ms): 가운데값 ' + med.toFixed(1) + ' / 가장 느림 ' + worst.toFixed(1));
  check('검색 결과 그리기 가운데값 20ms 이하', med <= 20, med);
  check('가장 느린 경우도 50ms 이하', worst <= 50, worst);
  const cmp = await page.evaluate(() => new Promise((res) => {     // 같은 12개 검색어로 예전 함수 vs 새 함수 (예전 matchPerson 그대로 복원해서 비교)
    const G = window.__dirGlass, q = document.getElementById('dirQuery');
    const oldMatch = function (p, s) {
      s = s.toLowerCase(); const qd = s.replace(/[^0-9]/g, '');
      if (p.name.toLowerCase().indexOf(s) !== -1) return true;
      if ((p.engName || '').toLowerCase().indexOf(s) !== -1) return true;
      if ((p.email || '').toLowerCase().indexOf(s) !== -1) return true;
      if ((p.kakao || '').toLowerCase().indexOf(s) !== -1) return true;
      if ((p.address || '').toLowerCase().indexOf(s) !== -1) return true;
      if (qd && String(p.envelopeNo || '').replace(/[^0-9]/g, '') === qd) return true;
      if (qd.length >= 3 && String(p.phone || '').replace(/[^0-9]/g, '').indexOf(qd) !== -1) return true;
      return false;
    };
    const words = ['김', '이', '박', '민', '서연', '지우', '하준', '도윤', 'Eng 1', 'm14', '555-1', '찬'];
    const run = (fn) => { const t = []; for (const w of words) { q.value = w; const t0 = performance.now(); fn(); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return t[6]; };
    window.matchPerson = oldMatch; const o = run(G.orig);
    window.matchPerson = G.matchNew; const n = run(G.render);
    res({ o, n });
  }));
  console.log('  · (비교) 같은 검색어 12개 가운데값 — 예전 ' + cmp.o.toFixed(1) + 'ms → 새 ' + cmp.n.toFixed(1) + 'ms');
  await page.evaluate(() => { document.getElementById('dirQuery').value = ''; window.renderDirectory(); });

  console.log('· 사진 · 이니셜');
  const withPhoto = LIST.find((p) => p.photo).name;
  await type(withPhoto); await page.waitForTimeout(100);
  check('사진 있는 사람은 <img loading=lazy>', await page.evaluate(() => { const i = document.querySelector('#dirList .dg-img'); return !!i && i.loading === 'lazy' && i.decoding === 'async'; }));
  await type(''); await page.waitForTimeout(100);
  check('사진 없는 사람은 첫 글자', await page.evaluate(() => { const p = document.querySelector('#dirList .dg-ph'); return !!p && p.textContent.length === 1; }));

  console.log('· 안전장치 — 새 그리기에서 오류가 나면 예전 목록으로');
  await page.evaluate(() => { window.__realDF = window.dirFiltered; let once = true; window.dirFiltered = function () { if (once) { once = false; throw new Error('boom'); } return window.__realDF.apply(this, arguments); }; });
  await page.evaluate(() => { try { window.renderDirectory(); } catch (e) { window.__thrown = String(e); } });
  check('오류가 밖으로 새지 않고 안전장치 켜짐', await page.evaluate(() => window.__dirGlassOff === true));
  check('예전 목록이 그려짐 (화면이 비지 않음)', await page.evaluate(() => document.querySelectorAll('#dirList .row.prow').length > 0));

  check('페이지 오류 없음', errs.length === 0, errs);
  await br.close();
  const okAll = L.summary(); process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
