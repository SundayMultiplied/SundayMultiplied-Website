import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";
import {
  extractDocxText,
  extractTeachingSourceText,
  normalizeExtractedText,
} from "../worker/teaching-source-extraction.ts";

test("normalizes uploaded plain text without collapsing paragraphs", async () => {
  const bytes = new TextEncoder().encode("\uFEFFPoint one  \r\n\r\n\r\nPoint two\u0000").buffer;
  const result = await extractTeachingSourceText("notes.txt", bytes);
  assert.equal(result.text, "Point one\n\nPoint two");
  assert.deepEqual(result.warnings, []);
});

test("extracts paragraph, tab, break, and XML entity text from DOCX", () => {
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>Grace &amp; truth</w:t></w:r></w:p>
        <w:p><w:r><w:t>First</w:t><w:tab/><w:t>Second</w:t><w:br/><w:t>Third</w:t></w:r></w:p>
      </w:body>
    </w:document>`;
  const archive = zipSync({ "word/document.xml": strToU8(documentXml) });
  assert.equal(normalizeExtractedText(extractDocxText(archive)), "Grace & truth\nFirst\tSecond\nThird");
});

test("extracts text from a PDF text layer", async () => {
  const message = "Sermon notes sample with enough text";
  const result = await extractTeachingSourceText("notes.pdf", minimalTextPdf(message).buffer);
  assert.equal(result.text, message);
});

test("rejects a DOCX without a readable document body", () => {
  const archive = zipSync({ "word/styles.xml": strToU8("<styles />") });
  assert.throws(() => extractDocxText(archive), /does not contain a readable Word document body/);
});

test("rejects source files without usable text", async () => {
  await assert.rejects(
    extractTeachingSourceText("empty.txt", new TextEncoder().encode("  ").buffer),
    /did not contain enough readable text/,
  );
});

function minimalTextPdf(message) {
  const stream = `BT /F1 18 Tf 72 720 Td (${message}) Tj ET\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const object of objects) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += object;
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
