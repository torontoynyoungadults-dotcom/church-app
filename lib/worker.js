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
      if (a.binary) return { bytes: new Uint8Array(res.data), headers: res.headers || {} };
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
    default:
      throw new Error('알 수 없는 작업: ' + op);
  }
}

// 개발용: 진짜 구글 대신 가짜 백엔드로 시험할 때만 씁니다
const impl = process.env.MOCK_GOOGLE_MODULE ? require(process.env.MOCK_GOOGLE_MODULE) : handle;

runAsWorker(async (op, args) => {
  try { return await impl(op, args); } catch (e) { return errOut(e); }
});
