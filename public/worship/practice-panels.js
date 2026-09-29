/**
 * 연습 모드 패널 — 필기 옵션 · 송폼 · 메트로놈(음성 큐) · 음정 · 가사 · 함께(리더-팔로워)
 * practice.js 가 YNPanels.build(P) 를 불러 탭 목록을 받습니다. 각 탭은 처음 열릴 때 만들어집니다.
 * (formb.js · metro.js · pitch.js · lyrics.js 가 없으면 그 탭은 "불러오지 못했다"는 안내만 보이고 나머지는 정상 동작)
 */
(function (root) {
  'use strict';
  var doc = root.document;
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function need(name, mod, host) {
    if (mod) return true;
    host.innerHTML = '<p class="pv-err">' + h(name) + ' 도구를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>'; return false;
  }
  function hhmm(t) { var d = new Date(t); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }

  function build(P) {
    var M = null, mUi = null, lastBeat = -1;
    var tabs = [];

    /* ------------------------------------------------------------ 메트로놈 (여러 탭이 함께 씁니다) */
    function metro() {
      if (M) return M;
      if (!root.YNMetro) return null;
      var s = P.song(), bpm = s && +s.bpm >= 30 && +s.bpm <= 300 ? +s.bpm : undefined;
      M = root.YNMetro.create({
        bpm: bpm,
        onBeat: function (e) { if (mUi) mUi.beat(e); },
        onEvent: function (kind, d) { if (mUi) mUi.event(kind, d); else if (kind === 'error') P.toast(d && d.message || '소리를 낼 수 없습니다.', true); }
      });
      M.setLang(P.lang());
      return M;
    }
    /** 큐 하나를 소리로 (박자가 돌면 박에 맞춰) + 리더면 팀에 전달 */
    function doCue(id, fromRemote) {
      var m = metro(); if (!m) { P.toast('메트로놈 도구를 불러오지 못했습니다.', true); return; }
      var r = m.cue(id);
      if (!r.ok) P.toast(r.error || '큐를 재생하지 못했습니다.', true);
      else if (!fromRemote) P.broadcastCue(id);
      return r;
    }
    P.on('cue', function (c) {
      if (!P.recvCue() || !c || !c.label) return;
      var m = metro(); if (!m) return;
      var r = m.cue(String(c.label)); if (r && r.ok) P.toast('리더 큐: ' + (r.text || c.label), false, 1500);
    });
    P.on('song', function (s) {
      var b = s && +s.bpm; if (M && b >= 30 && b <= 300) { M.setBpm(b); if (mUi) mUi.sync(); }
    });
    P.on('close', function () { try { M && M.destroy(); } catch (e) {} M = null; });

    /* ------------------------------------------------------------ 필기 */
    tabs.push({ id: 'anno', icon: '✏️', label: '필기', build: function (host) {
      host.innerHTML =
        '<div class="pv-sec"><h4>누가 볼 수 있나요</h4><div class="pv-radio" data-g="layer"><button data-v="mine">🔒 나만 보기</button><button data-v="team">👥 팀 공유</button></div>' +
          '<p class="pv-help">"나만 보기"는 나에게만, "팀 공유"는 이 예배를 연 모든 사람 화면에 실시간으로 나타납니다.</p></div>' +
        '<div class="pv-sec"><h4>필기가 붙는 곳</h4><div class="pv-radio" data-g="scope"><button data-v="song">📌 이 곡에 계속</button><button data-v="date">📅 이 날짜(콘티)만</button></div>' +
          '<p class="pv-help">"이 곡에 계속"은 다음 주에 같은 악보를 열어도 남아 있고, "이 날짜만"은 이번 예배에서만 보입니다.</p></div>' +
        '<div class="pv-sec"><h4>보이기</h4><label class="pv-chk"><input type="checkbox" data-vis="mine" checked> 내 필기 보이기</label><label class="pv-chk"><input type="checkbox" data-vis="team" checked> 팀 필기 보이기</label>' +
          '<label class="pv-chk"><input type="checkbox" data-o="straight"> 형광펜을 반듯한 직선으로</label>' +
          '<label class="pv-chk pv-penrow">펜 입력 <select data-o="pen"><option value="auto">자동 (펜이 감지되면 손가락 무시)</option><option value="always">항상 펜만 (손바닥 방지)</option><option value="off">손가락도 그림</option></select></label></div>' +
        '<div class="pv-sec"><h4>지우기</h4><div class="pv-row"><button class="pv-btn2" data-a="mine">이 쪽 내 필기 지우기</button>' + (P.canEdit ? '<button class="pv-btn2 warn" data-a="all">이 쪽 모두 지우기</button>' : '') + '</div><p class="pv-help">지운 뒤에도 화면 왼쪽(위)의 ↶ 로 되돌릴 수 있습니다.</p></div>' +
        '<div class="pv-sec"><h4>저장</h4><div class="pv-save" data-role="save"></div><div class="pv-row"><button class="pv-btn2" data-a="save">지금 저장</button></div></div>' +
        '<div class="pv-sec"><h4>내보내기 · 인쇄 (필기 포함)</h4><div class="pv-row"><button class="pv-btn2" data-a="png">이 쪽 그림(PNG)</button><button class="pv-btn2" data-a="pdf">전체 PDF</button><button class="pv-btn2" data-a="print">인쇄</button></div></div>' +
        '<div class="pv-sec"><h4>화면 설정</h4><div class="pv-radio" data-g="layout"><button data-v="tablet">📱 태블릿</button><button data-v="computer">💻 컴퓨터</button></div>' +
          '<label class="pv-chk"><input type="checkbox" data-o="lefty"> 왼손잡이 (도구 막대를 왼쪽에)</label>' +
          '<p class="pv-help">태블릿: 큰 버튼 · 화면 양쪽 가장자리를 눌러 쪽 넘김 · 도구 막대가 떠 있음. 컴퓨터: 위쪽 도구 줄 · 오른쪽 패널 · 단축키(←→ 쪽, P 펜, H 형광펜, T 글자, C 코드, E 지우개, Ctrl+Z 취소).</p></div>';
      var an = function () { return P.anno(); };
      function paint() {
        [['layer', P.getLayer()], ['scope', P.getScope()], ['layout', P.layout()]].forEach(function (x) {
          Array.prototype.forEach.call(host.querySelectorAll('[data-g="' + x[0] + '"] button'), function (b) { b.classList.toggle('on', b.dataset.v === x[1]); });
        });
        var st = P.status(), t = [];
        t.push(st.conn === 'online' ? '● 팀과 실시간 연결됨' : st.conn === 'unavailable' ? '○ 혼자 보기 (팀 공유 없음)' : '○ 팀 연결 ' + (st.conn === 'connecting' ? '중…' : '끊김 — 자동으로 다시 연결합니다'));
        if (st.unsent) t.push('아직 보내지 못한 팀 필기 ' + st.unsent + '개 (연결되면 자동 전송)');
        if (st.minePending) t.push('내 필기 저장 대기 ' + st.minePending + '건');
        t.push(st.savedAt ? '마지막 저장 ' + hhmm(st.savedAt) : '아직 저장한 기록 없음');
        host.querySelector('[data-role="save"]').innerHTML = t.map(function (x) { return '<div>' + h(x) + '</div>'; }).join('');
        host.querySelector('[data-o="lefty"]').checked = P.hand() === 'left';
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
        var g = b.parentNode && b.parentNode.dataset && b.parentNode.dataset.g;
        if (g === 'layer') P.setLayer(b.dataset.v); else if (g === 'scope') { if (b.dataset.v === 'date' && !P.opts.room) P.toast('날짜 정보가 없어 이 곡에만 붙일 수 있습니다.', true); else P.setScope(b.dataset.v); } else if (g === 'layout') P.setLayout(b.dataset.v);
        var a = b.dataset.a;
        if (a === 'mine') { var n = an().clearPage(P.getLayer(), false); P.toast(n ? n + '개를 지웠습니다.' : '지울 내 필기가 없습니다.'); }
        else if (a === 'all') { if (root.confirm('이 쪽의 모든 사람의 필기를 지울까요? (내 것뿐 아니라 팀 필기 전체)')) { var n2 = an().clearPage(P.getLayer(), true); P.toast(n2 ? n2 + '개를 지웠습니다.' : '지울 필기가 없습니다.'); } }
        else if (a === 'save') { P.saveNow(); P.toast('저장을 요청했습니다.'); setTimeout(paint, 900); }
        else if (a === 'png') P.exportPng(); else if (a === 'pdf') P.exportPdf(false); else if (a === 'print') P.exportPdf(true);
        paint();
      });
      host.addEventListener('change', function (e) {
        var t = e.target; if (t.dataset.vis) an().setVisible(t.dataset.vis, t.checked);
        else if (t.dataset.o === 'straight') an().setStraight(t.checked);
        else if (t.dataset.o === 'pen') an().setPenMode(t.value);
        else if (t.dataset.o === 'lefty') P.setHand(t.checked ? 'left' : 'right');
      });
      ['sync', 'layer', 'scope', 'conn'].forEach(function (n) { P.on(n, paint); });
      paint();
      return { onShow: paint };
    } });

    /* ------------------------------------------------------------ 송폼 */
    tabs.push({ id: 'form', icon: '🎼', label: '송폼', build: function (host) {
      if (!need('송폼', root.YNForm, host)) return;
      host.innerHTML = '<div class="pv-sec"><h4>곡</h4><select class="pv-sel" data-role="song"></select><div class="pv-songmeta" data-role="meta"></div></div>' +
        '<div class="pv-sec"><h4>송폼 순서</h4><div data-role="player"></div>' +
          '<div class="pv-row"><button class="pv-btn2" data-a="prev">◀ 이전</button><button class="pv-btn2 primary" data-a="next">다음 ▶</button></div>' +
          '<label class="pv-chk"><input type="checkbox" data-o="cue" checked> 칸을 누르면 음성 큐로 알려주기 (박자가 돌고 있으면 박에 맞춰)</label>' +
          '<label class="pv-chk pv-penrow">큐 언어 <select data-o="lang"><option value="en">English (Verse 1 …)</option><option value="ko">한국어 (1절 …)</option></select></label>' +
          '<p class="pv-help">칸을 누르면 지금 위치가 밝게 표시됩니다. 리더가 "팀에 큐 보내기"를 켜 두었다면 팀원 기기에서도 같은 큐가 들립니다. 송폼은 곡 정보의 "송폼 만들기"에서 고칩니다.</p></div>';
      var sel = host.querySelector('[data-role="song"]'), meta = host.querySelector('[data-role="meta"]'), player = null, cur = -1;
      function fill() {
        sel.innerHTML = '<option value="-1">곡 선택…</option>' + P.songs.map(function (s, i) { return '<option value="' + i + '">' + h((i + 1) + '. ' + s.title) + '</option>'; }).join('');
        sel.value = String(P.songIdx());
      }
      function song() {
        var s = P.song(); fill(); cur = -1;
        meta.textContent = s ? [s.key ? 'Key ' + s.key : '', s.bpm ? s.bpm + ' BPM' : '', s.team || ''].filter(Boolean).join(' · ') : '악보에 해당하는 곡을 골라주세요.';
        if (player) player.set(s ? s.form : ''); 
      }
      function pick(tok, i, num) {
        cur = i; var id = P.cueIdFor(num && num.cueKey || tok.k);
        if (host.querySelector('[data-o="cue"]').checked && id) doCue(id);
      }
      player = root.YNForm.mountPlayer(host.querySelector('[data-role="player"]'), { value: (P.song() || {}).form || '', lang: P.lang(), onPick: pick });
      sel.onchange = function () { P.setSong(+sel.value); };
      host.querySelector('[data-o="lang"]').value = P.lang();
      host.querySelector('[data-o="lang"]').onchange = function (e) { P.setLang(e.target.value); if (M) M.setLang(e.target.value); player.setLang(e.target.value); };
      host.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-a]') : null; if (!b) return;
        var list = player.list(); if (!list.length) { P.toast('이 곡에는 송폼이 없습니다.', true); return; }
        if (b.dataset.a === 'next') { var t = player.next(); cur = Math.min(list.length - 1, cur + 1); var num = root.YNForm.numbered(list)[cur]; if (host.querySelector('[data-o="cue"]').checked && num) { var id = P.cueIdFor(num.cueKey); if (id) doCue(id); } }
        else { cur = Math.max(0, cur - 1); player.setCurrent(cur); }
      });
      P.on('song', song); song();
      return { onShow: fill };
    } });

    /* ------------------------------------------------------------ 메트로놈 + 음성 큐 */
    tabs.push({ id: 'metro', icon: '⏱', label: '메트로놈', build: function (host) {
      var m = metro(); if (!need('메트로놈', m, host)) return;
      var CUES = root.YNMetro.CUES, GROUPS = [['sec', '진행'], ['dyn', '다이내믹'], ['in', '들어가기']];
      host.innerHTML =
        '<div class="pv-sec"><div class="pv-bpmrow"><button class="pv-btn2 sq" data-a="b-">−</button><input class="pv-bpm" type="number" inputmode="numeric" min="30" max="300" data-role="bpm" aria-label="BPM"><button class="pv-btn2 sq" data-a="b+">＋</button><button class="pv-btn2" data-a="tap">TAP</button></div>' +
          '<div class="pv-row"><label class="pv-chk">박자 <select data-o="sig"><option value="4/4">4/4</option><option value="3/4">3/4</option><option value="2/4">2/4</option><option value="6/8">6/8</option><option value="12/8">12/8</option></select></label>' +
          '<label class="pv-chk">시작 전 <select data-o="count"><option value="0">바로</option><option value="1">1마디</option><option value="2">2마디</option></select></label></div>' +
          '<div class="pv-dots" data-role="dots"></div><button class="pv-big" data-a="toggle" data-role="toggle">▶ 시작</button>' +
          '<div class="pv-msg2" data-role="msg"></div></div>' +
        '<div class="pv-sec"><h4>음성 큐 — 눌러서 알려주기</h4><p class="pv-help" data-role="cuehelp"></p>' +
          GROUPS.map(function (g) { return '<div class="pv-cuegrp"><span>' + g[1] + '</span><div class="pv-cues">' + CUES.filter(function (c) { return c.g === g[0]; }).map(function (c) { return '<button class="pv-cue" data-cue="' + c.id + '"></button>'; }).join('') + '</div></div>'; }).join('') +
          '<div class="pv-cuestat" data-role="cuestat"></div></div>' +
        '<div class="pv-sec"><h4>소리 · 큐 설정</h4>' +
          '<label class="pv-rng">딸깍 소리 <input type="range" min="0" max="1" step="0.05" data-o="click"></label><label class="pv-rng">음성 볼륨 <input type="range" min="0" max="1" step="0.05" data-o="voice"></label>' +
          '<label class="pv-chk">큐 타이밍 <select data-o="mode"><option value="lead">박자에 맞춰 미리 말하기 (추천)</option><option value="downbeat">다음 마디 첫 박에 맞춰</option><option value="now">누르는 즉시</option></select></label>' +
          '<label class="pv-chk">미리 말할 박 수 <select data-o="lead"><option value="1">1박 전</option><option value="2">2박 전</option><option value="3">3박 전</option><option value="4">4박 전</option></select></label>' +
          '<label class="pv-chk">큐 언어 <select data-o="lang"><option value="en">English</option><option value="ko">한국어</option></select></label>' +
          '<label class="pv-chk"><input type="checkbox" data-o="first" checked> 첫 박 강세 (1박을 더 높고 크게)</label>' +
          '<label class="pv-chk">딸깍 종류 <select data-o="sound"><option value="wood">우드</option><option value="beep">삐</option><option value="click">클릭</option><option value="mute">딸깍만 (음성 끔)</option></select></label>' +
          '<div class="pv-help" data-role="lat"></div></div>' +
        '<div class="pv-sec"><h4>팀과 함께</h4>' +
          '<label class="pv-chk"><input type="checkbox" data-o="send"> 내가 리더일 때 큐를 팀 전체에 보내기</label>' +
          '<label class="pv-chk"><input type="checkbox" data-o="recv"> 리더가 보낸 큐 받기 (이 기기에서 소리 나게)</label>' +
          '<p class="pv-help">박자(딸깍)는 기기마다 각자 냅니다. 리더 기기에서 누른 큐 이름만 다른 기기에서 자기 박자에 맞춰 소리 납니다.</p></div>';
      var q = function (s) { return host.querySelector(s); };
      var dotsEl = q('[data-role="dots"]'), toggleB = q('[data-role="toggle"]'), msg = q('[data-role="msg"]'), bpmIn = q('[data-role="bpm"]');
      function say(t, bad) { msg.textContent = t || ''; msg.className = 'pv-msg2' + (bad ? ' bad' : ''); }
      function labels() {
        var lang = P.lang();
        Array.prototype.forEach.call(host.querySelectorAll('[data-cue]'), function (b) { var c = CUES.filter(function (x) { return x.id === b.dataset.cue; })[0]; b.textContent = lang === 'ko' ? c.ko : c.en; b.title = c.en + ' / ' + c.ko; });
        q('[data-role="cuehelp"]').textContent = m.state().speech ? '박자가 돌아가는 중에 누르면 다음 마디 시작에 맞춰 말해 줍니다. 멈춰 있을 때는 바로 들려줍니다.' : root.YNMetro.help.noSpeech;
      }
      function drawDots(num) { var s = ''; for (var i = 0; i < num; i++) s += '<i class="' + (i === 0 ? 'a' : '') + '"></i>'; dotsEl.innerHTML = s; }
      function sync() {
        var st = m.state(), c = st.cfg;
        if (doc.activeElement !== bpmIn) bpmIn.value = Math.round(st.bpm);
        toggleB.textContent = st.running ? '■ 멈춤' : '▶ 시작'; toggleB.classList.toggle('on', st.running);
        var sigv = st.num + '/' + st.den, ss = q('[data-o="sig"]'); if (ss.value !== sigv) ss.value = sigv;
        if (dotsEl.children.length !== st.num) drawDots(st.num);
        q('[data-o="first"]').checked = c.first !== false; q('[data-o="click"]').value = c.click; q('[data-o="voice"]').value = c.voice; q('[data-o="mode"]').value = c.mode; q('[data-o="lead"]').value = String(c.lead);
        q('[data-o="lang"]').value = c.lang; q('[data-o="sound"]').value = c.sound;
        q('[data-role="lat"]').textContent = st.speech ? '음성 지연 보정: 약 ' + Math.round(c.lat) + 'ms (말하는 데 걸리는 시간을 기기가 스스로 재서 박자에 맞춥니다)' : '';
        q('[data-o="send"]').checked = P.sendCueOn(); q('[data-o="recv"]').checked = P.recvCue();
        var pend = st.pending && st.pending.length ? '대기 중: ' + st.pending.map(function (p) { return p.label; }).join(', ') : '';
        q('[data-role="cuestat"]').textContent = pend;
      }
      mUi = {
        sync: sync,
        beat: function (e) {
          var ds = dotsEl.children; for (var i = 0; i < ds.length; i++) ds[i].classList.remove('on', 'ci');
          var d = ds[e.beat]; if (d) { d.classList.add('on'); if (e.countIn) d.classList.add('ci'); }
        },
        event: function (kind, d) {
          if (kind === 'state') sync();
          else if (kind === 'error') { say(d && d.message, true); P.toast(d && d.message || '소리를 낼 수 없습니다.', true); }
          else if (kind === 'info') say(d && d.message);
          else if (kind === 'speechError') say('음성 안내를 재생하지 못했습니다 — 대신 "삐" 소리로 알려드립니다.', true);
          else if (kind === 'latency') sync();
          else if (kind === 'cue') { if (d.status === 'planned' && d.plan) q('[data-role="cuestat"]').textContent = '"' + d.text + '" — ' + d.plan.beat + '박째 (다음 마디까지 ' + Math.max(0, (d.plan.landAt - (m.ctx() ? m.ctx().currentTime : 0))).toFixed(1) + '초)'; else if (d.status === 'spoken') q('[data-role="cuestat"]').textContent = ''; }
        }
      };
      host.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
        if (b.dataset.cue) { var r = doCue(b.dataset.cue); if (r && r.ok) { b.classList.add('flash'); setTimeout(function () { b.classList.remove('flash'); }, 350); } return; }
        var a = b.dataset.a; if (!a) return;
        if (a === 'toggle') { var r2 = m.toggle(+q('[data-o="count"]').value); if (r2 && r2.ok === false) say(r2.error, true); else say(''); }
        else if (a === 'b-') m.setBpm(m.state().bpm - 1); else if (a === 'b+') m.setBpm(m.state().bpm + 1);
        else if (a === 'tap') { var t = m.tap(); if (t) say('탭 템포 ≈ ' + Math.round(t) + ' BPM'); else say('계속 눌러 박자를 알려주세요.'); }
        sync();
      });
      bpmIn.addEventListener('change', function () { var v = Math.round(+bpmIn.value); if (!(v >= 30 && v <= 300)) { say('BPM 은 30 ~ 300 사이로 입력해주세요.', true); sync(); return; } say(''); m.setBpm(v); rememberBpm(); });
      /* 곡 자동 BPM — 악보 쪽을 넘겨 다음 곡이 되면 리더가 곡 정보에 넣어 둔 BPM 을 자동으로 적용합니다.
         곡 정보에 BPM 이 없거나 현장에서 바꾸고 싶으면 그대로 고치면 됩니다 (−/＋ · 탭 · 직접 입력). 고친 값은 그 곡에만 기억되어 다시 돌아와도 유지됩니다. */
      var bpmOver = {}, curSongKey = '';
      function rememberBpm() { if (curSongKey) bpmOver[curSongKey] = Math.round(m.state().bpm); }
      host.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-a="b-"],[data-a="b+"],[data-a="tap"]')) setTimeout(rememberBpm, 0); });
      function applySongBpm(x) {
        if (!x) { curSongKey = ''; return; }
        curSongKey = String(x.title || '');
        var own = bpmOver[curSongKey], base = Math.round(+x.bpm);
        var v = own || (base >= 30 && base <= 300 ? base : 0);
        if (!v) { say('이 곡에는 BPM 이 없습니다. 직접 입력하거나 탭 템포를 쓰세요.'); return; }
        if (Math.round(m.state().bpm) !== v) m.setBpm(v);
        say(own ? '이 곡에서 고친 BPM ' + v + ' 를 적용했습니다.' : '곡 정보의 BPM ' + v + ' 를 자동 적용했습니다. (바꾸려면 직접 고치세요)');
      }
      P.on('song', applySongBpm);
      try { applySongBpm(P.song()); } catch (e) {}                          // 탭을 처음 열 때 이미 정해진 곡에도 적용
      host.addEventListener('change', function (e) {
        var t = e.target, o = t.dataset && t.dataset.o; if (!o) return;
        if (o === 'sig') { var p = t.value.split('/'); m.setSig(+p[0], +p[1]); drawDots(+p[0]); }
        else if (o === 'click') m.setClickVolume(+t.value); else if (o === 'voice') m.setVoiceVolume(+t.value); else if (o === 'mode') m.setMode(t.value);
        else if (o === 'lead') m.setLead(+t.value); else if (o === 'lang') { m.setLang(t.value); P.setLang(t.value); labels(); } else if (o === 'sound') m.setSound(t.value); else if (o === 'first') m.setFirstAccent(t.checked);
        else if (o === 'send') P.sendCueOn(t.checked); else if (o === 'recv') P.recvCue(t.checked);
        sync();
      });
      host.addEventListener('input', function (e) { var t = e.target; if (t.dataset && t.dataset.o === 'click') m.setClickVolume(+t.value); else if (t.dataset && t.dataset.o === 'voice') m.setVoiceVolume(+t.value); });
      m.setLang(P.lang()); labels(); sync();
      P.on('conn', sync);
      return { onShow: function () { labels(); sync(); }, destroy: function () { mUi = null; } };
    } });

    /* ------------------------------------------------------------ 음정 (피아노롤) */
    tabs.push({ id: 'pitch', icon: '🎹', label: '음정', build: function (host) {
      if (!need('음정', root.YNPitch, host)) return;
      var s = P.song(), pr = root.YNPitch.mount(host, { bpm: s && +s.bpm || 80, key: s && s.key || '', onError: function (t) { P.toast(t, true); } });
      P.on('song', function (x) { if (x) { if (+x.bpm) pr.setBpm(+x.bpm); pr.setKey(x.key || ''); } });
      return { destroy: function () { try { pr.destroy(); } catch (e) {} } };
    } });

    /* ------------------------------------------------------------ 가사 추출 */
    tabs.push({ id: 'lyrics', icon: '📝', label: '가사', build: function (host) {
      if (!need('가사 추출', root.YNLyrics, host)) return;
      var ly = root.YNLyrics.mount(host, { getPdf: function () { return P.pdf(); }, getPage: function () { return P.page(); }, getCanvas: function () { return P.canvas(); },
        title: (P.song() || {}).title || (P.file().name || '가사'), onError: function (t) { P.toast(t, true); } });
      return { destroy: function () { try { ly.destroy(); } catch (e) {} } };
    } });

    /* ------------------------------------------------------------ 함께 (리더 · 따라가기) */
    tabs.push({ id: 'together', icon: '👥', label: '함께', build: function (host) {
      function paint() {
        var rt = P.rt(), st = rt ? rt.state : 'unavailable', on = st === 'online', lead = on ? rt.leader : null, mine = on && rt.isLeader;
        var html = '<div class="pv-sec"><h4>연결</h4><div class="pv-conninfo ' + st + '">' +
          ({ online: '● 실시간 연결됨 — ' + rt.peers.length + '명 접속 중', connecting: '○ 연결하는 중…', offline: '○ 연결이 끊겼습니다. 자동으로 다시 연결합니다.', unavailable: '○ 실시간 기능을 쓸 수 없어 혼자 보기로 동작합니다.', denied: '✕ 이 예배에 접속할 권한이 없습니다.', idle: '○ 준비 중' }[st] || st) + '</div>' +
          (rt && rt.error && !on ? '<div class="pv-help">' + h(rt.error) + '</div>' : '') + '</div>';
        if (on) {
          html += '<div class="pv-sec"><h4>접속한 사람</h4><ul class="pv-peers">' + rt.peers.map(function (p) { return '<li class="' + (p.lead ? 'lead' : '') + '">' + (p.lead ? '👑 ' : '') + h(p.name) + (p.canLead && !p.lead ? ' <small>(리더 가능)</small>' : '') + '</li>'; }).join('') + '</ul></div>';
          html += '<div class="pv-sec"><h4>리더</h4><p class="pv-help">' + (mine ? '지금 내가 리더입니다. 내가 넘기는 악보 · 쪽 · 확대를 따라가기를 켠 사람들이 그대로 따라옵니다.' : lead ? h(lead) + ' 님이 리더입니다.' : '아직 리더가 없습니다.') + '</p><div class="pv-row">' +
            (P.canLead() ? (mine ? '<button class="pv-btn2" data-a="release">리더 내려놓기</button>' : lead ? '<button class="pv-btn2 warn" data-a="force">리더 넘겨받기</button>' : '<button class="pv-btn2 primary" data-a="claim">👑 내가 리더 하기</button>') : '<span class="pv-help">팀장 · 인도자만 리더가 될 수 있습니다.</span>') + '</div></div>';
          if (lead && !mine) html += '<div class="pv-sec"><h4>따라가기</h4><label class="pv-switch"><input type="checkbox" data-a="follow"' + (P.follow() ? ' checked' : '') + '><span></span><b>리더 화면 따라가기</b></label>' +
            '<p class="pv-help">끄면 리더가 넘겨도 내 화면은 그대로입니다 (나만 다른 곳을 보고 싶을 때). 다시 켜면 리더가 있는 곳으로 바로 돌아갑니다.</p>' + (!P.follow() ? '<div class="pv-row"><button class="pv-btn2" data-a="now">리더 화면으로 한 번만 가기</button></div>' : '') + '</div>';
          if (P.canLead() || true) html += '<div class="pv-sec"><h4>큐(음성 안내)</h4><label class="pv-chk"><input type="checkbox" data-a="send"' + (P.sendCueOn() ? ' checked' : '') + '> 리더일 때 큐를 팀에 보내기</label><label class="pv-chk"><input type="checkbox" data-a="recv"' + (P.recvCue() ? ' checked' : '') + '> 리더의 큐 받기</label></div>';
        }
        host.innerHTML = html;
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-a]') : null; if (!b) return; var a = b.dataset.a;
        if (a === 'claim') P.claim(false).catch(function () {}); else if (a === 'force') { if (root.confirm('지금 리더에게서 리더를 넘겨받을까요?')) P.claim(true).catch(function () {}); }
        else if (a === 'release') P.release(); else if (a === 'now') P.followNow();
      });
      host.addEventListener('change', function (e) {
        var t = e.target, a = t.dataset && t.dataset.a;
        if (a === 'follow') P.setFollow(t.checked); else if (a === 'send') P.sendCueOn(t.checked); else if (a === 'recv') P.recvCue(t.checked);
      });
      ['conn', 'peers', 'leader', 'follow', 'state', 'joined'].forEach(function (n) { P.on(n, function () { if (host.offsetParent !== null) paint(); }); });
      paint();
      return { onShow: paint };
    } });

    return tabs;
  }

  root.YNPanels = { build: build };
}(typeof self !== 'undefined' ? self : this));
