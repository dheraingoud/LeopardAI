import type { ParsedSchema } from './types';

/**
 * Generates a terse human-readable summary of a parsed schema.
 *
 * Format:
 *   Dialect: X | Tables: N | Views: N | Procs: N | Relationships: N
 *
 *   model_name (N cols, PK: pk1,pk2)  [type badge]
 *   ...
 */
export function generateSchemaSummary(schema: ParsedSchema): string {
  const { dialect, tables, enums, relationships } = schema;

  const dialectLabel = dialect.charAt(0).toUpperCase() + dialect.slice(1);

  const tableCount = tables.filter((t) => t.objectType === 'table').length;
  const viewCount = tables.filter(
    (t) => t.objectType === 'view' || t.objectType === 'materialized_view'
  ).length;
  const procCount = tables.filter(
    (t) => t.objectType === 'procedure' || t.objectType === 'function'
  ).length;
  const seqCount = tables.filter((t) => t.objectType === 'sequence').length;
  const enumCount = enums.length;
  const relCount = relationships.length;

  const header =
    `Dialect: ${dialectLabel} | Tables: ${tableCount} | Views: ${viewCount}` +
    ` | Procs/Funcs: ${procCount} | Sequences: ${seqCount}` +
    ` | Enums: ${enumCount} | Relationships: ${relCount}`;

  const tableLines = tables.map((t) => {
    const colCount = t.columns.length;
    const pkStr =
      t.primaryKeys.length > 0
        ? `, PK: ${t.primaryKeys.join(',')}`
        : '';
    const typeTag =
      t.objectType === 'table'
        ? ''
        : t.objectType === 'view'
        ? ' [view]'
        : ` [${t.objectType}]`;

    const relOut = relationships.filter((r) => r.fromTable === t.name).length;
    const relIn = relationships.filter((r) => r.toTable === t.name).length;
    const relStr =
      relOut > 0 || relIn > 0 ? ` (${relIn} in / ${relOut} out)` : '';

    return `  ${t.name} (${colCount} cols${pkStr})${typeTag}${relStr}`;
  });

  return [header, ...tableLines].join('\n');
}