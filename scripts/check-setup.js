/**
 * 설정 점검 — 환경 변수와 구글 연결이 제대로 됐는지 확인합니다.
 *   npm run check          (Render 의 Shell 탭이나 내 컴퓨터에서)
 */
process.env.TZ = process.env.TZ || 'America/Toronto';
const bridge = require('../lib/bridge');

const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { console.log('  ✗ ' + m); process.exitCode = 1; };

console.log('\n[환경 변수]');
['SPREADSHEET_ID', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'CRON_SECRET'].forEach((k) =>
  (process.env[k] ? ok(k) : bad(k + ' 가 없습니다')));
if (process.env.GOOGLE_REFRESH_TOKEN) ok('구글 인증: 청년부 계정 (리프레시 토큰)');
else if (process.env.GOOGLE_SERVICE_ACCOUNT) ok('구글 인증: 서비스 계정 (파일 올리기는 막힐 수 있습니다 — README 참고)');
else bad('GOOGLE_REFRESH_TOKEN (또는 GOOGLE_SERVICE_ACCOUNT) 가 없습니다');
console.log('  · 앱 주소: ' + (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '(없음 — Render 에서는 자동으로 잡힙니다)'));

console.log('\n[구글 시트]');
try {
  const d = bridge.sheets('spreadsheets.get', { spreadsheetId: process.env.SPREADSHEET_ID, fields: 'properties(title,timeZone),sheets(properties(title))' });
  ok('"' + d.properties.title + '" · 시트 ' + d.sheets.length + '개 · 시간대 ' + d.properties.timeZone);
  if (d.properties.timeZone !== process.env.TZ) bad('시트 시간대(' + d.properties.timeZone + ')와 서버 TZ(' + process.env.TZ + ')가 다릅니다. TZ 환경 변수를 시트와 같게 맞춰주세요.');
} catch (e) { bad('시트를 열 수 없습니다: ' + e.message); }

console.log('\n[구글 드라이브]');
try {
  const f = bridge.drive('files.get', { fileId: process.env.SPREADSHEET_ID, fields: 'name,modifiedTime', supportsAllDrives: true });
  ok('드라이브 접근 가능 (시트 수정 시각 ' + f.modifiedTime + ')');
} catch (e) { bad('드라이브 접근 실패: ' + e.message); }

console.log('\n[구글 인증 토큰]');
try { ok('토큰 받음 (' + String(bridge.call('token')).slice(0, 8) + '…)'); } catch (e) { bad(e.message); }
console.log('');
