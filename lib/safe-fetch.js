/**
 * 악보 이미지 안전 다운로드 (Step 13) — lib/worker.js 의 'fetchImage' 가 씁니다. 순수 Node 모듈이라 시험에서 바로 부를 수 있습니다.
 */
/* ------------------------------------------------------------------
 * 서버가 남의 사이트 그림을 대신 받아 옵니다.
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

module.exports = { fetchImageSafe, checkImageUrl, privateIp, imageKind, IMG_MAX_BYTES };
