/**
 * 설교 노트 AI 정제 — 서버를 멈추지 않는 제미나이 호출 (Step 4)
 * ------------------------------------------------------------
 * 다른 AI 기능(lib/worker.js 의 gemini)은 다리(bridge)를 거쳐서 답이 올 때까지 서버 전체가 멈춥니다 (몇 초).
 * 노트 정제는 예배 중에 여럿이 누를 수 있어서, 여기서는 메인 스레드에서 비동기 fetch 로 부릅니다 —
 * 기다리는 동안에도 다른 사람의 저장 · 화면 요청이 그대로 처리됩니다.
 * 열쇠(GEMINI_API_KEY)와 모델 · 요청 모양은 lib/worker.js 의 gemini 와 같습니다.
 */
async function gemini(o) {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('AI 열쇠(GEMINI_API_KEY)가 아직 서버에 설정되지 않았습니다.');
  const model = String(o.model || 'gemini-2.5-flash').replace(/^models\//, '');
  const parts = [{ text: String(o.prompt || '') }];
  // 허브 v5 — 공개 유튜브 영상(설교)을 함께 넘기면 제미나이가 영상을 직접 보고 답합니다
  const video = String(o.video || '');
  if (video && /^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}$/.test(video)) parts.unshift({ fileData: { fileUri: video } });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: o.temperature == null ? 0.3 : Number(o.temperature),
      maxOutputTokens: Number(o.maxTokens) || 2048,
      responseMimeType: o.json ? 'application/json' : 'text/plain',
    },
  };
  if (parts.length > 1) body.generationConfig.mediaResolution = 'MEDIA_RESOLUTION_LOW';
  if (o.system) body.systemInstruction = { parts: [{ text: String(o.system) }] };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Number(o.timeoutMs) || 45000);
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
    if (e && e.name === 'AbortError') throw new Error(parts.length > 1 ? 'AI 가 영상을 보는 데 너무 오래 걸려 멈췄습니다. 설교 원고를 붙여 넣고 다시 눌러주세요.' : 'AI 응답이 너무 늦어 멈췄습니다. 잠시 후 다시 눌러주세요.');
    throw new Error('AI 에 연결하지 못했습니다. 잠시 후 다시 눌러주세요.');
  } finally { clearTimeout(timer); }
  let d = {};
  try { d = JSON.parse(txt); } catch (e) { d = {}; }
  if (!r.ok) {
    const msg = (d && d.error && d.error.message) || ('AI 응답 오류 (' + r.status + ')');
    if (r.status === 429 || /quota|RESOURCE_EXHAUSTED|rate/i.test(msg)) throw new Error('AI 사용량이 잠시 많습니다. 1분쯤 뒤에 다시 눌러주세요.');
    if (parts.length > 1 && /video|file|uri|youtube|private|not (found|available)|unsupported/i.test(msg)) throw new Error('AI 가 이 영상을 열지 못했습니다 (비공개 · 일부공개 영상이거나 너무 깁니다). 설교 원고를 붙여 넣고 다시 눌러주세요.');
    throw new Error(msg);
  }
  const cand = (d.candidates || [])[0] || {};
  const outParts = (cand.content && cand.content.parts) || [];
  const out = outParts.map((x) => x.text || '').join('').trim();
  if (!out) {
    const why = cand.finishReason || (d.promptFeedback && d.promptFeedback.blockReason) || '';
    throw new Error('AI 가 답을 만들지 못했습니다.' + (why ? ' (' + why + ')' : ''));
  }
  return { text: out, model };
}

module.exports = { gemini };
