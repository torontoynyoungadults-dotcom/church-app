/**
 * 메트로놈 + 박자에 맞춘 음성 큐 (Web Audio)
 * ------------------------------------------------------------
 * ▣ 박자가 흔들리지 않는 이유
 *    클릭은 "지금 소리 내기"가 아니라 오디오 시계(AudioContext.currentTime)에 미리 예약합니다.
 *    타이머는 25ms 마다 깨어나 앞으로 120ms 안에 올 박자만 예약하는 일만 합니다 (표준 lookahead 방식).
 *    그래서 화면이 잠깐 멈추거나 음성 합성이 돌아가도 박자 간격은 오디오 하드웨어가 지킵니다.
 *    음성 큐는 소리를 "만드는" 것이 아니라 정해진 박자에 맞춰 시작 시각만 맞추므로 클릭 예약을 건드리지 않습니다.
 * ▣ 큐를 박자에 맞추는 법
 *    음성은 시작 명령을 내린 뒤 실제로 소리가 나기까지 시간이 걸립니다 (기기마다 100~500ms).
 *    이 지연을 onstart 로 측정해 두었다가 그만큼 일찍 시작해 "단어가 박자 위에 떨어지게" 합니다.
 *      · 'downbeat' 다음 마디 첫 박에 단어가 떨어지게        · 'lead' 다음 마디 첫 박 N박 전에 안내를 시작 (기본 2박)
 *      · 'now'      가장 가까운 박에
 * 이 파일은 브라우저와 Node(시험) 양쪽에서 쓰고, 시계 · 소리 부분은 주입받아 시험할 수 있게 나누어 두었습니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YNMetro = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 음성 큐 — 영어(기본) · 한국어 */
  var CUES = [
    { id: 'v1', en: 'Verse 1', ko: '1절', g: 'sec' }, { id: 'v2', en: 'Verse 2', ko: '2절', g: 'sec' }, { id: 'v3', en: 'Verse 3', ko: '3절', g: 'sec' },
    { id: 'c', en: 'Chorus', ko: '후렴', g: 'sec' }, { id: 'pc', en: 'Pre-chorus', ko: '프리코러스', g: 'sec' }, { id: 'b', en: 'Bridge', ko: '브릿지', g: 'sec' },
    { id: 'intro', en: 'Intro', ko: '인트로', g: 'sec' }, { id: 'itld', en: 'Interlude', ko: '간주', g: 'sec' }, { id: 'vamp', en: 'Vamp', ko: '뱀프', g: 'sec' },
    { id: 'end', en: 'Ending', ko: '엔딩', g: 'sec' },
    { id: 'voice', en: 'Voice', ko: '보이스', g: 'dyn' }, { id: 'break', en: 'Break', ko: '브레이크', g: 'dyn' }, { id: 'die', en: 'Die down', ko: '작게', g: 'dyn' },
    { id: 'ferm', en: 'Fermata', ko: '늘임표', g: 'dyn' }, { id: 'solo', en: 'Solo', ko: '솔로', g: 'dyn' },
    { id: 'sess', en: 'Session in', ko: '세션 인', g: 'in' }, { id: 'alto', en: 'Alto in', ko: '알토 인', g: 'in' }, { id: 'tenor', en: 'Tenor in', ko: '테너 인', g: 'in' }
  ];
  var CUE_BY = {};
  CUES.forEach(function (c) { CUE_BY[c.id] = c; });

  var LIMITS = { minBpm: 30, maxBpm: 300, minPitch: -12, maxPitch: 12, maxGain: 5 };
  /** 박마다 ">" 강세 표시 — 기본은 마디 첫 박만 (사용자가 원 모양 박을 눌러 바꿉니다) */
  function defaultMarks(num, first) { var a = []; for (var i = 0; i < num; i++) a.push(i === 0 && first !== false ? 1 : 0); return a; }
  function clamp(v, lo, hi) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo; }

  /* ============================================================
     Sched — 시간만 다루는 순수한 부분 (소리 없음 · 브라우저 없음)
     ============================================================ */
  function Sched(opt) {
    opt = opt || {};
    this.now = opt.now;                              // () → 초 (오디오 시계)
    this.lookahead = opt.lookahead || 0.12;
    this.bpm = clamp(opt.bpm || 72, LIMITS.minBpm, LIMITS.maxBpm);
    this.num = Math.round(clamp(opt.num || 4, 1, 16));
    this.den = opt.den === 8 ? 8 : 4;
    this.marks = defaultMarks(this.num, opt.first);
    this.running = false;
    this.nextTime = 0;
    this.beat = 0;                                   // 다음에 예약할 박 (0 = 마디 첫 박)
    this.bar = 0;
    this.count = 0;                                  // 시작부터 센 박 번호
    this.countInBars = 0;
  }
  Sched.prototype.interval = function () { return 60 / this.bpm; };
  Sched.prototype.start = function (countInBars, delay) {
    this.running = true;
    this.beat = 0; this.bar = 0; this.count = 0;
    this.countInBars = Math.max(0, Math.round(countInBars || 0));
    this.nextTime = this.now() + (delay == null ? 0.06 : delay);
  };
  Sched.prototype.stop = function () { this.running = false; };
  /**
   * 강세 — 2: ">" 표시한 박 (기본은 마디 첫 박 · 더 높고 크게) · 1: 겹박자(6/8 등)의 3박 묶음 첫 박 · 0: 나머지
   * 어느 박에 ">" 를 붙일지는 marks 배열이 정합니다 (setMark / toggleMark).
   */
  Sched.prototype.accent = function (beat) {
    if (this.marks[beat]) return 2;
    if (beat !== 0 && this.den === 8 && this.num % 3 === 0 && beat % 3 === 0) return 1;
    return 0;
  };
  Sched.prototype.setMark = function (i, on) {
    i = Math.round(Number(i));
    if (!(i >= 0 && i < this.num)) return false;
    this.marks[i] = on ? 1 : 0; return true;
  };
  Sched.prototype.toggleMark = function (i) {
    i = Math.round(Number(i));
    if (!(i >= 0 && i < this.num)) return null;
    this.marks[i] = this.marks[i] ? 0 : 1; return !!this.marks[i];
  };
  /** 통째로 바꾸기 (다른 기기에서 받은 강세) — 박 수에 맞게 자르거나 채웁니다 */
  Sched.prototype.setMarks = function (arr) {
    if (!Array.isArray(arr)) return false;
    var a = [];
    for (var i = 0; i < this.num; i++) a.push(arr[i] ? 1 : 0);
    this.marks = a; return true;
  };
  /**
   * 정해진 시각(앵커 = 어떤 마디의 첫 박이 울려야 하는 오디오 시계 시각)에 맞춰 시작합니다.
   * 앵커가 아직 오지 않았으면 그 시각에 첫 박부터, 이미 지났으면 박 위치(위상)를 그대로 유지한 채 다음 박부터 이어 갑니다.
   * 여러 기기가 같은 앵커(서버 시각 기준)를 쓰면 각자 오디오를 내면서도 박이 겹칩니다.
   */
  Sched.prototype.startAt = function (anchor, countInBars) {
    var itv = this.interval(), now = this.now(), k = 0;
    this.running = true;
    this.countInBars = Math.max(0, Math.round(countInBars || 0));
    if (anchor < now + 0.02) k = Math.ceil((now + 0.02 - anchor) / itv);
    this.count = k; this.beat = k % this.num; this.bar = Math.floor(k / this.num);
    this.nextTime = anchor + k * itv;
    return { skipped: k, nextTime: this.nextTime };
  };
  /**
   * 앞으로 lookahead 안에 올 박을 모두 예약 목록으로 돌려줍니다.
   * 타이머가 늦게 깨어나도(최대 lookahead 만큼) 박은 하나도 빠지지 않고, 시각은 항상 시작 시각 + n × 간격 입니다.
   */
  Sched.prototype.tick = function () {
    var out = [];
    if (!this.running) return out;
    var until = this.now() + this.lookahead;
    var guard = 0;
    while (this.nextTime < until && guard++ < 64) {
      out.push({ time: this.nextTime, beat: this.beat, bar: this.bar, count: this.count, accent: this.accent(this.beat),
        countIn: this.bar < this.countInBars });
      this.nextTime += this.interval();               // 템포를 바꿔도 이미 정해진 박은 그대로, 다음 박부터 새 간격
      this.count++; this.beat++;
      if (this.beat >= this.num) { this.beat = 0; this.bar++; }
    }
    return out;
  };
  Sched.prototype.setBpm = function (b) { this.bpm = clamp(b, LIMITS.minBpm, LIMITS.maxBpm); };
  Sched.prototype.setSig = function (num, den) {
    var same = Math.round(clamp(num, 1, 16)) === this.num && (den === 8 ? 8 : 4) === this.den;
    var first = this.marks[0] ? true : false;
    this.num = Math.round(clamp(num, 1, 16)); this.den = den === 8 ? 8 : 4;
    if (!same) this.marks = defaultMarks(this.num, first);          // 박자를 바꾸면 강세는 기본(첫 박)으로
    if (this.beat >= this.num) { this.beat = 0; this.bar++; }
  };

  /**
   * 큐를 언제 말할지 정합니다.
   *   speakAt : 음성 "시작 명령"을 내릴 시각 (= 단어가 박 위에 떨어지도록 지연만큼 앞당김)
   *   landAt  : 단어가 실제로 들릴 시각 (박의 시각)
   *   mode    : 'downbeat' | 'lead' | 'now'
   * 이미 늦었으면(명령을 내릴 시각이 지났으면) 다음 기회로 미룹니다 — 박자를 억지로 따라가지 않습니다.
   */
  Sched.prototype.planCue = function (mode, o) {
    o = o || {};
    var lat = o.latency == null ? 0.18 : o.latency, margin = o.margin == null ? 0.03 : o.margin;
    var lead = Math.round(clamp(o.leadBeats == null ? 2 : o.leadBeats, 1, 8));
    var itv = this.interval(), t0 = this.nextTime, n = this.num, now = this.now();
    if (!this.running) return { ok: false, reason: 'stopped' };
    // k: 아직 예약 전인 박 중 k 번째 (0 = 다음 박) — 이미 예약된 박은 소리가 나갔거나 곧 나갑니다
    var toDown = (n - this.beat) % n;                    // 다음 첫 박까지 남은 박 수
    var k;
    if (mode === 'now') k = 0;
    else if (mode === 'lead') k = toDown - lead;
    else k = toDown;
    var guard = 0;
    while (guard++ < 64) {
      if (k >= 0 && (t0 + k * itv) - lat >= now + margin) break;
      k += (mode === 'now') ? 1 : n;
    }
    var landAt = t0 + k * itv;
    var beatIdx = (this.beat + k) % n;
    var targetDown = k + ((n - beatIdx) % n);
    return { ok: true, mode: mode, k: k, landAt: landAt, speakAt: landAt - lat, downbeatAt: t0 + targetDown * itv, beat: beatIdx,
      bar: this.bar + Math.floor((this.beat + k) / n) };
  };

  /** 탭 템포 — 마지막 탭들의 평균 간격 (2.5초 넘게 쉬면 새로 시작) */
  function TapTempo() { this.t = []; }
  TapTempo.prototype.tap = function (nowMs) {
    if (this.t.length && nowMs - this.t[this.t.length - 1] > 2500) this.t = [];
    this.t.push(nowMs);
    if (this.t.length > 6) this.t.shift();
    if (this.t.length < 2) return null;
    var span = this.t[this.t.length - 1] - this.t[0];
    return Math.round(clamp(60000 / (span / (this.t.length - 1)), LIMITS.minBpm, LIMITS.maxBpm));
  };
  TapTempo.prototype.reset = function () { this.t = []; };

  /* ============================================================
     Metronome — 소리 · 음성 · 타이머 (브라우저)
     ============================================================ */
  function store(key, val) {
    try {
      if (typeof localStorage === 'undefined') return null;
      if (val === undefined) { var v = localStorage.getItem('yn.metro.' + key); return v == null ? null : JSON.parse(v); }
      localStorage.setItem('yn.metro.' + key, JSON.stringify(val));
    } catch (e) { /* 저장이 막힌 브라우저 — 기억만 못 할 뿐입니다 */ }
    return null;
  }

  /** 소리가 안 나는 이유가 코드가 아니라 기기 설정일 때가 많아서, 한국어로 안내합니다 */
  var HELP = {
    noAudio: '이 브라우저는 소리 재생(Web Audio)을 지원하지 않습니다. 최신 Safari · Chrome 으로 열어주세요.',
    blocked: '브라우저가 소리를 막고 있습니다. 화면을 한 번 누른 뒤 다시 시작해주세요. (아이폰은 무음 스위치도 확인해주세요)',
    noSpeech: '이 기기는 음성 안내를 지원하지 않아 "삐" 소리 패턴으로 대신 알려드립니다.'
  };

  function create(opt) {
    opt = opt || {};
    var AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    var ctx = null, worker = null, timer = null, raf = 0, destroyed = false;
    var sched = new Sched({ now: function () { return ctx ? ctx.currentTime : 0; }, bpm: opt.bpm || 72, num: opt.num || 4, den: opt.den || 4 });
    var tapper = new TapTempo();
    var q = [];                       // 화면에 보여줄 박 (소리가 나는 때에 맞춰 깜빡임)
    var pending = [];                 // 예약해 둔 큐 {plan, cue, timeout}
    var S = {
      click: store('gain'), voice: store('voice'), pitch: store('pitch'), flash: store('flash'), mode: store('mode'), lead: store('lead'), lang: store('lang'), lat: store('lat'), sound: store('sound'), first: store('first')
    };
    var cfg = {
      click: S.click == null ? 0.4 : clamp(S.click, 0, 1), voice: S.voice == null ? 1 : S.voice, mode: S.mode || 'lead', lead: S.lead || 2,
      lang: S.lang || 'en', lat: S.lat == null ? 180 : S.lat, sound: S.sound || 'wood',
      first: S.first !== false,                                  // 첫 박 강세 (기본 켬) — 끄면 첫 박도 다른 박과 같은 높이 · 세기
      pitch: S.pitch == null ? 0 : clamp(S.pitch, LIMITS.minPitch, LIMITS.maxPitch),   // 딸깍 음높이 (반음 단위, -12 ~ +12)
      flash: S.flash === true                                    // 첫 박에 화면 전체 깜빡임
    };
    sched.setMark(0, cfg.first);
    var voices = [], speechOk = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    var notify = function (kind, data) { if (opt.onEvent) { try { opt.onEvent(kind, data); } catch (e) { if (typeof console !== 'undefined') console.error(e); } } };

    function loadVoices() {
      if (!speechOk) return;
      try { voices = window.speechSynthesis.getVoices() || []; } catch (e) { voices = []; }
    }
    if (speechOk) {
      loadVoices();
      try { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) { /* 옛 브라우저 */ }
    }
    function pickVoice(lang) {
      var want = lang === 'ko' ? 'ko' : 'en';
      var list = voices.filter(function (v) { return String(v.lang || '').toLowerCase().indexOf(want) === 0; });
      // 기기 안에 있는 (인터넷이 필요 없는) 음성을 우선 — 네트워크 음성은 시작이 늦고 들쭉날쭉합니다
      return list.filter(function (v) { return v.localService; })[0] || list[0] || null;
    }

    /**
     * 딸깍 소리는 전용 볼륨(master)과 리미터를 거쳐 나갑니다.
     * 볼륨 막대(0~1)가 기본 크기의 0 ~ 5 배 (LIMITS.maxGain) 이고, 리미터가 소리가 찢어지는 것을 막습니다.
     */
    var master = null, limiter = null;
    function gainOf() { return clamp(cfg.click, 0, 1) * LIMITS.maxGain; }
    function ensureCtx() {
      if (ctx) return ctx;
      if (!AC) throw new Error(HELP.noAudio);
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      try {
        master = ctx.createGain(); master.gain.value = gainOf();
        if (ctx.createDynamicsCompressor) {
          limiter = ctx.createDynamicsCompressor();
          limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.06;
          master.connect(limiter); limiter.connect(ctx.destination);
        } else master.connect(ctx.destination);
      } catch (e) { master = null; limiter = null; }
      return ctx;
    }
    function applyGain() {
      if (master && ctx) { try { master.gain.setTargetAtTime(gainOf(), ctx.currentTime, 0.01); } catch (e) { master.gain.value = gainOf(); } }
    }
    function pitchMul() { return Math.pow(2, clamp(cfg.pitch, LIMITS.minPitch, LIMITS.maxPitch) / 12); }

    /* ---------- 소리 ---------- */
    var SOUNDS = { wood: [1500, 1150, 880, 'square'], beep: [1320, 990, 780, 'sine'], click: [2200, 1700, 1300, 'triangle'] };
    function click(time, accent, countIn) {
      var s = SOUNDS[cfg.sound] || SOUNDS.wood;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = s[3]; o.frequency.setValueAtTime((countIn ? 1000 : (accent === 2 ? s[0] : accent === 1 ? s[1] : s[2])) * pitchMul(), time);
      var peak = accent === 2 ? 0.9 : accent === 1 ? 0.75 : 0.6;               // 강세 박이 더 크게 (전체 크기는 master 볼륨)
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(peak, time + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
      o.connect(g); g.connect(master || ctx.destination);
      o.start(time); o.stop(time + 0.07);
    }
    /** 음성을 쓸 수 없을 때의 대체 — 종류마다 다른 "삐" 패턴 (오디오 시계에 예약하므로 박에 정확히 맞습니다) */
    var EAR = { sec: [660, 660], dyn: [880], in: [523, 784] };
    function earcon(time, group, idx) {
      var seq = (EAR[group] || EAR.sec).slice();
      if (group === 'sec') { seq = []; for (var i = 0; i < Math.min(4, (idx || 0) + 1); i++) seq.push(660); }
      seq.forEach(function (f, i) {
        var t = time + i * 0.11, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * cfg.voice, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.1);
      });
    }

    /* ---------- 음성 ---------- */
    var latEma = cfg.lat;
    function speak(text, lang, calibrate) {
      if (!speechOk) return false;
      try {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
        var v = pickVoice(lang); if (v) u.voice = v;
        u.rate = 1.05; u.volume = calibrate ? 0 : Math.min(1, Math.max(0, cfg.voice));
        var t0 = performance.now();
        u.onstart = function () {
          var m = performance.now() - t0;
          if (m > 20 && m < 900) {              // 이상한 값(첫 로딩 등)은 버리고, 나머지는 평균으로 다듬습니다
            latEma = latEma * 0.6 + m * 0.4;
            cfg.lat = Math.round(latEma); store('lat', cfg.lat);
            notify('latency', { ms: cfg.lat, measured: Math.round(m) });
          }
        };
        u.onerror = function (e) { notify('speechError', { error: e && e.error }); };
        window.speechSynthesis.speak(u);
        return true;
      } catch (e) { return false; }
    }
    /** 처음 한 번 — 소리 없는 음성을 돌려 지연을 재고 (아이폰은 사용자가 누른 순간에만 허용) */
    function warmup() { if (speechOk && !cfg.warmed) { cfg.warmed = true; speak(' ', cfg.lang, true); } }

    /* ---------- 타이머 (25ms 마다 깨어나 예약만 합니다) ---------- */
    function pump() {
      if (!ctx || destroyed) return;
      var ev = sched.tick();
      for (var i = 0; i < ev.length; i++) { click(ev[i].time, ev[i].accent, ev[i].countIn); q.push(ev[i]); }
    }
    function startTimer() {
      stopTimer();
      try {
        var src = 'var t=null;onmessage=function(e){if(e.data==="start"){clearInterval(t);t=setInterval(function(){postMessage(0)},25)}else if(e.data==="stop"){clearInterval(t);t=null}}';
        var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        worker = new Worker(url);
        worker.onmessage = pump;
        worker.postMessage('start');
        URL.revokeObjectURL(url);
      } catch (e) {
        worker = null;                          // Worker 를 못 쓰면 일반 타이머 (백그라운드 탭에서는 덜 정확할 수 있음)
        timer = setInterval(pump, 25);
      }
    }
    function stopTimer() {
      if (worker) { try { worker.postMessage('stop'); worker.terminate(); } catch (e) { /* 이미 끝남 */ } worker = null; }
      if (timer) { clearInterval(timer); timer = null; }
    }
    function frame() {
      raf = 0;
      if (!ctx || destroyed) return;
      // 스피커에서 실제로 들리는 시각에 맞춰 화면을 깜빡입니다
      var heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
      while (q.length && q[0].time <= heard) {
        var e = q.shift();
        if (opt.onBeat) { try { opt.onBeat(e); } catch (x) { /* 화면 오류가 박자에 영향을 주지 않게 */ } }
      }
      if (sched.running || q.length) raf = requestAnimationFrame(frame);
    }

    function state() {
      cfg.first = !!sched.marks[0];
      return { running: sched.running, bpm: sched.bpm, num: sched.num, den: sched.den, marks: sched.marks.slice(), gain: gainOf(), pitch: cfg.pitch, flash: cfg.flash, cfg: cfg, speech: speechOk, audio: !!AC,
        pending: pending.map(function (p) { return { label: p.text, landAt: p.plan.landAt, speakAt: p.plan.speakAt }; }) };
    }
    function emitState() { notify('state', state()); }

    function start(countInBars) {
      var c;
      try { c = ensureCtx(); } catch (e) { notify('error', { message: e.message }); return { ok: false, error: e.message }; }
      var go = function () {
        if (destroyed) return;
        if (c.state !== 'running') { notify('error', { message: HELP.blocked }); return; }
        warmup();
        sched.start(countInBars || 0, 0.08);
        pump(); startTimer();
        if (!raf) raf = requestAnimationFrame(frame);
        emitState();
      };
      var r = c.resume ? c.resume() : null;
      if (r && r.then) r.then(go, function () { notify('error', { message: HELP.blocked }); }); else go();
      if (!speechOk) notify('info', { message: HELP.noSpeech });
      return { ok: true };
    }
    /**
     * 정해진 시각에 맞춰 시작 (여러 기기 동기용).
     *   inMs : 앵커(마디 첫 박)까지 남은 시간(ms). 음수면 이미 지난 앵커 — 박 위치를 유지한 채 다음 박부터 이어 갑니다.
     * 소리는 이 기기의 오디오 시계에서 이 기기가 직접 냅니다 (소리를 주고받지 않습니다).
     */
    function startIn(inMs, countInBars) {
      var c;
      try { c = ensureCtx(); } catch (e) { notify('error', { message: e.message }); return { ok: false, error: e.message }; }
      inMs = Number(inMs); if (!isFinite(inMs)) inMs = 0;
      var go = function () {
        if (destroyed) return;
        if (c.state !== 'running') { notify('error', { message: HELP.blocked }); return; }
        warmup();
        // resume 가 끝난 시점에서 다시 계산하면 그 사이 지난 시간이 반영됩니다 — 기준은 호출 시각
        var anchor = c.currentTime + (inMs - (Date.now() - t0)) / 1000;
        sched.startAt(anchor, countInBars || 0);
        pump(); startTimer();
        if (!raf) raf = requestAnimationFrame(frame);
        emitState();
      };
      var t0 = Date.now();
      var r = c.resume ? c.resume() : null;
      if (r && r.then) r.then(go, function () { notify('error', { message: HELP.blocked }); }); else go();
      if (!speechOk) notify('info', { message: HELP.noSpeech });
      return { ok: true };
    }
    function stop() {
      sched.stop(); stopTimer(); q.length = 0;
      pending.forEach(function (p) { clearTimeout(p.timeout); });
      pending = [];
      if (speechOk) { try { window.speechSynthesis.cancel(); } catch (e) { /* 무시 */ } }
      emitState();
    }

    /* ---------- 큐 ---------- */
    function resolveCue(c) {
      if (typeof c === 'string') {
        if (CUE_BY[c]) return { id: c, en: CUE_BY[c].en, ko: CUE_BY[c].ko, g: CUE_BY[c].g };
        return { id: 'custom', en: c, ko: c, g: 'sec' };
      }
      return { id: c.id || 'custom', en: c.en || c.label || '', ko: c.ko || c.label || c.en || '', g: c.g || 'sec' };
    }
    /**
     * 큐를 예약합니다. 박자가 돌고 있으면 박에 맞춰, 멈춰 있으면 바로 안내합니다.
     * 반환 { ok, plan, text } — plan.landAt 은 오디오 시계 기준 (남은 시간 = landAt - ctx.currentTime)
     */
    function cue(c, mode) {
      c = resolveCue(c);
      var text = cfg.lang === 'ko' ? c.ko : c.en;
      if (!text) return { ok: false, error: '큐 이름이 비어 있습니다.' };
      mode = mode || cfg.mode;
      var useSpeech = speechOk && cfg.sound !== 'mute';
      if (!ctx || !sched.running) {                              // 멈춰 있을 때 — 시험 삼아 바로 들려줍니다
        if (useSpeech) speak(text, cfg.lang); 
        else if (ctx || AC) { try { ensureCtx(); ctx.resume(); earcon(ctx.currentTime + 0.02, c.g, 0); } catch (e) { return { ok: false, error: HELP.noAudio }; } }
        notify('cue', { status: 'spoken', text: text, immediate: true });
        return { ok: true, immediate: true, text: text };
      }
      var plan = sched.planCue(mode, { latency: useSpeech ? cfg.lat / 1000 : 0, leadBeats: cfg.lead });
      if (!plan.ok) return { ok: false, error: '박자가 멈춰 있습니다.' };
      var item = { plan: plan, text: text, cue: c, timeout: 0 };
      if (useSpeech) {
        var wait = Math.max(0, (plan.speakAt - ctx.currentTime) * 1000);
        item.timeout = setTimeout(function () {
          speak(text, cfg.lang);
          pending = pending.filter(function (p) { return p !== item; });
          notify('cue', { status: 'spoken', text: text, plan: plan });
        }, wait);
      } else {
        earcon(plan.landAt, c.g, Math.max(0, CUES.indexOf(CUE_BY[c.id]) % 4));
        item.timeout = setTimeout(function () {
          pending = pending.filter(function (p) { return p !== item; });
          notify('cue', { status: 'spoken', text: text, plan: plan });
        }, Math.max(0, (plan.landAt - ctx.currentTime) * 1000));
      }
      pending.push(item);
      notify('cue', { status: 'planned', text: text, plan: plan });
      return { ok: true, plan: plan, text: text };
    }
    function cancelCues() { pending.forEach(function (p) { clearTimeout(p.timeout); }); pending = []; if (speechOk) { try { window.speechSynthesis.cancel(); } catch (e) { /* 무시 */ } } emitState(); }

    function set(k, v) { cfg[k] = v; store(k === 'click' ? 'gain' : k, v); emitState(); }
    return {
      start: start, stop: stop, toggle: function (n) { return sched.running ? (stop(), { ok: true }) : start(n); },
      cue: cue, cancelCues: cancelCues,
      setBpm: function (b) { sched.setBpm(b); emitState(); }, setSig: function (n, d) { sched.setSig(n, d); cfg.first = !!sched.marks[0]; emitState(); },
      setClickVolume: function (v) { set('click', clamp(v, 0, 1)); applyGain(); },
      setPitch: function (st) { set('pitch', Math.round(clamp(st, LIMITS.minPitch, LIMITS.maxPitch) * 2) / 2); },
      setFlash: function (on) { set('flash', !!on); },
      /** 박 ">" 강세 — 원을 눌러 켜고 끕니다 (높은 음 · 더 크게) */
      toggleMark: function (i) { var r = sched.toggleMark(i); if (r === null) return null; cfg.first = !!sched.marks[0]; store('first', cfg.first); emitState(); return r; },
      setMarks: function (arr) { var r = sched.setMarks(arr); if (r) { cfg.first = !!sched.marks[0]; store('first', cfg.first); emitState(); } return r; },
      startIn: startIn,
      /** 사용자가 화면을 누른 순간에 소리 장치를 미리 깨워 둡니다 (아이폰 · 크롬은 눌러야 소리가 나옵니다) — 원격 시작에 필요 */
      prime: function () { try { var c = ensureCtx(); if (c.resume) c.resume(); return true; } catch (e) { return false; } }, setVoiceVolume: function (v) { set('voice', clamp(v, 0, 1)); },
      setMode: function (m) { set('mode', ['downbeat', 'lead', 'now'].indexOf(m) === -1 ? 'lead' : m); },
      setLead: function (n) { set('lead', Math.round(clamp(n, 1, 8))); }, setLang: function (l) { set('lang', l === 'ko' ? 'ko' : 'en'); },
      setLatency: function (ms) { latEma = clamp(ms, 0, 900); set('lat', Math.round(latEma)); }, setSound: function (s) { set('sound', s); }, setFirstAccent: function (on) { sched.setMark(0, !!on); set('first', !!on); },
      tap: function () { var b = tapper.tap(Date.now()); if (b) { sched.setBpm(b); emitState(); } return b; },
      state: state, sched: sched, ctx: function () { return ctx; }, help: HELP,
      destroy: function () {
        destroyed = true; stop();
        if (raf) cancelAnimationFrame(raf);
        if (ctx && ctx.close) { try { ctx.close(); } catch (e) { /* 무시 */ } }
        if (speechOk) { try { window.speechSynthesis.removeEventListener('voiceschanged', loadVoices); } catch (e) { /* 무시 */ } }
      }
    };
  }

  return { CUES: CUES, CUE_BY: CUE_BY, defaultMarks: defaultMarks, Sched: Sched, TapTempo: TapTempo, create: create, HELP: HELP, LIMITS: LIMITS };
}));
