process.env.PORT = '4188';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const { mkpdf, SAMPLE } = require('./mkpdf');
const io = require('socket.io-client');
const BASE = 'http://127.0.0.1:4188', KEY = 'ADM', DATE = '2026-10-04';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
(async () => {
  await sleep(1200);
  const dataUrl = 'data:application/pdf;base64,' + mkpdf(SAMPLE).toString('base64');
  run((api) => api.saveWorshipSongs(KEY, '2026-09-27', '콘티', [{ title: 'Amazing Grace', team: '테스트', key: 'G', bpm: '120', form: 'V1-C', link: '', note: '', solo: [] }]));
  run((api) => api.saveWorshipSongs(KEY, DATE, '콘티', [{ title: 'Amazing Grace', team: '테스트', key: 'G', bpm: '120', form: 'V1-C-V2-C-B-C', link: '', note: '', solo: [] }, { title: 'Second Song', team: '', key: 'Bb', bpm: '90', form: 'Intro-V-C', link: '', note: '', solo: [] }]));
  const w1 = run((api) => api.uploadWorshipSheet(KEY, DATE, 'Amazing Grace.pdf', dataUrl, '콘티'));
  run((api) => api.uploadWorshipSheet(KEY, DATE, 'Second Song.pdf', dataUrl, '콘티'));
  const fileId = w1.sheets[0].id;
  console.log('· 진짜 서버: 인증 · 악보 스트림');
  const c1 = io(BASE, { transports: ['websocket'] });
  const bad = await new Promise((r) => c1.emit('join', { token: 'WRONG', room: DATE }, r));
  check('틀린 열쇠는 실시간 입장 거부', bad && bad.ok === false && bad.code === 'auth', bad);
  const good = await new Promise((r) => c1.emit('join', { token: KEY, room: DATE }, r));
  check('관리자 열쇠는 입장 · 리더 가능', good && good.ok === true && good.you.canLead === true, good);
  c1.close();
  const st = await fetch(BASE + '/sheet/' + fileId); const buf = Buffer.from(await st.arrayBuffer());
  check('/sheet/<악보ID> 가 PDF 를 돌려줌', st.status === 200 && buf.slice(0, 4).toString() === '%PDF', st.status);
  const st2 = await fetch(BASE + '/sheet/NOTINSHEETXYZ123'); check('목록에 없는 파일은 404', st2.status === 404, st2.status);

  const br = await L.launch(); const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(BASE + '/?page=worship&key=' + KEY);
  console.log('· 실제 Worship 화면');
  check('허브가 열림', await L.waitTrue(page, () => window.W && window.D, null, 10000));
  await page.evaluate((d) => { if (window.W.date !== d) throw new Error('다른 주 ' + window.W.date); }, DATE).catch(() => {});
  check('악보 목록에 "연습" 버튼', await L.waitTrue(page, () => document.querySelectorAll('.pvgo.mini').length === 2, null, 6000), await page.evaluate(() => document.querySelectorAll('.pvgo').length));
  check('연습 모드 열기 버튼', await page.evaluate(() => !!document.querySelector('button.pvgo:not(.mini)')));
  check('연주 시작 버튼이 "말씀"과 "편성" 패널 사이에 있음', await page.evaluate(() => { const ps = Array.from(document.querySelectorAll('.panel')); const i = ps.findIndex((p) => p.classList.contains('pvstart')); return i > 0 && /말씀/.test(ps[i - 1].textContent) && /편성/.test(ps[i + 1].textContent); }));
  await page.screenshot({ path: '/tmp/shot-hub.png' });
  await page.click('.pvgo.mini');
  check('연습 화면 열림 · PDF 그려짐', await L.waitTrue(page, () => document.querySelector('.pv') && document.querySelector('.pv-pg') && document.querySelector('.pv-pg').textContent === '1 / 3', null, 10000));
  await sleep(700);
  { const w0 = await page.evaluate(() => document.querySelector('.pv-pdf').getBoundingClientRect().width);
    const h0 = await page.evaluate(() => document.querySelector('.pv-tools').getBoundingClientRect().height);
    await page.click('.pv-toolsbtn'); await sleep(500);
    check('도구 막대가 접힘 (숨김 · 버튼 상태 · 저장)', await page.evaluate(() => getComputedStyle(document.querySelector('.pv-tools')).display === 'none' && document.querySelector('.pv-toolsbtn').getAttribute('aria-pressed') === 'false' && localStorage.getItem('yn.pv.tools') === '0'), h0);
    check('접으면 악보가 같거나 더 크게 그려짐', (await page.evaluate(() => document.querySelector('.pv-pdf').getBoundingClientRect().width)) >= w0 - 1);
    await page.click('.pv-toolsbtn'); await sleep(400);
    check('다시 펴면 도구 막대가 보임', await page.evaluate(() => getComputedStyle(document.querySelector('.pv-tools')).display !== 'none' && localStorage.getItem('yn.pv.tools') === '1')); }
  check('체크박스가 주황 커스텀 모양', await page.evaluate(() => { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = true; document.body.appendChild(c); const cs = getComputedStyle(c); const ok = cs.appearance === 'none' && cs.backgroundColor === 'rgb(255, 138, 42)'; c.remove(); return ok; }));
  check('슬라이더 채움(--fill)이 값에 맞게 갱신', await page.evaluate(() => { const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = .05; r.value = .25; document.querySelector('.pv').appendChild(r); r.dispatchEvent(new Event('input', { bubbles: true })); const f = r.style.getPropertyValue('--fill'); r.remove(); return f === '25%'; }));
  { await page.evaluate(() => { const P = window.YNPractice.current().P; const sg = P.song(); if (sg) sg.link = 'https://youtu.be/dQw4w9WgXcQ'; P.setSong(P.songIdx()); });
    check('유튜브 링크가 있으면 ▶ YouTube 버튼이 보임', await page.evaluate(() => getComputedStyle(document.querySelector('.pv-ytbtn')).display !== 'none'));
    await page.click('.pv-ytbtn');
    check('앱 안 작은 창에 임베드 재생기가 뜸', await page.evaluate(() => { const f = document.querySelector('.pv-yt iframe'); return !!f && /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/.test(f.src); }));
    await page.click('.pv-yth button');
    check('닫으면 사라지고 악보 화면은 그대로', await page.evaluate(() => !document.querySelector('.pv-yt') && !!document.querySelector('.pv-pdf'))); }
  { await page.click('.pv-tabbtn[data-tab="metro"]'); await sleep(400);
    const bp = () => page.evaluate(() => document.querySelector('[data-role="bpm"]').value);
    check('곡 정보의 BPM(120)이 메트로놈에 자동 적용', (await bp()) === '120', await bp());
    await page.fill('[data-role="bpm"]', '96'); await page.dispatchEvent('[data-role="bpm"]', 'change'); await sleep(200);
    check('현장에서 직접 고친 BPM 이 적용됨', (await bp()) === '96');
    await page.evaluate(() => { const P = window.YNPractice.current().P; P.setSong(-1); P.setSong(0); }); await sleep(300);
    check('같은 곡으로 돌아와도 고친 BPM(96) 유지', (await bp()) === '96', await bp()); }
  { await page.evaluate(() => { const P = window.YNPractice.current().P; P.goto && P.goto(3); });
    await page.click('.pv-b[data-a="next"]').catch(() => {}); await sleep(200);
    const sel = () => page.evaluate(() => document.querySelector('.pv-sheetsel').value);
    let s0 = await sel();
    for (let i = 0; i < 4 && s0 === '0'; i++) { await page.click('[data-a="next"]'); await sleep(500); s0 = await sel(); }
    check('마지막 쪽에서 넘기면 다음 악보(결단 찬양 포함)로 이어짐', s0 === '1', s0);
    await page.click('[data-a="prev"]'); await sleep(600);
    check('되돌리면 앞 악보의 마지막 쪽으로 이어짐', (await sel()) === '0' && (await page.evaluate(() => /^3 \/ 3$/.test(document.querySelector('.pv-pg').textContent)))); }
  { for (let i = 0; i < 4 && !(await page.evaluate(() => /^1 \//.test(document.querySelector('.pv-pg').textContent))); i++) { await page.click('[data-a="prev"]'); await sleep(500); }
    const lay = await page.evaluate(() => document.querySelector('.pv').classList.contains('pv-computer'));
    if (lay) {
      await page.click('.pv-spreadbtn'); await sleep(900);
      check('두 쪽 보기: 오른쪽 쪽이 나란히 보임', await page.evaluate(() => { const b = document.querySelector('.pv-pagebox2'); const a = document.querySelector('.pv-pagebox'); return getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().left >= a.getBoundingClientRect().right - 1; }));
      check('  오른쪽 쪽에 글자가 그려짐', await page.evaluate(() => { const c = document.querySelector('.pv-pdf2'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n > 200; }));
      check('  왼쪽 필기 층은 그대로 1장', await page.evaluate(() => document.querySelectorAll('.pv-anno').length === 1));
      const pg0 = await page.evaluate(() => document.querySelector('.pv-pg').textContent);
      await page.click('[data-a="next"]'); await sleep(500);
      check('  다음으로 넘기면 두 쪽씩 이동', pg0.startsWith('1') && (await page.evaluate(() => document.querySelector('.pv-pg').textContent)).startsWith('3'), await page.evaluate(() => document.querySelector('.pv-pg').textContent));
      await page.click('.pv-spreadbtn'); await sleep(500);
      check('  끄면 한 쪽 보기로 복귀', await page.evaluate(() => getComputedStyle(document.querySelector('.pv-pagebox2')).display === 'none'));
      await page.click('[data-a="prev"]'); await sleep(400);
    } }
  check('PDF 글자가 보임', (await L.pdfInk(page)) > 500);
  check('악보 이름으로 곡 자동 인식(Key · BPM)', await page.evaluate(() => /Amazing Grace · Key G · 120 BPM/.test(document.querySelector('.pv-songinfo').textContent)), await page.evaluate(() => document.querySelector('.pv-songinfo').textContent));
  check('진짜 서버와 실시간 연결', await L.waitTrue(page, () => /실시간/.test(document.querySelector('.pv-conn').textContent), null, 6000));
  await page.screenshot({ path: '/tmp/shot-computer.png' });
  console.log('· 필기 → 진짜 시트 저장');
  await page.click('.pv-tabbtn[data-tab="together"]'); await page.click('button[data-a="claim"]');
  check('관리자가 리더가 됨', await L.waitTrue(page, () => /내가 리더/.test(document.querySelector('.pv-lead').textContent)));
  await L.ensureTool(page, 'pen'); await page.click('[data-a="layer"]');
  await L.drag(page, [[.2, .3], [.5, .34], [.8, .3]]);
  await page.click('.pv-tabbtn[data-tab="anno"]'); await page.click('button[data-a="save"]');
  let teamRows = [];
  for (let i = 0; i < 30; i++) { teamRows = run((api) => api.찬양주석읽기_(fileId, 'song', '*')); if (teamRows.length) break; await sleep(300); }
  check('팀 필기가 진짜 "찬양주석" 시트에 저장됨', teamRows.length === 1 && teamRows[0].t === 'pen', teamRows);
  await page.evaluate(() => YNPractice.current().P.setLayer('mine')); await L.ensureTool(page, 'pen');
  await L.drag(page, [[.2, .4], [.5, .44], [.8, .4]]);
  let mineRows = [];
  for (let i = 0; i < 30; i++) { mineRows = run((api) => api.찬양주석읽기_(fileId, 'song', '커미티')); if (mineRows.length) break; await sleep(300); }
  check('내 필기(나만 보기)도 시트에 저장됨', mineRows.length === 1, mineRows);
  check('두 층이 섞이지 않음', teamRows[0].id !== (mineRows[0] || {}).id);
  await page.evaluate(() => YNPractice.current().close());
  check('닫으면 화면이 사라짐', await page.evaluate(() => !document.querySelector('.pv') && !document.body.classList.contains('pv-lock')));
  await page.click('.pvgo.mini');
  check('다시 열면 두 층 모두 복원', await L.waitTrue(page, () => YNPractice.current() && YNPractice.current().P.anno().items('team').length === 1 && YNPractice.current().P.anno().items('mine').length === 1, null, 8000), [await L.teamCount(page), await L.mineCount(page)]);

  console.log('· 송폼 만들기');
  await page.evaluate(() => YNPractice.current().close());
  await page.evaluate(() => { songEdit = '콘티:2'; render(); });
  check('송폼 만들기 도구가 곡 수정 안에 나타남', await L.waitTrue(page, () => document.querySelectorAll('#sFormB .fb-btn').length > 10, null, 4000));
  await page.click('#sFormB .fb-t[data-act="clear"]');
  for (const k of ['Intro', 'V1', 'PC', 'C', 'V2', 'C2', 'B1', 'Out']) await page.click('#sFormB .fb-btn[data-add="' + k + '"]');
  const fv = await page.evaluate(() => document.getElementById('sForm').value);
  check('눌러서 만든 순서가 입력칸에 들어감', fv === 'Intro-V1-PC-C-V2-C2-B1-Out', fv);
  await page.evaluate(() => saveSong('콘티', 2));
  check('저장하면 서버 곡 정보에 반영', await L.waitTrue(page, () => W.songs[1] && W.songs[1].form === 'Intro-V1-PC-C-V2-C2-B1-Out', null, 6000), await page.evaluate(() => W.songs.map((s) => s.form)));
  await page.evaluate(() => { songEdit = '콘티:2'; render(); });
  check('다시 열면 송폼 도구가 저장된 값으로 시작', await L.waitTrue(page, () => document.querySelectorAll('#sFormB .fb-chip').length === 8, null, 3000));
  await page.screenshot({ path: '/tmp/shot-form.png' });
  await page.evaluate(() => { songEdit = null; render(); });

  console.log('· 통계 팝업 (다크 글래스)');
  await page.evaluate(() => { TAB = 'stats'; renderTabs && renderTabs(); loadStats(); });
  check('통계 화면', await L.waitTrue(page, () => window.SS && SS.data && document.querySelector('.srow'), null, 8000));
  await page.evaluate(() => statOpen(0));
  check('새 팝업(yg)이 뜸', await L.waitTrue(page, () => document.querySelector('.yg-sh') && document.querySelector('.yg-sh').textContent.length > 20, null, 3000));
  check('예전 밝은 시트(yc)는 안 뜸', await page.evaluate(() => !document.querySelector('.yc-ov')));
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.yg-sh')).backgroundImage + '|' + getComputedStyle(document.querySelector('.yg-sh')).backdropFilter);
  check('어두운 유리 배경 + 블러', /gradient/.test(bg) && /blur/.test(bg), bg);
  await sleep(400); await page.screenshot({ path: '/tmp/shot-stats.png' });
  const det = await page.evaluate(() => ({ tiles: document.querySelectorAll('.yg-tiles').length, tl: document.querySelectorAll('.yg-tl li').length, back: document.querySelector('.yg-back').hidden }));
  check('곡 보기: 바로 자세히(타일 + 두 번 부른 기록 2줄)', det.tiles >= 1 && det.tl === 2 && det.back, det);
  await sleep(300); await page.screenshot({ path: '/tmp/shot-song.png' });
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(() => { SS.view = 'team'; renderTabs && renderTabs(); loadStats && loadStats(); });
  await L.waitTrue(page, () => document.querySelector('.srow'), null, 5000);
  const hasTeam = await page.evaluate(() => { const r = SS.rows.findIndex((x) => x.name === '테스트'); if (r >= 0) statOpen(r); return r; });
  if (hasTeam >= 0) {
    check('팀 → 곡 목록 팝업', await L.waitTrue(page, () => document.querySelectorAll('.yg-row').length >= 1, null, 3000), await page.evaluate(() => document.querySelector('#yg-title') && document.querySelector('#yg-title').textContent));
    await page.click('.yg-row');
    check('곡을 누르면 같은 팝업에서 자세히 + 뒤로 버튼', await L.waitTrue(page, () => document.querySelector('.yg-tiles') && !document.querySelector('.yg-back').hidden, null, 3000));
    await page.click('.yg-back'); check('뒤로 → 목록', await L.waitTrue(page, () => document.querySelector('.yg-rows') && document.querySelector('.yg-back').hidden));
  } else console.log('  (팀 "테스트" 행 없음 — 목록 단계 생략)', await page.evaluate(() => SS.rows.map((x) => x.name)));
  await page.keyboard.press('Escape');
  check('Esc 로 닫힘', await L.waitTrue(page, () => !document.querySelector('.yg-ov'), null, 2000));
  check('닫은 뒤 스크롤 잠금 해제', await page.evaluate(() => document.body.style.overflow !== 'hidden'));
  check('브라우저 오류 없음', errs.length === 0, errs.slice(0, 5));
  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error('시험 중단:', e); process.exit(2); });
