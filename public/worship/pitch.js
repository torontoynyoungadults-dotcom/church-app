/**
 * 음정 맞추기 피아노롤 — 건반 · 목표 음 · 마이크로 부르는 음을 겹쳐 보여줍니다
 * ------------------------------------------------------------
 *  · 건반을 누르면 기준음이 납니다 (들으면서 따라 부르기)
 *  · 그리드를 눌러 목표 멜로디를 찍고 ▶ 재생 — 박자는 곡 BPM
 *  · 🎤 을 켜면 지금 부르는 음이 실시간 선으로 그려지고, 목표 음과 얼마나 맞는지 (±cent) 점수로 보여줍니다
 *  · 곡의 Key 가 있으면 그 음계를 건반에 표시합니다
 * 음정 검출은 YIN 알고리즘 (자기상관보다 옥타브 오류가 적음). 브라우저와 Node(시험) 양쪽에서 씁니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YNPitch = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = { 'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10, 'Cb': 11, 'Fb': 4, 'E#': 5, 'B#': 0 };
  var BLACK = [1, 3, 6, 8, 10];

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function freqToMidi(f) { return 69 + 12 * Math.log(f / 440) / Math.LN2; }
  function noteName(m) { m = Math.round(m); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  /** 가장 가까운 음과의 차이 (cent, -50~+50) */
  function centsOff(m) { return Math.round((m - Math.round(m)) * 100); }
  /** 목표 음과의 차이 (cent). octave 가 true 면 옥타브가 달라도 같은 음으로 봅니다 (남 · 여 · 다른 옥타브로 부를 때) */
  function centsBetween(m, target, octave) {
    var d = (m - target) * 100;
    if (octave) { d = ((d + 600) % 1200 + 1200) % 1200 - 600; }
    return Math.round(d);
  }

  /**
   * "G" "Bb" "F#m" "Em" → { tonic: 7, minor: false } 못 읽으면 null
   */
  function parseKey(str) {
    var m = /^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(m|min|minor|-)?\s*$/.exec(String(str || '').replace(/\s*\(.*\)\s*/g, ''));
    if (!m) return null;
    var n = m[1].toUpperCase() + (m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2]);
    var pc = NAMES.indexOf(n);
    if (pc < 0) pc = FLAT[n] != null ? FLAT[n] : -1;
    if (pc < 0) return null;
    return { tonic: pc, minor: !!m[3], name: n + (m[3] ? 'm' : '') };
  }
  function scalePcs(key) {
    if (!key) return [];
    var steps = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    return steps.map(function (s) { return (key.tonic + s) % 12; });
  }

  /**
   * YIN 음정 검출 — buf: Float32Array (시간 파형), 반환 { freq, prob } 또는 null (소리가 작거나 음이 불분명)
   */
  function detectPitch(buf, sampleRate, o) {
    o = o || {};
    var thr = o.threshold == null ? 0.15 : o.threshold;
    var minF = o.minFreq || 70, maxF = o.maxFreq || 1200, gate = o.gate == null ? 0.01 : o.gate;
    var n = buf.length, half = Math.floor(n / 2);
    var rms = 0; for (var i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    if (rms < gate) return null;
    var tauMax = Math.min(half - 1, Math.floor(sampleRate / minF)), tauMin = Math.max(2, Math.floor(sampleRate / maxF));
    if (tauMax <= tauMin + 2) return null;
    var d = new Float32Array(tauMax + 1);
    for (var tau = 1; tau <= tauMax; tau++) {
      var sum = 0;
      for (var j = 0; j < half; j++) { var x = buf[j] - buf[j + tau]; sum += x * x; }
      d[tau] = sum;
    }
    // 누적 평균 정규화
    var cm = new Float32Array(tauMax + 1), run = 0; cm[0] = 1;
    for (var t = 1; t <= tauMax; t++) { run += d[t]; cm[t] = run ? d[t] * t / run : 1; }
    var best = -1;
    for (var k = tauMin; k <= tauMax; k++) {
      if (cm[k] < thr) {
        while (k + 1 <= tauMax && cm[k + 1] < cm[k]) k++;      // 골짜기 바닥까지
        best = k; break;
      }
    }
    if (best < 0) return null;
    // 포물선 보간으로 정밀하게
    var x0 = best > 1 ? cm[best - 1] : cm[best], x2 = best < tauMax ? cm[best + 1] : cm[best], x1 = cm[best];
    var den = x0 + x2 - 2 * x1, shift = den ? (x0 - x2) / (2 * den) : 0;
    var tauF = best + Math.max(-1, Math.min(1, shift));
    return { freq: sampleRate / tauF, prob: 1 - Math.min(1, cm[best]), rms: rms };
  }

  /** 검출한 값을 부드럽게 — 중간값 필터 (순간적으로 튀는 값 제거) */
  function medianSmooth(list, v, size) {
    list.push(v); if (list.length > (size || 5)) list.shift();
    var s = list.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }

  /** 점수 계산 — 노트별로 맞은 프레임 비율 */
  function scoreNotes(notes, frames, o) {
    o = o || {};
    var tol = o.tol == null ? 35 : o.tol;
    return notes.map(function (nt) {
      var inNote = frames.filter(function (f) { return f.beat >= nt.beat && f.beat < nt.beat + nt.len; });
      var voiced = inNote.filter(function (f) { return f.midi != null; });
      var hit = voiced.filter(function (f) { return Math.abs(centsBetween(f.midi, nt.midi, o.octave)) <= tol; });
      var avg = voiced.length ? voiced.reduce(function (s, f) { return s + centsBetween(f.midi, nt.midi, o.octave); }, 0) / voiced.length : null;
      return { note: nt, frames: inNote.length, voiced: voiced.length, hit: hit.length, avgCents: avg == null ? null : Math.round(avg),
        pct: inNote.length ? Math.round(hit.length / inNote.length * 100) : 0 };
    });
  }

  /* ==================== UI: 피아노롤 ==================== */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /**
   * mount(host, { bpm, key, lo, hi, beats, notes, onChange, onError })
   * 반환: { setBpm, setKey, getNotes, setNotes, destroy }
   */
  function mount(host, opt) {
    opt = opt || {};
    var st = {
      bpm: +opt.bpm || 80, key: parseKey(opt.key), lo: opt.lo || 48, hi: opt.hi || 84, beats: opt.beats || 16,
      notes: (opt.notes || []).slice(), octave: true, mic: false, playing: false, frames: [], live: null,
      t0: 0, raf: 0, rafP: 0, stream: null, ctx: null, an: null, buf: null, med: [], osc: [], lenSel: 1, playHead: -1, dead: false
    };
    function fail(msg) { try { if (opt.onError) opt.onError(msg); else if (typeof console !== 'undefined') console.warn('[pitch] ' + msg); } catch (e) {} setInfo(msg, true); }

    host.innerHTML = '';
    host.classList.add('pr-root');
    var bar = el('div', 'pr-bar'), wrap = el('div', 'pr-wrap'), info = el('div', 'pr-info');
    var btnPlay = el('button', 'pr-btn', '▶ 목표 음 듣기'), btnMic = el('button', 'pr-btn', '🎤 마이크'),
        btnClr = el('button', 'pr-btn ghost', '모두 지우기'), btnScore = el('button', 'pr-btn ghost', '점수 보기');
    var lenSel = el('select', 'pr-sel'); [['0.5', '반박'], ['1', '1박'], ['2', '2박'], ['4', '4박']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; if (o[0] === '1') op.selected = true; lenSel.appendChild(op); });
    var octL = el('label', 'pr-chk'), octC = document.createElement('input'); octC.type = 'checkbox'; octC.checked = true; octL.appendChild(octC); octL.appendChild(document.createTextNode(' 옥타브 무관'));
    bar.appendChild(btnPlay); bar.appendChild(btnMic); bar.appendChild(el('span', 'pr-lbl', '음 길이')); bar.appendChild(lenSel); bar.appendChild(octL); bar.appendChild(btnScore); bar.appendChild(btnClr);
    var keys = el('canvas', 'pr-keys'), grid = el('canvas', 'pr-grid');
    wrap.appendChild(keys); wrap.appendChild(grid);
    host.appendChild(bar); host.appendChild(wrap); host.appendChild(info);
    function setInfo(t, bad) { info.textContent = t || ''; info.className = 'pr-info' + (bad ? ' bad' : ''); }
    setInfo('칸을 누르면 목표 음이 찍힙니다. 건반을 누르면 기준음이 납니다.' + (st.key ? '  (Key ' + st.key.name + ' 음계 표시)' : ''));

    var KW = 44, ROWH = 14, dpr = 1;
    function rows() { return st.hi - st.lo + 1; }
    function size() {
      dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
      var h = rows() * ROWH, w = Math.max(200, (wrap.clientWidth || 600) - KW);
      keys.width = KW * dpr; keys.height = h * dpr; keys.style.width = KW + 'px'; keys.style.height = h + 'px';
      grid.width = w * dpr; grid.height = h * dpr; grid.style.width = w + 'px'; grid.style.height = h + 'px';
      draw();
    }
    function yOf(m) { return (st.hi - m) * ROWH; }
    function bw() { return (grid.width / dpr) / st.beats; }
    var sc = null;
    function inScale(m) { if (!st.key) return null; var pc = ((m % 12) + 12) % 12; return scalePcs(st.key).indexOf(pc) >= 0; }

    function draw() {
      if (st.dead) return;
      var k = keys.getContext('2d'), g = grid.getContext('2d'); if (!k || !g) return;
      var W = grid.width / dpr, H = grid.height / dpr;
      k.setTransform(dpr, 0, 0, dpr, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      k.clearRect(0, 0, KW, H); g.clearRect(0, 0, W, H);
      for (var m = st.hi; m >= st.lo; m--) {
        var y = yOf(m), pc = ((m % 12) + 12) % 12, blk = BLACK.indexOf(pc) >= 0, sc1 = inScale(m);
        k.fillStyle = blk ? '#1b1b22' : '#e9e9ee'; k.fillRect(0, y, KW, ROWH - 1);
        if (sc1) { k.fillStyle = '#ff8a2a'; k.fillRect(KW - 6, y + 1, 5, ROWH - 3); }
        if (pc === 0) { k.fillStyle = '#333'; k.font = '10px sans-serif'; k.fillText(noteName(m), 3, y + ROWH - 4); }
        g.fillStyle = blk ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.075)'; g.fillRect(0, y, W, ROWH - 1);
        if (sc1) { g.fillStyle = 'rgba(255,138,42,.10)'; g.fillRect(0, y, W, ROWH - 1); }
        if (st.key && pc === st.key.tonic) { g.fillStyle = 'rgba(255,138,42,.22)'; g.fillRect(0, y, W, ROWH - 1); }
      }
      var B = bw();
      for (var b = 0; b <= st.beats; b++) { g.strokeStyle = b % 4 === 0 ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(b * B, 0); g.lineTo(b * B, H); g.stroke(); }
      st.notes.forEach(function (n) {
        g.fillStyle = 'rgba(255,138,42,.92)'; g.fillRect(n.beat * B + 1, yOf(n.midi) + 1, n.len * B - 2, ROWH - 3);
        g.strokeStyle = '#fff'; g.strokeRect(n.beat * B + 1.5, yOf(n.midi) + 1.5, n.len * B - 3, ROWH - 4);
      });
      // 부른 음 (선)
      var fr = st.frames, prev = null;
      g.lineWidth = 2;
      for (var i = 0; i < fr.length; i++) {
        var f = fr[i];
        if (f.midi == null || f.midi < st.lo - 1 || f.midi > st.hi + 1) { prev = null; continue; }
        var x = f.beat * B, yy = yOf(f.midi) + ROWH / 2;
        var tgt = st.notes.filter(function (n) { return f.beat >= n.beat && f.beat < n.beat + n.len; })[0];
        var ok = tgt ? Math.abs(centsBetween(f.midi, tgt.midi, st.octave)) <= 35 : null;
        g.strokeStyle = ok == null ? '#8ecbff' : ok ? '#5dff9a' : '#ff5d5d';
        if (prev) { g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(x, yy); g.stroke(); }
        prev = { x: x, y: yy };
      }
      g.lineWidth = 1;
      if (st.playHead >= 0) { g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(st.playHead * B, 0); g.lineTo(st.playHead * B, H); g.stroke(); }
      if (st.live != null) {
        var ly = yOf(st.live) + ROWH / 2; g.strokeStyle = '#8ecbff'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(0, ly); g.lineTo(W, ly); g.stroke(); g.setLineDash([]);
      }
    }

    /* ---- 소리 ---- */
    function ac() {
      if (!st.ctx) {
        var C = (typeof AudioContext !== 'undefined' && AudioContext) || (typeof webkitAudioContext !== 'undefined' && webkitAudioContext);
        if (!C) throw new Error('이 브라우저는 오디오를 지원하지 않습니다');
        st.ctx = new C();
      }
      if (st.ctx.state === 'suspended' && st.ctx.resume) st.ctx.resume();
      return st.ctx;
    }
    function tone(m, when, dur, vol) {
      var c = ac(), o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = midiToFreq(m);
      g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol || 0.25, when + 0.02);
      g.gain.setValueAtTime(vol || 0.25, when + Math.max(0.03, dur - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(c.destination); o.start(when); o.stop(when + dur + 0.02);
      st.osc.push(o); o.onended = function () { var i = st.osc.indexOf(o); if (i >= 0) st.osc.splice(i, 1); };
    }
    function stopTones() { st.osc.slice().forEach(function (o) { try { o.stop(); } catch (e) {} }); st.osc = []; }

    /* ---- 클릭: 건반 / 그리드 ---- */
    function rowAt(y) { return st.hi - Math.floor(y / ROWH); }
    keys.addEventListener('pointerdown', function (e) {
      try { var r = keys.getBoundingClientRect(); var m = rowAt(e.clientY - r.top); if (m < st.lo || m > st.hi) return; tone(m, ac().currentTime + 0.01, 0.7, 0.3); setInfo(noteName(m) + '  (' + Math.round(midiToFreq(m)) + ' Hz)'); }
      catch (err) { fail('소리를 낼 수 없습니다: ' + err.message); }
    });
    grid.addEventListener('pointerdown', function (e) {
      var r = grid.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, m = rowAt(y), B = bw();
      if (m < st.lo || m > st.hi) return;
      var beat = Math.floor(x / B * 2) / 2;
      var hit = -1;
      st.notes.forEach(function (n, i) { if (n.midi === m && x / B >= n.beat && x / B < n.beat + n.len) hit = i; });
      if (hit >= 0) st.notes.splice(hit, 1);
      else {
        var len = +lenSel.value || 1; if (beat + len > st.beats) len = Math.max(0.5, st.beats - beat);
        st.notes.push({ beat: beat, len: len, midi: m });
        try { tone(m, ac().currentTime + 0.01, 0.4, 0.25); } catch (err) {}
      }
      st.notes.sort(function (a, b) { return a.beat - b.beat; });
      draw(); changed();
    });
    function changed() { try { if (opt.onChange) opt.onChange(st.notes.slice()); } catch (e) {} }

    /* ---- 목표 음 재생 ---- */
    function play() {
      if (st.playing) { stopPlay(); return; }
      if (!st.notes.length) { setInfo('먼저 칸을 눌러 목표 음을 찍어 주세요.', true); return; }
      try {
        var c = ac(), spb = 60 / st.bpm, t0 = c.currentTime + 0.12; st.playing = true; btnPlay.textContent = '■ 멈춤';
        st.notes.forEach(function (n) { tone(n.midi, t0 + n.beat * spb, Math.max(0.12, n.len * spb * 0.95), 0.25); });
        st.t0 = t0; var end = Math.max.apply(null, st.notes.map(function (n) { return n.beat + n.len; }));
        (function loop() {
          if (!st.playing || st.dead) return;
          var b = (c.currentTime - t0) / spb; st.playHead = b >= 0 ? b : -1;
          if (b > end + 0.3) { stopPlay(); return; }
          draw(); st.rafP = requestAnimationFrame(loop);
        })();
      } catch (e) { stopPlay(); fail('재생할 수 없습니다: ' + e.message); }
    }
    function stopPlay() { st.playing = false; st.playHead = -1; stopTones(); btnPlay.textContent = '▶ 목표 음 듣기'; if (st.rafP && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(st.rafP); st.rafP = 0; draw(); }

    /* ---- 마이크 ---- */
    function micOn() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fail('이 브라우저는 마이크를 지원하지 않습니다 (https 주소인지 확인해 주세요).'); return; }
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
        if (st.dead) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        var c = ac(); st.stream = stream;
        var src = c.createMediaStreamSource(stream); st.an = c.createAnalyser(); st.an.fftSize = 2048; src.connect(st.an);
        st.buf = new Float32Array(st.an.fftSize); st.mic = true; st.frames = []; st.t0 = c.currentTime;
        btnMic.textContent = '🎤 끄기'; btnMic.classList.add('on'); setInfo('소리를 내 보세요. 초록=목표 음과 일치 / 빨강=벗어남 / 파랑=목표 없음');
        micLoop();
      }).catch(function (e) {
        var n = e && e.name;
        fail(n === 'NotAllowedError' ? '마이크 사용이 허용되지 않았습니다. 주소창의 자물쇠에서 마이크를 허용해 주세요.' :
             n === 'NotFoundError' ? '마이크를 찾을 수 없습니다.' : '마이크를 켤 수 없습니다: ' + (e && e.message || e));
      });
    }
    function micLoop() {
      if (!st.mic || st.dead) return;
      try {
        st.an.getFloatTimeDomainData(st.buf);
        var r = detectPitch(st.buf, st.ctx.sampleRate), c = st.ctx, spb = 60 / st.bpm, beat = st.playing ? (c.currentTime - st.t0) / spb : ((c.currentTime - st.t0) / spb) % st.beats;
        if (r && r.prob > 0.7) {
          var m = medianSmooth(st.med, freqToMidi(r.freq), 5); st.live = m;
          st.frames.push({ beat: beat, midi: m });
          var tg = st.notes.filter(function (n) { return beat >= n.beat && beat < n.beat + n.len; })[0];
          setInfo(noteName(m) + ' ' + (centsOff(m) >= 0 ? '+' : '') + centsOff(m) + '¢' + (tg ? '  →  목표 ' + noteName(tg.midi) + ' 과 ' + centsBetween(m, tg.midi, st.octave) + '¢ 차이' : ''));
        } else { st.live = null; st.med = []; st.frames.push({ beat: beat, midi: null }); }
        if (st.frames.length > 4000) st.frames.splice(0, st.frames.length - 4000);
        draw();
      } catch (e) { micOff(); fail('마이크 분석 중 오류: ' + e.message); return; }
      st.raf = requestAnimationFrame(micLoop);                 // (재생용 rAF 와 따로 — 재생이 끝날 때 마이크 그리기가 멈추던 문제 방지)
    }
    function micOff() {
      st.mic = false; st.live = null; if (st.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(st.raf); st.raf = 0;
      if (st.stream) { st.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); st.stream = null; }
      btnMic.textContent = '🎤 마이크'; btnMic.classList.remove('on'); draw();
    }
    btnMic.onclick = function () { st.mic ? micOff() : micOn(); };
    btnPlay.onclick = play;
    btnClr.onclick = function () { st.notes = []; st.frames = []; draw(); changed(); };
    octC.onchange = function () { st.octave = octC.checked; draw(); };
    btnScore.onclick = function () {
      if (!st.notes.length) { setInfo('목표 음이 없습니다.', true); return; }
      var res = scoreNotes(st.notes, st.frames, { octave: st.octave });
      var withData = res.filter(function (r) { return r.frames > 0; });
      if (!withData.length) { setInfo('아직 불러 본 소리가 없습니다. 🎤 를 켜고 ▶ 와 함께 불러 보세요.', true); return; }
      var tot = Math.round(withData.reduce(function (s, r) { return s + r.pct; }, 0) / withData.length);
      var off = withData.filter(function (r) { return r.avgCents != null; });
      var avg = off.length ? Math.round(off.reduce(function (s, r) { return s + r.avgCents; }, 0) / off.length) : 0;
      setInfo('맞은 비율 ' + tot + '%  ·  평균 ' + (avg >= 0 ? '+' : '') + avg + '¢ (' + (Math.abs(avg) < 15 ? '정확해요' : avg > 0 ? '조금 높게' : '조금 낮게') + ')');
    };
    var ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(function () { size(); }); ro.observe(wrap); }
    else if (typeof addEventListener === 'function') addEventListener('resize', size);
    size();

    return {
      setBpm: function (b) { b = +b; if (b >= 30 && b <= 300) st.bpm = b; },
      setKey: function (k) { st.key = parseKey(k); draw(); },
      getNotes: function () { return st.notes.slice(); },
      setNotes: function (n) { st.notes = (n || []).slice(); draw(); },
      destroy: function () { st.dead = true; stopPlay(); micOff(); if (ro) ro.disconnect(); try { if (st.ctx && st.ctx.close) st.ctx.close(); } catch (e) {} host.innerHTML = ''; }
    };
  }

  return {
    NAMES: NAMES, midiToFreq: midiToFreq, freqToMidi: freqToMidi, noteName: noteName, centsOff: centsOff, centsBetween: centsBetween,
    parseKey: parseKey, scalePcs: scalePcs, detectPitch: detectPitch, medianSmooth: medianSmooth, scoreNotes: scoreNotes, mount: mount
  };
}));
