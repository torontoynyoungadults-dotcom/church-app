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

runtime.setScheduleSource(scheduler.names);
// 발송 요일 · 시각은 설정 시트에서 읽어옵니다 (관리 화면에서 바꿉니다)
scheduler.setScheduleReader(() => {
  try { return runtime.run((api) => api.알림일정_()).result; } catch (e) { return null; }
});

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
    runtime.run((api) => api[job]());
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
    scheduler.start((fn) => runtime.run((api) => api[fn]()));
  }
});
