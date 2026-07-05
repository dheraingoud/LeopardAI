// @ts-nocheck — sql-parser-cst has no exported types; CST nodes are untyped
import { parse as sqlParse } from 'sql-parser-cst';
import type { ParsedSchema, ParsedTable, ParsedColumn, ParsedIndex, ParsedRelationship, ParsedEnum, Dialect, ObjectType } from './types';
import { splitSQLStatements } from './detect';

// ---------------------------------------------------------------------------
// Normalized type mapping
// ---------------------------------------------------------------------------

const TYPE_MAP: Record<string, ReturnType<typeof normalizeType>> = {};

export function normalizeType(type: string): ParsedColumn['normalizedType'] {
  const upper = type.toUpperCase().replace(/\s+/g, '');
  if (TYPE_MAP[upper]) return TYPE_MAP[upper] as ParsedColumn['normalizedType'];

  if (/^(VARCHAR?|CHAR|TEXT|CHARACTER|NVARCHAR|CITEXT|STRING|BPCHAR|TINYTEXT|MEDIUMTEXT|LONGTEXT|UUID|SERIAL|INET|CIDR|MACADDR|XML|INTERNAL|NAME|REGCLASS|REGTYPE|BYTEA|OWID)/i.test(type))
    return 'string';
  if (/^(INT|INTEGER|BIGINT|SMALLINT|TINYINT|SERIAL|BIGSERIAL|SMALLSERIAL|INT8|INT4|INT2|FLOAT4|FLOAT8|DOUBLE|PRECISION|NUMERIC|DECIMAL|MONEY|REAL|DEC|FID|UINT|USHORT|ULONG)/i.test(type))
    return 'number';
  if (/^(BOOL|BOOLEAN|BIT)/i.test(type)) return 'boolean';
  if (/^(DATE|TIME|TIMESTAMP|TIMESTAMPTZ|TIMETZ|INTERVAL|YEAR|ZONE)/i.test(type)) return 'date';
  if (/^(JSON|JSONB|JSONP|OBJECT)/i.test(type)) return 'json';
  return 'other';
}

// ---------------------------------------------------------------------------
// Helper: unique ID
// ---------------------------------------------------------------------------

let _uid = 0;
function uid(prefix = 't'): string {
  return `${prefix}_${++_uid}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Traverse CST helpers — sql-parser-cst returns plain objects, typed as any
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CstNode = any;

function cstChildren(node: CstNode): CstNode[] {
  if (Array.isArray(node?.children)) return node.children;
  if (node?.body?.stmt) return [node.body]; // wrapped program
  return [];
}

function cstChild(node: CstNode, type: string): CstNode | undefined {
  return cstChildren(node).find((c: CstNode) => c?.type === type);
}

function cstToken(node: CstNode): string {
  if (!node) return '';
  if (node.token?.image) return node.token.image;
  if (typeof node.token === 'string') return node.token;
  if (node.children) return node.children.map((c: CstNode) => cstToken(c)).join('');
  return '';
}

function nodeText(node: CstNode): string {
  if (!node) return '';
  if (node.token?.image) return node.token.image;
  if (typeof node.token === 'string') return node.token;
  return cstToken(node);
}

// ---------------------------------------------------------------------------
// Core CST column extractor
// ---------------------------------------------------------------------------

function extractColumns(colNodes: CstNode[]): ParsedColumn[] {
  return colNodes.map((col) => {
    const colNameNode = cstChild(col, 'ColumnName') ?? cstChild(col, 'column_ref');
    const colName = colNameNode ? cstToken(colNameNode).replace(/[`"\[\]]/g, '').trim() : 'unknown';

    const dataType = cstChild(col, 'DataType');
    const rawType = dataType ? nodeText(dataType).trim() : 'unknown';

    const constraints = cstChildren(col).filter(
      (c) =>
        c.type === 'PrimaryKey' ||
        c.type === 'NotNull' ||
        c.type === 'Null' ||
        c.type === 'Unique' ||
        c.type === 'Identity' ||
        c.type === 'Default' ||
        c.type === 'CheckConstraint' ||
        c.type === 'References'
    );

    let nullable = true;
    let primaryKey = false;
    let unique = false;
    let identity = false;
    let defaultValue: string | undefined;
    let checkConstraint: string | undefined;
    let references: ParsedColumn['references'] | undefined;

    for (const con of constraints) {
      switch (con.type) {
        case 'NotNull': nullable = false; break;
        case 'Null': nullable = true; break;
        case 'PrimaryKey':
          primaryKey = true;
          nullable = false;
          break;
        case 'Unique': unique = true; break;
        case 'Identity': identity = true; break;
        case 'Default':
          defaultValue = nodeText(con).replace(/^DEFAULT\s+/i, '').trim();
          break;
        case 'CheckConstraint':
          checkConstraint = nodeText(con).replace(/^CHECK\s*/i, '').trim();
          break;
        case 'References': {
          const refNode = cstChild(con, 'relation');
          const colsNode = cstChild(con, 'column_ref') ?? cstChild(con, 'ColumnName');
          if (refNode) {
            references = {
              table: cstToken(refNode).replace(/[`"\[\]]/g, '').trim(),
              column: colsNode ? cstToken(colsNode).replace(/[`"\[\]]/g, '').trim() : '',
            };
          }
          break;
        }
      }
    }

    return {
      name: colName,
      type: rawType,
      normalizedType: normalizeType(rawType),
      nullable,
      primaryKey,
      unique,
      identity,
      defaultValue,
      checkConstraint,
      references,
    };
  });
}

// ---------------------------------------------------------------------------
// parseSQLCst — uses sql-parser-cst
// ---------------------------------------------------------------------------

export async function parseSQLCst(
  content: string,
  filename: string,
  dialect: 'postgresql' | 'mysql' | 'sqlite' | 'snowflake' | 'unknown'
): Promise<ParsedSchema> {
  const statements = splitSQLStatements(content);
  const tables: ParsedTable[] = [];
  const enums: ParsedSchema['enums'] = [];
  const warnings: string[] = [];

  const cstDialect = dialect === 'unknown' ? 'postgresql' : dialect;

  for (const stmt of statements) {
    if (!stmt || /^\s*(INSERT|UPDATE|DELETE|GRANT|REVOKE|COPY|EXPLAIN|ANALYZE)\s+/i.test(stmt)) continue;

    try {
      const cst = sqlParse(stmt, { dialect: cstDialect as 'postgresql' | 'mysql' | 'sqlite', includeComments: false }) as Record<string, unknown>;

      for (const topNode of (cst.children ?? []) as Record<string, unknown>[]) {
        for (const stmtNode of cstChildren(topNode)) {
          const stmtType = stmtNode.type;

          if (stmtType === 'CreateEnum') {
            const nameNode = cstChild(stmtNode, 'enum_name') ?? cstChild(stmtNode, 'type_name');
            const bodyNode = cstChild(stmtNode, 'enum_body');
            const vals = bodyNode ? cstChildren(bodyNode).map((v) => v.token?.image ?? '').filter(Boolean) : [];
            enums.push({
              name: nameNode ? cstToken(nameNode).trim() : 'unknown_enum',
              values: vals,
            });
          }

          if (stmtType === 'CreateTable' || stmtType === 'CreateTableAs') {
            const nameNode = cstChild(stmtNode, 'table_name') ?? cstChild(stmtNode, 'relation') ?? cstChild(stmtNode, 'table_and_columns');
            const tableName = nameNode ? cstToken(nameNode).replace(/[`"\[\]]/g, '').trim() : 'unknown_table';

            const colNodes = cstChildren(stmtNode).filter((c) => c.type === 'ColumnDefinition');
            const columns = extractColumns(colNodes);

            // Extract indexes
            const indexes: ParsedIndex[] = [];
            const uniqueConstraints: ParsedTable['uniqueConstraints'] = [];
            const checkConstraints: ParsedTable['checkConstraints'] = [];
            const primaryKeys: string[] = [];

            for (const col of columns) {
              if (col.primaryKey) primaryKeys.push(col.name);
            }

            // Extract constraints (table-level)
            const constraintNodes = cstChildren(stmtNode).filter(
              (c) => c.type === 'UniqueConstraint' || c.type === 'CheckConstraint' || c.type === 'Index'
            );
            for (const cn of constraintNodes) {
              const cnNameNode = cstChild(cn, 'constraint_name') ?? cstChild(cn, 'symbol');
              const cnName = cnNameNode ? cstToken(cnNameNode).trim() : undefined;

              if (cn.type === 'Index') {
                const colsNode = cstChild(cn, 'column_list') ?? cstChild(cn, 'index_columns');
                const cols = colsNode
                  ? cstChildren(colsNode)
                      .filter((c) => c.type === 'ColumnName' || c.type === 'column_ref' || c.type === 'expression')
                      .map((c) => cstToken(c).replace(/[`"\[\]]/g, '').trim())
                  : [];
                const uniqueKw = cstChild(cn, 'UNIQUE');
                const typeNode = cstChild(cn, 'index_type');
                indexes.push({ name: cnName ?? `idx_${cols.join('_')}`, columns: cols, unique: !!uniqueKw, type: typeNode ? cstToken(typeNode).trim() : undefined });
              }

              if (cn.type === 'UniqueConstraint') {
                const colsNode = cstChild(cn, 'column_list') ?? cstChild(cn, 'Unique');
                const cols = colsNode
                  ? cstChildren(colsNode)
                      .filter((c) => c.type === 'ColumnName' || c.type === 'column_ref')
                      .map((c) => cstToken(c).replace(/[`"\[\]]/g, '').trim())
                  : [];
                uniqueConstraints.push({ name: cnName ?? `uq_${cols.join('_')}`, columns: cols });
              }

              if (cn.type === 'CheckConstraint') {
                checkConstraints.push({ name: cnName ?? 'chk', expression: nodeText(cn) });
              }
            }

            tables.push({
              id: uid('t'),
              name: tableName,
              objectType: stmtType === 'CreateTableAs' ? 'view' : 'table',
              columns,
              indexes,
              primaryKeys,
              uniqueConstraints,
              checkConstraints,
              definition: stmt,
            });
          }

          // CREATE VIEW — treat as view
          if (stmtType === 'CreateView') {
            const nameNode = cstChild(stmtNode, 'view_name') ?? cstChild(stmtNode, 'relation');
            const viewName = nameNode ? cstToken(nameNode).replace(/[`"\[\]]/g, '').trim() : 'unknown_view';
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

          // CREATE SEQUENCE
          if (stmtType === 'CreateSequence') {
            const nameNode = cstChild(stmtNode, 'sequence_name') ?? cstChild(stmtNode, 'type_name');
            const seqName = nameNode ? cstToken(nameNode).replace(/[`"\[\]]/g, '').trim() : 'unknown_seq';
            tables.push({
              id: uid('seq'),
              name: seqName,
              objectType: 'sequence',
              columns: [],
              indexes: [],
              primaryKeys: [],
              uniqueConstraints: [],
              checkConstraints: [],
              definition: stmt,
            });
          }

          // ALTER TABLE ADD CONSTRAINT (foreign key / relationships populated later)
          if (stmtType === 'AlterTable') {
            const tableRefNode = cstChild(stmtNode, 'table_name') ?? cstChild(stmtNode, 'relation');
            const tableName = tableRefNode ? cstToken(tableRefNode).replace(/[`"\[\]]/g, '').trim() : '';
            const alterAction = cstChildren(stmtNode).find((c) => c.type === 'AddConstraint');
            if (alterAction) {
              const fkNode = cstChild(alterAction, 'FOREIGN KEY');
              if (fkNode) {
                // handled in relationship inference phase
              }
              const pkNode = cstChild(alterAction, 'PrimaryKey');
              if (pkNode) {
                const tbl = tables.find((t) => t.name === tableName);
                if (tbl) {
                  const colsNode = cstChild(pkNode, 'column_list') ?? cstChild(pkNode, 'column_ref');
                  if (colsNode) {
                    const pkCols = cstChildren(colsNode)
                      .filter((c) => c.type === 'ColumnName' || c.type === 'column_ref')
                      .map((c) => cstToken(c).replace(/[`"\[\]]/g, '').trim());
                    tbl.primaryKeys.push(...pkCols.filter((c) => !tbl.primaryKeys.includes(c)));
                  }
                }
              }
            }
            const addColNode = cstChild(stmtNode, 'AddColumn');
            if (addColNode) {
              const tbl = tables.find((t) => t.name === tableName);
              if (tbl) {
                const newCols = extractColumns([addColNode]);
                tbl.columns.push(...newCols);
              }
            }
          }

          // CREATE INDEX
          if (stmtType === 'CreateIndex') {
            const nameNode = cstChild(stmtNode, 'index_name') ?? cstChild(stmtNode, 'symbol');
            const tableRefNode = cstChild(stmtNode, 'table_name') ?? cstChild(stmtNode, 'relation');
            const tableName = tableRefNode ? cstToken(tableRefNode).replace(/[`"\[\]]/g, '').trim() : '';
            const colsNode = cstChild(stmtNode, 'column_list') ?? cstChild(stmtNode, 'index_columns');
            const cols = colsNode
              ? cstChildren(colsNode)
                  .filter((c) => c.type === 'ColumnName' || c.type === 'column_ref' || c.type === 'expression')
                  .map((c) => cstToken(c).replace(/[`"\[\]]/g, '').trim())
              : [];
            const uniqueKw = cstChild(stmtNode, 'UNIQUE');
            const idx: ParsedIndex = { name: nameNode ? cstToken(nameNode).replace(/[`"\[\]]/g, '').trim() : `idx_${uid('')}`, columns: cols, unique: !!uniqueKw };
            const tbl = tables.find((t) => t.name === tableName);
            if (tbl) tbl.indexes.push(idx);
          }
        }
      }
    } catch (_err) {
      warnings.push(`CST parse error: ${String(_err).slice(0, 120)}`);
    }
  }

  return buildSchema(filename, dialect as ParsedSchema['dialect'], tables, [], enums, warnings);
}

// ---------------------------------------------------------------------------
// parseSnowflake — normalise types then delegate
// ---------------------------------------------------------------------------

export async function parseSnowflake(content: string, filename: string): Promise<ParsedSchema> {
  // Normalise Snowflake type aliases before parsing
  let normalised = content
    .replace(/\bVARIANT\b/gi, 'VARIANT')
    .replace(/\bARRAY\b/gi, 'ARRAY')
    .replace(/\bOBJECT\b/gi, 'OBJECT')
    .replace(/\bGEOGRAPHY\b/gi, 'GEOGRAPHY')
    // Snowflake backtick → double-quote
    .replace(/`/g, '"')
    // $$ dollar-quoted strings are fine — sql-parser-cst doesn't handle them; strip or keep
    // Replace $$...$$ bodies that are function bodies so CST is cleaner
    .replace(/\$\$[\s\S]*?\$\$/g, "''");

  return parseSQLCst(normalised, filename, 'snowflake');
}

// ---------------------------------------------------------------------------
// parsePrisma — regex parse Prisma schema model/enum blocks
// ---------------------------------------------------------------------------

export async function parsePrisma(content: string, filename: string): Promise<ParsedSchema> {
  const tables: ParsedTable[] = [];
  const enums: ParsedSchema['enums'] = [];
  const warnings: string[] = [];

  // Strip all block comments and line comments first
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  // Parse enums
  const enumRe = /^\s*enum\s+(\w+)\s*\{([^}]*)\}/gm;
  let m: RegExpExecArray | null;
  while ((m = enumRe.exec(stripped)) !== null) {
    const values = m[2].split(/\s+/).filter((v) => /^[A-Za-z_]\w*$/.test(v));
    enums.push({ name: m[1], values });
  }

  // Parse models
  const modelRe = /^\s*model\s+(\w+)\s*\{([^}]*)\}/gm;
  while ((m = modelRe.exec(stripped)) !== null) {
    const modelName = m[1];
    const body = m[2];
    const columns: ParsedColumn[] = [];
    const primaryKeys: string[] = [];

    // Detect @@id([...]) or @@unique
    const pkMatch = body.match(/@@id\s*\(\s*\[([^\]]+)\]/);
    if (pkMatch) primaryKeys.push(...pkMatch[1].split(',').map((c) => c.trim().replace(/[`"\[\]]/g, '')));

    for (const line of body.split('\n')) {
      const fieldRe = /^\s*(\w+)\s+([^\s(]+)(?:\s*\(([^)]*)\))?(?:\s*@(\w+)(?:\(([^)]*)\))?)?/;
      const fm = line.match(fieldRe);
      if (!fm) continue;

      const [, fName, fType, modifiers, attrName, attrValue] = fm;
      const rawType = fType.replace(/\?$/, '');
      const optional = fType.endsWith('?') || modifiers?.includes('?') || /operations:/i.test(modifiers ?? '');

      const isId = attrName === 'id' || /@id/i.test(line);
      const isUnique = attrName === 'unique' || /@unique/i.test(line);
      const isUpdatedAt = attrName === 'updatedAt' || /@updatedAt/i.test(line);
      const isDefault = /@default\(/i.test(line);

      // Relation
      let references: ParsedColumn['references'] | undefined;
      const relMatch = line.match(/@relation\s*\(\s*(?:references:\s*\[(\w+)\]|(fields:\s*\[(\w+)\]\s*,?\s*references:\s*\[(\w+)\]))/);
      if (relMatch) {
        references = { table: '?', column: relMatch[1] ?? relMatch[4] ?? '' };
      }

      if (!['Boolean', 'DateTime', 'Json'].includes(rawType)) {
        columns.push({
          name: fName,
          type: rawType,
          normalizedType: normalizeType(rawType),
          nullable: !isId && !isUpdatedAt && !isUnique && optional === false ? false : true,
          primaryKey: isId,
          unique: isUnique,
          identity: false,
          defaultValue: isDefault ? `@@default()` : undefined,
          references,
        });
        if (isId) primaryKeys.push(fName);
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

  if (tables.length === 0) warnings.push('Prismaparse: no models found');

  return buildSchema(filename, 'prisma', tables, [], enums, warnings);
}

// ---------------------------------------------------------------------------
// parseTypeORM — regex parse @Entity and @Column decorators
// ---------------------------------------------------------------------------

export async function parseTypeORM(content: string, filename: string): Promise<ParsedSchema> {
  const tables: ParsedTable[] = [];
  const warnings: string[] = [];

  // Strip // comments
  const stripped = content.replace(/\/\/[^\n]*/g, '');

  // Match @Entity('tableName') or @Entity({name:'tableName'})
  const entityRe = /@Entity\s*\(\s*(?:['"]([^'"]+?)['"]|(\{[^}]*\}))\s*\)/g;
  let m: RegExpExecArray | null;
  const entityBlocks: Array<{ name: string; body: string }> = [];

  while ((m = entityRe.exec(stripped)) !== null) {
    const tableName = m[1] ?? 'unknown_entity';
    // Find the class body that follows
    const after = stripped.slice(m.index + m[0].length);
    const classMatch = after.match(/class\s+\w+\s*(?:implements\s+\S+\s*)?\{([\s\S]*?)(?=@Entity|export\s+class|$)/);
    if (classMatch) {
      entityBlocks.push({ name: tableName, body: classMatch[1] ?? '' });
    }
  }

  for (const { name: tableName, body } of entityBlocks) {
    const columns: ParsedColumn[] = [];
    const primaryKeys: string[] = [];

    for (const line of body.split('\n')) {
      // @Column({ name: 'id', type: 'int', primaryKey: true })
      const colMatch = line.match(/@Column\s*\(\s*\{([^}]+)\}\s*\)/);
      if (!colMatch) continue;

      const opts = colMatch[1];
      const colName = opts.match(/name:\s*['"]([^'"]+?)['"]/)?.[1] ?? 'unknown';
      const rawType = opts.match(/type:\s*['"](\w+?)['"]/)?.[1] ?? 'varchar';
      const nullable = !opts.includes('nullable:\s*false') && !opts.includes('primary');
      const primaryKey = /primary(?:\s*Key)?:\s*true/.test(opts) || /@PrimaryColumn|@PrimaryGeneratedColumn/.test(line);
      const unique = /unique:\s*true/.test(opts);
      const defaultVal = opts.match(/default:\s*(['"][^'"]+['"]|\w+)/)?.[1];

      columns.push({
        name: colName,
        type: rawType,
        normalizedType: normalizeType(rawType),
        nullable,
        primaryKey,
        unique,
        identity: /@PrimaryGeneratedColumn/.test(line),
        defaultValue: defaultVal,
      });
      if (primaryKey) primaryKeys.push(colName);
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

  if (tables.length === 0) {
    warnings.push('TypeORM parse: no @Entity decorators found');
  }

  return buildSchema(filename, 'typeorm', tables, [], [], warnings);
}

// ---------------------------------------------------------------------------
// parseDbt — strip Jinja, then parseSQLCst
// ---------------------------------------------------------------------------

export async function parseDbt(content: string, filename: string): Promise<ParsedSchema> {
  // Strip Jinja2 expressions
  let stripped = content
    .replace(/\{\{\s*[^}]*?\}\}/g, '')
    .replace(/\{%\s*-?\s*(if|for|set|block|macro|endblock|endfor|endif|endset)\b[^%]*%}/gi, '')
    .replace(/\{%\s*-?\s*(?!if|for|set|block|macro|endblock|endfor|endif|endset)\s*\S+\b[^%]*%}/gi, '');

  return parseSQLCst(stripped, filename, 'postgresql');
}

// ---------------------------------------------------------------------------
// regexFallbackParse — last resort, catches CREATE TABLE/VIEW/FUNCTION/PROCEDURE/...
// ---------------------------------------------------------------------------

export async function regexFallbackParse(content: string, filename: string): Promise<ParsedSchema> {
  const tables: ParsedTable[] = [];
  const warnings: string[] = [];
  warnings.push('Using regex fallback parser — CST parse failed or unavailable');

  // Strip comments
  const stripped = content
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // CREATE TABLE (with possible schema prefix)
  const tableRe = /CREATE\s+(?:TEMPORARY\s+|TEMP\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)\s*\(([\s\S]*?)\)(?:\s*(?:WITH|WITH\s*\([^)]*\)))?\s*(?:ENGINE\s*=\s*\w+)?(?:\s*DEFAULT\s+CHARSET\s*=\s*\w+)?/gim;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(stripped)) !== null) {
    const schema = m[1];
    const tableName = m[2];
    const colDefs = m[3];
    const columns: ParsedColumn[] = [];
    const primaryKeys: string[] = [];

    for (const colLine of colDefs.split(',')) {
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
  const viewRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+|TEMP\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)(?:\s*\([\s\S]*?\))?\s+AS\s+([\s\S]*?)(?:\n|;|$)/gim;
  while ((m = viewRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('v'),
      name: m[2],
      schema: m[1],
      objectType: 'view',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      definition: m[0],
    });
  }

  // CREATE FUNCTION / PROCEDURE (simplified)
  const funcRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:(\w+)\s+)?FUNCTION\s+(?:(\w+)\.)?(\w+)\s*(\([\s\S]*?\))?\s+RETURNS?\s+\S+[\s\S]*?(?:END\s+(?:FUNCTION|PROC|proc)?\s*;?)/gim;
  while ((m = funcRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('fn'),
      name: m[3],
      schema: m[2],
      objectType: m[1]?.toLowerCase() === 'procedure' ? 'procedure' : 'function',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      definition: m[0],
    });
  }

  // CREATE SEQUENCE
  const seqRe = /CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/gim;
  while ((m = seqRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('seq'),
      name: m[2],
      schema: m[1],
      objectType: 'sequence',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
    });
  }

  // CREATE PROCEDURE / STORED PROCEDURE
  const procRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:STORED\s+)?PROCEDURE\s+(?:(\w+)\.)?(\w+)\s*\([\s\S]*?(?:END\s*(?:PROCEDURE)?\s*;|\$\$\s*;?|AS\s+\$\$[\s\S]*?\$\$)/gim;
  while ((m = procRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('proc'),
      name: m[2],
      schema: m[1],
      objectType: 'procedure',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      definition: m[0],
    });
  }

  // CREATE TRIGGER
  const trigRe = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(?:(\w+)\.)?(\w+)\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+\w+\s+ON\s+(\w+)/gim;
  while ((m = trigRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('trig'),
      name: m[2],
      schema: m[1],
      objectType: 'trigger',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      definition: m[0],
    });
  }

  // CREATE MATERIALIZED VIEW
  const matViewRe = /CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/gim;
  while ((m = matViewRe.exec(stripped)) !== null) {
    tables.push({
      id: uid('mv'),
      name: m[2],
      schema: m[1],
      objectType: 'materialized_view',
      columns: [],
      indexes: [],
      primaryKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      definition: m[0],
    });
  }

  // CREATE TYPE ... AS ENUM
  const enumRe = /CREATE\s+TYPE\s+(?:(\w+)\.)?(\w+)\s+AS\s+ENUM\s*\(([^)]+)\)/gim;
  while ((m = enumRe.exec(stripped)) !== null) {
    // add as table with objectType='enum', or to separate enums array
    // handled below via buildSchema
  }

  return buildSchema(filename, 'unknown', tables, [], [], warnings);
}

function parseColumnDef(line: string): ParsedColumn | null {
  // e.g. "id INTEGER PRIMARY KEY" or "name VARCHAR(255) NOT NULL DEFAULT 'test'"
  const match = line.trim().match(
    /^(["`\[\]]?\w+["`\]]?)\s+(\w+(?:\([^)]*\))?(?:\s+(?:ARRAY|\[\]))?)\s*(.*)?$/i
  );
  if (!match) return null;

  const name = match[1].replace(/["`\[\]]/g, '');
  const rawType = match[2];
  const rest = (match[3] ?? '').toUpperCase();

  const nullable = !/NOT\s+NULL/i.test(rest) && !/PRIMARY\s+KEY/i.test(rest);
  const primaryKey = /PRIMARY\s+KEY/i.test(rest);
  const unique = /UNIQUE(?!\s*\()/i.test(rest);
  const identity = /AUTOINCREMENT|SERIAL|IDENTITY/i.test(rest);
  const defaultMatch = rest.match(/DEFAULT\s+(\S+)/i);

  return {
    name,
    type: rawType,
    normalizedType: normalizeType(rawType),
    nullable,
    primaryKey,
    unique,
    identity,
    defaultValue: defaultMatch ? defaultMatch[1] : undefined,
  };
}

// ---------------------------------------------------------------------------
// prepareFileForParsing — strip noise for large files
// ---------------------------------------------------------------------------

const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024; // 2 MB

export function prepareFileForParsing(
  content: string,
  filename: string
): string {
  const isLarge = content.length > LARGE_FILE_THRESHOLD;

  let cleaned = content
    .replace(/--[^\n]*/g, '')           // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');  // block comments

  if (isLarge) {
    // Drop data-modifying statements for large files
    cleaned = cleaned
      .replace(/INSERT\s+INTO[\s\S]*?(?=CREATE|ALTER|DROP|;|$)/gi, '')
      .replace(/UPDATE\s+\w+[\s\S]*?(?=CREATE|ALTER|DROP|;|$)/gi, '')
      .replace(/DELETE\s+FROM[\s\S]*?(?=CREATE|ALTER|DROP|;|$)/gi, '');
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// buildSchema — assemble final ParsedSchema
// ---------------------------------------------------------------------------

export function buildSchema(
  sourceFile: string,
  dialect: ParsedSchema['dialect'],
  tables: ParsedTable[],
  relationships: ParsedSchema['relationships'],
  enums: ParsedSchema['enums'],
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
      procedureCount: tables.filter((t) => t.objectType === 'procedure').length,
      triggerCount: tables.filter((t) => t.objectType === 'trigger').length,
      relationshipCount: relationships.length,
      parseTimeMs: 0,
    },
  };
}