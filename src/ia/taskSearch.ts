import type { PdfTask } from "./taskCatalog";
import { taskSearchText } from "./taskCatalog";

const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "can", "do", "for", "from", "get", "i", "in", "into", "is", "it",
  "make", "my", "of", "on", "or", "pdf", "please", "some", "the", "this", "through", "to", "turn", "want", "with"
]);

const TASK_INTENT_PHRASES: Record<string, string[]> = {
  "edit-pdf": ["change existing text", "add new text", "add text", "replace an image", "replace image", "move image", "resize image", "remove text"],
  "annotate-pdf": ["highlight some text", "highlight text", "add comment", "add note", "draw on pdf", "markup pdf"],
  "visual-signature": ["sign this document visually", "visual signature", "handwritten signature"],
  "apply-redactions": ["permanently hide this account number", "permanent redaction", "permanently hide confidential information", "remove sensitive information permanently"],
  "organize-pages": ["extract pages", "remove pages", "delete pages", "move pages into a new order", "reorder pages", "rotate pages", "duplicate pages"],
  "merge-pdfs": ["combine two pdfs", "combine pdfs", "join pdfs", "merge documents"],
  "split-pdf": ["split this pdf into parts", "split pdf", "divide pdf", "separate pdf into parts"],
  "crop-pages": ["trim page margins", "crop pages", "remove margins", "change visible page area"],
  "compress-pdf": ["make this pdf smaller", "make pdf smaller", "reduce file size", "shrink pdf", "compress pdf"],
  "ocr-pdf": ["make this scan searchable", "make scan searchable", "searchable scanned document", "recognize printed text", "ocr pdf"],
  "metadata": ["remove document metadata", "remove metadata", "edit metadata", "remove private extras", "document properties"],
  "password-protect": ["lock this pdf with a password", "lock pdf with password", "password protect pdf", "encrypt pdf"],
  "fill-forms": ["fill this form", "fill form", "complete pdf form", "type into form fields"],
  "scan-to-pdf": ["turn photos into a pdf", "photos to pdf", "images to pdf", "pictures to pdf"],
  "export-content": ["export pdf pages as images", "pages as images", "pdf pages to images", "convert pages to png", "convert pages to jpeg"]
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
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !STOP_WORDS.has(token))
    .map(stem);
}

export function searchMatchScore(searchText: string, query: string): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 1;
  const normalizedText = normalize(searchText);
  if (normalizedText === normalizedQuery) return 100;
  if (normalizedText.includes(normalizedQuery)) return 80;

  const tokens = meaningfulQueryTokens(query);
  if (!tokens.length) return normalizedText.includes(normalizedQuery) ? 40 : 0;
  const searchableTokens = new Set(normalizedText.split(" ").filter(Boolean).map(stem));
  let matches = 0;
  for (const token of tokens) {
    if (searchableTokens.has(token) || [...searchableTokens].some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) matches += 1;
  }
  const required = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
  if (matches < required) return 0;
  return 20 + Math.round((matches / tokens.length) * 40);
}

export function searchTextMatches(searchText: string, query: string): boolean {
  return searchMatchScore(searchText, query) > 0;
}

export function taskQuerySearchText(task: PdfTask): string {
  return `${taskSearchText(task)} ${(TASK_INTENT_PHRASES[task.id] ?? []).join(" ")}`.trim();
}

export function taskMatchScore(task: PdfTask, query: string): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 1;

  let score = searchMatchScore(taskSearchText(task), query);
  const normalizedLabel = normalize(task.label);
  if (normalizedLabel === normalizedQuery) score = Math.max(score, 180);
  else if (normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedLabel)) score = Math.max(score, 130);

  for (const phrase of TASK_INTENT_PHRASES[task.id] ?? []) {
    const normalizedPhrase = normalize(phrase);
    if (normalizedPhrase === normalizedQuery) score = Math.max(score, 240);
    else if (normalizedPhrase.includes(normalizedQuery) || normalizedQuery.includes(normalizedPhrase)) score = Math.max(score, 200);
    else {
      const phraseScore = searchMatchScore(phrase, query);
      if (phraseScore > 0) score = Math.max(score, 100 + phraseScore);
    }
  }
  return score;
}

export function taskMatchesQuery(task: PdfTask, query: string): boolean {
  return taskMatchScore(task, query) > 0;
}

export function rankTasksByQuery(tasks: readonly PdfTask[], query: string): PdfTask[] {
  const needle = query.trim();
  if (!needle) return [...tasks];
  return tasks
    .map((task, index) => ({ task, index, score: taskMatchScore(task, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.task);
}
