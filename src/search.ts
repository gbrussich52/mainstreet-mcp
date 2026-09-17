// Recall-first search: AI assistants calling these tools can't scroll a
// results list the way a human would, so under-returning relevant items is a
// worse failure than including a few weak matches. Favor recall over
// precision; the caller (an LLM) is good at ignoring a mediocre extra hit.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'of', 'in', 'on', 'at',
  'to', 'for', 'with', 'and', 'or', 'do', 'you', 'have', 'has', 'had', 'i', 'we', 'it', 'this',
  'that', 'my', 'your', 'can', 'does', 'did', 'what', 'how', 'when', 'where', 'why', 'who',
  'which', 'about', 'as', 'if', 'me', 'us',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

export interface Searchable {
  text: string;
}

export interface ScoredResult<T> {
  item: T;
  score: number;
}

export function search<T extends Searchable>(items: T[], query: string, limit = 10): ScoredResult<T>[] {
  const queryTokens = tokenize(query);
  const trimmedQuery = query.trim().toLowerCase();
  if (queryTokens.length === 0) {
    return items.slice(0, limit).map((item) => ({ item, score: 0 }));
  }
  const scored: ScoredResult<T>[] = [];
  for (const item of items) {
    const itemText = item.text.toLowerCase();
    const itemTokens = tokenize(item.text);
    const itemTokenSet = new Set(itemTokens);
    let score = 0;
    for (const qt of queryTokens) {
      if (itemTokenSet.has(qt)) {
        score += 3;
        continue;
      }
      const partial = itemTokens.some((it) => it.length > 2 && (it.includes(qt) || qt.includes(it)));
      if (partial) score += 1;
    }
    if (trimmedQuery.length > 0 && itemText.includes(trimmedQuery)) {
      score += 2;
    }
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
