/**
 * 토론토영락교회 청년1부 — 알림(푸시)을 받는 작은 일꾼.
 * 브라우저가 앱을 닫아둔 사이에도 이 파일이 대신 깨어나 알림을 띄웁니다.
 * (오프라인 저장은 하지 않습니다 — 화면은 늘 서버에서 새로 받아옵니다)
 */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

/* 화면은 늘 서버에서 새로 받아옵니다. 인터넷이 끊겼을 때만 안내를 보여줍니다
   (이 손잡이가 있어야 안드로이드에서 "앱 설치" 가 뜹니다) */
self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(function () {
    return new Response(
      '<!doctype html><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#1C1C1C;color:#fff;' +
      'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">' +
      '<div><h3 style="margin:0 0 8px;">인터넷 연결을 확인해주세요</h3>' +
      '<p style="color:#BDB8B1;margin:0;">연결되면 새로고침해주세요.</p></div>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }));
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
