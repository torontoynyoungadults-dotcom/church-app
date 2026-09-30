/**
 * 토론토영락교회 청년1부 — Render 서버
 * ------------------------------------------------------------
 *   /?page=portal | leader | admin | newfamily | team | expense | worship | mission
 *                         화면 (예전 Apps Script 웹앱 주소와 같은 ?page= 규칙)
 *   POST /api/<함수이름>   화면에서 서버 함수 호출 (public/app.js 의 callServer)
 *   /tasks?key=관리자키    관리 작업 (예전 시트 메뉴 '셀보고 관리')
 *   /cron/<작업>?secret=   자동 발송을 바깥에서 깨워 부르기
 *   /healthz               서버 상태 확인
 *   /sheet/<id>            찬양 악보 파일 (연습 모드 뷰어)
 *   /socket.io/            실시간 (찬양방송팀 허브 — 리더/팔로워 · 악보 필기)
 *   POST /api/worshipTimerGet · worshipTimerCmd   예배 타이머 — 웹소켓이 막혔을 때 쓰는 HTTP 대체 통로 (lib/realtime.js 와 같은 상태)
 */
process.env.TZ = process.env.TZ || 'America/Toronto';   // 날짜 계산을 시트 시간대와 맞춥니다 (가장 먼저)

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const runtime = require('./lib/runtime');
const bridge = require('./lib/bridge');
const bstats = () => bridge.stats || { calls: 0, ms: 0 };   // 진단용 — 없어도 요청은 정상 처리
const SLOW_MS = Number(process.env.SLOW_MS) || 1500;          // 이보다 오래 걸린 요청을 로그에 남깁니다
const pages = require('./lib/pages');
const scheduler = require('./lib/scheduler');
const tasks = require('./lib/tasks');
const notesBuffer = require('./lib/notes-buffer');   // Step 4 — 설교 노트 쓰기 버퍼
const notesAi = require('./lib/notes-ai');           // Step 4 — 서버를 멈추지 않는 AI 정제

runtime.setScheduleSource(scheduler.names);
// 발송 요일 · 시각은 설정 시트에서 읽어옵니다 (관리 화면에서 바꿉니다)
scheduler.setScheduleReader(() => {
  try { return runtime.run((api) => api.알림일정_()).result; } catch (e) { return null; }
});

// 설교 노트는 메모리 버퍼에 먼저 담았다가 몇 초에 한 번 시트에 한꺼번에 씁니다 (시트 쓰기가 서버를 멈추기 때문)
notesBuffer.start((recs) => runtime.run((api) => api.sermonNotesFlush_(recs)).result, { log: (...a) => console.log(...a) });

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '60mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: false }));

/** ?page=… 화면 */
app.get('/', (req, res) => {
  const parameter = {}, parameters = {};
  Object.keys(req.query || {}).forEach((k) => {
    const v = req.query[k];
    const list = (Array.isArray(v) ? v : [v]).map((x) => String(x));
    parameters[k] = list;
    parameter[k] = list[0];
  });
  try {
    const { result } = runtime.run((api) => api.doGet({ parameter, parameters }));
    res.set('Cache-Control', 'no-store');
    res.type('html').send(pages.render(result));
  } catch (e) {
    console.error('[화면 오류]', e);
    res.status(500).type('html').send(errorPage(e));
  }
});

/**
 * 저장이 끝난 뒤 같은 방(웹소켓)에 알립니다 — 연습 화면의 설정 · 곡 정보를 팀이 실시간으로 함께 보게 (Step 2.9)
 *   · 함수가 결과에 bcast { room, event, payload } 를 달아 주면 그대로 전달 (화면에는 bcast 를 빼고 보냄)
 *   · 허브에서 콘티(곡)를 저장 · 삭제 · 여러 곡 저장하면 'songs:changed' → 열려 있는 연습 화면이 곡 목록을 다시 불러옴
 */
const SONG_CHANGERS = { saveWorshipSong: 1, removeWorshipSong: 1, saveWorshipSongs: 1 };
function liveAfter(fn, args, result) {
  try {
    if (result && typeof result === 'object' && result.bcast) {
      const { bcast, ...rest } = result;
      if (bcast && typeof rt !== 'undefined') rt.broadcast(bcast.room, bcast.event, bcast.payload);
      return rest;
    }
    if (SONG_CHANGERS[fn] && typeof rt !== 'undefined') rt.broadcast(String(args[1] || ''), 'songs:changed', { t: Date.now(), fn });
  } catch (e) { console.error('[실시간 알림 실패]', fn, e && e.message); }
  return result;
}

/**
 * 설교 노트 AI 정제 (Step 4) — 제미나이 답을 기다리는 동안 서버 전체가 멈추지 않게 비동기로 부릅니다.
 * (다른 AI 기능은 다리를 거쳐 기다리는 동안 모든 요청이 멈춥니다 — 예배 중 여럿이 누르면 저장까지 밀립니다)
 * 로그인 · 사용 한도 · 프롬프트는 logic/notes.js 가 준비하고, 여기서는 AI 호출만 비동기로 합니다.
 */
app.post('/api/sermonNoteRefine', async (req, res) => {
  const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];
  try {
    const prep = runtime.run((api) => api.sermonNoteRefinePrep_(args[0], args[1], args[2], args[3])).result;
    const ai = await notesAi.gemini(prep);
    const result = runtime.run((api) => api.sermonNoteRefineDone_(prep, ai.text)).result;
    res.json({ ok: true, result });
  } catch (e) {
    if (!(e && e.message && /[가-힣]/.test(e.message))) console.error('[sermonNoteRefine]', e);
    res.json({ ok: false, error: (e && e.message) || String(e) });
  }
});

/**
 * 예배 타이머 — 웹소켓이 막혔을 때 쓰는 대체 통로 (public/worship/timer.js 가 3초마다 부릅니다)
 * 웹소켓과 같은 저장소(lib/realtime.js)를 봅니다. 조작이 들어오면 소켓 방에도 바로 알립니다. 아래 일반 /api/:fn 보다 먼저 등록해야 합니다.
 */
function timerRoute(kind) {
  return (req, res) => {
    const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];
    try {
      res.set('Cache-Control', 'no-store');
      res.json(rt.timerHttp(kind, args));
    } catch (e) {
      console.error('[worshipTimer]', kind, e && e.message);
      res.json({ ok: false, error: (e && e.message) || '처리하지 못했습니다.' });
    }
  };
}
app.post('/api/worshipTimerGet', timerRoute('get'));
app.post('/api/worshipTimerCmd', timerRoute('cmd'));

/**
 * 설교 요약 (허브 v5) — 자막이 없으면 제미나이가 유튜브 영상을 직접 보고 요약합니다 (1~3분 걸릴 수 있음).
 * 예전처럼 다리(bridge)를 거쳐 기다리면 그동안 서버 전체가 멈추므로, 노트 정제와 같은 방식으로
 * 준비(자막 찾기 · 로그인 확인) → 비동기 AI 호출 → 마무리(저장)로 나눕니다. 화면 쪽 호출 이름은 그대로입니다.
 */
async function sermonAsync(prepName, doneName, args, res) {
  try {
    const prep = runtime.run((api) => api[prepName].apply(null, args)).result;
    let ai = await notesAi.gemini(prep);
    let result = runtime.run((api) => api[doneName](prep, ai.text, 0)).result;
    if (result && result.retryPrompt) {                                  // 형식이 어긋나면 한 번 더 (관리 화면 요약)
      ai = await notesAi.gemini(Object.assign({}, prep, { prompt: result.retryPrompt }));
      result = runtime.run((api) => api[doneName](prep, ai.text, 1)).result;
      if (result) delete result.retryPrompt;
    }
    res.json({ ok: true, result });
  } catch (e) {
    if (!(e && e.message && /[가-힣]/.test(e.message))) console.error('[' + doneName + ']', e);
    res.json({ ok: false, error: (e && e.message) || String(e) });
  }
}
app.post('/api/sermonMake', (req, res) => sermonAsync('sermonMakePrep_', 'sermonMakeDone_', Array.isArray(req.body && req.body.args) ? req.body.args : [], res));
app.post('/api/sermonGeminiSummary', (req, res) => sermonAsync('sermonGeminiSummaryPrep_', 'sermonGeminiSummaryDone_', Array.isArray(req.body && req.body.args) ? req.body.args : [], res));

/** 매주 자동 요약에서 자막이 없던 영상 — 서버를 멈추지 않고 뒤에서 영상으로 요약합니다 */
async function sermonVideoFollowUp(result) {
  const list = (result && result.needVideo) || [];
  for (const v of list.slice(0, 1)) {
    try {
      const prep = runtime.run((api) => api.설교영상준비_(v)).result;
      if (!prep) continue;
      const ai = await notesAi.gemini(prep);
      runtime.run((api) => api.설교영상저장_(prep, ai.text));
      console.log('[설교 영상 요약]', v.title || v.id, '완료');
    } catch (e) { console.error('[설교 영상 요약 실패]', v.id, e.message); }
  }
}
function runJob(fn) {
  const r = runtime.run((api) => api[fn]()).result;
  if (fn === '설교요약돌기' && r && r.needVideo && r.needVideo.length) sermonVideoFollowUp(r);
  return r;
}

/** 화면 → 서버 함수 */
app.post('/api/:fn', (req, res) => {
  const fn = req.params.fn;
  const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];
  if (!runtime.isCallable(fn)) return res.json({ ok: false, error: '알 수 없는 요청입니다: ' + fn });
  const t0 = Date.now(), g0 = { calls: bstats().calls, ms: bstats().ms };
  try {
    let { result } = runtime.run((api) => api[fn].apply(null, args));
    result = liveAfter(fn, args, result);
    res.json({ ok: true, result });
  } catch (e) {
    if (!(e && e.message && /[가-힣]/.test(e.message))) console.error('[' + fn + ']', e);
    res.json({ ok: false, error: (e && e.message) || String(e) });
  } finally {
    const ms = Date.now() - t0;
    if (ms > SLOW_MS) {
      const calls = bstats().calls - g0.calls, wait = bstats().ms - g0.ms;
      console.log('[느림]', fn, ms + 'ms', '(구글 왕복 ' + calls + '번 · 기다린 시간 ' + wait + 'ms · 계산 ' + (ms - wait) + 'ms)');
    }
  }
});

/** 관리 작업 (예전 시트 메뉴) */
app.get('/tasks', (req, res) => res.type('html').send(tasks.page()));
app.post('/tasks/run', (req, res) => {
  const { key, task } = req.body || {};
  const t = tasks.find(task);
  if (!t) return res.json({ ok: false, error: '없는 작업입니다.' });
  try {
    const { alerts } = runtime.run((api) => {
      // 관리자키 — 또는 처음 설정할 때처럼 시트에 키가 아직 없으면 CRON_SECRET 으로도 됩니다
      if (!api.isAdmin_(key) && !safeEqual(key, process.env.CRON_SECRET)) throw new Error('관리자키가 올바르지 않습니다.');
      return api[t.fn]();
    });
    res.json({ ok: true, messages: alerts.length ? alerts : ['완료했습니다.'] });
  } catch (e) {
    res.json({ ok: false, error: (e && e.message) || String(e) });
  }
});

/** 자동 발송을 바깥에서 부르기 — CRON_SECRET 이 맞아야 합니다 */
function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
app.all('/cron/:job', (req, res) => {
  const job = req.params.job;
  if (!process.env.CRON_SECRET || !safeEqual(req.query.secret, process.env.CRON_SECRET)) return res.status(403).send('forbidden');
  if (scheduler.names().indexOf(job) === -1) return res.status(404).send('unknown job');
  try {
    runJob(job);
    res.send('ok');
  } catch (e) {
    console.error('[cron]', job, e);
    res.status(500).send(e.message);
  }
});

/** 찬양 녹음 재생 — 드라이브 파일을 그대로 흘려보냅니다 (앞뒤로 옮기기가 되도록 Range 도 넘깁니다) */
// (bridge 는 위에서 불러왔습니다)
const { Readable } = require('stream');
const allowOk = new Map();
/** 드라이브 파일을 그대로 흘려보냅니다 (앞뒤로 옮기기가 되도록 Range 도 넘깁니다) — check 로 허용된 파일만 */
function driveStream(check, cacheControl) {
  return async (req, res) => {
    const id = String(req.params.id || '');
    try {
      const ck = check + '|' + id;
      const hit = allowOk.get(ck);
      if (!hit || hit < Date.now()) {
        const { result } = runtime.run((api) => api[check](id));
        if (!result) return res.status(404).send('not found');
        allowOk.set(ck, Date.now() + 10 * 60 * 1000);
      }
      const token = bridge.call('token');
      const headers = { Authorization: 'Bearer ' + token };
      if (req.headers.range) headers.Range = req.headers.range;
      const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true', { headers });
      if (!r.ok && r.status !== 206) return res.status(r.status).send('drive error');
      res.status(r.status);
      ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'].forEach((h) => {
        const v = r.headers.get(h); if (v) res.setHeader(h, v);
      });
      if (!r.headers.get('accept-ranges')) res.setHeader('accept-ranges', 'bytes');
      res.setHeader('cache-control', cacheControl);
      Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
    } catch (e) {
      console.error('[drive stream]', e.message);
      if (!res.headersSent) res.status(500).send('error');
    }
  };
}
/** 찬양 녹음 재생 */
app.get('/audio/:id', driveStream('녹음파일허용_', 'private, max-age=3600'));
/** 찬양 악보 (연습 모드 뷰어가 PDF · 사진을 같은 주소에서 불러옵니다 — 필기를 올리려면 같은 출처여야 합니다) */
app.get('/sheet/:id', driveStream('찬양악보파일허용_', 'private, max-age=600'));
/** 주보에 올린 셀 교재 PDF (주보 PDF 만들 때 페이지를 넣기 위해) */
app.get('/bfile/:id', driveStream('주보파일허용_', 'private, max-age=600'));

/** 회의록 안의 사진 — 구글 문서가 내보낸 주소를 우리 서버가 대신 불러옵니다 */
const MIMG_OK = /(^|\.)(googleusercontent\.com|google\.com|gstatic\.com)$/i;
app.get('/mimg', async (req, res) => {
  try {
    const raw = String(req.query.u || '');
    if (!/^https:\/\//i.test(raw)) return res.status(400).send('bad url');
    let host = '';
    try { host = new URL(raw).hostname; } catch (e) { return res.status(400).send('bad url'); }
    if (!MIMG_OK.test(host)) return res.status(403).send('not allowed');
    const r = await fetch(raw, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    if (!r.ok) return res.status(r.status).send('image error');
    const ct = r.headers.get('content-type') || 'image/png';
    if (!/^image\//i.test(ct)) return res.status(415).send('not an image');
    res.setHeader('content-type', ct);
    res.setHeader('cache-control', 'private, max-age=86400');
    Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(500).send('error');
  }
});

app.get('/healthz', (req, res) => res.send('ok'));

function errorPage(e) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>잠시 문제가 생겼습니다</title></head><body style="font-family:-apple-system,sans-serif;padding:40px 20px;max-width:520px;margin:0 auto;color:#1C1C1C;">' +
    '<h2>잠시 문제가 생겼습니다</h2><p style="color:#6E6962;line-height:1.7;">새로고침해 보시고, 계속되면 커미티에 알려주세요.</p>' +
    '<pre style="white-space:pre-wrap;background:#F4F2EE;padding:12px;border-radius:8px;font-size:12px;">' +
    pages.escHtml((e && e.message) || String(e)) + '</pre></body></html>';
}

/* ---------- 실시간 (웹소켓) — 찬양방송팀 허브의 리더/팔로워 · 악보 필기 ---------- */
const http = require('http');
const realtime = require('./lib/realtime');
const server = http.createServer(app);
const rt = realtime.attach(server, {
  log: (...a) => console.log(...a),
  auth: (token) => runtime.run((api) => api.찬양소켓인증_(token)).result,
  loadAnno: (file, scope) => runtime.run((api) => api.찬양주석읽기_(file, scope, '*')).result,
  saveAnno: (file, scope, items, by) => runtime.run((api) => api.찬양주석저장_(file, scope, '*', items, by)).result,
});

/** 서버가 꺼지기 전(배포 · 재시작) — 아직 저장 안 된 필기를 시트에 남깁니다 */
let closing = false;
function shutdown(sig) {
  if (closing) return;
  closing = true;
  try { const n = rt.flushAll(); if (n) console.log('[종료] 필기 ' + n + '곳 저장'); } catch (e) { console.error('[종료 저장 실패]', e.message); }
  try { const n = notesBuffer.flushNow({ force: true }); if (n) console.log('[종료] 설교 노트 ' + n + '개 저장'); } catch (e) { console.error('[종료 노트 저장 실패]', e.message); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
  void sig;
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('서버 실행 중: 포트 ' + PORT + ' · 주소 ' + runtime.baseUrl() + ' · 시간대 ' + process.env.TZ);
  // 서버를 켠 직후 첫 사용자가 시트 읽는 시간을 떠안지 않도록, 포털이 읽는 탭을 미리 읽어 둡니다
  if (process.env.DISABLE_WARMUP !== '1') {
    setTimeout(() => {
      const t0 = Date.now();
      try { runtime.run((api) => api.웜업_()); console.log('[웜업] 포털 탭 미리 읽기 ' + (Date.now() - t0) + 'ms'); }
      catch (e) { console.log('[웜업 실패 — 첫 요청이 조금 느릴 수 있습니다]', e.message); }
    }, 300);
  }
  if (process.env.DISABLE_SCHEDULER !== '1') {
    scheduler.start((fn) => runJob(fn));
  }
});
