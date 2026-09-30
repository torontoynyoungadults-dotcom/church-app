/**
 * 별도 스레드에서 도는 작업자 — 구글 API · 메일 · 외부 요청처럼 "기다려야 하는" 일을 맡습니다.
 * 본 스레드(lib/bridge.js)는 이 작업이 끝날 때까지 잠깐 멈춰 기다리므로,
 * 옛 Code.gs 로직을 순서 그대로(동기식으로) 실행할 수 있습니다.
 */
const { runAsWorker } = require('synckit');
const { Readable } = require('stream');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
];

let auth = null;
function getAuth() {
  if (auth) return auth;
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET,
    refresh = process.env.GOOGLE_REFRESH_TOKEN;
  if (id && secret && refresh) {
    // 권장: 청년부 구글 계정으로 로그인한 권한 (Apps Script 가 돌던 계정과 같은 권한)
    const o = new google.auth.OAuth2(id, secret);
    o.setCredentials({ refresh_token: refresh });
    auth = o;
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: SCOPES,
    });
  } else {
    throw new Error('구글 인증 정보가 없습니다. GOOGLE_REFRESH_TOKEN (또는 GOOGLE_SERVICE_ACCOUNT) 환경 변수를 넣어주세요.');
  }
  return auth;
}

const clients = {};
function client(svc, version) {
  const k = svc + version;
  if (!clients[k]) clients[k] = google[svc]({ version, auth: getAuth() });
  return clients[k];
}

/**
 * 메일 보내는 길
 *  - 'api'  : Gmail API (청년부 계정 토큰으로, https 443) — 기본
 *  - 'smtp' : Gmail SMTP (앱 비밀번호) — 유료 요금제에서 MAIL_VIA=smtp 로 켤 때만
 */
function mailVia() {
  if (String(process.env.MAIL_VIA || '').toLowerCase() === 'smtp') return 'smtp';
  if (process.env.GOOGLE_REFRESH_TOKEN) return 'api';
  return process.env.GMAIL_APP_PASSWORD ? 'smtp' : 'api';
}

/** 보내는 사람 주소 — GMAIL_USER 가 없으면 비워 두고 Gmail 이 토큰 주인 주소로 채웁니다 */
async function senderAddress() { return process.env.GMAIL_USER || ''; }

let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('메일 설정이 없습니다. GMAIL_USER · GMAIL_APP_PASSWORD 환경 변수를 넣어주세요.');
  mailer = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass: String(pass).replace(/\s+/g, '') },
    // 막혀 있으면 오래 붙잡지 말고 바로 알려줍니다
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
  return mailer;
}

function toBuf(x) {
  if (x == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(x)) return x;
  if (x instanceof Uint8Array) return Buffer.from(x.buffer, x.byteOffset, x.byteLength);
  return Buffer.from(String(x), 'utf8');
}

/** 응답 머리글을 보통 객체로 — fetch 의 Headers 는 스레드 사이로 넘길 수 없어 서버가 멈춥니다 */
function plainHeaders(h) {
  const o = {};
  if (!h) return o;
  if (typeof h.forEach === 'function' && typeof h.get === 'function') { h.forEach((v, k) => { o[k] = String(v); }); return o; }
  Object.keys(h).forEach((k) => { o[k] = String(h[k]); });
  return o;
}

/* ------------------------------------------------------------------
 * 악보 이미지 가져오기 (Step 13) — 서버가 남의 사이트 그림을 대신 받아 옵니다.
 * 주소는 화면에서 오는 값이므로 서버 안쪽 주소(내부망 · 메타데이터 서버)를 부르지 못하게 막습니다:
 *   ① https 만  ② IP 주소 직접 입력 금지  ③ 이름을 풀어 본 주소가 사설 · 루프백 · 링크로컬이면 거절 (연결도 그 검사한 주소로 — 중간에 바뀌지 않게)
 *   ④ 리다이렉트는 직접 따라가며 매번 다시 검사 (최대 3번)  ⑤ 15초 · 12MB 한도  ⑥ 그림(jpeg · png · webp · gif)만 — svg 는 스크립트가 들어갈 수 있어 거절
 * ------------------------------------------------------------------ */
const dns = require('dns');
const https = require('https');
const net = require('net');
const IMG_MAX_BYTES = 12 * 1024 * 1024;

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
      (p[0] === 192 && p[1] === 0 && p[2] === 0) || (p[0] === 198 && (p[1] === 18 || p[1] === 19));
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    let m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (m) return privateIp(m[1]);
    m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
    if (m) { const a = parseInt(m[1], 16), b = parseInt(m[2], 16); return privateIp([a >> 8, a & 255, b >> 8, b & 255].join('.')); }
    return /^(fc|fd|fe[89ab])/.test(s) || /^ff/.test(s);
  }
  return true;
}
function imageKind(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 7 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 5 && buf.slice(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (buf.length > 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return '';
}
function guardedLookup(host, opts, cb) {
  dns.lookup(host, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs || !addrs.length || addrs.some((x) => privateIp(x.address))) return cb(new Error('허용되지 않는 주소입니다.'));
    if (opts && opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
function checkImageUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch (e) { throw new Error('그림 주소가 올바르지 않습니다.'); }
  if (u.protocol !== 'https:') throw new Error('https 주소의 그림만 가져올 수 있습니다.');
  if (u.username || u.password) throw new Error('그림 주소가 올바르지 않습니다.');
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, ''))) throw new Error('그림 주소가 올바르지 않습니다.');
  if (u.port && u.port !== '443') throw new Error('그림 주소가 올바르지 않습니다.');
  return u;
}
function getOnce(u, referer) {
  return new Promise((resolve, reject) => {
    let done = false;
    const fin = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; YNChurchApp/1.0)', Accept: 'image/jpeg,image/png,image/webp,image/gif,*/*;q=0.5', 'Accept-Encoding': 'identity' };
    if (referer) headers.Referer = referer;
    const req = https.request({ protocol: 'https:', hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET', headers, lookup: guardedLookup }, (res) => {
      const st = res.statusCode || 0;
      if (st >= 300 && st < 400 && res.headers.location) { res.resume(); return fin(resolve, { redirect: new URL(res.headers.location, u).toString() }); }
      if (st !== 200) { res.resume(); return fin(reject, new Error('그림을 받지 못했습니다 (' + st + ')')); }
      const len = Number(res.headers['content-length'] || 0);
      if (len > IMG_MAX_BYTES) { res.resume(); return fin(reject, new Error('그림이 너무 큽니다 (12MB 까지).')); }
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > IMG_MAX_BYTES) { req.destroy(); return fin(reject, new Error('그림이 너무 큽니다 (12MB 까지).')); } chunks.push(c); });
      res.on('end', () => fin(resolve, { body: Buffer.concat(chunks), type: String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase() }));
      res.on('error', (e) => fin(reject, e));
    });
    const timer = setTimeout(() => { req.destroy(); fin(reject, new Error('그림을 받는 데 너무 오래 걸립니다.')); }, 15000);
    req.on('error', (e) => fin(reject, e));
    req.end();
  });
}
async function fetchImageSafe(url, referer) {
  let u = checkImageUrl(url);
  for (let hop = 0; hop < 4; hop++) {
    const r = await getOnce(u, referer && /^https:\/\//i.test(referer) ? referer : '');
    if (r.redirect) { u = checkImageUrl(r.redirect); continue; }
    const kind = imageKind(r.body);
    if (!kind) throw new Error('그림 파일(jpg · png · webp · gif)이 아닙니다.');
    return { bytes: new Uint8Array(r.body), type: kind };
  }
  throw new Error('그림 주소가 너무 여러 번 넘어갑니다.');
}

function errOut(e) {
  const g = e && e.response && e.response.data && e.response.data.error;
  const msg = (g && (g.message || g.error_description || g)) || (e && e.message) || String(e);
  return { __error: typeof msg === 'string' ? msg : JSON.stringify(msg), code: (e && (e.code || (e.response && e.response.status))) || 0 };
}

async function handle(op, a) {
  switch (op) {
    /* 구글 API 한 번 부르기 — svc: 'sheets' | 'drive' | 'calendar', method: 'spreadsheets.values.batchGet' 등 */
    case 'call': {
      let fn = client(a.svc, a.version);
      const parts = a.method.split('.');
      let owner = fn;
      for (const p of parts) { owner = fn; fn = fn[p]; }
      if (typeof fn !== 'function') throw new Error('없는 API: ' + a.svc + '.' + a.method);
      const params = Object.assign({}, a.params);
      if (a.media) params.media = { mimeType: a.media.mimeType, body: Readable.from(toBuf(a.media.data)) };
      const opts = a.binary ? { responseType: 'arraybuffer' } : {};
      const res = await fn.call(owner, params, opts);
      if (a.binary) return { bytes: new Uint8Array(res.data), headers: plainHeaders(res.headers) };
      return res.data;
    }
    case 'token': {
      const t = await getAuth().getAccessToken();
      return typeof t === 'string' ? t : (t && t.token) || '';
    }
    case 'fetch': {
      const init = { method: a.method || 'GET', headers: a.headers || {}, redirect: 'follow' };
      if (a.body != null) init.body = typeof a.body === 'string' ? a.body : toBuf(a.body);
      const r = await fetch(a.url, init);
      const buf = new Uint8Array(await r.arrayBuffer());
      const headers = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      return { status: r.status, headers, bytes: buf };
    }
    case 'fetchImage': return fetchImageSafe(a.url, a.referer);
    case 'mail': {
      const m = a;
      const sender = await senderAddress();
      const msg = {
        from: sender ? (m.name ? { name: m.name, address: sender } : sender) : undefined,
        to: m.to, cc: m.cc || undefined, bcc: m.bcc || undefined,
        replyTo: m.replyTo || undefined, subject: m.subject || '',
        text: m.body || undefined, html: m.htmlBody || undefined,
        attachments: (m.attachments || []).map((x) => ({
          filename: x.name, contentType: x.contentType, content: toBuf(x.data),
        })),
      };
      if (mailVia() === 'smtp') {
        const info = await getMailer().sendMail(msg);
        return { id: info.messageId };
      }
      // Gmail API (https) — Render 무료 요금제는 SMTP 포트를 막아서 이쪽이 기본입니다
      const built = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' }).sendMail(msg);
      const raw = Buffer.from(built.message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try {
        const r = await client('gmail', 'v1').users.messages.send({ userId: 'me', requestBody: { raw } });
        return { id: r.data.id };
      } catch (e) {
        const t = errOut(e).__error;
        if (/insufficient|scope|permission/i.test(t)) {
          throw new Error('메일 보낼 권한이 토큰에 없습니다. npm run auth 로 리프레시 토큰을 다시 받아 Render 의 GOOGLE_REFRESH_TOKEN 을 바꿔주세요.');
        }
        if (/has not been used|disabled/i.test(t)) {
          throw new Error('Gmail API 가 꺼져 있습니다. Google Cloud Console → API 라이브러리에서 Gmail API 를 사용으로 바꿔주세요.');
        }
        throw e;
      }
    }
    /* 웹 푸시 열쇠 한 쌍 만들기 (처음 한 번만) */
    /* 제미나이(Gemini) — 열쇠는 서버 환경변수에만 두고, 로직에는 넘기지 않습니다 */
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY || '';
      if (!key) throw new Error('GEMINI_API_KEY 가 설정되어 있지 않습니다.');
      const model = String(a.model || 'gemini-2.5-flash').replace(/^models\//, '');
      const body = {
        contents: [{ role: 'user', parts: [{ text: String(a.prompt || '') }] }],
        generationConfig: {
          temperature: a.temperature == null ? 0.4 : Number(a.temperature),
          maxOutputTokens: Number(a.maxTokens) || 2048,
          responseMimeType: a.json ? 'application/json' : 'text/plain'
        }
      };
      if (a.system) body.systemInstruction = { parts: [{ text: String(a.system) }] };
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) + ':generateContent';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body)
      });
      const txt = await r.text();
      let d = {};
      try { d = JSON.parse(txt); } catch (e) { d = {}; }
      if (!r.ok) {
        const msg = (d && d.error && d.error.message) || ('AI 응답 오류 (' + r.status + ')');
        throw new Error(msg);
      }
      const cand = (d.candidates || [])[0] || {};
      const parts = (cand.content && cand.content.parts) || [];
      const out = parts.map((x) => x.text || '').join('').trim();
      if (!out) {
        const why = cand.finishReason || (d.promptFeedback && d.promptFeedback.blockReason) || '';
        throw new Error('AI 가 답을 만들지 못했습니다.' + (why ? ' (' + why + ')' : ''));
      }
      return { text: out, model: model };
    }
    case 'geminiModels': {
      const key = process.env.GEMINI_API_KEY || '';
      if (!key) return { models: [], noKey: true };
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
        { headers: { 'x-goog-api-key': key } });
      if (!r.ok) return { models: [], error: 'AI 모델 목록을 읽지 못했습니다 (' + r.status + ').' };
      const d = await r.json();
      const models = (d.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1)
        .map((m) => ({
          name: String(m.name || '').replace(/^models\//, ''),
          label: m.displayName || '',
          desc: m.description || ''
        }))
        .filter((m) => m.name && !/embedding|aqa|imagen|veo|tts|image|audio/i.test(m.name));
      return { models: models };
    }
    case 'vapid': {
      const webpush = require('web-push');
      return webpush.generateVAPIDKeys();
    }
    /* 웹 푸시 — 여러 기기에 한꺼번에(동시에) 보냅니다.
       기기가 사라졌으면 gone: true 로 알려주어 명단에서 지울 수 있게 합니다 */
    case 'push': {
      const webpush = require('web-push');
      webpush.setVapidDetails(a.subject || 'mailto:noreply@ynchurch.com', a.publicKey, a.privateKey);
      const body = JSON.stringify(a.payload || {});
      const list = a.subscriptions || [];
      const results = await Promise.all(list.map(async (s) => {
        try {
          await webpush.sendNotification(s, body, { TTL: a.ttl || 86400 });
          return { ok: true };
        } catch (e) {
          const code = (e && e.statusCode) || 0;
          return { ok: false, gone: code === 404 || code === 410, code: code, error: (e && e.message) || String(e) };
        }
      }));
      return { results };
    }
    default:
      throw new Error('알 수 없는 작업: ' + op);
  }
}

// 개발용: 진짜 구글 대신 가짜 백엔드로 시험할 때만 씁니다
const impl = process.env.MOCK_GOOGLE_MODULE ? require(process.env.MOCK_GOOGLE_MODULE) : handle;

runAsWorker(async (op, args) => {
  let out;
  try { out = await impl(op, args); } catch (e) { return errOut(e); }
  // 넘길 수 없는 값이 섞여 있으면 멈추지 말고 오류로 돌려줍니다
  try { structuredClone(out); } catch (e) {
    return { __error: '서버 내부 오류 (' + op + '): 결과를 전달하지 못했습니다 — ' + e.message, code: 0 };
  }
  return out;
});
