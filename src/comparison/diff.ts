export interface DiffToken { kind: "same" | "added" | "removed"; text: string }

export function diffWords(leftText: string, rightText: string, limit = 600): DiffToken[] {
  const left = leftText.split(/(\s+)/).filter(Boolean).slice(0, limit);
  const right = rightText.split(/(\s+)/).filter(Boolean).slice(0, limit);
  const rows = left.length + 1, cols = right.length + 1;
  const table = new Uint16Array(rows * cols);
  const at = (i: number, j: number) => i * cols + j;
  for (let i = 1; i < rows; i += 1) for (let j = 1; j < cols; j += 1) table[at(i,j)] = left[i-1] === right[j-1] ? table[at(i-1,j-1)] + 1 : Math.max(table[at(i-1,j)], table[at(i,j-1)]);
  const result: DiffToken[] = [];
  let i = left.length, j = right.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && left[i-1] === right[j-1]) { result.push({ kind: "same", text: left[i-1] }); i -= 1; j -= 1; }
    else if (j > 0 && (i === 0 || table[at(i,j-1)] >= table[at(i-1,j)])) { result.push({ kind: "added", text: right[j-1] }); j -= 1; }
    else { result.push({ kind: "removed", text: left[i-1] }); i -= 1; }
  }
  return result.reverse();
}
