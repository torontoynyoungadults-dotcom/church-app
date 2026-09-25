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
