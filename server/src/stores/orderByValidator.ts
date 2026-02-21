/**
 * Shared utility for building safe ORDER BY clauses.
 * Prevents SQL injection by whitelisting allowed column names and directions.
 */

const VALID_DIRECTIONS = ['ASC', 'DESC'] as const;

/**
 * Validates and builds a safe ORDER BY clause for SQL queries.
 *
 * @param allowedColumns - Set of allowed column names for this query
 * @param orderBy - The requested column name (may include table alias prefix)
 * @param orderDirection - The requested sort direction
 * @param defaultColumn - Default column if none specified
 * @param defaultDirection - Default direction if none specified
 * @returns Safe ORDER BY column and direction strings
 * @throws Error if orderBy or orderDirection is not in the whitelist
 */
export function validateOrderBy(
  allowedColumns: ReadonlySet<string>,
  orderBy: string | undefined,
  orderDirection: string | undefined,
  defaultColumn: string,
  defaultDirection: 'ASC' | 'DESC' = 'ASC',
): { column: string; direction: string } {
  const column = orderBy || defaultColumn;
  const direction = (orderDirection || defaultDirection).toUpperCase();

  if (!allowedColumns.has(column)) {
    throw new InvalidOrderByError(
      `Invalid orderBy column: "${column}". Allowed columns: ${[...allowedColumns].join(', ')}`,
    );
  }

  if (!VALID_DIRECTIONS.includes(direction as typeof VALID_DIRECTIONS[number])) {
    throw new InvalidOrderByError(
      `Invalid orderDirection: "${direction}". Must be ASC or DESC`,
    );
  }

  return { column, direction };
}

/**
 * Error thrown when an invalid ORDER BY column or direction is provided.
 */
export class InvalidOrderByError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderByError';
  }
}
