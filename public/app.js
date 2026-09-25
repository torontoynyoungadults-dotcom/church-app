/**
 * 화면 → 서버 호출
 *   callServer('함수이름', [인자1, 인자2], 성공했을때, 실패했을때)
 * 서버의 logic/app.js 에 있는 같은 이름의 함수가 실행되고, 돌려준 값이 성공 함수로 옵니다.
 * 오류가 나면 실패 함수가 Error(메시지)를 받습니다.
 */
(function () {
  function asError(x, fallback) {
    if (x instanceof Error) return x;
    return new Error(x ? String(x) : fallback);
  }

  function callServer(name, args, onOk, onFail) {
    var fail = function (e) {
      if (onFail) onFail(e);
      else if (window.console) console.error('[' + name + ']', e);
    };
    fetch('/api/' + encodeURIComponent(name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ args: args || [] })
    }).then(function (res) {
      return res.text().then(function (t) {
        try { return JSON.parse(t); } catch (e) {
          if (res.status === 413) throw new Error('파일이 너무 큽니다. 더 작은 파일로 다시 시도해주세요.');
          throw new Error('서버가 응답하지 않습니다. 잠시 후 다시 시도해주세요. (' + res.status + ')');
        }
      });
    }).then(function (d) {
      if (d && d.ok) { if (onOk) onOk(d.result); }
      else fail(asError(d && d.error, '처리하지 못했습니다.'));
    }, function (e) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) e = new Error('인터넷 연결을 확인해주세요.');
      fail(asError(e, '서버에 연결하지 못했습니다.'));
    });
  }

  window.callServer = callServer;

  /* =========================================================
     알림(푸시) — 이 기기에서 알림을 켜고 끕니다.
     아이폰은 반드시 "홈 화면에 추가" 한 뒤에야 알림을 켤 수 있습니다 (애플 정책).
     ========================================================= */
  var YNPush = {
    /** 이 기기가 알림을 받을 수 있는지 */
    can: function () {
      return !!(window.isSecureContext && 'serviceWorker' in navigator &&
        'PushManager' in window && 'Notification' in window);
    },
    isIOS: function () {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    },
    /** 홈 화면에서 앱처럼 열렸는지 */
    standalone: function () {
      return !!(window.navigator.standalone ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
    },
    /** 아이폰인데 아직 홈 화면에 추가하지 않은 경우 — 알림을 켤 수 없습니다 */
    needsHome: function () { return this.isIOS() && !this.standalone(); },
    state: function () {
      if (!this.can()) return this.needsHome() ? 'needsHome' : 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      if (Notification.permission === 'granted') return 'granted';
      return 'ask';
    },
    ready: function (done) {
      if (this._reg) { done(this._reg); return; }
      var me = this;
      navigator.serviceWorker.register('/sw.js').then(function (r) {
        return navigator.serviceWorker.ready.then(function () { me._reg = r; done(r); });
      }, function () { done(null); });
    },
    /** 알림 켜기 — 허용을 받고 서버에 이 기기를 등록합니다 */
    enable: function (token, onOk, onFail) {
      var me = this;
      var bad = function (m) { if (onFail) onFail(new Error(m)); };
      if (this.needsHome()) return bad('아이폰은 먼저 공유 버튼 → "홈 화면에 추가" 를 한 뒤, 홈 화면 아이콘으로 열어서 켜주세요.');
      if (!this.can()) return bad('이 브라우저는 알림을 지원하지 않습니다.');
      Notification.requestPermission().then(function (p) {
        if (p !== 'granted') return bad('알림이 허용되지 않았습니다. 브라우저 설정에서 이 사이트의 알림을 허용해주세요.');
        callServer('pushKey', [], function (key) {
          if (!key) return bad('서버에 알림 열쇠가 아직 없습니다. 커미티에 문의해주세요.');
          me.ready(function (reg) {
            if (!reg) return bad('알림 준비에 실패했습니다.');
            reg.pushManager.getSubscription().then(function (old) {
              var go = function () {
                return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: me._key(key) });
              };
              return (old ? old.unsubscribe().then(go, go) : go());
            }).then(function (sub) {
              callServer('savePushDevice', [token, JSON.parse(JSON.stringify(sub)), navigator.userAgent],
                function (r) { if (onOk) onOk(r); }, onFail);
            }, function (e) { bad((e && e.message) || '알림을 켜지 못했습니다.'); });
          });
        }, onFail);
      }, function () { bad('알림 허용 창을 열지 못했습니다.'); });
    },
    /** 알림 끄기 — 이 기기만 */
    disable: function (token, onOk, onFail) {
      if (!this.can()) { if (onOk) onOk(); return; }
      this.ready(function (reg) {
        if (!reg) { if (onOk) onOk(); return; }
        reg.pushManager.getSubscription().then(function (sub) {
          if (!sub) { if (onOk) onOk(); return; }
          var ep = sub.endpoint;
          sub.unsubscribe().then(function () {
            callServer('deletePushDevice', [token, ep], function (r) { if (onOk) onOk(r); }, onFail);
          }, function () { if (onOk) onOk(); });
        });
      });
    },
    /** 이 기기가 이미 켜져 있는지 */
    subscribed: function (done) {
      if (!this.can() || Notification.permission !== 'granted') { done(false); return; }
      this.ready(function (reg) {
        if (!reg) { done(false); return; }
        reg.pushManager.getSubscription().then(function (s) { done(!!s); }, function () { done(false); });
      });
    },
    _key: function (b64) {
      var pad = '='.repeat((4 - (b64.length % 4)) % 4);
      var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
      var out = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    }
  };
  window.YNPush = YNPush;

  /* 알림 일꾼을 조용히 준비해 둡니다 — 알림과 "홈 화면에 앱 설치" 에 쓰입니다 */
  try {
    if (window.isSecureContext && 'serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      });
    }
  } catch (e) {}

  /** 서버가 보낸 파일 { name, mime, b64 } 을 내려받습니다 */
  window.saveB64 = window.saveB64 || function (res) {
    try {
      var bin = atob(res.b64), buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([buf], { type: res.mime }));
      var a = document.createElement('a');
      a.href = url; a.download = res.name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.parentNode.removeChild(a); }, 1500);
      return true;
    } catch (e) { return false; }
  };
})();
