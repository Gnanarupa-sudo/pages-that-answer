// Browser-only document text extraction + chunking.
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      pages.push(tc.items.map((it: any) => ("str" in it ? it.str : "")).join(" "));
    }
    return pages.join("\n\n");
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (/\.(xlsx|xls|ods)$/.test(name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    return wb.SheetNames.map((s) => `Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s]!)}`).join("\n\n");
  }
  if (/\.(html?|xml)$/.test(name)) {
    const doc = new DOMParser().parseFromString(await file.text(), "text/html");
    return doc.body?.textContent ?? "";
  }
  return file.text();
}

export function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = text.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const brk = Math.max(clean.lastIndexOf("\n", end), clean.lastIndexOf(". ", end));
      if (brk > i + size * 0.5) end = brk + 1;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= clean.length) break;
    i = end - overlap;
  }
  return out;
}

export function cosine(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i]!, y = b[i]!; d += x * y; na += x * x; nb += y * y; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
