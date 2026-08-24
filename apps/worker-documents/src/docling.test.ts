import { describe, expect, it } from 'vitest';
import { DoclingConverter, FakeDoclingConverter, parsePdfFigureXml } from './index.js';

// Minimal valid PDF (text layer only) generated inline.
function makePdf(): Uint8Array {
  const content = 'BT /F1 24 Tf 72 720 Td (Disconnect power before opening the housing.) Tj ET';
  const enc = new TextEncoder();
  const objs = [
    enc.encode('<< /Type /Catalog /Pages 2 0 R >>'),
    enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    enc.encode(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
        '/Resources << /Font << /F1 5 0 R >> >> >>',
    ),
    enc.encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  const chunks: Uint8Array[] = [enc.encode('%PDF-1.4\n')];
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(totalLen(chunks));
    chunks.push(enc.encode(`${i + 1} 0 obj\n`));
    chunks.push(o);
    chunks.push(enc.encode('\nendobj\n'));
  });
  const xref = totalLen(chunks);
  chunks.push(enc.encode(`xref\n0 ${objs.length + 1}\n`));
  chunks.push(enc.encode('0000000000 65535 f \n'));
  offsets.forEach((off) => {
    chunks.push(enc.encode(`${String(off).padStart(10, '0')} 00000 n \n`));
  });
  chunks.push(
    enc.encode(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`),
  );
  const total = totalLen(chunks);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function totalLen(chunks: Uint8Array[]): number {
  return chunks.reduce((n, c) => n + c.length, 0);
}

describe('Docling converter', () => {
  it('fake converter produces deterministic blocks', async () => {
    const conv = new FakeDoclingConverter();
    const out = await conv.convert(makePdf(), 'application/pdf');
    expect(out.pageCount).toBe(1);
    expect(Array.isArray(out.blocks)).toBe(true);
  });

  it(
    'real Docling extracts the PDF text layer when DOCLING_PYTHON is set',
    { timeout: 320_000 },
    async () => {
      const python = process.env.DOCLING_PYTHON;
      if (!python) {
        return; // skipped in environments without a docling venv
      }
      const conv = new DoclingConverter(python);
      const out = await conv.convert(makePdf(), 'application/pdf');
      expect(out.pageCount).toBe(1);
      const text = out.blocks.map((b) => b.text).join(' ');
      expect(text).toContain('Disconnect power');
    },
  );

  it('turns returned table metadata into a citable table block', async () => {
    const script = String.raw`
import json
print(json.dumps({
  "pageCount": 1,
  "blocks": [],
  "tables": [{"path": "table:1", "page": 0, "header": ["Setting"], "rows": [["5 Nm"]]}],
  "figures": [],
  "providers": []
}))
`;
    const conv = new DoclingConverter('python3', script);
    const out = await conv.convert(new TextEncoder().encode('table'), 'text/csv');
    expect(out.blocks).toEqual([
      expect.objectContaining({
        kind: 'table-row',
        structuralPath: 'table:1',
        text: 'Setting␟5 Nm',
        pageIndex: 0,
      }),
    ]);
  });

  it('renders PDF pages when Docling returns no page images', async () => {
    const script = String.raw`
import json
print(json.dumps({"pageCount": 1, "blocks": [], "tables": [], "figures": [], "providers": []}))
`;
    const conv = new DoclingConverter('python3', script);
    const out = await conv.convert(makePdf(), 'application/pdf');
    expect(out.pageImages).toHaveLength(1);
    expect(out.pageImages?.[0]?.mimeType).toBe('image/jpeg');
    expect(Buffer.from(out.pageImages?.[0]?.dataBase64 ?? '', 'base64').subarray(0, 2)).toEqual(
      Buffer.from([0xff, 0xd8]),
    );
  });

  it('keeps embedded-image geometry but ignores full-page scan images', () => {
    const figures = parsePdfFigureXml(
      '<page number="1" width="612" height="792">' +
        '<image left="72" top="120" width="240" height="180" src="a.jpg"/>' +
        '<image left="0" top="0" width="612" height="792" src="scan.jpg"/>' +
        '</page>',
      'a'.repeat(64) as never,
    );
    expect(figures).toHaveLength(1);
    expect(figures[0]?.bbox).toEqual({ left: 72, top: 120, width: 240, height: 180 });
    expect(figures[0]?.pageIndex).toBe(0);
  });
});
