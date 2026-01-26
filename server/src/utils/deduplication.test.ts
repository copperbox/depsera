import { groupByKey, deduplicateById, deduplicateByKey } from './deduplication';

describe('groupByKey', () => {
  it('should group items by a string key', () => {
    const items = [
      { id: '1', category: 'a', name: 'item1' },
      { id: '2', category: 'b', name: 'item2' },
      { id: '3', category: 'a', name: 'item3' },
    ];

    const result = groupByKey(items, 'category');

    expect(result.size).toBe(2);
    expect(result.get('a')).toHaveLength(2);
    expect(result.get('b')).toHaveLength(1);
    expect(result.get('a')?.map(i => i.id)).toEqual(['1', '3']);
  });

  it('should handle empty array', () => {
    const result = groupByKey([], 'id');
    expect(result.size).toBe(0);
  });

  it('should handle single item', () => {
    const items = [{ id: '1', type: 'test' }];
    const result = groupByKey(items, 'type');

    expect(result.size).toBe(1);
    expect(result.get('test')).toHaveLength(1);
  });

  it('should handle numeric keys', () => {
    const items = [
      { id: '1', priority: 1 },
      { id: '2', priority: 2 },
      { id: '3', priority: 1 },
    ];

    const result = groupByKey(items, 'priority');

    expect(result.size).toBe(2);
    expect(result.get(1)).toHaveLength(2);
    expect(result.get(2)).toHaveLength(1);
  });
});

describe('deduplicateById', () => {
  it('should deduplicate items by id', () => {
    const items = [
      { id: '1', name: 'first' },
      { id: '2', name: 'second' },
      { id: '1', name: 'duplicate' },
    ];

    const result = deduplicateById(items);

    expect(result).toHaveLength(2);
    expect(result.find(i => i.id === '1')?.name).toBe('first');
    expect(result.find(i => i.id === '2')?.name).toBe('second');
  });

  it('should handle empty array', () => {
    const result = deduplicateById([]);
    expect(result).toEqual([]);
  });

  it('should handle no duplicates', () => {
    const items = [
      { id: '1', name: 'one' },
      { id: '2', name: 'two' },
    ];

    const result = deduplicateById(items);
    expect(result).toHaveLength(2);
  });

  it('should keep first occurrence', () => {
    const items = [
      { id: 'a', value: 100 },
      { id: 'a', value: 200 },
      { id: 'a', value: 300 },
    ];

    const result = deduplicateById(items);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(100);
  });
});

describe('deduplicateByKey', () => {
  it('should deduplicate by specified key', () => {
    const items = [
      { id: '1', email: 'a@test.com' },
      { id: '2', email: 'b@test.com' },
      { id: '3', email: 'a@test.com' },
    ];

    const result = deduplicateByKey(items, 'email');

    expect(result).toHaveLength(2);
    expect(result.map(i => i.email)).toEqual(['a@test.com', 'b@test.com']);
  });

  it('should handle empty array', () => {
    const result = deduplicateByKey([], 'key' as never);
    expect(result).toEqual([]);
  });

  it('should preserve order of first occurrences', () => {
    const items = [
      { id: '1', type: 'b' },
      { id: '2', type: 'a' },
      { id: '3', type: 'c' },
      { id: '4', type: 'b' },
    ];

    const result = deduplicateByKey(items, 'type');

    expect(result).toHaveLength(3);
    expect(result.map(i => i.type)).toEqual(['b', 'a', 'c']);
  });
});
