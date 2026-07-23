export type RankedSearchField = {
  code?: string | null;
  name?: string | null;
  extra?: Array<string | null | undefined>;
};

/** Higher score = higher priority in dropdown results. */
export const RANK_EXACT_CODE = 1000;
export const RANK_EXACT_NAME = 900;
export const RANK_NAME_PREFIX = 800;
export const RANK_CODE_PREFIX = 700;
export const RANK_WORD_PREFIX = 600;
export const RANK_NAME_CONTAINS = 400;
export const RANK_CODE_CONTAINS = 300;
export const RANK_EXTRA_CONTAINS = 200;
export const RANK_CONTAINS = 100;

const RANK_NO_MATCH = 0;

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

export function scoreRankedSearch(item: RankedSearchField, rawQuery: string): number {
  const query = normalizeSearchText(rawQuery);
  if (!query) return RANK_NO_MATCH;

  const code = normalizeSearchText(item.code ?? "");
  const name = normalizeSearchText(item.name ?? "");
  const extras = (item.extra ?? []).map((part) => normalizeSearchText(part ?? "")).filter(Boolean);

  if (code && code === query) return RANK_EXACT_CODE;
  if (name && name === query) return RANK_EXACT_NAME;

  if (name && name.startsWith(query)) return RANK_NAME_PREFIX;
  if (code && code.startsWith(query)) return RANK_CODE_PREFIX;

  const nameWords = tokenize(item.name ?? "");
  if (nameWords.some((word) => word.startsWith(query))) return RANK_WORD_PREFIX;

  for (const extra of extras) {
    if (extra === query) return RANK_EXACT_NAME;
    if (extra.startsWith(query)) return RANK_WORD_PREFIX;
    if (tokenize(extra).some((word) => word.startsWith(query))) return RANK_WORD_PREFIX;
  }

  if (name.includes(query)) return RANK_NAME_CONTAINS;
  if (code.includes(query)) return RANK_CODE_CONTAINS;
  if (extras.some((extra) => extra.includes(query))) return RANK_EXTRA_CONTAINS;

  return RANK_NO_MATCH;
}

export function rankedSearchSortKey(item: RankedSearchField): string {
  return normalizeSearchText(item.name ?? item.code ?? "");
}

export function rankLookupResults<T>(
  items: T[],
  query: string,
  toFields: (item: T) => RankedSearchField,
  opts?: { limit?: number },
): T[] {
  const trimmed = query.trim();
  if (!trimmed) {
    const limit = opts?.limit ?? items.length;
    return [...items]
      .sort((a, b) => rankedSearchSortKey(toFields(a)).localeCompare(rankedSearchSortKey(toFields(b))))
      .slice(0, limit);
  }

  const limit = opts?.limit ?? items.length;
  return items
    .map((item) => {
      const fields = toFields(item);
      return {
        item,
        score: scoreRankedSearch(fields, trimmed),
        sortKey: rankedSearchSortKey(fields),
      };
    })
    .filter((row) => row.score > RANK_NO_MATCH)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.sortKey.localeCompare(b.sortKey);
    })
    .slice(0, limit)
    .map((row) => row.item);
}

export function lookupHitSearchFields(hit: {
  code?: string | null;
  name?: string | null;
  hint?: string | null;
}): RankedSearchField {
  return {
    code: hit.code,
    name: hit.name,
    extra: hit.hint ? [hit.hint] : undefined,
  };
}
