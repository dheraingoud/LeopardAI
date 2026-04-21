import type { ParsedSchema } from './types';

/**
 * Detect SQL/schema dialect from filename extension and content heuristics.
 */
export function detectDialect(
  content: string,
  filename: string
): ParsedSchema['dialect'] {
  // Route by extension first
  const ext = filename.toLowerCase();

  if (ext.endsWith('.prisma')) return 'prisma';
  if (ext.endsWith('.entity.ts')) return 'typeorm';

  // TypeORM decorator
  if (/@Entity\s*\(/.test(content)) return 'typeorm';

  // dbt Jinja blocks
  if (/{{\s*config\s*\(/.test(content) || /{{\s*ref\s*\(/.test(content))
    return 'dbt';

  // Snowflake: three-part names, $$ dollar quoting, VARIANT/ARRAY type keywords
  if (
    /\bvariant\b/i.test(content) ||
    /\barray\b/i.test(content) ||
    /\bobject\b/i.test(content) ||
    /\bGEOGRAPHY\b/i.test(content) ||
    /\w+\.\w+\.\w+CREATE\s+TABLE/i.test(content) ||
    /\$\$.*\$\$/s.test(content)
  )
    return 'snowflake';

  // MySQL: ENGINE, AUTO_INCREMENT, backtick identifiers
  if (
    /\bENGINE\s*=\s*InnoDB/i.test(content) ||
    /\bAUTO_INCREMENT\b/.test(content) ||
    /`\w+`\s+`\w+`/.test(content)
  )
    return 'mysql';

  // SQLite: AUTOINCREMENT, .sqlite.sql extension
  if (/\bAUTOINCREMENT\b/.test(content) || ext.endsWith('.sqlite.sql'))
    return 'sqlite';

  // Default to PostgreSQL
  return 'postgresql';
}

/**
 * Split a SQL string into individual statements, respecting:
 * - Dollar-quoting  ($$ … $$, $tag$ … $tag$)
 * - String literals ('…', "…")
 * - BEGIN/END blocks
 * Returns an array of trimmed statement strings.
 */
export function splitSQLStatements(sql: string): string[] {
  const statements: string[] = [];
  let i = 0;
  const len = sql.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(sql[i])) i++;
    if (i >= len) break;

    // Detect dollar-quote tag
    const dollarMatch = sql.slice(i).match(/^\$([^$]+)\$/);
    let tag = null as string | null;
    if (dollarMatch) {
      tag = dollarMatch[1];
      i += dollarMatch[0].length;
    }

    if (tag) {
      // Scan for closing dollar quote
      const end = sql.indexOf('$' + tag + '$', i);
      if (end !== -1) {
        i = end + tag.length + 2;
      } else {
        // Unclosed — consume rest
        i = len;
      }
    } else if (sql[i] === "'") {
      // Single-quoted string literal
      i++;
      while (i < len) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2; // escaped quote
        } else if (sql[i] === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
    } else if (sql[i] === '"') {
      // Double-quoted identifier
      i++;
      while (i < len) {
        if (sql[i] === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
    } else if (sql.slice(i, i + 5).toUpperCase() === 'BEGIN') {
      // BEGIN block — find matching END
      let depth = 1;
      i += 5;
      while (i < len && depth > 0) {
        if (sql.slice(i, i + 5).toUpperCase() === 'BEGIN') {
          depth++;
          i += 5;
        } else if (sql.slice(i, i + 3).toUpperCase() === 'END' && /\W/.test(sql[i + 3] ?? '\0')) {
          depth--;
          i += 3;
        } else {
          i++;
        }
      }
    } else if (sql[i] === ';') {
      // Empty statement
      i++;
    } else {
      // Consume until semicolon
      const semi = sql.indexOf(';', i);
      if (semi === -1) {
        statements.push(sql.slice(i).trim());
        break;
      }
      statements.push(sql.slice(i, semi).trim());
      i = semi + 1;
    }
  }

  return statements.filter((s) => s.length > 0);
}