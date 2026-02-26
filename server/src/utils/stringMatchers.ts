/**
 * String matching utility functions for dependency-service matching.
 */

/**
 * Common words in service/dependency names that carry no discriminating signal.
 * Filtered out during token matching to prevent false-positive associations.
 */
export const STOP_WORDS = new Set([
  'api', 'apis',
  'service', 'services',
  'server', 'servers',
  'client', 'clients',
  'http', 'https',
  'internal', 'external',
  'the', 'and', 'for', 'of',
]);

/**
 * Filter stop words from a list of tokens.
 * @param tokens - Array of tokens to filter
 * @returns Tokens with common non-discriminating words removed
 */
export function filterStopWords(tokens: string[]): string[] {
  return tokens.filter(token => !STOP_WORDS.has(token));
}

/**
 * Extract hostname from a URL or URL-like string.
 * @param input - URL or string containing a hostname
 * @returns Lowercase hostname or null if not extractable
 */
export function extractHostname(input: string): string | null {
  try {
    // Try parsing as URL first
    const url = new URL(input);
    return url.hostname.toLowerCase();
  } catch {
    // Try extracting from common patterns
    const hostMatch = input.match(/(?:https?:\/\/)?([a-zA-Z0-9.-]+)/);
    if (hostMatch) {
      return hostMatch[1].toLowerCase();
    }
    return null;
  }
}

/**
 * Tokenize a name into normalized words.
 * Splits on common delimiters (hyphens, underscores, dots, slashes, spaces)
 * and filters out single-character tokens.
 * @param name - The name to tokenize
 * @returns Array of lowercase tokens
 */
export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[-_./]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);
}

/**
 * Calculate the overlap ratio between two token sets.
 * @param tokens1 - First set of tokens
 * @param tokens2 - Second set of tokens
 * @returns Ratio of overlapping tokens to the smaller set size (0-1)
 */
export function calculateTokenOverlap(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let overlap = 0;
  for (const token of set1) {
    if (set2.has(token)) {
      overlap++;
    }
  }

  // Return ratio of overlap to smaller set
  return overlap / Math.min(set1.size, set2.size);
}

/**
 * Calculate Levenshtein (edit) distance between two strings.
 * @param a - First string
 * @param b - Second string
 * @returns Number of single-character edits needed to transform a into b
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio between two strings using Levenshtein distance.
 * @param a - First string
 * @param b - Second string
 * @returns Similarity ratio (0-1), where 1 is identical
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}
