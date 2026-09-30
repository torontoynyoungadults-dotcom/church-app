/**
 * 토론토영락교회 청년1부 — 알림(푸시) + 오프라인 일꾼.
 *
 * ① 알림: 브라우저가 앱을 닫아둔 사이에도 이 파일이 대신 깨어나 알림을 띄웁니다.
 * ② 오프라인 (Step 3.2): 인터넷이 끊겨도 예배 화면이 열리도록 화면 파일 · 페이지 · 악보를 보관합니다.
 *      · 화면 파일(js/css/이미지) · 페이지 : 늘 서버에서 새로 받고, 못 받을 때만 보관해 둔 것을 씁니다
 *      · 악보(/sheet/<id>) : 한 번 받으면 기기에 보관해 두고 바로 보여 줍니다 (Range 요청도 처리)
 *      · 서버 호출(/api) · 녹음 · 실시간 연결은 손대지 않습니다 (콘티 · 필기의 기기 보관은 화면 쪽 offline.js)
 */
var VER = 'v2';
var SHELL = 'yn-shell-' + VER, PAGES = 'yn-pages-v1', SHEETS = 'yn-sheets-v1';
var KEEP = [SHELL, PAGES, SHEETS];
var PAGES_MAX = 30;
var PRE = ['/offline.js', '/app.js', '/pwa-install.js', '/site.webmanifest', '/icon-192.png', '/favicon.png',
  '/socket.io/socket.io.js',
  '/worship/formb.js', '/worship/wakelock.js', '/worship/metro.js', '/worship/pitch.js', '/worship/lyrics.js', '/worship/hubtools.js',
  '/worship/ytplayer.js', '/worship/rt.js', '/worship/anno.js', '/worship/practice-panels.js', '/worship/practice.js', '/worship/stats.js',
  '/worship/hub.css', '/vendor/pdfjs/pdf.min.js', '/vendor/pdfjs/pdf.worker.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      return Promise.all(PRE.map(function (u) { return c.add(u).catch(function () {}); }));   // 하나가 없어도 설치는 계속
    }).catch(function () {}).then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return KEEP.indexOf(k) < 0 && /^yn-/.test(k); }).map(function (k) { return caches.delete(k); })); })
      .catch(function () {}).then(function () { return self.clients.claim(); })
  );
});

function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#1C1C1C;color:#fff;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">' +
    '<div><h3 style="margin:0 0 8px;">인터넷 연결을 확인해주세요</h3>' +
    '<p style="color:#BDB8B1;margin:0;">연결되면 새로고침해주세요.<br>한 번 열어 본 예배 화면은 연결 없이도 열립니다.</p></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** 서버 먼저 · 못 받으면(또는 timeout 안에 못 받으면) 보관해 둔 것 */
function netFirst(req, cacheName, timeout, key) {
  return caches.open(cacheName).then(function (cache) {
    var k = key || req;
    var net = fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type !== 'opaque') { var cp = res.clone(); cache.put(k, cp).then(function () { return trim(cache, cacheName); }).catch(function () {}); }
      return res;
    });
    net.catch(function () {});                                                                                 // 못 받아도 조용히 (아래에서 보관본으로 대신)
    var timed = new Promise(function (resolve) {
      if (!timeout) return;
      setTimeout(function () { cache.match(k).then(function (hit) { if (hit) resolve(hit); }); }, timeout);   // 느린 인터넷: 보관본이 있으면 먼저 보여 줌
    });
    return Promise.race([net, timed].filter(Boolean)).catch(function () {
      return cache.match(k).then(function (hit) { if (hit) return hit; return net; });
    }).catch(function () { return cache.match(k); });
  });
}
function trim(cache, name) {
  if (name !== PAGES) return null;
  return cache.keys().then(function (ks) { var over = ks.length - PAGES_MAX; return over > 0 ? Promise.all(ks.slice(0, over).map(function (k) { return cache.delete(k); })) : null; });
}

/** 보관해 둔 악보 전체를 Range 요청(부분 요청)에 맞게 잘라 줌 */
function rangeFrom(hit, range) {
  var m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
  if (!m) return hit;
  return hit.arrayBuffer().then(function (buf) {
    var total = buf.byteLength, start = m[1] === '' ? Math.max(0, total - parseInt(m[2], 10)) : parseInt(m[1], 10);
    var end = m[1] === '' || m[2] === '' ? total - 1 : Math.min(parseInt(m[2], 10), total - 1);
    if (isNaN(start) || start >= total || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
    return new Response(buf.slice(start, end + 1), { status: 206, headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(end - start + 1),
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes' } });
  });
}
function sheetFetch(event) {
  var req = event.request, url = new URL(req.url).pathname;
  return caches.open(SHEETS).then(function (c) {
    return c.match(url).then(function (hit) {
      if (hit) return req.headers.get('range') ? rangeFrom(hit, req.headers.get('range')) : hit;                 // 보관본이 있으면 바로
      return fetch(req).then(function (res) {
        if (res.status === 200) { c.put(url, res.clone()).catch(function () {}); }                             // 전체 응답만 보관 (부분 응답은 보관하지 않음)
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var u; try { u = new URL(req.url); } catch (e) { return; }
  if (u.origin !== self.location.origin) return;
  var p = u.pathname;
  if (p.indexOf('/sheet/') === 0) { event.respondWith(sheetFetch(event).catch(function () { return new Response('offline', { status: 503 }); })); return; }
  if (p.indexOf('/api/') === 0 || p.indexOf('/audio/') === 0 || p.indexOf('/bfile/') === 0 || p === '/mimg' || p.indexOf('/cron') === 0) return;
  if (p.indexOf('/socket.io/') === 0 && p !== '/socket.io/socket.io.js') return;                                   // 실시간 연결은 그대로
  if (req.mode === 'navigate') {
    event.respondWith(netFirst(req, PAGES, 9000, req.url).then(function (res) { return res || offlinePage(); }).catch(function () { return offlinePage(); }));
    return;
  }
  if (/\.(js|css|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|webmanifest|json)$/i.test(p)) {
    event.respondWith(netFirst(req, SHELL, 5000).then(function (res) { return res || new Response('', { status: 504 }); }).catch(function () { return new Response('', { status: 504 }); }));
  }
});

let BADGE = 0;
function bumpBadge() {
  try { BADGE += 1; if (self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge(BADGE); } catch (e) {}
}
self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: (event.data && event.data.text()) || '' }; }
  var title = d.title || '토론토영락교회 청년1부';
  var opts = {
    body: d.body || '',
    icon: d.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'yn',
    renotify: true,
    requireInteraction: !!d.keep,
    data: { url: d.url || '/?page=portal' }
  };
  bumpBadge();
  event.waitUntil(self.registration.showNotification(title, opts));
});

function clearBadge() {
  try { BADGE = 0; if (self.navigator && self.navigator.clearAppBadge) self.navigator.clearAppBadge(); } catch (e) {}
}
self.addEventListener('notificationclick', function (event) {
  event.notification.close(); clearBadge();
  var url = (event.notification.data && event.notification.data.url) || '/?page=portal';
  // 알림에 실려 온 주소는 이 사이트 안의 것만 씁니다 (바로가기는 ?page=portal&go=… 형식)
  try {
    var u = new URL(url, self.location.origin);
    url = u.origin === self.location.origin ? (u.pathname + u.search + u.hash) : '/?page=portal';
  } catch (e) { url = '/?page=portal'; }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
