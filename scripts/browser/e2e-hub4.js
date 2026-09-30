/**
 * Hub v4 화면 시험 (진짜 크롬 + 진짜 server.js + 가짜 구글/유튜브/이미지 검색)
 *   NODE_PATH=$(npm root -g) PORT=4189 node scripts/browser/e2e-hub4.js
 *  · 곡 수정 안의 "YouTube 검색" : 여러 버전 카드 · 미리듣기 · 선택 → 링크 + 팀·버전 칸 자동 채움 · 저장
 *  · "악보 이미지 검색" : 카드 → 선택 → 서버가 저장 → 악보 목록 → 필기 화면이 그림을 그림으로 열림 · 실패하면 "직접 올리기"
 *  · @태그 배지 · 카카오톡 콘티 요약 복사(클립보드) · 콘티 화면에 오류 없음
 */
process.env.PORT = process.env.PORT || '4189';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-hub4-server.js');
const BASE = 'http://127.0.0.1:' + process.env.PORT, KEY = 'ADM', DATE = '2026-10-04';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const PNG = require('./mkpng').mkpng(300, 400);
(async () => {
  await sleep(1200);
  run((api) => api.saveWorshipSongs(KEY, DATE, '콘티', [
    { title: '주님의 사랑', team: '', key: 'G', bpm: '72', form: 'V1-C', link: '', note: '@일렉 솔로 구간 있음', solo: [] },
    { title: '두 번째 곡', team: '어노인팅', key: 'A', bpm: '', form: '', link: '', note: '', solo: [] }]));
  run((api) => api.saveWorshipSong(KEY, DATE, { kind: '결단', title: '결단 곡', key: 'D', note: '' }));

  const br = await L.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage(); const errs = [];
  await page.addInitScript(() => { window.YN_IMG_SEARCH = true; });   // 이미지 검색 단추는 기본 숨김 — 시험에서만 켬
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route(/(img|t)\.example\.com\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route(/youtube-nocookie\.com|ytimg\.com|youtube\.com\/iframe_api/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>yt</body></html>' }));
  await page.goto(BASE + '/?page=worship&key=' + KEY);
  check('허브가 열림', await L.waitTrue(page, () => window.W && window.D && window.YNConti, null, 10000));
  await page.evaluate((d) => { if (window.W.date !== d) return window.go && window.go(d); }, DATE);
  await sleep(500);
  console.log('· 콘티 화면: @태그 배지 · 카카오톡 요약');
  check('콘티 곡 목록이 보임', await L.waitTrue(page, () => document.querySelectorAll('.song.card').length >= 2, null, 5000));
  check('@일렉 이 배지로 표시됨', await page.evaluate(() => !!document.querySelector('.snote .cn-mt') && /@일렉/.test(document.querySelector('.snote .cn-mt').textContent)));
  check('카카오톡 버튼이 콘티 화면에 있음', await page.evaluate(() => !!document.querySelector('.cn-kakaobtn') && /카카오톡 콘티 요약 복사/.test(document.querySelector('.cn-kakaobtn').textContent)));
  await page.click('.cn-kakaobtn'); await sleep(500);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('클립보드에 요청서 템플릿 그대로 복사됨', /^\[2026년 10월 04일\] 주일예배 콘티\n\n인도자: .* \| 남싱: .* \| 메인건반: .* \| 세컨건반: .* \| 일렉: .* \| 베이스: .* \| 드럼: .*\n\n#1\. 주님의 사랑 \(Key: G\)\n- 송폼: V1-C\n- 곡 설명: @일렉 솔로 구간 있음\n\n#2\. 두 번째 곡 - 어노인팅 \(Key: A\)\n\n\[결단찬양\]\n# 결단 곡 \(Key: D\)$/.test(clip), JSON.stringify(clip));
  check('복사 안내 문구가 뜸', await page.evaluate(() => /복사했습니다/.test((document.getElementById('cnKakaoMsg') || {}).textContent || '')));

  console.log('· 곡 수정: YouTube 검색');
  await page.evaluate(() => { songEdit = '콘티:1'; render(); });
  check('곡 수정 칸에 YouTube · 이미지 검색 · @태그 도구가 붙음', await page.evaluate(() => !!document.getElementById('cnYtBtn') && !!document.getElementById('cnImgBtn') && !!document.getElementById('cnMention')));
  await page.click('#cnYtBtn');
  check('펼치면 제목으로 자동 검색되어 버전 카드 2개', await L.waitTrue(page, () => document.querySelectorAll('#cnYtGrid .cn-card').length === 2, null, 5000));
  check('길이 · 조회수가 카드에 표시', await page.evaluate(() => /4:13/.test(document.getElementById('cnYtGrid').textContent) && /12\.3만/.test(document.getElementById('cnYtGrid').textContent)));
  check('"YouTube에서 열기" 링크', await page.evaluate(() => !!document.querySelector('#cnYtGrid a[href*="youtube.com/watch?v=aaaaaaaaaaa"]')));
  await page.click('#cnYtGrid .cn-card:first-child [data-act="prev"].cn-mini');
  check('미리듣기: 카드 안에서 재생기가 열림', await L.waitTrue(page, () => { const f = document.querySelector('#cnYtGrid .cn-thumb.playing iframe'); return !!f && /youtube-nocookie\.com\/embed\/aaaaaaaaaaa/.test(f.src); }, null, 3000));
  await page.click('#cnYtGrid .cn-card:first-child .cn-pick');
  check('"선택" → 링크 칸에 영상 주소', await page.evaluate(() => document.getElementById('sLink').value === 'https://youtu.be/aaaaaaaaaaa'));
  check('빈 "팀" 칸에 채널 · 버전 이름이 들어감', await page.evaluate(() => /마커스워십/.test(document.getElementById('sTeam').value) && /Live/.test(document.getElementById('sTeam').value)), await page.evaluate(() => document.getElementById('sTeam').value));
  check('"연결됨" 줄이 보임', await page.evaluate(() => !!document.querySelector('.cn-picked')));
  await page.evaluate(() => saveSong('콘티', 1)); await sleep(800);
  const saved = run((api) => api.한주_ ? api.한주_(DATE) : null);
  const s1 = (saved && saved.songs || []).find((s) => s.seq === 1) || {};
  check('저장하면 서버에 링크 · 팀(버전)이 들어감', s1.link === 'https://youtu.be/aaaaaaaaaaa' && /마커스워십/.test(s1.team || ''), JSON.stringify(s1));
  check('저장 뒤 목록에 ▶ YouTube 링크', await L.waitTrue(page, () => !!document.querySelector('.song.card .smeta a[href*="aaaaaaaaaaa"]'), null, 4000));

  console.log('· 곡 수정: 악보 이미지 검색 → 악보로 저장 → 필기 화면');
  await page.evaluate(() => { songEdit = '콘티:2'; render(); });
  await page.click('#cnImgBtn');
  check('펼치면 자동 검색 · 카드 2개', await L.waitTrue(page, () => document.querySelectorAll('#cnImGrid .cn-imgcard').length === 2, null, 5000));
  await page.evaluate(() => { document.getElementById('cnAuto').checked = false; document.getElementById('cnAuto').dispatchEvent(new Event('change')); });
  await page.click('#cnImGrid .cn-imgcard:first-child .cn-pick');
  check('선택하면 "악보로 저장했습니다"', await L.waitTrue(page, () => /악보로 저장했습니다/.test(document.getElementById('cnImMsg').textContent), null, 8000), await page.evaluate(() => document.getElementById('cnImMsg').textContent));
  const wk = run((api) => api.한주_(DATE)); const sheet = (wk.sheets || []).find((f) => /악보\.png$/.test(f.name));
  check('서버 악보 목록에 그림 파일이 생김', !!sheet, JSON.stringify((wk.sheets || []).map((f) => f.name)));
  check('곡 수정 중이던 입력칸은 지워지지 않음 (조용히 목록만 갱신)', await page.evaluate(() => !!document.getElementById('sTitle') && document.getElementById('sTitle').value === '두 번째 곡'));
  check('악보 목록(W.sheets)에도 반영됨', await page.evaluate(() => (window.W.sheets || []).some((f) => /악보\.png$/.test(f.name))));
  await page.click('#cnImMsg [data-act="open"]');
  check('"필기 화면으로 열기" → 그림이 필기 캔버스 바탕으로 그려짐', await L.waitTrue(page, () => { const c = document.querySelector('.pv-pdf'); if (!c || c.width < 10) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] !== 255)) return true; return false; }, null, 10000));
  check('쪽 표시 1 / 1', await page.evaluate(() => document.querySelector('.pv-pg') && /1 \/ 1/.test(document.querySelector('.pv-pg').textContent)));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(() => { const c = window.YNPractice && window.YNPractice.current && window.YNPractice.current(); if (c && c.close) c.close(); });
  await sleep(400);

  console.log('· 이미지 가져오기 실패 → 직접 올리기 안내');
  global.__net.imageFail = true;
  await page.evaluate(() => { songEdit = '콘티:2'; render(); });
  await page.click('#cnImgBtn');
  await L.waitTrue(page, () => document.querySelectorAll('#cnImGrid .cn-imgcard').length === 2, null, 5000);
  await page.click('#cnImGrid .cn-imgcard:nth-child(2) .cn-pick');
  check('실패하면 이유 + "직접 올리기" 단추', await L.waitTrue(page, () => /403/.test(document.getElementById('cnImMsg').textContent) && !!document.querySelector('#cnImMsg [data-act="upload"]'), null, 8000), await page.evaluate(() => document.getElementById('cnImMsg').textContent));
  check('실패해도 곡 수정 칸은 그대로', await page.evaluate(() => !!document.getElementById('sTitle')));
  await page.screenshot({ path: '/tmp/shot-hub4.png' });

  console.log('· @태그 넣기 칩');
  await page.evaluate(() => { songEdit = '콘티:2'; render(); });
  check('@태그 칩이 있음', await page.evaluate(() => document.querySelectorAll('#cnMention .cn-chip').length >= 5));
  await page.locator('#cnMention .cn-chip').first().click();
  check('칩을 누르면 설명 칸에 @태그가 들어감', await page.evaluate(() => /@/.test(document.getElementById('sNote').value)));

  check('브라우저 오류 없음', errs.length === 0, errs.join(' | '));
  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e); process.exit(2); });
