import { describe, expect, it } from 'vitest';
import { DoclingConverter, FakeDoclingConverter } from './index.js';

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
});
