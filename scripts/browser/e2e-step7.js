/**
 * Step 7 화면 시험 — 진짜 server.js + 가짜 구글 + 진짜 크롬
 *   node scripts/browser/e2e-step7.js
 *  C. 신청자 화면(포털): 조건에 따라 문항이 "바로" 나타나고 사라짐 · 숨겨진 필수는 통과 · 숨겨진 답은 저장 안 됨 · 내 신청 상태 보임
 *  F. 관리자 화면(신청서 관리): 표시 조건 걸기 · 상태 태그 고르기(한 명 · 여러 명) · 걸러 보기 · 공유 · 알릴 대상 여러 곳
 *  V. 공유받은 분: 결과만 보임 (고치기 · 상태 바꾸기 버튼 없음)
 *  L. 앨범: 공개 범위 고르기 · 잠금 표시 · 목록 필터 · 역할 기억(sessionStorage)으로 만들기 버튼을 먼저 그림
 */
process.env.PORT = '4198';
const path = require('path'), fs = require('fs');
const L = require('./e2e-lib'); const { check, sleep } = L;
require('./e2e-step4-server.js');
const BASE = 'http://127.0.0.1:4198';
const run = (fn) => global.__runtime.run((api) => fn(api)).result;
const SHOT = process.env.SHOT_DIR || path.join(__dirname, '..', '..', 'tmp-shots');
try { fs.mkdirSync(SHOT, { recursive: true }); } catch (e) { /* 사진 저장은 선택 */ }
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(SHOT, name + '.png'), fullPage: true }); } catch (e) { /* ignore */ } };

(async () => {
  await sleep(1200);
  const tok = run((api) => api.포털토큰_('정일반', '4165551008', ''));
  const tokB = run((api) => api.포털토큰_('최셀장', '4165551006', ''));
  const tokC = run((api) => api.포털토큰_('노셀장', '4165551007', ''));
  const tokK = run((api) => api.포털토큰_('김커미티', '4165551000', ''));
  const br = await L.launch();
  const mk = async (vp, init) => {
    const ctx = await br.newContext({ viewport: vp, timezoneId: 'America/Toronto', locale: 'ko-KR', acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [], api = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|bad HTTP response code|fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    page.on('request', (r) => { const m = /\/api\/(\w+)/.exec(r.url()); if (m) api.push(m[1]); });
    if (init) await page.addInitScript(init.fn, init.arg);
    return { ctx, page, errs, api };
  };
  const setTok = { fn: (t) => { try { if (!sessionStorage.getItem('ynPortalToken')) sessionStorage.setItem('ynPortalToken', t); } catch (e) { /* ignore */ } } };

  /* ------------------------------------------------ 시험용 신청서 */
  const cond = (q, op, v) => ({ mode: 'all', rules: [{ q, op, v }] });
  const Q = [
    { id: 'go', type: 'choice', label: '참석 여부', req: true, opts: ['참석', '불참'] },
    { id: 'why', type: 'long', label: '불참 사유', req: true, showIf: cond('go', 'eq', '불참') },
    { id: 'car', type: 'choice', label: '차량', req: true, opts: ['탑승', '자차'], showIf: cond('go', 'eq', '참석') },
    { id: 'seat', type: 'number', label: '좌석 수', req: true, min: 1, max: 6, showIf: cond('car', 'eq', '자차') },
    { id: 'sc', type: 'rating', label: '기대', scale: 5, variant: 'number', showIf: cond('go', 'eq', '참석') },
    { id: 'hi', type: 'text', label: '한마디', showIf: cond('sc', 'gte', 4) },
  ];
  const fid = run((api) => api.formSave('ADM', { title: 'Step7 조건 시험', status: '받는중', target: '모두', notify: false, mail: false, editable: true, autoClose: false, questions: Q })).id;

  const vis = (page, id) => page.evaluate((q) => { const b = document.querySelector('#fmWrap .fmqw[data-qid="' + q + '"]'); return !!b && !b.hidden && b.offsetHeight > 0; }, id);
  const pick = (page, q, text) => page.click('#fmWrap .fx-mount[data-q="' + q + '"] .fx-opt:has-text("' + text + '")');

  /* ============================================================ C. 신청자 화면 */
  console.log('· C. 신청자 화면 (휴대폰 폭)');
  const P = await mk({ width: 390, height: 900 }, Object.assign({}, setTok, { arg: tok }));
  const pg = P.page;
  await pg.goto(BASE + '/?page=portal');
  check('포털이 열림', await L.waitTrue(pg, () => document.getElementById('main').style.display === 'block', null, 9000));
  await pg.evaluate((id) => openFormPage(id), fid);
  check('신청서가 그려짐', await L.waitTrue(pg, () => document.querySelectorAll('#fmWrap .fmqw').length === 6, null, 6000));
  check('처음에는 "참석 여부" 만 보임 (나머지는 조건 때문에 숨김)',
    (await vis(pg, 'go')) && !(await vis(pg, 'why')) && !(await vis(pg, 'car')) && !(await vis(pg, 'seat')) && !(await vis(pg, 'sc')) && !(await vis(pg, 'hi')));
  const t0 = Date.now();
  await pick(pg, 'go', '불참');
  check('불참을 누르면 즉시 "불참 사유" 가 나타남 (서버 호출 없이)', (await vis(pg, 'why')) && !(await vis(pg, 'car')) && (Date.now() - t0) < 1500);
  check('신청서 화면에서 서버로 조건을 물어보지 않음', !P.api.some((n) => /condition|visib/i.test(n)));
  await pick(pg, 'go', '참석');
  check('참석으로 바꾸면 사유는 숨고 차량 · 기대가 나타남', !(await vis(pg, 'why')) && (await vis(pg, 'car')) && (await vis(pg, 'sc')));
  await pick(pg, 'car', '자차');
  check('자차를 고르면 좌석 수가 나타남 (연쇄)', await vis(pg, 'seat'));
  await pg.fill('#fq_seat', '3');
  await pick(pg, 'car', '탑승');
  check('탑승으로 바꾸면 좌석 수는 다시 숨음', !(await vis(pg, 'seat')));
  await pg.click('#fmWrap .fx-mount[data-q="sc"] .fx-r:nth-of-type(5)');
  check('기대 5점 → "한마디" 나타남 (숫자 비교)', await vis(pg, 'hi'));
  await pg.click('#fmWrap .fx-mount[data-q="sc"] .fx-r:nth-of-type(2)');
  check('기대 2점 → "한마디" 숨음', !(await vis(pg, 'hi')));
  await pg.click('#fmWrap .fx-mount[data-q="sc"] .fx-r:nth-of-type(5)');
  await pg.fill('#fq_hi', '기대돼요');
  await pg.click('#fmWrap .fx-mount[data-q="sc"] .fx-r:nth-of-type(1)');
  await shot(pg, 's7-portal-cond');
  // 숨겨진 필수(불참 사유 · 좌석 수)는 막지 않고 신청됨 → 숨겨진 답은 저장되지 않음
  await pg.click('#fmSubmit');
  check('보이는 필수만 채우면 신청됨 (숨겨진 필수 문항은 통과)', await L.waitTrue(pg, () => /신청이 접수되었습니다/.test(document.getElementById('fmWrap').innerText), null, 6000));
  let row = run((api) => api.formResults('ADM', fid)).rows.filter((r) => r.name === '정일반')[0];
  check('저장된 답은 보이던 문항만: 참석 · 탑승 · 별점 1 (한마디 · 좌석 · 사유 없음)',
    JSON.stringify(row.answers) === JSON.stringify({ go: '참석', car: '탑승', sc: 1 }), row.answers);
  check('신청 상태는 "접수"', row.status === '접수');

  // 다시 열면 이미 낸 답 기준으로 처음부터 알맞게 보임 + 내 상태 표시
  run((api) => api.formSetAnswerStatus('ADM', fid, ['정일반'], '미결제', false));
  await pg.evaluate(() => afterForm());
  await sleep(300);
  await pg.evaluate((id) => openFormPage(id), fid);
  check('다시 열면 이미 낸 답 기준으로 그려짐 (참석 → 차량 보임 · 사유 숨김)',
    await L.waitTrue(pg, () => document.querySelectorAll('#fmWrap .fmqw').length === 6 && !!document.querySelector('#fmWrap .fx-mount'), null, 6000) &&
    (await vis(pg, 'car')) && !(await vis(pg, 'why')) && !(await vis(pg, 'seat')));
  check('내 신청 상태(미결제) 가 신청자에게 보임', /신청 상태\s*미결제/.test(await pg.evaluate(() => document.getElementById('fmWrap').innerText)));
  // 숨겨진 문항의 필수는 막지 않지만, 보이는 필수는 막음
  await pg.evaluate(() => { document.querySelector('#fmWrap .fx-mount[data-q="go"] input[value="불참"]').click(); });
  await pg.click('#fmSubmit');
  await sleep(400);
  check('불참으로 바꾸고 사유를 비우면 "불참 사유" 를 적으라고 막음', /불참 사유/.test(await pg.evaluate(() => (document.getElementById('fmMsg') || {}).textContent || '')));
  check('신청서 화면 페이지 오류 없음', P.errs.length === 0, P.errs);
  await P.ctx.close();

  /* ============================================================ F. 관리자 화면 */
  console.log('· F. 관리자 화면 (신청서 관리)');
  const A = await mk({ width: 1100, height: 1100 });
  const ap = A.page;
  await ap.goto(BASE + '/?page=forms&key=ADM');
  check('신청서 관리 화면이 열림', await L.waitTrue(ap, () => !!window.D && document.getElementById('root').innerText.length > 5, null, 9000));
  await ap.evaluate((id) => openForm(id), fid);
  check('신청서 고치기 화면', await L.waitTrue(ap, () => !!document.getElementById('qList') && document.querySelectorAll('#qList .q').length === 6, null, 6000));
  check('조건이 있는 문항에 "조건부" 표시', await ap.evaluate(() => document.querySelectorAll('#qList .fx-badge').length) === 5);

  console.log('  - 표시 조건 고치기');
  await ap.evaluate(() => toggleQ(3));               // 좌석 수
  check('열린 문항에 조건 편집칸이 있고 "차량 = 자차" 가 채워져 있음', await ap.evaluate(() => {
    const s = document.getElementById('qcs3_0'), o = document.getElementById('qco3_0'), v = document.getElementById('qcv3_0');
    return !!s && s.value === 'car' && o.value === 'eq' && v.value === '자차';
  }));
  check('연산자가 원본 문항 유형(선택)에 맞게: 같을 때 · 다를 때 · 답이 있을 때 · 답이 없을 때', await ap.evaluate(() =>
    Array.prototype.map.call(document.getElementById('qco3_0').options, (o) => o.value).join(',')) === 'eq,ne,filled,empty');
  await ap.evaluate(() => toggleQ(5));              // 한마디 (기대 점수가 gte 4 일 때)
  check('한마디의 조건: 기대 · 이상일 때 · 4점', await ap.evaluate(() => {
    const s = document.getElementById('qcs5_0'), o = document.getElementById('qco5_0'), v = document.getElementById('qcv5_0');
    return s.value === 'sc' && o.value === 'gte' && v.value === '4';
  }));
  check('원본이 별점이면 연산자는 이상 · 이하 · 같음 · 답 있음 · 답 없음, 값은 점수 고르기(1~5점)', await ap.evaluate(() =>
    Array.prototype.map.call(document.getElementById('qco5_0').options, (o) => o.value).join(',') === 'gte,lte,eq,filled,empty' &&
    document.getElementById('qcv5_0').tagName === 'SELECT' && document.getElementById('qcv5_0').options.length === 6));
  await ap.selectOption('#qcs5_0', 'go');
  check('원본을 선택 문항(참석 여부)으로 바꾸면 연산자가 바뀌고 값은 선택지에서 고르기', await ap.evaluate(() =>
    Array.prototype.map.call(document.getElementById('qco5_0').options, (o) => o.value).join(',') === 'eq,ne,filled,empty' &&
    Array.prototype.map.call(document.getElementById('qcv5_0').options, (o) => o.value).join(',') === ',참석,불참'));
  await ap.selectOption('#qcs5_0', 'sc');
  await ap.selectOption('#qco5_0', 'gte');
  await ap.selectOption('#qcv5_0', '3');
  await ap.click('text=+ 조건 더하기');
  check('조건이 2개가 되면 "모두 / 하나라도" 고르는 칸이 생김', await ap.evaluate(() => !!document.getElementById('qcm5') && !!document.getElementById('qcs5_1')));
  await ap.selectOption('#qcm5', 'any');
  await ap.selectOption('#qcs5_1', 'car');
  // 값을 비운 채 저장하려 하면 막음
  await ap.evaluate(() => saveForm());
  check('값이 빈 조건이 있으면 저장 전에 알려줌', /비교할 값/.test(await ap.evaluate(() => document.getElementById('saveMsg').textContent)));
  await ap.selectOption('#qcv5_1', '자차');
  await ap.evaluate(() => saveForm());
  check('저장됨', await L.waitTrue(ap, () => document.querySelector('.fcard') || /저장했습니다/.test((document.getElementById('saveMsg') || {}).textContent || ''), null, 6000));
  const saved = run((api) => api.formGet('ADM', fid)).form.questions.filter((q) => q.id === 'hi')[0];
  check('서버에 새 조건이 저장됨 (any · 별점 3 이상 또는 차량 자차)',
    JSON.stringify(saved.showIf) === JSON.stringify({ mode: 'any', rules: [{ q: 'sc', op: 'gte', v: '3' }, { q: 'car', op: 'eq', v: '자차' }] }), saved.showIf);
  // 순서를 바꿔 뒤로 보내면 조건이 풀림
  await L.waitTrue(ap, () => VIEW === 'list' && document.querySelectorAll('.fcard').length > 0, null, 6000);   // 저장 뒤 목록으로 돌아올 때까지
  await ap.evaluate((id) => openForm(id), fid);
  await L.waitTrue(ap, () => VIEW === 'edit' && document.querySelectorAll('#qList .q').length === 6, null, 6000);
  ap.on('dialog', (d) => d.accept());
  await ap.evaluate(() => { moveQ(1, -1); });        // "불참 사유" 를 참석 여부 앞으로 → 조건이 앞 문항이 아니게 됨
  check('문항을 조건의 원본보다 앞으로 옮기면 그 조건이 풀림 (조건부 표시가 사라짐)', await ap.evaluate(() => !F.questions[0].showIf && F.questions[0].id === 'why'), await ap.evaluate(() => F.questions.map((q) => q.id + ':' + JSON.stringify(q.showIf || null))));
  await ap.evaluate(() => { moveQ(0, 1); });
  await ap.evaluate(() => { F.questions[1].showIf = { mode: 'all', rules: [{ q: 'go', op: 'eq', v: '불참' }] }; drawQuestions(); });
  await ap.evaluate(() => delQ(0));                  // 참석 여부(원본)를 지우면 그것을 쓰던 조건도 풀림
  check('원본 문항을 지우면 그것을 조건으로 쓰던 규칙도 함께 풀림', await ap.evaluate(() => F.questions.every((q) => !q.showIf || q.showIf.rules.every((r) => F.questions.some((z) => z.id === r.q)))));
  await shot(ap, 's7-forms-cond');

  console.log('  - 상태 태그');
  ['최셀장', '노셀장'].forEach((nm, i) => {
    const t = i ? tokC : tokB;
    run((api) => api.submitForm(t, fid, { go: '참석', car: '탑승', sc: 3 }));
  });
  await ap.evaluate((id) => showResults(id), fid);
  check('결과 화면 + 상태 칩', await L.waitTrue(ap, () => document.querySelectorAll('.fx-stchips button').length === 5 && document.querySelectorAll('#resTbl tbody tr').length === 3, null, 6000));
  check('처음: 정일반 미결제 · 두 명 접수', await ap.evaluate(() => {
    const b = Array.prototype.map.call(document.querySelectorAll('.fx-stchips button'), (x) => x.innerText.replace(/\s+/g, ' ').trim());
    return b.join('|') === '전체 3|접수 2|미결제 1|결제완료 0|취소 0';
  }));
  // 한 명 바꾸기
  await ap.selectOption('#resTbl select[data-name="최셀장"]', '결제완료');
  check('한 명의 상태를 고르면 바로 바뀜 (표 · 칩)', await L.waitTrue(ap, () => {
    const b = Array.prototype.map.call(document.querySelectorAll('.fx-stchips button'), (x) => x.innerText.replace(/\s+/g, ' ').trim());
    return b.join('|') === '전체 3|접수 1|미결제 1|결제완료 1|취소 0';
  }, null, 6000));
  check('서버에도 반영', run((api) => api.formResults('ADM', fid)).rows.filter((r) => r.name === '최셀장')[0].status === '결제완료');
  // 여러 명
  await ap.evaluate(() => { document.querySelectorAll('#resTbl .rck').forEach((c) => { if (c.getAttribute('data-name') !== '최셀장') c.click(); }); });
  await ap.selectOption('#bkSt', '미결제');
  await ap.click('text=고른 분에게 적용');
  check('여러 명을 골라 한꺼번에 미결제로', await L.waitTrue(ap, () => /미결제 2/.test(document.querySelector('.fx-stchips').innerText.replace(/\s+/g, ' ')), null, 6000));
  // 취소는 확인을 물음 → 정원 · 집계에서 빠짐
  await ap.selectOption('#resTbl select[data-name="노셀장"]', '취소');
  check('취소로 바꾸면 그 줄이 흐려지고(취소 표시) "신청" 수에서 빠짐', await L.waitTrue(ap, () =>
    document.querySelectorAll('#resTbl tr.cx').length === 1 && /2\s*신청/.test(document.querySelector('.rstat').innerText.replace(/\s+/g, ' ')), null, 6000));
  // 걸러 보기
  await ap.click('.fx-stchips button:has-text("미결제")');
  check('"미결제" 만 걸러 보기', await ap.evaluate(() => document.querySelectorAll('#resTbl tbody tr').length === 1 && document.querySelector('#resTbl tbody tr td.stc select').value === '미결제'));
  await ap.click('.fx-stchips button:has-text("전체")');
  check('전체로 돌아오면 3줄', await ap.evaluate(() => document.querySelectorAll('#resTbl tbody tr').length === 3));
  await shot(ap, 's7-forms-status');
  // 엑셀 내보내기에 상태 칸
  const dl = ap.waitForEvent('download', { timeout: 6000 }).catch(() => null);
  await ap.click('text=엑셀로 받기');
  check('엑셀로 받기 동작 (상태 칸 포함은 서버 시험에서 확인)', !!(await dl) || await L.waitTrue(ap, () => /내려받았습니다/.test((document.getElementById('resMsg') || {}).textContent || ''), null, 5000));

  console.log('  - 공유 · 알릴 대상');
  await ap.evaluate((id) => openForm(id), fid);
  check('공유 · 알릴 대상 칸이 그려짐', await L.waitTrue(ap, () => !!document.getElementById('shList') && !!document.getElementById('anChips'), null, 6000));
  check('공유 종류를 바꾸면 고를 이름 목록이 바뀜 (사역팀 → 셀 → 한 사람)', await ap.evaluate(async () => {
    const k = document.getElementById('shKind'), d = document.getElementById('shNames'), out = [];
    ['팀', '셀', '사람'].forEach((v) => { k.value = v; drawShareNames(); out.push(d.options.length); });
    return out[0] >= 2 && out[1] >= 2 && out[2] >= 5;
  }));
  await ap.selectOption('#shKind', '사람');
  await ap.fill('#shName', '없는사람');
  await ap.click('text=+ 더하기 >> nth=0');
  check('목록에 없는 이름은 거절', /목록에 없는/.test(await ap.evaluate(() => document.getElementById('shMsg').textContent)));
  await ap.fill('#shName', '노셀장');
  await ap.click('text=+ 더하기 >> nth=0');
  await ap.selectOption('#shKind', '셀');
  await ap.fill('#shName', '1셀');
  await ap.click('text=+ 더하기 >> nth=0');
  check('두 곳(한 사람 + 셀)이 목록에 올라감', await ap.evaluate(() => document.querySelectorAll('#shList .fx-share').length === 2));
  await ap.evaluate(() => { document.querySelector('#shList .fx-share input[type=checkbox]').click(); });   // 첫째 알림 켜기
  await ap.click('text=공유 저장');
  check('공유 저장됨', await L.waitTrue(ap, () => /저장했습니다/.test(document.getElementById('shMsg').textContent), null, 6000));
  check('서버에 공유가 저장됨 (첫째만 알림 켬)', JSON.stringify(run((api) => api.formGet('ADM', fid)).form.shares) === JSON.stringify([{ key: '사람:노셀장', notify: true }, { key: '셀:1셀', notify: false }]));
  // 알릴 대상 여러 곳
  await ap.selectOption('#anTarget', { label: '셀장 (' + (await ap.evaluate(() => (D.targets.filter((t) => t.key === '셀장')[0] || {}).n)) + '명)' });
  await ap.click('text=+ 더하기 >> nth=1');
  await ap.selectOption('#anTarget', '사람:정일반');
  await ap.click('text=+ 더하기 >> nth=1');
  check('알릴 대상이 2곳 붙음 (셀장 · 정일반)', await ap.evaluate(() => AN.length === 2 && document.querySelectorAll('#anChips .fx-chip').length === 2));
  await ap.evaluate(() => { document.getElementById('anMail').checked = false; });
  ap.removeAllListeners('dialog'); ap.on('dialog', (d) => d.accept());
  await ap.click('text=지금 알리기');
  check('여러 곳 알리기가 됨 (포털 공지)', await L.waitTrue(ap, () => /포털에 올림/.test(document.getElementById('anMsg').textContent), null, 6000));
  const nn = run((api) => api.공지들_()).filter((n) => /Step7/.test(n.title)).pop();
  check('포털 공지 대상이 "|" 로 이어 저장됨', !!nn && /\|/.test(nn.target) && /사람:정일반/.test(nn.target), nn && nn.target);
  check('관리자 화면 페이지 오류 없음', A.errs.length === 0, A.errs);
  await A.ctx.close();

  /* ============================================================ V. 공유받은 분 (보기만) */
  console.log('· V. 공유받은 분 — 결과만');
  const V = await mk({ width: 420, height: 900 });
  const vp = V.page;
  await vp.goto(BASE + '/?page=forms&t=' + encodeURIComponent(tokC));
  check('공유받은 노셀장이 신청서 관리에 들어옴', await L.waitTrue(vp, () => !!window.D && D.viewer === true && document.getElementById('root').innerText.length > 5, null, 9000));
  check('"신청서 만들기" 칸은 없고 "공유받은 신청서" 안내가 있음', await vp.evaluate(() => !document.getElementById('tplBox') && /공유받은 신청서/.test(document.getElementById('root').innerText)));
  check('목록의 카드에 "결과 보기" 표시', await vp.evaluate(() => document.querySelectorAll('.fcard .fx-badge').length >= 1));
  await vp.click('.fcard');
  check('카드를 누르면 고치기 화면이 아니라 결과로', await L.waitTrue(vp, () => !!document.getElementById('resTbl'), null, 6000));
  check('보기만: 상태 고르는 칸 · 지우기 · 고른 분 적용 · 신청서로 돌아가기 버튼이 없음', await vp.evaluate(() =>
    !document.querySelector('#resTbl select') && !document.querySelector('#resTbl .drop') && !document.getElementById('bkSt') && !/‹ 신청서/.test(document.getElementById('root').innerText)));
  check('상태는 태그로 보임', await vp.evaluate(() => document.querySelectorAll('#resTbl .stt').length === 3));
  check('공유받은 분 화면 페이지 오류 없음', V.errs.length === 0, V.errs);
  await V.ctx.close();

  /* ============================================================ L. 앨범 */
  console.log('· L. 포토 앨범 공개 범위 · 역할 기억');
  const mkAlb = (t, d) => run((api) => api.albumCreate(t, d)).id;
  const idOpen = mkAlb(tokK, { category: '행사', title: 'S7 전체 공개' });
  const idCell = mkAlb(tokB, { category: '셀', target: '1셀', title: 'S7 1셀만', visibility: { mode: 'restricted', teams: [], cells: ['1셀'] } });
  const idTeam = mkAlb(tokK, { category: '행사', title: 'S7 찬양팀만', visibility: { mode: 'restricted', teams: ['찬양1팀'], cells: [] } });
  const AL = await mk({ width: 390, height: 900 });
  const lp = AL.page;
  await lp.goto(BASE + '/?page=album&t=' + encodeURIComponent(tokB));
  check('앨범 목록이 열림', await L.waitTrue(lp, () => !!window.D && !D.pending && document.querySelectorAll('.albcard').length > 0, null, 9000));
  const titles = await lp.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.albcard .albn b'), (b) => b.textContent));
  check('1셀장(최셀장): 전체 공개 · 자기 셀 앨범은 보이고 찬양팀만 앨범은 안 보임', titles.indexOf('S7 전체 공개') !== -1 && titles.indexOf('S7 1셀만') !== -1 && titles.indexOf('S7 찬양팀만') === -1, titles);
  check('제한 공개 앨범에만 🔒 표시', await lp.evaluate(() => {
    const cards = Array.prototype.slice.call(document.querySelectorAll('.albcard'));
    const by = (t) => cards.filter((c) => c.querySelector('.albn b').textContent === t)[0];
    return !!by('S7 1셀만').querySelector('.alock') && !by('S7 전체 공개').querySelector('.alock');
  }));
  check('역할이 이 탭에 기억됨 (토큰 자체는 저장 안 함)', await lp.evaluate((t) => {
    const ks = Object.keys(sessionStorage).filter((k) => /^ynAlbumCaps:/.test(k));
    return ks.length === 1 && sessionStorage.getItem(ks[0]).indexOf(t) === -1 && JSON.parse(sessionStorage.getItem(ks[0])).myCells.length >= 1;
  }, tokB));
  // 새로고침: 서버 답이 오기 전에도 "새 앨범 만들기" 버튼이 먼저 그려짐
  await lp.route('**/api/albumInit', async (route) => { await new Promise((r) => setTimeout(r, 1200)); route.continue(); });
  await lp.reload();
  check('새로고침 직후(서버 답 전) 탭과 "새 앨범 만들기" 버튼이 먼저 보이고 자리 표시가 있음', await L.waitTrue(lp, () =>
    !!window.D && D.pending === true && !!document.querySelector('.atabs') && /새 앨범 만들기/.test(document.getElementById('root').innerText) && document.querySelectorAll('.albcard.pend').length > 0, null, 900));
  check('이어서 서버 답이 오면 실제 목록으로 바뀜', await L.waitTrue(lp, () => !D.pending && document.querySelectorAll('.albcard:not(.pend)').length > 0, null, 6000));
  await lp.unroute('**/api/albumInit');
  // 만들기: 공개 범위 고르기
  await lp.click('text=+ 새 앨범 만들기');
  check('만들기 화면에 공개 범위 고르기 (기본은 등록 교인 전체)', await lp.evaluate(() =>
    !!document.getElementById('crVis') && document.querySelector('input[name="crVisMode"]:checked').value === 'registered' && document.getElementById('crVisGroups').style.display === 'none'));
  await lp.fill('#crTitle', 'S7 브라우저 앨범');
  await lp.click('input[name="crVisMode"][value="restricted"]');
  check('"고른 팀 · 셀만" 을 누르면 팀 · 셀 목록이 나타남', await lp.evaluate(() => document.getElementById('crVisGroups').style.display !== 'none' && document.querySelectorAll('#crVisGroups input[type=checkbox]').length >= 4));
  await lp.click('#root button.accent');
  check('제한인데 아무것도 안 고르면 막음', /하나 이상/.test(await lp.evaluate(() => document.getElementById('crMsg').textContent)));
  await lp.click('#crVisGroups label:has-text("찬양1팀")');
  await lp.click('#crVisGroups label:has-text("2셀")');
  await lp.click('#root button.accent');
  check('만들어져 상세가 열리고 🔒 공개 범위가 적혀 있음', await L.waitTrue(lp, () => /사역팀 찬양1팀 · 셀 2셀 만 볼 수 있습니다/.test(document.getElementById('root').innerText), null, 6000));
  const made = run((api) => api.albumInit(tokK)).list.filter((a) => a.title === 'S7 브라우저 앨범')[0];
  check('서버에 공개 범위가 저장됨', !!made && made.visibility.mode === 'restricted' && made.visibility.teams[0] === '찬양1팀' && made.visibility.cells[0] === '2셀', made);
  // 고치기
  await lp.click('text=고치기');
  check('고치기 화면에 현재 공개 범위가 채워져 있음', await lp.evaluate(() =>
    document.querySelector('input[name="edVisMode"]:checked').value === 'restricted' && document.querySelectorAll('#edVisGroups input:checked').length === 2));
  await lp.click('input[name="edVisMode"][value="registered"]');
  await lp.click('#root button.accent');
  check('등록 교인 전체로 바꾸면 🔒 표시가 사라짐', await L.waitTrue(lp, () => !/만 볼 수 있습니다/.test(document.getElementById('root').innerText) && /S7 브라우저 앨범/.test(document.getElementById('root').innerText), null, 6000));
  await shot(lp, 's7-album');
  check('노셀장(2셀장): 다른 셀 앨범은 목록에 없음', run((api) => api.albumInit(tokC)).list.every((a) => a.title !== 'S7 1셀만'));
  check('앨범 화면 페이지 오류 없음', AL.errs.length === 0, AL.errs);
  await AL.ctx.close();

  await br.close();
  process.exit(L.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
