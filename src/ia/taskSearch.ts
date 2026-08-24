import type { PdfTask } from "./taskCatalog";
import { taskSearchText } from "./taskCatalog";

const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "can", "do", "for", "from", "get", "i", "in", "into", "is", "it",
  "make", "my", "of", "on", "or", "pdf", "please", "the", "this", "to", "want", "with"
]);

const TASK_ALIASES: Record<string, string> = {
  "edit-pdf": "add text insert text remove text delete text replace image move image resize image change existing text",
  "annotate-pdf": "highlight text add comment note draw ink markup",
  "visual-signature": "sign visually sign document handwritten signature",
  "apply-redactions": "permanently hide account number permanent hide confidential private sensitive information",
  "organize-pages": "remove pages delete pages reorder pages rotate pages extract pages move pages",
  "merge-pdfs": "combine two pdfs combine documents join files",
  "split-pdf": "divide pdf separate pdf into parts",
  "crop-pages": "trim pages remove margins visible page area",
  "compress-pdf": "make pdf smaller reduce file size shrink document",
  "ocr-pdf": "make scan searchable searchable scanned document recognize printed text",
  "metadata": "remove metadata remove private extras document properties privacy",
  "password-protect": "lock pdf add password password protect encrypt document",
  "fill-forms": "fill form complete form type into fields",
  "scan-to-pdf": "images to pdf photos to pdf pictures to pdf",
  "export-content": "pdf pages to images export pages as images convert pages to png jpeg"
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9/+.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function meaningfulQueryTokens(query: string): string[] {
  return normalize(query)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token))
    .map(stem);
}

export function searchTextMatches(searchText: string, query: string): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  const normalizedText = normalize(searchText);
  if (normalizedText.includes(normalizedQuery)) return true;

  const tokens = meaningfulQueryTokens(query);
  if (!tokens.length) return normalizedText.includes(normalizedQuery);
  const searchableTokens = new Set(normalizedText.split(" ").filter(Boolean).map(stem));
  let matches = 0;
  for (const token of tokens) {
    if (searchableTokens.has(token) || [...searchableTokens].some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) matches += 1;
  }
  const required = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
  return matches >= required;
}

export function taskQuerySearchText(task: PdfTask): string {
  return `${taskSearchText(task)} ${TASK_ALIASES[task.id] ?? ""}`.trim();
}

export function taskMatchesQuery(task: PdfTask, query: string): boolean {
  return searchTextMatches(taskQuerySearchText(task), query);
}
