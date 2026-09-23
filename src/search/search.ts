/**
 * Title search for the catalog: partial, accent-insensitive and typo-tolerant.
 *
 * Scores are tiered so a clean match always outranks a fuzzy one: prefix >
 * word prefix > substring > fuzzy. Each substring tier also has a "compact"
 * variant, with spaces removed, so "yugioh" finds "Yu-Gi-Oh!".
 */

/** Below this a title isn't a match. Deliberately low: we'd rather show too much. */
export const MATCH_MIN = 0.42

/** How many "Quizás te interese" titles to show when nothing matches. */
export const FALLBACK_COUNT = 10

/** Scales fuzzy similarity so it can never outrank a real substring hit. */
const FUZZY_WEIGHT = 0.7

/** Shorter query words only count as a match on an exact prefix. */
const FUZZY_MIN_LENGTH = 3

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface Prepared {
  text: string
  compact: string
  tokens: string[]
  /** The compact form starting at each word, for compact word-prefix hits. */
  wordCompacts: string[]
}

function prepare(value: string): Prepared {
  const text = normalize(value)
  const tokens = text ? text.split(' ') : []
  return {
    text,
    compact: tokens.join(''),
    tokens,
    wordCompacts: tokens.map((_, i) => tokens.slice(i).join('')),
  }
}

// Titles are scored on every keystroke; normalizing them once is enough.
const preparedTitles = new Map<string, Prepared>()

function prepareTitle(title: string): Prepared {
  let prepared = preparedTitles.get(title)
  if (!prepared) {
    prepared = prepare(title)
    preparedTitles.set(title, prepared)
  }
  return prepared
}

// Three reusable rows (two back, one back, current) instead of a fresh matrix
// per comparison: a keystroke runs thousands of these over the catalog.
let rows: [Uint16Array, Uint16Array, Uint16Array] = [new Uint16Array(64), new Uint16Array(64), new Uint16Array(64)]

/** Optimal-string-alignment Damerau-Levenshtein: a transposition is one edit. */
function editDistance(a: string, b: string): number {
  if (b.length + 1 > rows[0].length) {
    rows = [new Uint16Array(b.length + 1), new Uint16Array(b.length + 1), new Uint16Array(b.length + 1)]
  }
  let [twoBack, oneBack, current] = rows
  for (let j = 0; j <= b.length; j++) oneBack[j] = j

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(oneBack[j] + 1, current[j - 1] + 1, oneBack[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2] + 1)
      }
      current[j] = value
    }
    ;[twoBack, oneBack, current] = [oneBack, current, twoBack]
  }
  return oneBack[b.length]
}

function similarity(a: string, b: string): number {
  return 1 - editDistance(a, b) / Math.max(a.length, b.length)
}

/**
 * How well one query word matches one title word. Compared against the title
 * word's same-length prefix too, so a word still being typed ("castelv")
 * scores against where it's heading ("castlevania").
 */
function wordSimilarity(queryWord: string, titleWord: string): number {
  if (titleWord.startsWith(queryWord)) return 1
  if (queryWord.length < FUZZY_MIN_LENGTH) return 0
  const prefix =
    titleWord.length > queryWord.length
      ? similarity(queryWord, titleWord.slice(0, queryWord.length))
      : 0
  // The length gap alone caps the whole-word score; skip it when it can't win.
  const longer = Math.max(queryWord.length, titleWord.length)
  const wholeCap = 1 - Math.abs(queryWord.length - titleWord.length) / longer
  return wholeCap > prefix ? Math.max(prefix, similarity(queryWord, titleWord)) : prefix
}

function fuzzy(query: Prepared, title: Prepared): number {
  if (title.tokens.length === 0) return 0
  let total = 0
  for (const queryWord of query.tokens) {
    let best = 0
    for (const titleWord of title.tokens) {
      best = Math.max(best, wordSimilarity(queryWord, titleWord))
      if (best === 1) break
    }
    total += best
  }
  return total / query.tokens.length
}

function scorePrepared(query: Prepared, title: Prepared): number {
  if (!query.text) return 0
  const t = title.text
  const q = query.text
  if (t.startsWith(q)) return 1
  if (title.compact.startsWith(query.compact)) return 0.95
  if (` ${t}`.includes(` ${q}`)) return 0.9
  if (title.wordCompacts.some((w) => w.startsWith(query.compact))) return 0.85
  if (t.includes(q)) return 0.8
  if (title.compact.includes(query.compact)) return 0.75
  return FUZZY_WEIGHT * fuzzy(query, title)
}

export function scoreTitle(query: string, title: string): number {
  return scorePrepared(prepare(query), prepareTitle(title))
}

/**
 * Titles scoring at least `MATCH_MIN`, best first, with catalog order breaking
 * ties. When nothing clears the bar, the closest `FALLBACK_COUNT` titles
 * instead, so a search is never a dead end.
 */
export function search<T extends { title: string }>(
  query: string,
  items: T[],
): { matches: T[]; fallback: boolean } {
  const prepared = prepare(query)
  const ranked = items
    .map((item, index) => ({ item, index, score: scorePrepared(prepared, prepareTitle(item.title)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const matches = ranked.filter((r) => r.score >= MATCH_MIN)
  if (matches.length > 0) return { matches: matches.map((r) => r.item), fallback: false }

  return { matches: ranked.slice(0, FALLBACK_COUNT).map((r) => r.item), fallback: true }
}
