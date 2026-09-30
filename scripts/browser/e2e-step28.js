/** Step 2.8 브라우저 시험 — 허브: 링크 자동걸기 · 악보 저장소(쪽 자르기 · 검색 · 미리보기 · 콘티에 넣기) · 가사 도구 · 방송 화면 */
process.env.PORT = '4189';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-full-server.js');
const { mkpdf, SAMPLE } = require('./mkpdf');
const BASE = 'http://127.0.0.1:4189', KEY = 'ADM', DATE = '2026-10-04', SAT = '2026-10-03';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const fake = global.__fake;
(async () => {
  await sleep(1200);
  const dataUrl = 'data:application/pdf;base64,' + mkpdf(SAMPLE).toString('base64');
  run((api) => api.saveWorshipSongs(KEY, DATE, '콘티', [
    { title: 'Amazing Grace', team: '테스트', key: 'G', bpm: '120', form: 'V1-C', link: '', note: '', solo: [] },
    { title: 'Second Song', team: '테스트', key: 'D', bpm: '90', form: 'V1-C', link: '', note: '', solo: [] }]));
  run((api) => api.uploadWorshipSheet(KEY, DATE, 'Amazing Grace.pdf', dataUrl, '콘티'));

  // 드라이브 녹음 폴더 (하위 폴더 포함)
  const root = fake.addFolder('녹음', ''), sub = fake.addFolder('10월 4일', root.id);
  const mk = (name, parent, created, mime) => fake.addFile({ name, parent, created, mimeType: mime || 'audio/mpeg', bytes: 'aa' });
  mk('토요연습_전체.MP3 ', root.id, SAT + 'T15:00:00Z'); mk('찬양연습.m4a', sub.id, SAT + 'T18:00:00Z', 'audio/x-m4a');
  mk('주일예배(1).wav', sub.id, DATE + 'T15:30:00Z', 'audio/wav'); mk('평일.mp3', root.id, '2026-10-01T15:00:00Z');
  run((api) => api.설정저장_('찬양음원폴더', root.id));

  const br = await L.launch(); const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(BASE + '/?page=worship&key=' + KEY);
  check('허브가 열림', await L.waitTrue(page, () => window.W && window.D && document.querySelector('#lyHost'), null, 10000));

  console.log('· 문구 · 배치');
  check('"세션 / 연습 시작" 버튼 (연습 모드 문구 없음)', await page.evaluate(() => /라이브 악보 시작/.test(document.body.innerText) && !/연습 모드/.test(document.body.innerText)));
  check('가사 패널이 페이지 맨 아래 (방송팀 요청 · 녹음 · 결단찬양보다 뒤) — Step 2.15', await page.evaluate(() => { const ly = document.querySelector('#lyPanel'), md = document.querySelector('.mdbox'); const ps = Array.from(document.querySelectorAll('#body > .panel, #body > .mdbox')); return !!ly && ps[ps.length - 1] === ly && (!md || !!(md.compareDocumentPosition(ly) & Node.DOCUMENT_POSITION_FOLLOWING)); }));

  console.log('· 링크 자동걸기');
  check('링크 자동걸기 버튼', await page.evaluate(() => !!document.querySelector('#autoBtn') && /링크 자동걸기/.test(document.querySelector('#autoBtn').textContent)));
  await page.click('#autoBtn');
  check('결과 보고에 3개 링크 (토 2 · 일 1)', await L.waitTrue(page, () => document.querySelectorAll('#autoRep .autolist li').length === 3, null, 15000), await page.evaluate(() => document.querySelector('#autoRep') && document.querySelector('#autoRep').innerText));
  check('  분류 표시: 토요일 연습 2 · 주일 예배 1', await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#autoRep .rkind')).map((x) => x.textContent).sort(); return t.join() === '주일 예배,토요일 연습,토요일 연습'; }));
  check('  링크된 녹음이 목록에 바로 나타남 (재생기 3개)', await L.waitTrue(page, () => document.querySelectorAll('.rec audio').length === 3, null, 5000), await page.evaluate(() => document.querySelectorAll('.rec audio').length));
  check('  재생기 주소는 /audio/<파일ID>', await page.evaluate(() => Array.from(document.querySelectorAll('.rec audio')).every((a) => /^\/audio\/[A-Za-z0-9_-]{10,}$/.test(a.getAttribute('src')))));
  check('  평일 파일은 제외됨 (보고에 표시)', await page.evaluate(() => /토 · 일이 아닌 날 1/.test(document.querySelector('#autoRep').innerText)));
  await page.click('#autoBtn');
  check('다시 누르면 새로 걸리는 것 없음 · 중복 안내', await L.waitTrue(page, () => /이미 링크된 녹음 3개/.test((document.querySelector('#autoRep') || {}).innerText || ''), null, 15000), await page.evaluate(() => document.querySelector('#autoRep').innerText));
  check('  목록은 여전히 3개', await page.evaluate(() => document.querySelectorAll('.rec audio').length === 3));
  // 오류: 폴더가 없어짐
  run((api) => api.설정저장_('찬양음원폴더', 'zzzzzzzzzzzzzzzz'));
  await page.click('#autoBtn');
  check('폴더를 못 열면 알아듣기 쉬운 오류 (화면이 멈추지 않음)', await L.waitTrue(page, () => /녹음 폴더를 열 수 없습니다/.test((document.querySelector('#autoRep') || {}).innerText || '') && !document.querySelector('#autoBtn').disabled, null, 15000), await page.evaluate(() => document.querySelector('#autoRep').innerText));
  run((api) => api.설정저장_('찬양음원폴더', root.id));
  await page.screenshot({ path: '/tmp/shot-autolink.png' });

  console.log('· 악보 자르기 → 저장소');
  await page.click('.repobar >> nth=0').catch(() => {});
  await page.evaluate(() => document.querySelector('.repobar').scrollIntoView());
  await page.click('button:has-text("쪽 잘라 저장소에 저장") >> nth=0');
  check('자르기 창이 열림', await L.waitTrue(page, () => !!document.querySelector('.ht-clip'), null, 4000));
  await page.selectOption('.ht-clip [data-r="src"]', { index: 1 });
  check('쪽 미리보기 3개', await L.waitTrue(page, () => document.querySelectorAll('.ht-clip .ht-th').length === 3, null, 8000));
  check('  미리보기 그림이 그려짐', await L.waitTrue(page, () => { const c = document.querySelector('.ht-clip .ht-th canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) n++; return n > 20; }, null, 8000));
  check('  제목이 파일 이름으로 채워짐', await page.evaluate(() => document.querySelector('.ht-clip [data-r="title"]').value === 'Amazing Grace'));
  check('  쪽을 고르기 전에는 저장 버튼이 꺼져 있음', await page.evaluate(() => document.querySelector('.ht-clip [data-r="save"]').disabled));
  await page.fill('.ht-clip [data-r="range"]', '2-3');
  check('  "2-3" 입력 → 2 · 3쪽이 선택됨', await page.evaluate(() => Array.from(document.querySelectorAll('.ht-clip .ht-th.on')).map((b) => b.dataset.p).join() === '2,3' && /2-3 \(2쪽\)/.test(document.querySelector('.ht-clip [data-r="selinfo"]').textContent)));
  await page.fill('.ht-clip [data-r="range"]', '2-9');
  check('  범위를 넘으면 안내', await page.evaluate(() => /안에서 골라주세요/.test(document.querySelector('.ht-clip .ht-msg').textContent)));
  await page.click('.ht-clip .ht-th >> nth=0'); await page.click('.ht-clip .ht-th >> nth=0');   // 1쪽 눌렀다 떼기 → 범위 칸 다시 맞춤
  await page.fill('.ht-clip [data-r="range"]', '2-3');
  await page.fill('.ht-clip [data-r="title"]', '어메이징 그레이스'); await page.fill('.ht-clip [data-r="leader"]', '김인도'); await page.fill('.ht-clip [data-r="note"]', '2~3쪽');
  await page.click('.ht-clip [data-r="save"]');
  check('저장 성공 메시지', await L.waitTrue(page, () => /저장했습니다 — "어메이징 그레이스" \(2쪽\)/.test(document.querySelector('.ht-clip .ht-msg').textContent), null, 12000), await page.evaluate(() => document.querySelector('.ht-clip .ht-msg').textContent));
  const repo = run((api) => api.worshipRepoList(KEY, ''));
  check('서버 저장소에 제목 · 날짜 · 인도자와 함께 보관됨', repo.total === 1 && repo.items[0].title === '어메이징 그레이스' && repo.items[0].leader === '김인도' && repo.items[0].pages === 2 && /^\d{4}-\d{2}-\d{2}$/.test(repo.items[0].date), repo);
  { const PL = require('/tmp/pl/package/dist/pdf-lib.min.js'); const f = fake.files.get(repo.items[0].fileId);
    const d = await PL.PDFDocument.load(f.bytes);
    check('  저장된 PDF 는 진짜 2쪽짜리 (2 · 3쪽만 잘림)', d.getPageCount() === 2, d.getPageCount()); }
  await page.click('.ht-clip [data-r="cancel"]');
  check('  닫으면 창이 사라짐', await page.evaluate(() => !document.querySelector('.ht-clip')));

  console.log('· 저장소 검색 · 미리보기 · 콘티에 넣기');
  const sheetsBefore = await page.evaluate(() => W.sheets.length);
  await page.click('button:has-text("저장소에서 찾기") >> nth=0');
  check('저장소 창 · 목록에 1개', await L.waitTrue(page, () => document.querySelectorAll('.ht-repo .ht-item').length === 1, null, 6000));
  await page.fill('.ht-repo [data-r="q"]', '없는곡xyz');
  check('  검색 결과 없음 안내', await L.waitTrue(page, () => /맞는 악보가 없습니다/.test(document.querySelector('.ht-repo [data-r="list"]').textContent), null, 4000));
  await page.fill('.ht-repo [data-r="q"]', '김인도 어메이징');
  check('  인도자 + 제목으로 검색됨', await L.waitTrue(page, () => document.querySelectorAll('.ht-repo .ht-item').length === 1, null, 4000));
  await page.click('.ht-repo [data-view]');
  check('  누르면 미리보기가 그려지고 2쪽 표시', await L.waitTrue(page, () => { const c = document.querySelector('.ht-repo [data-r="cv"]'); if (!c || c.width < 100) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) n++; return n > 50 && /1 \/ 2/.test(document.querySelector('.ht-repo [data-r="pn"]').textContent); }, null, 8000));
  await page.click('.ht-repo [data-r="pnx"]');
  check('  다음 쪽으로 넘어감 (2 / 2)', await L.waitTrue(page, () => /2 \/ 2/.test(document.querySelector('.ht-repo [data-r="pn"]').textContent), null, 4000));
  check('  고르기 전에는 넣기 버튼이 꺼져 있음', await page.evaluate(() => document.querySelector('.ht-repo [data-r="add"]').disabled));
  await page.check('.ht-repo [data-pick]');
  check('  고르면 "선택한 악보 1개" · 버튼 켜짐', await page.evaluate(() => /1개/.test(document.querySelector('.ht-repo [data-r="cnt"]').textContent) && !document.querySelector('.ht-repo [data-r="add"]').disabled));
  await page.click('.ht-repo [data-r="add"]');
  check('  콘티 악보 목록에 곧바로 추가됨', await L.waitTrue(page, (n) => window.W.sheets.length === n + 1 && !document.querySelector('.ht-repo'), sheetsBefore, 8000), await page.evaluate(() => ({ n: W.sheets.length, m: (document.querySelector('.ht-repo .ht-msg') || {}).textContent })));
  check('  화면의 악보 줄에 "어메이징 그레이스.pdf"', await page.evaluate(() => /어메이징 그레이스\.pdf/.test(document.body.innerText)));
  await page.click('button:has-text("저장소에서 찾기") >> nth=0'); await L.waitTrue(page, () => document.querySelectorAll('.ht-repo .ht-item').length === 1, null, 5000);
  await page.check('.ht-repo [data-pick]'); await page.click('.ht-repo [data-r="add"]');
  check('  같은 악보를 또 넣으면 중복 안내(추가 안 됨)', await L.waitTrue(page, () => /새로 넣은 악보가 없습니다|이미 걸려/.test((document.querySelector('.ht-repo .ht-msg') || {}).textContent || ''), null, 6000));
  await page.keyboard.press('Escape');
  check('  Esc 로 닫힘', await L.waitTrue(page, () => !document.querySelector('.ht-repo'), null, 3000));
  const slid = await page.evaluate(() => W.sheets.filter((s) => /어메이징 그레이스/.test(s.name)).length);
  check('  콘티 악보에 그 파일이 한 번만 걸려 있음', slid === 1, slid);

  console.log('· 가사 도구');
  await page.evaluate(() => document.querySelector('#lyPanel').scrollIntoView());
  check('가사 패널이 그려짐 (곡 목록 · 3가지 방법)', await page.evaluate(() => document.querySelectorAll('#lyHost [data-l="song"] option').length === 3 && document.querySelectorAll('#lyHost [data-src]').length === 3));
  await page.selectOption('#lyHost [data-l="song"]', '0');
  check('  곡을 고르면 제목이 채워지고 그 악보가 자동 선택됨', await page.evaluate(() => document.querySelector('#lyHost [data-l="title"]').value === 'Amazing Grace' && /Amazing Grace/.test(document.querySelector('#lyHost [data-l="sheet"]').selectedOptions[0].textContent)));
  await page.click('#lyHost [data-l="extract"]');
  check('  악보 PDF 에서 가사 뽑기 (코드 줄은 빠짐)', await L.waitTrue(page, () => /Amazing grace how sweet the sound/.test(document.querySelector('#lyHost [data-l="text"]').value), null, 10000), await page.evaluate(() => document.querySelector('#lyHost [data-l="text"]').value));
  check('    코드 줄이 없고 [Verse 1] 표시가 있음', await page.evaluate(() => { const t = document.querySelector('#lyHost [data-l="text"]').value; return !/D\/F#/.test(t) && /\[Verse 1\]/.test(t); }));
  await page.evaluate(() => { const c = document.querySelector('#lyHost [data-l="chords"]'); c.click(); });
  await page.click('#lyHost [data-l="extract"]'); await sleep(800);
  { const t2 = await page.evaluate(() => document.querySelector('#lyHost [data-l="text"]').value);
    check('    "코드 포함"을 켜면 코드 줄이 들어감', /D\/F#/.test(t2) && /Em7/.test(t2), t2); }
  await page.evaluate(() => { const c = document.querySelector('#lyHost [data-l="chords"]'); c.click(); });
  await page.fill('#lyHost [data-l="range"]', '2-3'); await page.click('#lyHost [data-l="extract"]');
  check('    쪽 범위(2-3)만 뽑기: 2 · 3쪽 가사만', await L.waitTrue(page, () => { const v = document.querySelector('#lyHost [data-l="text"]').value; return /Twas grace/.test(v) && !/Amazing grace how sweet/.test(v); }, null, 6000));
  await page.fill('#lyHost [data-l="range"]', ''); await page.click('#lyHost [data-l="extract"]');
  check('    범위를 비우면 전체 쪽 (1~3쪽 가사 모두)', await L.waitTrue(page, () => /Amazing grace/.test(document.querySelector('#lyHost [data-l="text"]').value) && /Praise the Lord/.test(document.querySelector('#lyHost [data-l="text"]').value), null, 6000));
  await page.fill('#lyHost [data-l="range"]', '9'); await page.click('#lyHost [data-l="extract"]');
  check('    범위를 벗어나면 안내', await L.waitTrue(page, () => /안에서 골라주세요/.test(document.querySelector('#lyHost .ht-msg').textContent), null, 5000));
  await page.fill('#lyHost [data-l="range"]', '');
  { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }).catch(() => null), page.click('#lyHost [data-l="txt"]')]);
    check('    .txt 저장 (다운로드)', !!dl && /\.txt$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename()); }
  await page.click('#lyHost [data-src="web"]');
  check('  "웹에서 찾기": 검색 링크 (앱이 대신 가져오지 않음)', await page.evaluate(() => { const a = document.querySelectorAll('#lyHost [data-l="links"] a'); return a.length >= 2 && Array.from(a).every((x) => /^https:\/\//.test(x.href) && x.target === '_blank' && /noopener/.test(x.rel)) && /저작권/.test(document.querySelector('#lyHost .ht-src').innerText); }));
  await page.click('#lyHost [data-src="paste"]');
  await page.fill('#lyHost [data-l="paste"]', 'Second Song\n공유\n1절\nG    D\n둘째 곡의 첫 줄\n둘째 곡의 둘째 줄\n\n후렴\n할렐루야 [G] 아멘\n© 2020 Someone\nhttps://x.y/z');
  await page.selectOption('#lyHost [data-l="song"]', '1');
  await page.fill('#lyHost [data-l="paste"]', 'Second Song\n공유\n1절\nG    D\n둘째 곡의 첫 줄\n둘째 곡의 둘째 줄\n\n후렴\n할렐루야 [G] 아멘\n© 2020 Someone\nhttps://x.y/z');
  await page.click('#lyHost [data-l="clean"]');
  const cleaned = await page.evaluate(() => document.querySelector('#lyHost [data-l="text"]').value);
  check('  붙여넣어 정리: 코드 · 저작권 · 주소 제거, 절 표시 정리', /\[Verse 1\]\n둘째 곡의 첫 줄\n둘째 곡의 둘째 줄/.test(cleaned) && /\[Chorus\]\n할렐루야\s+아멘/.test(cleaned) && !/©|https|공유|G {2,}D/.test(cleaned), cleaned);
  await page.click('#lyHost [data-l="save"]');
  check('  저장 → 서버에 곡별로 보관됨', await L.waitTrue(page, () => /저장했습니다/.test(document.querySelector('#lyHost .ht-msg').textContent), null, 6000));
  check('    "✓ 저장됨" 표시', await L.waitTrue(page, () => /✓ 저장됨/.test(document.querySelector('#lyHost [data-l="stat"]').textContent), null, 3000));
  const lyr = run((api) => api.worshipLyricsList(KEY));
  check('    서버 보관본에 둘째 곡 가사', !!lyr.secondsong && /할렐루야/.test(lyr.secondsong.text), Object.keys(lyr));
  // 다시 그려도(다른 곳에서 apply) 입력 중인 내용 유지
  await page.evaluate(() => { window.render(); });
  check('  화면을 다시 그려도 가사 작업 내용이 유지됨', await page.evaluate(() => /할렐루야/.test(document.querySelector('#lyHost [data-l="text"]').value) && document.querySelector('#lyHost [data-l="title"]').value === 'Second Song'));
  await page.selectOption('#lyHost [data-l="song"]', '0');
  check('  저장된 곡을 다시 고르면 저장된 가사를 불러옴 / 없는 곡은 빈칸', await page.evaluate(() => document.querySelector('#lyHost [data-l="text"]').value === ''));
  await page.selectOption('#lyHost [data-l="song"]', '1');
  check('  둘째 곡을 고르면 보관된 가사가 자동으로 나옴', await L.waitTrue(page, () => /할렐루야/.test(document.querySelector('#lyHost [data-l="text"]').value), null, 3000));

  console.log('· 방송 화면');
  await page.click('#lyHost [data-l="show"]');
  check('방송 화면이 전체를 덮음 (검은 배경)', await L.waitTrue(page, () => { const b = document.querySelector('.ht-bc'); return b && b.getBoundingClientRect().width === innerWidth && getComputedStyle(b).backgroundColor === 'rgb(0, 0, 0)'; }, null, 3000));
  check('  첫 슬라이드: 절 이름 + 가사, 글씨가 큼', await page.evaluate(() => /Verse 1/.test(document.querySelector('.ht-bclabel').textContent) && /둘째 곡의 첫 줄/.test(document.querySelector('.ht-bctext').textContent) && parseFloat(document.querySelector('.ht-bctext').style.fontSize) >= 30), await page.evaluate(() => ({ l: document.querySelector('.ht-bclabel').textContent, t: document.querySelector('.ht-bctext').textContent, f: document.querySelector('.ht-bctext').style.fontSize, p: document.querySelector('[data-b="pos"]').textContent, ta: document.querySelector('#lyHost [data-l="text"]').value })));
  check('  슬라이드 번호 1 / 2', await page.evaluate(() => /1 \/ 2/.test(document.querySelector('[data-b="pos"]').textContent)));
  await page.keyboard.press('ArrowRight');
  check('  → 키로 다음 슬라이드 (Chorus)', await page.evaluate(() => /Chorus/.test(document.querySelector('.ht-bclabel').textContent) && /2 \/ 2/.test(document.querySelector('[data-b="pos"]').textContent)));
  await page.keyboard.press('b');
  check('  B 키: 검은 화면', await page.evaluate(() => document.querySelector('.ht-bc').classList.contains('black') && getComputedStyle(document.querySelector('.ht-bcstage')).visibility === 'hidden'));
  await page.keyboard.press('b'); await page.keyboard.press('ArrowLeft');
  check('  ← 키로 이전 · 뒤로', await page.evaluate(() => /1 \/ 2/.test(document.querySelector('[data-b="pos"]').textContent)));
  await page.selectOption('.ht-bc [data-b="max"]', '2');
  await page.keyboard.press('+');
  check('  줄 수 · 글씨 크기 조절이 반영됨', await page.evaluate(() => parseFloat(document.querySelector('.ht-bctext').style.fontSize) > 30));
  await page.screenshot({ path: '/tmp/shot-broadcast.png' });
  await page.keyboard.press('Escape');
  check('  Esc 로 닫힘 (원래 화면으로)', await L.waitTrue(page, () => !document.querySelector('.ht-bc') && !document.body.classList.contains('ht-lock'), null, 3000));
  await page.click('#lyHost [data-l="showall"]');
  check('  "전체 곡 연속": 가사가 저장된 곡만 이어서 (저장 안 된 곡은 빠짐)', await L.waitTrue(page, () => document.querySelector('.ht-bc') && /Second Song/.test(document.querySelector('.ht-bct').textContent), null, 3000));
  await page.keyboard.press('Escape');
  await page.screenshot({ path: '/tmp/shot-lyrics.png' });

  check('오류 없음', errs.length === 0, errs);
  await br.close(); process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
