/**
 * 화면 그리기 — views/*.html 에 공통 모양(Theme)과 PREFILL 값을 넣어 보냅니다.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'views');
const cache = {};

function load(file) {
  if (cache[file] && process.env.NODE_ENV === 'production') return cache[file];
  const p = path.join(DIR, file + '.html');
  if (!/^[A-Za-z]+$/.test(file) || !fs.existsSync(p)) throw new Error('없는 화면입니다: ' + file);
  let html = fs.readFileSync(p, 'utf8');
  html = html.replace(/<!--#include ([A-Za-z]+)-->/g, (m, name) => fs.readFileSync(path.join(DIR, name + '.html'), 'utf8'));
  cache[file] = html;
  return html;
}

const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON 을 <script> 안에 안전하게 */
const jsonForScript = (v) => JSON.stringify(v == null ? {} : v)
  .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function render(page) {
  const html = load(page.file);
  const head =
    '\n<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '\n<title>' + escHtml(page.title) + '</title>' +
    (page.favicon
      ? '\n<link rel="icon" href="' + escHtml(page.favicon) + '">'
      : '\n<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">' +
        '\n<link rel="shortcut icon" href="/favicon.ico">') +
    '\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">' +
    '\n<link rel="manifest" href="/site.webmanifest">' +
    '\n<meta name="theme-color" content="#1C1C1C">' +
    // 허브 v5 — 밝은/어두운 화면: 그리기 전에 저장해 둔 모양을 먼저 입혀 깜빡임이 없게 (기본은 어두운 화면)
    '\n<script>try{var __t=localStorage.getItem("ynTheme");if(__t==="light"){document.documentElement.setAttribute("data-theme","light");}}catch(e){}</script>' +
    '\n<script>window.__PREFILL__ = ' + jsonForScript(page.params) + ';</script>' +
    '\n<script src="/offline.js"></script>' +
    '\n<script src="/app.js"></script>' +
    '\n<meta name="mobile-web-app-capable" content="yes">' +
    '\n<meta name="apple-mobile-web-app-capable" content="yes">' +
    '\n<meta name="apple-mobile-web-app-title" content="Teva">' +     // v6.1 — 홈 화면에 추가할 때 기본 이름
    '\n<meta name="application-name" content="Teva">' +
    '\n<script src="/pwa-install.js"></script>';
  if (/<meta charset="utf-8">/i.test(html)) return html.replace(/<meta charset="utf-8">/i, (m) => m + head);
  return html.replace(/<head>/i, (m) => m + '\n<meta charset="utf-8">' + head);
}

module.exports = { render, escHtml };
