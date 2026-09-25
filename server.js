/**
 * 토론토영락교회 청년1부 — Render 서버
 * ------------------------------------------------------------
 *   /?page=portal | leader | admin | newfamily | team | expense | worship | mission
 *                         화면 (예전 Apps Script 웹앱 주소와 같은 ?page= 규칙)
 *   POST /api/<함수이름>   화면에서 서버 함수 호출 (public/app.js 의 callServer)
 *   /tasks?key=관리자키    관리 작업 (예전 시트 메뉴 '셀보고 관리')
 *   /cron/<작업>?secret=   자동 발송을 바깥에서 깨워 부르기
 *   /healthz               서버 상태 확인
 */
process.env.TZ = process.env.TZ || 'America/Toronto';   // 날짜 계산을 시트 시간대와 맞춥니다 (가장 먼저)

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const runtime = require('./lib/runtime');
const pages = require('./lib/pages');
const scheduler = require('./lib/scheduler');
const tasks = require('./lib/tasks');

runtime.setScheduleSource(scheduler.names);

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

/** 화면 → 서버 함수 */
app.post('/api/:fn', (req, res) => {
  const fn = req.params.fn;
  const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];
  if (!runtime.isCallable(fn)) return res.json({ ok: false, error: '알 수 없는 요청입니다: ' + fn });
  const t0 = Date.now();
  try {
    const { result } = runtime.run((api) => api[fn].apply(null, args));
    res.json({ ok: true, result });
  } catch (e) {
    if (!(e && e.message && /[가-힣]/.test(e.message))) console.error('[' + fn + ']', e);
    res.json({ ok: false, error: (e && e.message) || String(e) });
  } finally {
    const ms = Date.now() - t0;
    if (ms > 3000) console.log('[느림]', fn, ms + 'ms');
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
const bridge = require('./lib/bridge');
const { Readable } = require('stream');
const audioOk = new Map();
app.get('/audio/:id', async (req, res) => {
  const id = String(req.params.id || '');
  try {
    const hit = audioOk.get(id);
    if (!hit || hit < Date.now()) {
      const { result } = runtime.run((api) => api.녹음파일허용_(id));
      if (!result) return res.status(404).send('not found');
      audioOk.set(id, Date.now() + 10 * 60 * 1000);
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
    res.setHeader('cache-control', 'private, max-age=3600');
    Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
  } catch (e) {
    console.error('[audio]', e.message);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('서버 실행 중: 포트 ' + PORT + ' · 주소 ' + runtime.baseUrl() + ' · 시간대 ' + process.env.TZ);
  if (process.env.DISABLE_SCHEDULER !== '1') {
    scheduler.start((fn) => runtime.run((api) => api[fn]()));
  }
});
