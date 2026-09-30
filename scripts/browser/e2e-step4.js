/** Step 4 화면 시험 — 진짜 server.js + 가짜 구글 + 진짜 크롬 (내 설교 노트 페이지) */
process.env.PORT = '4194';
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:4194';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const E = () => global.__E2E;
const SHOT = process.env.SHOT_DIR || '/tmp/claude-0/-home-claude/e5bbcb51-1505-58eb-84f5-d23183b95ba5/scratchpad';

(async () => {
  await sleep(1200);
  const tok = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const tokB = run((api) => api.포털토큰_('최셀장', '4165551006', ''));
  const br = await L.launch();
  const mk = async (vp, o) => {
    const ctx = await br.newContext(Object.assign({ viewport: vp || { width: 390, height: 780 }, timezoneId: 'America/Toronto', locale: 'ko-KR', hasTouch: !!(vp && vp.touch) }, o || {}));
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    const calls = { save: 0, init: 0, refine: 0, link: 0 }; const saveBodies = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/\/api\/sermonNoteSave/.test(u)) { calls.save++; try { saveBodies.push(JSON.parse(r.postData()).args); } catch (e) {} }
      if (/\/api\/sermonNotesInit/.test(u)) calls.init++;
      if (/\/api\/sermonNoteRefine/.test(u)) calls.refine++;
      if (/\/api\/sermonNoteLink/.test(u)) calls.link++;
    });
    return { ctx, page, errs, calls, saveBodies };
  };
  const url = (t, q) => BASE + '/?page=notes&t=' + encodeURIComponent(t) + (q || '');
  const pillText = (page) => page.evaluate(() => { const p = document.querySelector('.yn-pill'); return p ? p.textContent : null; });

  console.log('· 처음 열기 (목록이 비어 있음)');
  let { ctx, page, errs, calls, saveBodies } = await mk();
  await page.goto(url(tok));
  check('노트 페이지가 열림', await L.waitTrue(page, () => !!document.querySelector('#fab'), null, 8000));
  check('노트가 없다는 안내', await L.waitTrue(page, () => /아직 (설교 )?노트가 없어요/.test(document.getElementById('cards').textContent), null, 5000));
  await page.screenshot({ path: SHOT + '/notes-list-empty.png' });

  console.log('· 새 노트 — 지금 주일의 주보로 미리 채움');
  await page.click('#fab');
  check('편집 화면으로 넘어감', await L.waitTrue(page, () => document.getElementById('page').getAttribute('data-view') === 'edit' && !!document.getElementById('ynTitle'), null, 4000));
  const vals = await page.evaluate(() => ({ d: ynDate.value, t: ynTitle.value, r: ynRef.value, p: ynPre.value }));
  check('날짜 = 가장 가까운 주일', vals.d === E().SUN, vals);
  check('제목 미리 채움', vals.t === '베드로 (1) 부르시는 주님', vals);
  check('성경 본문 미리 채움', vals.r === '누가복음 5:1-11', vals);
  check('설교자 미리 채움', vals.p === '강산 목사', vals);
  await sleep(1500);
  check('아무것도 안 쓰면 서버에 노트를 만들지 않음', calls.save === 0, calls.save);
  await page.screenshot({ path: SHOT + '/notes-editor-new.png' });

  console.log('· 입력 (디바운스 1초)');
  await page.click('#ynTaBody');
  const t0 = Date.now();
  for (let i = 0; i < 12; i++) { await page.keyboard.type('은혜 ' + i + ' ', { delay: 30 }); await sleep(120); }   // ~2초 동안 계속 입력
  check('계속 입력하는 동안 서버 저장 호출 0번 (마지막 입력 후 1초 전)', calls.save === 0, calls.save);
  check('저장 대기 표시(수정됨)', /수정됨/.test(await pillText(page)), await pillText(page));
  await sleep(1300);
  check('입력을 멈춘 뒤 1번만 저장', calls.save === 1, calls.save);
  check('“저장 완료” 표시', await L.waitTrue(page, () => /저장 완료|저장됨/.test(document.querySelector('.yn-pill').textContent), null, 3000), await pillText(page));
  check('저장 내용이 주보 정보와 함께', saveBodies[0] && saveBodies[0][1].title === '베드로 (1) 부르시는 주님' && /은혜 11/.test(saveBodies[0][1].body), saveBodies[0] && saveBodies[0][1]);
  check('목록에 카드가 생김', await page.evaluate(() => document.querySelectorAll('#cards .yn-card').length === 1));


  const NB = require('../../lib/notes-buffer');
  const noteId = () => page.evaluate(() => (window.__ynId = null, document.querySelector('#cards .yn-card') && document.querySelector('#cards .yn-card').getAttribute('data-id')));
  const ta = () => page.locator('#ynTaBody');

  console.log('· 서버 버퍼 → 시트 (몇 초 뒤 한 번에 저장)');
  const id1 = await noteId();
  check('서버 버퍼에 잠시 보관됨', NB.dirtyCount() >= 0);
  await sleep(4600);
  check('몇 초 뒤 시트에 기록됨(버퍼 비워짐)', NB.dirtyCount() === 0, NB.dirtyCount());
  const inSheet = run((api) => api.노트시트에서_(id1));
  check('시트에 필기가 실제로 있음', !!inSheet && /은혜 11/.test(inSheet.body) && inSheet.owner === '정일반', inSheet && inSheet.owner);

  console.log('· 목록으로 돌아가 다시 열기');
  await page.click('#back');
  check('목록 화면', await L.waitTrue(page, () => document.getElementById('page').getAttribute('data-view') === 'list', null, 3000));
  await page.reload();
  check('새로고침 뒤 목록에 카드', await L.waitTrue(page, () => document.querySelectorAll('#cards .yn-card').length === 1, null, 6000));
  await page.click('#cards .yn-card');
  check('내용이 그대로 열림', await L.waitTrue(page, () => document.getElementById('ynTaBody') && /은혜 11/.test(document.getElementById('ynTaBody').value) && document.getElementById('ynTitle').value === '베드로 (1) 부르시는 주님', null, 5000));
  check('열기만 해서는 서버에 저장하지 않음', calls.save === 1, calls.save);

  console.log('· 목록 이어쓰기 (- 로 시작 → Enter)');
  await ta().click(); await page.keyboard.press('Control+End');
  await page.keyboard.type('\n\n- 첫째 은혜');
  await page.keyboard.press('Enter');
  check('Enter 로 “- ” 이어짐', (await ta().inputValue()).endsWith('- 첫째 은혜\n- '), (await ta().inputValue()).slice(-20));
  await page.keyboard.type('둘째'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  check('빈 항목에서 Enter 하면 목록이 끝남', (await ta().inputValue()).endsWith('- 둘째\n'), JSON.stringify((await ta().inputValue()).slice(-14)));
  await page.keyboard.press('Control+z');
  check('브라우저 실행 취소(Ctrl+Z)가 자연스럽게 동작', (await ta().inputValue()).endsWith('- 둘째\n- '), JSON.stringify((await ta().inputValue()).slice(-14)));

  console.log('· 한글 조합(IME) 중에는 글이 흐트러지지 않음');
  const cdp = await ctx.newCDPSession(page);
  await page.keyboard.press('Control+End');
  const before = await ta().inputValue();
  await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '하나', selectionStart: 2, selectionEnd: 2 });
  check('조합 중인 글자가 그대로 보임', (await ta().inputValue()) === before + '하나', (await ta().inputValue()).slice(-8));
  await cdp.send('Input.insertText', { text: '하나님' });
  check('조합이 끝나면 확정된 글자만 남음', (await ta().inputValue()) === before + '하나님', (await ta().inputValue()).slice(-8));
  await sleep(1300);
  check('한글 입력도 저장됨', saveBodies.length >= 2 && /하나님$/.test(saveBodies[saveBodies.length - 1][1].body), saveBodies.length);

  console.log('· 입력이 밀리지 않는지 — 2만 5천 자 글에서 글자 하나마다 걸리는 시간');
  const perf = await page.evaluate(() => {
    const t = document.getElementById('ynTaBody'); t.value = '가나다라마바사 '.repeat(3500);
    t.dispatchEvent(new Event('input', { bubbles: true }));
    const N = 1500, t0 = performance.now();
    for (let i = 0; i < N; i++) { t.value += '한'; t.dispatchEvent(new Event('input', { bubbles: true })); }
    return { avg: (performance.now() - t0) / N, len: t.value.length };
  });
  check('글자 하나 처리 평균 1ms 미만 (' + perf.avg.toFixed(3) + 'ms, ' + perf.len + '자)', perf.avg < 1, perf);
  await sleep(1400);
  check('그 사이 서버 호출은 마지막에 한 번 (계속 입력 중엔 저장 안 함)', calls.save <= saveBodies.length && calls.save - 2 <= 1, calls.save);


  console.log('· AI 문장 정제 (서버를 멈추지 않는 비동기 경로)');
  await page.evaluate(() => { const t = document.getElementById('ynTaBody'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(1300);
  await page.click('#back'); await page.click('#fab');
  await L.waitTrue(page, () => !!document.getElementById('ynTitle') && document.activeElement && document.activeElement.id === 'ynTaBody', null, 3000);
  const aiBtn = page.locator('.yn-tb.ai');
  check('AI 버튼이 켜져 있음', !(await aiBtn.isDisabled()));
  await ta().fill('예수님이 ㅇㅇ 하십니다   \n- 첫째: 사랑      \n- 둘째: 순종');
  await page.click('#ynTaBody');
  await aiBtn.click(); await page.click('.yn-pop button[data-m=polish]');
  check('정제 결과 창이 뜸', await L.waitTrue(page, () => !!document.querySelector('.yn-sheet .yn-result'), null, 6000));
  const resTxt = await page.evaluate(() => document.querySelector('.yn-result').textContent);
  check('결과 내용 (다듬어짐)', /예수님이 아멘 하십니다/.test(resTxt) && !/ㅇㅇ/.test(resTxt), resTxt);
  check('원문은 아직 그대로 (미리 보기)', /ㅇㅇ/.test(await ta().inputValue()));
  await page.click('button[data-r=rep]');
  check('바꾸기 → 글이 바뀜', /아멘/.test(await ta().inputValue()) && !/ㅇㅇ/.test(await ta().inputValue()), await ta().inputValue());
  check('되돌리기 알림', await page.locator('.yn-toast button').count() === 1);
  await page.click('.yn-toast button');
  check('되돌리기 → 원문 복원', /ㅇㅇ/.test(await ta().inputValue()) && !/아멘/.test(await ta().inputValue()), await ta().inputValue());
  check('AI 서버 호출은 정확히 1번', calls.refine === 1, calls.refine);
  check('프롬프트에 노트가 구분자로 감싸짐(주입 방어)', /<노트>\n예수님이 ㅇㅇ/.test(global.__AI.last), global.__AI.last.slice(0, 200));

  console.log('· AI 가 일하는 동안에도 계속 쓸 수 있음 · 그 사이 글이 바뀌면 덮어쓰지 않음');
  await sleep(4200);                                            // 서버의 4초 간격 제한 지나기
  global.__AI.delay = 1800;
  await page.click('#ynTaBody'); await page.keyboard.press('Control+a');
  await aiBtn.click(); await page.click('.yn-pop button[data-m=structure]');
  check('정리 중 표시', await L.waitTrue(page, () => document.querySelector('.yn-tb.ai').classList.contains('busy'), null, 1500));
  await page.click('#ynTaBody'); await page.keyboard.press('Control+End'); await page.keyboard.type(' 그동안 쓴 글');
  check('AI 가 일하는 중에도 입력이 그대로 됨', /그동안 쓴 글$/.test(await ta().inputValue()));
  await page.keyboard.press('Control+Home'); await page.keyboard.type('앞에도 ');
  check('결과가 오면 창이 뜸', await L.waitTrue(page, () => !!document.querySelector('.yn-sheet .yn-result'), null, 6000));
  await page.click('button[data-r=rep]');
  check('그 사이 글이 바뀌었으면 덮어쓰지 않고 아래에 붙임', /^앞에도 예수님이.*그동안 쓴 글\n\n## 핵심 요점/s.test(await ta().inputValue()), JSON.stringify(await ta().inputValue()));
  global.__AI.delay = 0;

  console.log('· AI 오류 · 사용 간격 제한');
  await sleep(4200);
  global.__AI.fail = 1;
  await ta().fill('오류가 나도 글은 그대로여야 합니다. 정말로요.');
  await aiBtn.click(); await page.click('.yn-pop button[data-m=polish]');
  check('AI 사용량 오류 안내', await L.waitTrue(page, () => /AI 사용량/.test(document.body.textContent), null, 5000));
  check('오류가 나도 글은 그대로', (await ta().inputValue()) === '오류가 나도 글은 그대로여야 합니다. 정말로요.');
  global.__AI.fail = 0;
  const twice = await page.evaluate((t) => new Promise((resolve) => {
    const call = () => new Promise((r) => callServer('sermonNoteRefine', [t, '연달아 누르는 경우를 시험합니다 정말로', 'polish', {}], (x) => r('ok'), (e) => r(e.message)));
    call().then((a) => call().then((b) => resolve([a, b])));
  }), tok);
  check('연달아 누르면 두 번째는 잠시 기다리라고 안내(서버 한도)', twice[1] === '방금 정제했습니다. 잠시 뒤에 다시 눌러주세요.', twice);

  console.log('· 인터넷이 끊겼다 돌아옴 — 글을 잃지 않음');
  await sleep(1500);
  const before2 = calls.save;
  await ctx.setOffline(true);
  await ta().fill('오프라인에서 쓴 글입니다');
  await sleep(1500);
  const pl = await pillText(page);
  check('저장 실패/오프라인 안내 (글쓰기는 막히지 않음)', /오프라인|저장 실패/.test(pl), pl);
  const nid = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf('ynN:') === 0));
  check('이 기기에 임시 보관됨(아직 못 보낸 것으로 표시)', await page.evaluate((k) => k.some((x) => { const d = JSON.parse(localStorage.getItem(x)); return d.dirty && /오프라인에서 쓴 글/.test(d.note.body); }), nid));
  await ta().press('End'); await page.keyboard.type(' — 계속');
  check('오프라인에서도 입력 가능', /계속$/.test(await ta().inputValue()));
  await ctx.setOffline(false);
  check('연결이 돌아오면 자동으로 저장됨', await L.waitTrue(page, () => /저장 완료|저장됨/.test(document.querySelector('.yn-pill').textContent), null, 8000), await pillText(page));
  check('서버에 최종 글이 도착', saveBodies.some((a) => /오프라인에서 쓴 글입니다 — 계속/.test(a[1].body)), saveBodies.length - before2);

  console.log('· 서버가 최근 저장을 잃은 경우 — 이 기기의 글로 복구');
  const idLost = await page.evaluate(() => document.querySelector('#cards .yn-card.sel') ? document.querySelector('#cards .yn-card.sel').getAttribute('data-id') : document.querySelector('#cards .yn-card').getAttribute('data-id'));
  await sleep(500);
  await page.click('#back');
  await page.evaluate((id) => { const k = 'ynN:' + id, d = JSON.parse(localStorage.getItem(k)); d.note.body = '서버가 잃은 최신 글'; d.ack = d.ack + 5; d.dirty = false; localStorage.setItem(k, JSON.stringify(d)); }, idLost);
  await page.reload();
  await L.waitTrue(page, () => document.querySelectorAll('#cards .yn-card').length >= 2, null, 6000);
  await page.click('#cards .yn-card[data-id="' + idLost + '"]');
  check('이 기기의 글로 열림', await L.waitTrue(page, () => document.getElementById('ynTaBody') && /서버가 잃은 최신 글/.test(document.getElementById('ynTaBody').value), null, 5000));
  check('서버에 다시 실림', await L.waitTrue(page, () => /저장 완료|저장됨/.test(document.querySelector('.yn-pill').textContent), null, 6000));
  const recovered = run((api) => api.sermonNoteGet(tok, idLost));
  check('서버 것이 복구됨', recovered.body === '서버가 잃은 최신 글', recovered.body);


  console.log('· 두 기기에서 같은 노트를 고침 — 충돌 안내와 “둘 다 보관”');
  await page.click('#back');
  const two = await mk();
  await two.page.goto(url(tok, '&id=' + idLost));
  check('둘째 기기에서 열림', await L.waitTrue(two.page, () => document.getElementById('ynTaBody') && /서버가 잃은 최신 글/.test(document.getElementById('ynTaBody').value), null, 6000));
  await two.page.locator('#ynTaBody').fill('둘째 기기에서 고친 글');
  check('둘째 기기 저장됨', await L.waitTrue(two.page, () => /저장 완료|저장됨/.test(document.querySelector('.yn-pill').textContent), null, 5000));
  await page.click('#cards .yn-card[data-id="' + idLost + '"]');
  await L.waitTrue(page, () => document.getElementById('ynTaBody') && /둘째 기기에서 고친 글|서버가 잃은/.test(document.getElementById('ynTaBody').value), null, 5000);
  // 첫째 기기는 예전 내용을 들고 있음 — 서버는 그 사이 둘째 기기가 바꿈
  const stale = page.locator('#ynTaBody');
  // 첫째 화면의 저장 기준 버전을 예전 것으로 되돌려 "다른 기기 편집을 못 본" 상황을 만듭니다
  await two.page.locator('#ynTaBody').fill('둘째 기기에서 한 번 더 고친 글');
  await L.waitTrue(two.page, () => /저장 완료|저장됨/.test(document.querySelector('.yn-pill').textContent), null, 5000);
  await stale.fill('첫째 기기에서 고친 글');
  check('충돌 창이 뜸', await L.waitTrue(page, () => !!document.querySelector('.yn-sheet button[data-c=both]'), null, 6000));
  check('알약이 충돌을 알림', /충돌/.test(await pillText(page)), await pillText(page));
  await sleep(500);
  await page.screenshot({ path: SHOT + '/notes-conflict.png' });
  await page.click('button[data-c=both]');
  check('다른 기기의 글로 바뀜', await L.waitTrue(page, () => document.getElementById('ynTaBody') && document.getElementById('ynTaBody').value === '둘째 기기에서 한 번 더 고친 글', null, 5000), await ta().inputValue());
  const listed = run((api) => api.sermonNotesInit(tok));
  const copy = listed.notes.filter((n) => /충돌 사본/.test(n.title))[0];
  check('내 글은 “충돌 사본” 노트로 보관됨', !!copy && copy.snippet === '첫째 기기에서 고친 글', copy);
  check('충돌 뒤 저장 상태 정상', await L.waitTrue(page, () => !/충돌/.test(document.querySelector('.yn-pill').textContent), null, 3000));
  await two.ctx.close();

  console.log('· 오늘의 묵상에 연결 · 묵상 화면에서 보기');
  await page.click('#back'); await page.click('#fab');
  await L.waitTrue(page, () => document.activeElement && document.activeElement.id === 'ynTaBody', null, 3000);
  await page.click('#ynLink');
  check('연결 메뉴에 오늘의 묵상이 보임', await L.waitTrue(page, () => /오늘의 묵상 · /.test(document.querySelector('.yn-pop') ? document.querySelector('.yn-pop').textContent : ''), null, 2000));
  await page.click('.yn-pop button[data-l=today]');
  check('글이 없으면 먼저 쓰라고 안내', await L.waitTrue(page, () => /내용을 조금 적으면/.test(document.body.textContent), null, 3000));
  await ta().fill('묵상에 연결할 설교 필기');
  await page.click('#ynLink'); await page.click('.yn-pop button[data-l=today]');
  check('연결됨 표시', await L.waitTrue(page, () => /묵상 연결됨/.test(document.getElementById('ynLink').textContent), null, 6000), await page.locator('#ynLink').textContent());
  const dn = run((api) => api.devotionNotes(tok, '', ''));
  check('서버에서 오늘의 묵상에 연결된 노트로 조회됨', dn.linked.length === 1 && dn.linked[0].bodyPreview === '묵상에 연결할 설교 필기' && dn.verse === '요한복음 3:16', dn);
  await ta().fill('연결 뒤에 계속 쓴 글');
  await L.waitTrue(page, () => /저장 완료|저장됨/.test(document.querySelector('.yn-pill').textContent), null, 4000);
  await sleep(300);
  check('계속 저장해도 연결이 풀리지 않음', run((api) => api.devotionNotes(tok, '', '')).linked.length === 1);
  const dev = await mk();
  await dev.page.goto(BASE + '/?page=devotion&t=' + encodeURIComponent(tok));
  check('묵상 화면에 “내 노트” 카드', await L.waitTrue(dev.page, () => /📝 내 노트/.test(document.body.textContent) && /연결한 노트가 없어요|연결 해제/.test(document.getElementById('dnBox').textContent), null, 8000));
  check('연결된 노트 내용이 묵상 화면에 보임', await dev.page.evaluate(() => /연결 뒤에 계속 쓴 글/.test(document.getElementById('dnBox').textContent)));
  await dev.page.screenshot({ path: SHOT + '/devotion-notes.png', fullPage: true });
  await dev.page.click('#dnBox button:has-text("연결 해제")');
  check('묵상 화면에서 연결 해제', await L.waitTrue(dev.page, () => /연결한 노트가 없어요/.test(document.getElementById('dnBox').textContent), null, 6000));
  await dev.page.click('#dnBox button:has-text("기존 노트 연결")');
  check('기존 노트 고르는 목록', await dev.page.locator('#dnBox .dn-pick button').count() >= 2);
  await dev.page.locator('#dnBox .dn-pick button').first().click();
  check('고르면 바로 연결됨', await L.waitTrue(dev.page, () => /연결 해제/.test(document.getElementById('dnBox').textContent), null, 6000));
  await dev.page.click('#dnBox a:has-text("이 묵상에 설교 노트 쓰기")');
  check('묵상에서 “새 설교 노트” → 노트 페이지가 새 노트로 열림(묵상 연결 예약)', await L.waitTrue(dev.page, () => /page=notes/.test(location.search) && !!document.getElementById('ynTitle'), null, 8000));
  const newLinked = await dev.page.evaluate(() => document.getElementById('ynLink').textContent);
  check('연결 예약된 새 노트', /오늘의 묵상에 연결/.test(newLinked), newLinked);
  await dev.page.locator('#ynTaBody').fill('묵상에서 만든 노트');
  check('첫 저장 뒤 자동으로 묵상에 연결', await L.waitTrue(dev.page, () => /묵상 연결됨/.test(document.getElementById('ynLink').textContent), null, 7000), await dev.page.locator('#ynLink').textContent());
  await dev.ctx.close();

  console.log('· 지우기 · 되돌리기');
  await page.goto(url(tok));
  await L.waitTrue(page, () => document.querySelectorAll('#cards .yn-card').length >= 3, null, 6000);
  const nBefore = await page.locator('#cards .yn-card').count();
  await page.locator('#cards .yn-card').first().click();
  await L.waitTrue(page, () => !!document.getElementById('ynTitle'), null, 4000);
  await page.click('#more'); await page.click('#menu button[data-m=del]');
  await page.click('.yn-sheet button[data-k=ok]');
  check('지우면 목록에서 사라짐', await L.waitTrue(page, (n) => document.querySelectorAll('#cards .yn-card').length === n - 1, nBefore, 5000));
  check('되돌리기 알림', await page.locator('.yn-toast button').count() === 1);
  await page.click('.yn-toast button');
  check('되돌리면 다시 나타남', await L.waitTrue(page, (n) => document.querySelectorAll('#cards .yn-card').length === n, nBefore, 5000));

  console.log('· 내 것만 보임 (다른 사람이 노트 번호를 알아도 열 수 없음)');
  const other = await mk();
  await other.page.goto(url(tokB, '&id=' + idLost));
  check('다른 사람은 열지 못함', await L.waitTrue(other.page, () => /노트를 열지 못했어요/.test(document.body.textContent), null, 6000));
  check('다른 사람 목록은 비어 있음', await other.page.evaluate(() => { document.getElementById('tolist').click(); return true; }) && await L.waitTrue(other.page, () => /아직 (설교 )?노트가 없어요/.test(document.getElementById('cards').textContent), null, 4000));
  await other.ctx.close();
  await page.close(); await ctx.close();

  console.log('· 태블릿/PC — 목록과 편집이 나란히');
  const wide = await mk({ width: 1280, height: 800 });
  await wide.page.goto(url(tok));
  check('목록이 보임', await L.waitTrue(wide.page, () => document.querySelectorAll('#cards .yn-card').length >= 3, null, 6000));
  check('안내 문구(노트를 고르세요)', await wide.page.evaluate(() => getComputedStyle(document.querySelector('.yn-noedit')).display !== 'none'));
  await wide.page.click('#cards .yn-card');
  check('편집 화면이 오른쪽에 나란히', await L.waitTrue(wide.page, () => { const l = document.querySelector('.yn-listcol').getBoundingClientRect(), e = document.getElementById('edHost').getBoundingClientRect(); return l.width > 300 && e.left >= l.right - 1 && e.width > 500; }, null, 4000));
  await wide.page.screenshot({ path: SHOT + '/notes-wide.png' });
  await wide.ctx.close();

  console.log('· 일요일 아침 — 오늘 주보로 미리 채움 (시계를 주일로)');
  const sun = await mk(null, { });
  await sun.page.clock.setFixedTime(new Date('2026-10-04T10:00:00-04:00'));
  await sun.page.goto(url(tok, '&new=1'));
  await L.waitTrue(sun.page, () => !!document.getElementById('ynTitle'), null, 6000);
  const sv = await sun.page.evaluate(() => ({ d: ynDate.value, t: ynTitle.value, r: ynRef.value, p: ynPre.value }));
  check('오늘(주일) 날짜 + 그날 주보 정보', sv.d === '2026-10-04' && sv.t === '주일 아침 말씀' && sv.r === '시편 23:1-6' && sv.p === '강산 목사', sv);
  await sun.page.fill('#ynDate', '2026-09-20');
  await sleep(400);
  check('날짜를 바꾸면(글 쓰기 전) 그 주일의 주보로 다시 채움', await L.waitTrue(sun.page, (d) => document.getElementById('ynTitle') && document.getElementById('ynTitle').value === '지난주 말씀', null, 3000), await sun.page.inputValue('#ynTitle'));
  await sun.page.fill('#ynTitle', '내가 고친 제목');
  await sun.page.fill('#ynDate', '2026-10-04'); await sleep(400);
  check('직접 고친 제목은 덮어쓰지 않음', (await sun.page.inputValue('#ynTitle')) === '내가 고친 제목');
  await sun.page.click('#ynFill');
  await L.waitTrue(sun.page, () => document.getElementById('ynTitle') && document.getElementById('ynTitle').value === '주일 아침 말씀', null, 3000);
  check('“주보에서 불러오기” 는 덮어쓰고 되돌리기 제공', (await sun.page.inputValue('#ynTitle')) === '주일 아침 말씀' && await sun.page.locator('.yn-toast button').count() === 1);
  await sun.ctx.close();


  console.log('· 주보를 보면서 바로 필기 (주보 화면의 필기 창)');
  const bl = await mk({ width: 390, height: 780 });
  await bl.page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, tok);
  await bl.page.goto(BASE + '/?page=bulletin');
  check('주보 화면에 “설교 필기” 단추', await L.waitTrue(bl.page, () => { const f = document.querySelector('.yn-dockfab'); return f && !f.hidden && f.getBoundingClientRect().width > 0; }, null, 8000));
  const bdate = await bl.page.evaluate(() => NotesDock._state.b.date);
  check('주보 정보가 이 기기에 저장됨(캐시)', await bl.page.evaluate((d) => { const c = JSON.parse(localStorage.getItem('ynBulMeta') || 'null'); return !!(c && c.metas[d] && c.metas[d].title); }, bdate));
  await bl.page.click('.yn-dockfab');
  check('필기 창이 열림 + 설교 정보 머리글', await L.waitTrue(bl.page, () => { const d = document.querySelector('.yn-dock'); return d && !d.hidden && !!d.querySelector('#ynTaBody') && d.querySelector('.yn-fixedmeta b'); }, null, 6000));
  await bl.page.screenshot({ path: SHOT + '/bulletin-dock.png' });
  await bl.page.locator('.yn-dock #ynTaBody').click();
  await bl.page.keyboard.type('주보 보면서 적는 필기', { delay: 20 });
  await sleep(1400);
  check('1초 뒤 한 번만 저장(주일 필기 live)', bl.calls.save === 1 && bl.saveBodies[0][1].source === 'live' && bl.saveBodies[0][1].date === bdate, [bl.calls.save, bl.saveBodies[0] && bl.saveBodies[0][1]]);
  check('저장 완료 표시', /저장 완료|저장됨/.test(await bl.page.evaluate(() => document.querySelector('.yn-dock .yn-pill').textContent)));
  const dateOpts = await bl.page.evaluate(() => Array.from(document.querySelectorAll('#vdate option')).map((o) => o.value));
  check('지난 주보가 여러 개', dateOpts.length >= 2, dateOpts);
  const otherDate = E().PREV;
  await bl.page.click('.yn-dock #ynDockX');
  await bl.page.selectOption('#vdate', otherDate);
  check('다른 주보를 보면 필기 창의 주보도 바뀜', await L.waitTrue(bl.page, (d) => window.NotesDock._state.b && window.NotesDock._state.b.date === d, otherDate, 6000));
  await bl.page.click('.yn-dockfab');
  check('그 주일의 필기는 비어 있음(주일마다 하나)', await L.waitTrue(bl.page, () => document.querySelector('.yn-dock #ynTaBody') && document.querySelector('.yn-dock #ynTaBody').value === '', null, 5000));
  await bl.page.locator('.yn-dock #ynTaBody').fill('다른 주일 필기');
  await sleep(1500);
  await bl.page.goto(BASE + '/?page=bulletin&date=' + otherDate + '#note');
  check('#note 주소로 열면 필기 창이 저절로 열림', await L.waitTrue(bl.page, () => { const d = document.querySelector('.yn-dock'); return d && !d.hidden; }, null, 8000));
  check('다시 열면 그 주보의 필기가 그대로', await L.waitTrue(bl.page, (t) => { const x = document.querySelector('.yn-dock #ynTaBody'); return x && x.value === t; }, '다른 주일 필기', 6000), await bl.page.evaluate(() => (document.querySelector('.yn-dock #ynTaBody') || {}).value));
  const live = run((api) => api.sermonNotesInit(tok)).notes.filter((n) => n.snippet === '주보 보면서 적는 필기');
  check('내 설교 노트 목록에 주보 필기가 나타남', live.length === 1, live.length);
  await bl.page.evaluate(() => document.querySelector('#ynDockOpen').click());
  check('“내 노트에서 열기”로 같은 노트를 엶', await L.waitTrue(bl.page, () => /page=notes&id=/.test(location.search) && document.getElementById('ynTaBody'), null, 8000));
  await bl.ctx.close();

  console.log('· 로그인 없이 필기 — 이 기기에만 저장, 로그인하면 계정으로');
  const nl = await mk({ width: 390, height: 780 });
  await nl.page.goto(BASE + '/?page=bulletin');
  await L.waitTrue(nl.page, () => { const f = document.querySelector('.yn-dockfab'); return f && !f.hidden; }, null, 8000);
  await nl.page.click('.yn-dockfab');
  await L.waitTrue(nl.page, () => !!document.querySelector('.yn-dock #ynTaBody'), null, 5000);
  check('로그인 안내', await nl.page.evaluate(() => /이 기기에만 저장돼요/.test(document.querySelector('.yn-dock').textContent)));
  check('AI 버튼은 꺼짐', await nl.page.locator('.yn-dock .yn-tb.ai').isDisabled());
  await nl.page.locator('.yn-dock #ynTaBody').fill('로그인 전에 쓴 글');
  await sleep(1500);
  check('서버 저장 호출 없음', nl.calls.save === 0, nl.calls.save);
  check('이 기기에 임시본이 남음', await nl.page.evaluate(() => Object.keys(localStorage).some((k) => k.indexOf('ynN:') === 0 && JSON.parse(localStorage.getItem(k)).dirty)));
  await nl.page.evaluate((t) => sessionStorage.setItem('ynPortalToken', t), tok);
  await nl.page.reload();                                 // 주소에 #note 가 있어 필기 창이 저절로 열립니다
  check('로그인 뒤 열면 이 기기 글이 계정으로 저장됨', await L.waitTrue(nl.page, () => /저장 완료|저장됨/.test((document.querySelector('.yn-dock .yn-pill') || {}).textContent || ''), null, 8000) && nl.calls.save === 1);
  const merged = run((api) => api.sermonNoteByDate(tok, bdate));
  check('같은 주일에 이미 있던 필기가 있으면 그 뒤에 이어 붙음(덮어쓰지 않음)', merged.body === '주보 보면서 적는 필기\n\n로그인 전에 쓴 글', merged.body);
  await nl.ctx.close();

  console.log('· 포털의 “내 설교 노트” 단추');
  const pt = await mk({ width: 420, height: 900 });
  await pt.page.addInitScript((t) => { try { sessionStorage.setItem('ynPortalToken', t); } catch (e) {} }, tok);
  await pt.page.goto(BASE + '/?page=portal');
  await L.waitTrue(pt.page, () => document.getElementById('main').style.display === 'block', null, 8000);
  check('포털에 내 설교 노트 단추(로그인 표 포함)', await pt.page.evaluate(() => { const a = document.getElementById('notesBtn'); return !!a && /page=notes&t=/.test(a.getAttribute('href')) && a.getBoundingClientRect().width > 100; }));
  await pt.page.click('#notesBtn');
  check('눌러서 노트 목록으로 이동', await L.waitTrue(pt.page, () => /page=notes/.test(location.search) && document.querySelectorAll('#cards .yn-card').length >= 3, null, 8000));
  await pt.ctx.close();


  console.log('· 만료된 로그인표로 주보 필기 — 막지 않고 이 기기에 저장');
  const ex = await mk({ width: 390, height: 780 });
  await ex.page.addInitScript(() => { try { sessionStorage.setItem('ynPortalToken', 'EXPIRED-TOKEN'); } catch (e) {} });
  await ex.page.goto(BASE + '/?page=bulletin#note');
  check('필기 창은 열리고 이 기기 저장 안내', await L.waitTrue(ex.page, () => { const d = document.querySelector('.yn-dock'); return d && !d.hidden && !!d.querySelector('#ynTaBody') && /이 기기에만 저장돼요/.test(d.textContent); }, null, 8000));
  await ex.page.locator('.yn-dock #ynTaBody').fill('만료된 표로 쓴 글'); await sleep(1400);
  check('서버에는 보내지 않고 이 기기에 보관', ex.calls.save === 0 && await ex.page.evaluate(() => Object.keys(localStorage).some((k) => k.indexOf('ynN:') === 0 && /만료된 표로/.test(localStorage.getItem(k)))), ex.calls.save);
  await ex.ctx.close();

  console.log('· 키보드가 올라와 화면이 낮아져도 서식 막대가 보임');
  const kb = await mk({ width: 390, height: 780 });
  await kb.page.goto(url(tok, '&new=1'));
  await L.waitTrue(kb.page, () => !!document.getElementById('ynTitle'), null, 8000);
  await kb.page.setViewportSize({ width: 390, height: 380 });                // 키보드가 올라온 것처럼
  await sleep(300);
  const geo = await kb.page.evaluate(() => { const b = document.querySelector('.yn-bar').getBoundingClientRect(), p = document.getElementById('page').getBoundingClientRect(); return { barBottom: b.bottom, barTop: b.top, pageH: p.height, vh: innerHeight }; });
  check('페이지가 보이는 높이에 맞고 서식 막대가 그 안에 있음', Math.abs(geo.pageH - geo.vh) <= 2 && geo.barBottom <= geo.vh && geo.barTop >= 0, geo);
  const fits = await kb.page.evaluate(() => { const a = document.querySelector('.yn-ta:not([hidden])').getBoundingClientRect(); return a.height; });
  check('글 쓰는 칸이 사라지지 않고 남음(스크롤로 이어 씀)', fits > 60, fits);
  await kb.ctx.close();

  check('페이지 오류 없음', errs.length === 0, errs);
  await br.close();
  const okAll = L.summary(); process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
