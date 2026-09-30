/** 브라우저 시험용 작은 서버 — 실제 lib/realtime.js + 가짜 인증 · 저장소 + 시험용 PDF */
const http = require('http'), fs = require('fs'), path = require('path');
const realtime = require('../../lib/realtime');
const { mkpdf, SAMPLE, MULTI } = require('./mkpdf');
const ROOT = path.join(__dirname, '..', '..');
const USERS = { tokA: { name: 'Alice', canEdit: true, canLead: true, committee: false, admin: false }, tokB: { name: 'Bob', canEdit: false, canLead: false }, tokC: { name: 'Carol', canEdit: true, canLead: true } };
const store = { team: {}, mine: {}, saves: [], calls: [], callLog: [], follow: {} };
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
const MK = require('./mksheet');
const pdf = mkpdf(SAMPLE), pdfMulti = mkpdf(MULTI), pdfLead = MK.mkSheetPdf(MK.layout().prims);
let scanPng = null;
function harness() {
  const scripts = ['formb', 'wakelock', 'metro', 'pitch', 'harmony-core', 'omr', 'harmony-ui', 'lyrics', 'ytplayer', 'rt', 'anno', 'practice-panels', 'practice', 'stats'].map((n) => `<script src="/worship/${n}.js"></script>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/worship/hub.css"><style>body{margin:0;background:#222;color:#eee;font-family:sans-serif}</style>
<script src="/socket.io/socket.io.js"></script>${scripts}
<script>
window.callServer = function (name, args, ok, fail) {
  fetch('/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: args }) })
    .then(function (r) { return r.json(); }).then(function (j) { j.error ? fail && fail(new Error(j.error)) : ok && ok(j.result); }, function (e) { fail && fail(e); });
};
window.OPEN = function (o) {
  var q = new URLSearchParams(location.search); o = o || {};
  return YNPractice.open(Object.assign({ token: q.get('t') || 'tokA', room: '2026-09-27', canEdit: q.get('t') !== 'tokB',
    sheets: [{ id: 'FILEID_AAAAAAA1', name: 'Amazing Grace.pdf' }, { id: 'FILEID_BBBBBBB2', name: 'Second Song.pdf' }],
    songs: [{ title: 'Amazing Grace', key: 'G', bpm: 120, form: 'V1-C-V2-C-B-C', team: 'Test' }, { title: 'Second Song', key: 'Bb', bpm: 90, form: 'Intro-V-C', team: '' }],
    callServer: callServer }, o));
};
</script></head><body><button id="go" onclick="window.__pv=OPEN()">open</button></body></html>`;
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  if (p === '/h.html') { res.setHeader('content-type', MIME['.html']); return res.end(harness()); }
  if (p.startsWith('/sheet/') && p.indexOf('SCAN') >= 0 && scanPng) { res.setHeader('content-type', 'image/png'); return res.end(scanPng); }
  if (p.startsWith('/sheet/') && p.indexOf('LEAD') >= 0) { res.setHeader('content-type', 'application/pdf'); return res.end(pdfLead); }
  if (p.startsWith('/sheet/')) { res.setHeader('content-type', 'application/pdf'); return res.end(p.indexOf('MULTI') >= 0 ? pdfMulti : pdf); }
  if (p === '/__store') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(store)); }
  if (p.startsWith('/api/') && req.method === 'POST') {
    let b = ''; req.on('data', (d) => b += d); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      try {
        const args = JSON.parse(b).args || [], fn = p.slice(5); store.calls.push(fn); store.callLog.push({ fn, args: args.slice(1) });
        const me = (USERS[args[0]] || {}).name;
        if (!me) throw new Error('권한이 없습니다.');
        if (fn === 'worshipAnnoLoad') { const k = args[1] + '|' + args[2]; return res.end(JSON.stringify({ result: { team: store.team[k] || [], mine: store.mine[k + '|' + me] || [], me, canEdit: !!USERS[args[0]].canEdit } })); }
        if (fn === 'worshipAnnoSaveMine') { store.mine[args[1] + '|' + args[2] + '|' + me] = args[3]; return res.end(JSON.stringify({ result: { ok: true } })); }
        /* Step 2.11 — 내 따라가기 상태(follow)만 저장 · 불러오기 흉내 (나머지 설정은 예전처럼 "unknown") */
        if (fn === 'worshipCfgSave' && args[3] === 'follow') { const k = args[1] + '|' + me; if (args[5] == null) delete store.follow[k]; else store.follow[k] = { page: args[5].page !== false, metro: args[5].metro !== false }; return res.end(JSON.stringify({ result: { ok: true, layer: 'mine', value: store.follow[k] || null } })); }
        if (fn === 'worshipCfgLoad' && store.follow[args[1] + '|' + me]) return res.end(JSON.stringify({ result: { team: [], mine: [{ kind: 'follow', key: 'sync', value: store.follow[args[1] + '|' + me] }], songs: [], me, canEdit: !!USERS[args[0]].canEdit } }));
        throw new Error('unknown ' + fn);
      } catch (e) { res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }
  const f = path.join(ROOT, 'public', p);
  if (f.startsWith(path.join(ROOT, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); return fs.createReadStream(f).pipe(res); }
  res.statusCode = 404; res.end('nf');
});
const rt = realtime.attach(server, {
  auth: (t) => { const u = USERS[t]; if (!u) throw new Error('접근 권한이 없습니다.'); return Object.assign({ committee: false, admin: false }, u); },
  loadAnno: (f, s) => (store.team[f + '|' + s] || []).slice(),
  saveAnno: (f, s, items, by) => { store.team[f + '|' + s] = items; store.saves.push({ f, s, n: items.length }); },
  log: () => {},
}, { limits: { saveDelayMs: 600, saveGapMs: 100 } });
module.exports = { server, rt, store, setScan: (b) => { scanPng = b; }, start: (port) => new Promise((r) => server.listen(port, () => r(server.address().port))) };
if (require.main === module) module.exports.start(process.env.PORT || 4177).then((p) => console.log('listening', p));
