/**
 * 제미나이(Gemini) 호출 — 서버를 멈추지 않는 비동기 호출 (Step 4 · 허브 v5 · v6)
 * ------------------------------------------------------------
 * 노트 정제 · 설교 요약은 server.js 에서 이 함수를 직접(비동기로) 부르고,
 * 다른 AI 기능은 lib/worker.js 의 gemini 가 이 함수를 그대로 씁니다 — 요청 모양 · 오류 안내가 한 곳에 있습니다.
 *
 * v6 — "This model is currently experiencing high demand" (503 · 과부하 · 사용량 초과) 대책:
 *   ① 같은 모델로 잠깐 쉬고 한 번 더 → ② 그래도 안 되면 다른 제미나이 모델로 자동으로 넘어갑니다.
 *   고른 모델(관리 화면)이 먼저, 그다음 GEMINI_FALLBACK_MODELS(쉼표) 또는 기본 목록 순서.
 *   *-latest / preview 모델은 사람이 몰리면 자주 막히므로, 안정판(2.5)을 뒤에 받쳐 둡니다.
 */
const DEFAULT_FALLBACK = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];
const YT = /^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}$/;

function modelChain(first) {
  const env = String(process.env.GEMINI_FALLBACK_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = [String(first || 'gemini-2.5-flash').replace(/^models\//, '')].concat(env.length ? env : DEFAULT_FALLBACK);
  return list.filter((m, i) => m && list.indexOf(m) === i);
}

/** 잠깐 기다리면 풀리는 오류 (과부하 · 일시 장애 · 사용량) */
function isBusy(status, msg) {
  return status === 503 || status === 500 || status === 502 || status === 504 || status === 429 ||
    /high demand|overloaded|UNAVAILABLE|try again later|RESOURCE_EXHAUSTED|quota|rate limit|temporarily/i.test(msg || '');
}
/** 이 모델이 없거나(이름 바뀜 · 종료) 이 요청을 못 받는 경우 → 다음 모델로 */
function isModelGone(status, msg) {
  return status === 404 || /not found|is not supported|no longer available|deprecated|NOT_FOUND/i.test(msg || '');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(model, body, key, timeoutMs, video) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let r, txt;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    txt = await r.text();
  } catch (e) {
    if (e && e.name === 'AbortError') return { fail: 'timeout' };
    return { fail: 'network', status: 0, msg: String((e && e.message) || e) };
  } finally { clearTimeout(timer); }
  let d = {};
  try { d = JSON.parse(txt); } catch (e) { d = {}; }
  if (!r.ok) return { fail: 'http', status: r.status, msg: (d && d.error && d.error.message) || ('AI 응답 오류 (' + r.status + ')') };
  const cand = (d.candidates || [])[0] || {};
  const outParts = (cand.content && cand.content.parts) || [];
  const out = outParts.map((x) => x.text || '').join('').trim();
  if (!out) {
    const why = cand.finishReason || (d.promptFeedback && d.promptFeedback.blockReason) || '';
    return { fail: 'empty', why };
  }
  return { text: out };
}

async function gemini(o) {
  o = o || {};
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('AI 열쇠(GEMINI_API_KEY)가 아직 서버에 설정되지 않았습니다.');
  const parts = [{ text: String(o.prompt || '') }];
  // 허브 v5 — 공개 유튜브 영상(설교)을 함께 넘기면 제미나이가 영상을 직접 보고 답합니다
  const video = String(o.video || '');
  if (video && YT.test(video)) parts.unshift({ fileData: { fileUri: video } });
  const hasVideo = parts.length > 1;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: o.temperature == null ? 0.3 : Number(o.temperature),
      maxOutputTokens: Number(o.maxTokens) || 2048,
      responseMimeType: o.json ? 'application/json' : 'text/plain',
    },
  };
  if (hasVideo) body.generationConfig.mediaResolution = 'MEDIA_RESOLUTION_LOW';
  if (o.system) body.systemInstruction = { parts: [{ text: String(o.system) }] };

  const timeoutMs = Number(o.timeoutMs) || 45000;
  const deadline = Date.now() + Math.max(timeoutMs * 2, 90000);   // 모델을 바꿔 가며 기다리는 전체 한도
  const chain = modelChain(o.model);
  const wait = o._retryWaitMs == null ? 1500 : Number(o._retryWaitMs);
  let last = null, busyCount = 0;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    for (let tryNo = 0; tryNo < 2; tryNo++) {                     // 같은 모델은 최대 두 번 (과부하일 때만 한 번 더)
      if (Date.now() > deadline) break;
      const left = Math.max(5000, Math.min(timeoutMs, deadline - Date.now()));
      const r = await callOnce(model, body, key, left, hasVideo);
      if (r.text) return { text: r.text, model, fallback: i > 0 ? chain[0] : undefined };
      last = r;
      if (r.fail === 'http' && isBusy(r.status, r.msg)) {
        busyCount++;
        if (tryNo === 0 && !/RESOURCE_EXHAUSTED|quota/i.test(r.msg)) { await sleep(wait * (1 + Math.random())); continue; }
        break;                                                     // 사용량 초과는 같은 모델로 다시 해도 소용없음 → 다음 모델
      }
      if (r.fail === 'http' && isModelGone(r.status, r.msg)) break;   // 없는 모델 → 다음 모델
      if (r.fail === 'network' && tryNo === 0) { await sleep(wait); continue; }
      // 그 밖의 오류(영상 못 엶 · 요청 모양 · 막힘 · 시간 초과)는 모델을 바꿔도 같으므로 바로 알립니다
      i = chain.length;
      break;
    }
  }
  throw new Error(friendly(last, hasVideo, busyCount));
}

function friendly(r, hasVideo, busyCount) {
  if (!r) return 'AI 응답이 너무 늦어 멈췄습니다. 잠시 후 다시 눌러주세요.';
  if (r.fail === 'timeout') return hasVideo ? 'AI 가 영상을 보는 데 너무 오래 걸려 멈췄습니다. 설교 원고를 붙여 넣고 다시 눌러주세요.' : 'AI 응답이 너무 늦어 멈췄습니다. 잠시 후 다시 눌러주세요.';
  if (r.fail === 'network') return 'AI 에 연결하지 못했습니다. 잠시 후 다시 눌러주세요.';
  if (r.fail === 'empty') return 'AI 가 답을 만들지 못했습니다.' + (r.why ? ' (' + r.why + ')' : '');
  if (r.status === 429 || /RESOURCE_EXHAUSTED|quota|rate/i.test(r.msg || '')) return 'AI 사용량이 잠시 많습니다 (여러 모델로 다시 해 봤습니다). 1~2분 뒤에 다시 눌러주세요.';
  if (busyCount || isBusy(r.status, r.msg)) return '지금 제미나이 AI 모델들이 모두 붐빕니다 (여러 모델로 다시 해 봤습니다). 1~2분 뒤에 다시 눌러주세요.';
  if (hasVideo && /video|file|uri|youtube|private|not (found|available)|unsupported/i.test(r.msg || '')) return 'AI 가 이 영상을 열지 못했습니다 (비공개 · 일부공개 영상이거나 너무 깁니다). 설교 원고를 붙여 넣고 다시 눌러주세요.';
  return r.msg || 'AI 응답 오류';
}

module.exports = { gemini, modelChain, isBusy };
