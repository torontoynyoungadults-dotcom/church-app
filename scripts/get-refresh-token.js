/**
 * 청년부 구글 계정의 "리프레시 토큰"을 한 번 받아 오는 도구입니다. (내 컴퓨터에서 한 번만 실행)
 *
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run auth
 *
 * 1. 브라우저에 나오는 주소를 열고, 반드시 **청년부 구글 계정**으로 로그인해 허용합니다.
 * 2. 터미널에 찍히는 GOOGLE_REFRESH_TOKEN 값을 Render 환경 변수에 넣습니다.
 *
 * 클라이언트는 Google Cloud Console → API 및 서비스 → 사용자 인증 정보 →
 * "OAuth 클라이언트 ID 만들기" → 유형 **데스크톱 앱** 으로 만듭니다.
 */
const http = require('http');
const { google } = require('googleapis');

const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
if (!id || !secret) {
  console.error('GOOGLE_CLIENT_ID 와 GOOGLE_CLIENT_SECRET 을 함께 넣어 실행해주세요.\n' +
    '예) GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy npm run auth');
  process.exit(1);
}

const PORT = 53682;
const redirect = 'http://127.0.0.1:' + PORT;
const oauth = new google.auth.OAuth2(id, secret, redirect);
const url = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.send',
  ],
});

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get('code');
  if (!code) { res.end('code 가 없습니다.'); return; }
  try {
    const { tokens } = await oauth.getToken(code);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h2>완료했습니다. 터미널로 돌아가세요.</h2>');
    console.log('\n아래 값을 Render 환경 변수 GOOGLE_REFRESH_TOKEN 에 넣어주세요:\n');
    console.log(tokens.refresh_token || '(리프레시 토큰이 오지 않았습니다 — myaccount.google.com/permissions 에서 이 앱 권한을 지우고 다시 실행해주세요)');
    console.log('');
  } catch (e) {
    res.end('실패: ' + e.message);
    console.error(e.message);
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n이 주소를 브라우저에서 열고 청년부 구글 계정으로 로그인해주세요:\n\n' + url + '\n');
});
