import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";

export type TeachingSourceExtraction = {
  text: string;
  warnings: string[];
};

const MIN_USABLE_CHARACTERS = 20;
const MAX_DOCX_DOCUMENT_XML_BYTES = 8_000_000;
export const MAX_EXTRACTED_CHARACTERS_PER_SOURCE = 300_000;
export const MAX_TOTAL_SUPPLEMENTAL_CHARACTERS = 600_000;

export async function extractTeachingSourceText(
  filename: string,
  bytes: ArrayBuffer,
): Promise<TeachingSourceExtraction> {
  let text: string;
  const warnings: string[] = [];

  if (/\.txt$/i.test(filename)) {
    text = decodeText(new Uint8Array(bytes));
  } else if (/\.docx$/i.test(filename)) {
    text = extractDocxText(new Uint8Array(bytes));
  } else if (/\.pdf$/i.test(filename)) {
    const document = await getDocumentProxy(new Uint8Array(bytes));
    const extracted = await extractText(document, { mergePages: true });
    text = Array.isArray(extracted.text) ? extracted.text.join("\n\n") : extracted.text;
  } else {
    throw new Error(`${filename} has an unsupported teaching-source format.`);
  }

  text = normalizeExtractedText(text);
  if (text.length < MIN_USABLE_CHARACTERS) {
    throw new Error(`${filename} did not contain enough readable text. If it is a scanned PDF, run OCR or upload a TXT/DOCX version.`);
  }
  if (text.length > MAX_EXTRACTED_CHARACTERS_PER_SOURCE) {
    throw new Error(`${filename} contains too much extracted text. Limit each supporting source to ${MAX_EXTRACTED_CHARACTERS_PER_SOURCE.toLocaleString("en-US")} characters.`);
  }
  if (text.includes("\uFFFD")) warnings.push("The extracted text contains replacement characters and may need review.");

  return { text, warnings };
}

export function normalizeExtractedText(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/[\t ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractDocxText(bytes: Uint8Array) {
  let files: Record<string, Uint8Array>;
  let documentXmlTooLarge = false;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.name !== "word/document.xml") return false;
        documentXmlTooLarge = file.originalSize > MAX_DOCX_DOCUMENT_XML_BYTES;
        return !documentXmlTooLarge;
      },
    });
  } catch {
    throw new Error("The DOCX file could not be opened.");
  }
  if (documentXmlTooLarge) throw new Error("The DOCX document body is too large to extract safely.");
  const documentXml = files["word/document.xml"];
  if (!documentXml) throw new Error("The DOCX file does not contain a readable Word document body.");

  return decodeXmlText(
    strFromU8(documentXml)
      .replace(/>\s+</g, "><")
      .replace(/<w:tab\b[^>]*\/>/gi, "\t")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, "\n")
      .replace(/<\/w:tc>/gi, "\t")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeXmlText(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => safeCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  return String.fromCodePoint(value);
}
