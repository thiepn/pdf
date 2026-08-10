export interface ComparePagePresence {
  pageNumber: number;
  leftPresent: boolean;
  rightPresent: boolean;
}

export function resolveComparePagePresence(leftPageCount: number, rightPageCount: number, pageNumber: number): ComparePagePresence {
  const bounded = Math.max(1, Math.round(pageNumber));
  return {
    pageNumber: bounded,
    leftPresent: bounded <= Math.max(0, leftPageCount),
    rightPresent: bounded <= Math.max(0, rightPageCount)
  };
}
