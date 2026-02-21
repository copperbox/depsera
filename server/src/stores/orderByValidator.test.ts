import { validateOrderBy, InvalidOrderByError } from './orderByValidator';

describe('validateOrderBy', () => {
  const allowedColumns = new Set(['name', 'created_at', 'updated_at']);

  describe('valid inputs', () => {
    it('should return defaults when no orderBy or orderDirection provided', () => {
      const result = validateOrderBy(allowedColumns, undefined, undefined, 'name');
      expect(result).toEqual({ column: 'name', direction: 'ASC' });
    });

    it('should accept a valid whitelisted column', () => {
      const result = validateOrderBy(allowedColumns, 'created_at', undefined, 'name');
      expect(result).toEqual({ column: 'created_at', direction: 'ASC' });
    });

    it('should accept valid ASC direction', () => {
      const result = validateOrderBy(allowedColumns, 'name', 'ASC', 'name');
      expect(result).toEqual({ column: 'name', direction: 'ASC' });
    });

    it('should accept valid DESC direction', () => {
      const result = validateOrderBy(allowedColumns, 'name', 'DESC', 'name');
      expect(result).toEqual({ column: 'name', direction: 'DESC' });
    });

    it('should accept case-insensitive direction', () => {
      const result = validateOrderBy(allowedColumns, 'name', 'desc', 'name');
      expect(result).toEqual({ column: 'name', direction: 'DESC' });
    });

    it('should use custom default direction', () => {
      const result = validateOrderBy(allowedColumns, undefined, undefined, 'name', 'DESC');
      expect(result).toEqual({ column: 'name', direction: 'DESC' });
    });
  });

  describe('invalid orderBy column', () => {
    it('should throw for non-whitelisted column', () => {
      expect(() => validateOrderBy(allowedColumns, 'email', undefined, 'name'))
        .toThrow(InvalidOrderByError);
    });

    it('should throw for SQL injection attempt via column name', () => {
      expect(() => validateOrderBy(allowedColumns, 'name; DROP TABLE users; --', undefined, 'name'))
        .toThrow(InvalidOrderByError);
    });

    it('should throw for SQL injection with subquery', () => {
      expect(() => validateOrderBy(allowedColumns, '(SELECT password FROM users LIMIT 1)', undefined, 'name'))
        .toThrow(InvalidOrderByError);
    });

    it('should fall back to default for empty string column', () => {
      const result = validateOrderBy(allowedColumns, '', undefined, 'name');
      expect(result).toEqual({ column: 'name', direction: 'ASC' });
    });

    it('should include allowed columns in error message', () => {
      try {
        validateOrderBy(allowedColumns, 'invalid', undefined, 'name');
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidOrderByError);
        expect((e as Error).message).toContain('name');
        expect((e as Error).message).toContain('created_at');
      }
    });
  });

  describe('invalid orderDirection', () => {
    it('should throw for invalid direction value', () => {
      expect(() => validateOrderBy(allowedColumns, 'name', 'INVALID', 'name'))
        .toThrow(InvalidOrderByError);
    });

    it('should throw for SQL injection attempt via direction', () => {
      expect(() => validateOrderBy(allowedColumns, 'name', 'ASC; DROP TABLE users; --', 'name'))
        .toThrow(InvalidOrderByError);
    });

    it('should throw for direction with extra content', () => {
      expect(() => validateOrderBy(allowedColumns, 'name', 'ASC, name', 'name'))
        .toThrow(InvalidOrderByError);
    });
  });

  describe('aliased columns', () => {
    const aliasedColumns = new Set(['s.name', 's.created_at']);

    it('should accept aliased column names', () => {
      const result = validateOrderBy(aliasedColumns, 's.name', undefined, 's.name');
      expect(result).toEqual({ column: 's.name', direction: 'ASC' });
    });

    it('should reject non-aliased column when only aliased are allowed', () => {
      expect(() => validateOrderBy(aliasedColumns, 'name', undefined, 's.name'))
        .toThrow(InvalidOrderByError);
    });
  });
});
