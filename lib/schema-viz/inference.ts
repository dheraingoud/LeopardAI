import type { ParsedTable, ParsedRelationship, ParsedColumn } from './types';

let _relId = 0;
function relUid(): string {
  return `rel_${++_relId}_${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Infers implicit FK relationships by scanning column names ending in _id or Id.
 * Uses simple pluralisation heuristics to guess foreign table names.
 */
export function inferImplicitRelationships(
  tables: ParsedTable[],
  relationships: ParsedRelationship[]
): void {
  for (const table of tables) {
    for (const col of table.columns) {
      const lower = col.name.toLowerCase();

      // Match columns ending in _id / Id
      const idSuffix = /^(.+)'_?id$/i.exec(col.name) ?? /^(.+)Id$/.exec(col.name);
      if (!idSuffix) continue;

      const baseName = idSuffix[1].toLowerCase();

      // Plural forms to check
      const candidates = [
        baseName,
        baseName + 's',         // post → posts
        baseName.replace(/ie /i, 'y').replace(/s$/i, ''), // category → categories
        baseName + 'es',        // box → boxes
      ];

      const targetTable = tables.find((t) => {
        const tableName = t.name.toLowerCase();
        return candidates.some((c) => tableName === c || tableName === c.replace(/_/g, ''));
      });

      if (!targetTable || targetTable.name === table.name) continue;

      // Avoid duplicate relationships
      const alreadyExists = relationships.some(
        (r) =>
          r.fromTable === table.name &&
          r.fromColumn === col.name &&
          r.toTable === targetTable.name
      );
      if (alreadyExists) continue;

      // Infer cardinality: if target table has pk == col being referenced, one-to-one
      const targetPk = targetTable.columns.find(
        (c) => targetTable.primaryKeys.includes(c.name)
      );
      const cardinality: ParsedRelationship['cardinality'] =
        targetPk && targetPk.name.toLowerCase() === col.name.toLowerCase() ? 'one-to-one' : 'one-to-many';

      relationships.push({
        id: relUid(),
        fromTable: table.name,
        fromColumn: col.name,
        toTable: targetTable.name,
        toColumn: targetPk?.name ?? targetTable.columns[0]?.name ?? 'id',
        cardinality,
      });
    }
  }
}

/**
 * Infers relationships from Prisma @relation attributes already parsed in columns.
 */
export function inferPrismaRelationships(
  tables: ParsedTable[],
  relationships: ParsedRelationship[]
): void {
  for (const table of tables) {
    for (const col of table.columns) {
      if (!col.references) continue;

      const targetTable = tables.find(
        (t) =>
          t.name.toLowerCase() === (col.references!.table).toLowerCase() ||
          t.name.toLowerCase() === (col.references!.table + 's').toLowerCase()
      );
      if (!targetTable) continue;

      const alreadyExists = relationships.some(
        (r) =>
          r.fromTable === table.name &&
          r.fromColumn === col.name &&
          r.toTable === targetTable.name
      );
      if (alreadyExists) continue;

      const targetCol = targetTable.columns.find(
        (c) =>
          c.name.toLowerCase() === (col.references!.column || 'id').toLowerCase() ||
          targetTable.primaryKeys.includes(c.name)
      ) ?? targetTable.columns[0];

      relationships.push({
        id: relUid(),
        fromTable: table.name,
        fromColumn: col.name,
        toTable: targetTable.name,
        toColumn: targetCol?.name ?? 'id',
        cardinality: col.unique ? 'one-to-one' : 'one-to-many',
        onDelete: undefined,
        onUpdate: undefined,
      });
    }
  }
}

/**
 * Normalize a SQL type string to a semantic category.
 */
export function normalizeType(type: string): ParsedColumn['normalizedType'] {
  const upper = type.toUpperCase().replace(/\s+/g, '');

  if (/^(VARCHAR?|CHAR|TEXT|CHARACTER|NVARCHAR|CITEXT|STRING|BPCHAR|TINYTEXT|MEDIUMTEXT|LONGTEXT|UUID|SERIAL|INET|CIDR|MACADDR|XML|BYTEA)/i.test(type))
    return 'string';
  if (/^(INT|INTEGER|BIGINT|SMALLINT|TINYINT|SERIAL|BIGSERIAL|SMALLSERIAL|INT8|INT4|INT2|FLOAT4|FLOAT8|DOUBLE|PRECISION|NUMERIC|DECIMAL|MONEY|REAL|BIT)/i.test(type))
    return 'number';
  if (/^(BOOL|BOOLEAN)/i.test(type)) return 'boolean';
  if (/^(DATE|TIME|TIMESTAMP|TIMESTAMPTZ|TIMETZ|INTERVAL)/i.test(type)) return 'date';
  if (/^(JSON|JSONB|JSONP|OBJECT|VARIANT)/i.test(type)) return 'json';
  return 'other';
}