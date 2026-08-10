export interface PageSelectionParseResult {
  pages: Set<number>;
  errors: string[];
}

function addRange(target: Set<number>, start: number, end: number, pageCount: number): void {
  const from = Math.max(1, Math.min(start, end));
  const to = Math.min(pageCount, Math.max(start, end));
  for (let page = from; page <= to; page += 1) target.add(page);
}

export function parsePageSelection(input: string, pageCount: number): PageSelectionParseResult {
  const pages = new Set<number>();
  const errors: string[] = [];
  const excluded = new Set<number>();
  let hasInclusion = false;
  const tokens = input.split(",").map((token) => token.trim().toLowerCase()).filter(Boolean);

  for (const rawToken of tokens) {
    const exclude = rawToken.startsWith("!");
    const token = exclude ? rawToken.slice(1) : rawToken;
    const target = exclude ? excluded : pages;
    if (!exclude) hasInclusion = true;

    if (token === "all") addRange(target, 1, pageCount, pageCount);
    else if (token === "odd") for (let page = 1; page <= pageCount; page += 2) target.add(page);
    else if (token === "even") for (let page = 2; page <= pageCount; page += 2) target.add(page);
    else if (token === "last") target.add(pageCount);
    else if (/^\d+$/.test(token)) {
      const page = Number(token);
      if (page >= 1 && page <= pageCount) target.add(page);
      else errors.push(`Page ${page} is outside 1-${pageCount}.`);
    } else {
      const match = token.match(/^(\d+|last)-(\d+|last)$/);
      if (match) {
        const start = match[1] === "last" ? pageCount : Number(match[1]);
        const end = match[2] === "last" ? pageCount : Number(match[2]);
        addRange(target, start, end, pageCount);
      } else {
        errors.push(`Unsupported token: ${rawToken}`);
      }
    }
  }

  if (!hasInclusion && excluded.size) addRange(pages, 1, pageCount, pageCount);
  for (const page of excluded) pages.delete(page);
  return { pages, errors };
}
