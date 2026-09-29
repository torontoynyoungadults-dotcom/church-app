/** 시험용 PDF 만들기 (글자층이 있는 3쪽) — 외부 도구 없이 직접 씁니다 */
function mkpdf(pages) {
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(''), pagesObj = add(''), font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'), fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const kids = [];
  pages.forEach((lines) => {
    let y = 780, c = 'BT\n';
    lines.forEach((l) => { c += `/F1 ${l.size || 14} Tf 1 0 0 1 ${l.x || 60} ${y} Tm (${String(l.t).replace(/[()\\]/g, '\\$&')}) Tj\n`; y -= l.dy || 24; });
    c += 'ET';
    const content = add(`<< /Length ${Buffer.byteLength(c)} >>\nstream\n${c}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${content} 0 R >>`));
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
const SAMPLE = [
  [{ t: 'Amazing Grace', size: 26, dy: 40 }, { t: 'Verse 1' }, { t: 'G          D/F#', x: 60 }, { t: 'Amazing grace how sweet the sound' }, { t: 'Em7        C' }, { t: 'That saved a wretch like me' }, { t: '', dy: 20 }, { t: 'Chorus' }, { t: 'G      D' }, { t: 'I once was lost but now am found' }],
  [{ t: 'Page two', size: 22, dy: 40 }, { t: 'Verse 2' }, { t: 'Twas grace that taught my heart to fear' }],
  [{ t: 'Page three', size: 22, dy: 40 }, { t: 'Bridge' }, { t: 'Praise the Lord' }],
];
module.exports = { mkpdf, SAMPLE };
