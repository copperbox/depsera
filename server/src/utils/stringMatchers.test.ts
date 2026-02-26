import {
  extractHostname,
  tokenize,
  calculateTokenOverlap,
  filterStopWords,
  levenshteinDistance,
  calculateSimilarity,
} from './stringMatchers';

describe('extractHostname', () => {
  it('should extract hostname from full URL', () => {
    expect(extractHostname('https://api.example.com/health')).toBe('api.example.com');
    expect(extractHostname('http://localhost:3000/status')).toBe('localhost');
  });

  it('should handle URL without protocol', () => {
    expect(extractHostname('example.com/path')).toBe('example.com');
  });

  it('should return lowercase hostname', () => {
    expect(extractHostname('https://API.EXAMPLE.COM')).toBe('api.example.com');
  });

  it('should handle URLs with ports', () => {
    expect(extractHostname('https://api.example.com:8080/health')).toBe('api.example.com');
  });

  it('should return null for invalid input', () => {
    expect(extractHostname('')).toBe(null);
  });

  it('should handle IP addresses', () => {
    expect(extractHostname('http://192.168.1.1:3000')).toBe('192.168.1.1');
  });
});

describe('tokenize', () => {
  it('should split on hyphens', () => {
    expect(tokenize('user-service-api')).toEqual(['user', 'service', 'api']);
  });

  it('should split on underscores', () => {
    expect(tokenize('user_service_api')).toEqual(['user', 'service', 'api']);
  });

  it('should split on dots', () => {
    expect(tokenize('user.service.api')).toEqual(['user', 'service', 'api']);
  });

  it('should split on slashes', () => {
    expect(tokenize('user/service/api')).toEqual(['user', 'service', 'api']);
  });

  it('should split on spaces', () => {
    expect(tokenize('user service api')).toEqual(['user', 'service', 'api']);
  });

  it('should filter out single-character tokens', () => {
    expect(tokenize('a-user-b-service')).toEqual(['user', 'service']);
  });

  it('should return lowercase tokens', () => {
    expect(tokenize('User-SERVICE-Api')).toEqual(['user', 'service', 'api']);
  });

  it('should handle empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('should handle mixed delimiters', () => {
    expect(tokenize('user-service_api.v2')).toEqual(['user', 'service', 'api', 'v2']);
  });
});

describe('filterStopWords', () => {
  it('should remove common stop words', () => {
    expect(filterStopWords(['user', 'api', 'gateway'])).toEqual(['user', 'gateway']);
    expect(filterStopWords(['payment', 'service'])).toEqual(['payment']);
  });

  it('should remove all stop word variants', () => {
    const stopWords = ['api', 'apis', 'service', 'services', 'server', 'servers',
      'client', 'clients', 'http', 'https', 'internal', 'external',
      'the', 'and', 'for', 'of'];
    expect(filterStopWords(stopWords)).toEqual([]);
  });

  it('should keep meaningful tokens', () => {
    expect(filterStopWords(['payment', 'gateway', 'order'])).toEqual(['payment', 'gateway', 'order']);
  });

  it('should handle empty array', () => {
    expect(filterStopWords([])).toEqual([]);
  });

  it('should return empty when all tokens are stop words', () => {
    expect(filterStopWords(['api', 'service', 'server'])).toEqual([]);
  });
});

describe('calculateTokenOverlap', () => {
  it('should return 1 for identical token sets', () => {
    expect(calculateTokenOverlap(['user', 'api'], ['user', 'api'])).toBe(1);
  });

  it('should return 0 for no overlap', () => {
    expect(calculateTokenOverlap(['user', 'api'], ['team', 'service'])).toBe(0);
  });

  it('should calculate partial overlap', () => {
    expect(calculateTokenOverlap(['user', 'api'], ['user', 'service'])).toBe(0.5);
  });

  it('should handle different sized sets', () => {
    // Overlap: ['user'] / min(2, 3) = 1/2 = 0.5
    expect(calculateTokenOverlap(['user', 'api'], ['user', 'service', 'team'])).toBe(0.5);
  });

  it('should return 0 for empty arrays', () => {
    expect(calculateTokenOverlap([], ['user'])).toBe(0);
    expect(calculateTokenOverlap(['user'], [])).toBe(0);
    expect(calculateTokenOverlap([], [])).toBe(0);
  });

  it('should handle subset relationship', () => {
    // All tokens from smaller set are in larger set
    expect(calculateTokenOverlap(['user'], ['user', 'service', 'api'])).toBe(1);
  });
});

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should count insertions', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('should count deletions', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('should count substitutions', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('should handle multiple edits', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', 'hello')).toBe(5);
    expect(levenshteinDistance('hello', '')).toBe(5);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('should be symmetric', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(levenshteinDistance('xyz', 'abc'));
  });
});

describe('calculateSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(calculateSimilarity('hello', 'hello')).toBe(1);
  });

  it('should return 0 for empty strings', () => {
    expect(calculateSimilarity('', 'hello')).toBe(0);
    expect(calculateSimilarity('hello', '')).toBe(0);
  });

  it('should handle both empty strings', () => {
    expect(calculateSimilarity('', '')).toBe(1);
  });

  it('should return value between 0 and 1', () => {
    const similarity = calculateSimilarity('user-service', 'user-api');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it('should return higher similarity for more similar strings', () => {
    const sim1 = calculateSimilarity('user-service', 'user-service-api');
    const sim2 = calculateSimilarity('user-service', 'completely-different');
    expect(sim1).toBeGreaterThan(sim2);
  });
});
