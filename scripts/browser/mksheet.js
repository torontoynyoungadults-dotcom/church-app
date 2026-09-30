/**
 * 시험용 "악보" 만들기 (Step 13) — 오선 · 음표 · 코드 글자 · 가사가 있는 리드시트를 도형 목록으로 만들고,
 *  ① PDF(글자층 있음: 코드 · 가사가 진짜 글자)  ② RGBA 그림(글자 없이 도형만 — Node 시험용) 으로 바꿉니다.
 *  좌표는 종이(595×842pt) 왼쪽 위 기준, 아래로 갈수록 y 가 큽니다.
 */
const PAGE_W = 595, PAGE_H = 842;

/** 음표 이름 → { step, type }. step: 아래 첫째 줄(E4)=0, 한 칸마다 +1.  type: q 4분 · e 8분 · h 2분 · w 온 · dq 점4분 */
function n(step, type) { return { step, type: type || 'q' }; }

/** 기본 곡: G 장조 "Amazing Grace" 앞부분 느낌의 4단(단마다 오선 하나). chords[i] = i 번째 음 위에 붙일 코드(없으면 안 붙임) */
const SONG = [
  { notes: [n(2), n(4), n(6, 'dq'), n(4, 'e'), n(5), n(4), n(3, 'h')],
    chords: { 0: 'G', 4: 'C', 6: 'D' }, lyrics: ['A', 'ma', 'zing', 'grace', 'how', 'sweet', 'the'] },
  { notes: [n(4), n(6), n(4, 'h'), n(5), n(3), n(2, 'h')],
    chords: { 0: 'Em7', 2: 'G', 3: 'C', 5: 'G' }, lyrics: ['sound', 'that', 'saved', 'a', 'wretch', 'like'] },
  { notes: [n(6), n(7, 'e'), n(6, 'e'), n(5), n(4), n(3, 'h'), n(2, 'h')],
    chords: { 0: 'C', 3: 'G', 5: 'D', 6: 'G' }, lyrics: ['me', 'I', 'once', 'was', 'lost', 'but', 'now'] },
  { notes: [n(2), n(4), n(6, 'h'), n(4), n(3), n(2, 'h')],
    chords: { 0: 'G', 2: 'D/F#', 3: 'C', 5: 'G' }, lyrics: ['am', 'found', 'was', 'blind', 'but', 'now'] },
];

function layout(opt) {
  opt = opt || {};
  const sp = opt.sp || 8, x0 = 50, x1 = 545, prims = [], truth = { staves: [], notes: [], chords: [], sp }, sharps = opt.sharps == null ? 1 : opt.sharps;
  const song = opt.song || SONG, top0 = opt.top0 || 150, dy = opt.dy || 150;
  song.forEach((sys, si) => {
    const top = top0 + si * dy, bottom = top + 4 * sp, lineW = Math.max(0.6, sp * 0.07);
    truth.staves.push({ top, bottom, sp });
    for (let k = 0; k < 5; k++) prims.push({ t: 'rect', x: x0, y: top + k * sp - lineW / 2, w: x1 - x0, h: lineW });
    prims.push({ t: 'rect', x: x0, y: top, w: lineW * 1.6, h: 4 * sp });                       // 왼쪽 세로선
    // 음자리표 흉내: 세로 줄기 + 아래 둥근 고리 + 위 곡선 (크고 복잡한 덩어리)
    prims.push({ t: 'rect', x: x0 + 1.6 * sp, y: top - 1.6 * sp, w: sp * 0.16, h: 6.6 * sp });
    prims.push({ t: 'ring', cx: x0 + 1.6 * sp, cy: bottom - 0.4 * sp, rx: 0.95 * sp, ry: 0.95 * sp, irx: 0.6 * sp, iry: 0.6 * sp, rot: 0 });
    prims.push({ t: 'ring', cx: x0 + 1.9 * sp, cy: top + 1.2 * sp, rx: 0.8 * sp, ry: 1.1 * sp, irx: 0.5 * sp, iry: 0.8 * sp, rot: 0.3 });
    // 조표: 샵 (F 줄) — 가는 세로 두 줄 + 굵은 가로 두 줄
    for (let sIdx = 0; sIdx < sharps; sIdx++) {
      const sx = x0 + 3.8 * sp + sIdx * 1.2 * sp, sy = top + (sIdx % 2 ? 1.5 : 0.5) * sp;
      prims.push({ t: 'rect', x: sx, y: sy - 1.1 * sp, w: sp * 0.1, h: 2.5 * sp }); prims.push({ t: 'rect', x: sx + 0.5 * sp, y: sy - 1.3 * sp, w: sp * 0.1, h: 2.5 * sp });
      prims.push({ t: 'poly', pts: [[sx - 0.15 * sp, sy - 0.2 * sp], [sx + 0.7 * sp, sy - 0.55 * sp], [sx + 0.7 * sp, sy - 0.2 * sp], [sx - 0.15 * sp, sy + 0.15 * sp]] });
      prims.push({ t: 'poly', pts: [[sx - 0.15 * sp, sy + 0.4 * sp], [sx + 0.7 * sp, sy + 0.05 * sp], [sx + 0.7 * sp, sy + 0.4 * sp], [sx - 0.15 * sp, sy + 0.75 * sp]] });
    }
    if (si === 0 && opt.timeSig !== false) { const tx = x0 + 3.8 * sp + sharps * 1.2 * sp + 0.4 * sp; prims.push({ t: 'text', s: '4', x: tx, y: top + 1.7 * sp, size: 2.6 * sp, bold: true }); prims.push({ t: 'text', s: '4', x: tx, y: top + 3.7 * sp, size: 2.6 * sp, bold: true }); }
    // 음표
    let x = x0 + (3.8 + sharps * 1.2 + (si === 0 ? 2.8 : 1.4)) * sp + 2.5 * sp, beat = 0;
    const heads = [];
    sys.notes.forEach((nt, i) => {
      const beats = { q: 1, e: 0.5, h: 2, w: 4, dq: 1.5 }[nt.type], y = bottom - nt.step * sp / 2, rx = 0.66 * sp, ry = 0.5 * sp, open = nt.type === 'h' || nt.type === 'w';
      const head = { t: open ? 'ring' : 'ell', cx: x, cy: y, rx, ry, irx: 0.42 * sp, iry: 0.2 * sp, rot: open ? -0.42 : -0.35 };
      if (nt.type === 'w') { head.rx = 0.72 * sp; head.irx = 0.36 * sp; head.iry = 0.3 * sp; }
      prims.push(head);
      if (nt.step <= -2) for (let s2 = -2; s2 >= nt.step; s2 -= 2) prims.push({ t: 'rect', x: x - 1.05 * sp, y: bottom - s2 * sp / 2 - lineW / 2, w: 2.1 * sp, h: lineW });
      if (nt.step >= 10) for (let s2 = 10; s2 <= nt.step; s2 += 2) prims.push({ t: 'rect', x: x - 1.05 * sp, y: bottom - s2 * sp / 2 - lineW / 2, w: 2.1 * sp, h: lineW });
      let stemDir = 0, stemX = 0, tipY = 0;
      if (nt.type !== 'w') {
        stemDir = nt.step >= 6 ? 1 : -1;                                                     // 가운데 줄 위는 줄기가 아래로
        stemX = stemDir === -1 ? x + rx - sp * 0.06 : x - rx + sp * 0.06;
        tipY = y + stemDir * 3.4 * sp;
        prims.push({ t: 'rect', x: stemX - sp * 0.06, y: Math.min(y, tipY), w: sp * 0.12, h: Math.abs(tipY - y) });
      }
      heads.push({ i, x, y, stemDir, stemX, tipY, type: nt.type });
      if (nt.type === 'dq') prims.push({ t: 'ell', cx: x + 1.15 * sp, cy: y + (nt.step % 2 === 0 ? -0.5 * sp : 0), rx: 0.2 * sp, ry: 0.2 * sp, rot: 0 });
      truth.notes.push({ sys: si, x, y, step: nt.step, beats, type: nt.type, idx: i });
      const adv = sp * (2.4 + 1.5 * Math.pow(beats, 0.75));
      beat += beats; x += adv;
      if (beat >= 4 && i < sys.notes.length - 1) { prims.push({ t: 'rect', x: x - adv / 2 + 0.2 * sp, y: top, w: lineW * 1.5, h: 4 * sp }); beat = 0; }
    });
    prims.push({ t: 'rect', x: x1 - lineW * 1.6, y: top, w: lineW * 1.6, h: 4 * sp });
    // 8분음표: 이웃한 두 개는 빔, 혼자는 깃발
    for (let i = 0; i < heads.length; i++) {
      const a = heads[i]; if (a.type !== 'e') continue;
      const b = heads[i + 1];
      if (b && b.type === 'e' && b.stemDir === a.stemDir && !a.beamed) {
        const yA = a.tipY, yB = b.tipY, dir = a.stemDir, thick = 0.5 * sp;
        prims.push({ t: 'poly', pts: [[a.stemX - sp * 0.06, yA], [b.stemX + sp * 0.06, yB], [b.stemX + sp * 0.06, yB + dir * -thick], [a.stemX - sp * 0.06, yA + dir * -thick]] });
        a.beamed = b.beamed = true;
      } else if (!a.beamed) {
        const dir = a.stemDir; prims.push({ t: 'poly', pts: [[a.stemX + sp * 0.06, a.tipY], [a.stemX + 1.05 * sp, a.tipY - dir * 1.1 * sp], [a.stemX + 1.05 * sp, a.tipY - dir * 1.7 * sp], [a.stemX + sp * 0.06, a.tipY - dir * 0.6 * sp]] });
      }
    }
    // 코드 (오선 위 1.7칸) · 가사 (오선 아래)
    Object.keys(sys.chords || {}).forEach((k) => {
      const hd = heads[+k]; if (!hd) return; const size = opt.chordSize || 11;
      prims.push({ t: 'text', s: sys.chords[k], x: hd.x - 0.66 * sp, y: top - 2.4 * sp, size, bold: true });
      truth.chords.push({ text: sys.chords[k], x: hd.x - 0.66 * sp, y: top - 2.4 * sp, size, sys: si, idx: +k });
    });
    if (opt.lyrics !== false) (sys.lyrics || []).forEach((w, i) => { const hd = heads[i]; if (hd) prims.push({ t: 'text', s: w, x: hd.x - 0.5 * sp, y: bottom + 6.5 * sp, size: 9 }); });
  });
  if (opt.title !== false) prims.push({ t: 'text', s: opt.titleText || 'Amazing Grace', x: 210, y: 90, size: 20, bold: true });
  if (opt.key !== false) prims.push({ t: 'text', s: opt.keyText || 'Key : G', x: 50, y: 118, size: 10 });
  return { prims, truth };
}

/* ---------------------------------------------------------------- PDF */
function pdfEsc(s) { return String(s).replace(/[()\\]/g, '\\$&'); }
function num(v) { return (Math.round(v * 100) / 100).toString(); }
function ellPath(rx, ry) {
  const k = 0.5523;
  return `${num(rx)} 0 m ${num(rx)} ${num(ry * k)} ${num(rx * k)} ${num(ry)} 0 ${num(ry)} c ${num(-rx * k)} ${num(ry)} ${num(-rx)} ${num(ry * k)} ${num(-rx)} 0 c ${num(-rx)} ${num(-ry * k)} ${num(-rx * k)} ${num(-ry)} 0 ${num(-ry)} c ${num(rx * k)} ${num(-ry)} ${num(rx)} ${num(-ry * k)} ${num(rx)} 0 c h`;
}
function toPdfContent(prims) {
  let c = '0 g\n';
  const Y = (y) => PAGE_H - y;
  prims.forEach((p) => {
    if (p.t === 'rect') c += `${num(p.x)} ${num(Y(p.y + p.h))} ${num(p.w)} ${num(p.h)} re f\n`;
    else if (p.t === 'poly') { c += p.pts.map((q, i) => `${num(q[0])} ${num(Y(q[1]))} ${i ? 'l' : 'm'}`).join(' ') + ' h f\n'; }
    else if (p.t === 'ell' || p.t === 'ring') {
      const th = -(p.rot || 0), cs = Math.cos(th), sn = Math.sin(th);
      c += `q ${num(cs)} ${num(sn)} ${num(-sn)} ${num(cs)} ${num(p.cx)} ${num(Y(p.cy))} cm ${ellPath(p.rx, p.ry)}`;
      if (p.t === 'ring') c += ` ${ellPath(p.irx, p.iry)} f*\nQ\n`; else c += ' f\nQ\n';
    } else if (p.t === 'text') c += `BT /${p.bold ? 'F2' : 'F1'} ${num(p.size)} Tf 1 0 0 1 ${num(p.x)} ${num(Y(p.y))} Tm (${pdfEsc(p.s)}) Tj ET\n`;
  });
  return c;
}
function mkSheetPdf(prims, extraPages) {
  const pages = [toPdfContent(prims)].concat(extraPages || []);
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(''), pagesObj = add(''), font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'), fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const kids = [];
  pages.forEach((c) => {
    const content = add(`<< /Length ${Buffer.byteLength(c)} >>\nstream\n${c}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

/* ---------------------------------------------------------------- RGBA (글자 없이 도형만) */
function toRgba(prims, width) {
  const sc = width / PAGE_W, SS = 2, W = Math.round(PAGE_W * sc), H = Math.round(PAGE_H * sc), BW = W * SS, BH = H * SS, k = sc * SS;
  const big = new Uint8Array(BW * BH);
  const fillPoly = (pts) => {
    let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    pts.forEach((q) => { minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); });
    for (let y = Math.max(0, Math.floor(minY * k)); y <= Math.min(BH - 1, Math.ceil(maxY * k)); y++) {
      const py = (y + 0.5) / k, xs = [];
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= py && b[1] > py) || (b[1] <= py && a[1] > py)) xs.push(a[0] + (py - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(0, Math.round(xs[i] * k)); x < Math.min(BW, Math.round(xs[i + 1] * k)); x++) big[y * BW + x] = 1;
    }
  };
  const ellTest = (p, ox, oy) => {
    const cs = Math.cos(-(p.rot || 0)), sn = Math.sin(-(p.rot || 0));
    return (px, py, rx, ry) => { const dx = px - p.cx, dy = py - p.cy, u = dx * cs - dy * sn, v = dx * sn + dy * cs; return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1; };
  };
  prims.forEach((p) => {
    if (p.t === 'rect') fillPoly([[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]]);
    else if (p.t === 'poly') fillPoly(p.pts);
    else if (p.t === 'ell' || p.t === 'ring') {
      const R = Math.max(p.rx, p.ry) + 1, test = ellTest(p);
      for (let y = Math.max(0, Math.floor((p.cy - R) * k)); y <= Math.min(BH - 1, Math.ceil((p.cy + R) * k)); y++) for (let x = Math.max(0, Math.floor((p.cx - R) * k)); x <= Math.min(BW - 1, Math.ceil((p.cx + R) * k)); x++) {
        const px = (x + 0.5) / k, py = (y + 0.5) / k;
        if (test(px, py, p.rx, p.ry) && !(p.t === 'ring' && test(px, py, p.irx, p.iry))) big[y * BW + x] = 1;
      }
    }
  });
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0; for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) s += big[(y * SS + dy) * BW + x * SS + dx];
    const v = Math.round(255 * (1 - s / (SS * SS))), i = (y * W + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
  }
  return { rgba, w: W, h: H, scale: sc };
}

module.exports = { PAGE_W, PAGE_H, SONG, n, layout, mkSheetPdf, toRgba, toPdfContent };
