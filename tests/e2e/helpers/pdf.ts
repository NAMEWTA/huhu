/** 手写一个最小合法 PDF（含正确 xref）；`pad` 个字节的未引用流让文件超过 10 MiB 以验证分段读取。 */
export function buildPdf(pages: string[], pad = 0): Buffer {
  const objs: Buffer[] = [];
  const add = (body: string | Buffer) => (objs.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1")), objs.length);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // Pages，稍后回填
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const text of pages) {
    const stream = text
      .split("\n")
      .map((line, index) => `BT /F1 24 Tf 72 ${700 - index * 36} Td (${line}) Tj ET`)
      .join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`));
  }
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`, "latin1");
  if (pad > 0) add(Buffer.concat([Buffer.from(`<< /Length ${pad} >>\nstream\n`, "latin1"), Buffer.alloc(pad, 0x20), Buffer.from("\nendstream", "latin1")]));
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [];
  let pos = chunks[0]!.length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const piece = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1")]);
    chunks.push(piece);
    pos += piece.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`), `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`].join("");
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}
