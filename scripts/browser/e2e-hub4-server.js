/** Hub v4 시험용 서버 — e2e-full-server 와 같지만 유튜브 · 구글 이미지 검색과 그림 내려받기를 가짜로 대답합니다 (진짜 인터넷 없이) */
const path = require('path');
process.env.TZ = 'America/Toronto';
Object.assign(process.env, { YOUTUBE_API_KEY: 'TESTKEY-yt', GOOGLE_CSE_CX: 'cx-test' });
const BRIDGE = require.resolve('../../lib/bridge');
// e2e-full-server 가 다리를 가짜로 바꾸므로, 먼저 불러 온 뒤 call 만 덧씌웁니다
require('./e2e-full-server.js');
const stub = require.cache[BRIDGE].exports, baseCall = stub.call;
const PNG = require('./mkpng').mkpng(300, 400);
const json = (o, status) => ({ status: status || 200, headers: { 'content-type': 'application/json' }, bytes: Buffer.from(JSON.stringify(o)) });
global.__net = { calls: [], imageFail: false };
stub.call = (op, a) => {
  if (op === 'fetch') {
    global.__net.calls.push(a.url);
    if (/youtube\/v3\/search/.test(a.url)) return json({ nextPageToken: 'N1', items: [
      { id: { videoId: 'aaaaaaaaaaa' }, snippet: { title: '주님의 사랑 (Live)', channelTitle: '마커스워십', publishedAt: '2019-05-02T00:00:00Z', thumbnails: {} } },
      { id: { videoId: 'bbbbbbbbbbb' }, snippet: { title: '주님의 사랑 어쿠스틱', channelTitle: '어노인팅', publishedAt: '2021-01-01T00:00:00Z', thumbnails: {} } }] });
    if (/youtube\/v3\/videos/.test(a.url)) return json({ items: [{ id: 'aaaaaaaaaaa', contentDetails: { duration: 'PT4M13S' }, statistics: { viewCount: '123456' } }, { id: 'bbbbbbbbbbb', contentDetails: { duration: 'PT5M2S' }, statistics: {} }] });
    if (/customsearch\/v1/.test(a.url)) return json({ queries: {}, items: [
      { link: 'https://img.example.com/score1.png', title: '악보 1', image: { thumbnailLink: 'https://t.example.com/s1.png', width: 1200, height: 1600, contextLink: 'https://page.example.com/x' } },
      { link: 'https://img.example.com/score2.png', title: '악보 2', image: { thumbnailLink: 'https://t.example.com/s2.png', width: 800, height: 1000 } }] });
    throw new Error('예상 못한 주소 ' + a.url);
  }
  if (op === 'fetchImage') {
    if (global.__net.imageFail) throw new Error('그림을 받지 못했습니다 (403)');
    return { bytes: new Uint8Array(PNG), type: 'image/png' };
  }
  return baseCall(op, a);
};
