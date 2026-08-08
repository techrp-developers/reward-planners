const FRONT_ANCHOR_COUNT = 3;
const SIBLING_COUNT = 2;

/**
 * Builds a compact page-number list: pages 1..3 and the last page always
 * stay visible as anchors, plus a window of `SIBLING_COUNT` pages on each
 * side of `currentPage`. Gaps between the anchors/window become "...".
 * e.g. 44 pages, on page 43 -> [1, 2, 3, "...", 41, 42, 43, 44]
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | "...")[] {
  if (totalPages <= FRONT_ANCHOR_COUNT + SIBLING_COUNT * 2 + 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();

  for (let p = 1; p <= Math.min(FRONT_ANCHOR_COUNT, totalPages); p++) {
    pages.add(p);
  }

  const windowStart = Math.max(currentPage - SIBLING_COUNT, 1);
  const windowEnd = Math.min(currentPage + SIBLING_COUNT, totalPages);

  for (let p = windowStart; p <= windowEnd; p++) {
    pages.add(p);
  }

  pages.add(totalPages);

  const sorted = Array.from(pages).sort((a, b) => a - b);

  const result: (number | "...")[] = [];

  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) {
      result.push("...");
    }
    result.push(page);
  });

  return result;
}
