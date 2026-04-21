/**
 * schemaParser.worker.ts
 *
 * Web Worker that parses SQL / schema files asynchronously without blocking the UI.
 * All core parser functions are inlined here so the worker has no external ESM imports,
 * which is required for Next.js web workers.
 */

// ===========================================================================
// TYPES (copied from lib/schema-viz/types.ts)
// ===========================================================================

type ParsedColumnNormalizedType = 'string' | 'number' | 'boolean' | 'date' | 'json' | 'other';

type ObjectType =
  | 'table'
  | 'view'
  | 'materialized_view'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'sequence'
  | 'enum'
  | 'index';

interface ParsedColumn {
  name: string;
  type: string;
  normalizedType: ParsedColumnNormalizedType;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  identity: boolean;
  defaultValue?: string;
  checkConstraint?: string;
  references?: { table: string; column: string; onDelete?: string; onUpdate?: string };
  comment?: string;
}

interface ParsedIndex {
  name: string;
  columns: string[];
  unique: boolean;
  type?: string;
}

interface ParsedTable {
  id: string;
  name: string;
  schema?: string;
  database?: string;
  objectType: ObjectType;
  columns: ParsedColumn[];
  indexes: ParsedIndex[];
  primaryKeys: string[];
  uniqueConstraints: Array<{ name: string; columns: string[] }>;
  checkConstraints: Array<{ name: string; expression: string }>;
  comment?: string;
  isTemporary?: boolean;
  definition?: string;
  triggers?: Array<{ name: string; event: string; timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF'; definition: string }>;
}

interface ParsedRelationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many';
  onDelete?: string;
  onUpdate?: string;
  constraintName?: string;
}

interface ParsedEnum {
  name: string;
  schema?: string;
  values: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'snowflake' | 'prisma' | 'typeorm' | 'dbt' | 'json' | 'unknown';

interface SchemaStats {
  tableCount: number;
  viewCount: number;
  procedureCount: number;
  triggerCount: number;
  relationshipCount: number;
  parseTimeMs: number;
}

interface ParsedSchema {
  id: string;
  sourceFile: string;
  dialect: Dialect;
  tables: ParsedTable[];
  relationships: ParsedRelationship[];
  enums: ParsedEnum[];
  warnings: string[];
  summary: string;
  stats: SchemaStats;
}

interface ParseWorkerInput {
  content: string;
  filename: string;
}

interface ParseWorkerSuccessResult {
  success: true;
  schema: ParsedSchema;
}

interface ParseWorkerErrorResult {
  success: false;
  error: string;
}

type ParseWorkerResult = ParseWorkerSuccessResult | ParseWorkerErrorResult;

// ===========================================================================
// HELPERS
// ===========================================================================

let _uidCounter = 0;
function uid(prefix = 't'): string {
  return `${prefix}_${++_uidCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeDBType(type: string): ParsedColumnNormalizedType {
  const upper = type.toUpperCase().replace(/\s+/g, '');
  if (/^(VARCHAR?|CHAR|TEXT|CHARACTER|NVARCHAR|CITEXT|STRING|BPCHAR|TINYTEXT|MEDIUMTEXT|LONGTEXT|UUID|SERIAL|INET|CIDR|MACADDR|XML|BYTEA)/.test(type)) return 'string';
  if (/^(INT|INTEGER|BIGINT|SMALLINT|TINYINT|SERIAL|BIGSERIAL|SMALLSERIAL|INT8|INT4|INT2|FLOAT4|FLOAT8|DOUBLE|PRECISION|NUMERIC|DECIMAL|MONEY|REAL|BIT)/.test(type)) return 'number';
  if (/^(BOOL|BOOLEAN)/.test(type)) return 'boolean';
  if (/^(DATE|TIME|TIMESTAMP|TIMESTAMPTZ|TIMETZ|INTERVAL)/.test(type)) return 'date';
  if (/^(JSON|JSONB|JSONP|OBJECT|VARIANT|ARRAY)/.test(type)) return 'json';
  return 'other';
}

// ===========================================================================
// DIALECT DETECTION (detect.ts)
// ===========================================================================

function detectDialect(content: string, filename: string): Dialect {
  const ext = filename.toLowerCase();
  if (ext.endsWith('.prisma')) return 'prisma';
  if (ext.endsWith('.entity.ts')) return 'typeorm';
  if (/@Entity\s*\(/.test(content)) return 'typeorm';
  if (/{{\s*config\s*\(/.test(content) || /{{\s*ref\s*\(/.test(content)) return 'dbt';
  if (/\bvariant\b/i.test(content) || /\barray\b/i.test(content) || /\bobject\b/i.test(content) || /\bGEOGRAPHY\b/i.test(content)) return 'snowflake';
  if (/\bENGINE\s*=\s*InnoDB/i.test(content) || /\bAUTO_INCREMENT\b/.test(content) || /`\w+`\s+`\w+`/.test(content)) return 'mysql';
  if (/\bAUTOINCREMENT\b/.test(content) || ext.endsWith('.sqlite.sql')) return 'sqlite';
  return 'postgresql';
}

function splitSQLStatements(sql: string): string[] {
  if (typeof sql !== 'string') return [];
  const statements: string[] = [];
  let i = 0;
  const len = sql.length;
  while (i < len) {
    while (i < len && /\s/.test(sql[i]!)) i++;
    if (i >= len) break;
    const dollarMatch = sql.slice(i).match(/^\$([^$]+)\$/);
    let tag: string | null = null;
    if (dollarMatch) { tag = dollarMatch[1]!; i += dollarMatch[0].length; }
    if (tag) {
      const end = sql.indexOf('$' + tag + '$', i);
      if (end !== -1) i = end + tag.length + 2;
      else i = len;
    } else if (sql[i] === "'") {
      i++;
      while (i < len && !(sql[i] === "'" && sql[i + 1] !== "'")) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else i++;
      }
      if (sql[i] === "'") i++;
    } else if (sql[i] === '"') {
      i++;
      while (i < len && sql[i] !== '"') i++;
      if (sql[i] === '"') i++;
    } else if (sql.slice(i, i + 5).toUpperCase() === 'BEGIN') {
      let depth = 1; i += 5;
      while (i < len && depth > 0) {
        if (sql.slice(i, i + 5).toUpperCase() === 'BEGIN') { depth++; i += 5; }
        else if (sql.slice(i, i + 3).toUpperCase() === 'END' && /\W/.test(sql[i + 3] ?? '\0')) { depth--; i += 3; }
        else i++;
      }
    } else if (sql[i] === ';') {
      i++;
    } else {
      const semi = sql.indexOf(';', i);
      if (semi === -1) { statements.push(sql.slice(i).trim()); break; }
      statements.push(sql.slice(i, semi).trim());
      i = semi + 1;
    }
  }
  return statements.filter((s) => s.length > 0);
}

// ===========================================================================
// REGEX FALLBACK PARSER
// ===========================================================================

function parseColumnDef(line: string): ParsedColumn | null {
  const match = line.trim().match(
    /^(["`\[\]]?\w+["`\]]?)\s+(\w+(?:\([^)]*\))?(?:\s+(?:ARRAY|\[\]))?)\s*(.*)?$/i
  );
  if (!match) return null;
  const name = match[1]!.replace(/["`\[\]]/g, '');
  const rawType = match[2]!;
  const rest = (match[3] ?? '').toUpperCase();
  const nullable = !/NOT\s+NULL/i.test(rest) && !/PRIMARY\s+KEY/i.test(rest);
  const primaryKey = /PRIMARY\s+KEY/i.test(rest);
  const unique = /UNIQUE(?!\s*\()/i.test(rest);
  const identity = /AUTOINCREMENT|SERIAL|IDENTITY/i.test(rest);
  const defaultMatch = rest.match(/DEFAULT\s+(\S+)/i);
  return {
    name,
    type: rawType,
    normalizedType: normalizeDBType(rawType),
    nullable,
    primaryKey,
    unique,
    identity,
    defaultValue: defaultMatch ? defaultMatch[1] : undefined,
  };
}

function regexFallbackParse(content: string, filename: string): ParsedSchema {
  const tables: ParsedTable[] = [];
  const warnings: string[] = ['Using regex fallback parser'];
  const stripped = content.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // CREATE TABLE
  const tableRe = /CREATE\s+(?:TEMPORARY\s+|TEMP\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)\s*\(([\s\S]*?)\)/gim;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(stripped)) !== null) {
    const schema = m[1];
    const tableName = m[2]!;
    const colDefs = m[3]!;
    const columns: ParsedColumn[] = [];
    const primaryKeys: string[] = [];
    for (const colLine of colDefs.split(',')) {
      // Skip constraint-only lines
      if (/^\s*(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT|INDEX|KEY\s)/i.test(colLine.trim())) continue;
      const parsed = parseColumnDef(colLine);
      if (parsed) {
        columns.push(parsed);
        if (parsed.primaryKey) primaryKeys.push(parsed.name);
      }
    }
    tables.push({
      id: uid('t'),
      name: tableName,
      schema: schema ?? undefined,
      objectType: 'table',
      columns,
      indexes: [],
      primaryKeys: [...new Set(primaryKeys)],
      uniqueConstraints: [],
      checkConstraints: [],
      definition: m[0],
    });
  }

  // CREATE VIEW
  const viewRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+|TEMP\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/gim;
  while ((m = viewRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('v'),
      name: m[2]!,
      schema: m[1] ?? undefined,
      objectType: 'view',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
    });
  }

  // CREATE FUNCTION / PROCEDURE
  const funcRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(\w+)\.)?(\w+)/gim;
  while ((m = funcRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('fn'),
      name: m[2]!,
      schema: m[1] ?? undefined,
      objectType: 'function',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
    });
  }

  // CREATE SEQUENCE
  const seqRe = /CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/gim;
  while ((m = seqRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('seq'),
      name: m[2]!,
      schema: m[1] ?? undefined,
      objectType: 'sequence',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
    });
  }

  return buildSchema(filename, 'unknown', tables, [], [], warnings);
}

// ===========================================================================
// PRISMA PARSER
// ===========================================================================

function parsePrisma(content: string, filename: string): ParsedSchema {
  const tables: ParsedTable[] = [];
  const enums: ParsedEnum[] = [];
  const warnings: string[] = [];
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  // Enums
  const enumRe = /^\s*enum\s+(\w+)\s*\{([^}]*)\}/gm;
  let em: RegExpExecArray | null;
  while ((em = enumRe.exec(stripped)) !== null) {
    enums.push({ name: em[1]!, values: em[2]!.split(/\s+/).filter((v) => /^[A-Za-z_]\w*$/.test(v)) });
  }

  // Models
  const modelRe = /^\s*model\s+(\w+)\s*\{([^}]*)\}/gm;
  while ((em = modelRe.exec(stripped)) !== null) {
    const modelName = em[1]!;
    const body = em[2]!;
    const columns: ParsedColumn[] = [];
    const primaryKeys: string[] = [];
    const pkMatch = body.match(/@@id\s*\(\s*\[([^\]]+)\]/);
    if (pkMatch) primaryKeys.push(...pkMatch[1]!.split(',').map((c) => c.trim().replace(/[`"\[\]]/g, '')));

    for (const line of body.split('\n')) {
      const fieldRe = /^\s*(\w+)\s+([^\s(]+)(?:\s*\(([^)]*)\))?(?:\s*@(\w+)(?:\(([^)]*)\))?)?/;
      const fm = line.match(fieldRe);
      if (!fm) continue;
      const [, fName, fType, , attrName] = fm;
      const rawType = fType!.replace(/\?$/, '');
      const optional = fType!.endsWith('?');
      const isId = attrName === 'id';
      if (!['Boolean', 'DateTime', 'Json'].includes(rawType)) {
        const col: ParsedColumn = {
          name: fName!,
          type: rawType,
          normalizedType: normalizeDBType(rawType),
          nullable: !isId && optional,
          primaryKey: isId,
          unique: false,
          identity: false,
        };
        columns.push(col);
        if (isId) primaryKeys.push(fName!);
      }
    }

    tables.push({
      id: uid('t'),
      name: modelName,
      objectType: 'table',
      columns,
      indexes: [],
      primaryKeys: [...new Set(primaryKeys)],
      uniqueConstraints: [],
      checkConstraints: [],
    });
  }

  if (tables.length === 0) warnings.push('Prisma parse: no models found');
  return buildSchema(filename, 'prisma', tables, [], enums, warnings);
}

// ===========================================================================
// TYPEORM PARSER
// ===========================================================================

function parseTypeORM(content: string, filename: string): ParsedSchema {
  const tables: ParsedTable[] = [];
  const warnings: string[] = [];
  const stripped = content.replace(/\/\/[^\n]*/g, '');

  // Match @Entity blocks followed by class body
  const entityRe = /@Entity\s*\(\s*(?:['"]([^'"]+?)['"]|(\{[^}]*\}))\s*\)/g;
  let em: RegExpExecArray | null;
  while ((em = entityRe.exec(stripped)) !== null) {
    const tableName = em[1] ?? 'unknown_entity';
    const after = stripped.slice(em.index + em[0].length);
    const classMatch = after.match(/class\s+\w+\s*(?:implements\s+\S+\s*)?\{([\s\S]*?)(?=@Entity|export\s+class|$)/);
    if (!classMatch) continue;
    const body = classMatch[1] ?? '';
    const columns: ParsedColumn[] = [];
    const primaryKeys: string[] = [];
    for (const line of body.split('\n')) {
      const colMatch = line.match(/@Column\s*\(\s*\{([^}]+)\}\s*\)/);
      if (!colMatch) continue;
      const opts = colMatch[1]!;
      const colName = (opts.match(/name:\s*['"]([^'"]+?)['"]/) ?? ['', 'unknown'])[1]!;
      const rawType = (opts.match(/type:\s*['"](\w+?)['"]/) ?? ['', 'varchar'])[1]!;
      const isPK = /primary(?:\s*Key)?:\s*true/.test(opts) || /@PrimaryColumn|@PrimaryGeneratedColumn/.test(line);
      const unique = /unique:\s*true/.test(opts);
      const defaultVal = opts.match(/default:\s*(['"][^'"]+['"]|\w+)/)?.[1];
      columns.push({
        name: colName,
        type: rawType,
        normalizedType: normalizeDBType(rawType),
        nullable: !opts.includes('nullable:\s*false') && !isPK,
        primaryKey: isPK,
        unique,
        identity: /@PrimaryGeneratedColumn/.test(line),
        defaultValue: defaultVal,
      });
      if (isPK) primaryKeys.push(colName);
    }
    tables.push({
      id: uid('t'),
      name: tableName,
      objectType: 'table',
      columns,
      indexes: [],
      primaryKeys: [...new Set(primaryKeys)],
      uniqueConstraints: [],
      checkConstraints: [],
    });
  }

  if (tables.length === 0) warnings.push('TypeORM parse: no @Entity decorators found');
  return buildSchema(filename, 'typeorm', tables, [], [], warnings);
}

// ============================================================================
// SQL-PARSER-CST BASED PARSER (only active when the module is importable)
// We wrap in try/catch so the worker always functions even if CST is missing
// ============================================================================

function cstParseFallback(content: string, filename: string, dialect: Dialect): ParsedSchema {
  const tables: ParsedTable[] = [];
  const warnings: string[] = [];
  const statements = splitSQLStatements(content);
  const cstDialect = dialect === 'mysql' ? 'mysql' : dialect === 'sqlite' ? 'sqlite' : 'postgresql';

  for (const stmt of statements) {
    if (!stmt || /^\s*(INSERT|UPDATE|DELETE|GRANT|REVOKE|COPY|EXPLAIN|ANALYZE)\s+/i.test(stmt)) continue;
    try {
      // Dynamic import — lazily load sql-parser-cst
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sqlParse: (sql: string, opts: { dialect: string; includeComments?: boolean }) => any =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__sqlParserParse;
      if (!sqlParse) { warnings.push('sql-parser-cst not available, falling back to regex'); return regexFallbackParse(content, filename); }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cst: any = sqlParse(stmt, { dialect: cstDialect, includeComments: false });

      // Walk CST for CREATE TABLE nodes
      function walk(node: any, visit: (n: any) => void): void {
        visit(node);
        if (node.children) Object.values(node.children).forEach((child) => {
          if (Array.isArray(child)) child.forEach((c: any) => walk(c, visit));
          else walk(child, visit);
        });
      }

      walk(cst, (_node: any) => {
        if (_node.type === 'CreateTable' || _node.type === 'CreateTableAs') {
          const nameRaw = _node.children?.table_name?.[0]?.image
            ?? _node.children?.relation?.[0]?.image
            ?? _node.children?.table_and_columns?.[0]?.image
            ?? 'unknown_table';
          const tableName = nameRaw.replace(/[`"\[\]]/g, '').trim();

          const columnDefs: any[] = _node.children?.column_definition ?? [];
          const columns: ParsedColumn[] = columnDefs.map((cd: any): ParsedColumn => {
            const colName = (cd.children?.column_name?.[0]?.image ?? cd.children?.column_ref?.[0]?.image ?? 'unknown').replace(/[`"\[\]]/g, '').trim();
            const dataTypeNode = cd.children?.data_type?.[0];
            const rawType = dataTypeNode?.text ?? dataTypeNode?.image ?? 'varchar';
            const isPK = cd.children?.primary_key !== undefined;
            const isNotNull = cd.children?.not_null !== undefined;
            const isUnique = cd.children?.unique !== undefined;
            const isIdentity = cd.children?.identity !== undefined;
            const defaultNode = cd.children?.default?.[0];
            const defaultVal = defaultNode ? (defaultNode.text ?? defaultNode.image ?? '').replace(/^DEFAULT\s+/i, '') : undefined;
            return {
              name: colName,
              type: rawType,
              normalizedType: normalizeDBType(rawType),
              nullable: !isPK && !isNotNull,
              primaryKey: isPK,
              unique: isUnique,
              identity: isIdentity,
              defaultValue: defaultVal,
            };
          });

          const primaryKeys = columns.filter((c) => c.primaryKey).map((c) => c.name);

          tables.push({
            id: uid('t'),
            name: tableName,
            objectType: _node.type === 'CreateTableAs' ? 'view' : 'table',
            columns,
            indexes: [],
            primaryKeys: [...new Set(primaryKeys)],
            uniqueConstraints: [],
            checkConstraints: [],
            definition: stmt,
          });
        }

        if (_node.type === 'CreateView') {
          const viewName = (_node.children?.view_name?.[0]?.image ?? _node.children?.relation?.[0]?.image ?? 'unknown_view').replace(/[`"\[\]]/g, '').trim();
          tables.push({
            id: uid('v'),
            name: viewName,
            objectType: 'view',
            columns: [],
            indexes: [],
            primaryKeys: [],
            uniqueConstraints: [],
            checkConstraints: [],
            definition: stmt,
          });
        }
      });
    } catch (_err) {
      warnings.push(`CST parse error: ${String(_err).slice(0, 100)}`);
    }
  }

  return buildSchema(filename, dialect, tables, [], [], warnings);
}

// ===========================================================================
// RELATIONSHIP INFERENCE
// ===========================================================================

let _relIdCounter = 0;
function relUid(): string {
  return `rel_${++_relIdCounter}_${Math.random().toString(36).slice(2, 5)}`;
}

function inferImplicitRelationships(tables: ParsedTable[], relationships: ParsedRelationship[]): void {
  for (const table of tables) {
    for (const col of table.columns) {
      const idMatch = /^(.+?)_?id$/i.exec(col.name);
      if (!idMatch) continue;
      const base = idMatch[1]!.toLowerCase();
      const candidates = [base, base + 's', base + 'es'];
      const target = tables.find((t) => {
        const tn = t.name.toLowerCase();
        return candidates.some((c) => tn === c || tn === c.replace(/_/g, ''));
      });
      if (!target || target.name === table.name) continue;
      const exists = relationships.some(
        (r) => r.fromTable === table.name && r.fromColumn === col.name && r.toTable === target.name
      );
      if (exists) continue;
      const targetPk = target.columns.find((c) => target.primaryKeys.includes(c.name));
      const cardinality: ParsedRelationship['cardinality'] =
        targetPk && targetPk.name.toLowerCase() === col.name.toLowerCase() ? 'one-to-one' : 'one-to-many';
      relationships.push({
        id: relUid(),
        fromTable: table.name,
        fromColumn: col.name,
        toTable: target.name,
        toColumn: targetPk?.name ?? target.columns[0]?.name ?? 'id',
        cardinality,
      });
    }
  }
}

function inferPrismaRelationships(tables: ParsedTable[], relationships: ParsedRelationship[]): void {
  for (const table of tables) {
    for (const col of table.columns) {
      if (!col.references) continue;
      const target = tables.find(
        (t) => t.name.toLowerCase() === col.references!.table.toLowerCase() || t.name.toLowerCase() === (col.references!.table + 's').toLowerCase()
      );
      if (!target) continue;
      const exists = relationships.some(
        (r) => r.fromTable === table.name && r.fromColumn === col.name && r.toTable === target.name
      );
      if (exists) continue;
      const targetCol = target.columns.find(
        (c) => c.name.toLowerCase() === (col.references!.column || 'id').toLowerCase() || target.primaryKeys.includes(c.name)
      ) ?? target.columns[0];
      relationships.push({
        id: relUid(),
        fromTable: table.name,
        fromColumn: col.name,
        toTable: target.name,
        toColumn: targetCol?.name ?? 'id',
        cardinality: col.unique ? 'one-to-one' : 'one-to-many',
      });
    }
  }
}

// ===========================================================================
// SUMMARY
// ===========================================================================

function generateSchemaSummary(schema: ParsedSchema): string {
  const { dialect, tables, enums, relationships } = schema;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const header =
    `Dialect: ${cap(dialect)} | Tables: ${tables.filter(t => t.objectType === 'table').length}` +
    ` | Views: ${tables.filter(t => t.objectType === 'view' || t.objectType === 'materialized_view').length}` +
    ` | Procs/Funcs: ${tables.filter(t => t.objectType === 'procedure' || t.objectType === 'function').length}` +
    ` | Enums: ${enums.length} | Relationships: ${relationships.length}`;
  const lines = tables.map((t) => {
    const pk = t.primaryKeys.length > 0 ? `, PK: ${t.primaryKeys.join(',')}` : '';
    const badge = t.objectType === 'table' ? '' : ` [${t.objectType}]`;
    const relOut = relationships.filter((r) => r.fromTable === t.name).length;
    const relIn = relationships.filter((r) => r.toTable === t.name).length;
    const relStr = (relOut + relIn) > 0 ? ` (${relIn} in / ${relOut} out)` : '';
    return `  ${t.name} (${t.columns.length} cols${pk})${badge}${relStr}`;
  });
  return [header, ...lines].join('\n');
}

// ===========================================================================
// BUILD SCHEMA
// ===========================================================================

function buildSchema(
  sourceFile: string,
  dialect: Dialect,
  tables: ParsedTable[],
  relationships: ParsedRelationship[],
  enums: ParsedEnum[],
  warnings: string[]
): ParsedSchema {
  return {
    id: uid('schema'),
    sourceFile,
    dialect,
    tables,
    relationships,
    enums,
    warnings,
    summary: '',
    stats: {
      tableCount: tables.filter((t) => t.objectType === 'table').length,
      viewCount: tables.filter((t) => t.objectType === 'view' || t.objectType === 'materialized_view').length,
      procedureCount: tables.filter((t) => t.objectType === 'procedure' || t.objectType === 'function').length,
      triggerCount: tables.filter((t) => t.objectType === 'trigger').length,
      relationshipCount: relationships.length,
      parseTimeMs: 0,
    },
  };
}

// ===========================================================================
// MAIN PARSER
// ===========================================================================

function parseSchemaWorker(content: string, filename: string): ParsedSchema {
  const dialect = detectDialect(content, filename);

  let schema: ParsedSchema;

  switch (dialect) {
    case 'prisma':
      schema = parsePrisma(content, filename);
      inferPrismaRelationships(schema.tables, schema.relationships);
      break;

    case 'typeorm':
      schema = parseTypeORM(content, filename);
      inferPrismaRelationships(schema.tables, schema.relationships);
      break;

    case 'dbt':
      // Strip Jinja before CST parse
      const stripped = content
        .replace(/\{\{\s*[^}]*?\}\}/g, '')
        .replace(/\{%\s*[^%]*%}/g, '')
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      schema = cstParseFallback(stripped, filename, dialect);
      break;

    case 'snowflake':
      schema = cstParseFallback(content.replace(/\$\$[\s\S]*?\$\$/g, "''"), filename, dialect);
      break;

    default:
      schema = cstParseFallback(content, filename, dialect);
  }

  if (schema.relationships.length === 0 && schema.tables.length > 1) {
    inferImplicitRelationships(schema.tables, schema.relationships);
  }

  schema.stats.relationshipCount = schema.relationships.length;
  schema.summary = generateSchemaSummary(schema);
  return schema;
}

// ===========================================================================
// WORKER ENTRYPOINT
// ===========================================================================

self.onmessage = (e: MessageEvent<ParseWorkerInput>) => {
  const t0 = performance.now();

  try {
    const schema = parseSchemaWorker(e.data.content, e.data.filename);
    schema.stats.parseTimeMs = performance.now() - t0;
    const result: ParseWorkerSuccessResult = { success: true, schema };
    self.postMessage(result);
  } catch (err) {
    try {
      const schema = regexFallbackParse(e.data.content, e.data.filename);
      schema.stats.parseTimeMs = performance.now() - t0;
      schema.warnings.push(`Full parse failed; used regex fallback: ${String(err)}`);
      const result: ParseWorkerSuccessResult = { success: true, schema };
      self.postMessage(result);
    } catch (err2) {
      const result: ParseWorkerErrorResult = { success: false, error: String(err2) };
      self.postMessage(result);
    }
  }
};

export {}; // ensure ESM module